import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "../evaluation/canonical-json.js";
import { normalizePublicHttpUrl } from "../src/url.js";
import {
  REVIEW_CASE_TYPES,
  ReviewWorkflowError,
  validateReviewTaskEnvelope,
} from "./review-workflow.js";

export const ACQUISITION_PLAN_CONTRACT_VERSION =
  "story-acquisition-plan/1.0.0";
export const PROVENANCE_INVENTORY_CONTRACT_VERSION =
  "story-source-provenance-inventory/1.0.0";
export const REVIEW_COMPLETION_TASK_CONTRACT_VERSION =
  "story-review-completion-task/1.0.0";
export const COVERAGE_PRIORITY_METHOD =
  "domain-separated-canonical-json-sha256-rank/1.0.0";

const COVERAGE_TARGET_FRACTION_MICROS = 300_000;
const MINIMUM_ELIGIBLE_FRACTION_MICROS = 200_000;
const GENERATED_IDENTITY_KIND = "synthetic-fixture-role";
const GENERATED_IDENTITY_BASIS = "caller-declared";
const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const REVIEWER_IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_ARRAY_ENTRIES = 100_000;
const MAX_DATA_NODES = 1_000_000;
const MAX_DEPTH = 16;
const MAX_OBJECT_FIELDS = 32;
const MAX_STRING_CODE_UNITS = 2_000_000;
const CASE_TYPE_SET = new Set(REVIEW_CASE_TYPES);
const POSITIVE_CONSTRUCTION_CASE_TYPES = new Set([
  "duplicate-positive",
  "syndication-positive",
]);
const RETAINED_FIELDS = Object.freeze([
  "factSummary",
  "publishedAt",
  "title",
  "url",
]);
const SYNTHETIC_EVIDENCE_VERSION =
  "project-created-metadata-evidence/1.0.0";
const SYNTHETIC_TRANSFORMATION =
  "project-created-synthetic-metadata/1.0.0";
const EVIDENCE_ASSURANCE =
  "caller-declared-project-created-not-externally-verified";
const FIXTURE_MANIFEST_ASSURANCE =
  "caller-declared-binding-not-runtime-file-verification";
const PROVENANCE_DISPOSITIONS = new Set(["accepted", "pending", "rejected"]);

const ACQUISITION_INPUT_FIELDS = [
  "coverageNonce",
  "createdAt",
  "decisionReference",
  "ownerAcceptedAt",
  "pairAssignments",
  "planId",
  "reviewers",
  "scopeDecisionDigest",
  "sourceAssignments",
  "trustAcceptedAt",
];
const ACQUISITION_PLAN_FIELDS = [
  "acquisitionPlanContractVersion",
  "coverage",
  "createdAt",
  "decision",
  "planId",
  "reviewers",
  "scope",
  "sourceAssignments",
  "pairAssignments",
  "targets",
];
const ACQUISITION_ENVELOPE_FIELDS = [
  "acquisitionPlan",
  "acquisitionPlanDigest",
  "digestAlgorithm",
];
const REVIEWERS_FIELDS = ["adjudicator", "primary", "provenance", "secondary"];
const REVIEWER_FIELDS = ["id", "identityBasis", "identityKind"];
const SOURCE_ASSIGNMENT_FIELDS = ["sourceId", "stratumId"];
const PAIR_ASSIGNMENT_FIELDS = [
  "caseType",
  "id",
  "positiveConstructionCandidate",
  "sourceAId",
  "sourceBId",
];
const COVERAGE_FIELDS = [
  "coverageTargetFractionMicros",
  "minimumEligibleFractionMicros",
  "nonce",
  "priorityMethod",
];
const DECISION_FIELDS = [
  "ownerAcceptedAt",
  "ownerReviewer",
  "reference",
  "scopeDigest",
  "status",
  "trustAcceptedAt",
  "trustReviewer",
];
const TARGET_FIELDS = [
  "acquisitionStrata",
  "caseCounts",
  "pairCandidates",
  "positiveConstructionPairs",
  "positiveConstructionStrata",
  "sourceCandidates",
];
const GENERATED_SCOPE_FIELDS = [
  "contentClass",
  "fixtureOnly",
  "gateEligible",
  "independentHumanReviewVerified",
  "language",
  "realMetadataAuthorized",
];
const INVENTORY_INPUT_FIELDS = [
  "createdAt",
  "fixtureManifestDigest",
  "fixtureManifestVersion",
  "inventoryId",
  "sources",
];
const INVENTORY_SOURCE_INPUT_FIELDS = [
  "declarations",
  "disposition",
  "evidenceCapturedAt",
  "rationale",
  "reviewedAt",
  "source",
];
const INVENTORY_FIELDS = [
  "acquisitionPlanDigest",
  "createdAt",
  "fixtureManifestBinding",
  "inventoryContractVersion",
  "inventoryId",
  "scope",
  "sources",
];
const INVENTORY_ENVELOPE_FIELDS = [
  "digestAlgorithm",
  "provenanceInventory",
  "provenanceInventoryDigest",
];
const INVENTORY_SOURCE_FIELDS = [
  "declarations",
  "disposition",
  "evidence",
  "metadataOriginUrl",
  "provenanceKind",
  "rationale",
  "retainedFields",
  "review",
  "rightsBasis",
  "rightsEvidenceUrl",
  "sourceId",
  "sourceProjection",
  "sourceProjectionDigest",
  "transformation",
  "url",
];
const DECLARATION_FIELDS = [
  "containsCopiedArticleText",
  "containsPersonalData",
  "minimumDataNecessary",
  "repositoryUseApproved",
];
const EVIDENCE_FIELDS = [
  "assurance",
  "capturedAt",
  "declarationRecordDigest",
  "version",
];
const REVIEW_FIELDS = ["reviewedAt", "reviewer"];
const FIXTURE_MANIFEST_FIELDS = ["assurance", "digest", "manifestVersion"];
const SOURCE_PROJECTION_FIELDS = [
  "factSummary",
  "id",
  "provenance",
  "publishedAt",
  "title",
  "url",
];
const SOURCE_PROVENANCE_FIELDS = [
  "containsCopiedArticleText",
  "containsPersonalData",
  "kind",
  "origin",
  "repositoryUseApproved",
  "rightsBasis",
];
const COMPLETION_TASK_FIELDS = [
  "bindings",
  "completionTaskContractVersion",
  "coveragePlan",
  "createdAt",
  "primaryTaskEnvelope",
  "reviewers",
  "scope",
  "selection",
  "taskId",
];
const COMPLETION_BINDING_FIELDS = [
  "acquisitionPlanDigest",
  "primaryTaskDigest",
  "provenanceInventoryDigest",
];
const COMPLETION_COVERAGE_FIELDS = [
  "coverageTargetFractionMicros",
  "initialCoveragePairIds",
  "minimumEligibleFractionMicros",
  "nonce",
  "priorityMethod",
  "priorityPairIds",
  "reservePairIds",
];
const COMPLETION_SCOPE_FIELDS = [
  "adjudicationComplete",
  "corpusMaterialized",
  "evaluationPerformed",
  "fixtureOnly",
  "gateEligible",
  "heldOut",
  "independentHumanReviewVerified",
  "ownerCheckpointReached",
  "primaryReviewComplete",
  "realMetadataAuthorized",
  "secondaryReviewComplete",
  "splitFrozen",
];
const COMPLETION_SELECTION_FIELDS = [
  "acceptedSourceIds",
  "excludedPairs",
  "excludedSources",
  "taskPairIds",
  "taskSourceIds",
];
const EXCLUDED_SOURCE_FIELDS = ["disposition", "reason", "sourceId"];
const EXCLUDED_PAIR_FIELDS = ["pairId", "reason"];
const COMPLETION_ENVELOPE_FIELDS = [
  "completionTask",
  "completionTaskDigest",
  "digestAlgorithm",
];

export class ReviewCompletionTaskError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReviewCompletionTaskError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReviewCompletionTaskError(code, message);
}

function preflightData(value, state, depth, label) {
  if (depth > MAX_DEPTH) fail("RESOURCE_LIMIT", `${label} exceeds the maximum data depth`);
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) {
    fail("RESOURCE_LIMIT", "Completion-task data exceeds the bounded node budget");
  }
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", "Completion-task data exceeds the bounded string budget");
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
  if (state.ancestors.has(value)) fail("INVALID_SCHEMA", `${label} contains cyclic data`);
  state.ancestors.add(value);

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ARRAY_ENTRIES) {
      fail("RESOURCE_LIMIT", `${label} is not a bounded ordinary array`);
    }
    const entryKeys = keys.filter((key) => key !== "length");
    const expected = Array.from({ length: value.length }, (_, index) => String(index));
    if (
      entryKeys.length !== expected.length ||
      entryKeys.some(
        (key, index) =>
          key !== expected[index] ||
          descriptors[key].get ||
          descriptors[key].set ||
          !descriptors[key].enumerable,
      )
    ) {
      fail("INVALID_SCHEMA", `${label} must be a dense enumerable data array`);
    }
    for (const key of expected) {
      preflightData(descriptors[key].value, state, depth + 1, `${label}[${key}]`);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("INVALID_SCHEMA", `${label} must contain plain data objects only`);
    }
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
      if (state.stringCodeUnits > MAX_STRING_CODE_UNITS) {
        fail("RESOURCE_LIMIT", "Completion-task data exceeds the bounded string budget");
      }
      preflightData(descriptors[key].value, state, depth + 1, `${label}.${key}`);
    }
  }
  state.ancestors.delete(value);
}

function preflight(value, label) {
  preflightData(
    value,
    { ancestors: new Set(), nodes: 0, stringCodeUnits: 0 },
    0,
    label,
  );
}

function summarizeKeys(keys) {
  const shown = keys.slice(0, 5).map((key) =>
    typeof key === "string" ? key.slice(0, 64) : `[${typeof key}]`,
  );
  return `${shown.join(",")}${keys.length > shown.length ? `,+${keys.length - shown.length} more` : ""}`;
}

function assertExactFields(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_SCHEMA", `${label} must be a plain object`);
  }
  const allowed = new Set(fields);
  const keys = Reflect.ownKeys(value);
  const unknown = keys.filter((key) => typeof key !== "string" || !allowed.has(key));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      "INVALID_SCHEMA",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${summarizeKeys(unknown)}]`,
    );
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("INVALID_SCHEMA", `${label} must be a bounded lowercase identifier`);
  }
}

function assertReviewerIdentifier(value, label) {
  if (typeof value !== "string" || !REVIEWER_IDENTIFIER.test(value)) {
    fail("INVALID_REVIEWERS", `${label} must be a canonical reviewer identifier`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("INVALID_SCHEMA", `${label} must be a lowercase SHA-256 digest`);
  }
}

function assertBoundedString(value, label, maximum) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) {
    fail("INVALID_SCHEMA", `${label} must be a non-empty string of at most ${maximum} code units`);
  }
}

function timestampMilliseconds(value, label) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_TIMESTAMP", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortableStringField(value, field) {
  return value !== null && typeof value === "object" && typeof value[field] === "string"
    ? value[field]
    : "";
}

function assertSortedUnique(values, key, label) {
  let previous = null;
  for (const [index, value] of values.entries()) {
    const current = value[key];
    if (previous !== null && current <= previous) {
      fail("INVALID_SCHEMA", `${label}[${index}] must be sorted by unique ${key}`);
    }
    previous = current;
  }
}

function generatedScope() {
  return {
    contentClass: "editorial-article",
    fixtureOnly: true,
    gateEligible: false,
    independentHumanReviewVerified: false,
    language: "en",
    realMetadataAuthorized: false,
  };
}

function validateGeneratedScope(scope, label) {
  assertExactFields(scope, GENERATED_SCOPE_FIELDS, label);
  if (canonicalJsonSha256(scope) !== canonicalJsonSha256(generatedScope())) {
    fail("INVALID_SCOPE", `${label} must remain generated-fixture-only and gate-ineligible`);
  }
}

function validateReviewer(reviewer, label) {
  assertExactFields(reviewer, REVIEWER_FIELDS, label);
  assertReviewerIdentifier(reviewer.id, `${label}.id`);
  if (
    reviewer.identityKind !== GENERATED_IDENTITY_KIND ||
    reviewer.identityBasis !== GENERATED_IDENTITY_BASIS
  ) {
    fail(
      "INVALID_REVIEWERS",
      `${label} must be a caller-declared synthetic fixture role in this increment`,
    );
  }
}

function validateReviewers(reviewers) {
  assertExactFields(reviewers, REVIEWERS_FIELDS, "reviewers");
  for (const role of REVIEWERS_FIELDS) validateReviewer(reviewers[role], `reviewers.${role}`);
  if (new Set(REVIEWERS_FIELDS.map((role) => reviewers[role].id)).size !== REVIEWERS_FIELDS.length) {
    fail("INVALID_REVIEWERS", "All generated reviewer role identifiers must be distinct");
  }
}

function expectedCaseCounts(pairAssignments) {
  const counts = new Map(REVIEW_CASE_TYPES.map((caseType) => [caseType, 0]));
  for (const pair of pairAssignments) {
    const caseType = sortableStringField(pair, "caseType");
    if (counts.has(caseType)) counts.set(caseType, counts.get(caseType) + 1);
  }
  return Object.fromEntries(REVIEW_CASE_TYPES.map((caseType) => [caseType, counts.get(caseType)]));
}

function validateCaseCounts(caseCounts, expected) {
  assertExactFields(caseCounts, REVIEW_CASE_TYPES, "acquisitionPlan.targets.caseCounts");
  for (const caseType of REVIEW_CASE_TYPES) {
    if (!Number.isSafeInteger(caseCounts[caseType]) || caseCounts[caseType] < 0) {
      fail("INVALID_TARGETS", `case count for ${caseType} must be a non-negative integer`);
    }
    if (caseCounts[caseType] !== expected[caseType]) {
      fail("INVALID_TARGETS", `case count for ${caseType} does not match pair assignments`);
    }
  }
}

function derivePlanTargets(sourceAssignments, pairAssignments, sourceToStratum) {
  const positiveStrata = new Set();
  let positiveConstructionPairs = 0;
  for (const pair of pairAssignments) {
    if (
      pair === null ||
      typeof pair !== "object" ||
      pair.positiveConstructionCandidate !== true
    ) {
      continue;
    }
    positiveConstructionPairs += 1;
    positiveStrata.add(sourceToStratum.get(pair.sourceAId));
  }
  return {
    acquisitionStrata: new Set(
      sourceAssignments.map((source) => sortableStringField(source, "stratumId")),
    ).size,
    caseCounts: expectedCaseCounts(pairAssignments),
    pairCandidates: pairAssignments.length,
    positiveConstructionPairs,
    positiveConstructionStrata: positiveStrata.size,
    sourceCandidates: sourceAssignments.length,
  };
}

function validatePlanPayload(plan) {
  assertExactFields(plan, ACQUISITION_PLAN_FIELDS, "acquisitionPlan");
  if (plan.acquisitionPlanContractVersion !== ACQUISITION_PLAN_CONTRACT_VERSION) {
    fail("VERSION_MISMATCH", "Unsupported acquisition-plan contract version");
  }
  assertIdentifier(plan.planId, "acquisitionPlan.planId");
  const planCreatedAt = timestampMilliseconds(plan.createdAt, "acquisitionPlan.createdAt");
  assertExactFields(plan.decision, DECISION_FIELDS, "acquisitionPlan.decision");
  assertIdentifier(plan.decision.reference, "acquisitionPlan.decision.reference");
  assertDigest(plan.decision.scopeDigest, "acquisitionPlan.decision.scopeDigest");
  if (plan.decision.status !== "accepted-generated-fixture-preflight-only") {
    fail("INVALID_SCOPE", "Acquisition decision must authorize generated-fixture preflight only");
  }
  validateReviewers(plan.reviewers);
  validateReviewer(plan.decision.ownerReviewer, "acquisitionPlan.decision.ownerReviewer");
  validateReviewer(plan.decision.trustReviewer, "acquisitionPlan.decision.trustReviewer");
  if (
    canonicalJsonSha256(plan.decision.ownerReviewer) !==
      canonicalJsonSha256(plan.reviewers.primary) ||
    canonicalJsonSha256(plan.decision.trustReviewer) !==
      canonicalJsonSha256(plan.reviewers.provenance)
  ) {
    fail("INVALID_REVIEWERS", "Acquisition decision actors must match the committed owner and provenance roles");
  }
  const ownerAcceptedAt = timestampMilliseconds(
    plan.decision.ownerAcceptedAt,
    "acquisitionPlan.decision.ownerAcceptedAt",
  );
  const trustAcceptedAt = timestampMilliseconds(
    plan.decision.trustAcceptedAt,
    "acquisitionPlan.decision.trustAcceptedAt",
  );
  if (ownerAcceptedAt > planCreatedAt || trustAcceptedAt > planCreatedAt) {
    fail("INVALID_TIMESTAMP", "Owner and Trust decisions cannot postdate the acquisition plan");
  }
  validateGeneratedScope(plan.scope, "acquisitionPlan.scope");

  if (
    !Array.isArray(plan.sourceAssignments) ||
    plan.sourceAssignments.length < 2 ||
    plan.sourceAssignments.length > MAX_ARRAY_ENTRIES
  ) {
    fail("RESOURCE_LIMIT", "sourceAssignments must contain a bounded non-trivial inventory");
  }
  if (
    !Array.isArray(plan.pairAssignments) ||
    plan.pairAssignments.length < 1 ||
    plan.pairAssignments.length > MAX_ARRAY_ENTRIES
  ) {
    fail("RESOURCE_LIMIT", "pairAssignments must contain a bounded inventory");
  }

  const sourceToStratum = new Map();
  for (const [index, source] of plan.sourceAssignments.entries()) {
    const label = `acquisitionPlan.sourceAssignments[${index}]`;
    assertExactFields(source, SOURCE_ASSIGNMENT_FIELDS, label);
    assertIdentifier(source.sourceId, `${label}.sourceId`);
    assertIdentifier(source.stratumId, `${label}.stratumId`);
    if (sourceToStratum.has(source.sourceId)) fail("DUPLICATE_ID", `Duplicate ${source.sourceId}`);
    sourceToStratum.set(source.sourceId, source.stratumId);
  }
  assertSortedUnique(plan.sourceAssignments, "sourceId", "acquisitionPlan.sourceAssignments");

  const pairIds = new Set();
  const endpointKeys = new Set();
  for (const [index, pair] of plan.pairAssignments.entries()) {
    const label = `acquisitionPlan.pairAssignments[${index}]`;
    assertExactFields(pair, PAIR_ASSIGNMENT_FIELDS, label);
    assertIdentifier(pair.id, `${label}.id`);
    assertIdentifier(pair.sourceAId, `${label}.sourceAId`);
    assertIdentifier(pair.sourceBId, `${label}.sourceBId`);
    if (!CASE_TYPE_SET.has(pair.caseType)) fail("INVALID_PAIR", `${label}.caseType is unsupported`);
    if (typeof pair.positiveConstructionCandidate !== "boolean") {
      fail("INVALID_PAIR", `${label}.positiveConstructionCandidate must be boolean`);
    }
    if (pair.sourceAId >= pair.sourceBId) {
      fail("INVALID_PAIR", `${label} endpoints must be distinct and lexically ordered`);
    }
    if (!sourceToStratum.has(pair.sourceAId) || !sourceToStratum.has(pair.sourceBId)) {
      fail("INVALID_PAIR", `${label} references a Source outside the plan`);
    }
    const expectedPositive = POSITIVE_CONSTRUCTION_CASE_TYPES.has(pair.caseType);
    if (pair.positiveConstructionCandidate !== expectedPositive) {
      fail("INVALID_PAIR", `${label} positive-construction flag contradicts its case quota`);
    }
    if (
      expectedPositive &&
      sourceToStratum.get(pair.sourceAId) !== sourceToStratum.get(pair.sourceBId)
    ) {
      fail("INVALID_PAIR", `${label} positive construction endpoints must share a planning stratum`);
    }
    if (pairIds.has(pair.id)) fail("DUPLICATE_ID", `Duplicate ${pair.id}`);
    pairIds.add(pair.id);
    const endpointKey = `${pair.sourceAId}\u0000${pair.sourceBId}`;
    if (endpointKeys.has(endpointKey)) fail("DUPLICATE_PAIR", `${label} repeats a Source pair`);
    endpointKeys.add(endpointKey);
  }
  assertSortedUnique(plan.pairAssignments, "id", "acquisitionPlan.pairAssignments");

  const usedSourceIds = new Set(
    plan.pairAssignments.flatMap(({ sourceAId, sourceBId }) => [sourceAId, sourceBId]),
  );
  if (usedSourceIds.size !== sourceToStratum.size) {
    fail("UNUSED_SOURCE", "Every acquisition-plan Source must appear in at least one pair");
  }

  assertExactFields(plan.coverage, COVERAGE_FIELDS, "acquisitionPlan.coverage");
  assertIdentifier(plan.coverage.nonce, "acquisitionPlan.coverage.nonce");
  if (
    plan.coverage.priorityMethod !== COVERAGE_PRIORITY_METHOD ||
    plan.coverage.coverageTargetFractionMicros !== COVERAGE_TARGET_FRACTION_MICROS ||
    plan.coverage.minimumEligibleFractionMicros !== MINIMUM_ELIGIBLE_FRACTION_MICROS
  ) {
    fail("INVALID_COVERAGE_PLAN", "Acquisition coverage policy does not match P1.2b-1");
  }

  assertExactFields(plan.targets, TARGET_FIELDS, "acquisitionPlan.targets");
  const expectedTargets = derivePlanTargets(
    plan.sourceAssignments,
    plan.pairAssignments,
    sourceToStratum,
  );
  validateCaseCounts(plan.targets.caseCounts, expectedTargets.caseCounts);
  for (const field of TARGET_FIELDS.filter((candidate) => candidate !== "caseCounts")) {
    if (!Number.isSafeInteger(plan.targets[field]) || plan.targets[field] < 0) {
      fail("INVALID_TARGETS", `acquisitionPlan.targets.${field} must be a non-negative integer`);
    }
    if (plan.targets[field] !== expectedTargets[field]) {
      fail("INVALID_TARGETS", `acquisitionPlan.targets.${field} does not match assignments`);
    }
  }
  return { pairIds, sourceToStratum };
}

function acquisitionPlanFromInput(input) {
  preflight(input, "acquisitionPlanInput");
  assertExactFields(input, ACQUISITION_INPUT_FIELDS, "acquisitionPlanInput");
  assertIdentifier(input.planId, "acquisitionPlanInput.planId");
  timestampMilliseconds(input.createdAt, "acquisitionPlanInput.createdAt");
  assertIdentifier(input.decisionReference, "acquisitionPlanInput.decisionReference");
  assertDigest(input.scopeDecisionDigest, "acquisitionPlanInput.scopeDecisionDigest");
  assertIdentifier(input.coverageNonce, "acquisitionPlanInput.coverageNonce");
  timestampMilliseconds(input.ownerAcceptedAt, "acquisitionPlanInput.ownerAcceptedAt");
  timestampMilliseconds(input.trustAcceptedAt, "acquisitionPlanInput.trustAcceptedAt");
  validateReviewers(input.reviewers);
  if (!Array.isArray(input.sourceAssignments) || !Array.isArray(input.pairAssignments)) {
    fail("INVALID_SCHEMA", "Acquisition assignments must be arrays");
  }
  const sourceAssignments = structuredClone(input.sourceAssignments).sort((left, right) =>
    compareStrings(
      sortableStringField(left, "sourceId"),
      sortableStringField(right, "sourceId"),
    ),
  );
  const pairAssignments = structuredClone(input.pairAssignments).sort((left, right) =>
    compareStrings(sortableStringField(left, "id"), sortableStringField(right, "id")),
  );
  const sourceToStratum = new Map();
  for (const source of sourceAssignments) {
    sourceToStratum.set(
      sortableStringField(source, "sourceId"),
      sortableStringField(source, "stratumId"),
    );
  }
  const plan = {
    acquisitionPlanContractVersion: ACQUISITION_PLAN_CONTRACT_VERSION,
    coverage: {
      coverageTargetFractionMicros: COVERAGE_TARGET_FRACTION_MICROS,
      minimumEligibleFractionMicros: MINIMUM_ELIGIBLE_FRACTION_MICROS,
      nonce: input.coverageNonce,
      priorityMethod: COVERAGE_PRIORITY_METHOD,
    },
    createdAt: input.createdAt,
    decision: {
      ownerAcceptedAt: input.ownerAcceptedAt,
      ownerReviewer: structuredClone(input.reviewers.primary),
      reference: input.decisionReference,
      scopeDigest: input.scopeDecisionDigest,
      status: "accepted-generated-fixture-preflight-only",
      trustAcceptedAt: input.trustAcceptedAt,
      trustReviewer: structuredClone(input.reviewers.provenance),
    },
    pairAssignments,
    planId: input.planId,
    reviewers: structuredClone(input.reviewers),
    scope: generatedScope(),
    sourceAssignments,
    targets: derivePlanTargets(sourceAssignments, pairAssignments, sourceToStratum),
  };
  validatePlanPayload(plan);
  return plan;
}

export function prepareAcquisitionPlanEnvelope(input) {
  const acquisitionPlan = acquisitionPlanFromInput(input);
  return {
    acquisitionPlan,
    acquisitionPlanDigest: canonicalJsonSha256(acquisitionPlan),
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
  };
}

export function validateAcquisitionPlanEnvelope(envelope) {
  preflight(envelope, "acquisitionPlanEnvelope");
  assertExactFields(envelope, ACQUISITION_ENVELOPE_FIELDS, "acquisitionPlanEnvelope");
  if (envelope.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("VERSION_MISMATCH", "Unsupported acquisition-plan digest algorithm");
  }
  assertDigest(envelope.acquisitionPlanDigest, "acquisitionPlanEnvelope.acquisitionPlanDigest");
  validatePlanPayload(envelope.acquisitionPlan);
  if (canonicalJsonSha256(envelope.acquisitionPlan) !== envelope.acquisitionPlanDigest) {
    fail("BINDING_MISMATCH", "Acquisition-plan digest does not match its payload");
  }
  return structuredClone(envelope);
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

function assertSyntheticUrl(value, label) {
  let normalized;
  try {
    normalized = normalizePublicHttpUrl(value);
  } catch (error) {
    fail("INVALID_PROVENANCE", `${label} is invalid: ${error.message}`);
  }
  const parsed = new URL(value);
  if (
    normalized !== value ||
    !isReservedSyntheticHostname(parsed.hostname) ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("INVALID_PROVENANCE", `${label} must be a normalized query-free reserved-domain URL`);
  }
}

function validateSourceProjection(source, label) {
  assertExactFields(source, SOURCE_PROJECTION_FIELDS, label);
  assertIdentifier(source.id, `${label}.id`);
  assertSyntheticUrl(source.url, `${label}.url`);
  assertBoundedString(source.title, `${label}.title`, 256);
  assertBoundedString(source.factSummary, `${label}.factSummary`, 512);
  timestampMilliseconds(source.publishedAt, `${label}.publishedAt`);
  assertExactFields(source.provenance, SOURCE_PROVENANCE_FIELDS, `${label}.provenance`);
  if (
    source.provenance.kind !== "project-created-synthetic" ||
    source.provenance.origin !== null ||
    source.provenance.rightsBasis !== "project-created" ||
    typeof source.provenance.repositoryUseApproved !== "boolean" ||
    source.provenance.containsPersonalData !== false ||
    source.provenance.containsCopiedArticleText !== false
  ) {
    fail("INVALID_PROVENANCE", `${label}.provenance must remain safe project-created metadata`);
  }
}

function validateDeclarations(declarations, disposition, label) {
  assertExactFields(declarations, DECLARATION_FIELDS, label);
  for (const field of DECLARATION_FIELDS) {
    if (typeof declarations[field] !== "boolean") {
      fail("INVALID_PROVENANCE", `${label}.${field} must be boolean`);
    }
  }
  if (
    declarations.containsCopiedArticleText ||
    declarations.containsPersonalData ||
    (disposition === "accepted" &&
      (!declarations.minimumDataNecessary || !declarations.repositoryUseApproved)) ||
    (disposition !== "accepted" && declarations.repositoryUseApproved)
  ) {
    fail("INVALID_PROVENANCE", `${label} contradicts the Source disposition or safe fixture scope`);
  }
}

function fixtureManifestBindingFromInput(input) {
  assertIdentifier(input.fixtureManifestVersion, "provenanceInventoryInput.fixtureManifestVersion");
  assertDigest(input.fixtureManifestDigest, "provenanceInventoryInput.fixtureManifestDigest");
  return {
    assurance: FIXTURE_MANIFEST_ASSURANCE,
    digest: input.fixtureManifestDigest,
    manifestVersion: input.fixtureManifestVersion,
  };
}

function declarationRecordDigestFor(source, fixtureManifestBinding) {
  return canonicalJsonSha256({
    assurance: EVIDENCE_ASSURANCE,
    declarations: source.declarations,
    disposition: source.disposition,
    evidenceCapturedAt: source.evidence.capturedAt,
    evidenceVersion: SYNTHETIC_EVIDENCE_VERSION,
    fixtureManifestBinding,
    sourceProjectionDigest: source.sourceProjectionDigest,
  });
}

function inventoryFromInput(planEnvelope, input) {
  const plan = validateAcquisitionPlanEnvelope(planEnvelope);
  preflight(input, "provenanceInventoryInput");
  assertExactFields(input, INVENTORY_INPUT_FIELDS, "provenanceInventoryInput");
  assertIdentifier(input.inventoryId, "provenanceInventoryInput.inventoryId");
  const createdAt = timestampMilliseconds(input.createdAt, "provenanceInventoryInput.createdAt");
  if (createdAt < timestampMilliseconds(plan.acquisitionPlan.createdAt, "acquisitionPlan.createdAt")) {
    fail("INVALID_TIMESTAMP", "Provenance inventory cannot predate its acquisition plan");
  }
  if (!Array.isArray(input.sources) || input.sources.length > MAX_ARRAY_ENTRIES) {
    fail("RESOURCE_LIMIT", "provenanceInventoryInput.sources must be a bounded array");
  }
  const fixtureManifestBinding = fixtureManifestBindingFromInput(input);
  const reviewer = plan.acquisitionPlan.reviewers.provenance;
  const sources = structuredClone(input.sources)
    .sort((left, right) =>
      compareStrings(
        sortableStringField(
          left !== null && typeof left === "object" ? left.source : null,
          "id",
        ),
        sortableStringField(
          right !== null && typeof right === "object" ? right.source : null,
          "id",
        ),
      ),
    )
    .map((source, index) => {
      const label = `provenanceInventoryInput.sources[${index}]`;
      assertExactFields(source, INVENTORY_SOURCE_INPUT_FIELDS, label);
      validateSourceProjection(source.source, `${label}.source`);
      if (!PROVENANCE_DISPOSITIONS.has(source.disposition)) {
        fail("INVALID_PROVENANCE", `${label}.disposition is unsupported`);
      }
      validateDeclarations(source.declarations, source.disposition, `${label}.declarations`);
      if (
        source.source.provenance.repositoryUseApproved !==
          source.declarations.repositoryUseApproved ||
        source.source.provenance.containsPersonalData !==
          source.declarations.containsPersonalData ||
        source.source.provenance.containsCopiedArticleText !==
          source.declarations.containsCopiedArticleText
      ) {
        fail("INVALID_PROVENANCE", `${label} declarations contradict the Source projection`);
      }
      assertBoundedString(source.rationale, `${label}.rationale`, 512);
      const evidenceCapturedAt = timestampMilliseconds(
        source.evidenceCapturedAt,
        `${label}.evidenceCapturedAt`,
      );
      const publishedAt = timestampMilliseconds(source.source.publishedAt, `${label}.source.publishedAt`);
      if (publishedAt > evidenceCapturedAt || evidenceCapturedAt > createdAt) {
        fail("INVALID_TIMESTAMP", `${label} must satisfy publication <= evidence capture <= inventory`);
      }
      let review;
      if (source.disposition === "pending") {
        if (source.reviewedAt !== null) {
          fail("INVALID_TIMESTAMP", `${label}.reviewedAt must be null while pending`);
        }
        review = { reviewedAt: null, reviewer: null };
      } else {
        const reviewedAt = timestampMilliseconds(source.reviewedAt, `${label}.reviewedAt`);
        if (evidenceCapturedAt > reviewedAt || reviewedAt > createdAt) {
          fail("INVALID_TIMESTAMP", `${label} must satisfy evidence capture <= review <= inventory`);
        }
        review = {
          reviewedAt: source.reviewedAt,
          reviewer: structuredClone(reviewer),
        };
      }
      const sourceProjection = structuredClone(source.source);
      const record = {
        declarations: structuredClone(source.declarations),
        disposition: source.disposition,
        evidence: {
          assurance: EVIDENCE_ASSURANCE,
          capturedAt: source.evidenceCapturedAt,
          declarationRecordDigest: "",
          version: SYNTHETIC_EVIDENCE_VERSION,
        },
        metadataOriginUrl: null,
        provenanceKind: "project-created-synthetic",
        rationale: source.rationale,
        retainedFields: [...RETAINED_FIELDS],
        review,
        rightsBasis: "project-created",
        rightsEvidenceUrl: null,
        sourceId: sourceProjection.id,
        sourceProjection,
        sourceProjectionDigest: canonicalJsonSha256(sourceProjection),
        transformation: SYNTHETIC_TRANSFORMATION,
        url: sourceProjection.url,
      };
      record.evidence.declarationRecordDigest = declarationRecordDigestFor(
        record,
        fixtureManifestBinding,
      );
      return record;
    });
  const inventory = {
    acquisitionPlanDigest: plan.acquisitionPlanDigest,
    createdAt: input.createdAt,
    fixtureManifestBinding,
    inventoryContractVersion: PROVENANCE_INVENTORY_CONTRACT_VERSION,
    inventoryId: input.inventoryId,
    scope: generatedScope(),
    sources,
  };
  validateInventoryPayload(plan, inventory);
  return inventory;
}

function validateInventoryPayload(planEnvelope, inventory) {
  const plan = validateAcquisitionPlanEnvelope(planEnvelope);
  assertExactFields(inventory, INVENTORY_FIELDS, "provenanceInventory");
  if (inventory.inventoryContractVersion !== PROVENANCE_INVENTORY_CONTRACT_VERSION) {
    fail("VERSION_MISMATCH", "Unsupported provenance-inventory contract version");
  }
  assertIdentifier(inventory.inventoryId, "provenanceInventory.inventoryId");
  const createdAt = timestampMilliseconds(inventory.createdAt, "provenanceInventory.createdAt");
  if (createdAt < timestampMilliseconds(plan.acquisitionPlan.createdAt, "acquisitionPlan.createdAt")) {
    fail("INVALID_TIMESTAMP", "Provenance inventory cannot predate its acquisition plan");
  }
  if (inventory.acquisitionPlanDigest !== plan.acquisitionPlanDigest) {
    fail("BINDING_MISMATCH", "Provenance inventory is bound to another acquisition plan");
  }
  assertExactFields(
    inventory.fixtureManifestBinding,
    FIXTURE_MANIFEST_FIELDS,
    "provenanceInventory.fixtureManifestBinding",
  );
  if (inventory.fixtureManifestBinding.assurance !== FIXTURE_MANIFEST_ASSURANCE) {
    fail("INVALID_PROVENANCE", "Fixture-manifest binding overstates runtime verification");
  }
  assertDigest(
    inventory.fixtureManifestBinding.digest,
    "provenanceInventory.fixtureManifestBinding.digest",
  );
  assertIdentifier(
    inventory.fixtureManifestBinding.manifestVersion,
    "provenanceInventory.fixtureManifestBinding.manifestVersion",
  );
  validateGeneratedScope(inventory.scope, "provenanceInventory.scope");
  if (!Array.isArray(inventory.sources) || inventory.sources.length > MAX_ARRAY_ENTRIES) {
    fail("RESOURCE_LIMIT", "provenanceInventory.sources must be a bounded array");
  }
  assertSortedUnique(inventory.sources, "sourceId", "provenanceInventory.sources");

  const expectedSourceIds = plan.acquisitionPlan.sourceAssignments.map(({ sourceId }) => sourceId);
  if (inventory.sources.length !== expectedSourceIds.length) {
    fail("BINDING_MISMATCH", "Provenance inventory must contain exactly the planned Sources");
  }
  for (const [index, source] of inventory.sources.entries()) {
    const label = `provenanceInventory.sources[${index}]`;
    assertExactFields(source, INVENTORY_SOURCE_FIELDS, label);
    if (source.sourceId !== expectedSourceIds[index]) {
      fail("BINDING_MISMATCH", `${label} does not match the planned Source inventory`);
    }
    validateSourceProjection(source.sourceProjection, `${label}.sourceProjection`);
    if (
      source.sourceProjection.id !== source.sourceId ||
      source.sourceProjection.url !== source.url
    ) {
      fail("BINDING_MISMATCH", `${label} projection identity does not match its inventory record`);
    }
    assertDigest(source.sourceProjectionDigest, `${label}.sourceProjectionDigest`);
    if (source.sourceProjectionDigest !== canonicalJsonSha256(source.sourceProjection)) {
      fail("BINDING_MISMATCH", `${label}.sourceProjectionDigest does not match the reviewed metadata`);
    }
    assertSyntheticUrl(source.url, `${label}.url`);
    if (
      source.provenanceKind !== "project-created-synthetic" ||
      source.metadataOriginUrl !== null ||
      source.rightsBasis !== "project-created" ||
      source.rightsEvidenceUrl !== null ||
      source.transformation !== SYNTHETIC_TRANSFORMATION ||
      !PROVENANCE_DISPOSITIONS.has(source.disposition)
    ) {
      fail("INVALID_PROVENANCE", `${label} overstates or changes generated-fixture provenance`);
    }
    assertBoundedString(source.rationale, `${label}.rationale`, 512);
    if (canonicalJsonSha256(source.retainedFields) !== canonicalJsonSha256(RETAINED_FIELDS)) {
      fail("INVALID_PROVENANCE", `${label}.retainedFields must use the metadata allowlist`);
    }
    validateDeclarations(source.declarations, source.disposition, `${label}.declarations`);
    if (
      source.sourceProjection.provenance.repositoryUseApproved !==
        source.declarations.repositoryUseApproved ||
      source.sourceProjection.provenance.containsPersonalData !==
        source.declarations.containsPersonalData ||
      source.sourceProjection.provenance.containsCopiedArticleText !==
        source.declarations.containsCopiedArticleText
    ) {
      fail("INVALID_PROVENANCE", `${label} declarations contradict the Source projection`);
    }
    assertExactFields(source.evidence, EVIDENCE_FIELDS, `${label}.evidence`);
    const capturedAt = timestampMilliseconds(
      source.evidence.capturedAt,
      `${label}.evidence.capturedAt`,
    );
    if (source.evidence.version !== SYNTHETIC_EVIDENCE_VERSION) {
      fail("VERSION_MISMATCH", `${label}.evidence.version is unsupported`);
    }
    if (source.evidence.assurance !== EVIDENCE_ASSURANCE) {
      fail("INVALID_PROVENANCE", `${label}.evidence.assurance overstates verification`);
    }
    assertDigest(
      source.evidence.declarationRecordDigest,
      `${label}.evidence.declarationRecordDigest`,
    );
    if (
      source.evidence.declarationRecordDigest !==
      declarationRecordDigestFor(source, inventory.fixtureManifestBinding)
    ) {
      fail("BINDING_MISMATCH", `${label} declaration record does not bind its reviewed projection`);
    }
    assertExactFields(source.review, REVIEW_FIELDS, `${label}.review`);
    const publishedAt = timestampMilliseconds(
      source.sourceProjection.publishedAt,
      `${label}.sourceProjection.publishedAt`,
    );
    if (publishedAt > capturedAt || capturedAt > createdAt) {
      fail("INVALID_TIMESTAMP", `${label} must satisfy publication <= evidence capture <= inventory`);
    }
    if (source.disposition === "pending") {
      if (source.review.reviewedAt !== null || source.review.reviewer !== null) {
        fail("INVALID_PROVENANCE", `${label} pending disposition cannot claim completed review`);
      }
    } else {
      const reviewedAt = timestampMilliseconds(
        source.review.reviewedAt,
        `${label}.review.reviewedAt`,
      );
      validateReviewer(source.review.reviewer, `${label}.review.reviewer`);
      if (
        canonicalJsonSha256(source.review.reviewer) !==
          canonicalJsonSha256(plan.acquisitionPlan.reviewers.provenance)
      ) {
        fail("INVALID_REVIEWERS", `${label} was not reviewed by the committed provenance role`);
      }
      if (capturedAt > reviewedAt || reviewedAt > createdAt) {
        fail("INVALID_TIMESTAMP", `${label} must satisfy evidence capture <= review <= inventory`);
      }
    }
  }
}

export function prepareProvenanceInventoryEnvelope(planEnvelope, input) {
  const provenanceInventory = inventoryFromInput(planEnvelope, input);
  return {
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    provenanceInventory,
    provenanceInventoryDigest: canonicalJsonSha256(provenanceInventory),
  };
}

export function validateProvenanceInventoryEnvelope(planEnvelope, envelope) {
  const plan = validateAcquisitionPlanEnvelope(planEnvelope);
  preflight(envelope, "provenanceInventoryEnvelope");
  assertExactFields(envelope, INVENTORY_ENVELOPE_FIELDS, "provenanceInventoryEnvelope");
  if (envelope.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("VERSION_MISMATCH", "Unsupported provenance-inventory digest algorithm");
  }
  assertDigest(
    envelope.provenanceInventoryDigest,
    "provenanceInventoryEnvelope.provenanceInventoryDigest",
  );
  validateInventoryPayload(plan, envelope.provenanceInventory);
  if (canonicalJsonSha256(envelope.provenanceInventory) !== envelope.provenanceInventoryDigest) {
    fail("BINDING_MISMATCH", "Provenance-inventory digest does not match its payload");
  }
  return structuredClone(envelope);
}

function validatePrimaryTask(primaryTaskEnvelope) {
  try {
    return validateReviewTaskEnvelope(primaryTaskEnvelope);
  } catch (error) {
    if (error instanceof ReviewWorkflowError) {
      fail("INVALID_PRIMARY_TASK", `${error.code}: ${error.message}`);
    }
    throw error;
  }
}

function compareUpstreamArtifacts(primaryTaskEnvelope, planEnvelope, inventoryEnvelope) {
  const primary = validatePrimaryTask(primaryTaskEnvelope);
  const plan = validateAcquisitionPlanEnvelope(planEnvelope);
  const inventory = validateProvenanceInventoryEnvelope(plan, inventoryEnvelope);
  const taskCreatedAt = timestampMilliseconds(primary.task.createdAt, "primaryTask.createdAt");
  const inventoryCreatedAt = timestampMilliseconds(
    inventory.provenanceInventory.createdAt,
    "provenanceInventory.createdAt",
  );
  if (timestampMilliseconds(plan.acquisitionPlan.createdAt, "acquisitionPlan.createdAt") > inventoryCreatedAt) {
    fail("INVALID_TIMESTAMP", "Acquisition plan must not postdate its provenance inventory");
  }

  for (const role of ["primary", "secondary", "adjudicator"]) {
    if (primary.task.reviewers[role] !== plan.acquisitionPlan.reviewers[role].id) {
      fail("INVALID_REVIEWERS", `Primary task ${role} does not match the acquisition plan`);
    }
  }
  if (
    primary.task.provenanceReview.status !== "accepted" ||
    primary.task.provenanceReview.reviewerId !== plan.acquisitionPlan.reviewers.provenance.id
  ) {
    fail("INVALID_REVIEWERS", "Primary task lacks the committed generated provenance review");
  }
  const provenanceAcceptedAt = timestampMilliseconds(
    primary.task.provenanceReview.reviewedAt,
    "primaryTask.provenanceReview.reviewedAt",
  );
  if (inventoryCreatedAt > provenanceAcceptedAt || provenanceAcceptedAt > taskCreatedAt) {
    fail(
      "INVALID_TIMESTAMP",
      "Required chronology is inventory creation <= provenance acceptance <= task creation",
    );
  }

  const planSources = plan.acquisitionPlan.sourceAssignments;
  const taskSources = primary.task.sources;
  const inventorySources = inventory.provenanceInventory.sources;
  if (planSources.length !== inventorySources.length) {
    fail("BINDING_MISMATCH", "Plan and inventory Source counts differ");
  }
  const taskSourceById = new Map(taskSources.map((source) => [source.id, source]));
  const inventorySourceById = new Map(inventorySources.map((source) => [source.sourceId, source]));
  const taskPairById = new Map(primary.task.pairs.map((pair) => [pair.id, pair]));
  const acceptedSourceIds = inventorySources
    .filter(({ disposition }) => disposition === "accepted")
    .map(({ sourceId }) => sourceId);
  const acceptedSourceIdSet = new Set(acceptedSourceIds);
  const expectedPairAssignments = plan.acquisitionPlan.pairAssignments.filter(
    ({ sourceAId, sourceBId }) =>
      acceptedSourceIdSet.has(sourceAId) && acceptedSourceIdSet.has(sourceBId),
  );
  const expectedPairIds = expectedPairAssignments.map(({ id }) => id);
  const expectedPairIdSet = new Set(expectedPairIds);
  const expectedTaskSourceIdSet = new Set(
    expectedPairAssignments.flatMap(({ sourceAId, sourceBId }) => [sourceAId, sourceBId]),
  );
  const expectedTaskSourceIds = [...expectedTaskSourceIdSet].sort(compareStrings);
  const actualTaskSourceIds = taskSources.map(({ id }) => id);
  const actualTaskPairIds = primary.task.pairs.map(({ id }) => id);
  if (
    canonicalJsonSha256(actualTaskSourceIds) !== canonicalJsonSha256(expectedTaskSourceIds) ||
    canonicalJsonSha256(actualTaskPairIds) !== canonicalJsonSha256(expectedPairIds)
  ) {
    fail(
      "BINDING_MISMATCH",
      "Primary task must contain exactly the accepted Source/pair projection",
    );
  }

  for (const assignment of expectedPairAssignments) {
    const pair = taskPairById.get(assignment.id);
    if (
      !pair ||
      pair.sourceAId !== assignment.sourceAId ||
      pair.sourceBId !== assignment.sourceBId ||
      pair.caseType !== assignment.caseType
    ) {
      fail("BINDING_MISMATCH", `Pair ${assignment.id} is inconsistent across artifacts`);
    }
  }
  for (const sourceId of expectedTaskSourceIds) {
    const taskSource = taskSourceById.get(sourceId);
    const inventorySource = inventorySourceById.get(sourceId);
    if (
      !taskSource ||
      !inventorySource ||
      inventorySource.disposition !== "accepted" ||
      canonicalJsonSha256(taskSource) !== inventorySource.sourceProjectionDigest ||
      canonicalJsonSha256(taskSource) !== canonicalJsonSha256(inventorySource.sourceProjection)
    ) {
      fail("BINDING_MISMATCH", `Source ${sourceId} differs from its accepted reviewed projection`);
    }
  }

  const selection = {
    acceptedSourceIds,
    excludedPairs: plan.acquisitionPlan.pairAssignments
      .filter(({ id }) => !expectedPairIdSet.has(id))
      .map(({ id }) => ({ pairId: id, reason: "endpoint-not-accepted" })),
    excludedSources: inventorySources
      .filter(({ sourceId }) => !expectedTaskSourceIdSet.has(sourceId))
      .map(({ disposition, sourceId }) => ({
        disposition,
        reason: disposition === "accepted" ? "no-accepted-pair" : `provenance-${disposition}`,
        sourceId,
      })),
    taskPairIds: expectedPairIds,
    taskSourceIds: expectedTaskSourceIds,
  };
  return { inventory, plan, primary, selection };
}

function priorityFor(plan, pairIds) {
  return [...pairIds]
    .map((pairId) => ({
      pairId,
      rank: canonicalJsonSha256({
        acquisitionPlanDigest: plan.acquisitionPlanDigest,
        coverageNonce: plan.acquisitionPlan.coverage.nonce,
        domain: "secondary-coverage-priority/1.0.0",
        pairId,
      }),
    }))
    .sort(
      (left, right) =>
        compareStrings(left.rank, right.rank) || compareStrings(left.pairId, right.pairId),
    )
    .map(({ pairId }) => pairId);
}

function completionScope() {
  return {
    adjudicationComplete: false,
    corpusMaterialized: false,
    evaluationPerformed: false,
    fixtureOnly: true,
    gateEligible: false,
    heldOut: false,
    independentHumanReviewVerified: false,
    ownerCheckpointReached: false,
    primaryReviewComplete: false,
    realMetadataAuthorized: false,
    secondaryReviewComplete: false,
    splitFrozen: false,
  };
}

function buildCompletionTask(primaryTaskEnvelope, planEnvelope, inventoryEnvelope) {
  const { inventory, plan, primary, selection } = compareUpstreamArtifacts(
    primaryTaskEnvelope,
    planEnvelope,
    inventoryEnvelope,
  );
  const priorityPairIds = priorityFor(
    plan,
    primary.task.pairs.map(({ id }) => id),
  );
  const initialCount = Math.ceil(
    (priorityPairIds.length * COVERAGE_TARGET_FRACTION_MICROS) / 1_000_000,
  );
  return {
    bindings: {
      acquisitionPlanDigest: plan.acquisitionPlanDigest,
      primaryTaskDigest: primary.taskDigest,
      provenanceInventoryDigest: inventory.provenanceInventoryDigest,
    },
    completionTaskContractVersion: REVIEW_COMPLETION_TASK_CONTRACT_VERSION,
    coveragePlan: {
      coverageTargetFractionMicros: COVERAGE_TARGET_FRACTION_MICROS,
      initialCoveragePairIds: priorityPairIds.slice(0, initialCount),
      minimumEligibleFractionMicros: MINIMUM_ELIGIBLE_FRACTION_MICROS,
      nonce: plan.acquisitionPlan.coverage.nonce,
      priorityMethod: COVERAGE_PRIORITY_METHOD,
      priorityPairIds,
      reservePairIds: priorityPairIds.slice(initialCount),
    },
    createdAt: primary.task.createdAt,
    primaryTaskEnvelope: primary,
    reviewers: structuredClone(plan.acquisitionPlan.reviewers),
    scope: completionScope(),
    selection,
    taskId: primary.task.taskId,
  };
}

function validateCompletionTaskPayload(task) {
  assertExactFields(task, COMPLETION_TASK_FIELDS, "completionTask");
  if (task.completionTaskContractVersion !== REVIEW_COMPLETION_TASK_CONTRACT_VERSION) {
    fail("VERSION_MISMATCH", "Unsupported review-completion task contract version");
  }
  assertIdentifier(task.taskId, "completionTask.taskId");
  timestampMilliseconds(task.createdAt, "completionTask.createdAt");
  assertExactFields(task.bindings, COMPLETION_BINDING_FIELDS, "completionTask.bindings");
  for (const field of COMPLETION_BINDING_FIELDS) {
    assertDigest(task.bindings[field], `completionTask.bindings.${field}`);
  }
  const validatedPrimary = validatePrimaryTask(task.primaryTaskEnvelope);
  validateReviewers(task.reviewers);
  assertExactFields(task.coveragePlan, COMPLETION_COVERAGE_FIELDS, "completionTask.coveragePlan");
  if (
    task.coveragePlan.priorityMethod !== COVERAGE_PRIORITY_METHOD ||
    task.coveragePlan.coverageTargetFractionMicros !== COVERAGE_TARGET_FRACTION_MICROS ||
    task.coveragePlan.minimumEligibleFractionMicros !== MINIMUM_ELIGIBLE_FRACTION_MICROS
  ) {
    fail("INVALID_COVERAGE_PLAN", "Completion-task coverage policy is unsupported");
  }
  assertIdentifier(task.coveragePlan.nonce, "completionTask.coveragePlan.nonce");
  for (const field of ["priorityPairIds", "initialCoveragePairIds", "reservePairIds"]) {
    if (!Array.isArray(task.coveragePlan[field]) || task.coveragePlan[field].length > MAX_ARRAY_ENTRIES) {
      fail("RESOURCE_LIMIT", `completionTask.coveragePlan.${field} must be a bounded array`);
    }
    for (const [index, id] of task.coveragePlan[field].entries()) {
      assertIdentifier(id, `completionTask.coveragePlan.${field}[${index}]`);
    }
  }
  const primaryPairIds = validatedPrimary.task.pairs.map(({ id }) => id);
  const initialCount = Math.ceil(
    (primaryPairIds.length * COVERAGE_TARGET_FRACTION_MICROS) / 1_000_000,
  );
  if (
    new Set(task.coveragePlan.priorityPairIds).size !== primaryPairIds.length ||
    canonicalJsonSha256([...task.coveragePlan.priorityPairIds].sort(compareStrings)) !==
      canonicalJsonSha256([...primaryPairIds].sort(compareStrings)) ||
    canonicalJsonSha256(task.coveragePlan.initialCoveragePairIds) !==
      canonicalJsonSha256(task.coveragePlan.priorityPairIds.slice(0, initialCount)) ||
    canonicalJsonSha256(task.coveragePlan.reservePairIds) !==
      canonicalJsonSha256(task.coveragePlan.priorityPairIds.slice(initialCount))
  ) {
    fail("INVALID_COVERAGE_PLAN", "Coverage priority must partition the exact primary-task pairs");
  }
  assertExactFields(task.selection, COMPLETION_SELECTION_FIELDS, "completionTask.selection");
  for (const field of ["acceptedSourceIds", "taskPairIds", "taskSourceIds"]) {
    if (!Array.isArray(task.selection[field]) || task.selection[field].length > MAX_ARRAY_ENTRIES) {
      fail("RESOURCE_LIMIT", `completionTask.selection.${field} must be a bounded array`);
    }
    for (const [index, id] of task.selection[field].entries()) {
      assertIdentifier(id, `completionTask.selection.${field}[${index}]`);
    }
    const records = task.selection[field].map((id) => ({ id }));
    assertSortedUnique(records, "id", `completionTask.selection.${field}`);
  }
  if (
    !Array.isArray(task.selection.excludedSources) ||
    !Array.isArray(task.selection.excludedPairs) ||
    task.selection.excludedSources.length > MAX_ARRAY_ENTRIES ||
    task.selection.excludedPairs.length > MAX_ARRAY_ENTRIES
  ) {
    fail("RESOURCE_LIMIT", "Completion-task exclusions must be bounded arrays");
  }
  for (const [index, source] of task.selection.excludedSources.entries()) {
    const label = `completionTask.selection.excludedSources[${index}]`;
    assertExactFields(source, EXCLUDED_SOURCE_FIELDS, label);
    assertIdentifier(source.sourceId, `${label}.sourceId`);
    if (!PROVENANCE_DISPOSITIONS.has(source.disposition)) {
      fail("INVALID_PROVENANCE", `${label}.disposition is unsupported`);
    }
    const expectedReason =
      source.disposition === "accepted" ? "no-accepted-pair" : `provenance-${source.disposition}`;
    if (source.reason !== expectedReason) {
      fail("INVALID_PROVENANCE", `${label}.reason contradicts its disposition`);
    }
  }
  assertSortedUnique(
    task.selection.excludedSources,
    "sourceId",
    "completionTask.selection.excludedSources",
  );
  for (const [index, pair] of task.selection.excludedPairs.entries()) {
    const label = `completionTask.selection.excludedPairs[${index}]`;
    assertExactFields(pair, EXCLUDED_PAIR_FIELDS, label);
    assertIdentifier(pair.pairId, `${label}.pairId`);
    if (pair.reason !== "endpoint-not-accepted") {
      fail("INVALID_PROVENANCE", `${label}.reason is unsupported`);
    }
  }
  assertSortedUnique(
    task.selection.excludedPairs,
    "pairId",
    "completionTask.selection.excludedPairs",
  );
  assertExactFields(task.scope, COMPLETION_SCOPE_FIELDS, "completionTask.scope");
  if (canonicalJsonSha256(task.scope) !== canonicalJsonSha256(completionScope())) {
    fail("INVALID_SCOPE", "Completion task must make no review, corpus, split, or gate claim");
  }
}

export function prepareReviewCompletionTaskEnvelope(
  primaryTaskEnvelope,
  planEnvelope,
  inventoryEnvelope,
) {
  const completionTask = buildCompletionTask(
    primaryTaskEnvelope,
    planEnvelope,
    inventoryEnvelope,
  );
  validateCompletionTaskPayload(completionTask);
  return {
    completionTask,
    completionTaskDigest: canonicalJsonSha256(completionTask),
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
  };
}

export function validateReviewCompletionTaskEnvelope(
  envelope,
  primaryTaskEnvelope,
  planEnvelope,
  inventoryEnvelope,
) {
  preflight(envelope, "completionTaskEnvelope");
  assertExactFields(envelope, COMPLETION_ENVELOPE_FIELDS, "completionTaskEnvelope");
  if (envelope.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("VERSION_MISMATCH", "Unsupported completion-task digest algorithm");
  }
  assertDigest(envelope.completionTaskDigest, "completionTaskEnvelope.completionTaskDigest");
  validateCompletionTaskPayload(envelope.completionTask);
  const expected = buildCompletionTask(primaryTaskEnvelope, planEnvelope, inventoryEnvelope);
  if (
    canonicalJsonSha256(envelope.completionTask) !== envelope.completionTaskDigest ||
    canonicalJsonSha256(envelope.completionTask) !== canonicalJsonSha256(expected)
  ) {
    fail("BINDING_MISMATCH", "Completion task does not match its upstream artifacts or digest");
  }
  return structuredClone(envelope);
}

export const REVIEW_COMPLETION_TASK_LIMITS = Object.freeze({
  maximumArrayEntries: MAX_ARRAY_ENTRIES,
  maximumDataNodes: MAX_DATA_NODES,
  maximumDepth: MAX_DEPTH,
  maximumStringCodeUnits: MAX_STRING_CODE_UNITS,
});
