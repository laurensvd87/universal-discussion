# ADR174 Owned PostgreSQL address proof

Date: 2026-10-20. Status: root and independent Trust accepted for source-only
implementation with the finite-evidence and actual-connector tests below.

## Correct the server address projection

ADR173's one actual diagnostic is closed and immutable. Its fresh owned
PostgreSQL17.11 server initialized and smart-stopped normally; every owned client
and process settled without emergency termination. The first maintenance
connection did not complete handoff, all46 SQL cases remain unexecuted, and the
native proof correctly retained acquisition uncertainty. The precise failed
comparison was not recorded.

There is a definite source defect in its identity query: an explicit inet-to-text
cast includes the network mask, while the guard compares a plain IPv4 address.
PostgreSQL17 documents that distinction and provides host(inet) to omit the mask.
Use `pg_catalog.host(pg_catalog.inet_server_addr()) AS address` in a new successor.
Retain exact `127.0.0.1`, port55433, role, database, server version, postmaster
start and isolation checks. Do not broaden accepted address formats. This fixes
the documented defect; it does not retroactively identify the sole actual cause.
See [PostgreSQL17 network functions](https://www.postgresql.org/docs/17/functions-net.html).

## Immutable predecessor and narrow successor

Create new `canonical-v4/experimental/hierarchy-scoped-native-v2/` check.js,
test.js and README, and new `integration/scoped-native-isolated-v2/` cluster.js,
cluster.test.js, supervise.py, supervise.test.py and README. Root owns a new fixed
`apps/local-service/data/adr174-scoped-native-check-20261020.mjs`, this decision
and later metadata/evidence. Derive mechanically from173; never edit or invoke
its old main/guardian, restart its stopped cluster or reuse its output.

Versions owns only the new cluster pair; Matcher only the new guardian pair.
Root owns the other new files. Reuse the unchanged pure run-control module and
its source-only tests as libraries, not the closed predecessor's native runner.
Keep canonical001–009, ADR165 buffers, SQL cases, privileges, concurrency
schedules, exact scratch name, eight-client/SQL/resource bounds and cleanup
unchanged. All new paths, source/freeze/output markers and root-result namespaces
identify174, with fresh `adr174-` directories in a separate fixed D-drive parent.
Port55433 may be used only after exclusive availability proof; no fallback or
connection to active55432. No live HBA, DPAPI or crawler change.

Retain one bounded identity-refusal projection in the new lifecycle report:
only a fixed stage and boolean matches for database, role, address, port, version,
start and isolation. Never raw addresses, IDs, credentials, SQL or server errors.
It must not grant authority, permit retry or turn a failed check into success.
Compute it from the actual one identity-query result and preserve the first
refusal through connector close/error wrapping. A failed query is a distinct
finite unavailable stage, not invented false comparison bits. No second query.

## Validation before another native attempt

Run the actual new connector with SQL-derived invented addresses. In one fresh,
memory-only PGlite instance, execute the literal inet cast and host expressions;
assert `127.0.0.1/32` versus `127.0.0.1`, then feed those exact results to the
guarded connector tests. Verify the old query projection refuses and the corrected
one passes, independently toggling every other predicate without relaxing it.
Verify that cleanup failure cannot erase the first finite refusal. Await disposal of that instance;
no persisted database, network, production data or native server is involved.

Mechanically compare every successor runtime to173 after only declared namespace,
library-import and exact address-query/finite-observation changes. Preserve all
earlier tests and add exact observation-schema/privacy/failure tests. Root and
Trust must read the new source and consequential deltas and accept the complete
source/package/binary inventory before one prospective metadata preparation.
Both actual frozen audits precede a separate root decision for ONE native run.
No automatic retry or native action follows from this proposal.

This remains database integration work. Real E5 hierarchy quality, producer
authority, owner controls, discussion-preserving transition and full UI/latency
acceptance are still required for the original goal.
