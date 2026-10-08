import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf, auditIp } from "../auth/context.js";
import { AppError, assert } from "../utils/http.js";
import { audit } from "../services/audit.js";

export async function violationRoutes(app: FastifyInstance) {
  app.get("/v1/violations", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const q = request.query as {
      projectId?: string;
      status?: string;
      severity?: string;
      limit?: string;
    };
    const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 200);
    return prisma.violation.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(q.projectId ? { projectId: q.projectId } : {}),
        ...(q.status ? { status: q.status as any } : {}),
        ...(q.severity ? { severity: q.severity as any } : {}),
      },
      include: { customer: true, feature: true },
      orderBy: { lastDetectedAt: "desc" },
      take: limit,
    });
  });

  app.get("/v1/violations/:id", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const id = (request.params as { id: string }).id;
    const violation = await prisma.violation.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        customer: { include: { subscriptions: { include: { plan: true } } } },
        feature: true,
        occurrences: { orderBy: { createdAt: "asc" } },
        project: true,
      },
    });
    if (!violation)
      throw new AppError(404, "VIOLATION_NOT_FOUND", "Violation not found.");
    return violation;
  });

  app.patch("/v1/violations/:id", async (request) => {
    const ctx = await requireOrgRole(request, "DEVELOPER");
    await assertCsrf(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED";
    };
    assert(
      ["OPEN", "ACKNOWLEDGED", "RESOLVED", "IGNORED"].includes(
        body.status ?? "",
      ),
      400,
      "INVALID_STATUS",
      "Invalid violation status.",
    );
    const violation = await prisma.violation.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!violation)
      throw new AppError(404, "VIOLATION_NOT_FOUND", "Violation not found.");
    const updated = await prisma.violation.update({
      where: { id },
      data: { status: body.status },
    });
    await audit({
      organizationId: ctx.organizationId,
      projectId: updated.projectId,
      actorUserId: ctx.userId,
      action: "UPDATE_STATUS",
      resource: "violation",
      resourceId: id,
      ipAddress: auditIp(request),
      requestId: request.id,
      metadata: { status: body.status },
    });
    return updated;
  });
}
