# Recovery

Back up PostgreSQL and keep a tested restore procedure. Redis AOF persistence is enabled in the local compose sandbox. Durable observation and webhook inbox records reduce reliance on queue contents, but failed jobs, failed webhooks and synthetic test enqueue loss need operator handling.

Restore into an isolated environment, validate migrations and tenant counts, rotate exposed credentials if necessary, and compare inbox state before resuming workers. Restore drills and production RPO/RTO measurements were not performed for this release. Do not claim recovery targets until they have been measured.
