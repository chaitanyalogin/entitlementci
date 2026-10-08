import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole } from "../auth/context.js";
export async function auditRoutes(app: FastifyInstance) {
  app.get("/v1/audit-logs", async (request) => {
    const ctx = await requireOrgRole(request, "ADMIN");
    const q = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(q.limit ?? 100), 1), 250);
    return prisma.auditLog.findMany({
      where: { organizationId: ctx.organizationId },
      include: { actor: { select: { id: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  });
}
