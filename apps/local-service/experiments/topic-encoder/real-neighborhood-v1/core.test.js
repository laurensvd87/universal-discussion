import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize, neighborhood, score, selectPolicy, countPairs } from './core.js';

const vector = (x, y) => Float64Array.from({ length: 384 }, (_, i) =>
  i === 0 ? x : i === 1 ? y : 0);
const row = (id, eventKey, lang = 'en') => ({ id, eventKey, category: 'invented', lang });
const rows = [row('a1', 'a'), row('a2', 'a', 'fr'), row('a3', 'a', 'de'),
  row('b1', 'b'), row('b2', 'b', 'fr'), row('b3', 'b', 'de')];
const vectors = new Map([
  ['a1', vector(1, 0)], ['a2', vector(.99, .05)], ['a3', vector(.98, -.04)],
  ['b1', vector(0, 1)], ['b2', vector(.05, .99)], ['b3', vector(-.04, .98)],
]);

test('shared-neighbor support grows with members, with no top-K cutoff', () => {
  const first = neighborhood(rows, vectors).find(p => p.i === 0 && p.j === 1);
  const extra = Array.from({ length: 64 }, (_, i) => row(`a-extra-${i}`, 'a'));
  const expandedVectors = new Map([...vectors, ...extra.map(r => [r.id, vector(1, 0)])]);
  const expanded = neighborhood([...rows, ...extra], expandedVectors).find(p => p.i === 0 && p.j === 1);
  assert.ok(expanded.local[2][0] > first.local[2][0]);
  assert.equal(expanded.local[2][0] > .95, true);
  assert.equal(normalize(vector(3, 4))[0], .6);
});

test('train-only policy keeps all train negatives out; evaluation is aggregate', () => {
  const pairs = neighborhood(rows, vectors);
  const policy = selectPolicy(pairs);
  const counts = countPairs(pairs, p => score(p, policy) >= policy.threshold);
  assert.equal(counts.fp, 0);
  assert.equal(counts.sameCategoryFp, 0);
  assert.equal(counts.tp + counts.fn, 6);
  assert.equal(counts.crossLanguageTotal, 6);
  assert.equal(policy.trainTp, counts.tp);
  assert.equal(JSON.stringify(counts).includes('invented'), false);
  const withDifferentGold = rows.map(r => ({ ...r, eventKey: `secret-${r.id}`, category: `secret-${r.id}` }));
  const changed = neighborhood(withDifferentGold, vectors);
  assert.deepEqual(changed.map(p => [p.similarity, p.local]), pairs.map(p => [p.similarity, p.local]));
});
