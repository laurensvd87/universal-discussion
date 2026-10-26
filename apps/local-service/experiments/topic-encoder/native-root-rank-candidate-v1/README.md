# Native root-rank candidate (ADR150)

Unregistered, source-only ROOT classifier wrapper. It imports only pure existing
paired-input, paired-linear-head, pooled-rank and production-reader URL-policy
functions plus Node crypto/util. No reader, runtime registration, filesystem,
network, encoder, fitting, account, provider or canonical writes occur here.
All tests use manually authored geometric artifacts, never stored model/data.

Exports: `compileNativeRootRankCandidate`, `describeNativeRootRankCandidate`,
`prepareNativeRootInput`, `classifyNativeRootRankCandidate`, `NativeRootRankError`,
`NATIVE_ROOT_RANK_LIMITS`.
Handles are opaque private WeakMap keys. Compile validates/copies the artifacts;
classification computes real paired fusion, head scores and pooled cuts internally.
There is no caller-supplied score/path seam. The numeric functions and inclusive
score/gap cuts are unchanged; an exact winning tie abstains. Zero fusion abstains
without scoring heads. Returned paths contain at most one root; no child quality
or hierarchical completeness is implied.

## Compile

Exact record:

```js
{
  schema: 'native-root-rank-candidate/v1',
  inputDefinition, rootModel, rootPolicy, trainingInputConstructionHash,
  targetProfile: {
    producerId: 'native-browser-current', inputConstructionHash,
    extractorVersions: ['article-container-prefix/v1', 'main-text-prefix/v1'],
    effectiveTitleRule: 'trim-or-hostname/v1'
  }
}
```

The existing paired model/policy schemas and experimental flags remain unchanged.
All 2..16 heads must be enabled roots. The policy binds the exact model JSON
digest, paired representation and original training construction. The ONE native
target construction must differ from that training construction; it is not
silently relabelled as a training builder. Extractor declaration order alone is
canonicalized. `modelJsonHash` explicitly means SHA256 of the program's
`JSON.stringify` artifact property order, not JCS, file bytes or exact coefficient
bits. Any file-byte attestation must be supplied by a separate reviewed driver.

## Input and identity

Exact classify record:

```js
{
  sourceId, sourceVersion, producerId, producerProfileHash,
  inputConstructionHash, extractorVersion,
  fieldBindings: {
    bodySha256, bodyCharacters,
    rawTitleSha256, rawTitleCharacters,
    effectiveTitleSha256, effectiveTitleCharacters
  },
  nativeWitness, rightsEvidenceHash, sourceInputHash, bodyVector, titleVector
}
```

Source ID equals witness case ID; source version equals the observation nonce
(not a database revision). Body characters 1..4096, raw title 0..200, effective
title 1..200 UTF16 units. This module receives no text and cannot independently
check those text hashes, the actual `.trim() || hostname` transformation, rights
or which producer generated a vector. The separate driver must validate both
actual fields before either is encoded. Each plain dense 384-vector must already
be finite and unit length within the unchanged tolerance; no renormalization is
added here. Vector binding uses actual binary64 little-endian bytes, including
signed zero, under the unchanged `builder-root-input-vector/binary64-le/384/v1`
codec domain. Representation identity still comes from the paired adapter.

The native witness exact field order is:

```js
{
  schema: 'chrome-scripting-native-reader/v1',
  studyId, studyRevision, caseId, ordinal, observationNonce, eventEpoch,
  tabId, windowId, frameId: 0, documentId, sourceUrl, documentUrl,
  foregroundChecks: [beforeRead, afterRead, afterAttest],
  read: {contractVersion:'page-content/1', status:'collected', documentId},
  attestation: {contractVersion:'page-content-attestation/1', status:'attested', url:sourceUrl},
  effectiveTitleRule: 'trim-or-hostname/v1',
  nativeDocumentContinuityOnly: true, canonicalAuthority: false
}
```

Each foreground check is exactly `{windowId,tabId,focused:true,windowType:'normal',
incognito:false,active:true,tabStatus:'complete',sourceUrl,documentUrl,
permissionGranted:true}`. Ordinals are 1..32; epoch is a nonnegative safe integer;
study revision is a bounded opaque ID string. The native document ID follows the
unchanged production reader ASCII contract. URLs obey the reader's pure syntactic
Source/navigation policy, including the exact minimized Source/document relation.
That policy is not DNS, consent or rights authorization. No CDP loader/frame or
Playwright witness is invented.

The wrapper reconstructs fields in the declared order before hashing. With
`digest(x) = SHA256(JSON.stringify(x))`, compute `nativeWitnessHash=digest(nativeWitness)`
and then the exact ordered input identity:

```js
sourceInputHash = digest({
  schema:'native-root-paired-input/v1', sourceId, sourceVersion, producerId,
  producerProfileHash, inputConstructionHash, extractorVersion,
  fieldBindings, nativeWitnessHash, rightsEvidenceHash
});
```

These are caller identity/consistency claims, NOT authentication or an actual
Chrome invocation, freshness lookup, unchanged DOM proof, publisher permission,
native write proof or canonical Source authority. A new internally consistent
observation is not rejected as stale without an authoritative current-state
owner. Compiled identity binds model/policy/encoder/fusion/training/native profile
under a distinct transfer hash. Decision semantic hash binds that transfer,
compact witness and actual vector bit hashes.

Before encoding, call `prepareNativeRootInput(handle, metadata)` with exactly the
classify fields EXCEPT `sourceInputHash`, `bodyVector`, `titleVector`. It validates
and privately copies native/field/profile metadata, returns canonical detached
frozen metadata plus the computed `sourceInputHash`, and performs NO scoring or
encoding. Pass its result plus the two vectors to classify; classification reuses
the same preparation path and rejects a mismatching supplied input hash. This
avoids callers reimplementing object order. The prepared ephemeral metadata DOES
contain the full native witness URLs; only the final decision replaces them with
hashes. Do not retain transient prepared input as a saved decision.

`rightsEvidenceHash` binds the separate driver's complete same-document rights,
main-response and DOM evidence. This module validates only its SHA datatype and
binding, NOT the underlying evidence or rights outcome. The reviewed driver must
validate that complete evidence against the actual native document before
admission. A syntactically valid hash never grants rights or canonical authority.

## Output and bounds

Detached frozen decision: schema `native-root-rank-transfer-decision/v1`,
status `candidate|unresolved`, reason, `supportedPath`, compact `witness`,
`vectorBindings`, `semanticWitnessHash`, compiled `identity`, scoped `work` and
honest experimental/development/unvalidated/production-false/authority-false flags.
No raw text, URLs, input vectors, weights or raw scores are returned. Full native
witness hash and native IDs remain in the compact witness; URL hashes replace URLs.

Caps match the old root wrapper: 16 roots, 6144 head coordinate products and 64
rank comparison units/query, 16384 compile-copy items, compile depth8, vector384,
identifiers160. The reported 3072 fusion coordinate-visit upper bound is scoped
logical work, not all copy/validation/hash/serialization or native Math CPU and
not encoder/capture latency. Strict records/dense arrays reject proxies,
accessors, extensions and unexpected prototypes before invoking caller hooks.

No actual artifact loading/scoring, native capture, E5 call or study phase has
been performed by implementing this module. Source review and a future exact
artifact/profile reuse receipt and independent quality gate remain necessary.
