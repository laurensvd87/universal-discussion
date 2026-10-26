import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { assertValidPersistedState } from "../../../local-service/src/domain/persisted-state.js";
import { FIXED_REFERENCE_STATE_SCHEMA } from "../../../local-service/src/domain/demo-state.js";
import { LEARNED_SOURCE_PROVENANCE } from "../../../local-service/src/domain/learned-sources.js";

const ERROR_MESSAGE = "PostgreSQL dashboard unavailable";

function unavailable() {
  const error = new Error(ERROR_MESSAGE);
  error.code = "dashboard-unavailable";
  return error;
}

function safeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw unavailable();
  return number;
}

function decodeValue(value) {
  if (typeof value !== "string") throw unavailable();
  let parsed;
  try { parsed = JSON.parse(value); }
  catch { throw unavailable(); }
  return parsed;
}

function decode(value) {
  const parsed = decodeValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(parsed))) throw unavailable();
  return parsed;
}

function sameNullable(actual, expected) {
  return actual === (expected ?? null);
}

function exactTimestamp(now) {
  let value;
  try { value = new Date(typeof now === "function" ? now() : now); }
  catch { throw unavailable(); }
  if (!Number.isFinite(value.getTime())) throw unavailable();
  return value.toISOString();
}

function denseOrdinals(rows, key = "ordinal") {
  const values = new Set();
  for (const row of rows) {
    const ordinal = safeInteger(row[key]);
    if (values.has(ordinal)) throw unavailable();
    values.add(ordinal);
  }
}

async function headerIn(tx) {
  const { rows } = await tx.query(`SELECT meta.state_schema,meta.generation AS import_generation,
      meta.revision AS import_revision,runtime.generation,runtime.revision,
      runtime.catalog_version,runtime.matching_version
    FROM canonical_v4.meta AS meta
    JOIN canonical_v4.runtime_state AS runtime ON runtime.singleton=meta.singleton
    WHERE meta.singleton=true`);
  if (rows.length !== 1) throw unavailable();
  const row = rows[0];
  const revision = safeInteger(row.revision), importRevision = safeInteger(row.import_revision);
  const catalogVersion = safeInteger(row.catalog_version), matchingVersion = safeInteger(row.matching_version);
  if (row.state_schema !== FIXED_REFERENCE_STATE_SCHEMA || typeof row.generation !== "string" ||
      !row.generation || row.generation.length > 128 || /[\u0000-\u001f\u007f]/u.test(row.generation) ||
      row.generation !== row.import_generation || revision < importRevision) throw unavailable();
  return Object.freeze({ schema: row.state_schema, generation: row.generation, revision,
    catalogVersion, matchingVersion });
}

async function countsIn(tx, header, now) {
  const { rows } = await tx.query(`WITH learned AS (
      SELECT id FROM canonical_v4.sources WHERE provenance=$1
    ), memberships AS (
      SELECT membership.topic_id,count(DISTINCT membership.source_id) AS members
      FROM canonical_v4.topic_memberships AS membership
      JOIN learned ON learned.id=membership.source_id
      JOIN canonical_v4.topics AS topic ON topic.id=membership.topic_id
      GROUP BY membership.topic_id
    ) SELECT
      (SELECT count(*) FROM canonical_v4.sources) AS total_sources,
      (SELECT count(*) FROM learned) AS learned_pages,
      (SELECT count(*) FROM memberships) AS active_topics,
      (SELECT count(*) FROM canonical_v4.topics) AS total_topics,
      (SELECT count(*) FROM memberships WHERE members>=2) AS multi_member_topics,
      (SELECT count(*) FROM memberships WHERE members=1) AS singleton_topics`,
  [LEARNED_SOURCE_PROVENANCE]);
  if (rows.length !== 1) throw unavailable();
  const row = rows[0], point = {
    at: exactTimestamp(now),
    seriesId: createHash("sha256").update(header.generation, "utf8").digest("hex"),
    revision: header.revision,
    totalSources: safeInteger(row.total_sources),
    learnedPages: safeInteger(row.learned_pages),
    activeTopics: safeInteger(row.active_topics),
    totalTopics: safeInteger(row.total_topics),
    multiMemberTopics: safeInteger(row.multi_member_topics),
    singletonTopics: safeInteger(row.singleton_topics),
  };
  if (point.learnedPages > point.totalSources || point.activeTopics > point.totalTopics ||
      point.activeTopics !== point.multiMemberTopics + point.singletonTopics) throw unavailable();
  return Object.freeze(point);
}

function verifyTopic(row, reference) {
  const value = decode(row.payload);
  safeInteger(row.ordinal); safeInteger(row.write_version);
  if (value.id !== row.id || value.kind !== row.kind || value.title !== row.title ||
      value.createdAt !== row.created_at || !sameNullable(row.provenance, value.provenance) ||
      !sameNullable(row.retain_tight, value.retainTight)) throw unavailable();
  if (Object.hasOwn(value, "reference")) {
    if (!reference || reference.source_id !== (value.reference?.sourceId ?? null) ||
        reference.parameter_sha256 !== (value.reference?.parameterSha256 ?? null) ||
        !isDeepStrictEqual(reference.values_double, value.reference?.values ?? null) ||
        !isDeepStrictEqual(decodeValue(reference.payload), value.reference)) throw unavailable();
  } else if (reference) throw unavailable();
  return value;
}

function verifyDiscussion(row) {
  const value = decode(row.payload);
  safeInteger(row.ordinal); safeInteger(row.write_version);
  if (value.id !== row.id || value.topicId !== row.topic_id) throw unavailable();
  return value;
}

function verifyLink(row) {
  const value = decode(row.payload);
  safeInteger(row.ordinal);
  if (value.sourceId !== row.source_id || value.topicId !== row.topic_id || value.method !== row.method)
    throw unavailable();
  return value;
}

function membershipMap(rows) {
  const result = new Map();
  for (const row of rows) {
    const list = result.get(row.source_id) ?? [];
    if (safeInteger(row.ordinal) !== list.length || typeof row.topic_id !== "string" || !row.topic_id)
      throw unavailable();
    list.push(row.topic_id);
    result.set(row.source_id, list);
  }
  return result;
}

function verifySource(row, memberships, links, receipts) {
  const value = decode(row.payload), membershipIds = memberships.get(row.id) ?? [], link = links.get(row.id);
  const receipt = receipts.get(row.id);
  safeInteger(row.ordinal); safeInteger(row.write_version);
  let embedding = null;
  if (row.embedding_payload !== null) {
    embedding = decode(row.embedding_payload);
    if (embedding.modelId !== row.embedding_model_id || !Array.isArray(embedding.values) ||
        safeInteger(row.embedding_dimensions) !== embedding.values.length ||
        !isDeepStrictEqual(row.embedding_values_double, embedding.values)) throw unavailable();
  }
  if (value.id !== row.id || value.url !== row.url || value.title !== row.title ||
      value.provenance !== row.provenance || !sameNullable(row.extractor_version, value.extractorVersion) ||
      !sameNullable(row.policy_version, value.policyVersion) || !sameNullable(row.operation_id, value.operationId) ||
      row.has_embedding !== (embedding !== null) || (link && !membershipIds.includes(link.topicId)) ||
      (!link && membershipIds.length) || (value.provenance === LEARNED_SOURCE_PROVENANCE && (!link || !membershipIds.length)) ||
      (Object.hasOwn(value, "topicIds") && !isDeepStrictEqual(value.topicIds, membershipIds)) ||
      Object.hasOwn(value, "operationId") !== Object.hasOwn(value, "operationDigest")) throw unavailable();
  if (Object.hasOwn(value, "operationId") ? !receipt || receipt.operation_id !== value.operationId ||
      receipt.operation_digest !== value.operationDigest : receipt !== undefined) throw unavailable();
  return { ...value, embedding };
}

async function stateIn(tx, header) {
  const [topicsResult, referencesResult, discussionsResult, sourcesResult, linksResult,
    membershipsResult, receiptsResult, registryResult] = await Promise.all([
    tx.query('SELECT * FROM canonical_v4.topics ORDER BY ordinal'),
    tx.query('SELECT topic_id,payload,source_id,parameter_sha256,values_double FROM canonical_v4.fixed_references'),
    tx.query('SELECT * FROM canonical_v4.discussions ORDER BY ordinal'),
    tx.query(`SELECT source.*,embedding.payload AS embedding_payload,embedding.model_id AS embedding_model_id,
      embedding.dimensions AS embedding_dimensions,embedding.values_double AS embedding_values_double
      FROM canonical_v4.sources AS source
      LEFT JOIN canonical_v4.embeddings AS embedding ON embedding.source_id=source.id
      ORDER BY source.ordinal`),
    tx.query('SELECT * FROM canonical_v4.source_links ORDER BY ordinal'),
    tx.query('SELECT source_id,topic_id,ordinal FROM canonical_v4.topic_memberships ORDER BY source_id COLLATE "C",ordinal'),
    tx.query('SELECT source_id,operation_id,operation_digest FROM canonical_v4.operation_receipts'),
    tx.query(`SELECT entity.id,entity.kind,registry.kind AS registry_kind FROM (
        SELECT id,'topics' AS kind FROM canonical_v4.topics
        UNION ALL SELECT id,'discussions' FROM canonical_v4.discussions
        UNION ALL SELECT id,'sources' FROM canonical_v4.sources
        UNION ALL SELECT id,'contributions' FROM canonical_v4.contributions
      ) AS entity LEFT JOIN canonical_v4.id_registry AS registry ON registry.id=entity.id
      WHERE registry.kind IS DISTINCT FROM entity.kind LIMIT 1`),
  ]);
  if (registryResult.rows.length) throw unavailable();
  denseOrdinals(topicsResult.rows); denseOrdinals(discussionsResult.rows);
  denseOrdinals(sourcesResult.rows); denseOrdinals(linksResult.rows);
  const references = new Map();
  for (const row of referencesResult.rows) {
    if (references.has(row.topic_id)) throw unavailable();
    references.set(row.topic_id, row);
  }
  const topics = topicsResult.rows.map(row => verifyTopic(row, references.get(row.id)));
  if (references.size !== topics.filter(topic => Object.hasOwn(topic, "reference")).length) throw unavailable();
  const discussions = discussionsResult.rows.map(verifyDiscussion);
  const links = new Map();
  const sourceLinks = linksResult.rows.map(row => {
    const value = verifyLink(row);
    if (links.has(value.sourceId)) throw unavailable();
    links.set(value.sourceId, value);
    return value;
  });
  const memberships = membershipMap(membershipsResult.rows), receipts = new Map();
  for (const row of receiptsResult.rows) {
    if (receipts.has(row.source_id)) throw unavailable();
    receipts.set(row.source_id, row);
  }
  const sources = sourcesResult.rows.map(row => verifySource(row, memberships, links, receipts));
  const state = { schema: header.schema, generation: header.generation, revision: header.revision,
    topics, discussions, sources, sourceLinks, contributions: [] };
  try { assertValidPersistedState(state, { largeScale: true }); }
  catch { throw unavailable(); }
  return state;
}

async function snapshot(database, work) {
  try {
    return await database.transaction(async tx => {
      if (tx.dialect === "pg") await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return work(tx);
    });
  } catch (error) {
    if (error?.code === "dashboard-unavailable" && error?.message === ERROR_MESSAGE) throw error;
    throw unavailable();
  }
}

// The dashboard owns no write authority. This reader selects one coherent MVCC
// snapshot and returns either a validated catalog-only state or aggregate-only
// counters when the reviewed graph limit would be exceeded. It never selects a
// contribution or revision payload.
export function createPostgresDashboardSource({ database } = {}) {
  if (!database || typeof database.query !== "function" || typeof database.transaction !== "function")
    throw new TypeError("Invalid PostgreSQL dashboard dependencies");
  return Object.freeze({
    async readRevision() {
      return snapshot(database, async tx => {
        const header = await headerIn(tx);
        return JSON.stringify([header.generation, header.catalogVersion]);
      });
    },

    async readCounts({ now = () => new Date() } = {}) {
      return snapshot(database, async tx => countsIn(tx, await headerIn(tx), now));
    },

    async loadState() {
      return snapshot(database, async tx => {
        const header = await headerIn(tx);
        return stateIn(tx, header);
      });
    },

    async readSnapshot({ now = () => new Date(), graphLimit = 1_000 } = {}) {
      if (!Number.isSafeInteger(graphLimit) || graphLimit < 0 || graphLimit > 100_000)
        throw new TypeError("Invalid PostgreSQL dashboard graph limit");
      return snapshot(database, async tx => {
        const header = await headerIn(tx), point = await countsIn(tx, header, now);
        const state = point.learnedPages > graphLimit ? null : await stateIn(tx, header);
        return Object.freeze({ header, point, state });
      });
    },
  });
}
