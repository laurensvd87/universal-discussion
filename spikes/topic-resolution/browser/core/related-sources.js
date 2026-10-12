// Pure candidate retrieval over caller-supplied data. This module neither creates
// embeddings nor determines that semantically similar pages share a Topic.
const MAXIMUM_RESULTS = 100;
const MAXIMUM_INPUT_UNITS = 8 * 1024 * 1024;
// Every valid source takes more than 64 bytes in the service's bounded JSON
// snapshot. This preflight prevents huge arrays from reaching descriptor scans.
const MAXIMUM_SOURCES = Math.floor(MAXIMUM_INPUT_UNITS / 64);
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
  let dot = 0;
  for (let index = 0; index < left.values.length; index++) dot += left.values[index] * right.values[index];
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

function readSettings(options) {
  const settings = readRecord(options, ["limit", "minSimilarity"], true);
  const limit = Object.hasOwn(settings, "limit") ? settings.limit : 5;
  const minSimilarity = Object.hasOwn(settings, "minSimilarity") ? settings.minSimilarity : 0.65;
  if (!Number.isInteger(limit) || limit < 0 || limit > MAXIMUM_RESULTS ||
      !Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1) invalid();
  return { limit, minSimilarity };
}

function sourceUnits(candidate) {
  return candidate.id.length + candidate.url.length + candidate.title.length +
    (candidate.topicId?.length ?? 0) +
    (candidate.embedding === null ? 0 : candidate.embedding.modelId.length + candidate.embedding.values.length);
}

function appendCandidate(ranked, source, candidate, minSimilarity) {
  if (candidate.id === source.id || candidate.url === source.url) return;
  const confirmed = source.topicId !== null && source.topicId === candidate.topicId;
  const similarity = confirmed ? null : cosine(source.embedding, candidate.embedding);
  if (!confirmed && (similarity === null || similarity < minSimilarity)) return;
  ranked.push({ id: candidate.id, url: candidate.url, title: candidate.title, topicId: candidate.topicId,
    relationship: confirmed ? "same-topic" : "related", method: confirmed ? "confirmed-topic" : "vector-similarity", similarity });
}

function finishRanked(ranked, limit) {
  ranked.sort(compareCandidates);
  const seenIds = new Set(), seenUrls = new Set(), result = [];
  for (const candidate of ranked) {
    if (seenIds.has(candidate.id) || seenUrls.has(candidate.url)) continue;
    seenIds.add(candidate.id); seenUrls.add(candidate.url);
    if (result.length < limit) result.push(Object.freeze(candidate));
  }
  return Object.freeze(result);
}

// Explicit caller-owned preparation for repeated reads of one immutable current
// snapshot. The closure stores only validated normalized copies, never observes
// later caller mutations, and has no global cache or independent version/write
// authority. Callers must discard it whenever their authoritative snapshot moves.
export function prepareRelatedSources(candidates) {
  try {
    const sources = [], values = readArray(candidates, MAXIMUM_SOURCES);
    let inputUnits = 0;
    for (const value of values) {
      const candidate = readSource(value);
      inputUnits += sourceUnits(candidate);
      if (inputUnits > MAXIMUM_INPUT_UNITS) invalid();
      sources.push(candidate);
    }
    return Object.freeze({ rank(query, options = {}) {
      try {
        const { limit, minSimilarity } = readSettings(options), source = readSource(query), ranked = [];
        for (const candidate of sources) appendCandidate(ranked, source, candidate, minSimilarity);
        return finishRanked(ranked, limit);
      } catch { invalid(); }
    } });
  } catch { invalid(); }
}

/**
 * Rank offline sources using existing associations or compatible
 * vectors. Equal non-null topicId values are trusted caller associations, never
 * a conclusion from cosine similarity. Related results are suggestions only.
 * URLs ignore fragments but retain every query argument; no page is fetched.
 */
export function rankRelatedSources(query, candidates, options = {}) {
  try {
    const { limit, minSimilarity } = readSettings(options);
    const source = readSource(query);
    const sources = readArray(candidates, MAXIMUM_SOURCES);
    let inputUnits = 0;
    const ranked = [];
    for (const value of sources) {
      const candidate = readSource(value);
      // A source's text code units and vector coordinates each consume at
      // least one byte in its serialized snapshot. Bound total ranking work
      // even for callers that bypass the service's snapshot limit.
      inputUnits += sourceUnits(candidate);
      if (inputUnits > MAXIMUM_INPUT_UNITS) invalid();
      appendCandidate(ranked, source, candidate, minSimilarity);
    }
    return finishRanked(ranked, limit);
  } catch {
    // Never include private URL/query/title/vector values in validation errors.
    invalid();
  }
}
