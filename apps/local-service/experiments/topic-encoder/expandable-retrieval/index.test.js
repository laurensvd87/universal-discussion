import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ExactCosineIndex, bruteForce, collectAboveFloor } from './index.js';

const vector = (angle, other = 0) => [Math.cos(angle), Math.sin(angle), other];

function drain(cursor, batchSize, maxWork = Infinity) {
  const collected = [];
  for (;;) {
    const result = cursor.nextBatch(batchSize, { maxWork });
    collected.push(...result.items);
    if (result.status === 'complete') return { collected, work: result.work };
    assert.equal(result.status, 'more');
  }
}

test('exact global rank and ID tie order match brute force across expandable batches', () => {
  const sources = Array.from({ length: 235 }, (_, i) => ({
    id: `source-${String(i).padStart(3, '0')}`,
    vector: vector(((i * 37) % 229) / 200, i % 7 / 100),
  }));
  sources.push({ id: 'duplicate-z', vector: sources[0].vector });
  sources.push({ id: 'duplicate-a', vector: sources[0].vector });
  const index = new ExactCosineIndex(sources, { leafSize: 7 });
  for (const query of [vector(0), vector(0.43, 0.08), vector(2.7)]) {
    const expected = bruteForce(sources, query);
    const actual = drain(index.search(query), 3).collected;
    assert.deepEqual(actual.map(item => item.id), expected.map(item => item.id));
    for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i].cosine - expected[i].cosine) < 1e-12);
  }
});

test('100+ reports of one event remain retrievable beside adjacent events and noise', () => {
  const same = Array.from({ length: 137 }, (_, i) => ({ id: `same-${i}`, vector: vector(i / 1000) }));
  const adjacent = Array.from({ length: 35 }, (_, i) => ({ id: `adjacent-${i}`, vector: vector(0.35 + i / 1000) }));
  const noise = Array.from({ length: 500 }, (_, i) => ({ id: `noise-${i}`, vector: vector(1 + i / 200) }));
  const query = vector(0.07);
  const cursor = new ExactCosineIndex([...noise, ...adjacent, ...same]).search(query);
  const first = cursor.nextBatch(8);
  assert.equal(first.status, 'more');
  const rest = drain(cursor, 11).collected;
  const ranked = [...first.items, ...rest];
  assert.deepEqual(ranked.map(item => item.id), bruteForce([...same, ...adjacent, ...noise], query).map(item => item.id));
  assert.equal(ranked.filter(item => item.id.startsWith('same-')).length, 137);
  assert.ok(ranked.slice(0, 137).every(item => item.id.startsWith('same-')));
});

test('budget exhaustion is unresolved, resumable, and never a singleton decision', () => {
  const sources = Array.from({ length: 120 }, (_, i) => ({ id: `${i}`, vector: vector(i / 100) }));
  const cursor = new ExactCosineIndex(sources).search(vector(0.3));
  const exhausted = cursor.nextBatch(5, { maxWork: 1 });
  assert.deepEqual(exhausted.items, []);
  assert.equal(exhausted.status, 'unresolved');
  assert.equal(exhausted.reason, 'work-budget-exhausted');
  const resumed = drain(cursor, 9);
  assert.deepEqual(resumed.collected.map(item => item.id), bruteForce(sources, vector(0.3)).map(item => item.id));
});

test('plausibility boundary clears only after an exact below-floor neighbor', () => {
  const sources = Array.from({ length: 145 }, (_, i) => ({ id: `${i}`, vector: vector(i / 200) }));
  const query = vector(0.2), floor = 0.99;
  const cursor = new ExactCosineIndex(sources).search(query);
  const limited = collectAboveFloor(cursor, floor, { batchSize: 5, maxWork: 25 });
  assert.equal(limited.status, 'unresolved');
  const resumed = collectAboveFloor(cursor, floor, { batchSize: 5 });
  const expected = bruteForce(sources, query).filter(item => item.cosine >= floor);
  assert.deepEqual([...limited.items, ...resumed.items].map(item => item.id), expected.map(item => item.id));
  assert.equal(resumed.status, 'boundary-cleared');
});

test('invalid vectors, duplicate IDs and mismatched dimensions fail closed', () => {
  assert.throws(() => new ExactCosineIndex([{ id: 'a', vector: [0, 0] }]));
  assert.throws(() => new ExactCosineIndex([{ id: 'a', vector: [1] }, { id: 'a', vector: [2] }]));
  assert.throws(() => new ExactCosineIndex([{ id: 'a', vector: [1] }, { id: 'b', vector: [1, 0] }]));
  assert.throws(() => new ExactCosineIndex([{ id: 'a', vector: [1] }]).search([0, 1]));
});

test('384D mixed-sign vectors and coincident vectors retain exact rank', () => {
  const sources = Array.from({ length: 320 }, (_, i) => ({
    id: `v${String(i).padStart(3, '0')}`,
    vector: Array.from({ length: 384 }, (_, j) => Math.sin((i + 1) * (j + 3) * 0.013)),
  }));
  sources.push({ id: 'same-vector', vector: sources[42].vector });
  const query = Array.from({ length: 384 }, (_, j) => Math.cos(j * 0.18));
  assert.deepEqual(drain(new ExactCosineIndex(sources).search(query), 13).collected.map(item => item.id),
    bruteForce(sources, query).map(item => item.id));
});
