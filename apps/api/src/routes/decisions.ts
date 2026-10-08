import type { FastifyInstance } from "fastify";
import { redactMetadata } from "@entitlementci/shared";
import { authenticateApiKey } from "../utils/api-key.js";
import { ingestDecision } from "./customers.js";
import { enqueue } from "../jobs.js";
import {
  decisionSchema,
  usageSchema,
  identifyCustomerSchema,
} from "@entitlementci/validation";

export async function decisionRoutes(app: FastifyInstance) {
  app.post(
    "/v1/decisions",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request) => {
      const key = await authenticateApiKey(request);
      const parsed = decisionSchema.parse(request.body);
      const result = await ingestDecision({
        organizationId: key.organizationId,
        projectId: key.projectId,
        customerExternalId: parsed.customerId,
        feature: parsed.feature,
        allowed: parsed.allowed,
        plan: parsed.plan,
        limit: parsed.limit,
        used: parsed.used,
        metadata: parsed.metadata,
        requestId: request.id,
      });
      const job = await enqueue(
        "compare-observation",
        {
          organizationId: key.organizationId,
          projectId: key.projectId,
          observationId: result.observation.id,
          customerId: result.customer.id,
          featureKey: result.feature.key,
          observedValue: result.observation.value ?? result.observation.allowed,
          observedAt: result.observation.observedAt.toISOString(),
          requestId: request.id,
        },
        { jobId: `observation-${result.observation.id}` },
      );
      return {
        accepted: true,
        observationId: result.observation.id,
        jobId: job.id,
      };
    },
  );

  app.post(
    "/v1/usage",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request) => {
      const key = await authenticateApiKey(request);
      const parsed = usageSchema.parse(request.body);
      const result = await ingestDecision({
        organizationId: key.organizationId,
        projectId: key.projectId,
        customerExternalId: parsed.customerId,
        feature: parsed.feature,
        allowed:
          parsed.limit === undefined ? true : parsed.used <= parsed.limit,
        limit: parsed.limit,
        used: parsed.used,
        metadata: parsed.metadata,
        requestId: request.id,
      });
      await enqueue(
        "compare-observation",
        {
          organizationId: key.organizationId,
          projectId: key.projectId,
          observationId: result.observation.id,
          customerId: result.customer.id,
          featureKey: result.feature.key,
          observedValue: result.observation.value,
          observedAt: result.observation.observedAt.toISOString(),
          requestId: request.id,
        },
        { jobId: `usage-${result.observation.id}` },
      );
      return { accepted: true, observationId: result.observation.id };
    },
  );

  app.post("/v1/customers/identify", async (request) => {
    const key = await authenticateApiKey(request);
    const parsed = identifyCustomerSchema.parse(request.body);
    const customer = await (
      await import("../db.js")
    ).prisma.customer.upsert({
      where: {
        projectId_externalCustomerId: {
          projectId: key.projectId,
          externalCustomerId: parsed.customerId,
        },
      },
      update: {
        emailHash: parsed.emailHash,
        metadata: redactMetadata(parsed.metadata) as any,
      },
      create: {
        organizationId: key.organizationId,
        projectId: key.projectId,
        externalCustomerId: parsed.customerId,
        emailHash: parsed.emailHash,
        metadata: redactMetadata(parsed.metadata) as any,
      },
    });
    return { id: customer.id, customerId: customer.externalCustomerId };
  });
}
