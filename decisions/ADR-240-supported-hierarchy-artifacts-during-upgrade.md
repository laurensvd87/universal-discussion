# ADR 240: Preserve an explicitly supported installed matcher during upgrade

Status: source implemented and tested; no live activation or completed recovery.

The authenticated fixed29October backup contains58652 ingestion jobs, all
terminal (58636 complete,16 cancelled), and one installed matcher. Read-only
selected-table extraction authenticates the entire encrypted archive and dump
before launching pg_restore in SQL-output-only mode. Its normal Windows EOF is
joined, the remaining archive is authenticated locally, exact row counts are
required and no database connection or plaintext file is made.

That archived matcher differs from the current20-node/three-detail artifact.
It exactly matches the historical18-node/GTA-only artifact reconstructed from
the still-pinned root model, root policy, paired input and GTA detail files:
eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c.
The current artifact remains4e9b3d3d2053327707d6ff395a8373e6e5ac3195333183ac8516f84195c45524.
The existing upgrader unconditionally requires the latter, independently proving
an upgrade refusal for the archived state. The earlier parent filesystem-denied
failure masked the original child error; its actual first site remains unknown.

Add a closed supported-artifact registry containing only these two exact
reconstructed numeric artifacts. Authenticate all source bytes with the current
loader's fixed pins, compile the legacy subset without an encoder and require
its exact known descriptor hash. No arbitrary hash/path/model selectors, database
model compilation, teacher assertion, registration or head activation is added.
Unknown artifacts remain unavailable. Keep the current loader/default unchanged.

Owner upgrade accepts either supported existing head under the same owner,
writable READ COMMITTED, drained jobs, head/policy CAS and migration transaction.
It preserves that head, policy and original data. Fresh installation still uses
the current artifact. No migration SQL or old artifact bytes change.

Worker startup selects the exact supported artifact described by protected active
topology, before encoder allocation or claims. Keep every schema, role, node/path,
generation and head check. Resource startup and runtime must agree on the same
hash and recheck after asynchronous encoder initialization; a changed head causes
closure, never automatic rebase or activation. Use the same shared encoder and
pool. Test both known artifacts and unknown/mismatched/corrupt topology, schema,
permissions and initialization races.

Consumed purpose sources/catalogs/outputs remain unchanged and ordinary source's
previous exact bytes are archived in Git b82d5b7f. A future separately cataloged
recovery must explicitly account for these ordinary-source changes. Preserve all
original row/fingerprint/migration/UI/normal-retirement assertions. Diagnose the
filesystem failure separately; no access denial is ignored or retried by this
change. Full hierarchical matching/discovery quality and live activation remain
unfinished.

## Source evidence

The final read-only extraction report hashes
7b29a5013ed032552363a7f080748ca5e88687c2121bad87ef3bcce415a926b7.
It confirms both exact row counts, zero unsettled jobs, mismatch with the current
artifact and exact match with the reconstructed historical artifact. Full
authentication of both passes, original child exit0 and stream retirement pass;
no SQL execution, plaintext file, private row/key retention or live change.

The new supported-hierarchy-matchers module leaves the existing current loader
unchanged. It authenticates and compiles the fixed legacy subset, checks its exact
hash and representation, returns only the two frozen variants and coalesces
numeric compilation without an encoder session. Unknown hashes and extra
selectors refuse. The ordinary owner upgrader now accepts either supported
existing hash while preserving its original transaction/owner/queue/CAS checks.

The shared readiness path keeps the original four schema/role/revision/topology
queries. Production runtime and resource startup select from protected metadata
before encoder allocation and compare the whole supported node/parent topology.
The post-initialization checks still require the original selected hash; even a
change to another supported artifact is rejected without rebasing or claims.
Trusted resource test composition retains its prior loader seam.

49 focused Node tests pass with64MiB in390.4096ms, zero skips/failures. They cover
both variants, unchanged current default, unknown hashes, schema/role/CAS refusal,
restored17/18 runtime startup, false hash/topology pairing, supported-head races,
resource mismatch, shared encoder admission and joined shutdown. The owner
acceptance regression deliberately stops at migrator entry on a fake physical
transaction; it is not actual SQL/migration proof. Original migration bytes and
all consumed recovery-purpose files remain unchanged. Live snapshots/services
and the crawler are not switched. A new cataloged full-data recovery, actual SQL,
UI and broader product/quality checks remain required.
