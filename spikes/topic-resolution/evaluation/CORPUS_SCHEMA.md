# Labeled story-corpus contract

Version: `labeled-story-corpus/1.0.0`

Status: collection and evaluator plumbing only. No 200-pair corpus is checked
in, no provenance review is accepted by this code, and no held-out quality
claim follows from a structurally ready report.

## Purpose

The Phase 0 pilot schema is deliberately fixed to 24 synthetic decisions and
cannot safely be stretched into the P1.2 corpus. `corpus-contract.js` defines a
separate, strict input boundary for collecting the future labeled set. It can
report useful collection progress before the minimums are met, while malformed
or unsafe data fails instead of being counted.

The pure validator:

- accepts plain, bounded JSON-like data only and rejects sparse arrays,
  accessors, cycles, unknown fields, raw article bodies, and excessive work
  before calculating a digest;
- requires sorted stable Source and pair identifiers, normalized public HTTP(S)
  URLs, bounded metadata, canonical timestamps, unique unordered pairs, and
  complete Source use;
- records project-created, reviewed-public, or licensed-metadata provenance for
  every Source while rejecting copied article text;
- retains primary, independent secondary, and independent adjudication records;
  and
- produces canonical SHA-256 digests for both the full review corpus and its
  minimized resolved evaluation view.

This is mechanical evidence, not a legal or privacy determination. The report
always says external Trust review is required and remains `gateEligible: false`,
even when the dataset declares that its inventory review was accepted.

## Required cases and readiness

Only resolved decisions count toward structural readiness. The eligible set
must contain at least 200 unique pairs across at least 50 represented gold
clusters, cover every case below, and independently review at least 20% of the
eligible pairs (rounded up):

| Case type | Required final relationship |
| --- | --- |
| `duplicate-positive` | `same-topic` |
| `syndication-positive` | `same-topic` |
| `update-continuation-boundary` | `different-topic` |
| `related-distinct` | `different-topic` |
| `unrelated-control` | `different-topic` |
| `adversarial-title` | either, as established by the gold clusters |

A valid collection below a minimum returns
`readiness.structurallyReadyForSplitFreeze: false` with deterministic reasons;
it is not a schema error. This lets the same contract audit collection progress
without a flag that bypasses the declared minimums. The structural qualifier is
intentional: pending rights/privacy review never becomes approval merely
because the numerical minimums pass.

## Review and adjudication

The secondary reviewer must differ from the primary reviewer and use the
recorded blinded-metadata method. An agreement needs no adjudication. A
disagreement remains visible in the report and is ineligible until a third,
independent adjudicator records the final label. Unresolved pairs cannot
increase pair, case, cluster, Source, or review-coverage counts.

For every eligible pair, the resolved final label must agree with the endpoint
gold-cluster relationship. The contract rejects a case label that contradicts
the fixed case semantics above. Reviewer rationales stay in the full corpus;
they do not enter the minimized evaluation view.

## Split-safe resolved view

`createResolvedEvaluationDataset` emits only the fields needed for split and
baseline evaluation: stable Source/cluster identifiers, normalized URL,
optional fingerprint, pair/case identifiers, endpoints, and a truthfully named
`resolvedGoldDecision` with its resolution method. Sources used only by
unresolved pairs are omitted. The projection carries its own version, the
corpus-contract version, and `sourceCorpusDigest`, so changing provenance,
rationales, reviewer identity/timing, or adjudication history also changes the
projection digest even when the resolved labels stay the same.

This projection prevents the reusable split validator from accidentally using
a disputed primary label when independent adjudication selected another label.
`validateLabeledCorpusDependencyBlockSplit` is the strict wrapper: it refuses a
corpus below the structural minimums, generates the resolved view, and requires
the split manifest's dataset digest to bind that exact view. The combined
report retains both digests:

- `corpusDigest` binds provenance, metadata, and complete review history; and
- `evaluationDatasetDigest` binds the exact resolved inputs used for split and
  evaluation.

`EVALUATION_POLICY_CONTRACT.md` now defines and tests the future pre-result
receipt that binds the corpus, split manifest, system artifact, threshold, gate
semantics, bootstrap policy, and freeze declaration. No actual receipt exists.
Until one is externally frozen before result access and an actual corpus passes
Trust and independent reproducibility review, structural readiness is not P1.2
completion and neither current pilot partition is held-out evidence.
