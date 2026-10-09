# Event-token-pool v2 — development-only negative result

Status: **no candidate selected; stop**. One preregistered train/validation
comparison was run. Neither balanced-corpus test nor any v3/v4 holdout was
opened. No weights, vectors, token states, article text, or row predictions
were persisted or printed. This result does not authorize a v4 test or live
activation.

The packaged E5 model SHA-256 was
`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.
The frozen `title + first 384 body characters` input is an offline surrogate,
not the live extension's full body-prefix input. Six whole train families
(120 reports/12 developments) fitted the query; two other train families
(40/4) calibrated each cutoff; two separate validation families (40/4)
supplied development metrics only. The v1 cutoff and all reference counts
reproduced exactly before selection.

| Representation | Calibrated gate | Retrieval @1/@3 | True retained edges | False / hard retained edges | Cross-language true edges | Complete events | Mixed groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen v1 attention, first 64 tokens | 0.8690268344580456 | 40/40, 40/40 | 135/180 | 0/600, 0/200 | 120/160 | 3/4 | 0 |
| Separately trained attention, first 32 tokens | 0.8831250825795904 | 40/40, 40/40 | 53/180 | 0/600, 0/200 | 45/160 | 1/4 | 0 |
| 75% v1 attention + 25% pooled E5 | 0.8704464982748722 | 40/40, 40/40 | 135/180 | 0/600, 0/200 | 120/160 | 3/4 | 0 |

All three triangle graphs had zero observed false grouped pairs on this
small synthetic development set. The 32-token variant produced 23 groups
and 65/180 grouped true pairs; v1 and the fixed residual each produced
13 groups and 135/180 grouped true pairs. All same-event first-neighbor
retrieval was already saturated for v1, so strict retrieval improvement
was impossible on this particular validation. The preregistered rule
required retrieval parity, zero false edges/mixed groups, and a strict
gain beyond v1's three complete events or 135 true edges. Neither new
variant passed. This is a negative development result, not evidence that
all compact token representations are impossible; it does not justify
changing windows, residual weights, losses, thresholds, or graph rules
against these spent validation labels.

The balanced corpus is deterministic project-authored fiction with
supportive/questioning templates and near-duplicate event cores. Its
validation contains only two families and four developments. Even an
improvement here would be a representation diagnostic, not evidence of
independent-publisher transfer or a sufficient reason for holdout/product
use. The zero observed false joins are especially underpowered.

Embedding took 11,718 ms; training both attention queries took 5,148 ms;
total runtime was 17,575 ms. The three code/input/model hashes and full
aggregate counts were emitted by the one development run. Fictional tests
passed 4/4 and the no-data dry-run confirmed no corpus or model was opened.
No new saved model asset or app-retained field was created. This 40-report
all-pairs grouping says nothing about million-article runtime, independent
publisher precision, or Topic-boundary correctness.
