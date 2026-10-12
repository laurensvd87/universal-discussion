# Private portable backend rehearsal

This is the first container-ready PostgreSQL foundation for the existing
discussion backend. It stores synthetic Sources, 384-dimensional vectors,
canonical Topics, discussions, contributions and revisions in relational tables.
API and worker use one image and one database. The working Windows service and
extension remain unchanged.

**This package is not the shared pilot yet.** It has deliberately provisioned
synthetic users, not real signup/ChatGPT authentication. There is no real-page
ingestion, Ridge1 integration, email, provider request or extension connection.
Do not open its port to the LAN/Internet or use it with owner data. Approval is
for preparing code; running it on Ubuntu and changing UDR/network rules require
their own reviewed steps. See [ADR-093](../../../decisions/ADR-093-private-portable-backend-rehearsal.md).

## What is implemented

- PostgreSQL/pgvector migrations with checksums, foreign keys and immutable
  contribution author, publication Source and reply ancestry.
- Safe paginated read projections; no vectors, identity verifiers or job data
  in API responses. Exact cosine retrieval is a correctness reference, not
  Ridge1 same-Topic grouping.
- Human root/reply/edit/withdraw commands with server-derived fixture authority,
  per-discussion versions and transactional replay receipts. A reply may come
  from another Source in the same canonical discussion without changing its
  root's origin. Withdrawal erases body revisions and keeps only necessary
  tombstone topology.
- Transactional bookkeeping jobs with expiring leases and stale-worker fencing.
  They perform no matching, email or AI operation.
- Explicit API, worker, migration, seed and native-verification commands, strict
  private configuration, content-free logs and minimal health checks.
- Pinned Linux image digests, separate database roles, file secrets, private
  database networking and host-loopback-only API publishing.
- Exclusive-file synthetic dumps and restoration into a separate fresh volume.
  These local dumps are unencrypted and do not constitute an independent backup.

There is no hard global Source/Topic count limit here. Requests and pages are
bounded; this is not measured capacity or a thousands-of-pages-per-second claim.
Full H1/H2 acceptance still needs native concurrency, Windows/Linux parity,
legacy imports/identity continuity and actual restore evidence.

## Offline tests on this Windows computer

Node 24+ is required. From this directory:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
```

The test harness denies DNS, network requests, listeners and subprocesses.
PGlite executes actual PostgreSQL/pgvector in memory using the same migration
and repository SQL (currently PostgreSQL 18.3 in WASM; the pinned deployment
image uses PostgreSQL 17). This is not same-major runtime parity. It does not
emulate native multi-process PostgreSQL locks,
Docker networking, Linux secret mounts or `pg_dump`/`pg_restore`.
[PGlite](https://pglite.dev/docs/about).

## Later private Ubuntu rehearsal

These commands are for the separately approved private Linux test, **not an
instruction to expose the home server now**. First inspect the host, existing
OpenClaw services and UDR forwards. Use a non-root operator, maintained Docker
Engine/Compose and Node 24+. Membership in the Docker group is privileged host
access; a new login is not isolation from other privileged workloads.

Clone the checked commit without copying Windows `data/`, logs, credentials,
databases or model artifacts. In `apps/local-service/portable`:

```bash
node ops/init-secrets.js
cp .env.example .env
id -u
id -g
```

Set `UDL_RUNTIME_UID` and `UDL_RUNTIME_GID` in `.env` to those nonzero operator
IDs, then:

```bash
node ops/preflight.js
docker compose config --quiet
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed-fixture
docker compose --profile tools run --rm verify
docker compose up -d api worker
docker compose ps
```

Generate secrets once. Exclusive creation refuses replacement; never silently
rotate passwords against an existing database volume. Seeding is deliberate,
atomic and **fresh-database-only**. Repeating it fails without replacing data.
An image update does not recreate a volume or rerun database initialization.
Do not edit an already-applied migration; add a new version.

Run `verify` before API/worker and without another operator verification running.
It uses the restricted app role and two fixture identities to test simultaneous
unrelated-discussion writes, same-key replay, cross-account denial, two worker
leases and exact vector retrieval. It adds four synthetic contributions per
run; this is intentional test data, not a cleanup or owner-data operation.
Its embedded rehearsal is tested here; its **native execution is still open**.

Compose file-backed secrets retain host ownership. The application UID/GID must
match the operator; secret files require owner-only access. Database startup
copies only its three secrets into a postgres-owned private tmpfs before the
upstream entrypoint drops privileges. Windows ACL/mount behavior has not been
verified and is not substituted for the Linux checks.
[Compose secret behavior](https://docs.docker.com/compose/how-tos/use-secrets/).

The API is reachable only at `http://127.0.0.1:4185` on the test host; PostgreSQL
has no host port. Only the exact Host and fixture Origin are accepted. There
is no TLS gateway, public deployment override, tunnel or router setup.
Health checks return only status and require no bearer. Data reads need the
private read bearer or a provisioned fixture bearer; writes require a fixture
bearer and `Origin: https://client.example`.

The [OpenAPI contract](contracts/openapi.yaml) describes `/portable/v1` reads and
commands. The current extension uses another composition and **cannot connect
to this rehearsal**. Do not substitute its pairing token for rehearsal tokens.
Secrets, `.env`, backups and logs are Git-ignored; do not paste them into chat.

## Dormant automated-backup orchestration

`ops/backup-scheduler.js` prepares the scheduler core for future hosted backups.
Import/construction are inert; only an explicit `start()` arms a timer. A single
instance awaits backup, independent verification and retention in order, never
overlaps work, skips missed slots and exposes fixed content-free status fields.
Failed creation/verification never invokes retention; successful retention is
given a protected verified recovery handle. `stop()` waits for real completion.

This is **not activated automated backup**. No entrypoint/Compose/Windows-service
wiring, filesystem work, encryption, off-host copy, provider request or restore
is added. Do not connect the unencrypted synthetic `ops/backup.js` dump to it.
Future adapters must supply complete consistent encrypted publication, independent
durability/recovery verification, protected-point retention and safe failure
cleanup. The scheduler cannot enforce these guarantees on an arbitrary callback.

Status/history are RAM-only and serialization is process-local. Restart discovery
of the last valid backup and durable multi-process fencing remain required.
Monitoring must poll `getStatus()` to detect a stalled hook; `onStatus` alone does
not provide periodic alerts. A hung hook keeps work/shutdown pending rather than
claiming timeout cancellation and starting an overlapping backup. Adapter deadlines
must await actual termination; no listener/session is owned by this module.
The complete hosted storage/key/retention/alert/restore activation package remains
a separate gate in [BACKEND_HOSTING_PLAN](../../../plans/BACKEND_HOSTING_PLAN.md).
Restricted portable checks pass 52/52, including six independent adversarial
scheduler tests. Native dump/restore evidence is still required separately.

## Backup and restore drill

On the approved synthetic host, while `db` is running:

```bash
node ops/backup.js rehearsal-1.dump
docker compose --profile restore up -d restore-db
node ops/restore.js rehearsal-1.dump
```

The backup uses a consistent custom-format logical dump. It refuses to overwrite
an existing filename. A failed dump can leave a reserved incomplete file; do
not restore it. The restore script hard-codes `restore-db` and
`udl_synthetic_restore`, refuses a target containing application tables and uses
one transaction. It never drops the active database or resets volumes. Partial
failure preserves the pre-existing fresh target; inspect it before retrying.

The database administrator preinstalls pgvector. Restore runs as `udl_owner`
with `--no-owner --no-comments`, preserving records and grants without trying
to alter the administrator-owned extension comment. This omits **SQL object
comments**, not discussion messages.
[PostgreSQL restore options](https://www.postgresql.org/docs/17/app-pgrestore.html).

Before calling restoration successful, compare original/restored IDs, counts,
ownership, Source/reply trees, withdrawals/revisions, vectors and migration
checksum, then test app-role reads and writes against the separate target.
Neither the current API nor worker is redirected by the restore script. Actual
dump/restore and content comparison remain unverified until this drill runs.
Independent encrypted storage, backup expiry and erasure replay are still open.

## Stop and update

```bash
docker compose --profile restore stop
docker compose down
```

`down` retains named volumes. **Do not add `-v` or delete volumes** as a normal
restart/update. For an update, stop writes, back up, build the reviewed commit,
run explicit migrations and verification, then start API/worker again. Restoring
an older dump after new writes is data loss, not safe rollback.

Logs contain bounded code, request ID and time only. No body, URL, token or raw
database exception is logged by the application. The old owner-local raw-debug
approval does not apply to this composition.

## Before a shared pilot

Complete real account/session and moderation/rights operations; synthetic bearer
users are not deployment authentication. Integrate current matching and clients,
rehearse approved imports and identity continuity, then review TLS/domain, UDR
and host isolation, audience/data scope, retention/restore and operating budget.
Unknown users, email delivery, hosted ChatGPT grants and store submission require
separate explicit approvals. Container portability does not grant any of them.
