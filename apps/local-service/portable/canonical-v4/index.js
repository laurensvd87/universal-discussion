import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { assertValidPersistedState } from '../../src/domain/persisted-state.js';
import { FIXED_REFERENCE_STATE_SCHEMA } from '../../src/domain/demo-state.js';
import {
  assertNormalizedCatalogSchema,
  NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT,
} from '../../src/adapters/normalized-sqlite-repository.js';
import { sourceStamp } from '../../src/domain/source-threads.js';
import { inspectPageUrl } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

const TARGET_FORMAT = 'canonical-postgresql/v4-slice1';
const MIGRATION_FILES = Object.freeze([
  '001-canonical-v4.sql',
  '002-runtime-core.sql',
  '003-execute-only-command-boundary.sql',
  '004-ingestion-foundation.sql',
  '005-ingestion-apply-and-lifecycle.sql',
  '006-lifecycle-command-boundary.sql',
  '007-exact-ridge-scan-single-pass.sql',
  '008-independent-new-ingestion-admission.sql',
  '009-fail-fast-new-ingestion-locks.sql',
]);
const HIERARCHY_MIGRATION_FILES = Object.freeze([...MIGRATION_FILES,
  '010-semantic-hierarchy.sql', '011-semantic-discussion-feeds.sql',
  '012-semantic-stored-source-preparation.sql', '013-semantic-public-topic-metadata.sql',
  '014-semantic-source-containers.sql', '015-semantic-reply-witness.sql', '016-semantic-insight-reply.sql',
]);
const HIERARCHY17_MIGRATION_FILES = Object.freeze([...HIERARCHY_MIGRATION_FILES,
  '017-semantic-dashboard-counts.sql',
]);
const HIERARCHY18_MIGRATION_FILES = Object.freeze([...HIERARCHY17_MIGRATION_FILES,'018-automatic-topics.sql']);
export function canonicalV4SchemaVersion(profile = 'legacy9') {
  if (profile === 'legacy9') return 9;
  if (profile === 'hierarchy16') return 16;
  if (profile === 'hierarchy17') return 17;
  if (profile === 'hierarchy18') return 18;
  throw new TypeError('Invalid canonical schema profile');
}
const ACTIVE_KINDS = Object.freeze([
  ['topics', 'topics'],
  ['discussions', 'discussions'],
  ['sources', 'sources'],
  ['contributions', 'contributions'],
]);
const TARGET_DATA_TABLES = Object.freeze([
  'meta', 'id_registry', 'topics', 'discussions', 'sources', 'embeddings', 'source_links',
  'topic_memberships', 'fixed_references', 'contributions', 'revisions', 'operation_receipts',
  'import_ledger', 'runtime_state', 'command_receipts',
  'runtime_source_stamps', 'ingestion_jobs',
]);

function invalid(message = 'Invalid canonical v4 import') {
  throw new TypeError(message);
}

function encoded(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || !isDeepStrictEqual(JSON.parse(text), value)) invalid();
  return text;
}

function decoded(text) {
  if (typeof text !== 'string') invalid('Invalid canonical text payload');
  try { return JSON.parse(text); } catch { invalid('Invalid canonical text payload'); }
}

function digestText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function safeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) invalid(`Invalid ${name}`);
  return number;
}

function vectorText(values) {
  const mirror = values.map(Math.fround);
  if (mirror.some((value) => !Number.isFinite(value))) return null;
  return `[${mirror.map((value) => Object.is(value, -0) ? '-0' : String(value)).join(',')}]`;
}

function textOrder(left, right) {
  // PostgreSQL COLLATE "C" and SQLite BINARY both order valid UTF-8 by bytes.
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function compareNullable(actual, expected) {
  return actual === (expected ?? null);
}

function activeIds(state) {
  const rows = [], seen = new Set();
  for (const [name] of ACTIVE_KINDS) for (const value of state[name]) {
    if (seen.has(value.id)) invalid('Canonical identifier collision');
    seen.add(value.id);
    rows.push({ id: value.id, kind: name });
  }
  return rows;
}

function checkOrdinals(rows, name) {
  for (let index = 0; index < rows.length; index += 1)
    if (safeInteger(rows[index].ordinal, `${name} ordinal`) !== index) invalid(`Non-dense ${name} ordinals`);
}

function normalizedRows(database) {
  const select = (sql) => database.prepare(sql).all().map((row) => ({ ...row }));
  const selectedMeta = database.prepare('SELECT format,schema,generation,revision FROM canonical_meta WHERE singleton=1').get();
  const meta = selectedMeta && { ...selectedMeta };
  const raw = {
    registry: select('SELECT id,kind FROM canonical_id_registry ORDER BY id COLLATE BINARY'),
    topics: select('SELECT * FROM canonical_topics ORDER BY ordinal'),
    discussions: select('SELECT * FROM canonical_discussions ORDER BY ordinal'),
    sources: select('SELECT * FROM canonical_sources ORDER BY ordinal'),
    embeddings: select('SELECT source_id,model_id,payload FROM canonical_embeddings ORDER BY source_id COLLATE BINARY'),
    sourceLinks: select('SELECT * FROM canonical_source_links ORDER BY ordinal'),
    memberships: select('SELECT source_id,topic_id FROM canonical_topic_memberships ORDER BY source_id COLLATE BINARY,topic_id COLLATE BINARY'),
    references: select('SELECT topic_id,source_id,payload FROM canonical_topic_references ORDER BY topic_id COLLATE BINARY'),
    contributions: select('SELECT * FROM canonical_contributions ORDER BY ordinal'),
    revisions: select('SELECT contribution_id,ordinal,payload FROM canonical_revisions ORDER BY contribution_id COLLATE BINARY,ordinal'),
    receipts: select('SELECT source_id,operation_id,operation_digest FROM canonical_operation_receipts ORDER BY source_id COLLATE BINARY'),
  };
  // SQL collations need not match between SQLite and a future PostgreSQL
  // cluster. Non-ordinal relations therefore use one UTF-8 byte order in both
  // manifests; entity and revision ordinals remain explicit authority.
  raw.registry.sort((a, b) => textOrder(a.id, b.id));
  raw.embeddings.sort((a, b) => textOrder(a.source_id, b.source_id));
  raw.memberships.sort((a, b) => textOrder(a.source_id, b.source_id) || textOrder(a.topic_id, b.topic_id));
  raw.references.sort((a, b) => textOrder(a.topic_id, b.topic_id));
  raw.revisions.sort((a, b) => textOrder(a.contribution_id, b.contribution_id) || a.ordinal - b.ordinal);
  raw.receipts.sort((a, b) => textOrder(a.source_id, b.source_id));
  return { meta, raw };
}

function stateFromNormalizedRows(meta, raw) {
  if (!meta || meta.format !== NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT || meta.schema !== FIXED_REFERENCE_STATE_SCHEMA)
    invalid('Normalized v2 demo-state/v4 source required');
  const revision = safeInteger(meta.revision, 'source revision');
  for (const [rows, name] of [[raw.topics, 'topic'], [raw.discussions, 'discussion'], [raw.sources, 'source'],
    [raw.sourceLinks, 'source link'], [raw.contributions, 'contribution']]) checkOrdinals(rows, name);

  const embeddingBySource = new Map(raw.embeddings.map((row) => [row.source_id, row]));
  const receiptBySource = new Map(raw.receipts.map((row) => [row.source_id, row]));
  const revisionsByContribution = new Map();
  for (const row of raw.revisions) {
    const entries = revisionsByContribution.get(row.contribution_id) ?? [];
    if (safeInteger(row.ordinal, 'revision ordinal') !== entries.length) invalid('Non-dense revision ordinals');
    entries.push(decoded(row.payload));
    revisionsByContribution.set(row.contribution_id, entries);
  }

  const topics = raw.topics.map((row) => {
    const value = decoded(row.payload);
    if (value.id !== row.id) invalid('Topic mirror mismatch');
    return value;
  });
  const discussions = raw.discussions.map((row) => {
    const value = decoded(row.payload);
    if (value.id !== row.id || value.topicId !== row.topic_id) invalid('Discussion mirror mismatch');
    return value;
  });
  const sources = raw.sources.map((row) => {
    const value = decoded(row.payload), embeddingRow = embeddingBySource.get(row.id), receipt = receiptBySource.get(row.id);
    const embedding = embeddingRow ? decoded(embeddingRow.payload) : null;
    if (value.id !== row.id || value.url !== row.url || value.provenance !== row.provenance ||
        !compareNullable(row.operation_id, value.operationId) || Boolean(row.has_embedding) !== (embedding !== null) ||
        embeddingRow && embedding?.modelId !== embeddingRow.model_id) invalid('Source mirror mismatch');
    if (Object.hasOwn(value, 'operationId') ? !receipt || receipt.operation_id !== value.operationId ||
        receipt.operation_digest !== value.operationDigest : receipt !== undefined) invalid('Operation receipt mismatch');
    return { ...value, embedding };
  });
  const sourceLinks = raw.sourceLinks.map((row) => {
    const value = decoded(row.payload);
    if (value.sourceId !== row.source_id || value.topicId !== row.topic_id) invalid('Source link mirror mismatch');
    return value;
  });
  const contributions = raw.contributions.map((row) => {
    const value = decoded(row.payload), revisions = revisionsByContribution.get(row.id) ?? [];
    if (value.id !== row.id || value.discussionId !== row.discussion_id || !compareNullable(row.root_id, value.rootId) ||
        !compareNullable(row.reply_to_id, value.replyToId) || !compareNullable(row.author_id, value.authorId) ||
        !compareNullable(row.operator_id, value.insight?.operatorId) || !compareNullable(row.origin_source_id, value.originSourceId) ||
        !compareNullable(row.anchor_source_id, value.anchor?.kind === 'source' ? value.anchor.sourceId : undefined) ||
        value.createdAt !== row.created_at || safeInteger(row.revision_count, 'revision count') !== revisions.length)
      invalid('Contribution mirror mismatch');
    return { ...value, revisions };
  });

  // Match the current normalized repository's insertion order exactly. This
  // makes JSON.stringify(reconstructedState) stable as well as deep-equal.
  const state = { schema: meta.schema, generation: meta.generation, revision,
    topics, discussions, sources, sourceLinks, contributions };
  assertValidPersistedState(state, { largeScale: true });
  if (state.schema !== FIXED_REFERENCE_STATE_SCHEMA) invalid('Canonical source must be demo-state/v4');
  const active = activeIds(state), registry = new Map(raw.registry.map((row) => [row.id, row.kind]));
  for (const row of active) if (registry.get(row.id) !== row.kind) invalid('Canonical ID registry mismatch');

  const primary = new Map(sourceLinks.map((link) => [link.sourceId, link.topicId]));
  const expectedMemberships = sources.flatMap((source) =>
    (Object.hasOwn(source, 'topicIds') ? source.topicIds : [primary.get(source.id)].filter(Boolean))
      .map((topicId) => ({ source_id: source.id, topic_id: topicId })))
    .sort((a, b) => textOrder(a.source_id, b.source_id) || textOrder(a.topic_id, b.topic_id));
  if (!isDeepStrictEqual(raw.memberships, expectedMemberships)) invalid('Canonical membership mismatch');

  const referenceMap = new Map(raw.references.map((row) => [row.topic_id, row]));
  if (raw.references.length !== topics.filter((topic) => Object.hasOwn(topic, 'reference')).length)
    invalid('Canonical reference mismatch');
  for (const topic of topics) if (Object.hasOwn(topic, 'reference')) {
    const row = referenceMap.get(topic.id);
    if (!row || row.source_id !== (topic.reference?.sourceId ?? null) || !isDeepStrictEqual(decoded(row.payload), topic.reference))
      invalid('Canonical reference mismatch');
  }
  if (raw.embeddings.length !== sources.filter((source) => source.embedding !== null).length ||
      raw.revisions.length !== contributions.reduce((sum, contribution) => sum + contribution.revisions.length, 0) ||
      raw.receipts.length !== sources.filter((source) => Object.hasOwn(source, 'operationId')).length)
    invalid('Canonical relational mirror mismatch');
  return state;
}

function manifestFor(snapshot) {
  const { state, raw } = snapshot;
  return encoded({
    sourceFormat: NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT,
    schema: state.schema,
    generation: state.generation,
    revision: state.revision,
    registry: raw.registry,
    topics: raw.topics.map((row) => ({ ordinal: safeInteger(row.ordinal, 'topic ordinal'), payload: row.payload })),
    discussions: raw.discussions.map((row) => ({ ordinal: safeInteger(row.ordinal, 'discussion ordinal'), payload: row.payload })),
    sources: raw.sources.map((row) => ({ ordinal: safeInteger(row.ordinal, 'source ordinal'), payload: row.payload })),
    embeddings: raw.embeddings.map((row) => ({ sourceId: row.source_id, payload: row.payload })),
    sourceLinks: raw.sourceLinks.map((row) => ({ ordinal: safeInteger(row.ordinal, 'source link ordinal'), payload: row.payload })),
    memberships: raw.memberships,
    references: raw.references.map((row) => ({ topicId: row.topic_id, payload: row.payload })),
    contributions: raw.contributions.map((row) => ({ ordinal: safeInteger(row.ordinal, 'contribution ordinal'), payload: row.payload })),
    revisions: raw.revisions.map((row) => ({ contributionId: row.contribution_id,
      ordinal: safeInteger(row.ordinal, 'revision ordinal'), payload: row.payload })),
    receipts: raw.receipts,
  });
}

function countsFor(snapshot) {
  const { state, raw } = snapshot;
  const activeCount = state.topics.length + state.discussions.length + state.sources.length + state.contributions.length;
  return Object.freeze({
    topics: state.topics.length,
    discussions: state.discussions.length,
    sources: state.sources.length,
    sourceLinks: state.sourceLinks.length,
    memberships: raw.memberships.length,
    fixedReferences: raw.references.length,
    embeddings: raw.embeddings.length,
    contributions: state.contributions.length,
    revisions: raw.revisions.length,
    operationReceipts: raw.receipts.length,
    activeIds: activeCount,
    ids: raw.registry.length,
    retiredIds: raw.registry.length - activeCount,
  });
}

export async function extractCanonicalV4Snapshot(sqlitePath) {
  if (typeof sqlitePath !== 'string' || !sqlitePath || sqlitePath === ':memory:') invalid('Existing normalized SQLite path required');
  let database;
  try {
    database = new DatabaseSync(sqlitePath, { readOnly: true });
    database.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN');
    if (assertNormalizedCatalogSchema(database) !== NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT)
      invalid('Normalized v2 source required');
    const quick = database.prepare('PRAGMA quick_check').all();
    if (quick.length !== 1 || quick[0].quick_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length)
      invalid('Invalid normalized SQLite source');
    const { meta, raw } = normalizedRows(database);
    const state = stateFromNormalizedRows(meta, raw);
    database.exec('COMMIT');
    const snapshot = { state, raw };
    const logicalSha256 = digestText(manifestFor(snapshot));
    return Object.freeze({ ...snapshot, logicalSha256, counts: countsFor(snapshot) });
  } catch (error) {
    try { database?.exec('ROLLBACK'); } catch { /* Keep the source error. */ }
    throw error;
  } finally {
    database?.close();
  }
}

export async function readCanonicalV4MigrationManifest(profile = 'legacy9') {
  const version = canonicalV4SchemaVersion(profile);
  const files = version === 9 ? MIGRATION_FILES : version === 16 ? HIERARCHY_MIGRATION_FILES : version===17?HIERARCHY17_MIGRATION_FILES:HIERARCHY18_MIGRATION_FILES;
  const migrations = await Promise.all(files.map(async (filename, index) => {
    const sql = await readFile(new URL(`./migrations/${filename}`, import.meta.url), 'utf8');
    return Object.freeze({ version: index + 1, sql, hash: digestText(sql) });
  }));
  return Object.freeze(migrations);
}

export async function migrateCanonicalV4(database, profile = 'legacy9') {
  if (!database || typeof database.transaction !== 'function') invalid('PostgreSQL database required');
  const migrations = await readCanonicalV4MigrationManifest(profile);
  return database.transaction(async (tx) => {
    if (tx.dialect === 'pg') {
      await tx.query('SELECT pg_advisory_xact_lock(914092004)');
      const { rows: owners } = await tx.query(`SELECT pg_get_userbyid(n.nspowner) AS owner,current_user AS current_user
        FROM pg_namespace n WHERE n.nspname='canonical_v4'`);
      if (owners.length !== 1 || owners[0].owner !== owners[0].current_user)
        throw new Error('Canonical v4 schema must be precreated for the migration owner');
      const { rows: extensions } = await tx.query("SELECT 1 FROM pg_extension WHERE extname='vector'");
      if (extensions.length !== 1) throw new Error('Canonical v4 vector extension is unavailable');
    } else {
      // Embedded PGlite has no separate administrator connection. Its test
      // extension is registered by createPGliteDatabase. Create missing test
      // prerequisites only; an owner-role rehearsal can use admin bootstrap.
      const { rows: extensions } = await tx.query("SELECT 1 FROM pg_extension WHERE extname='vector'");
      if (!extensions.length) await tx.exec('CREATE EXTENSION vector');
      const { rows: schemas } = await tx.query("SELECT 1 FROM pg_namespace WHERE nspname='canonical_v4'");
      if (!schemas.length) await tx.exec('CREATE SCHEMA canonical_v4');
    }
    await tx.exec('CREATE TABLE IF NOT EXISTS canonical_v4.schema_migrations(version integer PRIMARY KEY, hash text NOT NULL)');
    const { rows } = await tx.query('SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version');
    if (rows.length > migrations.length || rows.some((row, index) =>
      Number(row.version) !== migrations[index].version || row.hash !== migrations[index].hash))
      throw new Error('Canonical v4 migration version/hash mismatch');
    let initializeSourceStamps = false;
    for (const migration of migrations.slice(rows.length)) {
      await tx.exec(migration.sql);
      if (migration.version === 3) initializeSourceStamps = true;
      await tx.query('INSERT INTO canonical_v4.schema_migrations(version,hash) VALUES($1,$2)',
        [migration.version, migration.hash]);
    }
    // Later migrations extend this protected mirror. Populate it only after
    // the complete pending DDL set so PostgreSQL never has to ALTER a table
    // with deferred FK trigger events from rows inserted earlier in this txn.
    if (initializeSourceStamps) await initializeCanonicalV4SourceStamps(tx);
    return Object.freeze({ schemaVersion: migrations.length, hashes: migrations.map(({ hash }) => hash) });
  });
}

async function initializeCanonicalV4SourceStamps(database) {
  const { rows } = await database.query(`SELECT source.id,source.payload,embedding.payload AS embedding_payload
    FROM canonical_v4.sources AS source
    LEFT JOIN canonical_v4.embeddings AS embedding ON embedding.source_id=source.id
    ORDER BY source.id COLLATE "C"`);
  for (const row of rows) {
    const stored = decoded(row.payload);
    if (stored.id !== row.id) invalid('Source mirror mismatch');
    const value = { ...stored, embedding: row.embedding_payload === null ? null : decoded(row.embedding_payload) };
    const stamp = sourceStamp(value);
    const postable = inspectPageUrl(value.url).supported;
    const { rows: inserted } = await database.query(`INSERT INTO canonical_v4.runtime_source_stamps
      (source_id,stamp,postable) VALUES($1,$2,$3)
      ON CONFLICT(source_id) DO NOTHING RETURNING stamp,postable`, [row.id, stamp, postable]);
    if (!inserted.length) {
      const { rows: existing } = await database.query(`SELECT stamp,postable FROM canonical_v4.runtime_source_stamps
        WHERE source_id=$1`, [row.id]);
      if (existing.length !== 1 || existing[0].stamp !== stamp || existing[0].postable !== postable)
        invalid('Source stamp mirror mismatch');
    }
  }
}

// The runtime migrations can be installed before or after the one-time import.
// This initializer fills the protected Source-stamp mirror after an import and
// never resets an already active runtime or rewinds an allocator.
export async function initializeCanonicalV4Runtime(database) {
  if (!database || typeof database.query !== 'function') invalid('PostgreSQL transaction required');
  await initializeCanonicalV4SourceStamps(database);
  const { rows: inserted } = await database.query(`INSERT INTO canonical_v4.runtime_state
    (singleton,generation,revision)
    SELECT true,generation,revision FROM canonical_v4.meta
    ON CONFLICT (singleton) DO NOTHING
    RETURNING generation,revision,catalog_version,matching_version`);
  const { rows } = inserted.length ? { rows: inserted } : await database.query(`SELECT generation,revision,catalog_version,matching_version
    FROM canonical_v4.runtime_state WHERE singleton=true`);
  const { rows: metaRows } = await database.query('SELECT generation,revision FROM canonical_v4.meta WHERE singleton=true');
  if (rows.length !== 1 || metaRows.length !== 1 || rows[0].generation !== metaRows[0].generation ||
      safeInteger(rows[0].revision, 'runtime revision') < safeInteger(metaRows[0].revision, 'import revision'))
    throw new Error('Canonical v4 runtime initialization failed');
  if (inserted.length) {
    for (const [entity, sequence] of [
      ['topics', 'topic_ordinal_sequence'],
      ['discussions', 'discussion_ordinal_sequence'],
      ['sources', 'source_ordinal_sequence'],
      ['source_links', 'source_link_ordinal_sequence'],
      ['contributions', 'contribution_ordinal_sequence'],
    ]) {
      const { rows: ordinalRows } = await database.query(`SELECT
        COALESCE((SELECT max(ordinal) + 1 FROM canonical_v4.${entity}),0) AS persisted_next,
        CASE WHEN is_called THEN last_value+1 ELSE last_value END AS allocated_next
        FROM canonical_v4.${sequence}`);
      const next = Math.max(
        safeInteger(ordinalRows[0]?.persisted_next, `${entity} persisted ordinal`),
        safeInteger(ordinalRows[0]?.allocated_next, `${entity} allocated ordinal`));
      await database.query(`SELECT setval('canonical_v4.${sequence}',$1,false)`, [next]);
    }
  }
  return Object.freeze({ generation: rows[0].generation, revision: safeInteger(rows[0].revision, 'runtime revision'),
    catalogVersion: safeInteger(rows[0].catalog_version, 'catalog version'),
    matchingVersion: safeInteger(rows[0].matching_version, 'matching version') });
}

export async function bootstrapCanonicalV4(database) {
  if (!database || typeof database.transaction !== 'function') invalid('PostgreSQL database required');
  const sql = await readFile(new URL('./bootstrap/001-admin.sql', import.meta.url), 'utf8');
  return database.transaction(async (tx) => {
    if (tx.dialect === 'pg') await tx.query('SELECT pg_advisory_xact_lock(914092003)');
    await tx.exec(sql);
    const { rows } = await tx.query(`SELECT pg_get_userbyid(nspowner) AS owner
      FROM pg_namespace WHERE nspname='canonical_v4'`);
    if (rows.length !== 1 || rows[0].owner !== 'murmingle_owner')
      throw new Error('Canonical v4 bootstrap verification failed');
    return Object.freeze({ schema: 'canonical_v4', owner: 'murmingle_owner' });
  });
}

async function targetIsEmpty(tx) {
  for (const table of TARGET_DATA_TABLES) {
    const { rows } = await tx.query(`SELECT 1 AS present FROM canonical_v4.${table} LIMIT 1`);
    if (rows.length) return false;
  }
  return true;
}

export async function importCanonicalV4({ database, sqlitePath, beforeCommit } = {}) {
  // Extraction is from one read-only SQLite transaction before PostgreSQL is
  // touched. The import transaction never keeps or reaches into the live file.
  const snapshot = await extractCanonicalV4Snapshot(sqlitePath);
  const { state, raw, logicalSha256, counts } = snapshot;
  const countsText = encoded(counts);
  await migrateCanonicalV4(database);
  await database.transaction(async (tx) => {
    if (tx.dialect === 'pg') await tx.query('SELECT pg_advisory_xact_lock(914092104)');
    if (!await targetIsEmpty(tx)) throw new Error('Canonical v4 target is not empty');

    // Import the complete registry, including retired identity reservations.
    for (const row of raw.registry)
      await tx.query('INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,$2)', [row.id, row.kind]);

    for (let ordinal = 0; ordinal < state.topics.length; ordinal += 1) {
      const topic = state.topics[ordinal];
      await tx.query(`INSERT INTO canonical_v4.topics
        (id,ordinal,payload,kind,title,created_at,provenance,retain_tight)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [topic.id, ordinal, raw.topics[ordinal].payload, topic.kind, topic.title,
        topic.createdAt, topic.provenance ?? null, topic.retainTight ?? null]);
    }
    for (let ordinal = 0; ordinal < state.discussions.length; ordinal += 1) {
      const discussion = state.discussions[ordinal];
      await tx.query('INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload) VALUES($1,$2,$3,$4)',
        [discussion.id, discussion.topicId, ordinal, raw.discussions[ordinal].payload]);
    }
    const embeddingRaw = new Map(raw.embeddings.map((row) => [row.source_id, row]));
    for (let ordinal = 0; ordinal < state.sources.length; ordinal += 1) {
      const value = state.sources[ordinal];
      await tx.query(`INSERT INTO canonical_v4.sources
        (id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [value.id, ordinal, raw.sources[ordinal].payload, value.url,
        value.title, value.provenance, value.extractorVersion ?? null, value.policyVersion ?? null,
        value.operationId ?? null, value.embedding !== null]);
      if (value.embedding !== null) {
        const sourceEmbedding = embeddingRaw.get(value.id);
        await tx.query(`INSERT INTO canonical_v4.embeddings
          (source_id,payload,model_id,dimensions,values_double,vector_mirror)
          VALUES($1,$2,$3,$4,$5::double precision[],$6::vector)`, [value.id, sourceEmbedding.payload,
          value.embedding.modelId, value.embedding.values.length, value.embedding.values, vectorText(value.embedding.values)]);
      }
    }
    for (let ordinal = 0; ordinal < state.sourceLinks.length; ordinal += 1) {
      const link = state.sourceLinks[ordinal];
      await tx.query('INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES($1,$2,$3,$4,$5)',
        [link.sourceId, link.topicId, ordinal, raw.sourceLinks[ordinal].payload, link.method]);
    }
    const membershipOrdinal = new Map();
    for (const membership of raw.memberships) {
      const ordinal = membershipOrdinal.get(membership.source_id) ?? 0;
      membershipOrdinal.set(membership.source_id, ordinal + 1);
      await tx.query('INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) VALUES($1,$2,$3)',
        [membership.source_id, membership.topic_id, ordinal]);
    }
    const referenceRaw = new Map(raw.references.map((row) => [row.topic_id, row]));
    for (const topic of state.topics) if (Object.hasOwn(topic, 'reference')) {
      const reference = topic.reference, stored = referenceRaw.get(topic.id);
      await tx.query(`INSERT INTO canonical_v4.fixed_references
        (topic_id,payload,source_id,parameter_sha256,values_double,vector_mirror)
        VALUES($1,$2,$3,$4,$5::double precision[],$6::vector)`, [topic.id, stored.payload, reference?.sourceId ?? null,
        reference?.parameterSha256 ?? null, reference?.values ?? null, reference === null ? null : vectorText(reference.values)]);
    }
    const revisionsRaw = new Map();
    for (const row of raw.revisions) revisionsRaw.set(`${row.contribution_id}\u0000${row.ordinal}`, row.payload);
    for (let ordinal = 0; ordinal < state.contributions.length; ordinal += 1) {
      const value = state.contributions[ordinal];
      await tx.query(`INSERT INTO canonical_v4.contributions
        (id,discussion_id,root_id,reply_to_id,author_id,operator_id,origin_source_id,anchor_source_id,
         actor_type,visibility,withdrawn,created_at,revision_count,ordinal,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [value.id, value.discussionId,
        value.rootId, value.replyToId, value.authorId, value.insight?.operatorId ?? null, value.originSourceId ?? null,
        value.anchor?.kind === 'source' ? value.anchor.sourceId : null, value.actorType, value.visibility, value.withdrawn,
        value.createdAt, value.revisions.length, ordinal, raw.contributions[ordinal].payload]);
      for (let revisionOrdinal = 0; revisionOrdinal < value.revisions.length; revisionOrdinal += 1)
        await tx.query('INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload) VALUES($1,$2,$3)',
          [value.id, revisionOrdinal, revisionsRaw.get(`${value.id}\u0000${revisionOrdinal}`)]);
    }
    for (const receipt of raw.receipts)
      await tx.query('INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest) VALUES($1,$2,$3)',
        [receipt.source_id, receipt.operation_id, receipt.operation_digest]);
    await tx.query(`INSERT INTO canonical_v4.meta
      (singleton,target_format,source_format,state_schema,generation,revision,logical_sha256,counts_text)
      VALUES(true,$1,$2,$3,$4,$5,$6,$7)`, [TARGET_FORMAT, NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT,
      state.schema, state.generation, state.revision, logicalSha256, countsText]);
    await tx.query(`INSERT INTO canonical_v4.import_ledger
      (source_format,state_schema,generation,revision,logical_sha256,counts_text)
      VALUES($1,$2,$3,$4,$5,$6)`, [NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT, state.schema, state.generation,
      state.revision, logicalSha256, countsText]);
    await initializeCanonicalV4Runtime(tx);
    // Validate every imported authority and byte-preserved payload while the
    // write transaction can still be rolled back. The later read is only a
    // defense-in-depth check, never the first point at which corruption is seen.
    const inTransaction = await reconstructInTransaction(tx);
    if (!isDeepStrictEqual(inTransaction.state, state) || inTransaction.logicalSha256 !== logicalSha256 ||
        !isDeepStrictEqual(inTransaction.counts, counts) || !isDeepStrictEqual(inTransaction.registry, raw.registry))
      throw new Error('Canonical v4 import verification failed');
    if (beforeCommit !== undefined) {
      if (typeof beforeCommit !== 'function') invalid('Invalid import hook');
      await beforeCommit();
    }
  });
  const verified = await reconstructCanonicalV4(database);
  if (!isDeepStrictEqual(verified.state, state) || verified.logicalSha256 !== logicalSha256 ||
      !isDeepStrictEqual(verified.counts, counts) || !isDeepStrictEqual(verified.registry, raw.registry))
    throw new Error('Canonical v4 import verification failed');
  return Object.freeze({ version: { generation: state.generation, revision: state.revision }, logicalSha256, counts });
}

function snapshotFromTarget(meta, rows) {
  const embeddingBySource = new Map(rows.embeddings.map((row) => [row.source_id, row]));
  const revisionsByContribution = new Map();
  for (const row of rows.revisions) {
    const list = revisionsByContribution.get(row.contribution_id) ?? [];
    if (safeInteger(row.ordinal, 'revision ordinal') !== list.length) invalid('Non-dense revision ordinals');
    list.push(decoded(row.payload));
    revisionsByContribution.set(row.contribution_id, list);
  }
  for (const [list, name] of [[rows.topics, 'topic'], [rows.discussions, 'discussion'], [rows.sources, 'source'],
    [rows.sourceLinks, 'source link'], [rows.contributions, 'contribution']]) checkOrdinals(list, name);
  const topics = rows.topics.map((row) => {
    const value = decoded(row.payload);
    if (row.id !== value.id || row.kind !== value.kind || row.title !== value.title || row.created_at !== value.createdAt ||
        !compareNullable(row.provenance, value.provenance) || !compareNullable(row.retain_tight, value.retainTight))
      invalid('Topic typed mirror mismatch');
    return value;
  });
  const discussions = rows.discussions.map((row) => {
    const value = decoded(row.payload);
    if (row.id !== value.id || row.topic_id !== value.topicId) invalid('Discussion typed mirror mismatch');
    return value;
  });
  const sources = rows.sources.map((row) => {
    const value = decoded(row.payload), embeddingRow = embeddingBySource.get(row.id), embedding = embeddingRow ? decoded(embeddingRow.payload) : null;
    if (row.id !== value.id || row.url !== value.url || row.title !== value.title || row.provenance !== value.provenance ||
        !compareNullable(row.extractor_version, value.extractorVersion) || !compareNullable(row.policy_version, value.policyVersion) ||
        !compareNullable(row.operation_id, value.operationId) || row.has_embedding !== (embedding !== null))
      invalid('Source typed mirror mismatch');
    if (embeddingRow && (embeddingRow.model_id !== embedding.modelId || safeInteger(embeddingRow.dimensions, 'embedding dimensions') !== embedding.values.length ||
        !isDeepStrictEqual(embeddingRow.values_double, embedding.values))) invalid('Embedding double mirror mismatch');
    return { ...value, embedding };
  });
  const sourceLinks = rows.sourceLinks.map((row) => {
    const value = decoded(row.payload);
    if (row.source_id !== value.sourceId || row.topic_id !== value.topicId || row.method !== value.method)
      invalid('Source link typed mirror mismatch');
    return value;
  });
  const contributions = rows.contributions.map((row) => {
    const value = decoded(row.payload), revisions = revisionsByContribution.get(row.id) ?? [];
    if (row.id !== value.id || row.discussion_id !== value.discussionId || !compareNullable(row.root_id, value.rootId) ||
        !compareNullable(row.reply_to_id, value.replyToId) || !compareNullable(row.author_id, value.authorId) ||
        !compareNullable(row.operator_id, value.insight?.operatorId) || !compareNullable(row.origin_source_id, value.originSourceId) ||
        !compareNullable(row.anchor_source_id, value.anchor?.kind === 'source' ? value.anchor.sourceId : undefined) ||
        row.actor_type !== value.actorType || row.visibility !== value.visibility || row.withdrawn !== value.withdrawn ||
        row.created_at !== value.createdAt || safeInteger(row.revision_count, 'revision count') !== revisions.length)
      invalid('Contribution typed mirror mismatch');
    return { ...value, revisions };
  });
  const state = { schema: meta.state_schema, generation: meta.generation, revision: safeInteger(meta.revision, 'revision'),
    topics, discussions, sources, sourceLinks, contributions };
  const raw = {
    registry: rows.registry,
    topics: rows.topics,
    discussions: rows.discussions,
    sources: rows.sources,
    embeddings: rows.embeddings,
    sourceLinks: rows.sourceLinks,
    memberships: rows.memberships.map((row) => ({ source_id: row.source_id, topic_id: row.topic_id })),
    references: rows.references,
    contributions: rows.contributions,
    revisions: rows.revisions,
    receipts: rows.receipts,
  };
  return { state, raw };
}

async function reconstructInTransaction(tx) {
    const { rows: metaRows } = await tx.query('SELECT * FROM canonical_v4.meta');
    if (metaRows.length !== 1) throw new Error('Canonical v4 target is empty or invalid');
    const meta = metaRows[0];
    if (meta.target_format !== TARGET_FORMAT || meta.source_format !== NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT ||
        meta.state_schema !== FIXED_REFERENCE_STATE_SCHEMA) invalid('Unsupported canonical v4 target');
    const { rows: runtimeRows } = await tx.query(`SELECT generation,revision FROM canonical_v4.runtime_state
      WHERE singleton=true`);
    if (runtimeRows.length !== 1 || runtimeRows[0].generation !== meta.generation)
      invalid('Canonical v4 runtime state mismatch');
    if (safeInteger(runtimeRows[0].revision, 'runtime revision') !== safeInteger(meta.revision, 'import revision'))
      throw new Error('Canonical v4 import baseline is no longer the current runtime state');
    // A native pg transaction owns one client. Run its statements in order;
    // issuing concurrent client.query calls is deprecated by node-postgres and
    // offers no database-side parallelism on that connection.
    const queries = [];
    for (const sql of [
      'SELECT id,kind FROM canonical_v4.id_registry ORDER BY id COLLATE "C"',
      'SELECT * FROM canonical_v4.topics ORDER BY ordinal',
      'SELECT * FROM canonical_v4.discussions ORDER BY ordinal',
      'SELECT * FROM canonical_v4.sources ORDER BY ordinal',
      'SELECT source_id,payload,model_id,dimensions,values_double FROM canonical_v4.embeddings ORDER BY source_id COLLATE "C"',
      'SELECT * FROM canonical_v4.source_links ORDER BY ordinal',
      'SELECT source_id,topic_id,ordinal FROM canonical_v4.topic_memberships ORDER BY source_id COLLATE "C",ordinal',
      'SELECT topic_id,payload,source_id,parameter_sha256,values_double FROM canonical_v4.fixed_references ORDER BY topic_id COLLATE "C"',
      'SELECT * FROM canonical_v4.contributions ORDER BY ordinal',
      'SELECT contribution_id,ordinal,payload FROM canonical_v4.revisions ORDER BY contribution_id COLLATE "C",ordinal',
      'SELECT source_id,operation_id,operation_digest FROM canonical_v4.operation_receipts ORDER BY source_id COLLATE "C"',
    ]) queries.push(await tx.query(sql));
    const names = ['registry', 'topics', 'discussions', 'sources', 'embeddings', 'sourceLinks', 'memberships',
      'references', 'contributions', 'revisions', 'receipts'];
    const rows = Object.fromEntries(names.map((name, index) => [name, queries[index].rows]));
    for (const row of rows.memberships) row.ordinal = safeInteger(row.ordinal, 'membership ordinal');
    for (const row of rows.revisions) row.ordinal = safeInteger(row.ordinal, 'revision ordinal');
    rows.registry.sort((a, b) => textOrder(a.id, b.id));
    rows.embeddings.sort((a, b) => textOrder(a.source_id, b.source_id));
    rows.memberships.sort((a, b) => textOrder(a.source_id, b.source_id) || a.ordinal - b.ordinal);
    rows.references.sort((a, b) => textOrder(a.topic_id, b.topic_id));
    rows.revisions.sort((a, b) => textOrder(a.contribution_id, b.contribution_id) || a.ordinal - b.ordinal);
    rows.receipts.sort((a, b) => textOrder(a.source_id, b.source_id));
    const snapshot = snapshotFromTarget(meta, rows);
    const { state, raw } = snapshot;
    assertValidPersistedState(state, { largeScale: true });
    activeIds(state);

    const active = new Map(activeIds(state).map((row) => [row.id, row.kind]));
    const registry = new Map(raw.registry.map((row) => [row.id, row.kind]));
    if (registry.size !== raw.registry.length || [...active].some(([id, kind]) => registry.get(id) !== kind))
      invalid('Canonical ID registry mismatch');

    const primary = new Map(state.sourceLinks.map((link) => [link.sourceId, link.topicId]));
    const expectedMemberships = state.sources.flatMap((source) =>
      (Object.hasOwn(source, 'topicIds') ? source.topicIds : [primary.get(source.id)].filter(Boolean))
        .map((topicId, ordinal) => ({ source_id: source.id, topic_id: topicId, ordinal })))
      .sort((a, b) => textOrder(a.source_id, b.source_id) || a.ordinal - b.ordinal);
    if (!isDeepStrictEqual(rows.memberships, expectedMemberships)) invalid('Canonical membership mismatch');

    const referenceMap = new Map(rows.references.map((row) => [row.topic_id, row]));
    if (rows.references.length !== state.topics.filter((topic) => Object.hasOwn(topic, 'reference')).length)
      invalid('Canonical reference mismatch');
    for (const topic of state.topics) if (Object.hasOwn(topic, 'reference')) {
      const row = referenceMap.get(topic.id), reference = topic.reference;
      if (!row || !isDeepStrictEqual(decoded(row.payload), reference) || row.source_id !== (reference?.sourceId ?? null) ||
          row.parameter_sha256 !== (reference?.parameterSha256 ?? null) ||
          !isDeepStrictEqual(row.values_double, reference?.values ?? null)) invalid('Canonical reference double mirror mismatch');
    }
    const expectedReceipts = state.sources.filter((source) => Object.hasOwn(source, 'operationId')).map((source) =>
      ({ source_id: source.id, operation_id: source.operationId, operation_digest: source.operationDigest }))
      .sort((a, b) => textOrder(a.source_id, b.source_id));
    if (!isDeepStrictEqual(rows.receipts, expectedReceipts)) invalid('Canonical operation receipt mismatch');

    const logicalSha256 = digestText(manifestFor(snapshot)), counts = countsFor(snapshot), countsText = encoded(counts);
    if (meta.logical_sha256 !== logicalSha256 || meta.counts_text !== countsText) invalid('Canonical import digest mismatch');
    const { rows: ledgerRows } = await tx.query(`SELECT source_format,state_schema,generation,revision,logical_sha256,counts_text
      FROM canonical_v4.import_ledger ORDER BY import_id`);
    if (ledgerRows.length !== 1 || ledgerRows[0].source_format !== meta.source_format || ledgerRows[0].state_schema !== meta.state_schema ||
        ledgerRows[0].generation !== meta.generation || safeInteger(ledgerRows[0].revision, 'ledger revision') !== state.revision ||
        ledgerRows[0].logical_sha256 !== logicalSha256 || ledgerRows[0].counts_text !== countsText)
      invalid('Canonical import ledger mismatch');
  return Object.freeze({ state, registry: raw.registry, logicalSha256, counts });
}

export async function reconstructCanonicalV4(database) {
  await migrateCanonicalV4(database);
  return database.transaction(async (tx) => {
    // A native PostgreSQL reconstruction observes one immutable database
    // snapshot. PGlite already serializes its embedded transaction.
    if (tx.dialect === 'pg') await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return reconstructInTransaction(tx);
  });
}

export const CANONICAL_V4_TARGET_FORMAT = TARGET_FORMAT;
