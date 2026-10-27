# ADR-224: Explicit hierarchy schema profile and atomic owner installation

Date: 2026-10-27

Status: Implemented in `f83aa959`. The actual isolated PostgreSQL upgrade and
rollback rehearsal at `c415664e` passes with the original25 aggregate checks,
two fresh databases, unchanged client/resource limits and normal cleanup.
This proves the installer on fresh synthetic data; live backup/restore,
operator integration and live installation remain unfinished.

## Decision

Production currently registers migrations 1-9. The isolated hierarchy tests apply
10-16 without registering them. Production needs a normal, explicit installation
path rather than treating a raw test fixture as a deployed schema.

Use two closed trusted profiles: `legacy9` (the unchanged default) and
`hierarchy16`. The latter appends the seven fixed migration filenames to the
existing nine. Reject unknown profiles and unknown/mismatched migration rows;
never accept "at least version9" or a caller-supplied path/list. Existing default
manifest/migration/health behavior stays at9. Runtime, ingestion and lifecycle
repository health use the selected profile's exact version/hash manifest.

Trusted `hierarchicalTopics:true` startup selects `hierarchy16` consistently for
the application and worker repositories. The standalone hierarchy worker also
requires this profile. Schema/role/head checks must precede encoder allocation
and queue claims, including when the production worker resource factory is
called directly. Invalid schema means no encoder allocation and no claim.
This configuration is not accepted from application requests.
No account, database-role, HBA, PostgreSQL service or Windows setting changes.

Add one owner-only installation function, with no HTTP route or automatic startup
migration. Load the fixed accepted numeric matcher outside the transaction; no
encoder session is needed to register it. On the supplied owner database, use
one physical READ COMMITTED transaction to migrate/register versions1-16,
register that matcher and activate it with the existing head CAS. Require caller
supplied expected head and policy revisions and an explicit owner policy. The
initial operator policy is depth1 with no overrides; later calls must not silently
reset existing overrides. Verify READ COMMITTED isolation before any mutation.
Set grouping policy through its existing revision CAS. An error rolls back schema registration, matcher activation
and policy together. Reuse the existing migrator by adapting its transaction port
to this same transaction; do not nest transactions or use another pool client.

The installer neither claims crawler jobs nor reclassifies/adopts existing roots.
Background preparation remains paced and preserves canonical IDs. Legacy roots
need their existing retained-anchor eligibility check and explicit adoption;
unadoptable saved discussions remain accessible. Owner cuts change display
grouping, not learned confidence or canonical discussion destinations.

## Verification and operations

Focused tests cover both manifest prefixes, rejection of future/corrupt rows,
profile health, pre-encoder refusal and same-transaction rollback/CAS behavior.
The next maintained native test should retain its original two-database/client
limits: preserve scratchA's existing schema9-plus-raw-SQL assertions. Initialize
scratchB with registered9 only and exercise rollback after a stale policy CAS,
then actual registered9-to16 installation. A fixture-only wrapper around the
existing owner transaction port runs the original owner-side empty/isolation
assertions immediately before the first matcher registration, on the same
transaction after DDL is present. After commit, retain the separate workerB
permission and cross-database rejection assertions and empty canonical counts.
There is no installer callback/test-hook API and no adoption of raw16 objects.
Do not add another database, increase caps, rewrite old assertions or claim real
E5 inference from numeric matcher registration.

Production cutover follows a verified PostgreSQL backup/restore rehearsal,
reviewed operator/seal wiring, actual combined browser/database and load/latency
checks. The new sealed runtime must include the fixed encoder assets at the
paths expected by the loader within existing seal limits. Stop/drain the old
worker and accepted ingestion operations before owner installation; restart the
crawler once with its saved progress and no reset, as already authorized.
Dashboard semantic counts must be distinguished from legacy container counts.
Do not silently restart a schema9 worker against an installed schema16 database;
recover by a reviewed fix or explicit restore/reconciliation.
