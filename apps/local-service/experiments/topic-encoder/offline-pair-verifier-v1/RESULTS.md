# Offline pair verifier v1: rejected development result (2026-10-09)

The frozen symmetric nonlinear verifier did **not** improve precision-first
event matching. One local, aggregate-only run selected the predeclared
cutoff `0.927713031291908` from the maximum different-event score across
the Wikinews and synthetic development validation sets plus `0.002`. No
architecture, feature, training, cutoff or grouping rule was changed after
the result. Neither selected Wiki test nor any synthetic holdout was embedded
or scored; no weights, text or vectors were saved, and nothing was activated.

Training used 737 approved private Wikinews articles and 120 project-created
synthetic v2 reports. The four train pair-stratum counts were 1,126 Wiki
same-event positives, 672 Wiki mined different-event negatives, 240
synthetic same-development positives and 600 synthetic same-family different-
development negatives (including non-adjacent developments). The synthetic
family-disjoint validation has 60
reports/12 developments; Wiki event-disjoint validation has 207 articles/66
events. The project synthetic integrity check passed all frozen file digests
and family isolation before this run.

| Development slice / frozen rule | Pair TP / positives | Pair FP / negatives | Pair precision | Pair recall | Groups | Grouped true / false pairs | Complete events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Wiki, nonlinear verifier | 61 / 328 | 0 / 20,993 | 100% | 18.6% | 177 | 36 / 0 | 6 / 66 |
| Wiki, raw E5 at prior Wiki cutoff 0.895295 | 90 / 328 | 0 / 20,993 | 100% | 27.4% | 155 | 67 / 0 | 18 / 66 |
| Wiki, prior diagonal at 0.897529 | 105 / 328 | 0 / 20,993 | 100% | 32.0% | 149 | 78 / 0 | 19 / 66 |
| Synthetic, nonlinear verifier | 1 / 120 | 0 / 1,650 | 100% | 0.8% | 59 | 1 / 0 | 0 / 12 |
| Synthetic, raw E5 at prior Wiki cutoff 0.895295 | 28 / 120 | 1 / 1,650 | 96.6% | 23.3% | 43 | 20 / 0 | 0 / 12 |
| Synthetic, prior diagonal at 0.897529 | 35 / 120 | 1 / 1,650 | 97.2% | 29.2% | 41 | 22 / 0 | 0 / 12 |

At the verifier gate, all 61 Wiki pair admissions were cross-language true
pairs (61/328 eligible), with 0/9,360 shared-category hard negatives
admitted. Complete-link grouping yielded 177 groups, zero mixed groups,
36 true and zero false grouped pairs. On synthetic validation, its sole
admitted pair was cross-language (1/120 eligible); 0/300 same-family hard
negatives were admitted. Complete-link grouping yielded 59 groups, zero mixed
groups, one true and zero false grouped pairs. Zero development false joins
is **not** an independent precision estimate: the maximum-negative cutoff
was explicitly selected using these same labels.
The two synthetic reference gates each admitted one false pair, but their
first-fit complete-link partitions did not include that pair; pair-gate
errors and whole-group errors must not be conflated. All six reported
partitions had zero mixed groups on these development slices.

Packaged-E5 embedding took about 94.0 seconds for Wiki train plus
validation and 9.0 seconds for synthetic train plus validation; total local
runtime was about 106.4 seconds. The verifier uses title plus a 384-character
lead surrogate, not the current live retained body-derived E5 input. The
comparison thresholds for raw and diagonal E5 are rounded, previously
published Wiki-selected references, not newly calibrated gates.

The observed collapse on synthetic development is consistent with a
conservative maximum-negative gate interacting with domain shift and a
coarse 33-feature pair representation, but this run does not isolate which
factor caused it. Wikinews translations do not represent independent
publisher viewpoints; synthetic v2 has language/viewpoint correlations and
cannot establish viewpoint robustness. The verifier therefore fails this
bounded probe. Do not retune on these development slices or interpret this
negative result as proof that all symmetric pair models are impossible.
