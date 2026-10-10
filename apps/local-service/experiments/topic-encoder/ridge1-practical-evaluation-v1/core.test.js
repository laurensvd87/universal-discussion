import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticalTopicPlanner, checkedUnit, PRACTICAL_POLICY } from './planner.js';
import { practicalSuccess, aggregatePartition, exposure } from './core.js';
const vector = angle => Array.from({ length: 384 }, (_, i) => i === 0 ? Math.cos(angle) : i === 1 ? Math.sin(angle) : 0);
const source = (id, angle = 0, extra = {}) => ({ id, provenance: 'owner-local-page-embedding/v1',
  extractorVersion: 'main-text-prefix/v1', embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: vector(angle) }, ...extra });
const snapshot = sources => ({ sources, sourceLinks: sources.map(s => ({ sourceId: s.id, method: 'learned-provisional' })) });
const planner = options => createPracticalTopicPlanner({ representation: 'test', floor: .8, transform: values => values, ...options });
test('qualified-first negative contexts cannot be evidence; unknown scripts eligible', () => {
  let calls = 0;
  const p = planner({ transform: values => { calls++; return values; } });
  const input = snapshot([source('a', 0, { url: 'https://example.test/', title: 'Home' }),
    source('b', 0, { title: 'Just a moment...' }), source('c', 0, { title: '事件について' }), source('d', 0)]);
  const result = p.plan(input);
  assert.equal(calls, 2); assert.equal(result.diagnostics.quarantinedSources, 2);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a'] }, { sourceIds: ['b'] }, { sourceIds: ['c', 'd'] }]);
  assert.equal(result.diagnostics.coarseDuplicateSources, 1);
  assert.equal(result.policyVersion, PRACTICAL_POLICY.version);
  assert.equal(result.diagnostics.coarsePolicyVersion, 'alternate-indexed-body-metric/v1');
});
test('duplicate Sources expand without member cap, stable across input order and cache size', () => {
  const input = snapshot(Array.from({ length: 70 }, (_, i) => source(`s-${String(i).padStart(3, '0')}`)));
  const forward = planner().plan(input).partitions;
  const reversed = planner().plan({ ...input, sources: [...input.sources].reverse(), sourceLinks: [...input.sourceLinks].reverse(),
    limits: { maxCachedPairs: 0 } }).partitions;
  assert.deepEqual(forward, reversed); assert.equal(forward[0].sourceIds.length, 70);
});
test('no transitive bridge can violate all-cross floor', () => {
  const input = snapshot([source('a', 0), source('b', .4), source('c', .8)]), p = planner();
  const result = p.plan(input);
  for (const part of result.partitions) for (const a of part.sourceIds) for (const b of part.sourceIds) {
    const x = input.sources.find(s => s.id === a).embedding.values, y = input.sources.find(s => s.id === b).embedding.values;
    assert.ok(x.reduce((sum, value, i) => sum + value * y[i], 0) >= .8);
  }
  assert.ok(!result.partitions.some(part => part.sourceIds.length === 3));
});
test('manual/legacy sources are not transformed or repartitioned and input remains unchanged', () => {
  const input = snapshot([source('a'), source('b'), source('manual'), { id: 'legacy', provenance: 'legacy' }]);
  input.sourceLinks[2].method = 'manual-confirmed'; input.sourceLinks[3].method = 'legacy';
  let calls = 0; const before = JSON.stringify(input);
  const result = planner({ transform: values => { calls++; return values; } }).plan(input);
  assert.equal(calls, 2); assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }]);
  assert.equal(JSON.stringify(input), before);
});
test('work and edge-memory exhaustion abort without partial partition', () => {
  const input = snapshot([source('a'), source('b')]);
  assert.throws(() => planner().plan({ ...input, limits: { maxWorkUnits: 1 } }), error => error.code === 'capacity');
  assert.throws(() => planner().plan({ ...input, limits: { maxEdgeBytes: 0 } }), error => error.code === 'capacity');
});
test('overflow, malformed unit input, getters and nonfinite transform fail closed', () => {
  assert.throws(() => checkedUnit(Array(384).fill(Number.MAX_VALUE)));
  assert.throws(() => checkedUnit(Array(384).fill(0)));
  const input = snapshot([source('a'), source('b')]); input.sources[0].embedding.values[0] = 2;
  assert.throws(() => planner().plan(input));
  const getter = { get sources() { throw Error('getter must not run'); }, sourceLinks: [] };
  assert.throws(() => planner().plan(getter), TypeError);
  assert.throws(() => planner({ transform: () => Array(384).fill(Infinity) }).plan(snapshot([source('a')])));
});
test('labels never enter planning and aggregates separate related/gross/viewpoint exposure', () => {
  const input = snapshot([source('a'), source('b'), source('c')]);
  const rows = [{ id: 'a', eventKey: 'x', family: 'family1', lang: 'en', viewpoint: 'support' },
    { id: 'b', eventKey: 'x', family: 'family1', lang: 'ja', viewpoint: 'oppose' },
    { id: 'c', eventKey: 'y', family: 'family2', lang: 'fr', viewpoint: 'neutral' }];
  const result = planner().plan(input), a = aggregatePartition(rows, result.partitions), b = exposure(rows, result.partitions);
  assert.equal(a.correctGroupedPairs, 1); assert.equal(a.falseGroupedPairs, 2);
  assert.equal(b.crossLanguage.joined, 1); assert.equal(b.opposingViewpoint.joined, 1); assert.equal(b.outsideFamilyFalsePairs, 2);
});
test('fresh success requires two complete cohorts, separate nonworsening wrong exposure and aggregate true/pure improvement', () => {
  const method = (correct, pure, wrong = 0, mixed = 0) => ({ status: 'complete', correctGroupedPairs: correct, purePages: pure,
    falseGroupedPairs: wrong, mixedPages: mixed });
  const cohort = (candidate, diagonal = method(10, 10)) => ({ methods: { raw: method(1, 2), diagonal, ridge1: candidate } });
  assert.equal(practicalSuccess([cohort(method(20, 20)), cohort(method(8, 8))]), true);
  assert.equal(practicalSuccess([cohort(method(20, 20)), cohort(method(8, 8, 1))]), false);
  assert.equal(practicalSuccess([cohort(method(20, 20, 0, 2)), cohort(method(8, 8))]), false);
  assert.equal(practicalSuccess([cohort(method(10, 10)), cohort(method(10, 10))]), false);
  const failed = cohort(method(20, 20)); failed.methods.raw.status = 'capacity-failclosed';
  assert.equal(practicalSuccess([failed, cohort(method(20, 20))]), false);
});
