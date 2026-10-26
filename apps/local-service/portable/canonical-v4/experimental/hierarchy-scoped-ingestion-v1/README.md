# Scoped queued versioned inputs — isolated source prototype

ADR165 implementation for review, not a migration, activation or production
concurrency result. Importing `repository.js` is inert. Initialization accepts
only a factory-minted fresh in-memory PGlite engine containing canonical001–009;
it refuses predecessor admission/queue/version namespaces. No native connection,
data directory, provider, browser, crawler, service or model is started.
The applied migrations and held ADR163 files are unchanged.

The independent namespace is `hierarchy_scoped_ingestion_v1`; the source policy
is `source-local-scoped-container/v1`, with `source-local-scoped-receipt/v1`
receipts. This is an owner-only fixture: no new serving execute/DML grants.
Arguments representing accounts, producers and worker tokens are synthetic
fixtures, not authentication or authority issuance.

## Canonical and history contract

Actual queued admission/update writes canonical Sources, embeddings, operation
receipts, provisional Source-local Topics and Discussions. New-policy admission
never runs Ridge, scans a catalog or creates fixed references. Existing Sources
are not adopted. Both 384-dimensional binary64 input vectors, their exact
`array_send` hashes (including negative zero), material and immutable decisions
are versioned; a composite FK protects the current pointer. Byte-identical
renewal compares all material: title/body hashes, extractor, document, builder,
encoder/representation/model identities, both vector wire hashes and stamp.
The singleton fixed artifact rejects incompatible builder/encoder/representation
changes without creating an input/current decision. Reviewed artifact replacement
is future production work, not a multi-artifact publication mechanism here.

Addressed updates require the exact Source/prior-version/witness/decision.
They preserve Source, Topic, Discussion and contribution IDs. A changed stamp
pins old Source-anchored roots to their SAME Topic and advances canonical root
and Discussion versions, following005 lifecycle semantics. Existing immutable
semantic root snapshots do not move. Tests use the actual canonical reader and
reply path after update, not a fabricated projection. Private one-command
intent protects exact Source rewrites; no GUC grants mutation authority.

Whole-command identity binds origin/principal, generation, original expected
revision, exact material/wires/stamp, semantic node, producer proof and addressed
prior identity. Admission's first server allocation IDs/time are excluded:
`enqueueObservation` looks up an existing operation before allocator/clock
callbacks, and SQL retains the original persisted allocation. Changed node,
actor or producer proof conflicts. This explicit successor behavior differs
from the private predecessor's narrower allocation replay semantics. Competing
first allocations are not native-concurrency evidence. Completion uses current
generation and addressed identity, not global revision equality. A→B→C→replayB
returns B's original receipt without rewinding current state or granting current
root authority. Stale prior becomes a committed, scrubbed `failed/stale-prior`
outcome, never a rollback-only exception or automatic rebase.

## Boundary and lock order

The additive `boundary.sql` verifies15 exact legacy granted signatures, copies
their unchanged implementations into a private schema, revokes private-body
access, and replaces canonical names with gated wrappers retaining their old
explicit grants. The two private prepare/complete signatures are wrapped too,
without serving grants. Their canonical preparation/completion remains one
transaction. Actual SQL006 lifecycle command kinds remain unchanged; the actual
JS lifecycle dispatcher selects destructive ingestion leaves.

Every ordinary entry first takes shared transaction advisory gate
`(914092165,1)`. Topic deletion and clear take exclusive first. An attempted
shared→exclusive upgrade fails by inspecting granted server locks, not a flag.
New external mutation entries also reject nonzero trigger depth.

Enqueue takes the actor fence where applicable, then growth only for short
cross-policy operation/URL/absence reservation. Addressed receipt, Source and
embedding witness locks are NOWAIT under growth. Reservation commits before
worker mutation. Completion takes lifecycle, actor, canonical operation receipt,
Source, job, current pointer/companions, sorted Discussions/Topics/Contributions,
final authority and finally the conditional generation watermark. No transitive
new-policy admission/update/helper/trigger path takes growth, an idle-lane check,
legacy job/lane, or early runtime SHARE. Root insertion reserves the canonical
command before Source; the protected intent's Source FK is deferred. Feed
changes accumulate privately and lock affected node rows in sorted commit order.

Legacy apply still has its old global coupling. Legacy forget/correction retain
old lane semantics; clear may still refuse a leased legacy job. The predecessor
ADR163 update still rejects a leased crawler through its global idle-lane check:
that remains an activation blocker, not crawler-safe fast-update evidence.

## Queue and commit authority

Bounds are4096 active jobs globally,32 per actor,1024 for fixed crawler principal
`crawler-public/v1`;32KiB UTF-8 material plus two384-vectors; one job per claim,
three attempts/epochs, lease≤15s capped by one original authority≤30s; listing≤100.
Terminal transitions scrub queued material, vectors, URL and raw worker/token.
Before casts or storage, SQL and repository validate every parameter's exact
JSON primitive/null type: IDs≤128 UTF-16 units, created time≤64, lowercase hex
digests exactly64, revision/prior integers≤2^53−1 (prior is a positive decimal
string), each vector wire string≤16KiB, and encoded aggregate parameters≤48KiB
excluding the separately parsed vector strings. The aggregate includes material
and its JSON escaping cost; a32KiB material allowance is not an unlimited params
allowance. Jobs have defensive identifier/params CHECK bounds. Direct SQL tests
reject oversized/type-invalid fields before vector parsing or any row allocation.
The withdrawal wrapper validates the canonical bounded actor/account pattern
before its additional hash fence and queued-job retirement work.
Replay, heartbeat and reclaim never extend the original deadline. Reclaim needs
expiry and a new token. Claim/heartbeat never subsequently lock Source.

Revocation locks only the independent authority record and commits in a separate
repository transaction; cleanup follows later in Source→job order. Completion
locks that authority after domain locks, checks again after publication and holds
it through commit. An accepted completion makes later revoke return false;
cancellation cannot claim to undo it. Uncertain outcomes reconcile exact identity.

The repository sends `BEGIN`, commands and a separate literal `COMMIT`. Protected
deferred finalizers require current query exactly `COMMIT` or `COMMIT;` AND
intrinsic trigger depth1, failing closed on NULL. Lowercase/END/WORK/CHAIN,
comments, multi-statements, PREPARE, implicit and early constraint flushes are
unsupported. The owner-only protocol witness demonstrates raw simple implicit
rejection and the installed PGlite extended implicit `current_query=NULL/depth1`
case; neither is mistaken for a genuine literal COMMIT. The nested regression
first removes only the depth defense (plus the external-entry fence equally in
both branches) to reproduce expired nested acceptance, then restores the actual
depth guard and proves atomic rejection. This is adversarial fixture injection,
not a serving capability.

Every duplicate finalizer checks context first, then protected current tx,
generation/operation/epoch, original deadline/lease snapshot and exact successful
receipt association. A timely first server timestamp is never overwritten.
Changed identity or receipt and cross-transaction reuse fail even with a stored
timestamp. Savepoint rollback restores checks. Authorization is linearized in
the commit phase, not at the physical WAL commit instant or after arbitrary
later deferred work.

Proof storage uses4096 fixed private slots with SKIP LOCKED reservation, not a
racy count. After locking each candidate, a separate fresh SQL statement checks
occupancy: a stale selection snapshot cannot turn a just-committed occupant into
a unique-conflict mutation attempt. Occupied candidates are excluded permanently
for that reservation; at most4096 distinct candidates are inspected, checking
the original authority/lease clock before each and before canonical mutation.
There is no automatic client mutation retry. Tests inject a post-selection
occupant, a reduced disposable three-slot exhaustion pool and reservation expiry;
the real two-connection snapshot/commit race remains a native gate.
Minimal proof rows retain tx/gen/op/epoch, slot, times and necessary
receipt digest; no URL/body/actor/vector/raw-token fields. Explicit
`cleanupFinalizations` runs a separate transaction deleting at most100 prior
finalized proofs. It is NOT automatic postcommit cleanup. Source/account/Topic/
clear erasure deletes relevant jobs, authority and proof/digest associations;
pending admission is explicitly enumerated even without a Source FK. Minimal
immutable retirement rows retain only stored generation, operation and finite
admission/update/renewal kind. Forget, Topic deletion and clear do not reset them.
Same-operation replay cannot revive erased content, even with fresh revision,
IDs or changed material; an explicitly distinct new capture operation may admit.

## Verification and remaining gates

Run from repository root:

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-ingestion-v1/test.js
```

The suite preserves all22 predecessor behaviors and seeded legacy tuples, with
actual queue/canonical mutations, wrappers/private grants, exact replay,
retirement/erasure, leases/cancellation, nullable authority rejection, capacity,
rollback and commit-protocol regressions. Static transitive source assertions
and sequential PGlite results are NOT native concurrency or serving-role proof.

Before activation, use a separately authorized fresh native scratch fixture with
actual001–009 enqueue/claim/apply held before its final watermark. Independently
prove its lane lock, then commit unrelated new update and canonical reply before
releasing it; prove growth remains available during new completion. Exercise
both update/root/reply and erasure/account/clear schedules, simple/extended
protocols, deadlines after mutation, wait graphs and exact final tuples/wires.
Any legacy lifecycle consumer that changes semantic bindings now also needs a
reviewed explicit transaction ending in literal COMMIT because its feed-dirty
finalizer shares this protocol boundary. Fixture tests wrap withdrawal/account/
Topic/clear calls explicitly; they do not prove that an existing repository's
implicit `.query()` envelope works unchanged. Native integration must exercise
the actual legacy repository method/router and binding effects, not merely the
same SQL function inside an owner-provided explicit transaction.
Audit real non-owner login pools: no owner/inherited/reset-role, table/column/
sequence DML, schema/database CREATE/TEMP, callback/trigger ownership or
replication-role escape. An owner pool using SET ROLE does not satisfy this.

API/worker/crawler integration, authenticated producer proof, migration/recovery,
and paired-input revisit/migration of legacy body-only Sources remain unfinished.
That bridge must preserve existing IDs/roots/tuples and cannot invent paired
history or delete/re-admit old URLs. Hierarchy quality, STOP/OOD/specificity,
generated sharing/Insight, parent feeds, UI and end-to-end latency remain separate
unfinished production gates. No active runtime or owner DB was changed.
