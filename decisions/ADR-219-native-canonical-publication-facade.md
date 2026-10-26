# Native canonical publication facade

Status: PROPOSED SOURCE ONLY. Date: 2026-10-24. Required reviewers: Root,
Semantic Native, Platform Inventory and Trust. Implementation requires their
acceptance and a separately recorded Root source grant.

## Purpose

Connect the existing native preparation, owner grouping and canonical mapping
components through one reusable server-owned context. A successful call must use
the actual ADR190, ADR196 and ADR207 implementations, preserving the deepest
supported semantic path separately from the owner's selected prefix. Reusing a
compiled context avoids numerical recompilation for every page. The facade is
unregistered and cannot change live assignments, discussions or the crawler.

Real study quality remains unmeasured. The real accepted publication registry is
empty. This component authenticates a protected record and its numerical identity;
it neither issues acceptance records nor turns source fixtures into quality proof.

## Scope and ownership

Create only these files under
`apps/local-service/src/application/experimental/native-canonical-publication-v1/`:

- `publication.js`, owned by Platform Inventory.
- `publication.test.js`, owned by Platform Inventory.
- `README.md`, owned by Platform Inventory.

Root owns this ADR, review receipts and front-of-project status. Native reviews
identity domains and actual numerical composition. Trust independently reviews
the complete component and tests. Existing ADR190/196/207 and all consumed study
sources, packages, maps and outputs remain unchanged. No new study copy, model,
capture, training, test-cohort run, DB access, queue, route, registration, service
change or activation is authorized here.

## API and lifetime

The sole export is `createNativeCanonicalPublicationFacade(serverDeps?)`. Its
frozen result exposes synchronous `prepare`, `describe`, `release` and `close`.
The exact privileged dependency record is
`{anchor, readHead, readRecord, readBundle, guard}`. Omitted dependencies select
the empty registry and reject preparation before any callback or compilation.
Dependencies are server composition inputs, never request, environment or
configuration trust flags. Anchor is exactly `{publicationId,recordFileSha256}`.

`prepare` accepts exactly
`{publicationId,observation,ownerGrouping,mapping}`. The latter three are ordinary
ADR190 observation, ADR196 grouping settings and ADR207 mapping-input DTOs. No
request may supply a candidate, accepted record, anchor, path, compiled handle,
prepared job, grouped job or mapped job. Validate the ordinary outer request and
publication ID before trusted ports; malformed OUTER envelopes or unknown
publication IDs must not poison the shared cache or call trusted ports. Nested
observation, grouping and mapping validation may require the authenticated
context and therefore bounded port reads. Such ordinary-input failures remain
request-only: discard a tentative cold context and preserve an established warm
cache. Do not classify them by error truthiness or an attacker-selected error type.

Each facade owns at most one compiled context and 32 outstanding opaque jobs.
Reserve capacity before computation and metadata allocation. `release(job)`
deletes its private retained metadata and credits capacity exactly once; GC
does not grant capacity. Support more than 32 lifetime requests through explicit
release. `describe(job)` returns fresh detached frozen metadata, not a publication
currency certificate; foreign, released or invalidated jobs reject. `close()` is
idempotent and irreversibly invalidates the context and all jobs, including an
inflight call. Close drops private job metadata and cached numerical context;
it creates no reusable capacity after closure. No reset, refresh or retry method
exists.

Reentrant prepare, describe and release during trusted callbacks reject and
invalidate the facade, even if a callback catches the rejection. Reentrant close
is allowed as cancellation, but the inflight operation cannot subsequently issue
a job. Preserve original port-thrown values, including null, false, zero and
undefined. Determine failure handling by call site, never error truthiness.

## Protected record and head

Read ports take the anchored publication ID, not a caller-controlled filesystem
path. `readRecord(id,maxBytes)` and `readBundle(id,maxBytes)` return raw detached
byte snapshots. Trusted ports must be bounded and synchronous. Reject Promise
or thenable results without awaiting or assimilating them; invalidate the facade.
Rejecting an async port does not prove physical work has stopped. A native Promise
rejection observer may suppress an unhandled rejection, but must not grant
settlement, capacity or authority. These are provider contracts, not a sandbox.

`readHead(id)` returns exactly:

```js
{schema:'native-canonical-publication-head/v1',publicationId,incarnation,
 publicationRevision,headRevision,recordFileSha256,status:'accepted'|'revoked'}
```

IDs are well-formed primitive identifiers of 1..160 UTF16 units, trimmed and
without Cc/Cf. Revisions are positive safe integers, not negative zero. The trusted
store must never reuse an incarnation or head revision for an A to B to A change.
Require status accepted on the initial head and bind its complete tuple on first
use. A later absent, changed or revoked head
irreversibly invalidates this facade and its jobs; a new publication needs a new
trusted factory. A fence is the fixed nonrecursive sequence guard, readHead,
guard. Fence before and after each record/bundle read, before and after warm
computation and immediately before issuance; do not recursively fence calls
inside a fence. Guard succeeds only on
primitive true. Head and guard failures are sticky, not request validation errors.

The exact protected record is:

```js
{schema:'native-canonical-publication-record/v1',publicationId,incarnation,
 publicationRevision,
 acceptance:{studyFreezeFileSha256,sourceMapFileSha256,producerRecipeHash,
   trainResultFileSha256,trainSupervisorFileSha256,selectionFileSha256,
   testResultFileSha256,testSupervisorFileSha256,independentQualityAuditFileSha256},
 bundleFileSha256,nativeIdentity,
 mapping:{nodes:[{nativeNodeId,nativeParentId,canonicalNodeId}],
   declaredCanonicalPublication:{builderHash,encoderHash,representationHash,
     modelHash,policyHash,modelId}}}
```

Every hash is lowercase SHA256; `modelId` is
`e5-small-q8-browser-main-prefix-v1`. Acceptance fields are distinct provenance
commitments, not interchangeable identity hashes. A future trusted issuance
workflow must actually audit successful TRAIN/CAL, selection, held-out TEST and
independent quality evidence before installing an anchor. This facade does not
read or validate those external study files, issue anchors or claim their quality.
Invented tests may inject invented accepted records only in isolated composition.

Require `head.recordFileSha256 === anchor.recordFileSha256`, then record
ID/incarnation/revision must
match the head. Authenticate record FILE before JSON parsing, and authenticate
bundle FILE before parsing its candidate. The bundle is the actual existing
native candidate JSON, not a new numerical schema.

## Named numerical identity checks

Let I be the actual ADR190 job's `classifierIdentity` and R its
`rootTransferIdentity`. Protected `nativeIdentity` contains exactly these fields:

| Protected field | Actual identity |
| --- | --- |
| semanticTransferHash | I.transferHash |
| rootTransferHash | I.rootTransferHash and R.transferHash |
| rootModelJsonHash | R.modelJsonHash |
| rootPolicyHash | R.policyHash |
| rootTrainingInputConstructionHash | R.trainingInputConstructionHash |
| rootRepresentationHash | R.representationHash |
| encoderHash | R.encoderHash and I.detailFusionDefinition.encoderHash |
| nativeTargetProducerProfileHash | I.actualNativeTargetProfile.producerProfileHash |
| nativeTargetInputConstructionHash | I.actualNativeTargetProfile.inputConstructionHash |
| detailArtifactHash | I.originalDetailArtifactHash |
| localBuilderHash | I.localBuilderHash |
| detailRepresentationHash | I.detailRepresentationHash |
| detailInputConstructionHash | I.originalNumericalPolicyNamespace.originalArtifactInputConstructionHash |
| topologyHash | actual ADR196 topology identity |

The ADR207 declared canonical publication tuple remains declared and unverified;
do not equate its similar field names with these native domains. Root model JSON
hash preserves original property order through the existing JSON hash convention.
Detail artifact hashing preserves existing sorted geometry and exact raw binary64
LE vector hashes, including signed zero. Bundle FILE is a separate exact byte hash.

Cold preparation validates head, record and bundle, then compiles exactly one
actual ADR196 preparation context. Compile depth8/no-override grouping internally
to check its actual transfer/topology identity. Prepare the observation once through
ADR196 (delegating to ADR190), read the authentic ADR190 description and check ALL
named native identities before projection or mapping. Then compile the requested
owner grouping on that same context, group that actual prepared job and invoke
actual ADR207 mapping and its accessor. Do not modify ADR196 to add an accessor or
compile a second numerical program. Warm calls still check actual ADR190 identity
and trusted head/guard fences. Cache only after a complete successful first call
and final fences. A failed first request discards its tentative context.

Bind cache identity to the complete protected record and head, not bundle hash
alone. Topology must include every native root and detail node, including roots
outside the local-detail scope. Preserve the existing 143 actual maximum union
(144 conservative bound), depth8, full semantic path, owner-selected prefix and
all conflict/abstention reasons. No flattening or threshold retuning is allowed.

## Codec and retention bounds

Record bytes are limited to 256KiB and bundle bytes to 16MiB. Detach raw bytes
without invoking provider hooks, species, coercion, iteration or serialization.
Use safe intrinsic typed-array copying after proxy/type and byte-length checks.
Hash the detached snapshot before decoding. Decode strict UTF8; reject BOM and
malformed Unicode. Before JSON.parse, reject duplicate DECODED property keys,
including escaped aliases. Bounds are depth16, 1000000 lexical tokens, 32 keys
per object, 512 items per array, 4096 decoded UTF16 units per string and 64 ASCII
characters per number token; numbers must be finite. Record encoding is canonical
compact JSON metadata; bundle whitespace and numeric -0 are allowed. Never
stringify/reparse the bundle to detach or canonicalize it. All actual native
compiler geometry, vector and norm limits remain unchanged.

Retained job metadata is at most 16KiB. A larger exact description is a request
capacity refusal: never truncate it, roll back the reserved slot and retain any
established warm cache. Descriptions contain only:

```js
{schema:'native-canonical-publication-job/v1',
 publicationBinding:{publicationId,incarnation,publicationRevision,
   headRevisionAtIssuance,recordFileSha256,bundleFileSha256},
 nativeIdentity,mapping,recordBindingHash,
 evidenceScope:'unregistered-source-only-record-binding',
 publicationVerified:false,canonicalAuthority:false,queueAuthority:false,
 assignmentAuthority:false,productionValidated:false}
```

`mapping` is the detached actual ADR207 description; preserve all its false flags
and null registry hash. `recordBindingHash` hashes all preceding description
metadata in the documented exact order, excluding itself. Neither jobs nor cached
metadata retain raw text, URLs, vectors, full native witnesses, bundle buffers,
candidate JSON, prepared/grouped jobs, exceptions or callbacks. The facade cache
may retain its compiled numerical context and detached authenticated record/maps.
Logical bounds are not a V8 heap guarantee.

Head fences establish only an issuance snapshot. Future transactional canonical
admission must recheck actual current publication, Source generation/incarnation,
prior decision, principal, native proof and rights in its transaction. Request case
IDs, nonces, owner revisions and declared ADR207 Source fields cannot replace those
checks. No authenticated owner-setting claim or current DB admission follows here.

## Required executable evidence

Use newly authored small invented axis fixtures with actual ADR190/196/207 calls,
not saved models, live content or copied classifier arithmetic. Run sequentially
with the external-capability guard and initially 64MiB Node heap. If genuine source
fixture needs exceed that heap, report and review before a bounded adjustment.

Cover default-empty denial before ports; exact schemas and zero-hook malformed
inputs; hash-before-parse; strict UTF8/BOM/decoded duplicates and codec limits;
all named identity substitutions; root property-order and signed-zero domains;
actual same-context pipeline; full143-node topology and depth8/not9; owner depth
and branch cuts; preserved conflicts and unresolved states; canonical compatibility
remaining false when applicable; no serialized-job/foreign-job acceptance;
head changes/revocation/ABA; guard and falsy port failures; async ports/reentry;
failed-first-call isolation; close and released-job rejection; detached privacy;
32/33 capacity, release/reuse and at least128 sequential released requests proving
record/bundle read and numerical compilation once. Measure cold versus warm
prepare and describe separately without flaky timing thresholds or capture/E5/UI
latency claims. Import must start no external activity.

Source acceptance requires Root integration, Native identity review and independent
Trust review of the complete current three files with reproducible tests. Actual
quality, record issuance, transactional ingestion and live activation remain
separate gates under the original product goal.
