import { z } from "zod";
import { setSubscription } from "@entitlementci/engine";
import type { FastifyInstance } from "fastify";
import { redactMetadata } from "@entitlementci/shared";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf } from "../auth/context.js";
import { AppError, assert } from "../utils/http.js";
import { compareCustomer } from "../services/violation.js";

export async function customerRoutes(app: FastifyInstance) {
  app.post("/v1/customers", async (request) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const b = z
      .object({
        projectId: z.string(),
        customerId: z.string().min(1).max(150),
        plan: z.string(),
      })
      .parse(request.body);
    const project = await prisma.project.findFirst({
      where: { id: b.projectId, organizationId: ctx.organizationId },
    });
    if (!project)
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    const plan = await prisma.plan.findFirst({
      where: { organizationId: ctx.organizationId, key: b.plan },
    });
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND", "Plan not found");
    const customer = await prisma.customer.upsert({
      where: {
        projectId_externalCustomerId: {
          projectId: b.projectId,
          externalCustomerId: b.customerId,
        },
      },
      update: {},
      create: {
        organizationId: ctx.organizationId,
        projectId: b.projectId,
        externalCustomerId: b.customerId,
      },
    });
    await setSubscription(prisma, {
      organizationId: ctx.organizationId,
      projectId: b.projectId,
      customerId: b.customerId,
      plan: b.plan,
    });
    return customer;
  });
  app.get("/v1/customers", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const projectId = (request.query as { projectId?: string }).projectId;
    return prisma.customer.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(projectId ? { projectId } : {}),
      },
      include: { subscriptions: { include: { plan: true } } },
      orderBy: { updatedAt: "desc" },
    });
  });

  app.get("/v1/customers/:id", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const id = (request.params as { id: string }).id;
    const customer = await prisma.customer.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        subscriptions: { include: { plan: true } },
        expectedEntitlements: { include: { feature: true } },
        observedDecisions: { orderBy: { observedAt: "desc" }, take: 100 },
        violations: { orderBy: { lastDetectedAt: "desc" }, take: 50 },
      },
    });
    if (!customer)
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
    const comparison = await compareCustomer(customer.projectId, customer.id);
    return { ...customer, comparison };
  });

  app.post("/v1/customers/:id/expected", async (request) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      feature?: string;
      value?: boolean | number | string;
      planId?: string;
    };
    assert(
      typeof body.feature === "string" && body.feature.length > 0,
      400,
      "FEATURE_REQUIRED",
      "feature is required.",
    );
    assert(
      ["boolean", "number", "string"].includes(typeof body.value),
      400,
      "VALUE_REQUIRED",
      "value must be boolean, number, or string.",
    );
    const customer = await prisma.customer.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!customer)
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
    const feature = await prisma.feature.findUnique({
      where: {
        organizationId_key: {
          organizationId: ctx.organizationId,
          key: body.feature,
        },
      },
    });
    if (!feature)
      throw new AppError(404, "FEATURE_NOT_FOUND", "Feature not found.");
    if (
      body.planId &&
      !(await prisma.plan.findFirst({
        where: { id: body.planId, organizationId: ctx.organizationId },
      }))
    )
      throw new AppError(404, "PLAN_NOT_FOUND", "Plan not found");
    if (
      (feature.type === "BOOLEAN" && typeof body.value !== "boolean") ||
      (feature.type === "LIMIT" &&
        (typeof body.value !== "number" ||
          !Number.isSafeInteger(body.value) ||
          body.value < 0))
    )
      throw new AppError(
        400,
        "INVALID_VALUE",
        "Value does not match feature type",
      );
    await prisma.expectedEntitlement.upsert({
      where: {
        customerId_featureId: { customerId: id, featureId: feature.id },
      },
      update: {
        value: body.value!,
        planId: body.planId,
        source: "manual",
        effectiveAt: new Date(),
      },
      create: {
        customerId: id,
        featureId: feature.id,
        value: body.value!,
        planId: body.planId,
        source: "manual",
      },
    });
    return { ok: true };
  });
}

export async function ingestDecision(input: {
  organizationId: string;
  projectId: string;
  customerExternalId: string;
  feature: string;
  allowed: boolean;
  plan?: string;
  limit?: number;
  used?: number;
  metadata?: unknown;
  requestId?: string;
  observedAt?: Date;
}) {
  const customer = await prisma.customer.upsert({
    where: {
      projectId_externalCustomerId: {
        projectId: input.projectId,
        externalCustomerId: input.customerExternalId,
      },
    },
    update: { metadata: redactMetadata(input.metadata) as any },
    create: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalCustomerId: input.customerExternalId,
      metadata: redactMetadata(input.metadata) as any,
    },
  });
  const feature = await prisma.feature.findUnique({
    where: {
      organizationId_key: {
        organizationId: input.organizationId,
        key: input.feature,
      },
    },
  });
  if (!feature)
    throw new AppError(
      400,
      "UNKNOWN_FEATURE",
      "The feature is not configured for this organization.",
    );
  const observedValue =
    feature.type === "LIMIT" ? (input.limit ?? input.used ?? 0) : input.allowed;
  const observation = await prisma.observedDecision.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      customerId: customer.id,
      featureId: feature.id,
      featureKey: input.feature,
      allowed: input.allowed,
      value: observedValue,
      plan: input.plan,
      used: input.used,
      limit: input.limit,
      metadata: redactMetadata(input.metadata) as any,
      source: "SDK",
      requestId: input.requestId,
      observedAt: input.observedAt ?? new Date(),
    },
  });
  return { customer, feature, observation };
}
