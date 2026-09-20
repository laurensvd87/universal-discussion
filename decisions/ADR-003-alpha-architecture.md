# ADR-003: Alpha architecture as a modular monolith

Status: Proposed

Date: 2026-09-19

Owners: Lead/orchestrator, platform/client, semantic/evaluation, trust/security, quality/operations

## Context

The product needs relational identity, provenance, moderation, discussions, and auditable topic links, plus vector retrieval and asynchronous processing. Early scale and team size do not justify distributed-service overhead. The repository deliberately has no final language, cloud, auth, or database choice.

## Decision

For private alpha, use a modular monolith behind a versioned HTTP API, with PostgreSQL as system of record and pgvector as the first vector-index candidate. Keep domain, API, persistence, background jobs, semantic adapters, and client contracts as explicit modules. Use an outbox/job table before introducing a separate message broker.

This ADR does not choose an application language. Shared browser/API contracts and one primary runtime may favor TypeScript; semantic-library maturity and offline benchmarking may favor Python. The local integration slice must compare build/test ergonomics, type/schema sharing, semantic dependencies, operations, and team maintainability before a separate language ADR. Provider adapters must not leak vendor types into the domain.

This ADR does not select a host, managed platform, auth provider, ORM, web framework, embedding provider, or deployment topology.

`research/ALPHA_COST_MODEL.md` supplies an initial bottom-up paper comparison for managed and self-hosted shapes. Its provisional sizes are not load evidence and do not satisfy the P1.9 architecture gate.

## Alternatives considered

- Managed backend suite: fastest auth/database setup; risks policy coupling and opaque authorization defaults.
- Small self-hosted service and Postgres: portable and cheap; increases operations/security burden.
- Serverless functions with managed Postgres: useful for bursty traffic; complicates local parity, connections, jobs, and observability.
- Microservices plus dedicated vector store: rejected until measurements show an independent scaling or isolation need.
- TypeScript-first versus split TypeScript/Python runtimes: deferred to measured local slices; sharing types is useful, but not enough evidence to accept operational/runtime complexity either way.

## Consequences

- Transactions can preserve contribution/provenance and topic/discussion invariants.
- PostgreSQL exact vector search provides a measurable baseline before ANN tuning.
- Client contracts can be shared without making the backend extension-specific.
- A modular monolith still requires strict authorization boundaries and migration/backup discipline.

## Security/privacy/cost impact

One primary data store reduces data copies and early operational cost. It also concentrates sensitive data, so least-privilege database roles, encryption, backup/restore, retention/deletion, and audit design are mandatory. No infrastructure purchase follows from this proposal.

## Validation / Phase 2 gate

Acceptance selects a reversible alpha direction, not a vendor or production deployment. Before Phase 2 commits product code or infrastructure to this direction, produce:

- a thin end-to-end local slice with authorization tests;
- a measured exact-search/pgvector benchmark on the labeled set;
- managed versus self-hosted cost/security/operations comparison;
- backup/restore and deletion test plan; and
- trust/security review of auth and data flows.

Revisit if the semantic runtime, store-policy constraints, or measured workload invalidates these boundaries. Provider adapters and standard PostgreSQL migrations are the portability path.
