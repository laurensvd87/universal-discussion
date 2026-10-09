# Owned diagonal mining v1 — synthetic development result

2026-10-09. One offline comparison used 108 project-authored A reports for
fitting, 108 separate B reports for each method's own `double-support`
calibration, and the 108 C1+C2+C3 development reports for the comparison.
All three methods received the same packaged E5 title plus 384-character lead
vectors. The previous static adapter and the multi-mined adapter each fitted
384 diagonal parameters in RAM for 40 steps; the multi-mined fit used 648
comparisons per mining round and eight rounds. Two targeted unit tests passed.

| Same C development cases | Raw E5 | Static owned diagonal | Multi-mined owned diagonal |
| --- | ---: | ---: | ---: |
| B negative calibration candidates | 71 | 53 | 64 |
| True direct edges | 14 | 18 | 18 |
| False direct edges | 4 | 1 | 2 |
| True grouped pairs | 15 | 21 | 21 |
| False grouped pairs | 7 | 2 | 4 |
| Pages in pure multi-page groups | 23 | 29 | 27 |
| Pages in mixed groups | 7 | 3 | 6 |
| Complete events | 0 | 0 | 0 |

The gold denominators are 270 same-event pairs and 5,508 different-event
pairs among 18 events. The multi-mined variant improves on raw E5 on these
already-used synthetic development cases, but it **does not improve the static
owned fit**: true reach ties while false exposure increases. Do not select it
for an independent holdout or activate it in the product. This was not a
predeclared independent safety screen, and C has been examined by earlier
experiments. B's maximum-negative calibration cannot establish independent
precision; even its best method has an observed false join on C.

The fictional reports have authoring patterns and no verified independent
publisher/viewpoint variation. Title/lead input differs from the live body-E5
input. No private real corpus, v5 holdout, provider, persisted vectors/weights,
or live Topics/discussions were touched. Root-route churn was not measured.
