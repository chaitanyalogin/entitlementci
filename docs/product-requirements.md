# Product requirements

## Problem

Commercial entitlement state and application enforcement can diverge after upgrades, downgrades, failed synchronization, caching errors, duplicate webhooks, or stale events.

## Users

Software engineers, backend engineers, platform/DevOps engineers, engineering managers, SaaS architects, technical founders, product managers, customer success, support, security, and operations.

## Functional scope

Organizations, members, projects, project API keys, feature/plan modeling, expected entitlement state, SDK observation ingestion, deterministic comparison, grouped violations, history, Stripe test-mode ingestion, webhook idempotency/order protection, synthetic tests, audit logs, notifications abstraction, and the TaskFlow failure lab.

## Nonfunctional scope

Tenant isolation, RBAC, input validation, rate limits, safe error handling, secret handling, structured logs, request IDs, health/readiness checks, test coverage, Dockerized infrastructure, documented deployment and recovery procedures.

## Out of scope

Becoming a billing provider, feature flag system, authorization replacement, generic observability suite, Kubernetes platform, or AI-dependent entitlement engine.
