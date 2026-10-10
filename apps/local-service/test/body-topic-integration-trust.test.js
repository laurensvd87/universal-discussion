import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryRepository } from '../src/adapters/memory-repository.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from '../src/adapters/fixture-catalog.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { readInstalledOwnerTopicConfiguration } from '../src/application/owner-topic-configuration.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';
import { makeBodyTopicMetric, BODY_METRIC_MAX_BYTES } from '../src/domain/body-topic-metric.js';
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from '../src/domain/learned-sources.js';
import { deterministicDependencies } from './helpers.js';
import { readAlternateDiscussion } from '../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import { buildDashboardSnapshot } from '../../topic-dashboard/src/data/catalog.js';
import { buildGroupingPreview } from '../../topic-dashboard/src/data/grouping-preview.js';

const diagonal = makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 });
const lower = new Float64Array(384 ** 2);
for (let row = 0; row < 384; row++) lower[row * 384 + row] = 0.5;
const body = makeBodyTopicMetric({ mean: Array(384).fill(0), lower });

function harness(configuration) {
  const dependencies = deterministicDependencies();
  const repository = createMemoryRepository(createDemoState({ generation: dependencies.nextId('generation'),
    createdAt: dependencies.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS }));
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies, ...configuration });
  const ingest = (name, angle) => service.ingest({ expected: service.catalog().version,
    operationId: `trust-${name}`, title: `Fictional ${name}`, url: `https://example.com/trust/${name}`,
    extractorVersion: EXTRACTOR_VERSION,
    embedding: { modelId: BROWSER_MODEL_ID, values: [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)] } });
  const a = ingest('a', 0), b = ingest('b', 1);
  assert.notEqual(a.topicId, b.topicId);
  const command = value => service.command(service.catalog().version, value, 'demo-alex').result;
  return { service, repository, a, b, command };
}

test('Trust: default installed selection remains diagonal; explicit BODY research distinguishes missing from corruption', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'udl-fictional-body-composition-'));
  const adapterPath = path.join(directory, 'diagonal.json'), bodyPath = path.join(directory, 'body.json');
  const read = () => readInstalledOwnerTopicConfiguration({ bodyPath, adapterPath, useLegacyE5: true, useBodyMetric: true });
  const defaultRead = () => readInstalledOwnerTopicConfiguration({ bodyPath, adapterPath, useLegacyE5: true });
  try {
    writeFileSync(adapterPath, JSON.stringify(diagonal));
    assert.deepEqual(read(), { alternateAdapter: diagonal, alternateBodyMetric: null, alternateRidgeAdapter: null });
    writeFileSync(bodyPath, JSON.stringify(body));
    assert.deepEqual(read(), { alternateAdapter: null, alternateBodyMetric: body, alternateRidgeAdapter: null });
    const current = defaultRead();
    assert.deepEqual(current, { alternateAdapter: diagonal, alternateBodyMetric: null, alternateRidgeAdapter: null });
    const h = harness(current);
    assert.equal(h.service.alternateDiscussion(h.a.sourceId).policyVersion, 'alternate-indexed-independent-evidence/v2');
    assert.deepEqual(h.service.alternateDiscussion(h.a.sourceId).sourceIds, [h.a.sourceId]);
    for (const corrupt of ['{', '{}', '', Buffer.from([0xc0, 0xaf]), Buffer.alloc(BODY_METRIC_MAX_BYTES + 1)]) {
      writeFileSync(bodyPath, corrupt);
      assert.deepEqual(read(), { alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter: null });
      assert.deepEqual(defaultRead(), { alternateAdapter: diagonal, alternateBodyMetric: null, alternateRidgeAdapter: null });
    }
    unlinkSync(bodyPath);
    assert.deepEqual(read(), { alternateAdapter: diagonal, alternateBodyMetric: null, alternateRidgeAdapter: null });
  } finally {
    for (const filename of [bodyPath, adapterPath]) {
      try { unlinkSync(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    rmdirSync(directory);
  }
});

test('Trust: BODY preference changes only the alternate read and preserves canonical root and Insight authority', () => {
  const h = harness({ alternateAdapter: diagonal, alternateBodyMetric: body });
  const aRoot = h.command({ type: 'create-root', topicId: h.a.topicId, originSourceId: h.a.sourceId, body: 'Fictional A root' }).contributionId;
  const bRoot = h.command({ type: 'create-root', topicId: h.b.topicId, originSourceId: h.b.sourceId, body: 'Fictional B root' }).contributionId;
  const before = h.repository.load(), anchor = h.service.insightAnchor(h.a.topicId, h.a.sourceId);
  const view = h.service.alternateDiscussion(h.a.sourceId);
  assert.equal(view.policyVersion, 'alternate-indexed-body-metric/v1');
  assert.equal(view.representation, 'owner-local-body-topic-metric/v1');
  assert.deepEqual(new Set(view.sourceIds), new Set([h.a.sourceId, h.b.sourceId]));
  assert.deepEqual(new Set(view.roots.map(root => root.id)), new Set([aRoot, bRoot]));
  assert.equal(view.roots.find(root => root.id === bRoot).canonicalTopicId, h.b.topicId);
  assert.deepEqual(h.repository.load(), before);
  assert.deepEqual(h.service.insightAnchor(h.a.topicId, h.a.sourceId), anchor);
  assert.throws(() => h.service.insightAnchor(h.b.topicId, h.a.sourceId), error => error.code === 'conflict');
  assert.equal(h.service.discussion(h.a.topicId).roots.some(root => root.id === bRoot), false);
  const later = h.command({ type: 'create-root', topicId: h.a.topicId, originSourceId: h.a.sourceId, body: 'Fictional later root' }).contributionId;
  assert.ok(h.service.discussion(h.a.topicId).roots.some(root => root.id === later));
  assert.ok(h.service.alternateDiscussion(h.b.sourceId).roots.some(root => root.id === later));
});

test('Trust: invalid selected BODY disables only New and cannot revive the supplied diagonal', () => {
  const h = harness({ alternateAdapter: diagonal, alternateBodyMetric: {} });
  assert.throws(() => h.service.alternateDiscussion(h.a.sourceId), error => error.code === 'unavailable');
  assert.ok(h.service.catalog().sources.some(source => source.id === h.a.sourceId));
  h.command({ type: 'create-root', topicId: h.a.topicId, body: 'Fictional Current remains writable' });
  assert.equal(h.service.discussion(h.a.topicId).roots.length, 1);
  const old = harness({ alternateAdapter: diagonal, alternateBodyMetric: null });
  assert.equal(old.service.alternateDiscussion(old.a.sourceId).policyVersion, 'alternate-indexed-independent-evidence/v2');
  assert.deepEqual(old.service.alternateDiscussion(old.a.sourceId).sourceIds, [old.a.sourceId]);
});

test('Trust: browser accepts only paired BODY identity and rejects stale/source-mismatched responses', () => {
  const h = harness({ alternateBodyMetric: body });
  const view = h.service.alternateDiscussion(h.a.sourceId), catalog = h.service.catalog(), canonical = h.service.discussion(h.a.topicId);
  assert.deepEqual(readAlternateDiscussion(view, h.a.sourceId, catalog, canonical).sourceIds, view.sourceIds);
  for (const change of [{ representation: 'owner-local-diagonal-adapter/v1' },
    { policyVersion: 'alternate-indexed-independent-evidence/v2' }, { policyVersion: 'alternate-indexed-body-metric/v999' },
    { sourceId: h.b.sourceId }, { version: { ...view.version, revision: view.version.revision + 1 } }]) {
    assert.throws(() => readAlternateDiscussion({ ...view, ...change }, h.a.sourceId, catalog, canonical));
  }
});

test('Trust: dashboard and service share BODY groups while manual pins remain canonical', () => {
  const h = harness({ alternateAdapter: diagonal, alternateBodyMetric: body });
  let state = h.repository.load(), snapshot = buildDashboardSnapshot(state);
  let preview = buildGroupingPreview(state, snapshot, diagonal, body);
  assert.deepEqual(preview.groups.find(group => group.sourceIds.includes(h.a.sourceId)).sourceIds,
    h.service.alternateDiscussion(h.a.sourceId).sourceIds);
  assert.equal(buildGroupingPreview(state, snapshot, diagonal, {}), null);
  h.command({ type: 'correct-source', sourceId: h.b.sourceId, topicId: h.b.topicId });
  state = h.repository.load(); snapshot = buildDashboardSnapshot(state);
  preview = buildGroupingPreview(state, snapshot, diagonal, body);
  assert.deepEqual(preview.groups, [{ sourceIds: [h.a.sourceId] }, { sourceIds: [h.b.sourceId] }]);
  assert.equal(h.service.alternateDiscussion(h.b.sourceId).mode, 'canonical-pinned');
  assert.deepEqual(h.service.alternateDiscussion(h.a.sourceId).sourceIds, [h.a.sourceId]);
  assert.equal(JSON.stringify(preview).includes('lower'), false);
});
