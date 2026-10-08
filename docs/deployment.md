# Deployment and release

## Actual deployment

The public reviewer demo at https://entitlementci-review.vercel.app/ contains static React assets and browser sample state.

The full API, dashboard, worker, PostgreSQL 18 and Redis 8.2 were deployed separately on Railway on 8 October 2026. The dashboard and API share https://api-production-48225.up.railway.app/. Both migrations applied successfully and all four services reported healthy. Twelve checks passed against the actual live backend, including incident creation, grouping, resolution, tenant isolation, CSRF, revocation and sign out. [Deployment evidence](cloud-deployment.md) records the tested application commit and limitations.

## Local containers

The full backend's Railway deployment settings are in
[`infrastructure/railway/README.md`](../infrastructure/railway/README.md).
Its dedicated Node image serves the dashboard with the API, supports host
assigned ports and includes a separate worker healthcheck.

Run `node scripts/setup.mjs` then `docker compose up --build -d`. The root Dockerfile defines build, runtime and web stages. Compose starts PostgreSQL 17, Redis 7 with AOF persistence, a one shot migration and seed service, API, worker, TaskFlow and nginx. Ports bind to loopback. This is a development sandbox with default database credentials and development cookie settings.

The setup service must finish successfully before the API and demo start. It creates an SDK key in a shared Docker volume. The worker and API reuse the same built runtime image. This configuration was statically reviewed in the build environment and later confirmed working locally by the user on Windows.

## Full public production deployment

Provision a container or VM host for the long running API and worker, managed PostgreSQL and Redis, and a TLS ingress. Serve the dashboard and proxy `/v1` to the API under one origin. A Vercel static frontend can also be used with an appropriately configured secure same origin API proxy. Do not deploy the long running BullMQ worker as an ordinary request function.

Use environment managed secrets, database credentials with least privilege, encrypted Redis access, controlled ingress and backups. Set `NODE_ENV=production`, a specific CORS origin, public URLs and new secrets. Disable demo controls and do not run the demo seed in a production database. Do not expose TaskFlow's intentionally broken access controls publicly as a real product.

Run `npm ci`, `npm run db:generate`, `npm run build`, checks and `npm run db:deploy` in a controlled release. `prisma migrate dev` belongs in development. Production startup is `node apps/api/dist/server.js` and `node workers/entitlement-worker/dist/worker.js`, with environment variables injected by the host. The static build is `apps/web/dist`.

## Release gates

CI against native PostgreSQL and the Playwright flow passed in [run #3](https://github.com/chaitanyalogin/entitlementci/actions/runs/37744827919). Migration upgrade paths, queue outage recovery, parallel customer updates and load tests remain release gates. Implement real email delivery and address token redemption concurrency before relying on recovery workflows. Exercise a backup restore, alert delivery and rollback. Define latency and availability targets from measured results; no throughput or availability claims were measured for this release.

Retain the previous image and use backward compatible migrations. Application rollback does not automatically undo schema changes.
