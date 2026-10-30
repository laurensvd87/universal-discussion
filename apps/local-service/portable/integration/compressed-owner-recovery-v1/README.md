# Compressed full owner recovery rehearsal

This separate purpose restores the complete fixed29October schema17 backup into
a fresh protected C: PostgreSQL cluster, migrates to18, preserves all27 legacy
tables, verifies28 restored tables and generated sequences, then exercises the
normal application HTTP routes and real Chrome UI. No live activation follows
from rehearsal success. See ADR229 for rationale, limits and staged decisions.

The selected lifecycle, owned-run binding, owner composition, application and
browser copies retain their original SQL, role, canonical identity, discussion,
request containment, cleanup and completion assertions. Original files and
consumed experiment outputs are unchanged. Tests also retain the exact original
cluster guard AST; measured allocated-size checks are a mandatory additional
wrapper for this new purpose. A new test binds actual OwnedRun construction to
that wrapper, preventing allocation monitoring from becoming disconnected.

Only the exact fixed1,354,423,835-byte dump and its authenticated SHA are admitted
by the real private lifecycle and stream pump. The old generic1GiB contract
remains unchanged. Metadata admission never substitutes for the complete streamed
magic/length/hash/backpressure/EOF/process-close checks.

Storage admission requires6.125GiB free C:,4GiB D:,1GiB physical and1GiB commit.
Runtime retains the original2GiB C:/4GiB D:/1GiB memory floors. Logical cluster
length remains6GiB; actual allocated cluster data is additionally bounded4GiB,
and noncluster data128MiB. These observations are sampled, not a kernel quota.
The parent records storage observations through controller retirement; original
final publication checkpoints keep checking the workspace and resource floors.
Job1GiB/32 processes, Node64MiB,8 physical database clients and original deadlines
remain. No pagefile, host service, HBA or live process changes are performed.

`prepare-compressed-root.ps1` is a separate filesystem-only setup action. It
atomically creates only the fixed private parent/root with owner+SYSTEM ACLs;
existing ACLs are verified rather than changed. It never creates/adopts a run or
starts PostgreSQL. Only the child lifecycle creates the exclusive empty pgdata
and verifies LZNT1 before initdb. Ordinary test imports perform no native work.

The sole actual driver CLI is `compressed-automatic18-browser <reviewed SHA256>`.
Its source-ready flag is not execution authorization. First build and authenticate
a fresh whole-source/runtime catalog, verify exact archive/input pins, volume,
resource and port readiness, and record a separate Root ONE actual decision.
Old catalogs and output directories cannot be adopted. Retain any failure and
audit its original process/handles/inputs before considering a new source version.
After a real attempt, retire its exact stopped scratch data only under a separate
fixed-path audit; preserve its evidence and the original backup.

Current evidence includes pure boundary tests and actual read-only Windows ABI/
allocation observation on the fixed public Chrome executable. The earlier2MiB
synthetic C: compression proof passed. Neither establishes PostgreSQL compatibility,
full-data fit, actual browser success, semantic quality or live readiness. Those
require the complete new actual rehearsal and subsequent goal-level checks.
