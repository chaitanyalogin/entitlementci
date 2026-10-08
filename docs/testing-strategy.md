# Testing

`npm test` runs seven unit/security checks using Vitest. `npm run lint`, `npm run typecheck` and `npm run build` check the complete workspace. `npm audit` checks the installed dependency graph against currently known advisories.

`npm run test:integration` requires a seeded running API, worker, TaskFlow, PostgreSQL and Redis. It creates disposable organizations and keys, triggers actual SDK observations, waits for incident state and invokes HTTP regression checks. It writes `docs/evidence/integration-results.json`. Use a dedicated sandbox because it modifies demo state.

`npm run test:e2e` runs the authored Playwright sign in, upgrade failure, resolution and sign out flow. Install Chromium with `npx playwright install chromium` and start the dashboard at localhost:5173. This suite passed in [GitHub Actions CI run #3](https://github.com/chaitanyalogin/entitlementci/actions/runs/37744827919), including ended-session rejection and signing back in.

The GitHub Actions workflow provisions PostgreSQL 17 and Redis 7, builds and seeds the application, checks dependencies, starts services and runs integration and browser checks. It passed for application commit `13091e4ed01f0c09e340f1b3dcbc60870f34f271` on 8 October 2026. Evidence is retained in the workflow artifact. Future code changes must pass CI before production promotion.

This release's eighteen integration checks passed against native PostgreSQL 17 and Redis 7 in GitHub CI, as well as PGlite PostgreSQL WASM and real Redis during earlier verification. Native PostgreSQL locks, contention, full migration upgrade paths, process interruption recovery, production mail, load, soak and restore tests remain work to complete.
