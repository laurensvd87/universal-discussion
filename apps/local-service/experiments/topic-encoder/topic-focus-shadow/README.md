# Ephemeral Topic focus input shadow

This offline experiment reads only the SHA-pinned Luna synthetic training
(80 articles) and validation (20 articles) files. It uses the already packaged
E5 model twice per article: the existing body input and a second input made
from the title plus at most 384 normalized characters of the lead. Both vectors
and any derived lexical facets exist only in memory. The program prints
aggregate metrics and embedding time; it writes no articles, tokens, vectors,
model artifact or owner data. No network, provider, package installation or
production route is used.

From the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-focus-shadow/shadow.test.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-focus-shadow/run.js
```

The methods use the existing [multi-page benchmark](../topic-benchmark/README.md)
for pair precision/recall, false joins, pure components, no-match abstention
and insertion-order checks:

| Method | Input and grouping |
| --- | --- |
| `bodyCurrentPlanner` | Current body E5 vector and production planner. |
| `focusCurrentPlanner` | Focus E5 vector through the same planner. |
| `focusCompleteLink90` | Focus cosine at least 0.90 for every pair in a merged group. |
| `focusTrainFacetGate` | Focus complete link plus generic product/action conflict checks and a weighted lexical overlap cutoff selected from training negatives only. |
| `bodyAndFocusTrainFacetGate` | Both cosines at least 0.90 plus the same facet gate. |

The lexical cutoff is the highest eligible different-Topic training-pair
overlap plus an epsilon, giving zero pair false joins on training by design.
Validation labels are scored only after this rule is fixed. Product version
checks read titles only; event-action cues and weighted content terms read
the title plus bounded lead. Gold Topic, entity and viewpoint labels are
removed before either matcher receives a Source. A manually fixed train and
validation entity map allows same-entity/different-development false joins to
be counted without opening any held-out article or label file.

This is a diagnostic of whether a short event-focused input and simple facets
help on invented English text. A train-selected zero-false cutoff can fail on
new entities, and full-prefix synthetic leads are richer than some real pages.
No threshold, second retained vector, page extract, Topic membership or
discussion route changes follow from this experiment.

## Frozen measured result, 2026-10-08

The packaged E5 model SHA-256 was
`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.
Embedding 100 bodies took 14.0 seconds; embedding 100 bounded focus inputs
took another 10.1 seconds on the test machine. Those are whole-batch
measurements including model/session setup, not per-page browser timings.
The lexical cutoff selected solely from training negatives was
`0.15644897942164984` (highest eligible negative overlap plus `1e-9`).

| Method | Train true pairs / 84 | Train false pairs | Validation true pairs / 24 | Validation false pairs |
| --- | ---: | ---: | ---: | ---: |
| Body E5 + current planner | 0 | 0 | 0 | 0 |
| Focus E5 + current planner | 0 | 0 | 0 | 0 |
| Focus E5 + complete link .90 | 78 | 12 | 24 | 0 |
| Focus E5 + trained facet gate | 17 | 0 | 9 | 0 |
| Body and focus E5 + trained facet gate | 17 | 0 | 9 | 0 |

All 12 plain-complete-link training false joins were between distinct
developments of the same broad entity. Each method abstained on all 24/24
training and 4/4 validation singleton no-match pages. The 0.90 cosine floor
covered 83/84 true training pairs and 24/24 true validation pairs with the
focus representation; it also covered 26/3,076 false training pairs and
13/166 false validation pairs. Input order did not change any partition in
the three tested permutations. The current planner's global outside-neighbor
gate still returned all singletons with either vector input.

The small validation split has no plain-complete-link false join, while the
larger training split has 12. The train-calibrated facet gate removes those
training false joins but loses most same-Topic pairs, including divergent
viewpoints. Requiring the body vector in addition to focus did not change
either split's result. These observations do not support a production matcher
or a retained second vector. The runner opens only train and validation article
files. During development, I inspected the shared `broad-families.json` map,
which also lists test family names; I did not open held-out articles, use those
names in the experiment, or score any held-out split.

Frozen inputs and experiment source SHA-256:

| File | SHA-256 |
| --- | --- |
| Luna `train.jsonl` | `2f229a606e9eaad34eb35a6b908d3f3321ba825da8a1e68494f6710f0dd89d27` |
| Luna `validation.jsonl` | `71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e` |
| `core.js` | `ecda4f5e12afc5a3152fb0cbd4a6a6b4aaec91b59f53130bab5dabbb446e250c` |
| `corpus.js` | `1253452bf75f280e3737bc85def74aefdddf9fe345d975668e318cc8a0b8ab5e` |
| `experiment.js` | `f164b06835db7e9b74414f12d4bfeff3731c5769ff4d3f0b0867b74a2c625552` |
| `run.js` | `b18734b59b67fd5dcf6a17932ca3bd0243076fb6762b7ca639c5a33363083719` |
