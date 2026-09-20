import {
  BLOCK_BOOTSTRAP_LIMITS,
  BLOCK_BOOTSTRAP_VERSION,
} from "./block-bootstrap.js";
import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "./canonical-json.js";
import {
  LABELED_CORPUS_CONTRACT_VERSION,
  REQUIRED_CORPUS_CASE_TYPES,
  RESOLVED_EVALUATION_DATASET_VERSION,
  prepareLabeledCorpusEvaluation,
} from "./corpus-contract.js";
import {
  SPLIT_CONTRACT_VERSION,
  validateDependencyBlockSplit,
} from "./split-contract.js";

export const EVALUATION_POLICY_CONTRACT_VERSION =
  "pre-result-evaluation-policy/1.0.0";
export const DECISION_POLICY_VERSION = "fixed-point-join-abstain/1.0.0";
export const GATE_POLICY_VERSION = "automatic-join-gate/1.0.0";
export const METRIC_POLICY_VERSION = "heldout-join-metrics/1.0.0";
export const WILSON_METHOD_VERSION = "wilson-score-two-sided/1.0.0";
export const BRANCH_POLICY_VERSION = "auto-assisted-no-auto/1.0.0";
export const SCOPE_POLICY_VERSION = "offline-english-editorial/1.0.0";
export const ARTIFACT_DIGEST_ALGORITHM = "sha256/1.0.0";

export const NORMATIVE_AUTOMATIC_JOIN_GATE = Object.freeze({
  branchPolicyVersion: BRANCH_POLICY_VERSION,
  maximumSystematicCrossEventMergeClasses: 0,
  metricPolicyVersion: METRIC_POLICY_VERSION,
  minimumAutomaticJoinDecisions: 60,
  minimumGoldClustersTouched: 20,
  minimumPrecisionMicros: 970_000,
  minimumRecallMicros: 500_000,
  minimumWilsonLowerBoundMicros: 930_000,
  rateScale: 1_000_000,
  version: GATE_POLICY_VERSION,
  wilsonConfidenceMicros: 950_000,
  wilsonMethodVersion: WILSON_METHOD_VERSION,
});

const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_POLICY_FIELDS = 32;
const MAX_POLICY_KEY_CODE_UNITS = 128;
const REQUIRED_HELDOUT_BLOCKS = 2;
const REQUIRED_HELDOUT_POSITIVE_PAIRS = 60;
const REQUIRED_HELDOUT_POSITIVE_CLUSTERS = 20;

const ROOT_FIELDS = [
  "bindings",
  "bootstrapPolicy",
  "contractVersion",
  "decisionPolicy",
  "frozenAt",
  "gatePolicy",
  "policyVersion",
  "purpose",
  "scope",
  "systemUnderTest",
];

export class EvaluationPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EvaluationPolicyError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new EvaluationPolicyError(code, message);
}

function summarizeKeys(keys) {
  const displayed = keys.slice(0, 5).map((key) => {
    if (typeof key !== "string") return `[${typeof key}]`;
    return key.length <= 64 ? key : `${key.slice(0, 61)}...`;
  });
  return `${displayed.join(",")}${keys.length > displayed.length ? `,+${keys.length - displayed.length} more` : ""}`;
}

function assertExactFields(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_POLICY", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_POLICY", `${label} must not inherit data or behavior`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > MAX_POLICY_FIELDS) {
    fail("RESOURCE_LIMIT", `${label} has too many fields`);
  }
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        (typeof key === "string" && key.length > MAX_POLICY_KEY_CODE_UNITS) ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    )
  ) {
    fail("INVALID_POLICY", `${label} must contain bounded enumerable string data fields`);
  }
  const allowed = new Set(fields);
  const unknown = keys.filter((key) => !allowed.has(key));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      "INVALID_POLICY",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${summarizeKeys(unknown)}]`,
    );
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("INVALID_POLICY", `${label} must be a bounded lowercase identifier`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("INVALID_POLICY", `${label} must be a lowercase SHA-256 digest`);
  }
}

function timestampMilliseconds(value, label) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_POLICY", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function requireExact(actual, expected, label, code = "POLICY_SEMANTICS_MISMATCH") {
  if (actual !== expected) {
    fail(code, `${label} must be ${JSON.stringify(expected)}`);
  }
}

function validateBinding(binding, fields, label) {
  assertExactFields(binding, fields, label);
  for (const field of fields) {
    if (field === "digest") assertDigest(binding[field], `${label}.digest`);
    else assertIdentifier(binding[field], `${label}.${field}`);
  }
}

function validatePolicyShape(policy) {
  assertExactFields(policy, ROOT_FIELDS, "policy");
  requireExact(
    policy.contractVersion,
    EVALUATION_POLICY_CONTRACT_VERSION,
    "policy.contractVersion",
    "VERSION_MISMATCH",
  );
  assertIdentifier(policy.policyVersion, "policy.policyVersion");
  requireExact(policy.purpose, "freeze-before-heldout-evaluation", "policy.purpose");
  const frozenAt = timestampMilliseconds(policy.frozenAt, "policy.frozenAt");

  assertExactFields(
    policy.bindings,
    ["corpus", "evaluationDataset", "splitManifest"],
    "policy.bindings",
  );
  validateBinding(
    policy.bindings.corpus,
    ["contractVersion", "datasetVersion", "digest", "digestAlgorithm"],
    "policy.bindings.corpus",
  );
  validateBinding(
    policy.bindings.evaluationDataset,
    ["digest", "digestAlgorithm", "projectionVersion"],
    "policy.bindings.evaluationDataset",
  );
  validateBinding(
    policy.bindings.splitManifest,
    [
      "contractVersion",
      "digest",
      "digestAlgorithm",
      "heldoutPartitionId",
      "manifestVersion",
      "tuningPartitionId",
    ],
    "policy.bindings.splitManifest",
  );

  assertExactFields(
    policy.systemUnderTest,
    ["artifactDigest", "artifactDigestAlgorithm", "candidateVersion", "resolverVersion"],
    "policy.systemUnderTest",
  );
  assertDigest(policy.systemUnderTest.artifactDigest, "policy.systemUnderTest.artifactDigest");
  requireExact(
    policy.systemUnderTest.artifactDigestAlgorithm,
    ARTIFACT_DIGEST_ALGORITHM,
    "policy.systemUnderTest.artifactDigestAlgorithm",
    "VERSION_MISMATCH",
  );
  assertIdentifier(policy.systemUnderTest.candidateVersion, "policy.systemUnderTest.candidateVersion");
  assertIdentifier(policy.systemUnderTest.resolverVersion, "policy.systemUnderTest.resolverVersion");

  assertExactFields(
    policy.decisionPolicy,
    [
      "automaticJoinThresholdMicros",
      "belowThreshold",
      "invalidScore",
      "missingCandidate",
      "scoreScale",
      "thresholdComparator",
      "thresholdSelectionPartitionId",
      "version",
    ],
    "policy.decisionPolicy",
  );
  requireExact(policy.decisionPolicy.version, DECISION_POLICY_VERSION, "policy.decisionPolicy.version");
  requireExact(policy.decisionPolicy.scoreScale, 1_000_000, "policy.decisionPolicy.scoreScale");
  if (
    !Number.isSafeInteger(policy.decisionPolicy.automaticJoinThresholdMicros) ||
    policy.decisionPolicy.automaticJoinThresholdMicros < 1 ||
    policy.decisionPolicy.automaticJoinThresholdMicros > policy.decisionPolicy.scoreScale
  ) {
    fail(
      "INVALID_POLICY",
      "policy.decisionPolicy.automaticJoinThresholdMicros must be an integer within the score scale",
    );
  }
  requireExact(
    policy.decisionPolicy.thresholdComparator,
    "greater-than-or-equal",
    "policy.decisionPolicy.thresholdComparator",
  );
  requireExact(policy.decisionPolicy.belowThreshold, "abstain", "policy.decisionPolicy.belowThreshold");
  requireExact(policy.decisionPolicy.missingCandidate, "abstain", "policy.decisionPolicy.missingCandidate");
  requireExact(policy.decisionPolicy.invalidScore, "error", "policy.decisionPolicy.invalidScore");
  assertIdentifier(
    policy.decisionPolicy.thresholdSelectionPartitionId,
    "policy.decisionPolicy.thresholdSelectionPartitionId",
  );

  assertExactFields(policy.gatePolicy, Object.keys(NORMATIVE_AUTOMATIC_JOIN_GATE), "policy.gatePolicy");
  for (const [field, expected] of Object.entries(NORMATIVE_AUTOMATIC_JOIN_GATE)) {
    requireExact(policy.gatePolicy[field], expected, `policy.gatePolicy.${field}`);
  }

  assertExactFields(
    policy.bootstrapPolicy,
    ["methodVersion", "replicates", "seed"],
    "policy.bootstrapPolicy",
  );
  requireExact(
    policy.bootstrapPolicy.methodVersion,
    BLOCK_BOOTSTRAP_VERSION,
    "policy.bootstrapPolicy.methodVersion",
    "VERSION_MISMATCH",
  );
  assertIdentifier(policy.bootstrapPolicy.seed, "policy.bootstrapPolicy.seed");
  if (
    !Number.isSafeInteger(policy.bootstrapPolicy.replicates) ||
    policy.bootstrapPolicy.replicates < BLOCK_BOOTSTRAP_LIMITS.minimumReplicates ||
    policy.bootstrapPolicy.replicates > BLOCK_BOOTSTRAP_LIMITS.maximumReplicates
  ) {
    fail("INVALID_POLICY", "policy.bootstrapPolicy.replicates is outside engine limits");
  }

  assertExactFields(
    policy.scope,
    [
      "candidateIndex",
      "contentClass",
      "evaluationPartitionRole",
      "executionMode",
      "language",
      "networkAllowed",
      "providerCallsAllowed",
      "topicDefinitionVersion",
      "version",
    ],
    "policy.scope",
  );
  requireExact(policy.scope.version, SCOPE_POLICY_VERSION, "policy.scope.version");
  requireExact(policy.scope.contentClass, "editorial-article", "policy.scope.contentClass");
  requireExact(policy.scope.language, "en", "policy.scope.language");
  assertIdentifier(policy.scope.topicDefinitionVersion, "policy.scope.topicDefinitionVersion");
  requireExact(policy.scope.evaluationPartitionRole, "heldout", "policy.scope.evaluationPartitionRole");
  requireExact(policy.scope.candidateIndex, "heldout-partition-only", "policy.scope.candidateIndex");
  requireExact(policy.scope.executionMode, "offline-local", "policy.scope.executionMode");
  requireExact(policy.scope.networkAllowed, false, "policy.scope.networkAllowed");
  requireExact(policy.scope.providerCallsAllowed, false, "policy.scope.providerCallsAllowed");

  return { frozenAt };
}

function assertBinding(actual, expected, label) {
  if (actual !== expected) fail("BINDING_MISMATCH", `${label} does not match validated input`);
}

function sortedRecord(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function heldoutFeasibility(evaluationDataset, manifest, heldoutPartitionId) {
  const partitionByCluster = new Map();
  let heldoutBlocks = 0;
  for (const block of manifest.blocks) {
    if (block.partitionId === heldoutPartitionId) heldoutBlocks += 1;
    for (const clusterId of block.clusterIds) {
      partitionByCluster.set(clusterId, block.partitionId);
    }
  }
  const sourceById = new Map(evaluationDataset.sources.map((source) => [source.id, source]));
  const caseCounts = new Map(REQUIRED_CORPUS_CASE_TYPES.map((caseType) => [caseType, 0]));
  const positiveClusterIds = new Set();
  let eligiblePairs = 0;
  let eligibleSameTopicPairs = 0;
  for (const pair of evaluationDataset.pairs) {
    const sourceA = sourceById.get(pair.sourceAId);
    if (partitionByCluster.get(sourceA.clusterId) !== heldoutPartitionId) continue;
    eligiblePairs += 1;
    caseCounts.set(pair.caseType, caseCounts.get(pair.caseType) + 1);
    if (pair.resolvedGoldDecision.label === "same-topic") {
      eligibleSameTopicPairs += 1;
      positiveClusterIds.add(sourceA.clusterId);
    }
  }
  const missingCaseTypes = REQUIRED_CORPUS_CASE_TYPES.filter(
    (caseType) => caseCounts.get(caseType) === 0,
  );
  return {
    caseCounts: sortedRecord(caseCounts),
    eligiblePairs,
    eligibleSameTopicGoldClusters: positiveClusterIds.size,
    eligibleSameTopicPairs,
    heldoutBlocks,
    missingCaseTypes,
  };
}

export function validateEvaluationPolicy(dataset, manifest, policy) {
  const { frozenAt } = validatePolicyShape(policy);
  const { evaluationDataset, report: corpusReport } = prepareLabeledCorpusEvaluation(dataset);
  const bindings = policy.bindings;
  assertBinding(
    bindings.corpus.contractVersion,
    LABELED_CORPUS_CONTRACT_VERSION,
    "bindings.corpus.contractVersion",
  );
  assertBinding(bindings.corpus.datasetVersion, corpusReport.datasetVersion, "bindings.corpus.datasetVersion");
  assertBinding(bindings.corpus.digest, corpusReport.corpusDigest, "bindings.corpus.digest");
  assertBinding(
    bindings.corpus.digestAlgorithm,
    CANONICAL_JSON_DIGEST_ALGORITHM,
    "bindings.corpus.digestAlgorithm",
  );
  assertBinding(
    bindings.evaluationDataset.projectionVersion,
    RESOLVED_EVALUATION_DATASET_VERSION,
    "bindings.evaluationDataset.projectionVersion",
  );
  assertBinding(
    bindings.evaluationDataset.digest,
    corpusReport.evaluationDatasetDigest,
    "bindings.evaluationDataset.digest",
  );
  assertBinding(
    bindings.evaluationDataset.digestAlgorithm,
    CANONICAL_JSON_DIGEST_ALGORITHM,
    "bindings.evaluationDataset.digestAlgorithm",
  );
  const splitReport = validateDependencyBlockSplit(evaluationDataset, manifest);

  if (manifest.demonstrationOnly || splitReport.demonstrationOnly) {
    fail("SPLIT_NOT_FROZEN", "Evaluation policy requires a non-demonstration split manifest");
  }
  const heldoutPartition = manifest.partitions.find((partition) => partition.role === "heldout");
  const tuningPartition = manifest.partitions.find((partition) => partition.role === "tuning");
  if (!heldoutPartition || !tuningPartition) {
    fail("SPLIT_NOT_FROZEN", "Evaluation policy requires one tuning and one heldout partition");
  }

  assertBinding(
    bindings.splitManifest.contractVersion,
    SPLIT_CONTRACT_VERSION,
    "bindings.splitManifest.contractVersion",
  );
  assertBinding(
    bindings.splitManifest.manifestVersion,
    splitReport.manifestVersion,
    "bindings.splitManifest.manifestVersion",
  );
  assertBinding(bindings.splitManifest.digest, splitReport.manifestDigest, "bindings.splitManifest.digest");
  assertBinding(
    bindings.splitManifest.digestAlgorithm,
    CANONICAL_JSON_DIGEST_ALGORITHM,
    "bindings.splitManifest.digestAlgorithm",
  );
  assertBinding(
    bindings.splitManifest.heldoutPartitionId,
    heldoutPartition.id,
    "bindings.splitManifest.heldoutPartitionId",
  );
  assertBinding(
    bindings.splitManifest.tuningPartitionId,
    tuningPartition.id,
    "bindings.splitManifest.tuningPartitionId",
  );
  assertBinding(
    policy.decisionPolicy.thresholdSelectionPartitionId,
    tuningPartition.id,
    "decisionPolicy.thresholdSelectionPartitionId",
  );
  assertBinding(
    policy.scope.topicDefinitionVersion,
    corpusReport.topicDefinitionVersion,
    "scope.topicDefinitionVersion",
  );

  const datasetCreatedAt = timestampMilliseconds(dataset.createdAt, "dataset.createdAt");
  const splitFrozenAt = timestampMilliseconds(manifest.frozenAt, "manifest.frozenAt");
  if (splitFrozenAt < datasetCreatedAt || frozenAt < splitFrozenAt) {
    fail(
      "INVALID_CHRONOLOGY",
      "Declared chronology must be dataset creation <= split freeze <= policy freeze",
    );
  }

  const feasibility = heldoutFeasibility(
    evaluationDataset,
    manifest,
    heldoutPartition.id,
  );
  if (
    policy.bootstrapPolicy.replicates * feasibility.heldoutBlocks >
    BLOCK_BOOTSTRAP_LIMITS.maximumDraws
  ) {
    fail("RESOURCE_LIMIT", "Frozen bootstrap policy exceeds the engine draw limit");
  }

  const readinessReasons = [...corpusReport.readiness.reasons];
  if (corpusReport.provenance.declaredReviewStatus !== "accepted") {
    readinessReasons.push("corpus provenance review declaration is not accepted");
  }
  if (corpusReport.provenance.pendingRepositoryUseApprovalSourceIds.length > 0) {
    readinessReasons.push("one or more Sources lack declared repository-use approval");
  }
  if (feasibility.heldoutBlocks < REQUIRED_HELDOUT_BLOCKS) {
    readinessReasons.push(
      `heldout dependency blocks ${feasibility.heldoutBlocks} < ${REQUIRED_HELDOUT_BLOCKS}`,
    );
  }
  if (feasibility.eligibleSameTopicPairs < REQUIRED_HELDOUT_POSITIVE_PAIRS) {
    readinessReasons.push(
      `heldout eligible same-topic pairs ${feasibility.eligibleSameTopicPairs} < ${REQUIRED_HELDOUT_POSITIVE_PAIRS}`,
    );
  }
  if (feasibility.eligibleSameTopicGoldClusters < REQUIRED_HELDOUT_POSITIVE_CLUSTERS) {
    readinessReasons.push(
      `heldout eligible same-topic gold clusters ${feasibility.eligibleSameTopicGoldClusters} < ${REQUIRED_HELDOUT_POSITIVE_CLUSTERS}`,
    );
  }
  if (feasibility.missingCaseTypes.length > 0) {
    readinessReasons.push(
      `heldout missing case types [${feasibility.missingCaseTypes.join(",")}]`,
    );
  }

  return {
    contractVersion: EVALUATION_POLICY_CONTRACT_VERSION,
    feasibility: {
      ...feasibility,
      note:
        "Gold-label feasibility does not predict the number or quality of future automatic joins",
    },
    frozenAt: policy.frozenAt,
    policyDigest: canonicalJsonSha256(policy),
    policyDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    policyVersion: policy.policyVersion,
    readiness: {
      reasons: readinessReasons,
      structurallyReadyForExternalFreezeReceipt: readinessReasons.length === 0,
    },
    scope: {
      externalRequirements: [
        "commit or receipt chronology proving this policy predates heldout result access",
        "Lead approval of the selected threshold and scope",
        "Trust acceptance of corpus provenance and privacy",
        "artifact digest verification",
        "independent result reproducibility",
      ],
      gateEligible: false,
      heldOutEvidence: false,
      resultsEvaluated: false,
    },
  };
}
