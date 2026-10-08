# EntitlementCI

A SaaS reliability project that detects the difference between subscription promises and the access an application actually enforces.

**Live reviewer demo:** https://entitlementci-review.vercel.app/

**Live backend and dashboard:** https://api-production-48225.up.railway.app/

The reviewer demo uses sample data in the browser. The separate Railway application runs the real Fastify API, React dashboard, PostgreSQL, Redis and BullMQ worker. Click **Try live demo** for a private visitor sandbox without signup, or create an organization and open **Drift Lab → Create sample workspace**. Hosted sample observations travel through the Node SDK, API, database, queue, and worker; each organization has a separate staging project. The original external TaskFlow application remains available locally. See [hosted sandbox details](docs/hosted-demo.md).

Railway hosting uses metered resources and its trial credits are limited. Deployment and verification evidence is in [the deployment report](docs/cloud-deployment.md).

## Why this project is distinctive

A customer upgrades to Enterprise but the application still denies SSO and advanced reports and enforces a Pro API limit. EntitlementCI records those decisions, compares them with expected access, groups the discrepancies into incidents, and resolves them when fresh observations match. Regression checks exercise the actual TaskFlow HTTP service before and after the correction.

This creates useful interview discussions about event ordering, duplicate delivery, tenant isolation, queue recovery, transaction boundaries and failure modes.

## Start

Read [START_HERE.md](START_HERE.md). Use Node 24 and Docker Desktop with Linux containers.

```sh
node scripts/setup.mjs
docker compose up --build -d
```

Dashboard: http://localhost:5173. API documentation: http://localhost:4000/docs. TaskFlow: http://localhost:4100.

Local owner: `owner@demo.entitlementci.test`. Password: `DemoPassword!123`. These credentials are for the local seeded sandbox only.

## Components

| Directory                  | Responsibility                                                                    |
| -------------------------- | --------------------------------------------------------------------------------- |
| apps/web                   | React dashboard, administration, evidence and drift lab                           |
| apps/api                   | Sessions, RBAC, tenant checks, SDK ingestion and webhook verification             |
| apps/demo-taskflow         | Separate application whose actual access can intentionally drift                  |
| workers/entitlement-worker | Background comparison, webhook normalization, recovery and HTTP regression checks |
| packages/engine            | Transactional state updates and incident lifecycle                                |
| packages/shared            | Pure deterministic comparison and shared contracts                                |
| packages/node-sdk          | Server side decision and usage reporting                                          |
| tests                      | Unit, security, HTTP integration and authored browser checks                      |

## Verification

GitHub Actions [CI run #3](https://github.com/chaitanyalogin/entitlementci/actions/runs/37744827919) passed on 8 October 2026 for application commit `13091e4ed01f0c09e340f1b3dcbc60870f34f271`. It installed from the lockfile, built the workspace, applied both migrations and seeded PostgreSQL 17, then passed type checking, lint, seven unit/security tests, eighteen integration checks with PostgreSQL and Redis, and one Playwright browser test. The browser test covers sign in, actual upgrade failure, incident resolution, sign out, session rejection and signing back in. The dependency audit reported zero known vulnerabilities. The workflow retains verification evidence as an artifact.

Earlier verification used PGlite PostgreSQL WASM and real Redis. The public reviewer demo was verified separately in a browser, and the user confirmed local Docker startup on Windows. Native PostgreSQL contention, live Stripe delivery, load tests and production operations remain unverified. See [the validation report](docs/final-validation-report.md) for limits. This is a tested portfolio application with production engineering foundations. Commercial production readiness requires the remaining deployment and operational validation.

## Development

```sh
npm ci
node scripts/setup.mjs
docker compose up -d postgres redis
npm run db:generate
npm run build:packages
npm run db:deploy
npm run db:seed
npm run dev
```

In development the TaskFlow web frontend uses port 4101 and its API uses 4100. The dashboard proxies `/v1` to the API for same origin cookies and CSRF.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
npm run test:e2e
```

The final two commands require seeded running services; the browser command also requires `npx playwright install chromium`. Integration checks create disposable test organizations and alter demo customers. Run them against a dedicated sandbox.

## Documentation

Start with [architecture](docs/architecture.md), [demo walkthrough](docs/demo.md), [deployment](docs/deployment.md), [SDK guide](docs/sdk-guide.md), [operations](docs/operations/runbook.md) and [interview guide](docs/interview-guide.md). The dated validation report describes what was verified; design decisions describe intent, not proof of readiness.
