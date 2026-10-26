import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceError } from '../../src/domain/errors.js';
import { decodeEmbeddingFloat8Array, decodeEmbeddingBase64Array, createEmbeddingWireQuery } from '../canonical-v4/embedding-binary-wire.js';

const SQL = 'SELECT source_id,payload,model_id,dimensions,values_double FROM canonical_v4.embeddings';
const corrupt = (error) => error instanceof ServiceError && error.code === 'storage-corrupt' &&
  error.message === 'Invalid canonical embedding binary data';
function arrayBytes(values) {
  const bytes = Buffer.alloc(20 + values.length * 12);
  bytes.writeInt32BE(1, 0);
  bytes.writeUInt32BE(701, 8);
  bytes.writeInt32BE(values.length, 12);
  bytes.writeInt32BE(1, 16);
  values.forEach((value, index) => {
    bytes.writeInt32BE(8, 20 + index * 12);
    bytes.writeDoubleBE(value, 24 + index * 12);
  });
  return bytes;
}

test('float8 array preserves every finite binary64 bit including signed zero and extremes', () => {
  const values = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE,
    Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1 / 3, Math.PI,
    2 ** -1022, -(2 ** -1022), 1 + Number.EPSILON, -1 - Number.EPSILON];
  const decoded = decodeEmbeddingFloat8Array(arrayBytes(values));
  assert.deepEqual(decoded, values);
  assert.deepEqual(arrayBytes(decoded), arrayBytes(values));
  assert(Object.is(decoded[1], -0));
});

test('float8 array exact deterministic finite bit pattern differentials and maximum dimension', () => {
  const values = [];
  let word = 0x12345678;
  const bits = Buffer.alloc(8);
  while (values.length < 1536) {
    word = (Math.imul(word, 1664525) + 1013904223) >>> 0;
    bits.writeUInt32BE(word, 0);
    word = (Math.imul(word, 1664525) + 1013904223) >>> 0;
    bits.writeUInt32BE(word, 4);
    const value = bits.readDoubleBE();
    if (Number.isFinite(value)) values.push(value);
  }
  assert.deepEqual(arrayBytes(decodeEmbeddingFloat8Array(arrayBytes(values))), arrayBytes(values));
  assert.deepEqual(arrayBytes(decodeEmbeddingBase64Array(arrayBytes(values).toString('base64'))), arrayBytes(values));
  assert.deepEqual(decodeEmbeddingFloat8Array(arrayBytes([1])), [1]);
});

test('float8 array rejects invalid dimensions, flags, OID, bounds and element lengths', () => {
  for (const [offset, number] of [[0, 0], [0, 2], [0, -1], [4, 1], [4, -1], [8, 700],
    [12, 0], [12, -1], [12, 1537], [16, 0], [16, -1], [20, -1], [20, 0], [20, 4], [20, 9]]) {
    const bytes = arrayBytes([1]);
    bytes.writeInt32BE(number, offset);
    assert.throws(() => decodeEmbeddingFloat8Array(bytes), corrupt, `${offset}:${number}`);
  }
  for (const value of [null, undefined, 'bad', new Uint8Array(32), Buffer.alloc(0),
    arrayBytes([]), arrayBytes(Array(1537).fill(1)), arrayBytes([1]).subarray(0, 31),
    Buffer.concat([arrayBytes([1]), Buffer.alloc(1)])])
    assert.throws(() => decodeEmbeddingFloat8Array(value), corrupt);
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(() => decodeEmbeddingFloat8Array(arrayBytes([value])), corrupt);
});

test('base64 text wire preserves exact binary representation at both dimension bounds', () => {
  for (const values of [[-0], [Number.MIN_VALUE, Number.MAX_VALUE, -Number.MIN_VALUE, -0, Math.PI],
    Array(1536).fill(1 / 3)]) {
    const wire = arrayBytes(values).toString('base64');
    assert.deepEqual(arrayBytes(decodeEmbeddingBase64Array(wire)), arrayBytes(values));
  }
});

test('base64 text wire rejects whitespace, noncanonical padding, malformed data and excess length', () => {
  const valid = arrayBytes([1]).toString('base64');
  const noncanonical = valid.slice(0, -2) + 'B=';
  for (const value of [null, undefined, Buffer.from(valid), '', valid + '\n', ' ' + valid,
    valid.slice(0, 5) + '\r\n' + valid.slice(5), valid.replace(/=$/u, ''), noncanonical,
    valid + '=', '='.repeat(44), '-'.repeat(44), 'A'.repeat(24608),
    arrayBytes(Array(1537).fill(0)).toString('base64'), Buffer.alloc(32).toString('base64'),
    arrayBytes([Infinity]).toString('base64')])
    assert.throws(() => decodeEmbeddingBase64Array(value), corrupt);
});

test('query factory limits projection and contiguous bound parameters without global parser changes', () => {
  const values = ['first', 'second'];
  const query = createEmbeddingWireQuery(`${SQL} WHERE source_id IN ($1,$2)`, values);
  assert.deepEqual(Object.keys(query).sort(), ['text', 'values']);
  assert.equal(query.text, "SELECT source_id,payload,model_id,dimensions,replace(encode(array_send(values_double),'base64'), chr(10), '') AS values_double_base64 FROM canonical_v4.embeddings WHERE source_id IN ($1,$2)");
  assert.equal(createEmbeddingWireQuery(SQL).text.includes('AS values_double_base64'), true);
  assert.deepEqual(query.values, values);
  assert.notEqual(query.values, values);
  assert.equal(createEmbeddingWireQuery(`${SQL} WHERE source_id=$1`, ['first']).values.length, 1);
  for (const [sql, parameters] of [
    ['SELECT * FROM canonical_v4.embeddings', []], [`${SQL};`, []],
    [`${SQL} WHERE source_id=$1`, []], [`${SQL} WHERE source_id IN ($2,$1)`, values],
    [`${SQL} WHERE source_id IN ()`, []], [`${SQL} WHERE source_id IN ($1,$1)`, values],
    [SQL, ['unexpected']], [SQL, [null]], [null, []], [`${SQL} WHERE source_id=$1; DROP TABLE anything`, ['x']],
  ]) assert.throws(() => createEmbeddingWireQuery(sql, parameters), corrupt);
});
