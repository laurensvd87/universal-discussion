# hierarchy-fast-admission-v1 — opt-in canonical prototype

This is **not migration010, a runtime dispatch, activation, native attestation,
trusted ML inference or a production policy**. It is four new files only. No
applied001–009 source is edited; no runtime/worker/client/router registration,
queue, model, provider, browser, crawler or native database action is included.
Initialization explicitly accepts only a supplied PGlite adapter. Tests create
one fresh in-memory engine, with no dataDir, and apply existing canonical fixture
migrations inside that engine. Never install this experimental SQL into the owner
database. The actual installed service remains on its existing path.

## What is real and demonstrated

`admitFastNewSource` performs an addressed canonical insertion: actual Source,
normalized embedding, stable canonical Topic/discussion, singleton membership,
primary link, operation receipt, protected stamp, actual-FK paired input and
semantic decision. Policy is `source-local-canonical-container/v1`; the new
typed receipt schema is `source-local-ingestion-receipt/v1`. Taxonomy node IDs
are NEVER canonical Topic/discussion destinations. The container's generic
`Page discussion` label avoids copying the captured title into an orphan Topic.
Its fixed Ridge reference is null. No Ridge transformation, scan, catalog lane
or similarity fallback occurs in this command, including when nodeId is null.
The tests replace the disposable engine's Ridge function with a throwing stub;
the fast path still succeeds. This says nothing about service end-to-end latency.

The new-source commit briefly takes **the exact008/009 advisory growth lock
`(914092008,1)`**, not the legacy catalog lane. It rejects an existing URL, a
pending/leased old job for that URL, a stale deletion/absence watermark, generation
mismatch and ID collision. It also rejects any operation ID already owned by a
legacy job, including a different URL or terminal job without a completed Source
receipt. An installed opt-in trigger rejects legacy job growth for new-policy
URLs; another rejects legacy Source updates, including manual
correction/rematch attempts. Existing Sources cannot be adopted. There is no
revisit/update implementation for Source-local rows: such work fails explicitly.
No background queue, fairness or concurrency-throughput implementation is claimed.

Admission replay identity is deliberately **exact paired representation material**
(URL/title/extractor/model, input/document/builder/encoder/representation hashes
and both vector-wire hashes), plus the operation ID and generation fence. Proposed
allocated Source/Topic/discussion IDs, createdAt and initial node are not part of
that material digest. An existing operation with unchanged material returns its
ORIGINAL stored receipt/allocation/initial node even if those proposed arguments
change; it allocates nothing and never changes the decision. Changed material
conflicts. This is not an exact-whole-command replay claim. Receipt semanticNodeId
is the initial admission snapshot, not a query for a later reclassified decision.

Paired evidence binds actual Source FK, generation/write_version, URL/title,
title/body-input hashes, extractor, encoder, builder, representation, document
hash and BOTH384-dimensional binary64 vectors. The existing canonical body
embedding remains authoritative. Title vector/paired metadata are additive.
PostgreSQL `array_send` hashes match a bounded independent wire serializer;
signed zero is preserved without renormalization. The legacy Source stamp stays
unchanged for existing authority checks; the separate witness includes the full
paired material. Root checks reread actual canonical title/extractor/version and
body wire, not a caller's mirror. No captured body text is stored here.

These checks establish **identity of supplied evidence**, not that a body hash
authenticates captured text, a vector came from E5, a supplied node was correctly
classified, a document is current/native or an account owns a session. All new
entry points remain owner-only, with NO application/worker grants. The eventual
trusted producer/model/native/account boundary is deliberately not invented.

## Atomic root and erasure mechanics

`createFastRoot` composes the existing canonical owner-only
`runtime_prepare_command` and `runtime_complete_command` in one transaction,
retaining the actor advisory fence and receipt-before-Source checks. The existing
canonical boundary still validates actor shape, destination, Source/link/receipt/
embedding/stamp mirrors and postability. A protected one-command root intent has
a deferred FK to the contribution actually inserted in that same transaction.
The AFTER-root trigger consumes that intent and inserts an immutable semantic
snapshot bound to actual Source, contribution and destination FKs. Missing/stale
proof causes the canonical insert/command receipt to roll back too.

**Legacy root creation is blocked in these containers**, whether human, direct
topic-only, or generated sharing. The trigger applies to all new roots, not just
one actor type. Generated sharing has no new supported wrapper in this slice and
is intentionally hard-blocked, not granted a semantic/native/provider bypass.
Existing replies keep their canonical destination and are not reclassified.

`reclassifyFastSource` changes only the current decision under an unchanged exact
input witness. Existing root snapshots/destinations cannot move. This prototype
publishes one immutable ROOT-ONLY artifact/node set; no child validation, owner
display cut, hierarchy revision/revocation scheduler or taxonomy approval exists.

`forgetFastSource` permits exactly one addressed Source-local origin and delegates
to the existing canonical forget function. Actual Source deletion cascades paired
vectors, material, decisions, receipts/intents and root semantic snapshots; scoped
feed tokens advance on snapshot deletion. The Source-to-container link becomes
null while canonical Topic/discussion/posts and their original destinations remain.
Canonical forget still removes origin/anchor associations under existing rules.
Root withdrawal/account-erasure also removes its semantic snapshot. Existing
confirmed Topic deletion and clear-learned-data keep their separate destructive
meaning: derived container/snapshot FKs cascade only AFTER an authorized canonical
deletion, never block it or grant a new delete route. Disposable transaction probes
exercise both existing commands and roll back all synthetic effects. No policy
or applied lifecycle function is loosened.

`readFastRootFeed` is a bounded owner-only root-ID projection with scoped cursor
versioning, current canonical visibility and exact destination joins. It is
presentation evidence only. It does not open a posting/provider/native context.
After forgetting, an old semantic create-root proof cannot be replayed to regain
Source authority; existing canonical discussion/reply routes remain the recovery
route. Root insert replay while its Source exists retains the original snapshot.

## APIs and test

`initializeFastAdmissionPrototype`, `publishFastAdmissionArtifact`,
`prepareFastAdmission`, `admitFastNewSource`, `createFastRoot`,
`reclassifyFastSource`, `forgetFastSource`, `readFastRootFeed` and
`pairedVectorWire` are opt-in exports. Inputs use exact descriptor-checked plain
records; vectors are dense finite unit arrays. SQL writes are SECURITY DEFINER
with fixed `search_path=pg_catalog`, qualified relations, PUBLIC revocation and
no role/table-DML grants. Mathematical SHA/wire helpers are non-definer functions
with the same fixed path. This prototype does not authenticate a database owner.

Pure/synthetic test command (no child isolation or native database):

    node --max-old-space-size=256 --test --experimental-test-isolation=none apps/local-service/portable/canonical-v4/experimental/hierarchy-fast-admission-v1/test.js

Tests cover zero Ridge calls, actual FKs, cross-policy queued URL rejection,
exact wire/signed-zero, stale title/body/title-vector/builder/version/generation,
atomic rollback, human/generated bypass, immutable roots, forget/feed invalidation,
role restrictions and exact preservation of seeded legacy Sources/posts. Fault
injection disables guards ONLY transactionally inside the disposable test engine.
Native PostgreSQL lock races, real HTTP/client/native proofs and running-crawler
latency are NOT tested by PGlite.

## Required activation work, not implemented here

A separately reviewed additive010 and versioned service/worker/client dispatch
must select this path before any production mutation. Do not clone005 wholesale
or let old workers claim paired material. Review/revoke direct legacy apply for
new-policy Sources; keep the queue-growth guards/races and compatible old routing.
Define a bounded source-local update route and durable authority/lease semantics,
then evaluate accepted producer/OOD quality and approve the actual taxonomy/policy.

Wire the new receipt decoder, current capture/title+body encoder witness, worker
adapter and canonical selection/catalog policy dispatch. `topic-view-mode.js`
must stop inferring Ridge merely from learned `topicIds`. New-policy alternate/
Related reads must not reintroduce exhaustive scans. Keep legacy routes unchanged;
semantic parent feeds open exact canonical context before reply/Insight. Give
generated-root sharing its reviewed atomic binding wrapper before enabling it.
Distinguish container counts from semantic topic counts in clients/dashboard.

Owner-approved migration/recovery, independent security/native/concurrency review,
compatible rollback preserving new destinations, deletion/revocation coverage and
measured actual latency remain mandatory. No owner appointment, historical binding
or current-title backfill is inferred. This slice does not remove the CURRENT
service's `ingest_apply` scan, and is not a completed canonical migration.
