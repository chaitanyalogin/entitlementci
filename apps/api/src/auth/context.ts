import type { FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";
import { prisma } from "../db.js";
import { sha256, randomToken } from "../utils/crypto.js";
import { AppError, getClientIp } from "../utils/http.js";
import { requireRole } from "./permissions.js";

export interface UserContext {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
}

export async function requireUser(
  request: FastifyRequest,
): Promise<UserContext> {
  const raw = request.cookies.entitlementci_session;
  if (!raw)
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: { include: { memberships: true } } },
  });
  if (!session || session.expiresAt < new Date())
    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "Session is invalid or expired.",
    );
  const requested = request.headers["x-organization-id"];
  const membership =
    typeof requested === "string"
      ? session.user.memberships.find((m) => m.organizationId === requested)
      : session.user.memberships[0];
  if (!membership)
    throw new AppError(
      403,
      "NO_MEMBERSHIP",
      "User has no organization membership.",
    );
  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return {
    userId: session.user.id,
    email: session.user.email,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

export async function requireOrgRole(
  request: FastifyRequest,
  minimum: Role,
): Promise<UserContext> {
  const ctx = await requireUser(request);
  requireRole(ctx.role, minimum);
  return ctx;
}

export async function createSession(userId: string, ttlSeconds: number) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfTokenHash: sha256(csrf),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
  });
  return { token, csrf };
}

export async function destroySession(rawToken: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(rawToken) } });
}

export async function assertCsrf(request: FastifyRequest) {
  const rawSession = request.cookies.entitlementci_session;
  const csrf = request.headers["x-csrf-token"];
  if (!rawSession || typeof csrf !== "string")
    throw new AppError(403, "CSRF_REQUIRED", "A CSRF token is required.");
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(rawSession) },
  });
  if (!session || sha256(csrf) !== session.csrfTokenHash)
    throw new AppError(403, "CSRF_INVALID", "The CSRF token is invalid.");
}

export function cookieOptions(config: { nodeEnv: string; ttlSeconds: number }) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: config.ttlSeconds,
  };
}

export function auditIp(request: FastifyRequest) {
  return getClientIp(request);
}
