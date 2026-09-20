import { bootstrapDependencyBlocks } from "./block-bootstrap.js";
import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "./canonical-json.js";
import {
  REQUIRED_CORPUS_CASE_TYPES,
  prepareLabeledCorpusEvaluation,
} from "./corpus-contract.js";
import {
  NORMATIVE_AUTOMATIC_JOIN_GATE,
  validateEvaluationPolicy,
} from "./evaluation-policy.js";
import { validatePredictionBundle } from "./prediction-contract.js";
import { wilsonScoreInterval } from "./statistics.js";

export const GENERATED_RESULT_REPORT_VERSION =
  "generated-policy-bound-result/1.0.0";

const MATRIX_FIELDS = [
  "falseNegative",
  "falsePositive",
  "trueNegative",
  "truePositive",
];

export class GeneratedResultEvaluationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeneratedResultEvaluationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new GeneratedResultEvaluationError(code, message);
}

function emptyMatrix() {
  return {
    falseNegative: 0,
    falsePositive: 0,
    trueNegative: 0,
    truePositive: 0,
  };
}

function addMatrix(target, contribution) {
  for (const field of MATRIX_FIELDS) target[field] += contribution[field];
}

function matricesEqual(left, right) {
  return MATRIX_FIELDS.every((field) => left[field] === right[field]);
}

function metric(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function metricsForMatrix({ falseNegative, falsePositive, trueNegative, truePositive }) {
  const total = truePositive + falsePositive + trueNegative + falseNegative;
  return {
    accuracy: metric(truePositive + trueNegative, total),
    falseMergeRate: metric(falsePositive, truePositive + falsePositive),
    falseSplitRate: metric(falseNegative, truePositive + falseNegative),
    precision: metric(truePositive, truePositive + falsePositive),
    recall: metric(truePositive, truePositive + falseNegative),
    specificity: metric(trueNegative, trueNegative + falsePositive),
  };
}

function sortedRecord(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function requireGeneratedSyntheticSources(dataset) {
  for (const source of dataset.sources) {
    if (
      source.provenance.kind !== "project-created-synthetic" ||
      source.provenance.containsCopiedArticleText !== false ||
      source.provenance.containsPersonalData !== false
    ) {
      fail(
        "GENERATED_FIXTURES_ONLY",
        "Generated result evaluation requires project-created synthetic Sources without copied text or personal data",
      );
    }
  }
}

function buildAssignment(manifest) {
  const assignmentByCluster = new Map();
  for (const block of manifest.blocks) {
    for (const clusterId of block.clusterIds) {
      assignmentByCluster.set(clusterId, {
        blockId: block.id,
        partitionId: block.partitionId,
      });
    }
  }
  return assignmentByCluster;
}

function buildHeldoutBlockContributions(manifest, heldoutPartitionId) {
  return manifest.blocks
    .filter((block) => block.partitionId === heldoutPartitionId)
    .map((block) => ({
      confusionMatrix: emptyMatrix(),
      goldClusterIds: [...block.clusterIds].sort(),
      id: block.id,
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function caseMatrixMap() {
  return new Map(REQUIRED_CORPUS_CASE_TYPES.map((caseType) => [caseType, emptyMatrix()]));
}

function incrementOutcome(matrix, goldSameTopic, automaticJoin) {
  if (goldSameTopic && automaticJoin) matrix.truePositive += 1;
  else if (!goldSameTopic && automaticJoin) matrix.falsePositive += 1;
  else if (goldSameTopic) matrix.falseNegative += 1;
  else matrix.trueNegative += 1;
}

function requireReconciledMatrices(globalMatrix, perCaseMatrices, blockContributions) {
  const caseSum = emptyMatrix();
  for (const matrix of perCaseMatrices.values()) addMatrix(caseSum, matrix);
  const blockSum = emptyMatrix();
  for (const block of blockContributions) addMatrix(blockSum, block.confusionMatrix);
  if (!matricesEqual(globalMatrix, caseSum) || !matricesEqual(globalMatrix, blockSum)) {
    fail("INTERNAL_INVARIANT", "Per-case and per-block matrices must reconcile globally");
  }
}

function evaluationMetrics(confusionMatrix) {
  const { falseNegative, falsePositive, trueNegative, truePositive } = confusionMatrix;
  const total = truePositive + falsePositive + trueNegative + falseNegative;
  return {
    ...metricsForMatrix(confusionMatrix),
    confidenceIntervals95: {
      accuracy: wilsonScoreInterval(truePositive + trueNegative, total),
      precision: wilsonScoreInterval(truePositive, truePositive + falsePositive),
      recall: wilsonScoreInterval(truePositive, truePositive + falseNegative),
      specificity: wilsonScoreInterval(trueNegative, trueNegative + falsePositive),
    },
  };
}

function observedGateInputs(confusionMatrix, metrics, truePositiveGoldClusters) {
  const { falseNegative, falsePositive, truePositive } = confusionMatrix;
  return {
    automaticJoinDecisions: {
      minimum: NORMATIVE_AUTOMATIC_JOIN_GATE.minimumAutomaticJoinDecisions,
      observed: truePositive + falsePositive,
    },
    precision: {
      denominator: truePositive + falsePositive,
      minimumMicros: NORMATIVE_AUTOMATIC_JOIN_GATE.minimumPrecisionMicros,
      numerator: truePositive,
      observed: metrics.precision,
      rateScale: NORMATIVE_AUTOMATIC_JOIN_GATE.rateScale,
    },
    precisionWilsonLowerBound: {
      confidenceMicros: NORMATIVE_AUTOMATIC_JOIN_GATE.wilsonConfidenceMicros,
      methodVersion: NORMATIVE_AUTOMATIC_JOIN_GATE.wilsonMethodVersion,
      minimumMicros: NORMATIVE_AUTOMATIC_JOIN_GATE.minimumWilsonLowerBoundMicros,
      observed: metrics.confidenceIntervals95.precision?.lower ?? null,
      rateScale: NORMATIVE_AUTOMATIC_JOIN_GATE.rateScale,
    },
    recall: {
      denominator: truePositive + falseNegative,
      minimumMicros: NORMATIVE_AUTOMATIC_JOIN_GATE.minimumRecallMicros,
      numerator: truePositive,
      observed: metrics.recall,
      rateScale: NORMATIVE_AUTOMATIC_JOIN_GATE.rateScale,
    },
    systematicCrossEventMergeClasses: {
      maximum: NORMATIVE_AUTOMATIC_JOIN_GATE.maximumSystematicCrossEventMergeClasses,
      observed: null,
      status: "required-not-performed",
    },
    truePositiveGoldClusters: {
      minimum: NORMATIVE_AUTOMATIC_JOIN_GATE.minimumGoldClustersTouched,
      observed: truePositiveGoldClusters,
    },
  };
}

export function evaluateGeneratedPredictionBundle(dataset, manifest, policy, bundle) {
  const policyReport = validateEvaluationPolicy(dataset, manifest, policy);
  if (!policyReport.readiness.structurallyReadyForExternalFreezeReceipt) {
    fail(
      "POLICY_NOT_STRUCTURALLY_READY",
      "Generated result evaluation requires a structurally ready policy input",
    );
  }
  const predictionReport = validatePredictionBundle(dataset, manifest, policy, bundle);
  requireGeneratedSyntheticSources(dataset);

  const { evaluationDataset } = prepareLabeledCorpusEvaluation(dataset);
  const heldoutPartitionId = policy.bindings.splitManifest.heldoutPartitionId;
  const assignmentByCluster = buildAssignment(manifest);
  const sourceById = new Map(
    evaluationDataset.sources.map((source) => [source.id, source]),
  );
  const recordByPairId = new Map(bundle.records.map((record) => [record.pairId, record]));
  const blockContributions = buildHeldoutBlockContributions(
    manifest,
    heldoutPartitionId,
  );
  const blockById = new Map(blockContributions.map((block) => [block.id, block]));
  const perCaseMatrices = caseMatrixMap();
  const caseCounts = new Map(REQUIRED_CORPUS_CASE_TYPES.map((caseType) => [caseType, 0]));
  const confusionMatrix = emptyMatrix();
  const truePositiveGoldClusterIds = new Set();
  const falsePositiveReview = [];
  const falseNegativeReview = [];
  let automaticJoins = 0;
  let belowThreshold = 0;
  let candidateRetrieved = 0;
  let noCandidate = 0;

  const heldoutPairs = evaluationDataset.pairs
    .filter((pair) => {
      const sourceA = sourceById.get(pair.sourceAId);
      return assignmentByCluster.get(sourceA.clusterId).partitionId === heldoutPartitionId;
    })
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  for (const pair of heldoutPairs) {
    const sourceA = sourceById.get(pair.sourceAId);
    const assignment = assignmentByCluster.get(sourceA.clusterId);
    const record = recordByPairId.get(pair.id);
    const retrieved = record.retrievalStatus === "candidate-retrieved";
    const automaticJoin =
      retrieved &&
      record.scoreMicros >= policy.decisionPolicy.automaticJoinThresholdMicros;
    const goldSameTopic = pair.resolvedGoldDecision.label === "same-topic";

    if (retrieved) candidateRetrieved += 1;
    else noCandidate += 1;
    if (automaticJoin) automaticJoins += 1;
    else if (retrieved) belowThreshold += 1;

    incrementOutcome(confusionMatrix, goldSameTopic, automaticJoin);
    incrementOutcome(perCaseMatrices.get(pair.caseType), goldSameTopic, automaticJoin);
    incrementOutcome(
      blockById.get(assignment.blockId).confusionMatrix,
      goldSameTopic,
      automaticJoin,
    );
    caseCounts.set(pair.caseType, caseCounts.get(pair.caseType) + 1);

    if (goldSameTopic && automaticJoin) {
      truePositiveGoldClusterIds.add(sourceA.clusterId);
    } else if (!goldSameTopic && automaticJoin) {
      falsePositiveReview.push({ caseType: pair.caseType, pairId: pair.id });
    } else if (goldSameTopic) {
      falseNegativeReview.push({ caseType: pair.caseType, pairId: pair.id });
    }
  }

  requireReconciledMatrices(confusionMatrix, perCaseMatrices, blockContributions);
  const abstentions = noCandidate + belowThreshold;
  if (
    candidateRetrieved + noCandidate !== heldoutPairs.length ||
    automaticJoins + abstentions !== heldoutPairs.length
  ) {
    fail("INTERNAL_INVARIANT", "Classification coverage must reconcile to all heldout pairs");
  }

  const metrics = evaluationMetrics(confusionMatrix);
  const bootstrapSensitivity = bootstrapDependencyBlocks(blockContributions, {
    replicates: policy.bootstrapPolicy.replicates,
    seed: policy.bootstrapPolicy.seed,
  });
  if (!matricesEqual(bootstrapSensitivity.pointConfusionMatrix, confusionMatrix)) {
    fail("INTERNAL_INVARIANT", "Bootstrap point matrix must match the global matrix");
  }

  falsePositiveReview.sort((left, right) =>
    left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0,
  );
  falseNegativeReview.sort((left, right) =>
    left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0,
  );

  const report = {
    bindings: {
      corpusDigest: policy.bindings.corpus.digest,
      evaluationDatasetDigest: policy.bindings.evaluationDataset.digest,
      evaluationPolicyDigest: policyReport.policyDigest,
      heldoutPartitionId,
      predictionBundleDigest: predictionReport.bundleDigest,
      splitManifestDigest: policy.bindings.splitManifest.digest,
      systemArtifactDigest: policy.systemUnderTest.artifactDigest,
    },
    bootstrapSensitivity,
    classification: {
      abstentionRate: abstentions / heldoutPairs.length,
      abstentions,
      automaticJoinRate: automaticJoins / heldoutPairs.length,
      automaticJoins,
      belowThreshold,
      candidateRetrieved,
      evaluatedPairs: heldoutPairs.length,
      noCandidate,
      retrievalCoverage: candidateRetrieved / heldoutPairs.length,
    },
    confusionMatrix,
    decisionPolicy: {
      automaticJoinThresholdMicros:
        policy.decisionPolicy.automaticJoinThresholdMicros,
      scoreScale: policy.decisionPolicy.scoreScale,
      version: policy.decisionPolicy.version,
    },
    errorReviewQueues: {
      falseNegative: falseNegativeReview,
      falsePositive: falsePositiveReview,
    },
    heldoutBlockContributions: blockContributions,
    metrics,
    observedGateInputs: observedGateInputs(
      confusionMatrix,
      metrics,
      truePositiveGoldClusterIds.size,
    ),
    perCaseConfusionMatrices: sortedRecord(perCaseMatrices),
    reportVersion: GENERATED_RESULT_REPORT_VERSION,
    sample: {
      caseCounts: sortedRecord(caseCounts),
      heldoutBlocks: blockContributions.length,
      pairs: heldoutPairs.length,
      truePositiveGoldClusters: truePositiveGoldClusterIds.size,
    },
    scope: {
      branch: null,
      externalRequirements: [
        "externally proven policy chronology",
        "evaluator version or artifact frozen before result access",
        "Lead approval of threshold and scope",
        "Trust acceptance of provenance and privacy",
        "candidate isolation from gold labels and tuning data",
        "independent candidate and evaluator artifact reproduction",
        "independent result reproduction",
        "systematic false-merge review",
      ],
      finalGateDecisionMade: false,
      gateEligible: false,
      generatedContractExerciseOnly: true,
      heldOutEvidence: false,
      qualityMetricsComputed: true,
      resultsEvaluated: true,
      scoresComparedWithGold: true,
      thresholdApplied: true,
    },
    systematicCrossEventMergeReview: {
      classCount: null,
      maximumAllowedClasses:
        NORMATIVE_AUTOMATIC_JOIN_GATE.maximumSystematicCrossEventMergeClasses,
      status: "required-not-performed",
    },
  };

  return {
    report,
    reportDigest: canonicalJsonSha256(report),
    reportDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
  };
}
