import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { MODEL_ID, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

export const ADAPTER_SCHEMA = 'owner-local-diagonal-adapter/v1';
export const FIT_PROTOCOL_SHA256 = '6c01b5c9562e7784ca59811610e6dbce4bffc817ef5668a4b7afe0f0a93b35d0';
export const PRIVATE_CORPUS_SHA256 = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const MAX_BYTES = 16_384;
const SHA = /^[a-f0-9]{64}$/u;
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new TypeError('Invalid local diagonal adapter'); };
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

export function makeDiagonalAdapter(parameters, { triplets, tokenizerSha256 = TOKENIZER_SHA256 } = {}) {
  if (!Array.isArray(parameters) && !(parameters instanceof Float64Array)) fail();
  const values = Array.from(parameters);
  if (values.length !== 384 || values.some(value => typeof value !== 'number' ||
      !Number.isFinite(value) || Math.abs(value) > 0.5)) fail();
  if (!Number.isSafeInteger(triplets) || triplets < 100 || triplets > 475) fail();
  if (tokenizerSha256 !== TOKENIZER_SHA256) fail();
  const payload = { schema: ADAPTER_SCHEMA, modelId: MODEL_ID, modelSha256: MODEL_SHA256,
    tokenizerSha256, fitProtocolSha256: FIT_PROTOCOL_SHA256,
    privateCorpusSha256: PRIVATE_CORPUS_SHA256, fitArticles: 475, steps: 40, triplets,
    parameters: values };
  return { ...payload, manifestSha256: digest(JSON.stringify(payload)) };
}

export function readDiagonalAdapter(value) {
  const names = ['schema', 'modelId', 'modelSha256', 'tokenizerSha256',
    'fitProtocolSha256', 'privateCorpusSha256', 'fitArticles', 'steps', 'triplets',
    'parameters', 'manifestSha256'];
  if (!fields(value, names) || typeof value.manifestSha256 !== 'string' || !SHA.test(value.manifestSha256)) fail();
  const { manifestSha256, ...payload } = value;
  if (manifestSha256 !== digest(JSON.stringify(payload))) fail();
  const canonical = makeDiagonalAdapter(payload.parameters, payload);
  if (JSON.stringify(canonical) !== JSON.stringify(value)) fail();
  return Object.freeze({ ...canonical, parameters: Object.freeze([...canonical.parameters]) });
}

export async function loadDiagonalAdapter(filename) {
  if (typeof filename !== 'string' || !filename) fail();
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_BYTES) fail();
  const bytes = await readFile(filename);
  if (bytes.length !== info.size || bytes.length > MAX_BYTES) fail();
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(); }
  return readDiagonalAdapter(value);
}

export function applyDiagonalAdapter(vector, adapter) {
  const valid = readDiagonalAdapter(adapter);
  if (!Array.isArray(vector) && !(vector instanceof Float64Array)) fail();
  if (vector.length !== 384 || [...vector].some(value => typeof value !== 'number' || !Number.isFinite(value))) fail();
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) fail();
  const scaled = vector.map((value, index) => value * Math.exp(valid.parameters[index]));
  const length = Math.hypot(...scaled);
  if (!Number.isFinite(length) || length < 1e-9) fail();
  return Object.freeze(Array.from(scaled, value => value / length));
}
