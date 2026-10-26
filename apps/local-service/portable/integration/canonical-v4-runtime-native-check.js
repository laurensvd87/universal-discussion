import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createPgDatabase } from '../src/database.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import {
  runtimeRequest,
  seedCanonicalV4RuntimeFixture,
} from '../test/canonical-v4-runtime-fixture.js';

function withDeadline(promise, label, milliseconds = 5_000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not complete while discussion A was held`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function runCanonicalV4NativeConcurrencyCheck({ connectionString, config } = {}) {
  const hasConnectionString = typeof connectionString === 'string' && connectionString.length > 0;
  const hasConfig = config && typeof config === 'object' && !Array.isArray(config);
  if (hasConnectionString === hasConfig)
    throw new Error('Exactly one native PostgreSQL connection configuration is required');
  if (process.env.MURMINGLE_CANONICAL_V4_NATIVE_TEST_ACK !== 'disposable-empty-database')
    throw new Error('Set MURMINGLE_CANONICAL_V4_NATIVE_TEST_ACK=disposable-empty-database for the isolated test database');
  const database = await createPgDatabase({
    config: hasConfig ? { ...config, max: 6 } : { connectionString, max: 6 },
  });
  let releaseA = () => {};
  let pendingA = null;
  try {
    const { rows: existingSchema } = await database.query(`SELECT 1 FROM pg_namespace WHERE nspname='canonical_v4'`);
    const { rows: userTables } = await database.query(`SELECT table_schema,table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema') LIMIT 1`);
    if (existingSchema.length || userTables.length)
      throw new Error('Native concurrency check requires a fresh empty disposable database');
    await database.exec('CREATE EXTENSION IF NOT EXISTS vector; CREATE SCHEMA canonical_v4');
    const fixture = await seedCanonicalV4RuntimeFixture(database);

    let heldResolve;
    const held = new Promise((resolveHeld) => { heldResolve = resolveHeld; });
    let releaseResolve;
    const release = new Promise((resolveRelease) => { releaseResolve = resolveRelease; });
    releaseA = releaseResolve;
    const repositoryA = createCanonicalV4RuntimeRepository({
      database,
      nextId: () => 'contribution-native-a',
      now: () => '2026-10-13T17:00:00.000Z',
      async beforeWatermark({ discussionId }) {
        assert.equal(discussionId, fixture.discussionA);
        heldResolve();
        await release;
      },
    });
    const repositoryB = createCanonicalV4RuntimeRepository({
      database,
      nextId: () => 'contribution-native-b',
      now: () => '2026-10-13T17:00:01.000Z',
    });
    const commandA = repositoryA.command(runtimeRequest(fixture, 'native-held-a', {
      type: 'create-root', topicId: fixture.topicA, body: 'Held discussion A', originSourceId: null,
    }));
    pendingA = commandA;
    await withDeadline(held, 'discussion A hold point');

    // A owns the discussion-A row lock here but has not touched the global
    // watermark. Both the independent write and ordinary read must finish
    // before A is released.
    const commandB = withDeadline(repositoryB.command(runtimeRequest(fixture, 'native-independent-b', {
      type: 'create-root', topicId: fixture.topicB, body: 'Independent discussion B', originSourceId: null,
    })), 'discussion B write');
    const read = withDeadline(repositoryB.version(), 'runtime read');
    const [resultB, readVersion] = await Promise.all([commandB, read]);
    assert.equal(resultB.version.revision, fixture.revision + 1);
    assert.ok([fixture.revision, fixture.revision + 1].includes(readVersion.revision));

    releaseResolve();
    const resultA = await withDeadline(commandA, 'discussion A completion');
    assert.equal(resultA.version.revision, fixture.revision + 2);
    assert.equal(await repositoryA.discussionVersion(fixture.discussionA), 1);
    assert.equal(await repositoryB.discussionVersion(fixture.discussionB), 1);
    assert.deepEqual(await repositoryB.version(), {
      generation: fixture.generation,
      revision: fixture.revision + 2,
    });
    return Object.freeze({ heldDiscussion: fixture.discussionA, independentDiscussion: fixture.discussionB,
      readCompletedWhileHeld: true, independentWriteCommittedWhileHeld: true });
  } finally {
    releaseA();
    await pendingA?.catch(() => {});
    await database.close();
  }
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  runCanonicalV4NativeConcurrencyCheck({
    connectionString: process.env.MURMINGLE_CANONICAL_V4_NATIVE_TEST_URL,
  }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`), (error) => {
    process.stderr.write(`${error?.message || 'Native canonical v4 concurrency check failed'}\n`);
    process.exitCode = 1;
  });
}
