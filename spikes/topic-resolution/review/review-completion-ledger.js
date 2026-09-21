import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "../evaluation/canonical-json.js";
import {
  ReviewCompletionTaskError,
  validateReviewCompletionTaskEnvelope,
} from "./review-completion-task.js";
import {
  REVIEW_LABELS,
  ReviewWorkflowError,
  reviewSessionDigest,
  validateReviewLedger,
} from "./review-workflow.js";

export const REVIEW_COMPLETION_LEDGER_CONTRACT_VERSION =
  "story-review-completion-ledger/1.0.0";
export const REVIEW_COMPLETION_EVENT_CONTRACT_VERSION =
  "story-review-completion-event/1.0.0";
export const REVIEW_COMPLETION_STATE_CONTRACT_VERSION =
  "story-review-completion-state/1.0.0";
export const SYNTHETIC_SECONDARY_REVIEW_CONTRACT_VERSION =
  "story-synthetic-secondary-review-view/1.0.0";

const MAX_ARRAY_ENTRIES = 100_000;
const MAX_DATA_NODES = 1_000_000;
const MAX_DEPTH = 24;
const MAX_OBJECT_FIELDS = 32;
const MAX_STRING_CODE_UNITS = 2_000_000;
const MAX_TIMESTAMP_CODE_UNITS = 64;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const LABEL_SET = new Set(REVIEW_LABELS);
const BINARY_LABELS = new Set(["same-topic", "different-topic"]);
const CONTEXT_FIELDS = [
  "acquisitionPlanEnvelope",
  "completionTaskEnvelope",
  "primaryLedger",
  "provenanceInventoryEnvelope",
];
const ENVELOPE_FIELDS = [
  "completionLedger",
  "completionLedgerDigest",
  "digestAlgorithm",
];
const LEDGER_FIELDS = [
  "completionLedgerContractVersion",
  "completionTaskDigest",
  "createdAt",
  "events",
  "initialCoverageActivation",
  "primaryLedgerBinding",
  "scope",
];
const PRIMARY_BINDING_FIELDS = [
  "completedAt",
  "eventCount",
  "lastEventDigest",
  "ledgerContractVersion",
  "sessionDigest",
  "taskDigest",
];
const INITIAL_ACTIVATION_FIELDS = ["basis", "effectiveAt", "pairIds"];
const SCOPE_FIELDS = [
  "adjudicationComplete",
  "corpusMaterialized",
  "evaluationPerformed",
  "fixtureOnly",
  "gateEligible",
  "heldOut",
  "independentHumanReviewVerified",
  "ownerCheckpointReached",
  "realMetadataAuthorized",
  "reserveActivationImplemented",
  "secondaryReviewComplete",
  "splitFrozen",
];
const EVENT_RECORD_FIELDS = ["event", "eventDigest"];
const EVENT_FIELDS = [
  "completionTaskDigest",
  "coverageBasis",
  "eventContractVersion",
  "eventType",
  "label",
  "previousEventDigest",
  "primaryLedgerSessionDigest",
  "projectedPrimaryEventDigest",
  "rationale",
  "recordedAt",
  "recordedAtBasis",
  "reviewItemId",
  "reviewer",
  "role",
  "sequence",
];
const REVIEWER_FIELDS = ["id", "identityBasis", "identityKind"];
const DECISION_FIELDS = [
  "expectedCompletionLedgerDigest",
  "label",
  "reviewItemId",
  "reviewerId",
];
const VIEW_FIELDS = [
  "choices",
  "completionLedgerDigest",
  "completionTaskDigest",
  "instruction",
  "position",
  "reviewContractVersion",
  "reviewItem",
  "topicDefinition",
];
const STATE_FIELDS = [
  "assurance",
  "bindings",
  "claims",
  "completionStateContractVersion",
  "counts",
  "pending",
  "workflow",
];
const RATIONALE_BY_LABEL = Object.freeze({
  "different-topic":
    "Synthetic secondary fixture decision: the Sources describe different atomic developments.",
  "same-topic":
    "Synthetic secondary fixture decision: the Sources describe the same atomic development.",
  uncertain:
    "Synthetic secondary fixture decision: the bounded metadata is insufficient for a binary relationship.",
});

export class ReviewCompletionLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReviewCompletionLedgerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReviewCompletionLedgerError(code, message);
}

function preflightData(value, state, depth, label) {
  if (depth > MAX_DEPTH) fail("RESOURCE_LIMIT", `${label} exceeds the maximum data depth`);
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) {
    fail("RESOURCE_LIMIT", "Completion-ledger data exceeds the bounded node budget");
  }
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", "Completion-ledger data exceeds the bounded string budget");
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
        fail("RESOURCE_LIMIT", "Completion-ledger data exceeds the bounded string budget");
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

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("INVALID_SCHEMA", `${label} must be a lowercase SHA-256 digest`);
  }
}

function timestampMilliseconds(value, label) {
  if (typeof value === "string" && value.length > MAX_TIMESTAMP_CODE_UNITS) {
    fail("RESOURCE_LIMIT", `${label} exceeds the timestamp string limit`);
  }
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_TIMESTAMP", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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
    realMetadataAuthorized: false,
    reserveActivationImplemented: false,
    secondaryReviewComplete: false,
    splitFrozen: false,
  };
}

function initialCoverageActivation(completionTask) {
  return {
    basis: "derived-from-completion-task-initial-precommit",
    effectiveAt: completionTask.createdAt,
    pairIds: [...completionTask.coveragePlan.initialCoveragePairIds],
  };
}

function primaryLedgerBinding(primaryTaskEnvelope, primaryLedger) {
  const lastRecord = primaryLedger.events.at(-1);
  return {
    completedAt: lastRecord.event.recordedAt,
    eventCount: primaryLedger.events.length,
    lastEventDigest: lastRecord.eventDigest,
    ledgerContractVersion: primaryLedger.ledgerContractVersion,
    sessionDigest: reviewSessionDigest(primaryTaskEnvelope.taskDigest, primaryLedger.events),
    taskDigest: primaryTaskEnvelope.taskDigest,
  };
}

function validatedContext(context) {
  preflight(context, "context");
  assertExactFields(context, CONTEXT_FIELDS, "context");
  const embeddedPrimaryTask =
    context.completionTaskEnvelope?.completionTask?.primaryTaskEnvelope;
  if (embeddedPrimaryTask === undefined) {
    fail("INVALID_CONTEXT", "Completion task does not contain its primary task envelope");
  }

  try {
    const completionTaskEnvelope = validateReviewCompletionTaskEnvelope(
      context.completionTaskEnvelope,
      embeddedPrimaryTask,
      context.acquisitionPlanEnvelope,
      context.provenanceInventoryEnvelope,
    );
    const primaryTaskEnvelope = completionTaskEnvelope.completionTask.primaryTaskEnvelope;
    const primaryLedger = validateReviewLedger(primaryTaskEnvelope, context.primaryLedger);
    const expectedCount = primaryTaskEnvelope.task.ordering.pairIds.length;
    if (primaryLedger.events.length !== expectedCount || expectedCount === 0) {
      fail(
        "PRIMARY_LEDGER_INCOMPLETE",
        "The complete primary queue is required before the secondary bridge is created",
      );
    }
    const binding = primaryLedgerBinding(primaryTaskEnvelope, primaryLedger);
    const primaryRecordByPairId = new Map(
      primaryLedger.events.map((record) => [record.event.reviewItemId, record]),
    );
    return {
      binding,
      completionTask: completionTaskEnvelope.completionTask,
      completionTaskEnvelope,
      primaryLedger,
      primaryRecordByPairId,
      primaryTaskEnvelope,
    };
  } catch (error) {
    if (error instanceof ReviewCompletionLedgerError) throw error;
    if (error instanceof ReviewCompletionTaskError || error instanceof ReviewWorkflowError) {
      fail("INVALID_CONTEXT", `Upstream ${error.code} validation failed`);
    }
    throw error;
  }
}

function makeEnvelope(completionLedger) {
  return {
    completionLedger,
    completionLedgerDigest: canonicalJsonSha256(completionLedger),
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
  };
}

function validateReviewer(reviewer, expected) {
  assertExactFields(reviewer, REVIEWER_FIELDS, "event.reviewer");
  if (canonicalJsonSha256(reviewer) !== canonicalJsonSha256(expected)) {
    fail("INVALID_REVIEWER", "Secondary event reviewer differs from the committed synthetic role");
  }
}

function validateEvent(
  derived,
  ledger,
  record,
  index,
  previousEventDigest,
  previousTime,
) {
  const label = `events[${index}]`;
  assertExactFields(record, EVENT_RECORD_FIELDS, label);
  assertDigest(record.eventDigest, `${label}.eventDigest`);
  assertExactFields(record.event, EVENT_FIELDS, `${label}.event`);
  const event = record.event;
  const expectedPairId = ledger.initialCoverageActivation.pairIds[index];
  const primaryRecord = derived.primaryRecordByPairId.get(expectedPairId);

  if (event.eventContractVersion !== REVIEW_COMPLETION_EVENT_CONTRACT_VERSION) {
    fail("UNSUPPORTED_VERSION", `${label} has an unsupported event version`);
  }
  if (
    event.eventType !== "secondary-decision" ||
    event.role !== "secondary" ||
    event.coverageBasis !== "initial-precommitted"
  ) {
    fail("INVALID_EVENT", `${label} is not a supported initial secondary decision`);
  }
  if (
    event.completionTaskDigest !== derived.completionTaskEnvelope.completionTaskDigest ||
    event.primaryLedgerSessionDigest !== derived.binding.sessionDigest
  ) {
    fail("BINDING_MISMATCH", `${label} is bound to different immutable review inputs`);
  }
  if (event.sequence !== index + 1 || event.previousEventDigest !== previousEventDigest) {
    fail("INVALID_LEDGER", `${label} breaks sequence or digest-chain order`);
  }
  if (event.reviewItemId !== expectedPairId) {
    fail("ORDER_VIOLATION", `${label} is outside the committed initial coverage order`);
  }
  if (!primaryRecord || event.projectedPrimaryEventDigest !== primaryRecord.eventDigest) {
    fail("BINDING_MISMATCH", `${label} does not bind the exact primary decision event`);
  }
  if (!BINARY_LABELS.has(primaryRecord.event.label)) {
    fail("PRIMARY_BINARY_REQUIRED", `${label} cannot follow an uncertain primary decision`);
  }
  if (!LABEL_SET.has(event.label) || event.rationale !== RATIONALE_BY_LABEL[event.label]) {
    fail("INVALID_LABEL", `${label} has an unsupported label or rationale`);
  }
  validateReviewer(event.reviewer, derived.completionTask.reviewers.secondary);
  if (event.recordedAtBasis !== "local-system-clock-unattested") {
    fail("INVALID_TIMESTAMP", `${label} overstates timestamp assurance`);
  }
  const eventTime = timestampMilliseconds(event.recordedAt, `${label}.event.recordedAt`);
  const primaryTime = timestampMilliseconds(
    primaryRecord.event.recordedAt,
    `${label}.projectedPrimary.recordedAt`,
  );
  if (eventTime < previousTime || eventTime < primaryTime) {
    fail("INVALID_TIMESTAMP", `${label} predates its ledger, predecessor, or primary decision`);
  }
  if (canonicalJsonSha256(event) !== record.eventDigest) {
    fail("EVENT_TAMPERED", `${label} digest does not match its content`);
  }
  return eventTime;
}

function validateEnvelopeInternal(context, envelope) {
  const derived = validatedContext(context);
  preflight(envelope, "completionLedgerEnvelope");
  assertExactFields(envelope, ENVELOPE_FIELDS, "completionLedgerEnvelope");
  if (envelope.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("UNSUPPORTED_VERSION", "Completion ledger digest algorithm is unsupported");
  }
  assertDigest(envelope.completionLedgerDigest, "completionLedgerEnvelope.completionLedgerDigest");
  assertExactFields(envelope.completionLedger, LEDGER_FIELDS, "completionLedger");
  const ledger = envelope.completionLedger;
  if (ledger.completionLedgerContractVersion !== REVIEW_COMPLETION_LEDGER_CONTRACT_VERSION) {
    fail("UNSUPPORTED_VERSION", "Completion ledger contract version is unsupported");
  }
  if (ledger.completionTaskDigest !== derived.completionTaskEnvelope.completionTaskDigest) {
    fail("BINDING_MISMATCH", "Completion ledger is bound to a different completion task");
  }
  const createdTime = timestampMilliseconds(ledger.createdAt, "completionLedger.createdAt");
  const completedTime = timestampMilliseconds(
    derived.binding.completedAt,
    "primaryLedgerBinding.completedAt",
  );
  if (createdTime < completedTime) {
    fail("INVALID_TIMESTAMP", "Completion ledger cannot predate completion of primary review");
  }

  assertExactFields(
    ledger.primaryLedgerBinding,
    PRIMARY_BINDING_FIELDS,
    "completionLedger.primaryLedgerBinding",
  );
  if (
    canonicalJsonSha256(ledger.primaryLedgerBinding) !==
    canonicalJsonSha256(derived.binding)
  ) {
    fail("BINDING_MISMATCH", "Primary ledger binding is not exact");
  }
  assertExactFields(
    ledger.initialCoverageActivation,
    INITIAL_ACTIVATION_FIELDS,
    "completionLedger.initialCoverageActivation",
  );
  const expectedActivation = initialCoverageActivation(derived.completionTask);
  if (
    canonicalJsonSha256(ledger.initialCoverageActivation) !==
    canonicalJsonSha256(expectedActivation)
  ) {
    fail("BINDING_MISMATCH", "Initial coverage activation differs from the task precommitment");
  }
  assertExactFields(ledger.scope, SCOPE_FIELDS, "completionLedger.scope");
  if (canonicalJsonSha256(ledger.scope) !== canonicalJsonSha256(completionScope())) {
    fail("INVALID_SCOPE", "Completion ledger must remain generated-only and gate-ineligible");
  }
  if (
    !Array.isArray(ledger.events) ||
    ledger.events.length > ledger.initialCoverageActivation.pairIds.length
  ) {
    fail("INVALID_LEDGER", "Completion events exceed the initial coverage inventory");
  }
  let previousEventDigest = null;
  let previousTime = createdTime;
  for (const [index, record] of ledger.events.entries()) {
    previousTime = validateEvent(
      derived,
      ledger,
      record,
      index,
      previousEventDigest,
      previousTime,
    );
    previousEventDigest = record.eventDigest;
  }
  if (canonicalJsonSha256(ledger) !== envelope.completionLedgerDigest) {
    fail("LEDGER_TAMPERED", "Completion ledger digest does not match its content");
  }
  return { derived, envelope: structuredClone(envelope) };
}

export function prepareReviewCompletionLedgerEnvelope(context, createdAt) {
  const derived = validatedContext(context);
  const createdTime = timestampMilliseconds(createdAt, "createdAt");
  if (
    createdTime <
    timestampMilliseconds(derived.binding.completedAt, "primaryLedgerBinding.completedAt")
  ) {
    fail("INVALID_TIMESTAMP", "Completion ledger cannot predate completion of primary review");
  }
  const completionLedger = {
    completionLedgerContractVersion: REVIEW_COMPLETION_LEDGER_CONTRACT_VERSION,
    completionTaskDigest: derived.completionTaskEnvelope.completionTaskDigest,
    createdAt,
    events: [],
    initialCoverageActivation: initialCoverageActivation(derived.completionTask),
    primaryLedgerBinding: derived.binding,
    scope: completionScope(),
  };
  const envelope = makeEnvelope(completionLedger);
  validateEnvelopeInternal(context, envelope);
  return envelope;
}

export function validateReviewCompletionLedgerEnvelope(context, envelope) {
  return validateEnvelopeInternal(context, envelope).envelope;
}

function sourceForView(source) {
  return {
    factSummary: source.factSummary,
    publishedAt: source.publishedAt,
    title: source.title,
    url: source.url,
  };
}

function nextViewFromValidated(derived, envelope) {
  const ledger = envelope.completionLedger;
  const index = ledger.events.length;
  if (index === ledger.initialCoverageActivation.pairIds.length) return null;
  const pairId = ledger.initialCoverageActivation.pairIds[index];
  const primaryRecord = derived.primaryRecordByPairId.get(pairId);
  if (!primaryRecord || !BINARY_LABELS.has(primaryRecord.event.label)) {
    fail(
      "PRIMARY_BINARY_REQUIRED",
      "The next precommitted pair needs a binary primary decision before secondary presentation",
    );
  }
  const pair = derived.primaryTaskEnvelope.task.pairs.find(({ id }) => id === pairId);
  const sourceById = new Map(
    derived.primaryTaskEnvelope.task.sources.map((source) => [source.id, source]),
  );
  return {
    choices: [...REVIEW_LABELS],
    completionLedgerDigest: envelope.completionLedgerDigest,
    completionTaskDigest: derived.completionTaskEnvelope.completionTaskDigest,
    instruction:
      "Decide only whether the two Sources describe the same atomic development, different developments, or cannot be decided from this metadata. No primary answer is shown.",
    position: {
      current: index + 1,
      total: ledger.initialCoverageActivation.pairIds.length,
    },
    reviewContractVersion: SYNTHETIC_SECONDARY_REVIEW_CONTRACT_VERSION,
    reviewItem: {
      id: pair.id,
      sourceA: sourceForView(sourceById.get(pair.sourceAId)),
      sourceB: sourceForView(sourceById.get(pair.sourceBId)),
    },
    topicDefinition: {
      text: derived.primaryTaskEnvelope.task.topicDefinition,
      version: derived.primaryTaskEnvelope.task.topicDefinitionVersion,
    },
  };
}

export function nextSyntheticSecondaryReviewView(context, envelope) {
  const validated = validateEnvelopeInternal(context, envelope);
  const view = nextViewFromValidated(validated.derived, validated.envelope);
  if (view !== null) assertExactFields(view, VIEW_FIELDS, "secondaryReviewView");
  return view;
}

export function appendSyntheticSecondaryDecision(
  context,
  envelope,
  decision,
  recordedAt,
) {
  const validated = validateEnvelopeInternal(context, envelope);
  preflight(decision, "decision");
  assertExactFields(decision, DECISION_FIELDS, "decision");
  assertDigest(decision.expectedCompletionLedgerDigest, "decision.expectedCompletionLedgerDigest");
  if (decision.expectedCompletionLedgerDigest !== envelope.completionLedgerDigest) {
    fail("STALE_SESSION", "Completion ledger changed after the item was presented");
  }
  const view = nextViewFromValidated(validated.derived, validated.envelope);
  if (view === null) {
    fail("INITIAL_PASS_COMPLETE", "Every initial coverage pair already has a secondary decision");
  }
  if (decision.reviewItemId !== view.reviewItem.id) {
    fail("ORDER_VIOLATION", "Decision is not for the next committed initial coverage pair");
  }
  if (decision.reviewerId !== validated.derived.completionTask.reviewers.secondary.id) {
    fail("INVALID_REVIEWER", "Decision reviewer does not match the committed secondary role");
  }
  if (!LABEL_SET.has(decision.label)) {
    fail("INVALID_LABEL", "Decision label is unsupported");
  }

  const ledger = validated.envelope.completionLedger;
  const priorTime =
    ledger.events.length === 0
      ? timestampMilliseconds(ledger.createdAt, "completionLedger.createdAt")
      : timestampMilliseconds(
          ledger.events.at(-1).event.recordedAt,
          "previous completion event recordedAt",
        );
  const eventTime = timestampMilliseconds(recordedAt, "recordedAt");
  const primaryRecord = validated.derived.primaryRecordByPairId.get(decision.reviewItemId);
  const primaryTime = timestampMilliseconds(
    primaryRecord.event.recordedAt,
    "projected primary recordedAt",
  );
  if (eventTime < priorTime || eventTime < primaryTime) {
    fail("INVALID_TIMESTAMP", "Secondary decision predates its ledger, predecessor, or primary event");
  }
  const event = {
    completionTaskDigest: validated.derived.completionTaskEnvelope.completionTaskDigest,
    coverageBasis: "initial-precommitted",
    eventContractVersion: REVIEW_COMPLETION_EVENT_CONTRACT_VERSION,
    eventType: "secondary-decision",
    label: decision.label,
    previousEventDigest:
      ledger.events.length === 0 ? null : ledger.events.at(-1).eventDigest,
    primaryLedgerSessionDigest: validated.derived.binding.sessionDigest,
    projectedPrimaryEventDigest: primaryRecord.eventDigest,
    rationale: RATIONALE_BY_LABEL[decision.label],
    recordedAt,
    recordedAtBasis: "local-system-clock-unattested",
    reviewItemId: decision.reviewItemId,
    reviewer: structuredClone(validated.derived.completionTask.reviewers.secondary),
    role: "secondary",
    sequence: ledger.events.length + 1,
  };
  const eventRecord = { event, eventDigest: canonicalJsonSha256(event) };
  const nextEnvelope = makeEnvelope({
    ...ledger,
    events: [...ledger.events, eventRecord],
  });
  validateEnvelopeInternal(context, nextEnvelope);
  return nextEnvelope;
}

export function reviewCompletionState(context, envelope) {
  const validated = validateEnvelopeInternal(context, envelope);
  const { derived } = validated;
  const ledger = validated.envelope.completionLedger;
  const primaryUncertain = derived.primaryLedger.events
    .filter(({ event }) => event.label === "uncertain")
    .map(({ event }) => event.reviewItemId)
    .sort(compareStrings);
  const secondaryUncertain = ledger.events
    .filter(({ event }) => event.label === "uncertain")
    .map(({ event }) => event.reviewItemId)
    .sort(compareStrings);
  const binaryEvents = ledger.events.filter(({ event }) => BINARY_LABELS.has(event.label));
  const disagreements = binaryEvents
    .filter(({ event }) => {
      const primary = derived.primaryRecordByPairId.get(event.reviewItemId);
      return primary.event.label !== event.label;
    })
    .map(({ event }) => event.reviewItemId)
    .sort(compareStrings);
  const agreementCount = binaryEvents.length - disagreements.length;
  const nextInitialSecondaryPairId =
    ledger.events.length < ledger.initialCoverageActivation.pairIds.length
      ? ledger.initialCoverageActivation.pairIds[ledger.events.length]
      : null;
  const state = {
    assurance: {
      concurrencyControl: "none-pure-contract-can-fork",
      historyAuthenticity: "unkeyed-digests-not-signatures",
      latestLedgerExternallyAnchored: false,
      reviewerIdentity: "caller-declared-synthetic-not-authenticated",
      timestamps: "local-system-clock-not-attested",
    },
    bindings: {
      completionLedgerDigest: validated.envelope.completionLedgerDigest,
      completionTaskDigest: derived.completionTaskEnvelope.completionTaskDigest,
      primaryLedgerSessionDigest: derived.binding.sessionDigest,
    },
    claims: {
      adjudicationComplete: false,
      corpusMaterialized: false,
      eligibleIndependentHumanReviewDecisions: 0,
      evaluationPerformed: false,
      gateEligible: false,
      heldOut: false,
      independentHumanReviewVerified: false,
      ownerCheckpointReached: false,
      realMetadataAuthorized: false,
      secondaryReviewComplete: false,
      splitFrozen: false,
    },
    completionStateContractVersion: REVIEW_COMPLETION_STATE_CONTRACT_VERSION,
    counts: {
      initialCoveragePairs: ledger.initialCoverageActivation.pairIds.length,
      initialSecondaryDecisions: ledger.events.length,
      primaryBinary: derived.primaryLedger.events.length - primaryUncertain.length,
      primaryUncertain: primaryUncertain.length,
      syntheticBinaryAgreements: agreementCount,
      syntheticBinaryDisagreements: disagreements.length,
      syntheticSecondaryBinary: binaryEvents.length,
      syntheticSecondaryUncertain: secondaryUncertain.length,
    },
    pending: {
      adjudicationPairIds: disagreements,
      nextInitialSecondaryPairId,
      primaryRereviewPairIds: primaryUncertain,
      reservePairIds: [...derived.completionTask.coveragePlan.reservePairIds].sort(compareStrings),
      secondaryRereviewPairIds: secondaryUncertain,
    },
    workflow: {
      initialCoverageActivationRecorded: true,
      initialSecondaryPassComplete:
        ledger.events.length === ledger.initialCoverageActivation.pairIds.length,
      primaryQueueComplete: true,
      reserveActivationImplemented: false,
      syntheticRoleSeparationValidated: true,
    },
  };
  assertExactFields(state, STATE_FIELDS, "completionState");
  return state;
}

export const REVIEW_COMPLETION_LEDGER_LIMITS = Object.freeze({
  maximumArrayEntries: MAX_ARRAY_ENTRIES,
  maximumDataNodes: MAX_DATA_NODES,
  maximumDepth: MAX_DEPTH,
  maximumStringCodeUnits: MAX_STRING_CODE_UNITS,
  maximumTimestampCodeUnits: MAX_TIMESTAMP_CODE_UNITS,
});
