import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { reconstructCanonicalV4 } from '../canonical-v4/index.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import {
  runtimeRequest,
  seedCanonicalV4RuntimeFixture,
} from './canonical-v4-runtime-fixture.js';

async function context(t, prefix, options = {}) {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  let serial = 0;
  const repository = createCanonicalV4RuntimeRepository({
    database,
    nextId: () => `contribution-${prefix}-${++serial}`,
    now: () => '2026-10-13T15:01:00.000Z',
    ...options,
  });
  return { database, fixture, repository };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

function root(fixture, topic, body, originSourceId = null) {
  return { type: 'create-root', topicId: topic, body, originSourceId };
}

function reply(fixture, { discussionId = fixture.discussionA, rootId = fixture.historicalRoot,
  replyToId = null, body = 'Runtime reply', originSourceId = null } = {}) {
  return { type: 'reply', discussionId, rootId, replyToId, body, originSourceId };
}

test('canonical v4 runtime replays an exact durable result and rejects request-ID collisions', async (t) => {
  const { database, fixture, repository } = await context(t, 'replay');
  const request = runtimeRequest(fixture, 'request-replay',
    root(fixture, fixture.topicA, 'First root', fixture.sourceA));
  const [first, racingReplay] = await Promise.all([repository.command(request), repository.command(request)]);
  assert.deepEqual(racingReplay, first);
  await repository.command(runtimeRequest(fixture, 'request-unrelated',
    root(fixture, fixture.topicB, 'Unrelated root', fixture.sourceB)));
  const current = await repository.version();
  const replayed = await repository.command({ ...request, expected: current });
  assert.deepEqual(replayed, first);
  assert.equal(Object.isFrozen(replayed), true);
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.command_receipts')).rows[0].count), 2);
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.contributions')).rows[0].count), 3);

  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-replay',
    root(fixture, fixture.topicA, 'Different body', fixture.sourceA), current.revision)), 'conflict');
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.contributions')).rows[0].count), 3);
});

test('runtime writes leave immutable import receipts intact and disable baseline reconstruction', async (t) => {
  const { database, fixture, repository } = await context(t, 'immutable');
  const before = (await database.query(`SELECT revision,logical_sha256 FROM canonical_v4.meta
    WHERE singleton=true`)).rows[0];
  await repository.command(runtimeRequest(fixture, 'request-runtime-current',
    root(fixture, fixture.topicA, 'Runtime state differs from import baseline')));
  await assert.rejects(reconstructCanonicalV4(database), /import baseline is no longer the current runtime state/u);
  assert.deepEqual((await database.query(`SELECT revision,logical_sha256 FROM canonical_v4.meta
    WHERE singleton=true`)).rows[0], before);
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.import_ledger')).rows[0].count), 1);
  assert.equal((await repository.health()).schemaVersion, 9);
  await database.query("UPDATE canonical_v4.schema_migrations SET hash='tampered' WHERE version=2");
  await rejectsCode(repository.health(), 'unavailable');
});

test('canonical v4 runtime rolls back receipt, identity and append after a late fault', async (t) => {
  const heldRequest = 'request-rollback';
  const { database, fixture, repository } = await context(t, 'rollback', {
    beforeWatermark({ requestId }) {
      if (requestId === heldRequest) throw new Error('synthetic late runtime fault');
    },
  });
  const request = runtimeRequest(fixture, heldRequest, root(fixture, fixture.topicA, 'Rollback me'));
  await rejectsCode(repository.command(request), 'storage-failure');
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.contributions')).rows[0].count), 1);
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.command_receipts
    WHERE request_id=$1`, [heldRequest])).rows[0].count), 0);
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.id_registry
    WHERE id='contribution-rollback-1'`)).rows[0].count), 0);
  assert.equal(await repository.discussionVersion(fixture.discussionA), 0);
  assert.deepEqual(await repository.version(), { generation: fixture.generation, revision: fixture.revision });

  const retry = createCanonicalV4RuntimeRepository({
    database,
    nextId: () => 'contribution-rollback-retry',
    now: () => '2026-10-13T15:02:00.000Z',
  });
  const accepted = await retry.command(request);
  assert.equal(accepted.result.contributionId, 'contribution-rollback-retry');
  assert.equal(await retry.discussionVersion(fixture.discussionA), 1);
});

test('canonical v4 runtime accepts unrelated writes from the same observed global revision', async (t) => {
  const { fixture, repository } = await context(t, 'unrelated');
  const [a, b] = await Promise.all([
    repository.command(runtimeRequest(fixture, 'request-unrelated-a',
      root(fixture, fixture.topicA, 'Topic A append'))),
    repository.command(runtimeRequest(fixture, 'request-unrelated-b',
      root(fixture, fixture.topicB, 'Topic B append'))),
  ]);
  assert.deepEqual(new Set([a.version.revision, b.version.revision]),
    new Set([fixture.revision + 1, fixture.revision + 2]));
  assert.equal(await repository.discussionVersion(fixture.discussionA), 1);
  assert.equal(await repository.discussionVersion(fixture.discussionB), 1);
  assert.deepEqual(await repository.version(), { generation: fixture.generation, revision: fixture.revision + 2 });
});

test('canonical v4 runtime serializes but does not reject two same-discussion appends', async (t) => {
  const { database, fixture, repository } = await context(t, 'same');
  const results = await Promise.all([
    repository.command(runtimeRequest(fixture, 'request-same-a',
      root(fixture, fixture.topicA, 'Same discussion A'))),
    repository.command(runtimeRequest(fixture, 'request-same-b',
      root(fixture, fixture.topicA, 'Same discussion B'))),
  ]);
  assert.equal(new Set(results.map((result) => result.result.contributionId)).size, 2);
  assert.equal(await repository.discussionVersion(fixture.discussionA), 2);
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.contributions
    WHERE discussion_id=$1`, [fixture.discussionA])).rows[0].count), 3);
});

test('canonical v4 runtime revalidates lineage and current Source authority with the historical-root exception', async (t) => {
  const { database, fixture, repository } = await context(t, 'authority');
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.topic_memberships
    WHERE source_id=$1 AND topic_id=$2`, [fixture.historicalSource, fixture.topicA])).rows[0].count), 0);
  await database.query('DELETE FROM canonical_v4.source_links WHERE source_id=$1', [fixture.historicalSource]);
  await database.query('DELETE FROM canonical_v4.topic_memberships WHERE source_id=$1', [fixture.historicalSource]);
  const historical = await repository.command(runtimeRequest(fixture, 'request-historical-origin', reply(fixture, {
    originSourceId: fixture.historicalSource,
  })));
  assert.ok(historical.result.contributionId);

  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-no-current-authority',
    root(fixture, fixture.topicA, 'Not a historical reply', fixture.historicalSource))), 'invalid');
  await database.query(`DELETE FROM canonical_v4.topic_memberships WHERE source_id=$1 AND topic_id=$2`,
    [fixture.sourceA, fixture.topicA]);
  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-missing-membership',
    root(fixture, fixture.topicA, 'Membership is gone', fixture.sourceA))), 'invalid');
  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-cross-discussion-root', reply(fixture, {
    discussionId: fixture.discussionB,
  }))), 'invalid');

  const rootB = await repository.command(runtimeRequest(fixture, 'request-root-b',
    root(fixture, fixture.topicB, 'A root in B')));
  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-cross-root-parent', reply(fixture, {
    replyToId: rootB.result.contributionId,
  }))), 'invalid');
  await rejectsCode(repository.command({
    ...runtimeRequest(fixture, 'request-invalid-actor', reply(fixture)),
    actorId: 'caller-controlled-name',
  }), 'forbidden');
});

test('canonical v4 command boundary maps generation, destination and mirror failures precisely', async (t) => {
  const { database, fixture, repository } = await context(t, 'errors');
  await rejectsCode(repository.command({
    ...runtimeRequest(fixture, 'request-stale-generation', root(fixture, fixture.topicA, 'Stale generation')),
    expected: { generation: 'different-generation', revision: fixture.revision },
  }), 'conflict');
  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-missing-topic',
    root(fixture, 'topic-does-not-exist', 'Missing topic'))), 'not-found');

  const row = (await database.query('SELECT payload FROM canonical_v4.sources WHERE id=$1', [fixture.sourceA])).rows[0];
  const drifted = { ...JSON.parse(row.payload), title: 'Typed mirror drift' };
  await database.query('UPDATE canonical_v4.sources SET payload=$2 WHERE id=$1',
    [fixture.sourceA, JSON.stringify(drifted)]);
  await rejectsCode(repository.command(runtimeRequest(fixture, 'request-corrupt-source',
    root(fixture, fixture.topicA, 'Corrupt Source mirror', fixture.sourceA))), 'storage-corrupt');
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.command_receipts
    WHERE request_id IN ('request-stale-generation','request-missing-topic','request-corrupt-source')`)).rows[0].count), 0);
});
