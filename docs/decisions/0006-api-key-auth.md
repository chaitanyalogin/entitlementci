# ADR 0006: Project API keys

SDK ingestion is machine-to-machine, so project-scoped high-entropy API keys are simpler than creating dashboard users for customer workloads. Secrets are revealed once and stored as hashes.
