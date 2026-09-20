# Pre-result evaluation-policy contract

Version: `pre-result-evaluation-policy/1.0.0`

Status: contract and generated tests only. There is no real policy receipt,
candidate artifact, held-out run, or quality result in this repository.

## Purpose

`evaluation-policy.js` defines the information that must be fixed for one
candidate/resolver before held-out results are opened. It closes a tooling gap,
not the P1.2/P1.4 evidence gate. A valid in-memory object can be ready to commit
as an external freeze receipt, but the validator cannot prove when people first
saw results or that an artifact digest identifies the intended executable.

One receipt binds one system under test. It includes:

- the complete review-corpus digest and resolved evaluation-projection digest;
- the exact split-manifest digest and tuning/held-out partition identifiers;
- candidate, resolver, and aggregate code/model/config artifact versions and
  SHA-256 digest;
- an integer fixed-point automatic-join threshold selected only from tuning;
- the abstain/error behavior for below-threshold, missing, and invalid scores;
- the normative AUTO/ASSISTED/NO-AUTO gate and metric semantics;
- dependency-block bootstrap version, seed, and replicate count; and
- the initial offline English-editorial scope with network and provider calls
  explicitly disabled.

Unknown fields are rejected, including predictions, confusion matrices,
observed metrics, or other result-like additions. The policy digest is computed
after strict validation; it is not stored inside the self-referential policy.

## Fixed-point decision rule

Candidate scores use integer micro-units on `[0, 1_000_000]`. An automatic join
occurs only when the score is greater than or equal to the frozen threshold.
A below-threshold or missing candidate abstains and therefore cannot join.
Invalid/out-of-range scores are errors. Integer policy values avoid ambiguous
floating-point or serialization behavior in the receipt.

The initial gate values are copied into every receipt and must exactly equal the
versioned normative policy:

| Rule | Frozen value |
| --- | ---: |
| Minimum held-out automatic-join precision | 970,000 / 1,000,000 |
| Minimum two-sided Wilson 95% lower bound | 930,000 / 1,000,000 |
| Minimum held-out same-topic recall | 500,000 / 1,000,000 |
| Minimum automatic-join decisions | 60 |
| Minimum gold clusters represented by true-positive joins | 20 |
| Maximum systematic cross-event merge classes | 0 |

Changing these values or their semantics requires a new policy version and the
applicable plan/decision review; a receipt cannot weaken them.

## Metric semantics

`heldout-join-metrics/1.0.0` fixes the non-negotiable interpretation:

- precision is true-positive joins divided by every automatic join;
- recall includes every supported-scope held-out `same-topic` pair in its
  denominator, so an abstention on a positive pair is a miss;
- the 60-decision minimum counts all automatic joins (`TP + FP`); and
- the 20-cluster evidence minimum counts unique gold clusters represented by
  **true-positive** joins only. False-merge endpoints cannot inflate evidence
  diversity.

The Wilson method, branch policy, rate scale, and zero-tolerance systematic
merge rule are versioned alongside those definitions. Whole dependency blocks
are resampled only as the separate sensitivity analysis described in
`CORPUS_SPLIT_CONTRACT.md`; the Wilson precision bound remains the primary
safety gate.

## Structural feasibility is not quality

Before an external receipt is committed, the validator reports whether the
declared held-out partition has at least two dependency blocks, 60 eligible gold
same-topic pairs across 20 gold clusters, and every required case type. These
are lower-bound feasibility checks only. They neither predict that the
candidate will emit 60 joins nor say that any join will be correct.

The report can return
`readiness.structurallyReadyForExternalFreezeReceipt: false` with reasons for a
valid but incomplete corpus/split. It also requires declared corpus-provenance
review and repository-use approval before structural readiness. Those fields
remain dataset declarations; external Trust acceptance is still required.

Every report, including a structurally ready one, returns:

```json
{
  "resultsEvaluated": false,
  "heldOutEvidence": false,
  "gateEligible": false
}
```

## Required external chronology

The `frozenAt` field must be canonical and no earlier than the split-manifest
freeze declaration. This only checks internal ordering; a timestamp can be
written after results have been seen. Before a real run, the exact policy must
be committed or placed in an independently timestamped receipt and reviewed
without opening held-out results. The later result receipt must bind this
policy digest and retain evidence that:

- repository/receipt chronology predates held-out result access;
- the Lead approved the candidate threshold and scope;
- Trust accepted corpus provenance/privacy;
- the aggregate artifact digest was independently reproduced; and
- another role reproduced the eventual result.

Until those external conditions and the actual P1.2 corpus exist, this contract
does not make either current pilot partition held out and does not authorize an
automatic semantic-resolution claim.

`PREDICTION_CONTRACT.md` defines the next boundary: a complete unevaluated
retrieval/score bundle bound to this policy. That validator does not apply the
threshold or compare scores with gold labels.
