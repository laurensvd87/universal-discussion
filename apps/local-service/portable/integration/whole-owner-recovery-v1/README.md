# Full-data owner recovery and application rehearsal

ADR239 creates this separate fixed workload. Consumed plain-v5 source, catalog,
archive and outputs remain immutable. Imports and source tests do not authorize
execution. Source-ready latches stay closed until source review, and a complete
catalog, held-input authentication, fresh admission/process/port checks and ONE
separate actual decision are still required. The only actual entry command is
whole-automatic18-browser plus the exact reviewed catalog hash.

The fixed local1354426025-byte encrypted schema17 archive restores in full into
a fresh protected C: PostgreSQL17 cluster, using the owned physical connection,
fixed database OIDs and separate PID-file cleanup / exact SQL epoch domains.
No live database, service, crawler, configuration or credentials are changed.
Both scratch databases must retire, followed by normal SQL smart-stop, closed
clients/pipes/handles, empty Job and final source/input pins. An emergency stop
does not count as acceptance.

Explicit workload bounds:600 aggregate Job CPU seconds,600 active seconds,
620 normal drain and630 absolute. The private callback has at most500 seconds,
clamped to retain the original20-second stop and25-second report reserves.
The copied supervisor's ordinary CPU guard remains60; only this private purpose
uses600. Node64MiB, Job1GiB/32processes,8client lifetime slots, startup120s,
normal callback195s, physical/commit1GiB runtime floors, C2GiB/D4GiB floors and
stronger admissions remain. C admission6.125GiB, D admission4GiB+128MiB.
Actual allocation4GiB, logical cluster6GiB and noncluster128MiB are sampled
limits, not reservations or a filesystem quota. No automatic budget escalation.

Archive authentication/physical restore retain the original backup operator's
bounded lifetime. Its verifyRestored callback validates the exact authenticated
header/receipt and owned physical server/database identity. Only after that
operator's original promise retires with its required result do we rejoin the
same identity and run the complete fingerprint/migration verifier. Application
work cannot start before that verifier passes. The held archive is checked again
at final cleanup. An inner restored result alone never proves data equality.

The accepted fast-schema-contract-v1 verifier remains unchanged: all29 restored
tables, original28 independent receipt fingerprints, all27 original post-migration
checks plus queue equality, exact projected column/OID census, owners, roles,
sequences and state/CAS. Only semantic_inputs uses32-row local reconstruction
from exact binary64 array wires; all other tables keep original SQL/128-row
checks. Exact upgradev3 / semantic-input-binary64-jsonb/v1 proof is required.
The legacy receipt has28-table coverage; no independent original queue checksum
is invented. Never discard/reset jobs to make the migration pass.

Both JS and Python require the same73 awaited durable fixed metadata stages.
Then run all18HTTP and genuine Chrome assertions, preserving discussion and
canonical identity checks. Source tests retain complete byte/AST inverse evidence
for unchanged native guards and supervisor behavior except declared time constants
and its fixed inventory anchor. They also verify pending/invalid archive results
cannot reach migration, exact time/CPU boundaries and normal physical retirement.

Only the fresh test cluster selects verified LZ4 TOAST, minimal WAL, archive_mode
off and max_wal_senders0; fsync and full_page_writes remain on. PGDATA receives
verified NTFS formatNONE before initdb. Existing data/settings remain untouched.
The bounded aggregate restore progress observer still counts toward8 clients and
records no private rows or query text. Complete future backup coverage, actual
matching/discovery quality, owner controls, load/UI and live activation remain
unfinished after this administrative test.
