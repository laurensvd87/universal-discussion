import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregatePartition, policyDifference } from './core.js';
const rows = [{ id: 'a', eventKey: 'fiction-one' }, { id: 'b', eventKey: 'fiction-one' },
  { id: 'c', eventKey: 'fiction-two' }, { id: 'd', eventKey: 'fiction-two' }];
const parts = groups => groups.map(sourceIds => ({ sourceIds }));
test('aggregate evaluator counts mixed exposure and changes without exposing labels', () => {
  const pure = parts([['a', 'b'], ['c'], ['d']]), mixed = parts([['a', 'b', 'c'], ['d']]);
  assert.deepEqual(aggregatePartition(rows, pure), { rows: 4, purePages: 2, mixedPages: 0,
    pureGroups: 1, mixedGroups: 0, correctGroupedPairs: 1, falseGroupedPairs: 0 });
  assert.deepEqual(aggregatePartition(rows, mixed), { rows: 4, purePages: 0, mixedPages: 3,
    pureGroups: 0, mixedGroups: 1, correctGroupedPairs: 1, falseGroupedPairs: 2 });
  assert.deepEqual(policyDifference(rows, pure, mixed), { addedCorrect: 0, addedFalse: 2, removedCorrect: 0, removedFalse: 0 });
  for (const invalid of [parts([['a', 'b']]), parts([['a', 'b'], ['c', 'c']]),
    parts([['a', 'b'], ['c', 'unknown']]), parts([['a', 'b'], ['c', 'd'], []])]) {
    assert.throws(() => aggregatePartition(rows, invalid), TypeError);
  }
});
