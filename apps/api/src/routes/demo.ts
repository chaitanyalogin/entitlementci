import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf } from "../auth/context.js";
import { AppError } from "../utils/http.js";
import { setSubscription } from "@entitlementci/engine";
export async function demoRoutes(app: FastifyInstance) {
  app.post("/v1/demo/run", async (request) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    if (process.env.ENABLE_DEMO !== "true" || org.slug !== "demo-acme")
      throw new AppError(
        403,
        "DEMO_DISABLED",
        "Demo is available only in the local demo organization",
      );
    const { scenario } = z
      .object({
        scenario: z.enum([
          "healthy",
          "upgrade-propagation",
          "downgrade-propagation",
          "limit-bug",
          "fix",
        ]),
      })
      .parse(request.body);
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
      await call(`/api/demo/customers/${c.id}/subscription`, { plan: c.plan });
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
    return { accepted: true, scenario, customers: customers.map((c) => c.id) };
  });
}
