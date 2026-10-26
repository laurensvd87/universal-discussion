# ADR-124: Hydrate Related metadata before exact AI-context validation

Date: 2026-10-15

Status: Implemented, independently reviewed and active.

## Evidence

The owner reports an accepted `@ai` question without an answer and the generic
"Research did not complete" message after clicking the AI button. The service
is connected, but records no provider generation attempt since its restart.
Read-only public metadata confirms one new accepted human mention; no message
body, account identity or page URL was printed or retained for diagnostics.

A single repeatable-read, read-only snapshot of that post's originating Source
reproduces a deterministic defect at revision17,059: the real client context
contains two Related Sources, while the server's reconstructed context contains
zero. Both Related results exist, but both catalog metadata rows are absent from
the server Insight bundle. This is not a global revision race or a DB-lock error.

ADR-121 fixed metadata hydration in `enrichmentBundle`, but not `insightBundle`.
The client now correctly selects those verified Related links; the server's exact
rebuild therefore rejects the valid request before provider dispatch. The generic
client message also covers earlier failures and does not prove research started.
The earlier successful live AI test did not cover this fully enriched path.
Without the owner's original HTTP trace, this does not identify every historical
generic failure's cause.

## Decision

Reuse the existing `catalogWithOptionalMetadata` hydration for the Related-enabled
Insight bundle, in its same pinned read snapshot. Add only actual Related result
IDs to the base catalog, with the same Source/link/membership/receipt mirrors,
original fixed-reference closure, 500-Source/Topic and byte limits as enrichment.

Missing, corrupt or oversized metadata rejects before dispatch. There is no
optional catch, partial-context fallback, relaxed equality check or automatic
retry. `includeRelatedSources:false` retains its original base context and skips
the exhaustive Related scan and extra hydration. Source/Topic membership,
thresholds, exclusions, native document/account authority, question-language
policy, selected message proof, research permissions and one-shot sharing stay
unchanged. Private questions use this same public-context validation without any
private catalog expansion. Prior/alternate-only closure edge cases beyond this
Related defect are not newly claimed solved.

## Verification

The new synthetic regression uses real PGlite storage, enrichment DTO validation,
client `buildInsightContext`, canonical service and AI runtime with an inert
provider adapter. Against the old checked facade it fails at the exact context
comparison with `ServiceError: Invalid request`, at the identical generation and
revision. With the repair it passes. It also covers actual human-root followup,
valid Related exclusion, forged Related/current titles and unknown exclusion
rejection, exhaustive corruption rejection and the Related-disabled path.

Full portable114/114, focused backend39/39 and final extended regression2/2 pass.
Independent integrity review and its16 focused checks pass. No provider call,
new post, failed-request replay or owner-profile browser operation was made.

The owner-local read-only native comparison now has exact client/server context
equality, two selected Related Sources on both sides and zero missing metadata,
including alternate presentation enabled (candidate revision17,072, active17,088).
This is preflight/context proof, not a new real model-answer quality test.

## Activation

Only the reviewed `portable/canonical-v4/read-facade.js` was overlaid. Manifest
comparison proves all other1,355 checked files unchanged; old code/manifests are
retained in ignored `data/runtime-backup-adr124-20261015`. No owner database
restore/migration, credential rewrite or unrelated dirty work was activated.

Seal: `2a34c2fdb96a2c65bec3fa59f9fa1b28cb24d3c841ffd1fc3e3f5b3437a676c2`,
1,356 files /15,250,068 bytes. Only HTTP service restarted, now PID9608.
Crawler30932, worker22884 and dashboard6644 retain their start times. Pairing hash
is unchanged; provider sign-in remains connected; service stderr is empty.
Saved discussion read143ms;100read requests allHTTP200 in594ms. Crawler advances
to13,439completed durable jobs plus a current lease at revision17,092.

No extension version/reload is needed for this backend-only repair. Close/reopen
the panel to renew its current context; app sign-in may need normal renewal after
the restart. Existing failed requests remain terminal; any new AI request must
be a fresh deliberate owner action, not an agent-initiated retry.
