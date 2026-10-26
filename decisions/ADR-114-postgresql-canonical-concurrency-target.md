# ADR-114: PostgreSQL canonical concurrency target

Date: 2026-10-13
Status: Accepted and active locally; canonical owner data, API, crawler worker and dashboard use loopback PostgreSQL, while explicitly auxiliary account/private/frontier/history stores remain separate SQLite

## Active dashboard-history follow-up

The PostgreSQL dashboard owns a read-only 60-second aggregate sampler. It reads
one coherent PostgreSQL counts snapshot and writes only the separate auxiliary
v2 growth-history SQLite file; it has no canonical write role. This restores the
existing time-series behavior without reopening the frozen canonical SQLite
database or coupling crawler ingestion to dashboard availability. The ordinary
dashboard watcher continues to export the current PostgreSQL snapshot between
samples.

## Decision

The owner requires the crawler to continue while many people read and write, and
requires a database with no licence fee. PostgreSQL is the selected canonical
database target. It is released under the permissive PostgreSQL License and has
no database licence fee, including commercial use. The matching extension may
continue to use pgvector, which uses the same licence. MySQL Community is also
available without a licence fee under GPLv2, but it is not selected: PostgreSQL
already matches the repository's prepared portable backend, transaction tests,
pgvector work and hosting plan.

This decision selects software and an architecture. It does not select or buy a
production host, expose a public listener, transfer owner data, activate
mail/provider work or authorize a public launch. A later explicit owner approval
installed the loopback-only local rehearsal recorded below. Hardware, managed hosting,
backup storage, a domain and operations may still cost money even though the
database software itself does not.

The later owner direction is to spend no further implementation effort on an
SQLite/WAL concurrency bridge. The unactivated queue, stale-revision, dashboard
lock-tolerance and WAL changes prepared during diagnosis were removed. The
currently running checked service remains unchanged only until a PostgreSQL
replacement has passed lossless import, recovery, authority and concurrency
proofs; this is operational continuity, not a competing database direction.

## Why WAL alone is not the final design

SQLite WAL lets readers retain a consistent snapshot while one writer commits.
That is a useful bridge for the current local application, but SQLite still has
one physical writer. More importantly, the current API treats one global catalog
revision as the precondition for nearly every write. Two unrelated people can
therefore conflict at the application layer even when their rows do not overlap.

PostgreSQL supplies MVCC snapshots, row-level locks and multiple concurrent
transactions. Those features help only if Murmingle also changes its concurrency
contract:

- the global generation/revision becomes an ordered change watermark, not the
  compare-and-swap key for every independent object;
- discussions, contributions, Sources and matching/lifecycle scopes receive
  their own versions or immutable dependency witnesses;
- append-only roots and replies validate their Source, destination and ancestry
  inside the transaction, then serialize only on their discussion where needed;
- edits and withdrawals compare the selected contribution version so two writes
  to the same target cannot silently overwrite each other;
- page ingestion uses durable actor/operation receipts and a Source-scoped lock,
  atomically maintains the protected Source stamp and strict `inspectPageUrl`-
  derived postability flag, and never derives postability from retained-only URL
  compatibility; fixed-reference matching/lifecycle mutations retain their
  stricter complete-search and deletion barriers; and
- crawler work is a bounded background job class. Interactive page matching has
  reserved admission and bounded priority, without starving crawler jobs.

Reads use normal PostgreSQL snapshots and bounded pagination. A reader does not
block an ordinary writer, and a writer does not block ordinary reads. Writes to
independent rows can proceed concurrently; writes to the same Source,
contribution or discussion still serialize deliberately. No database makes
conflicting writes to the same invariant safely simultaneous.

## Existing foundation and incompatibilities

`apps/local-service/portable` already contains useful PostgreSQL foundations:
the `pg` pool/transaction wrapper, checksummed migrations, private roles and
networking, per-discussion `FOR UPDATE`, actor-scoped command receipts,
`FOR UPDATE SKIP LOCKED` worker leases, PGlite tests and pinned PostgreSQL 17 plus
pgvector packaging.

That rehearsal is not a drop-in canonical repository. Its original synthetic
schema assigns one Topic directly to each Source and exposes a separate
`/portable/v1` fixture API. It does not contain v4 overlapping memberships,
fixed pinned-Ridge references, canonical generation/revision and ID registry,
current ingestion receipts, complete contribution/agent/anchor payloads, real
account authority, current `/v1` compatibility or encrypted automated recovery.
Moving the SQLite aggregate into one PostgreSQL JSON row would retain the global
hotspot and is explicitly rejected.

The first implementation slice therefore uses a separate checksummed
canonical-v4 migration namespace rather than changing the already applied
synthetic foundation. Exact text payloads and stable ordinals remain
authoritative so a reconstructed state can be compared to the current logical
digest. Typed columns, foreign keys, membership/reference tables and optional
pgvector mirrors support indexed access. pgvector's float32 value is never the
sole copy of an authoritative JavaScript-double embedding or Ridge reference.

## Staged implementation and cutover

1. Build and test the separate PostgreSQL canonical-v4 schema, an empty-target
   importer and a complete reconstructor using synthetic normalized-v2 SQLite
   snapshots. Require exact schema/generation/revision, IDs, ordinals, payloads,
   memberships, references, receipts, reply topology, revisions, counts and
   logical digest. Faults or collisions roll back the whole import.
2. Convert the current synchronous repository/application boundary to an async
   PostgreSQL adapter. Preserve every current `/v1` projection and authority
   check before changing a client endpoint. Add per-scope versions and durable
   receipts; prove unrelated writes, same-discussion appends, same-target edit
   conflicts and ambiguous-response replay on native PostgreSQL.
3. Move ingestion arbitration to database-backed durable jobs and receipts so
   multiple API/worker processes share one authority source. Preserve exhaustive
   fixed-reference matching, no-hit singleton rules, deletion fences and bounded
   interactive/background fairness. Every Source ingestion/lifecycle transaction
   must update or remove its protected stamp and strict `inspectPageUrl`-derived
   postability flag atomically with the Source row; the retained-only validator
   must never authorize a new post origin. A strict URL-policy change requires
   an owner-run mirror migration/rebuild before activation; app health must not
   silently reinterpret stored authority. Do not claim that pgvector approximation is
   exact matching without recall plus exact-rerank evidence.
4. Add PostgreSQL dashboard/growth readers, current accounts/private lifecycle,
   deletion/export, monitoring and an encrypted automated backup with an actual
   restore drill. A manual unencrypted synthetic dump is not sufficient.
5. Rehearse a synthetic stopped-writer cutover. For the owner cutover, drain all
   writes, create and verify a fresh approved recovery point, import once, compare
   the complete logical state, then switch clients. Keep SQLite read-only. Never
   run two independent canonical writers or automatically fall back to an older
   SQLite image after PostgreSQL accepts a write.
6. Add stateless API replicas, read replicas or more workers only after shared
   sessions, rate limits, receipts, leases, observability, restore evidence and
   measured load show they are needed. Start with one PostgreSQL primary, one API
   and bounded workers; Kubernetes, Kafka and a separate vector database are not
   prerequisites.

The current crawler/service and owner stores remain untouched during offline
preparation. A later deployment decision must identify the Linux host or managed
service, region, budget, ingress/TLS, backup destination, retention and operator
responsibility. PostgreSQL removes the SQLite single-writer ceiling; it does not
by itself establish hosted, unlimited or million-page readiness.

## 2026-10-13 owner cutover and live concurrency checkpoint

The owner explicitly authorized downtime, local installation, exact owner-data
conversion and restarting the service, crawler and dashboard on PostgreSQL.
Those activation gates are now complete. The stopped-writer canonical import was
exact at revision 3513 in the existing generation, with a verified encrypted
seven-day PostgreSQL backup expiring 2026-10-20T13:33:33.964Z. The old SQLite
canonical image is frozen and is not a fallback. Accounts, private chats, crawler
frontier and dashboard growth remain separate auxiliary SQLite stores because
they are independent domains, not because canonical traffic still uses SQLite.

The live ingestion contract found one non-idempotent floating-point boundary:
normalizing an already near-unit 384-coordinate vector changes some binary64
coordinates and therefore the exact request digest. The corrected contract has
the caller snapshot and validate the original representation, has admission
canonicalize that snapshot once, and has claim/apply validate those durable
canonical bytes without renormalizing. Crawler and interactive ingestion share
this rule. A full queue regression covers the adapters, admission, claim, apply,
receipt and exact stored coordinates. The single pre-fix cancelled job had no
Source, receipt or revision effect; a one-time fail-closed owner transaction
removed only that terminal artifact so its stable operation ID could be admitted
under the corrected digest.

At the first post-recovery checkpoint, all 25 preserved crawler stages had
committed, moving revision 3532 to 3557; the queue contained 44 complete crawler
jobs only and the crawler remained running into later work. A simultaneous read
wave returned 100/100 HTTP 200 responses while
writes advanced, and the dashboard watcher refreshed from PostgreSQL. This is
the intended MVCC outcome: ordinary readers do not acquire the former SQLite
file-writer lock, while conflicting invariant work still serializes deliberately.

The interactive projection and append-acknowledgement rules discovered under
continued crawler load are governed by ADR-115; they do not weaken this ADR's
PostgreSQL transaction, authority or recovery boundaries.

This activation does not revise the staged scaling limits above. Fixed-reference
matching apply remains one bounded global lane; a compatibility global revision
is still an ordered watermark; catalog paging can be batch-optimized; one local
primary/API/worker is not a multi-host deployment. No hosted, public, unlimited,
million-page or thousands-of-writes-per-second claim follows.

## 2026-10-13 offline implementation checkpoint

The isolated canonical-v4 namespace now has four checksummed migrations: a
lossless empty-target importer, scoped runtime/version primitives, an
EXECUTE-only root/reply command boundary, and a durable bounded ingestion
admission/lease/fairness plus exact fixed-reference matcher foundation. The
application, crawler-submitter and ingestion-worker roles have separate narrow
functions and no direct canonical DML. Canonical ingestion apply deliberately
remains unavailable.

Full portable offline tests pass 83/83 and the combined canonical-v4 suites pass
31/31. Migration 004 SHA-256 is
`728CE42C013BE5DD8DF41CB259E08900E1C9B4213AECBACDA9B378DC5B38932F`.
The request-byte boundary includes a permanent PostgreSQL/ECMAScript binary64
serialization differential and exact-C URL comparisons.

The next apply design must capture a Source-scoped admission witness rather than
use the global revision as its final compare-and-swap fence, re-run exhaustive
matching while holding the catalog lane, and make correct/forget/delete/clear
use the same lifecycle lane. It must also define current-receipt replacement and
terminal-job retention, preserve the strict JavaScript postability-policy
witness, and atomically wipe material on completion or failure. The compatibility
global revision remains a briefly locked final watermark and therefore a
measurable write-contention ceiling; no thousands-of-writes claim follows before
native PostgreSQL load evidence or a replacement ordered-version contract.

## 2026-10-13 native Windows rehearsal checkpoint

With explicit owner approval, PostgreSQL 17.11 was installed locally as Windows
service `postgresql-x64-17-murmingle` under its restricted `postgres` service
identity. It listens only on `127.0.0.1:55432`, uses SCRAM-SHA-256, has no inbound
firewall rule, and disables SSL explicitly because this rehearsal is loopback
only. Random credentials are stored only as current-user DPAPI-protected local
artifacts outside the repository. The plaintext installer option file and the
installer log were removed.

The repository-pinned official pgvector 0.8.2 tag was built with the x64 MSVC
toolchain after verifying commit
`cab9da72c04353f143bb06b42ab70a403daac64a`. The installed `vector.dll` SHA-256
is `459A1ABCABD69C8092C3A7DE998A18E2714B6676A7BA4F3BDD111FC610A440A0`.
Only fresh synthetic database `murmingle_v4_native_test` was provisioned. Its
non-superuser owner, application, crawler-submitter and ingestion-worker logins
are separately credentialed and restricted by exact loopback HBA rules.

The guarded native runner applied all four migrations and proved that a normal
read and an independent discussion write finish while a write to another
discussion holds its row lock. A separate real-login audit proved the application
can execute its append/interactive boundaries but not direct canonical DML or
the worker claim; crawler and worker can read the migration health ledger and
execute only their own functions, not canonical tables. Migration 004 retains
hash `728CE42C013BE5DD8DF41CB259E08900E1C9B4213AECBACDA9B378DC5B38932F`.
A service restart preserved pgvector 0.8.2, all migrations and the synthetic
runtime state while retaining the loopback-only listener.

This closes the initial native role/MVCC lock rehearsal, not the broader
deadlock, recovery, backup/restore, sustained-load or hosted-readiness gates.
HTTP/startup/crawler/dashboard/account/private wiring and canonical ingestion
apply remain absent. No owner SQLite data was read or imported and the checked
service and active crawler were not interrupted.
