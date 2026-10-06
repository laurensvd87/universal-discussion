import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeFamilyPairs, summarizeSplit } from './title-vector-hardneg.js';

const scores = value => ({ body: value, 'title-0_25': value,
  'title-0_5': value, title: value });
const family = values => values.map((value, index) => ({ positive: index < 2, scores: scores(value) }));

test('hard-negative overlap and threshold boundary are counted separately', () => {
  const result = summarizeFamilyPairs(family([0.90, 0.95, 0.91, 0.89, 0.8, 0.7])).body;
  assert.equal(result.overlap, true);
  assert.equal(result.positiveAt090, 2);
  assert.equal(result.hardNegativeAt090, 1);
});

test('split reports family counts without tuning a cutoff', () => {
  const result = summarizeSplit([
    { name: 'one', pairs: family([0.8, 0.9, 0.7, 0.7, 0.7, 0.7]) },
    { name: 'two', pairs: family([0.85, 0.86, 0.92, 0.1, 0.1, 0.1]) },
  ]);
  assert.equal(result.totals.body.familiesWithOverlap, 1);
  assert.equal(result.totals.body.positiveAt090, 1);
  assert.equal(result.totals.body.hardNegativeAt090, 1);
});

test('invalid family shape fails closed', () => {
  assert.throws(() => summarizeFamilyPairs(family([0.9])), TypeError);
});
