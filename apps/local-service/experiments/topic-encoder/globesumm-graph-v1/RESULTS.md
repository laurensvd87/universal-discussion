# Frozen GlobeSumm graph comparison (2026-10-09)

The rules and code were recorded in [FREEZE.md](FREEZE.md) before the selected test split was evaluated. The test split was evaluated exactly once, after the train and validation runs; no settings were changed afterward. Input bytes matched ADR-065's SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`. The packaged E5 model reported SHA-256 `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`. The 1,192 selected reports split into 749 train, 150 validation, and 293 test reports; only one split was embedded and grouped in each run. No private article material or per-article result was saved.

| Split | Rule | True joins / possible | False joins / possible | Same-category false | Mixed groups | Exact events / gold | Predicted groups | Grouping time |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train (59 events) | Strict complete-link 0.94 | 8 / 4,536 | 0 / 275,590 | 0 | 0 | 0 / 59 | 741 | 1,065 ms |
| Train | Frozen strict triangle | 36 / 4,536 | 0 / 275,590 | 0 | 0 | 0 / 59 | 726 | 5,114 ms |
| Train | Frozen triangle-nearest veto | 537 / 4,536 | **25 / 275,590** | **8** | **5** | 0 / 59 | 508 | 12,243 ms |
| Validation (13 events) | Strict complete-link 0.94 | 0 / 803 | 0 / 10,372 | 0 | 0 | 0 / 13 | 150 | 64 ms |
| Validation | Frozen strict triangle | 3 / 803 | 0 / 10,372 | 0 | 0 | 0 / 13 | 148 | 56 ms |
| Validation | Frozen triangle-nearest veto | 108 / 803 | 0 / 10,372 | 0 | 0 | 0 / 13 | 100 | 125 ms |
| One-shot test (24 events) | Strict complete-link 0.94 | 6 / 1,710 | 0 / 41,068 | 0 | 0 | 0 / 24 | 287 | 217 ms |
| One-shot test | Frozen strict triangle | 30 / 1,710 | 0 / 41,068 | 0 | 0 | 0 / 24 | 280 | 402 ms |
| One-shot test | Frozen triangle-nearest veto | 256 / 1,710 | 0 / 41,068 | 0 | 0 | 0 / 24 | 199 | 680 ms |

All true joins on these splits were cross-language except one unjoined same-language true train pair. None of the 96 selected gold events was recovered as a complete group by any rule. E5 embedding time was about 76.9 seconds for train, 15.4 seconds for validation, and 29.5 seconds for test. Grouping times are single local wall-clock observations, exclude embedding and scoring, and are not scale benchmarks. The 749-report train cost (12.2 seconds for the veto rule) already illustrates the expense of a global candidate check.

The nearest-veto rule improves test same-event pair joins from 6 to 256 without a test false join, but its 25 train false joins across five mixed predicted groups disqualify it under the project's precision-first criterion. The strict triangle had zero false joins on all three selected splits, but recovered only 30/1,710 test true pairs and no complete event. Zero observed test false joins is not a general precision guarantee. No new threshold was fitted to these results.

The nearest-neighbor veto checks each member against its nearest page in the entire evaluated catalog. This is a global veto and does **not** satisfy ADR-064's bounded affected-neighborhood scale design, regardless of the measured score. The research input is title plus a 384-character lead; the live matcher uses a body-derived E5 vector, so these numbers do not transfer directly to production. GlobeSumm has no viewpoint or reliable family labels, and the event-disjoint fallback does not guarantee adjacent-development or publisher-disjoint evaluation. Same-category negatives are a weak proxy. Earlier corpus-wide inspection found one identical title/lead copy with conflicting gold event labels; no cross-event exact-duplicate pair occurred inside these evaluated splits. That ambiguity and possible differences between GlobeSumm event labels and the app's Topic boundary limit interpretation of false joins.

The dataset card labels GlobeSumm CC BY-SA 4.0, but rights in underlying publisher articles remain unresolved for product training or shipment. ADR-065 authorizes this private local research only. This result makes no live Topic, Source, migration, model-asset, storage, extension, discussion-routing, or release change. No graph rule is recommended for activation.
