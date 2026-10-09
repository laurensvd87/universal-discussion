import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageForGraph } from './coverage.js';

const rows = [
  { id: 'a', eventKey: 'one', lang: 'en', duplicateKey: 'copy' },
  { id: 'b', eventKey: 'one', lang: 'fr', duplicateKey: 'copy' },
  { id: 'c', eventKey: 'one', lang: 'de', duplicateKey: 'independent' },
  { id: 'd', eventKey: 'two', lang: 'en', duplicateKey: 'other' },
];
const graph = documents => ({ documents, ids: documents.map(row => row.id) });

test('partial pure group counts article reach and distinct source support', () => {
  const result = coverageForGraph(graph(rows), [{ i: 0, j: 1 }, { i: 1, j: 2 }],
    { trueEdges: 2, falseEdges: 0, groupedFalsePairs: 0, singletons: 1 });
  assert.equal(result.grouped.articlesInPureNonSingletonGroups, 3);
  assert.equal(result.grouped.completeEvents, 1);
  assert.equal(result.grouped.truePairs, 3);
  assert.equal(result.duplicateAdjusted.direct.trueEdges, 1);
  assert.equal(result.duplicateAdjusted.grouped.truePairs, 1);
  assert.equal(result.duplicateAdjusted.grouped.sourcesInPureNonSingletonGroups, 2);
});

test('conflicting source labels keep article exposure but suppress duplicate adjustment', () => {
  const conflicting = rows.map(row => ({ ...row }));
  conflicting[3].duplicateKey = 'copy';
  const result = coverageForGraph(graph(conflicting), [{ i: 0, j: 3 }],
    { trueEdges: 0, falseEdges: 1, groupedFalsePairs: 1, singletons: 2 });
  assert.equal(result.grouped.articlesInMixedGroups, 2);
  assert.equal(result.grouped.falsePairs, 1);
  assert.equal(result.duplicateAdjusted, null);
  assert.equal(result.duplicateAdjustedAvailable, false);
});

test('coverage cross-check refuses inconsistent older evaluation', () => {
  assert.throws(() => coverageForGraph(graph(rows), [{ i: 0, j: 1 }],
    { trueEdges: 0, falseEdges: 0, groupedFalsePairs: 0, singletons: 2 }),
  /COVERAGE_MISMATCH/);
});
