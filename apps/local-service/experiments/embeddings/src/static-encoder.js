// Pure numeric adapter: no filesystem, tokenizer, runtime or acquisition work on import.
import { createHash } from 'node:crypto';

const MAX_HEADER_BYTES = 16_384;
const MAX_ROWS = 105_879;
const MAX_DIMENSIONS = 1_024;
const MAX_BYTES = 512 * 1024 * 1024;
const MAGIC = Buffer.from('UDSTI8V1');
const POOLING = 'token-id-mean/l2/v1';
const RECIPE = 'prefix-dimensions/row-symmetric-int8/float32-scale/v1';
const tables = new WeakSet();

function fail(message) { throw new Error(`Invalid static embedding: ${message}`); }
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(name);
  return value;
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(name);
  return value;
}
function fields(value, expected, name) {
  object(value, name);
  if (Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) fail(`${name} fields`);
}

// JSON.parse alone accepts duplicate keys. Inspect decoded keys before parsing,
// rejecting duplicates, prototype/path keys and excessive nesting throughout.
function parseHeader(bytes) {
  const input = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const stack = [];
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '{' || char === '[') {
      if (stack.length >= 16) fail('header nesting');
      stack.push(char === '{' ? new Set() : null);
    } else if (char === '}' || char === ']') {
      stack.pop();
    } else if (char === '"') {
      const start = i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\') i++;
        i++;
      }
      const value = JSON.parse(input.slice(start, i + 1));
      let next = i + 1;
      while (/\s/.test(input[next] ?? '') && next < input.length) next++;
      if (input[next] === ':') {
        const keys = stack.at(-1);
        if (!(keys instanceof Set) || keys.has(value)) fail('duplicate header key');
        if (['__proto__', 'prototype', 'constructor'].includes(value) || /[/\\\u0000-\u001f]/.test(value)) fail('unsafe header key');
        keys.add(value);
      }
    }
  }
  return object(JSON.parse(input), 'header');
}

function identity(metadata) {
  fields(metadata, ['modelId', 'revision', 'sourceSha256', 'tokenizerSha256'], 'identity');
  if (typeof metadata.modelId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(metadata.modelId)) fail('modelId');
  if (typeof metadata.revision !== 'string' || !/^[a-f0-9]{40}$/.test(metadata.revision)) fail('revision');
  for (const key of ['sourceSha256', 'tokenizerSha256']) {
    if (typeof metadata[key] !== 'string' || !/^[a-f0-9]{64}$/.test(metadata[key])) fail(key);
  }
  return Object.freeze({ modelId: metadata.modelId, revision: metadata.revision,
    sourceSha256: metadata.sourceSha256, tokenizerSha256: metadata.tokenizerSha256 });
}

function shape(rows, dimensions) {
  integer(rows, 1, MAX_ROWS, 'rows');
  integer(dimensions, 1, MAX_DIMENSIONS, 'dimensions');
}
function register(table) {
  tables.add(table);
  return Object.freeze(table);
}
function validTable(table) {
  if (!tables.has(table)) fail('table must come from a validated loader');
}

export function createFloat32Table(values, { rows, dimensions, metadata }) {
  shape(rows, dimensions);
  if (!(values instanceof Float32Array) || values.length !== rows * dimensions) fail('float32 values length');
  for (const value of values) if (!Number.isFinite(value)) fail('nonfinite float32 value');
  return register({ kind: 'float32', rows, dimensions, sourceDimensions: dimensions,
    metadata: identity(metadata), pooling: POOLING, values: values.slice() });
}

export function parseSafetensors(buffer, {
  expectedTensorName = 'embedding.weight', expectedRows = MAX_ROWS,
  expectedDimensions = MAX_DIMENSIONS, metadata,
  maxHeaderBytes = MAX_HEADER_BYTES, maxBytes = MAX_BYTES,
} = {}) {
  integer(maxHeaderBytes, 1, MAX_HEADER_BYTES, 'header limit');
  integer(maxBytes, 8, MAX_BYTES, 'byte limit');
  shape(expectedRows, expectedDimensions);
  if (typeof expectedTensorName !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(expectedTensorName) || ['__proto__', 'prototype', 'constructor', '__metadata__'].includes(expectedTensorName)) fail('tensor name');
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.length > maxBytes) fail('safetensors byte length');
  const headerLength = buffer.readBigUInt64LE(0);
  if (headerLength < 2n || headerLength > BigInt(maxHeaderBytes) || headerLength > BigInt(buffer.length - 8)) fail('safetensors header length');
  const dataStart = 8 + Number(headerLength);
  const header = parseHeader(buffer.subarray(8, dataStart));
  const keys = Object.keys(header);
  if (keys.some(key => key !== expectedTensorName && key !== '__metadata__') || !Object.hasOwn(header, expectedTensorName)) fail('expected exactly one tensor');
  if (Object.hasOwn(header, '__metadata__')) {
    object(header.__metadata__, 'safetensors metadata');
    for (const [key, value] of Object.entries(header.__metadata__)) {
      if (key.length > 128 || typeof value !== 'string' || value.length > 1024) fail('safetensors metadata');
    }
  }
  const tensor = header[expectedTensorName];
  fields(tensor, ['dtype', 'shape', 'data_offsets'], 'tensor');
  if (tensor.dtype !== 'F32' || !Array.isArray(tensor.shape) || tensor.shape.length !== 2 || tensor.shape[0] !== expectedRows || tensor.shape[1] !== expectedDimensions) fail('dtype or shape');
  const bytes = expectedRows * expectedDimensions * 4;
  if (!Array.isArray(tensor.data_offsets) || tensor.data_offsets.length !== 2 || tensor.data_offsets[0] !== 0 || tensor.data_offsets[1] !== bytes || buffer.length - dataStart !== bytes) fail('tensor offsets or data length');
  const modelIdentity = identity(metadata);
  const values = new Float32Array(expectedRows * expectedDimensions);
  for (let i = 0; i < values.length; i++) {
    const value = buffer.readFloatLE(dataStart + i * 4);
    if (!Number.isFinite(value)) fail('nonfinite tensor value');
    values[i] = value;
  }
  return register({ kind: 'float32', rows: expectedRows, dimensions: expectedDimensions,
    sourceDimensions: expectedDimensions, metadata: modelIdentity, pooling: POOLING, values });
}

export function quantizeTable(table, dimensions, { allowedDimensions = [128, 256] } = {}) {
  validTable(table);
  if (table.kind !== 'float32') fail('quantization requires float32');
  if (!Array.isArray(allowedDimensions) || !allowedDimensions.length || allowedDimensions.some(dim => !Number.isInteger(dim) || dim < 1 || dim > MAX_DIMENSIONS)) fail('allowed dimensions');
  integer(dimensions, 1, table.dimensions, 'quantized dimensions');
  if (!allowedDimensions.includes(dimensions)) fail('unapproved quantized dimensions');
  const codes = new Int8Array(table.rows * dimensions);
  const scales = new Float32Array(table.rows);
  for (let row = 0; row < table.rows; row++) {
    let maximum = 0;
    for (let col = 0; col < dimensions; col++) {
      const value = table.values[row * table.dimensions + col];
      if (!Number.isFinite(value)) fail('nonfinite quantization value');
      maximum = Math.max(maximum, Math.abs(value));
    }
    // Store the float32 scale first; quantization uses exactly that stored scale.
    scales[row] = maximum === 0 ? 0 : Math.fround(maximum / 127);
    if (maximum !== 0 && scales[row] === 0) fail('scale underflow');
    for (let col = 0; col < dimensions; col++) {
      const value = table.values[row * table.dimensions + col];
      const magnitude = scales[row] === 0 ? 0 : Math.min(127, Math.floor(Math.abs(value) / scales[row] + 0.5));
      codes[row * dimensions + col] = value < 0 ? -magnitude : magnitude;
    }
  }
  return register({ kind: 'int8', rows: table.rows, dimensions,
    sourceDimensions: table.dimensions, metadata: table.metadata, pooling: POOLING,
    recipe: RECIPE, codes, scales });
}

function validateQuantized(table) {
  validTable(table);
  if (table.kind !== 'int8' || table.codes.length !== table.rows * table.dimensions || table.scales.length !== table.rows) fail('int8 table');
  for (let row = 0; row < table.rows; row++) {
    const scale = table.scales[row];
    if (!Number.isFinite(scale) || scale < 0 || Object.is(scale, -0) || scale > Math.fround(3.4028234663852886e38 / 127)) fail('row scale');
    let maximum = 0;
    for (let col = 0; col < table.dimensions; col++) {
      const code = table.codes[row * table.dimensions + col];
      if (code === -128 || (scale === 0 && code !== 0)) fail('row code');
      maximum = Math.max(maximum, Math.abs(code));
    }
    if (scale > 0 && maximum !== 127) fail('noncanonical row');
  }
}

export function serializeQuantizedTable(table) {
  validateQuantized(table);
  const header = Buffer.from(JSON.stringify({ format: 'static-int8/v1', rows: table.rows,
    dimensions: table.dimensions, sourceDimensions: table.sourceDimensions,
    metadata: table.metadata, pooling: POOLING, recipe: RECIPE }), 'utf8');
  if (header.length > MAX_HEADER_BYTES) fail('quantized header size');
  // 8-byte magic, u32 header length, bounded JSON, row scales LE, row codes.
  const buffer = Buffer.alloc(12 + header.length + table.rows * 4 + table.codes.length);
  MAGIC.copy(buffer);
  buffer.writeUInt32LE(header.length, 8);
  header.copy(buffer, 12);
  const start = 12 + header.length;
  for (let row = 0; row < table.rows; row++) buffer.writeFloatLE(table.scales[row], start + row * 4);
  Buffer.from(table.codes.buffer, table.codes.byteOffset, table.codes.byteLength).copy(buffer, start + table.rows * 4);
  return buffer;
}

export function parseQuantizedTable(buffer, {
  expectedRows = MAX_ROWS, expectedDimensions, expectedMetadata,
  maxBytes = MAX_BYTES,
} = {}) {
  integer(maxBytes, 12, MAX_BYTES, 'byte limit');
  integer(expectedRows, 1, MAX_ROWS, 'expected rows');
  if (expectedDimensions !== undefined) integer(expectedDimensions, 1, MAX_DIMENSIONS, 'expected dimensions');
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > maxBytes || !buffer.subarray(0, 8).equals(MAGIC)) fail('quantized magic or size');
  const headerLength = buffer.readUInt32LE(8);
  if (headerLength < 2 || headerLength > MAX_HEADER_BYTES || headerLength > buffer.length - 12) fail('quantized header length');
  const header = parseHeader(buffer.subarray(12, 12 + headerLength));
  fields(header, ['format', 'rows', 'dimensions', 'sourceDimensions', 'metadata', 'pooling', 'recipe'], 'quantized header');
  shape(header.rows, header.dimensions);
  integer(header.sourceDimensions, header.dimensions, MAX_DIMENSIONS, 'source dimensions');
  if (header.rows !== expectedRows || (expectedDimensions !== undefined && header.dimensions !== expectedDimensions) || header.format !== 'static-int8/v1' || header.pooling !== POOLING || header.recipe !== RECIPE) fail('quantized configuration');
  const metadata = identity(header.metadata);
  if (expectedMetadata !== undefined) {
    const expected = identity(expectedMetadata);
    if (Object.keys(expected).some(key => expected[key] !== metadata[key])) fail('quantized identity mismatch');
  }
  const start = 12 + headerLength;
  if (buffer.length !== start + header.rows * 4 + header.rows * header.dimensions) fail('quantized data length');
  const scales = new Float32Array(header.rows);
  for (let row = 0; row < header.rows; row++) scales[row] = buffer.readFloatLE(start + row * 4);
  const codes = new Int8Array(header.rows * header.dimensions);
  const codeStart = start + header.rows * 4;
  for (let i = 0; i < codes.length; i++) codes[i] = buffer.readInt8(codeStart + i);
  const table = register({ kind: 'int8', rows: header.rows, dimensions: header.dimensions,
    sourceDimensions: header.sourceDimensions, metadata, pooling: POOLING, recipe: RECIPE, codes, scales });
  validateQuantized(table);
  return table;
}

export function getVectorMetadata(table, { dimensions = table.dimensions } = {}) {
  validTable(table);
  integer(dimensions, 1, table.dimensions, 'vector dimensions');
  // A float32 slice and the same-sized int8 derivative are separate spaces.
  // Source/tokenizer hashes prevent nominally identical labels hiding asset changes.
  const variant = table.kind === 'int8' ? `int8-${table.dimensions}-slice-${dimensions}` : `float32-${dimensions}`;
  const space = { modelId: table.metadata.modelId, revision: table.metadata.revision,
    sourceSha256: table.metadata.sourceSha256, tokenizerSha256: table.metadata.tokenizerSha256,
    variant, sourceDimensions: table.sourceDimensions, pooling: POOLING,
    recipe: table.kind === 'int8' ? RECIPE : 'prefix-dimensions/float32/v1' };
  return Object.freeze({ ...table.metadata, sourceModelId: table.metadata.modelId,
    modelId: `static:${createHash('sha256').update(JSON.stringify(space)).digest('hex')}`,
    dimensions, sourceDimensions: table.sourceDimensions, storedDimensions: table.dimensions,
    storage: table.kind, pooling: POOLING, recipe: table.kind === 'int8' ? RECIPE : 'prefix-dimensions/float32/v1' });
}

export function encodeTokenIds(table, ids, { dimensions = table.dimensions, maxTokens = 512 } = {}) {
  validTable(table);
  integer(dimensions, 1, table.dimensions, 'pooling dimensions');
  integer(maxTokens, 1, 512, 'token limit');
  if (!Array.isArray(ids) && !(ids instanceof Uint32Array) && !(ids instanceof Int32Array)) fail('token IDs');
  if (ids.length > maxTokens) fail('token limit exceeded');
  for (const id of ids) integer(id, 0, table.rows - 1, 'token ID');
  if (!ids.length) return { status: 'abstain', reason: 'empty-token-sequence' };
  // Sorting preserves the multiset while making floating-point results exactly
  // order-blind and deterministic for static mean pooling.
  const ordered = Array.from(ids).sort((a, b) => a - b);
  const means = new Float64Array(dimensions);
  for (const id of ordered) {
    const scale = table.kind === 'int8' ? table.scales[id] : 1;
    if (!Number.isFinite(scale) || scale < 0) fail('pooling scale');
    for (let col = 0; col < dimensions; col++) {
      const cell = table.kind === 'int8' ? table.codes[id * table.dimensions + col] : table.values[id * table.dimensions + col];
      if (!Number.isFinite(cell) || (table.kind === 'int8' && (cell === -128 || (scale === 0 && cell !== 0)))) fail('pooling value');
      means[col] += cell * scale;
    }
  }
  let normSquared = 0;
  for (let col = 0; col < dimensions; col++) {
    means[col] /= ids.length;
    normSquared += means[col] * means[col];
  }
  if (!Number.isFinite(normSquared)) fail('nonfinite pooled norm');
  if (normSquared === 0) return { status: 'abstain', reason: 'zero-vector' };
  const norm = Math.sqrt(normSquared);
  const vector = Float32Array.from(means, value => value / norm);
  return { status: 'ok', vector, metadata: getVectorMetadata(table, { dimensions }) };
}
