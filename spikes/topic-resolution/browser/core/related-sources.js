// Pure candidate retrieval over caller-supplied data. This module neither creates
// embeddings nor determines that semantically similar pages share a Topic.
const MAXIMUM_RESULTS = 100;
const MAXIMUM_INPUT_UNITS = 8 * 1024 * 1024;
// Relational catalogs no longer share the legacy 8 MiB document bound. Keep
// prepared trusted snapshots finite while admitting the current saved catalog;
// direct caller input retains its original budget and all shape checks.
const MAXIMUM_PREPARED_INPUT_UNITS = 16 * 1024 * 1024;
// Every valid source takes more than 64 bytes in the service's bounded JSON
// snapshot. This preflight prevents huge arrays from reaching descriptor scans.
const MAXIMUM_SOURCES = Math.floor(MAXIMUM_INPUT_UNITS / 64);
const MAXIMUM_DIMENSIONS = 1_536;
const RECORD_FIELDS = ["id", "url", "title", "topicId", "embedding"];
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ownedJsonEmbeddings = new WeakSet();
const preparedSources = new WeakMap();

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
  // Enumerate shape once, then read one data descriptor at a time. Materializing
  // millions of descriptor objects together adds avoidable allocation/GC work;
  // this keeps the same dense/own/enumerable/no-getter checks without reads.
  if (Reflect.ownKeys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
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

function normalizeEmbedding(modelId, values) {
  // Scale before taking the norm: finite extreme/subnormal coordinates must not
  // overflow to Infinity or underflow into a false zero-length vector.
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) invalid();
  const scaled = values.map((entry) => entry / scale);
  const magnitude = Math.hypot(...scaled);
  return { modelId, values: scaled.map((entry) => entry / magnitude) };
}

// Only this JSON parser can mint the identity marker. JSON creates dense plain
// data arrays, all numeric/shape bounds are checked, and the returned raw values
// are frozen. Untrusted caller arrays still take the full descriptor-safe path.
// The marker retains no snapshot/result/vector cache and grants no authority.
export function parseRelatedEmbeddingJson(json) {
  try {
    if (typeof json !== "string") invalid();
    const record = readRecord(JSON.parse(json), ["modelId", "values"]);
    const modelId = text(record.modelId, 128), values = record.values;
    if (!Array.isArray(values) || values.length < 1 || values.length > MAXIMUM_DIMENSIONS ||
        values.some(value => !Number.isFinite(value))) invalid();
    const embedding = Object.freeze({ modelId, values: Object.freeze(values) });
    ownedJsonEmbeddings.add(embedding);
    return embedding;
  } catch { invalid(); }
}

function readEmbedding(value) {
  if (value === null) return null;
  if (ownedJsonEmbeddings.has(value)) return normalizeEmbedding(value.modelId, value.values);
  const record = readRecord(value, ["modelId", "values"]);
  const modelId = text(record.modelId, 128);
  const values = readArray(record.values, MAXIMUM_DIMENSIONS);
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry))) invalid();
  return normalizeEmbedding(modelId, values);
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

// An opaque identity can only be minted after the ordinary complete source
// validation and exact normalization. The private owned copy is never exposed:
// no caller-supplied flag, frozen object or lookalike token can bypass checks.
export function prepareRelatedSource(value) {
  try {
    const source = readSource(value), token = Object.freeze({});
    preparedSources.set(token, source);
    return token;
  } catch { invalid(); }
}

function readPreparedSource(token) {
  const source = preparedSources.get(token);
  if (!source) invalid();
  return source;
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
  const settings = readRecord(options, ["limit", "minSimilarity", "fallbackMinSimilarity"], true);
  const limit = Object.hasOwn(settings, "limit") ? settings.limit : 5;
  const minSimilarity = Object.hasOwn(settings, "minSimilarity") ? settings.minSimilarity : 0.65;
  const fallbackMinSimilarity = Object.hasOwn(settings, "fallbackMinSimilarity") ? settings.fallbackMinSimilarity : minSimilarity;
  if (!Number.isInteger(limit) || limit < 0 || limit > MAXIMUM_RESULTS ||
      !Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1 ||
      !Number.isFinite(fallbackMinSimilarity) || fallbackMinSimilarity < -1 || fallbackMinSimilarity > minSimilarity) invalid();
  return { limit, minSimilarity, fallbackMinSimilarity };
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

function selectRanked(ranked, { limit, minSimilarity }) {
  const ordinary = ranked.filter(candidate => candidate.relationship === "same-topic" || candidate.similarity >= minSimilarity);
  // All candidates were validated/scored in the same scan. Keep the normal
  // result set intact; only an empty set may use its single best lower hit.
  return ordinary.length ? finishRanked(ordinary, limit) : finishRanked(ranked, Math.min(limit, 1));
}

// Explicit caller-owned preparation for repeated reads of one immutable current
// snapshot. The closure stores only validated normalized copies, never observes
// later caller mutations, and has no global cache or independent version/write
// authority. Callers must discard it whenever their authoritative snapshot moves.
export function prepareRelatedSources(candidates) {
  const preparation = createRelatedSourcesPreparation();
  preparation.append(candidates);
  return preparation.finish();
}

// A caller owning one immutable snapshot can yield between batches without
// bypassing any cumulative shape/count/size checks. Nothing can rank partial
// preparation, and any invalid batch poisons the whole preparation.
export function createRelatedSourcesPreparation() {
  const sources = [];
  let inputUnits = 0, closed = false;
  function append(candidates, prepared) {
    if (closed) invalid();
    try {
      const values = readArray(candidates, MAXIMUM_SOURCES);
      if (sources.length + values.length > MAXIMUM_SOURCES) invalid();
      for (const value of values) {
        const candidate = prepared ? readPreparedSource(value) : readSource(value);
        inputUnits += sourceUnits(candidate);
        if (inputUnits > MAXIMUM_PREPARED_INPUT_UNITS) invalid();
        sources.push(candidate);
      }
    } catch { closed = true; sources.length = 0; invalid(); }
  }
  function rank(source, settings) {
    const ranked = [];
    for (const candidate of sources) appendCandidate(ranked, source, candidate, settings.fallbackMinSimilarity);
    return selectRanked(ranked, settings);
  }
  return Object.freeze({ append(candidates) {
    append(candidates, false);
  }, appendPrepared(tokens) {
    append(tokens, true);
  }, finish() {
    if (closed) invalid();
    closed = true;
    return Object.freeze({ rank(query, options = {}) {
      try {
        const settings = readSettings(options);
        return rank(readSource(query), settings);
      } catch { invalid(); }
    }, rankPrepared(query, options = {}) {
      try {
        const settings = readSettings(options);
        return rank(readPreparedSource(query), settings);
      } catch { invalid(); }
    } });
  } });
}

/**
 * Rank offline sources using existing associations or compatible
 * vectors. Equal non-null topicId values are trusted caller associations, never
 * a conclusion from cosine similarity. Related results are suggestions only.
 * URLs ignore fragments but retain every query argument; no page is fetched.
 */
export function rankRelatedSources(query, candidates, options = {}) {
  try {
    const settings = readSettings(options);
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
      appendCandidate(ranked, source, candidate, settings.fallbackMinSimilarity);
    }
    return selectRanked(ranked, settings);
  } catch {
    // Never include private URL/query/title/vector values in validation errors.
    invalid();
  }
}
