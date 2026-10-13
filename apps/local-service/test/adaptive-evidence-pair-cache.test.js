import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundedEvidenceGraph, readEvidencePairCache } from '../src/domain/bounded-evidence-graph.js';

const unit = (key, angle) => ({ key, center: [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)], sourceIds: [key] });
const prepare = (graph, units, options = {}) => graph.prepare(units, { ...options, memoPairs: true });
test('branded exact pair matrix replaces adjacency and reuses unchanged dots across delete/update/insert', () => {
  const graph = createBoundedEvidenceGraph({ edgeFloor: .9 });
  const units = [unit('a', 0), unit('b', .4), unit('c', .8)];
  let result = prepare(graph, units), old = readEvidencePairCache(result.pairCache);
  assert.deepEqual(result.components, [['a', 'b', 'c']]); assert.equal(result.stats.comparedPairs, 3); result.commit();
  assert.equal(old.score(0, 1), units[0].center.reduce((sum, value, index) => sum + value * units[1].center[index], 0));
  result = prepare(graph, [units[0], units[2]]); assert.equal(result.stats.comparedPairs, 0);
  assert.deepEqual(result.components, [['a'], ['c']]); result.commit();
  const next = readEvidencePairCache(result.pairCache); assert.equal(next.score(0, 1), old.score(0, 2));
  result = prepare(graph, [units[0], unit('c', .2), unit('d', 1.4)]);
  assert.equal(result.stats.comparedPairs, 3); assert.equal(old.score(0, 2), next.score(0, 1), 'prepared writes never mutate old scores');
  result.commit(); graph.clear(); assert.equal(prepare(graph, units).stats.comparedPairs, 3);
  result = prepare(graph, units); result.commit();
  const adjacency = graph.prepare(units);
  assert.deepEqual(adjacency.components, [['a', 'b', 'c']], 'switching modes reconstructs missing adjacency');
  assert.equal(adjacency.stats.comparedPairs, 3);
});

test('pair score access is private, immutable, exact-geometry fenced and accessor safe', () => {
  assert.equal(readEvidencePairCache({}), null);
  const graph = createBoundedEvidenceGraph({ edgeFloor: .9 }); const units = [unit('a', 0), unit('b', .2)];
  const cache = readEvidencePairCache(prepare(graph, units).pairCache);
  assert.deepEqual(Object.keys(cache).sort(), ['keys', 'matches', 'score']);
  assert.throws(() => cache.keys.push('c'), TypeError); assert.throws(() => { cache.score = () => 1; }, TypeError);
  assert.equal(cache.matches(0, units[0].center), true);
  const changed = [...units[0].center]; changed[383] = -0; assert.equal(cache.matches(0, changed), false);
  let trapped = 0; const raw = [...units[0].center];
  Object.defineProperty(raw, '0', { enumerable: true, get() { trapped++; return 1; } });
  assert.equal(cache.matches(0, raw), false);
  const proxy = new Proxy([], { get() { trapped++; throw Error('trap'); } }); assert.equal(cache.matches(0, proxy), false);
  assert.equal(trapped, 0); assert.throws(() => cache.score(0, 2), TypeError);
});

test('whole matrix RAM admission precedes every dot and forced unions remain exact', () => {
  const units = Array.from({ length: 30 }, (_, index) => unit(`source-${index}`, index * .1));
  const graph = createBoundedEvidenceGraph({ edgeFloor: .99, maxBytes: 110000 }); let calls = 0;
  const scored = units.map(value => ({ ...value, center: value.center }));
  const result = prepare(graph, scored, { work() { calls++; } });
  assert.equal(result, null); assert.ok(calls < 30 * 800 + 500, 'overflow performs validation only, no all-pair loop');
  const exact = createBoundedEvidenceGraph({ edgeFloor: .99 });
  const forced = prepare(exact, [unit('a', 0), unit('b', 2)], { forcedUnions: [['a', 'b']] });
  assert.deepEqual(forced.components, [['a', 'b']]); forced.commit();
  assert.deepEqual(prepare(exact, [unit('a', 0), unit('b', 2)]).components, [['a'], ['b']]);
});
