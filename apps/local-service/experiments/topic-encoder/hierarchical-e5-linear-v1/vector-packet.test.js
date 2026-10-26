import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeVectorPacket, MAX_VECTOR_PACKET_BYTES } from './vector-packet.js';

test('dense384-row binary64 packet fits the same8MiB reader without whitespace inflation', () => {
  const vector = Array.from({ length: 384 }, (_, i) => Math.sin(i + 1));
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  const packet = { schema: 'hierarchical-e5-linear-experiment/v1', freezeHash: 'a'.repeat(64),
    vectors: Array.from({ length: 384 }, (_, i) => ({ id: `dense-${i}`, raw: vector, ridge: vector })) };
  const bytes = serializeVectorPacket(packet);
  assert.ok(bytes.length < MAX_VECTOR_PACKET_BYTES);assert.deepEqual(JSON.parse(bytes), packet);
  assert.ok(Buffer.byteLength(JSON.stringify(packet, null, 2)) > MAX_VECTOR_PACKET_BYTES);
});

test('long subnormal/scientific coordinates and maximum IDs remain bounded; invalid rows fail', () => {
  const vector = Array(384).fill(-1.2345678901234568e-100);vector[0] = 1;
  const packet = { schema: 'hierarchical-e5-linear-experiment/v1', freezeHash: 'b'.repeat(64),
    vectors: Array.from({ length: 384 }, (_, i) => ({ id: String(i).padEnd(160, 'x'), raw: vector, ridge: vector })) };
  assert.ok(serializeVectorPacket(packet).length <= MAX_VECTOR_PACKET_BYTES);
  assert.throws(() => serializeVectorPacket({ ...packet, vectors: [...packet.vectors, packet.vectors[0]] }));
  const invalid = { ...packet, vectors: [{ id: 'invalid', raw: Array(384).fill(NaN), ridge: vector }] };
  assert.throws(() => serializeVectorPacket(invalid));
});
