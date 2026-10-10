# Frozen vector-only metric, common radius/complete-link comparison

2026-10-10. Development freeze
`a68a15e2bcbcd73c0fa2a43dd34ebd817aec04aba87310da60d4dc3a2f59da9c`.
This policy was declared before any shared fresh quality result was visible.
It is separate from the double-support experiment and the production indexed
supported-merge policy; it is not a retuning of either.

The selected `within-shrink-50` representation was fixed by the other experiment:
475 train-only BODY E5 vectors, centering and 50%-regularized within-event
covariance whitening. All three methods separately calibrate on the same274
reports at >=98% observed pair precision/minimum20 true pairs, then use the
same strongest-edge complete-link rule. There is no neighbor/member limit
or competitor-lead test. Those calibration statistics are not a confidence bound.

| Reused150 development reports | Raw BODY E5 | Old diagonal | BODY whitening |
| --- | ---: | ---: | ---: |
| Calibration cosine floor | 0.9040572 | 0.9071894 | 0.3622393 |
| Correct / false grouped pairs | 54 /1 | 61 /0 | **507 /0** |
| Pure / mixed multi-page reach | 62 /2 | 68 /0 | **134 /0** |

The frozen rerun reproduced cutoffs and development receipt before encoding
the previously unscored296 reports in24 whole events. The selection excludes
four prior exposed event cohorts and exact normalized title/lead overlap.
All1,748 true pairs are cross-language; there is no real opposing-viewpoint gold.

| Same296 fresh reports | Raw BODY E5 | Old diagonal | BODY whitening |
| --- | ---: | ---: | ---: |
| Nearest event correct /296 | 261 | 274 | **293** |
| Direct correct / false pairs | 168 /6 | 230 /9 | **1,430 /19** |
| Correct / false grouped pairs | 78 /4 | 106 /3 | **1,042 /2** |
| Pure / mixed multi-page reach | 116 /7 | 138 /5 | **259 /3** |

This is a material same-corpus gain with fewer observed wrong grouped pairs
and fewer mixed pages than either control under this common admission policy.
The nineteen false direct edges still matter: grouping policy, not the
representation alone, prevented most of their exposure. Two wrong grouped
pairs remain. These are body-prefix surrogates, not rendered Chrome captures
or independent-publisher, genuine opposing-viewpoint, product-price or rights
validation. Events, not pair counts, are the independent units of evaluation.

The metric can transform already retained384D E5 vectors, with no LLM,
new browser model, raw-text retention or page revisit. Runtime indexed
supported merging has different ordering/support and needs its own measured
comparison; the1,042 result must not be attributed to that live planner.
This runner saved no corpus, vectors or fitted parameters and changed no SQLite
records. Local installation, integrity review and reversible UI use are separate
implementation steps. No default promotion, distribution or release follows.
