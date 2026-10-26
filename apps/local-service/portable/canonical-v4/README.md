# Canonical v4 PostgreSQL import and runtime core

This namespace remains an offline, synthetic-only cutover primitive. It is separate
from the portable rehearsal's checksummed `migrations/001-foundation.sql` and is
not loaded by the API, worker, startup CLI, container image, or compose file.

`importCanonicalV4` reads one existing `canonical-relational/v2` SQLite file in
a read-only transaction, validates its exact `demo-state/v4` relational mirrors,
and imports only into an empty `canonical_v4` PostgreSQL schema. All data writes,
the import receipt, full reconstruction, raw-payload digest verification, and
count verification occur in one PostgreSQL transaction. Any failure rolls that
transaction back.

Native PostgreSQL requires an administrator to run
`bootstrap/001-admin.sql` (or the exported `bootstrapCanonicalV4`) once. It
installs pgvector if needed and precreates `canonical_v4` for the existing
non-superuser `murmingle_owner`; the owner migration refuses a missing or
foreign-owned schema. This deliberately does not change the existing portable
foundation bootstrap. Imported identifier columns and auxiliary digest queries
use PostgreSQL `COLLATE "C"`, matching SQLite's explicit `BINARY` byte ordering.

The import preserves per-record payload text and ordinals, all memberships,
fixed references, embeddings, revisions, operation receipts, and every ID
reservation—including IDs whose entity has been retired. `double precision[]`
and the preserved text are authoritative for vectors. pgvector values are
optional derived float32 search mirrors and are never used for reconstruction.

The ordered, individually hashed migration ledger includes
`002-runtime-core.sql`, `003-execute-only-command-boundary.sql`, and
`004-ingestion-foundation.sql`, followed by the canonical ingestion/lifecycle
apply boundary in `005-ingestion-apply-and-lifecycle.sql` and the expanded
contribution lifecycle boundary in `006-lifecycle-command-boundary.sql`. The first
keeps the import metadata/digest frozen and creates a separate mutable runtime
watermark, per-record write versions, a PostgreSQL ordinal allocator, and
durable actor/request receipts. The latter revokes all direct canonical table
and sequence DML from `murmingle_app`; that role can invoke only one atomic
`SECURITY DEFINER` append function. Internal prepare/complete functions are
owner-only hooks for rollback and native concurrency tests. The boundary uses
fully qualified objects and a fixed `pg_catalog` search path, validates the
request material/digest, generation, typed mirrors, destination, lineage,
Source link/v4 membership, embedding and operation receipt, then constructs the
stored contribution itself. A protected Source-stamp/postability mirror lets it
construct canonical Source anchors without accepting caller-authored payload
JSON and retains the distinction between read-only legacy URLs and URLs that may
originate a new post.

Migration 004 adds independent eight-job interactive and eight-job crawler bounds,
one durable global matcher lane, FIFO ordering per class, and a persisted
four-interactive maximum streak whenever crawler work is waiting. Admission
stores the exact normalized operation bytes and their SHA-256, stable operation
ID, expected generation/revision, authority witness, state, attempt count and
lease witness. Expired, failed, or revoked jobs erase their URL, request bytes,
authority and lease fields. Exact terminal replays remain terminal; an already
canonical operation receipt replays as complete. A different digest under the
same operation ID fails closed.

The matching boundary scans every non-null `fixed_references.values_double`
row in deterministic Topic-ID order. It accepts only finite normalized 384-
coordinate doubles, the pinned Ridge parameter SHA-256, and the inclusive
`0.8639003810829322` predicate. It never consults the lossy pgvector mirror,
never returns Top-K or a truncated empty result, and fails closed if any stored
active reference has the wrong parameter identity or invalid coordinates.
Migration 005 reruns that exhaustive scan under the durable lane and atomically
applies the result. It creates a fixed-reference singleton only for a complete
no-hit, retains every sorted radius hit as overlapping membership, preserves
manual confirmation, pins Source-anchored roots before a changed representation,
and completes the exact durable receipt. Retained-only contexts create a
singleton with a null reference rather than treating raw E5 coordinates as a
Ridge representation.

Admission freshness is Source-scoped: protected per-Source catalog revisions
reject a stale same-URL operation, while unrelated writes do not. A deletion-only
absence revision conservatively rejects stale admissions after forget/delete/
clear without retaining a forgotten URL. Apply rechecks the admitted Source row
witness and generation but deliberately has no final global-revision CAS.

`exactMatches` accepts coordinates already transformed into the pinned Ridge
space. Queue material deliberately retains the accepted normalized E5 input;
the trusted worker must load the reviewed pinned artifact, transform once, and
then invoke the scan. A vector alone cannot prove which transform produced it,
so HTTP/crawler wiring must never pass raw E5 coordinates to this worker-only
method.

Only `SECURITY DEFINER` functions can enqueue, claim, renew, revoke, apply or
inspect jobs and mutate learned lifecycle state.
`murmingle_app` receives interactive admission only and no queue-table or
sequence access; the optional `murmingle_crawler_submitter` receives crawler
admission only;
`murmingle_ingest_worker`, when pre-created by deployment, receives only claim,
lease-renewal, exact-matcher, apply and terminal-failure execution. App and
crawler roles receive content-minimized status/receipt functions; only the app
role receives correct/forget/delete/clear. Job class is chosen by the separate
interactive/crawler repository entry point and its database role, not by a
field in the ingest object. Full public-context URL eligibility remains owned
by the repository's `readLearnedIngest` call; SQL rechecks the exact canonical
`JSON.stringify` bytes (including key order and binary64 number rendering), digest,
shape, scheme and learned/nonlearned URL collisions but does not duplicate
`inspectPageUrl`. This database boundary is not authentication: a future HTTP
adapter must still derive class and authority from admitted server-side context.
Claim decoding preserves those already-normalized doubles instead of applying a
second floating-point normalization. A partial unique index independently makes
more than one leased matcher impossible, even under owner-side corruption.

The asynchronous runtime repository implements human `create-root` and `reply`
only. A reply may reuse its live root's grandfathered Source origin even after
that nonlearned Source loses its current link, matching the canonical state
contract. Exact requests replay their stored result, while a reused
actor/request ID with different content fails closed. Discussion-local updates
serialize only that discussion. The global revision is incremented in the final
SQL statement as a compatibility watermark and is never a write CAS.

PGlite tests cover migration before/after import, protected Source-stamp
backfill, effective role privileges, JavaScript-equivalent UTF-16 text bounds,
replay, collision, rollback, boundary error mapping, unrelated writes and
same-discussion appends. They also cover ingestion duplicate preflight, all
ordinal allocators, exact material/digest replay, per-class capacity, URL
exclusion, durable 4:1 fairness, lease exhaustion, authority expiry/revocation,
terminal material erasure, direct-role rejection of noncanonical JSON, a
deterministic ECMAScript/PostgreSQL binary64 rendering differential, role
separation, single-lease storage enforcement, and exact threshold/no-hit/corrupt-
reference matching, Source-scoped admission, complete apply/replay, null-reference
singletons, overlapping membership, root pinning, and learned lifecycle commands.
PGlite serializes its embedded client and is not native
lock evidence. The opt-in native check requires a fresh empty disposable
PostgreSQL database with pgvector available:

```powershell
$env:MURMINGLE_CANONICAL_V4_NATIVE_TEST_URL = '<disposable test database URL>'
$env:MURMINGLE_CANONICAL_V4_NATIVE_TEST_ACK = 'disposable-empty-database'
npm.cmd run test:canonical-v4-native
```

It holds discussion A before the final watermark and proves a discussion-B
commit plus a read complete before A is released. It intentionally leaves the
synthetic test schema in that disposable database and never targets owner data.

The earlier 2026-10-13 owner-approved Windows foundation rehearsal passed on
PostgreSQL 17.11 with the repository-pinned pgvector 0.8.2. The fresh synthetic
database applied the then-current first four migrations, completed the held-A/
independent-B/read proof, and survived a
normal service restart. Separate real logins also verified the migration's
application/crawler/worker EXECUTE boundaries and denied direct privilege
bypasses. This is native MVCC and role evidence, not HTTP activation, owner-data
import, sustained-load, recovery or hosted-readiness evidence.

`createCanonicalV4ReadFacade` is an asynchronous storage read facade, not the
current HTTP DTO adapter. Every multi-query result uses one native PostgreSQL
`REPEATABLE READ READ ONLY` transaction (one serialized PGlite transaction in
tests), validates the typed relational mirrors, and excludes vectors and both
operation and command receipts. Catalog cursors bind to `catalogVersion` and
discussion cursors bind to that discussion's `writeVersion`; an unrelated post
therefore does not invalidate either continuation. An empty `catalogContext`
deliberately retains today's independent 100-Topic and 100-Source bootstrap
windows; a Topic-specific context retains the 100-member Source window. Both
report truncation explicitly and are not complete matching scans. Fixed-reference
Sources and their membership closure are still included outside those presentation
windows or the read fails at a fixed capacity bound. HTTP-compatible wrapping,
actors/model projection, and request routing remain cutover-adapter work.

This namespace by itself does not switch a live service, import owner data,
configure deployment/recovery, or prove sustained native load. Migrations 005
and 006 now provide the EXECUTE-only ingestion, learned lifecycle, edit,
withdraw, generated contribution and account-withdrawal boundaries required by
the separately composed adapters. A real cutover must stop or
fence accepted SQLite writes, import that final snapshot, verify it, then
deliberately switch a separately reviewed PostgreSQL repository implementation.

The EXECUTE-only database boundary does not authenticate a person. Before HTTP
wiring or cutover, the server must derive `actorId` exclusively from its
authenticated principal and never forward a caller-supplied actor ID. The local
native PostgreSQL role/lock rehearsal has passed; broader native deadlock,
recovery and load proof for the new apply/lifecycle boundaries remain separate
required gates.

Completed apply records use a Source foreign key with `ON DELETE CASCADE`;
forgetting that Source therefore cannot be blocked
by a queue-result cache. The canonical operation receipt and all originating
references are removed in the same reviewed lifecycle command.

Source ingestion and learned-data lifecycle commands update or remove the
protected stamp and owner-derived `inspectPageUrl` postability flag
atomically with the Source row. Retained-only URL validation must never be used
to set postability. A change to the strict `inspectPageUrl` policy requires an
explicit owner-run migration/rebuild of this protected mirror before activation;
app-role health checks deliberately do not recompute it.
