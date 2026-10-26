import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { createCanonicalV4ReadFacade } from '../canonical-v4/read-facade.js';
import { seedCanonicalV4RuntimeFixture, RUNTIME_FIXTURE_STAMP } from './canonical-v4-runtime-fixture.js';
import { BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';

const code = wanted => error => error?.code === wanted;

async function setup(t, { trace = [] } = {}) {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  const instrument = tx => ({ ...tx, query(sql, parameters) {
    trace.push({ sql, parameters });
    return tx.query(sql, parameters);
  } });
  const reads = createCanonicalV4ReadFacade({ database: {
    ...database, transaction: work => database.transaction(tx => work(instrument(tx))),
  } });
  return { database, fixture, reads, trace };
}

async function post(database, fixture, id, { rootId = fixture.historicalRoot,
  replyToId = rootId, actorType = 'human', visibility = 'local-public',
  body = 'Visible synthetic reply', ordinal = 1, createdAt = RUNTIME_FIXTURE_STAMP } = {}) {
  const value = { id, discussionId: fixture.discussionA, rootId, replyToId,
    authorId: fixture.actorId, actorType, visibility, withdrawn: false,
    createdAt,
    ...(rootId === null ? { anchor: { kind: 'topic', topicId: fixture.topicA },
      originalTopicId: fixture.topicA, learnedOrigin: false } : {}) };
  await database.transaction(async tx => {
    await tx.query(`INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'contributions')`, [id]);
    await tx.query(`INSERT INTO canonical_v4.contributions
      (id,discussion_id,root_id,reply_to_id,author_id,actor_type,visibility,withdrawn,
       created_at,revision_count,ordinal,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,1,$9,$10)`,
    [id, value.discussionId, rootId, replyToId, value.authorId, actorType, visibility,
      value.createdAt, ordinal, JSON.stringify(value)]);
    await tx.query(`INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload) VALUES($1,0,$2)`,
      [id, JSON.stringify({ body, createdAt: value.createdAt })]);
  });
}

test('Topic space reads select existing public roots, separate counts, and expose bounded fresh cards', async t => {
  const { database, fixture, reads, trace } = await setup(t);
  await post(database, fixture, 'space-human');
  await post(database, fixture, 'space-agent', { actorType: 'agent', ordinal: 2 });
  await post(database, fixture, 'space-private', { rootId: null, visibility: 'private', ordinal: 3,
    body: 'PRIVATE MUST NEVER LEAVE THIS FIXTURE' });
  const stamp = await reads.topicSpaceStamp(), inputs = await reads.topicSpaceInputs();
  assert.equal(stamp.rootCount, 1);
  assert.equal(stamp.fingerprint, inputs.fingerprint);
  assert.deepEqual(stamp.version, inputs.version);
  assert.deepEqual(inputs.entries.map(({ rootId, humanCount, aiCount, vector }) =>
    ({ rootId, humanCount, aiCount, vector })),
  [{ rootId: fixture.historicalRoot, humanCount: 2, aiCount: 1, vector: null }]);
  assert.equal(inputs.entries[0].sourceId, fixture.historicalSource);
  assert.equal(inputs.entries[0].topicId, fixture.topicA); // Historical origin never reroutes.
  const cards = await reads.topicSpaceCards([fixture.historicalRoot, 'missing-root']);
  assert.equal(cards.cards.length, 1);
  assert.equal(cards.cards[0].snippet, 'Historical root');
  assert.equal('vector' in cards.cards[0], false);
  assert.equal('ordinal' in cards.cards[0], false);
  assert.equal(JSON.stringify({ stamp, inputs, cards }).includes('PRIVATE MUST'), false);
  assert.equal(trace.some(({ sql }) => /account|private_chat/iu.test(sql)), false);
  const vectorQueries = trace.filter(({ sql }) => /FROM canonical_v4.embeddings/u.test(sql));
  assert.ok(vectorQueries.every(({ sql }) => /WHERE .*source_id/u.test(sql)));
  assert.ok(trace.every(({ sql }) => !/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/u.test(sql)));
  await assert.rejects(reads.topicSpaceCards(Array(61).fill(fixture.historicalRoot)), code('invalid'));
  await assert.rejects(reads.topicSpaceCards([fixture.historicalRoot, fixture.historicalRoot]), code('invalid'));
  await database.query(`UPDATE canonical_v4.revisions
    SET payload=jsonb_set(payload::jsonb,'{body}',to_jsonb(repeat('z',500)))::text
    WHERE contribution_id=$1`, [fixture.historicalRoot]);
  assert.equal((await reads.topicSpaceCards([fixture.historicalRoot])).cards[0].snippet.length, 240);
});

test('Topic space fingerprint ignores crawler revision but catches exact edits and child withdrawals', async t => {
  const { database, fixture, reads } = await setup(t);
  const initial = await reads.topicSpaceStamp();
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1');
  await database.query(`UPDATE canonical_v4.sources SET write_version=write_version+1 WHERE id=$1`, [fixture.sourceB]);
  const crawler = await reads.topicSpaceStamp();
  assert.equal(crawler.fingerprint, initial.fingerprint);
  assert.ok(crawler.version.revision > initial.version.revision);
  await post(database, fixture, 'space-fingerprint-child');
  const reply = await reads.topicSpaceStamp();
  assert.notEqual(reply.fingerprint, crawler.fingerprint);
  await database.query(`UPDATE canonical_v4.revisions
    SET payload=jsonb_set(payload::jsonb,'{body}',to_jsonb('Edited exact body'::text))::text
    WHERE contribution_id=$1`, [fixture.historicalRoot]);
  const edited = await reads.topicSpaceStamp();
  assert.notEqual(edited.fingerprint, reply.fingerprint);
  assert.equal((await reads.topicSpaceCards([fixture.historicalRoot])).cards[0].snippet, 'Edited exact body');
  await database.query(`UPDATE canonical_v4.sources SET write_version=write_version+1 WHERE id=$1`, [fixture.historicalSource]);
  const source = await reads.topicSpaceStamp();
  assert.notEqual(source.fingerprint, edited.fingerprint);
  await database.query(`UPDATE canonical_v4.topics SET write_version=write_version+1 WHERE id=$1`, [fixture.topicA]);
  const topic = await reads.topicSpaceStamp();
  assert.notEqual(topic.fingerprint, source.fingerprint);
  await database.query(`UPDATE canonical_v4.discussions SET write_version=write_version+1 WHERE id=$1`, [fixture.discussionA]);
  const discussion = await reads.topicSpaceStamp();
  assert.notEqual(discussion.fingerprint, topic.fingerprint);
  await database.transaction(async tx => {
    await tx.query(`UPDATE canonical_v4.contributions SET withdrawn=true,author_id=NULL,revision_count=0,
      payload=(payload::jsonb || '{"withdrawn":true,"authorId":null}'::jsonb)::text
      WHERE id='space-fingerprint-child'`);
    await tx.query(`DELETE FROM canonical_v4.revisions WHERE contribution_id='space-fingerprint-child'`);
  });
  const withdrawn = await reads.topicSpaceStamp();
  assert.notEqual(withdrawn.fingerprint, discussion.fingerprint);
  assert.equal((await reads.topicSpaceInputs()).entries[0].humanCount, 1);
});

test('Topic space derives ISO timestamps from legitimate date-only and offset records without rewriting them', async t => {
  const { database, fixture, reads } = await setup(t);
  await database.query(`UPDATE canonical_v4.contributions SET created_at='2026-10-15',
    payload=jsonb_set(payload::jsonb,'{createdAt}',to_jsonb('2026-10-15'::text))::text WHERE id=$1`,
  [fixture.historicalRoot]);
  await database.query(`UPDATE canonical_v4.revisions
    SET payload=jsonb_set(payload::jsonb,'{createdAt}',to_jsonb('2026-10-15'::text))::text WHERE contribution_id=$1`,
  [fixture.historicalRoot]);
  const before = await reads.topicSpaceStamp();
  assert.equal((await reads.topicSpaceInputs()).entries[0].updatedAt, '2026-10-15T00:00:00.000Z');
  assert.equal((await reads.topicSpaceCards([fixture.historicalRoot])).cards[0].updatedAt, '2026-10-15T00:00:00.000Z');
  assert.equal((await reads.topicSpaceStamp()).fingerprint, before.fingerprint);
  const stored = (await database.query(`SELECT created_at,payload FROM canonical_v4.contributions WHERE id=$1`,
    [fixture.historicalRoot])).rows[0];
  assert.equal(stored.created_at, '2026-10-15');
  assert.equal(JSON.parse(stored.payload).createdAt, '2026-10-15');
  await post(database, fixture, 'space-offset-reply', { createdAt: '2026-10-14T23:30:00-02:00' });
  assert.equal((await reads.topicSpaceInputs()).entries[0].updatedAt, '2026-10-15T01:30:00.000Z');
  assert.equal((await reads.topicSpaceCards([fixture.historicalRoot])).cards[0].updatedAt, '2026-10-15T01:30:00.000Z');
  await database.query(`UPDATE canonical_v4.revisions
    SET payload=jsonb_set(payload::jsonb,'{createdAt}',to_jsonb('not-a-date'::text))::text WHERE contribution_id=$1`,
  [fixture.historicalRoot]);
  await assert.rejects(reads.topicSpaceInputs(), code('storage-corrupt'));
  await assert.rejects(reads.topicSpaceCards([fixture.historicalRoot]), code('storage-corrupt'));
});

test('Topic space validates exact normalized embedding mirrors, returns only E5 384 normalized vectors', async t => {
  const { database, fixture, reads } = await setup(t);
  const values = [3, 4, ...Array(382).fill(0)];
  await database.query('UPDATE canonical_v4.sources SET has_embedding=true WHERE id=$1', [fixture.historicalSource]);
  await database.query(`INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double)
    VALUES($1,$2,$3,384,$4)`,
  [fixture.historicalSource, JSON.stringify({ modelId: BROWSER_MODEL_ID, values }), BROWSER_MODEL_ID, values]);
  const source = await reads.topicSpaceSource(fixture.historicalSource);
  assert.equal(source.vector.length, 384);
  assert.equal(source.vector[0], 0.6);
  assert.equal(source.vector[1], 0.8);
  assert.match(source.stamp, /^[a-f0-9]{64}$/u);
  assert.deepEqual((await reads.topicSpaceInputs()).entries[0].vector, source.vector);
  const before = await reads.topicSpaceStamp();
  await database.query(`UPDATE canonical_v4.embeddings SET values_double[1]=9 WHERE source_id=$1`, [fixture.historicalSource]);
  assert.notEqual((await reads.topicSpaceStamp()).fingerprint, before.fingerprint);
  await assert.rejects(reads.topicSpaceInputs(), code('storage-corrupt'));
  await assert.rejects(reads.topicSpaceCards([fixture.historicalRoot]), code('storage-corrupt'));
  await assert.rejects(reads.topicSpaceSource(fixture.historicalSource), code('storage-corrupt'));
  await assert.rejects(reads.topicSpaceSource('missing-source'), code('not-found'));
});

test('Topic space rejects corrupt public mirrors and excludes withdrawn roots even with surviving replies', async t => {
  const { database, fixture, reads } = await setup(t);
  await database.query(`UPDATE canonical_v4.contributions SET actor_type='agent' WHERE id=$1`, [fixture.historicalRoot]);
  await assert.rejects(reads.topicSpaceInputs(), code('storage-corrupt'));
  await database.query(`UPDATE canonical_v4.contributions SET actor_type='human' WHERE id=$1`, [fixture.historicalRoot]);
  await post(database, fixture, 'space-surviving-child');
  const before = await reads.topicSpaceStamp();
  await database.transaction(async tx => {
    await tx.query(`UPDATE canonical_v4.contributions SET withdrawn=true,author_id=NULL,revision_count=0,
      payload=(payload::jsonb || '{"withdrawn":true,"authorId":null}'::jsonb)::text WHERE id=$1`, [fixture.historicalRoot]);
    await tx.query('DELETE FROM canonical_v4.revisions WHERE contribution_id=$1', [fixture.historicalRoot]);
  });
  const stamp = await reads.topicSpaceStamp();
  assert.notEqual(stamp.fingerprint, before.fingerprint);
  assert.equal(stamp.rootCount, 0);
  assert.deepEqual((await reads.topicSpaceInputs()).entries, []);
  assert.deepEqual((await reads.topicSpaceCards([fixture.historicalRoot])).cards, []);
});

test('Topic space enforces 4096 root capacity without scanning Source catalog or vectors', async t => {
  const { database, fixture, reads, trace } = await setup(t);
  await database.transaction(async tx => {
    await tx.query(`INSERT INTO canonical_v4.id_registry(id,kind)
      SELECT 'space-capacity-' || n,'contributions' FROM generate_series(1,4096) AS n`);
    await tx.query(`INSERT INTO canonical_v4.contributions
      (id,discussion_id,root_id,reply_to_id,author_id,actor_type,visibility,withdrawn,
       created_at,revision_count,ordinal,payload)
      SELECT 'space-capacity-' || n,$1,NULL,NULL,$2,'human','local-public',false,$3,0,n,'{}'
      FROM generate_series(1,4096) AS n`, [fixture.discussionA, fixture.actorId, RUNTIME_FIXTURE_STAMP]);
  });
  await assert.rejects(reads.topicSpaceStamp(), code('capacity'));
  await assert.rejects(reads.topicSpaceInputs(), code('capacity'));
  assert.equal(trace.some(({ sql }) => /canonical_v4\.(sources|embeddings)/u.test(sql)), false);
  await database.query(`DELETE FROM canonical_v4.contributions WHERE id='space-capacity-4096'`);
  assert.equal((await reads.topicSpaceStamp()).rootCount, 4096);
});

test('Topic space preserves every selected Source, membership, receipt, Topic and discussion mirror guard', async t => {
  const { database, fixture, reads } = await setup(t);
  const corruptions = [
    [`UPDATE canonical_v4.sources SET title='Forged typed title' WHERE id=$1`,
      `UPDATE canonical_v4.sources SET title=payload::jsonb->>'title' WHERE id=$1`, fixture.historicalSource],
    [`UPDATE canonical_v4.source_links SET method='forged' WHERE source_id=$1`,
      `UPDATE canonical_v4.source_links SET method=payload::jsonb->>'method' WHERE source_id=$1`, fixture.historicalSource],
    [`INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest)
        VALUES($1,'forged-operation','${'0'.repeat(64)}')`,
      `DELETE FROM canonical_v4.operation_receipts WHERE source_id=$1`, fixture.historicalSource],
    [`UPDATE canonical_v4.topics SET title='Forged Topic' WHERE id=$1`,
      `UPDATE canonical_v4.topics SET title=payload::jsonb->>'title' WHERE id=$1`, fixture.topicA],
    [`UPDATE canonical_v4.discussions SET payload=jsonb_set(payload::jsonb,'{topicId}',
        to_jsonb('${fixture.topicB}'::text))::text WHERE id=$1`,
      `UPDATE canonical_v4.discussions SET payload=jsonb_set(payload::jsonb,'{topicId}',to_jsonb(topic_id))::text
        WHERE id=$1`, fixture.discussionA],
    [`INSERT INTO canonical_v4.fixed_references(topic_id,payload) VALUES($1,'null')`,
      `DELETE FROM canonical_v4.fixed_references WHERE topic_id=$1`, fixture.topicA],
    [`UPDATE canonical_v4.topic_memberships SET ordinal=1 WHERE source_id=$1`,
      `UPDATE canonical_v4.topic_memberships SET ordinal=0 WHERE source_id=$1`, fixture.historicalSource],
  ];
  for (const [damage, restore, id] of corruptions) {
    await database.query(damage, [id]);
    await assert.rejects(reads.topicSpaceInputs(), code('storage-corrupt'), damage);
    await assert.rejects(reads.topicSpaceCards([fixture.historicalRoot]), code('storage-corrupt'), damage);
    await database.query(restore, [id]);
  }
  assert.equal((await reads.topicSpaceInputs()).entries.length, 1);
});

test('every Topic space composite pins native PostgreSQL repeatable-read readonly before data', async t => {
  const { database, fixture } = await setup(t);
  const transactions = [];
  const reads = createCanonicalV4ReadFacade({ database: { ...database,
    transaction: work => database.transaction(tx => {
      const queries = []; transactions.push(queries);
      return work({ dialect: 'pg', query(sql, parameters) {
        queries.push(sql);
        return sql.startsWith('SET TRANSACTION') ? { rows: [] } : tx.query(sql, parameters);
      } });
    }),
  } });
  await reads.topicSpaceStamp();
  await reads.topicSpaceInputs();
  await reads.topicSpaceCards([fixture.historicalRoot]);
  await reads.topicSpaceSource(fixture.historicalSource);
  assert.equal(transactions.length, 4);
  for (const statements of transactions) {
    assert.equal(statements[0], 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.ok(statements[1].includes('canonical_v4.meta'));
  }
});
