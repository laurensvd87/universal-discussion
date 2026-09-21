import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import { normalizePublicHttpUrl } from "../src/url.js";

export const REVIEW_WORKFLOW_VERSION = "story-review-workflow/1.0.0";
export const REVIEW_TASK_VERSION = "story-review-task/1.0.0";
export const REVIEW_LEDGER_VERSION = "story-review-ledger/1.0.0";
export const REVIEW_EVENT_VERSION = "story-review-event/1.0.0";
export const REVIEW_CHECKPOINT_VERSION = "story-review-checkpoint/1.0.0";

export const REVIEW_LABELS = Object.freeze([
  "same-topic",
  "different-topic",
  "uncertain",
]);

export const REVIEW_CASE_TYPES = Object.freeze([
  "adversarial-title",
  "duplicate-positive",
  "related-distinct",
  "syndication-positive",
  "unrelated-control",
  "update-continuation-boundary",
]);

const REVIEW_LABEL_SET = new Set(REVIEW_LABELS);
const REVIEW_CASE_TYPE_SET = new Set(REVIEW_CASE_TYPES);
const PROVENANCE_KINDS = new Set([
  "licensed-metadata",
  "project-created-synthetic",
  "reviewed-public-metadata",
]);
const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const REVIEWER_IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,63}$/;
const REVIEW_ITEM_IDENTIFIER = /^review-item-[0-9]{3,6}$/;
const SOURCE_IDENTIFIER = /^source-[0-9]{3,6}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const MIN_SECONDARY_REVIEW_FRACTION_MICROS = 200_000;
const MIN_COLLECTION_PAIRS = 200;
const MAX_SOURCES = 10_000;
const MAX_PAIRS = 100_000;
const MAX_ARRAY_ENTRIES = 100_000;
const MAX_DATA_NODES = 1_000_000;
const MAX_TOTAL_STRING_CODE_UNITS = 2_000_000;
const MAX_DEPTH = 12;
const MAX_OBJECT_FIELDS = 32;

const INTAKE_FIELDS = [
  "contentClass",
  "createdAt",
  "datasetVersion",
  "intakeContractVersion",
  "language",
  "orderingSeed",
  "pairs",
  "provenanceReview",
  "reviewers",
  "secondarySelectionSeed",
  "sources",
  "taskId",
  "topicDefinition",
  "topicDefinitionVersion",
];
const REVIEWERS_FIELDS = ["adjudicator", "primary", "secondary"];
const PROVENANCE_REVIEW_FIELDS = ["reviewedAt", "reviewerId", "status"];
const SOURCE_FIELDS = [
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
const PAIR_FIELDS = ["caseType", "id", "sourceAId", "sourceBId"];
const TASK_FIELDS = [
  "contentClass",
  "createdAt",
  "datasetVersion",
  "language",
  "ordering",
  "pairs",
  "provenanceReview",
  "reviewers",
  "scope",
  "secondaryReviewPlan",
  "sources",
  "taskContractVersion",
  "taskId",
  "topicDefinition",
  "topicDefinitionVersion",
  "workflowVersion",
];
const ORDERING_FIELDS = ["method", "pairIds", "seed"];
const SECONDARY_PLAN_FIELDS = [
  "minimumFractionMicros",
  "pairIds",
  "selectionMethod",
  "seed",
];
const TASK_SCOPE_FIELDS = [
  "corpusMaterialized",
  "evaluationPerformed",
  "gateEligible",
  "heldOut",
  "offlineOnly",
  "splitFrozen",
];
const TASK_ENVELOPE_FIELDS = ["digestAlgorithm", "task", "taskDigest"];
const LEDGER_FIELDS = ["events", "ledgerContractVersion", "taskDigest"];
const EVENT_RECORD_FIELDS = ["event", "eventDigest"];
const EVENT_FIELDS = [
  "eventContractVersion",
  "label",
  "previousEventDigest",
  "rationale",
  "recordedAt",
  "recordedAtBasis",
  "reviewItemId",
  "reviewer",
  "role",
  "sequence",
  "taskDigest",
];
const EVENT_REVIEWER_FIELDS = ["id", "identityBasis"];
const DECISION_FIELDS = [
  "expectedSessionDigest",
  "label",
  "reviewItemId",
  "reviewerId",
];

const RATIONALE_BY_LABEL = Object.freeze({
  "same-topic": "Reviewer judged both sources to describe the same atomic development.",
  "different-topic": "Reviewer judged the sources to describe separate developments.",
  uncertain: "Reviewer found the presented metadata insufficient for a binary decision.",
});

export class ReviewWorkflowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReviewWorkflowError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReviewWorkflowError(code, message);
}

function preflightData(value, state, depth, label) {
  if (depth > MAX_DEPTH) {
    fail("RESOURCE_LIMIT", `${label} exceeds the maximum data depth`);
  }
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) {
    fail("RESOURCE_LIMIT", "Review data exceeds the bounded data-node budget");
  }
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_TOTAL_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", "Review data exceeds the bounded string budget");
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
    const keys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
    const expected = Array.from({ length: value.length }, (_, index) => String(index));
    if (
      keys.length !== expected.length ||
      keys.some(
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
        fail("RESOURCE_LIMIT", "Review data exceeds the bounded string budget");
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
      `${label} fields are invalid; missing=${missing.length}, unknown=${unknown.length}`,
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

function assertReviewerIdentifier(value, label) {
  if (typeof value !== "string" || !REVIEWER_IDENTIFIER.test(value)) {
    fail("INVALID_SCHEMA", `${label} must be a canonical lowercase reviewer identifier`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !SHA256_DIGEST.test(value)) {
    fail("INVALID_SCHEMA", `${label} must be a sha256 digest`);
  }
}

function timestampMilliseconds(value, label) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_SCHEMA", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function assertNormalizedUrl(value, label) {
  let normalized;
  try {
    normalized = normalizePublicHttpUrl(value);
  } catch (error) {
    fail("INVALID_SCHEMA", `${label} is invalid: ${error.message}`);
  }
  if (normalized !== value) {
    fail("INVALID_SCHEMA", `${label} must already be normalized`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail("INVALID_SCHEMA", `${label} must be boolean`);
  }
}

function validateReviewers(reviewers) {
  assertExactFields(reviewers, REVIEWERS_FIELDS, "reviewers");
  for (const field of REVIEWERS_FIELDS) {
    assertReviewerIdentifier(reviewers[field], `reviewers.${field}`);
  }
  if (new Set(REVIEWERS_FIELDS.map((field) => reviewers[field])).size !== 3) {
    fail("INVALID_REVIEWERS", "Primary, secondary, and adjudicator reviewers must be distinct");
  }
}

function validateProvenanceReview(review) {
  assertExactFields(review, PROVENANCE_REVIEW_FIELDS, "provenanceReview");
  if (review.status !== "accepted" && review.status !== "pending") {
    fail("INVALID_PROVENANCE", "provenanceReview.status must be accepted or pending");
  }
  if (review.status === "pending") {
    if (review.reviewerId !== null || review.reviewedAt !== null) {
      fail("INVALID_PROVENANCE", "Pending provenance review cannot claim a reviewer or time");
    }
  } else {
    assertReviewerIdentifier(review.reviewerId, "provenanceReview.reviewerId");
    timestampMilliseconds(review.reviewedAt, "provenanceReview.reviewedAt");
  }
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

function validateSource(source, index) {
  const label = `sources[${index}]`;
  assertExactFields(source, SOURCE_FIELDS, label);
  if (typeof source.id !== "string" || !SOURCE_IDENTIFIER.test(source.id)) {
    fail("INVALID_SOURCE", `${label}.id must use the opaque source-NNN form`);
  }
  assertNormalizedUrl(source.url, `${label}.url`);
  assertBoundedString(source.title, `${label}.title`, 256);
  assertBoundedString(source.factSummary, `${label}.factSummary`, 512);
  timestampMilliseconds(source.publishedAt, `${label}.publishedAt`);
  assertExactFields(source.provenance, SOURCE_PROVENANCE_FIELDS, `${label}.provenance`);
  if (!PROVENANCE_KINDS.has(source.provenance.kind)) {
    fail("INVALID_PROVENANCE", `${label}.provenance.kind is unsupported`);
  }
  assertBoundedString(source.provenance.rightsBasis, `${label}.provenance.rightsBasis`, 256);
  for (const field of [
    "repositoryUseApproved",
    "containsPersonalData",
    "containsCopiedArticleText",
  ]) {
    assertBoolean(source.provenance[field], `${label}.provenance.${field}`);
  }
  if (source.provenance.containsCopiedArticleText !== false) {
    fail("INVALID_PROVENANCE", `${label}.provenance cannot include copied article text`);
  }
  if (source.provenance.kind === "project-created-synthetic") {
    if (
      source.provenance.origin !== null ||
      source.provenance.rightsBasis !== "project-created" ||
      source.provenance.containsPersonalData !== false ||
      !isReservedSyntheticHostname(new URL(source.url).hostname)
    ) {
      fail(
        "INVALID_PROVENANCE",
        `${label} synthetic metadata must retain corpus-compatible reserved-origin provenance`,
      );
    }
  } else {
    if (typeof source.provenance.origin !== "string") {
      fail("INVALID_PROVENANCE", `${label}.provenance.origin is required`);
    }
    assertNormalizedUrl(source.provenance.origin, `${label}.provenance.origin`);
  }
}

function validatePair(pair, index, sourceIds) {
  const label = `pairs[${index}]`;
  assertExactFields(pair, PAIR_FIELDS, label);
  if (typeof pair.id !== "string" || !REVIEW_ITEM_IDENTIFIER.test(pair.id)) {
    fail("INVALID_PAIR", `${label}.id must use the opaque review-item-NNN form`);
  }
  if (!sourceIds.has(pair.sourceAId) || !sourceIds.has(pair.sourceBId)) {
    fail("INVALID_PAIR", `${label} references an unknown source`);
  }
  if (pair.sourceAId >= pair.sourceBId) {
    fail("INVALID_PAIR", `${label} sources must be distinct and ordered by id`);
  }
  if (!REVIEW_CASE_TYPE_SET.has(pair.caseType)) {
    fail("INVALID_PAIR", `${label}.caseType is unsupported`);
  }
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deterministicOrder(ids, seed, purpose) {
  return [...ids]
    .map((id) => ({ id, rank: canonicalJsonSha256({ id, purpose, seed }) }))
    .sort((left, right) => compareStrings(left.rank, right.rank) || compareStrings(left.id, right.id))
    .map(({ id }) => id);
}

function taskFromValidatedIntake(intake) {
  const sortedSources = structuredClone(intake.sources).sort((left, right) =>
    compareStrings(left.id, right.id),
  );
  const sortedPairs = structuredClone(intake.pairs).sort((left, right) =>
    compareStrings(left.id, right.id),
  );
  const pairIds = sortedPairs.map((pair) => pair.id);
  const secondaryCount = Math.ceil(
    (pairIds.length * MIN_SECONDARY_REVIEW_FRACTION_MICROS) / 1_000_000,
  );
  const secondaryPairIds = deterministicOrder(
    pairIds,
    intake.secondarySelectionSeed,
    "secondary-review-selection",
  )
    .slice(0, secondaryCount)
    .sort();

  return {
    workflowVersion: REVIEW_WORKFLOW_VERSION,
    taskContractVersion: REVIEW_TASK_VERSION,
    taskId: intake.taskId,
    createdAt: intake.createdAt,
    datasetVersion: intake.datasetVersion,
    topicDefinitionVersion: intake.topicDefinitionVersion,
    topicDefinition: intake.topicDefinition,
    contentClass: intake.contentClass,
    language: intake.language,
    reviewers: structuredClone(intake.reviewers),
    provenanceReview: structuredClone(intake.provenanceReview),
    sources: sortedSources,
    pairs: sortedPairs,
    ordering: {
      method: "seeded-sha256-rank/1.0.0",
      seed: intake.orderingSeed,
      pairIds: deterministicOrder(pairIds, intake.orderingSeed, "primary-review-order"),
    },
    secondaryReviewPlan: {
      selectionMethod: "seeded-sha256-rank/1.0.0",
      seed: intake.secondarySelectionSeed,
      minimumFractionMicros: MIN_SECONDARY_REVIEW_FRACTION_MICROS,
      pairIds: secondaryPairIds,
    },
    scope: {
      offlineOnly: true,
      corpusMaterialized: false,
      splitFrozen: false,
      heldOut: false,
      evaluationPerformed: false,
      gateEligible: false,
    },
  };
}

function validateIntake(intake) {
  preflight(intake, "intake");
  assertExactFields(intake, INTAKE_FIELDS, "intake");
  if (intake.intakeContractVersion !== REVIEW_WORKFLOW_VERSION) {
    fail("UNSUPPORTED_VERSION", "intakeContractVersion is unsupported");
  }
  assertIdentifier(intake.taskId, "taskId");
  const taskCreatedAt = timestampMilliseconds(intake.createdAt, "createdAt");
  assertIdentifier(intake.datasetVersion, "datasetVersion");
  assertIdentifier(intake.topicDefinitionVersion, "topicDefinitionVersion");
  assertBoundedString(intake.topicDefinition, "topicDefinition", 512);
  assertIdentifier(intake.contentClass, "contentClass");
  assertBoundedString(intake.language, "language", 32);
  if (intake.contentClass !== "editorial-article" || intake.language !== "en") {
    fail("INVALID_SCOPE", "Review intake must remain English editorial-article metadata");
  }
  assertBoundedString(intake.orderingSeed, "orderingSeed", 256);
  assertBoundedString(intake.secondarySelectionSeed, "secondarySelectionSeed", 256);
  if (intake.orderingSeed === intake.secondarySelectionSeed) {
    fail("INVALID_PLAN", "Primary ordering and secondary selection must use distinct seeds");
  }
  validateReviewers(intake.reviewers);
  validateProvenanceReview(intake.provenanceReview);
  if (
    intake.provenanceReview.status === "accepted" &&
    intake.provenanceReview.reviewerId === intake.reviewers.primary
  ) {
    fail("INVALID_REVIEWERS", "The primary labeler cannot approve provenance for the same task");
  }
  if (!Array.isArray(intake.sources) || intake.sources.length < 2 || intake.sources.length > MAX_SOURCES) {
    fail("RESOURCE_LIMIT", `sources must contain 2..${MAX_SOURCES} entries`);
  }
  if (!Array.isArray(intake.pairs) || intake.pairs.length < 1 || intake.pairs.length > MAX_PAIRS) {
    fail("RESOURCE_LIMIT", `pairs must contain 1..${MAX_PAIRS} entries`);
  }

  const sourceIds = new Set();
  const usedSourceIds = new Set();
  let latestPublishedAt = Number.NEGATIVE_INFINITY;
  for (const [index, source] of intake.sources.entries()) {
    validateSource(source, index);
    const publishedAt = timestampMilliseconds(source.publishedAt, `sources[${index}].publishedAt`);
    if (publishedAt > taskCreatedAt) {
      fail("INVALID_TIMESTAMP", `sources[${index}] cannot postdate task creation`);
    }
    latestPublishedAt = Math.max(latestPublishedAt, publishedAt);
    if (sourceIds.has(source.id)) {
      fail("DUPLICATE_ID", `Duplicate source id ${source.id}`);
    }
    sourceIds.add(source.id);
    if (
      intake.provenanceReview.status === "accepted" &&
      (!source.provenance.repositoryUseApproved ||
        source.provenance.containsPersonalData ||
        source.provenance.containsCopiedArticleText)
    ) {
      fail(
        "INVALID_PROVENANCE",
        "Accepted provenance requires approved, metadata-only, non-personal Sources",
      );
    }
  }

  const pairIds = new Set();
  const sourcePairs = new Set();
  for (const [index, pair] of intake.pairs.entries()) {
    validatePair(pair, index, sourceIds);
    if (pairIds.has(pair.id)) {
      fail("DUPLICATE_ID", `Duplicate review item id ${pair.id}`);
    }
    pairIds.add(pair.id);
    const sourcePair = `${pair.sourceAId}\u0000${pair.sourceBId}`;
    if (sourcePairs.has(sourcePair)) {
      fail("DUPLICATE_PAIR", `${pair.id} repeats a source pair`);
    }
    sourcePairs.add(sourcePair);
    usedSourceIds.add(pair.sourceAId);
    usedSourceIds.add(pair.sourceBId);
  }
  if (usedSourceIds.size !== sourceIds.size) {
    fail("UNUSED_SOURCE", "Every Source must appear in at least one review item");
  }
  if (
    intake.provenanceReview.status === "accepted" &&
    timestampMilliseconds(intake.provenanceReview.reviewedAt, "provenanceReview.reviewedAt") >
      taskCreatedAt
  ) {
    fail("INVALID_PROVENANCE", "Provenance review cannot occur after task creation");
  }
  if (
    intake.provenanceReview.status === "accepted" &&
    timestampMilliseconds(intake.provenanceReview.reviewedAt, "provenanceReview.reviewedAt") <
      latestPublishedAt
  ) {
    fail("INVALID_PROVENANCE", "Provenance review cannot predate reviewed Source metadata");
  }
}

export function prepareReviewTask(intake) {
  validateIntake(intake);
  const task = taskFromValidatedIntake(intake);
  return {
    digestAlgorithm: "canonical-json-sha256/1.0.0",
    taskDigest: canonicalJsonSha256(task),
    task,
  };
}

function intakeFromTask(task) {
  return {
    intakeContractVersion: REVIEW_WORKFLOW_VERSION,
    taskId: task.taskId,
    createdAt: task.createdAt,
    datasetVersion: task.datasetVersion,
    topicDefinitionVersion: task.topicDefinitionVersion,
    topicDefinition: task.topicDefinition,
    contentClass: task.contentClass,
    language: task.language,
    reviewers: structuredClone(task.reviewers),
    provenanceReview: structuredClone(task.provenanceReview),
    sources: structuredClone(task.sources),
    pairs: structuredClone(task.pairs),
    orderingSeed: task.ordering.seed,
    secondarySelectionSeed: task.secondaryReviewPlan.seed,
  };
}

export function validateReviewTaskEnvelope(envelope) {
  preflight(envelope, "taskEnvelope");
  assertExactFields(envelope, TASK_ENVELOPE_FIELDS, "taskEnvelope");
  if (envelope.digestAlgorithm !== "canonical-json-sha256/1.0.0") {
    fail("UNSUPPORTED_VERSION", "Task digest algorithm is unsupported");
  }
  assertDigest(envelope.taskDigest, "taskDigest");
  assertExactFields(envelope.task, TASK_FIELDS, "task");
  if (
    envelope.task.workflowVersion !== REVIEW_WORKFLOW_VERSION ||
    envelope.task.taskContractVersion !== REVIEW_TASK_VERSION
  ) {
    fail("UNSUPPORTED_VERSION", "Task contract version is unsupported");
  }
  assertExactFields(envelope.task.ordering, ORDERING_FIELDS, "task.ordering");
  assertExactFields(
    envelope.task.secondaryReviewPlan,
    SECONDARY_PLAN_FIELDS,
    "task.secondaryReviewPlan",
  );
  assertExactFields(envelope.task.scope, TASK_SCOPE_FIELDS, "task.scope");
  const expectedScope = {
    offlineOnly: true,
    corpusMaterialized: false,
    splitFrozen: false,
    heldOut: false,
    evaluationPerformed: false,
    gateEligible: false,
  };
  if (canonicalJsonSha256(envelope.task.scope) !== canonicalJsonSha256(expectedScope)) {
    fail("INVALID_SCOPE", "Review task scope must remain offline and gate-ineligible");
  }
  if (
    envelope.task.ordering.method !== "seeded-sha256-rank/1.0.0" ||
    envelope.task.secondaryReviewPlan.selectionMethod !== "seeded-sha256-rank/1.0.0" ||
    envelope.task.secondaryReviewPlan.minimumFractionMicros !== MIN_SECONDARY_REVIEW_FRACTION_MICROS
  ) {
    fail("INVALID_PLAN", "Review ordering or secondary plan is unsupported");
  }

  const regenerated = prepareReviewTask(intakeFromTask(envelope.task));
  if (canonicalJsonSha256(regenerated.task) !== canonicalJsonSha256(envelope.task)) {
    fail("TASK_TAMPERED", "Task content or derived review plan is inconsistent");
  }
  if (regenerated.taskDigest !== envelope.taskDigest) {
    fail("TASK_TAMPERED", "Task digest does not match task content");
  }
  return structuredClone(envelope);
}

export function createReviewLedger(taskEnvelope) {
  const validated = validateReviewTaskEnvelope(taskEnvelope);
  return {
    ledgerContractVersion: REVIEW_LEDGER_VERSION,
    taskDigest: validated.taskDigest,
    events: [],
  };
}

export function reviewSessionDigest(taskDigest, events) {
  assertDigest(taskDigest, "taskDigest");
  if (!Array.isArray(events)) {
    fail("INVALID_LEDGER", "events must be an array");
  }
  preflight(events, "events");
  for (const [index, record] of events.entries()) {
    assertExactFields(record, EVENT_RECORD_FIELDS, `events[${index}]`);
    assertDigest(record.eventDigest, `events[${index}].eventDigest`);
  }
  return canonicalJsonSha256({
    ledgerContractVersion: REVIEW_LEDGER_VERSION,
    taskDigest,
    eventDigests: events.map((record) => record.eventDigest),
  });
}

function validateEvent(taskEnvelope, record, index, priorDigest, seenItems, priorTime) {
  assertExactFields(record, EVENT_RECORD_FIELDS, `events[${index}]`);
  assertDigest(record.eventDigest, `events[${index}].eventDigest`);
  assertExactFields(record.event, EVENT_FIELDS, `events[${index}].event`);
  const event = record.event;
  if (event.eventContractVersion !== REVIEW_EVENT_VERSION) {
    fail("UNSUPPORTED_VERSION", `events[${index}] has an unsupported version`);
  }
  if (event.taskDigest !== taskEnvelope.taskDigest) {
    fail("TASK_BINDING_MISMATCH", `events[${index}] is bound to a different task`);
  }
  if (event.sequence !== index + 1 || !Number.isSafeInteger(event.sequence)) {
    fail("INVALID_LEDGER", `events[${index}] has an invalid sequence`);
  }
  if (event.previousEventDigest !== priorDigest) {
    fail("INVALID_LEDGER", `events[${index}] breaks the digest chain`);
  }
  if (event.role !== "primary") {
    fail("INVALID_LEDGER", "This increment accepts primary review events only");
  }
  if (!REVIEW_LABEL_SET.has(event.label)) {
    fail("INVALID_LEDGER", `events[${index}] has an unsupported label`);
  }
  if (event.rationale !== RATIONALE_BY_LABEL[event.label]) {
    fail("INVALID_LEDGER", `events[${index}] rationale is not workflow-generated`);
  }
  if (seenItems.has(event.reviewItemId)) {
    fail("DECISION_EXISTS", `${event.reviewItemId} already has a primary decision`);
  }
  if (event.reviewItemId !== taskEnvelope.task.ordering.pairIds[index]) {
    fail("ORDER_VIOLATION", `events[${index}] is outside the committed review order`);
  }
  seenItems.add(event.reviewItemId);
  assertExactFields(event.reviewer, EVENT_REVIEWER_FIELDS, `events[${index}].reviewer`);
  if (
    event.reviewer.id !== taskEnvelope.task.reviewers.primary ||
    event.reviewer.identityBasis !== "caller-declared"
  ) {
    fail("INVALID_REVIEWER", `events[${index}] has an invalid primary reviewer declaration`);
  }
  if (event.recordedAtBasis !== "local-system-clock-unattested") {
    fail("INVALID_LEDGER", `events[${index}] overstates timestamp assurance`);
  }
  const recordedTime = timestampMilliseconds(event.recordedAt, `events[${index}].recordedAt`);
  if (recordedTime < timestampMilliseconds(taskEnvelope.task.createdAt, "task.createdAt")) {
    fail("INVALID_LEDGER", `events[${index}] predates the task`);
  }
  if (recordedTime < priorTime) {
    fail("INVALID_LEDGER", `events[${index}] timestamp is not monotonic`);
  }
  if (canonicalJsonSha256(event) !== record.eventDigest) {
    fail("EVENT_TAMPERED", `events[${index}] digest does not match its content`);
  }
  return recordedTime;
}

export function validateReviewLedger(taskEnvelope, ledger) {
  const validatedTask = validateReviewTaskEnvelope(taskEnvelope);
  preflight(ledger, "ledger");
  assertExactFields(ledger, LEDGER_FIELDS, "ledger");
  if (ledger.ledgerContractVersion !== REVIEW_LEDGER_VERSION) {
    fail("UNSUPPORTED_VERSION", "Ledger contract version is unsupported");
  }
  if (ledger.taskDigest !== validatedTask.taskDigest) {
    fail("TASK_BINDING_MISMATCH", "Ledger is bound to a different task");
  }
  if (!Array.isArray(ledger.events) || ledger.events.length > validatedTask.task.pairs.length) {
    fail("INVALID_LEDGER", "Ledger events exceed the task inventory");
  }
  let priorDigest = null;
  let priorTime = Number.NEGATIVE_INFINITY;
  const seenItems = new Set();
  for (const [index, record] of ledger.events.entries()) {
    priorTime = validateEvent(
      validatedTask,
      record,
      index,
      priorDigest,
      seenItems,
      priorTime,
    );
    priorDigest = record.eventDigest;
  }
  return structuredClone(ledger);
}

function sourceForView(source) {
  return {
    url: source.url,
    title: source.title,
    factSummary: source.factSummary,
    publishedAt: source.publishedAt,
  };
}

export function nextPrimaryReviewView(taskEnvelope, ledger) {
  const task = validateReviewTaskEnvelope(taskEnvelope);
  const validatedLedger = validateReviewLedger(task, ledger);
  if (task.task.provenanceReview.status !== "accepted") {
    fail("PROVENANCE_PENDING", "Provenance must be accepted before owner review starts");
  }
  const index = validatedLedger.events.length;
  if (index === task.task.ordering.pairIds.length) {
    return null;
  }
  const itemId = task.task.ordering.pairIds[index];
  const pair = task.task.pairs.find((candidate) => candidate.id === itemId);
  const sources = new Map(task.task.sources.map((source) => [source.id, source]));
  return {
    reviewContractVersion: REVIEW_WORKFLOW_VERSION,
    taskDigest: task.taskDigest,
    position: { current: index + 1, total: task.task.ordering.pairIds.length },
    topicDefinition: {
      version: task.task.topicDefinitionVersion,
      text: task.task.topicDefinition,
    },
    reviewItem: {
      id: pair.id,
      sourceA: sourceForView(sources.get(pair.sourceAId)),
      sourceB: sourceForView(sources.get(pair.sourceBId)),
    },
    choices: [...REVIEW_LABELS],
    instruction: "Decide only whether the two Sources describe the same atomic development, different developments, or cannot be decided from this metadata.",
  };
}

export function renderReviewView(view) {
  preflight(view, "reviewView");
  return JSON.stringify(view, null, 2).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function appendPrimaryDecision(taskEnvelope, ledger, decision, recordedAt) {
  const task = validateReviewTaskEnvelope(taskEnvelope);
  const currentLedger = validateReviewLedger(task, ledger);
  preflight(decision, "decision");
  assertExactFields(decision, DECISION_FIELDS, "decision");
  const currentSessionDigest = reviewSessionDigest(task.taskDigest, currentLedger.events);
  if (decision.expectedSessionDigest !== currentSessionDigest) {
    fail("STALE_SESSION", "Review session changed after the item was presented");
  }
  const expectedItem = task.task.ordering.pairIds[currentLedger.events.length];
  if (expectedItem === undefined) {
    fail("REVIEW_COMPLETE", "All primary review items already have a decision");
  }
  if (decision.reviewItemId !== expectedItem) {
    fail("ORDER_VIOLATION", "Decision is not for the next committed review item");
  }
  if (!REVIEW_LABEL_SET.has(decision.label)) {
    fail("INVALID_LABEL", "Decision label is unsupported");
  }
  if (decision.reviewerId !== task.task.reviewers.primary) {
    fail("INVALID_REVIEWER", "Decision reviewer does not match the committed primary reviewer");
  }
  const eventTime = timestampMilliseconds(recordedAt, "recordedAt");
  const priorTime =
    currentLedger.events.length === 0
      ? timestampMilliseconds(task.task.createdAt, "task.createdAt")
      : timestampMilliseconds(
          currentLedger.events.at(-1).event.recordedAt,
          "previous recordedAt",
        );
  if (eventTime < priorTime) {
    fail("INVALID_TIMESTAMP", "Decision timestamp must not precede the task or prior event");
  }
  const event = {
    eventContractVersion: REVIEW_EVENT_VERSION,
    taskDigest: task.taskDigest,
    sequence: currentLedger.events.length + 1,
    previousEventDigest:
      currentLedger.events.length === 0
        ? null
        : currentLedger.events.at(-1).eventDigest,
    role: "primary",
    reviewItemId: decision.reviewItemId,
    label: decision.label,
    rationale: RATIONALE_BY_LABEL[decision.label],
    reviewer: {
      id: decision.reviewerId,
      identityBasis: "caller-declared",
    },
    recordedAt,
    recordedAtBasis: "local-system-clock-unattested",
  };
  const record = { event, eventDigest: canonicalJsonSha256(event) };
  const nextLedger = {
    ledgerContractVersion: REVIEW_LEDGER_VERSION,
    taskDigest: task.taskDigest,
    events: [...currentLedger.events, record],
  };
  validateReviewLedger(task, nextLedger);
  return nextLedger;
}

export function reviewCheckpoint(taskEnvelope, ledger) {
  const task = validateReviewTaskEnvelope(taskEnvelope);
  const validatedLedger = validateReviewLedger(task, ledger);
  const labelCounts = Object.fromEntries(REVIEW_LABELS.map((label) => [label, 0]));
  for (const record of validatedLedger.events) {
    labelCounts[record.event.label] += 1;
  }
  const total = task.task.ordering.pairIds.length;
  const answered = validatedLedger.events.length;
  const representedCaseTypes = new Set(task.task.pairs.map((pair) => pair.caseType));
  const requiredCaseTypesRepresented = REVIEW_CASE_TYPES.every((caseType) =>
    representedCaseTypes.has(caseType),
  );
  const unresolvedItems = validatedLedger.events
    .filter((record) => record.event.label === "uncertain")
    .map((record) => record.event.reviewItemId);
  return {
    checkpointContractVersion: REVIEW_CHECKPOINT_VERSION,
    taskDigest: task.taskDigest,
    sessionDigest: reviewSessionDigest(task.taskDigest, validatedLedger.events),
    counts: {
      total,
      answered,
      unanswered: total - answered,
      binary: labelCounts["same-topic"] + labelCounts["different-topic"],
      uncertain: labelCounts.uncertain,
      secondaryPreselected: task.task.secondaryReviewPlan.pairIds.length,
    },
    pending: {
      nextReviewItemId:
        answered < total ? task.task.ordering.pairIds[answered] : null,
      uncertainReviewItemIds: unresolvedItems,
    },
    readiness: {
      provenanceAccepted: task.task.provenanceReview.status === "accepted",
      ownerReviewComplete: answered === total,
      pairCountMinimumMet: total >= MIN_COLLECTION_PAIRS,
      requiredCaseTypesRepresented,
      pairAndCasePreparationMinimumsMet:
        total >= MIN_COLLECTION_PAIRS && requiredCaseTypesRepresented,
      secondaryReviewComplete: false,
      adjudicationComplete: false,
      corpusMaterialized: false,
      ownerCheckpointRequired: true,
    },
    scope: {
      offlineOnly: true,
      heldOut: false,
      splitFrozen: false,
      evaluationPerformed: false,
      automaticJoinDecisionMade: false,
      gateEligible: false,
    },
    assurance: {
      reviewerIdentity: "caller-declared-not-authenticated",
      timestamps: "local-system-clock-not-attested",
    },
  };
}
