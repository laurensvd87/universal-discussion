# JRC event-graph v1: negative development result (2026-10-09)

The fixed local-corroboration graph did **not** satisfy the zero-false-group
precision gate. It reduced transitive damage compared with plain 0.90
connected components but still merged two analyst labels on the already-spent
validation partition. No method threshold was changed after seeing validation.
The selected test partition was neither embedded nor evaluated.

Across distinct valid URL hosts, train contained 92,886 same-label and
152,347 different-label pairs; validation contained 32,574 same-label and
7,674 different-label pairs. These denominators are inherited unchanged from
the frozen title-only JRC pilot. A positive pair means shared `LABEL`, not a
human-adjudicated exact app Topic.

| Partition / fixed method | Baseline threshold-positive edges or graph DSU joins, true/false | Groups | Mixed groups | Grouped true/false pairs | Complete labels |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train, cosine 0.90 components | 27,793 / 0 | 93 | 0 | 88,684 / 0 | 2/16 |
| Train, graph | 561 / 0 | 141 | 0 | 70,543 / 0 | 1/16 |
| Validation, cosine 0.90 components | 4,237 / 22 | 34 | 1 | 26,159 / 687 | 2/5 |
| Validation, graph | 218 / 1 | 67 | 1 | 15,208 / 348 | 2/5 |

The baseline edge counts include every cross-host pair above 0.90, not only
the edges needed to connect each component. The graph edge counts are actual
DSU joins. Total locally supported graph candidate edges (including those
joins) numbered 27,718 true/0 false on train and 4,184 true/21 false on
validation; most supported edges were redundant or could not clear the
group-local merge rule.
The fixed 0.94 cosine comparison also failed on validation: 1 false edge,
1 mixed group, 2 false grouped pairs and 1/5 complete labels. The graph
preserved some different-language same-label joins (17 direct merge edges on
train, 12 on validation), but only a small fraction of the 0.90 candidate
different-language true edges (4,554 and 147 respectively). It cannot be
claimed to solve cross-language event identity.

The train split had 702 titles/16 labels, with embedding about 16.6 seconds
and total local runtime about 17.5 seconds. Spent validation had 286
titles/5 labels, embedding about 7.3 seconds and total about 7.9 seconds.
This is a title-only packaged-E5 offline diagnostic, not live input parity:
the extension retains a body-derived vector. URL host is not a verified
publisher, and the JRC labels may cover broad stories rather than exact
app Topics. The prior aggregate leakage proxy audit cannot verify full
event-disjointness. Triangle witnesses and group-local support can still
bridge broad, related labels, as the validation result demonstrates. There
is no fixed Topic-size cap in this algorithm, but the offline all-pairs
candidate construction is quadratic and its 1,200-title compute bound says
nothing about million-article scalability. That does not cure the false
merge. No product edit or fresh holdout run is justified by this result.
