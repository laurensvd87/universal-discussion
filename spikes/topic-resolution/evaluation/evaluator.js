import { normalizePublicHttpUrl } from "../src/index.js";

export const PILOT_BASELINE_VERSION = "exact-signals/1.0.0";
export const PILOT_REPORT_VERSION = "pilot-evaluation-report/1.1.0";

const AUTOMATIC_JOIN_GATE = Object.freeze({
  minimumDecisions: 60,
  minimumGoldClusters: 20,
});
const WILSON_95_Z = 1.959963984540054;

const CASE_COUNTS = Object.freeze({
  "duplicate-syndication-positive": 8,
  "same-entity-title-hard-negative": 8,
  "update-continuation-boundary": 4,
  "unrelated-control": 4,
});
const LABELS = new Set(["different-topic", "same-topic"]);
const SOURCE_FIELDS = new Set([
  "clusterId",
  "contentFingerprint",
  "factSummary",
  "fingerprintEvidence",
  "id",
  "publishedAt",
  "title",
  "url",
]);
const PAIR_FIELDS = new Set([
  "caseType",
  "id",
  "primaryDecision",
  "secondaryReview",
  "sourceAId",
  "sourceBId",
]);
const DECISION_FIELDS = new Set(["label", "rationale", "reviewerId"]);
const REVIEW_FIELDS = new Set([
  "label",
  "rationale",
  "reviewedAt",
  "reviewerId",
  "reviewMethod",
]);

export class PilotDatasetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PilotDatasetError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PilotDatasetError(code, message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_SCHEMA", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_SCHEMA", `${label} must not inherit data or behavior`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) {
    fail("INVALID_SCHEMA", `${label} must contain data fields only`);
  }
}

function assertExactFields(value, allowed, required, label) {
  assertPlainObject(value, label);
  const keys = Reflect.ownKeys(value);
  const unknown = keys.filter((key) => typeof key !== "string" || !allowed.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      "INVALID_SCHEMA",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${unknown.map(String).join(",")}]`,
    );
  }
}

function assertBoundedString(value, label, maximum = 512) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) {
    fail("INVALID_SCHEMA", `${label} must be a non-empty string of at most ${maximum} code units`);
  }
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }
  const milliseconds = Date.parse(value);
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validateFingerprint(source, label) {
  const hasFingerprint = Object.hasOwn(source, "contentFingerprint");
  const hasEvidence = Object.hasOwn(source, "fingerprintEvidence");
  if (hasFingerprint !== hasEvidence) {
    fail("INVALID_SCHEMA", `${label} fingerprint and evidence must be supplied together`);
  }
  if (!hasFingerprint) {
    return;
  }
  if (
    typeof source.contentFingerprint !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(source.contentFingerprint)
  ) {
    fail("INVALID_SCHEMA", `${label} fingerprint must be lowercase sha256 hex`);
  }
  assertExactFields(
    source.fingerprintEvidence,
    new Set(["fixtureId", "kind"]),
    ["fixtureId", "kind"],
    `${label}.fingerprintEvidence`,
  );
  if (
    source.fingerprintEvidence.kind !== "synthetic-fixture" ||
    !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(source.fingerprintEvidence.fixtureId)
  ) {
    fail("INVALID_SCHEMA", `${label} fingerprint evidence must identify a synthetic fixture`);
  }
}

function validateSource(source, seenIds) {
  const label = `source ${source?.id ?? "<unknown>"}`;
  assertExactFields(
    source,
    SOURCE_FIELDS,
    ["clusterId", "factSummary", "id", "publishedAt", "title", "url"],
    label,
  );
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(source.id) || seenIds.has(source.id)) {
    fail("INVALID_SCHEMA", `${label} id must be unique lowercase kebab-case`);
  }
  seenIds.add(source.id);
  if (!/^cluster-[a-z0-9][a-z0-9-]{0,55}$/.test(source.clusterId)) {
    fail("INVALID_SCHEMA", `${label} clusterId is invalid`);
  }
  assertBoundedString(source.title, `${label}.title`, 256);
  assertBoundedString(source.factSummary, `${label}.factSummary`, 512);
  if (!isCanonicalTimestamp(source.publishedAt)) {
    fail("INVALID_SCHEMA", `${label}.publishedAt must be a canonical ISO timestamp`);
  }
  try {
    normalizePublicHttpUrl(source.url);
  } catch (error) {
    fail("INVALID_SCHEMA", `${label}.url is invalid: ${error.message}`);
  }
  validateFingerprint(source, label);
}

function validateDecision(decision, fields, label) {
  assertExactFields(
    decision,
    fields,
    [...fields],
    label,
  );
  if (!LABELS.has(decision.label)) {
    fail("INVALID_SCHEMA", `${label}.label is invalid`);
  }
  assertBoundedString(decision.reviewerId, `${label}.reviewerId`, 64);
  assertBoundedString(decision.rationale, `${label}.rationale`, 512);
  if (Object.hasOwn(decision, "reviewedAt")) {
    if (!isCanonicalTimestamp(decision.reviewedAt)) {
      fail("INVALID_SCHEMA", `${label}.reviewedAt must be a canonical ISO timestamp`);
    }
    if (decision.reviewMethod !== "blinded-source-metadata") {
      fail("INVALID_REVIEW", `${label}.reviewMethod must record the blinded review method`);
    }
  }
}

function expectedLabelForCase(caseType) {
  return caseType === "duplicate-syndication-positive" ? "same-topic" : "different-topic";
}

function baselineObservation(source) {
  return {
    url: source.url,
    contentFingerprint: source.contentFingerprint ?? null,
  };
}

function predictPair(sourceA, sourceB) {
  const normalizedA = normalizePublicHttpUrl(sourceA.url);
  const normalizedB = normalizePublicHttpUrl(sourceB.url);
  const bothFingerprinted = sourceA.contentFingerprint && sourceB.contentFingerprint;

  if (bothFingerprinted && sourceA.contentFingerprint !== sourceB.contentFingerprint) {
    return { label: "different-topic", method: "conflicting-content-fingerprint" };
  }
  if (normalizedA === normalizedB) {
    return { label: "same-topic", method: "exact-normalized-url" };
  }
  if (bothFingerprinted && sourceA.contentFingerprint === sourceB.contentFingerprint) {
    return { label: "same-topic", method: "exact-content-fingerprint" };
  }
  return { label: "different-topic", method: "fail-separate" };
}

function metric(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function wilsonScoreInterval(successes, total) {
  if (
    !Number.isSafeInteger(successes) ||
    !Number.isSafeInteger(total) ||
    successes < 0 ||
    total < 0 ||
    successes > total
  ) {
    throw new TypeError("Wilson interval counts must be safe integers with 0 <= successes <= total");
  }
  if (total === 0) {
    return null;
  }

  const proportion = successes / total;
  const zSquared = WILSON_95_Z ** 2;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const margin =
    (WILSON_95_Z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + zSquared / (4 * total ** 2));

  return {
    confidenceLevel: 0.95,
    lower: Math.max(0, center - margin),
    successes,
    total,
    upper: Math.min(1, center + margin),
  };
}

function sameMatrix(actual, expected) {
  return ["truePositive", "falsePositive", "trueNegative", "falseNegative"].every(
    (field) => actual[field] === expected[field],
  );
}

export function evaluatePilot(dataset) {
  assertExactFields(
    dataset,
    new Set([
      "datasetVersion",
      "expectedBaseline",
      "pairs",
      "provenance",
      "scope",
      "sources",
      "topicDefinitionVersion",
    ]),
    [
      "datasetVersion",
      "expectedBaseline",
      "pairs",
      "provenance",
      "scope",
      "sources",
      "topicDefinitionVersion",
    ],
    "dataset",
  );
  assertBoundedString(dataset.datasetVersion, "dataset.datasetVersion", 128);
  assertBoundedString(dataset.topicDefinitionVersion, "dataset.topicDefinitionVersion", 128);

  assertExactFields(
    dataset.provenance,
    new Set(["containsCopiedText", "containsPersonalData", "createdAt", "kind"]),
    ["containsCopiedText", "containsPersonalData", "createdAt", "kind"],
    "dataset.provenance",
  );
  if (
    dataset.provenance.kind !== "project-created-synthetic" ||
    dataset.provenance.containsCopiedText !== false ||
    dataset.provenance.containsPersonalData !== false ||
    !isCanonicalTimestamp(dataset.provenance.createdAt)
  ) {
    fail("INVALID_PROVENANCE", "Pilot data must be dated, project-created synthetic data");
  }

  assertExactFields(
    dataset.scope,
    new Set(["contentClass", "language", "topicDefinition"]),
    ["contentClass", "language", "topicDefinition"],
    "dataset.scope",
  );
  if (dataset.scope.contentClass !== "editorial-article" || dataset.scope.language !== "en") {
    fail("INVALID_SCOPE", "Pilot scope must be English editorial articles");
  }
  assertBoundedString(dataset.scope.topicDefinition, "dataset.scope.topicDefinition", 512);

  if (!Array.isArray(dataset.sources) || !Array.isArray(dataset.pairs)) {
    fail("INVALID_SCHEMA", "dataset.sources and dataset.pairs must be arrays");
  }
  const seenSourceIds = new Set();
  for (const source of dataset.sources) {
    validateSource(source, seenSourceIds);
  }
  const sourcesById = new Map(dataset.sources.map((source) => [source.id, source]));

  if (dataset.pairs.length !== 24) {
    fail("INVALID_CASE_MIX", "Pilot must contain exactly 24 pair decisions");
  }
  const caseCounts = Object.fromEntries(Object.keys(CASE_COUNTS).map((key) => [key, 0]));
  const seenPairIds = new Set();
  const seenPairKeys = new Set();
  const clusterIds = new Set();
  const disagreements = [];
  let reviewedPairs = 0;
  const confusionMatrix = {
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
  };
  const decisions = [];
  const automaticJoinGoldClusterIds = new Set();

  for (const pair of dataset.pairs) {
    const label = `pair ${pair?.id ?? "<unknown>"}`;
    assertExactFields(pair, PAIR_FIELDS, [...PAIR_FIELDS], label);
    if (!/^pair-[a-z0-9][a-z0-9-]{0,63}$/.test(pair.id) || seenPairIds.has(pair.id)) {
      fail("INVALID_SCHEMA", `${label} id must be unique lowercase kebab-case`);
    }
    seenPairIds.add(pair.id);
    if (!Object.hasOwn(CASE_COUNTS, pair.caseType)) {
      fail("INVALID_CASE_MIX", `${label} caseType is invalid`);
    }
    caseCounts[pair.caseType] += 1;
    if (pair.sourceAId === pair.sourceBId) {
      fail("INVALID_SCHEMA", `${label} must compare two distinct sources`);
    }
    const sourceA = sourcesById.get(pair.sourceAId);
    const sourceB = sourcesById.get(pair.sourceBId);
    if (!sourceA || !sourceB) {
      fail("INVALID_SCHEMA", `${label} references an unknown source`);
    }
    const pairKey = [sourceA.id, sourceB.id].sort().join("\n");
    if (seenPairKeys.has(pairKey)) {
      fail("INVALID_SCHEMA", `${label} duplicates an unordered source pair`);
    }
    seenPairKeys.add(pairKey);
    clusterIds.add(sourceA.clusterId);
    clusterIds.add(sourceB.clusterId);

    validateDecision(pair.primaryDecision, DECISION_FIELDS, `${label}.primaryDecision`);
    const expectedLabel = expectedLabelForCase(pair.caseType);
    if (pair.primaryDecision.label !== expectedLabel) {
      fail("INVALID_CASE_MIX", `${label} label contradicts its case type`);
    }
    const sameCluster = sourceA.clusterId === sourceB.clusterId;
    if ((pair.primaryDecision.label === "same-topic") !== sameCluster) {
      fail("INVALID_CLUSTER_ASSIGNMENT", `${label} label contradicts source cluster ids`);
    }

    if (pair.secondaryReview !== null) {
      validateDecision(pair.secondaryReview, REVIEW_FIELDS, `${label}.secondaryReview`);
      if (pair.secondaryReview.reviewerId === pair.primaryDecision.reviewerId) {
        fail("INVALID_REVIEW", `${label} secondary reviewer must be independent`);
      }
      reviewedPairs += 1;
      if (pair.secondaryReview.label !== pair.primaryDecision.label) {
        disagreements.push({
          pairId: pair.id,
          primaryLabel: pair.primaryDecision.label,
          secondaryLabel: pair.secondaryReview.label,
        });
      }
    }

    const prediction = predictPair(baselineObservation(sourceA), baselineObservation(sourceB));
    const goldSame = pair.primaryDecision.label === "same-topic";
    const predictedSame = prediction.label === "same-topic";
    if (goldSame && predictedSame) confusionMatrix.truePositive += 1;
    if (!goldSame && predictedSame) confusionMatrix.falsePositive += 1;
    if (!goldSame && !predictedSame) confusionMatrix.trueNegative += 1;
    if (goldSame && !predictedSame) confusionMatrix.falseNegative += 1;
    if (predictedSame) {
      automaticJoinGoldClusterIds.add(sourceA.clusterId);
      automaticJoinGoldClusterIds.add(sourceB.clusterId);
    }
    decisions.push({
      pairId: pair.id,
      caseType: pair.caseType,
      goldLabel: pair.primaryDecision.label,
      predictedLabel: prediction.label,
      method: prediction.method,
    });
  }

  for (const [caseType, requiredCount] of Object.entries(CASE_COUNTS)) {
    if (caseCounts[caseType] !== requiredCount) {
      fail(
        "INVALID_CASE_MIX",
        `${caseType} must contain ${requiredCount} pairs, got ${caseCounts[caseType]}`,
      );
    }
  }
  if (clusterIds.size < 8) {
    fail("INVALID_CASE_MIX", "Pilot must span at least eight story clusters");
  }
  const requiredReviews = Math.ceil(dataset.pairs.length * 0.2);
  if (reviewedPairs < requiredReviews) {
    fail(
      "INSUFFICIENT_REVIEW",
      `Pilot requires at least ${requiredReviews} independently reviewed pairs`,
    );
  }

  assertExactFields(
    dataset.expectedBaseline,
    new Set(["falseNegative", "falsePositive", "trueNegative", "truePositive"]),
    ["falseNegative", "falsePositive", "trueNegative", "truePositive"],
    "dataset.expectedBaseline",
  );
  if (!sameMatrix(confusionMatrix, dataset.expectedBaseline)) {
    fail(
      "EXPECTED_BASELINE_MISMATCH",
      `Expected ${JSON.stringify(dataset.expectedBaseline)}, got ${JSON.stringify(confusionMatrix)}`,
    );
  }

  const { truePositive, falsePositive, trueNegative, falseNegative } = confusionMatrix;
  const automaticJoinDecisions = truePositive + falsePositive;
  const automaticJoinEvidenceReasons = [
    "pilot is not a cluster-separated held-out evaluation",
  ];
  if (automaticJoinDecisions < AUTOMATIC_JOIN_GATE.minimumDecisions) {
    automaticJoinEvidenceReasons.push(
      `automatic-join decisions ${automaticJoinDecisions} < ${AUTOMATIC_JOIN_GATE.minimumDecisions}`,
    );
  }
  if (automaticJoinGoldClusterIds.size < AUTOMATIC_JOIN_GATE.minimumGoldClusters) {
    automaticJoinEvidenceReasons.push(
      `gold clusters touched ${automaticJoinGoldClusterIds.size} < ${AUTOMATIC_JOIN_GATE.minimumGoldClusters}`,
    );
  }

  return {
    baselineVersion: PILOT_BASELINE_VERSION,
    reportVersion: PILOT_REPORT_VERSION,
    datasetVersion: dataset.datasetVersion,
    topicDefinitionVersion: dataset.topicDefinitionVersion,
    sample: {
      pairs: dataset.pairs.length,
      clusters: clusterIds.size,
      caseCounts,
      reviewedPairs,
      requiredReviews,
      reviewCoverage: reviewedPairs / dataset.pairs.length,
      disagreements,
    },
    confusionMatrix,
    metrics: {
      precision: metric(truePositive, truePositive + falsePositive),
      recall: metric(truePositive, truePositive + falseNegative),
      specificity: metric(trueNegative, trueNegative + falsePositive),
      accuracy: metric(truePositive + trueNegative, dataset.pairs.length),
      confidenceIntervals95: {
        precision: wilsonScoreInterval(truePositive, truePositive + falsePositive),
        recall: wilsonScoreInterval(truePositive, truePositive + falseNegative),
        specificity: wilsonScoreInterval(trueNegative, trueNegative + falsePositive),
        accuracy: wilsonScoreInterval(truePositive + trueNegative, dataset.pairs.length),
      },
    },
    classification: {
      abstentions: 0,
      coverage: 1,
      evaluatedPairs: dataset.pairs.length,
    },
    automaticJoinEvidence: {
      decisions: automaticJoinDecisions,
      goldClustersTouched: automaticJoinGoldClusterIds.size,
      heldOut: false,
      minimumDecisions: AUTOMATIC_JOIN_GATE.minimumDecisions,
      minimumGoldClusters: AUTOMATIC_JOIN_GATE.minimumGoldClusters,
      sufficientForGate: automaticJoinEvidenceReasons.length === 0,
      reasons: automaticJoinEvidenceReasons,
    },
    resourceAccounting: {
      externalCashCost: {
        amount: 0,
        currency: "USD",
      },
      providerCalls: 0,
      scope: "offline-local-evaluator",
    },
    decisions,
  };
}
