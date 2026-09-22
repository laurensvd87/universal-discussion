export const ACTIVE_TAB_OBSERVATION_CONTRACT_VERSION =
  "active-tab-observation/1.0.0";

const MAX_URL_CODE_UNITS = 8_192;
const SNAPSHOT_FIELDS = ["tabId", "url"];
const OBSERVATION_FIELDS = [
  "contractVersion",
  "normalizedUrl",
  "scenarioId",
  "tabId",
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const ACTIVE_TAB_ROUTES = deepFreeze([
  {
    normalizedUrl: "https://example.com/",
    scenarioId: "active-tab-example-com",
  },
  {
    normalizedUrl: "https://example.org/",
    scenarioId: "active-tab-example-org",
  },
]);

const ROUTE_BY_URL = new Map(
  ACTIVE_TAB_ROUTES.map(({ normalizedUrl, scenarioId }) => [
    normalizedUrl,
    scenarioId,
  ]),
);

export class ActiveTabPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ActiveTabPolicyError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ActiveTabPolicyError(code, message);
}

function assertPlainRecord(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_SCHEMA", `${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_SCHEMA", `${label} must be a plain data object`);
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
  const allowed = new Set(fields);
  if (
    keys.some((key) => !allowed.has(key)) ||
    fields.some((field) => !Object.hasOwn(descriptors, field))
  ) {
    fail("INVALID_SCHEMA", `${label} must use its exact field allowlist`);
  }
}

function isTabIdentifier(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function classifyActiveTabSnapshot(snapshot) {
  assertPlainRecord(snapshot, SNAPSHOT_FIELDS, "active tab snapshot");
  const fragmentIndex =
    typeof snapshot.url === "string" ? snapshot.url.indexOf("#") : -1;
  const queryIndex =
    typeof snapshot.url === "string" ? snapshot.url.indexOf("?") : -1;
  if (
    !isTabIdentifier(snapshot.tabId) ||
    typeof snapshot.url !== "string" ||
    snapshot.url.length === 0 ||
    snapshot.url.length > MAX_URL_CODE_UNITS ||
    (queryIndex !== -1 && (fragmentIndex === -1 || queryIndex < fragmentIndex))
  ) {
    fail("UNSUPPORTED_CONTEXT", "The active tab context is unsupported");
  }

  let parsed;
  try {
    parsed = new URL(snapshot.url);
  } catch {
    fail("UNSUPPORTED_CONTEXT", "The active tab context is unsupported");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    fail("UNSUPPORTED_CONTEXT", "The active tab context is unsupported");
  }

  parsed.hash = "";
  const normalizedUrl = parsed.toString();
  const scenarioId = ROUTE_BY_URL.get(normalizedUrl);
  if (scenarioId === undefined) {
    fail("UNSUPPORTED_CONTEXT", "The active tab context is unsupported");
  }

  return deepFreeze({
    contractVersion: ACTIVE_TAB_OBSERVATION_CONTRACT_VERSION,
    normalizedUrl,
    scenarioId,
    tabId: snapshot.tabId,
  });
}

export function validateActiveTabObservation(observation) {
  assertPlainRecord(observation, OBSERVATION_FIELDS, "active tab observation");
  if (
    observation.contractVersion !== ACTIVE_TAB_OBSERVATION_CONTRACT_VERSION ||
    !isTabIdentifier(observation.tabId) ||
    typeof observation.normalizedUrl !== "string" ||
    ROUTE_BY_URL.get(observation.normalizedUrl) !== observation.scenarioId
  ) {
    fail("INVALID_OBSERVATION", "The active tab observation is inconsistent");
  }
  return observation;
}

export function sameActiveTabObservation(first, second) {
  validateActiveTabObservation(first);
  validateActiveTabObservation(second);
  return (
    first.tabId === second.tabId &&
    first.normalizedUrl === second.normalizedUrl &&
    first.scenarioId === second.scenarioId
  );
}

export const ACTIVE_TAB_POLICY_LIMITS = Object.freeze({
  maximumUrlCodeUnits: MAX_URL_CODE_UNITS,
});
