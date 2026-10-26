# Independent root/detail transfer adapter (experimental)

This unregistered pure adapter fills a composition gap: the older consensus
requires identical root/detail paired representations and an observed root
policy. The earlier experiment's dual gate accepts caller-supplied paths. Here
the private pooled root transfer scorer and fixed/observed detail policy execute
their own numerical scoring on one shared raw body/title vector pair. Their
weights and derived representation hashes may differ; the raw encoder must match.
No fitting, encoding, IO, runtime registration, owner-depth projection or storage
write is included. Only invented geometric artifacts are used by its tests.

`compileRootDetailTransferAdapter({schema:'hierarchy-root-detail-transfer-adapter/v1',
rootCandidate,detail})` returns an opaque handle. `rootCandidate` is the existing
builder-scoped root-rank compile DTO, unchanged. `detail` is exactly
`{inputDefinition,model,policy,trainingInputConstructionHash}`. All model/policy
validation and coefficient copies are delegated to their trusted owners. Detail
may use fixed or observed policy, selected by strict data-descriptor schema.
The detail forest has at most128 nodes, depth8, and exactly the root scorer's
2–16 root IDs. Unsupported schemas, identities and differing encoders fail closed.

`describeRootDetailTransferAdapter(handle)` gives immutable adapter, root-transfer
and independently declared detail-transfer identities. Program JSON artifact
digests are not file-byte hashes or evidence of actual training/calibration.
Detail's training construction remains separate from both target profiles. Those
targets are an explicit **unvalidated transfer declaration**, not evidence that
detail quality was tested on either producer. Existing root policy development
flags remain intact. No child-quality claim follows from root acceptance.

`classifyRootDetailTransferAdapter(handle,input)` takes exactly the root scorer's
input fields plus `bodySha256,titleSha256`:

    sourceId, sourceVersion, sourceIncarnation, producerId,
    producerProfileHash, inputConstructionHash, extractorVersion, inputHash,
    documentWitness, bodySha256, titleSha256, bodyVector, titleVector

There is no separate detail input, score or path. The root scorer validates the
actual producer/extractor/document contract and privately copies both384D unit
arrays. A unique accepted root is required first; root abstention/zero fusion
never evaluates detail. If detail is unavailable, unresolved, root-only or on a
different root, the independent root is retained. Only detail's already-accepted
same-root path can refine it. Ambiguous detail children stop according to that
policy; this adapter cannot invent children or force a nearest leaf.

Both fusions use the same exact raw arrays through the existing paired adapter;
there is no implicit endpoint normalization. Validated input-vector hashes and
the derived detail-vector hash use explicit little-endian binary64, including
signed zero. `captureWitnessHash` binds those bits to the common source/document
claims and supplied title/body hashes. Text hashes, source versions/incarnations
and document IDs remain caller identities—not capture provenance, current-state
freshness, rights/native authentication, canonical Source existence or write
authority. A mismatched declared producer/profile is rejected; an arbitrary
but well-formed new caller incarnation cannot be proven stale without an
authoritative external current-state check.

Output is frozen, with `supportedPath`, selected node, actual root/detail work,
shared witness/bit bindings and both transfer identities' hashes; no vectors,
raw scores or probabilities. The upper bounds are144 head dots/55,296 coordinate
products,64 root-rank comparisons and6,144 logical fusion coordinate visits.
Counters do not measure all validation, copying, hashing, native-hypot or policy
traversal CPU. No caches, hidden inference or approximate retrieval are used.

This does not bridge into experimental SHADOW storage. That store separately
checks current revision and Source hash/incarnation before commit/bind and keeps
canonical destination plus semantic root bindings immutable. This adapter does
not supply that transaction/current-state proof, create a Source witness, move
historical discussions or broaden assignment authority.

Run only the geometric suite:

    node --test --test-isolation=none adapter.test.js

Actual root/detail artifacts, public/owner inputs and model assets are not
loaded by that suite. Production validation and assignment authority stay false.
