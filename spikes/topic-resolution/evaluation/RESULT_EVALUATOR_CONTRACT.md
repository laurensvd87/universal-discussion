# Generated result-evaluator contract

Version: `generated-policy-bound-result/1.0.0`

Status: generated-fixture contract exercise only. The repository contains no
real prediction bundle, checked-in result report, held-out result, or result
CLI.

## Purpose and hard boundary

`result-evaluator.js` exercises the deterministic bridge from a validated
pre-result policy and complete prediction bundle to quality calculations. This
version accepts only project-created synthetic Sources with no copied article
text or personal data. A valid non-synthetic corpus is deliberately rejected,
so this code cannot be mistaken for an authorized real held-out run.

The API accepts no threshold, bootstrap, timestamp, review, runtime, cost, or
environment overrides:

```js
evaluateGeneratedPredictionBundle(dataset, manifest, policy, bundle)
```

All decision and bootstrap settings come from the validated policy. The result
binds the corpus, resolved projection, split, policy, prediction bundle, and
candidate/resolver artifact digests and then receives its own canonical digest.

## Decision and confusion semantics

For every record in the declared held-out partition:

| Retrieval/score outcome | Evaluator action |
| --- | --- |
| `candidate-retrieved` and score at or above the frozen integer threshold | automatic join |
| `candidate-retrieved` and score below threshold | abstain: `below-threshold` |
| `no-candidate` with a null score | abstain: `no-candidate` |

An automatic join on `same-topic` is a true positive and on
`different-topic` is a false positive. An abstention on `same-topic` is a false
negative and on `different-topic` is a true negative. The confusion matrix is
therefore explicitly **automatic join versus no automatic join**. Coverage
fields separately preserve that every no-join outcome was an abstention, not an
explicit negative prediction.

The report includes:

- retrieved, missing, below-threshold, join, and abstention counts and rates;
- precision, recall, specificity, accuracy, false-merge rate, and false-split
  rate, with undefined denominators retained as `null`;
- two-sided 95% Wilson intervals for precision, recall, specificity, and
  accuracy using `wilson-score-two-sided/1.0.0`;
- case counts and per-case confusion matrices;
- sorted false-positive and false-negative review queues containing only pair
  identifier and case type; and
- unique gold clusters represented by true-positive joins only. False-positive
  endpoints cannot increase this evidence count.

## Dependency-block sensitivity

Every declared held-out dependency block contributes its complete confusion
matrix and sorted manifest cluster list. Per-case matrices, block matrices, and
the global matrix must reconcile exactly or evaluation fails. The existing
bootstrap engine then uses exactly the frozen seed and replicate count; no
caller override exists.

The bootstrap remains a sensitivity analysis. Its output is not the primary
Wilson safety gate and already states `gateEligible: false`.

## Numerical inputs are not a gate decision

The report exposes the observed precision numerator/denominator and Wilson
lower bound, recall numerator/denominator, automatic-join count, and
true-positive cluster count beside the frozen minimums. It intentionally emits
no per-check `passes` field and no aggregate numerical decision.

Case types do not define systematic error classes. Even zero observed false
positives cannot prove that the systematic cross-event merge review passed.
The report always contains:

```json
{
  "systematicCrossEventMergeReview": {
    "status": "required-not-performed",
    "classCount": null
  },
  "scope": {
    "resultsEvaluated": true,
    "generatedContractExerciseOnly": true,
    "heldOutEvidence": false,
    "gateEligible": false,
    "finalGateDecisionMade": false,
    "branch": null
  }
}
```

Thus a numerically perfect generated fixture still cannot select AUTO,
ASSISTED, or NO-AUTO.

## Required work before real evaluation

A real held-out procedure still needs all of the following outside this
generated evaluator:

- externally proven policy chronology;
- the exact evaluator version or artifact frozen before result access;
- Lead approval of threshold and scope;
- Trust acceptance of corpus provenance and privacy;
- evidence that candidate execution could access neither gold labels nor
  tuning data;
- independent candidate and evaluator artifact reproduction;
- independent result reproduction; and
- systematic false-merge review.

The prediction bundle carries no trustworthy execution metadata, so this
report makes no runtime, hardware, or candidate-cost claim. A future real
result receipt must bind those facts without weakening this contract or
relabelling the generated exercise as held-out evidence.
