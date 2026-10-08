# Operations

Check `/health` for API liveness and `/ready` for database and Redis readiness. Worker health is on port 4200 inside its network; Compose does not publish that port. Watch structured worker completion/failure logs and API request logs.

For a local failure, run `docker compose ps` and `docker compose logs --tail=100 setup api worker taskflow`. If setup failed, inspect its migration or seed error before restarting dependent services. Rebuild after source changes. Avoid printing secret environment variables in tickets or logs.

Unprocessed observations and RECEIVED webhooks older than ten seconds are re-enqueued in batches of up to 100 every five seconds. Reprocessing is protected at the database transaction boundary. Queue persistence and recovery must still be exercised under real Redis outages and native PostgreSQL contention. Failed jobs and FAILED webhook records need investigation and controlled replay by an operator; no replay UI exists.

Run `npm run maintenance:retention` from the root with configuration loaded to remove processed observations, completed webhook records and expired sessions according to configured retention windows. Run it only after confirming your retention requirements and backups. Audit retention is not implemented by this script. Configure scheduling on your host if wanted; no schedule is installed automatically.

Use persistent database volumes for a sandbox and managed encrypted backups in production. Test restore into a separate database. Do not use `docker compose down -v` when you want to keep data; it removes the sandbox volumes.

Rotate API keys by issuing a replacement, updating its consumer and revoking the old key. Rotating SESSION_SECRET can invalidate encrypted integration configurations, so coordinate reconfiguration. Pepper rotation requires a planned key reissue strategy.
