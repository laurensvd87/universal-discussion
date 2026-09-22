export const PAGE_SIGNAL_OBSERVATION_CONTRACT_VERSION =
  "page-signal-observation/1.0.0";

const MAX_URL_CODE_UNITS = 8_192;
const SNAPSHOT_FIELDS = ["tabId", "url"];
const OBSERVATION_FIELDS = [
  "contextId",
  "contractVersion",
  "normalizedUrl",
  "policyReviewExpiresAt",
  "rightsBasis",
  "tabId",
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const PAGE_SIGNAL_ROUTES = deepFreeze([
  {
    contextId: "p1-5c-controlled-fixture",
    normalizedUrl: "http://127.0.0.1:4173/p1-5c.html",
    policyReviewExpiresAt: null,
    rightsBasis: "project-created-synthetic",
  },
  {
    contextId: "p1-5c-mdn-meta-reference",
    normalizedUrl:
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta",
    policyReviewExpiresAt: "2026-10-23T00:00:00.000Z",
    rightsBasis: "mdn-open-license-review-2026-09-22",
  },
]);

const ROUTE_BY_URL = new Map(
  PAGE_SIGNAL_ROUTES.map((route) => [route.normalizedUrl, route]),
);

export class PageSignalPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PageSignalPolicyError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PageSignalPolicyError(code, message);
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

function validateNow(nowEpochMilliseconds) {
  if (
    !Number.isSafeInteger(nowEpochMilliseconds) ||
    nowEpochMilliseconds < 0
  ) {
    fail("INVALID_CLOCK", "Page-signal policy requires a valid clock value");
  }
}

export function classifyPageSignalSnapshot(snapshot, nowEpochMilliseconds) {
  assertPlainRecord(snapshot, SNAPSHOT_FIELDS, "page-signal tab snapshot");
  validateNow(nowEpochMilliseconds);

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
    fail("UNSUPPORTED_CONTEXT", "The page-signal context is unsupported");
  }

  let parsed;
  try {
    parsed = new URL(snapshot.url);
  } catch {
    fail("UNSUPPORTED_CONTEXT", "The page-signal context is unsupported");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    fail("UNSUPPORTED_CONTEXT", "The page-signal context is unsupported");
  }

  parsed.hash = "";
  const normalizedUrl = parsed.toString();
  const route = ROUTE_BY_URL.get(normalizedUrl);
  const rawUrlWithoutFragment =
    fragmentIndex === -1 ? snapshot.url : snapshot.url.slice(0, fragmentIndex);
  if (route === undefined || rawUrlWithoutFragment !== normalizedUrl) {
    fail("UNSUPPORTED_CONTEXT", "The page-signal context is unsupported");
  }
  if (
    route.policyReviewExpiresAt !== null &&
    nowEpochMilliseconds >= Date.parse(route.policyReviewExpiresAt)
  ) {
    fail("POLICY_REVIEW_EXPIRED", "The page-signal policy review has expired");
  }

  return deepFreeze({
    contextId: route.contextId,
    contractVersion: PAGE_SIGNAL_OBSERVATION_CONTRACT_VERSION,
    normalizedUrl,
    policyReviewExpiresAt: route.policyReviewExpiresAt,
    rightsBasis: route.rightsBasis,
    tabId: snapshot.tabId,
  });
}

export function validatePageSignalObservation(observation) {
  assertPlainRecord(
    observation,
    OBSERVATION_FIELDS,
    "page-signal observation",
  );
  const route =
    typeof observation.normalizedUrl === "string"
      ? ROUTE_BY_URL.get(observation.normalizedUrl)
      : undefined;
  if (
    observation.contractVersion !== PAGE_SIGNAL_OBSERVATION_CONTRACT_VERSION ||
    !isTabIdentifier(observation.tabId) ||
    route === undefined ||
    observation.contextId !== route.contextId ||
    observation.policyReviewExpiresAt !== route.policyReviewExpiresAt ||
    observation.rightsBasis !== route.rightsBasis
  ) {
    fail("INVALID_OBSERVATION", "The page-signal observation is inconsistent");
  }
  return observation;
}

export function samePageSignalObservation(first, second) {
  validatePageSignalObservation(first);
  validatePageSignalObservation(second);
  return (
    first.tabId === second.tabId &&
    first.normalizedUrl === second.normalizedUrl &&
    first.contextId === second.contextId &&
    first.policyReviewExpiresAt === second.policyReviewExpiresAt &&
    first.rightsBasis === second.rightsBasis
  );
}

export const PAGE_SIGNAL_POLICY_LIMITS = Object.freeze({
  maximumUrlCodeUnits: MAX_URL_CODE_UNITS,
});
