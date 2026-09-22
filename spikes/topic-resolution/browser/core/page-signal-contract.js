import { validatePageSignalObservation } from "./page-signal-policy.js";

export const PAGE_METADATA_CANDIDATE_CONTRACT_VERSION =
  "page-metadata-candidates/1.0.0";
export const PAGE_DOCUMENT_ATTESTATION_CONTRACT_VERSION =
  "page-document-attestation/1.0.0";
export const PAGE_SIGNAL_ENVELOPE_CONTRACT_VERSION =
  "page-signal-envelope/1.0.0";

const MAXIMUM_CANDIDATES = 32;
const MAXIMUM_URL_CODE_UNITS = 8_192;
const VALUE_LIMITS = Object.freeze({
  canonical: MAXIMUM_URL_CODE_UNITS,
  description: 512,
  publishedAtHint: 64,
  robots: 256,
  tdmReservation: 64,
  title: 256,
});
const COLLECTED_FIELDS = [
  "candidates",
  "contractVersion",
  "documentUrl",
  "isTopLevel",
  "status",
];
const REJECTED_FIELDS = ["contractVersion", "status"];
const CANDIDATE_GROUP_FIELDS = [
  "canonical",
  "description",
  "publishedAtHint",
  "robots",
  "tdmReservation",
  "title",
];
const CANDIDATE_FIELDS = ["source", "value"];
const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ATTESTED_FIELDS = [
  "contractVersion",
  "documentUrl",
  "isTopLevel",
  "status",
];
const SOURCE_ALLOWLISTS = Object.freeze({
  canonical: Object.freeze(["link-rel-canonical"]),
  description: Object.freeze([
    "meta-property-og-description",
    "meta-name-description",
    "meta-name-twitter-description",
  ]),
  publishedAtHint: Object.freeze([
    "meta-property-article-published-time",
  ]),
  robots: Object.freeze(["meta-name-robots"]),
  tdmReservation: Object.freeze(["meta-name-tdm-reservation"]),
  title: Object.freeze([
    "meta-property-og-title",
    "meta-name-twitter-title",
    "title-element",
  ]),
});

export class PageSignalContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PageSignalContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PageSignalContractError(code, message);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
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

function assertDataArray(value, label) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > MAXIMUM_CANDIDATES
  ) {
    fail("INVALID_SCHEMA", `${label} must be a plain data array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => !expectedKeys.includes(key)) ||
    expectedKeys.slice(0, -1).some((key) => {
      const descriptor = descriptors[key];
      return (
        descriptor === undefined ||
        descriptor.get ||
        descriptor.set ||
        !descriptor.enumerable
      );
    })
  ) {
    fail("INVALID_SCHEMA", `${label} must contain indexed data values only`);
  }
}

function normalizeText(value) {
  return value.trim().replace(/\s+/gu, " ");
}

function validateDocumentUrl(documentUrl, observation) {
  const fragmentIndex =
    typeof documentUrl === "string" ? documentUrl.indexOf("#") : -1;
  const queryIndex =
    typeof documentUrl === "string" ? documentUrl.indexOf("?") : -1;
  if (
    typeof documentUrl !== "string" ||
    documentUrl.length === 0 ||
    documentUrl.length > MAXIMUM_URL_CODE_UNITS ||
    (queryIndex !== -1 && (fragmentIndex === -1 || queryIndex < fragmentIndex))
  ) {
    fail("DOCUMENT_MISMATCH", "The page document does not match its tab");
  }
  let parsed;
  try {
    parsed = new URL(documentUrl);
  } catch {
    fail("DOCUMENT_MISMATCH", "The page document does not match its tab");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    fail("DOCUMENT_MISMATCH", "The page document does not match its tab");
  }
  parsed.hash = "";
  if (parsed.toString() !== observation.normalizedUrl) {
    fail("DOCUMENT_MISMATCH", "The page document does not match its tab");
  }
}

function validateCandidateGroups(groups) {
  assertPlainRecord(groups, CANDIDATE_GROUP_FIELDS, "metadata candidates");
  let total = 0;
  const validated = {};
  for (const field of CANDIDATE_GROUP_FIELDS) {
    const entries = groups[field];
    assertDataArray(entries, `${field} candidates`);
    total += entries.length;
    if (total > MAXIMUM_CANDIDATES) {
      fail("INVALID_SCHEMA", "Metadata contains too many candidates");
    }
    validated[field] = entries.map((entry) => {
      assertPlainRecord(entry, CANDIDATE_FIELDS, `${field} candidate`);
      if (
        !SOURCE_ALLOWLISTS[field].includes(entry.source) ||
        typeof entry.value !== "string" ||
        entry.value.length > VALUE_LIMITS[field] ||
        UNSAFE_TEXT_PATTERN.test(entry.value)
      ) {
        fail("INVALID_CANDIDATE", `${field} candidate is invalid`);
      }
      return Object.freeze({
        source: entry.source,
        value: normalizeText(entry.value),
      });
    });
  }
  return validated;
}

function selectByPrecedence(entries, precedence, required) {
  for (const source of precedence) {
    const sourceValues = entries
      .filter((entry) => entry.source === source)
      .map((entry) => entry.value);
    if (sourceValues.length === 0) continue;
    const distinct = [...new Set(sourceValues)];
    if (distinct.length !== 1) {
      fail("AMBIGUOUS_METADATA", "Metadata candidates conflict");
    }
    if (distinct[0] === "") {
      fail("INVALID_CANDIDATE", "Metadata candidate is empty");
    }
    return Object.freeze({ provenance: source, value: distinct[0] });
  }
  if (required) fail("MISSING_METADATA", "Required metadata is absent");
  return null;
}

function projectCanonical(entries, observation) {
  if (entries.length === 0) return null;
  if (entries.length !== 1 || entries[0].value === "") {
    fail("AMBIGUOUS_METADATA", "Canonical metadata is ambiguous");
  }
  const candidate = entries[0].value;
  const fragmentIndex = candidate.indexOf("#");
  const queryIndex = candidate.indexOf("?");
  if (queryIndex !== -1 && (fragmentIndex === -1 || queryIndex < fragmentIndex)) {
    fail("INVALID_CANDIDATE", "Canonical metadata is invalid");
  }
  let parsed;
  let observed;
  try {
    parsed = new URL(candidate, observation.normalizedUrl);
    observed = new URL(observation.normalizedUrl);
  } catch {
    fail("INVALID_CANDIDATE", "Canonical metadata is invalid");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.origin !== observed.origin
  ) {
    fail("INVALID_CANDIDATE", "Canonical metadata is invalid");
  }
  parsed.hash = "";
  const canonical = parsed.toString();
  if (canonical.length > MAXIMUM_URL_CODE_UNITS) {
    fail("INVALID_CANDIDATE", "Canonical metadata is invalid");
  }
  return Object.freeze({
    provenance: "link-rel-canonical",
    value: canonical,
  });
}

function validateRobots(entries) {
  if (entries.length === 0) return;
  const normalizedPolicies = entries.map(({ value }) => {
    if (value === "") {
      fail("POLICY_SIGNAL_DENIED", "In-head policy metadata denies use");
    }
    const tokens = value
      .toLowerCase()
      .split(/[\s,]+/u)
      .filter(Boolean);
    if (
      tokens.length === 0 ||
      tokens.some((token) => !["all", "follow", "index"].includes(token))
    ) {
      fail("POLICY_SIGNAL_DENIED", "In-head policy metadata denies use");
    }
    return [...new Set(tokens)].sort().join(",");
  });
  if (new Set(normalizedPolicies).size !== 1) {
    fail("POLICY_SIGNAL_DENIED", "In-head policy metadata conflicts");
  }
}

function validateTdmReservation(entries) {
  if (entries.length === 0) return;
  const values = [...new Set(entries.map(({ value }) => value))];
  if (values.length !== 1 || values[0] !== "0") {
    fail("POLICY_SIGNAL_DENIED", "In-head policy metadata denies use");
  }
}

function isValidPublishedTimestamp(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  if (match[8] !== "Z") {
    const offsetHour = Number(match[9]);
    const offsetMinute = Number(match[10]);
    if (
      offsetHour > 14 ||
      offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)
    ) {
      return false;
    }
  }
  return Number.isFinite(Date.parse(value));
}

function validatePublishedAtHint(candidate) {
  if (candidate === null) return null;
  if (!isValidPublishedTimestamp(candidate.value)) {
    fail("INVALID_CANDIDATE", "Publication metadata is invalid");
  }
  return candidate;
}

export function validateAndProjectPageMetadata(result, observation) {
  validatePageSignalObservation(observation);
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    fail("INVALID_SCHEMA", "Page metadata result must be a data object");
  }
  const statusDescriptor = Object.getOwnPropertyDescriptor(result, "status");
  if (
    statusDescriptor === undefined ||
    statusDescriptor.get ||
    statusDescriptor.set
  ) {
    fail("INVALID_SCHEMA", "Page metadata status is invalid");
  }
  if (statusDescriptor.value === "rejected") {
    assertPlainRecord(result, REJECTED_FIELDS, "rejected page metadata result");
    if (result.contractVersion !== PAGE_METADATA_CANDIDATE_CONTRACT_VERSION) {
      fail("INVALID_SCHEMA", "Page metadata version is invalid");
    }
    fail("COLLECTION_REJECTED", "Page metadata collection was rejected");
  }

  assertPlainRecord(result, COLLECTED_FIELDS, "page metadata result");
  if (
    result.contractVersion !== PAGE_METADATA_CANDIDATE_CONTRACT_VERSION ||
    result.status !== "collected" ||
    result.isTopLevel !== true
  ) {
    fail("INVALID_SCHEMA", "Page metadata result is invalid");
  }
  validateDocumentUrl(result.documentUrl, observation);
  const candidates = validateCandidateGroups(result.candidates);
  validateRobots(candidates.robots);
  validateTdmReservation(candidates.tdmReservation);

  const canonical = projectCanonical(candidates.canonical, observation);
  const title = selectByPrecedence(
    candidates.title,
    SOURCE_ALLOWLISTS.title,
    true,
  );
  const description = selectByPrecedence(
    candidates.description,
    SOURCE_ALLOWLISTS.description,
    false,
  );
  const publishedAtHint = validatePublishedAtHint(
    selectByPrecedence(
      candidates.publishedAtHint,
      SOURCE_ALLOWLISTS.publishedAtHint,
      false,
    ),
  );

  return deepFreeze({
    canonicalHint: canonical?.value ?? null,
    context: {
      contextId: observation.contextId,
      observedUrl: observation.normalizedUrl,
      policyReviewExpiresAt: observation.policyReviewExpiresAt,
      rightsBasis: observation.rightsBasis,
    },
    contractVersion: PAGE_SIGNAL_ENVELOPE_CONTRACT_VERSION,
    description: description?.value ?? null,
    provenance: {
      canonicalHint: canonical?.provenance ?? null,
      description: description?.provenance ?? null,
      publishedAtHint: publishedAtHint?.provenance ?? null,
      title: title.provenance,
    },
    publishedAtHint: publishedAtHint?.value ?? null,
    scope: {
      matchingUse: "none",
      noAutomaticSemanticJoin: true,
      publicationTimeUse: "context-only",
      rawRetained: false,
      topLevelOnly: true,
    },
    title: title.value,
  });
}

export function validatePageDocumentAttestation(result, observation) {
  validatePageSignalObservation(observation);
  assertPlainRecord(result, ATTESTED_FIELDS, "page document attestation");
  if (
    result.contractVersion !== PAGE_DOCUMENT_ATTESTATION_CONTRACT_VERSION ||
    result.status !== "attested" ||
    result.isTopLevel !== true
  ) {
    fail("INVALID_SCHEMA", "Page document attestation is invalid");
  }
  validateDocumentUrl(result.documentUrl, observation);
  return true;
}

export const PAGE_SIGNAL_CONTRACT_LIMITS = Object.freeze({
  maximumCandidates: MAXIMUM_CANDIDATES,
  maximumCanonicalCodeUnits: VALUE_LIMITS.canonical,
  maximumDescriptionCodeUnits: VALUE_LIMITS.description,
  maximumPolicyCodeUnits: VALUE_LIMITS.robots,
  maximumPublishedAtHintCodeUnits: VALUE_LIMITS.publishedAtHint,
  maximumTitleCodeUnits: VALUE_LIMITS.title,
});
