# Frozen triangle policy: independent holdout rejection (2026-10-09)

The frozen v2 full-coordinate pair verifier, v3 cutoff
`0.9805850963542602`, and v4 triangle-supported connected-component
policy were run **once** on the independently authored 80-report synthetic
holdout. The cutoff reproduced before the holdout was opened. The
predeclared research screen failed decisively: the policy joined adjacent
events within every family. No thresholds, weights or grouping policy were
changed after the result, and the holdout must be treated as spent for
method selection. No model weights or vectors were saved or activated.

| Independent holdout measure | Frozen result | Predeclared requirement |
| --- | ---: | ---: |
| Retained true edges | 282 / 360 | >=144 / 360 |
| Retained false edges | **194 / 2,800** | No explicit edge-FP gate; group safety required |
| Retained same-family hard false edges | **194 / 400** | Reported diagnostic |
| Retained cross-language true edges | 242 / 320 | >=96 / 320 |
| Mixed groups | **4** | **0** |
| False grouped pairs | **400** | **0** |
| Complete events | **0 / 8** | >=2 / 8 |

The 80 reports represent eight labeled events in four families, ten reports
per event across five languages and two viewpoints. There were 360
same-event and 2,800 different-event pair opportunities; 400 of the latter
were within-family adjacent-event hard negatives. The retained-edge gate
reached 78.3% true-pair recall and 75.6% cross-language true-pair recall,
but 194 same-family false edges overwhelmed precision. Its retained-edge
precision was about 59.2% (282 of 476 edges).

Connected components produced **four mixed groups**, zero complete events,
360 true grouped pairs and 400 false grouped pairs; all 320 cross-language
true pairs were grouped. These aggregates imply each pair of distinct
events in a family collapsed into one group: 400 false grouped pairs equals
the full same-family hard-negative denominator, while all 360 true pairs
were grouped. This is the exact transitive-join failure the precision-first
Topic gate is meant to prevent. The in-sample v4 validation appearance
(3/4 complete, zero false) was misleading because its cutoff was selected
above the same validation negatives. Triangle support did **not** make the
independent grouping safe.

Embedding took about 10.9 seconds for the frozen development data and
5.5 seconds for the holdout; total local runtime was about 18.0 seconds.
The holdout is original synthetic material, not real independent-publisher
evidence. Its event labels and prose could receive a separate blinded
semantic audit for dataset quality, but no row-level audit was performed
here and such an audit must not be used to retune this spent result. Under
the declared labels, the candidate is rejected. The title-plus-lead
embedding also lacks parity with the live retained body-derived E5 vector.
No product activation or test-set rescue follows.
