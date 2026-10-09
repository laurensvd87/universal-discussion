# Wikinews learned metric: frozen local test (2026-10-09)

The [owner-approved private corpus](../../../../../decisions/ADR-066-wikinews-multilingual-research-gate.md) has SHA-256 `b03da8d71ada96779e860e29a523a7e9f8bf5de3b595b45fd3c12d53b81958fa`. The run selected the same 1,200 eligible articles from 392 `pageid` event groups and 32 languages as [baseline v1](../wikinews-benchmark-v1/RESULTS.md): train 737/253, validation 207/66, test 256/73 articles/events. It excluded 127 corpus records with empty article text *before* whole-event selection, so groups are whole only among eligible records. The 1,200-article number is an offline compute budget, not a Topic size limit. Packaged E5 embedding took 121 seconds. No content, URL, individual vector or learned weight was written to Git or a log.

Training mined 734 hard triplets, 730 of which chose a negative with a shared broad Wikinews category. Validation selected strength 1 from the predefined `0, 0.5, 1, 2` grid; strength 1 and 2 both admitted 105/328 true validation pairs with zero of 20,993 false pairs, so the weaker strength won. Its cutoff was 0.897529, selected as 0.002 above the highest different-event validation cosine. Raw E5's separately validation-calibrated cutoff was 0.895295.

The held-out test was evaluated once after selecting the adapter and thresholds. The table separates *pair decisions* from complete-link *Topic joins*; the latter can reject a pair that would create a conflicting whole group.

The 256 test articles belong to 73 gold events. Each row below partitions them into predicted Topics.

| Test rule | Pair true / 534 | Pair false / 32,106 | Topic true / 534 | Topic false / 32,106 | Predicted Topics | Singletons |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw E5, fixed 0.94 baseline | 10 | 0 | 9 | 0 | 247 | 238 |
| Raw E5, validation-calibrated 0.895295 | 117 | **1** | 93 | 0 | 184 | 129 |
| Learned diagonal metric, validation-calibrated 0.897529 | 127 | **1** | **103** | 0 | 178 | 120 |

The false pair for each calibrated rule is between different gold events and shares a Wikinews category. The learned metric raised whole-Topic true joins by only ten pairs over the equally calibrated raw E5 on this test, while both happened to avoid false whole-Topic joins. This small gain does not justify activation: both pair gates still made a false admission, 431/534 true pairs remained unjoined by the learned whole-Topic rule, and this sample contains translations of Wikinews editions rather than independent publishers with opposing viewpoints. Shared broad categories are weak hard-negative labels. There is no evidence here of viewpoint transfer or precision in a growing open-world catalog.

No test result was used to tune the model, cutoff or group rule. An identical conflicting validation pair triggers explicit abstention instead of a cosine threshold above 1. No trained model was persisted or connected to the extension or local service. Product training rights, model release and live activation remain separate gates.
