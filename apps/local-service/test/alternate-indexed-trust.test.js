import assert from 'node:assert/strict';
import test from 'node:test';
import { planAlternateTopics } from '../src/domain/alternate-topic-planner.js';
import { planIndexedAlternateTopics } from '../src/domain/alternate-topic-planner-indexed.js';

const item = (id, values, method = 'learned-provisional') => ({
  source: { id, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } },
  link: { sourceId: id, topicId: `topic-${id}`, method },
});
const input = rows => ({ sources: rows.map(row => row.source), sourceLinks: rows.map(row => row.link) });
const normalize = values => { const norm = Math.hypot(...values); return values.map(value => value / norm); };
const random = () => { let seed = 163701; return () => {
  seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296;
}; };

test('Trust: sparse, undefined and overflowing coordinate norms fail closed', () => {
  const sparse = Array(384).fill(0); sparse[0] = 1; delete sparse[383];
  const undefinedValue = Array(384).fill(0); undefinedValue[0] = 1; undefinedValue[383] = undefined;
  const overflow = Array(384).fill(Number.MAX_VALUE);
  for (const values of [sparse, undefinedValue, overflow]) {
    assert.throws(() => planIndexedAlternateTopics(input([item('invalid', values)])), TypeError);
  }
});

test('Trust: geometry wholly outside the 48-coordinate projection retains exact distinct-vector decisions', () => {
  const next = random();
  for (let trial = 0; trial < 40; trial++) {
    const rows = Array.from({ length: 20 + trial % 12 }, (_, index) => {
      const values = Array(384).fill(0);
      values[80 + index % 3] = 1;
      for (let coordinate = 100; coordinate < 384; coordinate++) values[coordinate] =
        (next() - 0.5) * (trial % 2 ? 0.018 : 0.055);
      return item(`s${String(index).padStart(3, '0')}`, normalize(values));
    });
    const state = input(rows);
    assert.deepEqual(planIndexedAlternateTopics(state).partitions, planAlternateTopics(state).partitions,
      `outside-projection trial ${trial}`);
  }
});

test('Trust: duplicate buckets preserve each provisional ID and exclude identical manual pins', () => {
  const values = Array(384).fill(0); values[383] = 1;
  const rows = [item('a', values), item('a-copy', [...values]), item('a-copy-2', [...values]),
    item('manual-copy', [...values], 'manual-confirmed')];
  const before = structuredClone(rows);
  const result = planIndexedAlternateTopics(input(rows));
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'a-copy', 'a-copy-2'] }]);
  assert.equal(result.diagnostics.uniqueEvidenceUnits, 1);
  assert.deepEqual(rows, before);
  assert.throws(() => planIndexedAlternateTopics({ ...input(rows), sourceLinks: rows.slice(1).map(row => row.link) }), TypeError);
});

test('Trust: large certified cloud never groups a pair below the weakest-cross gate', () => {
  const next = random();
  const rows = Array.from({ length: 100 }, (_, index) => {
    const values = Array(384).fill(0); values[360] = 1;
    for (let coordinate = 320; coordinate < 336; coordinate++) values[coordinate] = (next() - 0.5) * 0.025;
    return item(`cloud-${String(index).padStart(3, '0')}`, normalize(values));
  });
  const result = planIndexedAlternateTopics(input(rows));
  assert.equal(result.partitions.length, 1);
  assert.equal(result.diagnostics.boundCertifications > 0, true);
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
    const cosine = rows[a].source.embedding.values.reduce((sum, value, coordinate) =>
      sum + value * rows[b].source.embedding.values[coordinate], 0);
    assert.equal(cosine >= 0.94, true);
  }
});
