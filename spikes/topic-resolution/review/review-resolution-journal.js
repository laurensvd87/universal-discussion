import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "../evaluation/canonical-json.js";
import {
  ReviewCompletionLedgerError,
  validateReviewCompletionLedgerEnvelope,
} from "./review-completion-ledger.js";
import { REVIEW_LABELS } from "./review-workflow.js";

export const GENERATED_REVIEW_RESOLUTION_JOURNAL_CONTRACT_VERSION =
  "story-review-resolution-journal/1.0.0";
export const GENERATED_REVIEW_RESOLUTION_EVENT_CONTRACT_VERSION =
  "story-review-resolution-event/1.0.0";
export const GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION =
  "story-review-resolution-action/1.0.0";
export const GENERATED_REVIEW_RESOLUTION_STATE_CONTRACT_VERSION =
  "story-review-resolution-state/1.0.0";
export const GENERATED_REVIEW_PRESENTATION_CONTRACT_VERSION =
  "story-generated-review-presentation/1.0.0";

const SUPPLEMENT_CONTRACT_VERSION = "story-generated-evidence-supplement/1.0.0";
const ROLE_REREVIEW_CONTRACT_VERSION = "story-generated-role-rereview/1.0.0";
const CONTINUED_SECONDARY_CONTRACT_VERSION =
  "story-generated-continued-secondary-decision/1.0.0";
// The accepted generated plan targets at most 250 pairs. Even if every primary
// and every initially activated secondary decision needs both a supplement and
// a rereview, the v1 journal remains below 1,000 events/records.
const MAX_ARRAY_ENTRIES = 1_000;
const MAX_DATA_NODES = 1_000_000;
const MAX_DEPTH = 28;
const MAX_OBJECT_FIELDS = 40;
const MAX_STRING_CODE_UNITS = 2_000_000;
const MAX_TIMESTAMP_CODE_UNITS = 64;
const MAX_ADDENDUM_CODE_UNITS = 2_000;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const LABEL_SET = new Set(REVIEW_LABELS);
const BINARY_LABELS = new Set(["same-topic", "different-topic"]);
const ROLE_SET = new Set(["primary", "secondary"]);

const CONTEXT_FIELDS = [
  "acquisitionPlanEnvelope",
  "baseCompletionLedgerEnvelope",
  "completionTaskEnvelope",
  "primaryLedger",
  "provenanceInventoryEnvelope",
];
const ENVELOPE_FIELDS = [
  "digestAlgorithm",
  "resolutionJournal",
  "resolutionJournalDigest",
];
const JOURNAL_FIELDS = [
  "baseSecondaryPrefix",
  "bindings",
  "createdAt",
  "events",
  "resolutionJournalContractVersion",
  "scope",
];
const BINDING_FIELDS = [
  "acquisitionPlanDigest",
  "baseCompletionLedgerDigest",
  "completionTaskDigest",
  "initialCoverageActivationDigest",
  "primaryLedgerSessionDigest",
  "primaryTaskDigest",
  "provenanceInventoryDigest",
];
const BASE_PREFIX_FIELDS = [
  "completionLedgerContractVersion",
  "eventCount",
  "lastEventDigest",
  "nextInitialCoverageIndex",
];
const SCOPE_FIELDS = [
  "adjudicationImplemented",
  "corpusMaterialized",
  "evaluationPerformed",
  "fixtureOnly",
  "gateEligible",
  "heldOut",
  "independentHumanReviewVerified",
  "ownerCheckpointReached",
  "realMetadataAuthorized",
  "reserveActivationImplemented",
  "splitFrozen",
];
const EVENT_RECORD_FIELDS = ["event", "eventDigest"];
const EVENT_FIELDS = [
  "actionDigest",
  "actor",
  "eventContractVersion",
  "eventType",
  "journalBindingsDigest",
  "payload",
  "previousEventDigest",
  "recordedAt",
  "recordedAtBasis",
  "reviewItemId",
  "sequence",
];
const REVIEWER_FIELDS = ["id", "identityBasis", "identityKind"];
const ACTION_ENVELOPE_FIELDS = ["action", "actionDigest", "digestAlgorithm"];
const ACTION_COMMON_FIELDS = [
  "actionContractVersion",
  "actionType",
  "resolutionJournalDigest",
];
const SUPPLEMENT_ACTION_FIELDS = [
  ...ACTION_COMMON_FIELDS,
  "causalUncertainEventDigest",
  "currentPresentationDigest",
  "reviewItemId",
  "reviewerId",
  "sourceIds",
  "targetRole",
];
const REREVIEW_ACTION_FIELDS = [
  ...ACTION_COMMON_FIELDS,
  "causalUncertainEventDigest",
  "evidenceSupplementEventDigest",
  "presentationDigest",
  "reviewItemId",
  "reviewView",
  "reviewerId",
  "supplementDigest",
  "targetRole",
];
const CONTINUED_ACTION_FIELDS = [
  ...ACTION_COMMON_FIELDS,
  "coverageIndex",
  "effectivePrimaryEventDigest",
  "presentationDigest",
  "reviewItemId",
  "reviewView",
  "reviewerId",
  "targetRole",
];
const ADJUDICATION_ACTION_FIELDS = [
  ...ACTION_COMMON_FIELDS,
  "primaryEventDigest",
  "reviewItemId",
  "secondaryEventDigest",
];
const COMPLETE_ACTION_FIELDS = [...ACTION_COMMON_FIELDS];
const VIEW_FIELDS = [
  "choices",
  "instruction",
  "presentationDigest",
  "reviewContractVersion",
  "reviewItem",
  "role",
  "topicDefinition",
];
const VIEW_ITEM_FIELDS = ["id", "sourceA", "sourceB"];
const VIEW_SOURCE_FIELDS = [
  "evidenceAddenda",
  "factSummary",
  "publishedAt",
  "title",
  "url",
];
const VIEW_TOPIC_FIELDS = ["text", "version"];
const SUPPLEMENT_COMMAND_FIELDS = [
  "actionDigest",
  "declarations",
  "evidenceCapturedAt",
  "expectedResolutionJournalDigest",
  "provenanceReviewedAt",
  "reviewItemId",
  "reviewerId",
  "sourceAddenda",
];
const DECISION_COMMAND_FIELDS = [
  "actionDigest",
  "expectedResolutionJournalDigest",
  "label",
  "reviewItemId",
  "reviewerId",
];
const DECLARATION_FIELDS = [
  "containsCopiedArticleText",
  "containsPersonalData",
  "projectCreatedSynthetic",
  "repositoryUseApproved",
];
const ADDENDUM_FIELDS = ["sourceId", "text"];
const PROVENANCE_REVIEW_FIELDS = ["reviewedAt", "reviewer", "status"];
const SUPPLEMENT_PAYLOAD_FIELDS = [
  "basePresentationDigest",
  "causalUncertainEventDigest",
  "declarations",
  "evidenceCapturedAt",
  "presentationDigest",
  "provenanceReview",
  "sourceAddenda",
  "supplementContractVersion",
  "supplementDigest",
  "supplementId",
  "targetRole",
];
const REREVIEW_PAYLOAD_FIELDS = [
  "causalUncertainEventDigest",
  "decisionContractVersion",
  "evidenceSupplementEventDigest",
  "outcome",
  "presentationDigest",
  "rationale",
  "supplementDigest",
  "targetRole",
];
const CONTINUED_PAYLOAD_FIELDS = [
  "coverageBasis",
  "coverageIndex",
  "decisionContractVersion",
  "label",
  "presentationDigest",
  "projectedPrimaryEventDigest",
  "rationale",
];

const SUPPLEMENT_DECLARATIONS = Object.freeze({
  containsCopiedArticleText: false,
  containsPersonalData: false,
  projectCreatedSynthetic: true,
  repositoryUseApproved: true,
});
const RATIONALE_TEXT = Object.freeze({
  "different-topic": "the Sources describe different atomic developments.",
  "same-topic": "the Sources describe the same atomic development.",
  uncertain: "the bounded metadata remains insufficient for a binary relationship.",
});

export class GeneratedReviewResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeneratedReviewResolutionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new GeneratedReviewResolutionError(code, message);
}

function preflightData(value, state, depth, label) {
  if (depth > MAX_DEPTH) fail("RESOURCE_LIMIT", `${label} exceeds the maximum data depth`);
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) {
    fail("RESOURCE_LIMIT", "Resolution-journal data exceeds the bounded node budget");
  }
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", "Resolution-journal data exceeds the bounded string budget");
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
    if (keys.length > MAX_OBJECT_FIELDS) fail("RESOURCE_LIMIT", `${label} has too many fields`);
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
        fail("RESOURCE_LIMIT", "Resolution-journal data exceeds the bounded string budget");
      }
      preflightData(descriptors[key].value, state, depth + 1, `${label}.${key}`);
    }
  }
  state.ancestors.delete(value);
}

function preflight(value, label) {
  preflightData(value, { ancestors: new Set(), nodes: 0, stringCodeUnits: 0 }, 0, label);
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

function assertBoundedSafeText(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ADDENDUM_CODE_UNITS
  ) {
    fail("INVALID_SCHEMA", `${label} must be a non-empty bounded string`);
  }
  if (UNSAFE_TEXT.test(value)) fail("UNSAFE_TEXT", `${label} contains unsafe control text`);
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

function sameValue(left, right) {
  return canonicalJsonSha256(left) === canonicalJsonSha256(right);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function generatedScope() {
  return {
    adjudicationImplemented: false,
    corpusMaterialized: false,
    evaluationPerformed: false,
    fixtureOnly: true,
    gateEligible: false,
    heldOut: false,
    independentHumanReviewVerified: false,
    ownerCheckpointReached: false,
    realMetadataAuthorized: false,
    reserveActivationImplemented: false,
    splitFrozen: false,
  };
}

function baseContextFrom(context) {
  return {
    acquisitionPlanEnvelope: context.acquisitionPlanEnvelope,
    completionTaskEnvelope: context.completionTaskEnvelope,
    primaryLedger: context.primaryLedger,
    provenanceInventoryEnvelope: context.provenanceInventoryEnvelope,
  };
}

function expectedBindings(context, baseEnvelope) {
  const task = context.completionTaskEnvelope.completionTask;
  return {
    acquisitionPlanDigest: context.acquisitionPlanEnvelope.acquisitionPlanDigest,
    baseCompletionLedgerDigest: baseEnvelope.completionLedgerDigest,
    completionTaskDigest: context.completionTaskEnvelope.completionTaskDigest,
    initialCoverageActivationDigest: canonicalJsonSha256(
      baseEnvelope.completionLedger.initialCoverageActivation,
    ),
    primaryLedgerSessionDigest:
      baseEnvelope.completionLedger.primaryLedgerBinding.sessionDigest,
    primaryTaskDigest: task.primaryTaskEnvelope.taskDigest,
    provenanceInventoryDigest:
      context.provenanceInventoryEnvelope.provenanceInventoryDigest,
  };
}

function expectedBasePrefix(baseEnvelope) {
  const ledger = baseEnvelope.completionLedger;
  return {
    completionLedgerContractVersion: ledger.completionLedgerContractVersion,
    eventCount: ledger.events.length,
    lastEventDigest: ledger.events.length === 0 ? null : ledger.events.at(-1).eventDigest,
    nextInitialCoverageIndex: ledger.events.length,
  };
}

function validatedContext(context) {
  preflight(context, "context");
  assertExactFields(context, CONTEXT_FIELDS, "context");
  try {
    const baseEnvelope = validateReviewCompletionLedgerEnvelope(
      baseContextFrom(context),
      context.baseCompletionLedgerEnvelope,
    );
    const completionTask = context.completionTaskEnvelope.completionTask;
    const primaryTaskEnvelope = completionTask.primaryTaskEnvelope;
    const primaryRecordByPairId = new Map(
      context.primaryLedger.events.map((record) => [record.event.reviewItemId, record]),
    );
    const baseSecondaryRecordByPairId = new Map(
      baseEnvelope.completionLedger.events.map((record) => [record.event.reviewItemId, record]),
    );
    const pairById = new Map(primaryTaskEnvelope.task.pairs.map((pair) => [pair.id, pair]));
    const sourceById = new Map(
      primaryTaskEnvelope.task.sources.map((source) => [source.id, source]),
    );
    return {
      baseEnvelope,
      basePrefix: expectedBasePrefix(baseEnvelope),
      baseSecondaryRecordByPairId,
      bindings: expectedBindings(context, baseEnvelope),
      completionTask,
      context,
      pairById,
      primaryRecordByPairId,
      primaryTaskEnvelope,
      sourceById,
    };
  } catch (error) {
    if (error instanceof GeneratedReviewResolutionError) throw error;
    if (error instanceof ReviewCompletionLedgerError) {
      fail("INVALID_CONTEXT", `Upstream ${error.code} validation failed`);
    }
    throw error;
  }
}

function latestBaseMilliseconds(derived) {
  const ledger = derived.baseEnvelope.completionLedger;
  return timestampMilliseconds(
    ledger.events.length === 0 ? ledger.createdAt : ledger.events.at(-1).event.recordedAt,
    "base completion ledger head time",
  );
}

function makeEnvelope(resolutionJournal) {
  return {
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    resolutionJournal,
    resolutionJournalDigest: canonicalJsonSha256(resolutionJournal),
  };
}

function makeActionEnvelope(action) {
  return {
    action,
    actionDigest: canonicalJsonSha256(action),
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
  };
}

function basePresentationForPair(derived, pairId) {
  const pair = derived.pairById.get(pairId);
  if (!pair) fail("INVALID_EVENT", `Unknown review item ${pairId}`);
  const sourceA = derived.sourceById.get(pair.sourceAId);
  const sourceB = derived.sourceById.get(pair.sourceBId);
  return {
    reviewItem: {
      id: pair.id,
      sourceA: {
        factSummary: sourceA.factSummary,
        publishedAt: sourceA.publishedAt,
        title: sourceA.title,
        url: sourceA.url,
      },
      sourceB: {
        factSummary: sourceB.factSummary,
        publishedAt: sourceB.publishedAt,
        title: sourceB.title,
        url: sourceB.url,
      },
    },
    topicDefinition: {
      text: derived.primaryTaskEnvelope.task.topicDefinition,
      version: derived.primaryTaskEnvelope.task.topicDefinitionVersion,
    },
  };
}

function basePresentationDigest(derived, pairId) {
  return canonicalJsonSha256(basePresentationForPair(derived, pairId));
}

function journalRecords(envelope, eventType) {
  return envelope.resolutionJournal.events.filter(
    ({ event }) => eventType === undefined || event.eventType === eventType,
  );
}

function supplementsForPair(envelope, pairId) {
  return journalRecords(envelope, "evidence-supplement").filter(
    ({ event }) => event.reviewItemId === pairId,
  );
}

function presentationDigestForPair(derived, envelope, pairId) {
  return canonicalJsonSha256({
    basePresentationDigest: basePresentationDigest(derived, pairId),
    supplementDigests: supplementsForPair(envelope, pairId).map(
      ({ event }) => event.payload.supplementDigest,
    ),
  });
}

function addendaForSource(envelope, pairId, sourceId) {
  return supplementsForPair(envelope, pairId)
    .map(({ event }) =>
      event.payload.sourceAddenda.find((addendum) => addendum.sourceId === sourceId),
    )
    .filter(Boolean)
    .map(({ text }) => text);
}

function reviewView(derived, envelope, pairId, role) {
  const base = basePresentationForPair(derived, pairId);
  const pair = derived.pairById.get(pairId);
  const view = {
    choices: [...REVIEW_LABELS],
    instruction:
      "Decide only whether the two Sources describe the same atomic development, different developments, or cannot be decided from this bounded metadata. No earlier answer is shown.",
    presentationDigest: presentationDigestForPair(derived, envelope, pairId),
    reviewContractVersion: GENERATED_REVIEW_PRESENTATION_CONTRACT_VERSION,
    reviewItem: {
      id: base.reviewItem.id,
      sourceA: {
        evidenceAddenda: addendaForSource(envelope, pairId, pair.sourceAId),
        ...base.reviewItem.sourceA,
      },
      sourceB: {
        evidenceAddenda: addendaForSource(envelope, pairId, pair.sourceBId),
        ...base.reviewItem.sourceB,
      },
    },
    role,
    topicDefinition: base.topicDefinition,
  };
  validateReviewView(view, pairId, role);
  return view;
}

function validateReviewView(view, pairId, role) {
  assertExactFields(view, VIEW_FIELDS, "reviewView");
  if (
    view.reviewContractVersion !== GENERATED_REVIEW_PRESENTATION_CONTRACT_VERSION ||
    view.role !== role ||
    !ROLE_SET.has(role)
  ) {
    fail("INVALID_VIEW", "Review view has an invalid version or role");
  }
  assertDigest(view.presentationDigest, "reviewView.presentationDigest");
  if (!Array.isArray(view.choices) || !sameValue(view.choices, REVIEW_LABELS)) {
    fail("INVALID_VIEW", "Review choices differ from the frozen relationship labels");
  }
  if (typeof view.instruction !== "string" || view.instruction.length === 0) {
    fail("INVALID_VIEW", "Review view instruction is missing");
  }
  assertExactFields(view.reviewItem, VIEW_ITEM_FIELDS, "reviewView.reviewItem");
  if (view.reviewItem.id !== pairId) fail("INVALID_VIEW", "Review view item differs");
  for (const field of ["sourceA", "sourceB"]) {
    const source = view.reviewItem[field];
    assertExactFields(source, VIEW_SOURCE_FIELDS, `reviewView.reviewItem.${field}`);
    if (!Array.isArray(source.evidenceAddenda)) {
      fail("INVALID_VIEW", "Review evidence addenda must be an array");
    }
    for (const text of source.evidenceAddenda) {
      assertBoundedSafeText(text, `reviewView.reviewItem.${field}.evidenceAddenda`);
    }
  }
  assertExactFields(view.topicDefinition, VIEW_TOPIC_FIELDS, "reviewView.topicDefinition");
}

function resolutionRecord(envelope, pairId, role) {
  return journalRecords(envelope, "role-rereview-decision").find(
    ({ event }) =>
      event.reviewItemId === pairId && event.payload.targetRole === role,
  );
}

function supplementRecord(envelope, pairId, role) {
  return journalRecords(envelope, "evidence-supplement").find(
    ({ event }) =>
      event.reviewItemId === pairId && event.payload.targetRole === role,
  );
}

function continuedSecondaryRecord(envelope, pairId) {
  return journalRecords(envelope, "continued-initial-secondary-decision").find(
    ({ event }) => event.reviewItemId === pairId,
  );
}

function decisionReference(record, kind) {
  if (!record) return null;
  if (kind === "primary" || kind === "base-secondary") {
    return {
      eventDigest: record.eventDigest,
      label: record.event.label,
      recordedAt: record.event.recordedAt,
    };
  }
  if (kind === "rereview") {
    return {
      eventDigest: record.eventDigest,
      label: record.event.payload.outcome,
      recordedAt: record.event.recordedAt,
    };
  }
  if (kind === "continued-secondary") {
    return {
      eventDigest: record.eventDigest,
      label: record.event.payload.label,
      recordedAt: record.event.recordedAt,
    };
  }
  fail("INVALID_EVENT", `Unsupported decision reference kind ${kind}`);
}

function roleStatus(derived, envelope, pairId, role) {
  const originalRecord =
    role === "primary"
      ? derived.primaryRecordByPairId.get(pairId)
      : derived.baseSecondaryRecordByPairId.get(pairId) ??
        continuedSecondaryRecord(envelope, pairId);
  const originalKind =
    role === "primary"
      ? "primary"
      : derived.baseSecondaryRecordByPairId.has(pairId)
        ? "base-secondary"
        : "continued-secondary";
  const original = decisionReference(originalRecord, originalKind);
  if (!original) return { status: "missing" };
  if (BINARY_LABELS.has(original.label)) {
    return { decision: original, status: "binary" };
  }
  if (original.label !== "uncertain") fail("INVALID_EVENT", "Decision label is unsupported");
  const rereviewRecord = resolutionRecord(envelope, pairId, role);
  if (!rereviewRecord) {
    return {
      causalUncertain: original,
      status: supplementRecord(envelope, pairId, role)
        ? "supplemented-uncertain"
        : "uncertain",
    };
  }
  const rereview = decisionReference(rereviewRecord, "rereview");
  if (rereview.label === "uncertain") {
    return {
      causalUncertain: original,
      decision: rereview,
      exclusionReason:
        role === "primary"
          ? "primary-remained-unresolved-after-supplement"
          : "secondary-remained-unresolved-after-supplement",
      status: "excluded",
    };
  }
  return { causalUncertain: original, decision: rereview, status: "binary" };
}

function allExclusions(derived, envelope) {
  const exclusions = [];
  for (const pairId of derived.primaryTaskEnvelope.task.ordering.pairIds) {
    const primary = roleStatus(derived, envelope, pairId, "primary");
    if (primary.status === "excluded") {
      exclusions.push({ reason: primary.exclusionReason, reviewItemId: pairId });
      continue;
    }
    const secondary = roleStatus(derived, envelope, pairId, "secondary");
    if (secondary.status === "excluded") {
      exclusions.push({ reason: secondary.exclusionReason, reviewItemId: pairId });
    }
  }
  return exclusions;
}

function supplementAction(derived, envelope, pairId, role, uncertain) {
  const pair = derived.pairById.get(pairId);
  return makeActionEnvelope({
    actionContractVersion: GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION,
    actionType: "evidence-supplement-required",
    causalUncertainEventDigest: uncertain.eventDigest,
    currentPresentationDigest: presentationDigestForPair(derived, envelope, pairId),
    resolutionJournalDigest: envelope.resolutionJournalDigest,
    reviewItemId: pairId,
    reviewerId: derived.completionTask.reviewers.provenance.id,
    sourceIds: [pair.sourceAId, pair.sourceBId],
    targetRole: role,
  });
}

function rereviewAction(derived, envelope, pairId, role, uncertain, supplement) {
  const view = reviewView(derived, envelope, pairId, role);
  return makeActionEnvelope({
    actionContractVersion: GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION,
    actionType: "role-rereview-required",
    causalUncertainEventDigest: uncertain.eventDigest,
    evidenceSupplementEventDigest: supplement.eventDigest,
    presentationDigest: view.presentationDigest,
    resolutionJournalDigest: envelope.resolutionJournalDigest,
    reviewItemId: pairId,
    reviewerId: derived.completionTask.reviewers[role].id,
    reviewView: view,
    supplementDigest: supplement.event.payload.supplementDigest,
    targetRole: role,
  });
}

function continuedSecondaryAction(derived, envelope, pairId, coverageIndex, primary) {
  const view = reviewView(derived, envelope, pairId, "secondary");
  return makeActionEnvelope({
    actionContractVersion: GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION,
    actionType: "continued-initial-secondary-required",
    coverageIndex,
    effectivePrimaryEventDigest: primary.decision.eventDigest,
    presentationDigest: view.presentationDigest,
    resolutionJournalDigest: envelope.resolutionJournalDigest,
    reviewItemId: pairId,
    reviewerId: derived.completionTask.reviewers.secondary.id,
    reviewView: view,
    targetRole: "secondary",
  });
}

function adjudicationAction(envelope, pairId, primary, secondary) {
  return makeActionEnvelope({
    actionContractVersion: GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION,
    actionType: "adjudication-required",
    primaryEventDigest: primary.decision.eventDigest,
    resolutionJournalDigest: envelope.resolutionJournalDigest,
    reviewItemId: pairId,
    secondaryEventDigest: secondary.decision.eventDigest,
  });
}

function completeAction(envelope) {
  return makeActionEnvelope({
    actionContractVersion: GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION,
    actionType: "initial-resolution-complete",
    resolutionJournalDigest: envelope.resolutionJournalDigest,
  });
}

function nextActionFromValidated(derived, envelope) {
  for (const pairId of derived.primaryTaskEnvelope.task.ordering.pairIds) {
    const primary = roleStatus(derived, envelope, pairId, "primary");
    if (primary.status === "uncertain") {
      return supplementAction(derived, envelope, pairId, "primary", primary.causalUncertain);
    }
    if (primary.status === "supplemented-uncertain") {
      return rereviewAction(
        derived,
        envelope,
        pairId,
        "primary",
        primary.causalUncertain,
        supplementRecord(envelope, pairId, "primary"),
      );
    }
  }

  const activationPairIds =
    derived.baseEnvelope.completionLedger.initialCoverageActivation.pairIds;
  for (
    let coverageIndex = derived.basePrefix.nextInitialCoverageIndex;
    coverageIndex < activationPairIds.length;
    coverageIndex += 1
  ) {
    const pairId = activationPairIds[coverageIndex];
    const primary = roleStatus(derived, envelope, pairId, "primary");
    if (primary.status === "excluded") continue;
    if (primary.status !== "binary") {
      fail("INVALID_STATE", "Initial secondary review lacks a terminal primary state");
    }
    if (!continuedSecondaryRecord(envelope, pairId)) {
      return continuedSecondaryAction(derived, envelope, pairId, coverageIndex, primary);
    }
  }

  for (const pairId of activationPairIds) {
    const primary = roleStatus(derived, envelope, pairId, "primary");
    if (primary.status === "excluded") continue;
    const secondary = roleStatus(derived, envelope, pairId, "secondary");
    if (secondary.status === "uncertain") {
      return supplementAction(
        derived,
        envelope,
        pairId,
        "secondary",
        secondary.causalUncertain,
      );
    }
    if (secondary.status === "supplemented-uncertain") {
      return rereviewAction(
        derived,
        envelope,
        pairId,
        "secondary",
        secondary.causalUncertain,
        supplementRecord(envelope, pairId, "secondary"),
      );
    }
  }

  for (const pairId of activationPairIds) {
    const primary = roleStatus(derived, envelope, pairId, "primary");
    const secondary = roleStatus(derived, envelope, pairId, "secondary");
    if (
      primary.status === "binary" &&
      secondary.status === "binary" &&
      primary.decision.label !== secondary.decision.label
    ) {
      return adjudicationAction(envelope, pairId, primary, secondary);
    }
  }
  return completeAction(envelope);
}

function validateActionEnvelope(actionEnvelope) {
  assertExactFields(actionEnvelope, ACTION_ENVELOPE_FIELDS, "nextAction");
  if (actionEnvelope.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("UNSUPPORTED_VERSION", "Action digest algorithm is unsupported");
  }
  assertDigest(actionEnvelope.actionDigest, "nextAction.actionDigest");
  if (canonicalJsonSha256(actionEnvelope.action) !== actionEnvelope.actionDigest) {
    fail("ACTION_TAMPERED", "Action digest does not match its content");
  }
  const { action } = actionEnvelope;
  const fieldsByType = {
    "adjudication-required": ADJUDICATION_ACTION_FIELDS,
    "continued-initial-secondary-required": CONTINUED_ACTION_FIELDS,
    "evidence-supplement-required": SUPPLEMENT_ACTION_FIELDS,
    "initial-resolution-complete": COMPLETE_ACTION_FIELDS,
    "role-rereview-required": REREVIEW_ACTION_FIELDS,
  };
  const fields = fieldsByType[action?.actionType];
  if (!fields) fail("INVALID_ACTION", "Action type is unsupported");
  assertExactFields(action, fields, "nextAction.action");
  if (action.actionContractVersion !== GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION) {
    fail("UNSUPPORTED_VERSION", "Action contract version is unsupported");
  }
  assertDigest(action.resolutionJournalDigest, "nextAction.action.resolutionJournalDigest");
  if (Object.hasOwn(action, "reviewView")) {
    validateReviewView(action.reviewView, action.reviewItemId, action.targetRole);
  }
  return actionEnvelope;
}

function validateReviewer(value, expected, label) {
  assertExactFields(value, REVIEWER_FIELDS, label);
  if (!sameValue(value, expected)) fail("INVALID_REVIEWER", `${label} differs from the committed role`);
}

function rationaleFor(role, label) {
  return `Synthetic ${role} fixture decision: ${RATIONALE_TEXT[label]}`;
}

function eventTimeByDigest(derived, envelope, digest) {
  for (const record of derived.context.primaryLedger.events) {
    if (record.eventDigest === digest) return timestampMilliseconds(record.event.recordedAt, "primary event time");
  }
  for (const record of derived.baseEnvelope.completionLedger.events) {
    if (record.eventDigest === digest) return timestampMilliseconds(record.event.recordedAt, "base secondary event time");
  }
  for (const record of envelope.resolutionJournal.events) {
    if (record.eventDigest === digest) return timestampMilliseconds(record.event.recordedAt, "journal event time");
  }
  fail("BINDING_MISMATCH", "Causal event digest is not present in the bound history");
}

function validateDeclarations(value, label) {
  assertExactFields(value, DECLARATION_FIELDS, label);
  if (!sameValue(value, SUPPLEMENT_DECLARATIONS)) {
    fail("INVALID_PROVENANCE", "Supplement declarations must retain the generated-only boundary");
  }
}

function validateSourceAddenda(sourceAddenda, sourceIds, label) {
  if (!Array.isArray(sourceAddenda) || sourceAddenda.length !== 2) {
    fail("INVALID_SUPPLEMENT", `${label} must contain the two pair Sources exactly once`);
  }
  for (const [index, addendum] of sourceAddenda.entries()) {
    assertExactFields(addendum, ADDENDUM_FIELDS, `${label}[${index}]`);
    if (addendum.sourceId !== sourceIds[index]) {
      fail("INVALID_SUPPLEMENT", `${label} must follow the immutable pair endpoint order`);
    }
    assertBoundedSafeText(addendum.text, `${label}[${index}].text`);
  }
}

function expectedSupplementId(pairId, role) {
  return `generated-supplement/${role}/${pairId}`;
}

function supplementCore(payload) {
  return {
    basePresentationDigest: payload.basePresentationDigest,
    causalUncertainEventDigest: payload.causalUncertainEventDigest,
    declarations: payload.declarations,
    evidenceCapturedAt: payload.evidenceCapturedAt,
    provenanceReview: payload.provenanceReview,
    sourceAddenda: payload.sourceAddenda,
    supplementContractVersion: payload.supplementContractVersion,
    supplementId: payload.supplementId,
    targetRole: payload.targetRole,
  };
}

function validateSupplementEvent(derived, prefixEnvelope, event, action, eventTime) {
  assertExactFields(event.payload, SUPPLEMENT_PAYLOAD_FIELDS, "supplement event payload");
  const payload = event.payload;
  if (
    payload.supplementContractVersion !== SUPPLEMENT_CONTRACT_VERSION ||
    payload.targetRole !== action.targetRole ||
    payload.causalUncertainEventDigest !== action.causalUncertainEventDigest ||
    payload.supplementId !== expectedSupplementId(event.reviewItemId, action.targetRole)
  ) {
    fail("BINDING_MISMATCH", "Supplement payload differs from the required uncertainty obligation");
  }
  assertDigest(payload.causalUncertainEventDigest, "supplement.causalUncertainEventDigest");
  assertDigest(payload.basePresentationDigest, "supplement.basePresentationDigest");
  assertDigest(payload.supplementDigest, "supplement.supplementDigest");
  assertDigest(payload.presentationDigest, "supplement.presentationDigest");
  const expectedBaseDigest = basePresentationDigest(derived, event.reviewItemId);
  if (
    payload.basePresentationDigest !== expectedBaseDigest ||
    action.currentPresentationDigest !==
      presentationDigestForPair(derived, prefixEnvelope, event.reviewItemId)
  ) {
    fail("BINDING_MISMATCH", "Supplement is bound to a different safe presentation");
  }
  validateDeclarations(payload.declarations, "supplement.declarations");
  validateSourceAddenda(payload.sourceAddenda, action.sourceIds, "supplement.sourceAddenda");
  assertExactFields(payload.provenanceReview, PROVENANCE_REVIEW_FIELDS, "supplement.provenanceReview");
  validateReviewer(
    payload.provenanceReview.reviewer,
    derived.completionTask.reviewers.provenance,
    "supplement.provenanceReview.reviewer",
  );
  if (payload.provenanceReview.status !== "accepted") {
    fail("INVALID_PROVENANCE", "Supplement provenance review must be accepted");
  }
  validateReviewer(event.actor, derived.completionTask.reviewers.provenance, "event.actor");

  const causalTime = eventTimeByDigest(
    derived,
    prefixEnvelope,
    payload.causalUncertainEventDigest,
  );
  const evidenceTime = timestampMilliseconds(payload.evidenceCapturedAt, "supplement.evidenceCapturedAt");
  const reviewedTime = timestampMilliseconds(
    payload.provenanceReview.reviewedAt,
    "supplement.provenanceReview.reviewedAt",
  );
  if (evidenceTime < causalTime || reviewedTime < evidenceTime || eventTime < reviewedTime) {
    fail("INVALID_TIMESTAMP", "Supplement capture, review, and recording chronology is invalid");
  }
  const expectedSupplementDigest = canonicalJsonSha256(supplementCore(payload));
  if (payload.supplementDigest !== expectedSupplementDigest) {
    fail("EVENT_TAMPERED", "Supplement digest does not match its immutable evidence payload");
  }
  const expectedPresentationDigest = canonicalJsonSha256({
    basePresentationDigest: expectedBaseDigest,
    supplementDigests: [
      ...supplementsForPair(prefixEnvelope, event.reviewItemId).map(
        ({ event: priorEvent }) => priorEvent.payload.supplementDigest,
      ),
      payload.supplementDigest,
    ],
  });
  if (payload.presentationDigest !== expectedPresentationDigest) {
    fail("BINDING_MISMATCH", "Supplement presentation digest is not the ordered evidence projection");
  }
}

function validateRereviewEvent(derived, prefixEnvelope, event, action, eventTime) {
  assertExactFields(event.payload, REREVIEW_PAYLOAD_FIELDS, "rereview event payload");
  const payload = event.payload;
  if (
    payload.decisionContractVersion !== ROLE_REREVIEW_CONTRACT_VERSION ||
    payload.targetRole !== action.targetRole ||
    payload.causalUncertainEventDigest !== action.causalUncertainEventDigest ||
    payload.evidenceSupplementEventDigest !== action.evidenceSupplementEventDigest ||
    payload.supplementDigest !== action.supplementDigest ||
    payload.presentationDigest !== action.presentationDigest
  ) {
    fail("BINDING_MISMATCH", "Rereview event differs from the required action");
  }
  for (const [value, label] of [
    [payload.causalUncertainEventDigest, "rereview.causalUncertainEventDigest"],
    [payload.evidenceSupplementEventDigest, "rereview.evidenceSupplementEventDigest"],
    [payload.supplementDigest, "rereview.supplementDigest"],
    [payload.presentationDigest, "rereview.presentationDigest"],
  ]) {
    assertDigest(value, label);
  }
  if (!LABEL_SET.has(payload.outcome) || payload.rationale !== rationaleFor(action.targetRole, payload.outcome)) {
    fail("INVALID_LABEL", "Rereview outcome or rationale is unsupported");
  }
  validateReviewer(event.actor, derived.completionTask.reviewers[action.targetRole], "event.actor");
  const causalTime = eventTimeByDigest(
    derived,
    prefixEnvelope,
    payload.causalUncertainEventDigest,
  );
  const supplementTime = eventTimeByDigest(
    derived,
    prefixEnvelope,
    payload.evidenceSupplementEventDigest,
  );
  if (eventTime < causalTime || eventTime < supplementTime) {
    fail("INVALID_TIMESTAMP", "Rereview predates its uncertainty or evidence supplement");
  }
}

function validateContinuedSecondaryEvent(derived, prefixEnvelope, event, action, eventTime) {
  assertExactFields(event.payload, CONTINUED_PAYLOAD_FIELDS, "continued secondary payload");
  const payload = event.payload;
  if (
    payload.decisionContractVersion !== CONTINUED_SECONDARY_CONTRACT_VERSION ||
    payload.coverageBasis !== "initial-precommitted" ||
    payload.coverageIndex !== action.coverageIndex ||
    payload.projectedPrimaryEventDigest !== action.effectivePrimaryEventDigest ||
    payload.presentationDigest !== action.presentationDigest
  ) {
    fail("BINDING_MISMATCH", "Continued secondary event differs from the committed next item");
  }
  assertDigest(payload.projectedPrimaryEventDigest, "continued.projectedPrimaryEventDigest");
  assertDigest(payload.presentationDigest, "continued.presentationDigest");
  if (!LABEL_SET.has(payload.label) || payload.rationale !== rationaleFor("secondary", payload.label)) {
    fail("INVALID_LABEL", "Continued secondary label or rationale is unsupported");
  }
  validateReviewer(event.actor, derived.completionTask.reviewers.secondary, "event.actor");
  const primaryTime = eventTimeByDigest(
    derived,
    prefixEnvelope,
    payload.projectedPrimaryEventDigest,
  );
  if (eventTime < primaryTime) {
    fail("INVALID_TIMESTAMP", "Continued secondary decision predates its effective primary decision");
  }
}

function validateEventRecord(
  derived,
  prefixEnvelope,
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
  if (event.eventContractVersion !== GENERATED_REVIEW_RESOLUTION_EVENT_CONTRACT_VERSION) {
    fail("UNSUPPORTED_VERSION", `${label} has an unsupported event version`);
  }
  const actionEnvelope = validateActionEnvelope(
    nextActionFromValidated(derived, prefixEnvelope),
  );
  const { action } = actionEnvelope;
  if (
    event.actionDigest !== actionEnvelope.actionDigest ||
    event.reviewItemId !== action.reviewItemId
  ) {
    fail("ACTION_MISMATCH", `${label} does not implement the sole next action`);
  }
  const eventTypeByAction = {
    "continued-initial-secondary-required": "continued-initial-secondary-decision",
    "evidence-supplement-required": "evidence-supplement",
    "role-rereview-required": "role-rereview-decision",
  };
  if (!eventTypeByAction[action.actionType] || event.eventType !== eventTypeByAction[action.actionType]) {
    fail("INVALID_TRANSITION", `${label} cannot implement ${action.actionType}`);
  }
  assertDigest(event.actionDigest, `${label}.event.actionDigest`);
  assertDigest(event.journalBindingsDigest, `${label}.event.journalBindingsDigest`);
  if (event.journalBindingsDigest !== canonicalJsonSha256(derived.bindings)) {
    fail("BINDING_MISMATCH", `${label} is bound to different immutable inputs`);
  }
  const expectedSequence = derived.basePrefix.eventCount + index + 1;
  if (event.sequence !== expectedSequence || event.previousEventDigest !== previousEventDigest) {
    fail("INVALID_JOURNAL", `${label} breaks the global sequence or predecessor chain`);
  }
  if (event.recordedAtBasis !== "local-system-clock-unattested") {
    fail("INVALID_TIMESTAMP", `${label} overstates timestamp assurance`);
  }
  const eventTime = timestampMilliseconds(event.recordedAt, `${label}.event.recordedAt`);
  if (eventTime < previousTime) fail("INVALID_TIMESTAMP", `${label} predates its predecessor`);

  if (event.eventType === "evidence-supplement") {
    validateSupplementEvent(derived, prefixEnvelope, event, action, eventTime);
  } else if (event.eventType === "role-rereview-decision") {
    validateRereviewEvent(derived, prefixEnvelope, event, action, eventTime);
  } else {
    validateContinuedSecondaryEvent(derived, prefixEnvelope, event, action, eventTime);
  }
  if (canonicalJsonSha256(event) !== record.eventDigest) {
    fail("EVENT_TAMPERED", `${label} digest does not match its content`);
  }
  return eventTime;
}

function validateEnvelopeInternal(context, envelope) {
  const derived = validatedContext(context);
  preflight(envelope, "resolutionJournalEnvelope");
  assertExactFields(envelope, ENVELOPE_FIELDS, "resolutionJournalEnvelope");
  if (envelope.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("UNSUPPORTED_VERSION", "Resolution journal digest algorithm is unsupported");
  }
  assertDigest(envelope.resolutionJournalDigest, "resolutionJournalEnvelope.resolutionJournalDigest");
  assertExactFields(envelope.resolutionJournal, JOURNAL_FIELDS, "resolutionJournal");
  const journal = envelope.resolutionJournal;
  if (
    journal.resolutionJournalContractVersion !==
    GENERATED_REVIEW_RESOLUTION_JOURNAL_CONTRACT_VERSION
  ) {
    fail("UNSUPPORTED_VERSION", "Resolution journal contract version is unsupported");
  }
  const createdTime = timestampMilliseconds(journal.createdAt, "resolutionJournal.createdAt");
  if (createdTime < latestBaseMilliseconds(derived)) {
    fail("INVALID_TIMESTAMP", "Resolution journal cannot predate its frozen base ledger head");
  }
  assertExactFields(journal.bindings, BINDING_FIELDS, "resolutionJournal.bindings");
  if (!sameValue(journal.bindings, derived.bindings)) {
    fail("BINDING_MISMATCH", "Resolution journal bindings do not match the immutable inputs");
  }
  assertExactFields(journal.baseSecondaryPrefix, BASE_PREFIX_FIELDS, "resolutionJournal.baseSecondaryPrefix");
  if (!sameValue(journal.baseSecondaryPrefix, derived.basePrefix)) {
    fail("BINDING_MISMATCH", "Resolution journal does not freeze the exact base secondary prefix");
  }
  assertExactFields(journal.scope, SCOPE_FIELDS, "resolutionJournal.scope");
  if (!sameValue(journal.scope, generatedScope())) {
    fail("INVALID_SCOPE", "Resolution journal must remain generated-only and gate-ineligible");
  }
  if (!Array.isArray(journal.events) || journal.events.length > MAX_ARRAY_ENTRIES) {
    fail("RESOURCE_LIMIT", "Resolution journal events exceed the bounded inventory");
  }

  let previousEventDigest = derived.basePrefix.lastEventDigest;
  let previousTime = createdTime;
  let prefixEnvelope = makeEnvelope({ ...journal, events: [] });
  for (const [index, record] of journal.events.entries()) {
    previousTime = validateEventRecord(
      derived,
      prefixEnvelope,
      record,
      index,
      previousEventDigest,
      previousTime,
    );
    previousEventDigest = record.eventDigest;
    prefixEnvelope = makeEnvelope({
      ...journal,
      events: [...prefixEnvelope.resolutionJournal.events, structuredClone(record)],
    });
  }
  if (canonicalJsonSha256(journal) !== envelope.resolutionJournalDigest) {
    fail("JOURNAL_TAMPERED", "Resolution journal digest does not match its content");
  }
  return { derived, envelope: structuredClone(envelope) };
}

export function prepareGeneratedResolutionJournalEnvelope(context, createdAt) {
  const derived = validatedContext(context);
  const createdTime = timestampMilliseconds(createdAt, "createdAt");
  if (createdTime < latestBaseMilliseconds(derived)) {
    fail("INVALID_TIMESTAMP", "Resolution journal cannot predate its frozen base ledger head");
  }
  const resolutionJournal = {
    baseSecondaryPrefix: derived.basePrefix,
    bindings: derived.bindings,
    createdAt,
    events: [],
    resolutionJournalContractVersion:
      GENERATED_REVIEW_RESOLUTION_JOURNAL_CONTRACT_VERSION,
    scope: generatedScope(),
  };
  const envelope = makeEnvelope(resolutionJournal);
  validateEnvelopeInternal(context, envelope);
  return envelope;
}

export function validateGeneratedResolutionJournalEnvelope(context, envelope) {
  return validateEnvelopeInternal(context, envelope).envelope;
}

export function nextGeneratedReviewAction(context, envelope) {
  const validated = validateEnvelopeInternal(context, envelope);
  return validateActionEnvelope(
    nextActionFromValidated(validated.derived, validated.envelope),
  );
}

function validateCommandHead(derived, envelope, command, fields, expectedActionType) {
  preflight(command, "command");
  assertExactFields(command, fields, "command");
  assertDigest(command.expectedResolutionJournalDigest, "command.expectedResolutionJournalDigest");
  assertDigest(command.actionDigest, "command.actionDigest");
  if (command.expectedResolutionJournalDigest !== envelope.resolutionJournalDigest) {
    fail("STALE_SESSION", "Resolution journal changed after the action was projected");
  }
  const actionEnvelope = validateActionEnvelope(
    nextActionFromValidated(derived, envelope),
  );
  if (actionEnvelope.action.actionType !== expectedActionType) {
    fail("INVALID_TRANSITION", `The next action is ${actionEnvelope.action.actionType}`);
  }
  if (command.actionDigest !== actionEnvelope.actionDigest) {
    fail("ACTION_MISMATCH", "Command does not bind the exact next action");
  }
  if (command.reviewItemId !== actionEnvelope.action.reviewItemId) {
    fail("ORDER_VIOLATION", "Command is not for the projected review item");
  }
  return actionEnvelope;
}

function appendEvent(derived, envelope, actionEnvelope, eventType, actor, payload, recordedAt) {
  const journal = envelope.resolutionJournal;
  const event = {
    actionDigest: actionEnvelope.actionDigest,
    actor: structuredClone(actor),
    eventContractVersion: GENERATED_REVIEW_RESOLUTION_EVENT_CONTRACT_VERSION,
    eventType,
    journalBindingsDigest: canonicalJsonSha256(derived.bindings),
    payload,
    previousEventDigest:
      journal.events.length === 0
        ? derived.basePrefix.lastEventDigest
        : journal.events.at(-1).eventDigest,
    recordedAt,
    recordedAtBasis: "local-system-clock-unattested",
    reviewItemId: actionEnvelope.action.reviewItemId,
    sequence: derived.basePrefix.eventCount + journal.events.length + 1,
  };
  const record = { event, eventDigest: canonicalJsonSha256(event) };
  const nextEnvelope = makeEnvelope({
    ...journal,
    events: [...journal.events, record],
  });
  validateEnvelopeInternal(derived.context, nextEnvelope);
  return nextEnvelope;
}

export function appendGeneratedEvidenceSupplement(
  context,
  envelope,
  command,
  recordedAt,
) {
  const validated = validateEnvelopeInternal(context, envelope);
  const actionEnvelope = validateCommandHead(
    validated.derived,
    validated.envelope,
    command,
    SUPPLEMENT_COMMAND_FIELDS,
    "evidence-supplement-required",
  );
  const { action } = actionEnvelope;
  if (command.reviewerId !== action.reviewerId) {
    fail("INVALID_REVIEWER", "Supplement must be recorded by the committed provenance role");
  }
  validateDeclarations(command.declarations, "command.declarations");
  validateSourceAddenda(command.sourceAddenda, action.sourceIds, "command.sourceAddenda");
  timestampMilliseconds(command.evidenceCapturedAt, "command.evidenceCapturedAt");
  timestampMilliseconds(command.provenanceReviewedAt, "command.provenanceReviewedAt");
  timestampMilliseconds(recordedAt, "recordedAt");

  const payload = {
    basePresentationDigest: basePresentationDigest(
      validated.derived,
      command.reviewItemId,
    ),
    causalUncertainEventDigest: action.causalUncertainEventDigest,
    declarations: structuredClone(command.declarations),
    evidenceCapturedAt: command.evidenceCapturedAt,
    presentationDigest: "",
    provenanceReview: {
      reviewedAt: command.provenanceReviewedAt,
      reviewer: structuredClone(validated.derived.completionTask.reviewers.provenance),
      status: "accepted",
    },
    sourceAddenda: structuredClone(command.sourceAddenda),
    supplementContractVersion: SUPPLEMENT_CONTRACT_VERSION,
    supplementDigest: "",
    supplementId: expectedSupplementId(command.reviewItemId, action.targetRole),
    targetRole: action.targetRole,
  };
  payload.supplementDigest = canonicalJsonSha256(supplementCore(payload));
  payload.presentationDigest = canonicalJsonSha256({
    basePresentationDigest: payload.basePresentationDigest,
    supplementDigests: [
      ...supplementsForPair(validated.envelope, command.reviewItemId).map(
        ({ event }) => event.payload.supplementDigest,
      ),
      payload.supplementDigest,
    ],
  });
  return appendEvent(
    validated.derived,
    validated.envelope,
    actionEnvelope,
    "evidence-supplement",
    validated.derived.completionTask.reviewers.provenance,
    payload,
    recordedAt,
  );
}

export function appendGeneratedRoleRereviewDecision(
  context,
  envelope,
  command,
  recordedAt,
) {
  const validated = validateEnvelopeInternal(context, envelope);
  const actionEnvelope = validateCommandHead(
    validated.derived,
    validated.envelope,
    command,
    DECISION_COMMAND_FIELDS,
    "role-rereview-required",
  );
  const { action } = actionEnvelope;
  if (command.reviewerId !== action.reviewerId) {
    fail("INVALID_REVIEWER", "Rereview must be recorded by the same committed role");
  }
  if (!LABEL_SET.has(command.label)) fail("INVALID_LABEL", "Rereview label is unsupported");
  timestampMilliseconds(recordedAt, "recordedAt");
  const payload = {
    causalUncertainEventDigest: action.causalUncertainEventDigest,
    decisionContractVersion: ROLE_REREVIEW_CONTRACT_VERSION,
    evidenceSupplementEventDigest: action.evidenceSupplementEventDigest,
    outcome: command.label,
    presentationDigest: action.presentationDigest,
    rationale: rationaleFor(action.targetRole, command.label),
    supplementDigest: action.supplementDigest,
    targetRole: action.targetRole,
  };
  return appendEvent(
    validated.derived,
    validated.envelope,
    actionEnvelope,
    "role-rereview-decision",
    validated.derived.completionTask.reviewers[action.targetRole],
    payload,
    recordedAt,
  );
}

export function appendGeneratedContinuedSecondaryDecision(
  context,
  envelope,
  command,
  recordedAt,
) {
  const validated = validateEnvelopeInternal(context, envelope);
  const actionEnvelope = validateCommandHead(
    validated.derived,
    validated.envelope,
    command,
    DECISION_COMMAND_FIELDS,
    "continued-initial-secondary-required",
  );
  const { action } = actionEnvelope;
  if (command.reviewerId !== action.reviewerId) {
    fail("INVALID_REVIEWER", "Decision must be recorded by the committed secondary role");
  }
  if (!LABEL_SET.has(command.label)) {
    fail("INVALID_LABEL", "Continued secondary label is unsupported");
  }
  timestampMilliseconds(recordedAt, "recordedAt");
  const payload = {
    coverageBasis: "initial-precommitted",
    coverageIndex: action.coverageIndex,
    decisionContractVersion: CONTINUED_SECONDARY_CONTRACT_VERSION,
    label: command.label,
    presentationDigest: action.presentationDigest,
    projectedPrimaryEventDigest: action.effectivePrimaryEventDigest,
    rationale: rationaleFor("secondary", command.label),
  };
  return appendEvent(
    validated.derived,
    validated.envelope,
    actionEnvelope,
    "continued-initial-secondary-decision",
    validated.derived.completionTask.reviewers.secondary,
    payload,
    recordedAt,
  );
}

function pendingRolePairs(derived, envelope, role) {
  const order =
    role === "primary"
      ? derived.primaryTaskEnvelope.task.ordering.pairIds
      : derived.baseEnvelope.completionLedger.initialCoverageActivation.pairIds;
  return order.filter((pairId) => {
    const status = roleStatus(derived, envelope, pairId, role).status;
    return status === "uncertain" || status === "supplemented-uncertain";
  });
}

export function generatedResolutionState(context, envelope) {
  const validated = validateEnvelopeInternal(context, envelope);
  const { derived } = validated;
  const journal = validated.envelope.resolutionJournal;
  const actionEnvelope = validateActionEnvelope(
    nextActionFromValidated(derived, validated.envelope),
  );
  const exclusions = allExclusions(derived, validated.envelope);
  const supplementEvents = journalRecords(validated.envelope, "evidence-supplement");
  const rereviewEvents = journalRecords(validated.envelope, "role-rereview-decision");
  const continuedEvents = journalRecords(
    validated.envelope,
    "continued-initial-secondary-decision",
  );
  const activationPairIds =
    derived.baseEnvelope.completionLedger.initialCoverageActivation.pairIds;
  const initialResolvedCount = activationPairIds.filter((pairId) => {
    const primary = roleStatus(derived, validated.envelope, pairId, "primary");
    if (primary.status === "excluded") return true;
    const secondary = roleStatus(derived, validated.envelope, pairId, "secondary");
    return secondary.status === "binary" || secondary.status === "excluded";
  }).length;
  const nextAction = {
    actionDigest: actionEnvelope.actionDigest,
    actionType: actionEnvelope.action.actionType,
    reviewItemId: actionEnvelope.action.reviewItemId ?? null,
    targetRole: actionEnvelope.action.targetRole ?? null,
  };
  return {
    assurance: {
      concurrencyControl: "none-pure-contract-can-fork",
      historyAuthenticity: "unkeyed-digests-not-signatures",
      latestJournalExternallyAnchored: false,
      reviewerIdentity: "caller-declared-synthetic-not-authenticated",
      timestamps: "local-system-clock-not-attested",
    },
    bindings: {
      baseCompletionLedgerDigest: derived.baseEnvelope.completionLedgerDigest,
      completionTaskDigest: derived.context.completionTaskEnvelope.completionTaskDigest,
      primaryLedgerSessionDigest: derived.bindings.primaryLedgerSessionDigest,
      resolutionJournalDigest: validated.envelope.resolutionJournalDigest,
    },
    claims: {
      adjudicationComplete: false,
      automaticJoinDecisionMade: false,
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
    counts: {
      baseSecondaryDecisions: derived.basePrefix.eventCount,
      continuedInitialSecondaryDecisions: continuedEvents.length,
      derivedExclusions: exclusions.length,
      evidenceSupplements: supplementEvents.length,
      initialCoveragePairs: activationPairIds.length,
      initialResolvedPairs: initialResolvedCount,
      journalEvents: journal.events.length,
      roleRereviewDecisions: rereviewEvents.length,
    },
    exclusions,
    nextAction,
    pending: {
      adjudicationPairIds:
        actionEnvelope.action.actionType === "adjudication-required"
          ? [actionEnvelope.action.reviewItemId]
          : [],
      primaryRereviewPairIds: pendingRolePairs(derived, validated.envelope, "primary"),
      reservePairIds: [...derived.completionTask.coveragePlan.reservePairIds],
      secondaryRereviewPairIds: pendingRolePairs(derived, validated.envelope, "secondary"),
    },
    resolutionStateContractVersion:
      GENERATED_REVIEW_RESOLUTION_STATE_CONTRACT_VERSION,
    workflow: {
      adjudicationImplemented: false,
      adjudicationRequired:
        actionEnvelope.action.actionType === "adjudication-required",
      generatedInitialResolutionComplete:
        actionEnvelope.action.actionType === "initial-resolution-complete",
      initialCoverageActivationRecorded: true,
      reserveActivationImplemented: false,
      syntheticRoleSeparationValidated: true,
    },
  };
}

export const GENERATED_REVIEW_RESOLUTION_LIMITS = Object.freeze({
  maximumAddendumCodeUnits: MAX_ADDENDUM_CODE_UNITS,
  maximumArrayEntries: MAX_ARRAY_ENTRIES,
  maximumDataNodes: MAX_DATA_NODES,
  maximumDepth: MAX_DEPTH,
  maximumStringCodeUnits: MAX_STRING_CODE_UNITS,
  maximumTimestampCodeUnits: MAX_TIMESTAMP_CODE_UNITS,
});
