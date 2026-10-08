import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf, auditIp } from "../auth/context.js";
import { AppError, assert } from "../utils/http.js";
import { encryptSecret } from "../utils/crypto.js";
import { audit } from "../services/audit.js";

export async function integrationRoutes(app: FastifyInstance) {
  app.get("/v1/integrations", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    return prisma.integration.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        provider: true,
        status: true,
        environment: true,
        accountIdentifier: true,
        lastWebhookAt: true,
        webhookFailures: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
  app.post("/v1/integrations/stripe", async (request) => {
    const ctx = await requireOrgRole(request, "ADMIN");
    await assertCsrf(request);
    const b = request.body as {
      secretKey?: string;
      webhookSecret?: string;
      environment?: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
      projectId?: string;
      accountIdentifier?: string;
    };
    assert(
      Boolean(b.secretKey && b.webhookSecret && b.environment && b.projectId),
      400,
      "INVALID_REQUEST",
      "secretKey, webhookSecret, environment, and projectId are required.",
    );
    const project = await prisma.project.findFirst({
      where: { id: b.projectId!, organizationId: ctx.organizationId },
    });
    if (!project)
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    const integration = await prisma.integration.upsert({
      where: {
        organizationId_provider_environment: {
          organizationId: ctx.organizationId,
          provider: "STRIPE",
          environment: b.environment!,
        },
      },
      update: {
        status: "CONNECTED",
        accountIdentifier: b.accountIdentifier,
        secretCiphertext: encryptSecret(
          process.env.SESSION_SECRET!,
          JSON.stringify({
            secretKey: b.secretKey,
            webhookSecret: b.webhookSecret,
            projectId: b.projectId,
          }),
        ),
      },
      create: {
        organizationId: ctx.organizationId,
        provider: "STRIPE",
        environment: b.environment!,
        status: "CONNECTED",
        accountIdentifier: b.accountIdentifier,
        secretCiphertext: encryptSecret(
          process.env.SESSION_SECRET!,
          JSON.stringify({
            secretKey: b.secretKey,
            webhookSecret: b.webhookSecret,
            projectId: b.projectId,
          }),
        ),
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      projectId: project.id,
      actorUserId: ctx.userId,
      action: "CONNECT",
      resource: "integration",
      resourceId: integration.id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return {
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      environment: integration.environment,
      accountIdentifier: integration.accountIdentifier,
    };
  });
  app.post("/v1/integrations/stripe/:id/disconnect", async (request) => {
    const ctx = await requireOrgRole(request, "ADMIN");
    await assertCsrf(request);
    const id = (request.params as { id: string }).id;
    const integration = await prisma.integration.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!integration)
      throw new AppError(
        404,
        "INTEGRATION_NOT_FOUND",
        "Integration not found.",
      );
    await prisma.integration.update({
      where: { id },
      data: { status: "DISCONNECTED", secretCiphertext: null },
    });
    await audit({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "DISCONNECT",
      resource: "integration",
      resourceId: id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return { ok: true };
  });
}
