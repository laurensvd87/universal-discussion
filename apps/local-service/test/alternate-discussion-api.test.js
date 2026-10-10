import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepository } from '../src/adapters/memory-repository.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from '../src/adapters/fixture-catalog.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from '../src/domain/learned-sources.js';
import { rootAssociation } from '../src/domain/source-threads.js';
import { createRequestHandler } from '../src/http/request-handler.js';
import { validateStartupConfig } from '../src/http/startup-config.js';
import { deterministicDependencies } from './helpers.js';
import { readAlternateDiscussion } from '../../../spikes/topic-resolution/browser/core/local-service-contract.js';

const ORIGIN = `chrome-extension://${'a'.repeat(32)}`;
const TOKEN = 'test-capability-value-32-characters';
const config = validateStartupConfig({ host: '127.0.0.1', port: 4174, origin: ORIGIN, capability: TOKEN });
const parameters = Array(384).fill(0);
parameters[1] = -0.5;
const adapter = makeDiagonalAdapter(parameters, { triplets: 100 });

function harness(alternateAdapter = adapter) {
  const deps = deterministicDependencies();
  const initial = createDemoState({ generation: deps.nextId('generation'), createdAt: deps.now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createMemoryRepository(initial);
  const create = (repo = repository) => createDiscussionService({ repository: repo,
    ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES,
    topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...deps, alternateAdapter });
  const service = create();
  const ingest = (name, angle) => {
    const values = Array(384).fill(0);
    values[0] = Math.cos(angle); values[1] = Math.sin(angle);
    return service.ingest({ expected: service.catalog().version, operationId: `alternate-${name}`,
      url: `https://example.com/alternate/${name}`, title: `Synthetic ${name}`,
      embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION });
  };
  const command = (value, expected = service.catalog().version) =>
    service.command(expected, value, 'demo-alex').result;
  return { service, repository, create, ingest, command };
}

function request(sourceId, headers = {}) {
  return { method: 'GET', url: `/v1/sources/${sourceId}/alternate-discussion`,
    headers: { host: '127.0.0.1:4174', authorization: `Bearer ${TOKEN}`, origin: ORIGIN, ...headers }, body: null };
}

test('alternate read combines Source roots across canonical Topics while keeping pinned roots and real write IDs', () => {
  const h = harness();
  const a = h.ingest('a', 0);
  const b = h.ingest('b', 0.48);
  const c = h.ingest('c', 1.5);
  assert.notEqual(a.topicId, b.topicId);
  const aRoot = h.command({ type: 'create-root', topicId: a.topicId, originSourceId: a.sourceId, body: 'First source' }).contributionId;
  const bRoot = h.command({ type: 'create-root', topicId: b.topicId, originSourceId: b.sourceId, body: 'Second source' }).contributionId;
  const cRoot = h.command({ type: 'create-root', topicId: c.topicId, originSourceId: c.sourceId, body: 'Other subject' }).contributionId;
  const pinned = h.command({ type: 'create-root', topicId: a.topicId, body: 'Older topic post' }).contributionId;
  const view = h.service.alternateDiscussion(a.sourceId);
  const clientView = readAlternateDiscussion(view, a.sourceId, h.service.catalog(), h.service.discussion(a.topicId));
  assert.deepEqual(clientView.sourceIds, view.sourceIds);
  assert.deepEqual(clientView.roots.map((root) => root.id), view.roots.map((root) => root.id));
  assert.equal(view.mode, 'alternate-provisional');
  assert.deepEqual([...view.sourceIds].sort(), [a.sourceId, b.sourceId].sort());
  assert.deepEqual(new Set(view.roots.map((root) => root.id)), new Set([aRoot, bRoot]));
  assert.equal(view.roots.find((root) => root.id === bRoot).canonicalTopicId, b.topicId);
  assert.equal(view.roots.find((root) => root.id === bRoot).canonicalDiscussionId, h.service.discussion(b.topicId).discussionId);
  assert.deepEqual(view.pinnedRoots.map((root) => root.id), [pinned]);
  assert.equal(view.canonical.topic.id, a.topicId);
  assert.equal(view.canonical.discussionId, h.service.discussion(a.topicId).discussionId);
  assert.deepEqual(view.version, h.service.catalog().version);
  assert.equal(JSON.stringify(view).includes('parameters'), false);
  assert.equal(JSON.stringify(view).includes('previewId'), false);
  assert.equal(JSON.stringify(view).includes('embedding'), false);
  assert.equal(JSON.stringify(view).includes(cRoot), false);
  assert.equal(view.sourceIds.includes(c.sourceId), false);
  assert.equal(h.service.discussion(a.topicId).roots.some((root) => root.id === bRoot), false);
  const previous = view.version;
  h.command({ type: 'create-root', topicId: a.topicId, body: 'Later pinned post' });
  assert.throws(() => h.command({ type: 'create-root', topicId: a.topicId, body: 'Stale write' }, previous),
    (error) => error.code === 'conflict');
});

test('manual Source stays canonical and no manual roots from another Topic enter alternate view', () => {
  const h = harness();
  const a = h.ingest('manual-a', 0);
  const b = h.ingest('manual-b', 0.48);
  const bRoot = h.command({ type: 'create-root', topicId: b.topicId, originSourceId: b.sourceId, body: 'Pinned source post' }).contributionId;
  h.command({ type: 'correct-source', sourceId: b.sourceId, topicId: b.topicId });
  const aView = h.service.alternateDiscussion(a.sourceId);
  assert.equal(aView.roots.some((root) => root.id === bRoot), false);
  assert.equal(aView.pinnedRoots.some((root) => root.id === bRoot), false);
  const bView = h.service.alternateDiscussion(b.sourceId);
  assert.equal(bView.mode, 'canonical-pinned');
  assert.equal(bView.roots.some((root) => root.id === bRoot), true);
});

test('missing adapter fails closed and endpoint enforces bearer, Origin and Source validation', async () => {
  const missing = harness(null);
  const id = missing.ingest('unavailable', 0).sourceId;
  const unavailable = createRequestHandler({ service: missing.service, config });
  let response = await unavailable(request(id));
  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(response.body), { error: 'alternate-unavailable' });
  const h = harness();
  const a = h.ingest('http-a', 0);
  const handle = createRequestHandler({ service: h.service, config });
  response = await handle(request(a.sourceId));
  assert.equal(response.status, 200);
  response = await handle(request(a.sourceId, { authorization: 'Bearer wrong' }));
  assert.equal(response.status, 401);
  response = await handle(request(a.sourceId, { origin: 'https://example.com' }));
  assert.equal(response.status, 403);
  response = await handle(request('%2Fbad'));
  assert.equal(response.status, 400);
  response = await handle(request('missing'));
  assert.equal(response.status, 404);
});

test('combined Source-scoped response obeys the one MiB bound', () => {
  const h = harness();
  const a = h.ingest('big-a', 0);
  const b = h.ingest('big-b', 0.48);
  const state = structuredClone(h.repository.load());
  for (const receipt of [a, b]) {
    const source = state.sources.find((entry) => entry.id === receipt.sourceId);
    const discussionId = state.discussions.find((entry) => entry.topicId === receipt.topicId).id;
    for (let index = 0; index < 75; index++) state.contributions.push({
      id: `big-${receipt.sourceId}-${index}`, discussionId, rootId: null, replyToId: null,
      authorId: 'demo-alex', actorType: 'human', visibility: 'local-public', withdrawn: false,
      createdAt: '2026-10-10T00:00:00.000Z', revisions: [{ body: 'x'.repeat(8_000), createdAt: '2026-10-10T00:00:00.000Z' }],
      originSourceId: source.id, ...rootAssociation(receipt.topicId, source),
    });
  }
  const service = h.create({ load: () => state });
  assert.throws(() => service.alternateDiscussion(a.sourceId), (error) => error.code === 'capacity');
});
