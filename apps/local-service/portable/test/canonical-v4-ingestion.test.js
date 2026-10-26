import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPGliteDatabase } from '../src/database.js';
import {
  bootstrapCanonicalV4,
  migrateCanonicalV4,
  readCanonicalV4MigrationManifest,
} from '../canonical-v4/index.js';
import {
  CANONICAL_V4_RIDGE_PARAMETER_SHA256,
  createCanonicalV4IngestionRepository,
} from '../canonical-v4/ingestion-repository.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import { BROWSER_MODEL_ID, readLearnedIngest } from '../../src/domain/learned-sources.js';
import { createPostgresInteractiveIngestion } from '../../src/application/postgres-interactive-ingestion.js';
import { createPostgresCrawlerClient } from '../../src/crawler/postgres-ingest-client.js';
import {
  RUNTIME_FIXTURE_REVISION,
  seedCanonicalV4RuntimeFixture,
} from './canonical-v4-runtime-fixture.js';

const FLOOR = 0.8639003810829322;
const unit = (angle = 0) => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const digest = (text) => createHash('sha256').update(text).digest('hex');

function request(fixture, operationId, suffix = operationId, angle = 0) {
  return {
    expected: { generation: fixture.generation, revision: fixture.revision },
    operationId,
    url: `https://example.org/canonical-v4-ingestion/${suffix}`,
    title: `Ingestion ${suffix}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: unit(angle) },
    extractorVersion: 'main-text-prefix/v1',
  };
}

async function context(t) {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  const repository = createCanonicalV4IngestionRepository({ database });
  return { database, fixture, repository };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test('migration 004 initializes every runtime allocator before or after data', async (t) => {
  const { database, repository } = await context(t);
  assert.deepEqual(await repository.health(), { schemaVersion: 9 });
  const sequences = [
    ['topic_ordinal_sequence', 2],
    ['discussion_ordinal_sequence', 2],
    ['source_ordinal_sequence', 3],
    ['source_link_ordinal_sequence', 3],
    ['contribution_ordinal_sequence', 1],
    ['ingestion_job_ordinal_sequence', 0],
  ];
  for (const [name, expected] of sequences) {
    const { rows } = await database.query(`SELECT nextval('canonical_v4.${name}') AS ordinal`);
    assert.equal(Number(rows[0].ordinal), expected, name);
  }
});

test('durable queue preserves exact operation identity and wipes revoked material', async (t) => {
  const { database, fixture, repository } = await context(t);
  const input = request(fixture, 'operation-queue-replay');
  const first = await repository.enqueueInteractive(input,
    { authorityToken: 'authority-first', authoritySeconds: 30 });
  assert.deepEqual({ state: first.state, ordinal: first.ordinal, replayed: first.replayed,
    jobClass: first.jobClass, authorityToken: first.authorityToken }, {
    state: 'pending', ordinal: 0, replayed: false,
    jobClass: 'interactive', authorityToken: 'authority-first',
  });
  const replay = await repository.enqueueInteractive(
    { ...input, expected: { ...input.expected, revision: input.expected.revision + 99 } },
    { authorityToken: 'authority-replay', authoritySeconds: 30 });
  assert.equal(replay.replayed, true);
  assert.equal(replay.ordinal, first.ordinal);
  assert.equal(replay.operationDigest, first.operationDigest);
  assert.equal(replay.authorityToken, 'authority-replay');
  await rejectsCode(repository.enqueueInteractive({ ...input, title: 'Changed operation bytes' },
    { authorityToken: 'authority-collision', authoritySeconds: 30 }), 'conflict');

  const claimed = await repository.claim({ workerId: 'worker-one', leaseToken: 'lease-one', leaseSeconds: 30 });
  assert.equal(claimed.operationId, input.operationId);
  assert.equal(claimed.operationDigest, first.operationDigest);
  assert.equal(claimed.requestMaterial, JSON.stringify({ url: input.url, title: input.title,
    embedding: { modelId: BROWSER_MODEL_ID, values: unit() }, extractorVersion: input.extractorVersion }));
  assert.equal(claimed.input.operationId, input.operationId);
  assert.equal(await repository.claim({ workerId: 'worker-two' }), null,
    'the singleton lane admits only one matcher');
  assert.equal(await repository.renewLease({ workerId: 'wrong-worker', operationId: input.operationId,
    leaseToken: claimed.leaseToken, leaseSeconds: 30 }), false);
  assert.equal(await repository.renewLease({ workerId: 'worker-one', operationId: input.operationId,
    leaseToken: claimed.leaseToken, leaseSeconds: 30 }), true);
  assert.equal(await repository.renewAuthority({ operationId: input.operationId,
    operationDigest: first.operationDigest, authorityToken: 'authority-first', authoritySeconds: 30 }), false,
  'a replay atomically replaces the old authority witness');
  assert.equal(await repository.renewAuthority({ operationId: input.operationId,
    operationDigest: first.operationDigest, authorityToken: 'authority-replay', authoritySeconds: 1 }), true);
  assert.deepEqual((await database.query(`SELECT
    job.lease_until=lane.active_lease_until AS mirrors_lane,
    job.lease_until<=job.authority_until AS bounded_by_authority
    FROM canonical_v4.ingestion_jobs AS job CROSS JOIN canonical_v4.catalog_ingest_lane AS lane
    WHERE job.operation_id=$1`, [input.operationId])).rows[0],
  { mirrors_lane: true, bounded_by_authority: true });
  assert.equal(await repository.revokeAuthority({ operationId: input.operationId,
    operationDigest: first.operationDigest, authorityToken: 'authority-replay' }), true);

  assert.deepEqual((await database.query(`SELECT state,request_material,source_url,authority_token,
    authority_until,worker_id,lease_token,lease_until,terminal_code
    FROM canonical_v4.ingestion_jobs WHERE operation_id=$1`, [input.operationId])).rows[0], {
    state: 'cancelled', request_material: null, source_url: null, authority_token: null,
    authority_until: null, worker_id: null, lease_token: null, lease_until: null,
    terminal_code: 'authority-revoked',
  });
  const terminalReplay = await repository.enqueueInteractive(input,
    { authorityToken: 'authority-after-terminal', authoritySeconds: 30 });
  assert.equal(terminalReplay.state, 'cancelled');
  assert.equal(terminalReplay.replayed, true);
  assert.equal(terminalReplay.authorityToken, null);
  assert.equal(await repository.failClaim(claimed, { code: 'worker-failed' }), false,
    'a revoked claim is no longer worker-authoritative');
});

test('claim preserves once-normalized coordinates without a second floating-point rewrite', async (t) => {
  const { database, fixture, repository } = await context(t);
  let state = 30;
  const raw = Array.from({ length: 384 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 31 - 1;
  });
  const rawNorm = Math.hypot(...raw);
  const browserValues = raw.map((value) => value / rawNorm);
  const browserRequest = { ...request(fixture, 'operation-once-normalized'),
    title: 'Quoted "title" \\ solidus / emoji \u{1F30D} separators \u2028\u2029',
    embedding: { modelId: BROWSER_MODEL_ID, values: browserValues } };
  const accepted = readLearnedIngest(browserRequest);
  const acceptedValues = accepted.embedding.values;
  const secondNorm = Math.hypot(...acceptedValues);
  assert.notEqual(secondNorm, 1);
  assert.notEqual(JSON.stringify(acceptedValues),
    JSON.stringify(acceptedValues.map((value) => value / secondNorm)));
  const queued = await repository.enqueueInteractive(
    browserRequest,
    { authorityToken: 'authority-once-normalized', authoritySeconds: 30 });
  const claimed = await repository.claim({ workerId: 'worker-once-normalized',
    leaseToken: 'lease-once-normalized', leaseSeconds: 30 });
  assert.equal(claimed.operationDigest, queued.operationDigest);
  assert.equal(claimed.input.title, browserRequest.title);
  assert.deepEqual(claimed.input.embedding.values, acceptedValues);
  assert.equal(claimed.requestMaterial, JSON.stringify({ url: accepted.url, title: accepted.title,
    embedding: accepted.embedding, extractorVersion: accepted.extractorVersion }));
  const applied = await repository.apply(claimed, { representedValues: unit(0.2) });
  const stored = (await database.query(
    'SELECT payload FROM canonical_v4.embeddings WHERE source_id=$1', [applied.sourceId])).rows[0];
  assert.deepEqual(JSON.parse(stored.payload).values, acceptedValues,
    'apply revalidates the admitted coordinates without normalizing them again');
  assert.deepEqual(await repository.status({ operationId: browserRequest.operationId,
    operationDigest: queued.operationDigest }), { state: 'complete', result: applied });
  assert.deepEqual(await repository.receipt({ operationId: browserRequest.operationId,
    operationDigest: queued.operationDigest }), applied);
});

test('crawler and interactive adapters preserve one normalization through a real durable receipt', async (t) => {
  const { database, fixture, repository } = await context(t);
  const initialVersion = { generation: fixture.generation, revision: fixture.revision };
  let state = 30;
  const raw = Array.from({ length: 384 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 31 - 1;
  });
  const norm = Math.hypot(...raw);
  const browserValues = raw.map((value) => value / norm);
  const applyNext = async () => {
    const claim = await repository.claim({ workerId: 'adapter-worker',
      leaseToken: `adapter-lease-${state++}`, leaseSeconds: 30 });
    assert.ok(claim, 'the adapter admitted its operation before polling');
    await repository.apply(claim, { representedValues: unit(0.2) });
  };

  const crawlerRepresentation = {
    url: 'https://example.org/canonical-v4-ingestion/crawler-adapter-exactness',
    title: 'Crawler adapter exactness',
    embedding: { modelId: BROWSER_MODEL_ID, values: browserValues },
    extractorVersion: 'crawler-static-html-prefix/v1',
  };
  const crawler = createPostgresCrawlerClient({
    readClient: {
      version: async () => initialVersion,
      knownSourceUrls: async () => ({ version: initialVersion, urls: [] }),
    },
    ingestionRepository: repository,
    nextAuthorityToken: () => 'adapter-crawler-authority',
    now: (() => { let clock = 1_000; return () => clock += 100; })(),
    sleep: applyNext,
  });
  const crawlerResult = await crawler.ingest(crawlerRepresentation,
    'operation-crawler-adapter-exactness', initialVersion);
  const crawlerAccepted = readLearnedIngest({ expected: initialVersion,
    operationId: 'operation-crawler-adapter-exactness', ...crawlerRepresentation });
  const crawlerStored = (await database.query(
    'SELECT payload FROM canonical_v4.embeddings WHERE source_id=$1', [crawlerResult.sourceId])).rows[0];
  assert.deepEqual(JSON.parse(crawlerStored.payload).values, crawlerAccepted.embedding.values);

  const interactiveRequest = {
    expected: crawlerResult.version,
    operationId: 'operation-interactive-adapter-exactness',
    url: 'https://example.org/canonical-v4-ingestion/interactive-adapter-exactness',
    title: 'Interactive adapter exactness',
    embedding: { modelId: BROWSER_MODEL_ID, values: browserValues },
    extractorVersion: 'main-text-prefix/v1',
  };
  const interactive = createPostgresInteractiveIngestion({ repository,
    nextAuthorityToken: () => 'adapter-interactive-authority',
    now: (() => { let clock = 2_000; return () => clock += 100; })(),
    sleep: applyNext });
  const interactiveResult = await interactive.ingest(interactiveRequest);
  const interactiveAccepted = readLearnedIngest(interactiveRequest);
  const interactiveStored = (await database.query(
    'SELECT payload FROM canonical_v4.embeddings WHERE source_id=$1', [interactiveResult.sourceId])).rows[0];
  assert.deepEqual(JSON.parse(interactiveStored.payload).values, interactiveAccepted.embedding.values);
});

test('SQL canonical binary64 rendering matches JSON.stringify boundaries and deterministic samples', async (t) => {
  const { database } = await context(t);
  let state = 0x9e3779b9;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const view = new DataView(new ArrayBuffer(8));
  const values = [0, -0, 1, -1, 9.999999999999997e-7, 1e-6, 1.0000000000000002e-6,
    999999999999999900000, 1e21, 1.0000000000000001e21, 5e-324,
    Number.MIN_VALUE, Number.MAX_VALUE, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER,
    1000000000000000128];
  while (values.length < 4112) {
    view.setUint32(0, next());
    view.setUint32(4, next());
    const value = view.getFloat64(0);
    if (Number.isFinite(value)) values.push(value);
  }
  await database.exec('SET extra_float_digits=-15');
  const { rows } = await database.query(`SELECT
    canonical_v4.ingest_json_number(value) AS rendered
    FROM unnest($1::double precision[]) WITH ORDINALITY AS input(value,ordinal)
    ORDER BY ordinal`, [values]);
  await database.exec('RESET extra_float_digits');
  assert.deepEqual(rows.map(({ rendered }) => rendered), values.map((value) => JSON.stringify(value)));
});

test('queue bounds each class independently and prevents concurrent work for one URL', async (t) => {
  const { fixture, repository } = await context(t);
  for (let index = 0; index < 8; index += 1)
    await repository.enqueueInteractive(request(fixture, `operation-capacity-i-${index}`),
      { authorityToken: `authority-capacity-i-${index}`, authoritySeconds: 30 });
  await rejectsCode(repository.enqueueInteractive(request(fixture, 'operation-capacity-i-8'),
    { authorityToken: 'authority-capacity-i-8', authoritySeconds: 30 }), 'capacity');
  const crawler = await repository.enqueueCrawler(request(fixture, 'operation-capacity-c-0'),
    { authorityToken: 'authority-capacity-c-0', authoritySeconds: 30 });
  assert.equal(crawler.state, 'pending');
  await rejectsCode(repository.enqueueCrawler(
    request(fixture, 'operation-capacity-same-url', 'operation-capacity-c-0'),
    { authorityToken: 'authority-capacity-same-url', authoritySeconds: 30 }), 'conflict');
  const retainedCollision = request(fixture, 'operation-retained-url-collision');
  retainedCollision.url = `https://example.org/canonical-v4-runtime/a`;
  await rejectsCode(repository.enqueueCrawler(retainedCollision,
    { authorityToken: 'authority-retained-url-collision', authoritySeconds: 30 }), 'forbidden');
});

test('storage enforces one leased matcher even against owner-side corruption', async (t) => {
  const { database, fixture, repository } = await context(t);
  await repository.enqueueInteractive(request(fixture, 'operation-single-lease-a'),
    { authorityToken: 'authority-single-lease-a', authoritySeconds: 30 });
  await repository.enqueueCrawler(request(fixture, 'operation-single-lease-b'),
    { authorityToken: 'authority-single-lease-b', authoritySeconds: 30 });
  const claimed = await repository.claim({ workerId: 'worker-single-lease-a',
    leaseToken: 'lease-single-lease-a', leaseSeconds: 30 });
  assert.equal(claimed.operationId, 'operation-single-lease-a');
  await assert.rejects(database.query(`UPDATE canonical_v4.ingestion_jobs SET
    state='leased',attempts=1,worker_id='corrupt-worker',lease_token='corrupt-lease',
    lease_until=authority_until WHERE operation_id='operation-single-lease-b'`), { code: '23505' });
});

test('durable scheduler is FIFO per class and forces crawler service after four interactive claims', async (t) => {
  const { fixture, repository } = await context(t);
  const admissions = new Map();
  for (let index = 1; index <= 5; index += 1) {
    const input = request(fixture, `operation-fair-i-${index}`);
    const admitted = await repository.enqueueInteractive(input,
      { authorityToken: `authority-fair-i-${index}`, authoritySeconds: 30 });
    admissions.set(input.operationId, { digest: admitted.operationDigest,
      token: admitted.authorityToken });
  }
  for (let index = 1; index <= 2; index += 1) {
    const input = request(fixture, `operation-fair-c-${index}`);
    const admitted = await repository.enqueueCrawler(input,
      { authorityToken: `authority-fair-c-${index}`, authoritySeconds: 30 });
    admissions.set(input.operationId, { digest: admitted.operationDigest,
      token: admitted.authorityToken });
  }
  const order = [];
  for (let index = 0; index < 7; index += 1) {
    const claimed = await repository.claim({ workerId: 'worker-fair',
      leaseToken: `lease-fair-${index}`, leaseSeconds: 30 });
    order.push(claimed.operationId);
    const authority = admissions.get(claimed.operationId);
    assert.equal(await repository.revokeAuthority({ operationId: claimed.operationId,
      operationDigest: authority.digest, authorityToken: authority.token }), true);
  }
  assert.deepEqual(order, [
    'operation-fair-i-1', 'operation-fair-i-2', 'operation-fair-i-3', 'operation-fair-i-4',
    'operation-fair-c-1', 'operation-fair-i-5', 'operation-fair-c-2',
  ]);
});

test('expired authority is terminal and three abandoned leases fail with no retained material', async (t) => {
  const { database, fixture, repository } = await context(t);
  const abandonedInput = request(fixture, 'operation-abandoned');
  await repository.enqueueCrawler(abandonedInput,
    { authorityToken: 'authority-abandoned', authoritySeconds: 30 });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claimed = await repository.claim({ workerId: 'worker-abandoned',
      leaseToken: `lease-abandoned-${attempt}`, leaseSeconds: 30 });
    assert.equal(claimed.attempts, attempt);
    const expired = await database.query(`UPDATE canonical_v4.ingestion_jobs
      SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1
      RETURNING lease_until`, [abandonedInput.operationId]);
    await database.query(`UPDATE canonical_v4.catalog_ingest_lane
      SET active_lease_until=$1 WHERE singleton=true`, [expired.rows[0].lease_until]);
  }
  assert.equal(await repository.claim({ workerId: 'worker-abandoned',
    leaseToken: 'lease-abandoned-terminal', leaseSeconds: 30 }), null);
  assert.deepEqual((await database.query(`SELECT state,request_material,source_url,authority_token,
    terminal_code FROM canonical_v4.ingestion_jobs WHERE operation_id=$1`,
  [abandonedInput.operationId])).rows[0], {
    state: 'failed', request_material: null, source_url: null, authority_token: null,
    terminal_code: 'lease-exhausted',
  });

  const expiredInput = request(fixture, 'operation-expired-authority');
  await repository.enqueueInteractive(expiredInput,
    { authorityToken: 'authority-expired', authoritySeconds: 30 });
  await database.query(`UPDATE canonical_v4.ingestion_jobs
    SET authority_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1`,
  [expiredInput.operationId]);
  assert.equal(await repository.claim({ workerId: 'worker-expiry' }), null);
  assert.deepEqual((await database.query(`SELECT state,request_material,source_url,authority_token,
    terminal_code FROM canonical_v4.ingestion_jobs WHERE operation_id=$1`,
  [expiredInput.operationId])).rows[0], {
    state: 'cancelled', request_material: null, source_url: null, authority_token: null,
    terminal_code: 'authority-expired',
  });

  const exhaustedInput = request(fixture, 'operation-expired-exhausted-replay');
  const exhausted = await repository.enqueueCrawler(exhaustedInput,
    { authorityToken: 'authority-expired-exhausted', authoritySeconds: 30 });
  await repository.claim({ workerId: 'worker-expired-exhausted',
    leaseToken: 'lease-expired-exhausted', leaseSeconds: 30 });
  await database.query(`UPDATE canonical_v4.ingestion_jobs
    SET attempts=3,authority_until=clock_timestamp()-interval '1 second'
    WHERE operation_id=$1`, [exhaustedInput.operationId]);
  const terminalReplay = await repository.enqueueCrawler(exhaustedInput,
    { authorityToken: 'authority-expired-exhausted-replay', authoritySeconds: 30 });
  assert.equal(terminalReplay.operationDigest, exhausted.operationDigest);
  assert.equal(terminalReplay.state, 'failed');
  assert.equal(terminalReplay.attempts, 3);
  assert.deepEqual((await database.query(`SELECT request_material,source_url,authority_token,
    terminal_code FROM canonical_v4.ingestion_jobs WHERE operation_id=$1`,
  [exhaustedInput.operationId])).rows[0], {
    request_material: null, source_url: null, authority_token: null,
    terminal_code: 'lease-exhausted',
  });
});

test('exact double Ridge scan is exhaustive, threshold-inclusive, sorted and fail-closed', async (t) => {
  const { database, fixture, repository } = await context(t);
  const atFloor = [FLOOR, Math.sqrt(1 - FLOOR * FLOOR), ...Array(382).fill(0)];
  await database.query(`INSERT INTO canonical_v4.fixed_references
    (topic_id,payload,source_id,parameter_sha256,values_double)
    VALUES($1,'{}',$2,$3,$4::double precision[]),($5,'{}',$6,$3,$7::double precision[])`,
  [fixture.topicB, fixture.sourceB, CANONICAL_V4_RIDGE_PARAMETER_SHA256, atFloor,
    fixture.topicA, fixture.sourceA, unit()]);
  const matched = await repository.exactMatches(unit());
  assert.equal(matched.complete, true);
  assert.deepEqual(matched.topicIds, [fixture.topicA, fixture.topicB]);
  assert.equal(matched.matches[1].similarity, FLOOR);
  assert.equal(Object.isFrozen(matched), true);
  assert.equal((await database.query(`SELECT canonical_v4.ingest_ridge_predicate(
    $1::double precision[],$2::double precision[]) AS admitted`, [unit(), atFloor])).rows[0].admitted, true);

  const below = [FLOOR - 1e-10, Math.sqrt(1 - (FLOOR - 1e-10) ** 2), ...Array(382).fill(0)];
  await database.query(`UPDATE canonical_v4.fixed_references SET values_double=$2::double precision[]
    WHERE topic_id=$1`, [fixture.topicB, below]);
  assert.deepEqual((await repository.exactMatches(unit())).topicIds, [fixture.topicA]);
  const orthogonal = [0, 0, 1, ...Array(381).fill(0)];
  assert.deepEqual((await repository.exactMatches(orthogonal)).topicIds, []);
  await rejectsCode(repository.exactMatches(Array(384).fill(0)), 'invalid');

  await database.query(`UPDATE canonical_v4.fixed_references SET parameter_sha256=$2
    WHERE topic_id=$1`, [fixture.topicB, '0'.repeat(64)]);
  await rejectsCode(repository.exactMatches(unit()), 'storage-corrupt');
  await database.query(`UPDATE canonical_v4.fixed_references
    SET parameter_sha256=$2,values_double=ARRAY['NaN'::double precision]
      || array_fill(0.0::double precision,ARRAY[383]) WHERE topic_id=$1`,
  [fixture.topicB, CANONICAL_V4_RIDGE_PARAMETER_SHA256]);
  await rejectsCode(repository.exactMatches(unit()), 'storage-corrupt');
});

async function firstThree(database) {
  const migrations = await readCanonicalV4MigrationManifest();
  await database.exec('CREATE EXTENSION vector; CREATE SCHEMA canonical_v4');
  await database.exec('CREATE TABLE canonical_v4.schema_migrations(version integer PRIMARY KEY,hash text NOT NULL)');
  for (const migration of migrations.slice(0, 3)) {
    await database.exec(migration.sql);
    await database.query('INSERT INTO canonical_v4.schema_migrations(version,hash) VALUES($1,$2)',
      [migration.version, migration.hash]);
  }
}

async function insertBareSource(database, id, ordinal, url,
  provenance = 'owner-local-page-embedding/v1') {
  await database.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'sources')", [id]);
  await database.query(`INSERT INTO canonical_v4.sources
    (id,ordinal,payload,url,title,provenance,has_embedding)
    VALUES($1,$2,$3,$4,$5,$6,false)`,
  [id, ordinal, JSON.stringify({ id, url, title: id, provenance }), url, id, provenance]);
}

test('migration duplicate preflight refuses ambiguous learned URLs and operation IDs', async (t) => {
  await t.test('learned URL', async (t) => {
    const database = await createPGliteDatabase();
    t.after(() => database.close());
    await firstThree(database);
    await insertBareSource(database, 'source-duplicate-url-a', 0, 'https://example.org/duplicate',
      'synthetic-owner-local/v1');
    await insertBareSource(database, 'source-duplicate-url-b', 1, 'https://example.org/duplicate');
    await assert.rejects(migrateCanonicalV4(database), { code: 'P1204' });
    assert.equal((await database.query("SELECT to_regclass('canonical_v4.ingestion_jobs') AS name")).rows[0].name, null);
  });
  await t.test('operation ID', async (t) => {
    const database = await createPGliteDatabase();
    t.after(() => database.close());
    await firstThree(database);
    await insertBareSource(database, 'source-duplicate-operation-a', 0, 'https://example.org/operation-a');
    await insertBareSource(database, 'source-duplicate-operation-b', 1, 'https://example.org/operation-b');
    for (const sourceId of ['source-duplicate-operation-a', 'source-duplicate-operation-b'])
      await database.query(`INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest)
        VALUES($1,'operation-duplicate',$2)`, [sourceId, '0'.repeat(64)]);
    await assert.rejects(migrateCanonicalV4(database), { code: 'P1204' });
    assert.equal((await database.query("SELECT to_regclass('canonical_v4.ingestion_jobs') AS name")).rows[0].name, null);
  });
});

test('migration 004 never rewinds an already allocated contribution ordinal', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await firstThree(database);
  assert.equal(Number((await database.query(
    "SELECT nextval('canonical_v4.contribution_ordinal_sequence') AS ordinal")).rows[0].ordinal), 0);
  await migrateCanonicalV4(database);
  assert.equal(Number((await database.query(
    "SELECT nextval('canonical_v4.contribution_ordinal_sequence') AS ordinal")).rows[0].ordinal), 1);
});

test('application and ingestion-worker roles have only their execute boundaries', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec(`CREATE ROLE murmingle_owner; CREATE ROLE murmingle_app;
    CREATE ROLE murmingle_crawler_submitter; CREATE ROLE murmingle_ingest_worker`);
  await bootstrapCanonicalV4(database);
  await database.exec('SET ROLE murmingle_owner');
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  await database.exec('SET ROLE murmingle_app');
  const repository = createCanonicalV4IngestionRepository({ database });
  assert.deepEqual(await repository.health(), { schemaVersion: 9 });
  const admission = await repository.enqueueInteractive(request(fixture, 'operation-role-boundary'),
    { authorityToken: 'authority-role-boundary', authoritySeconds: 30 });
  const directInput = readLearnedIngest(request(fixture, 'operation-direct-material'));
  const directMaterial = JSON.stringify({ url: directInput.url, title: directInput.title,
    embedding: directInput.embedding, extractorVersion: directInput.extractorVersion });
  const malformedMaterials = [
    directMaterial.replace('{"url"', '{ "url"'),
    JSON.stringify({ title: directInput.title, url: directInput.url,
      embedding: directInput.embedding, extractorVersion: directInput.extractorVersion }),
    directMaterial.replace('{"url":',
      `{"url":${JSON.stringify(directInput.url)},"url":`),
    directMaterial.replace('"values":[1,', '"values":[1.0,'),
  ];
  for (let index = 0; index < malformedMaterials.length; index += 1) {
    const material = malformedMaterials[index];
    await assert.rejects(database.query(`SELECT * FROM canonical_v4.ingest_enqueue_interactive(
      $1,$2,$3,$4,$5,$6,$7)`, [`operation-direct-malformed-${index}`, digest(material), material,
      fixture.generation, fixture.revision, `authority-direct-malformed-${index}`, 30]), { code: 'P1203' });
  }
  await database.exec('RESET ROLE; SET ROLE murmingle_owner');
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.ingestion_jobs
    WHERE operation_id LIKE 'operation-direct-malformed-%'`)).rows[0].count), 0);
  await database.exec('SET ROLE murmingle_app');
  const appPrivileges = (await database.query(`SELECT
    has_table_privilege(current_user,'canonical_v4.ingestion_jobs','SELECT') AS queue_select,
    has_table_privilege(current_user,'canonical_v4.ingestion_jobs','INSERT') AS queue_insert,
    has_sequence_privilege(current_user,'canonical_v4.ingestion_job_ordinal_sequence','USAGE') AS queue_sequence,
    has_function_privilege(current_user,
      'canonical_v4.ingest_enqueue_interactive(text,text,text,text,bigint,text,integer)','EXECUTE') AS enqueue_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_enqueue_crawler(text,text,text,text,bigint,text,integer)','EXECUTE') AS crawler_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_claim(text,text,integer)','EXECUTE') AS claim_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_ridge_scan(double precision[],text)','EXECUTE') AS scan_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_json_number(double precision)','EXECUTE') AS number_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_receipt(text,text)','EXECUTE') AS receipt_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_status(text,text)','EXECUTE') AS status_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)',
      'EXECUTE') AS apply_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_fail_claim(text,text,text,text)','EXECUTE') AS fail_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_correct_source(text,text,text,text,text,text)','EXECUTE') AS correct_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_forget_source(text,text)','EXECUTE') AS forget_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_delete_learned_topic(text,text,text)','EXECUTE') AS delete_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_clear_learned_data(text,text)','EXECUTE') AS clear_execute`)).rows[0];
  assert.deepEqual(appPrivileges, { queue_select: false, queue_insert: false, queue_sequence: false,
    enqueue_execute: true, crawler_execute: false, claim_execute: false, scan_execute: false,
    number_execute: false, receipt_execute: true, status_execute: true,
    apply_execute: false, fail_execute: false, correct_execute: true,
    forget_execute: true, delete_execute: true, clear_execute: true });
  await assert.rejects(database.query('SELECT * FROM canonical_v4.ingestion_jobs'), { code: '42501' });
  await assert.rejects(database.query("SELECT nextval('canonical_v4.ingestion_job_ordinal_sequence')"), { code: '42501' });

  await database.exec('RESET ROLE; SET ROLE murmingle_crawler_submitter');
  const crawlerPrivileges = (await database.query(`SELECT
    has_function_privilege(current_user,
      'canonical_v4.ingest_enqueue_interactive(text,text,text,text,bigint,text,integer)','EXECUTE') AS interactive_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_enqueue_crawler(text,text,text,text,bigint,text,integer)','EXECUTE') AS crawler_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_claim(text,text,integer)','EXECUTE') AS claim_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_json_number(double precision)','EXECUTE') AS number_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_receipt(text,text)','EXECUTE') AS receipt_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_status(text,text)','EXECUTE') AS status_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)',
      'EXECUTE') AS apply_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_fail_claim(text,text,text,text)','EXECUTE') AS fail_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_forget_source(text,text)','EXECUTE') AS forget_execute`)).rows[0];
  assert.deepEqual(crawlerPrivileges,
    { interactive_execute: false, crawler_execute: true, claim_execute: false, number_execute: false,
      receipt_execute: true, status_execute: true, apply_execute: false, fail_execute: false,
      forget_execute: false });
  assert.deepEqual(await repository.health(), { schemaVersion: 9 });
  await repository.enqueueCrawler(request(fixture, 'operation-crawler-role-boundary'),
    { authorityToken: 'authority-crawler-role-boundary', authoritySeconds: 30 });

  await database.exec('RESET ROLE; SET ROLE murmingle_ingest_worker');
  const workerPrivileges = (await database.query(`SELECT
    has_table_privilege(current_user,'canonical_v4.ingestion_jobs','SELECT') AS queue_select,
    has_table_privilege(current_user,'canonical_v4.ingestion_jobs','UPDATE') AS queue_update,
    has_function_privilege(current_user,
      'canonical_v4.ingest_enqueue_interactive(text,text,text,text,bigint,text,integer)','EXECUTE') AS enqueue_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_claim(text,text,integer)','EXECUTE') AS claim_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_ridge_scan(double precision[],text)','EXECUTE') AS scan_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_json_number(double precision)','EXECUTE') AS number_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_receipt(text,text)','EXECUTE') AS receipt_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_status(text,text)','EXECUTE') AS status_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)',
      'EXECUTE') AS apply_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_fail_claim(text,text,text,text)','EXECUTE') AS fail_execute,
    has_function_privilege(current_user,
      'canonical_v4.ingest_forget_source(text,text)','EXECUTE') AS forget_execute`)).rows[0];
  assert.deepEqual(workerPrivileges, { queue_select: false, queue_update: false,
    enqueue_execute: false, claim_execute: true, scan_execute: true, number_execute: false,
    receipt_execute: false, status_execute: false, apply_execute: true, fail_execute: true,
    forget_execute: false });
  assert.deepEqual(await repository.health(), { schemaVersion: 9 });
  assert.equal((await database.query(`SELECT canonical_v4.ingest_ridge_predicate(
    $1::double precision[],$1::double precision[]) AS matched`, [unit()])).rows[0].matched, true);
  const claim = await repository.claim({ workerId: 'worker-role-boundary',
    leaseToken: 'lease-role-boundary', leaseSeconds: 30 });
  assert.equal(claim.operationId, admission.operationId);
  assert.deepEqual((await repository.exactMatches(unit())).topicIds, []);
  assert.equal(await repository.failClaim(claim, { code: 'worker-failed' }), true);
  await assert.rejects(database.query('SELECT * FROM canonical_v4.ingestion_jobs'), { code: '42501' });
});

test('admission freshness is Source-scoped while exact replays remain stable', async (t) => {
  const { database, fixture, repository } = await context(t);
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1 WHERE singleton=true');
  const unrelated = request(fixture, 'operation-unrelated-revision');
  const accepted = await repository.enqueueCrawler(unrelated,
    { authorityToken: 'authority-unrelated-revision', authoritySeconds: 30 });
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1 WHERE singleton=true');
  const replay = await repository.enqueueCrawler(
    { ...unrelated, expected: { ...unrelated.expected, revision: unrelated.expected.revision + 99 } },
    { authorityToken: 'authority-current-replay', authoritySeconds: 30 });
  assert.equal(replay.operationDigest, accepted.operationDigest);
  assert.equal(replay.replayed, true);
  assert.equal(await repository.revokeAuthority({ operationId: unrelated.operationId,
    operationDigest: accepted.operationDigest, authorityToken: 'authority-current-replay' }), true);

  const currentRevision = Number((await database.query(
    'SELECT revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0].revision);
  const first = request({ ...fixture, revision: currentRevision },
    'operation-source-epoch-first', 'source-epoch', 0);
  await repository.enqueueCrawler(first,
    { authorityToken: 'authority-source-epoch-first', authoritySeconds: 30 });
  const firstClaim = await repository.claim({ workerId: 'worker-source-epoch-first',
    leaseToken: 'lease-source-epoch-first', leaseSeconds: 30 });
  const firstOutcome = await repository.apply(firstClaim, { representedValues: unit() });

  const staleChange = request({ ...fixture, revision: currentRevision },
    'operation-source-epoch-stale', 'source-epoch', .5);
  await rejectsCode(repository.enqueueCrawler(staleChange,
    { authorityToken: 'authority-source-epoch-stale', authoritySeconds: 30 }), 'conflict');
  const freshRevision = Number((await database.query(
    'SELECT revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0].revision);
  const freshChange = { ...staleChange, expected: { ...staleChange.expected, revision: freshRevision } };
  const freshAdmission = await repository.enqueueCrawler(freshChange,
    { authorityToken: 'authority-source-epoch-fresh', authoritySeconds: 30 });
  assert.equal(freshAdmission.state, 'pending');
  assert.equal(await repository.revokeAuthority({ operationId: freshChange.operationId,
    operationDigest: freshAdmission.operationDigest,
    authorityToken: 'authority-source-epoch-fresh' }), true);

  const beforeForget = Number((await database.query(
    'SELECT revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0].revision);
  await repository.lifecycle({ generation: fixture.generation, revision: beforeForget },
    { type: 'forget-source', sourceId: firstOutcome.sourceId });
  const staleAbsent = request({ ...fixture, revision: beforeForget },
    'operation-stale-after-forget', 'never-before-seen-after-forget');
  await rejectsCode(repository.enqueueCrawler(staleAbsent,
    { authorityToken: 'authority-stale-after-forget', authoritySeconds: 30 }), 'conflict');
});

test('admitted apply ignores unrelated revision advances but rejects a changed Source witness', async (t) => {
  const { database, fixture, repository } = await context(t);
  const admittedInput = request(fixture, 'operation-no-final-global-cas');
  await repository.enqueueInteractive(admittedInput,
    { authorityToken: 'authority-no-final-global-cas', authoritySeconds: 30 });
  const claim = await repository.claim({ workerId: 'worker-no-final-global-cas',
    leaseToken: 'lease-no-final-global-cas', leaseSeconds: 30 });
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1 WHERE singleton=true');
  const applied = await repository.apply(claim, { representedValues: unit() });
  assert.equal(applied.version.revision, RUNTIME_FIXTURE_REVISION + 2);

  const currentRevision = applied.version.revision;
  const changedInput = request({ ...fixture, revision: currentRevision },
    'operation-source-witness-changed', 'operation-no-final-global-cas', .5);
  await repository.enqueueInteractive(changedInput,
    { authorityToken: 'authority-source-witness-changed', authoritySeconds: 30 });
  const changedClaim = await repository.claim({ workerId: 'worker-source-witness-changed',
    leaseToken: 'lease-source-witness-changed', leaseSeconds: 30 });
  await database.query(`UPDATE canonical_v4.sources
    SET write_version=write_version+1 WHERE id=$1`, [applied.sourceId]);
  await rejectsCode(repository.apply(changedClaim, { representedValues: unit(.5) }), 'conflict');
  assert.deepEqual(await repository.status({ operationId: changedInput.operationId,
    operationDigest: changedClaim.operationDigest }),
  { state: 'failed', terminalCode: 'source-changed' });
});

test('claimed ingestion atomically creates a fixed-reference singleton and durable replay receipt', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  let id = 0;
  const repository = createCanonicalV4IngestionRepository({ database,
    nextId: (kind) => `${kind}-applied-${++id}`,
    now: () => '2026-10-13T18:00:00.000Z' });
  const input = request(fixture, 'operation-applied-singleton');
  const admitted = await repository.enqueueCrawler(input,
    { authorityToken: 'authority-applied-singleton', authoritySeconds: 30 });
  const receiptKey = { operationId: admitted.operationId, operationDigest: admitted.operationDigest };
  assert.equal((await repository.status(receiptKey)).state, 'pending');
  const claim = await repository.claim({ workerId: 'worker-applied-singleton',
    leaseToken: 'lease-applied-singleton', leaseSeconds: 30 });
  const outcome = await repository.apply(claim, { representedValues: unit() });
  assert.equal(outcome.sourceId, 'source-applied-1');
  assert.equal(outcome.topicId, 'topic-applied-2');
  assert.deepEqual(outcome.topicIds, ['topic-applied-2']);
  assert.equal(outcome.assignment, 'provisional');
  assert.equal(outcome.policyVersion, 'ridge1-fixed-reference-radius/v1');
  assert.deepEqual(await repository.receipt(receiptKey), outcome);
  assert.deepEqual(await repository.status(receiptKey), { state: 'complete', result: outcome });
  const { rows } = await database.query(`SELECT
    (SELECT count(*) FROM canonical_v4.sources WHERE id=$1) AS sources,
    (SELECT count(*) FROM canonical_v4.topic_memberships WHERE source_id=$1) AS memberships,
    (SELECT count(*) FROM canonical_v4.fixed_references WHERE topic_id=$2 AND source_id=$1) AS refs,
    (SELECT count(*) FROM canonical_v4.operation_receipts WHERE operation_id=$3) AS receipts,
    (SELECT state FROM canonical_v4.ingestion_jobs WHERE operation_id=$3) AS state`,
  [outcome.sourceId, outcome.topicId, input.operationId]);
  assert.deepEqual(rows[0], { sources: 1, memberships: 1, refs: 1, receipts: 1, state: 'complete' });
});

test('retained-only contexts create a null-reference singleton and reject represented coordinates', async (t) => {
  const { database, fixture, repository } = await context(t);
  const input = request(fixture, 'operation-retained-only-singleton');
  input.url = 'https://example.org/search?q=canonical-v4';
  input.title = 'Search results';
  await repository.enqueueCrawler(input,
    { authorityToken: 'authority-retained-only-singleton', authoritySeconds: 30 });
  const claim = await repository.claim({ workerId: 'worker-retained-only-singleton',
    leaseToken: 'lease-retained-only-singleton', leaseSeconds: 30 });
  await rejectsCode(repository.apply(claim, { representedValues: unit() }), 'invalid');
  const outcome = await repository.apply(claim, { representedValues: null });
  assert.deepEqual(outcome.topicIds, [outcome.topicId]);
  assert.deepEqual((await database.query(`SELECT source_id,parameter_sha256,values_double,payload
    FROM canonical_v4.fixed_references WHERE topic_id=$1`, [outcome.topicId])).rows[0],
  { source_id: null, parameter_sha256: null, values_double: null, payload: 'null' });
});

test('apply preserves overlap, manual pinning and fixed-reference lifecycle semantics', async (t) => {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  let id = 0, operation = 0;
  const repository = createCanonicalV4IngestionRepository({ database,
    nextId: (kind) => `${kind}-lifecycle-${++id}`,
    now: () => '2026-10-13T18:30:00.000Z' });
  const ingest = async (name, angle) => {
    const current = await repository.version?.() ?? (await database.query(
      'SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0];
    const input = request({ generation: current.generation,
      revision: Number(current.revision) }, `operation-lifecycle-${++operation}`, name, angle);
    const admitted = await repository.enqueueInteractive(input,
      { authorityToken: `authority-lifecycle-${operation}`, authoritySeconds: 30 });
    const claim = await repository.claim({ workerId: 'worker-lifecycle',
      leaseToken: `lease-lifecycle-${operation}`, leaseSeconds: 30 });
    return repository.apply(claim, { representedValues: unit(angle) });
  };
  const a = await ingest('a', -.4);
  const b = await ingest('b', .4);
  const c = await ingest('middle', 0);
  assert.notEqual(a.topicId, b.topicId);
  assert.deepEqual(c.topicIds, [a.topicId, b.topicId].sort());
  assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.topics')).rows[0].count), 4,
    'the overlapping page does not create a third learned Topic');

  const runtimeRepository = createCanonicalV4RuntimeRepository({ database,
    nextId: () => 'contribution-lifecycle-pinned-root',
    now: () => '2026-10-13T18:31:00.000Z' });
  const rootVersion = await runtimeRepository.version();
  const rooted = await runtimeRepository.command({ actorId: 'demo-alex',
    requestId: 'request-lifecycle-pinned-root', expected: rootVersion,
    command: { type: 'create-root', topicId: c.topicId,
      body: 'Keep this root at its original destination.', originSourceId: c.sourceId } });

  const version = (await database.query(
    'SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0];
  const corrected = await repository.lifecycle({ generation: version.generation,
    revision: Number(version.revision) }, { type: 'correct-source', sourceId: c.sourceId, topicId: b.topicId });
  assert.deepEqual(corrected.result.topicIds, [b.topicId]);
  assert.equal(corrected.result.assignment, 'confirmed');
  const pinnedRoot = (await database.query(`SELECT discussion_id,origin_source_id,anchor_source_id,payload
    FROM canonical_v4.contributions WHERE id=$1`, [rooted.result.contributionId])).rows[0];
  assert.equal(pinnedRoot.origin_source_id, c.sourceId);
  assert.equal(pinnedRoot.anchor_source_id, null);
  assert.deepEqual(JSON.parse(pinnedRoot.payload).anchor, { kind: 'topic', topicId: c.topicId });
  const changed = await ingest('middle', 2);
  assert.equal(changed.sourceId, c.sourceId);
  assert.deepEqual(changed.topicIds, [b.topicId]);
  assert.equal(changed.assignment, 'confirmed');

  const beforeForget = (await database.query(
    'SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0];
  await repository.lifecycle({ generation: beforeForget.generation,
    revision: Number(beforeForget.revision) }, { type: 'forget-source', sourceId: a.sourceId });
  assert.deepEqual((await database.query(`SELECT source_id,parameter_sha256,values_double,payload
    FROM canonical_v4.fixed_references WHERE topic_id=$1`, [a.topicId])).rows[0],
  { source_id: null, parameter_sha256: null, values_double: null, payload: 'null' });
  const replacement = await ingest('replacement', -.4);
  assert.notEqual(replacement.topicId, a.topicId,
    'forget disables an originating reference without replacement');

  let current = (await database.query(
    'SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0];
  const deleted = await repository.lifecycle({ generation: current.generation,
    revision: Number(current.revision) }, { type: 'delete-learned-topic', topicId: replacement.topicId,
    confirmation: 'DELETE TOPIC AND DISCUSSION' });
  assert.deepEqual(deleted.result.forgottenSourceIds, [replacement.sourceId]);
  current = (await database.query(
    'SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0];
  const cleared = await repository.lifecycle({ generation: current.generation,
    revision: Number(current.revision) }, { type: 'clear-learned-data', confirmation: 'CLEAR LEARNED DATA' });
  assert.deepEqual(new Set(cleared.result.forgottenSourceIds), new Set([b.sourceId, c.sourceId]));
  assert.ok(cleared.result.deletedTopicIds.includes(a.topicId));
  assert.ok(cleared.result.deletedTopicIds.includes(b.topicId));
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.sources
    WHERE provenance='owner-local-page-embedding/v1'`)).rows[0].count), 0);
});
