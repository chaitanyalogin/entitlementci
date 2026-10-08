import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  compareEntitlements,
  type EntitlementValue,
} from "@entitlementci/shared";

export function normalizeExpectedValue(
  value: Prisma.JsonValue,
): EntitlementValue {
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  throw new Error(
    "Expected entitlement value must be boolean, number, or string",
  );
}

export async function compareCustomer(projectId: string, customerId: string) {
  const [expectedRows, latestRows] = await Promise.all([
    prisma.expectedEntitlement.findMany({
      where: { customerId },
      include: { feature: true },
    }),
    prisma.observedDecision.findMany({
      where: { projectId, customerId },
      orderBy: { observedAt: "desc" },
      take: 250,
    }),
  ]);
  const expected = Object.fromEntries(
    expectedRows.map((row) => [
      row.feature.key,
      normalizeExpectedValue(row.value),
    ]),
  );
  const latestByFeature = new Map<string, EntitlementValue>();
  for (const row of latestRows) {
    if (!latestByFeature.has(row.featureKey))
      latestByFeature.set(
        row.featureKey,
        row.value === null ? row.allowed : normalizeExpectedValue(row.value),
      );
  }
  return compareEntitlements(
    customerId,
    expected,
    Object.fromEntries(latestByFeature),
  );
}
