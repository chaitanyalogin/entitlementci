# Portfolio and interview guide

## Thirty second explanation

EntitlementCI detects subscription drift in SaaS applications. Billing can say a customer has Enterprise while the application still applies Pro access. A Node SDK records the real feature decisions. A background worker compares them with subscription expectations and creates incident evidence. Correct observations resolve incidents, and HTTP regression checks verify the application before and after the fix.

## Five minute demonstration

Show the public demo, trigger an upgrade failure, point out SSO, reports and API limit mismatches, show the failed regression, correct access and show a passing regression. Explain that the public version uses browser sample state. For a technical interviewer, run the full local stack to show the API, worker, durable records and actual TaskFlow calls.

## Resume wording

Use these only after you can run and explain the corresponding code:

* Built a SaaS entitlement drift verification application with React, TypeScript, Fastify, PostgreSQL, Prisma, Redis and BullMQ, comparing expected subscription access with observed server side decisions.
* Implemented scoped API keys, tenant and role checks, signed webhook verification, duplicate event handling and transactional incident grouping and resolution.
* Validated eighteen API, SDK and worker integration scenarios, including upgrade failures, correction, key revocation and older webhook handling; deployed an interactive reviewer demo on Vercel.

Do not claim enterprise customers, measured revenue savings, production uptime, load capacity or live Stripe validation without evidence. The project can strengthen a portfolio but cannot guarantee shortlisting.

## Questions to prepare

Why separate expected and observed state? Because a correct subscription does not prove correct application enforcement.

Why use Redis? For background delivery and retries, while PostgreSQL retains durable facts and processing markers.

Why use transactions and customer locks? To group repeated incidents and serialize subscription changes for the same customer. Native concurrency testing is still a release gate.

How are duplicate webhooks handled? Provider event identity and payload hash prevent repeat processing and detect conflicting payloads. SDK ingestion does not yet share this idempotency contract.

What happens if Redis fails after a database write? The persisted unprocessed record can be discovered by the worker's recovery loop. Retry exhaustion requires operator intervention.

What would you improve next? Native concurrency tests, provider timestamp tie handling, ingestion idempotency, pagination, mail delivery, recovery token redemption, dead letter replay, operational metrics, measured SLOs and restore drills.
