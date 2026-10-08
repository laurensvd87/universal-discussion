import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFocusGraph } from './matcher.js';

const vector = () => [1, ...Array(383).fill(0)];
const sources = ids => ids.map(id => ({ id, embedding: { values: vector() } }));
const facet = (terms, action = null) => ({ terms: new Set(terms),
  products: new Map(), actions: new Set(action ? [action] : []) });
const idf = Object.assign(new Map(), { unknownWeight: 1 });

test('three independent reports with distinct languages can corroborate locally', () => {
  const records = sources(['english', 'dutch', 'german']);
  const facets = new Map([
    ['english', facet(['trial', 'evening'])],
    ['dutch', facet(['proef', 'avond'])],
    ['german', facet(['versuch', 'abend'])],
  ]);
  const result = matchFocusGraph(records, facets, idf);
  assert.deepEqual(result.partitions, [['dutch', 'english', 'german']]);
  assert.deepEqual(matchFocusGraph([...records].reverse(), facets, idf).partitions,
    result.partitions);
});

test('two otherwise close reports abstain without a corroborating event cue', () => {
  const records = sources(['a', 'b']);
  const facets = new Map([['a', facet(['trial'])], ['b', facet(['inspection'])]]);
  const result = matchFocusGraph(records, facets, idf);
  assert.deepEqual(result.partitions, [['a'], ['b']]);
  assert.equal(result.relatedEdges.length, 1);
});

test('explicit action conflict blocks a high cosine and shared words', () => {
  const records = sources(['a', 'b', 'c']);
  const facets = new Map([
    ['a', facet(['same', 'place', 'device'], 'recall')],
    ['b', facet(['same', 'place', 'device'], 'recall')],
    ['c', facet(['same', 'place', 'device'], 'price')],
  ]);
  assert.deepEqual(matchFocusGraph(records, facets, idf).partitions,
    [['a', 'b'], ['c']]);
});

test('an unrelated catalog crowd cannot veto a directly evidenced pair', () => {
  const ids = ['a', 'b', ...Array.from({ length: 20 }, (_, i) => `other${i}`)];
  const records = sources(ids);
  const facets = new Map(ids.map(id => [id, facet(id === 'a' || id === 'b'
    ? ['distinctive', 'shared', 'phrase'] : [`unrelated${id}`])]));
  assert.deepEqual(matchFocusGraph(records, facets, idf).partitions
    .find(group => group.includes('a')), ['a', 'b']);
});

test('seven same-event reports stay together beside two adjacent-event reports', () => {
  const same = Array.from({ length: 7 }, (_, i) => `report${i}`);
  const adjacent = ['adjacentA', 'adjacentB'];
  const ids = [...same, ...adjacent];
  const facets = new Map([
    ...same.map(id => [id, facet(['shared', 'entity', 'flood', 'closure'], 'closure')]),
    ...adjacent.map(id => [id, facet(['shared', 'entity', 'gate', 'contract'], 'procurement')]),
  ]);
  const result = matchFocusGraph(sources(ids), facets, idf);
  assert.deepEqual(result.partitions, [adjacent, same]);
});
