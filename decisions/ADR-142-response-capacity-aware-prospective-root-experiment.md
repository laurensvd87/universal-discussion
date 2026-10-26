# ADR-142: Response-capacity-aware prospective root experiment

Date: 2026-10-20. Status: prospective design and new implementation reviewed;
actual phases require their new source freeze and explicit supervisor. No
production activation or public posting authority.

## Evidence and why this is a new experiment

ADR141's fixed80 TRAIN collection stopped after38 successful articles at French
Guerre froide with `public-fetch-content-encoding`. No new encoding, training,
model selection or prospective final32 evaluation ran. Preserve that partial file,
all frozen code, labels, receipts and ADR141 unchanged. Its result file SHA256 is
`d6fde88533e56e1edc4c7d01d3558e82b270c2fbb2b7163a39a7c95c62285539`.

A separately reviewed one-URL metadata-only diagnostic observed a NEW HTTP200 gzip
response of398,494 compressed bytes, complete SHA256
`8af40e760bdb34044e48dad400d5e7dbffa8a091a7c86ff81254d7002e697ccd`.
Its typed decoder cause is `ERR_BUFFER_TOO_LARGE`; the unchanged decoder applies
`maxOutputLength=2MiB+1`. This new response exceeds that capacity. Gzip is supported;
this is not evidence to add a codec or relax a guard. Original failed-response
bytes/cause were not retained, so identical historical cause is an inference.
Diagnostic result SHA256 is
`56b72d0adb92630f9fcd3da21255a061cac9e47ad9cb4504a81dec24f9f245b8`;
own Job cleanup/source rechecks passed. Its four source files/results are closed.

The next experiment explicitly accounts for input capacity. It is a deliberate
fresh collection of the same80 URLs under a new prospective inclusion protocol,
not new independent articles or a replay/resumption of ADR141. It is not a
transport repair, a replacement of the oversized article, or evidence
that a public page is permanently ineligible. Eligibility is response-dependent;
size, topic and language selection bias must be reported. No model outcome on the
new32 has informed this decision; their content remains uncollected by experiments.

## Retained method and sealed labels

Keep the exact112 new candidate metadata and separate label seal, all old48 TRAIN
and old48 CAL metadata, experimental taxonomy, E5 assets and frozen C detail
artifacts. There remain208 potential cases:128 potential TRAIN,48 CAL,32 final.
No label, entity, split, title, URL or maximum-specificity annotation is replaced.
The original consumed real32 final is excluded; old CAL is optimization only.

Keep ADR141's six view/weight candidates, lambda .1, pooled score/gap cut, CAL-only
selection and declared tie order. Keep the independently gated fixed C detail
diagnostic using its original .75/.25 representation. Reuse reviewed immutable
pure methods rather than editing their source or silently changing math. A new
namespace/protocol/freeze/result lineage binds the changed collection/training
population; do not call the fitted models an unchanged128-row experiment.

## One complete attempt ledger, unchanged capacity protections

Freshly attempt all80 expansion articles once in the existing fixed order, with
one shared origin policy cache and unchanged robots/TDM checks, pacing, DNS/TLS,
headers/MIME/UTF-8, compression ratio, byte limits, pruner and extractor bounds.
Do not splice the old38 or invoke the old collector once per case. No retries,
alternate URLs, header negotiation changes, decoder fallback or cap increases.

Only a PAGE-fetch/decode exception that is an actual `PublicFetchError` with
`code==='body-too-large'`, or `code==='content-encoding'` and an own typed
`cause.code==='ERR_BUFFER_TOO_LARGE'`, becomes a capacity-refusal ledger entry.
Catch narrowly around page transport, after origin robots and TDM-document policy
checks. Capacity failures of robots/TDM themselves remain fatal. DNS/network,
timeout, abort, redirects, ratio violations, malformed compression, unsupported
encoding, headers/MIME/charset, page-policy, pruning and extraction errors remain
fatal. Do not infer eligibility from arbitrary error strings or broad catches.

A refusal retains case ID/URL, bounded typed reason and applicable origin-policy
receipt, but no text/title/vector or fake Source-input hash. Explicitly state that
page-level headers/directives/content were unavailable and NOT policy-approved;
the current fetcher checks those directives after decode. It grants no Source,
matching, write or provider authority. Successful captures keep all original
HTML/decoded/prune/text/title/policy/input identities unchanged.
If a reused descriptive assessor requires a hash for every row, use a separately
namespaced evaluation-only refusal/missing marker and explicitly record its scope;
it is not a captured Source-input identity and must never enter embedding, fitting
or any application authority path.

Every potential case has an ordered ledger status: captured, capacity-refused,
fatal, or not-attempted after a fatal stop. Complete80 means every one was attempted
and accounted for, NOT80 usable captures. No fatal outcome may be hidden as a
capacity refusal. The future final32 uses the same collection rules and ledger.

## Freeze eligibility before embedding or fitting

Require all old96 TRAIN/CAL captures/vectors complete and unchanged. Require the
new80 attempt ledger complete without a fatal result. Every captured expansion
case must have both views and title; a missing view is a hard failure, not another
eligibility escape. Compute and persist the exact eligible TRAIN IDs/groups and
refusal reasons/hash BEFORE initializing E5 or fitting any candidate.

The effective TRAIN is all old48 plus all successfully captured expansion rows.
Require at least112 total rows and at least6 independent groups per root. If these
conditions fail, stop without encoding/fitting or lowering minima. Use precisely
that same cohort for all six models; no view-specific dropping or balancing after
seeing scores. Report actual root/language counts and unequal priors. Never use
the ineligible gold as negative class training examples or claim a unit vector for
missing content. Training/provenance hashes bind the actual eligible cohort.

Use only new eligible TRAIN title/two-body encodes (at most240 calls); reuse the
whole old96 vectors, not partial old failed data. Bind the eligibility receipt and
capture/encoding hashes into selection evidence. CAL remains complete48. The
selection receipt fixes selected model, policy, both representation identities,
input builder/body view and eligible-cohort identity before new32 content is opened.

## Final accounting and interpretations

Capture/encode the new final32 only after persisted selection. Encode title and
selected body only (at most64 calls), never use the other view as rescue. Every
capacity refusal or missing selected input is unresolved in the full32 denominator,
including raw root discrimination. Report conditional-on-available figures
separately, alongside input availability, all-case accepted/correct/wrong/unresolved,
root/language/refusal counts, four terminal anchors and all positive-prefix
contradictions versus unscored agreeing descendants. No final replacement, dropping,
retuning or model fallback. Non-capacity fatal capture stops that phase; retain the
ledger, do not silently continue to scoring or replay it.

Retain the small root feasibility gate: at least24 accepted of32 and zero wrong
accepted roots. This is not98% precision evidence, representative web, OOD/unknown
root or general child rejection validation. Specificity and actual live integration
remain separate unfinished gates. Report that oversized responses were not handled;
do not equate capacity refusal with an incorrect or out-of-taxonomy article.

## New files, review and resources

Create a NEW capture collector/wrapper and new fixed-path experiment driver/audit
wrapper. Reuse frozen V1 metadata, pure selection/gate/assessment helpers and
unchanged fetch primitives where appropriate; never monkeypatch fs/cwd/env to
redirect old outputs. New allowlists enumerate exact source/reused-input paths,
excluding old real32, private/owner data and arbitrary sibling experiments.

Freeze reviewed exact initial bytes, metadata, protocol, reused source identities
and constructor sources. Parse the same buffers that were hashed; fresh-read at
publication. Exclusive markers and outputs preserve every failed attempt. Source
identity checks are not hostile-filesystem or loaded-native attestation.

The128-row preflight remains conservative for effective112..128 TRAIN: at most
35,205,984 scoped fitter units,1,769,472 CAL and970,752 final coordinate MACs,
3,440,640 logical fusion coordinate visits and116,224 rank/fit units. Preserve ADR141 ceilings
and the distinction from all CPU, native hypot instructions, hashing/copying and
end-to-end latency. Record actual eligible training/scoring work, not assumed128.

Use one-thread owned-Job phases with pre-work handshake,1536MiB RSS/private/Job
commit limits,1GiB host physical/commit reserve,C768MiB/D512MiB free, retained fresh
D: TEMP, bounded outputs,180s model phase/360s collection walls, and verified own
Job drain. No service/crawler/foreign-process operation, model downloads, provider
call, canonical write or owner-account bootstrap. Root and independent code review,
synthetic tests and a new freeze precede a single explicit collection/model run.

Prefreeze implementation review adds fatal deadline/abort checks inside the
narrow capacity catch, including first/final-case regressions. The stored audit
independently links all result rows to actual capture/refusal identities, checks
fixed packet views before any vector-path read, and recomputes full-denominator
availability and conditional metrics. Root's combined97 guarded pure tests pass
(48 new collector/wrapper/experiment checks and49 existing input/head/gate checks).
These are invented-input checks, not actual capture/model accuracy evidence.
