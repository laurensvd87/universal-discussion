import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../src/domain/demo-state.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { applyLearnedIngest, readLearnedIngest, BROWSER_MODEL_ID } from '../src/domain/learned-sources.js';
import { applyAdaptiveTopicPlan } from '../src/domain/adaptive-topic-integration.js';
import { operationDigestFor } from '../src/domain/source-threads.js';
import { prepareIngestion } from '../src/application/ingestion-plan.js';
import { priorPlanAdaptiveTopics } from './fixtures/adaptive-topics-prior.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIngestionWorkerQueue } from '../src/application/ingestion-worker-queue.js';

const time = '2026-10-13T12:00:00Z';
const vector = axis => Array.from({ length: 384 }, (_, index) => index === axis ? 1 : 0);
function fixture(t) {
  const repository = createNormalizedSqliteRepository(':memory:', createDemoState({ generation: 'unchanged-trust',
    createdAt: time, sources: [], topicSeeds: [] }));
  t.after(() => repository.close()); let serial = 0;
  const dependencies = { nextId: kind => `${kind}-unchanged-${++serial}`, now: () => time };
  const configuration = { repository, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], ...dependencies };
  const service = createDiscussionService(configuration);
  const ingest = (label, axis, operation = `operation-${label}-${++serial}`) => service.ingest({ expected: service.version(),
    operationId: operation, url: `https://example.org/articles/${label}`, title: `Synthetic article ${label}`,
    extractorVersion: 'main-text-prefix/v1', embedding: { modelId: BROWSER_MODEL_ID, values: vector(axis) } });
  const first = ingest('one', 0); ingest('duplicate', 0); ingest('other', 1);
  const command = input => service.command(service.version(), input, 'demo-alex').result;
  const oldRoot = command({ type: 'create-root', topicId: first.topicId, originSourceId: first.sourceId, body: 'Exact historical opener' }).contributionId;
  command({ type: 'reply', discussionId: service.discussion(first.topicId).discussionId, rootId: oldRoot, replyToId: null, body: 'Exact historical child' });
  ingest('one', 2);
  const pin = command({ type: 'correct-source', sourceId: first.sourceId, topicId: null });
  const root = command({ type: 'create-root', topicId: pin.topicId, originSourceId: first.sourceId, body: 'Exact current manual opener' }).contributionId;
  const discussionId = service.discussion(pin.topicId).discussionId;
  const reply = command({ type: 'reply', discussionId, rootId: root, replyToId: null, body: 'Exact current child' }).contributionId;
  command({ type: 'reply', discussionId, rootId: root, replyToId: reply, body: 'Exact nested child' });
  let state = structuredClone(repository.load()); state.revision++;
  state.topics.find(topic => topic.id === pin.topicId).retainTight = true;
  repository.save(service.version(), state);
  const request = () => {
    const current = repository.load(), source = current.sources.find(source => source.id === first.sourceId);
    return readLearnedIngest({ expected: service.version(), operationId: `operation-revisit-${++serial}`,
      url: source.url, title: source.title, extractorVersion: source.extractorVersion, embedding: source.embedding });
  };
  return { repository, service, configuration, dependencies, request, sourceId: first.sourceId };
}
const noRegroup = () => { throw Error('canonical regroup must not run for an exact current-policy revisit'); };
function receiptOnly(before, after, input) {
  const expected = structuredClone(before); expected.revision++;
  Object.assign(expected.sources.find(source => source.url === input.url), {
    operationId: input.operationId, operationDigest: operationDigestFor(input),
  });
  assert.deepEqual(after, expected, 'only exact receipt fields and the successor revision may change');
}

test('Trust: exact current-policy revisit skips adaptive planner and preserves pins, tight retention and every historical/current body', t => {
  const f = fixture(t), before = f.repository.load(), input = f.request();
  const checked = structuredClone(before);
  applyAdaptiveTopicPlan(checked, { nextId: () => { throw Error('fixed point cannot allocate a Topic'); }, now: () => time }, { planner: priorPlanAdaptiveTopics });
  assert.deepEqual(checked, before, 'fixture is an exact canonical fixed point of the frozen policy');
  const guarded = createDiscussionService({ ...f.configuration, adaptivePlanner: noRegroup });
  const accepted = guarded.ingest(input);
  assert.equal(accepted.sourceId, f.sourceId); assert.equal(accepted.assignment, 'confirmed');
  receiptOnly(before, f.repository.load(), input);
  assert.deepEqual(guarded.ingest(input), accepted, 'same exact operation is a receipt replay, not another successor');
  assert.throws(() => guarded.ingest({ ...input, title: 'Changed exact operation payload' }), error => error.code === 'conflict');
  assert.deepEqual(f.repository.load().revision, before.revision + 1);
});

test('Trust: title, representation, extractor or stale policy cannot bypass the canonical planner', t => {
  const f = fixture(t), before = f.repository.load();
  for (const change of [input => input.title = 'Changed matching title', input => input.embedding.values = vector(3),
    input => input.extractorVersion = 'crawler-static-html-prefix/v1']) {
    const input = f.request(); change(input);
    assert.throws(() => applyLearnedIngest(before, input, operationDigestFor(input), { ...f.dependencies, adaptivePlanner: noRegroup }), /canonical regroup/);
  }
  const oldPolicy = structuredClone(before); oldPolicy.sources.find(source => source.id === f.sourceId).policyVersion = 'prior-policy';
  const input = f.request();
  assert.throws(() => applyLearnedIngest(oldPolicy, input, operationDigestFor(input), { ...f.dependencies, adaptivePlanner: noRegroup }), /canonical regroup/);
  assert.deepEqual(f.repository.load(), before, 'rejected preparation cannot mutate committed state');
});

test('Trust: incomplete current routing, old sibling policy and damaged receipt cannot take the unchanged fastpath', t => {
  const f = fixture(t), before = f.repository.load(), input = f.request();
  const selectedTopic = before.sourceLinks.find(link => link.sourceId === f.sourceId).topicId;
  for (const damage of [
    state => state.sources.find(source => source.id !== f.sourceId).policyVersion = 'prior-policy',
    state => state.sources.find(source => source.id === f.sourceId).operationDigest = '0'.repeat(64),
    state => state.sourceLinks = state.sourceLinks.filter(link => link.sourceId !== f.sourceId),
    state => state.sourceLinks.push({ ...state.sourceLinks.find(link => link.sourceId === f.sourceId) }),
    state => state.sourceLinks.find(link => link.sourceId === f.sourceId).method = 'unsupported-method',
    state => state.topics = state.topics.filter(topic => topic.id !== selectedTopic),
    state => state.topics.push({ ...state.topics.find(topic => topic.id === selectedTopic) }),
    state => state.topics.find(topic => topic.id === selectedTopic).retainTight = 'invalid',
    state => state.discussions = state.discussions.filter(discussion => discussion.topicId !== selectedTopic),
    state => state.discussions.push({ ...state.discussions.find(discussion => discussion.topicId === selectedTopic) }),
  ]) {
    const damaged = structuredClone(before); damage(damaged);
    assert.throws(() => applyLearnedIngest(damaged, input, operationDigestFor(input),
      { ...f.dependencies, adaptivePlanner: noRegroup }), /canonical regroup/);
  }
  const signedZero = structuredClone(input); signedZero.embedding.values[0] = -0;
  assert.throws(() => applyLearnedIngest(before, signedZero, operationDigestFor(signedZero),
    { ...f.dependencies, adaptivePlanner: noRegroup }), /canonical regroup/, 'Object.is-exact axes cannot hide signed-zero drift');
  const reordered = structuredClone(input); reordered.embedding = { values: reordered.embedding.values, modelId: reordered.embedding.modelId };
  assert.throws(() => applyLearnedIngest(before, reordered, operationDigestFor(reordered),
    { ...f.dependencies, adaptivePlanner: noRegroup }), /canonical regroup/, 'mathematical equality cannot silently replace exact serialized receipt identity');
  assert.deepEqual(f.repository.load(), before);
});

test('Trust: real readonly worker keeps unchanged-ingest receipt closure and accepted bodies exact', async t => {
  const f = fixture(t), before = f.repository.load();
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-unchanged-ingest-trust-'));
  const databasePath = path.join(directory, 'canonical.sqlite');
  const repository = createNormalizedSqliteRepository(databasePath, before);
  const queue = createIngestionWorkerQueue({ databasePath, incrementalMatching: true });
  t.after(async () => {
    await queue.close(); repository.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const input = f.request(); const plan = await queue.prepare(input, { createdAt: time });
  assert.equal(plan.receipt, false);
  repository.saveScoped(input.expected, plan.before, plan.after);
  receiptOnly(before, repository.load(), input);
  const replay = await queue.prepare(input, { createdAt: time });
  assert.equal(replay.receipt, true); assert.deepEqual(replay.version, repository.version());
  await assert.rejects(queue.prepare({ ...input, title: 'Different replay payload' }, { createdAt: time }), error => error.code === 'conflict');
  assert.equal(repository.version().revision, before.revision + 1);
});

test('Trust: unchanged prepared ingestion retains exact scoped-save and generation/revision authority', t => {
  const f = fixture(t), before = f.repository.load(), input = f.request();
  const plan = prepareIngestion(before, input, { ...f.dependencies, adaptivePlanner: noRegroup });
  assert.equal(plan.receipt, false); assert.equal(plan.after.revision, before.revision + 1);
  f.repository.saveScoped(input.expected, plan.before, plan.after);
  receiptOnly(before, f.repository.load(), input);
  const next = f.request(), snapshot = f.repository.load();
  const prepared = prepareIngestion(snapshot, next, { ...f.dependencies, adaptivePlanner: noRegroup });
  f.service.command(f.service.version(), { type: 'create-root', topicId: plan.result.topicId, body: 'Concurrent accepted body' }, 'demo-alex');
  const current = f.repository.load();
  assert.throws(() => f.repository.saveScoped(next.expected, prepared.before, prepared.after), error => error.code === 'conflict');
  assert.deepEqual(f.repository.load(), current);
  assert.throws(() => prepareIngestion(current, next, { ...f.dependencies, adaptivePlanner: noRegroup }), error => error.code === 'conflict');
  assert.throws(() => prepareIngestion(current, { ...next, expected: { ...next.expected, generation: 'foreign-generation' } }, f.dependencies), error => error.code === 'conflict');
});
