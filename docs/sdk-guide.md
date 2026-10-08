# Node SDK

The SDK reports actual server side access decisions. Keep API keys out of browser code. In this workspace, `@entitlementci/node` is a local package; it has not been published to npm.

```ts
import { EntitlementCI } from "@entitlementci/node";
const client = new EntitlementCI({
  apiKey: process.env.ENTITLEMENTCI_API_KEY!,
  baseUrl: process.env.ENTITLEMENTCI_API_URL!,
  timeoutMs: 1500,
  failureMode: "observe_only",
  retries: 0,
});
const result = await client.recordDecision({
  customerId: "customer_external_id",
  feature: "sso",
  allowed: actualSsoDecision,
});
if (!result.accepted) {
  // Record local telemetry so observation loss can be investigated.
}
```

Create a project scoped key in API Keys. It is shown once and stored server side as a hash with a pepper. Revocation stops further ingestion. Create the plan catalog and expected customer subscription before evaluating its observations.

`recordUsage` accepts `used` and an optional enforced `limit`. `identifyCustomer` associates an external identifier with this key's project. Metadata must avoid passwords, access tokens and sensitive personal data. The backend redacts common secret names, which is not a universal data loss prevention system.

The default observe_only mode returns `accepted:false,degraded:true` on failure. fail_open behaves the same for telemetry. fail_closed throws and lets the calling application decide its response. None of these options automatically grants or denies product access. TaskFlow uses fail_closed for its controlled observations so failed ingestion is visible during demonstrations.

Retries are opt in and can duplicate ingested observations after ambiguous failures. A requestId is a correlation field, not an idempotency key. Webhook deduplication and worker reprocessing protection do not imply exactly once SDK ingestion.
