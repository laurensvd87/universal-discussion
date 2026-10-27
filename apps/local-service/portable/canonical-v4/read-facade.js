import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { setImmediate as yieldReadWork } from 'node:timers/promises';
import { ServiceError, fail } from '../../src/domain/errors.js';
import { MAX_RESPONSE_BYTES } from '../../src/domain/discussion-view.js';
import { BROWSER_MODEL_ID, compatibleExtractor, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE } from '../../src/domain/learned-sources.js';
import { sourceStamp } from '../../src/domain/source-threads.js';
import { frozenClone, readBody, readId, readRecord, readText } from '../../src/domain/validation.js';
import { createRelatedSourcesPreparation, parseRelatedEmbeddingJson } from '../../../../spikes/topic-resolution/browser/core/related-sources.js';
import { createEmbeddingWireQuery, decodeEmbeddingBase64Array } from './embedding-binary-wire.js';
import { readRelatedCatalogEvidence } from './related-catalog-evidence.js';
import { buildRelatedCatalogIndex, createRelatedCatalogEntryPreparation, relatedCatalogChanges, rankRelatedCatalogIndex } from './related-catalog-index.js';
import { inspectPageNavigationUrl, inspectPageUrl } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import { createCanonicalV4SemanticDiscussionRepository } from './semantic-discussion-repository.js';

const CATALOG_CURSOR_SCHEMA = 'canonical-v4-catalog-page/v1';
const DISCUSSION_CURSOR_SCHEMA = 'canonical-v4-contributions/v1';
const DISCOVERY_CURSOR_SCHEMA = 'canonical-v4-discovery/v1';
const SEMANTIC_FEED_CURSOR_SCHEMA = 'canonical-v4-semantic-roots/v1';
const SEMANTIC_THREAD_CURSOR_SCHEMA = 'canonical-v4-semantic-replies/v1';
const PAGE_BYTES = MAX_RESPONSE_BYTES - 4096;
const SEMANTIC_PAGE_BYTES = PAGE_BYTES - 65536; // bounded public actor metadata
const MAX_PAGE_ITEMS = 100;
// The current empty public context presents at most 100 Topics and 100 Sources;
// the larger values below bound authority-preserving closure, not presentation.
const MAX_CONTEXT_PRESENTATION_ITEMS = 100;
const MAX_CONTEXT_CLOSURE_TOPICS = 500;
const MAX_CONTEXT_CLOSURE_SOURCES = 500;
const encoder = new TextEncoder();
const RELATED_STATE = Symbol('private-related-catalog-state');

function corrupt(message = 'Canonical PostgreSQL data is inconsistent') {
  throw new ServiceError('storage-corrupt', message);
}

function decoded(text, label, { allowNull = false } = {}) {
  if (typeof text !== 'string') corrupt(`Invalid ${label}`);
  let value;
  try { value = JSON.parse(text); }
  catch { corrupt(`Invalid ${label}`); }
  if (value === null && allowNull) return null;
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) corrupt(`Invalid ${label}`);
  return value;
}

function safeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) corrupt(`Invalid ${label}`);
  return number;
}

function sameNullable(actual, expected) {
  return actual === (expected ?? null);
}

function byteLength(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function placeholders(values, first = 1) {
  return values.map((_, index) => `$${first + index}`).join(',');
}

function cursorText(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/u.test(value)) fail('invalid', `Invalid ${label} cursor`);
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) fail('invalid', `Invalid ${label} cursor`);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    fail('invalid', `Invalid ${label} cursor`);
  }
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function semanticOrdinal(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/u.test(value) || BigInt(value) > 9223372036854775807n)
    fail('invalid', 'Invalid semantic position');
  return value;
}

function semanticInput(value, thread = false) {
  const input = readRecord(value, thread ? ['nodeId', 'rootId', 'limit', 'cursor'] : ['nodeId', 'limit', 'cursor'],
    thread ? ['nodeId', 'rootId'] : ['nodeId']);
  const nodeId = readText(input.nodeId, 160), limit = input.limit ?? 20;
  if (nodeId !== input.nodeId || !Number.isInteger(limit) || limit < 1 || limit > 50)
    fail('invalid', 'Invalid semantic page');
  return { nodeId, limit, cursor: input.cursor ?? null, ...(thread ? { rootId: readId(input.rootId) } : {}) };
}

function semanticPosition(cursor, binding, schema) {
  if (cursor === null) return null;
  const value = readRecord(cursorText(cursor, 'semantic'), ['schema', ...Object.keys(binding), 'afterOrdinal']);
  if (value.schema !== schema) fail('invalid', 'Invalid semantic cursor');
  for (const key of Object.keys(binding)) if (value[key] !== binding[key]) fail('conflict', 'Semantic page changed');
  return semanticOrdinal(value.afterOrdinal);
}

// Root/feed previews need only the latest revision. Reading all edits or every
// reply in a shared canonical Discussion would make these bounded pages unbounded.
async function latestContributionRows(tx, ids = null, { rootId = null, after = null, limit = null } = {}) {
  const parameters = ids === null ? [rootId] : [...ids];
  let predicate = ids === null ? 'c.root_id=$1 AND c.visibility=\'local-public\'' : `c.id IN (${placeholders(ids)})`;
  if (after !== null) { parameters.push(after); predicate += ` AND c.ordinal>$${parameters.length}::bigint`; }
  let suffix = '';
  if (limit !== null) { parameters.push(limit); suffix = ` LIMIT $${parameters.length}`; }
  return (await tx.query(`SELECT c.*, latest.ordinal AS latest_ordinal,latest.payload AS latest_payload
    FROM canonical_v4.contributions c LEFT JOIN LATERAL (
      SELECT ordinal,payload FROM canonical_v4.revisions WHERE contribution_id=c.id ORDER BY ordinal DESC LIMIT 1
    ) latest ON true WHERE ${predicate} ORDER BY c.ordinal${suffix}`, parameters)).rows;
}

function latestContribution(row) {
  const value = decoded(row.payload, 'contribution payload');
  if (row.id !== value.id || row.discussion_id !== value.discussionId ||
      !sameNullable(row.root_id, value.rootId) || !sameNullable(row.reply_to_id, value.replyToId) ||
      !sameNullable(row.author_id, value.authorId) || !sameNullable(row.operator_id, value.insight?.operatorId) ||
      !sameNullable(row.origin_source_id, value.originSourceId) ||
      !sameNullable(row.anchor_source_id, value.anchor?.kind === 'source' ? value.anchor.sourceId : undefined) ||
      row.actor_type !== value.actorType || row.visibility !== value.visibility || row.withdrawn !== value.withdrawn ||
      row.created_at !== value.createdAt || value.visibility !== 'local-public') corrupt('Invalid semantic contribution mirror');
  try { readId(value.id); readId(value.discussionId); semanticOrdinal(String(row.ordinal)); semanticOrdinal(String(row.write_version)); }
  catch { corrupt('Invalid semantic contribution position'); }
  const count = safeInteger(row.revision_count, 'revision count');
  if (value.withdrawn) {
    if (count !== 0 || row.latest_payload !== null || row.latest_ordinal !== null) corrupt('Invalid deleted semantic contribution');
    return { value, revisions: [], edited: false };
  }
  if (!count || row.latest_ordinal === null || safeInteger(row.latest_ordinal, 'latest revision') !== count - 1 || row.latest_payload === null)
    corrupt('Missing semantic contribution revision');
  return { value, revisions: [verifyRevisionPayload(decoded(row.latest_payload, 'latest revision'))], edited: count > 1 };
}

async function semanticPublicContributions(tx, rows, topicId) {
  const entries = rows.map(latestContribution), originIds = [...new Set(entries.map(entry => entry.value.originSourceId).filter(Boolean))];
  const origins = new Map((await sourcesFromRows(tx, await sourceRowsByIds(tx, originIds)))
    .map(entry => [entry.value.id, entry.public]));
  return entries.map(({ value, revisions, edited }) => {
    if (value.originSourceId && !origins.has(value.originSourceId)) corrupt('Missing semantic contribution origin');
    const projected = publicContribution(value, revisions, origins.get(value.originSourceId), topicId);
    return projected.state === 'deleted' ? projected : { ...projected, edited };
  });
}

async function semanticRootCards(tx, references) {
  if (!references.length) return [];
  const ids = references.map(ref => ref.rootId), rows = await latestContributionRows(tx, ids);
  const byId = new Map(rows.map(row => [row.id, row]));
  if (byId.size !== references.length || rows.length !== references.length) corrupt('Missing semantic root');
  const discussionIds = [...new Set(references.map(ref => ref.discussionId))];
  const discussions = new Map((await tx.query(`SELECT * FROM canonical_v4.discussions WHERE id IN (${placeholders(discussionIds)})`, discussionIds)).rows
    .map(row => { const entry = verifyDiscussionRow(row); return [entry.value.id, entry.value]; }));
  const topicIds = [...new Set(references.map(ref => ref.topicId))];
  const topics = new Map((await topicsFromRows(tx, await topicRowsByIds(tx, topicIds))).map(entry => [entry.value.id, entry.value]));
  // Origins and revisions are hydrated once per bounded page, never per user/model.
  const entries = await semanticPublicContributions(tx, references.map(ref => byId.get(ref.rootId)), null);
  return references.map((ref, i) => {
    const row = byId.get(ref.rootId), discussion = discussions.get(ref.discussionId), topic = topics.get(ref.topicId);
    if (row.root_id !== null || row.withdrawn || row.visibility !== 'local-public' || row.discussion_id !== ref.discussionId ||
        String(row.ordinal) !== ref.ordinal || !discussion || discussion.topicId !== ref.topicId || !topic)
      corrupt('Invalid semantic root destination');
    const root = { ...entries[i] };
    delete root.regrouped;
    if (decoded(row.payload, 'root payload').originalTopicId !== ref.topicId) root.regrouped = true;
    return { topic: publicDiscussionTopic(topic), discussionId: discussion.id, root };
  });
}

async function semanticRootMembership(tx, semantic, generation, nodeId, rootId) {
  const { rows } = await tx.query(`SELECT id,ordinal,revision_count FROM canonical_v4.contributions
    WHERE id=$1 AND root_id IS NULL AND visibility='local-public' AND withdrawn=false`, [rootId]);
  if (rows.length !== 1) fail('not-found', 'Thread unavailable');
  const position = semanticOrdinal(String(rows[0].ordinal)), revision = safeInteger(rows[0].revision_count, 'root revision');
  if (revision < 1) corrupt('Invalid semantic root revision');
  // Globally unique ordinals make one indexed keyset lookup an exact membership
  // check. At the bigint maximum this root is necessarily the newest ordinal.
  const before = position === '9223372036854775807' ? null : String(BigInt(position) + 1n);
  const membership = await semantic.feedReferences({ generation, nodeId, beforeOrdinal: before, limit: 1 });
  const ref = membership.references[0];
  if (!ref || ref.rootId !== rootId || ref.ordinal !== position) fail('not-found', 'Thread unavailable');
  return { ref, revision };
}

function discoveryInput(value) {
  const input = readRecord(value, ['query', 'limit', 'cursor'], []);
  const query = input.query === undefined ? '' : input.query;
  const limit = input.limit === undefined ? 20 : input.limit;
  if (typeof query !== 'string' || query.length > 256 || /[\p{Cc}\p{Cf}]/u.test(query) ||
      !Number.isInteger(limit) || limit < 1 || limit > 50) fail('invalid', 'Invalid discovery query');
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length > 16 || query.trim() && terms.length === 0) fail('invalid', 'Invalid discovery query');
  return { query: query.trim(), terms, limit, cursor: input.cursor ?? null };
}

function discoveryPosition(cursor, binding) {
  if (cursor === null) return null;
  const value = readRecord(cursorText(cursor, 'discovery'),
    ['schema', 'binding', 'score', 'replies', 'updatedAt', 'id']);
  if (value.schema !== DISCOVERY_CURSOR_SCHEMA || value.binding !== binding ||
      typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 ||
      !Number.isSafeInteger(value.replies) || value.replies < 0)
    fail(value.binding === binding ? 'invalid' : 'conflict', 'Discovery changed');
  return { score: value.score, replies: value.replies,
    updatedAt: readText(value.updatedAt, 64), id: readId(value.id) };
}

function readCatalogCursor(value, header, kind, limit) {
  if (value === null) return null;
  const cursor = readRecord(cursorText(value, 'catalog'),
    ['schema', 'generation', 'catalogVersion', 'kind', 'limit', 'after']);
  if (cursor.schema !== CATALOG_CURSOR_SCHEMA || cursor.kind !== kind || cursor.limit !== limit ||
      !Number.isSafeInteger(cursor.catalogVersion) || cursor.catalogVersion < 0) fail('invalid', 'Invalid catalog cursor');
  const generation = readId(cursor.generation), after = readId(cursor.after);
  if (generation !== header.version.generation || cursor.catalogVersion !== header.catalogVersion)
    fail('conflict', 'Catalog page changed');
  return after;
}

function readDiscussionCursor(value, header, topicId, discussionId, discussionVersion, limit) {
  if (value === null) return null;
  const cursor = readRecord(cursorText(value, 'discussion'),
    ['schema', 'generation', 'topicId', 'discussionId', 'discussionVersion', 'limit', 'after']);
  if (cursor.schema !== DISCUSSION_CURSOR_SCHEMA || !Number.isSafeInteger(cursor.discussionVersion) ||
      cursor.discussionVersion < 0 || !Number.isInteger(cursor.limit) || cursor.limit < 1 ||
      cursor.limit > MAX_PAGE_ITEMS) fail('invalid', 'Invalid discussion cursor');
  const cursorGeneration = readId(cursor.generation), cursorTopicId = readId(cursor.topicId);
  const cursorDiscussionId = readId(cursor.discussionId);
  const after = readRecord(cursor.after, ['createdAt', 'id']);
  const position = { createdAt: readText(after.createdAt, 64), id: readId(after.id) };
  if (cursorGeneration !== header.version.generation || cursorTopicId !== topicId ||
      cursorDiscussionId !== discussionId || cursor.discussionVersion !== discussionVersion ||
      cursor.limit !== limit) fail('conflict', 'Discussion page changed');
  return position;
}

function publicTopic(value) {
  return {
    id: value.id,
    title: value.title,
    kind: value.kind,
    ...(value.provenance === LEARNED_TOPIC_PROVENANCE ? { learned: true } : {}),
  };
}

function publicDiscussionTopic(value) {
  return { id: value.id, title: value.title, kind: value.kind };
}

function publicSource(value, link, membershipIds) {
  return {
    id: value.id,
    url: value.url,
    title: value.title,
    provenance: value.provenance,
    topicId: link?.topicId ?? null,
    ...(Object.hasOwn(value, 'topicIds') ? { topicIds: [...membershipIds] } : {}),
  };
}

function publicContribution(value, revisions, origin, currentTopicId) {
  if (value.withdrawn) return {
    id: value.id,
    rootId: value.rootId,
    replyToId: value.replyToId,
    state: 'deleted',
    label: 'Deleted by user',
  };
  const latest = revisions.at(-1);
  if (!latest || typeof latest.body !== 'string') corrupt('Invalid contribution revision');
  return {
    id: value.id,
    rootId: value.rootId,
    replyToId: value.replyToId,
    state: 'visible',
    authorId: value.authorId,
    actorType: value.actorType,
    ...(value.insight ? { insight: value.insight } : {}),
    body: latest.body,
    createdAt: value.createdAt,
    edited: revisions.length > 1,
    ...(origin ? { origin: { sourceId: origin.id, url: origin.url, title: origin.title } } : {}),
    ...(value.rootId === null && value.originalTopicId !== currentTopicId ? { regrouped: true } : {}),
  };
}

function verifyRevisionPayload(value) {
  try {
    const revision = readRecord(value, ['body', 'createdAt']);
    readBody(revision.body); readText(revision.createdAt, 64);
  } catch { corrupt('Invalid contribution revision'); }
  return value;
}

async function headerIn(tx) {
  const { rows } = await tx.query(`SELECT meta.state_schema,meta.generation AS import_generation,
      meta.revision AS import_revision,runtime.generation,runtime.revision,
      runtime.catalog_version,runtime.matching_version
    FROM canonical_v4.meta AS meta
    JOIN canonical_v4.runtime_state AS runtime ON runtime.singleton=meta.singleton
    WHERE meta.singleton=true`);
  if (rows.length !== 1) fail('unavailable', 'Canonical runtime unavailable');
  const row = rows[0];
  if (row.state_schema !== 'demo-state/v4' || row.generation !== row.import_generation ||
      safeInteger(row.revision, 'runtime revision') < safeInteger(row.import_revision, 'import revision'))
    corrupt('Invalid canonical runtime header');
  let generation;
  try { generation = readId(row.generation); }
  catch { corrupt('Invalid canonical runtime generation'); }
  return {
    schema: row.state_schema,
    version: { generation, revision: safeInteger(row.revision, 'runtime revision') },
    catalogVersion: safeInteger(row.catalog_version, 'catalog version'),
    matchingVersion: safeInteger(row.matching_version, 'matching version'),
  };
}

async function snapshot(database, work) {
  try {
    return await database.transaction(async (tx) => {
      // Native PostgreSQL must pin every multi-query DTO to one MVCC snapshot.
      // PGlite's embedded transaction is its equivalent and rejects this mode.
      if (tx.dialect === 'pg')
        await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return frozenClone(await work(tx));
    });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('storage-failure', 'Canonical PostgreSQL read failed');
  }
}

// Fixed composite reads may reuse the already-open repeatable-read transaction.
// This is private composition only: callers cannot provide SQL or callbacks.
function sameSnapshotFacade(tx, relatedState) {
  const nested = Object.freeze({ dialect: 'canonical-snapshot', wireDialect: tx.wireDialect ?? tx.dialect,
    query: (...args) => tx.query(...args) });
  return createCanonicalV4ReadFacade({
    database: Object.freeze({ query: (...args) => tx.query(...args), transaction: (work) => work(nested) }),
    [RELATED_STATE]: relatedState,
  });
}

function verifyTopicRow(row, referenceRow) {
  const value = decoded(row.payload, 'Topic payload');
  if (safeInteger(row.ordinal, 'Topic ordinal') < 0 || safeInteger(row.write_version, 'Topic version') < 0 ||
      row.id !== value.id || row.kind !== value.kind || row.title !== value.title ||
      row.created_at !== value.createdAt || !sameNullable(row.provenance, value.provenance) ||
      !sameNullable(row.retain_tight, value.retainTight)) corrupt('Invalid Topic typed mirror');
  if (Object.hasOwn(value, 'reference')) {
    if (!referenceRow || !isDeepStrictEqual(decoded(referenceRow.payload, 'Topic reference payload', { allowNull: true }), value.reference) ||
        referenceRow.source_id !== (value.reference?.sourceId ?? null) ||
        referenceRow.parameter_sha256 !== (value.reference?.parameterSha256 ?? null) ||
        !isDeepStrictEqual(referenceRow.values_double, value.reference?.values ?? null))
      corrupt('Invalid Topic reference mirror');
  } else if (referenceRow) corrupt('Invalid Topic reference mirror');
  return { value, public: publicTopic(value), ordinal: safeInteger(row.ordinal, 'Topic ordinal'),
    referenceSourceId: value.reference?.sourceId ?? null };
}

async function topicsFromRows(tx, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const { rows: references } = await tx.query(`SELECT topic_id,payload,source_id,parameter_sha256,values_double
    FROM canonical_v4.fixed_references WHERE topic_id IN (${placeholders(ids)})`, ids);
  const byTopic = new Map();
  for (const row of references) {
    if (byTopic.has(row.topic_id)) corrupt('Duplicate Topic reference');
    byTopic.set(row.topic_id, row);
  }
  return rows.map((row) => verifyTopicRow(row, byTopic.get(row.id)));
}

function verifyDiscussionRow(row) {
  const value = decoded(row.payload, 'discussion payload');
  if (row.id !== value.id || row.topic_id !== value.topicId) corrupt('Invalid discussion typed mirror');
  return { value, ordinal: safeInteger(row.ordinal, 'discussion ordinal'),
    writeVersion: safeInteger(row.write_version, 'discussion version') };
}

function verifyLinkRow(row) {
  const value = decoded(row.payload, 'Source link payload');
  if (value.sourceId !== row.source_id || value.topicId !== row.topic_id || value.method !== row.method)
    corrupt('Invalid Source link typed mirror');
  safeInteger(row.ordinal, 'Source link ordinal');
  return value;
}

async function sourcesFromRows(tx, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id), list = placeholders(ids);
  const { rows: linkRows } = await tx.query(`SELECT source_id,topic_id,ordinal,payload,method
    FROM canonical_v4.source_links WHERE source_id IN (${list})`, ids);
  const { rows: membershipRows } = await tx.query(`SELECT source_id,topic_id,ordinal
    FROM canonical_v4.topic_memberships WHERE source_id IN (${list})
    ORDER BY source_id COLLATE "C",ordinal`, ids);
  const { rows: embeddingRows } = await tx.query(`SELECT source_id FROM canonical_v4.embeddings
    WHERE source_id IN (${list})`, ids);
  const { rows: receiptRows } = await tx.query(`SELECT source_id,operation_id,operation_digest
    FROM canonical_v4.operation_receipts WHERE source_id IN (${list})`, ids);
  const links = new Map(), memberships = new Map(), embeddings = new Set(), receipts = new Map();
  for (const row of linkRows) {
    if (links.has(row.source_id)) corrupt('Duplicate Source link');
    links.set(row.source_id, verifyLinkRow(row));
  }
  for (const row of membershipRows) {
    const entries = memberships.get(row.source_id) ?? [];
    if (safeInteger(row.ordinal, 'membership ordinal') !== entries.length) corrupt('Invalid membership ordinal');
    entries.push(row.topic_id); memberships.set(row.source_id, entries);
  }
  for (const row of embeddingRows) {
    if (embeddings.has(row.source_id)) corrupt('Duplicate embedding');
    embeddings.add(row.source_id);
  }
  for (const row of receiptRows) {
    if (receipts.has(row.source_id)) corrupt('Duplicate operation receipt');
    receipts.set(row.source_id, row);
  }
  const result = [];
  for (const row of rows) {
    const value = decoded(row.payload, 'Source payload');
    const link = links.get(row.id), memberIds = memberships.get(row.id) ?? [], receipt = receipts.get(row.id);
    const learned = value.provenance === LEARNED_SOURCE_PROVENANCE;
    if ((learned && (!link || !memberIds.length)) || (link && !memberIds.includes(link.topicId)) ||
        (!link && memberIds.length) || (Object.hasOwn(value, 'topicIds') && !memberIds.length) ||
        Object.hasOwn(value, 'operationId') !== Object.hasOwn(value, 'operationDigest') || row.id !== value.id ||
        row.url !== value.url || row.title !== value.title || row.provenance !== value.provenance ||
        !sameNullable(row.extractor_version, value.extractorVersion) ||
        !sameNullable(row.policy_version, value.policyVersion) ||
        !sameNullable(row.operation_id, value.operationId) || Boolean(row.has_embedding) !== embeddings.has(row.id) ||
        Object.hasOwn(value, 'topicIds') && !isDeepStrictEqual(value.topicIds, memberIds))
      corrupt('Invalid Source typed mirror');
    if (Object.hasOwn(value, 'operationId') ? !receipt || receipt.operation_id !== value.operationId ||
        receipt.operation_digest !== value.operationDigest : receipt !== undefined)
      corrupt('Invalid Source operation receipt');
    result.push({ value, public: publicSource(value, link, memberIds), link: link ?? null,
      membershipIds: memberIds, ordinal: safeInteger(row.ordinal, 'Source ordinal'),
      writeVersion: safeInteger(row.write_version, 'Source version') });
    if (result.length % 128 === 0 && result.length < rows.length) await yieldReadWork();
  }
  return result;
}

function verifiedEmbeddingRow(row, binaryWire = false) {
  let value;
  try { value = parseRelatedEmbeddingJson(row.payload); }
  catch { corrupt('Invalid embedding payload'); }
  const dimensions = safeInteger(row.dimensions, 'embedding dimensions');
  // Only the strict decoder creates this local dense array; it cannot acquire
  // caller properties or change between decode and this synchronous comparison.
  const doubleValues = binaryWire ? decodeEmbeddingBase64Array(row.values_double_base64) : row.values_double;
  if (row.model_id !== value.modelId || dimensions !== value.values.length ||
      !Array.isArray(doubleValues) || doubleValues.length !== dimensions)
    corrupt('Invalid embedding mirror');
  if (binaryWire) {
    for (let index = 0; index < dimensions; index++)
      if (!Object.is(value.values[index], doubleValues[index])) corrupt('Invalid embedding mirror');
  } else if (doubleValues.some(entry => typeof entry !== 'number' || !Number.isFinite(entry)) ||
      !isDeepStrictEqual(doubleValues, value.values)) corrupt('Invalid embedding mirror');
  return value;
}

async function sourceWithAuthoritativeEmbedding(tx, source) {
  const { rows } = await tx.query(`SELECT source_id,payload,model_id,dimensions,values_double
    FROM canonical_v4.embeddings WHERE source_id=$1`, [source.value.id]);
  if (rows.length > 1) corrupt('Duplicate embedding');
  const embedding = rows.length === 1 ? verifiedEmbeddingRow(rows[0]) : null;
  if (Object.hasOwn(source.value, 'embedding') &&
      !isDeepStrictEqual(source.value.embedding, embedding)) corrupt('Invalid embedding mirror');
  const value = { ...source.value, embedding }, stamp = sourceStamp(value);
  return { value, stamp };
}

function assertComponentVersions(version, values, label) {
  for (const value of values) if (value !== null &&
      (value?.version?.generation !== version.generation || value.version.revision !== version.revision))
    corrupt(`Incoherent canonical ${label}`);
}

async function topicRowsByIds(tx, ids) {
  if (!ids.length) return [];
  return (await tx.query(`SELECT * FROM canonical_v4.topics WHERE id IN (${placeholders(ids)})
    ORDER BY ordinal`, ids)).rows;
}

async function sourceRowsByIds(tx, ids) {
  if (!ids.length) return [];
  return (await tx.query(`SELECT * FROM canonical_v4.sources WHERE id IN (${placeholders(ids)})
    ORDER BY ordinal`, ids)).rows;
}

// Exact metadata closure for one read snapshot. Additional Topic descriptors do
// not fetch their entire member lists; only fixed-reference Sources and their
// own memberships are required, under the same existing finite context bounds.
async function closeCatalogMetadata(tx, selectedSources, topicIds) {
  if (selectedSources.size > MAX_CONTEXT_CLOSURE_SOURCES)
    fail('capacity', 'Catalog context capacity reached');
  for (const source of selectedSources.values())
    for (const topicId of source.membershipIds) topicIds.add(topicId);
  const selectedTopics = new Map();
  while (selectedTopics.size < topicIds.size) {
    if (topicIds.size > MAX_CONTEXT_CLOSURE_TOPICS) fail('capacity', 'Catalog context capacity reached');
    const pending = [...topicIds].filter((id) => !selectedTopics.has(id));
    const hydratedTopics = await topicsFromRows(tx, await topicRowsByIds(tx, pending));
    if (hydratedTopics.length !== pending.length) corrupt('Missing catalog Topic closure');
    for (const topic of hydratedTopics) selectedTopics.set(topic.value.id, topic);
    const referenceIds = [...new Set(hydratedTopics.map((topic) => topic.referenceSourceId)
      .filter((id) => id !== null && !selectedSources.has(id)))];
    if (selectedSources.size + referenceIds.length > MAX_CONTEXT_CLOSURE_SOURCES)
      fail('capacity', 'Catalog context capacity reached');
    const referenceSources = await sourcesFromRows(tx, await sourceRowsByIds(tx, referenceIds));
    if (referenceSources.length !== referenceIds.length) corrupt('Missing fixed-reference Source');
    for (const source of referenceSources) {
      selectedSources.set(source.value.id, source);
      for (const topicId of source.membershipIds) topicIds.add(topicId);
    }
  }
  return {
    topics: [...selectedTopics.values()].sort((a, b) => a.ordinal - b.ordinal).map((entry) => entry.public),
    sources: [...selectedSources.values()].sort((a, b) => a.ordinal - b.ordinal).map((entry) => entry.public),
  };
}

async function catalogWithOptionalMetadata(tx, base, related, prior, alternate) {
  const sourceIds = new Set(base.sources.map((source) => source.id));
  const topicIds = new Set(base.topics.map((topic) => topic.id));
  for (const source of related?.results ?? []) sourceIds.add(source.id);
  for (const topic of prior?.topics ?? []) topicIds.add(topic.id);
  for (const id of alternate?.sourceIds ?? []) sourceIds.add(id);
  for (const discussion of alternate?.discussions ?? []) topicIds.add(discussion.topic.id);
  if (sourceIds.size > MAX_CONTEXT_CLOSURE_SOURCES || topicIds.size > MAX_CONTEXT_CLOSURE_TOPICS)
    fail('capacity', 'Catalog context capacity reached');
  const sources = await sourcesFromRows(tx, await sourceRowsByIds(tx, [...sourceIds]));
  if (sources.length !== sourceIds.size) corrupt('Missing optional catalog Source');
  const closure = await closeCatalogMetadata(tx, new Map(sources.map((source) => [source.value.id, source])), topicIds);
  return assertDtoSize({ ...base, ...closure }, 'Catalog context');
}

async function contributionsFromRows(tx, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const { rows: revisionRows } = await tx.query(`SELECT contribution_id,ordinal,payload
    FROM canonical_v4.revisions WHERE contribution_id IN (${placeholders(ids)})
    ORDER BY contribution_id COLLATE "C",ordinal`, ids);
  const revisions = new Map();
  for (const row of revisionRows) {
    const entries = revisions.get(row.contribution_id) ?? [];
    if (safeInteger(row.ordinal, 'revision ordinal') !== entries.length) corrupt('Invalid revision ordinal');
    entries.push(verifyRevisionPayload(decoded(row.payload, 'revision payload')));
    revisions.set(row.contribution_id, entries);
  }
  return rows.map((row) => {
    const value = decoded(row.payload, 'contribution payload'), entryRevisions = revisions.get(row.id) ?? [];
    if (row.id !== value.id || row.discussion_id !== value.discussionId ||
        !sameNullable(row.root_id, value.rootId) || !sameNullable(row.reply_to_id, value.replyToId) ||
        !sameNullable(row.author_id, value.authorId) || !sameNullable(row.operator_id, value.insight?.operatorId) ||
        !sameNullable(row.origin_source_id, value.originSourceId) ||
        !sameNullable(row.anchor_source_id, value.anchor?.kind === 'source' ? value.anchor.sourceId : undefined) ||
        row.actor_type !== value.actorType || row.visibility !== value.visibility ||
        row.withdrawn !== value.withdrawn || row.created_at !== value.createdAt ||
        safeInteger(row.revision_count, 'revision count') !== entryRevisions.length ||
        safeInteger(row.ordinal, 'contribution ordinal') < 0 || safeInteger(row.write_version, 'contribution version') < 0)
      corrupt('Invalid contribution typed mirror');
    return { ...value, revisions: entryRevisions };
  });
}

function assertDtoSize(value, label) {
  if (byteLength(value) > PAGE_BYTES) fail('capacity', `${label} capacity reached`);
  return value;
}

function validatePageInput(value, kind = null) {
  const allowed = kind === 'catalog' ? ['kind', 'limit', 'cursor'] : ['topicId', 'limit', 'cursor'];
  const input = readRecord(value, allowed);
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_ITEMS ||
      input.cursor !== null && typeof input.cursor !== 'string') fail('invalid', 'Invalid request');
  if (kind === 'catalog' && !['topics', 'sources'].includes(input.kind)) fail('invalid', 'Invalid request');
  return input;
}

function sanitizedPersistenceUrl(value) {
  const input = readRecord(value, ['url']);
  const inspected = inspectPageNavigationUrl(input.url);
  if (!inspected.supported || inspected.url !== input.url || inspected.documentUrl !== input.url)
    fail('invalid', 'Invalid request');
  return input.url;
}

const TOPIC_SPACE_ROOT_LIMIT = 4096;
const TOPIC_SPACE_POST_LIMIT = 32768;
const TOPIC_SPACE_WITNESS_LIMIT = 262144;
const TOPIC_SPACE_METADATA_LIMIT = 8192;
const TOPIC_SPACE_INPUT_BYTES = 64 * 1024 * 1024;
const TOPIC_SPACE_REVISION_BYTES = 16 * 1024 * 1024;

function topicSpaceVector(embedding) {
  if (embedding === null) return null;
  if (embedding.modelId !== BROWSER_MODEL_ID || embedding.values.length !== 384)
    corrupt('Invalid Topic space embedding');
  const scale = Math.max(...embedding.values.map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) corrupt('Invalid Topic space embedding');
  const scaled = embedding.values.map(value => value / scale), norm = Math.hypot(...scaled);
  return scaled.map(value => value / norm);
}

async function topicSpaceRoots(tx, ids = null) {
  const selected = ids === null ? '' : `AND id IN (${placeholders(ids)})`;
  if (ids?.length === 0) return [];
  const { rows } = await tx.query(`SELECT * FROM canonical_v4.contributions
    WHERE root_id IS NULL AND visibility='local-public' AND withdrawn=false ${selected}
    ORDER BY id COLLATE "C" LIMIT ${TOPIC_SPACE_ROOT_LIMIT + 1}`, ids ?? []);
  if (rows.length > TOPIC_SPACE_ROOT_LIMIT) fail('capacity', 'Topic space root capacity reached');
  return rows;
}

// Fingerprint exact scoped row witnesses, not the crawler's global revision or
// sums of counters. PostgreSQL hashes payloads before returning them, so a stamp
// never transports message bodies, vectors, account records, or private chats.
async function topicSpaceFingerprint(tx, roots, generation) {
  if (!roots.length) return createHash('sha256').update(JSON.stringify([generation, []])).digest('hex');
  const ids = roots.map(row => row.id);
  const { rows } = await tx.query(`WITH roots AS MATERIALIZED (
      SELECT * FROM canonical_v4.contributions WHERE id IN (${placeholders(ids)})
    ), posts AS MATERIALIZED (
      SELECT contribution.* FROM canonical_v4.contributions AS contribution
      WHERE contribution.visibility='local-public' AND
        (contribution.id IN (SELECT id FROM roots) OR contribution.root_id IN (SELECT id FROM roots))
      ORDER BY contribution.id COLLATE "C" LIMIT ${TOPIC_SPACE_POST_LIMIT + 1}
    ), destinations AS MATERIALIZED (
      SELECT * FROM canonical_v4.discussions WHERE id IN (SELECT discussion_id FROM roots)
    ), origins AS MATERIALIZED (
      SELECT * FROM canonical_v4.sources WHERE id IN (SELECT origin_source_id FROM roots)
    ), witnesses AS (
      SELECT 'post' AS kind,p.id AS id,0::bigint AS ordinal,to_jsonb(p)::text AS witness FROM posts p
      UNION ALL SELECT 'revision',r.contribution_id,r.ordinal,to_jsonb(r)::text
        FROM canonical_v4.revisions r WHERE r.contribution_id IN (SELECT id FROM posts)
      UNION ALL SELECT 'discussion',d.id,0,to_jsonb(d)::text FROM destinations d
      UNION ALL SELECT 'topic',t.id,0,to_jsonb(t)::text FROM canonical_v4.topics t
        WHERE t.id IN (SELECT topic_id FROM destinations)
      UNION ALL SELECT 'reference',f.topic_id,0,to_jsonb(f)::text FROM canonical_v4.fixed_references f
        WHERE f.topic_id IN (SELECT topic_id FROM destinations)
      UNION ALL SELECT 'source',s.id,0,to_jsonb(s)::text FROM origins s
      UNION ALL SELECT 'link',l.source_id,0,to_jsonb(l)::text FROM canonical_v4.source_links l
        WHERE l.source_id IN (SELECT id FROM origins)
      UNION ALL SELECT 'membership',m.source_id,m.ordinal,to_jsonb(m)::text FROM canonical_v4.topic_memberships m
        WHERE m.source_id IN (SELECT id FROM origins)
      UNION ALL SELECT 'embedding',e.source_id,0,to_jsonb(e)::text FROM canonical_v4.embeddings e
        WHERE e.source_id IN (SELECT id FROM origins)
      UNION ALL SELECT 'receipt',r.source_id,0,to_jsonb(r)::text FROM canonical_v4.operation_receipts r
        WHERE r.source_id IN (SELECT id FROM origins)
    ) SELECT kind,id,ordinal,encode(sha256(convert_to(witness,'UTF8')),'hex') AS witness,
        (SELECT count(*) FROM posts) AS post_count
      FROM witnesses ORDER BY kind COLLATE "C",id COLLATE "C",ordinal
      LIMIT ${TOPIC_SPACE_WITNESS_LIMIT + 1}`, ids);
  if (rows.length > TOPIC_SPACE_WITNESS_LIMIT) fail('capacity', 'Topic space witness capacity reached');
  if (rows.some(row => safeInteger(row.post_count, 'Topic space post count') > TOPIC_SPACE_POST_LIMIT))
    fail('capacity', 'Topic space post capacity reached');
  const summary = rows.map(row => [row.kind, row.id, safeInteger(row.ordinal, 'witness ordinal'), row.witness]);
  return createHash('sha256').update(JSON.stringify([generation, summary])).digest('hex');
}

async function topicSpaceEntries(tx, rootRows, { vectors = false } = {}) {
  if (!rootRows.length) return [];
  const rootIds = rootRows.map(row => row.id);
  const { rows: postRows } = await tx.query(`SELECT * FROM canonical_v4.contributions
    WHERE visibility='local-public' AND
      (id IN (${placeholders(rootIds)}) OR root_id IN (${placeholders(rootIds)}))
    ORDER BY ordinal LIMIT ${TOPIC_SPACE_POST_LIMIT + 1}`, rootIds);
  if (postRows.length > TOPIC_SPACE_POST_LIMIT) fail('capacity', 'Topic space post capacity reached');
  const postIds = postRows.map(row => row.id);
  const { rows: revisionSizes } = await tx.query(`SELECT coalesce(sum(octet_length(payload)),0) AS bytes
    FROM canonical_v4.revisions WHERE contribution_id IN (${placeholders(postIds)})`, postIds);
  if (safeInteger(revisionSizes[0]?.bytes, 'Topic space revision bytes') > TOPIC_SPACE_REVISION_BYTES)
    fail('capacity', 'Topic space revision capacity reached');
  const posts = await contributionsFromRows(tx, postRows), byId = new Map(posts.map(post => [post.id, post]));
  const discussionIds = [...new Set(rootRows.map(row => row.discussion_id))];
  const { rows: discussionRows } = await tx.query(`SELECT * FROM canonical_v4.discussions
    WHERE id IN (${placeholders(discussionIds)})`, discussionIds);
  const discussions = new Map(discussionRows.map(row => {
    const entry = verifyDiscussionRow(row); return [entry.value.id, entry.value];
  }));
  const sourceIds = [...new Set(rootRows.map(row => row.origin_source_id).filter(Boolean))];
  const sources = new Map((await sourcesFromRows(tx, await sourceRowsByIds(tx, sourceIds)))
    .map(entry => [entry.value.id, entry]));
  if (sources.size !== sourceIds.length || discussions.size !== discussionIds.length)
    corrupt('Missing Topic space destination');
  const topicIds = new Set([...discussions.values()].map(entry => entry.topicId));
  const metadataSources = new Map(sources), topics = new Map();
  // The same fixed-reference/membership closure as ordinary canonical reads,
  // with a separate finite bound for the internal 4096-root build. Every lookup
  // uses selected IDs; no entire membership, catalog, or vector relation scan.
  while (true) {
    for (const source of metadataSources.values())
      for (const id of source.membershipIds) topicIds.add(id);
    if (topicIds.size > TOPIC_SPACE_METADATA_LIMIT || metadataSources.size > TOPIC_SPACE_METADATA_LIMIT)
      fail('capacity', 'Topic space metadata capacity reached');
    const pending = [...topicIds].filter(id => !topics.has(id));
    if (!pending.length) break;
    const hydrated = await topicsFromRows(tx, await topicRowsByIds(tx, pending));
    if (hydrated.length !== pending.length) corrupt('Missing Topic space Topic');
    for (const topic of hydrated) topics.set(topic.value.id, topic);
    const referenceIds = [...new Set(hydrated.map(entry => entry.referenceSourceId)
      .filter(id => id !== null && !metadataSources.has(id)))];
    if (metadataSources.size + referenceIds.length > TOPIC_SPACE_METADATA_LIMIT)
      fail('capacity', 'Topic space metadata capacity reached');
    const references = await sourcesFromRows(tx, await sourceRowsByIds(tx, referenceIds));
    if (references.length !== referenceIds.length) corrupt('Missing Topic space fixed-reference Source');
    for (const source of references) metadataSources.set(source.value.id, source);
  }
  const embeddings = new Map();
  // Cards validate optional inline/normalized mirrors too, but expose no vector.
  for (const source of sources.values()) {
    const complete = await sourceWithAuthoritativeEmbedding(tx, source);
    const embedding = complete.value.embedding;
    embeddings.set(source.value.id, topicSpaceVector(embedding));
  }
  const counts = new Map(rootIds.map(id => [id, { humanCount: 0, aiCount: 0, updatedAt: '' }]));
  for (const post of posts) {
    const root = byId.get(post.rootId ?? post.id), stats = counts.get(post.rootId ?? post.id);
    if (!root || !stats || root.rootId !== null || root.withdrawn ||
        root.discussionId !== post.discussionId || !['human', 'agent'].includes(post.actorType))
      corrupt('Invalid Topic space contribution ancestry');
    if (post.rootId !== null) {
      const parent = byId.get(post.replyToId);
      if (!parent || parent.id === post.id || (parent.rootId ?? parent.id) !== root.id ||
          parent.discussionId !== post.discussionId) corrupt('Invalid Topic space contribution parent');
    } else if (post.replyToId !== null) corrupt('Invalid Topic space root');
    if (!post.withdrawn) {
      if (!post.revisions.length) corrupt('Missing Topic space contribution revision');
      stats[post.actorType === 'human' ? 'humanCount' : 'aiCount']++;
      const timestamps = [post.createdAt, post.revisions.at(-1).createdAt].map(value => Date.parse(value));
      if (timestamps.some(value => !Number.isFinite(value))) corrupt('Invalid Topic space contribution timestamp');
      const newest = Math.max(stats.updatedAt === '' ? -Infinity : Date.parse(stats.updatedAt), ...timestamps);
      // Historical canonical records can contain date-only or offset timestamps.
      // Normalize only the derived card value, never the stored write witness.
      stats.updatedAt = new Date(newest).toISOString();
    }
  }
  const rooted = new Set(rootIds);
  for (const post of posts) {
    const visiting = new Set();
    let current = post;
    while (!rooted.has(current.id)) {
      if (visiting.has(current.id)) corrupt('Cyclic Topic space contribution ancestry');
      visiting.add(current.id);
      current = byId.get(current.replyToId);
      if (!current) corrupt('Missing Topic space contribution parent');
    }
    for (const id of visiting) rooted.add(id);
  }
  return rootRows.map(row => {
    const root = byId.get(row.id), discussion = root && discussions.get(root.discussionId);
    const topic = discussion && topics.get(discussion.topicId), source = sources.get(root?.originSourceId);
    if (!root || !topic || root.rootId !== null || root.withdrawn || root.visibility !== 'local-public')
      corrupt('Invalid Topic space root');
    const snippet = root.revisions.at(-1)?.body.slice(0, 240);
    if (typeof snippet !== 'string') corrupt('Missing Topic space root revision');
    return { rootId: root.id, topicId: topic.value.id, discussionId: discussion.id,
      sourceId: source?.value.id ?? null, ordinal: safeInteger(row.ordinal, 'root ordinal'),
      title: source?.value.title ?? topic.value.title, snippet,
      url: source && inspectPageUrl(source.value.url)?.supported ? source.value.url : null,
      ...(vectors ? { vector: embeddings.get(source?.value.id) ?? null } : {}), ...counts.get(root.id) };
  });
}

async function indexedRelatedSources(tx, header, sourceId, limit, state) {
  const evidence = await readRelatedCatalogEvidence(tx, header.version.generation);
  const previous = state.view;
  let changes;
  try { changes = relatedCatalogChanges(previous, evidence); }
  catch (error) { if (state.view === previous) state.view = null; throw error; }
  const heavy = !changes.reuse || changes.changedIds.length > 0 || changes.removedIds.length > 0;
  // One shared facade may be used by optional public reads and provider-context
  // validation simultaneously. Admit at most one catalog repair, without a
  // queue that could outlive a caller's transport/identity deadline. A rejected
  // admission must not discard a previously validated immutable view.
  if (heavy && state.building) fail('capacity', 'Related catalog preparation busy');
  const token = heavy ? Object.freeze({}) : null;
  if (token) state.building = token;
  let view;
  try {
    const preparation = changes.changedIds.length ? createRelatedCatalogEntryPreparation({ evidence, previous }) : null;
    const wanted = new Map(evidence.witnesses.map(entry => [entry.id, entry]));
    const entries = [];
    // Metadata is small, unlike binary64 vectors. Larger bounded metadata
    // batches avoid repeatedly scanning the same receipt/membership relations
    // during a cold validation; vector transport remains limited to 512 rows.
    const hydrated = new Map();
    for (let offset = 0; offset < changes.changedIds.length; offset += 8192) {
      const ids = changes.changedIds.slice(offset, offset + 8192), idSet = new Set(ids);
      const sources = await sourcesFromRows(tx, await sourceRowsByIds(tx, ids));
      if (sources.length !== ids.length || sources.some(source => !idSet.has(source.value.id) ||
          source.value.provenance !== LEARNED_SOURCE_PROVENANCE || source.ordinal !== wanted.get(source.value.id)?.ordinal))
        corrupt('Invalid Related catalog delta');
      for (const source of sources) hydrated.set(source.value.id, source);
      await yieldReadWork();
    }
    for (let offset = 0; offset < changes.changedIds.length; offset += 512) {
      const ids = changes.changedIds.slice(offset, offset + 512), idSet = new Set(ids);
      const sources = ids.map(id => hydrated.get(id));
      const sql = `SELECT source_id,payload,model_id,dimensions,values_double
        FROM canonical_v4.embeddings WHERE source_id IN (${placeholders(ids)})`;
      const wire = createEmbeddingWireQuery(sql, ids);
      const { rows: embeddingRows } = await tx.query(wire.text, wire.values);
      const embeddings = new Map();
      for (const row of embeddingRows) {
        if (!idSet.has(row.source_id) || embeddings.has(row.source_id)) corrupt('Invalid embedding mirror');
        embeddings.set(row.source_id, row);
      }
      for (const source of sources) {
        const row = embeddings.get(source.value.id);
        if (!row) corrupt('Invalid embedding mirror');
        const embedding = verifiedEmbeddingRow(row, true);
        if (Object.hasOwn(source.value, 'embedding') && !isDeepStrictEqual(source.value.embedding, embedding))
          corrupt('Invalid embedding mirror');
        // Mint the private copied/normalized token while this vector batch is
        // still local. Do not retain every parser-owned raw vector until the
        // complete catalog is loaded; mirror validation above stays exhaustive.
        entries.push(preparation.prepare({ id: source.value.id, ordinal: source.ordinal, url: source.value.url,
          title: source.value.title, embedding, extractorVersion: source.value.extractorVersion ?? null,
          topicId: source.link?.method === 'manual-confirmed' ? source.link.topicId : null,
          primaryTopicId: source.link?.topicId ?? null }));
        hydrated.delete(source.value.id);
      }
      if (offset + ids.length < changes.changedIds.length) await yieldReadWork();
    }
    view = await buildRelatedCatalogIndex({ evidence, entries: Object.freeze(entries), previous });
  } catch (error) {
    // Never keep a failed partial repair as a complete validated catalog.
    if (state.view === previous) state.view = null;
    throw error;
  } finally {
    if (token && state.building === token) state.building = null;
  }
  state.view = view;
  const results = await rankRelatedCatalogIndex(view, sourceId, limit);
  return assertDtoSize({ version: header.version, model: { id: BROWSER_MODEL_ID, status: 'experimental-local' },
    results }, 'Related Sources');
}

export function createCanonicalV4ReadFacade({ database, [RELATED_STATE]: inheritedRelatedState } = {}) {
  if (!database || typeof database.query !== 'function' || typeof database.transaction !== 'function')
    throw new TypeError('Invalid canonical PostgreSQL read dependencies');

  const relatedState = inheritedRelatedState ?? { view: null };

  const facade = {
    async topicSpaceStamp() {
      return snapshot(database, async tx => {
        const header = await headerIn(tx), roots = await topicSpaceRoots(tx);
        return { version: header.version, rootCount: roots.length,
          fingerprint: await topicSpaceFingerprint(tx, roots, header.version.generation) };
      });
    },

    async topicSpaceInputs() {
      return snapshot(database, async tx => {
        const header = await headerIn(tx), roots = await topicSpaceRoots(tx);
        const fingerprint = await topicSpaceFingerprint(tx, roots, header.version.generation);
        const value = { version: header.version, fingerprint,
          entries: await topicSpaceEntries(tx, roots, { vectors: true }) };
        if (byteLength(value) > TOPIC_SPACE_INPUT_BYTES) fail('capacity', 'Topic space input capacity reached');
        return value;
      });
    },

    async topicSpaceCards(rootIds) {
      if (!Array.isArray(rootIds) || rootIds.length > 60 || new Set(rootIds).size !== rootIds.length)
        fail('invalid', 'Invalid Topic space roots');
      rootIds = rootIds.map(readId);
      return snapshot(database, async tx => {
        const header = await headerIn(tx), roots = await topicSpaceRoots(tx, rootIds);
        const cards = (await topicSpaceEntries(tx, roots)).map(({ ordinal, ...card }) => card);
        return assertDtoSize({ version: header.version, cards }, 'Topic space cards');
      });
    },

    async topicSpaceSource(sourceId) {
      sourceId = readId(sourceId);
      return snapshot(database, async tx => {
        const header = await headerIn(tx), rows = await sourceRowsByIds(tx, [sourceId]);
        if (rows.length !== 1) fail('not-found', 'Object unavailable');
        const source = (await sourcesFromRows(tx, rows))[0];
        await closeCatalogMetadata(tx, new Map([[sourceId, source]]), new Set());
        const complete = await sourceWithAuthoritativeEmbedding(tx, source), embedding = complete.value.embedding;
        return { version: header.version, sourceId, stamp: complete.stamp, vector: topicSpaceVector(embedding) };
      });
    },

    async header() {
      return snapshot(database, (tx) => headerIn(tx));
    },

    async version() {
      const header = await facade.header();
      return frozenClone(header.version);
    },

    async fullCatalog() {
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState), topics = [], sources = [];
        let version = null, catalogVersion = null;
        for (const kind of ['topics', 'sources']) {
          let cursor = null;
          do {
            const page = await scoped.catalogPage({ kind, limit: MAX_PAGE_ITEMS, cursor });
            version = page.version; catalogVersion = page.catalogVersion;
            (kind === 'topics' ? topics : sources).push(...page.items);
            cursor = page.nextCursor;
          } while (cursor !== null);
        }
        version ??= (await headerIn(tx)).version;
        return assertDtoSize({ version, catalogVersion: catalogVersion ?? 0, topics, sources }, 'Catalog');
      });
    },

    async fullDiscussion(topicId) {
      topicId = readId(topicId);
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState), items = [];
        let cursor = null, header = null;
        do {
          const page = await scoped.discussionPage({ topicId, limit: MAX_PAGE_ITEMS, cursor });
          header ??= page;
          items.push(...page.items); cursor = page.nextCursor;
          if (byteLength({ ...header, items }) > PAGE_BYTES) fail('capacity', 'Discussion capacity reached');
        } while (cursor !== null);
        return { version: header.version, discussionVersion: header.discussionVersion,
          topic: header.topic, discussionId: header.discussionId, items };
      });
    },

    async selectionBundle(value) {
      const input = readRecord(value, ['sourceId', 'topicId']);
      const sourceId = input.sourceId === null ? null : readId(input.sourceId);
      const topicId = readId(input.topicId);
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState);
        const catalog = await scoped.catalogContext({ sourceId, topicId });
        const discussion = await scoped.fullDiscussion(topicId);
        if (catalog.version.generation !== discussion.version.generation ||
            catalog.version.revision !== discussion.version.revision)
          corrupt('Incoherent canonical selection');
        return assertDtoSize({ catalog, discussion }, 'Selection');
      });
    },

    async urlSelection(value) {
      const url = sanitizedPersistenceUrl(value);
      return snapshot(database, async (tx) => {
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.sources
          WHERE url COLLATE "C"=$1 COLLATE "C" AND provenance=$2`,
        [url, LEARNED_SOURCE_PROVENANCE]);
        if (!rows.length) fail('not-found', 'Object unavailable');
        if (rows.length !== 1) corrupt('Ambiguous learned Source URL');
        const source = (await sourcesFromRows(tx, rows))[0];
        if (source.value.url !== url || source.value.provenance !== LEARNED_SOURCE_PROVENANCE ||
            !source.link?.topicId || source.public.topicId !== source.link.topicId)
          corrupt('Invalid learned Source URL selection');
        const scoped = sameSnapshotFacade(tx, relatedState);
        const catalog = await scoped.catalogContext({ sourceId: source.value.id, topicId: source.link.topicId });
        const discussion = await scoped.fullDiscussion(source.link.topicId);
        if (catalog.version.generation !== discussion.version.generation ||
            catalog.version.revision !== discussion.version.revision)
          corrupt('Incoherent canonical URL selection');
        return assertDtoSize({ catalog, discussion }, 'Selection');
      });
    },

    async catalogPageWithContexts(value) {
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState), page = await scoped.catalogPage(value), contexts = [];
        if (page.kind === 'sources') for (const source of page.items)
          contexts.push(await scoped.catalogContext({ sourceId: source.id, topicId: source.topicId }));
        return { page, contexts };
      });
    },

    async alternateBundle(sourceId) {
      sourceId = readId(sourceId);
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState), header = await headerIn(tx);
        const source = await scoped.exactSource(sourceId);
        if (!Array.isArray(source.topicIds) || !source.topicId || !source.topicIds.includes(source.topicId))
          fail('not-found', 'Object unavailable');
        const discussions = [];
        for (const topicId of source.topicIds) discussions.push(await scoped.fullDiscussion(topicId));
        const { rows } = await tx.query(`SELECT DISTINCT source_id COLLATE "C" AS source_id
          FROM canonical_v4.topic_memberships WHERE topic_id IN (${placeholders(source.topicIds)})
          ORDER BY source_id`, source.topicIds);
        const sourceIds = rows.map((row) => readId(row.source_id));
        const hydrated = await sourcesFromRows(tx, await sourceRowsByIds(tx, sourceIds));
        if (hydrated.length !== sourceIds.length || !sourceIds.includes(sourceId))
          corrupt('Invalid alternate Source closure');
        assertComponentVersions(header.version, discussions, 'alternate discussion');
        return assertDtoSize({ version: header.version, source, discussions, sourceIds }, 'Discussion');
      });
    },

    async insightBundle(value) {
      const input = readRecord(value,
        ['sourceId', 'topicId', 'includeDiscussion', 'includeRelatedSources', 'destinationTopicId'],
        ['sourceId', 'topicId', 'includeDiscussion', 'destinationTopicId']);
      const sourceId = readId(input.sourceId), topicId = readId(input.topicId);
      const destinationTopicId = input.destinationTopicId === null ? null : readId(input.destinationTopicId);
      const includeRelatedSources = Object.hasOwn(input, 'includeRelatedSources')
        ? input.includeRelatedSources : true;
      if (typeof input.includeDiscussion !== 'boolean' || typeof includeRelatedSources !== 'boolean')
        fail('invalid', 'Invalid request');
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState);
        const base = await scoped.catalogContext({ sourceId, topicId });
        const discussion = input.includeDiscussion
          ? await scoped.fullDiscussion(topicId) : await scoped.topicDiscussion(topicId);
        const related = includeRelatedSources ? await scoped.relatedSources(sourceId, 20) : null;
        // Match the client's enriched catalog before its exact context proof is
        // rebuilt. Missing/corrupt/oversized metadata fails closed, never drops
        // selected Related links or relaxes their existing authority checks.
        const catalog = includeRelatedSources
          ? await catalogWithOptionalMetadata(tx, base, related, null, null) : base;
        const anchor = await scoped.insightAnchor(topicId, sourceId);
        const followupDiscussion = destinationTopicId === null ? null
          : destinationTopicId === topicId && input.includeDiscussion ? discussion
            : await scoped.fullDiscussion(destinationTopicId);
        assertComponentVersions(catalog.version,
          [discussion, related, anchor, followupDiscussion], 'Insight bundle');
        return assertDtoSize({ version: catalog.version, catalog, discussion, related, anchor,
          followupDiscussion }, 'Insight context');
      });
    },

    async insightJobBundle(value) {
      const input = readRecord(value, ['sourceId', 'topicId', 'destinationTopicId']);
      const sourceId = readId(input.sourceId), topicId = readId(input.topicId);
      const destinationTopicId = input.destinationTopicId === null ? null : readId(input.destinationTopicId);
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState);
        const anchor = await scoped.insightAnchor(topicId, sourceId);
        const followupDiscussion = destinationTopicId === null
          ? null : await scoped.fullDiscussion(destinationTopicId);
        assertComponentVersions(anchor.version, [followupDiscussion], 'Insight job bundle');
        return assertDtoSize({ version: anchor.version, anchor, followupDiscussion }, 'Insight context');
      });
    },

    async enrichmentBundle(value) {
      const input = readRecord(value, ['sourceId', 'topicId', 'includeAlternate']);
      const sourceId = readId(input.sourceId), topicId = readId(input.topicId);
      if (typeof input.includeAlternate !== 'boolean') fail('invalid', 'Invalid request');
      return snapshot(database, async (tx) => {
        const scoped = sameSnapshotFacade(tx, relatedState);
        const base = await scoped.catalogContext({ sourceId, topicId });
        const discussion = await scoped.fullDiscussion(topicId);
        const errors = { related: null, prior: null, alternate: null };
        async function optional(name, work) {
          try { return await work(); }
          catch (error) {
            errors[name] = ['capacity', 'conflict', 'unavailable'].includes(error?.code)
              ? error.code : 'invalid-response';
            return null;
          }
        }
        let related = await optional('related', () => scoped.relatedSources(sourceId, 20));
        let priorDiscussions = await optional('prior', () => scoped.priorDiscussions(sourceId));
        let alternate = input.includeAlternate
          ? await optional('alternate', () => scoped.alternateBundle(sourceId)) : null;
        let catalog = base;
        function discardOptional(error) {
          const code = ['capacity', 'conflict', 'unavailable'].includes(error?.code)
            ? error.code : 'invalid-response';
          if (related !== null) errors.related = code;
          if (priorDiscussions !== null) errors.prior = code;
          if (alternate !== null) errors.alternate = code;
          related = priorDiscussions = alternate = null;
          catalog = base;
        }
        try { catalog = await catalogWithOptionalMetadata(tx, base, related, priorDiscussions, alternate); }
        catch (error) { discardOptional(error); }
        const bundle = () => ({ version: catalog.version, catalog, discussion, related, priorDiscussions, alternate, errors });
        try { return assertDtoSize(bundle(), 'Enrichment'); }
        catch (error) {
          discardOptional(error);
          return assertDtoSize(bundle(), 'Enrichment');
        }
      });
    },

    async exactSource(sourceId) {
      sourceId = readId(sourceId);
      return snapshot(database, async (tx) => {
        await headerIn(tx);
        const rows = await sourceRowsByIds(tx, [sourceId]);
        if (!rows.length) fail('not-found', 'Object unavailable');
        const source = (await sourcesFromRows(tx, rows))[0].public;
        return assertDtoSize(source, 'Source');
      });
    },

    async insightAnchor(topicId, sourceId) {
      topicId = readId(topicId); sourceId = readId(sourceId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx), rows = await sourceRowsByIds(tx, [sourceId]);
        if (rows.length !== 1) fail('not-found', 'Object unavailable');
        const source = (await sourcesFromRows(tx, rows))[0];
        if (source.link?.topicId !== topicId) fail('conflict', 'State changed');
        const topicRows = await topicRowsByIds(tx, [topicId]);
        if (topicRows.length !== 1) fail('conflict', 'State changed');
        const topic = (await topicsFromRows(tx, topicRows))[0].value;
        const stampedSource = await sourceWithAuthoritativeEmbedding(tx, source);
        return assertDtoSize({ version: header.version, topicId, sourceId,
          topicTitle: topic.title, topicKind: topic.kind, sourceTitle: source.value.title,
          sourceProvenance: source.value.provenance, sourceStamp: stampedSource.stamp }, 'Insight context');
      });
    },

    async relatedSources(sourceId, limit = 5) {
      sourceId = readId(sourceId);
      if (!Number.isInteger(limit) || limit < 0 || limit > MAX_PAGE_ITEMS) fail('invalid', 'Invalid request');
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        if ((tx.wireDialect ?? tx.dialect) === 'pg') {
          return indexedRelatedSources(tx, header, sourceId, limit, relatedState);
        }
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.sources
          WHERE provenance=$1 ORDER BY ordinal`, [LEARNED_SOURCE_PROVENANCE]);
        const hydrated = await sourcesFromRows(tx, rows), selected = hydrated.find((entry) => entry.value.id === sourceId);
        if (!selected) fail('not-found', 'Object unavailable');
        const candidates = [];
        // Every row is still checked in this same snapshot. Bounded transport
        // batches and cooperative JS work keep core requests off this CPU path.
        for (let offset = 0; offset < hydrated.length; offset += 512) {
          const batch = hydrated.slice(offset, offset + 512), ids = batch.map(entry => entry.value.id), idSet = new Set(ids);
          const sql = `SELECT source_id,payload,model_id,dimensions,values_double
            FROM canonical_v4.embeddings WHERE source_id IN (${placeholders(ids)})`;
          const nativeWire = (tx.wireDialect ?? tx.dialect) === 'pg';
          const wireQuery = nativeWire ? createEmbeddingWireQuery(sql, ids) : null;
          const { rows: embeddingRows } = nativeWire
            ? await tx.query(wireQuery.text, wireQuery.values) : await tx.query(sql, ids);
          const embeddings = new Map();
          for (const row of embeddingRows) {
            if (!idSet.has(row.source_id) || embeddings.has(row.source_id)) corrupt('Invalid embedding mirror');
            embeddings.set(row.source_id, row);
          }
          for (const entry of batch) {
            const mirror = embeddings.get(entry.value.id);
            if (!mirror) corrupt('Invalid embedding mirror');
            const embedding = verifiedEmbeddingRow(mirror, nativeWire);
            if (Object.hasOwn(entry.value, 'embedding') &&
                !isDeepStrictEqual(entry.value.embedding, embedding)) corrupt('Invalid embedding mirror');
            candidates.push({ id: entry.value.id, url: entry.value.url, title: entry.value.title, embedding,
              extractorVersion: entry.value.extractorVersion,
              topicId: entry.link?.method === 'manual-confirmed' ? entry.link.topicId : null });
          }
          if (offset + batch.length < hydrated.length) await yieldReadWork();
        }
        const query = candidates.find((entry) => entry.id === sourceId);
        if (!query || query.embedding.modelId !== BROWSER_MODEL_ID || !compatibleExtractor(selected.value.extractorVersion))
          fail('unavailable', 'Related Sources unavailable');
        const rankingCandidates = candidates.filter((entry) =>
          entry.embedding.modelId === query.embedding.modelId && compatibleExtractor(entry.extractorVersion))
          .map(({ extractorVersion: _extractorVersion, ...entry }) => entry);
        const { extractorVersion: _queryExtractorVersion, ...rankingQuery } = query;
        const preparation = createRelatedSourcesPreparation();
        for (let offset = 0; offset < rankingCandidates.length; offset += 128) {
          preparation.append(rankingCandidates.slice(offset, offset + 128));
          if (offset + 128 < rankingCandidates.length) await yieldReadWork();
        }
        const results = preparation.finish().rank(rankingQuery, { limit, minSimilarity: 0.88, fallbackMinSimilarity: 0.8 })
          .map(({ id, url, title, relationship, method }) => ({ id, url, title, relationship, method,
            topicId: hydrated.find((entry) => entry.value.id === id)?.link?.topicId ?? null }));
        return assertDtoSize({ version: header.version,
          model: { id: BROWSER_MODEL_ID, status: 'experimental-local' }, results }, 'Related Sources');
      });
    },

    async semanticStamp() {
      // One SQL statement owns its snapshot. Background preparation changes this
      // signature without pretending that canonical Sources/discussions changed.
      try {
        const { rows } = await database.query('SELECT * FROM canonical_v4.semantic_read_revision()');
        if (rows.length !== 1 || typeof rows[0].revision !== 'string' || !/^[a-f0-9]{64}$/u.test(rows[0].revision))
          corrupt('Invalid semantic revision');
        let generation;
        try { generation = readId(rows[0].generation); } catch { corrupt('Invalid semantic generation'); }
        return frozenClone({ generation, revision: rows[0].revision });
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError('storage-failure', 'Semantic revision unavailable');
      }
    },

    async semanticFeed(value) {
      const input = semanticInput(value);
      return snapshot(database, async tx => {
        const header = await headerIn(tx), semantic = createCanonicalV4SemanticDiscussionRepository({ database: tx });
        const policy = await semantic.ownerPolicy(), binding = { generation: header.version.generation,
          policyRevision: policy.revision, nodeId: input.nodeId, limit: input.limit };
        const before = semanticPosition(input.cursor, binding, SEMANTIC_FEED_CURSOR_SCHEMA);
        const page = await semantic.feedReferences({ generation: binding.generation, nodeId: input.nodeId,
          beforeOrdinal: before, limit: input.limit + 1 });
        const refs = page.references.slice(0, input.limit), cards = await semanticRootCards(tx, refs);
        const result = { version: header.version, policyRevision: policy.revision, nodeId: input.nodeId, roots: [], nextCursor: null };
        for (let i = 0; i < cards.length; i++) {
          const more = i < cards.length - 1 || page.references.length > input.limit;
          const candidate = { ...result, roots: [...result.roots, cards[i]], nextCursor: more ? encodeCursor({
            schema: SEMANTIC_FEED_CURSOR_SCHEMA, ...binding, afterOrdinal: refs[i].ordinal }) : null };
          if (byteLength(candidate) > SEMANTIC_PAGE_BYTES) {
            if (!result.roots.length) fail('capacity', 'Semantic feed capacity reached');
            break;
          }
          result.roots = candidate.roots; result.nextCursor = candidate.nextCursor;
        }
        return result;
      });
    },

    async semanticThread(value) {
      const input = semanticInput(value, true);
      return snapshot(database, async tx => {
        const header = await headerIn(tx), semantic = createCanonicalV4SemanticDiscussionRepository({ database: tx });
        const policy = await semantic.ownerPolicy();
        const { ref, revision } = await semanticRootMembership(tx, semantic, header.version.generation, input.nodeId, input.rootId);
        const [card] = await semanticRootCards(tx, [ref]);
        const binding = { generation: header.version.generation, policyRevision: policy.revision,
          nodeId: input.nodeId, rootId: ref.rootId, discussionId: ref.discussionId,
          rootRevision: revision, limit: input.limit };
        const after = semanticPosition(input.cursor, binding, SEMANTIC_THREAD_CURSOR_SCHEMA);
        const replyRows = await latestContributionRows(tx, null, { rootId: ref.rootId, after, limit: input.limit + 1 });
        const selected = replyRows.slice(0, input.limit);
        if (selected.some(row => row.root_id !== ref.rootId || row.discussion_id !== ref.discussionId)) corrupt('Invalid semantic thread closure');
        const replies = await semanticPublicContributions(tx, selected, ref.topicId);
        const result = { version: header.version, policyRevision: policy.revision, nodeId: input.nodeId,
          ...card, root: { ...card.root, replies: [] }, nextCursor: null };
        for (let i = 0; i < replies.length; i++) {
          const more = i < replies.length - 1 || replyRows.length > input.limit;
          const candidate = { ...result, root: { ...result.root, replies: [...result.root.replies, replies[i]] },
            nextCursor: more ? encodeCursor({ schema: SEMANTIC_THREAD_CURSOR_SCHEMA, ...binding,
              afterOrdinal: semanticOrdinal(String(selected[i].ordinal)) }) : null };
          if (byteLength(candidate) > SEMANTIC_PAGE_BYTES) {
            if (!result.root.replies.length) fail('capacity', 'Semantic thread capacity reached');
            break;
          }
          result.root = candidate.root; result.nextCursor = candidate.nextCursor;
        }
        return result;
      });
    },

    async semanticTarget(value) {
      const input = readRecord(value, ['nodeId', 'rootId', 'targetId']);
      const nodeId = readText(input.nodeId, 160), rootId = readId(input.rootId), targetId = readId(input.targetId);
      if (nodeId !== input.nodeId) fail('invalid', 'Invalid semantic target');
      return snapshot(database, async tx => {
        const header = await headerIn(tx), semantic = createCanonicalV4SemanticDiscussionRepository({ database: tx });
        const policy = await semantic.ownerPolicy(), { ref, revision } = await semanticRootMembership(tx, semantic, header.version.generation, nodeId, rootId);
        const [card] = await semanticRootCards(tx, [ref]);
        let replies = [], targetRevision = revision;
        if (targetId !== rootId) {
          const rows = await latestContributionRows(tx, [targetId]);
          if (rows.length !== 1 || rows[0].root_id !== rootId || rows[0].discussion_id !== ref.discussionId ||
              rows[0].withdrawn || rows[0].visibility !== 'local-public') fail('not-found', 'Reply target unavailable');
          targetRevision = safeInteger(rows[0].revision_count, 'target revision');
          replies = await semanticPublicContributions(tx, rows, ref.topicId);
        }
        return assertDtoSize({ version: header.version, policyRevision: policy.revision, nodeId, ...card,
          root: { ...card.root, replies }, targetId, rootRevision: revision, targetRevision }, 'Semantic target');
      });
    },

    async discover(value = {}) {
      const input = discoveryInput(value);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        const binding = createHash('sha256').update(JSON.stringify([
          'postgres-public-discovery/v1', header.version, input.query, input.limit,
        ])).digest('hex');
        const after = discoveryPosition(input.cursor, binding);
        const parameters = [input.terms.join(' ')];
        const cursorSql = after === null ? '' : `AND (
          ranked.score < $2 OR ranked.score = $2 AND ranked.reply_count < $3 OR
          ranked.score = $2 AND ranked.reply_count = $3 AND ranked.updated_at < $4 OR
          ranked.score = $2 AND ranked.reply_count = $3 AND ranked.updated_at = $4 AND ranked.id > $5
        )`;
        if (after !== null) parameters.push(after.score, after.replies, after.updatedAt, after.id);
        parameters.push(input.limit + 1);
        const limitParameter = `$${parameters.length}`;
        const { rows } = await tx.query(`WITH latest AS MATERIALIZED (
            SELECT contribution.id,contribution.root_id,discussion.topic_id,
              revision.payload::jsonb->>'body' AS document_text,
              revision.payload::jsonb->>'createdAt' AS revised_at
            FROM canonical_v4.contributions AS contribution
            JOIN canonical_v4.discussions AS discussion ON discussion.id=contribution.discussion_id
            JOIN LATERAL (
              SELECT payload FROM canonical_v4.revisions
              WHERE contribution_id=contribution.id ORDER BY ordinal DESC LIMIT 1
            ) AS revision ON true
            WHERE contribution.visibility='local-public' AND contribution.withdrawn=false
          ), stats AS MATERIALIZED (
            SELECT topic.id,discussion.id AS discussion_id,topic.title,topic.kind,topic.created_at,
              count(latest.id)::bigint AS visible_count,
              count(latest.id) FILTER (WHERE latest.root_id IS NOT NULL)::bigint AS reply_count,
              greatest(topic.created_at,coalesce(max(latest.revised_at),topic.created_at)) AS updated_at
            FROM canonical_v4.topics AS topic
            JOIN canonical_v4.discussions AS discussion ON discussion.topic_id=topic.id
            LEFT JOIN latest ON latest.topic_id=topic.id
            GROUP BY topic.id,discussion.id,topic.title,topic.kind,topic.created_at
          ), documents AS MATERIALIZED (
            SELECT topic.id AS topic_id,'topic'::text AS document_kind,topic.id AS document_id,
              topic.title AS document_text,NULL::text AS document_created FROM canonical_v4.topics AS topic
            UNION ALL
            SELECT link.topic_id,'source',source.id,source.title || E'\n' || source.url,NULL::text
              FROM canonical_v4.source_links AS link
              JOIN canonical_v4.sources AS source ON source.id=link.source_id
            UNION ALL
            SELECT latest.topic_id,'message',latest.id,latest.document_text,latest.revised_at FROM latest
          ), matches AS MATERIALIZED (
            SELECT documents.*,
              CASE WHEN $1='' THEN 0::real ELSE ts_rank_cd(
                to_tsvector('simple',documents.document_text),plainto_tsquery('simple',$1)) END AS score
            FROM documents WHERE $1='' OR
              to_tsvector('simple',documents.document_text) @@ plainto_tsquery('simple',$1)
          ), best AS MATERIALIZED (
            SELECT DISTINCT ON (topic_id) topic_id,document_kind,document_id,document_text,score
            FROM matches ORDER BY topic_id,score DESC,
              CASE WHEN $1='' AND document_kind='message' THEN 0 ELSE 1 END,
              document_created DESC NULLS LAST,document_id
          ), ranked AS (
            SELECT stats.*,best.document_kind,best.document_id,best.document_text,best.score
            FROM stats JOIN best ON best.topic_id=stats.id WHERE stats.visible_count>0
          )
          SELECT * FROM ranked WHERE true ${cursorSql}
          ORDER BY score DESC,reply_count DESC,updated_at DESC,id
          LIMIT ${limitParameter}`, parameters);
        const pageRows = rows.slice(0, input.limit), topicIds = pageRows.map((row) => row.id);
        const topicRows = await topicRowsByIds(tx, topicIds);
        const topics = new Map((await topicsFromRows(tx, topicRows)).map((entry) => [entry.value.id, entry.value]));
        const { rows: discussionRows } = topicIds.length ? await tx.query(`SELECT * FROM canonical_v4.discussions
          WHERE topic_id IN (${placeholders(topicIds)})`, topicIds) : { rows: [] };
        const discussions = new Map(discussionRows.map((row) => {
          const entry = verifyDiscussionRow(row); return [entry.value.topicId, entry.value];
        }));
        const bestSourceIds = pageRows.filter((row) => row.document_kind === 'source').map((row) => row.document_id);
        const bestMessageIds = pageRows.filter((row) => row.document_kind === 'message').map((row) => row.document_id);
        const bestSources = new Map();
        if (bestSourceIds.length) for (const entry of await sourcesFromRows(tx, await sourceRowsByIds(tx, bestSourceIds)))
          bestSources.set(entry.value.id, entry.value);
        const bestMessages = new Map();
        if (bestMessageIds.length) {
          const { rows: contributionRows } = await tx.query(`SELECT * FROM canonical_v4.contributions
            WHERE id IN (${placeholders(bestMessageIds)})`, bestMessageIds);
          for (const entry of await contributionsFromRows(tx, contributionRows)) bestMessages.set(entry.id, entry);
        }
        const sourcesByTopic = new Map();
        if (topicIds.length) {
          const { rows: sourceRows } = await tx.query(`SELECT selected.* FROM (
              SELECT source.*,row_number() OVER(PARTITION BY link.topic_id ORDER BY source.id) AS source_position
              FROM canonical_v4.source_links AS link JOIN canonical_v4.sources AS source ON source.id=link.source_id
              WHERE link.topic_id IN (${placeholders(topicIds)}) AND source.url LIKE 'https://%'
            ) AS selected WHERE selected.source_position<=10 ORDER BY selected.id`, topicIds);
          for (const entry of await sourcesFromRows(tx, sourceRows)) {
            if (!entry.link || !inspectPageUrl(entry.value.url)?.supported) continue;
            const selected = sourcesByTopic.get(entry.link.topicId) ?? [];
            if (selected.length < 5) selected.push({ id: entry.value.id, title: entry.value.title, url: entry.value.url });
            sourcesByTopic.set(entry.link.topicId, selected);
          }
        }
        const projected = pageRows.map((row) => {
          const topic = topics.get(row.id), discussion = discussions.get(row.id);
          if (!topic || !discussion || discussion.id !== row.discussion_id || topic.title !== row.title ||
              topic.kind !== row.kind) corrupt('Invalid discovery projection');
          const score = Number(row.score), visibleCount = safeInteger(row.visible_count, 'visible count');
          const replyCount = safeInteger(row.reply_count, 'reply count');
          const updatedAt = readText(row.updated_at, 64), document = row.document_text;
          if (!Number.isFinite(score) || score < 0 || typeof document !== 'string' || replyCount > visibleCount)
            corrupt('Invalid discovery projection');
          if (row.document_kind === 'topic' && (row.document_id !== topic.id || document !== topic.title))
            corrupt('Invalid discovery document');
          if (row.document_kind === 'source') {
            const source = bestSources.get(row.document_id);
            if (!source || document !== `${source.title}\n${source.url}`) corrupt('Invalid discovery document');
          }
          if (row.document_kind === 'message') {
            const contribution = bestMessages.get(row.document_id), revision = contribution?.revisions.at(-1);
            if (!revision || revision.body !== document || contribution.withdrawn || contribution.visibility !== 'local-public')
              corrupt('Invalid discovery document');
          }
          return { score, replies: replyCount, updatedAt, value: {
            topicId: topic.id, discussionId: discussion.id, title: topic.title, kind: topic.kind,
            visibleCount, updatedAt, snippet: document.slice(0, 320), sources: sourcesByTopic.get(topic.id) ?? [],
          } };
        });
        const last = projected.at(-1);
        return assertDtoSize({ version: header.version, query: input.query,
          results: projected.map((entry) => entry.value),
          nextCursor: rows.length > input.limit && last ? encodeCursor({ schema: DISCOVERY_CURSOR_SCHEMA,
            binding, score: last.score, replies: last.replies, updatedAt: last.updatedAt,
            id: last.value.topicId }) : null }, 'Discovery page');
      });
    },

    async priorDiscussions(sourceId) {
      sourceId = readId(sourceId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx), sourceRows = await sourceRowsByIds(tx, [sourceId]);
        if (sourceRows.length !== 1) fail('not-found', 'Object unavailable');
        const source = (await sourcesFromRows(tx, sourceRows))[0];
        if (!source.link) fail('not-found', 'Object unavailable');
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.contributions
          WHERE root_id IS NULL AND origin_source_id=$1 ORDER BY ordinal`, [sourceId]);
        const roots = await contributionsFromRows(tx, rows), grouped = new Map();
        if (roots.length) {
          const discussionIds = [...new Set(roots.map((entry) => entry.discussionId))];
          const { rows: discussionRows } = await tx.query(`SELECT * FROM canonical_v4.discussions
            WHERE id IN (${placeholders(discussionIds)})`, discussionIds);
          const topicsByDiscussion = new Map(discussionRows.map((row) => {
            const discussion = verifyDiscussionRow(row);
            return [discussion.value.id, discussion.value.topicId];
          }));
          for (const root of roots) {
            const topicId = topicsByDiscussion.get(root.discussionId);
            if (!topicId) corrupt('Missing contribution Discussion');
            if (root.withdrawn || topicId === source.link.topicId) continue;
            const previous = grouped.get(topicId);
            if (!previous) grouped.set(topicId, { rootCount: 1, newestAt: root.createdAt, newestId: root.id });
            else {
              previous.rootCount += 1;
              if (root.createdAt > previous.newestAt || root.createdAt === previous.newestAt && root.id > previous.newestId) {
                previous.newestAt = root.createdAt; previous.newestId = root.id;
              }
            }
          }
        }
        const topicRows = await topicRowsByIds(tx, [...grouped.keys()]);
        if (topicRows.length !== grouped.size) corrupt('Missing prior Topic');
        const topics = (await topicsFromRows(tx, topicRows)).map(({ value }) => ({ id: value.id, title: value.title,
          kind: value.kind, rootCount: grouped.get(value.id).rootCount }))
          .sort((left, right) => {
            const a = grouped.get(left.id), b = grouped.get(right.id);
            return b.newestAt < a.newestAt ? -1 : b.newestAt > a.newestAt ? 1 :
              b.newestId < a.newestId ? -1 : b.newestId > a.newestId ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
          });
        return assertDtoSize({ version: header.version, sourceId, currentTopicId: source.link.topicId, topics }, 'Prior discussions');
      });
    },

    async accountContributions(actorId) {
      actorId = readId(actorId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.contributions
          WHERE author_id=$1 OR operator_id=$1 ORDER BY ordinal`, [actorId]);
        return { version: header.version, items: await contributionsFromRows(tx, rows) };
      });
    },

    async accountThreads(actorId) {
      actorId = readId(actorId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        const { rows: ownedRows } = await tx.query(`SELECT id,root_id FROM canonical_v4.contributions
          WHERE withdrawn=false AND (author_id=$1 OR operator_id=$1) ORDER BY ordinal`, [actorId]);
        const rootIds = [...new Set(ownedRows.map((row) => readId(row.root_id ?? row.id)))];
        if (!rootIds.length) return { version: header.version, threads: [] };
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.contributions
          WHERE id IN (${placeholders(rootIds)}) OR root_id IN (${placeholders(rootIds, rootIds.length + 1)})
          ORDER BY created_at,id`, [...rootIds, ...rootIds]);
        const entries = await contributionsFromRows(tx, rows);
        const discussionIds = [...new Set(entries.map((entry) => entry.discussionId))];
        const { rows: discussionRows } = await tx.query(`SELECT * FROM canonical_v4.discussions
          WHERE id IN (${placeholders(discussionIds)})`, discussionIds);
        const discussions = new Map(discussionRows.map((row) => {
          const entry = verifyDiscussionRow(row); return [entry.value.id, entry.value];
        }));
        const topicIds = [...new Set([...discussions.values()].map((entry) => entry.topicId))];
        const topics = new Map((await topicsFromRows(tx, await topicRowsByIds(tx, topicIds)))
          .map((entry) => [entry.value.id, entry.value]));
        const originIds = [...new Set(entries.map((entry) => entry.originSourceId).filter(Boolean))];
        const origins = new Map((await sourcesFromRows(tx, await sourceRowsByIds(tx, originIds)))
          .map((entry) => [entry.value.id, entry.value]));
        const byRoot = new Map(rootIds.map((id) => [id, []]));
        for (const entry of entries) {
          const rootId = entry.rootId ?? entry.id;
          if (!byRoot.has(rootId)) corrupt('Invalid account thread closure');
          byRoot.get(rootId).push(entry);
        }
        const threads = [];
        for (const rootId of rootIds) {
          const members = byRoot.get(rootId), root = members.find((entry) => entry.id === rootId);
          const discussion = root && discussions.get(root.discussionId), topic = discussion && topics.get(discussion.topicId);
          if (!root || root.rootId !== null || !discussion || !topic ||
              members.some((entry) => entry.discussionId !== discussion.id)) corrupt('Invalid account thread closure');
          const byId = new Map(members.map((entry) => [entry.id, entry])), retained = new Set();
          for (const visible of members.filter((entry) => !entry.withdrawn)) {
            let ancestor = visible;
            while (ancestor && !retained.has(ancestor.id)) {
              retained.add(ancestor.id); ancestor = byId.get(ancestor.replyToId ?? ancestor.rootId);
            }
          }
          const project = (entry) => {
            const value = publicContribution(entry, entry.revisions, origins.get(entry.originSourceId), topic.id);
            return value.state === 'deleted' ? { ...value, actorType: entry.actorType, createdAt: entry.createdAt } : value;
          };
          const rootView = project(root);
          rootView.replies = members.filter((entry) => entry.id !== root.id && retained.has(entry.id)).map(project);
          threads.push({ topic: publicDiscussionTopic(topic), discussionId: discussion.id, root: rootView });
        }
        return assertDtoSize({ version: header.version, threads }, 'Account threads');
      });
    },

    async catalogContext(value) {
      const input = readRecord(value, ['sourceId', 'topicId']);
      let sourceId = input.sourceId === null ? null : readId(input.sourceId);
      let topicId = input.topicId === null ? null : readId(input.topicId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx), selectedSources = new Map(), topicIds = new Set();
        const truncated = { topics: false, sources: false };
        if (sourceId !== null) {
          const rows = await sourceRowsByIds(tx, [sourceId]);
          if (!rows.length) fail('not-found', 'Object unavailable');
          const selected = (await sourcesFromRows(tx, rows))[0];
          if (topicId !== null && selected.link?.topicId !== topicId) fail('conflict', 'State changed');
          topicId ??= selected.link?.topicId ?? null;
          selectedSources.set(sourceId, selected);
        }
        if (topicId !== null) {
          const { rows: topics } = await tx.query('SELECT * FROM canonical_v4.topics WHERE id=$1', [topicId]);
          if (!topics.length) fail('not-found', 'Object unavailable');
          topicIds.add(topicId);
          const { rows } = await tx.query(`SELECT source.* FROM canonical_v4.topic_memberships AS membership
            JOIN canonical_v4.sources AS source ON source.id=membership.source_id
            WHERE membership.topic_id=$1 ORDER BY source.id COLLATE "C" LIMIT $2`,
          [topicId, MAX_CONTEXT_PRESENTATION_ITEMS + 1]);
          // This is the existing public 100-member presentation window, not a
          // complete matching scan. Fixed-reference closure below is mandatory
          // even when its Source falls beyond that window.
          truncated.sources = rows.length > MAX_CONTEXT_PRESENTATION_ITEMS;
          const hydrated = await sourcesFromRows(tx, rows.slice(0, MAX_CONTEXT_PRESENTATION_ITEMS));
          for (const source of hydrated) selectedSources.set(source.value.id, source);
        } else if (sourceId === null) {
          const { rows: topics } = await tx.query(
            `SELECT id FROM canonical_v4.topics ORDER BY id COLLATE "C" LIMIT $1`,
          [MAX_CONTEXT_PRESENTATION_ITEMS + 1]);
          const { rows: sources } = await tx.query(
            `SELECT * FROM canonical_v4.sources ORDER BY id COLLATE "C" LIMIT $1`,
          [MAX_CONTEXT_PRESENTATION_ITEMS + 1]);
          truncated.topics = topics.length > MAX_CONTEXT_PRESENTATION_ITEMS;
          truncated.sources = sources.length > MAX_CONTEXT_PRESENTATION_ITEMS;
          for (const row of topics.slice(0, MAX_CONTEXT_PRESENTATION_ITEMS)) topicIds.add(row.id);
          for (const source of await sourcesFromRows(tx, sources.slice(0, MAX_CONTEXT_PRESENTATION_ITEMS)))
            selectedSources.set(source.value.id, source);
        }
        const closure = await closeCatalogMetadata(tx, selectedSources, topicIds);
        const result = {
          version: header.version,
          catalogVersion: header.catalogVersion,
          truncated,
          ...closure,
        };
        return assertDtoSize(result, 'Catalog context');
      });
    },

    async topicDiscussion(topicId) {
      topicId = readId(topicId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        const { rows: topicRows } = await tx.query('SELECT * FROM canonical_v4.topics WHERE id=$1', [topicId]);
        const { rows: discussionRows } = await tx.query(
          'SELECT * FROM canonical_v4.discussions WHERE topic_id=$1', [topicId]);
        if (topicRows.length !== 1 || discussionRows.length !== 1) fail('not-found', 'Object unavailable');
        const topic = (await topicsFromRows(tx, topicRows))[0];
        const discussion = verifyDiscussionRow(discussionRows[0]);
        if (discussion.value.topicId !== topicId) corrupt('Invalid discussion Topic');
        return {
          version: header.version,
          discussionVersion: discussion.writeVersion,
          topic: publicDiscussionTopic(topic.value),
          discussionId: discussion.value.id,
        };
      });
    },

    async catalogPage(value) {
      const input = validatePageInput(value, 'catalog');
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        const after = readCatalogCursor(input.cursor, header, input.kind, input.limit);
        const table = input.kind === 'topics' ? 'topics' : 'sources';
        const parameters = after === null ? [input.limit + 1] : [after, input.limit + 1];
        const where = after === null ? '' : 'WHERE id > $1';
        const limit = after === null ? '$1' : '$2';
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.${table} ${where}
          ORDER BY id COLLATE "C" LIMIT ${limit}`, parameters);
        const selected = rows.slice(0, input.limit);
        const hydrated = input.kind === 'topics' ? await topicsFromRows(tx, selected) : await sourcesFromRows(tx, selected);
        const projected = hydrated.map((entry) => entry.public), result = {
          version: header.version,
          catalogVersion: header.catalogVersion,
          kind: input.kind,
          items: [],
          nextCursor: null,
        };
        for (let index = 0; index < projected.length; index += 1) {
          const item = projected[index];
          const more = index < projected.length - 1 || rows.length > input.limit;
          const candidate = { ...result, items: [...result.items, item], nextCursor: more ? encodeCursor({
            schema: CATALOG_CURSOR_SCHEMA,
            generation: header.version.generation,
            catalogVersion: header.catalogVersion,
            kind: input.kind,
            limit: input.limit,
            after: item.id,
          }) : null };
          if (byteLength(candidate) > PAGE_BYTES) {
            if (!result.items.length) fail('capacity', 'Catalog page capacity reached');
            break;
          }
          result.items = candidate.items; result.nextCursor = candidate.nextCursor;
        }
        return result;
      });
    },

    async discussionPage(value) {
      const input = validatePageInput(value);
      const topicId = readId(input.topicId);
      return snapshot(database, async (tx) => {
        const header = await headerIn(tx);
        const { rows: topicRows } = await tx.query('SELECT * FROM canonical_v4.topics WHERE id=$1', [topicId]);
        const { rows: discussionRows } = await tx.query(
          'SELECT * FROM canonical_v4.discussions WHERE topic_id=$1', [topicId]);
        if (topicRows.length !== 1 || discussionRows.length !== 1) fail('not-found', 'Object unavailable');
        const topic = (await topicsFromRows(tx, topicRows))[0], discussion = verifyDiscussionRow(discussionRows[0]);
        const after = readDiscussionCursor(input.cursor, header, topicId, discussion.value.id,
          discussion.writeVersion, input.limit);
        const parameters = after === null ? [discussion.value.id, input.limit + 1]
          : [discussion.value.id, after.createdAt, after.id, input.limit + 1];
        const position = after === null ? '' : `AND (created_at COLLATE "C" > $2 OR
          (created_at=$2 AND id > $3))`;
        const limit = after === null ? '$2' : '$4';
        const { rows } = await tx.query(`SELECT * FROM canonical_v4.contributions
          WHERE discussion_id=$1 ${position}
          ORDER BY created_at COLLATE "C",id COLLATE "C" LIMIT ${limit}`, parameters);
        const selected = rows.slice(0, input.limit), ids = selected.map((row) => row.id);
        let revisionRows = [];
        if (ids.length) revisionRows = (await tx.query(`SELECT contribution_id,ordinal,payload
          FROM canonical_v4.revisions WHERE contribution_id IN (${placeholders(ids)})
          ORDER BY contribution_id COLLATE "C",ordinal`, ids)).rows;
        const revisions = new Map();
        for (const row of revisionRows) {
          const entries = revisions.get(row.contribution_id) ?? [];
          if (safeInteger(row.ordinal, 'revision ordinal') !== entries.length) corrupt('Invalid revision ordinal');
          entries.push(verifyRevisionPayload(decoded(row.payload, 'revision payload')));
          revisions.set(row.contribution_id, entries);
        }
        const originIds = [...new Set(selected.map((row) => row.origin_source_id).filter((id) => id !== null))];
        const origins = new Map((await sourcesFromRows(tx, await sourceRowsByIds(tx, originIds)))
          .map((entry) => [entry.value.id, entry.public]));
        const items = selected.map((row) => {
          const entry = decoded(row.payload, 'contribution payload'), entryRevisions = revisions.get(row.id) ?? [];
          if (row.id !== entry.id || row.discussion_id !== entry.discussionId ||
              !sameNullable(row.root_id, entry.rootId) || !sameNullable(row.reply_to_id, entry.replyToId) ||
              !sameNullable(row.author_id, entry.authorId) || !sameNullable(row.operator_id, entry.insight?.operatorId) ||
              !sameNullable(row.origin_source_id, entry.originSourceId) ||
              !sameNullable(row.anchor_source_id, entry.anchor?.kind === 'source' ? entry.anchor.sourceId : undefined) ||
              row.actor_type !== entry.actorType || row.visibility !== entry.visibility ||
              row.withdrawn !== entry.withdrawn || row.created_at !== entry.createdAt ||
              safeInteger(row.revision_count, 'revision count') !== entryRevisions.length ||
              safeInteger(row.write_version, 'contribution version') < 0 || entry.visibility !== 'local-public')
            corrupt('Invalid contribution typed mirror');
          if (entry.originSourceId && !origins.has(entry.originSourceId)) corrupt('Missing contribution origin');
          return publicContribution(entry, entryRevisions, origins.get(entry.originSourceId), topicId);
        });
        const result = {
          version: header.version,
          discussionVersion: discussion.writeVersion,
          topic: publicDiscussionTopic(topic.value),
          discussionId: discussion.value.id,
          items: [],
          nextCursor: null,
        };
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index], row = selected[index];
          const more = index < items.length - 1 || rows.length > input.limit;
          const candidate = { ...result, items: [...result.items, item], nextCursor: more ? encodeCursor({
            schema: DISCUSSION_CURSOR_SCHEMA,
            generation: header.version.generation,
            topicId,
            discussionId: discussion.value.id,
            discussionVersion: discussion.writeVersion,
            limit: input.limit,
            after: { createdAt: row.created_at, id: row.id },
          }) : null };
          if (byteLength(candidate) > PAGE_BYTES) {
            if (!result.items.length) fail('capacity', 'Discussion page capacity reached');
            break;
          }
          result.items = candidate.items; result.nextCursor = candidate.nextCursor;
        }
        return result;
      });
    },
  };
  return Object.freeze(facade);
}

export const CANONICAL_V4_READ_CURSOR_SCHEMAS = Object.freeze({
  catalog: CATALOG_CURSOR_SCHEMA,
  discussion: DISCUSSION_CURSOR_SCHEMA,
});
