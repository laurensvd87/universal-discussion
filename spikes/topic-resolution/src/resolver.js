import { createHash } from "node:crypto";

import { fail } from "./errors.js";
import { normalizePublicHttpUrl } from "./url.js";

export const RESOLVER_VERSION = "topic-resolution-spike/1.0.0";

export const RESOLUTION_METHOD = Object.freeze({
  EXACT_CONTENT_FINGERPRINT: "exact-content-fingerprint",
  PROVISIONAL_URL_FALLBACK: "provisional-url-fallback",
});

const OBSERVATION_FIELDS = new Set([
  "contentFingerprint",
  "fingerprintEvidence",
  "title",
  "url",
]);
const FINGERPRINT_EVIDENCE_FIELDS = new Set(["fixtureId", "kind"]);
const ACTIVITY_FIELDS = new Set([
  "authorType",
  "contentFingerprint",
  "moderationState",
  "visibility",
]);
const AUTHOR_TYPES = new Set(["agent", "human"]);
const VISIBILITIES = new Set(["private", "public"]);
const MODERATION_STATES = new Set(["removed", "visible"]);
const MAX_ACTIVITY_RECORDS = 1_000;
const MAX_TITLE_CODE_UNITS = 512;

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_INPUT", `${label} must be a plain object`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_INPUT", `${label} must not inherit application data or behavior`);
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    fail("UNSUPPORTED_FIELD", `${label} must not contain symbol fields`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) {
    fail("INVALID_INPUT", `${label} must contain data fields only`);
  }
}

function assertOnlyFields(value, allowedFields, label) {
  const unsupportedFields = Object.getOwnPropertyNames(value).filter(
    (field) => !allowedFields.has(field),
  );
  if (unsupportedFields.length > 0) {
    fail(
      "UNSUPPORTED_FIELD",
      `${label} contains unsupported field(s): ${unsupportedFields.sort().join(", ")}`,
    );
  }
}

function normalizeFingerprint(value) {
  if (typeof value !== "string") {
    fail("INVALID_FINGERPRINT", "Content fingerprint must be a string");
  }
  if (value.length !== 71) {
    fail("INVALID_FINGERPRINT", "Content fingerprint must use sha256:<64 lowercase hex digits>");
  }

  const normalized = value.toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    fail("INVALID_FINGERPRINT", "Content fingerprint must use sha256:<64 lowercase hex digits>");
  }

  return normalized;
}

function normalizeFingerprintEvidence(value) {
  assertPlainObject(value, "Fingerprint evidence");
  assertOnlyFields(value, FINGERPRINT_EVIDENCE_FIELDS, "Fingerprint evidence");

  if (value.kind !== "synthetic-fixture") {
    fail(
      "INVALID_FINGERPRINT_EVIDENCE",
      "This spike accepts exact fingerprints only from synthetic fixtures",
    );
  }
  if (
    typeof value.fixtureId !== "string" ||
    !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value.fixtureId)
  ) {
    fail(
      "INVALID_FINGERPRINT_EVIDENCE",
      "Fingerprint fixtureId must be a stable lowercase identifier of at most 128 characters",
    );
  }

  return {
    fixtureId: value.fixtureId,
    kind: value.kind,
  };
}

function normalizeTitle(value) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    fail("INVALID_TITLE", "Title must be a string when provided");
  }
  if (value.length > MAX_TITLE_CODE_UNITS) {
    fail(
      "INPUT_TOO_LARGE",
      `Title must contain at most ${MAX_TITLE_CODE_UNITS} UTF-16 code units`,
    );
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    fail("INVALID_TITLE", "Title must contain at least one non-whitespace character");
  }
  return normalized;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}

function id(prefix, value) {
  return `${prefix}_${digest(value)}`;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function topicKeyFor({ contentFingerprint, canonicalUrl }) {
  return contentFingerprint
    ? `fingerprint:${contentFingerprint}`
    : `canonical-url:${canonicalUrl}`;
}

function normalizeObservation(observation) {
  assertPlainObject(observation, "Observation");
  assertOnlyFields(observation, OBSERVATION_FIELDS, "Observation");
  if (!Object.hasOwn(observation, "url")) {
    fail("INVALID_URL", "Observation must contain its own URL field");
  }

  const canonicalUrl = normalizePublicHttpUrl(observation.url);
  const hasFingerprint = Object.hasOwn(observation, "contentFingerprint");
  const hasFingerprintEvidence = Object.hasOwn(observation, "fingerprintEvidence");
  if (hasFingerprint !== hasFingerprintEvidence) {
    fail(
      "MISSING_FINGERPRINT_EVIDENCE",
      "contentFingerprint and fingerprintEvidence must be supplied together",
    );
  }

  const contentFingerprint = hasFingerprint
    ? normalizeFingerprint(observation.contentFingerprint)
    : null;
  const fingerprintEvidence = hasFingerprintEvidence
    ? normalizeFingerprintEvidence(observation.fingerprintEvidence)
    : null;

  return {
    canonicalUrl,
    contentFingerprint,
    fingerprintEvidence,
    title: normalizeTitle(observation.title),
  };
}

function normalizeActivityRecord(record) {
  assertPlainObject(record, "Activity record");
  assertOnlyFields(record, ACTIVITY_FIELDS, "Activity record");

  if (!Object.hasOwn(record, "contentFingerprint")) {
    fail(
      "INVALID_ACTIVITY_SELECTOR",
      "Activity fixture records must contain a contentFingerprint selector",
    );
  }
  if (!AUTHOR_TYPES.has(record.authorType)) {
    fail("INVALID_AUTHOR_TYPE", "Activity authorType must be human or agent");
  }
  if (!VISIBILITIES.has(record.visibility)) {
    fail("INVALID_VISIBILITY", "Activity visibility must be public or private");
  }
  if (!MODERATION_STATES.has(record.moderationState)) {
    fail("INVALID_MODERATION_STATE", "Activity moderationState must be visible or removed");
  }

  return {
    contentFingerprint: normalizeFingerprint(record.contentFingerprint),
    canonicalUrl: null,
    authorType: record.authorType,
    moderationState: record.moderationState,
    visibility: record.visibility,
  };
}

function buildPublicActivityIndex(activityRecords) {
  if (!Array.isArray(activityRecords)) {
    fail("INVALID_INPUT", "activityRecords must be an array");
  }
  if (activityRecords.length > MAX_ACTIVITY_RECORDS) {
    fail(
      "INPUT_TOO_LARGE",
      `activityRecords must contain at most ${MAX_ACTIVITY_RECORDS} fixture records`,
    );
  }

  const index = new Map();
  for (const candidate of activityRecords) {
    const record = normalizeActivityRecord(candidate);
    if (record.visibility !== "public" || record.moderationState !== "visible") {
      continue;
    }

    const topicKey = topicKeyFor(record);
    const counts = index.get(topicKey) ?? { aiContributions: 0, humanContributions: 0 };
    if (record.authorType === "human") {
      counts.humanContributions += 1;
    } else {
      counts.aiContributions += 1;
    }
    index.set(topicKey, counts);
  }
  return index;
}

function publicActivityFor(index, topicKey) {
  const counts = index.get(topicKey) ?? { aiContributions: 0, humanContributions: 0 };
  return {
    humanContributions: counts.humanContributions,
    aiContributions: counts.aiContributions,
    totalContributions: counts.humanContributions + counts.aiContributions,
  };
}

function timestampFrom(clock) {
  const instant = clock();
  const parsed = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(parsed.valueOf())) {
    fail("INVALID_CLOCK", "Clock must return a valid Date or date value");
  }
  return parsed.toISOString();
}

/**
 * Create an isolated in-memory resolver. State lasts only for the lifetime of
 * this object; no network, filesystem, or database access is performed.
 */
export function createTopicResolver({ activityRecords = [], clock = () => new Date() } = {}) {
  if (typeof clock !== "function") {
    fail("INVALID_CLOCK", "clock must be a function");
  }

  const activityIndex = buildPublicActivityIndex(activityRecords);
  const sourcesByUrl = new Map();
  const topicsByKey = new Map();
  const discussionsByTopicId = new Map();
  const linksBySourceId = new Map();

  function resolve(observation) {
    const normalized = normalizeObservation(observation);
    const topicKey = topicKeyFor(normalized);
    const sourceId = id("source", normalized.canonicalUrl);
    const existingSource = sourcesByUrl.get(normalized.canonicalUrl);
    const existingLink = linksBySourceId.get(sourceId);

    if (
      existingSource &&
      normalized.contentFingerprint !== null &&
      existingSource.contentFingerprint !== normalized.contentFingerprint
    ) {
      fail(
        "SOURCE_FINGERPRINT_CONFLICT",
        "An observed source cannot be remapped after its first resolution in this spike",
      );
    }

    if (existingLink) {
      return deepFreeze({
        source: existingSource,
        topic: topicsByKey.get(existingLink.topicKey),
        discussion: discussionsByTopicId.get(existingLink.topicId),
        sourceTopicLink: existingLink.entity,
        publicActivity: publicActivityFor(activityIndex, existingLink.topicKey),
      });
    }

    const auditedAt = timestampFrom(clock);
    const source = deepFreeze({
      id: sourceId,
      canonicalUrl: normalized.canonicalUrl,
      contentFingerprint: normalized.contentFingerprint,
      fingerprintEvidence: normalized.fingerprintEvidence,
      title: normalized.title,
      createdAt: auditedAt,
    });

    let topic = topicsByKey.get(topicKey);
    if (!topic) {
      topic = deepFreeze({
        id: id("topic", topicKey),
        status: normalized.contentFingerprint ? "active" : "provisional",
        createdAt: auditedAt,
      });
      topicsByKey.set(topicKey, topic);
    }

    let discussion = discussionsByTopicId.get(topic.id);
    if (!discussion) {
      discussion = deepFreeze({
        id: id("discussion", topic.id),
        topicId: topic.id,
        createdAt: auditedAt,
      });
      discussionsByTopicId.set(topic.id, discussion);
    }

    const resolutionMethod = normalized.contentFingerprint
      ? RESOLUTION_METHOD.EXACT_CONTENT_FINGERPRINT
      : RESOLUTION_METHOD.PROVISIONAL_URL_FALLBACK;
    const link = deepFreeze({
      id: id("source_topic_link", `${source.id}\n${topic.id}`),
      sourceId: source.id,
      topicId: topic.id,
      resolutionMethod,
      confidence: normalized.contentFingerprint ? 1 : 0,
      resolverVersion: RESOLVER_VERSION,
      auditedAt,
      evidence: normalized.contentFingerprint
        ? {
            fingerprintAlgorithm: "sha256",
            fingerprintEvidence: normalized.fingerprintEvidence,
            kind: "exact-content-fingerprint",
          }
        : {
            canonicalUrl: normalized.canonicalUrl,
            kind: "provisional-url-fallback",
          },
    });

    sourcesByUrl.set(normalized.canonicalUrl, source);
    linksBySourceId.set(source.id, { entity: link, topicId: topic.id, topicKey });

    return deepFreeze({
      source,
      topic,
      discussion,
      sourceTopicLink: link,
      publicActivity: publicActivityFor(activityIndex, topicKey),
    });
  }

  return deepFreeze({ resolve });
}
