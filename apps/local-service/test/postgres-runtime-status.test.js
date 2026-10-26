import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPostgresRuntimeStatus } from '../src/ops/postgres-runtime-status.js';
import { BROWSER_MODEL_ID } from '../src/domain/learned-sources.js';

const limits = () => ({ maximumSources: 131072, maximumUnits: 32 * 1024 * 1024, maximumChunks: 512, chunkSize: 256 });
function fixture() {
  return {
    counts: { revision: '9', catalog_version: '4', matching_version: '3', sources: '5', learned_sources: '3',
      topics: '4', discussions: '4', embeddings: '3', memberships: '4', fixed_references: '2', contributions: '8' },
    jobs: [{ job_class: 'crawler', state: 'complete', count: '17' }, { job_class: 'interactive', state: 'pending', count: '1' }],
    connections: { full_visibility: true, database_connections: '7', server_client_connections: '9', app: '2', worker: '1', dashboard: '1', crawler: '0', maximum_connections: '100' },
    metadata: Array.from({ length: 3 }, (_, index) => ({ id: `PRIVATE_ID_${index}😀`, url: `https://example.org/ü/${index}#PRIVATE_FRAGMENT`,
      title: `PRIVATE_TITLE_${index}😀`, ordinal: String(index * 256), model_id: BROWSER_MODEL_ID, dimensions: 384,
      extractor_version: 'main-text-prefix/v1', has_link: true, manual_topic: index === 1 ? 'PRIVATE_TOPIC_😀' : null })),
  };
}
function database(input, { failureAt = 0, transactionFails = false } = {}) {
  const calls = [];
  return {
    dialect: 'pg', calls,
    async query() { assert.fail('collector must only use its pinned transaction'); },
    async transaction(work) {
      if (transactionFails) throw Error('PRIVATE_SQL_PASSWORD_SECRET');
      return work({ async query(sql, parameters = []) {
        calls.push({ sql, parameters });
        if (failureAt === calls.length) throw Error('PRIVATE_SQL_PASSWORD_SECRET');
        if (sql.startsWith('SET ')) return { rows: [] };
        if (sql.includes('FROM canonical_v4.runtime_state')) return { rows: [input.counts] };
        if (sql.includes('FROM canonical_v4.ingestion_jobs')) return { rows: input.jobs };
        if (sql.includes('FROM pg_stat_activity')) return { rows: [input.connections] };
        if (sql.includes('ORDER BY source.ordinal')) return { rows: input.metadata };
        assert.fail('unexpected diagnostic query');
      } });
    },
  };
}

test('operator status pins strict readonly MVCC and returns exact UTF16/normalized-URL guard units without content', async () => {
  const input = fixture(), db = database(input), capacityLimits = limits();
  const result = await collectPostgresRuntimeStatus({ database: db, capacityLimits });
  assert.equal(result.status, 'available');
  assert.equal(db.calls[0].sql, 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(db.calls[1].sql, "SET LOCAL statement_timeout='5s'");
  assert.equal(db.calls.at(-1).parameters.at(-1), 131073);
  assert.match(db.calls.find(call => call.sql.includes('FROM pg_stat_activity')).sql,
    /application_name IN \('murmingle-ingest-worker','murmingle-ingest-worker-timed'\)\) AS worker/u);
  const expected = input.metadata.reduce((sum, row) => {
    const url = new URL(row.url); url.hash = '';
    return sum + row.id.length + url.toString().length + row.title.length + (row.manual_topic?.length ?? 0) + row.model_id.length + row.dimensions;
  }, 0);
  assert.equal(result.related.usedUnits, expected);
  assert.equal(result.related.remainingUnits, capacityLimits.maximumUnits - expected);
  assert.equal(result.related.occupiedChunks, 3); assert.equal(result.related.eligibleSources, 3);
  assert.equal(result.related.integrityVerified, false); assert.equal(result.related.overCapacity, false);
  assert.deepEqual(result.connections, { status: 'available', app: 2, worker: 1, dashboard: 1, crawler: 0, databaseTotal: 7,
    serverClientTotal: 9, maximum: 100, otherDatabaseClients: 3, daemonLivenessKnown: false });
  assert.deepEqual(result.queue.crawler, { pending: 0, leased: 0, complete: 17, failed: 0, cancelled: 0 });
  assert.equal(result.canonical.contributions, 8);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.related) && Object.isFrozen(result.queue.crawler));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|https|example|model_id|main-text|token|payload/u);
  for (const { sql } of db.calls) {
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/iu);
    assert.doesNotMatch(sql, /\b(?:payload|values_double|request_material|authority_token|usename|query|accounts|private_chats|crawl_urls)\b/iu);
  }
});

test('restricted statistics visibility is unverifiable, never invented zero connection counts', async () => {
  const input = fixture();
  input.connections.full_visibility = false;
  for (const name of ['app', 'worker', 'dashboard', 'crawler', 'database_connections', 'server_client_connections']) {
    Object.defineProperty(input.connections, name, { enumerable: true, get() { assert.fail('hidden counts must not be read'); } });
  }
  const db = database(input);
  const result = await collectPostgresRuntimeStatus({ database: db, capacityLimits: limits() });
  assert.equal(result.status, 'available');
  assert.deepEqual(result.connections, { status: 'unverifiable', maximum: 100, daemonLivenessKnown: false });
  assert.equal(result.related.eligibleSources, 3);
  const sql = db.calls.find(call => call.sql.includes('FROM pg_stat_activity')).sql;
  assert.match(sql, /pg_has_role\(current_user,'pg_read_all_stats','USAGE'\)/u);
  assert.match(sql, /SELECT rolsuper FROM pg_roles WHERE rolname=current_user/u);
});

test('explicit current limits govern over-capacity units/chunks and are copied before awaiting', async () => {
  const input = fixture();
  const capacityLimits = { ...limits(), maximumUnits: 1, maximumChunks: 1, chunkSize: 128 };
  const pending = collectPostgresRuntimeStatus({ database: database(input), capacityLimits });
  capacityLimits.maximumUnits = 999999;
  const result = await pending;
  assert.equal(result.status, 'available'); assert.equal(result.related.maximumUnits, 1);
  assert.equal(result.related.overCapacity, true); assert.equal(result.related.remainingUnits, 0);
  assert.equal(result.related.occupiedChunks, 3); assert.equal(result.related.chunkSize, 128);
});

test('missing or beyond-bounded metadata is unverifiable, never an undercounted capacity estimate', async () => {
  for (const adjust of [
    input => { input.counts.learned_sources = '131073'; input.counts.sources = '131073'; },
    input => { input.metadata = Array(131074).fill(input.metadata[0]); },
    input => { input.metadata.push({ ...input.metadata[0], id: 'extra', ordinal: '1000' }); },
    input => { input.metadata[1].has_link = false; },
  ]) {
    const input = fixture(); adjust(input);
    assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(input), capacityLimits: limits() }), { status: 'unverifiable' });
  }
});

test('invalid metadata, duplicate identities/ordinals and unsafe URLs fail closed without raw error details', async () => {
  const changes = [
    row => { row.url = 'https://PRIVATE:SECRET@example.org/'; }, row => { row.url = 'javascript:PRIVATE_SECRET'; },
    row => { row.title = 'PRIVATE\u0000SECRET'; }, row => { row.id = ''; }, row => { row.ordinal = '9007199254740992'; },
    row => { row.dimensions = 1537; }, row => { row.dimensions = 0; }, row => { row.model_id = 'PRIVATE_MODEL_SECRET'; },
    row => { row.extractor_version = 'PRIVATE_EXTRACTOR_SECRET'; }, row => { row.manual_topic = {}; },
  ];
  for (const change of changes) {
    const input = fixture(); change(input.metadata[0]);
    assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(input), capacityLimits: limits() }), { status: 'unverifiable' });
  }
  for (const field of ['id', 'ordinal']) {
    const input = fixture(); input.metadata[1][field] = input.metadata[0][field];
    assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(input), capacityLimits: limits() }), { status: 'unverifiable' });
  }
});

test('SQL failures and malformed aggregate/queue/connection results only return the fixed unverifiable union', async () => {
  for (const failureAt of [1, 2, 3, 4, 5, 6])
    assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(fixture(), { failureAt }), capacityLimits: limits() }), { status: 'unverifiable' });
  assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(fixture(), { transactionFails: true }), capacityLimits: limits() }), { status: 'unverifiable' });
  for (const change of [
    input => { input.counts.revision = '-1'; }, input => { input.counts.learned_sources = '6'; },
    input => { input.jobs[0].state = 'PRIVATE_STATE'; }, input => { input.jobs.push(input.jobs[0]); },
    input => { input.connections.app = '100'; }, input => { input.connections.maximum_connections = '0'; },
    input => { input.connections.full_visibility = null; },
  ]) {
    const input = fixture(); change(input);
    assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(input), capacityLimits: limits() }), { status: 'unverifiable' });
  }
});

test('getter/proxy inputs cannot execute while validating metadata or limits', async () => {
  let calls = 0;
  const input = fixture();
  Object.defineProperty(input.metadata[0], 'id', { enumerable: true, get() { calls++; throw Error('PRIVATE_SECRET'); } });
  assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(input), capacityLimits: limits() }), { status: 'unverifiable' });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { calls++; throw Error('PRIVATE_SECRET'); }, getPrototypeOf() { calls++; throw Error('PRIVATE_SECRET'); } });
  await assert.rejects(collectPostgresRuntimeStatus({ database: database(fixture()), capacityLimits: proxy }),
    error => error instanceof TypeError && error.message === 'Invalid PostgreSQL runtime status dependencies');
  input.metadata[0] = proxy;
  assert.deepEqual(await collectPostgresRuntimeStatus({ database: database(input), capacityLimits: limits() }), { status: 'unverifiable' });
  assert.equal(calls, 0);
});
