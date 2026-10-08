# Focus graph v4: offline development candidate

This is an **inactive** precision-first Topic partition experiment. It uses the
packaged E5 title-plus-384-character-lead vector and transient local text
facets. It changes no live Source, Topic, root post, SQLite schema, browser
capture or retained field. The experiment never opens Luna TEST/CHALLENGE or
the later multilingual holdout v2. The multilingual set here had already been
scored by earlier candidates, so it is development evidence, not an unseen
promotion test.

## Rule

For two reports, 0.90 focus cosine plus a train-calibrated weighted word
overlap may establish direct same-event evidence when there is no detected
product-version or single-action conflict. Reports without shared words (often
different languages) require a coherent reciprocal top-two **three-report**
neighborhood. Its three links must clear a conservative 0.84 floor, have no
explicit conflicts, and outrank each member's strongest outside alternative.
The score floors reject remote pages; the *relative local neighborhood*
determines whether a close cluster has enough event evidence. There is no
global 0.04 winner lead, catalog-size penalty, or static Topic-count cap.

Only fully supported pairs may join, and groups use complete-link checking;
high similarity without that evidence remains a related-page suggestion.
Sorting IDs and scores makes results independent of insertion order. The
lexical cutoff `0.15644897942164984` comes from training negatives only and
is not a general calibrated probability. The event-action detector is English
only; the multilingual path depends on corroborating geometry. An unrecognized
conflict can still cause a false join. Dense crowding can also make a valid
three-report cluster ambiguous and reduce recall; related suggestions are the
intended empty-forum fallback.

This standalone prototype computes all pair similarities, sorts each full
neighbor list, and repeatedly checks cross-group pairs. Its worst-case cost is
at least quadratic memory and can approach quartic time as groups grow; it is
**not a production-scale implementation**. Production would retrieve indexed
top-K candidates and recompute only affected local neighborhoods. K is a
search workload bound, not an automatic Topic-size or Topic-count bound;
previously confirmed direct evidence must not disappear solely because new
pages enter the wider catalog. The real update/migration semantics still need
design and review.

## Reproduce

From the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-focus-graph/matcher.test.js
node apps/local-service/experiments/topic-encoder/topic-focus-graph/run.js
```

The runner verifies the frozen input hashes, uses only train, validation and
the previously scored multilingual set, and prints aggregate partition scores.
It writes no vectors, text, URLs or model artifacts. Five offline tests cover
cross-language triangles, two-page abstention, explicit conflict, an unrelated
crowd and seven same-event reports beside two adjacent-event reports.

| Development set | Gold true pairs joined | False pairs joined | Input-order changes |
| --- | ---: | ---: | ---: |
| Luna train | 19/84 | 0/3,076 | 0 |
| Luna validation | 10/24 | 0/166 | 0 |
| Previously scored multilingual | 18/24 | 0/252 | 0 |

All 24 train and 4 validation unrelated singleton pages abstained. This
small synthetic evidence does **not** establish real-web precision. The
frozen matcher SHA-256 is
`800ebb28c914ba3188686f88c422ac29c902d2c9853a46eeb5af99f33e2eeb19`;
do not edit it before a one-shot independent holdout evaluation. A second
retained focus vector and derived content facets would require the separate
owner/Trust data and migration decision before any live activation.
