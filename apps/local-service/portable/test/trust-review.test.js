import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, rootCommand } from './helpers.js';
import { readFile } from 'node:fs/promises';
import { createPGliteDatabase } from '../src/database.js';

test('Trust: replay namespaces include account and operation, preserving original withdrawal result', async t => {
  const c = await setup(t);
  const first = await c.repository.command(rootCommand(c));
  const second = await c.repository.command(rootCommand(c, {
    principal: c.blair,
    payload: { discussionId: c.ids.otherDiscussion, sourceId: c.ids.relatedSource, body: 'Separate account namespace', expectedVersion: 0 },
  }));
  assert.notEqual(first.contributionId, second.contributionId);
  await assert.rejects(c.repository.command({ principal: c.alex, requestId: 'request-a', kind: 'withdraw', payload: { discussionId: c.ids.discussion, contributionId: first.contributionId, expectedVersion: 1 } }), { code: 'conflict' });
  const withdrawal = { principal: c.alex, requestId: 'withdraw-once', kind: 'withdraw', payload: { discussionId: c.ids.discussion, contributionId: first.contributionId, expectedVersion: 1 } };
  const result = await c.repository.command(withdrawal);
  assert.deepEqual(await c.repository.command(withdrawal), result);
  assert.deepEqual(await c.repository.command(rootCommand(c)), first);
  assert.equal((await c.repository.readDiscussion({ discussionId: c.ids.discussion })).items.length, 0);
  assert.equal((await c.database.query('SELECT count(*)::integer n FROM jobs')).rows[0].n, 3);
});

test('Trust: job insertion failure rolls back contribution, revision, receipt and discussion version', async t => {
  const generated = ['first-contribution', 'same-job-id', 'second-contribution', 'same-job-id'];
  const c = await setup(t, { id: () => generated.shift() });
  await c.repository.command(rootCommand(c));
  // The second job ID collides after contribution/revision/receipt writes.
  await assert.rejects(c.repository.command(rootCommand(c, { requestId: 'failed-operation', payload: { ...rootCommand(c).payload, expectedVersion: 1 } })), { code: '23505' });
  for (const table of ['contributions', 'contribution_revisions', 'command_receipts', 'jobs']) {
    assert.equal((await c.database.query(`SELECT count(*)::integer n FROM ${table}`)).rows[0].n, 1);
  }
  assert.equal((await c.repository.readDiscussion({ discussionId: c.ids.discussion })).discussion.version, 1);
});

test('Trust: withdrawn contributions cannot be resurrected or given new ancestry through SQL updates', async t => {
  const c = await setup(t);
  const root = await c.repository.command(rootCommand(c));
  await c.repository.command({ principal: c.alex, requestId: 'withdraw-once', kind: 'withdraw', payload: { discussionId: c.ids.discussion, contributionId: root.contributionId, expectedVersion: 1 } });
  await assert.rejects(c.database.query('UPDATE contributions SET withdrawn=false,body=$2 WHERE id=$1', [root.contributionId, 'Resurrected']), { code: '23514' });
  await assert.rejects(c.database.query('UPDATE contributions SET author_id=$2 WHERE id=$1', [root.contributionId, c.ids.blair]), { code: '23514' });
  const retained = (await c.database.query('SELECT body,withdrawn,author_id FROM contributions WHERE id=$1', [root.contributionId])).rows[0];
  assert.deepEqual(retained, { body: null, withdrawn: true, author_id: c.ids.alex });
});

test('Trust: owner-role restore skips comments on the administrator-owned vector extension', async t => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec('CREATE ROLE udl_owner; CREATE EXTENSION vector; SET ROLE udl_owner');
  await assert.rejects(database.query('COMMENT ON EXTENSION vector IS NULL'), { code: '42501' });
  const restore = await readFile(new URL('../ops/restore.js', import.meta.url), 'utf8');
  assert.match(restore, /pg_restore[^\n]*--no-comments/);
});
