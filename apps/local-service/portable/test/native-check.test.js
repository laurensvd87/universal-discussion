import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createPGliteDatabase } from '../src/database.js';
import { createPortableRepository } from '../src/repository.js';
import { migrate } from '../src/migrate.js';
import { seedFixture } from '../src/fixture.js';
import { verifySyntheticDatabase } from '../integration/native-check.js';

test('native-check scenario passes embedded PG under the restricted application role; native claim requires pg', async t => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec('CREATE ROLE murmingle_app; REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await migrate(database);
  const tokens = { alex: randomBytes(32).toString('base64url'), blair: randomBytes(32).toString('base64url') };
  await seedFixture(createPortableRepository({ database }), { tokens });
  await database.exec('SET ROLE murmingle_app');
  await assert.rejects(verifySyntheticDatabase({ database, tokens }), /pglite/);
  assert.deepEqual(await verifySyntheticDatabase({ database, tokens, native: false }), {
    status: 'ok', engine: 'embedded-postgresql', writes: 4, duplicatePosts: 0,
  });
});
