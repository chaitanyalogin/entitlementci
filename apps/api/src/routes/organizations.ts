import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf, auditIp } from "../auth/context.js";
import { AppError, assert } from "../utils/http.js";
import { slugify } from "../utils/crypto.js";
import { audit } from "../services/audit.js";

export async function organizationRoutes(app: FastifyInstance) {
  app.get("/v1/organizations", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    return prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      include: {
        memberships: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });
  });

  app.post("/v1/organizations", async (request, reply) => {
    const current = await requireOrgRole(request, "OWNER");
    await assertCsrf(request);
    const body = request.body as { name?: string };
    assert(
      typeof body.name === "string" && body.name.trim().length >= 2,
      400,
      "INVALID_NAME",
      "Organization name is required.",
    );
    const base = slugify(body.name) || `org-${current.userId.slice(0, 8)}`;
    const organization = await prisma.organization.create({
      data: {
        name: body.name.trim(),
        slug: `${base}-${Date.now().toString(36)}`,
        memberships: { create: { userId: current.userId, role: "OWNER" } },
      },
    });
    await audit({
      organizationId: organization.id,
      actorUserId: current.userId,
      action: "CREATE",
      resource: "organization",
      resourceId: organization.id,
      ipAddress: auditIp(request),
      requestId: request.id,
    });
    return reply.code(201).send(organization);
  });

  app.post("/v1/organizations/members", async (request, reply) => {
    const ctx = await requireOrgRole(request, "ADMIN");
    await assertCsrf(request);
    const body = request.body as {
      email?: string;
      role?: "ADMIN" | "DEVELOPER" | "VIEWER";
    };
    assert(
      typeof body.email === "string" && body.email.includes("@"),
      400,
      "INVALID_EMAIL",
      "A valid email is required.",
    );
    assert(
      body.role === "ADMIN" ||
        body.role === "DEVELOPER" ||
        body.role === "VIEWER",
      400,
      "INVALID_ROLE",
      "Role must be ADMIN, DEVELOPER, or VIEWER.",
    );
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    if (!user)
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "The invited user must have an account first.",
      );
    const existing = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: user.id,
        },
      },
    });
    if (existing?.role === "OWNER")
      throw new AppError(
        403,
        "OWNER_PROTECTED",
        "Owner role cannot be changed through this endpoint",
      );
    const membership = await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: user.id,
        },
      },
      update: { role: body.role },
      create: {
        organizationId: ctx.organizationId,
        userId: user.id,
        role: body.role,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UPSERT_MEMBER",
      resource: "membership",
      resourceId: membership.id,
      ipAddress: auditIp(request),
      requestId: request.id,
      metadata: { role: body.role },
    });
    return reply.code(201).send(membership);
  });
}
