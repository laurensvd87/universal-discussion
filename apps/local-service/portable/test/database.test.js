import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { migrate } from '../src/migrate.js';
import { randomBytes } from 'node:crypto';
import { createPortableRepository } from '../src/repository.js';
import { seedFixture } from '../src/fixture.js';

test('migration is repeatable and hash/version mismatches fail closed', async (t) => {
  const database = await createPGliteDatabase(); t.after(() => database.close());
  assert.deepEqual(await migrate(database), { schemaVersion: 1 });
  assert.deepEqual(await migrate(database), { schemaVersion: 1 });
  await database.query("UPDATE portable_migrations SET hash='changed'");
  await assert.rejects(migrate(database), /hash mismatch/u);
});

test('database transaction rolls back every mutation on exception', async (t) => {
  const database = await createPGliteDatabase(); t.after(() => database.close()); await migrate(database);
  await assert.rejects(database.transaction(async (tx) => {
    await tx.query("INSERT INTO topics(id,title,public) VALUES('rollback','Synthetic',true)");
    throw new Error('abort');
  }), /abort/u);
  assert.equal((await database.query('SELECT * FROM topics')).rows.length, 0);
});

test('runtime role can authenticate and command but cannot seed or rewrite migration receipts', async (t) => {
  const database = await createPGliteDatabase(); t.after(() => database.close());
  await database.exec('CREATE ROLE murmingle_app');
  await migrate(database);
  const repository = createPortableRepository({ database });
  const tokens = { alex: randomBytes(32).toString('base64url'), blair: randomBytes(32).toString('base64url') };
  const ids = await seedFixture(repository, { tokens });
  await database.exec('SET ROLE murmingle_app');
  const principal = await repository.authenticate(tokens.alex);
  const response = await repository.command({ principal, requestId: 'role-check', kind: 'create-root', payload: { discussionId: ids.discussion, sourceId: ids.source, body: 'Role permitted write', expectedVersion: 0 } });
  assert.equal(response.version, 1);
  assert.equal((await repository.readDiscussion({ discussionId: ids.discussion })).items.length, 1);
  const job = await repository.claimJob({ workerId: 'role-worker' });
  assert.equal(await repository.completeJob({ jobId: job.id, workerId: job.workerId, leaseToken: job.leaseToken }), true);
  await assert.rejects(database.query("UPDATE portable_migrations SET hash='forbidden'"), { code: '42501' });
  await assert.rejects(database.query("INSERT INTO principals(id,username,token_hash) VALUES('forbidden','Forbidden',$1)", ['0'.repeat(64)]), { code: '42501' });
});
