# ADR207 Native canonical hierarchy mapping

Date: 2026-10-24. Status: SOURCE design accepted by Root, Inventory and Trust.
Root authorizes Inventory to implement only the three new files below. Database
access, runtime integration and activation are not authorized by this decision.

## Purpose

The application must retain the deepest confidently supported topic independently
from the owner's discussion grouping. ADR190 prepares actual numerical decisions
and ADR196 projects authentic prepared jobs through owner-wide and subtree depth
settings. This boundary maps their complete hierarchy into declared canonical
node identities and checks exact canonical material compatibility. It neither
admits a Source nor grants a queue write. Actual quality, publication, authenticated
ingestion, ancestor feeds, owner persistence and UI activation remain unfinished.

Create exactly mapping.js, mapping.test.js and README.md under
apps/local-service/src/application/experimental/native-canonical-mapping-v1.
Existing numerical adapters, repositories, SQL, studies and runtime imports remain
unchanged. The scoped repository and native checker are separately frozen by
ADR175 even though they are outside study-v17's128 CODE list.

## Pure synchronous API

Expose exactly three functions:

1. compileNativeCanonicalMapping(template) returns an opaque frozen handle.
2. mapNativeCanonicalObservation(handle, groupedJob, input) returns an opaque job.
3. describeNativeCanonicalMapping(job) returns its detached frozen metadata.

Require exact argument counts, authentic private handles and an authentic ADR196
grouped job obtained through describeNativeOwnerGroupedObservation. Reject forged
or equivalent JSON jobs. Use descriptor-safe exact plain records and dense bounded
ordinary arrays; reject proxies, accessors, extra fields, promises and coercion
hooks without invoking them. No callback, async, filesystem, repository, database,
queue, browser, model, provider or registration dependency is allowed. Reuse the
pure URL policy and actual ADR196 accessor; built-in crypto and util are permitted.

## Complete topology and declared publication

The template has exactly:

```
{schema:'native-canonical-mapping-template/v1', semanticTransferHash, topologyHash,
 nodes:[{nativeNodeId,nativeParentId,canonicalNodeId}],
 publication:{builderHash,encoderHash,representationHash,modelHash,policyHash,modelId}}
```

Hashes are lowercase SHA256 strings. modelId is exactly
e5-small-q8-browser-main-prefix-v1. All five publication hashes are explicitly
DECLARED claims, not renamed transfer/model JSON/detail artifact hashes or a
verified registry identity. registryArtifactHash stays null and publicationVerified
stays false. publicationIdentityChecked also stays false: the five claims are
intentionally not bound to numerical encoder/representation hashes by this seam.
Equal field names do not establish an equivalent publication identity domain.
The later publisher/adapter must define and verify that full identity mapping.
Do not manufacture a database publication hash in JavaScript.

Detach and sort the complete ID/parent map by native ID. Enforce unique native IDs,
injective canonical IDs, known parents, rooted acyclic paths, depth1..8 and1..144
nodes. Native IDs use ADR196's well-formed nonblank trimmed160-unit no-Cc/Cf grammar;
canonical IDs use the scoped repository's128-unit nonempty well-formed no-Cc/Cf
grammar. Recompute the exact ADR196 topologyHash over
{schema:'native-owner-topology/v1',nodes:[{id,parentId}]} with that ordering.
Compilation rejects a different topology hash. A private template identity binds
all mapping entries, semantic/topology hashes and every declared publication claim.

Mapping joins semanticTransferHash and topologyHash to the authentic grouping,
prepared classifier and unchanged decision. Validate and map the full supported
path, its parent chain and selected owner prefix. Do not flatten the template to
the selected depth, discard descendants, switch branches or increase specificity.
Unresolved stays unresolved with empty paths and null primary IDs. Retain mapped
supported and selected paths separately, plus deepest supported and grouped primary.
Owner revisions may change the selected prefix, never the semantic membership.

## Exact observation and bit joins

The input has exactly:

```
{schema:'native-canonical-mapping-input/v1',
 canonicalSource:{expected:{generation,revision},sourceId,documentHash,
                  prior:null|{sourceVersion,witnessHash,decisionHash}},
 fields:{url,rawTitle,effectiveTitle,body,extractorVersion},
 pair:{bodyVector,titleVector}}
```

Canonical generation, revision, sourceId, documentHash and prior are DECLARED.
They do not prove a current database incarnation, native document identity or
addressed historical Source version. Never derive them from caseId, nonce,
documentId or numerical hashes. No operationId/topicId/discussionId/createdAt,
principal, producer proof, allocation callback, authority or dispatch option is
accepted. Bound all primitive strings and nested inputs before hashing.

Require body/raw/effective fields to meet unchanged ADR190 native string rules,
exact UTF8 hashes and UTF16 lengths in nativeObservationIdentity.fieldBindings.
Join URL hash to sourceUrlHash in the actual numerical
decision.witness.nativeDocumentIdentity; join extractorVersion to its actual
witness. Require trim-or-hostname title equality without truncation, whitespace
or Unicode normalization. A hash/identity/field substitution is fatal.
The authentic native job may bind a different document URL whose navigation
policy minimizes to this Source URL. Do not require sourceUrlHash to equal
documentUrlHash or ask for the full document URL; that would reject supported
tracking/session minimization. Its existing document URL hash may remain metadata.

Copy both dense ordinary384 finite binary64 vectors. Match actual
decision.vectorBindings encoding ieee754-binary64-little-endian/384/v1 and its
bodyVectorHash/titleVectorHash through the EXACT native domain
builder-root-input-vector/binary64-le/384/v1 followed by a NUL byte and384 LE
doubles. Preserve every bit and signed zero; never normalize. Vector bindings
are in decision, not nativeObservationIdentity. A mismatched pair is fatal.

## Canonical material compatibility

After all native joins, compute separate finite compatibility flags. Native-valid
but canonical-incompatible data must not be silently rewritten or assigned another
semantic outcome. The material checks are:

- URL: nonempty well-formed string at most2048, no Cc/Cf, HTTPS, exact supported
  inspectPageUrl round trip. Syntactic URL support is not DNS or rights authority.
- Effective title: nonempty well-formed at most200 and no Cc/Cf. Native TAB/LF/CR
  may therefore be incompatible. Body newlines are not incompatible: only its
  hash is transported by the repository.
- Extractor: main-text-prefix/v1, article-container-prefix/v1 or
  crawler-static-html-prefix/v1; modelId is the exact fixed publication claim.
- Pair norm: independently abs(Math.hypot(...vector)-1)<=1e-9 for each field.

For compatible material only, compute exact PostgreSQL array_send wire hashes:
20+384*12 bytes; five big-endian int32 values [1,0,701,384,1], then each big-endian
length8 followed by the original big-endian binary64 element. This hash is NOT
the native little-endian commitment. Do not construct or retain SQL array strings.
Reproduce the repository material JSON in exactly this order:

```
{url,title:effectiveTitle,extractorVersion,modelId,bodyHash,titleHash,
 builderHash,encoderHash,representationHash,documentHash,bodyWireHash,titleWireHash}
```

Return only its UTF8 SHA256 and detached component hashes, never its URL/title
material JSON. When material is incompatible, materialHash and wire hashes are
null; exact native vector/field joins have still been checked.

documentHash is explicitly a lowercase SHA256 string, not a canonical identifier.
CanonicalSource identifiers use the scoped repository's128-unit nonempty
well-formed no-Cc/Cf grammar; expected.revision is a safe integer>=0, including
the repository's existing -0 acceptance. Invalid shapes/primitive declarations
reject. prior is null or an exact bounded data record with SHA256 witness and
decision hashes and sourceVersion as a primitive well-formed nonempty STRING of
at most16 UTF16 units with no Cc/Cf. Reject numbers, symbols, BigInt, boxed strings
and coercion hooks before retention. priorCompatible additionally requires
positive decimal1..16 digits and BigInt<=9007199254740991; do not coerce through
Number or derive a prior version from observationNonce.

The current registry schema represents flat root nodes. currentRootOnlySchema is
false if ANY template node has a parent, even when selectedPath contains only the
root. currentQueueShapeCompatible combines material, prior and root-only shape;
it is not authentication, registry publication, Source freshness or admission
eligibility; it also does not mean encoder/representation identity compatibility
was checked. publicationIdentityChecked:false makes that unperformed mapping
explicit. A false flag does not erase valid hierarchical membership.

## Retained description and authority

The opaque job retains only frozen detached data: template/publication claim
identity, actual observation/semantic/grouping hashes, declared canonical target,
mapped supported/selected paths, field/vector/wire/material hashes and finite
compatibility flags. Define the exact output keys in source and tests before
acceptance. Keep nativeAttested, publicationIdentityChecked, publicationVerified, canonicalAuthority,
queueAuthority, assignmentAuthority and productionValidated false;
registryArtifactHash is null. Labels must distinguish declared from verified.

Do not retain raw text, URL, vector arrays, SQL, command parameters, full prepared
or grouped description, full numerical/native witness, producer proof, principal,
context, classifier, callback, IO handle or closure over transient inputs. A
template handle may retain only its detached mapping and claims. Return no
capability other than read-only metadata. Imports are default-inert.

## Checks and ownership

Inventory owns the three new files only after Root, Inventory and Trust accept
this design; Root owns the ADR, integration and evidence. Trust independently
reviews implementation and runs focused checks; Root independently reads and tests
the final implementation. Use actual190/196 components with invented geometric
artifacts, fields and vectors only. No real page/model/artifact/DB IO occurs.

Cover broad/specific/subtree policies on one prepared job with identical semantic
membership and material hash, exact full parent topology, mapping collisions,
cycles/depth/144 bounds, cross-template/job forgeries, all native joins, raw vs
effective title, fallback/astral strings, signed-zero and one-bit substitution,
native and PostgreSQL hash distinction, norm boundary, TAB/LF/CR title vs body,
URL minimization/roundtrip, both actual native extractor variants, prior limits
and -0 revision. Use a real196 observation whose document URL contains an allowed
tracking query but whose Source URL does not; update its foreground metadata
consistently. The current native compiler admits only main-text-prefix/v1 and
article-container-prefix/v1. Its authentic job cannot reach the repository's
crawler-static-html-prefix/v1 variant; test crawler/unknown input substitution
as a fatal native extractor mismatch, not a fabricated positive job.
Check unresolved/conflict paths, caller mutation isolation, frozen detached jobs,
no raw retention and hostile nested inputs with zero hooks. Compare the pure wire
algorithm to an independently coded exact binary fixture, without importing the
IO-bearing repository. Match actual repository material ordering with a fixed
gold hash. Measure repeated precompiled map/group work separately from fixture
construction under a64MiB external-capability-denied test run; such invented
timings are not real serving or UI latency evidence.

No runtime import, registry write, DB change, native capture, E5, provider call,
crawler restart or deployment follows. Actual native quality and a separately
reviewed hierarchical registry/ingestion adapter remain required for live use.
