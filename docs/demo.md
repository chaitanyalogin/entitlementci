# Demonstration

## Reviewer demo

Open https://entitlementci-review.vercel.app/. Trigger an upgrade failure, inspect the three mismatches, run a failing regression, correct application access and run a passing regression. Browser sample state resets on reload. The comparator is the same pure function used in the backend. The hosted regression checks browser state; it does not exercise an HTTP service.

## Complete local demo

Use the START_HERE instructions and the seeded owner account. Drift Lab actions update expected plans and call TaskFlow's authenticated demo service. TaskFlow reports actual decisions through the Node SDK. The API persists them and BullMQ sends their IDs to the worker. Incident evidence appears after asynchronous processing.

Available controlled cases are healthy access, failed upgrade propagation, failed downgrade propagation and an incorrect API limit. Fix and verify restores all affected customers. These controls are restricted to the seeded demo organization and require `ENABLE_DEMO=true`.

Test Runs executes the predefined scenarios through TaskFlow HTTP requests. Duplicate and older webhook scenarios sign fixtures and send them through the actual webhook endpoint. These are protocol tests with synthetic events, not verified communication with a live Stripe account.

TaskFlow is a small purpose built access demonstration. Its failure switch is global demo state; it is not a complete production SaaS product.
