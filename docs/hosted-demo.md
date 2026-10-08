# Hosted visitor demonstration

Open the Railway application and choose **Try live demo** on the login page. A visitor gets a new organization, owner session lasting one hour, and a TaskFlow Sandbox staging project. No shared password, local demo login, or separate TaskFlow deployment is required. An existing signed-in organization can create its own sandbox from Drift Lab.

Drift Lab provides four sample customers, Pro and Enterprise plans, four features, and generated application decisions. **Break an upgrade**, **Break a downgrade**, and **Break an API limit** submit deliberately incorrect access through the real Node SDK. The normal API stores observations, Redis queues their IDs, and the normal worker creates incidents. Repeating a failure groups evidence; **Fix and verify** submits correct decisions and queues a regression check. The regression worker checks sixteen sample customer/feature pairs against the independent subscription catalog. It fails while sample access is broken and passes after access is corrected. This is an application simulator, not an actual payment or Stripe transaction.

Set `ENABLE_HOSTED_DEMO=true` on the API and worker. Keep `NODE_ENV=production`, existing security secrets and `ENABLE_DEMO=false`. The local-only seed is still forbidden in production. The SDK uses the API container's loopback listener by default; `INTERNAL_API_URL` may override it for development tests. No fifth Railway service is necessary.

## Isolation and controls

All lookups and generated records are bound to the authenticated organization. The project is STAGING; sample feature and plan keys include the project's unique ID, so existing catalog entries are not overwritten. Demo setup is transactional and idempotent, with an advisory lock for concurrent setup. Scenario execution has a bounded Redis lock per organization. SDK secrets are derived with HMAC from the private API-key pepper and stored only as hashes; they never reach the browser. Revoked keys are not automatically reactivated. Owner/admin/developer permissions and CSRF checks protect sample mutations. The interface checks availability before displaying interactive controls, including when hosted mode is disabled.

Visitor creation has a limit of five attempts per minute per connecting IP and one hundred new visitor workspaces per rolling day across the deployment. Visitor sessions expire after one hour. Expiry does not automatically remove their sample organizations; database retention and account cleanup remain operator responsibilities. These limits control demo growth, not commercial capacity. Local deployments behind a shared proxy may share the per-IP limit because the API does not trust arbitrary forwarded IP headers.

## Verification

`tests/integration/hosted-demo.mjs` requires `ENABLE_HOSTED_WRITE_TESTS=true` and an explicit `TEST_API_URL` for live testing. It creates isolated synthetic fixtures and verifies readiness, secure sessions, idempotent setup, CSRF and origin rejection, healthy observations, upgrade/downgrade/limit failures, incident grouping, a failing regression before correction, sixteen passing checks after correction, organization isolation, unchanged existing project data, and logout. It does not record passwords, cookies, or SDK secrets. `tests/e2e/hosted.spec.ts` verifies the public visitor flow in a browser, including refresh and sign out. CI runs these against native PostgreSQL and Redis in addition to the original local application tests.

Use hosted Drift Lab, violation details, resolved incidents, test evidence, and the Railway service overview for portfolio screenshots. Label generated sample scenarios accurately; the API, database, queue, and worker behind them are live services.
