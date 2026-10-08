# ADR 0004: Organization scoped tenancy

A single database is appropriate for the early SaaS. Tenant isolation is enforced by organization-aware repository queries and backend authorization, with integration tests focused on cross-tenant access failures.
