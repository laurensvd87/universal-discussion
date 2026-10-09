# Offline pair verifier v4 — frozen graph development diagnostic

This separate experiment examines group construction on the **same v3
validation pair scores and threshold**, not a new pair verifier. It
re-embeds only the hash-pinned multilingual-balanced-v1 train and validation
files, deterministically refits the unchanged v2 full-coordinate verifier
in memory, and aborts unless the recomputed validation cutoff matches v3's
`0.9805850963542602` within `1e-12`. No test/holdout file is opened; no
weights, text or vectors are saved, and no provider/network capability is
available. The synthetic data and title-plus-384-character-lead E5 input
remain non-parity with real publishers and the live body-derived vector.

Three **predeclared, label-blind** graph policies use the unchanged
`score >= cutoff` edge pool:

1. Threshold components join every gated edge transitively.
2. Triangle-supported components join a gated edge only when its endpoints
   share at least one other gated neighbor.
3. Two-independent-support bridge starts from triangle components and then
   repeatedly merges two components only if at least two gated cross-edges
   touch at least two distinct members on **each** side; choose the eligible
   component pair with the highest cross-edge score, breaking ties by stable
   input order. A singleton cannot be joined by this bridge rule.

No graph rule uses gold `topicLabel`, family or language at decision time;
they are evaluation fields only. There is no Topic member cap. All-pairs
scoring and group comparison on 40 reports do not show catalog-scale
feasibility. The output names graph `eligibleEdges` as the edge pool examined
by a policy, not the exact set of DSU merge operations. Metrics separately
count pair-edge TP/FP, complete developments, mixed groups, grouped true/
false pairs and cross-language true joins. V3 first-fit and agglomerative
complete-link metrics are repeated as fixed references.

This is **development-only**: the cutoff was selected to exceed the maximum
different-development score on these very validation records. It therefore
guarantees zero observed false gated edges *in sample*, and a zero-false
component result would not estimate independent precision. In particular,
connected components could appear perfect merely because of this selection.
No v4 outcome can retroactively make the failed v3 primary screen pass or
authorize opening the sealed test. Any test policy needs a separate freeze
and lead review.

From repository root:

```powershell
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v4/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/offline-pair-verifier-v4/core.test.js
```

Do not run `--run` until the lead reviews this frozen code and README.
