import { normalizePublicHttpUrl } from "../src/index.js";
import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "./canonical-json.js";

export const LABELED_CORPUS_CONTRACT_VERSION = "labeled-story-corpus/1.0.0";
export const RESOLVED_EVALUATION_DATASET_VERSION =
  "resolved-story-evaluation-dataset/1.0.0";

export const REQUIRED_CORPUS_CASE_TYPES = Object.freeze([
  "adversarial-title",
  "duplicate-positive",
  "related-distinct",
  "syndication-positive",
  "unrelated-control",
  "update-continuation-boundary",
]);

const CASE_LABELS = Object.freeze({
  "adversarial-title": null,
  "duplicate-positive": "same-topic",
  "related-distinct": "different-topic",
  "syndication-positive": "same-topic",
  "unrelated-control": "different-topic",
  "update-continuation-boundary": "different-topic",
});
const LABELS = new Set(["different-topic", "same-topic"]);
const PROVENANCE_KINDS = Object.freeze([
  "licensed-metadata",
  "project-created-synthetic",
  "reviewed-public-metadata",
]);
const PROVENANCE_REVIEW_STATUSES = new Set(["accepted", "pending"]);
const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const REVIEWER_IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,63}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const MIN_ELIGIBLE_PAIRS = 200;
const MIN_ELIGIBLE_CLUSTERS = 50;
const MIN_REVIEW_FRACTION = 0.2;
const MAX_SOURCES = 10_000;
const MAX_PAIRS = 100_000;
const MAX_ARRAY_ENTRIES = 100_000;
const MAX_DATA_NODES = 1_000_000;
const MAX_TOTAL_STRING_CODE_UNITS = 2_000_000;
const MAX_DEPTH = 12;
const MAX_OBJECT_FIELDS = 32;

const ROOT_FIELDS = [
  "corpusContractVersion",
  "createdAt",
  "datasetVersion",
  "pairs",
  "provenanceReview",
  "scope",
  "sources",
  "topicDefinitionVersion",
];
const SOURCE_REQUIRED_FIELDS = [
  "clusterId",
  "factSummary",
  "id",
  "provenance",
  "publishedAt",
  "title",
  "url",
];
const SOURCE_OPTIONAL_FIELDS = ["contentFingerprint", "fingerprintEvidence"];
const PAIR_FIELDS = [
  "adjudication",
  "caseType",
  "id",
  "primaryDecision",
  "secondaryReview",
  "sourceAId",
  "sourceBId",
];
const PRIMARY_DECISION_FIELDS = ["label", "rationale", "reviewedAt", "reviewerId"];
const SECONDARY_DECISION_FIELDS = [
  "label",
  "rationale",
  "reviewedAt",
  "reviewerId",
  "reviewMethod",
];
const ADJUDICATION_FIELDS = SECONDARY_DECISION_FIELDS;
const SOURCE_PROVENANCE_FIELDS = [
  "containsCopiedArticleText",
  "containsPersonalData",
  "kind",
  "origin",
  "repositoryUseApproved",
  "rightsBasis",
];

export class LabeledCorpusError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LabeledCorpusError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new LabeledCorpusError(code, message);
}

function preflightData(value, state, depth, label) {
  if (depth > MAX_DEPTH) {
    fail("RESOURCE_LIMIT", `${label} exceeds the maximum data depth`);
  }
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) {
    fail("RESOURCE_LIMIT", "Corpus exceeds the bounded data-node budget");
  }
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_TOTAL_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", "Corpus exceeds the bounded string budget");
    }
    return;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== "object") {
    fail("INVALID_SCHEMA", `${label} contains unsupported ${typeof value} data`);
  }
  if (state.ancestors.has(value)) {
    fail("INVALID_SCHEMA", `${label} contains cyclic data`);
  }
  state.ancestors.add(value);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ARRAY_ENTRIES) {
      fail("RESOURCE_LIMIT", `${label} is not a bounded ordinary array`);
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
      fail("INVALID_SCHEMA", `${label} must be a dense enumerable data array`);
    }
    for (const key of expectedKeys) {
      preflightData(descriptors[key].value, state, depth + 1, `${label}[${key}]`);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("INVALID_SCHEMA", `${label} must contain plain data objects only`);
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
          descriptors[key].get ||
          descriptors[key].set ||
          !descriptors[key].enumerable,
      )
    ) {
      fail("INVALID_SCHEMA", `${label} must contain enumerable string data fields only`);
    }
    for (const key of keys) {
      state.stringCodeUnits += key.length;
      if (state.stringCodeUnits > MAX_TOTAL_STRING_CODE_UNITS) {
        fail("RESOURCE_LIMIT", "Corpus exceeds the bounded string and field-name budget");
      }
      const boundedKey = key.length <= 64 ? key : `${key.slice(0, 61)}...`;
      preflightData(descriptors[key].value, state, depth + 1, `${label}.${boundedKey}`);
    }
  }
  state.ancestors.delete(value);
}

function summarizeFieldNames(keys) {
  const shown = keys.slice(0, 5).map((key) => {
    if (typeof key !== "string") return `[${typeof key}]`;
    return key.length <= 64 ? key : `${key.slice(0, 61)}...`;
  });
  return `${shown.join(",")}${keys.length > shown.length ? `,+${keys.length - shown.length} more` : ""}`;
}

function assertExactFields(value, required, optional, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_SCHEMA", `${label} must be a plain object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  const unknown = keys.filter((key) => typeof key !== "string" || !allowed.has(key));
  const missing = required.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      "INVALID_SCHEMA",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${summarizeFieldNames(unknown)}]`,
    );
  }
}

function assertBoundedString(value, label, maximum) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) {
    fail("INVALID_SCHEMA", `${label} must be a non-empty string of at most ${maximum} code units`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("INVALID_SCHEMA", `${label} must be a bounded lowercase identifier`);
  }
}

function assertReviewerIdentifier(value, label, code = "INVALID_REVIEW") {
  if (typeof value !== "string" || !REVIEWER_IDENTIFIER.test(value)) {
    fail(code, `${label} must be a canonical lowercase reviewer identifier`);
  }
}

function timestampMilliseconds(value, label) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_SCHEMA", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function assertSortedId(previous, current, label) {
  if (previous !== "" && current <= previous) {
    fail("INVALID_SCHEMA", `${label} must be sorted by unique id`);
  }
}

function normalizeCorpusUrl(value, label) {
  let normalized;
  try {
    normalized = normalizePublicHttpUrl(value);
  } catch (error) {
    fail("INVALID_SCHEMA", `${label} is invalid: ${error.message}`);
  }
  if (normalized !== value) {
    fail("INVALID_SCHEMA", `${label} must already be normalized`);
  }
  return normalized;
}

function isReservedSyntheticHostname(hostname) {
  return (
    hostname.endsWith(".example") ||
    hostname === "example.com" ||
    hostname.endsWith(".example.com") ||
    hostname === "example.net" ||
    hostname.endsWith(".example.net") ||
    hostname === "example.org" ||
    hostname.endsWith(".example.org")
  );
}

function validateProvenance(provenance, sourceUrl, label) {
  assertExactFields(provenance, SOURCE_PROVENANCE_FIELDS, [], label);
  if (!PROVENANCE_KINDS.includes(provenance.kind)) {
    fail("INVALID_PROVENANCE", `${label}.kind is unsupported`);
  }
  if (
    provenance.containsCopiedArticleText !== false ||
    typeof provenance.containsPersonalData !== "boolean" ||
    typeof provenance.repositoryUseApproved !== "boolean"
  ) {
    fail(
      "INVALID_PROVENANCE",
      `${label} must reject copied article text and explicitly declare privacy and repository review`,
    );
  }
  assertBoundedString(provenance.rightsBasis, `${label}.rightsBasis`, 256);

  if (provenance.kind === "project-created-synthetic") {
    if (
      provenance.origin !== null ||
      provenance.rightsBasis !== "project-created" ||
      provenance.containsPersonalData !== false ||
      !isReservedSyntheticHostname(new URL(sourceUrl).hostname)
    ) {
      fail(
        "INVALID_PROVENANCE",
        `${label} synthetic records require reserved example URLs, no origin, no personal data, and project-created rights`,
      );
    }
  } else {
    if (typeof provenance.origin !== "string") {
      fail("INVALID_PROVENANCE", `${label}.origin is required for non-synthetic metadata`);
    }
    normalizeCorpusUrl(provenance.origin, `${label}.origin`);
  }
}

function validateFingerprint(source, label) {
  const hasFingerprint = Object.hasOwn(source, "contentFingerprint");
  const hasEvidence = Object.hasOwn(source, "fingerprintEvidence");
  if (hasFingerprint !== hasEvidence) {
    fail("INVALID_SCHEMA", `${label} fingerprint and evidence must be supplied together`);
  }
  if (!hasFingerprint) return;
  if (typeof source.contentFingerprint !== "string" || !FINGERPRINT.test(source.contentFingerprint)) {
    fail("INVALID_SCHEMA", `${label}.contentFingerprint must be lowercase SHA-256 hex`);
  }
  assertExactFields(source.fingerprintEvidence, ["fixtureId", "kind"], [], `${label}.fingerprintEvidence`);
  assertIdentifier(source.fingerprintEvidence.fixtureId, `${label}.fingerprintEvidence.fixtureId`);
  const permittedKinds = new Set(["reviewed-local-fixture", "synthetic-fixture"]);
  if (!permittedKinds.has(source.fingerprintEvidence.kind)) {
    fail("INVALID_SCHEMA", `${label}.fingerprintEvidence.kind is unsupported`);
  }
  if (
    source.provenance.kind === "project-created-synthetic" &&
    source.fingerprintEvidence.kind !== "synthetic-fixture"
  ) {
    fail("INVALID_PROVENANCE", `${label} synthetic fingerprints require synthetic fixture evidence`);
  }
  if (
    source.provenance.kind !== "project-created-synthetic" &&
    source.fingerprintEvidence.kind === "synthetic-fixture"
  ) {
    fail("INVALID_PROVENANCE", `${label} non-synthetic metadata cannot claim synthetic fixture evidence`);
  }
}

function validateDecision(decision, fields, label, expectedMethod = null) {
  assertExactFields(decision, fields, [], label);
  if (!LABELS.has(decision.label)) {
    fail("INVALID_REVIEW", `${label}.label is invalid`);
  }
  assertReviewerIdentifier(decision.reviewerId, `${label}.reviewerId`);
  assertBoundedString(decision.rationale, `${label}.rationale`, 512);
  const reviewedAt = timestampMilliseconds(decision.reviewedAt, `${label}.reviewedAt`);
  if (expectedMethod !== null && decision.reviewMethod !== expectedMethod) {
    fail("INVALID_REVIEW", `${label}.reviewMethod must be ${expectedMethod}`);
  }
  return reviewedAt;
}

function validateProvenanceReview(review) {
  assertExactFields(review, ["reviewedAt", "reviewerId", "status"], [], "provenanceReview");
  if (!PROVENANCE_REVIEW_STATUSES.has(review.status)) {
    fail("INVALID_PROVENANCE", "provenanceReview.status must be accepted or pending");
  }
  if (review.status === "pending") {
    if (review.reviewedAt !== null || review.reviewerId !== null) {
      fail("INVALID_PROVENANCE", "Pending provenance review must not name a completed review");
    }
  } else {
    assertReviewerIdentifier(
      review.reviewerId,
      "provenanceReview.reviewerId",
      "INVALID_PROVENANCE",
    );
    timestampMilliseconds(review.reviewedAt, "provenanceReview.reviewedAt");
  }
}

function analyzeCorpus(dataset) {
  preflightData(
    dataset,
    { ancestors: new Set(), nodes: 0, stringCodeUnits: 0 },
    0,
    "dataset",
  );
  assertExactFields(dataset, ROOT_FIELDS, [], "dataset");
  if (dataset.corpusContractVersion !== LABELED_CORPUS_CONTRACT_VERSION) {
    fail("VERSION_MISMATCH", `Unsupported corpus contract ${dataset.corpusContractVersion}`);
  }
  assertIdentifier(dataset.datasetVersion, "dataset.datasetVersion");
  assertIdentifier(dataset.topicDefinitionVersion, "dataset.topicDefinitionVersion");
  timestampMilliseconds(dataset.createdAt, "dataset.createdAt");
  validateProvenanceReview(dataset.provenanceReview);

  assertExactFields(
    dataset.scope,
    ["contentClass", "language", "topicDefinition"],
    [],
    "dataset.scope",
  );
  if (dataset.scope.contentClass !== "editorial-article" || dataset.scope.language !== "en") {
    fail("INVALID_SCOPE", "Corpus scope must be English editorial articles");
  }
  assertBoundedString(dataset.scope.topicDefinition, "dataset.scope.topicDefinition", 512);

  if (
    !Array.isArray(dataset.sources) ||
    dataset.sources.length < 2 ||
    dataset.sources.length > MAX_SOURCES
  ) {
    fail("RESOURCE_LIMIT", `dataset.sources must contain between 2 and ${MAX_SOURCES} entries`);
  }
  if (
    !Array.isArray(dataset.pairs) ||
    dataset.pairs.length < 1 ||
    dataset.pairs.length > MAX_PAIRS
  ) {
    fail("RESOURCE_LIMIT", `dataset.pairs must contain between 1 and ${MAX_PAIRS} entries`);
  }

  const sourceById = new Map();
  const provenanceKindCounts = new Map(PROVENANCE_KINDS.map((kind) => [kind, 0]));
  const pendingSourceApprovals = [];
  const personalDataSourceIds = [];
  let previousSourceId = "";
  for (const [index, source] of dataset.sources.entries()) {
    const label = `sources[${index}]`;
    assertExactFields(source, SOURCE_REQUIRED_FIELDS, SOURCE_OPTIONAL_FIELDS, label);
    assertIdentifier(source.id, `${label}.id`);
    assertSortedId(previousSourceId, source.id, "dataset.sources");
    assertIdentifier(source.clusterId, `${label}.clusterId`);
    assertBoundedString(source.title, `${label}.title`, 256);
    assertBoundedString(source.factSummary, `${label}.factSummary`, 512);
    timestampMilliseconds(source.publishedAt, `${label}.publishedAt`);
    const normalizedUrl = normalizeCorpusUrl(source.url, `${label}.url`);
    validateProvenance(source.provenance, normalizedUrl, `${label}.provenance`);
    validateFingerprint(source, label);
    provenanceKindCounts.set(
      source.provenance.kind,
      provenanceKindCounts.get(source.provenance.kind) + 1,
    );
    if (!source.provenance.repositoryUseApproved) pendingSourceApprovals.push(source.id);
    if (source.provenance.containsPersonalData) personalDataSourceIds.push(source.id);
    sourceById.set(source.id, source);
    previousSourceId = source.id;
  }

  const eligiblePairs = [];
  const disagreements = [];
  const unresolvedPairIds = [];
  const usedSourceIds = new Set();
  const eligibleSourceIds = new Set();
  const eligibleClusterIds = new Set();
  const caseCounts = new Map(REQUIRED_CORPUS_CASE_TYPES.map((caseType) => [caseType, 0]));
  let independentlyReviewedEligiblePairs = 0;
  let adjudicatedDisagreements = 0;
  let previousPairId = "";
  const unorderedPairs = new Set();

  for (const [index, pair] of dataset.pairs.entries()) {
    const label = `pairs[${index}]`;
    assertExactFields(pair, PAIR_FIELDS, [], label);
    assertIdentifier(pair.id, `${label}.id`);
    assertSortedId(previousPairId, pair.id, "dataset.pairs");
    if (!Object.hasOwn(CASE_LABELS, pair.caseType)) {
      fail("INVALID_SCHEMA", `${label}.caseType is unsupported`);
    }
    assertIdentifier(pair.sourceAId, `${label}.sourceAId`);
    assertIdentifier(pair.sourceBId, `${label}.sourceBId`);
    if (pair.sourceAId >= pair.sourceBId) {
      fail("INVALID_SCHEMA", `${label} source ids must be distinct and lexically ordered`);
    }
    const sourceA = sourceById.get(pair.sourceAId);
    const sourceB = sourceById.get(pair.sourceBId);
    if (!sourceA || !sourceB) {
      fail("INVALID_SCHEMA", `${label} references an unknown source`);
    }
    const pairKey = `${pair.sourceAId}\n${pair.sourceBId}`;
    if (unorderedPairs.has(pairKey)) {
      fail("DUPLICATE_RECORD", `${label} duplicates an unordered source pair`);
    }
    unorderedPairs.add(pairKey);
    usedSourceIds.add(pair.sourceAId);
    usedSourceIds.add(pair.sourceBId);

    const primaryAt = validateDecision(
      pair.primaryDecision,
      PRIMARY_DECISION_FIELDS,
      `${label}.primaryDecision`,
    );
    let finalLabel = pair.primaryDecision.label;
    let independentlyReviewed = false;
    let resolutionMethod = "primary-only";

    if (pair.secondaryReview === null) {
      if (pair.adjudication !== null) {
        fail("INVALID_REVIEW", `${label} cannot be adjudicated without a secondary review`);
      }
    } else {
      const secondaryAt = validateDecision(
        pair.secondaryReview,
        SECONDARY_DECISION_FIELDS,
        `${label}.secondaryReview`,
        "blinded-source-metadata",
      );
      if (
        pair.secondaryReview.reviewerId === pair.primaryDecision.reviewerId ||
        secondaryAt < primaryAt
      ) {
        fail("INVALID_REVIEW", `${label} secondary review must be independent and chronological`);
      }
      independentlyReviewed = true;
      if (pair.secondaryReview.label === pair.primaryDecision.label) {
        resolutionMethod = "independent-review-agreement";
        if (pair.adjudication !== null) {
          fail("INVALID_REVIEW", `${label} must not adjudicate an agreeing review`);
        }
      } else {
        let adjudicationLabel = null;
        if (pair.adjudication === null) {
          finalLabel = null;
          unresolvedPairIds.push(pair.id);
        } else {
          const adjudicatedAt = validateDecision(
            pair.adjudication,
            ADJUDICATION_FIELDS,
            `${label}.adjudication`,
            "independent-adjudication",
          );
          if (
            pair.adjudication.reviewerId === pair.primaryDecision.reviewerId ||
            pair.adjudication.reviewerId === pair.secondaryReview.reviewerId ||
            adjudicatedAt < secondaryAt
          ) {
            fail("INVALID_REVIEW", `${label} adjudication must be independent and chronological`);
          }
          finalLabel = pair.adjudication.label;
          resolutionMethod = "independent-adjudication";
          adjudicationLabel = finalLabel;
          adjudicatedDisagreements += 1;
        }
        disagreements.push({
          adjudicationLabel,
          pairId: pair.id,
          primaryLabel: pair.primaryDecision.label,
          secondaryLabel: pair.secondaryReview.label,
        });
      }
    }

    if (finalLabel !== null) {
      const sameCluster = sourceA.clusterId === sourceB.clusterId;
      if ((finalLabel === "same-topic") !== sameCluster) {
        fail("GOLD_CLUSTER_MISMATCH", `${label} final label contradicts endpoint gold clusters`);
      }
      const expectedLabel = CASE_LABELS[pair.caseType];
      if (expectedLabel !== null && finalLabel !== expectedLabel) {
        fail("INVALID_CASE_LABEL", `${label} final label contradicts its case type`);
      }
      eligiblePairs.push({ pair, finalLabel, resolutionMethod });
      caseCounts.set(pair.caseType, caseCounts.get(pair.caseType) + 1);
      eligibleSourceIds.add(pair.sourceAId);
      eligibleSourceIds.add(pair.sourceBId);
      eligibleClusterIds.add(sourceA.clusterId);
      eligibleClusterIds.add(sourceB.clusterId);
      if (independentlyReviewed) independentlyReviewedEligiblePairs += 1;
    }
    previousPairId = pair.id;
  }

  const unusedSourceIds = [...sourceById.keys()].filter((id) => !usedSourceIds.has(id));
  if (unusedSourceIds.length > 0) {
    fail(
      "INVALID_SCHEMA",
      `Every source must appear in a pair; unused=[${summarizeFieldNames(unusedSourceIds)}]`,
    );
  }

  const corpusDigest = canonicalJsonSha256(dataset);
  const evaluationDataset = {
    corpusContractVersion: LABELED_CORPUS_CONTRACT_VERSION,
    datasetVersion: dataset.datasetVersion,
    pairs: eligiblePairs.map(({ pair, finalLabel, resolutionMethod }) => ({
      caseType: pair.caseType,
      id: pair.id,
      resolvedGoldDecision: { label: finalLabel, resolutionMethod },
      sourceAId: pair.sourceAId,
      sourceBId: pair.sourceBId,
    })),
    projectionVersion: RESOLVED_EVALUATION_DATASET_VERSION,
    sourceCorpusDigest: corpusDigest,
    sources: dataset.sources
      .filter((source) => eligibleSourceIds.has(source.id))
      .map((source) => ({
        clusterId: source.clusterId,
        ...(Object.hasOwn(source, "contentFingerprint")
          ? { contentFingerprint: source.contentFingerprint }
          : {}),
        id: source.id,
        url: source.url,
      })),
    topicDefinitionVersion: dataset.topicDefinitionVersion,
  };

  const eligiblePairCount = eligiblePairs.length;
  const requiredReviews = Math.ceil(eligiblePairCount * MIN_REVIEW_FRACTION);
  const missingCaseTypes = REQUIRED_CORPUS_CASE_TYPES.filter(
    (caseType) => caseCounts.get(caseType) === 0,
  );
  const readinessReasons = [];
  if (eligiblePairCount < MIN_ELIGIBLE_PAIRS) {
    readinessReasons.push(`eligible pairs ${eligiblePairCount} < ${MIN_ELIGIBLE_PAIRS}`);
  }
  if (eligibleClusterIds.size < MIN_ELIGIBLE_CLUSTERS) {
    readinessReasons.push(
      `eligible gold clusters ${eligibleClusterIds.size} < ${MIN_ELIGIBLE_CLUSTERS}`,
    );
  }
  if (independentlyReviewedEligiblePairs < requiredReviews) {
    readinessReasons.push(
      `independently reviewed eligible pairs ${independentlyReviewedEligiblePairs} < ${requiredReviews}`,
    );
  }
  if (missingCaseTypes.length > 0) {
    readinessReasons.push(`missing eligible case types [${missingCaseTypes.join(",")}]`);
  }

  const report = {
    contractVersion: LABELED_CORPUS_CONTRACT_VERSION,
    corpusDigest,
    corpusDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    datasetVersion: dataset.datasetVersion,
    evaluationDatasetDigest: canonicalJsonSha256(evaluationDataset),
    evaluationDatasetDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    evaluationDatasetVersion: RESOLVED_EVALUATION_DATASET_VERSION,
    provenance: {
      declarationsOnly: true,
      declaredReviewStatus: dataset.provenanceReview.status,
      externalTrustReviewRequired: true,
      kindCounts: Object.fromEntries(provenanceKindCounts),
      pendingRepositoryUseApprovalSourceIds: pendingSourceApprovals,
      sourceIdsDeclaringPersonalData: personalDataSourceIds,
    },
    readiness: {
      minimumEligibleClusters: MIN_ELIGIBLE_CLUSTERS,
      minimumEligiblePairs: MIN_ELIGIBLE_PAIRS,
      structurallyReadyForSplitFreeze: readinessReasons.length === 0,
      reasons: readinessReasons,
      requiredCaseTypes: REQUIRED_CORPUS_CASE_TYPES,
    },
    review: {
      adjudicatedDisagreements,
      disagreements,
      independentlyReviewedEligiblePairs,
      requiredReviews,
      reviewCoverage:
        eligiblePairCount === 0 ? 0 : independentlyReviewedEligiblePairs / eligiblePairCount,
      unresolvedPairIds,
    },
    sample: {
      caseCounts: Object.fromEntries(caseCounts),
      eligibleClusters: eligibleClusterIds.size,
      eligiblePairs: eligiblePairCount,
      eligibleSources: eligibleSourceIds.size,
      excludedUnresolvedPairs: unresolvedPairIds.length,
      totalPairs: dataset.pairs.length,
      totalSources: dataset.sources.length,
    },
    scope: {
      gateEligible: false,
      reason:
        "Schema readiness is not held-out quality, provenance acceptance, or a frozen evaluation policy",
    },
    topicDefinitionVersion: dataset.topicDefinitionVersion,
  };

  return { evaluationDataset, report };
}

export function validateLabeledCorpus(dataset) {
  return analyzeCorpus(dataset).report;
}

export function createResolvedEvaluationDataset(dataset) {
  return analyzeCorpus(dataset).evaluationDataset;
}

export function prepareLabeledCorpusEvaluation(dataset) {
  return analyzeCorpus(dataset);
}
