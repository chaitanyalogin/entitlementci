import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireOrgRole,
  assertCsrf,
  createSession,
  cookieOptions,
} from "../auth/context.js";
import { AppError } from "../utils/http.js";
import { setSubscription } from "@entitlementci/engine";
import { randomUUID } from "node:crypto";
import { hashPassword, randomToken, sha256 } from "../utils/crypto.js";
import {
  findSandbox,
  initializeSandbox,
  runHostedSandbox,
} from "../services/hosted-sandbox.js";
import { enqueue } from "../jobs.js";
import { SANDBOX_KIND } from "@entitlementci/shared";
const scenarioSchema = z.object({
  scenario: z.enum([
    "healthy",
    "upgrade-propagation",
    "downgrade-propagation",
    "limit-bug",
    "fix",
  ]),
});
export async function demoRoutes(app: FastifyInstance) {
  app.get("/v1/demo/config", async () => ({
    hosted: process.env.ENABLE_HOSTED_DEMO === "true",
  }));
  app.post(
    "/v1/auth/demo",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (process.env.ENABLE_HOSTED_DEMO !== "true")
        throw new AppError(
          404,
          "DEMO_UNAVAILABLE",
          "Live demo is not enabled.",
        );
      const origin = request.headers.origin;
      if (origin && origin !== new URL(process.env.PUBLIC_WEB_URL!).origin)
        throw new AppError(
          403,
          "ORIGIN_INVALID",
          "Open the demo from this website.",
        );
      const rawSession = request.cookies.entitlementci_session;
      if (rawSession) {
        const active = await prisma.session.findUnique({
          where: { tokenHash: sha256(rawSession) },
        });
        if (active && active.expiresAt > new Date())
          throw new AppError(
            409,
            "ALREADY_SIGNED_IN",
            "Open Drift Lab in your current workspace, or sign out to start a visitor demo.",
          );
      }
      const visitorId = randomUUID();
      const passwordHash = await hashPassword(randomToken(48));
      const { user, organization } = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"sandbox-visitors"}))::text`;
        const count = await tx.organization.count({
          where: {
            slug: { startsWith: "sandbox-visitor-" },
            createdAt: { gt: new Date(Date.now() - 86400000) },
          },
        });
        if (count >= 100)
          throw new AppError(
            429,
            "DEMO_BUSY",
            "Visitor demos are busy today. Create an organization to try your own sandbox.",
          );
        const user = await tx.user.create({
          data: {
            email: `visitor-${visitorId}@sandbox.entitlementci.invalid`,
            passwordHash,
          },
        });
        const organization = await tx.organization.create({
          data: {
            name: "Visitor Demo",
            slug: `sandbox-visitor-${visitorId}`,
            memberships: { create: { userId: user.id, role: "OWNER" } },
          },
        });
        return { user, organization };
      });
      await initializeSandbox(organization.id);
      const ttlSeconds = 3600;
      const session = await createSession(user.id, ttlSeconds);
      reply.setCookie(
        "entitlementci_session",
        session.token,
        cookieOptions({
          nodeEnv: process.env.NODE_ENV ?? "development",
          ttlSeconds,
        }),
      );
      reply.setCookie("entitlementci_csrf", session.csrf, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ttlSeconds,
      });
      return reply.code(201).send({
        organization: { id: organization.id, name: organization.name },
        expiresIn: ttlSeconds,
        demo: true,
      });
    },
  );
  app.get("/v1/demo/status", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const canRun = ctx.role !== "VIEWER";
    if (process.env.ENABLE_HOSTED_DEMO === "true") {
      const project = await findSandbox(ctx.organizationId);
      return {
        mode: "hosted",
        ready: Boolean(project?.testScenarios.length),
        projectId: project?.id ?? null,
        scenarioId: project?.testScenarios[0]?.id ?? null,
        canRun,
      };
    }
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    return {
      mode:
        process.env.ENABLE_DEMO === "true" && org.slug === "demo-acme"
          ? "local"
          : "unavailable",
      ready: org.slug === "demo-acme",
      canRun,
    };
  });
  app.post(
    "/v1/demo/setup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const ctx = await requireOrgRole(request, "DEVELOPER");
      await assertCsrf(request);
      if (process.env.ENABLE_HOSTED_DEMO !== "true")
        throw new AppError(
          403,
          "DEMO_UNAVAILABLE",
          "Live demo is not enabled.",
        );
      const project = await initializeSandbox(ctx.organizationId);
      return { ready: true, projectId: project.id };
    },
  );
  app.post(
    "/v1/demo/run",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const ctx = await requireOrgRole(request, "DEVELOPER");
      await assertCsrf(request);
      const { scenario } = scenarioSchema.parse(request.body);
      if (process.env.ENABLE_HOSTED_DEMO === "true") {
        const result = await runHostedSandbox(ctx.organizationId, scenario);
        await prisma.auditLog.create({
          data: {
            organizationId: ctx.organizationId,
            projectId: result.projectId,
            actorUserId: ctx.userId,
            action: "SANDBOX_EXECUTED",
            resource: "scenario",
            metadata: { scenario, sample: true },
            requestId: request.id,
          },
        });
        if (scenario === "fix") {
          const regression = await prisma.testScenario.findUniqueOrThrow({
            where: {
              projectId_key: { projectId: result.projectId, key: SANDBOX_KIND },
            },
          });
          const run = await prisma.testRun.create({
            data: {
              organizationId: ctx.organizationId,
              projectId: result.projectId,
              scenarioId: regression.id,
            },
          });
          await enqueue(
            "synthetic-test",
            { testRunId: run.id },
            { jobId: `test-run-${run.id}`, attempts: 1 },
          );
          return { ...result, testRunId: run.id };
        }
        return result;
      }
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
      });
      if (process.env.ENABLE_DEMO !== "true" || org.slug !== "demo-acme")
        throw new AppError(
          403,
          "DEMO_DISABLED",
          "Demo is available only in the local demo organization",
        );
      const project = await prisma.project.findFirstOrThrow({
        where: {
          organizationId: ctx.organizationId,
          name: "TaskFlow Production",
        },
      });
      const customers =
        scenario === "fix"
          ? [
              { id: "cus_demo_upgrade_bug", plan: "enterprise" },
              { id: "cus_demo_downgrade_bug", plan: "pro" },
              { id: "cus_demo_limit_bug", plan: "enterprise" },
            ]
          : [
              {
                id:
                  scenario === "healthy"
                    ? "cus_demo_healthy"
                    : scenario === "upgrade-propagation"
                      ? "cus_demo_upgrade_bug"
                      : scenario === "downgrade-propagation"
                        ? "cus_demo_downgrade_bug"
                        : "cus_demo_limit_bug",
                plan:
                  scenario === "healthy" || scenario === "downgrade-propagation"
                    ? "pro"
                    : "enterprise",
              },
            ];
      const call = async (path: string, body: unknown) => {
        const res = await fetch(
          `${process.env.TASKFLOW_URL ?? "http://localhost:4100"}${path}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-service-token": process.env.TASKFLOW_SERVICE_TOKEN ?? "",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!res.ok)
          throw new AppError(
            502,
            "TASKFLOW_FAILED",
            `TaskFlow returned ${res.status}`,
          );
        return res.json();
      };
      await call("/api/demo/scenario", {
        scenario: ["healthy", "fix"].includes(scenario) ? "none" : scenario,
      });
      for (const c of customers) {
        await setSubscription(prisma, {
          organizationId: ctx.organizationId,
          projectId: project.id,
          customerId: c.id,
          plan: c.plan,
        });
        await call(`/api/demo/customers/${c.id}/subscription`, {
          plan: c.plan,
        });
        await call("/api/demo/observe", { customerId: c.id });
      }
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          projectId: project.id,
          actorUserId: ctx.userId,
          action: "DEMO_EXECUTED",
          resource: "scenario",
          metadata: { scenario },
          requestId: request.id,
        },
      });
      return {
        accepted: true,
        scenario,
        customers: customers.map((c) => c.id),
      };
    },
  );
}
