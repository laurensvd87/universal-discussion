# ADR 099 Online encrypted canonical backup and approved cutover

Date: 2026-10-12

Status: Owner-approved local recovery/one-time conversion. Implemented, independently
reviewed, Windows-rehearsed and activated on the approved canonical database.

## Approval

The owner accepts the proposed encrypted seven-day local canonical backup and
lossless conversion/restart, adding that the backup solution must not cut off the
connection. This changes ADR-098's pending owner-data gate only for that exact
scope. Routine backup/expiry work must not stop/restart the service, clear pairing,
invalidate accounts, reset credentials or dispatch a provider request. The single
code/schema cutover has its separately approved brief restart.

Target: `apps/local-service/data/demo.sqlite`; recovery location:
`apps/local-service/data/canonical-migration-backups/` (Git-ignored). Account and
private SQLite files, protected account/refresh keys, pairing and provider
registration are not backup or migration targets. No remote/off-device copies,
recurring snapshot schedule, hosting or release are authorized by this decision.

## Snapshot and protection

Use a dedicated Worker and a read-only SQLite transaction. Establish the snapshot
with a metadata read, preflight `page_count * page_size` against a 256 MiB backup
memory budget, serialize the image, then immediately commit/close the source read
handle. Validation, Windows key protection and encryption happen only after that
lock is released. The listener/event loop and app sessions remain intact. DELETE
mode readers can briefly delay writers; this is not zero write latency. WAL
snapshot tests show complete earlier revisions while later writes commit.

Node `serialize`/`deserialize` require 24.16+, with explicit capability checks
before destination writes and no insecure fallback. The stored image stays exact;
an independent RAM verification copy uses SQLite's documented WAL header bytes
18/19 workaround. It never changes source journal settings or creates a plaintext
SQLite staging file. Full domain/schema/index/receipt/FK checks and an in-memory
restore validate the image. Normalized memory snapshots cannot target files or
write data through the adapter.
[Pinned Node documentation](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html),
[SQLite serialization](https://www.sqlite.org/c3ref/serialize.html),
[WAL image recovery](https://www.sqlite.org/c3ref/deserialize.html).

Each snapshot receives a random 32-byte AES-256-GCM key and 12-byte nonce. GCM
authenticates schema/algorithm/key wrapper, timestamps/expiry, canonical version,
counts, image/logical digests and length; a 16-byte tag protects ciphertext. The
key is wrapped by Windows DPAPI CurrentUser, not reused from app/OAuth keys.
Key input crosses a constant hidden PowerShell helper through stdin, not arguments
or environment. Helper streams are bounded and errors fixed; copied plaintext
buffers are cleared where possible. Images/keys stay in the Worker/RAM and never
enter Worker messages, Git, logs or HTTP responses. Published metadata contains
only fixed fields, counts, opaque version/digest and recovery filename.

The backup directory is created with protected ACLs for the current Windows user
and System; existing directories must already pass strict owner/ACL checks and
are never silently rewritten. Paths/ancestors/SQLite sidecars reject redirects,
including dangling links. Recheck the destination after asynchronous key wrapping
before synchronous exclusive write/fsync/atomic no-overwrite publication. Read
back and decrypt/restore-check the published file before reporting success.
Abrupt partials contain ciphertext only. The logged-in Windows user/admin remains
within the threat boundary; DPAPI recovery depends on that Windows profile.

## Availability and retention

`npm run backup:canonical` explicitly creates a recovery point while the service
is running. Verification and expiry are separate manual actions. Normal service
startup and hourly maintenance prune expired recognized files; they create no
snapshots and own no listener. Failures are sanitized and never disconnect the
service. Worker execution is bounded to at most 60 seconds; concurrent expiry
passes deduplicate. No automatic periodic snapshot creation is activated.

Authenticated expiry is exactly seven days. Recognized final/partial names encode
a strict UTC creation time that also bounds expiry for corrupt/interrupted
ciphertext, so corrupt headers cannot extend retention forever. Foreign names,
invalid dates and redirected paths are not followed/deleted. Known failed
publication cleans only its own exclusively created artifacts. Restore verification
rejects expired files immediately. Physical purge occurs at startup/next hourly
pass and cannot run while the PC/service is off. Logical deletion and RAM clearing
do not promise forensic erasure of SQLite free pages, OS caches or old disk blocks.
A physical SQLite image can contain historical canonical bytes in free pages.

This is a canonical recovery point, not a complete app backup: accounts/private
chats/credentials are intentionally excluded. No automatic restore is implemented.
Restoring an older point could resurrect subsequently deleted data or discard
later accepted writes; any actual recovery must be deliberate, offline, verified
and scoped to the owner's then-current instructions. Cross-platform/off-device
disaster recovery and a future larger-than-memory snapshot method remain open.

## One-time cutover

Create/verify the approved recovery point online, identify the exact project process
and quiesce serving only for the code/schema update. The operator conversion CLI
claims the existing fixed loopback port to exclude another serving process. It
accepts only the fixed canonical target and verified backup basename, never an
HTTP admin command or caller-chosen database path.

Compare the current legacy schema/version/counts and full logical digest with
the verified point. Inside `BEGIN IMMEDIATE`, the normalized adapter compares
the **complete expected legacy state again before DDL**, catching writer/payload
races. A mismatch aborts unchanged; a stale online backup is not a rollback point
for later writes. Import/reverse comparison/DROP are atomic, with no legacy shadow.
After commit, compare every canonical record to the pre-conversion state. No
automatic rollback, data reset, inferred ownership or v3 downgrade follows.

The approved owner v3 conversion passes exact state/ID/generation/revision/vector/
lineage comparison. Restarting the normal service restores saved pairing and
protected ChatGPT sign-in; app sessions may need deliberate sign-in after that
one-time restart. New scoped/page/search reads return 200. Later ordinary browser
writes can advance revision normally; migration does not freeze the live database.

## Verification

Restricted tests cover legacy/normalized images, WAL consistency, tampering,
wrong keys, expiry, partial/corrupt cleanup, absent secure capabilities, malformed
schemas, memory limits, no-overwrite publication, Worker errors/timeouts, ACL
idempotence, redirects, transaction races and exact recovery-version checks.
Independent Trust reproduces writer races and Windows junction/dangling-sidecar
rejection. Actual Windows DPAPI/ACL/encrypted backup/RAM restore/expiry rehearsal
passes with 48 health probes of the running service and zero failures. The real
approved backup likewise leaves the listener online; the separately approved
conversion/restart then succeeds. No live inference or owner page text is used
for QA. Final test/scan counts are in `plans/STATUS.md`.
