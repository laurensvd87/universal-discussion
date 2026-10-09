import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitDiagonal, transform } from '../real-diagonal-adapter-v1/core.js';
import { loadOwned, validateOwnedRows, relativeCoverageBetter, scoreMethods,
  protocol } from './runner.js';

test('exact owned A/B bytes and whole-family isolation', async () => {
  const owned = await loadOwned();
  assert.deepEqual(owned.counts, { a: 108, b: 108, families: 12, events: 36 });
  assert.equal(protocol.expected.a.length, 64);
  assert.equal(protocol.expected.b.length, 64);
  assert.throws(() => validateOwnedRows(owned.a, owned.a), /PARTITION|SCHEMA/);
});

test('fictional vectors fit 384D diagonal using A labels only', async () => {
  const owned = await loadOwned();
  const vectors = new Map();
  const rows = owned.a.map((row, i) => ({ ...row, category: row.family }));
  for (const [i, row] of rows.entries()) {
    const vector = new Float64Array(384);
    const event = Math.floor(i / 6), family = Math.floor(i / 18);
    vector[0] = 1;
    vector[1 + event] = 0.45;
    vector[32 + family] = 0.2;
    vector[64 + (i % 5)] = 0.04;
    vectors.set(row.id, vector);
  }
  const fitted = fitDiagonal(rows, vectors);
  assert.equal(fitted.steps, 40);
  assert.ok(fitted.triplets >= 100);
  assert.equal(fitted.parameters.length, 384);
  assert.equal(transform(rows, vectors, fitted.parameters).size, 108);
});

test('relative screen requires Pareto reach gain and no worse false exposure', () => {
  const base = { direct: { falseEdges: 1 }, grouped: {
    truePairs: 10, articlesInPureNonSingletonGroups: 12,
    falsePairs: 2, articlesInMixedGroups: 3 } };
  const candidate = structuredClone(base);
  candidate.grouped.truePairs = 11;
  assert.equal(relativeCoverageBetter(base, candidate), true);
  candidate.grouped.articlesInPureNonSingletonGroups = 11;
  assert.equal(relativeCoverageBetter(base, candidate), false);
  candidate.grouped.articlesInPureNonSingletonGroups = 12;
  candidate.direct.falseEdges = 2;
  assert.equal(relativeCoverageBetter(base, candidate), false);
  candidate.direct.falseEdges = 1;
  candidate.grouped.truePairs = 10;
  assert.equal(relativeCoverageBetter(base, candidate), false);
});

test('cross-corpus ID collision fails before graph or vector work', async () => {
  const owned = await loadOwned();
  assert.throws(() => scoreMethods(owned.a, owned.b,
    [{ id: owned.a[0].id }], new Map(), new Float64Array(384)), /ID_COLLISION/);
});
