# Topic event v5: partial offline result, not an activation candidate

The frozen `matchEventV5(sources, facets, idf)` returns `{ partitions,
relatedEdges }` for Source-like records whose `embedding.values` are ephemeral
title-plus-384-character-lead E5 vectors. It is a research diagnostic. It
does not change the live extension, service, database, Topic or discussion
routing. `idf` is accepted for adapter compatibility; v5 uses uniform token
weights, so it carries no synthetic vocabulary into a future product.

The v5 pair model has eight numeric features: focus cosine, reciprocal rank,
number of independently named/common-host-filtered neighbors, unweighted
token overlap, shared capitalized title anchor, strongest shared-neighbor
similarity, and each endpoint's gap to its best neighbor. A tiny logistic
model was fitted on the English and five-language **training** families only.
The cutoff `0.5363159362806821` is above the highest negative training pair
score. Complete-link grouping requires every cross-pair to be admitted.
Candidate generation uses reciprocal top three plus exact score ties; that is
a fixed workload shortcut and a known failure for dense Topics. It is not an
identity definition or an acceptable final implementation. Ambiguous
candidates remain in `relatedEdges`.

No page text, learned vocabulary, vectors, URL or account data are persisted
by this experiment. The numeric coefficients alone are in `matcher.js`.
`reranker.js` excludes exact-title and same-host copies from independent
neighbor counts. Reworded syndication on different hosts can still be counted
twice; the copy guard is incomplete. The synthetic extreme-cosine guard and
two-page witness rule came from adversarial toy tests, not the training fit;
their real-world behavior is uncalibrated. Model size is small, but live use
would still require a second retained focus representation and transient
content-facet plan with owner/Trust approval and migration review.

## Reproduce, with external capabilities denied

Run from repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-event-v5/matcher.test.js
node apps/local-service/experiments/topic-encoder/topic-event-v5/reranker-run.js
node apps/local-service/experiments/topic-encoder/topic-event-v5/run.js
node apps/local-service/experiments/topic-encoder/topic-event-v5/title-only-audit.js
node apps/local-service/experiments/topic-encoder/topic-event-v5/growth-diagnostic.js
```

`run.js` hash-checks the frozen Luna train/validation and independently
authored multilingual train/validation JSONL; it does not open Luna TEST,
CHALLENGE or either multilingual holdout. The five focused tests cover
two-page abstention, differently worded evidence, unrelated dense geometry,
seven/twenty-page identical-vector crowds beside adjacent events, insertion
order, and exact-title/same-host copy corroboration.

| Development partition | True pairs joined | False pairs joined | Order stable |
| --- | ---: | ---: | --- |
| English train | 70/84 | 0/3,076 | yes |
| English family-disjoint validation | 24/24 | 0/166 | yes |
| Multilingual train | 50/160 | 0/3,000 | yes |
| Multilingual family-disjoint validation | 21/80 | 0/700 | yes |

All 24 English-train and four English-validation no-match singleton pages
abstained. All 21 multilingual-validation joined pairs cross languages, with
15/64 opposing-view pairs joined. These small synthetic results neither
establish real-page precision nor justify automatic discussion migration.
The optional training script's candidate-pair numbers are higher than whole
partition recall because complete-link can reject a merge even when some
member pairs individually pass.

The representation check found that title-only E5 retrieves a true partner
in the top three for 37/80 multilingual-train and 22/40 validation pages;
title-plus-lead E5 did so for 80/80 and 40/40. Title-only is not a replacement
here. An all-pairs-above-0.84 version eliminated the fixed top-three count,
but with a train-zero-false cutoff it admitted only 1/158 multilingual-train
and 1/80 validation true candidate pairs. Its score distributions overlap too
strongly for this classifier to resolve all nearby event hypotheses.

Most importantly, the variable-vector crowd diagnostic exposes the density
failure: three same-event pages form one group, seven split into groups of
`3,1,3`, and twenty split into **ten** groups, with no adjacent-event mixed
group. Identical-vector toy pages stay together due exact ties, which does
not represent realistic varied E5 outputs. Thus v5 is **not** a solution to
the owner's no-fixed-count requirement. The next design should use adaptive
event-hypothesis exemplar cover and retain support for existing cohort
associations as new reports arrive. It must treat retrieval batches as work
limits, allow arbitrarily many members per Topic, and compare plausible
nearby developments, rather than apply a global outside-neighbor veto.

Frozen source hashes, SHA-256:

```text
matcher.js   605af15dc57db2afe75eb6bd259fd2c0d3634983a00c417c8f3be12f904ef07b
reranker.js  2a7b863bf72df9b598347696707eb6935e454c384b396243ee64772ef23161c8
```

The later independent multilingual v3 holdout remains unread and unscored by
this work. Do not tune these frozen sources on that holdout or present v5 as
production-ready.
