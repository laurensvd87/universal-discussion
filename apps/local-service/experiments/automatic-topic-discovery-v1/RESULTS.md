# Automatic topic discovery: real development findings

29October2026. Root-only development evidence. No live topic/model/schema change.
The earlier four-article success did not survive harder event-identity cases.

The first10 declared primary articles supplied4 usable observations and6 retained
refusals. A separate fixed12-case cohort supplied8 usable observations and4
policy/access refusals: Toronto3 and Waterloo1. All22 outcomes remain counted;
no replacement/redirect/denied-site retry or old hierarchy TEST was used. The
12 encoded articles contain4 gold same-event pairs and62 different-event pairs.
Profiles and roundups have no single event identity. A later award ceremony is
distinct from its announcement for this concrete-event task, even though the
same broad subject can include both. Primary snippets/text were visible during
declaration; this is not independent or fresh final validation.

## Same E5 inputs, three grouping strategies

All methods received identical unit vectors/order and the predeclared0.90
threshold/0.01 ambiguity margin. No dates or gold entered their inputs.

| Representation and method | Correct event pairs | Wrong merged pairs | Missed event pairs |
| --- | ---: | ---: | ---: |
| Paired E5, incremental complete-link |4|17|0|
| Paired E5, incremental centroid |4|17|0|
| Paired E5, threshold connected components |4|62|0|
| Body E5, incremental complete-link |3|14|1|
| Body E5, incremental centroid |4|17|0|
| Body E5, connected components |4|42|0|
| Title E5, each of the three methods |1|0|3|

Complete-link limits chaining but does not turn broad semantic similarity into
event identity. The paired grouping mixes Baker's Nobel announcement, later
engineering-academy election, profile and ceremony. Another group mixes Physics
and Chemistry2025 with a year-end roundup. Some may fit a broad named subject;
they cannot inherit a specific event headline as their common meaning.

A wrong Chemistry2024/2025 title pair scores0.8973, above the correct
Physics2024 title pair0.8688. Raising one universal threshold therefore cannot
recover all four true pairs while rejecting all false pairs in this cohort.
This is a concrete counterexample, not a claim that E5 cannot retrieve neighbors.

All three methods together, including JSON parsing, took median0.60-0.66ms and
p950.84-1.30ms per12-article comparison over100 repeated measurements per view.
The bounded64-item pure test uses2016 pairs/774144 coordinate products/32KiB
matrix. These are small-cohort arithmetic timings, not ANN/database/UI capacity.
The E5 encoding run took9.72s total, with twelve title/body pairs at0.42-0.94s
each, explicit encoder disposal and36 checked source pins. Process34143 exited0.

## Separate compact multilingual sentence encoder

The official Sentence Transformers
[paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
is Apache-2.0 and supplies384-dimensional mean-pooled representations with128
maximum tokens. Its frozen revision is
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42`. New ignored research assets on D:
contain118412398B model and9081518B tokenizer, matching the old known asset hashes;
no old experiment was rerun and no C: download/model replacement occurred.
The model card and runtime artifacts are checked before local inference.

This new experiment uses the same real12 retained articles, no provider calls
or new website requests. Two predeclared views (headline, headline+512-character
lead) and a diagnostic grid0.5/0.6/0.7/0.8/0.9 are reported in full. These are
representation-specific diagnostic thresholds, not probabilities, Related's
cutoff or a production policy. Complete-link examples:

| View and threshold | Correct event pairs | Wrong merged pairs | Missed event pairs |
| --- | ---: | ---: | ---: |
| Title0.5 |4|6|0|
| Title0.7 |2|1|2|
| Title0.8 |1|0|3|
| Title+lead0.7 |3|1|1|
| Title+lead0.8 |1|1|3|
| Title+lead0.9 |0|0|4|

The title+lead0.7 row still incorrectly groups the Baker profile and engineering
election and misses the Physics2025 pair. It is not safe/complete event matching.
All24 local inferences plus setup/comparison took2.94s; the encoder closed,
39 source pins checked and process25412 exited0. The speed is promising, the
measured event discrimination insufficient. Do not activate the model or adopt
one of these thresholds merely because it is better than a failing baseline.

## Temporal and naming consequences

The Trinity Physics2025 article was published17 days after the same announcement
covered by Berkeley. A one-day publication window would split that true event.
The evergreen Baker profile has2013 publication metadata while its text mentions
much newer achievements. Publisher publication time is useful evidence, not an
event timestamp or proof that a page describes one event. Missing dates remain
missing. The original4 E5 observations keep their original input witnesses and
unknown dates; later metadata was not rebound onto them.

Next implement explicit subject/event focus evidence and a confidence policy
that can select a broader named subject when a specific event is uncertain.
Automatic names must fit the common scope: do not label five different Baker
contexts with one Nobel-announcement headline. Consider bounded focus phrases/
entity-action context or a separately validated event verifier; test on new
whole-event/site/language cohorts after selecting policy on DEV. Do not install
UMAP, a new encoder or clustering machinery as an unmeasured repair.

Stable dynamic registry18, indexed candidate recall, Source commit/erasure fences,
role/race/restore checks and actual visible posting context remain required before
automatic live publication. Existing conversations and live20-node routing stay
available while that work proceeds; first-page commenting must remain usable.

Exact saved results (ignored local data):

- New12 capture: `26b065a8dfdb384cccb078862f348291523b41c18bc9be556609307911f5999e`.
- E5 comparison: `104491a7a48afb7979cceefa2dec95ce15e92e8332f3cd3f251457241c78c39c`.
- Sentence comparison: `98260e2132cbf2f58f33b2ac7b17482f6c5c784241d32e3c39c134e4124a6b67`.
- Root audit: `data/automatic-topic-method-comparison-root-audit-20261029.json`.

The exact original E5 comparison source is preserved at commit`ab67a753` before
the maintained diagnostic accepts the alternative encoder's numeric range and
exports its common DEV metric. All original result/case bytes remain immutable.
