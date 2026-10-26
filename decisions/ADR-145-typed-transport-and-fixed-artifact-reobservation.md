# ADR-145: Typed transport refusal and fixed-artifact reobservation

Status: accepted for code-only implementation and review, 2026-10-20.
No capture, receipt creation, freeze, encoding or activation is approved by an
import or default command. Root authorizes each actual phase after review.

## Closed predecessor and purpose

ADR143's single fitter selected .75 body/.25 title using127 TRAIN/48 CAL.
Its original model, policy, fusion definition, numeric cuts, selection receipt,
sources and successful supervisor remain immutable. The final capture stopped
at static batch07 with an unclassified transport failure. Six complete batches
account for24 articles (18 captured,6 unavailable); none were encoded or scored.
The last result cannot identify the failing origin: origin-policy collection for
the four URLs precedes article progress and could have stopped early. Fatal
row025 therefore is not proof of an ECB request failure.
No batch08, browser phase, partial-quality result or old-study continuation.

The fetcher already rejects many ordinary external failures safely. The old
experiment incorrectly treated most of those rejections as a fatal experiment
error. A separate producer version will distinguish a finite set of external
unavailability from programming, security, protocol and resource failures.
This changes failure accounting, not what content may be accepted.

## Fixed reobservation, not a new independent cohort

Reuse precisely the32 candidate URLs/groups/labels and ordinal order sealed for
ADR143. Their availability has been observed. This is explicitly a new complete
reobservation with first semantic scoring, not an untouched independent cohort,
representative-web proof or an extension of the failed study. No replacement,
relabel, old packet/body/vector splice, prefix salvage, request retry, redirect
rescue or post-score exclusion. All32 articles remain each producer denominator.
All source and artifact identities are frozen before the first new request.

Eight fixed four-article static batches precede eight fixed browser batches.
Keep existing15s static requests,360s static Jobs,180s browser Jobs,20s absolute
navigation leases with one matching DCL+2s observation, and all request, text,
decompression, memory, disk, source-integrity and owned-process cleanup bounds.
One classified external refusal produces unavailable evidence, never an input.
Any global/invariant/security/unknown fatal stops this new study; no later batch
or evaluation follows. Unknown failures are not repaired in place after exposure.

## Finite refusal taxonomy

Recognize only a genuine non-proxy `PublicFetchError` with own data-descriptor
code/cause fields. Never infer from a message, stack, substring, generic object's
`code`, or a caught arbitrary exception. Global abort/deadline checks win.

| Fetch code | Required additional condition for unavailable |
| --- | --- |
| timeout | Request-local timeout, not global cancellation |
| http-status | Valid non200 status; retain exact existing404/410 policy-absence handling |
| dns-failed | Own cause code ENOTFOUND or EAI_AGAIN |
| network-failed | Own cause code ECONNRESET, ECONNREFUSED, ETIMEDOUT, EHOSTUNREACH, ENETUNREACH, EPIPE or ERR_STREAM_PREMATURE_CLOSE |
| response-aborted | Direct typed incomplete-response refusal |
| body-too-large, headers-too-large, compression-ratio, content-type | Direct typed representation/capacity refusal |
| content-encoding | No cause (unsupported declared encoding), or own cause code ERR_BUFFER_TOO_LARGE, Z_DATA_ERROR or Z_BUF_ERROR |
| character-encoding | No cause (unsupported declared charset), or own cause code ERR_ENCODING_INVALID_ENCODED_DATA |

Unknown combinations, bare TypeError and accessor/proxy fields remain fatal.
An allowed generic socket code does not establish whether negotiation reached
TLS; concrete TLS/certificate verification or protocol errors remain fatal.
Malformed framing/headers, unsafe or invalid DNS/address/pinning, TLS/certificate
failure, remote-address mismatch, invalid URL/options, source/protocol/Job failure
and request-capacity violations remain fatal. No acceptance limit is increased.

Static transport, representation or rights uncertainty blocks BOTH producers.
It is never converted into policy absence or permission for browser rescue.
Only insufficient extracted text after fully successful static rights checks may
still allow the separately checked browser producer. A browser's own policy,
headers, secure response and DOM directives must still pass independently.

## Browser scope and correlation

Keep `restricted-single-document-dom-reader/v1`, inline scripts may execute,
all external subresources blocked, one-use exact known-main-frame request gate.
`ordinaryDynamicBrowserProducerValidated:false` remains mandatory. No claim of
Chrome DNS pinning, complete OS egress isolation or native extension attestation.

Only an exact currently admitted main Document request/session/frame/network-ID
may produce browser transport-unavailable. Allow only exact Chrome error enums
for name-not-resolved, connection reset/refused/closed/timed-out, timed-out and
address-unreachable. Unknown, TLS, certificate and identity failures remain fatal.
No arbitrary errorText substring matching. Track deliberate teardown/blocked
requests explicitly; a late previous request cannot change a new observation.

## Diagnostic evidence

Record a bounded fixed projection before generic error conversion:
phase, batch, caseOrdinal, originOrdinal, stage, disposition, errorFamily, code,
causeCode and optional valid HTTP status. Ordinals derive from the fixed batch.
For shared origin-policy work, caseOrdinal is null/not-applicable and the actual
in-flight origin/resource is identified. Observer sync/async failure must not
change disposition or print raw errors.
Unknown codes are recorded as `other` while still fatal. Do not store messages,
stacks, URLs, headers, body snippets, addresses, credentials or request IDs in
these diagnostics. A policy failure identifies its actual policy context, not
the first pending result row. Bound event counts/bytes and test sink failures.

## Artifact reuse and new producer identities

No new fit, selection, calibration, fusion choice or numeric-cut tuning.
Keep original fit evidence unchanged. Create a separately named artifact-reuse
receipt binding original successful fit/freeze/selection byte hashes, exact
model/policy/input-definition bytes and their original training identities to
the NEW collector source recipe and two producer profiles. Recompile the existing
private ROOT scorer with those unchanged artifacts and new target profiles to
derive a new transfer identity. This is declared transfer, not proof of quality.
Never rewrite the original selection receipt or pretend it targeted this code.

Fixed new receipt path:
`apps/local-service/data/hierarchy-current-producer-artifact-reuse-adr145.json`.
Root creates it only after pure implementation/independent review. Collector
freezes pin its actual bytes. Profile construction excludes the reuse receipt
and freeze themselves, preventing circular hashes. The collector validates
original successful fit metadata, new identities and the reviewed receipt; it
does not claim that a caller-mirrored receipt authenticates ML mathematics.
The evaluator independently checks actual artifact bytes and compiles the same
transfer identity before any final body is read.

Producer recipes bind the actual new coordinator, policy, manifest, supervisor,
protocol, profile helper and unchanged shared reader/fetch/rights/extractor code.
Literal source closure is fixed; never follow file paths supplied by JSON.
All prior final bodies/vectors/outcomes remain outside the new read allowlist.

## Implementation and gates

New collector namespace: `current-producer-final-v2`, eleven coordinator/policy/
profile/test/documentation files plus two pure artifact-reuse helper/test files.
Existing collector/fitter/evaluator versions stay unchanged. Code-only tests use
invented text, errors, metadata and axes; no real input/model/asset reads.

After complete root and independent review: root creates the reuse receipt and
collector freeze, independently checks source maps, then explicitly authorizes
each fixed capture batch. A later separately reviewed evaluator adapter requires
all16 successful capture metadata/supervisor receipts before opening any new
input body; no partial input gate. At most128 field encodings, no equal-input
reuse, no empty-title or alternate-producer rescue, exact binary64 transport.

Retain the existing small feasibility gate per producer: at least24 accepted,
zero wrong accepted and at least one accepted article per root, full32 denominator.
Also report refusal/encoding availability, conditional correctness, per-root/
language/host and paired counts; never64 independent observations. No child/OOD,
population precision, normal dynamic-browser, canonical or live-latency claim.
Failure is evidence, not permission to relax this gate after outcomes.

The separate canonical Source-local admission prototype is not installed by this
decision. Actual migration/worker/client/native/account/erasure/concurrency/UI
integration and useful child-specificity evidence remain required before rollout.
Keep the existing crawler and API/worker/dashboard running unchanged. No provider
inference, account/bootstrap, historical regroup or credential action follows.
