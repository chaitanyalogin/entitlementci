import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { sha256 } from "./crypto.js";
import { AppError } from "./http.js";

export function createApiKey(
  environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION",
) {
  const prefix = environment === "PRODUCTION" ? "ent_live_" : "ent_test_";
  const secret = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { secret, prefix, hashInput: secret };
}

export async function authenticateApiKey(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    throw new AppError(
      401,
      "INVALID_API_KEY",
      "Bearer API key authentication is required.",
    );
  const secret = auth.slice(7).trim();
  if (!/^ent_(test|live)_[A-Za-z0-9_-]{20,}$/.test(secret))
    throw new AppError(401, "INVALID_API_KEY", "API key format is invalid.");
  const fingerprint = sha256(
    `${process.env.API_KEY_PEPPER ?? "development-only"}:${secret}`,
  );
  const prefix = secret.slice(0, 20);
  const candidates = await prisma.apiKey.findMany({
    where: { prefix, status: "ACTIVE" },
    include: { project: true },
  });
  const match = candidates.find((k) => k.secretHash === fingerprint);
  if (!match)
    throw new AppError(
      401,
      "INVALID_API_KEY",
      "API key is invalid or revoked.",
    );
  await prisma.apiKey.update({
    where: { id: match.id },
    data: { lastUsedAt: new Date() },
  });
  return {
    apiKeyId: match.id,
    organizationId: match.organizationId,
    projectId: match.projectId,
    environment: match.environment,
  };
}
