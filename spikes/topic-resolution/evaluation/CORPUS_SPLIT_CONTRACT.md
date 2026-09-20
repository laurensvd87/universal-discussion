# Story-cluster split contract

Version: `story-dependency-block-split/1.0.0`

Status: structural dry run only. This contract does not make the Phase 0 pilot
held out and does not satisfy P1.2 or P1.4.

## Why dependency blocks

Each evaluation record compares two Sources. A positive pair belongs to one
gold story cluster, while a hard negative belongs to two different clusters.
Pairs that share either cluster can therefore be dependent. Research on dyadic
and exchangeable arrays warns that ignoring shared-unit dependence can produce
overconfident inference; ordinary pair resampling is not an acceptable
substitute for a cluster-aware sensitivity analysis:

- Davezies, D'Haultfoeuille, and Guyonvarch,
  [Empirical Process Results for Exchangeable Arrays](https://arxiv.org/abs/1906.11293);
- Owen and Eckles,
  [Bootstrapping Data Arrays of Arbitrary Order](https://doi.org/10.1214/12-AOAS547).

This project uses predeclared dependency blocks as a conservative collection
and evaluation design:

- every gold cluster belongs to exactly one block;
- every pair, including a cross-cluster negative, has both endpoint clusters in
  that block;
- every block belongs to exactly one partition; and
- whole blocks, never individual pairs, move together between partitions or
  bootstrap replicates.

Pair-graph connected components are reported as a validation diagnostic, not
chosen after seeing results as the split algorithm. Future controls must be
collected within their predeclared block. A cross-block edge fails validation
instead of silently joining blocks or leaking across partitions.

## Versioned manifest

The manifest binds all assignments to:

- the dataset and Topic-definition versions;
- a SHA-256 digest over recursively key-sorted JSON, independent of whitespace,
  object-key order, or checkout line endings;
- the split-contract, digest, and explicit-assignment algorithm versions;
- a freeze timestamp and purpose;
- exactly two sorted partitions and sorted, exclusive block assignments; and
- an explicit `demonstrationOnly` state.

The validator also requires unique sources and unordered pairs, full source use,
gold-label/cluster consistency, complete cluster coverage, non-empty blocks and
partitions, and no normalized URL or exact content fingerprint shared by gold
clusters. An exact signal crossing partitions is a leakage error; within one
partition it is a contradictory-gold error.

The pilot command first runs the strict pilot schema evaluator, so unknown
fields, raw content, and unsupported decision data fail before structural split
validation. The reusable structural validator is not a replacement for a
versioned corpus-schema validator; a future corpus format must pair the two in
its runner. Reports include canonical digests for both the dataset and the
manifest, binding the output to the exact assignments as well as the labels.

`explicit-predeclared/1.0.0` uses no random assignment, so its seed must be
`null`. A future randomized or stratified algorithm requires a new version and
must record its seed and balance policy rather than overloading this contract.

## Pilot dry run

`pilot-split-dry-run.json` captures the four natural dependency components in
the already-inspected pilot. Each block contains five gold clusters, seven
Sources, and six pairs. The two dry-run partitions each contain two blocks, ten
clusters, fourteen Sources, and twelve pairs with the same case mix.

This is useful only for testing binding and leakage checks. Both partition roles
are `dry-run`; the report therefore returns `heldOut: false` and
`sufficientForGate: false`. The labels and baseline results were already seen,
there are only four blocks, and there are only four predicted joins in the
whole pilot. Renaming either partition would not create held-out evidence.

Run the structural check with:

```sh
npm run validate:split
```

## Future freeze and bootstrap workflow

The larger corpus must define bounded blocks during collection, assign whole
blocks to tuning or held-out exactly once, and freeze the dataset digest,
assignments, candidate version, threshold, minimum coverage, and bootstrap
policy before the held-out evaluation is opened. Candidate retrieval/indexing
for the final run must use held-out data only; tuning data must not become a
candidate source.

For the required sensitivity analysis, resample the held-out dependency blocks
with replacement. If there are `B` held-out blocks, draw `B` blocks per
replicate and include each selected block's complete confusion-matrix
contribution once per draw. Recompute metrics for every replicate and report the
seed, replicate count, percentile rule, valid/undefined replicate counts, and
block/cluster coverage. A fixed implementation and policy must be committed
before results are read.

This block bootstrap is a design-specific sensitivity check, not a claim of a
general multiway-bootstrap proof. Wilson precision remains the primary
pair-level safety bound, and the 20-cluster evidence threshold continues to
count unique held-out gold clusters touched by automatic joins—not dependency
blocks. Replicates with a zero metric denominator must remain undefined rather
than being converted to perfect scores.
