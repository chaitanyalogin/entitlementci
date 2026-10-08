import type {
  ComparisonResult,
  EntitlementValue,
  EntitlementMismatch,
  Severity,
} from "./index.js";

function equal(
  a: EntitlementValue | null | undefined,
  b: EntitlementValue | null | undefined,
): boolean {
  return a === b;
}

function severityFor(
  feature: string,
  expected: EntitlementValue | null,
  observed: EntitlementValue | null,
): Severity {
  const securityFeatures = new Set([
    "sso",
    "scim",
    "audit_logs",
    "ip_allowlist",
  ]);
  if (securityFeatures.has(feature)) return "CRITICAL";
  if (
    typeof expected === "number" &&
    typeof observed === "number" &&
    expected > observed * 2
  )
    return "HIGH";
  if (expected === true && observed === false) return "HIGH";
  if (expected !== null && observed === null) return "MEDIUM";
  return "LOW";
}

export function compareEntitlements(
  customerId: string,
  expected: Record<string, EntitlementValue>,
  observed: Record<string, EntitlementValue>,
): ComparisonResult {
  const features = new Set([
    ...Object.keys(expected),
    ...Object.keys(observed),
  ]);
  const mismatches: EntitlementMismatch[] = [];
  for (const feature of [...features].sort()) {
    const expectedValue = expected[feature] ?? null;
    const observedValue = observed[feature] ?? null;
    if (equal(expectedValue, observedValue)) continue;
    const reason =
      expectedValue === null
        ? `Feature ${feature} was observed but is not part of the expected entitlement.`
        : observedValue === null
          ? `Feature ${feature} is expected but no observed value exists.`
          : `Expected ${String(expectedValue)} but observed ${String(observedValue)}.`;
    mismatches.push({
      feature,
      expected: expectedValue,
      observed: observedValue,
      reason,
      severity: severityFor(feature, expectedValue, observedValue),
    });
  }
  return { customerId, matches: mismatches.length === 0, mismatches };
}
