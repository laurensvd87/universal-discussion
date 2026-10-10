import test from 'node:test';
import assert from 'node:assert/strict';
import { completeLink, assess, selectDevelopment, GRID } from './core.js';
const matrix = values => Float64Array.from(values);
test('dual graph requires both inclusive floors on every cross-pair and preserves singleton rows', () => {
  const scores = { ids: ['a', 'b', 'c', 'd'],
    body: matrix([1,.9,.7,0, .9,1,.9,0, .7,.9,1,0, 0,0,0,1]),
    raw: matrix([1,.9,.9,0, .9,1,.9,0, .9,.9,1,0, 0,0,0,1]) };
  assert.deepEqual(completeLink(scores, { bodyFloor: .8, rawFloor: .9 }).partitions,
    [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }, { sourceIds: ['d'] }]);
  assert.deepEqual(completeLink(scores, { bodyFloor: .7, rawFloor: .9 }).partitions,
    [{ sourceIds: ['a', 'b', 'c'] }, { sourceIds: ['d'] }]);
  assert.deepEqual(completeLink(scores, { bodyFloor: .7, rawFloor: .9,
    coarsePartitions: [{ sourceIds: ['a'] }, { sourceIds: ['b', 'c'] }, { sourceIds: ['d'] }] }).partitions,
    [{ sourceIds: ['a'] }, { sourceIds: ['b', 'c'] }, { sourceIds: ['d'] }]);
  scores.raw[1] = scores.raw[4] = .89;
  assert.deepEqual(completeLink(scores, { bodyFloor: .8, rawFloor: .9 }).partitions,
    [{ sourceIds: ['a'] }, { sourceIds: ['b', 'c'] }, { sourceIds: ['d'] }]);
});
test('aggregate metrics include language, viewpoint and same-family wrong exposure without saving labels', () => {
  const rows = [{ id: 'a', eventKey: 'invented-1', family: 'fiction', lang: 'en', viewpoint: 'support' },
    { id: 'b', eventKey: 'invented-1', family: 'fiction', lang: 'fr', viewpoint: 'question' },
    { id: 'c', eventKey: 'invented-2', family: 'fiction', lang: 'nl', viewpoint: 'support' }];
  const result = assess(rows, [{ sourceIds: ['a', 'b', 'c'] }]);
  assert.equal(result.correctGroupedPairs, 1); assert.equal(result.falseGroupedPairs, 2);
  assert.equal(result.mixedPages, 3); assert.equal(result.crossLanguageGroupedCorrect, 1);
  assert.deepEqual(result.opposingViewpointPairs, { total: 1, joined: 1 });
  assert.deepEqual(result.sameFamilyDifferentEventPairs, { total: 2, joined: 2 });
});
test('fixed grid has 16 cases and selection excludes challenge regressions before prioritizing real coverage', () => {
  assert.equal(GRID.length, 16); assert.ok(Object.isFrozen(GRID));
  const candidate = (id, realPure, syntheticPure, falseV6 = 0) => ({ id, bodyFloor: .5, rawFloor: .9,
    cohorts: { realDev: { purePages: realPure, falseGroupedPairs: 0, mixedPages: 0 },
      authored: { purePages: syntheticPure, falseGroupedPairs: 19, mixedPages: 23 },
      v6: { purePages: 0, falseGroupedPairs: falseV6, mixedPages: falseV6 ? 2 : 0 } } });
  assert.deepEqual(selectDevelopment([candidate('regression', 100, 100, 1), candidate('a', 20, 1), candidate('b', 20, 3)]),
    { eligibleCandidates: 2, selected: 'b' });
  assert.equal(selectDevelopment([candidate('regression', 100, 100, 1)]).selected, null);
  const unsafeReal = candidate('unsafe-real', 100, 100);
  unsafeReal.cohorts.realDev.falseGroupedPairs = 2;
  assert.equal(selectDevelopment([unsafeReal]).selected, null);
});
