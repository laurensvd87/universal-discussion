import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { createOwnerTopicPlanner, OWNER_BODY_TOPIC_ADMISSION } from '../src/domain/owner-topic-planner.js';
import { createBodyTopicMetricTransform, makeBodyTopicMetric } from '../src/domain/body-topic-metric.js';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';
import { planIndexedAlternateTopics, INDEXED_TOPIC_POLICY } from '../src/domain/alternate-topic-planner-indexed.js';
import { covarianceFit, makeMetric, unit } from '../experiments/topic-encoder/topic-metric-rethink-v1/core.js';

// All fitted coordinates and labels here are project-created fictional data.
const rows = Array.from({ length: 12 }, (_, i) => ({ id: `fictional-${i}`, eventKey: `invented-event-${i >> 2}` }));
const vectors = new Map(rows.map((row, i) => [row.id, unit(Array.from({ length: 384 }, (_, k) =>
  Math.sin((k + 1) * (i + 1) / 43) + 0.3 * Math.cos((k + 1) * ((i >> 2) + 1) / 7)))]));
const research = makeMetric(covarianceFit(rows, vectors), 'within-shrink-50');
const bodyMetric = makeBodyTopicMetric({ mean: research.mean, lower: research.lower });
const diagonalAdapter = makeDiagonalAdapter(Array.from({ length: 384 }, (_, i) => Math.sin(i) * 0.15), { triplets: 100 });
const snapshot = () => ({
  sources: rows.map(row => ({ id: row.id, provenance: 'owner-local-page-embedding/v1',
    extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: [...vectors.get(row.id)] } })),
  sourceLinks: rows.map(row => ({ sourceId: row.id, topicId: `topic-${row.id}`, method: 'learned-provisional' })),
});
const withoutWorkCounters = result => {
  const { workUnits, preparationWorkUnits, transformedSources, ...diagnostics } = result.diagnostics;
  return { ...result, diagnostics };
};

test('BODY owner planner uses fixed supported admission and a truthful content-free DTO', () => {
  const planner = createOwnerTopicPlanner({ bodyMetric });
  assert.ok(Object.isFrozen(planner) && Object.isFrozen(OWNER_BODY_TOPIC_ADMISSION));
  assert.deepEqual(Object.keys(planner).sort(), ['plan', 'policyVersion', 'representation']);
  assert.equal(planner.policyVersion, 'alternate-indexed-body-metric/v1');
  assert.equal(planner.representation, 'owner-local-body-topic-metric/v1');
  const input = snapshot(), before = structuredClone(input), transform = createBodyTopicMetricTransform(bodyMetric);
  const expected = planIndexedAlternateTopics({ ...input,
    sources: input.sources.map(source => ({ ...source, embedding: { ...source.embedding,
      values: [...transform(source.embedding.values)] } })), admission: OWNER_BODY_TOPIC_ADMISSION });
  expected.diagnostics.representation = planner.representation;
  const actual = planner.plan(input);
  assert.equal(actual.diagnostics.transformedSources, rows.length);
  assert.equal(actual.diagnostics.preparationWorkUnits, rows.length * 2 + 1);
  assert.equal(actual.diagnostics.workUnits, expected.diagnostics.workUnits + rows.length * 2 + 1);
  assert.deepEqual(withoutWorkCounters(actual), withoutWorkCounters(expected));
  assert.deepEqual(input, before);
  assert.deepEqual(actual.partitions.flatMap(part => part.sourceIds).sort(), rows.map(row => row.id).sort());
  assert.deepEqual(Object.keys(actual).sort(), ['diagnostics', 'partitions', 'policyVersion']);
  for (const part of actual.partitions) assert.deepEqual(Object.keys(part), ['sourceIds']);
  const serialized = JSON.stringify(actual);
  for (const forbidden of ['"mean"', '"lower"', '"values"', '"embedding"', '"parameters"', 'manifestSha256']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('BODY is preferred and an invalid selected BODY artifact never falls back to diagonal', () => {
  const bodyOnly = createOwnerTopicPlanner({ bodyMetric });
  const both = createOwnerTopicPlanner({ bodyMetric, diagonalAdapter });
  const ignoredInvalidDiagonal = createOwnerTopicPlanner({ bodyMetric, diagonalAdapter: {} });
  assert.deepEqual(both.plan(snapshot()), bodyOnly.plan(snapshot()));
  assert.deepEqual(ignoredInvalidDiagonal.plan(snapshot()), bodyOnly.plan(snapshot()));
  assert.throws(() => createOwnerTopicPlanner({ bodyMetric: {}, diagonalAdapter }), TypeError);
  const invalidMetric = structuredClone(bodyMetric); invalidMetric.mean[0] += 0.01;
  assert.throws(() => createOwnerTopicPlanner({ bodyMetric: invalidMetric, diagonalAdapter }), TypeError);
});

test('construction copies the selected artifact once; later caller changes cannot change plans', () => {
  for (const kind of ['bodyMetric', 'diagonalAdapter']) {
    const mutable = structuredClone(kind === 'bodyMetric' ? bodyMetric : diagonalAdapter);
    const planner = createOwnerTopicPlanner({ [kind]: mutable });
    const prior = planner.plan(snapshot());
    if (kind === 'bodyMetric') { mutable.mean.fill(1); mutable.lower.fill(0); }
    else mutable.parameters.fill(0.5);
    mutable.manifestSha256 = '0'.repeat(64);
    assert.deepEqual(planner.plan(snapshot()), prior);
  }
});

test('default diagonal planner preserves indexed-v2 behavior and representation', () => {
  const planner = createOwnerTopicPlanner({ diagonalAdapter });
  assert.equal(planner.policyVersion, INDEXED_TOPIC_POLICY.version);
  assert.equal(planner.representation, 'owner-local-diagonal-adapter/v1');
  const input = snapshot(), before = structuredClone(input);
  const expected = planIndexedAlternateTopics({ ...input, adapter: diagonalAdapter });
  assert.deepEqual(withoutWorkCounters(planner.plan(input)), withoutWorkCounters(expected));
  assert.deepEqual(input, before);
});

test('missing artifacts are unavailable and malformed selected diagonal fails closed', () => {
  assert.throws(() => createOwnerTopicPlanner(), TypeError);
  assert.throws(() => createOwnerTopicPlanner({}), TypeError);
  assert.throws(() => createOwnerTopicPlanner({ diagonalAdapter: {} }), TypeError);
  assert.throws(() => createOwnerTopicPlanner({ bodyMetric: undefined, diagonalAdapter: undefined }), TypeError);
});

test('manual pins and synthetic Sources are excluded without touching their coordinates or links', () => {
  for (const artifact of [{ bodyMetric }, { diagonalAdapter }]) {
    const input = snapshot();
    input.sourceLinks[0].method = 'manual-confirmed';
    input.sources[0].embedding.values = ['manual-coordinates-not-eligible'];
    input.sources.push({ id: 'synthetic-source', provenance: 'synthetic-fixture/v1',
      embedding: { values: ['synthetic-coordinates-not-eligible'] } });
    input.sourceLinks.push({ sourceId: 'synthetic-source', topicId: 'synthetic-topic', method: 'fixture' });
    const before = structuredClone(input), links = input.sourceLinks;
    const result = createOwnerTopicPlanner(artifact).plan(input);
    assert.deepEqual(input, before);
    assert.equal(input.sourceLinks, links);
    const ids = result.partitions.flatMap(part => part.sourceIds);
    assert.equal(ids.includes('fictional-0'), false);
    assert.equal(ids.includes('synthetic-source'), false);
    assert.equal(ids.length, rows.length - 1);
  }
});

test('invalid vectors or source links cannot produce a partial BODY plan', () => {
  const planner = createOwnerTopicPlanner({ bodyMetric });
  for (const corrupt of [input => input.sources[3].embedding.values.fill(0),
    input => { input.sources[3].embedding.modelId = 'wrong-model'; },
    input => input.sourceLinks.push({ ...input.sourceLinks[0] }),
    input => input.sourceLinks.pop()]) {
    const input = snapshot(); corrupt(input); const before = structuredClone(input);
    assert.throws(() => planner.plan(input), TypeError);
    assert.deepEqual(input, before);
  }
});

test('exhausted work budget throws with no partial result or input mutation', () => {
  for (const artifact of [{ bodyMetric }, { diagonalAdapter }]) {
    const planner = createOwnerTopicPlanner(artifact), input = snapshot();
    input.limits = { maxWorkUnits: 1 }; const before = structuredClone(input);
    let result;
    assert.throws(() => { result = planner.plan(input); }, error => error.code === 'capacity');
    assert.equal(result, undefined);
    assert.deepEqual(input, before);
    assert.ok(planner.plan(snapshot()).partitions.length > 0, 'failure does not poison subsequent plans');
  }
});

test('whole-plan deadline includes transformation and stops before the next Source', t => {
  let now = 0, reads = 0;
  t.mock.method(performance, 'now', () => now);
  const planner = createOwnerTopicPlanner({ bodyMetric }), input = snapshot();
  input.limits = { workBudgetMs: 10 };
  const first = input.sources[0].embedding.values;
  Object.defineProperty(input.sources[0].embedding, 'values', { enumerable: true,
    get() { reads++; now = 11; return first; } });
  Object.defineProperty(input.sources[1].embedding, 'values', { enumerable: true,
    get() { assert.fail('deadline must stop before transforming another Source'); } });
  let result;
  assert.throws(() => { result = planner.plan(input); }, error => error.code === 'capacity');
  assert.equal(result, undefined);
  assert.ok(reads > 0, 'the deadline expired during transformation');
});

test('wrapper validates indexed limits before any transform', () => {
  const planner = createOwnerTopicPlanner({ bodyMetric });
  for (const limits of [[], { unknown: 1 }, { maxWorkUnits: 0 }, { maxCachedPairs: -1 },
    { workBudgetMs: 0 }, { workBudgetMs: NaN }, { workBudgetMs: Infinity }]) {
    const input = snapshot(); input.limits = limits;
    Object.defineProperty(input.sources[0].embedding, 'values', { enumerable: true,
      get() { assert.fail('invalid limits must be rejected before vector access'); } });
    assert.throws(() => planner.plan(input), TypeError);
  }
});
