# Offline pair verifier v3: primary screen failed (2026-10-09)

One frozen development-only run reused the unchanged v2 full-coordinate
verifier on the corrected multilingual-balanced-v1 train/validation corpus.
The predeclared maximum-validation-negative-plus-0.002 cutoff was
`0.9805850963542602`. The primary first-fit complete-link rule admitted
113/180 true validation pairs and 0/600 false pairs (including 0/200
same-family hard negatives), with 93/160 cross-language true pairs admitted.
It recovered **0/4 complete developments**, below the required 1/4, so
the predeclared usefulness screen **failed**. No model, cutoff or grouping
rule was retuned; no test corpus was opened, and no weights or vectors were
saved or activated.

Training had 160 fictional reports from 16 developments in eight whole
families: 720 same-development positive pairs and 800 same-family different-
development hard negatives. Validation had 40 reports from four developments
in two disjoint families. The corrected event IDs link all ten language and
viewpoint records of one development. Only final hash-pinned train and
validation files were read; `test.jsonl` remains sealed.

| Frozen validation method | Pair TP / 180 | Pair FP / 600 | Hard FP / 200 | First-fit groups | First-fit grouped true / false | Complete / 4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Full-coordinate verifier, selected 0.9805850963542602 | **113** | **0** | **0** | 12 | 56 / 0 | **0** |
| Raw E5, fixed 0.94 | 20 | 0 | — | 20 | 20 / 0 | 0 |
| Raw E5, prior Wiki 0.895295 | 112 | **14** | **8** | 14 | 50 / 0 | 0 |

The separate, frozen agglomerative complete-link diagnostic at the **same**
verifier cutoff produced 14 groups, 48 true and 0 false grouped pairs, and
0/4 complete developments. For raw E5 at the prior Wiki cutoff it produced
14 groups, 44 true and 0 false grouped pairs. It did not rescue the primary
gate and performed worse in true grouped pairs here. The raw prior gate's
14 false *pair* admissions did not become false first-fit or agglomerative
*group* joins on this small slice; these are distinct error measures. All
reported grouped partitions had zero mixed groups.

Embedding took about 11.4 seconds; total local runtime was about 12.5
seconds. The verifier's zero observed false pair admissions are not an
independent precision estimate: the threshold was selected from the same
validation negatives. Its 62.8% pair recall (113/180) and 58.1%
cross-language pair recall (93/160) coexist with complete-event failure.
The fixed 0.94 raw E5 rule retrieved too few positive pairs; the prior
Wiki cutoff was less selective but directly admitted neighboring-event
false pairs. None meets the whole-Topic precision-and-recovery standard.

This is synthetic, controlled-paraphrase evidence, not independent publisher
or opposing-viewpoint validation. The title-plus-lead embedding differs
from the live retained body-derived E5 vector. A 40-record development set
cannot establish catalog-scale performance or justify an active matcher.
