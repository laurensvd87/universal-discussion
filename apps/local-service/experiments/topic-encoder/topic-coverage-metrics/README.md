# Topic coverage metrics

`evaluateTopicCoverage(documents, predictedEdges)` is a pure, dependency-free
diagnostic for **new independent evaluations** of provisional Topic groups.
It reads transient `{id, eventKey, lang, duplicateKey?}` records and undirected
`[id, id]` predicted edges. Connected components are the predicted groups.
It reads no files, vectors, page content, database, or network resource.
The offline evaluator explicitly bounds input to 1,200 documents and
100,000 proposed edges because its all-pairs accounting is O(n²) in time
and can be O(n²) in memory. That is an evaluation work budget, **not** a
limit on product Topic members or indexed retrieval.

The result reports gold same-event and different-event pair totals, direct
true/false edges, grouped true/false pairs, cross-language true pairs, complete
pure events, singleton groups, articles in pure non-singleton groups, articles
in mixed groups, and articles with a same-event cross-language peer. The mean
other same-event pages per root post treats every Source article as one possible
root: it averages the count of other articles in its predicted group with the
same `eventKey`, including zero for isolated articles. Thus a 4+2 split of a
six-page event still has measurable discussion reach without being complete.
An event counts as complete only when it has **at least two articles**, all
of them share one group, and that group has no article from another event.
Gold one-article events are reported separately and never inflate useful
multi-article completion.

`duplicateAdjusted` also reports independent-source support. Equal
`duplicateKey` values mean copies or translations of one source article;
missing keys default to unique IDs. Each unordered pair of distinct source
keys is counted once even if several copies make the same direct or grouped
pair. Within-source copy pairs never count as independent support. Its reach
mean averages distinct same-event source peers across unique source keys.
Raw article counts remain available for the actual UI impact. The same source
key cannot span different gold events.

This module is diagnostic only. It does **not** change any frozen runner,
predeclared threshold, acceptance screen, or spent holdout result, and must not
retroactively turn a failed preregistered experiment into a pass. Gold event
labels and predicted edges must come from a separately specified evaluation.

Run `node --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-coverage-metrics/core.test.js`
from the repository root.
