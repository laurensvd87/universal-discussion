// Offline derived-input experiment. No encoding, probabilities, topic fallback,
// canonical model identity or production assignment authority is supplied here.
import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const PAIRED_E5_LIMITS = Object.freeze({ dimensions: 384, maxStringUnits: 160,
  normToleranceSquared: 1e-5, maxBodyUtf16Units: 4096, maxRetainedTitleUtf16Units: 512 });
export class PairedE5InputError extends TypeError {
  constructor(code, message) { super(message); this.name = 'PairedE5InputError'; this.code = code; }
}
const bad = message => { throw new PairedE5InputError('invalid-input', message); };
const capacity = message => { throw new PairedE5InputError('capacity', message); };
const handles = new WeakMap();
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) bad('Expected exact plain paired-input data');
  const result = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected enumerable paired-input data fields');
    result[field] = d.value;
  }
  return result;
}
function text(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) bad('Invalid Source witness');
  if (value.length > PAIRED_E5_LIMITS.maxStringUnits) capacity('Source witness UTF-16 capacity exceeded');
  return value;
}
function vector(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype) bad('Expected plain unit-vector array');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > PAIRED_E5_LIMITS.dimensions) capacity('Paired-input vector dimension capacity exceeded');
  if (length !== PAIRED_E5_LIMITS.dimensions || Reflect.ownKeys(value).length !== length + 1) bad('Expected exact dense 384-vector');
  const result = new Array(length); let squaredNorm = 0;
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected vector data coordinates');
    const n = d.value;
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1) bad('Invalid vector coordinate');
    result[i] = n; squaredNorm += n * n;
  }
  if (Math.abs(squaredNorm - 1) > PAIRED_E5_LIMITS.normToleranceSquared) bad('Expected unit input vector; no implicit input normalization');
  return result;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}

/** The field contracts identify how callers must have built the two vectors.
 * They do not prove captured title/body contents: this adapter receives no text. */
export function compilePairedE5Input(input) {
  const a = record(input, ['bodyWeight', 'titleWeight', 'encoderHash']);
  for (const key of ['bodyWeight', 'titleWeight']) if (typeof a[key] !== 'number' || !Number.isFinite(a[key]) || a[key] < 0 || a[key] > 1) bad('Invalid fusion weight');
  if (a.bodyWeight + a.titleWeight !== 1) bad('Binary64 weights must sum exactly to one');
  if (typeof a.encoderHash !== 'string' || !/^[a-f0-9]{64}$/u.test(a.encoderHash)) bad('Expected lowercase SHA-256 encoder identity');
  const definition = freeze({ schema: 'paired-raw-e5-body-title/v1',
    algorithm: 'binary64-weighted-sum-max-scaled-l2/v1',
    bodyWeight: a.bodyWeight === 0 ? 0 : a.bodyWeight, titleWeight: a.titleWeight === 0 ? 0 : a.titleWeight,
    encoderHash: a.encoderHash, dimensions: PAIRED_E5_LIMITS.dimensions,
    inputContract: { array: 'plain-finite-binary64-unit-vector', normToleranceSquared: PAIRED_E5_LIMITS.normToleranceSquared },
    bodyContract: { field: 'bounded-source-body', prefix: 'query: ', maxUtf16Units: 4096,
      maxTotalTokens: 512, specialTokenPositions: 2, maxPrefixAndBodyTokenIds: 510 },
    titleContract: { field: 'retained-source-title', prefix: 'query: ', maxRetainedUtf16Units: 512,
      maxTotalTokens: 512, specialTokenPositions: 2, maxPrefixAndTitleTokenIds: 510 },
    endpointPolicy: 'copy-selected-input-without-normalization-preserving-signed-zero',
    zeroNormPolicy: 'unavailable-no-topic-fallback' });
  const metadata = freeze({ representation: 'paired-raw-e5-body-title-v1',
    representationHash: createHash('sha256').update(JSON.stringify(definition)).digest('hex'),
    definition, experimental: true, productionValidated: false });
  const handle = Object.freeze({}); handles.set(handle, metadata); return handle;
}

export function describePairedE5Input(handle) {
  const metadata = handles.get(handle);
  if (!metadata) bad('Expected privately compiled paired-input adapter');
  return metadata;
}

/** Both vectors are always validated, including an endpoint's unused field.
 * Endpoint copies preserve exact existing binary64 values. Only interior fusion
 * is normalized, under the separately hashed derived-input representation. */
export function applyPairedE5Input(handle, input) {
  const metadata = describePairedE5Input(handle);
  const a = record(input, ['sourceId', 'sourceVersion', 'bodyVector', 'titleVector']);
  text(a.sourceId); text(a.sourceVersion);
  const body = vector(a.bodyVector), title = vector(a.titleVector);
  let bodyTitleCosine = 0;
  for (let i = 0; i < body.length; i++) bodyTitleCosine += body[i] * title[i];
  const { bodyWeight, titleWeight } = metadata.definition;
  let fused;
  if (bodyWeight === 1) fused = body;
  else if (titleWeight === 1) fused = title;
  else {
    fused = body.map((n, i) => bodyWeight * n + titleWeight * title[i]);
    let maximum = 0;
    for (const n of fused) maximum = Math.max(maximum, Math.abs(n));
    if (maximum === 0) return freeze({ ...metadata, sourceId: a.sourceId, sourceVersion: a.sourceVersion,
      bodyTitleCosine, status: 'unavailable', reason: 'zero-fused-norm', vector: null });
    const scaled = fused.map(n => n / maximum), norm = Math.hypot(...scaled);
    if (!Number.isFinite(norm) || norm <= 0) bad('Invalid derived normalization');
    fused = scaled.map(n => n / norm);
  }
  return freeze({ ...metadata, sourceId: a.sourceId, sourceVersion: a.sourceVersion,
    bodyTitleCosine, status: 'available', reason: null, vector: fused });
}
