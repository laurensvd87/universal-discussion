import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, rootCommand } from './helpers.js';
import { fixtureVector } from '../src/fixture.js';

test('synthetic authentication hashes credentials and public DTOs exclude authority', async (t) => {
  const context = await setup(t); const { repository, database, tokens, ids } = context;
  assert.equal(await repository.authenticate('short'), null);
  assert.equal(await repository.authenticate('x'.repeat(43)), null);
  const stored = (await database.query('SELECT * FROM principals')).rows;
  assert.ok(stored.every((p) => p.token_hash.length === 64));
  assert.ok(!JSON.stringify(stored).includes(tokens.alex));
  const first = await repository.listTopics({ limit: 1 });
  assert.equal(first.items.length, 1); assert.ok(first.nextCursor);
  const second = await repository.listTopics({ cursor: first.nextCursor, limit: 1 });
  assert.equal(second.nextCursor, null); assert.notEqual(first.items[0].id, second.items[0].id);
  const sources = await repository.listSources({ topicId: ids.topic });
  assert.deepEqual(Object.keys(sources.items[0]).sort(), ['discussionId','id','title','topicId','url']);
  assert.equal((await repository.resolveSource({ url: 'https://transport.example/article' })).id, ids.source);
  await assert.rejects(repository.resolveSource({ url: 'https://real-domain.org/article' }), { code: 'invalid' });
  await assert.rejects(repository.listTopics({ limit: 101 }), { code: 'invalid' });
  await repository.command(rootCommand(context));
  const discussion = await repository.readDiscussion({ discussionId: ids.discussion });
  assert.deepEqual(discussion.items[0].author, { username: 'Alex', kind: 'human' });
  assert.ok(!JSON.stringify(discussion).includes('author_id'));
});

test('atomic receipts replay exact responses, reject collisions and rollback failed commands', async (t) => {
  const c = await setup(t); const command = rootCommand(c);
  const response = await c.repository.command(command);
  assert.deepEqual(await c.repository.command(command), response);
  await assert.rejects(c.repository.command({ ...command, payload: { ...command.payload, body: 'Changed' } }), { code: 'conflict' });
  assert.equal((await c.database.query('SELECT * FROM contributions')).rows.length, 1);
  assert.equal((await c.database.query('SELECT * FROM jobs')).rows.length, 1);
  await assert.rejects(c.repository.command({ ...command, requestId: 'bad-version' }), { code: 'conflict' });
  await assert.rejects(c.repository.command({ ...command, requestId: 'actor-spoof', payload: { ...command.payload, authorId: c.ids.blair } }), { code: 'invalid' });
  const rows = (await c.database.query('SELECT * FROM command_receipts')).rows;
  assert.equal(rows.length, 1);
});

test('discussion versions are independent and cross-author/source/parent writes fail closed', async (t) => {
  const c = await setup(t);
  const [a, b] = await Promise.all([
    c.repository.command(rootCommand(c)),
    c.repository.command(rootCommand(c, { principal: c.blair, requestId: 'request-b', payload: { discussionId: c.ids.otherDiscussion, sourceId: c.ids.relatedSource, body: 'Other root', expectedVersion: 0 } })),
  ]);
  assert.equal(a.version, 1); assert.equal(b.version, 1);
  await assert.rejects(c.repository.command({ principal: c.blair, requestId: 'edit-other', kind: 'edit', payload: { discussionId: c.ids.discussion, contributionId: a.contributionId, body: 'Forbidden', expectedVersion: 1 } }), { code: 'forbidden' });
  await assert.rejects(c.repository.command({ principal: c.alex, requestId: 'cross-parent', kind: 'reply', payload: { discussionId: c.ids.discussion, sourceId: c.ids.source, replyToId: b.contributionId, body: 'Forbidden', expectedVersion: 1 } }), { code: 'forbidden' });
  await assert.rejects(c.repository.command(rootCommand(c, { requestId: 'cross-source', payload: { discussionId: c.ids.discussion, sourceId: c.ids.relatedSource, body: 'Forbidden', expectedVersion: 1 } })), { code: 'forbidden' });
  const results = await Promise.allSettled([1,2].map((n) => c.repository.command(rootCommand(c, { requestId: `race-${n}`, payload: { ...rootCommand(c).payload, expectedVersion: 1 } }))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'conflict');
});

test('withdrawal erases all revisions but preserves ancestors of live replies and immutable origins', async (t) => {
  const c = await setup(t); const root = await c.repository.command(rootCommand(c));
  const reply = await c.repository.command({ principal: c.blair, requestId: 'reply', kind: 'reply', payload: { discussionId: c.ids.discussion, sourceId: c.ids.source, replyToId: root.contributionId, body: 'Live child', expectedVersion: 1 } });
  await c.repository.command({ principal: c.alex, requestId: 'edit', kind: 'edit', payload: { discussionId: c.ids.discussion, contributionId: root.contributionId, body: 'Edited root', expectedVersion: 2 } });
  await c.repository.command({ principal: c.alex, requestId: 'withdraw', kind: 'withdraw', payload: { discussionId: c.ids.discussion, contributionId: root.contributionId, expectedVersion: 3 } });
  assert.equal((await c.database.query('SELECT * FROM contribution_revisions WHERE contribution_id=$1', [root.contributionId])).rows.length, 0);
  const read = await c.repository.readDiscussion({ discussionId: c.ids.discussion });
  assert.equal(read.items.length, 2); assert.equal(read.items.find((r) => r.id === root.contributionId).body, null);
  assert.ok(read.items.every((r) => r.sourceId === c.ids.source));
  await c.repository.command({ principal: c.blair, requestId: 'withdraw-child', kind: 'withdraw', payload: { discussionId: c.ids.discussion, contributionId: reply.contributionId, expectedVersion: 4 } });
  assert.equal((await c.repository.readDiscussion({ discussionId: c.ids.discussion })).items.length, 0);
});

test('lease expiration, unique tokens, stale workers and bounded attempts are fenced', async (t) => {
  let time = Date.parse('2026-10-11T12:00:00Z');
  const c = await setup(t, { now: () => new Date(time) }); await c.repository.command(rootCommand(c));
  const first = await c.repository.claimJob({ workerId: 'worker-a', leaseSeconds: 1 });
  assert.equal(await c.repository.claimJob({ workerId: 'worker-b' }), null);
  assert.equal(await c.repository.completeJob({ jobId: first.id, workerId: 'worker-b', leaseToken: first.leaseToken }), false);
  time += 1000;
  assert.equal(await c.repository.completeJob({ jobId: first.id, workerId: first.workerId, leaseToken: first.leaseToken }), false);
  const second = await c.repository.claimJob({ workerId: 'worker-b', leaseSeconds: 1 });
  assert.notEqual(first.leaseToken, second.leaseToken);
  assert.equal(await c.repository.failJob({ jobId: first.id, workerId: first.workerId, leaseToken: first.leaseToken }), false);
  assert.equal(await c.repository.failJob({ jobId: second.id, workerId: second.workerId, leaseToken: second.leaseToken }), true);
  const third = await c.repository.claimJob({ workerId: 'worker-c', leaseSeconds: 1 }); assert.equal(third.attempts, 3);
  time += 1000;
  assert.equal(await c.repository.claimJob({ workerId: 'worker-d' }), null);
  assert.equal((await c.database.query('SELECT state FROM jobs')).rows[0].state, 'failed');
});

test('synthetic seeding validates URLs/vectors and atomicity', async (t) => {
  const c = await setup(t);
  const source = { id: 'source-invalid', url: 'https://safe.example/article', title: 'Fixture', topicId: c.ids.topic, discussionId: c.ids.discussion, vector: fixtureVector(), model: 'model', extractor: 'extractor', public: true };
  for (const patch of [{ vector: [1] }, { vector: Array(384).fill(0) }, { vector: Array(384).fill(1e-300) }, { vector: [NaN,...Array(383).fill(0)] }, { url: 'https://safe.example/article?secret=a' }, { url: 'https://user:password@safe.example/article' }, { url: 'https://localhost/article' }]) {
    await assert.rejects(c.repository.seedSynthetic({ sources: [{ ...source, ...patch }] }), { code: 'invalid' });
  }
  assert.equal((await c.database.query('SELECT count(*)::integer AS n FROM sources')).rows[0].n, 3);
});

test('same canonical Topic reply records its own Source without changing root origin', async (t) => {
  const c = await setup(t); const root = await c.repository.command(rootCommand(c));
  const reply = await c.repository.command({ principal: c.blair, requestId: 'other-source-reply', kind: 'reply', payload: { discussionId: c.ids.discussion, sourceId: c.ids.sameTopicSource, replyToId: root.contributionId, body: 'Published from another same Topic Source', expectedVersion: 1 } });
  const rows = (await c.repository.readDiscussion({ discussionId: c.ids.discussion })).items;
  assert.equal(rows.find((r) => r.id === root.contributionId).sourceId, c.ids.source);
  assert.equal(rows.find((r) => r.id === reply.contributionId).sourceId, c.ids.sameTopicSource);
  assert.equal(reply.rootId, root.contributionId);
  await assert.rejects(c.database.query('UPDATE contributions SET source_id=$2 WHERE id=$1', [reply.contributionId, c.ids.relatedSource]), { code: '23514' });
  await assert.rejects(c.database.query('UPDATE contributions SET source_id=$2 WHERE id=$1', [reply.contributionId, c.ids.source]), { code: '23514' });
});

test('only explicit public topics/discussions/sources project and contribution pages stay bounded', async (t) => {
  const c = await setup(t);
  await c.repository.seedSynthetic({
    topics: [{ id: 'private-topic', title: 'Private fixture', public: false }],
    discussions: [{ id: 'private-discussion', topicId: 'private-topic', public: false }],
    sources: [{ id: 'private-topic-source', title: 'Private fixture', url: 'https://private.example/article', topicId: 'private-topic', discussionId: 'private-discussion', vector: fixtureVector(), model: 'synthetic-e5-384-v1', extractor: 'synthetic-v1', public: true }],
  });
  assert.equal((await c.repository.listTopics()).items.length, 2);
  assert.equal((await c.repository.listSources({ topicId: 'private-topic' })).items.length, 0);
  assert.equal(await c.repository.resolveSource({ url: 'https://private.example/article' }), null);
  await assert.rejects(c.repository.readDiscussion({ discussionId: 'private-discussion' }), { code: 'not-found' });
  assert.equal((await c.repository.findRelated({ sourceId: 'private-topic-source' })).items.length, 0);
  await c.repository.command(rootCommand(c));
  await c.repository.command(rootCommand(c, { requestId: 'second-root', payload: { ...rootCommand(c).payload, expectedVersion: 1 } }));
  const first = await c.repository.readDiscussion({ discussionId: c.ids.discussion, limit: 1 });
  const second = await c.repository.readDiscussion({ discussionId: c.ids.discussion, cursor: first.nextCursor, limit: 1 });
  assert.equal(first.items.length, 1); assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
  assert.notEqual(first.items[0].id, second.items[0].id);
  const job = await c.repository.claimJob({ workerId: 'worker' });
  assert.equal(await c.repository.completeJob({ jobId: job.id, workerId: job.workerId, leaseToken: job.leaseToken }), true);
  assert.equal(await c.repository.completeJob({ jobId: job.id, workerId: job.workerId, leaseToken: job.leaseToken }), false);
});
