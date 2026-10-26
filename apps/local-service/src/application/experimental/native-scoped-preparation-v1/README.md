# Pure native observation preparation (ADR190)

Unregistered synchronous application boundary, not ingestion or authority.
Import performs no IO, model loading, E5, fitting, native capture, database,
queue, route registration, publication or dispatch. Supplied artifacts and
observations remain caller-declared; no quality artifact is adopted here.

`compileNativeScopedPreparation({schema:'native-scoped-preparation/v1',candidate})`
delegates the unchanged native root/local-detail compiler and keeps its full
actual describe identity in a private handle. No five-hash registry mapping,
artifact rewrite, refit, retune or producer-proof namespace is invented.

ADR196 adds `describeNativeScopedPreparation(handle)`, returning that exact
already-frozen compiler identity from an authentic private handle. It does not
compile, score, expose a classifier capability or grant authority. Forged handles
and extra arguments reject. The original ADR190 source receipt remains historical;
this accessor and the complete preparation suite require renewed source review.

`prepareNativeScopedObservation(handle,{schema:'native-scoped-observation/v1',
rawTitle,effectiveTitle,body,extractorVersion,nativeWitness,rightsEvidenceHash,
bodyVector,titleVector})` recomputes exact field hashes and the existing native
input identity, then classifies the same private pair once. Source ID is the
declared case ID and Source version the observation nonce ONLY in that numerical
contract; they are not allocated canonical Source IDs or database versions.
Producer/profile/construction come from the compiled native target. The existing
native owner validates/copies all witness metadata, and the existing numerical
owners validate/copy artifacts. Exact records reject unexpected authority fields.

Body must contain non-whitespace text and fit4096 UTF-16 units. Raw title may be
empty; effective title must be nonblank; both fit200 units. All strings must be
well formed and obey the unchanged producer control rules: TAB/LF/CR allowed,
other C0 and C1 controls rejected. Hash ORIGINAL strings as UTF8; count `.length`
as UTF16. Require effective title EXACTLY `rawTitle.trim() || sourceHostname`.
No truncation, whitespace/Unicode normalization or invalid-surrogate replacement.

Preparation returns an opaque job. `describeNativeScopedObservation(job)` returns
only frozen data with exact fields schema, classifierIdentity,
nativeObservationIdentity, decision, queueNormCompatibility, registryMapping,
nativeAttested, canonicalAuthority, queueAuthority and productionValidated.
The first two identities and actual decision are preserved in their original
program-artifact/caller-claim scope. Observation identity contains caseId,
observationNonce, sourceInputHash, nativeWitnessHash, rightsEvidenceHash and
fieldBindings. Registry mapping is null; all four authority/validation flags are
false. The job stores ONLY this description, never raw text, vectors, full
URL-bearing witness, compiled handle, callback or transient-input closure.

Norm compatibility reports bodyCompatible/titleCompatible/compatible using the
repository's exact `abs(Math.hypot(...vector)-1)<=1e-9` predicate on the same
private384-vectors. Its scope is repository-vector-norm-only, with
noNormalization:true. A native-valid pair may report false without altering the
actual numerical decision. Binary64 bits and signed zero stay unchanged. These
booleans do not validate queue text/material/SQL-wire constraints or eligibility;
little-endian numerical commitments are NOT PostgreSQL array_send hashes.

Rights, freshness and text-to-vector provenance are not authenticated. There is
no document hash, stable canonical material identity, operation/principal/
generation/allocation input, producer proof, SQL parameters, enqueue capability,
async method or callback. A later reviewed boundary must independently validate
registry, producer/session/principal/rights and current Source lifecycle at
dispatch and commit. Owner granularity/ancestor feeds remain separate work.

Only invented geometric artifacts/fields/vectors are used by the focused test:

```text
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/src/application/experimental/native-scoped-preparation-v1/preparation.test.js
```

The suite is not semantic quality, real native compatibility, concurrency,
serving-role authority or activation evidence. No actual model/artifact/capture/
database/provider inputs are loaded, and no existing study or runtime is changed.
