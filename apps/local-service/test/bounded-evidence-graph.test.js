import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundedEvidenceGraph } from '../src/domain/bounded-evidence-graph.js';
import { createOwnerTopicPlanner } from '../src/domain/owner-topic-planner.js';
import { makeRidgeTopicAdapter } from '../src/domain/ridge-topic-adapter.js';

const unit = (key, angle) => ({ key, center: [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)], sourceIds: [key] });
test('exact graph retains unchanged edges, splits deletions and applies transient forced unions', () => {
  const graph = createBoundedEvidenceGraph({ edgeFloor: .9 });
  let plan = graph.prepare([unit('a', 0), unit('b', .4), unit('c', .8)]);
  assert.deepEqual(plan.components, [['a', 'b', 'c']]); plan.commit();
  plan = graph.prepare([unit('a', 0), unit('c', .8)]);
  assert.equal(plan.stats.comparedPairs, 0); assert.deepEqual(plan.components, [['a'], ['c']]); plan.commit();
  plan = graph.prepare([unit('a', 0), unit('c', .8)], { forcedUnions: [['a', 'c']] });
  assert.deepEqual(plan.components, [['a', 'c']]); plan.commit();
  assert.deepEqual(graph.prepare([unit('a', 0), unit('c', .8)]).components, [['a'], ['c']]);
  assert.throws(() => plan.components[0].push('injected'), TypeError);
  graph.clear(); assert.equal(graph.prepare([unit('a', 0), unit('c', .8)]).stats.comparedPairs, 1);
});

test('graph never executes proxies/accessors or silently accepts sparse evidence', () => {
  const graph = createBoundedEvidenceGraph({ edgeFloor: .9 }); let traps = 0;
  const proxy = new Proxy([], { getPrototypeOf() { traps++; throw Error('trap'); }, get() { traps++; throw Error('trap'); } });
  assert.throws(() => graph.prepare(proxy), TypeError);
  const accessor = [unit('a', 0)]; Object.defineProperty(accessor, '0', { get() { traps++; throw Error('getter'); }, enumerable: true });
  assert.throws(() => graph.prepare(accessor), TypeError);
  const bad = unit('a', 0); Object.defineProperty(bad.center, '0', { get() { traps++; throw Error('getter'); }, enumerable: true });
  assert.throws(() => graph.prepare([bad]), TypeError);
  assert.throws(() => graph.prepare([unit('a', 0)], { forcedUnions: [Array(1)] }), TypeError);
  assert.equal(traps, 0);
  assert.equal(createBoundedEvidenceGraph({ edgeFloor: .9, maxBytes: 1 }).prepare([unit('a', 0)]), null);
});

test('owner Ridge factory keeps original default and uses private opt-in reuse only', () => {
  const weights = Array(384 * 384).fill(0); for (let i = 0; i < 384; i++) weights[i * 384 + i] = 1;
  const artifact = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
  const values = unit('a', 0).center;
  const snapshot = { generation: 'test', sources: [{ id: 'a', title: 'Synthetic article', url: 'https://example.org/article',
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } }], sourceLinks: [{ sourceId: 'a', method: 'learned-provisional' }] };
  const full = createOwnerTopicPlanner({ ridgeAdapter: artifact });
  const incremental = createOwnerTopicPlanner({ ridgeAdapter: artifact, incremental: true });
  const expected = full.plan(snapshot); assert.equal(expected.diagnostics.incremental, undefined);
  assert.deepEqual(incremental.plan(snapshot).partitions, expected.partitions);
  const warm = incremental.plan(snapshot); assert.equal(warm.diagnostics.incremental.replannedSources, 0);
  assert.equal(warm.diagnostics.incremental.transformedSources, 0);
  assert.throws(() => createOwnerTopicPlanner({ ridgeAdapter: artifact, incremental: 'true' }), TypeError);
});
