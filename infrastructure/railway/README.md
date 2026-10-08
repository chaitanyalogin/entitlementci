# Railway backend deployment

The API serves the built React dashboard and `/v1` on one HTTPS origin. A
separate continuously running BullMQ worker consumes Redis jobs. PostgreSQL
and Redis use private networking and persistent volumes. Only the API gets a
public domain.

The source image is `Dockerfile.railway`, built from the repository root.
Railway no longer accepts Config as Code for new services, so these settings
are applied to each service through Railway's management API or dashboard.

| Setting | API | Worker |
| --- | --- | --- |
| Dockerfile | Dockerfile.railway | Dockerfile.railway |
| Start command | node apps/api/dist/server.js | node workers/entitlement-worker/dist/worker.js |
| Pre-deploy command | npm run db:deploy | none |
| Healthcheck | /ready | /ready |
| Healthcheck timeout | 180 seconds | 180 seconds |
| App sleeping | disabled | disabled |
| Public domain | yes, container port 4000 | none |
| PORT | 4000 | 4200 |

Both services require `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`,
`SESSION_SECRET`, `API_KEY_PEPPER`, `CORS_ORIGIN`, `PUBLIC_WEB_URL`, and
`PUBLIC_API_URL`. Use Railway reference variables for the private database
and Redis URLs. Generate separate random application secrets and reuse the
same values in API and worker. Keep values in Railway, never in GitHub.
Set `SERVE_WEB=true` on the API and `ENABLE_DEMO=false` on both services.
The three public URL/origin variables must use the API's actual HTTPS domain.

Deploy the tested commit, verify migration success and `/ready`, then verify
account creation, SDK ingestion, worker comparison and incident resolution.
The production database starts empty. Create an organization through the
login page; the default local demo credentials do not exist there. The
development seed remains blocked in production. TaskFlow and Drift Lab demo
controls are for the local sandbox, not this production environment.

The Railway trial has limited credits. Monitor usage and keep backups outside
the trial before its expiry. Do not describe trial hosting as permanent free
hosting or as evidence of commercial production readiness.

Documentation: https://docs.railway.com/infrastructure-as-code
