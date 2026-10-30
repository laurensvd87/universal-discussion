# Plain full owner recovery with fresh-cluster bulk loading

This separate purpose restores the complete fixed29October schema17 backup into
a fresh protected C: PostgreSQL cluster, migrates to18, preserves all27 legacy
tables, verifies28 restored tables and generated sequences, then exercises the
normal application HTTP routes and real Chrome UI. No live activation follows
from rehearsal success. ADR232 selects this separate uncompressed successor;
consumed ADR229/230 source, catalogs and failure output remain unchanged.

ADR233 adds128MiB of D startup admission margin:4GiB+128MiB, at both original
parent admission sites. Runtime D4GiB and every other original budget remain.
The pure resource adapter retains a failed counter/value from that same snapshot,
without a later native read; shape/volume errors stay finite and unknown error
subclasses are left to the original generic controller. Consumed plain-v1 source,
catalog and its pre-cluster failed output remain unchanged. This version requires
its own complete source review, fresh catalog/inputs/stable headroom and ONE
separate actual decision; neither this README nor source-ready flags authorizes it.

The exclusive empty PGDATA directory explicitly receives compression formatNONE;
the original native format readback must return0 before initdb can receive it.
No existing file or database is decompressed. Source tests cover the real file
orchestration's pending utility and refusal, not just a mocked lifecycle prepare.
ADR231's public same-size controls motivate this candidate; they do not prove
the previous full PostgreSQL failure's exact mechanism or this candidate's fit.

Only this new fresh cluster starts with wal_level=minimal and archive_mode=off.
max_wal_senders stays zero. fsync and full_page_writes stay on, are set explicitly,
and all five values must match the actual bootstrap SQL response before the
callback can open the archive. Live PostgreSQL configuration is untouched.
This is a performance hypothesis, not evidence that WAL caused the old failure.

One additional owned connection observes only the fixed database's aggregate
COPY/index numeric progress. It is counted with pg_restore and all other clients
inside the original eight-client lifetime cap; closing does not refund a slot.
The connection verifies default_transaction_read_only=on. No query text, table
names or page/discussion content is selected. At most300 observations are written
to one exclusively created restore-progress.ndjson, at most128KiB. Counts describe
currently executing work and may reset between tables; they are not cumulative
completion percentages. Missing observations do not prove a phase never ran.

The original restore, diagnostic query, write, timer cancellation and connection/
file close promises are joined. A diagnostic error cannot replace a restore
error. Unknown/unclosed physical work still prevents normal smart-stop and
acceptance. Job failure reports additionally retain the controller's already
validated aggregate user/kernel ticks without a new native call; no per-process
or phase attribution follows. Original CPU/memory/time/storage caps stay intact.

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
and verifies formatNONE before initdb. Ordinary test imports perform no native work.

Historical internal compressed-purpose/storage wrapper names in the copied
Python supervision require the same additional actual allocation guard; they do
not claim the new cluster is compressed. All logical/allocated bounds and free
volume floors remain identical to ADR230, including6.125GiB C admission.

The sole actual driver CLI is `plain-automatic18-browser <reviewed SHA256>`.
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
