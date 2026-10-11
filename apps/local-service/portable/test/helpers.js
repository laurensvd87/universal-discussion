import { randomBytes } from 'node:crypto';
import { createPGliteDatabase } from '../src/database.js';
import { migrate } from '../src/migrate.js';
import { createPortableRepository } from '../src/repository.js';
import { seedFixture } from '../src/fixture.js';

export async function setup(t, options = {}) {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await migrate(database);
  const repository = createPortableRepository({ database, ...options });
  const tokens = { alex: randomBytes(32).toString('base64url'), blair: randomBytes(32).toString('base64url') };
  const ids = await seedFixture(repository, { tokens });
  return { database, repository, ids, tokens, alex: await repository.authenticate(tokens.alex), blair: await repository.authenticate(tokens.blair) };
}

export function rootCommand({ ids, alex }, extra = {}) {
  return { principal: alex, requestId: 'request-a', kind: 'create-root', payload: { discussionId: ids.discussion, sourceId: ids.source, body: 'Synthetic published body', expectedVersion: 0 }, ...extra };
}
