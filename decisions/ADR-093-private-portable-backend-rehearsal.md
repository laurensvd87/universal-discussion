# ADR-093 Private portable backend rehearsal

Date: 2026-10-11.
Status: implemented and reviewed for synthetic repository preparation only;
native container activation and shared deployment remain open.

## Scope

Following ADR-092, the owner approves preparing the Linux container package here
before testing it on the existing Ubuntu computer. This is a private synthetic
rehearsal, not activation of a shared pilot. Docker/WSL are absent on this Windows
machine. No OS installation, new listener, router rule, remote login, migration
of owner data, provider request, email delivery or publication follows.

The intended later host is an existing Ubuntu 26.04 LTS computer on an isolated
VLAN. Its UniFi UDR rules, including previous OpenClaw forwards, remain unaudited.
The owner has no domain. A different Linux login alone does not establish
isolation from existing services, privileged processes or Docker. Neither this
record nor the package establishes that the machine can be safely exposed.

## Portable composition

Add an independent unattended composition inside `apps/local-service/portable`,
sharing the existing strict domain validators rather than weakening the working
local CLI. Normalize relational entities in PostgreSQL with pgvector, use scoped
transactions and discussion versions, and run API and worker roles from the
same image. Migration and synthetic seeding are explicit operator commands.

Only the new composition accepts its versioned portable API. Existing extension
requests, loopback Host/Origin rules, pairing, accounts, Ridge1 projection and
Windows-protected ChatGPT grant are unchanged. No compatibility or cutover is
implied by matching entity names.

Use the exact pgvector cosine query as a synthetic retrieval reference. It is
not Ridge1 Topic identity, trained-model validation, automatic merging or
permission to retain additional real-page vectors. No ANN index is needed for
the first rehearsal. Frozen Ridge1 artifacts and current canonical routing
need their own verified integration before real clients can switch.

## Trust boundaries

- The runtime requires explicit `synthetic-rehearsal` mode. A separate read token
  protects safe guest reads. Deliberately provisioned random fixture tokens map
  to persisted synthetic principals; no built-in credential, public signup,
  client-supplied author or provider identity is accepted.
- Only explicitly public fixture records have read projections. Projections
  whitelist fields and paginate; they omit vectors, credential verifiers,
  private identity, jobs and internal authority material.
- Commands validate Source/Topic/discussion and reply lineage inside the write
  transaction. Original publication Source and author are immutable. Ownership
  controls editing/withdrawal; body revisions disappear on withdrawal while
  tombstone ancestry remains for surviving replies.
- Receipts bind principal, operation and validated payload. Identical replays
  cannot add another contribution or job; key reuse for different input fails.
  Unrelated discussions do not share a global revision conflict.
- Durable bookkeeping jobs have bounded attempts, expiring leases and fencing
  tokens. They never call AI or mail. Leasing cannot establish exactly-once
  delivery to an external service.
- Database passwords and rehearsal tokens come from private secret files,
  never image layers, Git, logs or default values. Invalid configuration fails
  closed. Host and Origin allowlists are exact; forwarded headers confer no
  authority.
- Compose publishes the API on host `127.0.0.1:4185` only. The database has no
  host port. The application runs without root privileges, with dropped
  capabilities and a read-only root filesystem. Database initialization uses
  a separate owner credential; normal API/worker queries use a non-superuser
  role without migration privileges.
- The image uses an explicit source allowlist and pinned base-image digests.
  Existing databases, logs, models, tokens and provider modules are excluded.

## Verification

Run the same migrations and parameterized queries through `pg` in deployment
and PGlite with pgvector in offline tests. PGlite is actual PostgreSQL compiled
to WASM; it allows SQL and transaction checks here without a server listener.
The installed PGlite uses PostgreSQL 18.3, whereas the pinned deployment image
uses PostgreSQL 17; cross-major tests are not runtime parity. It does not
substitute for native PostgreSQL multi-process concurrency,
Docker image builds, Ubuntu permission checks or backup/restore rehearsal.
[PGlite documentation](https://pglite.dev/docs/about),
[transaction client requirements](https://node-postgres.com/features/transactions).

Acceptance checks cover actor spoofing, cross-discussion replies, Source lineage,
withdrawal topology, per-discussion versions, receipt replay/collision, exact
vector metadata and ordering, private-field leakage, pagination, lease fencing,
configuration and Origin failures, and image/Compose boundaries. Independent
H0 Trust review accepts this bounded slice with these conditions. A final code
review passed after correcting strict route aliases, root execution and an
extension-comment restore failure. **35 offline checks** pass, including four
independent adversarial Trust tests and the native-check scenario under an
embedded restricted app role. The unchanged local service regression has
**511 pass/four optional skips**. Actual Linux rehearsal remains required.

## Remaining gates

This implements only parts of H1/H2, not their complete migration/operations
acceptance. Real identity and key continuity, synthetic v2/v3 imports, account
rights/deletion, moderation, current matching-policy parity, client endpoint
integration, deployment monitoring and encrypted independent restore evidence
remain open. No legacy contribution is claimed by a new fixture principal.

The shared pilot for unknown people requires a separately reviewed audience,
real authentication and abuse controls, domain/TLS, data/publication scope,
retention/backups and UDR/host security package. Do not expose this rehearsal by
changing the port binding, adding a tunnel or opening a forwarding rule. Real
mail, hosted provider eligibility, spending and store submission remain separate
owner gates.
