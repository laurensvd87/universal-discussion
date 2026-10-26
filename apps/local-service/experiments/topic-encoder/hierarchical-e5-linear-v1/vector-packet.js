// Internal serialization for already validated experiment vectors, never HTTP input.
import assert from 'node:assert/strict';
export const MAX_VECTOR_PACKET_BYTES = 8 * 1024 * 1024;
export function serializeVectorPacket(packet) {
  assert.ok(Array.isArray(packet.vectors) && packet.vectors.length > 0 && packet.vectors.length <= 384);
  for (const row of packet.vectors) {
    assert.ok(typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 160);
    for (const vector of [row.raw, row.ridge]) {
      assert.ok(Array.isArray(vector) && vector.length === 384);
      let norm = 0;
      for (const coordinate of vector) {
        assert.ok(typeof coordinate === 'number' && Number.isFinite(coordinate) && Math.abs(coordinate) <= 1);
        norm += coordinate * coordinate;
      }
      assert.ok(Math.abs(norm - 1) <= 1e-5);
    }
  }
  // Pretty whitespace alone would breach the bounded reader for dense384-row packets.
  const bytes = Buffer.from(JSON.stringify(packet));
  assert.ok(bytes.length <= MAX_VECTOR_PACKET_BYTES, 'Vector packet capacity exceeded');return bytes;
}
