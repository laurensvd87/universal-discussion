import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig, readSecretFile } from '../src/config.js';
import { createPgDatabase } from '../src/database.js';
import { createPortableRepository } from '../src/repository.js';

// Explicit synthetic QA only: never migrate, seed, fetch a page or start a listener.
export async function verifySyntheticDatabase({ database, tokens, native = true }) {
  if (native) assert.equal(database.dialect, 'pg');
  const repository = createPortableRepository({ database });
  assert.deepEqual(await repository.health(), { schemaVersion: 1 });
  const alex = await repository.authenticate(tokens.alex);
  const blair = await repository.authenticate(tokens.blair);
  assert.equal(alex?.id, 'synthetic-alex');
  assert.equal(blair?.id, 'synthetic-blair');
  const roles = await database.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user");
  assert.equal(roles.rows.length, 1);
  assert.deepEqual(roles.rows[0], { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  await assert.rejects(database.query('CREATE TABLE portable_forbidden(id integer)'), { code: '42501' });
  await assert.rejects(database.query("UPDATE portable_migrations SET hash='forbidden'"), { code: '42501' });
  const a = (await repository.readDiscussion({ discussionId: 'discussion-a' })).discussion;
  const b = (await repository.readDiscussion({ discussionId: 'discussion-b' })).discussion;
  const run = randomUUID();
  const command = (discussionId, sourceId, expectedVersion, requestId) => ({
    principal: alex, requestId, kind: 'create-root',
    payload: { discussionId, sourceId, expectedVersion, body: 'Synthetic native PostgreSQL verification' },
  });
  const [first, other] = await Promise.all([
    repository.command(command(a.id, 'source-a', a.version, `${run}-a`)),
    repository.command(command(b.id, 'source-b', b.version, `${run}-b`)),
  ]);
  assert.equal(first.version, a.version + 1);
  assert.equal(other.version, b.version + 1);
  const repeated = command(a.id, 'source-a', first.version, `${run}-replay`);
  const [one, two] = await Promise.all([repository.command(repeated), repository.command(repeated)]);
  assert.deepEqual(one, two);
  const receipts = await database.query('SELECT count(*) AS count FROM command_receipts WHERE principal_id=$1 AND request_id=$2', [alex.id, repeated.requestId]);
  const jobs = await database.query('SELECT count(*) AS count FROM jobs WHERE principal_id=$1 AND request_id=$2', [alex.id, repeated.requestId]);
  assert.equal(Number(receipts.rows[0].count), 1);
  assert.equal(Number(jobs.rows[0].count), 1);
  await assert.rejects(repository.command({ ...repeated, payload: { ...repeated.payload, body: 'Different synthetic input' } }), { code: 'conflict' });
  const reply = await repository.command({ principal: blair, requestId: `${run}-reply`, kind: 'reply', payload: {
    discussionId: a.id, sourceId: 'source-a2', replyToId: first.contributionId, expectedVersion: one.version, body: 'Synthetic reply from another same-Topic Source',
  } });
  await assert.rejects(repository.command({ principal: alex, requestId: `${run}-forbidden`, kind: 'edit', payload: {
    discussionId: a.id, contributionId: reply.contributionId, expectedVersion: reply.version, body: 'Forbidden synthetic edit',
  } }), { code: 'forbidden' });
  const workers = await Promise.all([repository.claimJob({ workerId: `${run}-w1` }), repository.claimJob({ workerId: `${run}-w2` })]);
  const claimed = workers.filter(Boolean);
  assert.equal(claimed.length, 2);
  assert.notEqual(claimed[0].id, claimed[1].id);
  for (const job of claimed) {
    assert.equal(await repository.completeJob({ jobId: job.id, workerId: 'wrong-worker', leaseToken: job.leaseToken }), false);
    assert.equal(await repository.completeJob({ jobId: job.id, workerId: job.workerId, leaseToken: job.leaseToken }), true);
  }
  const related = await repository.findRelated({ sourceId: 'source-a' });
  assert.equal(related.items[0].id, 'source-b');
  assert.ok(related.items.every(item => !Object.hasOwn(item, 'embedding')));
  return { status: 'ok', engine: native ? 'native-postgresql' : 'embedded-postgresql', writes: 4, duplicatePosts: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let database;
  try {
    const config = await loadConfig(process.env, { role: 'worker' });
    if (config.database.user !== 'murmingle_app') throw new Error('App role required');
    const tokens = {
      alex: await readSecretFile(process.env.MURMINGLE_ALEX_TOKEN_FILE),
      blair: await readSecretFile(process.env.MURMINGLE_BLAIR_TOKEN_FILE),
    };
    database = await createPgDatabase({ config: config.database });
    process.stdout.write(`${JSON.stringify(await verifySyntheticDatabase({ database, tokens }))}\n`);
  } catch {
    process.stderr.write('portable-native-check-failed\n'); process.exitCode = 1;
  } finally { await database?.close(); }
}
