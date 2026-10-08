# Live backend deployment

Verified on 8 October 2026.

Application: https://api-production-48225.up.railway.app/

Application commit: `1769ba01cf45f654d6a29a41f803a648b2799769`.

GitHub [CI run #6](https://github.com/chaitanyalogin/entitlementci/actions/runs/37797601642) passed build, migrations, type checks, lint, ten unit/security tests, the dependency audit, eighteen original integration checks, twelve hosted sandbox checks and both Playwright browser flows. Railway built and started the actual Node Docker images for that commit. Both database migrations applied successfully.

| Component                       | Deployment                             | Verification                                                                                                      |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| React dashboard and Fastify API | Public HTTPS origin, Node 24 container | Login page rendered in browser; dashboard and deep links return HTML; `/ready` returns database and Redis success |
| BullMQ worker                   | Separate continuous Node container     | Healthy replica; actual observations produced and resolved incidents                                              |
| PostgreSQL 18                   | Private service with persistent volume | Both migrations applied; live account, catalog, incident and session data verified                                |
| Redis 8.2                       | Private service with persistent volume | Queue processing verified through the live worker                                                                 |

Neither PostgreSQL nor Redis has a public TCP proxy. Only the dashboard/API has a public domain. `NODE_ENV=production` enables Secure cookies, and application secrets are generated independently of the local sandbox. The API serves the dashboard itself so cookies and CSRF stay on one origin.

The services are pinned to the tested application commit. A later GitHub push does not automatically replace them. Deploy a new tested commit explicitly through Railway before changing the live version.

## Live verification

[`evidence/cloud-smoke.json`](evidence/cloud-smoke.json) records twelve passing checks against the deployed service: readiness, dashboard/deep links, registration with Secure/HttpOnly cookies, sign in, catalog and scoped key creation, actual worker mismatch detection, incident grouping, automatic resolution after correction, tenant isolation, CSRF rejection of catalog and demo mutations, key revocation, and server session invalidation.

The test created two isolated synthetic organizations. Their passwords were discarded, their SDK key revoked and their sessions ended. They contain no real customer data. This test uses actual HTTP routes, the deployed database and the deployed worker; it does not use browser sample state.

[`evidence/hosted-demo-cloud.json`](evidence/hosted-demo-cloud.json) records twelve hosted sandbox checks against the live Railway API. Upgrade, downgrade and numeric limit scenarios produced real incidents; repeated observations grouped, broken sample state failed regression, corrected state passed all sixteen checks, and visitor workspaces remained isolated. Creating a sandbox in an existing organization left its original project and entitlement values unchanged.

The live browser walkthrough also verified **Try live demo**, three upgrade incidents, a failed regression, **Fix and verify**, three resolved incidents, sixteen passing regression steps, and sign out.

![Live Railway sandbox after correction](evidence/cloud-demo-resolved.jpg)

## First use

Open the application and click **Try live demo** for a private sample workspace without a password. If already signed in, open **Drift Lab** and click **Create sample workspace**. Trigger a sample failure, inspect incident evidence, run regression to see it fail, then select **Fix and verify** to resolve incidents and pass regression. Visitor sessions expire after one hour.

To connect your own application, click **Create an organization**. Choose your email, organization name and a password with at least twelve characters. Local demo credentials do not exist in the hosted database. Create features, plans, a project and customers, then use a scoped API key to send observed access through the Node SDK.

Hosted Drift Lab runs within the existing Railway API and worker with `ENABLE_HOSTED_DEMO=true`. These sample application decisions travel through the real Node SDK, API, PostgreSQL database, Redis queue and worker. The separate local TaskFlow application and local demo seed remain disabled in production; `ENABLE_DEMO=false`. See [hosted-demo.md](hosted-demo.md) for isolation, visitor limits and testing details.

## Limits

Railway's trial offers limited credits rather than permanent free hosting. Monitor usage and arrange durable backups before relying on this instance beyond the trial. No paid upgrade was performed by this deployment.

This is a working portfolio backend deployment, not a claim that commercial operational readiness is complete. Load/soak tests, dedicated concurrency and queue outage recovery tests, live Stripe delivery, backup restore and rollback exercises remain pending. Production email delivery is not implemented. The worker's notification state update is not proof of email delivery.
