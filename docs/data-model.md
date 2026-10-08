# Data model

The Prisma schema models users, sessions, organizations, memberships, projects, API keys, customers, plans, features, plan entitlements, customer subscriptions, expected entitlements, observed decisions, violations and occurrences, synthetic scenarios/runs/results, billing integrations, webhook events, audit logs, and notifications.

Indexes follow access paths for tenant, project, customer, status, timestamp, and event identity. Unique constraints enforce one customer subscription per customer, one entitlement per customer/feature, one plan entitlement per plan/feature, and one provider event per provider/event ID.
