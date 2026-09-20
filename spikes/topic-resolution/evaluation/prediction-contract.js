import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "./canonical-json.js";
import { prepareLabeledCorpusEvaluation } from "./corpus-contract.js";
import {
  ARTIFACT_DIGEST_ALGORITHM,
  EVALUATION_POLICY_CONTRACT_VERSION,
  validateEvaluationPolicy,
} from "./evaluation-policy.js";

export const PREDICTION_BUNDLE_CONTRACT_VERSION =
  "heldout-prediction-bundle/1.0.0";

const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SCORE_SCALE = 1_000_000;
const MAX_RECORDS = 100_000;
const MAX_OBJECT_FIELDS = 32;
const MAX_KEY_CODE_UNITS = 128;

const ROOT_FIELDS = [
  "bindings",
  "bundleVersion",
  "contractVersion",
  "createdAt",
  "purpose",
  "records",
];

export class PredictionBundleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PredictionBundleError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PredictionBundleError(code, message);
}

function summarizeKeys(keys) {
  const displayed = keys.slice(0, 5).map((key) => {
    if (typeof key !== "string") return `[${typeof key}]`;
    return key.length <= 64 ? key : `${key.slice(0, 61)}...`;
  });
  return `${displayed.join(",")}${
    keys.length > displayed.length ? `,+${keys.length - displayed.length} more` : ""
  }`;
}

function assertExactFields(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_BUNDLE", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_BUNDLE", `${label} must not inherit data or behavior`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > MAX_OBJECT_FIELDS) {
    fail("RESOURCE_LIMIT", `${label} has too many fields`);
  }
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        key.length > MAX_KEY_CODE_UNITS ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    )
  ) {
    fail(
      "INVALID_BUNDLE",
      `${label} must contain bounded enumerable string data fields`,
    );
  }
  const allowed = new Set(fields);
  const unknown = keys.filter((key) => !allowed.has(key));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      "INVALID_BUNDLE",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${summarizeKeys(unknown)}]`,
    );
  }
}

function denseDataArray(value, label) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 1 ||
    value.length > MAX_RECORDS
  ) {
    fail(
      "RESOURCE_LIMIT",
      `${label} must be an ordinary array with 1 to ${MAX_RECORDS} entries`,
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entryKeys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
  if (
    entryKeys.length !== expectedKeys.length ||
    entryKeys.some(
      (key, index) =>
        key !== expectedKeys[index] ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    )
  ) {
    fail("INVALID_BUNDLE", `${label} must be a dense enumerable data array`);
  }
  return expectedKeys.map((key) => descriptors[key].value);
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("INVALID_BUNDLE", `${label} must be a bounded lowercase identifier`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("INVALID_BUNDLE", `${label} must be a lowercase SHA-256 digest`);
  }
}

function timestampMilliseconds(value, label) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_BUNDLE", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function requireExact(actual, expected, label, code = "BINDING_MISMATCH") {
  if (actual !== expected) {
    fail(code, `${label} does not match the validated policy`);
  }
}

function validateBindingShapes(bindings) {
  assertExactFields(
    bindings,
    ["evaluationDataset", "evaluationPolicy", "splitManifest", "systemUnderTest"],
    "bundle.bindings",
  );
  assertExactFields(
    bindings.evaluationDataset,
    ["digest", "digestAlgorithm", "projectionVersion"],
    "bundle.bindings.evaluationDataset",
  );
  assertDigest(bindings.evaluationDataset.digest, "bundle.bindings.evaluationDataset.digest");
  assertIdentifier(
    bindings.evaluationDataset.digestAlgorithm,
    "bundle.bindings.evaluationDataset.digestAlgorithm",
  );
  assertIdentifier(
    bindings.evaluationDataset.projectionVersion,
    "bundle.bindings.evaluationDataset.projectionVersion",
  );

  assertExactFields(
    bindings.evaluationPolicy,
    ["contractVersion", "digest", "digestAlgorithm", "policyVersion"],
    "bundle.bindings.evaluationPolicy",
  );
  assertIdentifier(
    bindings.evaluationPolicy.contractVersion,
    "bundle.bindings.evaluationPolicy.contractVersion",
  );
  assertDigest(bindings.evaluationPolicy.digest, "bundle.bindings.evaluationPolicy.digest");
  assertIdentifier(
    bindings.evaluationPolicy.digestAlgorithm,
    "bundle.bindings.evaluationPolicy.digestAlgorithm",
  );
  assertIdentifier(
    bindings.evaluationPolicy.policyVersion,
    "bundle.bindings.evaluationPolicy.policyVersion",
  );

  assertExactFields(
    bindings.splitManifest,
    ["digest", "digestAlgorithm", "heldoutPartitionId", "manifestVersion"],
    "bundle.bindings.splitManifest",
  );
  assertDigest(bindings.splitManifest.digest, "bundle.bindings.splitManifest.digest");
  assertIdentifier(
    bindings.splitManifest.digestAlgorithm,
    "bundle.bindings.splitManifest.digestAlgorithm",
  );
  assertIdentifier(
    bindings.splitManifest.heldoutPartitionId,
    "bundle.bindings.splitManifest.heldoutPartitionId",
  );
  assertIdentifier(
    bindings.splitManifest.manifestVersion,
    "bundle.bindings.splitManifest.manifestVersion",
  );

  assertExactFields(
    bindings.systemUnderTest,
    ["artifactDigest", "artifactDigestAlgorithm", "candidateVersion", "resolverVersion"],
    "bundle.bindings.systemUnderTest",
  );
  assertDigest(
    bindings.systemUnderTest.artifactDigest,
    "bundle.bindings.systemUnderTest.artifactDigest",
  );
  assertIdentifier(
    bindings.systemUnderTest.artifactDigestAlgorithm,
    "bundle.bindings.systemUnderTest.artifactDigestAlgorithm",
  );
  assertIdentifier(
    bindings.systemUnderTest.candidateVersion,
    "bundle.bindings.systemUnderTest.candidateVersion",
  );
  assertIdentifier(
    bindings.systemUnderTest.resolverVersion,
    "bundle.bindings.systemUnderTest.resolverVersion",
  );
}

function validateBundleShape(bundle) {
  assertExactFields(bundle, ROOT_FIELDS, "bundle");
  requireExact(
    bundle.contractVersion,
    PREDICTION_BUNDLE_CONTRACT_VERSION,
    "bundle.contractVersion",
    "VERSION_MISMATCH",
  );
  assertIdentifier(bundle.bundleVersion, "bundle.bundleVersion");
  requireExact(
    bundle.purpose,
    "unevaluated-heldout-candidate-output",
    "bundle.purpose",
    "INVALID_BUNDLE",
  );
  const createdAt = timestampMilliseconds(bundle.createdAt, "bundle.createdAt");
  validateBindingShapes(bundle.bindings);

  const records = denseDataArray(bundle.records, "bundle.records");
  let candidateRetrieved = 0;
  let noCandidate = 0;
  let previousPairId = null;
  for (const [index, record] of records.entries()) {
    const label = `bundle.records[${index}]`;
    assertExactFields(record, ["pairId", "retrievalStatus", "scoreMicros"], label);
    assertIdentifier(record.pairId, `${label}.pairId`);
    if (previousPairId !== null && record.pairId <= previousPairId) {
      fail(
        "INVALID_BUNDLE",
        "bundle.records must have sorted unique pair identifiers",
      );
    }
    previousPairId = record.pairId;

    if (record.retrievalStatus === "candidate-retrieved") {
      if (
        !Number.isSafeInteger(record.scoreMicros) ||
        record.scoreMicros < 0 ||
        record.scoreMicros > SCORE_SCALE
      ) {
        fail(
          "INVALID_BUNDLE",
          `${label}.scoreMicros must be an integer from 0 to ${SCORE_SCALE}`,
        );
      }
      candidateRetrieved += 1;
    } else if (record.retrievalStatus === "no-candidate") {
      if (record.scoreMicros !== null) {
        fail("INVALID_BUNDLE", `${label}.scoreMicros must be null when no candidate exists`);
      }
      noCandidate += 1;
    } else {
      fail(
        "INVALID_BUNDLE",
        `${label}.retrievalStatus must be candidate-retrieved or no-candidate`,
      );
    }
  }

  return { candidateRetrieved, createdAt, noCandidate, records };
}

function heldoutPairIds(evaluationDataset, manifest, heldoutPartitionId) {
  const partitionByCluster = new Map();
  for (const block of manifest.blocks) {
    for (const clusterId of block.clusterIds) {
      partitionByCluster.set(clusterId, block.partitionId);
    }
  }
  const sourceById = new Map(
    evaluationDataset.sources.map((source) => [source.id, source]),
  );
  return evaluationDataset.pairs
    .filter((pair) => {
      const source = sourceById.get(pair.sourceAId);
      return partitionByCluster.get(source.clusterId) === heldoutPartitionId;
    })
    .map((pair) => pair.id)
    .sort();
}

function assertCompleteInventory(records, expectedPairIds) {
  if (records.length !== expectedPairIds.length) {
    fail(
      "INCOMPLETE_HELDOUT_INVENTORY",
      `bundle has ${records.length} records; expected ${expectedPairIds.length}`,
    );
  }
  for (let index = 0; index < expectedPairIds.length; index += 1) {
    if (records[index].pairId !== expectedPairIds[index]) {
      fail(
        "INCOMPLETE_HELDOUT_INVENTORY",
        `bundle record ${index} does not match the declared heldout pair inventory`,
      );
    }
  }
}

export function validatePredictionBundle(dataset, manifest, policy, bundle) {
  const shape = validateBundleShape(bundle);
  const policyReport = validateEvaluationPolicy(dataset, manifest, policy);
  const { evaluationDataset } = prepareLabeledCorpusEvaluation(dataset);
  const bindings = bundle.bindings;

  requireExact(
    bindings.evaluationDataset.digest,
    policy.bindings.evaluationDataset.digest,
    "bundle.bindings.evaluationDataset.digest",
  );
  requireExact(
    bindings.evaluationDataset.digestAlgorithm,
    policy.bindings.evaluationDataset.digestAlgorithm,
    "bundle.bindings.evaluationDataset.digestAlgorithm",
  );
  requireExact(
    bindings.evaluationDataset.projectionVersion,
    policy.bindings.evaluationDataset.projectionVersion,
    "bundle.bindings.evaluationDataset.projectionVersion",
  );

  requireExact(
    bindings.evaluationPolicy.contractVersion,
    EVALUATION_POLICY_CONTRACT_VERSION,
    "bundle.bindings.evaluationPolicy.contractVersion",
  );
  requireExact(
    bindings.evaluationPolicy.digest,
    policyReport.policyDigest,
    "bundle.bindings.evaluationPolicy.digest",
  );
  requireExact(
    bindings.evaluationPolicy.digestAlgorithm,
    policyReport.policyDigestAlgorithm,
    "bundle.bindings.evaluationPolicy.digestAlgorithm",
  );
  requireExact(
    bindings.evaluationPolicy.policyVersion,
    policy.policyVersion,
    "bundle.bindings.evaluationPolicy.policyVersion",
  );

  requireExact(
    bindings.splitManifest.digest,
    policy.bindings.splitManifest.digest,
    "bundle.bindings.splitManifest.digest",
  );
  requireExact(
    bindings.splitManifest.digestAlgorithm,
    policy.bindings.splitManifest.digestAlgorithm,
    "bundle.bindings.splitManifest.digestAlgorithm",
  );
  requireExact(
    bindings.splitManifest.heldoutPartitionId,
    policy.bindings.splitManifest.heldoutPartitionId,
    "bundle.bindings.splitManifest.heldoutPartitionId",
  );
  requireExact(
    bindings.splitManifest.manifestVersion,
    policy.bindings.splitManifest.manifestVersion,
    "bundle.bindings.splitManifest.manifestVersion",
  );

  requireExact(
    bindings.systemUnderTest.artifactDigest,
    policy.systemUnderTest.artifactDigest,
    "bundle.bindings.systemUnderTest.artifactDigest",
  );
  requireExact(
    bindings.systemUnderTest.artifactDigestAlgorithm,
    ARTIFACT_DIGEST_ALGORITHM,
    "bundle.bindings.systemUnderTest.artifactDigestAlgorithm",
  );
  requireExact(
    bindings.systemUnderTest.candidateVersion,
    policy.systemUnderTest.candidateVersion,
    "bundle.bindings.systemUnderTest.candidateVersion",
  );
  requireExact(
    bindings.systemUnderTest.resolverVersion,
    policy.systemUnderTest.resolverVersion,
    "bundle.bindings.systemUnderTest.resolverVersion",
  );

  const policyFrozenAt = timestampMilliseconds(policy.frozenAt, "policy.frozenAt");
  if (shape.createdAt < policyFrozenAt) {
    fail(
      "INVALID_CHRONOLOGY",
      "bundle.createdAt must not predate the policy freeze declaration",
    );
  }

  const expectedPairIds = heldoutPairIds(
    evaluationDataset,
    manifest,
    policy.bindings.splitManifest.heldoutPartitionId,
  );
  assertCompleteInventory(shape.records, expectedPairIds);

  return {
    bindings: {
      evaluationDatasetDigest: bindings.evaluationDataset.digest,
      evaluationPolicyDigest: bindings.evaluationPolicy.digest,
      heldoutPartitionId: bindings.splitManifest.heldoutPartitionId,
      splitManifestDigest: bindings.splitManifest.digest,
      systemArtifactDigest: bindings.systemUnderTest.artifactDigest,
    },
    bundleDigest: canonicalJsonSha256(bundle),
    bundleDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    bundleVersion: bundle.bundleVersion,
    contractVersion: PREDICTION_BUNDLE_CONTRACT_VERSION,
    createdAt: bundle.createdAt,
    declaredChronology: {
      externallyVerified: false,
      ordered: true,
      note:
        "Self-declared timestamps do not prove that the policy was externally frozen before result access",
    },
    inventory: {
      candidateRetrieved: shape.candidateRetrieved,
      complete: true,
      expectedHeldoutPairs: expectedPairIds.length,
      noCandidate: shape.noCandidate,
      recordCount: shape.records.length,
    },
    scope: {
      externalRequirements: [
        "external commit or receipt chronology for the bound policy",
        "prediction execution isolated from gold labels and case metadata",
        "aggregate artifact digest reproduction",
        "separate thresholding and quality evaluation",
        "independent result reproducibility and Trust review",
      ],
      gateEligible: false,
      heldOutEvidence: false,
      qualityMetricsComputed: false,
      resultsEvaluated: false,
      scoresComparedWithGold: false,
      thresholdApplied: false,
    },
  };
}
