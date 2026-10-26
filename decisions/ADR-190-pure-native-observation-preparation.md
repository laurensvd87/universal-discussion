# ADR190 Pure native observation preparation

Date: 2026-10-23. Status: Root and independent Trust accept the complete
unregistered source component. No activation or ingestion authority is granted.

## Purpose and scope

The numerical native root/local-detail classifier and scoped PostgreSQL queue
prototype exist separately. An application boundary must join exact observed
fields to the numerical input before a future authenticated ingestion adapter
can use it. This step adds only synchronous, unregistered preparation. It does
not publish an artifact, enqueue a job, load files, capture a page, encode text,
open a database, register a route or change the running application.

Do not invent the queue's five published artifact hashes or producer proof from
the numerical transfer hash. The current classifier binds supplied program
artifacts and caller-declared observation data; it does not attest browser reads,
rights, text-to-vector provenance, freshness or canonical authority. Registry
mapping remains null. Actual quality and later authenticated ingestion are
separate unfinished gates.

## Closed pure interface

Create exactly three new files under
apps/local-service/src/application/experimental/native-scoped-preparation-v1:
preparation.js, preparation.test.js and README.md. Matcher owns them; Root owns
this decision and integration. No existing or consumed source file is edited.

Compilation accepts exactly {schema:'native-scoped-preparation/v1',candidate}.
Delegate to the actual compileNativeRootLocalDetailTransfer and retain its full
describe identity in a private WeakMap-backed opaque handle. Do not rewrite the
artifact or its input namespace, rerun training, retune cuts or relabel identities.

prepareNativeScopedObservation accepts the private handle and exactly:
{schema:'native-scoped-observation/v1',rawTitle,effectiveTitle,body,
extractorVersion,nativeWitness,rightsEvidenceHash,bodyVector,titleVector}.
All records, arrays and nested metadata must be descriptor-safe detached data;
reject proxies, accessors, malformed prototypes, extra fields, promises and
coercion hooks without invoking them. Preserve existing finite limits.

Body is a well-formed string with body.trim().length>0 and at most4096 UTF-16 units; raw and
effective title are well-formed strings of at most200 UTF-16 units, with effective
title nonempty. Hash the exact UTF8 strings and count UTF-16 length using the
existing producer convention. Require effectiveTitle to equal rawTitle.trim()
or, if that is empty, the source URL hostname, exactly as trim-or-hostname/v1.
Do not truncate, normalize whitespace/content or Unicode, replace invalid
surrogates, or substitute another title. Existing permitted content/control
rules remain unchanged: reject the native collector's exact pattern
`/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u` in all three
strings, preserving TAB, LF and CR. Hash the original body and raw title, not
their trimmed forms.

Derive only the numerical observation sourceId from nativeWitness.caseId and
sourceVersion from observationNonce. These are not allocated canonical Source
IDs or historical Source versions. Producer/profile/construction come from the
compiled target, never caller-supplied overrides. Recompute fieldBindings and
sourceInputHash through the actual native preparation API, then classify the
same exact privately copied pair through the actual composed classifier once.
Retain its decision, supported path, reason and witness unchanged. Malformed
native input throws; root abstention or detail conflict retains its actual
existing outcome, never a fabricated assignment.

Independently report each private384-vector's compatibility with the existing
repository norm predicate abs(Math.hypot(...vector)-1)<=1e-9. This is only norm
compatibility, not complete queue or admission eligibility. Native-valid vectors
outside that stricter tolerance may report false; never renormalize or alter the
numeric decision. Preserve all binary64 bits and signed zero. Existing numerical
little-endian commitments are not PostgreSQL array_send hashes. Do not import
the repository, database or filesystem merely to compute this pure predicate.

## Private prepared description

Return an opaque prepared job. describeNativeScopedObservation accepts only a
private job and returns frozen detached data with these exact fields:

- schema:'native-scoped-prepared-observation/v1'.
- classifierIdentity: the complete actual compiler description.
- nativeObservationIdentity: {caseId,observationNonce,sourceInputHash,
  nativeWitnessHash,rightsEvidenceHash,fieldBindings}.
- decision: the actual unchanged composed classifier result.
- queueNormCompatibility: {schema:'scoped-repository-vector-norm-compatibility/v1',
  bodyCompatible,titleCompatible,compatible,scope:'repository-vector-norm-only',
  noNormalization:true}.
- registryMapping:null, nativeAttested:false, canonicalAuthority:false,
  queueAuthority:false, productionValidated:false.

Do not retain raw text, the vector arrays or the full URL-bearing native witness
in the prepared description or private job. The job owns only its frozen
description, not an indirect input/vector/witness or compiled-state closure.
The separate compiled handle may retain its numerical program. Do not add document hashes, SQL wires,
allocated IDs, operation/generation/principal fields, producer proofs, callbacks,
allocation/time dependencies or an asynchronous dispatch method. These inputs
must not manufacture a grant. No logging, persistence or external output is added.

A later separately reviewed boundary must validate actual registry publication,
producer/session/principal/rights, Source incarnation and lifecycle at dispatch
and commit. It cannot reuse a numerical or study witness as a write grant after
an await. Owner granularity and ancestor feeds also remain separate work.

## Required checks and acceptance

Use invented geometric artifacts and exact actual numerical components, with no
real model files, capture, encoder, database or provider. Cover effective/raw title
distinctions, hostname fallback, astral Unicode counts, exact UTF8 hashes, forged
handles, unknown authority fields, unsafe nested inputs, caller mutation isolation,
signed zero and norm boundaries. Check real root abstention, same-root refinement
and detail conflict without rewriting their outcomes. Same content under a new
nonce retains field hashes but changes observation identity, without claiming a
stable canonical material hash. Verify the description contains neither raw
text, vectors nor the full witness and imports have no side effects or forbidden
database/queue/IO dependencies.

Focused tests may run sequentially under a tighter small heap to limit source-test
memory. They do not change any actual-study reserve, model, capture or permission
gate. Root and independent Trust acceptance are required before this source slice
is called complete. No serving activation or database write follows.

## Source acceptance

Matcher implements exactly the three new files; all existing code, consumed
study sources and runtime remain unchanged. Root and independent Trust read the
complete implementation, tests and README and accept the actual-component
delegation, exact text joins, detached pair and description-only job retention.
Focused tests pass8/8 under the64MiB heap and external-capability denial guard:
owner108.2581ms, Root125.5358ms, independent139.9069ms. These are invented
geometric consistency tests, not semantic-quality or serving-latency evidence.

The component provides a tested preparation seam, not the missing authenticated
enqueue adapter. Published registry identities, live producer issuance and
revalidation, canonical adoption/update, ancestor feeds, owner controls and
actual UI/quality validation remain separate unfinished integration work.
