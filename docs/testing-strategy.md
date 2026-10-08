# Testing

`npm test` runs seven unit/security checks using Vitest. `npm run lint`, `npm run typecheck` and `npm run build` check the complete workspace. `npm audit` checks the installed dependency graph against currently known advisories.

`npm run test:integration` requires a seeded running API, worker, TaskFlow, PostgreSQL and Redis. It creates disposable organizations and keys, triggers actual SDK observations, waits for incident state and invokes HTTP regression checks. It writes `docs/evidence/integration-results.json`. Use a dedicated sandbox because it modifies demo state.

`npm run test:e2e` runs the authored Playwright sign in, upgrade failure, resolution and sign out flow. Install Chromium with `npx playwright install chromium` and start the dashboard at localhost:5173. This suite was supplied but not executed in the build environment.

The GitHub Actions workflow provisions PostgreSQL 17 and Redis 7, builds and seeds the application, checks dependencies, starts services and runs integration and browser checks. It has not run on a remote repository yet. CI must pass before production promotion.

This release's eighteen integration checks passed against PGlite PostgreSQL WASM and real Redis. Native PostgreSQL locks, contention, full migration upgrade paths, process interruption recovery, production mail, load, soak and restore tests remain work to complete.
