import { describe, it, expect } from "vitest";
import { requireRole } from "../../apps/api/src/auth/permissions.js";
import {
  hashPassword,
  verifyPassword,
} from "../../apps/api/src/utils/crypto.js";
import { verifyStripeSignature } from "../../apps/api/src/utils/stripe.js";
import { createHmac } from "node:crypto";
describe("actual security implementations", () => {
  it("rejects viewer writes", () =>
    expect(() => requireRole("VIEWER", "DEVELOPER")).toThrow());
  it("permits owner admin operations", () =>
    expect(() => requireRole("OWNER", "ADMIN")).not.toThrow());
  it("hashes passwords and rejects a wrong password", async () => {
    const h = await hashPassword("CorrectPassword!123");
    expect(h).not.toContain("CorrectPassword");
    expect(await verifyPassword("CorrectPassword!123", h)).toBe(true);
    expect(await verifyPassword("WrongPassword!123", h)).toBe(false);
  });
  it("verifies exact webhook bytes and rejects tampering", () => {
    const t = Math.floor(Date.now() / 1000);
    const b = '{"id":"evt_test"}';
    const s = createHmac("sha256", "test_secret")
      .update(`${t}.${b}`)
      .digest("hex");
    expect(verifyStripeSignature(b, `t=${t},v1=${s}`, "test_secret")).toBe(
      true,
    );
    expect(
      verifyStripeSignature(b + " ", `t=${t},v1=${s}`, "test_secret"),
    ).toBe(false);
  });
});
