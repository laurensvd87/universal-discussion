# Private radius-neighborhood event pair research v1

Offline ADR-065 research only. This does not change live Topics, discussions, stored Sources or model assets. The CLI requires an explicit absolute private directory and regular input file underneath it, outside the repository. It reuses the bounded real-event-eval parser and whole-event selection, and the packaged local E5 title-plus-lead encoder. Network and subprocess capabilities are denied. It writes no files and emits no article text, titles, URLs, labels, vectors or per-document results.

The hypothesis is that the neighborhood shared by two Source vectors carries event evidence beyond their direct cosine. For each split independently, the algorithm considers **every** pair within three fixed similarity radii (0.75, 0.80, 0.85); it never truncates a Source's neighbors to a global top-K or caps Topic membership. The pair score adds shared-neighbor Jaccard and a bounded measure of whether the pair is closer than each endpoint's local mean. Train gold event labels select one policy from a frozen weight grid and a cutoff above all train different-event scores by 0.003. Validation is scored once; selected test documents are never embedded or paired. A local crowd of reports can add support, but it can also create spurious common neighbors, so zero train false pairs is not a precision guarantee.

Output gives aggregate validation pair TP/FP/FN/TN, same-category false admissions, cross-language true-pair admissions and raw cosine-0.94 baseline. Pair admission does not form a Topic partition. Category is a coarse negative stratum, not precise adjacent-event gold. Without family labels, event-disjoint splits cannot claim family separation. Validation is not a tuning set for this frozen v1.

From repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/real-neighborhood-v1/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-neighborhood-v1/core.test.js
node apps/local-service/experiments/topic-encoder/real-neighborhood-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json
```

All failures print fixed codes without private paths, values or stack traces. Do not commit or publish even aggregate real-run output without review.
