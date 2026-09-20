# Phase 0 story-cluster label schema

Version: `editorial-story-cluster/1.0.0`

Scope: project-created synthetic, English-language editorial article metadata. The pilot contains no copied article text, real personal data, live fetches, or provider output.

## Topic boundary

A Topic is a time-bounded cluster about one atomic factual development. Two Sources are `same-topic` only when they report substantially the same action, occurrence, decision, release, result, or disclosure and a reader can enter one Discussion without confusing chronology or outcome.

The initial time presumption is 72 hours between publications. Time is a guardrail, not merge evidence: later verbatim syndication may remain the same Topic, while a new outcome or material state change is a different Topic even minutes later.

Include in one Topic:

- verbatim or near-verbatim syndication of the same development;
- publisher URL variants that preserve the same article;
- rewrites whose central factual development and outcome are unchanged; and
- minor corrections that do not change the event identity or outcome.

Keep separate:

- a later decision, result, launch, verdict, landfall, certification, regulatory action, or other material state change;
- background, analysis, reaction, or a recurring story about the same entity when it centers on a different development;
- articles sharing a title, entity, or keywords but not the same atomic development; and
- uncertain pairs until adjudicated. Similarity, title equality, publication proximity, or shared entities are never sufficient alone.

## Pair record

Each pair references two bounded Source records and records:

- a stable pair and case-type identifier;
- the primary `same-topic` or `different-topic` decision with reviewer and rationale;
- an optional independent secondary label, reviewer, date, blinded-review method, and rationale;
- explicit synthetic provenance and stable gold cluster identifiers; and
- only the metadata needed to make the synthetic case understandable.

Secondary disagreements are retained in the evaluation report. They are not silently overwritten. This pilot has no unresolved pair: a future real corpus must add an adjudication state and exclude unresolved labels from threshold tuning/testing.

## Required pilot mix

| Case type | Count | Gold label |
| --- | ---: | --- |
| Duplicate/syndication positive | 8 | `same-topic` |
| Same-entity/title hard negative | 8 | `different-topic` |
| Update/continuation boundary | 4 | `different-topic` |
| Unrelated control | 4 | `different-topic` |

The 24 pairs must span at least eight gold clusters, and at least five pairs (20%, rounded up) require independent secondary review.

## Deterministic baseline

The dry-run baseline predicts `same-topic` only for an exact normalized URL or equal synthetic SHA-256 fingerprint. Conflicting fingerprints fail separate. Titles and summaries are never baseline merge signals.

The expected pilot matrix is TP=4, FP=0, TN=16, FN=4: precision 1.0, recall 0.5, specificity 1.0, and accuracy 5/6. This checks the evaluator and demonstrates the conservative deterministic floor; it is not semantic-quality evidence and cannot satisfy the Phase 1 automatic-join gate.

## Evaluation report contract

The pure evaluator returns a versioned, deterministic report. It includes the
confusion matrix; precision, recall, specificity, and accuracy; two-sided 95%
Wilson score intervals for those binomial proportions; binary-classification
coverage and abstentions; automatic-join evidence counts; and offline resource
accounting. A metric and its interval are `null` when their denominator is zero
rather than treating absence of evidence as a perfect result.

The automatic-join evidence count is the number of pairs predicted
`same-topic`. Gold clusters touched by those decisions are deduplicated, so
multiple decisions within one story do not masquerade as independent story
evidence. The report compares these counts with the predeclared P1.4 minimum of
60 join decisions across 20 held-out clusters and records why this pilot is
insufficient. It does not turn those thresholds into a quality claim.

The command-line runner adds a separate `execution` object with monotonic
in-process evaluation time, time per pair, Node version, platform, and
architecture. File reading and JSON parsing are excluded. Runtime values are
environment-dependent observations, not deterministic snapshots or a
performance guarantee. `resourceAccounting` records zero provider calls and
zero external cash cost for this local evaluator; developer time and machine
cost are not estimated.

This pilot has full binary coverage and no abstentions because the exact-signal
baseline always returns one of the two labels. It is not a tuning/held-out
split, and no story-cluster bootstrap is reported. Those require the larger
P1.2 corpus and a predeclared cluster-separated split/resampling contract;
naive pair resampling would understate within-story dependence.

`CORPUS_SPLIT_CONTRACT.md` and `pilot-split-dry-run.json` now make that
structural contract executable. The dry run groups the pilot into four
dependency blocks and tests corpus binding and leakage rejection, but both
partitions are deliberately role `dry-run`; neither is held out.

The deterministic whole-block bootstrap engine is covered by synthetic matrix
tests but is intentionally not run as a pilot quality report. Its existence
does not replace the larger corpus, a pre-result split/policy freeze, or the
independent P1.2 gate.
