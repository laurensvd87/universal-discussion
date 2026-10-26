import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPGliteDatabase } from '../src/database.js';
import { bootstrapCanonicalV4 } from '../canonical-v4/index.js';
import { createCanonicalV4LifecycleRepository } from '../canonical-v4/lifecycle-repository.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import { seedCanonicalV4RuntimeFixture } from './canonical-v4-runtime-fixture.js';

function principal(actorId, displayName = 'Lifecycle_user') {
  return Object.freeze({ id: actorId, accountId: actorId.slice('account-'.length),
    type: 'human', demo: false, displayName });
}

async function context(t, prefix) {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  let lifecycleSerial = 0, runtimeSerial = 0, minute = 1;
  const lifecycle = createCanonicalV4LifecycleRepository({
    database,
    nextId: () => `contribution-lifecycle-${prefix}-${++lifecycleSerial}`,
    now: () => `2026-10-13T15:${String(minute++).padStart(2, '0')}:00.000Z`,
  });
  const runtime = createCanonicalV4RuntimeRepository({
    database,
    nextId: () => `contribution-runtime-${prefix}-${++runtimeSerial}`,
    now: () => `2026-10-13T16:${String(minute++).padStart(2, '0')}:00.000Z`,
  });
  return { database, fixture, lifecycle, runtime, actor: principal(fixture.actorId) };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code);
}

function proof(command, actorId) {
  return {
    kind: 'generated-insight', operationId: command.operationId, actorId,
    topicId: command.topicId, originSourceId: command.originSourceId ?? null,
    body: command.body,
    rootId: command.type === 'share-insight-reply' ? command.rootId : null,
    replyToId: command.type === 'share-insight-reply' ? command.replyToId : null,
    discussionId: command.type === 'share-insight-reply' ? command.discussionId : null,
  };
}

test('lifecycle edit and withdrawal use exact receipts, ownership and tombstone semantics', async (t) => {
  const { database, fixture, lifecycle, actor } = await context(t, 'edit');
  const initial = { generation: fixture.generation, revision: fixture.revision };
  const edit = { type: 'edit', contributionId: fixture.historicalRoot, body: 'Edited current body' };
  const accepted = await lifecycle.command(initial, edit, actor);
  assert.deepEqual(accepted, { version: { generation: fixture.generation, revision: fixture.revision + 1 },
    result: { contributionId: fixture.historicalRoot } });
  assert.deepEqual(await lifecycle.command(initial, edit, actor), accepted,
    'an exact stale retry replays its durable actor/request receipt');
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.revisions
    WHERE contribution_id=$1`, [fixture.historicalRoot])).rows[0].count), 2);
  assert.equal((await database.query(`SELECT command_type FROM canonical_v4.command_receipts
    WHERE contribution_id=$1`, [fixture.historicalRoot])).rows[0].command_type, 'edit');

  await rejectsCode(lifecycle.command(accepted.version,
    { ...edit, body: 'Foreign takeover' }, { id: 'demo-blair', type: 'human', demo: true }), 'forbidden');
  const withdrawal = { type: 'withdraw', contributionId: fixture.historicalRoot };
  const removed = await lifecycle.command(accepted.version, withdrawal, actor);
  assert.equal(removed.version.revision, fixture.revision + 2);
  assert.deepEqual(await lifecycle.command(accepted.version, withdrawal, actor), removed);
  const row = (await database.query(`SELECT author_id,operator_id,origin_source_id,anchor_source_id,
    withdrawn,revision_count,payload FROM canonical_v4.contributions WHERE id=$1`,
  [fixture.historicalRoot])).rows[0];
  assert.deepEqual({ authorId: row.author_id, operatorId: row.operator_id,
    originSourceId: row.origin_source_id, anchorSourceId: row.anchor_source_id,
    withdrawn: row.withdrawn, revisionCount: Number(row.revision_count) },
  { authorId: null, operatorId: null, originSourceId: null, anchorSourceId: null,
    withdrawn: true, revisionCount: 0 });
  const payload = JSON.parse(row.payload);
  assert.equal(payload.authorId, null);
  assert.equal(payload.withdrawn, true);
  assert.equal(Object.hasOwn(payload, 'originSourceId'), false);
  assert.deepEqual(payload.anchor, { kind: 'topic', topicId: fixture.topicA });
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.revisions
    WHERE contribution_id=$1`, [fixture.historicalRoot])).rows[0].count), 0);
});

test('generated root and reply require the exact proof, destination, Source and target', async (t) => {
  const { database, fixture, lifecycle, actor } = await context(t, 'generated');
  let expected = { generation: fixture.generation, revision: fixture.revision };
  const root = { type: 'share-insight', topicId: fixture.topicA,
    originSourceId: fixture.sourceA, operationId: 'generated-root-operation',
    body: 'Exact generated opening' };
  await rejectsCode(lifecycle.command(expected, root, actor,
    { ...proof(root, actor.id), body: 'Changed generated opening' }), 'forbidden');
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.command_receipts
    WHERE command_type='share-insight'`)).rows[0].count), 0);

  const created = await lifecycle.command(expected, root, actor, proof(root, actor.id));
  assert.deepEqual(await lifecycle.command(expected, root, actor, proof(root, actor.id)), created,
    'generated publication has the same exact durable replay as every actor command');
  const generatedReceipt = (await database.query(`SELECT request_id FROM canonical_v4.command_receipts
    WHERE actor_id=$1 AND command_type='share-insight'`, [actor.id])).rows[0];
  const collisionCommand = { ...root, body: 'Different generated collision body' };
  const collisionMaterial = JSON.stringify({ generation: expected.generation,
    revision: expected.revision, command: collisionCommand });
  await assert.rejects(database.query(`SELECT canonical_v4.runtime_lifecycle_command(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
  )`, [actor.id, generatedReceipt.request_id,
    createHash('sha256').update(collisionMaterial).digest('hex'), collisionMaterial,
    expected.generation, expected.revision, collisionCommand.type,
    collisionCommand.topicId, null, null, null, collisionCommand.body,
    collisionCommand.originSourceId, collisionCommand.operationId, null,
    'contribution-generated-collision', '2026-10-13T18:00:00.000Z',
    JSON.stringify(proof(collisionCommand, actor.id))]), error => error?.code === 'P1001');
  expected = created.version;
  const rootId = created.result.contributionId;
  const rootRow = (await database.query(`SELECT author_id,operator_id,actor_type,payload
    FROM canonical_v4.contributions WHERE id=$1`, [rootId])).rows[0];
  assert.deepEqual({ authorId: rootRow.author_id, operatorId: rootRow.operator_id,
    actorType: rootRow.actor_type },
  { authorId: 'demo-imported-ai', operatorId: actor.id, actorType: 'agent' });
  assert.deepEqual(JSON.parse(rootRow.payload).insight, { kind: 'generated', operatorId: actor.id });
  await rejectsCode(lifecycle.command(expected,
    { type: 'edit', contributionId: rootId, body: 'Agents cannot be edited' }, actor), 'forbidden');

  const reply = { type: 'share-insight-reply', topicId: fixture.topicA,
    discussionId: fixture.discussionA, rootId, replyToId: rootId,
    originSourceId: fixture.sourceA, operationId: 'generated-reply-operation',
    body: 'Exact generated follow-up' };
  const answered = await lifecycle.command(expected, reply, actor, proof(reply, actor.id));
  const replyRow = (await database.query(`SELECT root_id,reply_to_id,operator_id,payload
    FROM canonical_v4.contributions WHERE id=$1`, [answered.result.contributionId])).rows[0];
  assert.equal(replyRow.root_id, rootId);
  assert.equal(replyRow.reply_to_id, rootId);
  assert.equal(replyRow.operator_id, actor.id);
  assert.equal(JSON.parse(replyRow.payload).originSourceId, fixture.sourceA);

  const badSource = { ...root, operationId: 'generated-cross-source',
    originSourceId: fixture.sourceB, body: 'Wrong Topic Source' };
  await rejectsCode(lifecycle.command(answered.version, badSource, actor,
    proof(badSource, actor.id)), 'invalid');
  const missingTarget = { ...reply, operationId: 'generated-missing-target',
    replyToId: 'contribution-does-not-exist', body: 'Missing target' };
  await rejectsCode(lifecycle.command(answered.version, missingTarget, actor,
    proof(missingTarget, actor.id)), 'not-found');

  const withdrawn = await lifecycle.command(answered.version,
    { type: 'withdraw', contributionId: answered.result.contributionId }, actor);
  assert.equal(withdrawn.version.revision, answered.version.revision + 1,
    'the operator owns and may withdraw its generated contribution');
});

test('lifecycle commands keep exact global-version CAS while exact receipts remain replayable', async (t) => {
  const { fixture, lifecycle, runtime, actor } = await context(t, 'version');
  const stale = { generation: fixture.generation, revision: fixture.revision };
  await runtime.command({ actorId: fixture.actorId, requestId: 'unrelated-human-append', expected: stale,
    command: { type: 'create-root', topicId: fixture.topicB, body: 'Unrelated write',
      originSourceId: fixture.sourceB } });
  await rejectsCode(lifecycle.command(stale,
    { type: 'edit', contributionId: fixture.historicalRoot, body: 'Stale edit' }, actor), 'conflict');
  const current = await runtime.version();
  const edit = { type: 'edit', contributionId: fixture.historicalRoot, body: 'Current edit' };
  const accepted = await lifecycle.command(current, edit, actor);
  await runtime.command({ actorId: fixture.actorId, requestId: 'later-human-append', expected: accepted.version,
    command: { type: 'create-root', topicId: fixture.topicB, body: 'Later write',
      originSourceId: fixture.sourceB } });
  assert.deepEqual(await lifecycle.command(current, edit, actor), accepted,
    'receipt lookup precedes the current revision check');
});

test('account bulk withdrawal purges every owned body, provenance and command receipt in one revision', async (t) => {
  const { database, fixture, lifecycle, runtime, actor } = await context(t, 'account');
  let expected = { generation: fixture.generation, revision: fixture.revision };
  const human = await runtime.command({ actorId: actor.id, requestId: 'account-human-root', expected,
    command: { type: 'create-root', topicId: fixture.topicA, body: 'Account human body',
      originSourceId: fixture.sourceA } });
  expected = human.version;
  const generatedCommand = { type: 'share-insight', topicId: fixture.topicA,
    operationId: 'account-generated-root', body: 'Account generated body',
    originSourceId: fixture.sourceA };
  const generated = await lifecycle.command(expected, generatedCommand, actor,
    proof(generatedCommand, actor.id));
  expected = generated.version;
  await runtime.command({ actorId: 'demo-blair', requestId: 'foreign-human-root', expected,
    command: { type: 'create-root', topicId: fixture.topicA, body: 'Foreign surviving body',
      originSourceId: fixture.sourceA } });
  const before = await runtime.version();

  assert.deepEqual(await lifecycle.withdrawAccountContributions(actor.id), { withdrawn: 3 });
  const after = await runtime.version();
  assert.equal(after.revision, before.revision + 1);
  const owned = (await database.query(`SELECT author_id,operator_id,withdrawn,revision_count,payload
    FROM canonical_v4.contributions
    WHERE id=ANY($1::text[]) ORDER BY id`,
  [[fixture.historicalRoot, human.result.contributionId, generated.result.contributionId]])).rows;
  assert.equal(owned.length, 3);
  for (const row of owned) {
    assert.equal(row.author_id, null); assert.equal(row.operator_id, null);
    assert.equal(row.withdrawn, true); assert.equal(Number(row.revision_count), 0);
    assert.equal(row.payload.includes(actor.id), false);
    assert.equal(row.payload.includes('Account '), false);
  }
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.command_receipts
    WHERE actor_id=$1`, [actor.id])).rows[0].count), 0);
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.revisions
    WHERE contribution_id=ANY($1::text[])`,
  [[fixture.historicalRoot, human.result.contributionId, generated.result.contributionId]])).rows[0].count), 0);
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.revisions revision
    JOIN canonical_v4.contributions contribution ON contribution.id=revision.contribution_id
    WHERE contribution.author_id='demo-blair'`)).rows[0].count), 1);
  assert.deepEqual(await lifecycle.withdrawAccountContributions(actor.id), { withdrawn: 0 });
  assert.deepEqual(await runtime.version(), after, 'an empty retry does not advance public state');
  await rejectsCode(lifecycle.withdrawAccountContributions('demo-alex'), 'forbidden');
});

test('account bulk withdrawal rolls every owned mutation back when one ownership mirror is corrupt', async (t) => {
  const { database, fixture, lifecycle, runtime, actor } = await context(t, 'rollback');
  const initial = { generation: fixture.generation, revision: fixture.revision };
  const added = await runtime.command({ actorId: actor.id, requestId: 'rollback-owned-root', expected: initial,
    command: { type: 'create-root', topicId: fixture.topicA, body: 'Must survive rollback',
      originSourceId: fixture.sourceA } });
  const before = await runtime.version();
  const receiptCount = Number((await database.query(`SELECT count(*) AS count
    FROM canonical_v4.command_receipts WHERE actor_id=$1`, [actor.id])).rows[0].count);
  const corrupt = JSON.parse((await database.query(`SELECT payload FROM canonical_v4.contributions
    WHERE id=$1`, [fixture.historicalRoot])).rows[0].payload);
  corrupt.actorType = 'agent';
  await database.query(`UPDATE canonical_v4.contributions SET payload=$2 WHERE id=$1`,
    [fixture.historicalRoot, JSON.stringify(corrupt)]);

  await rejectsCode(lifecycle.withdrawAccountContributions(actor.id), 'storage-corrupt');
  assert.deepEqual(await runtime.version(), before);
  const rows = (await database.query(`SELECT id,withdrawn,revision_count FROM canonical_v4.contributions
    WHERE id=ANY($1::text[]) ORDER BY id`,
  [[fixture.historicalRoot, added.result.contributionId]])).rows;
  assert.deepEqual(rows.map(row => ({ id: row.id, withdrawn: row.withdrawn,
    revisionCount: Number(row.revision_count) })), [fixture.historicalRoot, added.result.contributionId]
    .sort().map(id => ({ id, withdrawn: false, revisionCount: 1 })));
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.revisions
    WHERE contribution_id=ANY($1::text[])`,
  [[fixture.historicalRoot, added.result.contributionId]])).rows[0].count), 2);
  assert.equal(Number((await database.query(`SELECT count(*) AS count
    FROM canonical_v4.command_receipts WHERE actor_id=$1`, [actor.id])).rows[0].count), receiptCount,
  'receipt erasure is in the same rolled-back transaction');
});

test('migration 006 is healthy, repairs append lock order and exposes no PUBLIC lifecycle execution', async (t) => {
  const { database, lifecycle } = await context(t, 'boundary');
  assert.deepEqual(await lifecycle.health(), { schemaVersion: 9 });
  const signature = `canonical_v4.runtime_append_command(
    text,text,text,text,text,text,text,text,text,text,text,text,text,text)`;
  const definition = (await database.query(`SELECT pg_get_functiondef($1::regprocedure) AS definition`,
    [signature.replace(/\s+/gu, '')])).rows[0].definition;
  assert.ok(definition.indexOf('pg_advisory_xact_lock') < definition.indexOf('operation_receipts'),
    'same-actor append/erasure serialization precedes canonical row locks');
  assert.ok(definition.indexOf('operation_receipts') < definition.indexOf('runtime_prepare_command'),
    'the public append wrapper locks an operation receipt before prepare can lock its Source');
  const accountDefinition = (await database.query(`SELECT pg_get_functiondef($1::regprocedure) AS definition`,
    ['canonical_v4.runtime_withdraw_account_contributions(text)'])).rows[0].definition;
  assert.ok(accountDefinition.indexOf('pg_advisory_xact_lock') < accountDefinition.indexOf('command_receipts'),
    'bulk withdrawal fences in-flight writes before enumerating actor-owned state');
  const privileges = (await database.query(`SELECT
    has_function_privilege('public',
      'canonical_v4.runtime_lifecycle_command(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text)',
      'EXECUTE') AS lifecycle,
    has_function_privilege('public',
      'canonical_v4.runtime_withdraw_account_contributions(text)','EXECUTE') AS account`)).rows[0];
  assert.deepEqual(privileges, { lifecycle: false, account: false });
});

test('application role has lifecycle EXECUTE only while crawler and worker roles have none', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec(`CREATE ROLE murmingle_owner; CREATE ROLE murmingle_app;
    CREATE ROLE murmingle_crawler_submitter; CREATE ROLE murmingle_ingest_worker`);
  await bootstrapCanonicalV4(database);
  await database.exec('SET ROLE murmingle_owner');
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  await database.exec('SET ROLE murmingle_app');
  const lifecycle = createCanonicalV4LifecycleRepository({ database,
    now: () => '2026-10-13T19:00:00.000Z' });
  const accepted = await lifecycle.command(
    { generation: fixture.generation, revision: fixture.revision },
    { type: 'edit', contributionId: fixture.historicalRoot, body: 'EXECUTE-only edit' },
    principal(fixture.actorId));
  assert.equal(accepted.result.contributionId, fixture.historicalRoot);
  const app = (await database.query(`SELECT
    has_function_privilege(current_user,
      'canonical_v4.runtime_lifecycle_command(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text)',
      'EXECUTE') AS lifecycle,
    has_function_privilege(current_user,
      'canonical_v4.runtime_withdraw_account_contributions(text)','EXECUTE') AS account,
    has_function_privilege(current_user,
      'canonical_v4.runtime_prepare_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
      'EXECUTE') AS prepare,
    has_table_privilege(current_user,'canonical_v4.contributions','UPDATE') AS contribution_update,
    has_table_privilege(current_user,'canonical_v4.command_receipts','INSERT') AS receipt_insert`)).rows[0];
  assert.deepEqual(app, { lifecycle: true, account: true, prepare: false,
    contribution_update: false, receipt_insert: false });
  await assert.rejects(database.query(`UPDATE canonical_v4.contributions
    SET write_version=write_version+1 WHERE id=$1`, [fixture.historicalRoot]), { code: '42501' });

  for (const role of ['murmingle_crawler_submitter', 'murmingle_ingest_worker']) {
    await database.exec(`RESET ROLE; SET ROLE ${role}`);
    const denied = (await database.query(`SELECT
      has_function_privilege(current_user,
        'canonical_v4.runtime_lifecycle_command(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE') AS lifecycle,
      has_function_privilege(current_user,
        'canonical_v4.runtime_withdraw_account_contributions(text)','EXECUTE') AS account`)).rows[0];
    assert.deepEqual(denied, { lifecycle: false, account: false }, role);
  }
  await database.exec('RESET ROLE');
});
