# Synthetic title-cue reranking result

Measured 2026-10-05. The unchanged invented corpus digest is
`0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950`.
The first scoring rule hash, recorded before inference, was
`3c2b939b29a9f919351a91a0d2da46f40676be75`. Its test hash was
`0eedc69fc4c5b5b5ed95ddf599f58ccc2074b85b`. The `results.json`
artifact is the first run. `results-graded.json` adds nDCG and top-rank
diagnostics without changing scores. Inspection then found that the lexical
stop list removed `no` and `not` even though tokenization preserved them.
Those two terms were restored and `results-negation-amended.json` is the
corrected run. This correction followed measurement; the amended figures are
**exploratory**, not a frozen held-out validation. The correction made no
aggregate metric change in this corpus. All artifacts contain IDs, metrics
and provenance only, without page text, vectors or pair scores.

The grading used for nDCG@5 is 3 for the exact same invented subject, 1 for
the related distinct subject in the same family, and 0 for other families.
The table uses the negation-amended report; counts are query directions, so
each positive pair appears twice. `Hard #1` counts a distinct-subject page
in the same family outranking the opposing-view partner. No threshold or
automatic join is evaluated.

| Rule | Split | Opposing partner @1 | @5 | Hard #1 | nDCG@5 |
| --- | --- | ---: | ---: | ---: | ---: |
| Body E5 | Development (20) | 3 | 20 | 17 | 0.749 |
| Body + title 0.05 | Development (20) | 10 | 20 | 10 | 0.837 |
| Body + title 0.10 | Development (20) | 12 | 20 | 8 | 0.841 |
| Body E5 | Held out (12) | 2 | 12 | 10 | 0.765 |
| Body + title 0.05 | Held out (12) | 7 | 12 | 5 | 0.870 |
| Body + title 0.10 | Held out (12) | 9 | 12 | 3 | 0.879 |

On these invented cases title cues improved opposing-view recall and reduced
the observed same-actor/different-event top-rank mistakes. They did **not**
eliminate them: the 0.10 rule still puts a hard negative first for 3/12
held-out queries. Thus the test found no aggregate distinct-event separation
harm, but cannot rule out harm on other dates, title styles, or missing titles.
The title rule receives no body-derived event extraction and date conflict
abstains if either title omits a date. It does not classify stance or identity.

The two translated-opposition pairs are project-authored smoke cases only.
The Dutch/English energy pair still has the English query's positive partner
at rank 2 under the 0.10 rule; the German/English tablet pair reaches rank 1
in both directions. This is no multilingual quality estimate. The corpus has
only 32 short invented pages, 16 two-page subjects, three held-out families,
no independent relevance labels, no no-match queries, and no realistic page
capture. Candidate pools are tiny; @5 is saturated at baseline. Node CPU
WASM exercised the packaged E5 body graph, tokenizer and pooling, but not
actual browser capture. No reliable production gain, confidence calibration,
or new automatic matcher is established.
