import { createHmac } from "node:crypto";
import { prisma } from "../db.js";
import { connection } from "../jobs.js";
import { sha256 } from "../utils/crypto.js";
import { AppError } from "../utils/http.js";
import { EntitlementCI } from "@entitlementci/node";
import {
  SANDBOX_CUSTOMERS,
  SANDBOX_KIND,
  SANDBOX_PROJECT_NAME,
  sandboxAccess,
  sandboxFeature,
  sandboxPlan,
  sandboxState,
  type SandboxScenario,
} from "@entitlementci/shared";

function sdkSecret(organizationId: string, projectId: string) {
  return (
    "ent_test_" +
    createHmac("sha256", process.env.API_KEY_PEPPER!)
      .update(`hosted-sandbox-v1:${organizationId}:${projectId}`)
      .digest("base64url")
  );
}

export async function findSandbox(organizationId: string) {
  return prisma.project.findFirst({
    where: {
      organizationId,
      name: SANDBOX_PROJECT_NAME,
      environment: "STAGING",
    },
    include: { testScenarios: { where: { key: SANDBOX_KIND } } },
  });
}

export async function initializeSandbox(organizationId: string) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"sandbox:" + organizationId}))::text`;
      const existing = await tx.project.findUnique({
        where: {
          organizationId_name: { organizationId, name: SANDBOX_PROJECT_NAME },
        },
        include: { testScenarios: { where: { key: SANDBOX_KIND } } },
      });
      if (existing) {
        if (
          existing.environment !== "STAGING" ||
          (
            existing.testScenarios[0]?.definition as
              { kind?: string } | undefined
          )?.kind !== SANDBOX_KIND
        )
          throw new AppError(
            409,
            "SANDBOX_NAME_USED",
            "Rename the existing TaskFlow Sandbox project before creating sample data.",
          );
        return existing;
      }
      const project = await tx.project.create({
        data: {
          organizationId,
          name: SANDBOX_PROJECT_NAME,
          environment: "STAGING",
        },
      });
      const features = [
        ["analytics", "Sample Analytics", "BOOLEAN"],
        ["advanced_reports", "Sample Advanced Reports", "BOOLEAN"],
        ["sso", "Sample SSO", "BOOLEAN"],
        ["api_requests", "Sample API Requests", "LIMIT"],
      ] as const;
      const featureIds: Record<string, string> = {};
      for (const [key, name, type] of features) {
        const f = await tx.feature.create({
          data: {
            organizationId,
            key: sandboxFeature(project.id, key),
            name,
            type,
            description: "Generated sample feature for the hosted sandbox.",
          },
        });
        featureIds[key] = f.id;
      }
      const plans: Record<
        string,
        { id: string; values: Record<string, boolean | number> }
      > = {};
      for (const plan of ["pro", "enterprise"] as const) {
        // The subscription catalog is the expected contract, separate from sample app behavior.
        const values = {
          analytics: true,
          advanced_reports: plan === "enterprise",
          sso: plan === "enterprise",
          api_requests: plan === "enterprise" ? 500000 : 50000,
        };
        const p = await tx.plan.create({
          data: {
            organizationId,
            key: sandboxPlan(project.id, plan),
            name: `Sample ${plan === "pro" ? "Pro" : "Enterprise"}`,
            entitlements: {
              create: Object.entries(values).map(([key, value]) => ({
                featureId: featureIds[key]!,
                value,
              })),
            },
          },
        });
        plans[plan] = { id: p.id, values };
      }
      for (const c of SANDBOX_CUSTOMERS) {
        const plan = plans[c.plan]!;
        await tx.customer.create({
          data: {
            organizationId,
            projectId: project.id,
            externalCustomerId: c.id,
            metadata: sandboxState(c, "healthy"),
            subscriptions: {
              create: {
                planId: plan.id,
                status: "active",
                effectiveAt: new Date(),
                provider: "sandbox",
              },
            },
            expectedEntitlements: {
              create: Object.entries(plan.values).map(([key, value]) => ({
                featureId: featureIds[key]!,
                planId: plan.id,
                value,
                source: "sandbox",
              })),
            },
          },
        });
      }
      const secret = sdkSecret(organizationId, project.id);
      await tx.apiKey.create({
        data: {
          organizationId,
          projectId: project.id,
          label: "Hosted sandbox SDK",
          prefix: secret.slice(0, 20),
          secretHash: sha256(`${process.env.API_KEY_PEPPER}:${secret}`),
          fingerprint: sha256(secret).slice(0, 16),
          environment: "STAGING",
        },
      });
      await tx.testScenario.create({
        data: {
          organizationId,
          projectId: project.id,
          key: SANDBOX_KIND,
          name: "Hosted sandbox regression",
          description:
            "Checks all sample application features against their subscription promises. Run before and after fixing access.",
          definition: { kind: SANDBOX_KIND },
        },
      });
      return project;
    },
    { timeout: 20000 },
  );
}

export async function runHostedSandbox(
  organizationId: string,
  scenario: SandboxScenario,
) {
  const lockKey = `sandbox-run:${organizationId}`;
  const token = globalThis.crypto.randomUUID();
  if ((await connection.set(lockKey, token, "EX", 300, "NX")) !== "OK")
    throw new AppError(
      409,
      "SANDBOX_BUSY",
      "A sample scenario is already running. Wait for it to finish and try again.",
    );
  try {
    const project = await initializeSandbox(organizationId);
    // Calls the normal SDK HTTP endpoint using a server-only, project-scoped key.
    const sdk = new EntitlementCI({
      baseUrl:
        process.env.INTERNAL_API_URL ??
        `http://127.0.0.1:${process.env.PORT ?? process.env.API_PORT ?? 4000}`,
      apiKey: sdkSecret(organizationId, project.id),
      timeoutMs: 10000,
      failureMode: "fail_closed",
    });
    const selected =
      scenario === "fix"
        ? SANDBOX_CUSTOMERS
        : SANDBOX_CUSTOMERS.filter(
            (c) =>
              c.id ===
              (scenario === "healthy"
                ? "sample_healthy"
                : scenario === "upgrade-propagation"
                  ? "sample_upgrade"
                  : scenario === "downgrade-propagation"
                    ? "sample_downgrade"
                    : "sample_limit"),
          );
    const observationIds: string[] = [];
    for (const c of selected) {
      const customer = await prisma.customer.findFirstOrThrow({
        where: {
          organizationId,
          projectId: project.id,
          externalCustomerId: c.id,
        },
      });
      const state = sandboxState(c, scenario);
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metadata: state },
      });
      for (const [feature, value] of Object.entries(sandboxAccess(state))) {
        const result = await sdk.recordDecision({
          customerId: c.id,
          feature: sandboxFeature(project.id, feature),
          allowed: typeof value === "boolean" ? value : true,
          ...(typeof value === "number" ? { limit: value, used: 0 } : {}),
          plan: sandboxPlan(project.id, state.actualPlan),
          metadata: {
            ...state,
            sample: true,
            scenario,
            application: "Hosted TaskFlow sandbox",
          },
        });
        if (!result.accepted)
          throw new AppError(
            503,
            "SANDBOX_REPORT_FAILED",
            "The sample observation could not be accepted. Try again shortly.",
          );
        observationIds.push(result.observationId);
      }
    }
    return {
      accepted: true,
      scenario,
      projectId: project.id,
      observationIds,
      customers: selected.map((c) => c.id),
      mode: "hosted",
    };
  } finally {
    await connection.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      token,
    );
  }
}
