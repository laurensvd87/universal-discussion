import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRidgeTopicAdapter, readRidgeTopicAdapter, createRidgeTopicTransform,
  RIDGE_PARAMETER_SHA256, RIDGE_TOPIC_MAX_BYTES, RIDGE_TOPIC_SCHEMA } from '../src/domain/ridge-topic-adapter.js';
import { readInstalledOwnerTopicConfiguration } from '../src/application/owner-topic-configuration.js';
import { createOwnerTopicPlanner } from '../src/domain/owner-topic-planner.js';
import { createPracticalTopicPlanner } from '../src/domain/ridge-topic-planner.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createMemoryRepository } from '../src/adapters/memory-repository.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from '../src/adapters/fixture-catalog.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { deterministicDependencies } from './helpers.js';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from '../src/domain/learned-sources.js';

const weights = Array(384 * 384).fill(0);
for (let k = 0; k < 384; k++) weights[k * 384 + k] = 1;
const synthetic = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
const diagonal = makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 });
const unit = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const source = (id, angle, title = `Fictional ${id}`) => ({ id, title, url: `https://example.com/${id}`,
  provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
  embedding: { modelId: BROWSER_MODEL_ID, values: unit(angle) } });
const links = ids => ids.map(sourceId => ({ sourceId, method: 'learned-provisional' }));

test('Ridge adapter copies coefficients, validates manifest and rejects unsafe data', () => {
  const valid = readRidgeTopicAdapter(synthetic);
  assert.equal(valid.schema, RIDGE_TOPIC_SCHEMA);
  weights[0] = 0;
  assert.equal(createRidgeTopicTransform(valid)(unit(0))[0], 1);
  assert.throws(() => readRidgeTopicAdapter(synthetic, { expectedParameterSha256: RIDGE_PARAMETER_SHA256 }), TypeError);
  for (const mutation of [
    { ...synthetic, parameterSha256: RIDGE_PARAMETER_SHA256 },
    { ...synthetic, teacherRevision: 'wrong' },
    { ...synthetic, manifestSha256: '0'.repeat(64) },
    new Proxy(synthetic, {}),
    Object.defineProperty({ ...synthetic }, 'weights', { get: () => synthetic.weights, enumerable: true }),
  ]) assert.throws(() => readRidgeTopicAdapter(mutation), TypeError);
  assert.throws(() => createRidgeTopicTransform(valid)(Array(384).fill(1e308)), TypeError);
});

test('installed Ridge absence and corruption disable learned view; Legacy E5 is explicit', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'udl-ridge-topic-test-'));
  const ridgePath = path.join(directory, 'ridge.json'), adapterPath = path.join(directory, 'diagonal.json');
  try {
    writeFileSync(adapterPath, JSON.stringify(diagonal));
    assert.deepEqual(readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath }),
      { alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter: null });
    assert.equal(readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath, useLegacyE5: true }).alternateAdapter.schema,
      diagonal.schema);
    for (const corrupt of ['{', '{}', JSON.stringify(synthetic), Buffer.alloc(RIDGE_TOPIC_MAX_BYTES + 1)]) {
      writeFileSync(ridgePath, corrupt);
      assert.deepEqual(readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath }),
        { alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter: null });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Ridge factory matches the frozen practical proposal on synthetic affine inputs', () => {
  const snapshot = { sources: [source('a', 0), source('b', .1), source('c', 2.2)], sourceLinks: links(['a', 'b', 'c']) };
  const factory = createOwnerTopicPlanner({ ridgeAdapter: synthetic, diagonalAdapter: diagonal });
  const proposal = createPracticalTopicPlanner({ representation: RIDGE_TOPIC_SCHEMA,
    floor: .8639003810829322, transform: createRidgeTopicTransform(synthetic) });
  const a = factory.plan(snapshot), b = proposal.plan(snapshot);
  assert.equal(a.policyVersion, 'ridge1-qualified-complete-link/v1');
  assert.deepEqual(a.partitions, b.partitions);
  assert.deepEqual(a.partitions, [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }]);
  assert.equal(a.diagnostics.coarsePolicyVersion, 'alternate-indexed-body-metric/v1');
  assert.equal(a.diagnostics.floor, .8639003810829322);
});

test('Ridge alternate read leaves canonical state and Insight authority intact', () => {
  const dependencies = deterministicDependencies();
  const repository = createMemoryRepository(createDemoState({ generation: dependencies.nextId('generation'),
    createdAt: dependencies.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS }));
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies,
    alternateRidgeAdapter: synthetic, alternateAdapter: diagonal });
  const ingest = (name, angle) => service.ingest({ expected: service.catalog().version,
    operationId: `ridge-${name}`, title: `Fictional ${name}`, url: `https://example.com/${name}`,
    extractorVersion: EXTRACTOR_VERSION, embedding: { modelId: BROWSER_MODEL_ID, values: unit(angle) } });
  const a = ingest('a', 0), b = ingest('b', .1);
  const before = repository.load(), anchor = service.insightAnchor(a.topicId, a.sourceId);
  const view = service.alternateDiscussion(a.sourceId);
  assert.equal(view.policyVersion, 'ridge1-qualified-complete-link/v1');
  assert.equal(view.representation, RIDGE_TOPIC_SCHEMA);
  assert.deepEqual(new Set(view.sourceIds), new Set([a.sourceId, b.sourceId]));
  assert.deepEqual(repository.load(), before);
  assert.deepEqual(service.insightAnchor(a.topicId, a.sourceId), anchor);
});
