import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { createGuardedBodyTopicPlanner, qualifyRetainedTopicContext,
  GUARDED_BODY_TOPIC_POLICY } from '../src/domain/guarded-body-topic-planner.js';
import { makeBodyTopicMetric, createBodyTopicMetricTransform } from '../src/domain/body-topic-metric.js';

const lower = new Float64Array(384 ** 2);
for (let coordinate = 0; coordinate < 384; coordinate++) lower[coordinate * 384 + coordinate] = 0.5;
lower[383 * 384 + 128] = 0.125;
const artifact = makeBodyTopicMetric({ mean: Array(384).fill(0), lower });
const planner = (bodyFloor = 0.8, rawFloor = 0.85) =>
  createGuardedBodyTopicPlanner({ bodyMetric: artifact, bodyFloor, rawFloor });
const source = (id, radians = 0, scale = 1) => {
  const values = Array(384).fill(0);
  values[128] = Math.cos(radians) * scale;
  values[383] = Math.sin(radians) * scale;
  return { id, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } };
};
const snapshot = sources => ({ generation: 'synthetic-generation', revision: 1, sources,
  sourceLinks: sources.map(row => ({ sourceId: row.id, topicId: `topic-${row.id}`, method: 'learned-provisional' })) });
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

for (const key of ['maxWorkUnits', 'workBudgetMs', 'maxEdgeBytes', 'maxCachedPairs']) {
  test(`Trust: ${key} may only tighten its fixed hard ceiling`, () => {
    const factory = planner();
    assert.throws(() => factory.plan({ ...snapshot([]),
      limits: { [key]: GUARDED_BODY_TOPIC_POLICY[key] + 1 } }), TypeError);
    assert.deepEqual(factory.plan({ ...snapshot([]),
      limits: { [key]: GUARDED_BODY_TOPIC_POLICY[key] } }).partitions, []);
  });
}

test('Trust: rejected proxies, symbols and descriptors never execute input code', () => {
  let calls = 0;
  const traps = new Proxy({}, {
    get() { calls++; throw new Error('fixture proxy get'); },
    ownKeys() { calls++; throw new Error('fixture proxy keys'); },
    getPrototypeOf() { calls++; throw new Error('fixture proxy prototype'); },
  });
  const getter = () => { calls++; throw new Error('fixture accessor'); };
  const corruptions = [
    input => traps,
    input => { input.sources = traps; return input; },
    input => { input.sources[0] = traps; return input; },
    input => { input.sourceLinks = traps; return input; },
    input => { input.sourceLinks[0] = traps; return input; },
    input => { input.limits = traps; return input; },
    input => { input[Symbol('snapshot')] = true; return input; },
    input => { input.sources[0][Symbol('source')] = true; return input; },
    input => { input.sourceLinks[0][Symbol('link')] = true; return input; },
    input => { input.sources[0].embedding[Symbol('embedding')] = true; return input; },
    input => { input.sources[0].embedding.values[Symbol('coordinate')] = true; return input; },
    input => { Object.defineProperty(input, 'unused', { get: getter }); return input; },
    input => { Object.defineProperty(input.sourceLinks[0], 'topicId', { get: getter, enumerable: true }); return input; },
    input => { Object.defineProperty(input.sources, '0', { get: getter, enumerable: true }); return input; },
    input => { Object.defineProperty(input.sources[0].embedding, 'unused', { get: getter }); return input; },
    input => { input.sources[0] = Object.assign(Object.create({ inherited: true }), input.sources[0]); return input; },
  ];
  const factory = planner();
  for (const corrupt of corruptions) assert.throws(() => factory.plan(corrupt(snapshot([source('fixture')]))), TypeError);
  assert.throws(() => qualifyRetainedTopicContext(traps), TypeError);
  assert.throws(() => createGuardedBodyTopicPlanner(traps), TypeError);
  const options = { bodyMetric: artifact, bodyFloor: 0.8, rawFloor: 0.85 };
  Object.defineProperty(options, 'rawFloor', { get: getter, enumerable: true });
  assert.throws(() => createGuardedBodyTopicPlanner(options), TypeError);
  assert.equal(calls, 0);
});

test('Trust: nonfinite, nonnumeric and out-of-tolerance raw vectors reject without a partition', () => {
  const factory = planner();
  for (const value of [Infinity, -Infinity, NaN, undefined, '1', Symbol('coordinate'), 1 + 2e-5]) {
    const input = snapshot([source('invalid')]);
    input.sources[0].embedding.values[128] = value;
    let result;
    assert.throws(() => { result = factory.plan(input); }, TypeError);
    assert.equal(result, undefined);
  }
  for (const scale of [1 - 9e-6, 1 + 9e-6]) {
    const input = snapshot([source('a', 0, scale), source('b', 0.05, scale)]);
    const before = structuredClone(input);
    assert.deepEqual(factory.plan(input).partitions, [{ sourceIds: ['a', 'b'] }]);
    assert.deepEqual(input, before);
  }
});

test('Trust: all retained cross-pairs pass both full-vector floors outside projected coordinates', () => {
  const transform = createBodyTopicMetricTransform(artifact);
  for (let trial = 0; trial < 8; trial++) {
    const rows = Array.from({ length: 24 }, (_, index) => source(`s-${String(index).padStart(2, '0')}`,
      (index % 3) * 2 + (Math.floor(index / 3) - 3) * (0.02 + trial * 0.006),
      index % 2 ? 1 - 9e-6 : 1 + 9e-6));
    rows.push({ ...source('negative-copy', 0), url: 'https://fictional-publication.com/search?q=fictional' });
    rows.push(source('manual-copy', 0));
    const input = snapshot(rows);
    input.sourceLinks.at(-1).method = 'manual-confirmed';
    const before = structuredClone(input), factory = planner(), result = factory.plan(input);
    assert.deepEqual(input, before);
    assert.deepEqual(result.partitions.flatMap(part => part.sourceIds).sort(),
      rows.filter(row => row.id !== 'manual-copy').map(row => row.id).sort());
    assert.ok(result.partitions.some(part => part.sourceIds.length > 1));
    assert.deepEqual(result.partitions.find(part => part.sourceIds.includes('negative-copy')), { sourceIds: ['negative-copy'] });
    const byId = new Map(rows.map(row => [row.id, { raw: row.embedding.values, body: transform(row.embedding.values) }]));
    for (const part of result.partitions) for (let a = 0; a < part.sourceIds.length; a++) {
      for (let b = a + 1; b < part.sourceIds.length; b++) {
        const left = byId.get(part.sourceIds[a]), right = byId.get(part.sourceIds[b]);
        assert.ok(dot(left.raw, right.raw) >= 0.85);
        assert.ok(dot(left.body, right.body) >= 0.8);
      }
    }
    const shuffled = { ...input, sources: [...input.sources].reverse(), sourceLinks: [...input.sourceLinks].reverse() };
    assert.deepEqual(factory.plan(shuffled).partitions, result.partitions);
  }
});

test('Trust: duplicate BODY evidence with a failing raw pair is not automatically rejoined', () => {
  const dense = new Float64Array(384 ** 2);
  for (let coordinate = 0; coordinate < 384; coordinate++) dense[coordinate * 384 + coordinate] = 1;
  const mean = Array(384).fill(0); mean[128] = 0.75; mean[383] = 0.75;
  const metric = makeBodyTopicMetric({ mean, lower: dense });
  const factory = createGuardedBodyTopicPlanner({ bodyMetric: metric, bodyFloor: 0.8, rawFloor: 0.9 });
  const first = source('a'), second = source('b');
  // The normalized mean-shift map can identify opposite intersections of a
  // ray with the unit sphere. Their BODY identity cannot relax the raw floor.
  first.embedding.values[128] = first.embedding.values[383] = Math.SQRT1_2;
  second.embedding.values[128] = second.embedding.values[383] = -Math.SQRT1_2;
  const transform = createBodyTopicMetricTransform(metric);
  assert.deepEqual(transform(first.embedding.values), transform(second.embedding.values));
  assert.ok(dot(first.embedding.values, second.embedding.values) < 0);
  assert.deepEqual(factory.plan(snapshot([first, second])).partitions, [{ sourceIds: ['a'] }, { sourceIds: ['b'] }]);
});

test('Trust: a later coarse-block edge failure returns none of the already-refined earlier block', () => {
  const factory = planner();
  const input = snapshot([source('a-0', 0), source('a-1', 0.03),
    source('b-0', Math.PI), source('b-1', Math.PI + 0.03), source('b-2', Math.PI + 0.06)]);
  const expected = [{ sourceIds: ['a-0', 'a-1'] }, { sourceIds: ['b-0', 'b-1', 'b-2'] }];
  assert.deepEqual(factory.plan(input).partitions, expected);
  const before = structuredClone(input); let result;
  assert.throws(() => { result = factory.plan({ ...input, limits: { maxEdgeBytes: 192 } }); },
    error => error.code === 'capacity');
  assert.equal(result, undefined);
  assert.deepEqual(input, before);
  assert.deepEqual(factory.plan(input).partitions, expected);
});

test('Trust: a later coarse-block deadline failure discards an earlier complete block', t => {
  let clock = 0, edgeSorts = 0;
  t.mock.method(performance, 'now', () => clock);
  const nativeSort = Array.prototype.sort;
  Array.prototype.sort = function(comparator) {
    if (this[0] && typeof this[0].left === 'number' && typeof this[0].body === 'number') {
      if (++edgeSorts === 2) clock = GUARDED_BODY_TOPIC_POLICY.workBudgetMs + 1;
    }
    return nativeSort.call(this, comparator);
  };
  let result;
  try {
    assert.throws(() => { result = planner().plan(snapshot([source('a-0', 0), source('a-1', 0.03),
      source('b-0', Math.PI), source('b-1', Math.PI + 0.03)])); }, error => error.code === 'capacity');
    assert.equal(edgeSorts, 2);
    assert.equal(result, undefined);
  } finally { Array.prototype.sort = nativeSort; }
});

test('Trust: metadata rules preserve substantive slug boundaries and unfamiliar languages', () => {
  for (const context of [
    { url: 'https://fictional-publication.com/news/research-results?query=fictional', title: 'Research results' },
    { url: 'https://fictional-publication.com/news/searching-for-water?search=fictional', title: 'Searching for water' },
    { url: 'https://fictional-publication.com/news/updates-for-ports', title: 'Updates for ports' },
    { url: 'https://fictional-publication.com/news/loading-cargo', title: 'Loading cargo' },
    { url: 'https://fictional-publication.com/?story_id=fixture-42', title: '' },
    { url: 'https://fictional-publication.com/%E8%A8%98%E4%BA%8B/%E6%9E%B6%E7%A9%BA', title: '架空' },
    { title: 'بحث علمي حول المياه' },
  ]) assert.equal(qualifyRetainedTopicContext(context), null);
  assert.equal(qualifyRetainedTopicContext({ url: 'https://fictional-publication.com/%73earch/topic' }), 'search-context');
  assert.equal(qualifyRetainedTopicContext({ url: 'https://fictional-publication.com/news/item?access_token=synthetic-only' }), 'sensitive-context');
});

test('Trust: plans retain no previous epoch, returned partition or failed-result state', () => {
  const factory = planner();
  const first = factory.plan(snapshot([source('old-a'), source('old-b', 0.03)]));
  first.partitions[0].sourceIds.push('tampered-return-only');
  const invalid = snapshot([source('invalid')]); invalid.sources[0].embedding.values[0] = Infinity;
  assert.throws(() => factory.plan(invalid), TypeError);
  const next = { ...snapshot([source('new-a'), source('new-b', 0.03)]), generation: 'new-synthetic-generation', revision: 0 };
  assert.deepEqual(factory.plan(next).partitions, [{ sourceIds: ['new-a', 'new-b'] }]);
  const serialized = JSON.stringify(factory.plan(next));
  for (const token of ['old-a', 'old-b', 'tampered-return-only', 'new-synthetic-generation',
    '"url"', '"title"', '"embedding"', '"values"', '"mean"', '"lower"', 'manifestSha256']) {
    assert.equal(serialized.includes(token), false);
  }
});
