import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFloat32Table, parseSafetensors, quantizeTable,
  serializeQuantizedTable, parseQuantizedTable, encodeTokenIds, getVectorMetadata,
} from '../src/static-encoder.js';

const metadata = Object.freeze({ modelId: 'synthetic/static', revision: 'a'.repeat(40),
  sourceSha256: 'b'.repeat(64), tokenizerSha256: 'c'.repeat(64) });
const values = new Float32Array([1, -2, 3, 4, -4, 1, 2, -1, 0, 0, 0, 0]);
const options = { expectedRows: 3, expectedDimensions: 4, metadata };
function table(data = values) { return createFloat32Table(data, { rows: 3, dimensions: 4, metadata }); }
function safetensors(header = { 'embedding.weight': { dtype: 'F32', shape: [3, 4], data_offsets: [0, 48] } }, data = values) {
  const json = Buffer.from(typeof header === 'string' ? header : JSON.stringify(header));
  const result = Buffer.alloc(8 + json.length + data.length * 4);
  result.writeBigUInt64LE(BigInt(json.length));
  json.copy(result, 8);
  for (let i = 0; i < data.length; i++) result.writeFloatLE(data[i], 8 + json.length + i * 4);
  return result;
}
function quantized() { return quantizeTable(table(), 2, { allowedDimensions: [2] }); }
function parseInt8(bytes, extra = {}) { return parseQuantizedTable(bytes, { expectedRows: 3, expectedDimensions: 2, expectedMetadata: metadata, ...extra }); }
function rewriteHeader(bytes, modify) {
  const length = bytes.readUInt32LE(8);
  const parsed = JSON.parse(bytes.subarray(12, 12 + length).toString());
  modify(parsed);
  const json = Buffer.from(JSON.stringify(parsed));
  const result = Buffer.alloc(12 + json.length + bytes.length - 12 - length);
  bytes.copy(result, 0, 0, 8);
  result.writeUInt32LE(json.length, 8);
  json.copy(result, 12);
  bytes.copy(result, 12 + json.length, 12 + length);
  return result;
}
const norm = vector => Math.sqrt(Array.from(vector).reduce((sum, x) => sum + x * x, 0));

test('safetensors reads little-endian F32 table and snapshots caller memory', () => {
  const bytes = safetensors();
  const parsed = parseSafetensors(bytes, options);
  assert.deepEqual(parsed.values, values);
  assert.equal(parsed.rows, 3);
  assert.equal(parsed.dimensions, 4);
  bytes.fill(0);
  assert.deepEqual(parsed.values, values);
  const source = values.slice();
  const injected = table(source);
  source.fill(0);
  assert.deepEqual(injected.values, values);
});

test('production shapes are default and small matrices require explicit loader options', () => {
  assert.throws(() => parseSafetensors(safetensors(), { metadata }), /dtype or shape/);
  assert.throws(() => parseSafetensors(safetensors(), { ...options, expectedRows: 105_880 }), /rows/);
  assert.throws(() => parseSafetensors(safetensors(), { ...options, expectedDimensions: 1025 }), /dimensions/);
  assert.throws(() => createFloat32Table(values, { rows: 3, dimensions: 3, metadata }), /length/);
});

test('safetensors bounds header lengths before parsing or allocating', () => {
  for (const length of [0n, 1n, 16_385n, 2n ** 63n]) {
    const bytes = safetensors();
    bytes.writeBigUInt64LE(length);
    assert.throws(() => parseSafetensors(bytes, options), /header length/);
  }
  assert.throws(() => parseSafetensors(Buffer.alloc(7), options), /byte length/);
  assert.throws(() => parseSafetensors(safetensors(), { ...options, maxBytes: 16 }), /byte length/);
  assert.throws(() => parseSafetensors(safetensors(), { ...options, maxHeaderBytes: 4 }), /header length/);
});

test('safetensors rejects dtype, wrong rank, offsets, gaps, overlaps, trailing bytes and extra tensors', () => {
  const base = { dtype: 'F32', shape: [3, 4], data_offsets: [0, 48] };
  for (const mutation of [
    { dtype: 'F16' }, { shape: [12] }, { shape: [3, 4, 1] }, { shape: [3, 5] },
    { data_offsets: [1, 49] }, { data_offsets: [0, 44] }, { data_offsets: [0, 52] },
    { data_offsets: [-1, 48] }, { data_offsets: [0, Number.MAX_SAFE_INTEGER] }, { unknown: 1 },
  ]) assert.throws(() => parseSafetensors(safetensors({ 'embedding.weight': { ...base, ...mutation } }), options));
  assert.throws(() => parseSafetensors(safetensors({ 'embedding.weight': base, other: base }), options), /one tensor/);
  assert.throws(() => parseSafetensors(Buffer.concat([safetensors(), Buffer.alloc(4)]), options), /data length/);
  assert.throws(() => parseSafetensors(safetensors().subarray(0, -4), options), /data length/);
});

test('safetensors rejects NaN/infinities and validates source metadata types', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const data = values.slice(); data[0] = value;
    assert.throws(() => parseSafetensors(safetensors(undefined, data), options), /nonfinite/);
    assert.throws(() => table(data), /nonfinite/);
  }
  const tensor = { dtype: 'F32', shape: [3, 4], data_offsets: [0, 48] };
  assert.doesNotThrow(() => parseSafetensors(safetensors({ 'embedding.weight': tensor, __metadata__: { format: 'pt' } }), options));
  for (const sourceMetadata of [[], null, { format: 42 }, { format: 'x'.repeat(1025) }]) {
    assert.throws(() => parseSafetensors(safetensors({ 'embedding.weight': tensor, __metadata__: sourceMetadata }), options));
  }
});

test('headers reject duplicates including escaped keys, dangerous/path keys, invalid UTF8, invalid JSON and deep nesting', () => {
  const tensor = '"embedding.weight":{"dtype":"F32","shape":[3,4],"data_offsets":[0,48]}';
  for (const json of [
    `{${tensor},${tensor}}`,
    '{"embedding.weight":{"dtype":"F32","dtyp\\u0065":"F32","shape":[3,4],"data_offsets":[0,48]}}',
    `{${tensor},"__metadata__":{"__proto__":"bad"}}`,
    `{${tensor},"__metadata__":{"constructor":"bad"}}`,
    `{${tensor},"__metadata__":{"../path":"bad"}}`,
    `{${tensor},"__metadata__":{"x":"bad","x":"other"}}`,
    `{${tensor},"__metadata__":{"x":${'['.repeat(17)}0${']'.repeat(17)}}}`, '{',
  ]) assert.throws(() => parseSafetensors(safetensors(json), options));
  const invalidUtf8 = safetensors(); invalidUtf8[9] = 0xff;
  assert.throws(() => parseSafetensors(invalidUtf8, options));
  assert.throws(() => parseSafetensors(safetensors(), { ...options, expectedTensorName: '../path' }));
});

test('identity requires complete pinned hashes/revision and exact fields', () => {
  for (const bad of [undefined, {}, { ...metadata, revision: 'main' }, { ...metadata, sourceSha256: 'x'.repeat(64) },
    { ...metadata, tokenizerSha256: 'abc' }, { ...metadata, modelId: '../bad\n' }, { ...metadata, extra: 1 }]) {
    assert.throws(() => parseSafetensors(safetensors(), { ...options, metadata: bad }));
  }
});

test('row quantization is symmetric, uses stored float32 scales, handles zero rows and deterministic bytes', () => {
  const quant = quantized();
  assert.deepEqual(quant.codes, new Int8Array([64, -127, -127, 32, 0, 0]));
  assert.equal(quant.scales[0], Math.fround(2 / 127));
  assert.equal(quant.scales[1], Math.fround(4 / 127));
  assert.equal(quant.scales[2], 0);
  assert.equal(Object.is(quant.scales[2], -0), false);
  for (let row = 0; row < quant.rows; row++) for (let col = 0; col < quant.dimensions; col++) {
    const original = values[row * 4 + col];
    const recovered = quant.codes[row * 2 + col] * quant.scales[row];
    assert.ok(Math.abs(original - recovered) <= quant.scales[row] / 2 + 1e-6);
  }
  const first = serializeQuantizedTable(quant);
  const parsed = parseInt8(first);
  assert.deepEqual(serializeQuantizedTable(parsed), first);
  assert.deepEqual(first, serializeQuantizedTable(quantized()));
  first.fill(0);
  assert.deepEqual(parsed.codes, quant.codes);
});

test('128 and 256 derivatives enforce prefix dimensions and preserve independent full controls', () => {
  const source = new Float32Array(3 * 256);
  for (let i = 0; i < source.length; i++) source[i] = Math.sin(i * 0.17);
  const full = createFloat32Table(source, { rows: 3, dimensions: 256, metadata });
  for (const dimensions of [128, 256]) {
    const quant = quantizeTable(full, dimensions);
    assert.equal(quant.codes.length, 3 * dimensions);
    const actual = encodeTokenIds(quant, [0, 1]).vector;
    const expected = encodeTokenIds(full, [0, 1], { dimensions }).vector;
    assert.ok(Math.abs(norm(actual) - 1) < 1e-6);
    const error = Math.sqrt(Array.from(actual).reduce((sum, value, i) => sum + (value - expected[i]) ** 2, 0));
    assert.ok(error < 0.01, `pooled quantization error ${error}`);
  }
  assert.deepEqual(full.values, source);
  assert.throws(() => quantizeTable(full, 64), /unapproved/);
  assert.throws(() => quantizeTable(full, 512), /dimensions/);
  assert.throws(() => quantizeTable(full, 128, { allowedDimensions: [NaN] }));
});

test('quantization rejects scale underflow and revalidates mutated trusted numeric values', () => {
  const tiny = table(new Float32Array([1e-45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  assert.throws(() => quantizeTable(tiny, 2, { allowedDimensions: [2] }), /underflow/);
  const full = table(); full.values[0] = NaN;
  assert.throws(() => quantizeTable(full, 2, { allowedDimensions: [2] }), /nonfinite/);
  assert.throws(() => encodeTokenIds(full, [0]), /pooling value/);
});

test('quantized binary rejects bad magic, huge/truncated header, byte caps, truncation and trailing bytes', () => {
  const original = serializeQuantizedTable(quantized());
  const magic = Buffer.from(original); magic[0] = 0;
  assert.throws(() => parseInt8(magic), /magic/);
  for (const length of [0, 1, 16_385, 0xffffffff]) {
    const bytes = Buffer.from(original); bytes.writeUInt32LE(length, 8);
    assert.throws(() => parseInt8(bytes), /header length/);
  }
  assert.throws(() => parseInt8(original, { maxBytes: 12 }), /size/);
  assert.throws(() => parseInt8(original.subarray(0, -1)), /data length/);
  assert.throws(() => parseInt8(Buffer.concat([original, Buffer.alloc(1)])), /data length/);
});

test('quantized binary requires exact format, recipe, pooling, shape and identity', () => {
  const original = serializeQuantizedTable(quantized());
  for (const [key, value] of [['rows', 4], ['dimensions', 3], ['sourceDimensions', 1], ['sourceDimensions', 1025],
    ['format', 'other'], ['recipe', 'other'], ['pooling', 'sum'], ['metadata', {}], ['unknown', true]]) {
    assert.throws(() => parseInt8(rewriteHeader(original, header => { header[key] = value; })));
  }
  assert.throws(() => parseInt8(original, { expectedMetadata: { ...metadata, tokenizerSha256: 'd'.repeat(64) } }), /identity mismatch/);
  assert.throws(() => parseQuantizedTable(original), /configuration/);
});

test('quantized headers reject duplicate/dangerous keys and malformed UTF8', () => {
  const original = serializeQuantizedTable(quantized());
  const length = original.readUInt32LE(8);
  const json = original.subarray(12, 12 + length).toString();
  for (const extra of ['"rows":3', '"__proto__":{}', '"../asset":1']) {
    const altered = Buffer.from(`${json.slice(0, -1)},${extra}}`);
    const bytes = Buffer.alloc(original.length + altered.length - length);
    original.copy(bytes, 0, 0, 8); bytes.writeUInt32LE(altered.length, 8);
    altered.copy(bytes, 12); original.copy(bytes, 12 + altered.length, 12 + length);
    assert.throws(() => parseInt8(bytes));
  }
  const invalidUtf8 = Buffer.from(original); invalidUtf8[13] = 0xff;
  assert.throws(() => parseInt8(invalidUtf8));
});

test('quantized binary rejects nonfinite/negative/negativezero/huge scales, -128, nonzero zero rows and noncanonical rows', () => {
  const original = serializeQuantizedTable(quantized());
  const start = 12 + original.readUInt32LE(8);
  for (const scale of [NaN, Infinity, -Infinity, -1, -0, 3e38]) {
    const bytes = Buffer.from(original); bytes.writeFloatLE(scale, start);
    assert.throws(() => parseInt8(bytes), /row scale/);
  }
  const minus128 = Buffer.from(original); minus128.writeInt8(-128, start + 12);
  assert.throws(() => parseInt8(minus128), /row code/);
  const nonzeroZeroRow = Buffer.from(original); nonzeroZeroRow.writeInt8(1, start + 12 + 4);
  assert.throws(() => parseInt8(nonzeroZeroRow), /row code/);
  const noncanonical = Buffer.from(original); noncanonical.writeInt8(-126, start + 12 + 1);
  assert.throws(() => parseInt8(noncanonical), /noncanonical/);
  const mutated = quantized(); mutated.scales[0] = NaN;
  assert.throws(() => serializeQuantizedTable(mutated), /row scale/);
});

test('pooling computes mean then normalized vector and treats duplicate tokens as weights', () => {
  const full = table();
  const actual = encodeTokenIds(full, [0, 1], { dimensions: 2 });
  const expected = new Float32Array([-3 / Math.sqrt(10), -1 / Math.sqrt(10)]);
  assert.deepEqual(actual.vector, expected);
  assert.ok(Math.abs(norm(actual.vector) - 1) < 1e-6);
  assert.notDeepEqual(encodeTokenIds(full, [0, 0, 1]).vector, encodeTokenIds(full, [0, 1]).vector);
  assert.deepEqual(encodeTokenIds(full, [0, 1, 0]).vector, encodeTokenIds(full, [0, 0, 1]).vector);
});

test('same token multiset is exactly order blind for FP32 and int8 including cancellation', () => {
  for (const encoder of [table(), quantized()]) {
    assert.deepEqual(encodeTokenIds(encoder, [0, 1, 0, 2]).vector, encodeTokenIds(encoder, [2, 0, 0, 1]).vector);
    assert.deepEqual(encodeTokenIds(encoder, new Uint32Array([0, 1])).vector, encodeTokenIds(encoder, [1, 0]).vector);
  }
  const cancel = createFloat32Table(new Float32Array([1, -1, -1, 1]), { rows: 2, dimensions: 2, metadata });
  assert.deepEqual(encodeTokenIds(cancel, [0, 1]), { status: 'abstain', reason: 'zero-vector' });
});

test('empty IDs and zero rows abstain; invalid IDs, token/dimension limits and fake tables reject', () => {
  for (const encoder of [table(), quantized()]) {
    assert.deepEqual(encodeTokenIds(encoder, []), { status: 'abstain', reason: 'empty-token-sequence' });
    assert.deepEqual(encodeTokenIds(encoder, [2]), { status: 'abstain', reason: 'zero-vector' });
    for (const ids of [[-1], [3], [0.5], [NaN], [Infinity], ['1'], {}, new Float32Array([0])]) assert.throws(() => encodeTokenIds(encoder, ids));
    assert.throws(() => encodeTokenIds(encoder, Array(513).fill(0)), /token limit/);
    assert.throws(() => encodeTokenIds(encoder, [0], { maxTokens: 513 }), /token limit/);
    assert.throws(() => encodeTokenIds(encoder, [0, 1], { maxTokens: 1 }), /token limit/);
    assert.throws(() => encodeTokenIds(encoder, [0], { dimensions: encoder.dimensions + 1 }), /dimensions/);
    assert.equal(encodeTokenIds(encoder, Array(512).fill(0)).status, 'ok');
  }
  assert.throws(() => encodeTokenIds({ ...table() }, [0]), /validated loader/);
});

test('full, sliced, quantized and quantized resliced vectors have distinct reproducible space IDs', () => {
  const full = table(); const quant = quantized();
  const identities = [getVectorMetadata(full), getVectorMetadata(full, { dimensions: 2 }),
    getVectorMetadata(quant), getVectorMetadata(quant, { dimensions: 1 })];
  assert.equal(new Set(identities.map(item => item.modelId)).size, 4);
  assert.equal(identities[1].sourceModelId, metadata.modelId);
  assert.equal(identities[1].dimensions, 2);
  assert.equal(identities[2].sourceDimensions, 4);
  assert.deepEqual(getVectorMetadata(parseInt8(serializeQuantizedTable(quant))), getVectorMetadata(quant));
  assert.deepEqual(encodeTokenIds(quant, [0]).metadata, getVectorMetadata(quant));
  assert.ok(identities.every(item => item.modelId.length < 128));
  const reorderedMetadata = { tokenizerSha256: metadata.tokenizerSha256, sourceSha256: metadata.sourceSha256,
    revision: metadata.revision, modelId: metadata.modelId };
  const reordered = createFloat32Table(values, { rows: 3, dimensions: 4, metadata: reorderedMetadata });
  const reorderedQuant = quantizeTable(reordered, 2, { allowedDimensions: [2] });
  assert.deepEqual(serializeQuantizedTable(reorderedQuant), serializeQuantizedTable(quant));
  assert.equal(getVectorMetadata(reorderedQuant).modelId, getVectorMetadata(quant).modelId);
});
