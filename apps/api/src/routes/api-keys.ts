import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf, auditIp } from "../auth/context.js";
import { AppError, assert } from "../utils/http.js";
import { createApiKey } from "../utils/api-key.js";
import { sha256 } from "../utils/crypto.js";
import { apiKeyCreateSchema } from "@entitlementci/validation";
import { audit } from "../services/audit.js";

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get("/v1/api-keys", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    return prisma.apiKey.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        projectId: true,
        label: true,
        prefix: true,
        environment: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/v1/api-keys", async (request, reply) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const parsed = apiKeyCreateSchema.safeParse(request.body);
    assert(
      parsed.success,
      400,
      "INVALID_REQUEST",
      parsed.success
        ? ""
        : (parsed.error.issues[0]?.message ?? "Invalid request"),
    );
    const body = parsed.data as {
      environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
      label: string;
      projectId?: string;
    };
    const projectId = (request.body as any)?.projectId as string | undefined;
    assert(projectId, 400, "PROJECT_REQUIRED", "projectId is required.");
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: ctx.organizationId },
    });
    assert(project, 404, "PROJECT_NOT_FOUND", "Project not found.");
    assert(
      project.environment === body.environment,
      400,
      "ENVIRONMENT_MISMATCH",
      "Key environment must match project environment",
    );
    const key = createApiKey(body.environment);
    const record = await prisma.apiKey.create({
      data: {
        organizationId: ctx.organizationId,
        projectId,
        label: body.label,
        prefix: key.secret.slice(0, 20),
        secretHash: sha256(
          `${process.env.API_KEY_PEPPER ?? "development-only"}:${key.secret}`,
        ),
        fingerprint: sha256(key.secret).slice(0, 16),
        environment: body.environment,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      projectId,
      actorUserId: ctx.userId,
      action: "CREATE",
      resource: "api_key",
      resourceId: record.id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return reply.code(201).send({
      id: record.id,
      secret: key.secret,
      environment: body.environment,
      projectId,
    });
  });

  app.post("/v1/api-keys/:id/revoke", async (request, reply) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const id = (request.params as { id: string }).id;
    const key = await prisma.apiKey.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!key)
      throw new AppError(404, "API_KEY_NOT_FOUND", "API key not found.");
    await prisma.apiKey.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await audit({
      organizationId: ctx.organizationId,
      projectId: key.projectId,
      actorUserId: ctx.userId,
      action: "REVOKE",
      resource: "api_key",
      resourceId: id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return reply.code(204).send();
  });

  app.post("/v1/api-keys/:id/rotate", async (request, reply) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const id = (request.params as { id: string }).id;
    const old = await prisma.apiKey.findFirst({
      where: { id, organizationId: ctx.organizationId, status: "ACTIVE" },
    });
    if (!old)
      throw new AppError(404, "API_KEY_NOT_FOUND", "Active API key not found.");
    const generated = createApiKey(old.environment);
    const created = await prisma.$transaction(async (tx) => {
      await tx.apiKey.update({
        where: { id },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      return tx.apiKey.create({
        data: {
          organizationId: old.organizationId,
          projectId: old.projectId,
          label: `${old.label} rotated`,
          prefix: generated.secret.slice(0, 20),
          secretHash: sha256(
            `${process.env.API_KEY_PEPPER ?? "development-only"}:${generated.secret}`,
          ),
          fingerprint: sha256(generated.secret).slice(0, 16),
          environment: old.environment,
          rotatedFromId: old.id,
        },
      });
    });
    await audit({
      organizationId: ctx.organizationId,
      projectId: old.projectId,
      actorUserId: ctx.userId,
      action: "ROTATE",
      resource: "api_key",
      resourceId: created.id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return reply.code(201).send({
      id: created.id,
      secret: generated.secret,
      projectId: old.projectId,
      environment: old.environment,
    });
  });
}
