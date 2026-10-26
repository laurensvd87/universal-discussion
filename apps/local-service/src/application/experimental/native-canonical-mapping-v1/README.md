# Pure native canonical mapping (ADR207)

Unregistered synchronous metadata seam. Import starts no IO, browser, model, DB,
queue, registration or publication. Native quality and product integration remain
unfinished. Existing numerical and repository sources are unchanged.

Three exports only:

- `compileNativeCanonicalMapping(template)` returns an opaque frozen handle.
- `mapNativeCanonicalObservation(handle, authentic196GroupedJob, input)` returns
  an opaque frozen metadata job.
- `describeNativeCanonicalMapping(job)` returns a fresh detached frozen description.

Every function requires its exact argument count. JSON lookalikes are not jobs.
The actual ADR196 accessor supplies the authentic ADR190 prepared observation;
mapping never recompiles, reclassifies or changes its semantic decision.

## Inputs

The template is exactly:

```js
{schema:'native-canonical-mapping-template/v1', semanticTransferHash, topologyHash,
 nodes:[{nativeNodeId,nativeParentId,canonicalNodeId}],
 publication:{builderHash,encoderHash,representationHash,modelHash,policyHash,modelId}}
```

Publication model ID is `e5-small-q8-browser-main-prefix-v1`. All five hashes are
DECLARED, unverified and intentionally unbound to the numerical identity domains.
No equal-looking encoder/representation field name invents that missing mapping.
Sorted complete native topology must hash exactly as ADR196's
`native-owner-topology/v1` ID/parent map. Native and canonical IDs are injective;
canonical IDs use the repository's128-unit grammar, native IDs ADR196's160-unit
trimmed grammar. Bounds are144 nodes and depth8, with known parents and no cycles.
An owner depth cut never removes descendants from the template.

The observation input is exactly:

```js
{schema:'native-canonical-mapping-input/v1',
 canonicalSource:{expected:{generation,revision},sourceId,documentHash,
                  prior:null|{sourceVersion,witnessHash,decisionHash}},
 fields:{url,rawTitle,effectiveTitle,body,extractorVersion},
 pair:{bodyVector,titleVector}}
```

Canonical target fields are DECLARED, not a DB generation, current Source or
native document attestation. They are never derived from case ID/nonce/document
identity. `documentHash` is a lowercase SHA256 string. Expected revision accepts
the existing safe integer>=0 rule, including -0. Prior version must be a primitive
well-formed nonempty string<=16 units/no Cc or Cf; its separate compatibility
flag requires positive canonical decimal and at most9007199254740991.

Actual prepared field hashes and UTF16 lengths must match all three strings.
The effective title is the exact raw-title trim or Source hostname, without
additional normalization. The supplied Source URL hashes ONLY to the actual
Source URL hash. A valid navigation document URL may differ after tracking/session
minimization; no full document URL is requested or retained. Both actual native
extractor variants are supported; substituting crawler-static or unknown for an
authentic native extractor is fatal, not a fabricated positive case.

The raw pair must match `decision.vectorBindings`, including its exact binary64
LE domain and every bit of signed zero. No re-encoding, normalization or old vector
substitution exists. Strict shape/identity/bit failures throw TypeError. Proxies,
accessors, then/toJSON hooks, sparse arrays and wrong prototypes invoke no hooks.

## Canonical compatibility, not ingestion

Native-valid material can fail the stricter canonical checks without changing
its semantic decision: exact HTTPS Source URL roundtrip, effective title without
Cc/Cf, repository extractor allowlist, and both vector norms within1e-9 of one.
Native title TAB/LF/CR may fail. Body newlines do not fail because only its hash
is transported. Prior compatibility is independent of material compatibility.

Only compatible material gets PG `array_send` wire hashes (4,628 bytes each,
big-endian header `[1,0,701,384,1]`, then length8/original binary64 elements).
Those are different from the native domain-prefixed LE hashes. No SQL array
string is constructed. Material SHA hashes exact repository JSON property order:

```js
{url,title:effectiveTitle,extractorVersion,modelId,bodyHash,titleHash,
 builderHash,encoderHash,representationHash,documentHash,bodyWireHash,titleWireHash}
```

Incompatible material has null material/wire hashes, even though all native joins
were checked. ANY hierarchical template makes `currentRootOnlySchema:false`,
including when its owner selects only a root. `currentQueueShapeCompatible` combines
material, prior and root-only SHAPE checks; it is not serving compatibility,
publication identity, authentication, Source freshness or admission eligibility.

## Exact retained description

Top-level keys in order:

```text
schema, templateHash, semantic, grouping, declaredCanonicalSource,
declaredPublication, commitments, compatibility, registryArtifactHash,
nativeAttested, publicationIdentityChecked, publicationVerified,
canonicalAuthority, queueAuthority, assignmentAuthority, productionValidated,
mappingHash
```

`semantic` retains transfer/semantic-witness hashes, status/reason and the complete
native supported path. `grouping` retains grouping/owner hashes, selected native
prefix, separate mapped supported/selected paths, `deepestSupportedCanonicalNodeId`
and `primaryCanonicalNodeId`. Canonical target/publication objects carry explicit
`claimScope` labels. Commitments retain only observation/rights/URL/field/vector/
wire/material hashes and field lengths. Compatibility contains finite flags and
the scope `shape-only-not-publication-identity-or-serving`.

`mappingHash` binds every preceding metadata component in that exact property
order; it is NOT a registry, native, canonical decision or publication hash.
`registryArtifactHash:null`; all seven attestation/identity/authority/production
flags are false. Jobs retain no raw text, URL, pair arrays, SQL, parameters,
principal/proof, full prepared/grouped/native witness, classifier, context or
callback. Handles retain only detached mapping/claims and derived lookup metadata.

## Invented checks

```text
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 apps/local-service/src/application/experimental/native-canonical-mapping-v1/mapping.test.js
```

Fixtures use actual ADR190/196 components with newly authored small axis geometry,
never saved models, real observations or DB inputs. Independent DataView wire/LE
oracles, canonical JSON ordering, owner cuts, full topology, malformed inputs and
all false authority flags are checked. A separate real body-root/title-detail
fusion fixture produces `local-detail-conflict`: its supported root and semantic
reason remain unchanged, and its full hierarchical template is never flattened.
Bounded timing diagnostics separate compile,
precompiled map and describe over128 iterations; fixture creation and numerical
preparation are excluded. These timings establish no capture/E5/SQL/UI latency.
