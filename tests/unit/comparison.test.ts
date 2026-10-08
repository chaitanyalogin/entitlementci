import { describe, expect, it } from "vitest";
import { compareEntitlements } from "@entitlementci/shared";

describe("comparison engine", () => {
  it("accepts matching boolean and limit values", () => {
    expect(
      compareEntitlements(
        "cus_1",
        { sso: true, api_requests: 500000 },
        { sso: true, api_requests: 500000 },
      ).matches,
    ).toBe(true);
  });
  it("detects a security-sensitive mismatch as critical", () => {
    const result = compareEntitlements("cus_1", { sso: true }, { sso: false });
    expect(result.mismatches[0]?.severity).toBe("CRITICAL");
  });
  it("reports missing features when comparing complete snapshots", () => {
    const result = compareEntitlements(
      "cus_1",
      { sso: true, analytics: true },
      { sso: false },
    );
    expect(result.mismatches.map((x) => x.feature)).toEqual([
      "analytics",
      "sso",
    ]);
  });
});
