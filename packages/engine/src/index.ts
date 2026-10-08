import { Prisma, type PrismaClient } from "@prisma/client";
import {
  compareEntitlements,
  type EntitlementValue,
} from "@entitlementci/shared";

function value(input: Prisma.JsonValue): EntitlementValue {
  if (
    typeof input === "boolean" ||
    typeof input === "number" ||
    typeof input === "string"
  )
    return input;
  throw new Error("Invalid entitlement value");
}

// Serialize changes for one customer across API processes and worker instances.
async function lock(tx: Prisma.TransactionClient, customerId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${customerId}))::text`;
}

export async function compareObservation(
  db: PrismaClient,
  observationId: string,
) {
  return db.$transaction(async (tx) => {
    const observation = await tx.observedDecision.findUniqueOrThrow({
      where: { id: observationId },
    });
    await lock(tx, observation.customerId);
    const current = await tx.observedDecision.findUniqueOrThrow({
      where: { id: observationId },
    });
    if (current.processedAt) return { duplicate: true };
    const latest = await tx.observedDecision.findFirst({
      where: { customerId: current.customerId, featureKey: current.featureKey },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    });
    if (latest?.id !== current.id) {
      await tx.observedDecision.update({
        where: { id: current.id },
        data: { processedAt: new Date() },
      });
      return { stale: true };
    }
    const expected = await tx.expectedEntitlement.findFirst({
      where: {
        customerId: current.customerId,
        feature: { key: current.featureKey },
      },
      include: { feature: true },
    });
    const result = compareEntitlements(
      current.customerId,
      expected ? { [current.featureKey]: value(expected.value) } : {},
      { [current.featureKey]: value(current.value ?? current.allowed) },
    );
    const mismatch = result.mismatches[0];
    const scope = {
      projectId: current.projectId,
      customerId: current.customerId,
      featureKey: current.featureKey,
      status: { in: ["OPEN", "ACKNOWLEDGED"] as ("OPEN" | "ACKNOWLEDGED")[] },
    };
    if (!mismatch) {
      await tx.violation.updateMany({
        where: scope,
        data: { status: "RESOLVED" },
      });
    } else {
      const existing = await tx.violation.findFirst({ where: scope });
      const details = {
        expectedValue: mismatch.expected ?? Prisma.JsonNull,
        observedValue: mismatch.observed ?? Prisma.JsonNull,
        severity: mismatch.severity,
        lastDetectedAt: current.observedAt,
      };
      const incident = existing
        ? await tx.violation.update({
            where: { id: existing.id },
            data: { ...details, occurrenceCount: { increment: 1 } },
          })
        : await tx.violation.create({
            data: {
              ...details,
              organizationId: current.organizationId,
              projectId: current.projectId,
              customerId: current.customerId,
              featureId: current.featureId,
              featureKey: current.featureKey,
              firstDetectedAt: current.observedAt,
              source: current.source,
              requestId: current.requestId,
            },
          });
      await tx.violationOccurrence.create({
        data: {
          violationId: incident.id,
          observationId: current.id,
          expectedValue: details.expectedValue,
          observedValue: details.observedValue,
          observedAt: current.observedAt,
          source: current.source,
          requestId: current.requestId,
        },
      });
      if (!existing)
        await tx.notification.create({
          data: {
            organizationId: current.organizationId,
            type: "VIOLATION",
            channel: "dashboard",
            subject: `${current.featureKey} entitlement drift`,
            body: mismatch.reason,
            metadata: { violationId: incident.id },
          },
        });
    }
    await tx.observedDecision.update({
      where: { id: current.id },
      data: { processedAt: new Date() },
    });
    return result;
  });
}

export async function setSubscription(
  db: PrismaClient,
  input: {
    organizationId: string;
    projectId: string;
    customerId: string;
    plan: string;
    status?: string;
    createdAt?: Date;
    provider?: string;
    subscriptionId?: string;
  },
) {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirstOrThrow({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        externalCustomerId: input.customerId,
      },
    });
    await lock(tx, customer.id);
    const plan = await tx.plan.findUniqueOrThrow({
      where: {
        organizationId_key: {
          organizationId: input.organizationId,
          key: input.plan,
        },
      },
      include: { entitlements: { include: { feature: true } } },
    });
    const current = await tx.customerSubscription.findUnique({
      where: { customerId: customer.id },
    });
    if (
      input.createdAt &&
      current?.providerCreatedAt &&
      current.providerCreatedAt >= input.createdAt
    )
      return { applied: false, reason: "stale_or_equal_timestamp" };
    const status = input.status ?? "active";
    const effectiveAt = input.createdAt ?? new Date();
    const data = {
      planId: plan.id,
      status,
      effectiveAt,
      provider: input.provider ?? "manual",
      ...(input.createdAt ? { providerCreatedAt: input.createdAt } : {}),
      ...(input.subscriptionId
        ? { providerSubscriptionId: input.subscriptionId }
        : {}),
    };
    await tx.customerSubscription.upsert({
      where: { customerId: customer.id },
      update: { ...data, version: { increment: 1 } },
      create: { ...data, customerId: customer.id, version: 1 },
    });
    const active = ["active", "trialing"].includes(status);
    const ids = plan.entitlements.map((e) => e.featureId);
    await tx.expectedEntitlement.deleteMany({
      where: { customerId: customer.id, featureId: { notIn: ids } },
    });
    for (const e of plan.entitlements) {
      const entitlementValue = active
        ? e.value
        : e.feature.type === "BOOLEAN"
          ? false
          : e.feature.type === "LIMIT"
            ? 0
            : "";
      const data = {
        planId: plan.id,
        value: entitlementValue as Prisma.InputJsonValue,
        source: input.provider ?? "manual",
        effectiveAt,
      };
      await tx.expectedEntitlement.upsert({
        where: {
          customerId_featureId: {
            customerId: customer.id,
            featureId: e.featureId,
          },
        },
        update: data,
        create: { ...data, customerId: customer.id, featureId: e.featureId },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        action: "SUBSCRIPTION_CHANGED",
        resource: "customer",
        resourceId: customer.id,
        metadata: {
          plan: input.plan,
          status,
          provider: input.provider ?? "manual",
        },
      },
    });
    return { applied: true, customerId: customer.id };
  });
}

export async function processWebhook(db: PrismaClient, webhookEventId: string) {
  const event = await db.webhookEvent.findUniqueOrThrow({
    where: { id: webhookEventId },
  });
  if (["PROCESSED", "IGNORED"].includes(event.status)) return;
  await db.webhookEvent.update({
    where: { id: event.id },
    data: { status: "PROCESSING" },
  });
  try {
    if (
      ![
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.eventType)
    ) {
      await db.webhookEvent.update({
        where: { id: event.id },
        data: { status: "IGNORED", processedAt: new Date() },
      });
      return;
    }
    const payload = event.payload as unknown as {
      data: {
        object: {
          customer: string;
          id: string;
          status: string;
          metadata: Record<string, string>;
        };
      };
    };
    const object = payload.data.object;
    const plan =
      object.metadata.entitlementci_plan_key ?? object.metadata.plan_key;
    if (!plan || !object.customer)
      throw new Error("Customer and entitlementci_plan_key metadata required");
    const result = await setSubscription(db, {
      organizationId: event.organizationId,
      projectId: event.projectId,
      customerId: object.customer,
      plan,
      provider: "stripe",
      createdAt: event.providerCreatedAt ?? new Date(0),
      status: event.eventType.endsWith(".deleted") ? "canceled" : object.status,
      subscriptionId: object.id,
    });
    await db.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: result.applied ? "PROCESSED" : "IGNORED",
        processedAt: new Date(),
        error: null,
      },
    });
    if (event.integrationId)
      await db.integration.update({
        where: { id: event.integrationId },
        data: { lastWebhookAt: event.receivedAt, lastSyncAt: new Date() },
      });
  } catch (error) {
    await db.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Processing failed",
      },
    });
    throw error;
  }
}
