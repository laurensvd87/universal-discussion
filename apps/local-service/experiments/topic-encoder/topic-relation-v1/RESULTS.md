# Known-corpus result, 2026-10-09

Pooled v1/v2 train: 200 reports, 40 five-report gold Topics, 400 same-Topic
pairs, 19,500 different-Topic pairs including 800 adjacent-family negatives.
Familiar validation: 100 reports, 20 Topics, 200 same-Topic pairs, 4,750
different-Topic pairs including 400 adjacent-family negatives. No new
holdout was read.

| Frozen admission | Train | Familiar validation |
| --- | ---: | ---: |
| E5 top-three contains true partner | 196/200 | 94/100 |
| Pair true positives | 25/400 | 17/200 |
| Pair false positives | 0/19,500 | 0/4,750 |
| Adjacent-family pair false positives | 0/800 | 0/400 |
| Whole-Topic joined true pairs | 19/400 | 13/200 |
| Whole-Topic joined false pairs | 0/19,500 | 0/4,750 |
| Adjacent-family whole-Topic false pairs | 0/800 | 0/400 |
| Exact five-report Topics recovered | 0/40 | 0/20 |
| Resulting groups | 182 | 87 |

The selected gate is score `6.1505557310739345`, minimum cross-group score
equal to that cutoff, E5 cosine at least `0.78`. Fitting uses six features and
seven coefficients. The train-negative maximum was `6.050555731073935`.
The first-track run took about 23.2 seconds, including 19.4 seconds for 300
packaged-E5 embeddings on this Windows machine. The two-track run took about
45.4 seconds, including another 18.9-second body-only embedding pass. Each
track materialized 24,850 pairs
across both splits and is quadratic in catalog size; its group scan also has
unbounded repeated work. The absence of a Topic member cap is not a scaling
claim.

The number-conflict feature was zero across the training pairs, so its fitted
coefficient was zero. The measured result comes from cosine and lexical
features; it supplies no evidence that numeric conflict detection helps.

## Exploratory pair-score ranking

These score cuts are diagnostics on familiar data, not alternate frozen
admission policies. The first cut is selected; the rest step below the train
negative maximum. FP rates use all different-Topic pairs in the split.

| Score cut | Train TP/400 | Train FP/19,500 (hard/800) | Validation TP/200 | Validation FP/4,750 (hard/400) |
| --- | ---: | ---: | ---: | ---: |
| 6.151 | 25 | 0 (0) | 17 | 0 (0) |
| 5.051 | 60 | 3 (2) | 35 | 0 (0) |
| 4.051 | 90 | 5 (4) | 64 | 3 (3) |
| 3.051 | 133 | 14 (8) | 87 | 7 (5) |
| 2.051 | 193 | 40 (23) | 119 | 16 (12) |

Average precision over all pair rankings was 0.694 train and 0.819 familiar
validation, versus positive-pair prevalence of 0.020 and 0.040. Pair ranking
contains useful signal, but stronger recall quickly admits adjacent-event
errors in training and then validation. The strict pair gate leaves most
five-report Topics fragmented. The synthetic, already familiar validation
cannot establish real-page precision, particularly with multilingual
viewpoint differences and publisher variation. This is negative evidence for
live activation, not a replacement for the current matcher.

The lexical features use each report's full synthetic body. That text is
unavailable to the live backend after capture, so these results are an
offline information upper bound. They do not show what the currently retained
URL/title/vector-only representation can achieve. A product path would need
transient client-side calculation or a separately approved retained feature.

## Retained-only ablation

The separate title-plus-body-E5 head uses no body-derived lexical feature.
The corpus contains no URLs, so this tests a subset of what the current
backend retains. Its frozen cutoff is `6.197572640918079`, group
floor equal to cutoff, cosine floor `0.78`. This was chosen on familiar
train/validation negatives, before any independent holdout. At that cutoff:

| Retained-only conservative gate | Train | Familiar validation |
| --- | ---: | ---: |
| Pair true positives | 3/400 | 5/200 |
| Pair false positives | 0/19,500 | 0/4,750 |
| Adjacent-family false positives | 0/800 | 0/400 |
| Whole-Topic joined true pairs | 3/400 | 3/200 |
| Whole-Topic joined false pairs | 0/19,500 | 0/4,750 |
| Exact Topics | 0/40 | 0/20 |

At a score cut of `5.098`, train would admit 25 true and one adjacent-family
false pair; validation would admit 20 true and two adjacent-family false pairs.
The score's average precision was 0.611 train and 0.583 validation, below
the full-body track's 0.694/0.819. These familiar-data observations suggest
that pair evidence available from title and E5 alone is insufficient for a
precision-first join here. Neither head is calibrated for real pages.

## One-shot independent v6 holdout (spent)

After both code paths and thresholds were frozen, the independently authored
v6 file with SHA-256
`032eaa490d0ae6b9067ec479be4a80b563229606f83ce0f43a1bc9efd4098aeb`
was opened once. It has 60 reports in 12 five-report Topics, 120 same-Topic
pairs, 1,650 different-Topic pairs, and 450 same-family hard negatives.
No v6 label was used for fitting, threshold selection, or feature changes.

| Frozen rule | Full-text upper bound | Retained-compatible title + body-E5 |
| --- | ---: | ---: |
| E5 top-three true partner | 60/60 | 60/60 |
| Pair true positives | 14/120 | 15/120 |
| Pair false positives | 0/1,650 | 0/1,650 |
| Adjacent-family pair false positives | 0/450 | 0/450 |
| Whole-Topic joined true pairs | 11/120 | 11/120 |
| Whole-Topic joined false pairs | 0/1,650 | 0/1,650 |
| Adjacent-family whole-Topic false pairs | 0/450 | 0/450 |
| Exact Topics | 0/12 | 0/12 |
| Resulting groups | 51 | 49 |

The two E5 passes took 17.7 and 16.5 seconds; the complete run took 39.0
seconds on this Windows machine. The zero observed false joins are welcome
but limited to this small fictional sample. Neither rule assembles even one
complete Topic, despite perfect top-three retrieval. V6 provides independent
negative evidence for these admission rules and no reason to activate them.
