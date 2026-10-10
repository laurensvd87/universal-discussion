// Owner-local affine Ridge1 transfer. The installed JSON contains coefficients only.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { MODEL_ID, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

export const RIDGE_TOPIC_SCHEMA = 'owner-local-linear-teacher-transfer/ridge1-v1';
export const RIDGE_TOPIC_MAX_BYTES = 8 * 1024 * 1024;
export const RIDGE_PARAMETER_SHA256 = '593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4';
export const RIDGE_FIT_SHA256 = '8951b0aef42b90260080d81997225b9aa12d959f04e81d9c7563ca766a33a3b8';
export const RIDGE_CORPUS_SHA256 = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
export const RIDGE_TEACHER_MODEL_SHA256 = '783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672';
const SHA = /^[a-f0-9]{64}$/u;
const fail = () => { throw new TypeError('Invalid local Ridge1 Topic adapter'); };
const digest = value => createHash('sha256').update(value).digest('hex');
const FIELDS = ['schema', 'dimensions', 'lambda', 'fitArticles', 'fitRepresentation', 'modelId',
  'modelSha256', 'tokenizerSha256', 'teacherModelId', 'teacherRevision', 'teacherModelSha256',
  'fitProtocolSha256', 'privateCorpusSha256', 'parameterSha256', 'weights', 'meanX', 'meanY'];

function record(value, names) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== names.length) fail();
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
  }
}
function numbers(value, length, maximum) {
  if (!value || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype || value.length !== length ||
      Reflect.ownKeys(value).length !== length + 1) fail();
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable ||
        typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value) ||
        Math.abs(descriptor.value) > maximum) fail();
    copy[i] = descriptor.value;
  }
  return copy;
}
function payload(weights, meanX, meanY) {
  const matrix = numbers(weights, 384 * 384, 1000);
  const x = numbers(meanX, 384, 1), y = numbers(meanY, 384, 1);
  const parameterSha256 = digest(JSON.stringify([matrix, x, y]));
  return { schema: RIDGE_TOPIC_SCHEMA, dimensions: 384, lambda: 1, fitArticles: 475,
    fitRepresentation: 'body-prefix-4096-query-512/v1', modelId: MODEL_ID,
    modelSha256: MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA256,
    teacherModelId: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    teacherRevision: 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42',
    teacherModelSha256: RIDGE_TEACHER_MODEL_SHA256,
    fitProtocolSha256: RIDGE_FIT_SHA256, privateCorpusSha256: RIDGE_CORPUS_SHA256,
    parameterSha256, weights: matrix, meanX: x, meanY: y };
}
export function makeRidgeTopicAdapter(model) {
  record(model, ['weights', 'meanX', 'meanY']);
  const canonical = payload(model.weights, model.meanX, model.meanY);
  return { ...canonical, manifestSha256: digest(JSON.stringify(canonical)) };
}
export function readRidgeTopicAdapter(value, { expectedParameterSha256 = null } = {}) {
  record(value, [...FIELDS, 'manifestSha256']);
  if (typeof value.manifestSha256 !== 'string' || !SHA.test(value.manifestSha256)) fail();
  const canonical = payload(value.weights, value.meanX, value.meanY);
  if (expectedParameterSha256 !== null && canonical.parameterSha256 !== expectedParameterSha256) fail();
  for (const key of FIELDS) if (!['weights', 'meanX', 'meanY'].includes(key) && value[key] !== canonical[key]) fail();
  if (digest(JSON.stringify(canonical)) !== value.manifestSha256) fail();
  Object.freeze(canonical.weights); Object.freeze(canonical.meanX); Object.freeze(canonical.meanY);
  return Object.freeze({ ...canonical, manifestSha256: value.manifestSha256 });
}
export function createRidgeTopicTransform(artifact) {
  const { weights, meanX, meanY } = readRidgeTopicAdapter(artifact);
  return Object.freeze(function transform(vector) {
    const source = numbers(vector, 384, 1 + 1e-5);
    const norm = Math.hypot(...source);
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) fail();
    const result = new Array(384);
    for (let k = 0; k < 384; k++) {
      let value = meanY[k];
      for (let j = 0; j < 384; j++) value += weights[k * 384 + j] * (source[j] / norm - meanX[j]);
      if (!Number.isFinite(value)) fail();
      result[k] = value;
    }
    const length = Math.hypot(...result);
    if (!Number.isFinite(length) || length <= 1e-9) fail();
    return Object.freeze(result.map(value => value / length));
  });
}
