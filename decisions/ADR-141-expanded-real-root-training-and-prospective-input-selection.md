# ADR-141: Expanded real training and prospective input selection

Date: 2026-10-20. Status: prospective protocol and labels reviewed; implementation
still requires review before freezing or execution. No runtime activation is
authorized by this ADR.

## Motivation and limits

ADR138's real root model ranks 29/32 consumed development articles correctly,
but the ADR140 acceptance cut covers only 12/32. Its three training examples per
root do not cover the different meanings of broad topics. Inspection of saved
inputs also exposes maintenance banners and infobox text before article prose.
Neither finding establishes that a particular new construction will win.

Compare six predeclared compact affine root classifiers, not UMAP/HDBSCAN,
catalog-wide nearest-neighbor search, an LLM classifier or a forced closest root.
This experiment addresses broad semantic routing. It does not by itself replace
canonical admission, prove historical root inputs, or validate the entire topic
hierarchy. Root-only gold must never become invented negative child labels.

## Data and prospective separation

The proposed metadata file is
`apps/local-service/data/hierarchy-root-expansion-candidates-adr141.json`, initially
SHA256 `4c74ade125605bb41f3073803279ff9f96eb143d88b97f4ea373677b3b30aeca`.
It contains 80 TRAIN articles: five different entities/semantic modes per existing
experimental root, exactly one each in English, German, Dutch, French and Spanish.
There are 32 new prospective final articles, two per root. Primary article text
was opened to curate labels before any model result; short paraphrased evidence
and pre-scoring substitutions are recorded. Root and independent review checked
all112 compact subject rationales/paths, counts, exclusions and hashes; curator
article-reading provenance was not independently reverified by reopening articles.
The separate `hierarchy-root-expansion-label-seal-adr141.json` freezes the candidate
byte identity for this offline experiment without editing its proposed metadata or
claiming owner approval of the experimental taxonomy.

Use all 48 complete ADR138 TRAIN rows plus all 80 new TRAIN rows: 128, eight per
root. Reuse all 48 complete ADR138 CAL rows for model/input selection and acceptance
cut fitting. Both previous capture views and vector packets are already complete;
this declared whole-cohort reuse is not splicing failed capture prefixes. The old
32 final rows are consumed development data and are NOT opened by this experiment.

Only the new 32 rows are prospective final evaluation. Seal their metadata before
training or selection. Their public content is captured and encoded only after an
exclusive persisted selection receipt fixes model, input construction and cuts.
No selected final replacement, retry, missing-row removal, fallback view or label
change follows an outcome. A failed collection or resource phase is closed evidence,
not permission to replay it. New protocol/version and review are required for a
concrete repair, preserving prior evidence.

The new cohort is purposive Wikipedia-only, and its selection was informed by old
failures. It is not representative web, independent annotation, unseen-topic or
pretraining-exclusion evidence. Exact URL/title and semantic-entity exclusions are
recorded; broad semantic-family overlap remains legitimate training transfer, not
proof of independence at the topic-family level. Primary-root gold is a pragmatic
routing label, not a claim that every article has only one valid conceptual parent.

## Six candidates, fixed before computation

For each of `current-static` and `wikipedia-prose-lead`, combine separately encoded
title and body using the existing exact paired-E5 adapter with body/title weights
(.75,.25), (.50,.50), and (.25,.75). Keep the frozen packaged multilingual E5 model,
query prefixes, normalization arithmetic, 384 dimensions, and lambda .1 unchanged.
Train only 16 root heads on TRAIN; no synthetic rows or final labels enter training.
Do not pretend different fusion weights have the same representation identity.

For each candidate, compute CAL unique winning root, winning affine score and
runner-up margin. Equal maxima abstain, never lexical tie-break. Reuse the reviewed
ADR140 pooled-cut algorithm unchanged: enumerate observed CAL score/gap cutpoints,
require at least 20 accepted distinct groups and no CAL errors; maximize accepted
correct groups, then prefer higher gap and higher score. If no cut qualifies, that
candidate has a disabled acceptance policy. These are raw scores, not probabilities
or a per-topic precision guarantee. CAL fitting is optimization, not evaluation.

Select by: (1) largest CAL accepted-correct count, (2) largest CAL raw unique-winner
correct count, (3) declared deterministic order: prose-lead .50, prose-lead .75,
prose-lead .25, current-static .50, current-static .75, current-static .25. No final
outcome changes this order. Persist all CAL scores, candidate identities and policy
parameters, with exact selected artifact bytes and complete input-construction hash.
Missing TRAIN/CAL title/body in either view stops selection; no row/view dropping.
Require the complete80 new TRAIN capture and both available body views before
initializing E5: no encoding a known-incomplete successful prefix. Reuse old96
vectors without new encodes. New TRAIN encoding uses at most240 calls (one title
and two bodies per article). After selection, final encoding uses only the selected
body view plus title, at most64 calls for32articles, never an unselected-view rescue.

## Prospective final report

Evaluate only the selected root model and its fixed cut on all 32 new articles,
once. Report raw root discrimination separately from accepted-correct, wrong-root,
unresolved, language and per-root counts. Include every missing capture as unresolved
without replacement. A useful feasibility result requires at least 24/32 accepted
roots and no wrong accepted root; this small purposive gate is not a universal
accuracy guarantee and cannot alone authorize live activation.

Also run the pre-existing frozen C detail model/observed policy under the separately
bound original (.75,.25) representation on the same selected body view, guarded by
the selected root through a NEW separately versioned dual-representation gate.
The old consensus requires equal representations and is left unchanged. The new
gate must require matching exact Source/input/body-view witnesses, bind both model,
policy and representation identities, and only accept a detail path under the same
confident root. Do not silently feed new fusion vectors to old weights or relabel
the old consensus hash. Detail is a secondary diagnostic, not used for
selection. Four reviewed maximum-specificity anchors may measure exact/broader/
wrong-sibling/unresolved; partial path labels only establish positive ancestors,
not that unannotated descendants are wrong. Report those unscored descendants.
Separately assess all reviewed positive prefixes: a predicted broader prefix is
safe, a compatible deeper suffix remains unscored unless maximum specificity is
known, and a divergent known child is a known-prefix contradiction. For example,
Engineering versus Computing contradicts a reviewed Technology/Engineering prefix
even when its terminal specificity is unknown. Do not hide that conflict as an
unscored descendant or use these final diagnostics for model selection.
No aliases, lexical promotions, new child training or adaptive model fallback is
added to this run. Full hierarchical feasibility requires further evidence.

All new final articles belong to the known house roots; unknown-root/OOD rejection
is not evaluated. Only four exact specificity anchors cannot validate general
unknown-child rejection. Even 24 correct accepted examples out of 24 have a roughly
.862 Wilson 95% lower bound: the feasibility gate must not become a 98% claim.

## Execution and safety

Create new opt-in capture-v4 and experiment files; never edit closed V3/ADR139/140
sources or results. Capture exact 80 expansion or exact 32 final cases, using the
unchanged five-origin public DNS/HTTPS, robots/TDM, pacing, byte and attribute caps,
exact known NL robots repair, and quoted transport-metadata pruner. Bind original
and decoded HTML hashes, pruner receipt, title, both texts, policy receipts and the
full input builder; raw HTML is not persisted. Browser extraction parity is not
claimed. No owner profile, account, private text, canonical DB, crawler state or
provider credential is an input.

Freeze exact initial source/input bytes including this protocol before phases;
parse those same bytes, recheck freshness before outputs, exclusive phase markers
and output creation, and stored-only audit after execution. A caller-supplied hash
is identity, not hostile-filesystem or capture attestation. Source publication,
model selection and actual inference evidence remain distinct.

Use reviewed one-thread supervised phases with own-process-tree termination,
1536 MiB RSS and commit limits, physical/commit reserves of 1 GiB, C: 768 MiB and
D: 512 MiB free reserves. Encoding/model phases have 180-second walls; network
capture has its separate bounded 360-second wall. Count training, fusion, scoring
and calibration work separately. Fixed-shape preflight bounds are 35,205,984
training work units for all six fits, 1,769,472 CAL and at most 970,752 final scoring
coordinate multiply-accumulates, 3,440,640 logical fusion/input-validation coordinate
passes and 116,224 rank/fit work units. Enforce aggregate ceilings respectively
80M training, 2M CAL scoring, 1M final scoring, 5M fusion and 1M rank/fit before
the expensive phases, and compare recorded work with the preflight bounds.
The fusion accounting includes both input validations, cosine, weighted sum,
max-scaled normalization and one logical native-hypot input pass; it does not
measure the actual implementation's native-hypot CPU instructions, copying,
hashing, serialization or walltime. No claim that classifier-only sub-millisecond
time includes capture, embedding, queueing, SQL or client delivery. Pure tests,
root review and independent review precede any collection/model execution.

Runtime/API/crawler stay unchanged and advancing. No migration, canonical write,
provider inference, owner-account appointment, restart or public posting follows.
Even a positive result still needs reviewed canonical input witnesses, scoped
concurrency, historical-root treatment, crawler-consumer compatibility, integration,
actual UI/latency tests and a narrow checked activation package.
