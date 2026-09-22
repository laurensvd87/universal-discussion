export const INDICATOR_LOOKUP_CONTRACT_VERSION =
  "read-only-indicator-lookup/1.1.0";
export const INDICATOR_VIEW_CONTRACT_VERSION =
  "read-only-indicator-view/1.1.0";

const MAX_DEPTH = 12;
const MAX_NODES = 256;
const MAX_STRING_CODE_UNITS = 4_096;
const MAX_TITLE_CODE_UNITS = 256;
const MAX_COUNT = 1_000_000;
const MAX_TIMESTAMP_CODE_UNITS = 64;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const ENTITY_ID = /^(?:source|topic|discussion|source_topic_link)_[a-f0-9]{24}$/;
const REQUEST_TOKEN = /^activation-[0-9]{6}$/;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const STATUS_SET = new Set(["resolved", "unavailable", "unmapped", "unsupported"]);
const SOURCE_MATCH_METHODS = new Set(["bundled-scenario", "exact-normalized-url"]);
const REASON_BY_STATUS = Object.freeze({
  resolved: null,
  unavailable: "local-lookup-unavailable",
  unmapped: "no-deterministic-mapping",
  unsupported: "local-context-unsupported",
});
const MESSAGE_BY_STATUS = Object.freeze({
  resolved: "Discussion found in local data.",
  unavailable: "The local result could not be validated.",
  unmapped: "No deterministic or curated mapping exists for this source.",
  unsupported: "This context is intentionally unsupported.",
});
const SCOPE = Object.freeze({
  fixtureOnly: true,
  noAutomaticSemanticJoin: true,
  readOnly: true,
});

const RESPONSE_FIELDS = [
  "contractVersion",
  "generatedAt",
  "reasonCode",
  "requestToken",
  "result",
  "scenarioId",
  "scope",
  "status",
];
const EXPECTED_FIELDS = ["requestToken", "scenarioId"];
const ACTIVE_TAB_EXPECTED_FIELDS = [
  "normalizedUrl",
  "requestToken",
  "scenarioId",
];
const SCOPE_FIELDS = ["fixtureOnly", "noAutomaticSemanticJoin", "readOnly"];
const RESULT_FIELDS = [
  "activity",
  "discussion",
  "mapping",
  "source",
  "sourceMatch",
  "topicId",
];
const ACTIVITY_FIELDS = [
  "agentContributions",
  "asOf",
  "humanContributions",
  "scope",
  "topicId",
];
const DISCUSSION_FIELDS = ["id", "topicId"];
const SOURCE_FIELDS = ["id", "title", "url"];
const SOURCE_MATCH_FIELDS = ["method", "normalizedUrl", "sourceId"];
const MAPPING_FIELDS = [
  "auditedAt",
  "confidence",
  "evidence",
  "id",
  "method",
  "resolverVersion",
  "sourceId",
  "topicId",
];
const EVIDENCE_FIELDS = ["fixtureId", "kind", "provenance"];

export class IndicatorContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IndicatorContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new IndicatorContractError(code, message);
}

function preflightData(value, state, depth, label) {
  if (depth > MAX_DEPTH) fail("RESOURCE_LIMIT", `${label} exceeds the maximum depth`);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail("RESOURCE_LIMIT", `${label} exceeds the node budget`);
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", `${label} exceeds the string budget`);
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
  if (typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_SCHEMA", `${label} contains unsupported data`);
  }
  if (state.ancestors.has(value)) fail("INVALID_SCHEMA", `${label} contains cyclic data`);
  state.ancestors.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_SCHEMA", `${label} must contain plain data objects only`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    )
  ) {
    fail("INVALID_SCHEMA", `${label} must contain enumerable data fields only`);
  }
  for (const key of keys) {
    state.stringCodeUnits += key.length;
    if (state.stringCodeUnits > MAX_STRING_CODE_UNITS) {
      fail("RESOURCE_LIMIT", `${label} exceeds the string budget`);
    }
    preflightData(descriptors[key].value, state, depth + 1, `${label}.${key}`);
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
  const keys = Object.keys(value);
  const allowed = new Set(fields);
  const unknown = keys.filter((key) => !allowed.has(key));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length > 0 || missing.length > 0) {
    fail("INVALID_SCHEMA", `${label} must use its exact field allowlist`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || value.length > 128 || !IDENTIFIER.test(value)) {
    fail("INVALID_IDENTIFIER", `${label} must be a bounded lowercase identifier`);
  }
}

function assertEntityId(value, prefix, label) {
  if (typeof value !== "string" || !ENTITY_ID.test(value) || !value.startsWith(`${prefix}_`)) {
    fail("INVALID_IDENTIFIER", `${label} is not a valid ${prefix} identifier`);
  }
}

function assertTimestamp(value, label) {
  if (typeof value === "string" && value.length > MAX_TIMESTAMP_CODE_UNITS) {
    fail("RESOURCE_LIMIT", `${label} exceeds the timestamp limit`);
  }
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_TIMESTAMP", `${label} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function assertSafeTitle(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim().length === 0 ||
    value.length > MAX_TITLE_CODE_UNITS ||
    UNSAFE_TEXT.test(value)
  ) {
    fail("INVALID_SOURCE", "Source title must be bounded visible text");
  }
}

function assertSyntheticUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_SOURCE", "Source URL is invalid");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !(
      hostname === "example.com" ||
      hostname.endsWith(".example.com") ||
      hostname === "example.org" ||
      hostname.endsWith(".example.org") ||
      hostname === "example.net" ||
      hostname.endsWith(".example.net")
    ) ||
    parsed.toString() !== value
  ) {
    fail("INVALID_SOURCE", "Source URL must be a normalized reserved-domain fixture URL");
  }
}

function assertCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COUNT) {
    fail("INVALID_COUNT", `${label} must be a bounded non-negative integer`);
  }
}

function cloneAndFreeze(value) {
  const clone = structuredClone(value);
  const freeze = (candidate) => {
    if (candidate && typeof candidate === "object" && !Object.isFrozen(candidate)) {
      Object.freeze(candidate);
      for (const child of Object.values(candidate)) freeze(child);
    }
    return candidate;
  };
  return freeze(clone);
}

function validateExpected(expected) {
  preflight(expected, "expected");
  assertExactFields(expected, EXPECTED_FIELDS, "expected");
  assertIdentifier(expected.scenarioId, "expected.scenarioId");
  if (typeof expected.requestToken !== "string" || !REQUEST_TOKEN.test(expected.requestToken)) {
    fail("INVALID_REQUEST", "Expected request token is invalid");
  }
}

function validateScope(scope) {
  assertExactFields(scope, SCOPE_FIELDS, "response.scope");
  if (
    scope.fixtureOnly !== true ||
    scope.noAutomaticSemanticJoin !== true ||
    scope.readOnly !== true
  ) {
    fail("INVALID_SCOPE", "Indicator response must remain fixture-only, read-only, and NO AUTO");
  }
}

function validateResolvedResult(result, generatedAt, scenarioId) {
  assertExactFields(result, RESULT_FIELDS, "response.result");
  assertEntityId(result.topicId, "topic", "response.result.topicId");

  assertExactFields(result.activity, ACTIVITY_FIELDS, "response.result.activity");
  assertCount(result.activity.humanContributions, "human contributions");
  assertCount(result.activity.agentContributions, "agent contributions");
  assertEntityId(result.activity.topicId, "topic", "response.result.activity.topicId");
  if (result.activity.scope !== "topic" || result.activity.topicId !== result.topicId) {
    fail("BINDING_MISMATCH", "Activity must be bound to the resolved Topic");
  }
  const activityTime = assertTimestamp(result.activity.asOf, "response.result.activity.asOf");
  if (activityTime > generatedAt) {
    fail("INVALID_TIMESTAMP", "Activity freshness cannot follow response generation");
  }

  assertExactFields(result.discussion, DISCUSSION_FIELDS, "response.result.discussion");
  assertEntityId(result.discussion.id, "discussion", "response.result.discussion.id");
  assertEntityId(result.discussion.topicId, "topic", "response.result.discussion.topicId");
  if (result.discussion.topicId !== result.topicId) {
    fail("BINDING_MISMATCH", "Discussion must be bound to the resolved Topic");
  }

  assertExactFields(result.source, SOURCE_FIELDS, "response.result.source");
  assertEntityId(result.source.id, "source", "response.result.source.id");
  assertSafeTitle(result.source.title);
  assertSyntheticUrl(result.source.url);

  assertExactFields(result.sourceMatch, SOURCE_MATCH_FIELDS, "response.result.sourceMatch");
  assertEntityId(
    result.sourceMatch.sourceId,
    "source",
    "response.result.sourceMatch.sourceId",
  );
  if (
    result.sourceMatch.sourceId !== result.source.id ||
    !SOURCE_MATCH_METHODS.has(result.sourceMatch.method)
  ) {
    fail("BINDING_MISMATCH", "Source match must identify the resolved Source");
  }
  if (
    (result.sourceMatch.method === "bundled-scenario" &&
      result.sourceMatch.normalizedUrl !== null) ||
    (result.sourceMatch.method === "exact-normalized-url" &&
      result.sourceMatch.normalizedUrl !== result.source.url)
  ) {
    fail("BINDING_MISMATCH", "Source match provenance is inconsistent");
  }

  assertExactFields(result.mapping, MAPPING_FIELDS, "response.result.mapping");
  assertEntityId(result.mapping.id, "source_topic_link", "response.result.mapping.id");
  assertEntityId(result.mapping.sourceId, "source", "response.result.mapping.sourceId");
  assertEntityId(result.mapping.topicId, "topic", "response.result.mapping.topicId");
  if (
    result.mapping.sourceId !== result.source.id ||
    result.mapping.topicId !== result.topicId
  ) {
    fail("BINDING_MISMATCH", "Mapping must bind the resolved Source and Topic");
  }
  if (
    result.mapping.method !== "exact-content-fingerprint" ||
    result.mapping.confidence !== 1 ||
    result.mapping.resolverVersion !== "topic-resolution-spike/1.0.1"
  ) {
    fail("INVALID_MAPPING", "Fixture resolution must be the pinned exact-fingerprint method");
  }
  const auditedTime = assertTimestamp(result.mapping.auditedAt, "response.result.mapping.auditedAt");
  if (auditedTime > generatedAt) fail("INVALID_TIMESTAMP", "Mapping audit cannot follow response generation");
  assertExactFields(result.mapping.evidence, EVIDENCE_FIELDS, "response.result.mapping.evidence");
  assertIdentifier(result.mapping.evidence.fixtureId, "mapping evidence fixtureId");
  if (
    result.mapping.evidence.kind !== "exact-content-fingerprint" ||
    result.mapping.evidence.provenance !== "project-created-synthetic" ||
    result.mapping.evidence.fixtureId !== scenarioId
  ) {
    fail("INVALID_MAPPING", "Fixture mapping evidence is unsupported");
  }
}

function projectView(response) {
  const result = response.result;
  return cloneAndFreeze({
    activity: result === null ? null : result.activity,
    asOf: result === null ? null : result.activity.asOf,
    discussionId: result === null ? null : result.discussion.id,
    mapping: result === null ? null : result.mapping,
    message: MESSAGE_BY_STATUS[response.status],
    outcome: response.status,
    phase: "ready",
    reasonCode: response.reasonCode,
    requestToken: response.requestToken,
    scenarioId: response.scenarioId,
    scope: SCOPE,
    source: result === null ? null : result.source,
    sourceMatch: result === null ? null : result.sourceMatch,
    topicId: result === null ? null : result.topicId,
    viewContractVersion: INDICATOR_VIEW_CONTRACT_VERSION,
  });
}

export function validateAndProjectIndicatorResponse(response, expected) {
  preflight(response, "response");
  validateExpected(expected);
  assertExactFields(response, RESPONSE_FIELDS, "response");
  if (response.contractVersion !== INDICATOR_LOOKUP_CONTRACT_VERSION) {
    fail("UNSUPPORTED_VERSION", "Indicator lookup contract version is unsupported");
  }
  if (
    response.requestToken !== expected.requestToken ||
    response.scenarioId !== expected.scenarioId
  ) {
    fail("BINDING_MISMATCH", "Indicator response is bound to another activation");
  }
  assertIdentifier(response.scenarioId, "response.scenarioId");
  if (!REQUEST_TOKEN.test(response.requestToken)) {
    fail("INVALID_REQUEST", "Indicator response request token is invalid");
  }
  if (!STATUS_SET.has(response.status)) fail("INVALID_STATUS", "Indicator status is unsupported");
  const generatedTime = assertTimestamp(response.generatedAt, "response.generatedAt");
  validateScope(response.scope);
  if (response.reasonCode !== REASON_BY_STATUS[response.status]) {
    fail("INVALID_STATUS", "Indicator reason does not match its status");
  }
  if (response.status === "resolved") {
    if (response.result === null) fail("INVALID_STATUS", "Resolved response needs a result");
    validateResolvedResult(response.result, generatedTime, response.scenarioId);
  } else if (response.result !== null) {
    fail("INVALID_STATUS", "Non-resolved response cannot contain result data");
  }
  return projectView(response);
}

export function validateAndProjectActiveTabResponse(response, expected) {
  preflight(expected, "active tab expected binding");
  assertExactFields(
    expected,
    ACTIVE_TAB_EXPECTED_FIELDS,
    "active tab expected binding",
  );
  validateExpected({
    requestToken: expected.requestToken,
    scenarioId: expected.scenarioId,
  });
  assertSyntheticUrl(expected.normalizedUrl);

  const view = validateAndProjectIndicatorResponse(response, {
    requestToken: expected.requestToken,
    scenarioId: expected.scenarioId,
  });
  if (
    view.outcome !== "resolved" ||
    view.sourceMatch.method !== "exact-normalized-url" ||
    view.sourceMatch.normalizedUrl !== expected.normalizedUrl ||
    view.source.url !== expected.normalizedUrl
  ) {
    fail("BINDING_MISMATCH", "Active tab response is bound to another URL");
  }
  return view;
}

function terminalIndicatorView(status, { requestToken, scenarioId }) {
  validateExpected({ requestToken, scenarioId });
  return cloneAndFreeze({
    activity: null,
    asOf: null,
    discussionId: null,
    mapping: null,
    message: MESSAGE_BY_STATUS[status],
    outcome: status,
    phase: "ready",
    reasonCode: REASON_BY_STATUS[status],
    requestToken,
    scenarioId,
    scope: SCOPE,
    source: null,
    sourceMatch: null,
    topicId: null,
    viewContractVersion: INDICATOR_VIEW_CONTRACT_VERSION,
  });
}

export function unavailableIndicatorView({ requestToken, scenarioId }) {
  return terminalIndicatorView("unavailable", { requestToken, scenarioId });
}

export function unsupportedIndicatorView({ requestToken, scenarioId }) {
  return terminalIndicatorView("unsupported", { requestToken, scenarioId });
}

export const INDICATOR_CONTRACT_LIMITS = Object.freeze({
  maximumCount: MAX_COUNT,
  maximumDepth: MAX_DEPTH,
  maximumNodes: MAX_NODES,
  maximumStringCodeUnits: MAX_STRING_CODE_UNITS,
  maximumTimestampCodeUnits: MAX_TIMESTAMP_CODE_UNITS,
  maximumTitleCodeUnits: MAX_TITLE_CODE_UNITS,
});
