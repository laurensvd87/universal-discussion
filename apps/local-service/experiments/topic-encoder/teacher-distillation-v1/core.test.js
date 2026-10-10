import test from 'node:test';
import assert from 'node:assert/strict';
import { pairedStatistics, fitRidge, predicted, solveSymmetric, POLICY, chooseUseful } from './core.js';

test('paired linear fit recovers teacher rotation after ridge and normalization', () => {
  const rows = [0, 1, 2, 3].map(i => ({ id: `r${i}` }));
  const xs = [[1, 0], [-1, 0], [0, 1], [0, -1]], ys = [[0, 1], [0, -1], [-1, 0], [1, 0]];
  const x = new Map(rows.map((row, i) => [row.id, xs[i]])), y = new Map(rows.map((row, i) => [row.id, ys[i]]));
  const stats = pairedStatistics(rows, x, y, 2);
  assert.equal(stats.varianceScale, .5);
  for (const lambda of POLICY.lambdas) {
    const model = fitRidge(stats, lambda);
    assert.equal(model.ridge, lambda * .5);
    for (let i = 0; i < 4; i++) assert.ok(Math.hypot(...predicted(xs[i], model).map((value, k) => value - ys[i][k])) < 1e-12);
  }
});
test('fit ignores event, language and viewpoint labels', () => {
  const rows = [0, 1, 2, 3].map(i => ({ id: `r${i}`, eventKey: `event${i}`, lang: 'en' }));
  const vectors = new Map(rows.map((row, i) => [row.id, [[1, 0], [-1, 0], [0, 1], [0, -1]][i]]));
  const changed = rows.map(row => ({ ...row, eventKey: 'same', lang: 'nl', viewpoint: 'other' }));
  assert.deepEqual(pairedStatistics(rows, vectors, vectors, 2), pairedStatistics(changed, vectors, vectors, 2));
});
test('Cholesky solve has correct forward and transposed-back substitution', () => {
  const solved = solveSymmetric(Float64Array.from([2, 0, 1, 3]), Float64Array.from([8, 22]), 2);
  assert.ok(Math.abs(solved[0] - 1) < 1e-12); assert.ok(Math.abs(solved[1] - 2) < 1e-12);
});
test('constant inputs and missing/nonfinite vectors fail closed', () => {
  const rows = [0, 1, 2, 3].map(i => ({ id: `r${i}` })), all = new Map(rows.map(row => [row.id, [1, 0]]));
  assert.throws(() => pairedStatistics(rows, all, all, 2), /FIT_DEGENERATE/u);
  assert.throws(() => pairedStatistics(rows, new Map(), all, 2), /VECTOR/u);
  const bad = new Map(all); bad.set('r0', [NaN, 0]);
  assert.throws(() => pairedStatistics(rows, bad, all, 2), /VECTOR/u);
});
test('usefulness requires real reach improvement without challenge safety/coverage regression', () => {
  const value = { development: { groupedFalse: 0, mixedPages: 0, purePages: 10, groupedTrue: 8 },
    authored: { groupedFalse: 2, mixedPages: 3, groupedTrue: 6 }, spentV6: { groupedFalse: 0, mixedPages: 0, groupedTrue: 4 } };
  const methods = { 'raw-E5': structuredClone(value), 'old-diagonal': structuredClone(value), 'ridge-0.1': structuredClone(value) };
  assert.equal(chooseUseful(methods), null);
  methods['ridge-0.1'].development.purePages = 11;
  assert.equal(chooseUseful(methods), 'ridge-0.1');
  methods['ridge-0.1'].spentV6.groupedFalse = 1;
  assert.equal(chooseUseful(methods), null);
});
