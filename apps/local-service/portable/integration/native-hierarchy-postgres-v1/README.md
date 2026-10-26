# Isolated native PostgreSQL hierarchy fixture

This source-only fixture prepares the canonical hierarchy SQL checks for a fresh
native PostgreSQL17.11 cluster. It replaces the test engine, not the matching
algorithm, canonical SQL or live application. No import starts a process, opens a
socket or registers a fixture database. Actual execution still needs a reviewed
supervisor, complete authenticated inputs and a separate execution decision.

The three closed PGlite wrapper attempts remain immutable. The last two stopped
at strict historical Job-memory guards before any SQL assertion completed. Their
results do not establish an allocation cause or production memory requirement.
This fixture does not raise those old limits or reuse their output.

## Fixed database boundary

The new lifecycle derives from the immutable successful ADR175 implementation.
Its only server address is `127.0.0.1:55433`; the live port55432, live credentials,
DPAPI, live HBA and application/crawler services are outside this fixture.
New cluster directories use `nhpg1-` under
`apps/local-service/portable/data/native-hierarchy-postgres-v1` on D, with marker
`native-hierarchy-postgres/v1`. Generated directories remain after verified stop.
No old directory is adopted, reset, deleted or restarted.

Four independent RAM-only SCRAM credentials, private server ownership, finite
startup and eight lifetime work-client acquisitions retain the old lifecycle
contract. Physical memory1GiB, C2GiB and D4GiB are the minimum preflight reserves.
Caller-available commit must also remain at least1GiB; the new supervisor reads
that counter directly rather than inferring it from physical free RAM. Its source
specifies an aggregate1GiB Job and32 active processes, with exact readback before
the one suspended Node process resumes. Source acceptance does not authorize
actual Job execution.

The proof uses one admin session and two sequential work sessions. The fixed
scratch names are `murmingle_hierarchy_fixture_20261026_a` and
`murmingle_hierarchy_fixture_20261026_b`. Both must initially be absent. Each work
session must match the private cluster identity, database OID, role, address,
port, version and postmaster start before schema creation. The vector extension
must report version0.8.2. Work connections physically close before exact OID and
zero-session checks permit a plain `DROP DATABASE`. There is no FORCE, session
termination, prefix deletion or alternate endpoint fallback.

## Sessions and assertions

`session.js` binds every transaction to one original physical client. BEGIN,
callback statements and literal COMMIT or ROLLBACK cannot switch connections.
Nested transactions, outside dispatch during a transaction, concurrent queries,
expired transaction capabilities and unawaited work fail closed. Even falsy
primary errors survive rollback or close failures; cleanup uncertainty poisons
the session. A server ROLLBACK tag is not a successful COMMIT.

`context.js` privately installs factory authority only inside its fixed no-options
proof, after the first pure check. Standalone factory imports or caller-provided
database objects cannot create a native repository fixture. The exported
controller is an invented-dependency test seam and cannot install that private
authority. Concurrent finish calls share one original cleanup promise.

The copied canonical fixture uses the unchanged migrations001–009 and ADR220
schema/boundary files. All25 original assertion titles and bodies are preserved:
three outer checks, twenty canonical children and conflict/STOP children. The
native adapter explicitly uses dialect `pg`; no engine-wide numeric parser
override or assertion normalization has been added. `suite.js` requires the
complete ordered inventory with no skips and propagates failures. Fulfilled
test registration alone is never considered evidence of successful assertions.

The initial native proof will establish serialized canonical SQL behavior only.
Actual multi-session concurrency, restricted-role permissions, real issuance,
matching quality, owner controls and live activation remain separate work.

## Verification checkpoint

The first twelve-file checkpoint passed72 guarded pure reports. With the new
supervisor, inventory and actual-entry source, Root's complete source test run
passed92 Python reports in309ms and76 guarded64MiB Node reports in138.3427ms,
with no failures or skips. Process, client, SQL and timer answers are invented;
filesystem tests use only their own temporary files and read-only source or
installation metadata. No test executes PostgreSQL, PGlite, SQL, a model or a
browser. Review receipts are under `apps/local-service/data/` with prefix
`native-hierarchy-postgres-v1-`.

The supervisor retains one original epoch before even its first authenticated
module read. Active360s, normal380s and absolute390s bounds include setup; nested
lifecycle leases are not renewed. Complete process census, descendant-aware
retirement, two physical pipe EOFs, original exit and post-handle empty-Job proof
are required. JSON success needs all25 exact case names and verified database
cleanup; the parent independently checks the finite child projection. A complete
catalog includes all1777 installed PostgreSQL bin/lib/share files, rather than
only the historical nine binary pins. These are sampled integrity and resource
checks, not a filesystem quota, DLL loader trace or capability sandbox.

Next: finalize the full local JavaScript/package/native installation catalog,
independently review final bytes
and recheck host reserves before a separately decided execution. Never run the
historical ADR175 entrypoint or an unreviewed new entrypoint to bypass these gates.
