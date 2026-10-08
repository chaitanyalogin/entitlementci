# Stripe adapter

Create an organization integration with its webhook signing secret and project binding. Configure Stripe to send supported subscription lifecycle events to `/v1/webhooks/stripe/:projectId`. Set subscription metadata `entitlementci_plan_key` to a plan key defined in that organization. Map external customers to the same identifiers observed by the SDK.

The API checks the integration's project, verifies the exact raw body signature and persists the event. The worker derives expected entitlements from the local plan catalog. Duplicate identifiers with matching payloads are acknowledged and older or equal provider timestamps do not replace newer state.

The seeded integration is labelled `local-signed-fixture`. Regression tests send signed synthetic events through the real API. No live Stripe account, checkout, external subscription fetch, product synchronization or provider outage recovery was validated. This adapter does not implement payment collection or a complete billing integration. Equal second events need a stronger ordering policy before relying on all provider event sequences.
