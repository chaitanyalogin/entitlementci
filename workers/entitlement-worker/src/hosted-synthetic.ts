import type { PrismaClient } from "@prisma/client";
import {
  SANDBOX_CUSTOMERS,
  SANDBOX_KIND,
  SANDBOX_PROJECT_NAME,
  sandboxAccess,
  sandboxFeature,
  type SandboxPlan,
} from "@entitlementci/shared";

export async function runHostedRegression(
  db: PrismaClient,
  run: { id: string; organizationId: string; projectId: string },
) {
  try {
    if (process.env.ENABLE_HOSTED_DEMO !== "true")
      throw new Error("Hosted sandbox is not enabled on this worker");
    const project = await db.project.findFirstOrThrow({
      where: {
        id: run.projectId,
        organizationId: run.organizationId,
        name: SANDBOX_PROJECT_NAME,
        environment: "STAGING",
      },
    });
    // One snapshot prevents a concurrent fix from producing a mixed regression result.
    const customers = await db.customer.findMany({
      where: {
        organizationId: run.organizationId,
        projectId: project.id,
        externalCustomerId: { in: SANDBOX_CUSTOMERS.map((c) => c.id) },
      },
      include: { expectedEntitlements: { include: { feature: true } } },
    });
    if (customers.length !== SANDBOX_CUSTOMERS.length)
      throw new Error(
        "Sample customers are missing. Create the sandbox again before testing.",
      );
    let step = 0;
    let failures = 0;
    for (const customer of customers) {
      const state = customer.metadata as {
        kind?: string;
        actualPlan?: SandboxPlan;
        apiLimit?: number;
      } | null;
      if (
        state?.kind !== SANDBOX_KIND ||
        !["pro", "enterprise"].includes(state.actualPlan ?? "")
      )
        throw new Error("Sample application state is invalid");
      const values = sandboxAccess({
        actualPlan: state.actualPlan!,
        apiLimit: state.apiLimit,
      });
      for (const [feature, observed] of Object.entries(values)) {
        const start = Date.now();
        const expected = customer.expectedEntitlements.find(
          (e) => e.feature.key === sandboxFeature(project.id, feature),
        );
        const matches = Boolean(expected) && expected!.value === observed;
        if (!matches) failures++;
        await db.testResult.create({
          data: {
            testRunId: run.id,
            step: ++step,
            name: `${customer.externalCustomerId}:${feature}`,
            status: matches ? "PASS" : "FAIL",
            ...(expected
              ? { expected: expected.value as boolean | number }
              : {}),
            observed,
            ...(!matches
              ? {
                  error:
                    "Sample application access does not match the subscription promise.",
                }
              : {}),
            durationMs: Date.now() - start,
          },
        });
      }
    }
    await db.testRun.update({
      where: { id: run.id },
      data: {
        status: failures ? "FAILED" : "PASSED",
        finishedAt: new Date(),
        summary: {
          steps: step,
          failures,
          sample: true,
          scope:
            "Hosted sample application access compared with subscription catalog",
        },
      },
    });
  } catch (error) {
    await db.testRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        summary: {
          error: error instanceof Error ? error.message : "Regression failed",
        },
      },
    });
    throw error;
  }
}
