# Teacher distillation v1: measured, not selected

One frozen development run completed on 2026-10-10. No map passed the
predeclared usefulness screen. `selected=null`, `useful=false`: stop here.
No fresh inference, softer screen, retained learned weights or activation follows.

The result is not "linear transfer cannot improve E5": all maps materially
improved the reused real-news development grouping. It is "none of these three
fixed maps met the declared coverage AND cross-domain safety/nonregression
requirements." The calibration rule is identical, not the numerical floor.

Frozen descriptor SHA-256:
`8951b0aef42b90260080d81997225b9aa12d959f04e81d9c7563ca766a33a3b8`.
[freeze.json](freeze.json) contains the reviewed preregistration;
[aggregate.json](aggregate.json) contains the complete content-free measurement.

## Same-run comparison

Fit: 475 reports/37 whole events. Calibration: 274/22. Development: 150/13.
Event sets are disjoint; all quality cohorts were previously used.
Challenge cohorts are authored C108 and spent v6/60, not new held-out evidence.
Every method uses all-pair calibration (at least20 true, >=98% observed
precision, unbroken score ties) followed by the same strongest-edge complete-link
construction, with no neighbor count, member cap or competitor lead.

Cells below are **correct/wrong grouped pairs; pure/mixed pages**. Pure means
a page in a nonsingleton, single-labelled-event group. Correct pairs inside
mixed groups still count as correct; mixed-page exposure is reported separately.

| Representation | Calibrated floor | Real development150 | Authored C108 | Spent v6/60 |
| --- | ---: | ---: | ---: | ---: |
| raw-E5 | 0.904057 | 54/1; 62/2 | 67/58; 42/58 | 73/0; 53/0 |
| centered-E5 | 0.560023 | 19/0; 35/0 | 85/70; 42/62 | 107/0; 58/0 |
| old-diagonal | 0.907189 | 61/0; 68/0 | 76/58; 43/56 | 79/0; 55/0 |
| teacher | 0.666950 | 455/0; 134/0 | 219/35; 81/25 | 120/0; 60/0 |
| ridge-0.01 | 0.545225 | 271/0; 119/0 | 139/93; 49/55 | 108/0; 60/0 |
| ridge-0.1 | 0.678678 | 420/0; 130/0 | 146/60; 57/45 | 100/0; 58/0 |
| ridge-1 | 0.863900 | 226/0; 124/0 | 82/20; 61/27 | 53/0; 46/0 |

- Ridge0.01 fails authored wrong exposure: 93 wrong pairs, versus58 for old diagonal.
- Ridge0.1 fails that same screen narrowly: 60 versus58, despite420 correct
  development pairs and130 pure pages.
- Ridge1 cuts authored wrong pairs58->20 and mixed pages56->27, with development
  pure pages68->124, but regresses v6 correct coverage79->53 (pure pages55->46).
  That violates the explicitly frozen v6 nonregression requirement.
- The unfitted centering control loses real-news reach; improvement is not
  explained by simply subtracting the source mean.

The installed diagonal is title/lead-fitted and applied unchanged to BODY here.
Its same-run floors/results differ from older case-specific measurements;
those older numbers are not substituted into this comparison. None of these
controls is thereby established safe for current browsing.

## Granularity, language and viewpoint

Wrong C108 pairs split into same-family/different-event versus outside-family:

| Representation | Same-family wrong pairs | Outside-family wrong pairs | Correct cross-language pairs | Correct opposing-viewpoint pairs |
| --- | ---: | ---: | ---: | ---: |
| raw-E5 | 56 | 2 | 49/252 | 67/270 |
| centered-E5 | 68 | 2 | 67/252 | 85/270 |
| old-diagonal | 57 | 1 | 58/252 | 76/270 |
| teacher | 23 | 12 | 201/252 | 219/270 |
| ridge-0.01 | 86 | 7 | 121/252 | 139/270 |
| ridge-0.1 | 60 | 0 | 128/252 | 146/270 |
| ridge-1 | 20 | 0 | 64/252 | 82/270 |

All real development true pairs are cross-language under these corpus labels:
the grouped true column is therefore also cross-language correct coverage.
Real reports have no independently reviewed publisher/viewpoint/family gold;
zero real outside-family/opposing counters means "not labelled", not proof.

The medium/strong maps' authored wrong joins are ALL same-family/different-event,
not gross outside-family joins. The owner's broader cohesive-story interpretation
might treat some as related or grouped, but this experiment has no owner-adjudicated
broad-Topic labels. It must not silently relabel them as successes or change
the frozen atomic nonregression screen. The weak map and teacher DO have authored
outside-family joins. Excellent nearest-neighbor identity and news reach alone
do not establish actual Topic safety.

No current browser catalog, search/tool/navigation capture or exact indexed/
guarded deployment composition was measured. These maps cannot recover absent
article identity or disambiguate identical information-free input vectors.

## Reconstruction and practicality

Mean cosine between the normalized prediction and teacher target:

| Map | Train475 | Calibration274 | Development150 |
| --- | ---: | ---: | ---: |
| ridge-0.01 | 0.970495 | 0.400562 | 0.443074 |
| ridge-0.1 | 0.951376 | 0.527349 | 0.576488 |
| ridge-1 | 0.900294 | 0.597394 | 0.646603 |

The large train/unseen-event gap is explicit. Ridge0.01 fits train cosine0.9705
but reaches only0.4006 on calibration; stronger regularization improves unseen
reconstruction, while grouping/coverage tradeoffs remain. Reconstruction score
is diagnostic, not a substitute for Topic evaluation.

Total measured elapsed: 595.911 seconds (~9.93 minutes).
E5 BODY512 inference: 452.336 seconds for1,067 inputs.
Teacher plain BODY128: 109.237 seconds for1,067.
Three fixed Cholesky fits together: 6.261 seconds.
Each map has147,456 matrix parameters plus768 mean coordinates.
Means/matrices/targets/vectors remained RAM-only; only parameter hashes were
printed. No runtime transfer latency or deployment index performance is claimed.

Student and teacher see the same normalized4096-character BODY prefix but use
distinct query512/plain128 policies. This is a bounded transfer test including
that information-budget mismatch, not proof of equal-input encoder superiority.

Five executable core tests pass: paired rotation recovery, labels ignored,
Cholesky solving, degenerate/missing/nonfinite aborts, and selection nonregression.
The measurement exited0 and reproduced the reviewed descriptor before inference.

## Decision

Do not promote or claim calibrated semantic identity. Keep production and BODY
activation unchanged. There is no fresh test in this experiment. A separately
authorized future line would need an independently defined practical label task,
actual capture-context challenge and the EXACT intended indexed/refinement
planner, then a new untouched evaluation; it would not be a continuation or
retuning of this frozen screen. Local owner permission to fit does not establish
corpus/model redistribution rights, release permission or broader retention.
