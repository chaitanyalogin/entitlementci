# API guide

API documentation is served at `/docs` in the local API. Authentication uses `/v1/auth/login`, session cookies and a CSRF cookie/header pair for authenticated mutations. `/v1/auth/me` supplies the active organization and user. SDK ingestion uses `Authorization: Bearer <project_key>` instead of a human session.

Useful routes include `/v1/projects`, `/v1/customers`, `/v1/plans`, `/v1/features`, `/v1/violations`, `/v1/tests/scenarios`, `/v1/tests/runs`, `/v1/api-keys`, `/v1/integrations` and `/v1/audit-logs`. A number of list routes accept projectId filtering; not every resource is project specific. See source route validation for exact request shapes. Swagger is useful for route discovery, but not every response has a complete machine readable contract.

Decision ingestion example:

```json
{"customerId":"external_customer_id","feature":"sso","allowed":false}
```

POST that JSON to `/v1/decisions` with a scoped key. Numeric limit decisions can include `limit`; usage reports post to `/v1/usage`. Accepted ingestion means the record was accepted for background comparison, not that processing already finished or that access was granted.

`/health` and `/ready` provide health checks. `/v1/demo/run` is restricted to the seeded demo organization and requires explicit demo configuration. Do not use demo endpoints in production.
