# JRC title-only E5 pilot: train and exploratory validation (2026-10-09)

Status: **negative exploratory offline result; do not activate**. The train
partition was scored first. After a frozen aggregate-only leakage proxy audit
found no detectable cross-label exact/near-title, URL or high-overlap
description pair, the validation partition was scored once without changing
the candidate thresholds. The test partition remains unopened. The audit
explicitly reports `eventDisjointnessVerified:false`: paraphrased duplicate
events may evade these proxies.
The full pre-registered [protocol](../../../../../research/JRC_STORY_BENCHMARK_PROTOCOL_2026-10-09.md)
has not been completed, especially independent publisher/viewpoint checks and
definitive cross-label event adjudication.

The private JRC CSV has 4,251 records/110 analyst labels and remains outside
Git. Its approved SHA-256 is
`05cbdc609102ef026accc5ad5c9d7202b1c0718a651448132ad04b1bb4396ab2`.
The deterministic whole-label compute sample has 1,200 titles/26 labels:
702/16 train, 286/5 validation, 212/5 test. The largest 423-record label is
intact in train. The 1,200-title budget limits this experiment's compute,
**not** product Topic size. The train run used only the packaged E5 title
input, fixed cosine diagnostics 0.94 and 0.90, and fixed title-token
Jaccard 0.50. `core.js` SHA-256 was
`af2c50aab306de7c2af26be5dc89b5bbbb4e2870775612fcff34355d4c007fc4`;
`run.js` was
`9389ab6c1f63731dd662ff4175f412c4da352687cc427805c2466865ae983ed6`.
No threshold was tuned from these results. Train embedding took about 16
seconds and its local run about 18 seconds; exploratory validation embedding
took about 7 seconds. Eight fictional tests and the dry run passed; an
independent read-only review found no raw-data egress in the aggregate-only
harness. The audit checked 3,698,885 bounded cross-label title comparisons
without truncation and found no near-title candidate; it cannot prove event
disjointness. The frozen validation runner additionally used `audit.js`
SHA-256 `d2e9b4bcf69827e4ed55daaccdcd475983337b470f8338caf8c279f19dcf7522`
and `run.js` SHA-256
`d6d301644099f8930132d9a834d56bedc0254a2db2ae32650b182f60467356ea`.

| Train diagnostic, distinct URL hosts | Positive/negative pairs | E5 0.94 true/false admitted | E5 0.90 true/false admitted | E5 top-3 found/eligible |
| --- | ---: | ---: | ---: | ---: |
| All 702 titles | 92,886 / 152,347 | 7,371 / 0 | 27,793 / 0 | 701 / 702 |
| Different language | 49,488 / 121,339 | 93 / 0 | 4,554 / 0 | 645 / 670 |
| Non-identical normalized title | 92,143 / 152,347 | 6,628 / 0 | 27,050 / 0 | 701 / 702 |
| Excluding largest label | 4,042 / 34,509 | 265 / 0 | 858 / 0 | 278 / 279 |

When every cross-host pair admitted by a fixed gate is linked into a
connected component, 0.94 produced 207 groups and completely recovered
1/16 labels; 0.90 produced 93 groups and completely recovered 2/16. No
mixed-label group appeared on **this train slice**. That does not mean the
rule is safe: cross-label related-event leakage had not yet been audited at
that stage, the labels can be broader than the app's exact Topics, and the
validation/test partitions had not yet been opened. The large label dominates pair counts, so
the smaller-label slice and whole-group recovery matter more than the
apparently near-perfect top-three retrieval. Cross-language hard admission
at 0.90 captured only 4,554/49,488 positive pairs despite finding a
candidate in the first three for 645/670 eligible titles.

This reinforces the *retrieval versus admission* gap but does not justify
changing the service's body-derived vector, the 0.90 live floor, or any
existing discussion. Title-only JRC is not input-parity with the extension;
URL host is not a verified publisher or viewpoint. The later audit and
validation below reinforce this caution; the selected test split remains
sealed for a separately developed candidate.

## Exploratory validation result: candidate rejected

The frozen title-only methods were evaluated once on 286 titles in five
whole labels. The cross-host denominator was 32,574 same-label pairs and
7,674 different-label pairs. E5 found a true partner in the first three for
286/286 eligible titles, but hard matching failed the precision-first gate:

| Frozen rule | True pair admissions | False pair admissions | Mixed groups | False grouped pairs | Complete labels |
| --- | ---: | ---: | ---: | ---: | ---: |
| E5 cosine 0.94 | 787 | 1 | 1 | 2 | 1/5 |
| E5 cosine 0.90 | 4,237 | 22 | 1 | 687 | 2/5 |
| Title Jaccard 0.50 | 310 | 0 | 0 | 0 | 1/5 |

Across different languages, E5 at 0.90 admitted only 147/18,134 true
cross-host pairs and one false pair; at 0.94 it admitted 1/18,134 true
and no false pairs. Yet cross-language top-three retrieval found a
same-label candidate for 269/274 eligible titles. This is the same
retrieval/admission gap as in the train split, now with observed false
joins. The validation set has only five labels, one with 257 titles, and
the label boundary remains an imperfect proxy for app Topics. Nevertheless
one wrong direct edge becoming hundreds of wrong grouped pairs is exactly
the risk for shared discussions. No rule here qualifies for activation or
retroactive routing. Do not tune a new cutoff on these five labels and then
call the same split independent validation. The selected test split remains
sealed for a future separately developed candidate.
