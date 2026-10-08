# ADR 0009: Synthetic test model

Scenarios are stored as JSON step definitions and executed by a worker. This keeps test definitions inspectable and enables deterministic historical runs without turning the engine into an opaque scripting system.
