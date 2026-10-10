# Pooled-vector metric rethink — frozen result

2026-10-10. Offline, existing packaged E5, no model download or provider call.
All article content, embeddings and fitted parameters remain in RAM. This
directory contains code/tests and an aggregate freeze, not a corpus or weights.

The fixed five-variant grid was fit on body vectors from the original 475
fit reports. The unchanged current diagonal baseline was separately reproduced
from those same reports' original title/384-lead inputs. All methods were
separately calibrated on the same 274 body-vector reports and evaluated under
exactly the same double-support graph. The 150-report development slice is
**reused**, with 13 events, 803 same-event pairs and 10,372 different-event
pairs (1,682 same-category hard negatives). Every true pair is cross-language;
there are no same-language positives or real viewpoint labels here.

| Method on reused development | Correct grouped pairs / 803 | Pure multi-page reach / 150 | False grouped pairs | Mixed-group pages |
| --- | ---: | ---: | ---: | ---: |
| Raw body E5 | 11 | 16 | 0 | 0 |
| Current diagonal adapter | 155 | 73 | 0 | 0 |
| Centered E5 | 87 | 57 | 0 | 0 |
| Global covariance, 50% shrinkage | 259 | 93 | 0 | 0 |
| Global covariance, 90% shrinkage | 230 | 91 | 0 | 0 |
| Within-event covariance, 50% shrinkage | **261** | **93** | 0 | 0 |
| Within-event covariance, 90% shrinkage | 197 | 85 | 0 | 0 |

The predeclared selection rule chooses `within-shrink-50`: subtract the
train-only body E5 mean, apply the inverse Cholesky factor of equal-event-weight
within-event covariance with 50% spherical shrinkage, then normalize. Runtime
requires only an already retained 384-coordinate E5 vector and fixed local
parameters. The global 50% variant nearly ties it, so this result does not
establish a unique benefit from supervised covariance over global whitening.
Both materially improve this development comparison over raw E5 and the
existing adapter. No candidate recovered an entire gold event; useful partial
pure groups are the intended outcome measure.

Important calibration limitation: the selected metric and current diagonal
baseline had **zero supported negative candidates** in calibration and retained
the fixed contrast cutoff of zero. Raw E5 had four candidates and cutoff
0.030762188216129666. A different candidate population and fresh hard-negative
evidence remain necessary for production calibration. The development's zero
false groups is not an independent precision estimate.

Development freeze SHA-256:
`5e16c6d75c9656717e523513f024ad7b26cf1cfedc0d2e6fb3503e3590e7d26c`.
`freeze.json` records the exact source hashes, corpus/model hashes, fixed
selection and calibration parameters. Seven focused numerical/admission and
whole-event/duplicate-input exclusion tests pass.

A fresh-process rerun reproduced the exact development selection, all seven
method scores and the freeze hash before encoding fresh data. No method,
threshold, input length, selection rule or grouping policy changed after the
fresh result. The numerical/admission, selection and freeze checks now total
eight passing tests.

## Previously unscored body-input events

The fixed whole-event selection excluded the original 1,192, preliminary 298,
title/lead-fresh 292 and body-fresh 300 cohorts, plus exact normalized title/lead
key overlap. After 143 exposed events and further key overlap were excluded,
2,821 reports in 221 events remained. Domain-separated hash order selected
**296 reports in 24 whole events**, under the fixed 300-report budget. There
are 1,748 true pairs, all cross-language, and 41,912 different-event pairs,
including 7,214 same-category negatives. The seven reported “families” are
categories, not verified entity/story-family gold.

| Same 296 new-event body reports | Raw E5 | Current diagonal | Selected within-event whitening |
| --- | ---: | ---: | ---: |
| Correct direct edges | 19 | 168 | **266** |
| Correct grouped pairs / 1,748 | 28 | 254 | **374** |
| Cross-language grouped-pair recall | 1.60% | 14.53% | **21.40%** |
| Pure multi-page reach / 296 | 31 | 122 | **155** |
| False direct edges | 0 | 1 | **0** |
| False grouped pairs | 0 | 6 | **0** |
| Mixed-group pages | 0 | 7 | **0** |
| Complete events / 24 | 0 | 0 | 0 |

This is a real **same-corpus body-input improvement** over both controls under
the common frozen graph: more correct grouped reach and more pure pages, with
no observed increase in false exposure. The diagonal's one false edge expanded
to six false grouped pairs and seven exposed pages; the selected transform
avoided that case. The absence of observed errors does not calibrate future
precision, and report pairs are correlated within just 24 events. Same-language
and real viewpoint conclusions cannot be drawn from this slice because those
denominators are zero. This remains a normalized corpus-body surrogate rather
than browser-captured input or independently verified publishers.

## Title/lead input mismatch

The same 296 events were separately encoded as title plus 384 normalized body
characters. Each control and the unchanged body-fitted selected metric was
separately calibrated on title/lead from the same 274 calibration reports.
The raw title/lead cutoff was 0.02237010536202369 with two supported negative
candidates; current diagonal and selected metric again had none and used zero.

| Same new events, title/384-lead input | Raw E5 | Current diagonal | Body-fitted selected metric |
| --- | ---: | ---: | ---: |
| Correct grouped pairs / 1,748 | 84 | 377 | 443 |
| Pure multi-page reach / 296 | 67 | **159** | 158 |
| False grouped pairs | 0 | **0** | **4** |
| Mixed-group pages | 0 | **0** | **5** |

The selected metric is **not input invariant**. It increases title/lead correct
pair reach but slightly loses pure-page reach and introduces false exposure
relative to the existing diagonal. Do not describe this as a title/lead win or
change the production extraction contract from this evidence.

## Reused multilingual and viewpoint diagnostics

The real-body calibration was transferred unchanged; neither fixture selected
or tuned the candidate. Authored C and v6 were already spent. These are
diagnostic reuse, not additional independent holdouts. The aggregate runner's
`opposingViewpointPairs` field means **different viewpoint labels**, including
different fictional roles; it does not establish genuine opposing political
views or real publisher diversity.

| Reused case and method | Correct grouped pairs | False grouped pairs | Pure pages | Mixed pages | Cross-language correct / available | Same-language correct / available |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Authored C, raw E5 | 36 | 19 | 28 | 19 | 23 / 252 (9.13%) | 13 / 18 |
| Authored C, current diagonal | 96 | 39 | 39 | 31 | 83 / 252 (32.94%) | 13 / 18 |
| Authored C, selected metric | **123** | **22** | **57** | **16** | **109 / 252 (43.25%)** | **14 / 18** |
| v6, raw E5 | 65 | 0 | 45 | 0 | 65 / 120 (54.17%) | 0 / 0 |
| v6, current diagonal | 110 | 0 | 55 | 0 | 110 / 120 (91.67%) | 0 / 0 |
| v6, selected metric | **120** | **0** | **60** | **0** | **120 / 120 (100%)** | 0 / 0 |

Authored C has 108 reports, 18 atomic developments in six story/entity families,
270 true pairs and 5,508 false pairs. The selected metric improves coverage
and false exposure versus the diagonal, but **four mixed groups, 22 false
grouped pairs and 16 exposed pages** remain. All 16 false direct edges are
same-family hard negatives. Its grouped precision is 123/145, approximately
84.8%, so this stress result is inadequate evidence for general principal-event
Topic admission. It recovers six complete developments versus five for the
diagonal and zero for raw E5; different-viewpoint-label reach is 123/270 versus
96/270 and 36/270. The v6 result recovers all 12 synthetic developments and all
120 cross-language/different-viewpoint-label pairs, without a false group.

The candidate is therefore promising for **retained body E5**, with a clear
same-corpus gain and improved multilingual transfer, but unresolved adjacent-
story discrimination. No default promotion, live route change or retained
representation change follows. The double-support graph also misses isolated
two-page matches without two shared witnesses; its top-five candidate search
is not a cap on eventual group size. It cannot be dropped into the live
alternate planner's unchanged 0.94 gates.

Before any fresh quality result was visible, the lead separately preregistered
a radius/strongest-edge complete-link probe on this selected representation and
the same cases, alongside raw/current diagonal controls. The lead's compact-
model experiment uses the same fresh cohort under its own frozen policy.
These are disclosed joint representation/policy comparisons, not rescue or
retuning of this common-graph protocol. No independent precision claim follows
from choosing among those comparisons after seeing this cohort.

The standalone fictional-vector cost check measured 1,000 transforms in
218 ms on this machine. A packed Float64 lower triangle plus mean would use
594,432 bytes; the current in-memory implementation stores a full lower matrix
including its zero upper triangle. This is a microbenchmark, without encoder
or retrieval cost, and does not establish large-catalog performance.

Full content-free counts are in `aggregate.json`. Node was 24.19.0; packaged
ORT was `1.31.0-dev.20260914-8d85527a0`, with the existing pinned E5/tokenizer
assets. No article text, URL, row label, vector or fitted metric coordinate was
saved or printed. No corpus/weights entered Git, no LLM ran, no model was
downloaded, and no production file or SQLite record changed.
