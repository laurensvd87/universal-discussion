import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  PREDICTION_BUNDLE_CONTRACT_VERSION,
  PredictionBundleError,
  validatePredictionBundle,
} from "../evaluation/prediction-contract.js";
import {
  buildEvaluationScenario,
  buildPredictionBundle,
  generatedHeldoutPairIds,
} from "../support/generated-evaluation.js";

function bundleError(code) {
  return (error) => error instanceof PredictionBundleError && error.code === code;
}

function validateScenario(scenario, bundle) {
  return validatePredictionBundle(
    scenario.dataset,
    scenario.manifest,
    scenario.policy,
    bundle,
  );
}

test("complete generated prediction bundle is deterministic but never evaluates results", () => {
  const scenario = buildEvaluationScenario();
  const bundle = buildPredictionBundle(scenario);
  const report = validateScenario(scenario, bundle);

  assert.equal(report.contractVersion, PREDICTION_BUNDLE_CONTRACT_VERSION);
  assert.equal(report.bundleDigest, canonicalJsonSha256(bundle));
  assert.equal(report.inventory.complete, true);
  assert.equal(report.inventory.recordCount, bundle.records.length);
  assert.equal(report.inventory.expectedHeldoutPairs, bundle.records.length);
  assert.equal(
    report.inventory.candidateRetrieved + report.inventory.noCandidate,
    bundle.records.length,
  );
  assert.deepEqual(
    {
      gateEligible: report.scope.gateEligible,
      heldOutEvidence: report.scope.heldOutEvidence,
      qualityMetricsComputed: report.scope.qualityMetricsComputed,
      resultsEvaluated: report.scope.resultsEvaluated,
      scoresComparedWithGold: report.scope.scoresComparedWithGold,
      thresholdApplied: report.scope.thresholdApplied,
    },
    {
      gateEligible: false,
      heldOutEvidence: false,
      qualityMetricsComputed: false,
      resultsEvaluated: false,
      scoresComparedWithGold: false,
      thresholdApplied: false,
    },
  );
  assert.equal(report.declaredChronology.externallyVerified, false);
  assert.deepEqual(
    validateScenario(structuredClone(scenario), structuredClone(bundle)),
    report,
  );

  const changedScore = structuredClone(bundle);
  const scoredRecord = changedScore.records.find(
    (record) => record.retrievalStatus === "candidate-retrieved",
  );
  scoredRecord.scoreMicros -= 1;
  assert.notEqual(
    validateScenario(scenario, changedScore).bundleDigest,
    report.bundleDigest,
  );
});

test("retrieved and missing candidates use an exact conditional score schema", () => {
  const scenario = buildEvaluationScenario();
  const bundle = buildPredictionBundle(scenario, {
    recordForPair: (pairId, index) =>
      index % 2 === 0
        ? {
            pairId,
            retrievalStatus: "candidate-retrieved",
            scoreMicros: index === 0 ? 0 : 1_000_000,
          }
        : { pairId, retrievalStatus: "no-candidate", scoreMicros: null },
  });
  const report = validateScenario(scenario, bundle);
  assert.equal(report.inventory.candidateRetrieved, Math.ceil(bundle.records.length / 2));
  assert.equal(report.inventory.noCandidate, Math.floor(bundle.records.length / 2));

  const missingWithScore = structuredClone(bundle);
  const missingRecord = missingWithScore.records.find(
    (record) => record.retrievalStatus === "no-candidate",
  );
  missingRecord.scoreMicros = 0;
  assert.throws(
    () => validateScenario(scenario, missingWithScore),
    bundleError("INVALID_BUNDLE"),
  );

  const retrievedWithoutScore = structuredClone(bundle);
  retrievedWithoutScore.records.find(
    (record) => record.retrievalStatus === "candidate-retrieved",
  ).scoreMicros = null;
  assert.throws(
    () => validateScenario(scenario, retrievedWithoutScore),
    bundleError("INVALID_BUNDLE"),
  );

  for (const invalidScore of [-1, 1_000_001, 920_000.5]) {
    const invalid = structuredClone(bundle);
    invalid.records.find(
      (record) => record.retrievalStatus === "candidate-retrieved",
    ).scoreMicros = invalidScore;
    assert.throws(
      () => validateScenario(scenario, invalid),
      bundleError("INVALID_BUNDLE"),
    );
  }
});

test("heldout inventory must be complete, exclusive, sorted, and unique", () => {
  const scenario = buildEvaluationScenario();
  const original = buildPredictionBundle(scenario);

  const omitted = structuredClone(original);
  omitted.records.pop();
  assert.throws(
    () => validateScenario(scenario, omitted),
    bundleError("INCOMPLETE_HELDOUT_INVENTORY"),
  );

  const duplicate = structuredClone(original);
  duplicate.records[1] = structuredClone(duplicate.records[0]);
  assert.throws(
    () => validateScenario(scenario, duplicate),
    bundleError("INVALID_BUNDLE"),
  );

  const unsorted = structuredClone(original);
  [unsorted.records[0], unsorted.records[1]] = [
    unsorted.records[1],
    unsorted.records[0],
  ];
  assert.throws(
    () => validateScenario(scenario, unsorted),
    bundleError("INVALID_BUNDLE"),
  );

  const heldoutIds = new Set(generatedHeldoutPairIds(scenario));
  const tuningPair = scenario.evaluationDataset.pairs.find(
    (pair) => !heldoutIds.has(pair.id),
  );
  assert.ok(tuningPair);
  const tuningLeak = structuredClone(original);
  tuningLeak.records[0].pairId = tuningPair.id;
  tuningLeak.records.sort((left, right) => left.pairId.localeCompare(right.pairId));
  assert.throws(
    () => validateScenario(scenario, tuningLeak),
    bundleError("INCOMPLETE_HELDOUT_INVENTORY"),
  );

  const extra = structuredClone(original);
  extra.records.push({
    pairId: "pair-zzzz",
    retrievalStatus: "no-candidate",
    scoreMicros: null,
  });
  assert.throws(
    () => validateScenario(scenario, extra),
    bundleError("INCOMPLETE_HELDOUT_INVENTORY"),
  );
});

test("bundle transitively binds policy, dataset, split, and system artifact", () => {
  const scenario = buildEvaluationScenario();
  const original = buildPredictionBundle(scenario);
  const mutations = [
    (bundle) => {
      bundle.bindings.evaluationDataset.digest = `sha256:${"1".repeat(64)}`;
    },
    (bundle) => {
      bundle.bindings.evaluationPolicy.digest = `sha256:${"2".repeat(64)}`;
    },
    (bundle) => {
      bundle.bindings.splitManifest.digest = `sha256:${"3".repeat(64)}`;
    },
    (bundle) => {
      bundle.bindings.splitManifest.heldoutPartitionId = "partition-tuning";
    },
    (bundle) => {
      bundle.bindings.systemUnderTest.artifactDigest = `sha256:${"4".repeat(64)}`;
    },
    (bundle) => {
      bundle.bindings.systemUnderTest.candidateVersion = "different-candidate/1.0.0";
    },
  ];

  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(
      () => validateScenario(scenario, changed),
      bundleError("BINDING_MISMATCH"),
    );
  }

  const changedPolicy = buildEvaluationScenario();
  const oldBundle = buildPredictionBundle(changedPolicy);
  changedPolicy.policy.systemUnderTest.artifactDigest = `sha256:${"5".repeat(64)}`;
  assert.throws(
    () => validateScenario(changedPolicy, oldBundle),
    bundleError("BINDING_MISMATCH"),
  );
});

test("prediction boundary rejects result data and behavioral or oversized input", () => {
  const scenario = buildEvaluationScenario();
  const original = buildPredictionBundle(scenario);

  const resultField = structuredClone(original);
  resultField.confusionMatrix = { truePositive: 60 };
  assert.throws(
    () => validateScenario(scenario, resultField),
    bundleError("INVALID_BUNDLE"),
  );

  const goldField = structuredClone(original);
  goldField.records[0].goldLabel = "same-topic";
  assert.throws(
    () => validateScenario(scenario, goldField),
    bundleError("INVALID_BUNDLE"),
  );

  const predictedLabel = structuredClone(original);
  predictedLabel.records[0].predictedLabel = "same-topic";
  assert.throws(
    () => validateScenario(scenario, predictedLabel),
    bundleError("INVALID_BUNDLE"),
  );

  const accessor = structuredClone(original);
  Object.defineProperty(accessor.records[0], "scoreMicros", {
    enumerable: true,
    get: () => 1_000_000,
  });
  assert.throws(
    () => validateScenario(scenario, accessor),
    bundleError("INVALID_BUNDLE"),
  );

  const symbol = structuredClone(original);
  symbol.records[0][Symbol("hidden")] = true;
  assert.throws(
    () => validateScenario(scenario, symbol),
    bundleError("INVALID_BUNDLE"),
  );

  const cyclic = structuredClone(original);
  cyclic.self = cyclic;
  assert.throws(
    () => validateScenario(scenario, cyclic),
    bundleError("INVALID_BUNDLE"),
  );

  const sparse = structuredClone(original);
  sparse.records = new Array(2);
  sparse.records[1] = original.records[1];
  assert.throws(
    () => validateScenario(scenario, sparse),
    bundleError("INVALID_BUNDLE"),
  );

  const oversizedKey = structuredClone(original);
  oversizedKey.records[0]["x".repeat(129)] = true;
  assert.throws(
    () => validateScenario(scenario, oversizedKey),
    bundleError("INVALID_BUNDLE"),
  );

  const excessive = structuredClone(original);
  excessive.records = new Array(100_001);
  assert.throws(
    () => validateScenario(scenario, excessive),
    bundleError("RESOURCE_LIMIT"),
  );
});

test("declared chronology cannot predate policy and scores are not thresholded", () => {
  const scenario = buildEvaluationScenario();
  const bundle = buildPredictionBundle(scenario, {
    recordForPair: (pairId, index) => ({
      pairId,
      retrievalStatus: "candidate-retrieved",
      scoreMicros:
        index % 2 === 0
          ? scenario.policy.decisionPolicy.automaticJoinThresholdMicros - 1
          : scenario.policy.decisionPolicy.automaticJoinThresholdMicros,
    }),
  });
  const report = validateScenario(scenario, bundle);
  assert.equal(report.inventory.candidateRetrieved, bundle.records.length);
  assert.equal(report.scope.thresholdApplied, false);
  assert.equal(Object.hasOwn(report, "decisions"), false);
  assert.equal(Object.hasOwn(report, "metrics"), false);
  assert.equal(Object.hasOwn(report, "confusionMatrix"), false);

  const early = structuredClone(bundle);
  early.createdAt = "2026-09-20T13:59:59.999Z";
  assert.throws(
    () => validateScenario(scenario, early),
    bundleError("INVALID_CHRONOLOGY"),
  );
});
