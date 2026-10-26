import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPGliteDatabase } from '../src/database.js';
import {
  extractCanonicalV4Snapshot,
  importCanonicalV4,
  bootstrapCanonicalV4,
  initializeCanonicalV4Runtime,
  migrateCanonicalV4,
  readCanonicalV4MigrationManifest,
  reconstructCanonicalV4,
} from '../canonical-v4/index.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import { createCanonicalV4IngestionRepository } from '../canonical-v4/ingestion-repository.js';
import { createDemoState, applyCommand } from '../../src/domain/demo-state.js';
import { readLearnedIngest, applyLearnedIngest, BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';
import { operationDigestFor, sourceStamp } from '../../src/domain/source-threads.js';
import {
  inspectPageUrl,
  inspectRetainedSourceDtoUrl,
} from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import {
  createNormalizedSqliteRepository,
  migrateNormalizedReferenceStorage,
} from '../../src/adapters/normalized-sqlite-repository.js';

const stamp = '2026-10-13T12:00:00.000Z';
const version = (state) => ({ generation: state.generation, revision: state.revision });
const vector = (angle) => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const actor = {
  id: 'account-11111111-1111-4111-8111-111111111111',
  accountId: '11111111-1111-4111-8111-111111111111',
  type: 'human', demo: false, displayName: 'Synthetic',
};
const demoActor = { id: 'demo-alex', type: 'human', demo: true };

function buildSource(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-pg-v4-import-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'canonical.sqlite');
  let serial = 0;
  const dependencies = { nextId: (kind) => `${kind}-${++serial}`, now: () => stamp };
  let state = createDemoState({ generation: 'synthetic-postgres-v4', createdAt: stamp, sources: [], topicSeeds: [] });
  for (const [name, angle] of [['a', 0], ['b', 0.1], ['c', 1.5]]) {
    const input = readLearnedIngest({ expected: version(state), operationId: `operation-${name}`,
      url: `https://example.org/postgres-v4/${name}`, title: `Synthetic ${name}`,
      extractorVersion: 'main-text-prefix/v1', embedding: { modelId: BROWSER_MODEL_ID, values: vector(angle) } });
    state = applyLearnedIngest(state, input, operationDigestFor(input), dependencies).state;
  }
  const firstTopic = state.sourceLinks[0].topicId;
  let applied = applyCommand(state, { type: 'create-root', topicId: firstTopic,
    originSourceId: state.sources[0].id, body: 'Synthetic first revision' }, actor, dependencies);
  state = applied.state;
  const liveContributionId = applied.result.contributionId;
  state = applyCommand(state, { type: 'edit', contributionId: liveContributionId,
    body: 'Synthetic current revision' }, actor, dependencies).state;
  const otherTopic = state.topics.find((topic) => topic.id !== firstTopic).id;
  applied = applyCommand(state, { type: 'create-root', topicId: otherTopic,
    originSourceId: state.sources.find((source) => state.sourceLinks.find((link) =>
      link.sourceId === source.id)?.topicId === otherTopic).id, body: 'Synthetic withdrawn body' }, actor, dependencies);
  state = applyCommand(applied.state, { type: 'withdraw', contributionId: applied.result.contributionId }, actor, dependencies).state;

  let repository = createNormalizedSqliteRepository(filename, state);
  repository.close();
  state = migrateNormalizedReferenceStorage(filename, version(state), { represent: (source) => source.embedding.values });
  repository = createNormalizedSqliteRepository(filename, null);
  let next = structuredClone(repository.load());
  next.sources[1].topicIds = next.topics.map((topic) => topic.id).sort();
  next.revision += 1;
  repository.save(version(state), next);
  state = next;

  // Exercise the real registry's no-reuse invariant: create and then remove an
  // otherwise-unreferenced Topic/Discussion, leaving both identities reserved.
  const created = applyCommand(state, { type: 'create-topic', title: 'Retired synthetic topic', kind: 'general' }, demoActor, dependencies).state;
  repository.save(version(state), created);
  const retiredTopicId = created.topics.at(-1).id;
  const retiredDiscussionId = created.discussions.find((entry) => entry.topicId === retiredTopicId).id;
  next = structuredClone(created);
  next.topics = next.topics.filter((entry) => entry.id !== retiredTopicId);
  next.discussions = next.discussions.filter((entry) => entry.id !== retiredDiscussionId);
  next.revision += 1;
  repository.save(version(created), next);
  repository.close();

  // Non-canonical whitespace is legal for the source serializer. The importer
  // must retain these bytes, not parse and stringify them into a new payload.
  const sqlite = new DatabaseSync(filename);
  const topicRow = sqlite.prepare('SELECT id,payload FROM canonical_topics ORDER BY ordinal LIMIT 1').get();
  const spacedPayload = JSON.stringify(JSON.parse(topicRow.payload), null, 1);
  sqlite.prepare('UPDATE canonical_topics SET payload=? WHERE id=?').run(spacedPayload, topicRow.id);
  // This pair orders differently under JS UTF-16 than under SQLite BINARY /
  // PostgreSQL C, proving the migration digest uses explicit UTF-8 byte order.
  sqlite.prepare("INSERT INTO canonical_id_registry(id,kind) VALUES(?, 'sources')").run('\uE000-retired');
  sqlite.prepare("INSERT INTO canonical_id_registry(id,kind) VALUES(?, 'sources')").run('\u{10000}-retired');
  sqlite.close();
  return { filename, retiredTopicId, retiredDiscussionId, spacedPayload, liveContributionId };
}

test('canonical v4 import is lossless across overlaps, references, receipts, tombstones and revisions', async (t) => {
  const fixture = buildSource(t);
  const sourceBytes = readFileSync(fixture.filename);
  const source = await extractCanonicalV4Snapshot(fixture.filename);
  assert.equal(source.counts.retiredIds, 4);
  assert.ok(source.state.sources.some((entry) => entry.topicIds.length > 1));
  assert.ok(source.state.topics.some((entry) => entry.reference !== null && entry.reference !== undefined));
  assert.ok(source.state.sources.every((entry) => entry.operationId && entry.operationDigest));
  assert.ok(source.state.contributions.some((entry) => entry.withdrawn && entry.revisions.length === 0));
  assert.equal(source.state.contributions.find((entry) => entry.id === fixture.liveContributionId).revisions.length, 2);

  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const result = await importCanonicalV4({ database, sqlitePath: fixture.filename });
  const reconstructed = await reconstructCanonicalV4(database);
  assert.deepEqual(reconstructed.state, source.state);
  assert.equal(JSON.stringify(reconstructed.state), JSON.stringify(source.state));
  assert.deepEqual(reconstructed.registry, source.raw.registry);
  assert.equal(reconstructed.logicalSha256, source.logicalSha256);
  assert.deepEqual(result.counts, source.counts);
  assert.equal(readFileSync(fixture.filename).equals(sourceBytes), true, 'read-only extraction cannot mutate SQLite');

  const retired = await database.query('SELECT id,kind FROM canonical_v4.id_registry WHERE id=$1 OR id=$2 ORDER BY id',
    [fixture.retiredTopicId, fixture.retiredDiscussionId]);
  assert.equal(retired.rows.length, 2);
  assert.equal((await database.query('SELECT 1 FROM canonical_v4.topics WHERE id=$1', [fixture.retiredTopicId])).rows.length, 0);
  assert.equal((await database.query('SELECT payload FROM canonical_v4.topics ORDER BY ordinal LIMIT 1')).rows[0].payload,
    fixture.spacedPayload);
  const reference = (await database.query(`SELECT values_double,vector_mirror IS NOT NULL AS mirrored
    FROM canonical_v4.fixed_references WHERE values_double IS NOT NULL LIMIT 1`)).rows[0];
  const sourceReference = source.state.topics.find((topic) => topic.reference)?.reference.values;
  assert.deepEqual(reference.values_double, sourceReference);
  assert.equal(reference.mirrored, true);
  const embedding = (await database.query(`SELECT values_double,vector_mirror IS NOT NULL AS mirrored
    FROM canonical_v4.embeddings ORDER BY source_id LIMIT 1`)).rows[0];
  const embeddingSourceId = (await database.query('SELECT source_id FROM canonical_v4.embeddings ORDER BY source_id LIMIT 1')).rows[0].source_id;
  assert.deepEqual(embedding.values_double, source.state.sources.find((entry) => entry.id === embeddingSourceId).embedding.values);
  assert.equal(embedding.mirrored, true);

  const receiptSource = source.state.sources.find((entry) => entry.operationId === 'operation-a');
  const receiptReplay = await createCanonicalV4IngestionRepository({ database }).enqueueInteractive({
    expected: result.version,
    operationId: receiptSource.operationId,
    url: receiptSource.url,
    title: receiptSource.title,
    embedding: receiptSource.embedding,
    extractorVersion: receiptSource.extractorVersion,
  }, { authorityToken: 'authority-imported-receipt', authoritySeconds: 30 });
  assert.deepEqual({ state: receiptReplay.state, replayed: receiptReplay.replayed,
    sourceId: receiptReplay.sourceId, ordinal: receiptReplay.ordinal,
    authorityToken: receiptReplay.authorityToken }, {
    state: 'complete', replayed: true, sourceId: receiptSource.id, ordinal: null,
    authorityToken: null,
  });
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.ingestion_jobs'))
    .rows[0].count), 0, 'canonical receipt replay does not create a queue job');

  const retainedPayload = (await database.query('SELECT id,payload FROM canonical_v4.topics ORDER BY ordinal LIMIT 1')).rows[0];
  await database.query('UPDATE canonical_v4.topics SET payload=$2 WHERE id=$1',
    [retainedPayload.id, `${retainedPayload.payload}\n`]);
  await assert.rejects(reconstructCanonicalV4(database), /digest mismatch/u,
    'semantically equal but byte-different payloads cannot pass the import digest');
});

test('canonical v4 data import is one transaction and a late fault rolls back every row', async (t) => {
  const fixture = buildSource(t);
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await assert.rejects(importCanonicalV4({ database, sqlitePath: fixture.filename,
    beforeCommit() { throw new Error('synthetic late import fault'); } }), /synthetic late import fault/u);
  for (const table of ['meta', 'id_registry', 'topics', 'sources', 'contributions', 'import_ledger'])
    assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.${table}`)).rows[0].count), 0);
  const accepted = await importCanonicalV4({ database, sqlitePath: fixture.filename });
  assert.equal(accepted.counts.retiredIds, 4);
});

test('source identity collision and nonempty PostgreSQL targets fail closed', async (t) => {
  const collision = buildSource(t);
  const sqlite = new DatabaseSync(collision.filename);
  sqlite.exec('PRAGMA foreign_keys=OFF');
  const topicId = sqlite.prepare('SELECT id FROM canonical_topics ORDER BY ordinal LIMIT 1').get().id;
  const discussion = sqlite.prepare('SELECT id,payload FROM canonical_discussions ORDER BY ordinal LIMIT 1').get();
  const payload = JSON.parse(discussion.payload);
  payload.id = topicId;
  sqlite.prepare('UPDATE canonical_discussions SET id=?,payload=? WHERE id=?').run(topicId, JSON.stringify(payload), discussion.id);
  for (const row of sqlite.prepare('SELECT id,payload FROM canonical_contributions WHERE discussion_id=?').all(discussion.id)) {
    const contribution = JSON.parse(row.payload);
    contribution.discussionId = topicId;
    sqlite.prepare('UPDATE canonical_contributions SET discussion_id=?,payload=? WHERE id=?').run(topicId, JSON.stringify(contribution), row.id);
  }
  sqlite.close();

  const untouched = await createPGliteDatabase();
  t.after(() => untouched.close());
  await assert.rejects(importCanonicalV4({ database: untouched, sqlitePath: collision.filename }), /identifier collision/u);
  assert.equal((await untouched.query("SELECT to_regclass('canonical_v4.meta') AS name")).rows[0].name, null,
    'source validation happens before target migration or writes');

  const valid = buildSource(t);
  const nonempty = await createPGliteDatabase();
  t.after(() => nonempty.close());
  await migrateCanonicalV4(nonempty);
  await nonempty.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES('already-reserved','sources')");
  await assert.rejects(importCanonicalV4({ database: nonempty, sqlitePath: valid.filename }), /target is not empty/u);
  assert.deepEqual((await nonempty.query('SELECT id,kind FROM canonical_v4.id_registry')).rows,
    [{ id: 'already-reserved', kind: 'sources' }]);
});

test('canonical migration has its own immutable hash ledger', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const first = await migrateCanonicalV4(database);
  assert.deepEqual(await migrateCanonicalV4(database), first);
  const boundary = readFileSync(new URL('../canonical-v4/migrations/003-execute-only-command-boundary.sql',
    import.meta.url), 'utf8');
  const receiptLock = boundary.indexOf('INSERT INTO canonical_v4.command_receipts(');
  const sourceLock = boundary.indexOf('SELECT * INTO v_source FROM canonical_v4.sources');
  const discussionLock = boundary.indexOf('SELECT * INTO v_discussion FROM canonical_v4.discussions');
  const topicLock = boundary.indexOf('SELECT * INTO v_topic FROM canonical_v4.topics');
  const contributionLock = boundary.indexOf('SELECT * INTO v_root FROM canonical_v4.contributions');
  const watermark = boundary.indexOf('WITH watermark AS');
  assert.ok(receiptLock > 0 && receiptLock < sourceLock && sourceLock < discussionLock && discussionLock < topicLock &&
    topicLock < contributionLock && contributionLock < watermark,
  'command lock order must remain Source -> Discussion -> Topic -> Contribution -> watermark');
  await database.query("UPDATE canonical_v4.schema_migrations SET hash='changed'");
  await assert.rejects(migrateCanonicalV4(database), /hash mismatch/u);
});

test('later migrations initialize runtime state when installed after an existing 001 import', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec('CREATE EXTENSION vector; CREATE SCHEMA canonical_v4');
  await database.exec('CREATE TABLE canonical_v4.schema_migrations(version integer PRIMARY KEY, hash text NOT NULL)');
  const migration = readFileSync(new URL('../canonical-v4/migrations/001-canonical-v4.sql', import.meta.url), 'utf8');
  await database.exec(migration);
  await database.query('INSERT INTO canonical_v4.schema_migrations(version,hash) VALUES(1,$1)',
    [createHash('sha256').update(migration).digest('hex')]);
  const baselineDigest = '1'.repeat(64);
  await database.query(`INSERT INTO canonical_v4.meta
    (singleton,target_format,source_format,state_schema,generation,revision,logical_sha256,counts_text)
    VALUES(true,'canonical-postgresql/v4-slice1','canonical-relational/v2','demo-state/v4','post-001',4,$1,'{}')`,
  [baselineDigest]);
  await database.query(`INSERT INTO canonical_v4.import_ledger
    (source_format,state_schema,generation,revision,logical_sha256,counts_text)
    VALUES('canonical-relational/v2','demo-state/v4','post-001',4,$1,'{}')`, [baselineDigest]);
  const migratedSource = {
    id: 'source-post-001',
    url: 'https://example.org/canonical-v4/post-001',
    title: 'Post-001 Source',
    embedding: null,
    provenance: 'synthetic-owner-local/v1',
  };
  const { embedding: _embedding, ...migratedPayload } = migratedSource;
  await database.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'sources')", [migratedSource.id]);
  await database.query(`INSERT INTO canonical_v4.sources
    (id,ordinal,payload,url,title,provenance,has_embedding)
    VALUES($1,0,$2,$3,$4,$5,false)`, [migratedSource.id, JSON.stringify(migratedPayload),
    migratedSource.url, migratedSource.title, migratedSource.provenance]);

  const manifest = await readCanonicalV4MigrationManifest();
  const result = await migrateCanonicalV4(database);
  assert.equal(result.schemaVersion, manifest.length);
  assert.equal(result.hashes.length, manifest.length);
  assert.deepEqual((await database.query(`SELECT generation,revision,catalog_version,matching_version
    FROM canonical_v4.runtime_state`)).rows, [{
    generation: 'post-001', revision: 4, catalog_version: 0, matching_version: 0,
  }]);
  for (const [sequence, expected] of [
    ['topic_ordinal_sequence', 0],
    ['discussion_ordinal_sequence', 0],
    ['source_ordinal_sequence', 1],
    ['source_link_ordinal_sequence', 0],
    ['contribution_ordinal_sequence', 0],
    ['ingestion_job_ordinal_sequence', 0],
  ]) assert.equal(Number((await database.query(
    `SELECT nextval('canonical_v4.${sequence}') AS ordinal`)).rows[0].ordinal), expected, sequence);
  assert.deepEqual((await database.query(`SELECT source_id,stamp,postable
    FROM canonical_v4.runtime_source_stamps`)).rows,
  [{ source_id: migratedSource.id, stamp: sourceStamp(migratedSource), postable: true }]);
  await assert.rejects(database.query('UPDATE canonical_v4.meta SET revision=5'), { code: '23514' });
  await assert.rejects(database.query('DELETE FROM canonical_v4.import_ledger'), { code: '23514' });
});

test('runtime role can execute validated appends but has no direct canonical DML', async (t) => {
  const fixture = buildSource(t);
  const source = await extractCanonicalV4Snapshot(fixture.filename);
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec('CREATE ROLE murmingle_owner; CREATE ROLE murmingle_app');
  assert.deepEqual(await bootstrapCanonicalV4(database), { schema: 'canonical_v4', owner: 'murmingle_owner' });
  await database.exec('SET ROLE murmingle_owner');
  await importCanonicalV4({ database, sqlitePath: fixture.filename });
  const actorId = 'account-22222222-2222-4222-8222-222222222222';
  const usedOrigins = new Set(source.state.contributions.flatMap((entry) =>
    [entry.originSourceId, entry.anchor?.kind === 'source' ? entry.anchor.sourceId : null].filter(Boolean)));
  const retainedSource = source.state.sources.find((entry) =>
    entry.provenance === 'owner-local-page-embedding/v1' && !usedOrigins.has(entry.id));
  assert.ok(retainedSource, 'fixture needs an otherwise-unused learned Source');
  const retainedLink = source.state.sourceLinks.find((entry) => entry.sourceId === retainedSource.id);
  assert.ok(retainedLink);
  const retainedHistoryRepository = createCanonicalV4RuntimeRepository({
    database,
    nextId: () => 'contribution-retained-history-root',
    now: () => '2026-10-13T15:59:00.000Z',
  });
  const retainedHistoryRoot = await retainedHistoryRepository.command({
    actorId,
    requestId: 'retained-history-root',
    expected: { generation: source.state.generation, revision: source.state.revision },
    command: { type: 'create-root', topicId: retainedLink.topicId,
      body: 'Root created while the learned Source was postable', originSourceId: retainedSource.id },
  });
  const retainedOnlyUrl = 'https://login.news.example.org/article';
  assert.equal(inspectRetainedSourceDtoUrl(retainedOnlyUrl).supported, true);
  assert.equal(inspectPageUrl(retainedOnlyUrl).supported, false);
  const retainedOnlySource = { ...retainedSource, url: retainedOnlyUrl };
  retainedOnlySource.operationDigest = operationDigestFor(retainedOnlySource);
  const { embedding: _retainedEmbedding, ...retainedOnlyPayload } = retainedOnlySource;
  await database.query(`UPDATE canonical_v4.sources SET url=$2,payload=$3 WHERE id=$1`,
    [retainedSource.id, retainedOnlyUrl, JSON.stringify(retainedOnlyPayload)]);
  await database.query(`UPDATE canonical_v4.operation_receipts SET operation_digest=$2 WHERE source_id=$1`,
    [retainedSource.id, retainedOnlySource.operationDigest]);
  await database.query('DELETE FROM canonical_v4.runtime_source_stamps WHERE source_id=$1', [retainedSource.id]);
  await initializeCanonicalV4Runtime(database);
  assert.deepEqual((await database.query(`SELECT stamp,postable FROM canonical_v4.runtime_source_stamps
    WHERE source_id=$1`, [retainedSource.id])).rows,
  [{ stamp: sourceStamp(retainedOnlySource), postable: false }]);
  assert.deepEqual((await database.query(`SELECT
    canonical_v4.runtime_utf16_length($1) AS units,
    canonical_v4.runtime_safe_text($2,8000,true) AS at_limit,
    canonical_v4.runtime_safe_text($3,8000,true) AS over_limit,
    canonical_v4.runtime_safe_text($4,8000,true) AS whitespace_only`,
  ['\u{1F642}', '\u{1F642}'.repeat(4_000), '\u{1F642}'.repeat(4_001), '\u00a0\u3000\ufeff'])).rows[0],
  { units: 2, at_limit: true, over_limit: false, whitespace_only: false });
  await database.exec('SET ROLE murmingle_app');
  const manifest = await readCanonicalV4MigrationManifest();
  assert.deepEqual((await database.query('SELECT version FROM canonical_v4.schema_migrations ORDER BY version')).rows
    .map(({ version }) => Number(version)), manifest.map(({ version }) => version));
  assert.deepEqual((await database.query(`SELECT
    has_table_privilege(current_user,'canonical_v4.topics','SELECT') AS can_select,
    has_table_privilege(current_user,'canonical_v4.topics','UPDATE') AS can_update`)).rows[0],
  { can_select: true, can_update: false });

  let serial = 0;
  const repository = createCanonicalV4RuntimeRepository({
    database,
    nextId: () => `contribution-role-${++serial}`,
    now: () => '2026-10-13T16:00:00.000Z',
  });
  assert.equal((await repository.health()).schemaVersion, manifest.length);
  const normalLink = source.state.sourceLinks.find((entry) => entry.sourceId !== retainedSource.id);
  const topic = source.state.topics.find((entry) => entry.id === normalLink.topicId);
  const discussion = source.state.discussions.find((entry) => entry.topicId === topic.id);
  const originSourceId = normalLink.sourceId;
  const rootRequest = {
    actorId,
    requestId: 'role-root',
    expected: { generation: source.state.generation, revision: source.state.revision },
    command: { type: 'create-root', topicId: topic.id, body: 'Allowed append', originSourceId },
  };
  const root = await repository.command(rootRequest);
  const storedRoot = JSON.parse((await database.query(`SELECT payload FROM canonical_v4.contributions
    WHERE id=$1`, [root.result.contributionId])).rows[0].payload);
  assert.equal(storedRoot.anchor.stamp,
    sourceStamp(source.state.sources.find((entry) => entry.id === originSourceId)));
  const current = await repository.version();
  await repository.command({
    actorId,
    requestId: 'role-reply',
    expected: current,
    command: { type: 'reply', discussionId: discussion.id, rootId: root.result.contributionId,
      replyToId: null, body: 'Allowed reply', originSourceId: null },
  });
  assert.deepEqual(await repository.command({ ...rootRequest, expected: await repository.version() }), root);

  const beforeRetainedRejection = Number((await database.query(`SELECT count(*) AS count
    FROM canonical_v4.contributions`)).rows[0].count);
  await assert.rejects(repository.command({
    actorId,
    requestId: 'retained-only-new-root',
    expected: await repository.version(),
    command: { type: 'create-root', topicId: retainedLink.topicId,
      body: 'A retained-only learned URL cannot originate a new root', originSourceId: retainedSource.id },
  }), (error) => error?.code === 'invalid');
  assert.equal(Number((await database.query(`SELECT count(*) AS count
    FROM canonical_v4.contributions`)).rows[0].count), beforeRetainedRejection);

  await database.exec('SET ROLE murmingle_owner');
  await database.query('DELETE FROM canonical_v4.topic_memberships WHERE source_id=$1', [retainedSource.id]);
  await database.query('DELETE FROM canonical_v4.source_links WHERE source_id=$1', [retainedSource.id]);
  await database.exec('SET ROLE murmingle_app');
  await assert.rejects(repository.command({
    actorId,
    requestId: 'retained-only-historical-reply',
    expected: await repository.version(),
    command: { type: 'reply', discussionId: source.state.discussions.find((entry) =>
      entry.topicId === retainedLink.topicId).id, rootId: retainedHistoryRoot.result.contributionId,
    replyToId: null, body: 'Historical origin still cannot bypass postability', originSourceId: retainedSource.id },
  }), (error) => error?.code === 'invalid');
  assert.equal(Number((await database.query(`SELECT count(*) AS count
    FROM canonical_v4.contributions`)).rows[0].count), beforeRetainedRejection);

  const privileges = (await database.query(`SELECT
    has_table_privilege(current_user,'canonical_v4.contributions','INSERT') AS contribution_insert,
    has_table_privilege(current_user,'canonical_v4.revisions','INSERT') AS revision_insert,
    has_table_privilege(current_user,'canonical_v4.command_receipts','INSERT') AS receipt_insert,
    has_table_privilege(current_user,'canonical_v4.command_receipts','SELECT') AS receipt_select,
    has_sequence_privilege(current_user,'canonical_v4.contribution_ordinal_sequence','USAGE') AS ordinal_usage,
    has_function_privilege(current_user,
      'canonical_v4.runtime_append_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
      'EXECUTE') AS append_execute,
    has_function_privilege(current_user,
      'canonical_v4.runtime_prepare_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
      'EXECUTE') AS prepare_execute,
    has_function_privilege(current_user,
      'canonical_v4.runtime_complete_command(text,text,text,text,text,bigint)',
      'EXECUTE') AS complete_execute`)).rows[0];
  assert.deepEqual(privileges, {
    contribution_insert: false,
    revision_insert: false,
    receipt_insert: false,
    receipt_select: false,
    ordinal_usage: false,
    append_execute: true,
    prepare_execute: false,
    complete_execute: false,
  });

  const denied = (sql) => assert.rejects(database.query(sql), { code: '42501' });
  await denied("INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at) VALUES('forbidden',999,'{}','general','x','x')");
  await denied('UPDATE canonical_v4.meta SET revision=revision');
  await denied('UPDATE canonical_v4.import_ledger SET revision=revision');
  await denied('UPDATE canonical_v4.runtime_state SET generation=generation');
  await denied('UPDATE canonical_v4.runtime_state SET catalog_version=catalog_version');
  await denied('UPDATE canonical_v4.runtime_state SET matching_version=matching_version');
  await denied('UPDATE canonical_v4.discussions SET payload=payload');
  await denied('UPDATE canonical_v4.contributions SET payload=payload');
  await denied('DELETE FROM canonical_v4.command_receipts');
  await denied(`INSERT INTO canonical_v4.command_receipts
    (actor_id,request_id,request_digest,command_type)
    VALUES('demo-alex','forbidden-receipt','${'0'.repeat(64)}','create-root')`);
  await denied("SELECT nextval('canonical_v4.contribution_ordinal_sequence')");
  await denied(`SELECT * FROM canonical_v4.runtime_prepare_command(
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  )`);

  const astralBody = '\u{1F642}'.repeat(4_001);
  const astralCommand = { type: 'create-root', topicId: topic.id, body: astralBody, originSourceId: null };
  const astralMaterial = JSON.stringify({ generation: source.state.generation, command: astralCommand });
  const astralDigest = createHash('sha256').update(astralMaterial).digest('hex');
  await assert.rejects(database.query(`SELECT canonical_v4.runtime_append_command(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [actorId, 'role-astral-overflow', astralDigest, astralMaterial, source.state.generation,
    'create-root', topic.id, null, null, null, astralBody, null, 'contribution-role-astral', stamp]),
  { code: 'P1003' });
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.contributions
    WHERE id='contribution-role-astral'`)).rows[0].count), 0);
});
