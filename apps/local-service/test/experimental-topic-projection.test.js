import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepository } from '../src/adapters/memory-repository.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { projectExperimentalTopics } from '../src/domain/experimental-topic-projection.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from '../src/adapters/fixture-catalog.js';
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from '../src/domain/learned-sources.js';
import { deterministicDependencies } from './helpers.js';
import { rootAssociation } from '../src/domain/source-threads.js';

function harness() {
  const deps = deterministicDependencies();
  const initial = createDemoState({ generation: deps.nextId('generation'), createdAt: deps.now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createMemoryRepository(initial);
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...deps });
  function ingest(name, angle) {
    const values = Array(384).fill(0);
    values[0] = Math.cos(angle); values[1] = Math.sin(angle);
    return service.ingest({ expected: service.catalog().version, operationId: `op-${name}`,
      url: `https://example.com/articles/${name}`, title: `Synthetic ${name}`,
      embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION });
  }
  const command = (value) => service.command(service.catalog().version, value, 'demo-alex').result;
  return { repository, service, ingest, command };
}

test('preview, canonical post/reply, and discard leave exact canonical routing intact', () => {
  const h = harness();
  const a = h.ingest('projection-a', 0);
  const b = h.ingest('projection-b', 0.7);
  const candidate = [{ sourceIds: [a.sourceId, b.sourceId] }];
  const baseline = structuredClone(h.repository.load());
  const preview = projectExperimentalTopics(baseline, candidate, h.service.catalog().version);
  assert.deepEqual(h.repository.load(), baseline);
  assert.equal(preview.groups.length, 1);
  const rootId = h.command({ type: 'create-root', topicId: a.topicId, body: 'Synthetic root', originSourceId: a.sourceId }).contributionId;
  const canonicalDiscussionId = h.service.discussion(a.topicId).discussionId;
  const replyId = h.command({ type: 'reply', discussionId: canonicalDiscussionId, rootId,
    replyToId: rootId, body: 'Synthetic reply' }).contributionId;
  const withPosts = projectExperimentalTopics(h.repository.load(), candidate, h.service.catalog().version);
  const projected = withPosts.groups[0].roots.find((root) => root.id === rootId);
  assert.equal(projected.body, 'Synthetic root');
  assert.equal(projected.replies[0].id, replyId);
  assert.equal(projected.replies[0].body, 'Synthetic reply');
  assert.equal(projected.canonicalDiscussionId, canonicalDiscussionId);
  assert.deepEqual(withPosts.groups[0].createRootTargets.find((target) => target.sourceId === a.sourceId),
    { sourceId: a.sourceId, topicId: a.topicId, discussionId: canonicalDiscussionId });
  const beforeRejectedReply = h.repository.load();
  assert.throws(() => h.command({ type: 'reply', discussionId: canonicalDiscussionId, rootId,
    replyToId: rootId, body: 'Cross-Topic source origin', originSourceId: b.sourceId }),
  (error) => error.code === 'invalid');
  assert.deepEqual(h.repository.load(), beforeRejectedReply);
  // Discarding the projection requires no write and reveals the same posts.
  assert.equal(h.service.discussion(a.topicId).roots[0].replies[0].id, replyId);
  assert.equal(h.repository.load().sourceLinks.find((link) => link.sourceId === b.sourceId).topicId, b.topicId);
});

test('manual Source pins and unanchored/legacy roots remain in canonical Topics', () => {
  const h = harness();
  const a = h.ingest('projection-pin-a', 0);
  const b = h.ingest('projection-pin-b', 0.8);
  const unanchored = h.command({ type: 'create-root', topicId: a.topicId, body: 'Canonical root' }).contributionId;
  const anchored = h.command({ type: 'create-root', topicId: b.topicId, body: 'Pinned source root', originSourceId: b.sourceId }).contributionId;
  h.command({ type: 'correct-source', sourceId: b.sourceId, topicId: b.topicId });
  const result = projectExperimentalTopics(h.repository.load(), [{ sourceIds: [a.sourceId] }], h.service.catalog().version);
  assert.ok(result.pinnedRootIds.includes(unanchored));
  assert.ok(result.pinnedRootIds.includes(anchored));
  assert.equal(result.groups.some((group) => group.sourceIds.includes(b.sourceId)), false);
});

test('intervening ingest or forget invalidates stale candidate partition atomically', () => {
  const h = harness();
  const a = h.ingest('projection-stale-a', 0);
  const candidate = [{ sourceIds: [a.sourceId] }];
  h.ingest('projection-stale-b', 0.7);
  const before = h.repository.load();
  assert.throws(() => projectExperimentalTopics(before, candidate, h.service.catalog().version), TypeError);
  assert.deepEqual(h.repository.load(), before);
  h.command({ type: 'forget-source', sourceId: a.sourceId });
  const afterDelete = h.repository.load();
  assert.throws(() => projectExperimentalTopics(afterDelete, candidate, h.service.catalog().version), TypeError);
  assert.deepEqual(h.repository.load(), afterDelete);
});

test('exact catalog revision is required and withdrawn threads follow canonical rendering', () => {
  const h = harness();
  const a = h.ingest('projection-withdraw-a', 0);
  const candidate = [{ sourceIds: [a.sourceId] }];
  const staleVersion = h.service.catalog().version;
  const rootId = h.command({ type: 'create-root', topicId: a.topicId,
    body: 'Visible root', originSourceId: a.sourceId }).contributionId;
  const discussionId = h.service.discussion(a.topicId).discussionId;
  const replyId = h.command({ type: 'reply', discussionId, rootId, replyToId: rootId, body: 'Visible reply' }).contributionId;
  const current = h.repository.load();
  assert.throws(() => projectExperimentalTopics(current, candidate, staleVersion),
    (error) => error.code === 'conflict');
  assert.deepEqual(h.repository.load(), current);
  h.command({ type: 'withdraw', contributionId: rootId });
  let view = projectExperimentalTopics(h.repository.load(), candidate, h.service.catalog().version);
  // Withdrawal pins the root to its canonical Topic; its visible reply stays there.
  assert.deepEqual(view.groups[0].roots, []);
  assert.ok(view.pinnedRootIds.includes(rootId));
  assert.equal(h.service.discussion(a.topicId).roots.find((root) => root.id === rootId).replies[0].id, replyId);
  h.command({ type: 'withdraw', contributionId: replyId });
  view = projectExperimentalTopics(h.repository.load(), candidate, h.service.catalog().version);
  assert.deepEqual(view.groups[0].roots, []);
  assert.equal(view.pinnedRootIds.includes(rootId), false);
});

test('combined virtual discussion rejects an oversized response', () => {
  const h = harness();
  const a = h.ingest('projection-size-a', 0);
  const b = h.ingest('projection-size-b', 0.8);
  const state = structuredClone(h.repository.load());
  for (const [index, receipt] of [a, b].entries()) {
    const source = state.sources.find((entry) => entry.id === receipt.sourceId);
    const discussionId = state.discussions.find((entry) => entry.topicId === receipt.topicId).id;
    for (let count = 0; count < 75; count++) {
      state.contributions.push({ id: `sized-${index}-${count}`, discussionId, rootId: null, replyToId: null,
        authorId: 'demo-alex', actorType: 'human', visibility: 'local-public', withdrawn: false,
        createdAt: '2026-10-10T00:00:00.000Z', revisions: [{ body: 'x'.repeat(8000), createdAt: '2026-10-10T00:00:00.000Z' }],
        originSourceId: source.id, ...rootAssociation(receipt.topicId, source) });
    }
  }
  assert.throws(() => projectExperimentalTopics(state,
    [{ sourceIds: [a.sourceId, b.sourceId] }], { generation: state.generation, revision: state.revision }),
  (error) => error.code === 'capacity');
});
