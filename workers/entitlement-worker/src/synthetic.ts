import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { SANDBOX_KIND } from "@entitlementci/shared";
import { runHostedRegression } from "./hosted-synthetic.js";
export async function runSynthetic(db: PrismaClient, runId: string) {
  const run = await db.testRun.findUniqueOrThrow({
    where: { id: runId },
    include: { scenario: true },
  });
  await db.testRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if ((run.scenario.definition as { kind?: string })?.kind === SANDBOX_KIND) {
    return runHostedRegression(db, run);
  }
  const base = process.env.TASKFLOW_URL ?? "http://localhost:4100";
  const definition = run.scenario.definition as unknown as {
    customerId?: string;
    steps: {
      action: string;
      feature?: string;
      allowed?: boolean;
      limit?: number;
      plan?: string;
    }[];
  };
  const customerId = definition.customerId ?? "cus_demo_upgrade_bug";
  const call = async (path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        "x-service-token": process.env.TASKFLOW_SERVICE_TOKEN ?? "",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`TaskFlow HTTP ${res.status}`);
    return res.json() as Promise<Record<string, any>>;
  };
  const send = async (id: string, created: number, plan: string) => {
    const body = JSON.stringify({
      id,
      type: "customer.subscription.updated",
      created,
      data: {
        object: {
          id: "sub_synthetic",
          customer: customerId,
          status: "active",
          metadata: { entitlementci_plan_key: plan },
        },
      },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac(
      "sha256",
      process.env.DEMO_STRIPE_WEBHOOK_SECRET ?? "",
    )
      .update(`${t}.${body}`)
      .digest("hex");
    const res = await fetch(
      `${process.env.PUBLIC_API_URL ?? "http://localhost:4000"}/v1/webhooks/stripe/${run.projectId}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${t},v1=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
    return res.json();
  };
  async function waitEvent(id: string) {
    for (let i = 0; i < 50; i++) {
      const e = await db.webhookEvent.findUnique({
        where: {
          provider_providerEventId: { provider: "stripe", providerEventId: id },
        },
      });
      if (e && ["PROCESSED", "IGNORED"].includes(e.status)) return;
      if (e?.status === "FAILED") throw new Error(e.error ?? "Webhook failed");
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Webhook processing timed out");
  }
  let failed = false;
  let step = 0;
  try {
    for (const action of definition.steps) {
      step++;
      const start = Date.now();
      try {
        let observed: unknown;
        if (action.action === "setSubscription")
          observed = await call(
            `/api/demo/customers/${customerId}/subscription`,
            { plan: action.plan },
          );
        else if (action.action === "observe") {
          const state = await call(
            `/api/demo/customers/${customerId}/entitlements`,
          );
          observed = state.features[action.feature!];
          const f = observed as { allowed: boolean; limit?: number };
          if (
            f.allowed !== action.allowed ||
            (action.limit !== undefined && f.limit !== action.limit)
          )
            throw new Error(
              `${action.feature}: expected ${JSON.stringify(action)}, observed ${JSON.stringify(f)}`,
            );
          if (action.feature !== "api_requests") {
            const access = await fetch(
              `${base}/api/demo/customers/${customerId}/access/${action.feature}`,
              {
                headers: {
                  "x-service-token": process.env.TASKFLOW_SERVICE_TOKEN ?? "",
                },
              },
            );
            if (access.status !== (action.allowed ? 200 : 403))
              throw new Error("Access endpoint disagrees with entitlement");
          }
        } else if (
          ["sendDuplicateWebhook", "sendOutOfOrderWebhooks"].includes(
            action.action,
          )
        ) {
          const org = await db.organization.findUniqueOrThrow({
            where: { id: run.organizationId },
          });
          if (process.env.ENABLE_DEMO !== "true" || org.slug !== "demo-acme")
            throw new Error("Signed fixtures require local demo mode");
          const id = `evt_${randomUUID()}`;
          const c = await db.customerSubscription.findFirst({
            where: {
              customer: {
                projectId: run.projectId,
                externalCustomerId: customerId,
              },
            },
          });
          const created = Math.max(
            Math.floor(Date.now() / 1000),
            Math.floor((c?.providerCreatedAt?.getTime() ?? 0) / 1000) + 2,
          );
          await send(id, created, "enterprise");
          await waitEvent(id);
          const before = await db.customerSubscription.findFirstOrThrow({
            where: {
              customer: {
                projectId: run.projectId,
                externalCustomerId: customerId,
              },
            },
          });
          if (action.action === "sendDuplicateWebhook")
            await send(id, created, "enterprise");
          else {
            await send(`${id}_old`, created - 1, "pro");
            await waitEvent(`${id}_old`);
          }
          const after = await db.customerSubscription.findUniqueOrThrow({
            where: { customerId: before.customerId },
          });
          if (
            after.planId !== before.planId ||
            after.version !== before.version
          )
            throw new Error("Replay changed newer subscription");
          observed = { version: after.version, newerStatePreserved: true };
        } else throw new Error(`Unsupported action: ${action.action}`);
        await db.testResult.create({
          data: {
            testRunId: run.id,
            step,
            name: `${action.action}${action.feature ? ":" + action.feature : ""}`,
            status: "PASS",
            expected: action as Prisma.InputJsonValue,
            observed: observed as Prisma.InputJsonValue,
            durationMs: Date.now() - start,
          },
        });
      } catch (error) {
        failed = true;
        await db.testResult.create({
          data: {
            testRunId: run.id,
            step,
            name: action.action,
            status: "FAIL",
            expected: action as Prisma.InputJsonValue,
            error: error instanceof Error ? error.message : "Failed",
            durationMs: Date.now() - start,
          },
        });
        break;
      }
    }
    await db.testRun.update({
      where: { id: run.id },
      data: {
        status: failed ? "FAILED" : "PASSED",
        finishedAt: new Date(),
        summary: { steps: step, failed },
      },
    });
  } catch (error) {
    await db.testRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        summary: { error: error instanceof Error ? error.message : "Failed" },
      },
    });
    throw error;
  }
}
