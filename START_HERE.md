# EntitlementCI: start here

## First try the deployed demo

Open https://entitlementci-review.vercel.app/.

1. Click **Trigger upgrade failure** on Overview.
2. Inspect Customer and Violations. Enterprise access is expected but Pro access is observed.
3. Open Regression and run it. It should fail.
4. Return to Overview and click **Fix application access**.
5. Run Regression again. It should pass.

This public reviewer demo uses browser state. Reloading resets it. The downloaded source contains the full backend and separate application.

## Run the complete application on Windows

Keep your existing `D:\PRODUCTION READY PROJECT FILES\ENTITLEMENTCI` folder as a backup. Extract this package into a new folder and open a terminal inside its `entitlementci` directory, where `package.json` and `docker-compose.yml` are located.

Install Node.js 24 and Docker Desktop if needed. Start Docker Desktop and use Linux containers. Run:

```powershell
node scripts/setup.mjs
docker compose up --build -d
```

The first command creates development configuration with random application secrets. The second builds the services, applies database migrations and seeds a disposable demo. Docker must finish before opening the dashboard. Inspect startup with:

```powershell
docker compose ps
docker compose logs --tail=100 setup api worker taskflow
```

| Application       | Address                    | Local login                   |
| ----------------- | -------------------------- | ----------------------------- |
| EntitlementCI     | http://localhost:5173      | owner@demo.entitlementci.test |
| TaskFlow          | http://localhost:4100      | demo@taskflow.test            |
| API documentation | http://localhost:4000/docs | documentation route           |

The seeded password for both applications is `DemoPassword!123`. The developer account is `developer@demo.entitlementci.test` with the same sandbox password.

Docker startup was configured and reviewed in the build environment, then confirmed working locally by the user on Windows. If it fails, preserve the logs and use the README's native development steps to isolate the failing service. Do not expose these default database credentials or demo accounts to the internet.

## Show the real backend flow

1. Sign in to EntitlementCI and open **Drift Lab**.
2. Trigger **Break an upgrade**.
3. Wait for the worker. Open the SSO incident and inspect expected versus observed values and occurrences.
4. Open **Test Runs** and run **Pro → Enterprise upgrade**. It should fail while TaskFlow still has the bug.
5. Return to Drift Lab and click **Fix and verify**.
6. The corrected SDK observations resolve the incidents. Run the regression again to see it pass.

## Understand the project

Billing supplies the promise. Your application supplies the actual decision. EntitlementCI compares those two facts and records evidence when they disagree. It does not decide whether a customer should be allowed into your application; your application owns that decision.

Learn `packages/shared/src/comparison.ts`, then `packages/node-sdk/src/index.ts`, `apps/api/src/routes/decisions.ts`, `packages/engine/src/index.ts` and the worker. Use `docs/interview-guide.md` to prepare a five minute explanation and honest resume bullets.

## Production status

The code has tenant checks, role checks, cookie sessions, CSRF protection, hashed API keys, webhook signatures, retries, recovery and migrations. The full API, dashboard, database, Redis and worker are now hosted on Railway, with twelve passing live checks. See [the deployment report](docs/cloud-deployment.md) for the live link, login setup and remaining operational limits. The local sandbox and its demo credentials remain separate from the hosted application.
