# ADR-067: Keep adaptive graph admission offline after mixed evidence

Status: **research decision; no live activation**. Date: 2026-10-09.

## Context

The [Wikinews baseline](../apps/local-service/experiments/topic-encoder/wikinews-benchmark-v1/RESULTS.md)
and [cross-viewpoint transfer](../apps/local-service/experiments/topic-encoder/wikinews-transfer-v1/RESULTS.md)
show a recurring gap: packaged E5 usually retrieves another report of the
same precise development near the top, but a safe hard-Topic admission rule
joins few reports. A small learned diagonal embedding improved this only
slightly and did not recover any complete five-report viewpoint Topic.
Lowering a global threshold alone risks moving whole Source-anchored
conversations into an incorrect Topic.

## Offline experiment and decision

An [adaptive graph experiment](../apps/local-service/experiments/topic-encoder/adaptive-topic-graph-v1/RESULTS.md)
tested complete-link, supported group merges and three-source triangle
seeding. It imposes no maximum Sources per Topic. Development selection
required zero false Topic joins on both known synthetic train and validation.
The selected strict rule joined **0/200** same-development validation pairs.
An exploratory looser rule joined **118/200** validation pairs with no false
joins there, but **10 false pairs** on the train slice, at least seven between
nearby developments in the same entity family.

Only after the method and settings were frozen did a separately created
[50-report holdout](../apps/local-service/experiments/topic-encoder/multilingual-holdout-v5/README.md)
become available. An independent agent checked all 50 titles/bodies for
same-development consistency and distinct neighboring events; three wording
issues were corrected before the corpus hash was frozen. The holdout has all
25 language-viewpoint combinations, but they are not evenly balanced.
On this one-shot holdout the exploratory rule joined **76/100** true pairs,
**0/1,125** false pairs and recovered **4/10** exact Topics. The strict rule
joined only **9/100** true pairs and recovered none. These results are
promising for research but do not erase the known train failures or estimate
real-world precision.

**Decision:** do not activate any of these graph rules, thresholds, model
weights, or revised Topic migrations. Keep retrieval and `related` results
separate from hard same-Topic admission. Continue offline work on diverse,
independently checked same-event and adjacent-event cases across viewpoints
and publishers; evaluate false Topic joins and full Topic recovery, not only
nearest-neighbor rank or pair recall. Any live regrouping proposal must
address existing discussions and pass the owner/Trust activation gate in
[ADR-064](ADR-064-event-evidence-topic-graph.md) plus relevant rights,
security, privacy and store review. No fixed offline sample or three-source
evidence requirement becomes a product Topic-size cap.

## 2026-10-09 second holdout and retained-data check

The graph rules remained frozen for a separate balanced 60-report,
12-development, five-language viewpoint holdout (exact hash and tests in
[its README](../apps/local-service/experiments/topic-encoder/multilingual-holdout-v6/README.md)).
The exploratory triangle made **79/120** true joins but **8/1,650** false
joins, all between neighboring developments of the same family; three
predicted groups mixed gold Topics. The nearest-neighbor veto made **63/120**
true joins and zero false on this holdout, but its seven known false train
joins remain. The strict selected rule made **21/120** true joins and zero
false, with no complete gold Topic. These are one-shot synthetic results, not
new tuning targets or cross-publisher reliability estimates.

A separate offline [relation-model experiment](../apps/local-service/experiments/topic-encoder/topic-relation-v1/RESULTS.md)
trained on the older fictional train slice and froze two rules before the
same v6 holdout: an information upper bound using article body text, and a
retained-compatible rule using only existing body-E5 vectors and titles.
Both made zero false v6 joins but only **11/120** true whole-Topic pair joins
and **0/12** complete Topics. Retrieval still found a true neighbor in the
first three for **60/60** reports. The upper bound cannot run on the backend's
current retained fields, and neither rule supports activation. The v6 set is
now spent for these candidates. Continue with already approved real-corpus
research and a separately rights-reviewed cross-publisher benchmark rather
than selecting yet another threshold on v6.
