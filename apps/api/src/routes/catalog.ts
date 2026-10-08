import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf } from "../auth/context.js";
import { AppError } from "../utils/http.js";
const key = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
export async function catalogRoutes(app: FastifyInstance) {
  app.get("/v1/plans", async (request) => {
    const c = await requireOrgRole(request, "VIEWER");
    return prisma.plan.findMany({
      where: { organizationId: c.organizationId },
      include: {
        entitlements: { include: { feature: true } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { name: "asc" },
    });
  });
  app.get("/v1/features", async (request) => {
    const c = await requireOrgRole(request, "VIEWER");
    return prisma.feature.findMany({
      where: { organizationId: c.organizationId },
      include: {
        planEntitlements: { include: { plan: true } },
        _count: { select: { violations: true } },
      },
      orderBy: { key: "asc" },
    });
  });
  app.post("/v1/features", async (request) => {
    const c = await requireOrgRole(request, "ADMIN");
    await assertCsrf(request);
    const b = z
      .object({
        key,
        name: z.string().min(2).max(80),
        type: z.enum(["BOOLEAN", "LIMIT", "VALUE"]),
        description: z.string().max(400).optional(),
      })
      .parse(request.body);
    return prisma.feature.create({
      data: { ...b, organizationId: c.organizationId },
    });
  });
  app.post("/v1/plans", async (request) => {
    const c = await requireOrgRole(request, "ADMIN");
    await assertCsrf(request);
    const b = z
      .object({
        key,
        name: z.string().min(2).max(80),
        entitlements: z.record(
          z.union([
            z.boolean(),
            z.number().finite().nonnegative(),
            z.string().max(200),
          ]),
        ),
      })
      .parse(request.body);
    const features = await prisma.feature.findMany({
      where: {
        organizationId: c.organizationId,
        key: { in: Object.keys(b.entitlements) },
      },
    });
    if (features.length !== Object.keys(b.entitlements).length)
      throw new AppError(
        400,
        "UNKNOWN_FEATURE",
        "Create each feature before adding it to a plan",
      );
    for (const f of features) {
      const v = b.entitlements[f.key];
      if (
        (f.type === "BOOLEAN" && typeof v !== "boolean") ||
        (f.type === "LIMIT" &&
          (typeof v !== "number" || !Number.isSafeInteger(v)))
      )
        throw new AppError(
          400,
          "INVALID_VALUE",
          `${f.key} has an invalid value`,
        );
    }
    return prisma.plan.create({
      data: {
        organizationId: c.organizationId,
        key: b.key,
        name: b.name,
        entitlements: {
          create: features.map((f) => ({
            featureId: f.id,
            value: b.entitlements[f.key]!,
          })),
        },
      },
      include: { entitlements: true },
    });
  });
}
