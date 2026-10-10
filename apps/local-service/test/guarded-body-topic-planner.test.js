import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { createGuardedBodyTopicPlanner, qualifyRetainedTopicContext,
  GUARDED_BODY_TOPIC_POLICY } from '../src/domain/guarded-body-topic-planner.js';
import { makeBodyTopicMetric, createBodyTopicMetricTransform } from '../src/domain/body-topic-metric.js';
import { planIndexedAlternateTopics } from '../src/domain/alternate-topic-planner-indexed.js';
import { OWNER_BODY_TOPIC_ADMISSION } from '../src/domain/owner-topic-planner.js';

const metric = (first = 1, shear = 0) => {
  const lower = new Float64Array(384 ** 2);
  for (let index = 0; index < 384; index++) lower[index * 384 + index] = 1;
  lower[0] = first; lower[384] = shear;
  return makeBodyTopicMetric({ mean: Array(384).fill(0), lower });
};
const identity = metric(), broad = metric(0.1);
const angle = (id, radians, metadata = {}) => ({
  id, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
  embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1',
    values: [Math.cos(radians), Math.sin(radians), ...Array(382).fill(0)] }, ...metadata,
});
const snapshot = rows => ({ sources: rows,
  sourceLinks: rows.map(source => ({ sourceId: source.id, topicId: `topic-${source.id}`, method: 'learned-provisional' })) });
const planner = (bodyMetric = identity, bodyFloor = 0.8, rawFloor = 0.85) =>
  createGuardedBodyTopicPlanner({ bodyMetric, bodyFloor, rawFloor });
const sortedIds = result => result.partitions.flatMap(part => part.sourceIds).sort();
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const coarse = (input, artifact) => {
  const transform = createBodyTopicMetricTransform(artifact);
  return planIndexedAlternateTopics({ ...input, admission: OWNER_BODY_TOPIC_ADMISSION,
    sources: input.sources.map(source => ({ ...source, embedding: { ...source.embedding,
      values: [...transform(source.embedding.values)] } })) });
};

test('guarded factory exposes only exact read-policy metadata and immutable plan closure', () => {
  const factory = planner();
  assert.ok(Object.isFrozen(factory) && Object.isFrozen(GUARDED_BODY_TOPIC_POLICY));
  assert.equal(factory.policyVersion, 'alternate-dual-evidence-body/v1');
  assert.equal(factory.representation, 'owner-local-body-topic-metric/v1');
  assert.deepEqual(Object.keys(factory).sort(), ['plan', 'policyVersion', 'representation']);
  const result = factory.plan(snapshot([angle('a', 0), angle('b', 0.1)]));
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }]);
  for (const token of ['"url"', '"title"', '"embedding"', '"values"', '"mean"', '"lower"', 'manifestSha256']) {
    assert.equal(JSON.stringify(result).includes(token), false);
  }
  assert.deepEqual(factory.plan(snapshot([])).partitions, []);
});

test('broad BODY retrieval never overrides full original-E5 pair veto', () => {
  const input = snapshot([angle('a', -0.9), angle('b', -0.8), angle('bridge', 0), angle('c', 0.8), angle('d', 0.9)]);
  const before = structuredClone(input);
  assert.equal(coarse(input, broad).partitions.length, 1);
  const result = planner(broad, 0.8, 0.85).plan(input);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }, { sourceIds: ['bridge'] }, { sourceIds: ['c', 'd'] }]);
  assert.deepEqual(input, before);
  assert.deepEqual(sortedIds(result), input.sources.map(source => source.id).sort());
});

test('strongest-edge complete-link blocks a transitive bridge in one coarse block', () => {
  const input = snapshot([angle('a', -0.4), angle('b', 0), angle('c', 0.4)]);
  assert.equal(coarse(input, identity).partitions.length, 1);
  const result = planner(identity, 0.9, 0.9).plan(input);
  assert.equal(result.partitions.length, 2);
  assert.equal(result.partitions.some(part => part.sourceIds.includes('a') && part.sourceIds.includes('c')), false);
  assert.deepEqual(sortedIds(result), ['a', 'b', 'c']);
});

test('the raw veto scores all 384 coordinates including the final coordinate', () => {
  const rows = [angle('a', 0), angle('b', 0)];
  for (let index = 0; index < rows.length; index++) {
    const values = Array(384).fill(0);
    values[0] = Math.SQRT1_2; values[383] = index ? -Math.SQRT1_2 : Math.SQRT1_2;
    rows[index].embedding.values = values;
  }
  const input = snapshot(rows);
  assert.equal(coarse(input, broad).partitions.length, 1);
  assert.deepEqual(planner(broad, 0.8, 0.85).plan(input).partitions, [{ sourceIds: ['a'] }, { sourceIds: ['b'] }]);
});

test('full precision BODY ties use RAW descending before lexical Source IDs', () => {
  const lower = new Float64Array(384 ** 2);
  for (let index = 0; index < 384; index++) lower[index * 384 + index] = 0.5;
  lower[384] = 0.3;
  const artifact = makeBodyTopicMetric({ mean: Array(384).fill(0), lower });
  const rows = [-0.4, 0, 0.4].map((radians, index) => {
    const x = 0.5 * Math.sin(radians), y = 0.3 * Math.sin(radians) + 0.5 * Math.cos(radians);
    const norm = Math.hypot(x, y), source = angle(['a', 'b', 'c'][index], 0);
    source.embedding.values = [x / norm, y / norm, ...Array(382).fill(0)];
    return source;
  });
  const transform = createBodyTopicMetricTransform(artifact), body = rows.map(source => transform(source.embedding.values));
  assert.equal(dot(body[0], body[1]), dot(body[1], body[2]));
  assert.ok(dot(rows[1].embedding.values, rows[2].embedding.values) > dot(rows[0].embedding.values, rows[1].embedding.values));
  assert.equal(coarse(snapshot(rows), artifact).partitions.length, 1);
  const expected = [{ sourceIds: ['a'] }, { sourceIds: ['b', 'c'] }];
  assert.deepEqual(planner(artifact, 0.9, 0.7).plan(snapshot(rows)).partitions, expected);
  assert.deepEqual(planner(artifact, 0.9, 0.7).plan(snapshot([...rows].reverse())).partitions, expected);
});

test('all equal edge scores resolve by canonical lexical Source pair', () => {
  const input = snapshot([angle('c', 0.4), angle('b', 0), angle('a', -0.4)]);
  const result = planner(identity, 0.9, 0.9).plan(input);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }]);
});

test('coarse retrieval omission is preserved rather than replaced by global dual refinement', () => {
  const input = snapshot([angle('a', -0.8), angle('b', -0.75), angle('bridge', 0), angle('c', 0.75), angle('d', 0.8)]);
  const blocks = coarse(input, identity).partitions;
  const result = planner(identity, OWNER_BODY_TOPIC_ADMISSION.seedSimilarity, 0.01).plan(input);
  assert.deepEqual(sortedIds(result), ['a', 'b', 'bridge', 'c', 'd']);
  for (const part of result.partitions) {
    assert.ok(blocks.some(block => part.sourceIds.every(id => block.sourceIds.includes(id))));
  }
});

test('negative context duplicates become singletons after full coarse ID expansion', () => {
  const input = snapshot([
    angle('article-a', 0, { url: 'https://example.com/news/invented-a', title: '架空の都市が新しい図書館を開く' }),
    angle('article-b', 0, { url: 'https://example.org/news/invented-b', title: 'افتتاح مكتبة جديدة في مدينة خيالية' }),
    angle('search', 0, { url: 'https://example.com/search?q=fictional', title: 'Search' }),
    angle('hub', 0, { url: 'https://example.com/', title: 'Home' }),
    angle('challenge', 0, { url: 'https://example.com/news/challenge', title: 'Just a moment...' }),
  ]);
  assert.equal(coarse(input, identity).partitions.length, 1);
  const result = planner().plan(input);
  assert.deepEqual(result.partitions, [{ sourceIds: ['article-a', 'article-b'] }, { sourceIds: ['challenge'] },
    { sourceIds: ['hub'] }, { sourceIds: ['search'] }]);
  assert.equal(result.diagnostics.quarantinedSources, 3);
  assert.deepEqual(result.diagnostics.qualificationReasons, { 'search-context': 1, 'landing-context': 1, 'challenge-title': 1 });
  assert.deepEqual(sortedIds(result), input.sources.map(source => source.id).sort());
});

test('qualification is conservative syntactic negative evidence with unknown metadata eligible', () => {
  const rejected = [
    ['https://example.com/', 'An invented substantive landing page', 'landing-context'],
    ['https://example.com/index.php', '', 'landing-context'],
    ['https://example.com/?q=fictional', '', 'search-context'],
    ['https://example.com/search/topic', '', 'search-context'],
    ['https://example.com/results?query=fictional', '', 'search-context'],
    ['https://example.com/auth/callback', '', 'sensitive-context'],
    ['https://example.com/news/item?token=secret-fixture', '', 'sensitive-context'],
    ['https://example.com/installed', '', 'app-context'],
    ['https://example.com/what-is-new', '', 'app-context'],
    ['https://example.com/news/story', 'Checking your browser...', 'challenge-title'],
  ];
  for (const [url, title, reason] of rejected) assert.equal(qualifyRetainedTopicContext({ url, title }), reason);
  const eligible = [
    {}, { title: '' }, { title: 'Home' }, { title: 'بحث علمي حول المياه' },
    { url: 'https://example.com/?article_id=fictional-42', title: 'Short' },
    { url: 'https://example.com/news/search-for-water?q=fictional', title: 'Search for water' },
    { url: 'https://example.com/news/update-begins', title: 'Update begins' },
    { url: 'https://example.com/news/story', title: 'Loading cargo transforms the port' },
    { url: 'https://unknown-publisher.net/記事/架空', title: '架空' },
    { url: 'https://unknown-tool.net/item/42', title: 'A tool or product' },
  ];
  for (const row of eligible) assert.equal(qualifyRetainedTopicContext(row), null);
});

test('manual pins and non-learned Sources remain excluded without reading their vector payload', () => {
  const input = snapshot([angle('a', 0), angle('b', 0.1), angle('manual', 0)]);
  input.sourceLinks[2].method = 'manual-confirmed';
  input.sources[2].embedding = new Proxy({}, { get() { assert.fail('manual vector must not be read'); } });
  input.sources.push({ id: 'synthetic', provenance: 'synthetic-fixture/v1' });
  input.sourceLinks.push({ sourceId: 'synthetic', method: 'fixture' });
  assert.deepEqual(planner().plan(input).partitions, [{ sourceIds: ['a', 'b'] }]);
});

test('constructor copies the artifact once and never borrows mutable coordinates', () => {
  const mutable = structuredClone(broad), factory = planner(mutable, 0.8, 0.85);
  const input = snapshot([angle('a', 0), angle('b', 0.1)]), before = structuredClone(input);
  const expected = factory.plan(input);
  mutable.mean.fill(0.5); mutable.lower.fill(0); mutable.manifestSha256 = '0'.repeat(64);
  assert.deepEqual(factory.plan(input), expected);
  assert.deepEqual(input, before);
  Object.freeze(input.sources[0].embedding.values);
  assert.deepEqual(factory.plan(input).partitions, expected.partitions);
});

test('distinct trusted floors, closed artifacts and configuration shape are validated', () => {
  for (const bodyFloor of [0, 0.36, 1.01, NaN, Infinity, '0.8', undefined]) {
    assert.throws(() => createGuardedBodyTopicPlanner({ bodyMetric: identity, bodyFloor, rawFloor: 0.85 }), TypeError);
  }
  for (const rawFloor of [0, -1, 1.01, NaN, Infinity, '0.85', undefined]) {
    assert.throws(() => createGuardedBodyTopicPlanner({ bodyMetric: identity, bodyFloor: 0.8, rawFloor }), TypeError);
  }
  assert.throws(() => createGuardedBodyTopicPlanner({ bodyMetric: {}, bodyFloor: 0.8, rawFloor: 0.85 }), TypeError);
  assert.throws(() => createGuardedBodyTopicPlanner({ bodyMetric: identity, bodyFloor: 0.8, rawFloor: 0.85, extra: true }), TypeError);
  assert.ok(planner(identity, OWNER_BODY_TOPIC_ADMISSION.seedSimilarity, 1));
});

test('hostile vectors, sparse arrays, proxies, getters and malformed Source links fail closed', () => {
  const corruptions = [
    input => input.sources[0].embedding.values.fill(0),
    input => { input.sources[0].embedding.values[0] = NaN; },
    input => { input.sources[0].embedding.modelId = 'wrong-model'; },
    input => { input.sources[0].extractorVersion = 'unknown'; },
    input => { delete input.sources[0].embedding.values[0]; },
    input => input.sources[0].embedding.values.push(0),
    input => { input.sources[0].embedding.values = new Proxy(input.sources[0].embedding.values, { get() { assert.fail('proxy trap'); } }); },
    input => Object.defineProperty(input.sources[0].embedding.values, '0', { get() { assert.fail('coordinate getter'); }, enumerable: true }),
    input => Object.defineProperty(input.sources[0], 'title', { get() { assert.fail('metadata getter'); }, enumerable: true }),
    input => input.sources.push(input.sources[0]),
    input => input.sourceLinks.push(input.sourceLinks[0]),
    input => input.sourceLinks.pop(),
    input => { input.sourceLinks[0].method = 'unreviewed'; },
    input => { input.sourceLinks[0].sourceId = 'missing'; },
  ];
  for (const corrupt of corruptions) {
    const input = snapshot([angle('a', 0), angle('b', 0.1)]); corrupt(input);
    let result;
    assert.throws(() => { result = planner().plan(input); }, TypeError);
    assert.equal(result, undefined);
  }
});

test('no cache and tiny FIFO cache produce identical complete partitions', () => {
  const input = snapshot(Array.from({ length: 12 }, (_, index) => angle(`s-${String(index).padStart(2, '0')}`, index / 100)));
  const factory = planner(), expected = factory.plan(input).partitions;
  for (const maxCachedPairs of [0, 1, 3]) {
    const result = factory.plan({ ...input, limits: { maxCachedPairs } });
    assert.deepEqual(result.partitions, expected);
    assert.ok(result.diagnostics.peakCachedPairs <= maxCachedPairs);
  }
});

test('edge-buffer and whole-work exhaustion abort without any partial partition', () => {
  const factory = planner(), input = snapshot([angle('a', 0), angle('b', 0.1), angle('c', 0.2)]);
  for (const limits of [{ maxWorkUnits: 1 }, { maxEdgeBytes: 0 }, { maxEdgeBytes: 191 }]) {
    const before = structuredClone(input); let result;
    assert.throws(() => { result = factory.plan({ ...input, limits }); }, error => error.code === 'capacity');
    assert.equal(result, undefined); assert.deepEqual(input, before);
  }
  assert.deepEqual(factory.plan(input).partitions, [{ sourceIds: ['a', 'b', 'c'] }]);
});

test('shared work budget spans preparation, coarse indexing and refinement', () => {
  const input = snapshot([angle('a', 0), angle('b', 0.1), angle('c', 0.2)]), factory = planner();
  const measured = factory.plan({ ...input, limits: { maxWorkUnits: GUARDED_BODY_TOPIC_POLICY.maxWorkUnits } });
  assert.ok(measured.diagnostics.workUnits > measured.diagnostics.coarseWorkUnits);
  assert.throws(() => factory.plan({ ...input, limits: { maxWorkUnits: measured.diagnostics.workUnits - 1 } }), error => error.code === 'capacity');
  assert.deepEqual(factory.plan({ ...input, limits: { maxWorkUnits: measured.diagnostics.workUnits } }).partitions, measured.partitions);
});

test('one monotonic deadline covers validation and does not reset per stage', t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => ++clock);
  const factory = planner(), input = snapshot([angle('a', 0), angle('b', 0.1)]);
  let result;
  assert.throws(() => { result = factory.plan({ ...input, limits: { workBudgetMs: 30 } }); }, error => error.code === 'capacity');
  assert.equal(result, undefined);
});

test('deadline expiry inside the refinement sort rejects the entire plan', t => {
  let clock = 0;
  const nativeSort = Array.prototype.sort;
  t.mock.method(performance, 'now', () => clock);
  Array.prototype.sort = function(comparator) {
    if (this[0] && typeof this[0].left === 'number' && typeof this[0].body === 'number') clock = 11;
    return nativeSort.call(this, comparator);
  };
  const input = snapshot([angle('a', 0), angle('b', 0.1), angle('c', 0.2),
    angle('hub', 0, { url: 'https://example.com/' })]);
  let result;
  try {
    assert.throws(() => { result = planner().plan({ ...input, limits: { workBudgetMs: 10 } }); }, error => error.code === 'capacity');
    assert.equal(result, undefined);
  } finally { Array.prototype.sort = nativeSort; }
});

test('invalid resource limits reject before touching eligible embedding coordinates', () => {
  for (const limits of [[], { unknown: 1 }, { maxWorkUnits: 0 }, { maxCachedPairs: -1 },
    { maxCachedPairs: 65_537 }, { maxEdgeBytes: -1 }, { workBudgetMs: 0 }, { workBudgetMs: Infinity }]) {
    const input = snapshot([angle('a', 0)]); input.limits = limits;
    Object.defineProperty(input.sources[0].embedding, 'values', { enumerable: true,
      get() { assert.fail('coordinates must not be read'); } });
    assert.throws(() => planner().plan(input), TypeError);
  }
});
