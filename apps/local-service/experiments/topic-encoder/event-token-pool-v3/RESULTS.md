# Event-token-pool v3: development-only result

Date: 2026-10-09. Protocol and code were reviewed, committed as `ed2d1d2`,
and pushed before the **single** development measurement. The separately
authored `topic-benchmark/multilingual-holdout-v5` was not opened or scored.
This experiment trained in RAM on 162 project-created fictional reports,
calibrated on 54 whole-family-disjoint fictional reports, and evaluated on
108 independently authored development reports in five languages. A/B and
C1/C2/C3 exact-byte hashes are pinned in the README and run output. The
packaged E5 input was title plus 384 body characters; it is **not** live
body-prefix parity. No weights, token states, vectors, page text, or rows
were saved or sent anywhere.

| Method | Nearest correct event | True admitted edges | False admitted edges | Complete events | Mixed groups |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dynamic hard-negative attention | 106/108 | 0/270 | 0/5,508 | 0/18 | 0 |
| Frozen static-mined attention reference | 106/108 | 0/270 | 0/5,508 | 0/18 | 0 |
| Raw pooled E5 | 64/108 | 0/270 | 0/5,508 | 0/18 | 0 |

The dynamic model's train-calibrated max-negative-plus-0.002 gate was
`0.9672420357423266`. Its cross-language retained edges were 0/252 and
same-family false edges 0/648. The frozen screen required at least 81 true
edges, 63 cross-language true edges, four complete events, rank-1 >=87,
zero false joins, and a strict non-regressive improvement over the static
reference. It **failed**: good nearest-neighbor retrieval did not produce
any safe Topic admission, and there was no comparator gain. This is a
development-set diagnostic, not a real-web precision estimate; even the
zero observed false joins are vacuous with zero links.

The v3 candidate is rejected for Topic admission. Do not tune its cutoff,
loss, input, or graph on the sealed v5 holdout. Development C may support
explicitly exploratory analysis of a **new** local-relative admission
method, but that new method needs its own frozen protocol and independent
evaluation before any product claim. No live matcher, stored vector,
discussion route, extension behavior, model asset, or permission changed.
