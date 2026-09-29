import { createHash } from "node:crypto";
import { corpusDigest, validateCorpus } from "./evaluate.js";

export const EXPECTED_CORPUS_DIGEST = "4a75170ae6e0b4db993f1d0f17b79f57519a2da4ba306c10304fb21c60cb19a9";

function invalid() { throw new TypeError("Invalid embedding experiment input"); }
function record(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) invalid();
  if (keys.some((key) => !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) invalid();
}
function array(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index += 1) {
    const item = descriptors[index];
    if (!item || !Object.hasOwn(item, "value") || !item.enumerable) invalid();
  }
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function normalize(values) {
  const scale = Math.max(...values.map(Math.abs));
  if (!scale || !Number.isFinite(scale)) invalid();
  const scaled = values.map((value) => value / scale);
  const magnitude = Math.hypot(...scaled);
  return scaled.map((value) => value / magnitude);
}

export function assertFrozenCorpus(corpus) {
  if (corpusDigest(corpus) !== EXPECTED_CORPUS_DIGEST) throw new TypeError("Embedding corpus freeze mismatch");
  return validateCorpus(corpus);
}

/** The length bound is UTF-16 code units, matching the descriptor/ranker contracts. */
export function validateDescriptor(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 4096 || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(text)) invalid();
  return text;
}

/** Caller must pass the complete model input, including prefixes and special tokens. */
export function validateTokenIds(ids, { rows, maxTokens = 512 } = {}) {
  if (!Number.isSafeInteger(rows) || rows < 1 || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 512) invalid();
  array(ids, maxTokens);
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id < 0 || id >= rows)) invalid();
  return Object.freeze([...ids]);
}

/** Masked mean of unpooled E5 hidden states; includes special tokens whose mask is one. */
export function meanPoolHidden(hidden, attentionMask) {
  record(hidden, ["data", "dims"]);
  array(hidden.dims, 3);
  const [batch, tokens, dimensions] = hidden.dims;
  if (hidden.dims.length !== 3 || batch !== 1 || !Number.isInteger(tokens) || tokens < 1 || tokens > 512 || dimensions !== 384) invalid();
  const data = hidden.data;
  if (!(data instanceof Float32Array) && !(data instanceof Float64Array)) array(data, 512 * 384);
  if (data.length !== tokens * dimensions) invalid();
  if (!ArrayBuffer.isView(attentionMask)) array(attentionMask, 512);
  if (attentionMask instanceof DataView || attentionMask.length !== tokens) invalid();
  const mask = Array.from(attentionMask, (value) => {
    if (value !== 0 && value !== 1 && value !== 0n && value !== 1n) invalid();
    return Number(value);
  });
  const active = mask.reduce((sum, value) => sum + value, 0);
  if (!active) invalid();
  let scale = 0;
  for (let index = 0; index < data.length; index += 1) {
    if (!Number.isFinite(data[index])) invalid();
    if (mask[Math.floor(index / dimensions)]) scale = Math.max(scale, Math.abs(data[index]));
  }
  if (!scale) invalid();
  const mean = Array(dimensions).fill(0);
  for (let token = 0; token < tokens; token += 1) {
    if (!mask[token]) continue;
    for (let coordinate = 0; coordinate < dimensions; coordinate += 1) mean[coordinate] += (data[token * dimensions + coordinate] / scale) / active;
  }
  return Object.freeze(normalize(mean));
}

/** Asset, preprocessing and implementation identity; not cross-runtime parity certification. */
export function buildE5ModelId(input) {
  const fields = ["sourceSha256", "tokenizerSha256", "configSha256", "tokenizerConfigSha256", "specialTokensSha256", "revision"];
  record(input, fields);
  if (fields.filter((field) => field !== "revision").some((field) => typeof input[field] !== "string" || !/^[a-f0-9]{64}$/u.test(input[field]))) invalid();
  if (typeof input.revision !== "string" || !/^[a-f0-9]{40}$/u.test(input.revision)) invalid();
  const identity = {
    ...Object.fromEntries(fields.map((field) => [field, input[field]])),
    inputPrefix: "query: ",
    inputLimit: "512-including-prefix-and-special-tokens/reject-not-truncate",
    recipe: "multilingual-e5-small/query-both-sides/special-tokens-enabled/mask-includes-special-excludes-pad/hidden-masked-mean/l2/384/q8/cpu-only",
    implementation: "javascript-node/tokenizers-0.2.0/onnxruntime-node-1.30.0/direct-cpu/parity-uncertified/v1",
  };
  const digest = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return `e5-q8-js-cpu-uncertified/v1:${digest}`;
}

function vectorCollection(collection) {
  record(collection, ["modelId", "dimensions", "vectors"]);
  if (typeof collection.modelId !== "string" || !collection.modelId.trim() || collection.modelId.length > 128 || !Number.isInteger(collection.dimensions) || collection.dimensions < 1 || collection.dimensions > 1536) invalid();
  array(collection.vectors, 64);
  if (!collection.vectors.length) invalid();
  const vectors = new Map();
  for (const vector of collection.vectors) {
    record(vector, ["id", "modelId", "values"]);
    if (typeof vector.id !== "string" || !vector.id.trim() || vector.id.length > 128 || vector.modelId !== collection.modelId || vectors.has(vector.id)) invalid();
    array(vector.values, 1536);
    if (vector.values.length !== collection.dimensions || vector.values.some((value) => !Number.isFinite(value))) invalid();
    vectors.set(vector.id, normalize(vector.values));
  }
  return vectors;
}

/** Only explicitly approved matched control variants may opt into differing model IDs. */
export function compareVectors(reference, candidate, options = {}) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => key !== "allowRelatedVariantComparison" || !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable) || (Object.hasOwn(options, "allowRelatedVariantComparison") && typeof options.allowRelatedVariantComparison !== "boolean")) invalid();
  const left = vectorCollection(reference);
  const right = vectorCollection(candidate);
  if ((reference.modelId !== candidate.modelId && !options.allowRelatedVariantComparison) || reference.dimensions !== candidate.dimensions || left.size !== right.size || [...left.keys()].some((id) => !right.has(id))) invalid();
  const perId = [...left.keys()].sort().map((id) => {
    const values = right.get(id);
    const cosine = Math.max(-1, Math.min(1, left.get(id).reduce((sum, value, index) => sum + value * values[index], 0)));
    return { id, cosine, drift: 1 - cosine };
  });
  return freeze({
    referenceModelId: reference.modelId, candidateModelId: candidate.modelId,
    relatedVariantComparison: reference.modelId !== candidate.modelId,
    count: perId.length, meanDrift: perId.reduce((sum, row) => sum + row.drift, 0) / perId.length,
    maxDrift: Math.max(...perId.map((row) => row.drift)), perId,
  });
}

/** Nonnegative milliseconds; nearest-rank p95 and midpoint median for even counts. */
export function summarizeTimings(samples) {
  array(samples, 100_000);
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) invalid();
  const sorted = [...samples].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[midpoint] : sorted[midpoint - 1] / 2 + sorted[midpoint] / 2;
  return Object.freeze({ count: sorted.length, min: sorted[0], median, p95: sorted[Math.ceil(0.95 * sorted.length) - 1], max: sorted.at(-1) });
}
