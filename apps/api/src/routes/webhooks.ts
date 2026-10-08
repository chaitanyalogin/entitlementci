import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { enqueue } from "../jobs.js";
import { verifyStripeSignature } from "../utils/stripe.js";
import { sha256 } from "../utils/crypto.js";
import { AppError } from "../utils/http.js";

export async function webhookRoutes(app: FastifyInstance) {
  app.post(
    "/v1/webhooks/stripe/:projectId",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request) => {
      const projectId = (request.params as { projectId: string }).projectId;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project)
        throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
      const integration = await prisma.integration.findFirst({
        where: {
          organizationId: project.organizationId,
          provider: "STRIPE",
          environment: project.environment,
          status: "CONNECTED",
        },
      });
      if (!integration || !integration.secretCiphertext)
        throw new AppError(
          404,
          "STRIPE_NOT_CONNECTED",
          "Stripe is not connected for this project.",
        );
      let config: {
        secretKey: string;
        webhookSecret: string;
        projectId: string;
      };
      try {
        config = JSON.parse(
          (await import("../utils/crypto.js")).decryptSecret(
            process.env.SESSION_SECRET!,
            integration.secretCiphertext,
          ),
        );
      } catch {
        throw new AppError(
          500,
          "INTEGRATION_CONFIG_ERROR",
          "Stripe integration configuration is unavailable.",
        );
      }
      if (config.projectId !== projectId)
        throw new AppError(
          403,
          "INTEGRATION_PROJECT_MISMATCH",
          "Integration is bound to another project.",
        );
      const raw = (request as any).rawBody as string | undefined;
      const body = raw;
      if (!body)
        throw new AppError(
          400,
          "RAW_BODY_REQUIRED",
          "Raw webhook body required.",
        );
      const signature = request.headers["stripe-signature"];
      if (
        typeof signature !== "string" ||
        !verifyStripeSignature(body, signature, config.webhookSecret)
      )
        throw new AppError(
          400,
          "INVALID_WEBHOOK_SIGNATURE",
          "Stripe signature verification failed.",
        );
      const event = request.body as any;
      const providerEventId = String(event.id ?? "");
      if (!providerEventId)
        throw new AppError(
          400,
          "INVALID_WEBHOOK",
          "Stripe event id is required.",
        );
      const payloadHash = sha256(body);
      const prior = await prisma.webhookEvent.findUnique({
        where: {
          provider_providerEventId: { provider: "stripe", providerEventId },
        },
      });
      if (prior) {
        if (prior.projectId !== projectId || prior.payloadHash !== payloadHash)
          throw new AppError(
            409,
            "WEBHOOK_REPLAY_MISMATCH",
            "Duplicate event differs from the stored event",
          );
        return { received: true, eventId: providerEventId, duplicate: true };
      }

      try {
        const created = await prisma.webhookEvent.create({
          data: {
            organizationId: project.organizationId,
            projectId,
            integrationId: integration.id,
            provider: "stripe",
            providerEventId,
            eventType: String(event.type ?? "unknown"),
            providerCreatedAt: event.created
              ? new Date(Number(event.created) * 1000)
              : null,
            payloadHash,
            status: "RECEIVED",
            payload: event,
          },
        });
        await enqueue(
          "stripe-webhook",
          { webhookEventId: created.id },
          { jobId: `stripe-${providerEventId}` },
        );
        return { received: true, eventId: providerEventId };
      } catch (error: any) {
        if (error?.code === "P2002") {
          const existing = await prisma.webhookEvent.findUnique({
            where: {
              provider_providerEventId: { provider: "stripe", providerEventId },
            },
          });
          if (existing && existing.payloadHash !== payloadHash)
            throw new AppError(
              409,
              "WEBHOOK_REPLAY_MISMATCH",
              "A duplicate Stripe event id arrived with a different payload.",
            );
          return { received: true, eventId: providerEventId, duplicate: true };
        }
        throw error;
      }
    },
  );
}
