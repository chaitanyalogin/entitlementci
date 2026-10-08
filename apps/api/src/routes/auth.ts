import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import {
  hashPassword,
  slugify,
  verifyPassword,
  randomToken,
  sha256,
} from "../utils/crypto.js";
import { assert, AppError } from "../utils/http.js";
import {
  assertCsrf,
  auditIp,
  cookieOptions,
  createSession,
  destroySession,
  requireUser,
} from "../auth/context.js";
import { audit } from "../services/audit.js";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/v1/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body as {
        email?: string;
        password?: string;
        organizationName?: string;
      };
      assert(
        typeof body.email === "string" &&
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email),
        400,
        "INVALID_EMAIL",
        "A valid email is required.",
      );
      assert(
        typeof body.password === "string" && body.password.length >= 12,
        400,
        "WEAK_PASSWORD",
        "Password must contain at least 12 characters.",
      );
      assert(
        typeof body.organizationName === "string" &&
          body.organizationName.trim().length >= 2,
        400,
        "INVALID_ORGANIZATION",
        "Organization name is required.",
      );
      const email = body.email.toLowerCase().trim();
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists)
        throw new AppError(
          409,
          "EMAIL_EXISTS",
          "An account with this email already exists.",
        );
      const user = await prisma.user.create({
        data: { email, passwordHash: await hashPassword(body.password) },
      });
      const base =
        slugify(body.organizationName) || `org-${user.id.slice(0, 8)}`;
      const slug = `${base}-${user.id.slice(0, 6)}`;
      const organization = await prisma.organization.create({
        data: {
          name: body.organizationName.trim(),
          slug,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      const session = await createSession(
        user.id,
        Number(process.env.SESSION_TTL_SECONDS ?? 604800),
      );
      reply.setCookie(
        "entitlementci_session",
        session.token,
        cookieOptions({
          nodeEnv: process.env.NODE_ENV ?? "development",
          ttlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 604800),
        }),
      );
      reply.setCookie("entitlementci_csrf", session.csrf, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Number(process.env.SESSION_TTL_SECONDS ?? 604800),
      });
      await audit({
        organizationId: organization.id,
        actorUserId: user.id,
        action: "REGISTER",
        resource: "organization",
        resourceId: organization.id,
        ipAddress: auditIp(request),
        requestId: request.id,
      });
      return reply.code(201).send({
        user: { id: user.id, email: user.email },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
      });
    },
  );

  app.post(
    "/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body as { email?: string; password?: string };
      assert(
        typeof body.email === "string" && typeof body.password === "string",
        400,
        "INVALID_REQUEST",
        "Email and password are required.",
      );
      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase().trim() },
      });
      if (!user || !(await verifyPassword(body.password, user.passwordHash)))
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Invalid email or password.",
        );
      const session = await createSession(
        user.id,
        Number(process.env.SESSION_TTL_SECONDS ?? 604800),
      );
      reply.setCookie(
        "entitlementci_session",
        session.token,
        cookieOptions({
          nodeEnv: process.env.NODE_ENV ?? "development",
          ttlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 604800),
        }),
      );
      reply.setCookie("entitlementci_csrf", session.csrf, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Number(process.env.SESSION_TTL_SECONDS ?? 604800),
      });
      const membership = await prisma.membership.findFirst({
        where: { userId: user.id },
        include: { organization: true },
      });
      assert(
        membership,
        403,
        "NO_MEMBERSHIP",
        "User has no organization membership.",
      );
      await audit({
        organizationId: membership.organizationId,
        actorUserId: user.id,
        action: "LOGIN",
        resource: "session",
        ipAddress: auditIp(request),
        requestId: request.id,
      });
      return {
        user: { id: user.id, email: user.email },
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
        },
        role: membership.role,
      };
    },
  );

  app.post(
    "/v1/auth/password-reset/request",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      if (process.env.NODE_ENV === "production")
        throw new AppError(
          503,
          "EMAIL_NOT_CONFIGURED",
          "Configure an email transport before using this endpoint",
        );
      const body = request.body as { email?: string };
      if (typeof body.email !== "string") return { accepted: true };
      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase().trim() },
      });
      if (user) {
        const raw = randomToken(32);
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256(raw),
            purpose: "password_reset",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
        console.log(
          `[email.console] password reset for ${user.email}: ${process.env.PUBLIC_API_URL ?? "http://localhost:4000"}/reset-password?token=${raw}`,
        );
      }
      return { accepted: true };
    },
  );

  app.post("/v1/auth/password-reset/confirm", async (request) => {
    const body = request.body as { token?: string; password?: string };
    assert(
      typeof body.token === "string" &&
        typeof body.password === "string" &&
        body.password.length >= 12,
      400,
      "INVALID_REQUEST",
      "Token and a 12-character password are required.",
    );
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(body.token) },
    });
    if (
      !record ||
      record.purpose !== "password_reset" ||
      record.usedAt ||
      record.expiresAt < new Date()
    )
      throw new AppError(
        400,
        "INVALID_RESET_TOKEN",
        "Reset token is invalid or expired.",
      );
    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);
    return { reset: true };
  });

  app.post("/v1/auth/verify-email/request", async (request) => {
    if (process.env.NODE_ENV === "production")
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Configure an email transport before using this endpoint",
      );
    const body = request.body as { email?: string };
    const user =
      typeof body.email === "string"
        ? await prisma.user.findUnique({
            where: { email: body.email.toLowerCase().trim() },
          })
        : null;
    if (user && !user.emailVerifiedAt) {
      const raw = randomToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(raw),
          purpose: "email_verification",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      console.log(
        `[email.console] email verification for ${user.email}: ${process.env.PUBLIC_API_URL ?? "http://localhost:4000"}/verify-email?token=${raw}`,
      );
    }
    return { accepted: true };
  });

  app.post("/v1/auth/verify-email", async (request) => {
    const body = request.body as { token?: string };
    assert(
      typeof body.token === "string",
      400,
      "INVALID_REQUEST",
      "Verification token is required.",
    );
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(body.token) },
    });
    if (
      !record ||
      record.purpose !== "email_verification" ||
      record.usedAt ||
      record.expiresAt < new Date()
    )
      throw new AppError(
        400,
        "INVALID_VERIFICATION_TOKEN",
        "Verification token is invalid or expired.",
      );
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { verified: true };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    await assertCsrf(request);
    const raw = request.cookies.entitlementci_session;
    if (raw) await destroySession(raw);
    reply.clearCookie("entitlementci_session", { path: "/" });
    reply.clearCookie("entitlementci_csrf", { path: "/" });
    return reply.code(204).send();
  });

  app.get("/v1/auth/me", async (request) => {
    const ctx = await requireUser(request);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    return {
      user: { id: ctx.userId, email: ctx.email },
      organization,
      role: ctx.role,
    };
  });
}
