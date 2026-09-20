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
versioned corpus-schema validator. `corpus-contract.js` now supplies that
future boundary, and `validateLabeledCorpusDependencyBlockSplit` is the strict
wrapper for it. The wrapper refuses a corpus below the structural minimums and
passes only its minimized, resolved-label projection into split validation.
This prevents a disputed primary label from silently overriding independent
adjudication. Reports retain canonical digests for the complete review corpus,
the resolved evaluation projection, and the manifest.

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

The larger corpus must pass the strict contract in `CORPUS_SCHEMA.md`, define
bounded blocks during collection, assign whole blocks to tuning or held-out
exactly once, and freeze the full corpus digest, resolved evaluation digest,
assignments, candidate version, threshold, minimum coverage, and bootstrap
policy before the held-out evaluation is opened. Candidate retrieval/indexing
for the final run must use held-out data only; tuning data must not become a
candidate source. The schema and resolved-view implementation are now tested;
`EVALUATION_POLICY_CONTRACT.md` also makes the future receipt schema executable,
including exact corpus/projection/manifest/artifact bindings, fixed-point
threshold and abstention semantics, normative gates, bootstrap settings, and
offline scope. The actual corpus, externally committed pre-result receipt, and
held-out run remain open.

For the required sensitivity analysis, resample the held-out dependency blocks
with replacement. If there are `B` held-out blocks, draw `B` blocks per
replicate and include each selected block's complete confusion-matrix
contribution once per draw. Recompute metrics for every replicate and report the
seed, replicate count, percentile rule, valid/undefined replicate counts, and
block/cluster coverage. A fixed implementation and policy must be committed
before results are read.

`block-bootstrap.js` implements and tests that future calculation as
`dependency-block-percentile-bootstrap/1.0.0`. It requires sorted disjoint
blocks, binds their complete contributions with a canonical digest, derives a
SplitMix64 stream from the recorded seed, uses rejection sampling for unbiased
block indexes, and reports a digest of every block selection. Its two-sided 95%
interval uses the linear R-7 percentile rule. Precision, recall, specificity,
accuracy, false-merge rate (`FP / (TP + FP)`), and false-split rate
(`FN / (TP + FN)`) are recomputed for each replicate. Undefined denominators
remain counted and excluded from the corresponding percentile calculation; any
such interval is explicitly marked as conditional on defined replicates. The
engine accepts at least 1,000 requested replicates and emits an interval only
when at least 1,000 replicates define that metric. This is a computational
reporting floor, not proof of statistical adequacy.

The engine has no pilot CLI by design. Running a deterministic algorithm on
already-inspected labels would not make them held out, and four homogeneous
pilot blocks cannot provide credible sensitivity evidence. A future runner must
pair the engine with its strict corpus validator and a policy frozen before
held-out results are read.

This block bootstrap is a design-specific sensitivity check, not a claim of a
general multiway-bootstrap proof. Wilson precision remains the primary
pair-level safety bound, and the 20-cluster evidence threshold continues to
count unique held-out gold clusters touched by automatic joins—not dependency
blocks. Replicates with a zero metric denominator must remain undefined rather
than being converted to perfect scores. Every engine result is marked
`sensitivityOnly: true` and `gateEligible: false`; only the separate frozen
held-out evaluation can apply the full gate.
