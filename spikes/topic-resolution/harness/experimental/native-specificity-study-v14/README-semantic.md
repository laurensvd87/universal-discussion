# ADR179 semantic manifest and transient cohort

SOURCE ONLY; pending complete root/Trust review. Import starts nothing. These
five files provide no filesystem, socket, process, capture, provider, artifact or
model initialization capability, no numeric classifier and no new execution grant.
Tests use invented168-row metadata, text, receipts, clocks and vectors only.

`buildSpecificityManifest({expectedPanelIdentity,panel})` descriptor-safely copies
the ADR177 projection, checks its property-order JSON hash against the separately
trusted expected identity, and preserves all168 ordered cases/groups/splits and
both null-gold states. It derives24 TRAIN/CAL and18 TEST batches of exactly4.
Each batch is `{phase,batchIndex,cases,batchId}`; case fields are
`id,groupId,url,language,split,globalOrdinal,nativeOrdinal`. Global ordinals remain
1..168; native ordinals really restart1..4 for each independent browser study.

`validateSpecificityBatch({manifest,batch,expectedPanelIdentity,expectedManifestHash})`
requires an independently held owner manifest hash, minted once by the trusted
authenticated builder and fixed separately during reviewed preparation. Passing
the supplied manifest's own hash back as expected is **not authentication**.
No active brand or WeakSet admission is required. `deriveBatchNetworkScope(manifest,
batch)` is derivation only, called after validation. Scope fields are
`panelIdentity,batchId,primaryHosts,primaryOrigins,cdnOrigins,hosts,origins,scopeHash`
(global scope omits batchId). Only primary URLs and five fixed CDN origins enter
scope; support aliases never grant host access. There is no DNS resolution here.

`createSpecificityCohort` takes manifest plus both separate owner pins, phase
(`train-cal` or `test`), producerProfileHash, original nodeIdentityHash, `guard`,
monotonic `now`, original absolute `phaseDeadline`, and trusted synchronous
`admitAvailable`, `admitUnavailable`, `verifyBatchDrain`, `authorizeTest` functions.
TEST authorization returns manifestHash/selectionIdentity/auditIdentity only after
the owner independently verifies immutable TRAIN/CAL completion and selection.
It is never established by a caller boolean or by these data hashes.

`acceptRow(batchId,row)` accepts the agreed capture collected/unavailable union.
Admission validates actual native/rights/field binding before retention; actual
native awaits happened in reviewed capture before publication. It is **not** a
fresh reread of a closed browser. Unknown reasons and encoding-input failures are
fatal, not unavailable. `prepareBatchDrain({batchId,captureSummary})` is a guarded,
idempotent read after the current four rows are complete. It returns only the
current batch/manifest/Node bindings and private metadata/summary hashes. It
advances nothing, exposes no raw text or vectors, and is not guardian authority.
The actual owner retains the ORIGINAL capture-summary identity when requesting
the parent ACK. `finishBatch({batchId,captureSummary,guardianReceipt})`
requires exactly4 rows, invokes the trusted actual guardian verifier and checks
its returned batchId/manifestHash/nodeIdentityHash/batchCaptureHash/receiptHash.
That verifier receives independently recomputed metadata and bounded summary
hashes, so a prepared hash never substitutes for final validation. The existing
direct finish path remains valid; only finish advances the batch.
Each batch must have its independent normal receipt before the next begins.
`finishCapture()` requires all96/72 rows and24/18 receipts before encoding.

`encodeAfterCohortDrain({requestFinalDrain,createEncoder,recheckAssetsAndSources,
revalidateAvailable})` requests a separate final barrier binding all ordered
batch receipts, cohort digest and original Node identity. The trusted owner
returns requestHash/receiptHash/nodeIdentityHash/requestedAt/acknowledgedAt in the
same injected monotonic clock domain. The540s/405s encoding clock starts at the
first externally observed **final** barrier request, including ACK wait, not a
batch drain or ACK arrival. No encoder is created before that ACK. Absolute
phase/capture/fitting/assessment/resource enforcement and actual cancellation
remain the outer owner's responsibility; a callback wait is not physical cleanup.

`createEncoder()` supplies `{modelId,embed,close}` for unchanged packaged E5.
Fields are revalidated before each sequential pair, max192/144 field calls.
Raw title200 +effective title200 +body4096 totals431616/323712 UTF16 units.
Evidence is max16KiB/row. Original async promises remain charged through actual
settlement, including after abandon; errors are sticky and close is attempted
once. No timer timeout frees physical capacity. This helper cannot forcibly
interrupt a callback or prove that the outer browser/guardian has no other work.
Clock/deadline/phase checks run both before and after the trusted guard, before
dispatch. Only genuine native Promises with the exact native prototype and no
own constructor/then/accessor are observed; benign data symbols are permitted.
Unsafe Promise originals are refused without executing hooks or attaching local
cleanup. `unsafeOperationRefused` remains sticky: the outer owner must already
track and safely settle/close that separately owned operation. Zero locally
tracked pending originals never proves unsafe or external work has settled.

`consumeEncoded(fn)` is a single synchronous trusted semantic-consumer seam,
not a classifier. It receives all availability rows and detached frozen vectors;
binary64 bits and signed zero survive copying and vector hash construction.
The caller owns the reviewed reference/fitter/assessor composition and must never
persist CAL/TEST queries. The return contract is a **compact receipt only**, at
most8192 values,16384 UTF16 units per string and512KiB encoded; it is not the
selected artifact/codec packet. The trusted owner retains selected TRAIN material
separately in its reviewed closure, validates it with the separate codec/artifact
contract and only then uses its separately authorized retention path. Returned
metadata rejects raw/query-vector keys; trusted callbacks could still retain
their own arguments, so this is not a
security sandbox. Private vectors are dropped after consumption or failure.
JavaScript strings cannot be securely erased; dropping references is not secure
erasure, and browser temporary caches remain outside this RAM accounting.

`abandon()` poisons ongoing work and drops raw/vector references, without claiming
pending originals settled. `snapshot()` reports finite phase/fault/counts only.
Unknown callbacks, malformed/foreign evidence, reentry, deadline failure or cleanup
uncertainty never produce a successful assessment. Source/receipt hashes do not
establish native rights, guardian truth, model quality or canonical authority.

Guarded invented-only tests:

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v14/manifest.test.mjs ./spikes/topic-resolution/harness/experimental/native-specificity-study-v14/cohort.test.mjs
```

Producer profile, artifact reuse, TRAIN reference construction/codec, one CAL fit,
selection audit, actual capture/encoding/assessment, guardian integration and live
canonical/owner/client wiring remain separate unfinished work and permissions.
