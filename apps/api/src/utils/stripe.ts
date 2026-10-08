import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(
    signature
      .split(",")
      .map((part) => {
        const [key, value] = part.split("=", 2);
        return [key, value];
      })
      .filter(([k, v]) => Boolean(k && v)),
  );
  const timestamp = Number(parts.t);
  const v1 = parts.v1;
  if (
    !timestamp ||
    !v1 ||
    Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stripePlanKey(eventObject: any): string | undefined {
  return (
    eventObject?.metadata?.entitlementci_plan_key ??
    eventObject?.metadata?.plan_key
  );
}
