# Unevaluated prediction-bundle contract

Version: `heldout-prediction-bundle/1.0.0`

Status: contract and generated tests only. The repository contains no checked-in
prediction bundle, candidate run, result receipt, or held-out quality result.

## Purpose

`prediction-contract.js` defines the narrow output boundary between one
policy-bound candidate run and a later evaluator. It makes interrupted runs,
tuning-pair leakage, silent omissions, and post-result policy changes
detectable without opening labels or computing quality metrics.

One bundle is bound to exactly one validated pre-result policy and therefore
to its:

- resolved evaluation-dataset digest;
- split-manifest digest and declared held-out partition;
- policy digest and version; and
- aggregate candidate/resolver artifact digest and versions.

The bundle itself has a canonical digest. Changing any binding, record, score,
or status changes that digest.

## Record schema

Records are sorted by `pairId`, unique, and exactly cover every resolved pair
assigned to the manifest's declared held-out partition. Tuning, unknown,
duplicate, omitted, extra, or out-of-order identifiers fail validation. This
complete inventory keeps an interrupted candidate run from being silently
interpreted as abstention.

Each record contains only:

| Field | Meaning |
| --- | --- |
| `pairId` | Opaque orchestration identifier from the resolved evaluation projection. |
| `retrievalStatus` | Exactly `candidate-retrieved` or `no-candidate`. |
| `scoreMicros` | Integer from 0 through 1,000,000 for a retrieved candidate; otherwise exactly `null`. |

The schema separates retrieval coverage from verification score while avoiding
a premature candidate architecture. It rejects gold labels, case types,
titles, summaries, predicted labels, decisions, confusion matrices, metrics,
and gate outcomes. Pair identifiers do not authorize the candidate process to
receive gold labels or case metadata; later run isolation must enforce that
separately.

## No evaluation in this boundary

The validator checks structure, complete pair inventory, transitive bindings,
and declared timestamp order. It does not read a score against the frozen
threshold and does not compare a score with a gold label. Every successful
report states:

```json
{
  "thresholdApplied": false,
  "scoresComparedWithGold": false,
  "qualityMetricsComputed": false,
  "resultsEvaluated": false,
  "heldOutEvidence": false,
  "gateEligible": false
}
```

`candidate-retrieved` is not an automatic join, and `no-candidate` is not a
measured false split. Those meanings exist only after a separate evaluator
applies the already-frozen policy to the complete bundle.

## Declared chronology is not proof

`bundle.createdAt` must be canonical and no earlier than `policy.frozenAt`.
That detects internally impossible ordering only. Both timestamps and all
digests remain self-declared until an external commit or independently
timestamped receipt proves that the exact policy preceded result access and an
independent role reproduces the artifact digest.

Before any real held-out candidate execution, the run procedure must also
demonstrate that candidate code receives only approved held-out inputs and
cannot access gold labels, case types, tuning examples, network providers, or
unapproved local artifacts. This contract does not establish that isolation.

## Required next boundary

A later result evaluator may consume a validated bundle only after external
freeze chronology, Lead threshold/scope approval, Trust provenance acceptance,
and artifact verification are recorded. That evaluator must apply the fixed
integer decision rule, compute per-block confusion contributions, Wilson
metrics, abstentions, and the block-bootstrap sensitivity report, then retain a
separate systematic false-merge review. This contract intentionally does none
of those steps and cannot select AUTO, ASSISTED, or NO-AUTO.
