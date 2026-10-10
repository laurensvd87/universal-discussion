// Inert owner-local BODY metric. No production caller, persistence or DTO here.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { types } from 'node:util';
import { MODEL_ID, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

export const BODY_METRIC_SCHEMA = 'owner-local-body-topic-metric/v1';
export const BODY_METRIC_DIMENSIONS = 384;
export const BODY_METRIC_PACKED_LENGTH = 73_920;
export const BODY_METRIC_MAX_BYTES = 2 * 1024 * 1024;
export const BODY_METRIC_FIT_SHA256 = '32fe859b6b2e4c11e605d3d5cb0dead86644aee3647ac83962ecaa7f59264116';
export const BODY_METRIC_CORPUS_SHA256 = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const fail = () => { throw new TypeError('Invalid local BODY Topic metric'); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const FIELDS = ['schema', 'dimensions', 'selected', 'modelId', 'modelSha256', 'tokenizerSha256',
  'fitProtocolSha256', 'privateCorpusSha256', 'fitArticles', 'fitRepresentation', 'mean', 'lower'];

function dataObject(value, names) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== names.length) fail();
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
  }
}

function numbers(value, length, maximum = 1) {
  if (!value || types.isProxy(value)) fail();
  const array = Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
  const typed = value && [Float64Array.prototype, Float32Array.prototype].includes(Object.getPrototypeOf(value));
  if ((!array && !typed) || Reflect.ownKeys(value).length !== length + (array ? 1 : 0) ||
      value.length !== length) fail();
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
    const number = descriptor.value;
    if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > maximum) fail();
    copy[i] = number;
  }
  return copy;
}

function payload(mean, lower) {
  const center = numbers(mean, BODY_METRIC_DIMENSIONS);
  const packed = numbers(lower, BODY_METRIC_PACKED_LENGTH);
  for (let i = 0; i < BODY_METRIC_DIMENSIONS; i++) {
    if (packed[i * (i + 1) / 2 + i] < 1e-8) fail();
  }
  return { schema: BODY_METRIC_SCHEMA, dimensions: BODY_METRIC_DIMENSIONS,
    selected: 'within-shrink-50', modelId: MODEL_ID, modelSha256: MODEL_SHA256,
    tokenizerSha256: TOKENIZER_SHA256, fitProtocolSha256: BODY_METRIC_FIT_SHA256,
    privateCorpusSha256: BODY_METRIC_CORPUS_SHA256, fitArticles: 475,
    fitRepresentation: 'body-prefix-4096-query-512/v1', mean: center, lower: packed };
}

// Only the explicit installer constructs weights. The dense research matrix is
// packed row-major, retaining its diagonal; fitted arrays are never borrowed.
export function makeBodyTopicMetric(metric, assets = { modelSha256: MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA256 }) {
  dataObject(metric, ['mean', 'lower']);
  dataObject(assets, ['modelSha256', 'tokenizerSha256']);
  if (assets.modelSha256 !== MODEL_SHA256 || assets.tokenizerSha256 !== TOKENIZER_SHA256) fail();
  const dense = numbers(metric.lower, BODY_METRIC_DIMENSIONS ** 2);
  const lower = [];
  for (let i = 0; i < BODY_METRIC_DIMENSIONS; i++) for (let j = 0; j < BODY_METRIC_DIMENSIONS; j++) {
    if (j <= i) lower.push(dense[i * BODY_METRIC_DIMENSIONS + j]);
    else if (dense[i * BODY_METRIC_DIMENSIONS + j] !== 0) fail();
  }
  const canonical = payload(metric.mean, lower);
  return freezeArtifact({ ...canonical, manifestSha256: digest(JSON.stringify(canonical)) });
}

function freezeArtifact(value) {
  Object.freeze(value.mean); Object.freeze(value.lower);
  return Object.freeze(value);
}

export function readBodyTopicMetric(value) {
  dataObject(value, [...FIELDS, 'manifestSha256']);
  if (typeof value.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.manifestSha256)) fail();
  const canonical = payload(value.mean, value.lower);
  for (const key of FIELDS) if (key !== 'mean' && key !== 'lower' && value[key] !== canonical[key]) fail();
  if (digest(JSON.stringify(canonical)) !== value.manifestSha256) fail();
  return freezeArtifact({ ...canonical, manifestSha256: value.manifestSha256 });
}

// Bounded descriptor read, including post-open identity/size checks. Never
// readFile an attacker-replaced unbounded file or follow a reparse path.
export async function loadBodyTopicMetric(filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\0')) fail();
  const target = path.resolve(filename);
  const initial = await lstat(target);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size < 1 || initial.size > BODY_METRIC_MAX_BYTES ||
      path.resolve(await realpath(target)) !== target) fail();
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== initial.size || opened.dev !== initial.dev || opened.ino !== initial.ino ||
        path.resolve(await realpath(target)) !== target) fail();
    const buffer = Buffer.alloc(BODY_METRIC_MAX_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    const final = await handle.stat();
    if (used !== initial.size || used > BODY_METRIC_MAX_BYTES || final.size !== initial.size ||
        final.mtimeMs !== opened.mtimeMs || final.ctimeMs !== opened.ctimeMs) fail();
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used))); }
    catch { fail(); }
    return readBodyTopicMetric(parsed);
  } finally { await handle.close(); }
}

// Validation and manifest hashing occur ONCE. Returned closure exposes only a
// separate unit vector, never coefficients or mutable artifact references.
export function createBodyTopicMetricTransform(artifact) {
  const valid = readBodyTopicMetric(artifact);
  return Object.freeze(function transform(vector) {
    const source = numbers(vector, BODY_METRIC_DIMENSIONS, 1 + 1e-5);
    const norm = Math.hypot(...source);
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) fail();
    const output = new Array(BODY_METRIC_DIMENSIONS);
    for (let i = 0; i < BODY_METRIC_DIMENSIONS; i++) {
      const offset = i * (i + 1) / 2;
      let value = source[i] / norm - valid.mean[i];
      for (let j = 0; j < i; j++) value -= valid.lower[offset + j] * output[j];
      output[i] = value / valid.lower[offset + i];
      if (!Number.isFinite(output[i])) fail();
    }
    const length = Math.hypot(...output);
    if (!Number.isFinite(length) || length <= 1e-10) fail();
    return Object.freeze(output.map(value => value / length));
  });
}
