# ADR222 Separate native PostgreSQL startup identities

Date: 2026-10-26. Status: source design accepted; no actual execution authority.

The first isolated native fixture stopped during bootstrap with
`OWNED_SERVER_START`; it completed no canonical SQL assertions. Root and
independent saved-evidence audits accepted all 2,338 end-pins. Parent Job
retirement was verified normal, but the child did not verify PostgreSQL smart
stop. Those are separate observations. All consumed v1 inputs and outputs remain
immutable.

PostgreSQL 17.11 writes `MyStartTime` into the PID file and assigns `PgStartTime`
later; SQL `pg_postmaster_start_time()` returns the latter. Their difference is
not guaranteed to stay within one second. The failed run did not retain its SQL
value or numeric difference, so this source finding is not a reconstructed actual
delay. Primary sources: [postmaster startup](https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/backend/postmaster/postmaster.c),
[PID file](https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/backend/utils/init/miscinit.c)
and [SQL timestamp](https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/backend/utils/adt/timestamp.c).

## Decision

Use fresh `native-hierarchy-postgres-v2` and
`hierarchy-native-postgres-fixture-v2` namespaces. Mechanically copy the v1
source, then make one causal correction: keep `pidStart` and `sqlStart` separate.
Do not enlarge a tolerance or alter the canonical assertions.

After the original bootstrap operation settles, obtain independent ownership
from the original spawned PID, fixed fresh path, private marker, port and PID-file
start. Do this before interpreting the returned SQL row, without adding retries
or requiring a PID file synchronously immediately after spawn. Repeated exact
`pidStart` and original ownership authorize cleanup only. SQL start never
authorizes shutdown. Unsettled work, unknown acquisition and failed ownership
still forbid normal smart stop.

SQL bootstrap must still prove the exact data directory, listen address, port,
version and finite positive SQL startup timestamp using fresh private credentials.
Keep an explicit completed SQL-proof latch: the earlier cleanup ownership object
must not enable connector handoff. Subsequent connectors compare the SQL timestamp
exactly with that bootstrap `sqlStart`, within its own domain. Context retains
its existing same-domain identity checks.

Record only finite primitive startup observations in bounded local lifecycle
evidence. A failed bootstrap remains failed even when verified cleanup succeeds.
Add invented delayed-start, changed SQL incarnation, malformed SQL cleanup and
changed PID-file/path/marker regressions. These are source tests, not measured
native behavior or semantic quality.

## Unchanged boundaries and next gates

All 25 canonical assertion bodies, SQL inputs, resource floors, original epochs,
process/memory/disk/IO limits, physical settlement and cleanup conditions remain.
No old entrypoint, output adoption, live database, HBA, credential configuration,
service or crawler change is authorized. Keep the same fixed isolated port55433
and scratch names in a fresh cluster under the new D parent, prefix `nhpg2-`.
Schema namespace identifiers move consistently to v2.

Full independent source/inverse review, authenticated catalog/final pins and fresh
resources precede a separate ONE actual decision. A failure is not retried
automatically. Canonical SQL completion, genuine concurrency/restricted-role
checks, semantic quality and product integration remain unfinished.
