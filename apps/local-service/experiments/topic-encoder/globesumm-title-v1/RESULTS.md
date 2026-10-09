# Title-only E5 early-stop result (2026-10-09)

The predeclared title-only comparison stopped after the event-disjoint train split because title-only was worse on retrieval and all three grouping rules. No validation, selected test, or unselected report was embedded or scored. The runner was frozen before the run with SHA-256 `410D76E5EEE63A69EF9BCF42C7DCD846371F63FCB39AD7F59D22A79505D24E32`. The private input matched ADR-065's SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`; the packaged E5 model reported `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`. No model or article material was saved.

The selected train slice contains 749 reports from 59 gold events, 4,536 same-event pairs and 275,590 different-event pairs. Every comparison below uses the same reports and a single vector per report for that representation.

| Frozen grouping rule | Title+lead true / 4,536 | Title+lead false / 275,590 | Title-only true / 4,536 | Title-only false / 275,590 | Mixed groups, title+lead / title-only | Exact events, both |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Complete-link cosine 0.94 | 8 | 0 | 6 | 0 | 0 / 0 | 0 / 59 |
| Strict triangle | 36 | 0 | 17 | 0 | 0 / 0 | 0 / 59 |
| Triangle-nearest veto | 537 | **25** | 260 | **11** | 5 / 5 | 0 / 59 |

The title-only nearest-veto rule still joined seven same-category different-event pairs; title+lead joined eight. Fewer false joins here are not an improvement sufficient for hard Topic routing because both versions mix five predicted groups, and title-only loses over half of the correct joins under the veto. The veto's global nearest-neighbor check remains outside ADR-064's scale requirement.

| True-event retrieval, 749 eligible queries | Title+lead | Title-only |
| --- | ---: | ---: |
| Rank 1 among all candidates | 664 | 622 |
| Top 3 among all candidates | 719 | 697 |
| Top 10 among all candidates | 744 | 735 |
| Rank 1 among cross-language candidates | 730 | 710 |
| Top 3 among cross-language candidates | 746 | 733 |

The title+lead E5 pass took 115.2 seconds and title-only took 25.5 seconds. Grouping time in the same rule order was 1.21/6.63/15.58 seconds for title+lead and 1.32/6.26/10.52 seconds for title-only. These are single local wall-clock observations, affected by run order and input length; they are not a controlled latency benchmark. The faster title-only pass did not improve grouping or retrieval quality.

GlobeSumm has no viewpoint labels or reliable adjacent-development family and publisher-diversity labels. Its gold event boundary may differ from the product's Topic boundary. The event-disjoint train slice alone cannot establish general precision; same-category is only a weak hard-negative proxy. Underlying publisher-article rights remain unresolved for product training or shipment despite the dataset card's CC BY-SA 4.0 label. The run used ephemeral local vectors only. A second retained vector or upload is **not approved**; extra inference latency and any new privacy, storage, retention, migration, or provider boundary require a separate owner and Trust gate. No product change or activation follows.
