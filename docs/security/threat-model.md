# Security model

The API uses hashed passwords, cookie sessions, CSRF checks for authenticated mutations, role requirements and organization/project scope checks. SDK secrets are shown once, hashed with a pepper and scoped to an environment. Stripe signatures use the raw body and a timestamp tolerance. Common secrets are redacted from request logs and ingested metadata. Integration secrets are encrypted using the application secret.

Threats addressed include cross tenant object access, lower role administrative writes, forged webhook signatures, duplicate provider delivery, older provider updates and use of revoked SDK keys. Seven unit/security checks and eighteen integration checks cover representative behavior; this is not a penetration test or certification.

The application does not use database row level security. Shared schema isolation depends on application checks. List queries need pagination, ingestion budgets need tighter per tenant controls, and auth recovery token redemption should be hardened for concurrent use. Production console email is rejected rather than exposing tokens in logs. A real email provider and recovery flow verification remain required.

TaskFlow is an intentionally controlled demo with a global bug setting and a seeded test account. Do not treat it as production tenant authorization. The hosted reviewer exposes only fictional sample data and contains no SDK or billing secrets.

Before public backend deployment, use TLS, managed secrets, least privilege database access, private Redis, new credentials, disabled demo controls, tested backups, browser security headers and focused security review. Inspect source and measured behavior before making any compliance claim.
