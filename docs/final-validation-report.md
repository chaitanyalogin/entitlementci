# Release validation: 8 October 2026

## Passed

| Check                       | Result                             | Evidence                                                                                       |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Workspace production builds | Passed                             | API, worker, dashboard, SDK, engine, TaskFlow and shared packages compile                      |
| Type checking               | Passed                             | All configured workspace TypeScript checks                                                     |
| ESLint                      | Passed                             | Source lint checks, generated output excluded                                                  |
| Unit and security tests     | 7 passed                           | Pure comparisons, roles, password hashing and webhook signatures                               |
| Integration flow            | 18 passed                          | `docs/evidence/integration-results.json`                                                       |
| Shipped SQL migrations      | Passed on PostgreSQL 17 and PGlite | Both shipped migrations applied in CI                                                          |
| Dependency audit            | Zero known vulnerabilities         | npm lockfile audit on release date                                                             |
| Public browser demo         | Passed                             | Failure creates 3 mismatches, regression fails, correction produces matches, regression passes |

Integration verification used a PGlite PostgreSQL WASM socket server, real Redis, the real Fastify API, Prisma, the SDK, TaskFlow and BullMQ worker. It verified tenant read/write denial, RBAC, CSRF, key scope and revocation, actual incident creation/grouping/resolution, signed duplicate and older webhooks, signature rejection and readiness.

## Remote CI verification

[GitHub Actions CI run #3](https://github.com/chaitanyalogin/entitlementci/actions/runs/37744827919) passed on 8 October 2026 for application commit `13091e4ed01f0c09e340f1b3dcbc60870f34f271`. The Ubuntu runner provisioned PostgreSQL 17 and Redis 7, installed the lockfile, built every workspace, applied both migrations, seeded the database and passed type checking, lint, seven unit/security tests, the dependency audit, eighteen HTTP integration checks and one Playwright browser test.

The browser test verified sign in, a real upgrade failure, incident resolution, sign out, rejection of the ended session and signing back in after reload. Its first executions exposed an integration polling race and a stale session cache in the UI; both were corrected before this successful run. The workflow retains logs, integration results and the browser report in the `verification-evidence` artifact. `docs/evidence/ci-results.json` identifies this run. The existing PGlite evidence remains a separate earlier verification.

## User reported Windows validation

After delivery, the user confirmed Docker startup and the local demonstration worked on Windows. Screenshots show the dashboard running at localhost:5173 and resolved incident evidence. The user also confirmed the requested regression exercise worked. These manual results are separate from the automated evidence and do not establish native PostgreSQL concurrency behavior.

## Not executed in the build environment

Automated application Docker image builds and Compose startup, dedicated native PostgreSQL contention tests, live Stripe delivery, production email, load and soak tests, managed backup restore and production rollback were not executed here. No performance, uptime or external provider integration claims should be made from this report.

## Current limitations

The public deployment is a reviewer frontend with browser sample state. The full backend must be run locally or deployed to configured infrastructure. API list endpoints are suitable for a small sandbox but need pagination and tighter resource limits for large organizations. The interface has project filtering but no organization switcher. Alerts are dashboard records; production outbound notification delivery is absent. Production email request routes reject the console development transport. Equal timestamp provider events are ignored, so a stronger ordering strategy is still needed. SDK retries are disabled by default because ingestion does not have a client event idempotency contract.

The worker recovers persisted unqueued observations and RECEIVED webhook records. Jobs that exhaust retries and records marked FAILED require operator intervention; there is no dashboard dead letter replay tool. Synthetic test enqueue recovery is not part of that inbox loop. The database uses application tenant checks without row level security.

## Classification

A verified portfolio application with production engineering foundations. Commercial production readiness requires the remaining deployment, security, resilience and operational gates. GitHub CI passed for the application commit linked above. The application container configuration was confirmed locally by the user; dedicated resilience and production operations tests remain necessary.
