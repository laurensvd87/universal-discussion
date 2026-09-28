// Pure candidate retrieval over caller-supplied data. This module neither creates
// embeddings nor determines that semantically similar pages share a Topic.
const MAXIMUM_CANDIDATES = 100;
const MAXIMUM_DIMENSIONS = 1_536;
const RECORD_FIELDS = ["id", "url", "title", "topicId", "embedding"];
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function invalid() {
  throw new TypeError("Invalid related-source input");
}

function readRecord(value, fields, optional = false) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    (!optional && keys.length !== fields.length) ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key))
  ) invalid();
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function readArray(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalid();
  }
  // Reject oversized arrays before enumerating/materializing all descriptors.
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isInteger(length) || length < 0 || length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      !descriptor.enumerable
    ) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function text(value, maximum) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() === "" ||
    UNSAFE_TEXT.test(value)
  ) invalid();
  return value;
}

function normalizeUrl(value) {
  text(value, 8_192);
  if (/\s|\\/u.test(value)) invalid();
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== ""
  ) invalid();
  url.hash = "";
  const normalized = url.toString();
  if (normalized.length > 8_192) invalid();
  return normalized;
}

function readEmbedding(value) {
  if (value === null) return null;
  const record = readRecord(value, ["modelId", "values"]);
  const modelId = text(record.modelId, 128);
  const values = readArray(record.values, MAXIMUM_DIMENSIONS);
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry))) {
    invalid();
  }
  // Scale before taking the norm: finite extreme/subnormal coordinates must not
  // overflow to Infinity or underflow into a false zero-length vector.
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) invalid();
  const scaled = values.map((entry) => entry / scale);
  const magnitude = Math.hypot(...scaled);
  return { modelId, values: scaled.map((entry) => entry / magnitude) };
}

function readSource(value) {
  const record = readRecord(value, RECORD_FIELDS);
  return {
    id: text(record.id, 128),
    url: normalizeUrl(record.url),
    title: text(record.title, 512),
    topicId: record.topicId === null ? null : text(record.topicId, 128),
    embedding: readEmbedding(record.embedding),
  };
}

function cosine(left, right) {
  if (
    left === null ||
    right === null ||
    left.modelId !== right.modelId ||
    left.values.length !== right.values.length
  ) return null;
  const dot = left.values.reduce(
    (sum, value, index) => sum + value * right.values[index],
    0,
  );
  return Math.max(-1, Math.min(1, dot));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCandidates(left, right) {
  const leftConfirmed = left.relationship === "same-topic";
  const rightConfirmed = right.relationship === "same-topic";
  if (leftConfirmed !== rightConfirmed) return leftConfirmed ? -1 : 1;
  return (
    (right.similarity ?? 0) - (left.similarity ?? 0) ||
    compareText(left.id, right.id) ||
    compareText(left.url, right.url) ||
    compareText(left.title, right.title) ||
    compareText(left.topicId ?? "", right.topicId ?? "")
  );
}

/**
 * Rank at most 100 offline sources using existing associations or compatible
 * vectors. Equal non-null topicId values are trusted caller associations, never
 * a conclusion from cosine similarity. Related results are suggestions only.
 * URLs ignore fragments but retain every query argument; no page is fetched.
 */
export function rankRelatedSources(query, candidates, options = {}) {
  try {
    const settings = readRecord(options, ["limit", "minSimilarity"], true);
    const limit = Object.hasOwn(settings, "limit") ? settings.limit : 5;
    const minSimilarity = Object.hasOwn(settings, "minSimilarity")
      ? settings.minSimilarity
      : 0.65;
    if (
      !Number.isInteger(limit) || limit < 0 || limit > MAXIMUM_CANDIDATES ||
      !Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1
    ) invalid();
    const source = readSource(query);
    const sources = readArray(candidates, MAXIMUM_CANDIDATES).map(readSource);
    const ranked = [];
    for (const candidate of sources) {
      if (candidate.id === source.id || candidate.url === source.url) continue;
      const confirmed = source.topicId !== null && source.topicId === candidate.topicId;
      const similarity = confirmed ? null : cosine(source.embedding, candidate.embedding);
      if (!confirmed && (similarity === null || similarity < minSimilarity)) continue;
      ranked.push({
        id: candidate.id,
        url: candidate.url,
        title: candidate.title,
        topicId: candidate.topicId,
        relationship: confirmed ? "same-topic" : "related",
        method: confirmed ? "confirmed-topic" : "vector-similarity",
        similarity,
      });
    }
    ranked.sort(compareCandidates);
    const seenIds = new Set();
    const seenUrls = new Set();
    const result = [];
    for (const candidate of ranked) {
      if (seenIds.has(candidate.id) || seenUrls.has(candidate.url)) continue;
      seenIds.add(candidate.id);
      seenUrls.add(candidate.url);
      if (result.length < limit) result.push(Object.freeze(candidate));
    }
    return Object.freeze(result);
  } catch {
    // Never include private URL/query/title/vector values in validation errors.
    invalid();
  }
}
