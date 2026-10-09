# Event-token-pool v1: frozen development and one-shot v3 holdout

Status: **rejected for Topic admission**. The implementation and preregistered
screen were frozen and pushed in commit `014e43493ac10b6f69771d8623c1e252ef1a6644`
before the holdout was opened. The one-shot run used a clean working tree and
the reviewed source digests reported by `run-holdout.js`; it did not save
weights, vectors, token states, article text, or row-level predictions.

The method reused the packaged multilingual E5 model. A 384-parameter shared
attention query pooled up to 64 contextual content-token states into one
normalized vector. It was fitted in RAM for 40 steps on 120 original synthetic
reports from six whole event families. Forty reports from two other training
families calibrated the cutoff to the maximum different-event cosine plus
`0.002`. The two balanced-corpus validation families selected no parameter or
cutoff. The one-shot independent synthetic v3 holdout contained 60 reports,
15 developments, five families and five languages; none entered fitting.

| Measure | Development, 40 reports | Independent v3, 60 reports |
| --- | ---: | ---: |
| Learned cutoff | 0.8690268344580456 | same frozen cutoff |
| Same-event retained edges | 135/180 | **26/90** |
| Different-event retained edges | 0/600 | **0/1,680** |
| Cross-language same-event edges | 120/160 | **26/90** |
| Complete developments | 3/4 | **4/15** |
| Mixed groups | 0 | **0** |
| First-neighbor same-event retrieval | 40/40 | **50/60** |
| Top-three same-event retrieval | 40/40 | **54/60** |

On v3, the triangle-supported graph produced 46 pure groups, including
41 singletons, and 27/90 grouped true pairs with no false grouped pairs.
Admission precision was 26/26 in this small synthetic set, but that is not a
real-world precision estimate; admission recall was 26/90. The preregistered
research continuation screen required zero false retained edges/mixed groups,
at least **30/90** true edges, at least **25%** cross-language true-edge
recall, and at least **5/15** complete events. It missed the edge and complete-
event floors. This candidate is therefore stopped, not retuned on v3.

The raw pooled-E5 diagnostic at fixed 0.94 and its own train-calibrated
0.9216038494934216 cutoff retained **0/90** same-event edges and recovered
**0/15** complete events on v3. Raw first-neighbor/top-three retrieval was
29/60 and 46/60. Thus token attention improved this independent synthetic
retrieval and cautious admission relative to those baselines, but did not
meet the usefulness screen. It does not establish cross-publisher or real-web
Topic identity, multilingual robustness beyond this authored set, or a safe
threshold for the current app.

Focused tests passed 16/16; the local-service suite passed 262 with four
expected skips, and the secret scan found zero findings in 426 files. The
development evaluation was run once before the holdout; v3 was opened/scored
once after source review. No holdout-driven rule, threshold or model revision
is permitted on this spent corpus. The packaged app model, live matcher,
stored vectors, Topic routing, extension and discussions remain unchanged.
