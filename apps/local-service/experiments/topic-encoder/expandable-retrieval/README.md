# Expandable exact retrieval (offline prototype)

This directory is a source-record-only retrieval experiment for ADR-064. It does
not classify event identity, assign Topics, change the service/database, read the
sealed multilingual v3 holdout, or call a provider. Inputs are caller-supplied
vectors and IDs. The 100+ growth test uses invented vectors.

`ExactCosineIndex` normalizes vectors, builds a deterministic median-split ball
tree, and searches it best-first. A node's Euclidean ball gives an upper bound
on cosine for every contained source. Leaf vectors get exact cosine scores.
The cursor emits a source only when no unexplored node can outrank it. IDs break
equal-score ties. `nextBatch(K)` means **K returned results per call**, with a
resumable cursor; K never caps Topic size or total candidate count. The
`collectAboveFloor` helper continues until an exact next score falls below a
*retrieval* floor, or the catalog is exhausted. A floor is not a same-event
decision rule. The helper consumes the first below-floor item; use a new cursor
for a different floor.

`maxWork` is a cumulative cursor budget counting node-bound calculations and
exact source scores. When the next exact result cannot be certified within it,
the response is `status: 'unresolved'` with `reason:
'work-budget-exhausted'`. The caller may increase the budget and resume. A
partial batch is still exact for its returned prefix. Neither an empty partial
result nor budget exhaustion is evidence for a singleton or merge.

Run focused checks and the synthetic benchmark from the repository root:

```sh
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/expandable-retrieval/index.test.js
node apps/local-service/experiments/topic-encoder/expandable-retrieval/benchmark.js
```

The six tests compare complete ranks with brute force (including duplicate
vectors and mixed-sign 384D vectors), check 137 same-event reports beside 35
adjacent reports and 500 noise items, and verify budget exhaustion and resume.
The benchmark makes 384D vectors with two active coordinates: 60% same-event
cluster, 20% adjacent cluster, 20% noise. It requests a ranked prefix of at
least 150 items in batches of 16. A single local Node run on 2026-10-08 gave:

| Sources | Build ms | Indexed prefix ms | Brute-force all ms | Exact scores | Node bounds | Heap delta MiB | Rank agrees |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 100 | 12.60 | 1.01 | 4.27 | 100 | 15 | 1.58 | yes |
| 1,000 | 59.78 | 0.43 | 34.12 | 172 | 37 | 5.69 | yes |
| 5,000 | 310.96 | 0.50 | 168.14 | 176 | 55 | 22.18 | yes |

These timings are one noisy warm-process observation, not a service latency
claim. The indexed timing covers only the requested prefix; the brute-force
timing scores/sorts the entire catalog. Heap deltas include temporary garbage
and exclude any guarantee about retained memory. Building from scratch is
currently expensive. The tree holds O(Nd) vector data plus O(Nd/L) node
centers for dimension d and leaf size L, and recursive construction takes
roughly O(Nd log N + N log² N) here because each node scans dimensions and
sorts its subset. Search has no sublinear worst-case guarantee: overlapping
balls, identical vectors and high-dimensional concentration can force O(Nd)
exact work. The 384D test checks correctness, not realistic 384D pruning.

This is a read-only static index. Production would need incremental/versioned
rebuilds, title/URL token postings, affected-neighborhood handling, realistic
vector recall/latency audits, persistence and policy gates. Exact retrieval
solves only candidate coverage; event evidence and conflict resolution remain
separate. In particular, a below-floor boundary proves only that all remaining
vector scores are below that chosen floor, not that there is no same event.
