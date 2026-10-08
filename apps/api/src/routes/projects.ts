import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf, auditIp } from "../auth/context.js";
import { assert } from "../utils/http.js";
import { projectCreateSchema } from "@entitlementci/validation";
import { audit } from "../services/audit.js";

export async function projectRoutes(app: FastifyInstance) {
  app.get("/v1/projects", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    return prisma.project.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: "ARCHIVED" },
      },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post("/v1/projects", async (request, reply) => {
    const ctx = await requireOrgRole(request, "ADMIN");
    await assertCsrf(request);
    const parsed = projectCreateSchema.safeParse(request.body);
    assert(
      parsed.success,
      400,
      "INVALID_REQUEST",
      parsed.success
        ? ""
        : (parsed.error.issues[0]?.message ?? "Invalid request"),
    );
    const project = await prisma.project.create({
      data: { organizationId: ctx.organizationId, ...parsed.data },
    });
    await audit({
      organizationId: ctx.organizationId,
      projectId: project.id,
      actorUserId: ctx.userId,
      action: "CREATE",
      resource: "project",
      resourceId: project.id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return reply.code(201).send(project);
  });
}
