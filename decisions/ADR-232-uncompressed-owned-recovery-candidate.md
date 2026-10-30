# ADR-232: Review uncompressed C recovery after the public space comparison

Date: 2026-10-30

Status: Root source design selected for implementation review; no successor
files/catalog or actual native execution authorized by this document alone.

ADR230 reaches actual COPY and index progress but stops at the unchanged C free
floor. ADR231's public same-size controls reproduce a substantially larger
available-space debit for compressed files than for the plain control. Reported
compression size alone does not account for that debit, and durable flush alone
does not remove it. The precise kernel mechanism and complete PostgreSQL cause
remain unproven. Do not repeat the compressed full attempt or weaken disk floors.

Implement a separate fresh **uncompressed** protected C cluster. Copy the reviewed
ADR230 full lifecycle/application/browser/binding/storage supervision source into
a new namespace; preserve consumed predecessor bytes and all original full-data
assertions. The empty exclusive PGDATA helper must explicitly set compression
format NONE and verify format0 before initdb. Do not decompress, open or alter
the live database, prior test directories, model assets or any existing files.

Retain minimal WAL only for the fresh isolated cluster, archive off, senders0,
fsync/full_page_writes on and exact bootstrap readback. Retain the joined numeric
COPY/index observer, its eight-client lifetime accounting and original validated
aggregate CPU diagnostics. Any historical compressed-purpose variable names that
remain in copied supervision denote its mandatory allocation wrapper, not evidence
that the new directory is compressed. Test the real actual-purpose-to-wrapper
connection and original cluster guard AST, plus format0 before initdb dispatch.

Keep the same Job1GiB/32processes, Node64MiB,8clients,300CPU,360/380/390 epochs,
6GiB logical/4GiB allocated cluster bounds,128MiB noncluster bound,6.125GiB C
admission and C2/D4/physical1/commit1GiB runtime floors. These remain sampled
guards, not quotas or proof that the final database fits. Do not lower the
logical bound, increase allocation caps, relax original assertions or substitute
partial data. An unexpectedly large plain cluster must refuse honestly.

Use the same complete fixed17 encrypted backup, authenticate the full archive and
both real restore guards, migrate to18, preserve27 legacy table fingerprints,
verify28 restored tables, sequences and role boundaries, all18 normal HTTP cases
and the original real Chrome discussion/canonical/history/request/cleanup proof.
No weakened observer or normal-retirement claims are permitted on timeout.

After complete Root source review, fresh catalog/runtime pins and exact held
archive/receipt/Chrome readiness, record a separate Root ONE execution decision.
No source-ready flag, prior actual permission or this proposed design authorizes
execution or live activation. If unsuccessful, retain immutable evidence, audit
the failure and retire only exact owned stopped scratch data by separate decision.

Recovery is still a prerequisite to integrating the full matching solution:
fresh generalizable semantic evidence, automatic public-topic growth, stable
canonical identities, sixteen-root binding, indexed retrieval, owner-wide/topic
controls, preserved discussions/privacy, concurrent crawler and actual fast UI.
