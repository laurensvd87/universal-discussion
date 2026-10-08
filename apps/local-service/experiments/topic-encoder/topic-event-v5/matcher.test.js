import assert from 'node:assert/strict';
import test from 'node:test';
import { matchEventV5 } from './matcher.js';
import { features } from './reranker.js';

const vector = (x = 1, y = 0) => [x, y, ...Array(382).fill(0)];
const source = (id, title, values = vector()) => ({ id, title,
  url: `https://${id}.test/article`, embedding: { values } });
const facet = (terms, action = null) => ({ terms: new Set(terms),
  products: new Map(), actions: new Set(action ? [action] : []) });
const idf = Object.assign(new Map(), { unknownWeight: 1 });

test('a two-page semantic neighbor without an event cue stays related', () => {
  const sources = [source('a', 'Selva trial'), source('b', 'Selva inspection')];
  const facets = new Map([['a', facet(['trial'])], ['b', facet(['inspection'])]]);
  const result = matchEventV5(sources, facets, idf);
  assert.deepEqual(result.partitions, [['a'], ['b']]);
  assert.equal(result.relatedEdges.length, 1);
});

test('a shared named event can corroborate three differently worded reports', () => {
  const sources = [source('a', 'Selva evening trial'),
    source('b', 'Selva avondproef'), source('c', 'Selva Abendversuch')];
  const facets = new Map([['a', facet(['trial'])], ['b', facet(['proef'])],
    ['c', facet(['versuch'])]]);
  const forward = matchEventV5(sources, facets, idf).partitions;
  assert.deepEqual(forward, [['a', 'b', 'c']]);
  assert.deepEqual(matchEventV5([...sources].reverse(), facets, idf).partitions, forward);
});

test('generic dense geometry with different named events abstains', () => {
  const sources = [source('a', 'Kiln Street opens'),
    source('b', 'Hill Market opens'), source('c', 'Copper Ward opens')];
  const facets = new Map(sources.map(item => [item.id, facet([item.id])]));
  assert.deepEqual(matchEventV5(sources, facets, idf).partitions,
    [['a'], ['b'], ['c']]);
});

test('two adjacent event clouds remain separate as twenty reports arrive', () => {
  const first = Array.from({ length: 20 }, (_, i) => `f${String(i).padStart(2, '0')}`);
  const second = Array.from({ length: 3 }, (_, i) => `s${i}`);
  const other = vector(0.92, Math.sqrt(1 - 0.92 ** 2));
  const sources = [
    ...first.map(id => source(id, `Selva flood gate closure ${id}`)),
    ...second.map(id => source(id, `Selva gate contract ${id}`, other)),
  ];
  const facets = new Map([
    ...first.map(id => [id, facet(['selva', 'flood', 'closure', 'barrier'], 'closure')]),
    ...second.map(id => [id, facet(['selva', 'gate', 'contract', 'tender'], 'procurement')]),
  ]);
  const full = matchEventV5(sources, facets, idf).partitions;
  assert.deepEqual(full, [first, second]);
  for (const count of [3, 7, 20]) {
    const current = [...first.slice(0, count), ...second];
    const result = matchEventV5(sources.filter(item => current.includes(item.id)), facets, idf);
    assert.deepEqual(result.partitions.find(group => group.includes('f00')),
      first.slice(0, count));
  }
});

test('same-host and exact-title copies cannot multiply independent witnesses', () => {
  const records = [source('a', 'Selva evening trial'), source('b', 'Selva evening test'),
    source('c', 'Selva pilot report'), source('d', 'Selva pilot report'),
    { ...source('e', 'Selva other copy'), url: 'https://c.test/republished' }];
  const facets = new Map(records.map(item => [item.id, facet(['selva', 'trial'])]));
  const pair = features(records, facets, idf).find(item => item.a === 'a' && item.b === 'b');
  assert.ok(pair);
  assert.equal(pair.values[2], 1);
});
