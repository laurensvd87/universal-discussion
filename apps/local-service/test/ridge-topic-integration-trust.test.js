import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRidgeTopicAdapter, readRidgeTopicAdapter, createRidgeTopicTransform,
  RIDGE_PARAMETER_SHA256, RIDGE_TOPIC_MAX_BYTES, RIDGE_TOPIC_SCHEMA } from '../src/domain/ridge-topic-adapter.js';
import { readInstalledOwnerTopicConfiguration } from '../src/application/owner-topic-configuration.js';
import { createOwnerTopicPlanner } from '../src/domain/owner-topic-planner.js';
import { createPracticalTopicPlanner, PRACTICAL_POLICY } from '../src/domain/ridge-topic-planner.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createMemoryRepository } from '../src/adapters/memory-repository.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from '../src/adapters/fixture-catalog.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { deterministicDependencies } from './helpers.js';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';

const weights = Array(384 * 384).fill(0);
for (let i = 0; i < 384; i++) weights[i * 384 + i] = 1;
const artifact = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const source = (id, angle, extras = {}) => ({ id, title: `Fictional ${id}`,
  url: `https://example.test/article/${id}`, provenance: 'owner-local-page-embedding/v1',
  extractorVersion: 'main-text-prefix/v1',
  embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: vector(angle) }, ...extras });
const snapshot = sources => ({ sources, sourceLinks: sources.map(({ id }) =>
  ({ sourceId: id, method: 'learned-provisional' })) });
const planner = () => createOwnerTopicPlanner({ ridgeAdapter: artifact });

test('Trust: generic synthetic artifact is accepted, but it cannot impersonate the pinned install', () => {
  const parsed = readRidgeTopicAdapter(artifact);
  assert.equal(parsed.schema, RIDGE_TOPIC_SCHEMA);
  assert.notEqual(parsed.parameterSha256, RIDGE_PARAMETER_SHA256);
  assert.equal(createRidgeTopicTransform(parsed)(vector(0))[0], 1);
  assert.throws(() => readRidgeTopicAdapter(artifact, { expectedParameterSha256: RIDGE_PARAMETER_SHA256 }), TypeError);
  const changed = { ...artifact, weights: [...artifact.weights] };
  changed.weights[0] = 2;
  for (const bad of [changed, { ...artifact, modelSha256: '0'.repeat(64) },
    { ...artifact, manifestSha256: '0'.repeat(64) },
    Object.defineProperty({ ...artifact }, 'weights', { get: () => artifact.weights, enumerable: true })]) {
    assert.throws(() => readRidgeTopicAdapter(bad), TypeError);
  }
});

test('Trust: absent, malformed and synthetic installed Ridge fail closed despite an available legacy path', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'udl-ridge-trust-'));
  const ridgePath = path.join(directory, 'ridge.json');
  const adapterPath = path.join(directory, 'legacy.json');
  const empty = { alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter: null };
  try {
    const legacy = makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 });
    writeFileSync(adapterPath, JSON.stringify(legacy));
    assert.deepEqual(readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath }), empty);
    assert.equal(readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath, useLegacyE5: true })
      .alternateAdapter.schema, legacy.schema);
    for (const data of ['{', '{}', JSON.stringify(artifact), Buffer.alloc(RIDGE_TOPIC_MAX_BYTES + 1)]) {
      writeFileSync(ridgePath, data);
      assert.deepEqual(readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath }), empty);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Trust: factory uses exact frozen floor, full-cross refinement and truthful outer identity', () => {
  const input = snapshot([source('a', -0.4), source('b', 0), source('c', 0.4)]);
  const before = structuredClone(input);
  const actual = planner().plan(input);
  const frozen = createPracticalTopicPlanner({ representation: RIDGE_TOPIC_SCHEMA,
    floor: 0.8639003810829322, transform: createRidgeTopicTransform(artifact) }).plan(input);
  assert.deepEqual(actual.partitions, frozen.partitions);
  assert.deepEqual(actual.partitions, [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }]);
  assert.equal(actual.policyVersion, PRACTICAL_POLICY.version);
  assert.equal(actual.diagnostics.floor, 0.8639003810829322);
  assert.equal(actual.diagnostics.coarsePolicyVersion, 'alternate-indexed-body-metric/v1');
  assert.deepEqual(input, before);
  assert.equal(JSON.stringify(actual).includes('weights'), false);
});

test('Trust: negative pages and manual Sources cannot witness joins; every provisional ID survives', () => {
  const input = snapshot([source('a', 0), source('a-copy', 0), source('b', 0.1),
    source('landing', 0, { url: 'https://example.test/' }), source('manual', 0)]);
  input.sourceLinks[4].method = 'manual-confirmed';
  const result = planner().plan(input);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'a-copy', 'b'] }, { sourceIds: ['landing'] }]);
  assert.equal(result.diagnostics.coarseDuplicateSources, 1);
  assert.equal(result.diagnostics.quarantinedSources, 1);
  assert.equal(JSON.stringify(result).includes('manual'), false);
});

test('Trust: malformed snapshot and tightened capacity yield no partial grouping', () => {
  const input = snapshot([source('a', 0), source('b', 0.1)]);
  for (const key of ['maxWorkUnits', 'workBudgetMs', 'maxCachedPairs', 'maxEdgeBytes']) {
    assert.throws(() => planner().plan({ ...input, limits: { [key]: PRACTICAL_POLICY[key] + 1 } }), TypeError);
  }
  assert.throws(() => planner().plan({ ...input, limits: { maxWorkUnits: 5 } }),
    error => error.code === 'capacity');
  let calls = 0;
  const getter = Object.defineProperty({ ...input.sources[0] }, 'title', {
    enumerable: true, get() { calls++; throw Error('unexpected getter'); },
  });
  assert.throws(() => planner().plan(snapshot([getter])), TypeError);
  assert.equal(calls, 0);
});

test('Trust: Ridge discussion is a source-scoped read; canonical writes and Insight proof stay bound', () => {
  const compressed = [...weights]; compressed[384 + 1] = 0.1;
  const serviceArtifact = makeRidgeTopicAdapter({ weights: compressed,
    meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
  const dependencies = deterministicDependencies();
  const repository = createMemoryRepository(createDemoState({ generation: dependencies.nextId('generation'),
    createdAt: dependencies.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS }));
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies,
    alternateRidgeAdapter: serviceArtifact });
  const ingest = (id, angle) => service.ingest({ expected: service.catalog().version,
    operationId: `ridge-trust-${id}`, title: `Fictional ${id}`, url: `https://example.com/article/${id}`,
    extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: vector(angle) } });
  const a = ingest('a', 0), b = ingest('b', 1);
  assert.notEqual(a.topicId, b.topicId);
  const command = (operationId, topicId, sourceId) => service.command(service.catalog().version,
    { type: 'create-root', topicId, originSourceId: sourceId, body: `Fictional ${operationId}` },
    'demo-alex').result;
  const aRoot = command('root-a', a.topicId, a.sourceId).contributionId;
  const bRoot = command('root-b', b.topicId, b.sourceId).contributionId;
  const before = repository.load(), proof = service.insightAnchor(a.topicId, a.sourceId);
  const view = service.alternateDiscussion(a.sourceId);
  assert.equal(view.policyVersion, PRACTICAL_POLICY.version);
  assert.deepEqual(new Set(view.sourceIds), new Set([a.sourceId, b.sourceId]));
  assert.deepEqual(new Set(view.roots.map(root => root.id)), new Set([aRoot, bRoot]));
  assert.equal(view.roots.find(root => root.id === bRoot).canonicalTopicId, b.topicId);
  assert.equal(view.roots.find(root => root.id === bRoot).origin.url, `https://example.com/article/b`);
  assert.deepEqual(repository.load(), before);
  assert.deepEqual(service.insightAnchor(a.topicId, a.sourceId), proof);
  assert.throws(() => service.insightAnchor(b.topicId, a.sourceId), error => error.code === 'conflict');
  assert.equal(service.discussion(a.topicId).roots.some(root => root.id === bRoot), false);
  assert.equal(JSON.stringify(view).includes('weights'), false);
  assert.equal(JSON.stringify(view).includes('meanX'), false);
});
