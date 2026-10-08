# ADR 0005: Connector interface

Billing-provider specific code is isolated behind a normalized integration boundary so Stripe is not embedded into entitlement logic and future Paddle/Razorpay adapters can be added without changing the comparison model.
