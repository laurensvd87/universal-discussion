# Indexed alternate Topic planner v2: synthetic scaling evidence

2026-10-10. After independent Trust and actual-Chrome review, the service and
dashboard now use this planner for the optional owner-local alternate read view.
It is not a new canonical Source/Topic matcher. This benchmark uses no page text,
private data, fitted weights, provider calls or network access.

## Algorithm and preservation

The existing 384-coordinate vectors and optional local diagonal adapter are
validated exactly as in the current planner. All eligible Source IDs are
returned exactly once; manual pins remain excluded. Vectors and inputs are
never mutated. No fixed Topic, member, catalog, or nearest-neighbor count is
used. The implementation does not allocate an all-pairs score matrix or an
all-neighbor adjacency graph.

An exact VP-tree indexes a contractive 48-coordinate projection. Projection
distance can rule out a high-cosine neighbor, never admit one. Triangle
inequalities, full-vector squared norms, and coordinate boxes bound candidate
scores conservatively. An admitted Source pair always uses the full vector.
Candidate searches have no fixed top-k and never omit a candidate because a
result list filled up. Counting a crowded neighborhood stops only after the
policy's three-neighbor condition is proved. Witness queries stop only after
an actual independent common witness is found. This is exact retrieval for
the thresholds, with a 1e-10 conservative roundoff allowance for pruning only.
The allowance does not relax any admission threshold.

Supported group merging uses a dynamic VP-tree forest of immutable centroids,
with tombstones and binary-block rebuilds. Each live group contributes its
best eligible merge to a heap. A candidate whose partner retired is an upper
bound on its owner's remaining old candidates and is recomputed before it
can be selected. The new group's best candidate covers every newly created
pair. Consequently, the heap preserves global best-merge selection without
materializing all group pairs. Persistent ordered member/Source sets keep
deterministic lexicographic tie keys without copying a growing list into
every stale heap entry.

Group boxes and centroid balls certify pairwise support for dense clouds.
For members x and y, dot(x,y) equals (norm(x)^2 + norm(y)^2 - distance(x,y)^2)/2.
The maximum possible member distance and minimum member norms can therefore
prove every cross pair exceeds 0.94. If the bound cannot prove support, all
necessary actual cross scores are checked, including the weakest 0.90 pair
and independent support in both directions. Early rejection cannot weaken
those gates. The centroid represents the mathematical unit-weighted mean
cross score; small certified joins of at most 256 cross pairs preserve the
old planner's actual floating-point accumulation order.

## Deliberate semantic differences

The policy is `alternate-indexed-independent-evidence/v2`, not the old v1.

1. Exact identical transformed vectors count as one independent evidence
   unit. Every corresponding Source ID is retained in its bucket. Duplicate
   copies cannot add neighbors, common witnesses, a second support vote, or
   additional weight to a centroid. A test demonstrates a real legacy join
   produced by duplicate copies and verifies that v2 rejects it. Similar but
   unequal vectors remain independent; this is not deduplication by URL,
   retained text, approximate similarity, or provenance inference.
2. A large geometrically certified merge uses its centroid mean instead of
   revisiting all cross pairs. Floating-point accumulation and clamping at
   the accepted unit-norm tolerance can change a numerically tied merge order.
   Small joins use the old accumulation order. This is not a proof that all
   possible floating-point catalogs have identical v1/v2 partitions.

The .94 seed/support, .90 weakest-pair, mutual-neighbor, and crowded-witness
gates otherwise remain. These gates are experimental admission rules, not
calibrated semantic identity or a demonstrated accuracy improvement.

## Resource boundaries and remaining limitations

The default score cache retains at most 65,536 unordered pairs and evicts by
FIFO; eviction causes exact recomputation, never truncates the candidate set.
The default work guard is 100,000,000 work units and 10 seconds. Any exhaustion
throws `ServiceError('capacity')` with no partial partition. Callers must
report unavailable/pending or use their truthful canonical fallback.

Retained index/vector geometry is O(n * dimensions), with expected O(n log n)
persistent-set storage and O(n) heap entries. The cache is separately bounded.
There is no global dense n-by-n allocation. Temporary build arrays, string
signatures and garbage collection still have material memory cost. This is
not a hard bound on total process memory: measured 5000-page process RSS
increases were approximately 191-219 MiB. It would be misleading to claim
lower RSS than the old planner on all cases; the 1000-unrelated case uses more
index memory despite far fewer exact pair scores. A hypothetical 5000-page
Float64 all-pairs matrix alone would require 190.7 MiB, before other structures.

High-dimensional exact retrieval can still visit quadratic numbers of index
nodes. The 5000-random-unrelated case performed 25,033,697 work units despite
only 4968 full pair scores. A single 5000-member distinct-vector dense cloud
still reached the ten-second guard. The helper remains synchronous and can
block the Node event loop until that guard; it is not a no-limit or background
production solution. A worker with cancellation and revision-bound handoff,
or an async/incremental design, needs a separate implementation and review.
No such worker or production integration is included here.

## Reproduction

From the repository root:

```powershell
node --test --test-isolation=none apps/local-service/test/alternate-topic-planner-indexed.test.js
node --expose-gc apps/local-service/experiments/topic-encoder/indexed-topic-planner-v1/benchmark.js indexed:5000:clusters
```

`benchmark.js` accepts `legacy|indexed:count:unrelated|clusters|cloud|duplicates`.
The default suite runs 1000/5000 cases. Use a fresh Node process per case for
comparable memory measurements. The synthetic generator is deterministic
Mulberry32 with seed 918 and has no external dependencies. Unrelated vectors
are random in all 384 dimensions. Clusters contain 20 distinct near-unit
vectors sharing one of 250 orthogonal centers in the 5000 case. Cloud vectors
share one center with independent eight-dimensional perturbations. Duplicate
vectors are exactly equal. The benchmark asserts complete unique Source
coverage, expected group counts, and no cross-cluster join in successful runs.

The focused guarded check is:

```powershell
cd apps/local-service
node --import ../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none test/alternate-topic-planner.test.js test/alternate-topic-planner-indexed.test.js
```

That check passes all 16 tests: the seven existing checks and nine indexed
checks. Indexed checks include 100 randomized distinct-vector parity cases,
180 crowded .90/.94 threshold cases with shuffled IDs/input and valid norms
within +/-9e-6, the sparse/witness/bridge fixtures, duplicate support abuse,
5000 exact copies, 1500 distinct unrelated vectors beyond the old pair-count
ceiling, a 1000-member distinct cloud, zero/tiny cache parity, fail-closed work
exhaustion, adapters, manual pins, invalid inputs and input immutability.

## Measured results

Windows x64, Node v24.19.0, 2026-10-10. Fresh process per case. Values are a
single final run, not a throughput or latency guarantee. Memory values are
post-run deltas after fixture creation and pre-run GC, not sampled peak RSS.
The legacy failure on supported clusters/cloud is its score-work guard.

| Synthetic case | Legacy result / ms | Indexed result / ms | Exact pair computations | Indexed added ArrayBuffers MiB | Indexed added RSS MiB |
| --- | --- | --- | ---: | ---: | ---: |
| 1000 unrelated | 1000 groups / 269 | 1000 groups / 238 | 218 | 3.0 | 52.9 |
| 5000 unrelated | pair-count capacity before scoring | 5000 groups / 9061 | 4968 | 17.3 | 191.2 |
| 1000, 50 clusters | score-work capacity / 339 | 50 groups / 329 | 9566 | 14.7 | 54.1 |
| 5000, 250 clusters | pair-count capacity before scoring | 250 groups / 1994 | 91462 | 48.9 | 219.4 |
| 1000, one distinct cloud | score-work capacity / 919 | one 1000-member group / 906 | 182496 | 6.4 | 53.5 |
| 5000, one distinct cloud | pair-count capacity before scoring | time capacity / 10001 | no result | 55.9 | 207.8 |
| 5000 exact copies | pair-count capacity before scoring | one 5000-member group / 56 | 0 | 0.0 | 11.6 |

The old 1000-unrelated case computed 499,500 pairs and allocated 7.6 MiB of
score matrix buffers. Indexed cache peaks were zero for unrelated/duplicates,
9500 for 1000 clustered, 47,500 for 5000 clustered, and 65,536 for 1000 dense.
The final 1000 cloud had 14,700 geometric support certifications and retained
all 1000 independent units. The successful 5000 cases remove the old arbitrary
1414-page ceiling, but do not close the scale gate.

Repeated 5000-unrelated runs varied from about 5.3 to 9.1 seconds; an earlier
multi-case process under GC pressure reached capacity. Timing under load and
index degeneration remain limitations. Numeric synthetic parity and resource
improvement do not measure real-page matching accuracy.
