import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTopicCoverage} from './core.js';

const doc = (id, eventKey, lang = 'en', duplicateKey) => ({id, eventKey, lang, ...(duplicateKey ? {duplicateKey} : {})});

test('a split 4+2 event measures root-post reach without demanding a complete group', () => {
  const documents = Array.from({length: 6}, (_, i) => doc(`a${i}`, 'launch', i % 2 ? 'nl' : 'en'));
  const edges = [['a0', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a4', 'a5']];
  const result = evaluateTopicCoverage(documents, edges);
  assert.equal(result.gold.truePairs, 15);
  assert.equal(result.grouped.truePairs, 7);
  assert.equal(result.grouped.completeEvents, 0);
  assert.equal(result.grouped.articlesInPureNonSingletonGroups, 6);
  assert.equal(result.grouped.averageOtherSameEventPagesPerRootPost, 14 / 6);
  assert.equal(result.grouped.articlesWithCrossLanguagePeer, 6);
});

test('one false bridge makes every article in the joined group potentially misrouted', () => {
  const documents = [doc('a', 'launch'), doc('b', 'launch', 'nl'), doc('c', 'storm')];
  const result = evaluateTopicCoverage(documents, [['a', 'b'], ['b', 'c']]);
  assert.equal(result.direct.falseEdges, 1);
  assert.equal(result.grouped.falsePairs, 2);
  assert.equal(result.grouped.articlesInMixedGroups, 3);
  assert.equal(result.grouped.articlesInPureNonSingletonGroups, 0);
  assert.equal(result.grouped.completeEvents, 0);
});

test('copies and translations do not inflate independent source support', () => {
  const documents = [
    doc('a-en', 'launch', 'en', 'article-a'),
    doc('a-nl', 'launch', 'nl', 'article-a'),
    doc('b-de', 'launch', 'de', 'article-b'),
    doc('c', 'other', 'en')
  ];
  const result = evaluateTopicCoverage(documents, [['a-en', 'a-nl'], ['a-nl', 'b-de']]);
  assert.equal(result.gold.truePairs, 3);
  assert.equal(result.duplicateAdjusted.gold.truePairs, 1);
  assert.equal(result.direct.trueEdges, 2);
  assert.equal(result.duplicateAdjusted.direct.trueEdges, 1);
  assert.equal(result.duplicateAdjusted.grouped.truePairs, 1);
  assert.equal(result.duplicateAdjusted.grouped.sourcesWithCrossLanguagePeer, 2);
  assert.equal(result.duplicateAdjusted.grouped.averageOtherSameEventSourcesPerRootPost, 2 / 3);
  assert.equal(result.grouped.singletonGroups, 1);
  assert.equal(result.grouped.goldSingletonEvents, 1);
  assert.equal(result.grouped.completeEvents, 1);
});

test('an isolated gold singleton is not a completed multi-page event', () => {
  const result = evaluateTopicCoverage([doc('only', 'one')], []);
  assert.equal(result.grouped.goldSingletonEvents, 1);
  assert.equal(result.grouped.completeEvents, 0);
  assert.equal(result.grouped.articlesInPureNonSingletonGroups, 0);
});

test('a group containing only copies contributes no independent pure-group support', () => {
  const result = evaluateTopicCoverage([
    doc('copy-en', 'launch', 'en', 'article-a'),
    doc('copy-nl', 'launch', 'nl', 'article-a')
  ], [['copy-en', 'copy-nl']]);
  assert.equal(result.grouped.articlesInPureNonSingletonGroups, 2);
  assert.equal(result.duplicateAdjusted.grouped.sourcesInPureNonSingletonGroups, 0);
  assert.equal(result.duplicateAdjusted.grouped.truePairs, 0);
  assert.equal(result.duplicateAdjusted.grouped.sourcesWithCrossLanguagePeer, 0);
});

test('more than 100 pages can form one complete group without a fixed cap', () => {
  const documents = Array.from({length: 121}, (_, i) => doc(`p${String(i).padStart(3, '0')}`, 'large'));
  const edges = documents.slice(1).map((current, i) => [documents[i].id, current.id]);
  const result = evaluateTopicCoverage(documents, edges);
  assert.equal(result.grouped.truePairs, 7260);
  assert.equal(result.grouped.completeEvents, 1);
  assert.equal(result.grouped.articlesInPureNonSingletonGroups, 121);
  assert.equal(result.grouped.averageOtherSameEventPagesPerRootPost, 120);
});

test('document and edge insertion order and duplicate edges do not change metrics', () => {
  const documents = [doc('a', 'one'), doc('b', 'one', 'nl'), doc('c', 'two')];
  const edges = [['a', 'b'], ['b', 'c']];
  assert.deepEqual(evaluateTopicCoverage(documents, edges),
    evaluateTopicCoverage([...documents].reverse(), [['c', 'b'], ['b', 'a'], ['a', 'b']]));
});

test('invalid ids, cross-event duplicate keys and missing endpoints fail closed', () => {
  assert.throws(() => evaluateTopicCoverage([doc('a', 'one'), doc('a', 'one')], []));
  assert.throws(() => evaluateTopicCoverage([doc('a', 'one', 'en', 'shared'), doc('b', 'two', 'nl', 'shared')], []));
  assert.throws(() => evaluateTopicCoverage([doc('a', 'one')], [['a', 'missing']]));
  assert.throws(() => evaluateTopicCoverage([doc('  ', 'one')], []));
  assert.throws(() => evaluateTopicCoverage([doc('a', '   ')], []));
  assert.throws(() => evaluateTopicCoverage(Array.from({ length: 1201 }, (_, i) =>
    doc(`row-${i}`, 'one')), []));
});
