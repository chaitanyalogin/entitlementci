# Multi tenancy

Organizations own memberships, catalog entries, integrations and projects. Projects own customers, SDK key scopes, observations, violations and test runs. Human requests resolve membership and role. An x-organization-id header can select another organization only when the user is a member. The current dashboard does not provide an organization switcher.

SDK keys bind a single project and its environment. Creation, revocation and data operations verify scope. Cross tenant reads and writes return 404 rather than disclose resource existence. Representative tenant checks passed in the integration suite. Shared PostgreSQL tables are isolated by application code; row level security and exhaustive authorization review remain additional hardening options.
