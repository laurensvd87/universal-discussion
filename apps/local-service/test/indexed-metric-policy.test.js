import assert from 'node:assert/strict';
import test from 'node:test';
import { INDEXED_TOPIC_POLICY, planIndexedAlternateTopics } from '../src/domain/alternate-topic-planner-indexed.js';

const floor = 0.3622392629925627;
const admission = Object.freeze({ version: 'alternate-indexed-body-metric/v1', seedSimilarity: floor,
  supportedSimilarity: floor, weakestCrossSimilarity: floor, crowdedNeighborCount: 3 });
const angle = (id, radians, method = 'learned-provisional') => {
  const values = Array(384).fill(0);
  values[0] = Math.cos(radians); values[1] = Math.sin(radians);
  return { source: { id, provenance: 'owner-local-page-embedding/v1',
    extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } },
  link: { sourceId: id, topicId: `topic-${id}`, method } };
};
const input = rows => ({ sources: rows.map(row => row.source), sourceLinks: rows.map(row => row.link) });
const run = (rows, options = {}) => planIndexedAlternateTopics({ ...input(rows), ...options });

test('default and explicit null admission retain v2 decisions and diagnostics', () => {
  for (const rows of [[], [angle('a', 0), angle('b', 0.1), angle('c', 0.4)],
    [angle('a', -0.31), angle('b', -0.3), angle('bridge', 0), angle('c', 0.3), angle('d', 0.31)]]) {
    const result = run(rows);
    assert.deepEqual(run(rows, { admission: null }), result);
    assert.equal(result.policyVersion, INDEXED_TOPIC_POLICY.version);
  }
});

test('local metric floor admits a sparse pair excluded by the unchanged default', () => {
  const rows = [angle('a', 0), angle('b', Math.acos(0.5))];
  assert.deepEqual(run(rows).partitions, [{ sourceIds: ['a'] }, { sourceIds: ['b'] }]);
  const result = run(rows, { admission });
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }]);
  assert.equal(result.policyVersion, admission.version);
  assert.equal(result.diagnostics.acceptedSeeds, 1);
});

test('local metric supported growth refuses a weak cross-group bridge', () => {
  const rows = [angle('a', -0.8), angle('b', -0.75), angle('bridge', 0),
    angle('c', 0.75), angle('d', 0.8)];
  const result = run(rows, { admission });
  assert.equal(result.diagnostics.supportedJoins, 1);
  assert.equal(result.partitions.length, 2);
  assert.equal(result.partitions.some(part => part.sourceIds.includes('a') && part.sourceIds.includes('c')), false);
  assert.deepEqual(result.partitions.flatMap(part => part.sourceIds).sort(), rows.map(row => row.source.id).sort());
});

test('admission thresholds, ordering, version and fixed crowd count are strictly validated', () => {
  for (const bad of [false, 1, 'policy', [], new Date(),
    { ...admission, version: INDEXED_TOPIC_POLICY.version },
    { ...admission, crowdedNeighborCount: 2 },
    { ...admission, weakestCrossSimilarity: 0 },
    { ...admission, weakestCrossSimilarity: -0.1 },
    { ...admission, weakestCrossSimilarity: floor + 0.01 },
    { ...admission, supportedSimilarity: floor + 0.01 },
    { ...admission, seedSimilarity: 1.01 },
    ...['seedSimilarity', 'supportedSimilarity', 'weakestCrossSimilarity'].flatMap(key =>
      [NaN, Infinity, -Infinity, undefined, null, '0.4'].map(value => ({ ...admission, [key]: value }))),
    { ...admission, maxWorkUnits: 100 }, { ...admission, extra: undefined }]) {
    assert.throws(() => run([], { admission: bad }), TypeError);
  }
  const missing = { ...admission }; delete missing.supportedSimilarity;
  assert.throws(() => run([], { admission: missing }), TypeError);
  const sparse = new Array(5); sparse[0] = admission.version;
  assert.throws(() => run([], { admission: sparse }), TypeError);
  assert.throws(() => run([], { admission: Object.assign(Object.create(admission), {}) }), TypeError);
  assert.equal(run([], { admission: { ...admission, seedSimilarity: 1 } }).policyVersion, admission.version);
  assert.equal(run([], { admission: Object.assign(Object.create(null), admission) }).policyVersion, admission.version);
});

test('admission accessors and symbols are rejected without invoking getters', () => {
  let reads = 0;
  for (const key of Object.keys(admission)) {
    const policy = { ...admission };
    Object.defineProperty(policy, key, { enumerable: true, get() { reads++; return admission[key]; } });
    assert.throws(() => run([], { admission: policy }), TypeError);
  }
  const extraAccessor = { ...admission };
  Object.defineProperty(extraAccessor, 'extra', { get() { reads++; return true; } });
  assert.throws(() => run([], { admission: extraAccessor }), TypeError);
  const symbol = { ...admission, [Symbol('policy')]: true };
  assert.throws(() => run([], { admission: symbol }), TypeError);
  const hidden = { ...admission };
  Object.defineProperty(hidden, 'version', { value: admission.version, enumerable: false });
  assert.throws(() => run([], { admission: hidden }), TypeError);
  assert.equal(reads, 0);
});

test('local metric retains duplicate evidence, Source validation and immutable inputs', () => {
  const rows = [angle('a', 0), angle('b', 0.1), angle('copy', 0.1),
    angle('border', 1.2), angle('manual', 0.1, 'manual-confirmed')];
  // With distinct support threshold, duplicate b cannot supply the missing
  // second independent support needed to add border to the a/b seed.
  const policy = Object.freeze({ ...admission, seedSimilarity: 0.8, supportedSimilarity: 0.4 });
  const before = structuredClone({ rows, policy });
  const result = run(rows, { admission: policy });
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b', 'copy'] }, { sourceIds: ['border'] }]);
  assert.equal(result.diagnostics.uniqueEvidenceUnits, 3);
  assert.equal(result.diagnostics.duplicateSources, 1);
  assert.deepEqual({ rows, policy }, before);
  assert.throws(() => planIndexedAlternateTopics({ ...input(rows), admission,
    sourceLinks: rows.slice(1).map(row => row.link) }), TypeError);
  assert.throws(() => run([rows[0], rows[0]], { admission }), TypeError);
  const bad = structuredClone(rows); bad[0].source.embedding.values[0] = 0.4;
  assert.throws(() => run(bad, { admission }), TypeError);
});

test('local metric uses unchanged work budgets and cache eviction remains complete', () => {
  const rows = Array.from({ length: 20 }, (_, i) => angle(`s${i}`, i * 0.02));
  assert.throws(() => run(rows, { admission, limits: { maxWorkUnits: 2 } }), error => error.code === 'capacity');
  assert.throws(() => run(rows, { admission, limits: { workBudgetMs: Number.MIN_VALUE } }), error => error.code === 'capacity');
  assert.throws(() => run(rows, { admission, limits: { seedSimilarity: floor } }), TypeError);
  const expected = run(rows, { admission }).partitions;
  for (const maxCachedPairs of [0, 3]) {
    assert.deepEqual(run(rows, { admission, limits: { maxCachedPairs } }).partitions, expected);
  }
});
