# ADR 0002: Redis and BullMQ

Webhook processing, comparisons, notifications, and synthetic tests can be slow or retried. Redis/BullMQ provides a small operational queue without introducing distributed-service complexity.
