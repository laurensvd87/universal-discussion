# ADR-092 Portable self hosted backend plan

Date: 2026-10-11.
Status: proposed future architecture; owner requested planning only.

2026-10-11 continuation: [ADR-093](ADR-093-private-portable-backend-rehearsal.md)
records subsequent approval for synthetic repository preparation. The existing
Ubuntu VLAN computer is the next private runtime-rehearsal candidate; Windows
Docker/WSL installation is not selected. Real deployment, migration and the
complete shared-pilot architecture remain unapproved/open.

## Context

The owner wants to avoid major investment before extension acceptance is known,
start on an existing Windows computer, and retain an easy path to professional
hosting and additional clients. Current local account activation under ADR-091
does not authorize Internet hosting or remote transfer of the owner's data.

ADR-003 already proposes a modular monolith, PostgreSQL/pgvector and an outbox.
ADR-016's service-first contracts are a useful seam, but the present CLI, pairing,
singleton SQLite snapshot and one-owner provider runtime are intentionally local.
ADR-049 removes a fixed count ceiling without making that design scalable.

## Proposed direction

Use the existing Node domain/application modules with normalized PostgreSQL
storage, pgvector retrieval, versioned paginated APIs and durable transactional
job/outbox records. Run API and worker roles from one application image; use
Linux containers and Docker Compose for Windows/WSL rehearsal and a later single
Linux host. A hosted TLS gateway fronts the API; database/worker ports remain
private. Keep managed PostgreSQL replaceable and defer additional infrastructure
until measurements justify it.

Preserve the current loopback composition. Introduce a separate unattended
container/hosted entrypoint, not weakened local Host/Origin checks. Synthetic
data, private container networking and host-loopback ingress come first. Windows
home hosting is for development or a separately approved small private pilot,
not the default reliable public service.

Normalize data rather than move the whole snapshot into a PostgreSQL JSON row.
Replace global write conflicts with object versions and transactional context/
ownership checks. Preserve stable IDs, Source-root anchors, reply trees, deleted
ancestors and unclaimed legacy actors. Ridge1 read projections remain distinct
from canonical Topic/write authority; vector indexing is candidate retrieval,
not permission to reinterpret Topic identity or retune closed evaluations.
Provision frozen coefficient/policy artifacts explicitly with version/hash
checks, rather than assuming ignored local service data accompanies an image.

Use the same backend contract for extension/web/mobile clients without promising
the same capture permissions. Keep on-device embedding as the default; remote
URL/title/vector transfer and publication need separate review. Do not expose the
whole catalog or raw vectors through guest discussion endpoints.

App authority and provider grants remain separate. The current Windows DPAPI
records and single-owner ChatGPT runtime are not portable multi-user secrets.
Prefer reauthentication on a new host, reissue app sessions and explicitly
verify identity namespace continuity/linking. Key replacement must preserve
validated account lookup/ownership, not merely invalidate old sessions.
Local AI companion support remains optional; hosted/mobile provider eligibility
and secure adapters are deferred.
Email/code app login keeps the service usable without a ChatGPT grant, but actual
mail delivery stays unactivated.

## Consequences and alternatives

This is less operationally complex than early microservices, Kubernetes or a
separate vector database and avoids a mandatory hosted backend vendor. Containers
help repeatable installation; data/schema/secret migration and tested restoration
still require work. A single host has no high-availability guarantee.

Do not simply expose the current local service, build a second unrelated backend,
raise snapshot limits, or assume automatic scaling from Compose. A managed
database is a later operations choice, not a failure of self-hosting. Multiple
API replicas require shared session/job/receipt authority first.

## Validation and scope

[BACKEND_HOSTING_PLAN](../plans/BACKEND_HOSTING_PLAN.md) defines H0-H6 sequencing,
capacity checks, synthetic migration, deletion/restore rehearsal and approval
boundaries. Required evidence includes Windows/Linux parity, normalized v2/v3
imports, concurrent unrelated writes, replay protection, cross-account denial,
exact/indexed matching comparisons and backup restoration.

This record does not accept ADR-003's production gate, select a vendor/budget,
install containers, activate a listener, change extension permissions, migrate
real records, transfer credentials, enable mail/provider requests, deploy or
publish. Those activation/data/security/cost gates remain separate. Planning
does not repeat completed Phase 0, S1-S3 or the synthetic 6/6 review.
