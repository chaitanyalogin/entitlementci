# Contributing

1. Keep tenant boundaries explicit in every service method.
2. Add validation schemas for every externally supplied request body, query, and path parameter.
3. Keep entitlement comparison deterministic and side effect free.
4. Add unit tests for domain behavior and integration tests for persistence/queue behavior.
5. Do not commit secrets, generated credentials, or `node_modules`.
6. Record architectural changes as ADRs where they materially affect data isolation, reliability, or compatibility.
