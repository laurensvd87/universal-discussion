import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/domain/demo-state.js';
import { migrateReferenceTopicState } from '../src/domain/reference-state-migration.js';
import { createFixedReferenceMatcher, createInstalledFixedReferenceMatcher } from '../src/domain/fixed-reference-topic-integration.js';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { prepareIngestion } from '../src/application/ingestion-plan.js';
import { readLearnedIngest } from '../src/domain/learned-sources.js';
import { deterministicDependencies } from './helpers.js';

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
function setup(t, { indexOptions = {}, legacy = false } = {}) {
  const dependencies = deterministicDependencies();
  let initial = createDemoState({ generation: 'trust-reference-generation', createdAt: dependencies.now(), sources: [], topicSeeds: [] });
  if (!legacy) initial = migrateReferenceTopicState(initial, { represent() { assert.fail('empty fixture has no references'); } });
  const repository = createNormalizedSqliteRepository(':memory:', initial); t.after(() => repository.close());
  const matcher = createFixedReferenceMatcher({ transform: values => values, indexOptions });
  const compose = (repo = repository, referenceMatcher = matcher) => createDiscussionService({ repository: repo, ...dependencies,
    sources: [], topicSeeds: [], ranking: createFixtureRankingAdapter(), referenceMatcher });
  const service = compose(); let operation = 0;
  const request = (name, angle) => ({ expected: service.version(), operationId: `trust-operation-${++operation}`, url: `https://example.org/article-${name}`,
    title: `Synthetic article ${name}`, embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: vector(angle) }, extractorVersion: 'main-text-prefix/v1' });
  const ingest = (name, angle) => service.ingest(request(name, angle));
  const root = (source, body = 'Synthetic public root') => service.command(service.version(), {
    type: 'create-root', topicId: source.topicId, originSourceId: source.sourceId, body }, 'demo-alex').result.contributionId;
  return { dependencies, repository, matcher, compose, service, request, ingest, root };
}

test('Trust: warm radius-index exhaustion never becomes an empty search or writes a falsely unmatched Topic', t => {
  const f = setup(t, { indexOptions: { maxEntries: 1 } });
  f.ingest('a', -.4); f.ingest('b', .4); // Warm index has one accepted reference; the next snapshot contains two.
  const before = f.repository.load();
  for (const angle of [0, 2]) {
    assert.throws(() => f.ingest(`failed-${angle}`, angle), { code: 'capacity' });
    assert.deepEqual(f.repository.load(), before);
  }
  const missing = f.compose(f.repository, null);
  assert.throws(() => missing.ingest(f.request('missing-model', 1.8)), { code: 'unavailable' });
  assert.deepEqual(f.repository.load(), before);
  assert.throws(() => createInstalledFixedReferenceMatcher({}), TypeError);
  assert.throws(() => createFixedReferenceMatcher({ transform: values => values, indexOptions: { floor: .5 } }), TypeError);
});

test('Trust: a rejected prepared reference cannot contaminate the next accepted query or overwrite a concurrent post', t => {
  const f = setup(t), a = f.ingest('a', 0);
  const request = readLearnedIngest(f.request('uncommitted', 2));
  const plan = prepareIngestion(f.repository.load(), request, { ...f.dependencies, referenceMatcher: f.matcher });
  const rejectedTopic = plan.result.topicId;
  assert.equal(f.repository.load().topics.some(topic => topic.id === rejectedTopic), false);
  const post = f.root(a, 'Concurrent accepted post'), accepted = f.repository.load();
  assert.throws(() => f.repository.saveScoped(request.expected, plan.before, plan.after), { code: 'conflict' });
  assert.deepEqual(f.repository.load(), accepted);
  const next = f.ingest('fresh-same-direction', 2);
  assert.notEqual(next.topicId, rejectedTopic);
  assert.equal(f.repository.load().topics.length, 2, 'only the actually accepted new reference exists');
  assert.equal(f.repository.load().topics.find(topic => topic.id === next.topicId).reference.sourceId, next.sourceId);
  assert.equal(f.repository.load().contributions.find(item => item.id === post).revisions[0].body, 'Concurrent accepted post');
});

test('Trust: overlapping membership is read-only proof, not secondary root/reply/generated-post authority', t => {
  const f = setup(t), a = f.ingest('a', -.4), b = f.ingest('b', .4), c = f.ingest('c', 0);
  assert.equal(c.topicIds.length, 2);
  const secondary = c.topicIds.find(id => id !== c.topicId), owner = a.topicId === secondary ? a : b;
  const rootId = f.root(owner, 'Other original destination'), discussionId = f.service.discussion(secondary).discussionId;
  const before = f.repository.load();
  assert.throws(() => f.service.command(f.service.version(), { type: 'create-root', topicId: secondary,
    originSourceId: c.sourceId, body: 'Must not post through membership' }, 'demo-alex'), { code: 'invalid' });
  assert.throws(() => f.service.command(f.service.version(), { type: 'reply', discussionId, rootId, replyToId: rootId,
    originSourceId: c.sourceId, body: 'Must not reply through membership' }, 'demo-alex'), { code: 'invalid' });
  const body = 'Synthetic generated fixture', operationId = 'trust-generated-operation';
  assert.throws(() => f.service.command(f.service.version(), { type: 'share-insight', topicId: secondary, originSourceId: c.sourceId, body, operationId },
    'demo-alex', { kind: 'generated-insight', operationId, actorId: 'demo-alex', topicId: secondary, body, originSourceId: c.sourceId,
      rootId: null, replyToId: null, discussionId: null }), { code: 'invalid' });
  assert.deepEqual(f.repository.load(), before);
  const read = f.service.alternateDiscussion(c.sourceId);
  assert.ok(read.roots.some(root => root.id === rootId && root.canonicalTopicId === secondary));
});

test('Trust: changed overlapping page pins the whole historical subtree without moving, rewriting or regrouping other records', t => {
  const f = setup(t); f.ingest('a', -.4); f.ingest('b', .4); const c = f.ingest('c', 0), rootId = f.root(c);
  const discussionId = f.service.discussion(c.topicId).discussionId;
  const replyId = f.service.command(f.service.version(), { type: 'reply', discussionId, rootId, replyToId: rootId,
    originSourceId: c.sourceId, body: 'Synthetic nested reply' }, 'demo-blair').result.contributionId;
  const before = f.repository.load(), changed = f.ingest('c', 2.2), after = f.repository.load();
  assert.notEqual(changed.topicId, c.topicId);
  for (const id of [rootId, replyId]) {
    const old = before.contributions.find(item => item.id === id), current = after.contributions.find(item => item.id === id);
    assert.equal(current.discussionId, old.discussionId); assert.deepEqual(current.revisions, old.revisions);
    assert.equal(current.rootId, old.rootId); assert.equal(current.replyToId, old.replyToId);
  }
  assert.deepEqual(after.contributions.find(item => item.id === rootId).anchor, { kind: 'topic', topicId: c.topicId });
  assert.deepEqual(after.sources.filter(source => source.id !== c.sourceId), before.sources.filter(source => source.id !== c.sourceId));
  for (const old of before.topics) assert.deepEqual(after.topics.find(topic => topic.id === old.id), old);
});

test('Trust: forgetting one origin erases every fixed vector it witnessed, preserves history, and never replaces a disabled reference', t => {
  const f = setup(t), a = f.ingest('a', -.4), b = f.ingest('b', .4); f.ingest('c', 0); const rootId = f.root(a);
  const moved = f.ingest('a', 2), oldDiscussion = f.repository.load().contributions.find(item => item.id === rootId).discussionId;
  assert.notEqual(moved.topicId, a.topicId);
  const originalReferences = f.repository.load().topics.filter(topic => topic.reference?.sourceId === a.sourceId).map(topic => topic.id);
  assert.equal(originalReferences.length, 2);
  f.service.command(f.service.version(), { type: 'forget-source', sourceId: a.sourceId }, 'demo-alex');
  let current = f.repository.load();
  for (const id of originalReferences) assert.equal(current.topics.find(topic => topic.id === id).reference, null);
  const historical = current.contributions.find(item => item.id === rootId);
  assert.equal(historical.discussionId, oldDiscussion); assert.equal(historical.originSourceId, undefined);
  assert.deepEqual(current.sources.find(source => source.id === b.sourceId).topicIds, [b.topicId]);
  const fresh = f.ingest('new-old-direction', -.4);
  assert.ok(!originalReferences.includes(fresh.topicId), 'disabled old centers are not searched');
  current = f.repository.load(); for (const id of originalReferences) assert.equal(current.topics.find(topic => topic.id === id).reference, null);
  const counts = current.topics.length;
  f.service.command(f.service.version(), { type: 'delete-learned-topic', topicId: fresh.topicId, confirmation: 'DELETE TOPIC AND DISCUSSION' }, 'demo-alex');
  assert.equal(f.repository.load().topics.length, counts - 1);
  assert.ok(f.repository.load().sources.every(source => !source.topicIds?.includes(fresh.topicId)));
});

test('Trust: a canonical mutation between membership-Topic reads rejects the mixed union and leaks no reference coordinates', t => {
  const f = setup(t), a = f.ingest('a', -.4); f.ingest('b', .4); const c = f.ingest('c', 0);
  let reads = 0, armed = false;
  const wrapped = { ...f.repository, readTopicState(id) {
    if (armed && ++reads === 2) f.root(a, 'Accepted while combined read runs');
    return f.repository.readTopicState(id);
  } };
  const racing = f.compose(wrapped); armed = true;
  assert.throws(() => racing.alternateDiscussion(c.sourceId), { code: 'conflict' });
  assert.equal(f.repository.load().contributions.length, 1);
  const bundle = f.service.enrichment({ sourceId: c.sourceId, topicId: c.topicId, includeAlternate: true });
  assert.equal(bundle.errors.alternate, null); assert.equal(bundle.alternateDiscussion.version.revision, bundle.catalog.version.revision);
  const publicJson = JSON.stringify([bundle, f.service.catalog(), f.service.discussion(c.topicId)]);
  for (const field of ['"reference"', 'parameterSha256', '"values"', 'operationDigest']) assert.equal(publicJson.includes(field), false);
});

test('Trust: old v2 ingestion does not acquire reference memberships or invoke the new matcher', t => {
  const f = setup(t, { legacy: true });
  const legacy = f.compose(f.repository, { plan() { assert.fail('legacy ingestion must not run reference matching'); } });
  const result = legacy.ingest(f.request('legacy', 0));
  assert.equal(result.policyVersion, 'adaptive-supported-partitions/v1'); assert.equal(result.topicIds, undefined);
  assert.equal(f.repository.load().schema, 'demo-state/v2');
  assert.ok(f.repository.load().sources.every(source => source.topicIds === undefined));
  assert.ok(f.repository.load().topics.every(topic => topic.reference === undefined));
});

test('Trust: deleting a secondary Topic removes only that membership from surviving primary pages', t => {
  const f = setup(t), a = f.ingest('a', -.4), b = f.ingest('b', .4), c = f.ingest('c', 0);
  const secondary = c.topicIds.find(id => id !== c.topicId), primaryOwner = a.topicId === c.topicId ? a : b;
  const keptRoot = f.root(primaryOwner, 'Primary conversation survives');
  f.service.command(f.service.version(), { type: 'delete-learned-topic', topicId: secondary,
    confirmation: 'DELETE TOPIC AND DISCUSSION' }, 'demo-alex');
  const after = f.repository.load(), surviving = after.sources.find(source => source.id === c.sourceId);
  assert.ok(surviving); assert.deepEqual(surviving.topicIds, [c.topicId]);
  assert.equal(after.sourceLinks.find(link => link.sourceId === c.sourceId).topicId, c.topicId);
  assert.ok(after.contributions.some(item => item.id === keptRoot));
  assert.ok(after.topics.every(topic => topic.id !== secondary));
});

test('Trust: an unqualified page never becomes a radius witness or joins from matching raw coordinates', t => {
  const f = setup(t), a = f.ingest('a', 0);
  const negative = f.service.ingest({ ...f.request('negative', 0), title: 'Search results', url: 'https://example.org/search?q=synthetic' });
  assert.notEqual(negative.topicId, a.topicId);
  assert.equal(f.repository.load().topics.find(topic => topic.id === negative.topicId).reference, null);
  const positive = f.ingest('positive', 0);
  assert.deepEqual(positive.topicIds, [a.topicId]);
  assert.equal(f.repository.load().topics.length, 2);
});
