import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  GENERATED_RESULT_REPORT_VERSION,
  GeneratedResultEvaluationError,
  evaluateGeneratedPredictionBundle,
} from "../evaluation/result-evaluator.js";
import {
  buildEvaluationScenario,
  buildPredictionBundle,
  generatedHeldoutPairIds,
} from "../support/generated-evaluation.js";

function resultError(code) {
  return (error) =>
    error instanceof GeneratedResultEvaluationError && error.code === code;
}

function heldoutPairs(scenario) {
  const ids = new Set(generatedHeldoutPairIds(scenario));
  return scenario.evaluationDataset.pairs.filter((pair) => ids.has(pair.id));
}

function labelGroups(scenario) {
  const pairs = heldoutPairs(scenario);
  return {
    negatives: pairs.filter(
      (pair) => pair.resolvedGoldDecision.label === "different-topic",
    ),
    pairs,
    positives: pairs.filter(
      (pair) => pair.resolvedGoldDecision.label === "same-topic",
    ),
  };
}

function bundleForJoinedIds(scenario, joinedIds, missingIds = new Set()) {
  const threshold = scenario.policy.decisionPolicy.automaticJoinThresholdMicros;
  return buildPredictionBundle(scenario, {
    recordForPair: (pairId) => {
      if (missingIds.has(pairId)) {
        return { pairId, retrievalStatus: "no-candidate", scoreMicros: null };
      }
      return {
        pairId,
        retrievalStatus: "candidate-retrieved",
        scoreMicros: joinedIds.has(pairId) ? threshold : threshold - 1,
      };
    },
  });
}

function evaluate(scenario, bundle) {
  return evaluateGeneratedPredictionBundle(
    scenario.dataset,
    scenario.manifest,
    scenario.policy,
    bundle,
  );
}

function sumMatrices(matrices) {
  const total = {
    falseNegative: 0,
    falsePositive: 0,
    trueNegative: 0,
    truePositive: 0,
  };
  for (const matrix of matrices) {
    for (const field of Object.keys(total)) total[field] += matrix[field];
  }
  return total;
}

test("generated result evaluator produces exact metrics and a deterministic digest", () => {
  const scenario = buildEvaluationScenario();
  const { negatives, pairs, positives } = labelGroups(scenario);
  const joinedIds = new Set([
    ...positives.slice(0, 10).map((pair) => pair.id),
    ...negatives.slice(0, 2).map((pair) => pair.id),
  ]);
  const bundle = bundleForJoinedIds(scenario, joinedIds);
  const output = evaluate(scenario, bundle);
  const { report } = output;
  const expectedMatrix = {
    falseNegative: positives.length - 10,
    falsePositive: 2,
    trueNegative: negatives.length - 2,
    truePositive: 10,
  };

  assert.equal(report.reportVersion, GENERATED_RESULT_REPORT_VERSION);
  assert.deepEqual(report.confusionMatrix, expectedMatrix);
  assert.equal(report.metrics.precision, 10 / 12);
  assert.equal(report.metrics.recall, 10 / positives.length);
  assert.equal(report.metrics.specificity, (negatives.length - 2) / negatives.length);
  assert.equal(report.metrics.accuracy, (10 + negatives.length - 2) / pairs.length);
  assert.equal(report.metrics.falseMergeRate, 2 / 12);
  assert.equal(
    report.metrics.falseSplitRate,
    (positives.length - 10) / positives.length,
  );
  assert.equal(report.metrics.confidenceIntervals95.precision.successes, 10);
  assert.equal(report.metrics.confidenceIntervals95.precision.total, 12);
  assert.equal(report.errorReviewQueues.falsePositive.length, 2);
  assert.equal(report.errorReviewQueues.falseNegative.length, positives.length - 10);
  assert.equal(output.reportDigest, canonicalJsonSha256(report));
  assert.deepEqual(evaluate(structuredClone(scenario), structuredClone(bundle)), output);
});

test("threshold equality joins while below-threshold and missing candidates abstain", () => {
  const scenario = buildEvaluationScenario();
  const { negatives, positives } = labelGroups(scenario);
  const positiveJoin = positives[0].id;
  const positiveBelow = positives[1].id;
  const negativeJoin = negatives[0].id;
  const missingIds = new Set(
    heldoutPairs(scenario)
      .map((pair) => pair.id)
      .filter((pairId) =>
        ![positiveJoin, positiveBelow, negativeJoin].includes(pairId),
      ),
  );
  const bundle = bundleForJoinedIds(
    scenario,
    new Set([positiveJoin, negativeJoin]),
    missingIds,
  );
  const { report } = evaluate(scenario, bundle);

  assert.deepEqual(report.confusionMatrix, {
    falseNegative: positives.length - 1,
    falsePositive: 1,
    trueNegative: negatives.length - 1,
    truePositive: 1,
  });
  assert.equal(report.classification.automaticJoins, 2);
  assert.equal(report.classification.belowThreshold, 1);
  assert.equal(report.classification.candidateRetrieved, 3);
  assert.equal(report.classification.noCandidate, heldoutPairs(scenario).length - 3);
  assert.equal(
    report.classification.abstentions,
    report.classification.belowThreshold + report.classification.noCandidate,
  );
  assert.ok(
    report.errorReviewQueues.falseNegative.some(
      (entry) => entry.pairId === positiveBelow,
    ),
  );
  assert.ok(
    report.errorReviewQueues.falsePositive.some(
      (entry) => entry.pairId === negativeJoin,
    ),
  );
});

test("no automatic joins remain undefined rather than becoming perfect", () => {
  const scenario = buildEvaluationScenario();
  const allIds = new Set(heldoutPairs(scenario).map((pair) => pair.id));
  const bundle = bundleForJoinedIds(scenario, new Set(), allIds);
  const { report } = evaluate(scenario, bundle);

  assert.equal(report.metrics.precision, null);
  assert.equal(report.metrics.falseMergeRate, null);
  assert.equal(report.metrics.confidenceIntervals95.precision, null);
  assert.deepEqual(report.bootstrapSensitivity.metrics.precision, {
    conditionalOnDefinedReplicates: true,
    intervalSufficient: false,
    percentileInterval95: null,
    pointEstimate: null,
    undefinedReplicates: scenario.policy.bootstrapPolicy.replicates,
    validReplicates: 0,
  });
  assert.equal(report.classification.automaticJoins, 0);
  assert.equal(report.classification.retrievalCoverage, 0);
  assert.equal(report.scope.branch, null);
  assert.equal(report.scope.gateEligible, false);
});

test("false-positive endpoints cannot inflate true-positive cluster evidence", () => {
  const scenario = buildEvaluationScenario();
  const { negatives, positives } = labelGroups(scenario);
  const joinedIds = new Set([
    positives[0].id,
    ...negatives.map((pair) => pair.id),
  ]);
  const bundle = bundleForJoinedIds(scenario, joinedIds);
  const { report } = evaluate(scenario, bundle);

  assert.equal(report.confusionMatrix.truePositive, 1);
  assert.equal(report.confusionMatrix.falsePositive, negatives.length);
  assert.equal(report.sample.truePositiveGoldClusters, 1);
  assert.equal(
    report.observedGateInputs.truePositiveGoldClusters.observed,
    1,
  );
  assert.equal(report.systematicCrossEventMergeReview.classCount, null);
  assert.equal(
    report.systematicCrossEventMergeReview.status,
    "required-not-performed",
  );
});

test("per-case and block contributions reconcile and bootstrap only uses frozen policy", () => {
  const scenario = buildEvaluationScenario();
  const { positives } = labelGroups(scenario);
  const bundle = bundleForJoinedIds(
    scenario,
    new Set(positives.map((pair) => pair.id)),
  );
  const first = evaluate(scenario, bundle).report;
  const second = evaluate(scenario, bundle).report;

  assert.deepEqual(
    sumMatrices(Object.values(first.perCaseConfusionMatrices)),
    first.confusionMatrix,
  );
  assert.deepEqual(
    sumMatrices(
      first.heldoutBlockContributions.map((block) => block.confusionMatrix),
    ),
    first.confusionMatrix,
  );
  assert.deepEqual(
    first.bootstrapSensitivity.pointConfusionMatrix,
    first.confusionMatrix,
  );
  assert.equal(
    first.bootstrapSensitivity.seed,
    scenario.policy.bootstrapPolicy.seed,
  );
  assert.equal(
    first.bootstrapSensitivity.replicates,
    scenario.policy.bootstrapPolicy.replicates,
  );
  assert.equal(
    first.bootstrapSensitivity.selection.sha256,
    second.bootstrapSensitivity.selection.sha256,
  );
  assert.equal(
    first.bootstrapSensitivity.inputDigest,
    second.bootstrapSensitivity.inputDigest,
  );
});

test("even numerically perfect generated fixtures cannot select a gate branch", () => {
  const scenario = buildEvaluationScenario();
  const { positives } = labelGroups(scenario);
  const bundle = bundleForJoinedIds(
    scenario,
    new Set(positives.map((pair) => pair.id)),
  );
  const { report } = evaluate(scenario, bundle);

  assert.equal(report.metrics.precision, 1);
  assert.ok(
    report.metrics.confidenceIntervals95.precision.lower >=
      scenario.policy.gatePolicy.minimumWilsonLowerBoundMicros /
        scenario.policy.gatePolicy.rateScale,
  );
  assert.equal(report.metrics.recall, 1);
  assert.ok(
    report.classification.automaticJoins >=
      scenario.policy.gatePolicy.minimumAutomaticJoinDecisions,
  );
  assert.ok(
    report.sample.truePositiveGoldClusters >=
      scenario.policy.gatePolicy.minimumGoldClustersTouched,
  );
  assert.deepEqual(
    {
      branch: report.scope.branch,
      finalGateDecisionMade: report.scope.finalGateDecisionMade,
      gateEligible: report.scope.gateEligible,
      generatedContractExerciseOnly: report.scope.generatedContractExerciseOnly,
      heldOutEvidence: report.scope.heldOutEvidence,
      resultsEvaluated: report.scope.resultsEvaluated,
    },
    {
      branch: null,
      finalGateDecisionMade: false,
      gateEligible: false,
      generatedContractExerciseOnly: true,
      heldOutEvidence: false,
      resultsEvaluated: true,
    },
  );
  assert.equal(report.systematicCrossEventMergeReview.classCount, null);
  assert.equal(Object.hasOwn(report.observedGateInputs.precision, "passes"), false);
});

test("generated evaluator rejects unready, non-synthetic, and rebound inputs", () => {
  const incomplete = buildEvaluationScenario({ feasibleHeldout: false });
  const incompleteBundle = buildPredictionBundle(incomplete);
  assert.throws(
    () => evaluate(incomplete, incompleteBundle),
    resultError("POLICY_NOT_STRUCTURALLY_READY"),
  );

  const nonSynthetic = buildEvaluationScenario({
    sourceMode: "reviewed-public-metadata",
  });
  const nonSyntheticBundle = buildPredictionBundle(nonSynthetic);
  assert.throws(
    () => evaluate(nonSynthetic, nonSyntheticBundle),
    resultError("GENERATED_FIXTURES_ONLY"),
  );

  const rebound = buildEvaluationScenario();
  const staleBundle = buildPredictionBundle(rebound);
  rebound.policy.systemUnderTest.artifactDigest = `sha256:${"6".repeat(64)}`;
  assert.throws(() => evaluate(rebound, staleBundle));
});
