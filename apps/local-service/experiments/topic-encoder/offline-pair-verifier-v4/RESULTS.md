# Offline pair verifier v4: in-sample graph diagnostic (2026-10-09)

The frozen graph policies were evaluated once on the **same 40-record
development validation slice and unchanged verifier scores** as v3. The
v3 cutoff `0.9805850963542602` reproduced exactly within the runner's
`1e-12` check. No model, cutoff or graph rule was retuned; no test/holdout
was opened, and no weights or vectors were saved or activated.

| Development grouping rule | Eligible true / false edges | Groups | Grouped true / false pairs | Mixed groups | Complete developments / 4 | Cross-language true grouped pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Threshold-edge connected components | 113 / 0 | 6 | 152 / 0 | 0 | **3** | 132 |
| Triangle-supported connected components | 109 / 0 | 10 | 141 / 0 | 0 | **3** | 124 |
| Triangle seeds + two-independent-support bridge | 113 / 0 edge pool | 10 | 141 / 0 | 0 | **3** | 124 |
| v3 sequential first-fit complete-link reference | — | 12 | 56 / 0 | 0 | 0 | — |
| v3 agglomerative complete-link reference | — | 14 | 48 / 0 | 0 | 0 | — |

The `eligible edges` column is the pair-score edge pool examined by each
graph policy, **not** a count of its actual component merge operations.
The bridge policy had no effect on this slice: its groups equal the
triangle-supported groups. Triangle support removed four true gated edges
and reduced grouped true pairs by eleven relative to all-edge components,
while preserving three fully recovered developments. Threshold components
were more connective, but a single false bridge could contaminate a group
on an independent corpus; fictional tests demonstrate that failure mode.
Two independent bridges are also not a safety proof.

The apparent zero-false result is **in sample by construction**: the fixed
v3 cutoff was selected as the maximum different-development score on these
very validation records plus 0.002. Thus all gated edges must be true under
these same gold labels. Neither zero mixed groups nor 3/4 complete events
estimates independent safety or justifies reversing v3's failed primary
screen. This is a development diagnostic about graph connectivity only.

The run re-embedded hash-pinned synthetic train and validation with the
existing packaged E5 title-plus-384-character-lead input, then refit the
unchanged full-coordinate pair verifier in memory. Embedding took about
11.6 seconds; total local runtime was about 12.6 seconds. The data are
fictional and controlled; no real independent-publisher or live retained-
input claim follows. The graph has no fixed Topic member cap, but this
40-record all-pairs diagnostic does not establish large-catalog cost.

For a separately reviewed one-shot independent synthetic holdout, the lead
selected only the frozen triangle-supported policy, not the ineffective
bridge policy. That test requires its own schema/hash gate and must not be
inferred from these development results or opened by this runner.
