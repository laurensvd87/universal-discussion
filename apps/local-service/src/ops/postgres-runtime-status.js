import { types } from 'node:util';
import { BROWSER_MODEL_ID, LEARNED_SOURCE_PROVENANCE } from '../domain/learned-sources.js';
import { PAGE_CONTENT_EXTRACTOR_VERSIONS } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

const MAXIMUM_METADATA_ROWS = 131073;
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const JOB_CLASSES = ['interactive', 'crawler'];
const JOB_STATES = ['pending', 'leased', 'complete', 'failed', 'cancelled'];
const UNVERIFIABLE = Object.freeze({ status: 'unverifiable' });

function bad() { throw new TypeError('Runtime status unavailable'); }
function data(value, name) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) bad();
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) bad();
  return descriptor.value;
}
function integer(value) {
  if (typeof value === 'string') {
    if (!/^(?:0|[1-9]\d*)$/u.test(value) || value.length > 16) bad();
    value = Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0) bad();
  return value;
}
function text(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || UNSAFE.test(value)) bad();
  return value;
}
function rows(result, maximum) {
  const value = data(result, 'rows');
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) bad();
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(value).length !== length + 1) bad();
  const copy = [];
  for (let index = 0; index < length; index++) copy.push(data(value, String(index)));
  return copy;
}
function one(result) {
  const values = rows(result, 1);
  if (values.length !== 1) bad();
  return values[0];
}
function limits(value) {
  const maximumSources = integer(data(value, 'maximumSources'));
  const maximumUnits = integer(data(value, 'maximumUnits'));
  const maximumChunks = integer(data(value, 'maximumChunks'));
  const chunkSize = integer(data(value, 'chunkSize'));
  if (!maximumSources || maximumSources >= MAXIMUM_METADATA_ROWS || !maximumUnits ||
      !maximumChunks || !chunkSize || maximumChunks >= MAXIMUM_METADATA_ROWS || chunkSize >= MAXIMUM_METADATA_ROWS) bad();
  return Object.freeze({ maximumSources, maximumUnits, maximumChunks, chunkSize });
}
function normalizedUrl(value) {
  text(value, 8192);
  if (/\s|\\/u.test(value)) bad();
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) bad();
  url.hash = '';
  const normalized = url.toString();
  if (normalized.length > 8192) bad();
  return normalized;
}
function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

// Operator-only observations, never write/provider authority or an integrity/
// daemon-liveness proof. No vector, payload, account, ledger, token or query text
// is selected. The sole row projection stays private and has a strict count cap.
export async function collectPostgresRuntimeStatus(options) {
  let database, capacity, transaction;
  try {
    database = data(options, 'database'); capacity = limits(data(options, 'capacityLimits'));
    transaction = data(database, 'transaction');
    if (data(database, 'dialect') !== 'pg' || typeof transaction !== 'function' || typeof data(database, 'query') !== 'function') bad();
  } catch { throw new TypeError('Invalid PostgreSQL runtime status dependencies'); }
  try {
    return await transaction.call(database, async tx => {
      const query = data(tx, 'query');
      if (typeof query !== 'function') bad();
      const select = (sql, parameters = []) => query.call(tx, sql, parameters);
      await select('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await select("SET LOCAL statement_timeout='5s'");
      const countsRow = one(await select(`SELECT revision,catalog_version,matching_version,
        (SELECT count(*) FROM canonical_v4.sources) AS sources,
        (SELECT count(*) FROM canonical_v4.sources WHERE provenance=$1) AS learned_sources,
        (SELECT count(*) FROM canonical_v4.topics) AS topics,
        (SELECT count(*) FROM canonical_v4.discussions) AS discussions,
        (SELECT count(*) FROM canonical_v4.embeddings) AS embeddings,
        (SELECT count(*) FROM canonical_v4.topic_memberships) AS memberships,
        (SELECT count(*) FROM canonical_v4.fixed_references WHERE source_id IS NOT NULL) AS fixed_references,
        (SELECT count(*) FROM canonical_v4.contributions) AS contributions
        FROM canonical_v4.runtime_state WHERE singleton=true`, [LEARNED_SOURCE_PROVENANCE]));
      const canonical = {};
      for (const [name, column] of Object.entries({ revision: 'revision', catalogVersion: 'catalog_version', matchingVersion: 'matching_version',
        sources: 'sources', learnedSources: 'learned_sources', topics: 'topics', discussions: 'discussions', embeddings: 'embeddings',
        memberships: 'memberships', fixedReferences: 'fixed_references', contributions: 'contributions' }))
        canonical[name] = integer(data(countsRow, column));
      if (canonical.learnedSources > canonical.sources || canonical.learnedSources > capacity.maximumSources) bad();

      const queue = Object.fromEntries(JOB_CLASSES.map(kind => [kind, Object.fromEntries(JOB_STATES.map(state => [state, 0]))]));
      const seen = new Set();
      for (const row of rows(await select(`SELECT job_class,state,count(*) AS count FROM canonical_v4.ingestion_jobs
        GROUP BY job_class,state`), 10)) {
        const kind = data(row, 'job_class'), state = data(row, 'state');
        if (!JOB_CLASSES.includes(kind) || !JOB_STATES.includes(state) || seen.has(`${kind}:${state}`)) bad();
        seen.add(`${kind}:${state}`); queue[kind][state] = integer(data(row, 'count'));
      }
      const connectionRow = one(await select(`SELECT
        (pg_has_role(current_user,'pg_read_all_stats','USAGE') OR
          (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)) AS full_visibility,
        count(*) FILTER(WHERE datname=current_database()) AS database_connections,
        count(*) AS server_client_connections,
        count(*) FILTER(WHERE datname=current_database() AND application_name IN ('murmingle-api','murmingle-url-projection')) AS app,
        count(*) FILTER(WHERE datname=current_database() AND application_name IN ('murmingle-ingest-worker','murmingle-ingest-worker-timed')) AS worker,
        count(*) FILTER(WHERE datname=current_database() AND application_name='murmingle-dashboard') AS dashboard,
        count(*) FILTER(WHERE datname=current_database() AND application_name='murmingle-crawler') AS crawler,
        current_setting('max_connections') AS maximum_connections
        FROM pg_stat_activity WHERE backend_type='client backend'`));
      const visibility = data(connectionRow, 'full_visibility');
      if (typeof visibility !== 'boolean') bad();
      const connections = { status: visibility ? 'available' : 'unverifiable',
        maximum: integer(data(connectionRow, 'maximum_connections')), daemonLivenessKnown: false };
      if (!connections.maximum) bad();
      // Restricted pg_stat_activity rows hide fields such as backend_type and
      // application_name. Their filtered counts are not observations of zero.
      if (visibility) {
        for (const name of ['app', 'worker', 'dashboard', 'crawler']) connections[name] = integer(data(connectionRow, name));
        connections.databaseTotal = integer(data(connectionRow, 'database_connections'));
        connections.serverClientTotal = integer(data(connectionRow, 'server_client_connections'));
        const known = connections.app + connections.worker + connections.dashboard + connections.crawler;
        if (known > connections.databaseTotal || connections.databaseTotal > connections.serverClientTotal) bad();
        connections.otherDatabaseClients = connections.databaseTotal - known;
      }

      const metadata = rows(await select(`SELECT source.id,source.url,source.title,source.ordinal,
        embedding.model_id,embedding.dimensions,source.extractor_version,
        link.source_id IS NOT NULL AS has_link,
        CASE WHEN link.method='manual-confirmed' THEN link.topic_id ELSE NULL END AS manual_topic
        FROM canonical_v4.sources AS source JOIN canonical_v4.embeddings AS embedding ON embedding.source_id=source.id
        LEFT JOIN canonical_v4.source_links AS link ON link.source_id=source.id
        WHERE source.provenance=$1 AND embedding.model_id=$2 AND source.extractor_version=ANY($3::text[])
        ORDER BY source.ordinal LIMIT $4`, [LEARNED_SOURCE_PROVENANCE, BROWSER_MODEL_ID,
        [...PAGE_CONTENT_EXTRACTOR_VERSIONS, 'crawler-static-html-prefix/v1'], capacity.maximumSources + 1]), capacity.maximumSources + 1);
      if (metadata.length > capacity.maximumSources || metadata.length > canonical.learnedSources) bad();
      const chunks = new Set(), ids = new Set(), ordinals = new Set();
      let usedUnits = 0;
      for (const row of metadata) {
        const id = text(data(row, 'id'), 128), url = normalizedUrl(data(row, 'url')), title = text(data(row, 'title'), 512);
        const ordinal = integer(data(row, 'ordinal')), model = text(data(row, 'model_id'), 128);
        const dimensions = integer(data(row, 'dimensions')), extractor = data(row, 'extractor_version'), manual = data(row, 'manual_topic');
        if (model !== BROWSER_MODEL_ID || ![...PAGE_CONTENT_EXTRACTOR_VERSIONS, 'crawler-static-html-prefix/v1'].includes(extractor) ||
            !dimensions || dimensions > 1536 || data(row, 'has_link') !== true || ids.has(id) || ordinals.has(ordinal)) bad();
        if (manual !== null) text(manual, 128);
        ids.add(id); ordinals.add(ordinal); chunks.add(Math.floor(ordinal / capacity.chunkSize));
        usedUnits += id.length + url.length + title.length + (manual?.length ?? 0) + model.length + dimensions;
        if (!Number.isSafeInteger(usedUnits)) bad();
      }
      const remainingUnits = Math.max(0, capacity.maximumUnits - usedUnits);
      return freeze({ status: 'available', canonical, queue, connections,
        related: { ...capacity, witnessSources: canonical.learnedSources, eligibleSources: metadata.length,
          usedUnits, remainingUnits, occupiedChunks: chunks.size,
          overCapacity: usedUnits > capacity.maximumUnits || chunks.size > capacity.maximumChunks,
          integrityVerified: false } });
    });
  } catch { return UNVERIFIABLE; }
}
