import test from 'node:test';
import assert from 'node:assert/strict';
import { pairs, calibrate, evaluate } from './core.js';
const vec = (a, b = 0) => [a, b, ...Array(382).fill(0)];

test('scale normalization and all-pair enumeration ignore labels during scoring', () => {
  const rows = [{ id: 'a', eventKey: 'A' }, { id: 'b', eventKey: 'A' }, { id: 'c', eventKey: 'B' }];
  const vectors = new Map([['a', vec(2)], ['b', vec(3)], ['c', vec(0, 1)]]);
  const scored = pairs(rows, vectors);
  assert.equal(scored.length, 3); assert.equal(scored[0].score, 1);
  assert.deepEqual(scored.map(p => p.score), pairs(rows.map(r => ({ ...r, eventKey: 'X' })), vectors).map(p => p.score));
});
test('complete-link refuses transitive weak bridge without a fixed membership cap', () => {
  const rows = ['a', 'b', 'c'].map(id => ({ id, eventKey: 'A', lang: 'en' }));
  const edges = [{ i: 0, j: 1, score: .99, positive: true }, { i: 1, j: 2, score: .98, positive: true }, { i: 0, j: 2, score: .70, positive: true }];
  const result = evaluate(rows, edges, .9);
  assert.equal(result.groupedTrue, 1); assert.equal(result.purePages, 2);
});
test('calibration never splits an identical-score bucket and needs twenty positives', () => {
  assert.equal(calibrate(Array.from({ length: 19 }, (_, i) => ({ score: .99 - i / 1000, positive: true }))), 1.000001);
  assert.equal(calibrate([...Array.from({ length: 20 }, () => ({ score: .9, positive: true })), { score: .9, positive: false }]), 1.000001);
  assert.equal(calibrate([...Array.from({ length: 20 }, () => ({ score: .95, positive: true })), { score: .9, positive: false }]), .95);
});
test('reports mixed and multilingual group exposure rather than just admitted edges', () => {
  const rows = [{ id: 'a', eventKey: 'A', lang: 'en' }, { id: 'b', eventKey: 'A', lang: 'nl' }, { id: 'c', eventKey: 'B', lang: 'de' }];
  const values = pairs(rows, new Map(rows.map(row => [row.id, vec(1)])));
  const result = evaluate(rows, values, .9);
  assert.equal(result.groupedTrue, 1); assert.equal(result.groupedFalse, 2); assert.equal(result.mixedPages, 3);
  assert.equal(result.crossLanguageGroupedTrue, 1); assert.equal(result.crossLanguageTruePairs, 1);
});
test('invalid and zero vectors, duplicate IDs and bad cutoffs fail', () => {
  const rows = [{ id: 'a', eventKey: 'A' }, { id: 'b', eventKey: 'A' }];
  for (const vector of [vec(0), Array(384).fill(NaN), [1, 0]]) assert.throws(() => pairs(rows, new Map([['a', vector], ['b', vec(1)]])));
  assert.throws(() => pairs([rows[0], rows[0]], new Map([['a', vec(1)]])));
  assert.throws(() => evaluate(rows, [], NaN));
});
