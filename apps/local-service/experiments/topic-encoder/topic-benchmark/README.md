# Offline multi-page Topic benchmark

This benchmark compares complete Topic partitions. Gold `topicLabel`, broad
`family`, and `viewpoint` fields are used only after matching; adapters receive
the same six source fields accepted by the pure production planner. No owner
database or network/provider call is involved.

The adapter strips gold labels and body text before calling the matcher, and
the current baseline passes an empty `sourceLinks` array. Each result includes
a vector audit with the 384D norm range and counts of gold same/different
pairs above the live 0.90 cosine floor. This distinguishes a floor miss from
the competing-page rule when interpreting zero joins.

Run from the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-benchmark/benchmark.test.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/run.js --synthetic
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/run.js --luna
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/run.js --cdec
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/compare-candidate.js --validation
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/compare-candidate.js --validation-title-lead
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/holdout-candidates.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/holdout-multilingual.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/multilingual-neighbor-audit.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/holdout-focus-graph.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/multilingual-v2-neighbor-audit.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-benchmark/holdout-cdec-focus-graph.js
```

`--luna` verifies the frozen train, validation, test and challenge SHA-256s,
embeds all four splits with the packaged body E5 model, and scores each split
separately. Train and validation are diagnostic; challenge labels must never
be used to select a threshold or edit the matcher. `--cdec` scores only the
fixed 48-document CDEC-WN test inventory if its hash-pinned, ignored research
archive is already present locally. [CDEC-WN](https://github.com/adithya7/cdec-wikinews)
(Pratapa et al., 2021) is CC BY 4.0; the local archive SHA-256 is
`7d5b1790145fc0603913aa24b60ce1bd8104196191289363fb6e2eb73c8d346d`.
It labels Wikinews disaster storylines; those labels do not establish atomic
discussion Topic identity or opposing viewpoints.

`--synthetic` scores an invented-vector three-page case shaped like the
observed 0.90963 true pair versus a 0.91400 wrong neighbor. It also scores
seven opposed views of one event, adds two nearby pages about a different
development, tracks the old pairs through every insertion, and measures
8/16/32/64-page planner times. These vectors are geometry fixtures, not E5 output
or evidence about the named real publishers.

`compare-candidate.js` imports the frozen offline candidate in `topic-method`
and scores it beside the current planner on synthetic and Luna validation
only. The title-plus-lead validation mode isolates representation from
grouping and is not the live stored input. Candidate test/challenge evaluation
is withheld because its body-E5 validation
result failed the promotion gate. Synthetic and Luna documents without
publisher metadata receive distinct `.benchmark.invalid` hosts solely to
exercise the candidate's independent-source path. CDEC-WN keeps the common
`en.wikinews.org` host; its single-publisher storylines cannot supply
cross-publisher corroboration.

The later one-shot, hash-checked holdout scripts score frozen retained-data
V3 and the ephemeral focus/facet candidate. [RESULTS.md](RESULTS.md) records
their aggregate results and limitations, including a separately frozen
dynamic-local v4 graph on a second multilingual challenge and CDEC-WN.
The multilingual neighbor audits are descriptive only and do not select a
new join rule. Do not retune a frozen candidate on these scored holdouts.

## Measured checkpoint, 2026-10-08

All checks ran with external capabilities denied. The packaged body E5 model
SHA-256 was `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.
The current planner received empty Source links and its exact production model,
extractor and provenance tags. On the frozen Luna train/validation/test/challenge
splits it joined **0/84**, **0/24**, **0/24**, and **0/48** gold same-Topic pairs,
respectively, with zero false joins. The challenge abstained on all **8/8**
separate-family singleton no-match pages. All **48/48** challenge true pairs
exceeded the live 0.90 cosine floor; so did **22/1,492** different-Topic pairs.
The benchmark does not assign all zero joins to one specific branch of the
planner. It does show that the floor alone is not the reason for zero challenge
recall. The challenge labels were read for baseline evaluation only and were
not used to select or edit the candidate.

The hash-pinned CDEC-WN test subset was available locally. On its 48 articles
and 15 Wikinews storylines, the current planner joined **2/54** same-storyline
pairs with zero false joins, producing 46 groups. This is storyline recall,
not validated cross-publisher Topic accuracy. The archive remains ignored and
no article text, URL or vector is printed or committed.

Candidate v1 `topic-method/matcher.js` SHA-256
`7fc2eb118c50d43f657c84b42a2babd8e032b64a88884689e3197e3941c240ec`
joined **0/24** true pairs and zero false pairs on Luna validation with body E5.
It also joined **0/24** with title-plus-lead E5; all 24 true pairs cleared 0.90
in both representations. The title-plus-lead view had 31/166 different-Topic
pairs above 0.90, versus 27/166 for body E5. Candidate v1's synthetic seven
same-event pages formed one Topic (**21/21** pairs) and remained stable as pages
arrived. With two nearby exemption pages, it joined **21/22** true pairs and
zero cross-event pairs. It abstained on the three-page 0.90963 true-pair fixture.
The fixture's fabricated repeated event phrase provides unusually explicit
evidence, while the observed Guardian and Fox titles do not share it. Candidate
v1 therefore fails the validation promotion gate; test/challenge remain
unscored for the candidate.

For each partition the scorer reports TP/FP/FN/TN pair counts, precision and
recall, same-entity false joins, opposing-view joined pairs, pure components,
exactly recovered Topics and no-match singleton abstentions. It rejects any
output that drops or duplicates a page. Three input orders expose order
dependence. `evaluateGrowth` measures existing pair decisions changed by each
new page. `evaluateMatcher(documents, vectors, matcher)` accepts an async or
sync adapter taking source records and returning arrays of source IDs (or
partition records with `sourceIds`), allowing candidate comparisons without
editing this benchmark or production code.
