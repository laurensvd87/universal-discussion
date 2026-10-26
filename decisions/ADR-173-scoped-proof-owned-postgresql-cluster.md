# ADR173 Scoped proof in an owned PostgreSQL cluster

Date: 2026-10-20. Status: root and independent Trust accepted for source-only
implementation. Native execution remains a separate gate.

## Separate the SQL test from live authentication

Run ADR167's synthetic native SQL/concurrency proof in one freshly initialized,
owned PostgreSQL17 cluster. Keep the active cluster, HBA, credentials, roles,
database and crawler untouched. This replaces the proposed active-cluster HBA
window, whose in-place Windows publication is rejected in ADR171. The owner's
permission to run local software and tests covers this isolated implementation;
it does not authorize production activation.

Reuse the installed PostgreSQL17/pgvector binaries after exact source/binary pin
checks. Derive a new lifecycle helper from the reviewed
`integration/hierarchy-shadow-isolated-postgres.js`, preserving offline SCRAM
initialization, fixed D-drive parent, nonreparse/path checks, resource preflight,
SQL/postmaster PID/start/directory ownership checks and verified smart stop.
Never edit or execute a closed experiment's entrypoint or outputs.

## Fixed boundary and credentials

Bind only `127.0.0.1:55433`; refuse occupied ports, with no alternative endpoint.
Create a fresh `adr173-` directory under the new fixed
`apps/local-service/portable/data/scoped-native-isolated` parent. Retain the
stopped cluster and ownership marker; perform no recursive deletion.

Generate independent32-byte random passwords in RAM for postgres and the three
serving logins. Set them through the offline single-user stdin step with command
echo and statement/error logging disabled. No DPAPI, environment password,
password argument/file, production credential or credential output. Create only
cluster-local `murmingle_owner` NOLOGIN and `murmingle_app`,
`murmingle_crawler_submitter`, `murmingle_ingest_worker` LOGIN; serving roles have
no superuser, creation, replication, bypass-RLS or owner membership privileges.
Cluster-local synthetic accounts prove role separation, not live account policy.

Set max_connections12 to leave room for PostgreSQL's reserved slots while keeping
ADR167's eight actual client ceiling. Close the bootstrap database connection
physically before handing off a fixed-role connector. No bootstrap pool/socket
may overlap that eight-client schedule. Every diagnostic connection must verify
the same owned server identity before returning to ADR167.

Keep ADR167's exact scratch name, absent-name/creation-OID/owner checks,
canonical001–009 and accepted ADR165 buffers, grants, cases, instrumentation,
protocols, private controls and exact-OID/no-FORCE cleanup. Amend only the fixed
endpoint assertion and reviewed connector/inventory boundaries. The native source
gate stays closed during implementation; open only after full source acceptance.

## Bounds and cleanup

Use a360s outer lifecycle: startup at most120s, unchanged195s ADR167 interval,
20s verified smart-stop and25s final reporting. Startup cannot consume the SQL
reserve. The SQL epoch still begins before ADR167's source capture; no reset or
extended query/barrier deadline. Track actual callbacks/sockets after observation
timeouts and refuse clean success unless they settle and close.

Use a new fixed Python guardian derived from ADR146's assigned-before-import
Windows Job supervisor, with60s aggregate Job CPU,1536MiB Job/RSS/private memory,
512MiB fresh directory/output cap,256MiB Node heap,360s normal lifecycle and420s
wall including emergency cleanup. It authenticates the complete source inventory
and fixed native binaries before starting. It assigns only its new handshake-
blocked Node child to its owned Job before releasing that handshake or allowing
native imports/actions. This is not suspended-process launch. Any emergency Job termination is test failure,
never normal cleanup. Never signal a service or unrelated PID.
Preassignment Node/runtime bootstrap is outside Job accounting and containment;
the tiny entrypoint accepts only the exact bounded one-use guardian handshake
before dynamic native imports. Failure stops only that captured child.

Normal success requires ADR167's complete case ledger, physical owned-client
closure, exact scratch cleanup, server ownership recheck and smart-stop with
actual child exit. Unknown work prevents clean success; a guardian may terminate
only its own assigned Job to contain failure. Retain bounded sanitized named
outcomes and digests, no SQL text/parameters/server logs or passwords.

## Source ownership and acceptance

Versions owns new `integration/scoped-native-isolated-v1/cluster.js` and
`cluster.test.js`. Matcher owns new `supervise.py` and its reproducible source-only
`supervise.test.py` in that directory.
Root owns its README, this decision, ADR167 endpoint/driver/inventory changes,
freeze and sanitized evidence. No edits to applied migrations, ADR165, closed
ADR146 helpers or live runtime.

The fixed new `source-ledger.json` contains only the exact source hash map and
schema. Root supplies its reviewed FILE SHA256 to the guardian's fixed command;
the guardian authenticates bytes before parsing or following any source path.
Only bounded ordinary repository code/package/document files and the one fixed
ADR167 driver are allowed, never outputs, profiles, artifacts or another data
file. Ledger bytes are separately pinned by the freeze, not self-referentially
included in their own source map. Both runtime languages verify the complete
reviewed map and binary pins. Root owns this metadata and README.

Root and Trust review complete new sources and every inherited consequential
delta, execute guarded tests, authenticate exact source/binary inventories and
accept one actual invocation prospectively. No native action follows merely from
this proposal or an invented-client test. Any actual run closes its version;
failure needs a separately reviewed correction, not an automatic retry.

This is native PostgreSQL correctness and concurrency evidence only. Real E5
hierarchy quality, producer authority, owner controls, legacy policy transition,
client/crawler dispatch and actual UI/latency validation remain required.
