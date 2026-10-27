import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { ServiceError, fail } from '../../src/domain/errors.js';
import {
  BROWSER_MODEL_ID,
  compatibleExtractor,
  readLearnedIngest,
  readLearnedUrl,
} from '../../src/domain/learned-sources.js';
import { operationDigestFor } from '../../src/domain/source-threads.js';
import { sourceStamp } from '../../src/domain/source-threads.js';
import { frozenClone, readExpectedVersion, readId, readRecord, readText } from '../../src/domain/validation.js';
import { RIDGE_PARAMETER_SHA256 } from '../../src/domain/ridge-topic-adapter.js';
import { qualifyRetainedTopicContext } from '../../src/domain/guarded-body-topic-planner.js';
import { inspectPageUrl } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import { readCanonicalV4MigrationManifest, canonicalV4SchemaVersion } from './index.js';

const SCHEMA_VERSION = 9;
const MIN_SECONDS = 1;
const MAX_SECONDS = 30;

function safeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new ServiceError('storage-corrupt', `Invalid ${label}`);
  return number;
}

function duration(value, label) {
  if (!Number.isSafeInteger(value) || value < MIN_SECONDS || value > MAX_SECONDS)
    fail('invalid', `Invalid ${label}`);
  return value;
}

function storedTime(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ServiceError('storage-corrupt', `Invalid ${label}`);
  return date.toISOString();
}

function storageFailure(error) {
  if (error instanceof ServiceError) return error;
  if (error?.code === 'P1201') return new ServiceError('conflict', 'State changed');
  if (error?.code === 'P1202') return new ServiceError('capacity', 'Ingestion queue capacity reached');
  if (error?.code === 'P1203') return new ServiceError('invalid', 'Invalid ingestion request');
  if (error?.code === 'P1204') return new ServiceError('storage-corrupt', 'Invalid canonical ingestion state');
  if (error?.code === 'P1205') return new ServiceError('forbidden', 'Source unavailable for ingestion');
  if (error?.code === 'P1206') return new ServiceError('not-found', 'Ingestion operation unavailable');
  if (error?.code === '23505' || error?.code === '23503' || error?.code === '23514')
    return new ServiceError('conflict', 'State changed');
  return new ServiceError('storage-failure', 'Canonical PostgreSQL ingestion failed');
}

function enqueueOptions(value) {
  const input = value === undefined ? Object.create(null) :
    readRecord(value, ['authorityToken', 'authoritySeconds'], []);
  return {
    authorityToken: input.authorityToken === undefined ? randomUUID() : readId(input.authorityToken),
    authoritySeconds: duration(input.authoritySeconds ?? MAX_SECONDS, 'authority duration'),
  };
}

function operation(value) {
  const input = readLearnedIngest(value);
  const requestMaterial = JSON.stringify({
    url: input.url,
    title: input.title,
    embedding: input.embedding,
    extractorVersion: input.extractorVersion,
  });
  const operationDigest = operationDigestFor(input);
  return Object.freeze({ input, requestMaterial, operationDigest });
}

function enqueueResult(row, authorityToken) {
  if (!row || typeof row !== 'object')
    throw new ServiceError('storage-corrupt', 'Invalid ingestion enqueue result');
  const state = row.state;
  if (!['pending', 'leased', 'complete', 'failed', 'cancelled'].includes(state))
    throw new ServiceError('storage-corrupt', 'Invalid ingestion enqueue result');
  return frozenClone({
    operationId: readId(row.operation_id),
    operationDigest: row.operation_digest,
    jobClass: row.job_class,
    state,
    ordinal: row.ordinal === null ? null : safeInteger(row.ordinal, 'ingestion ordinal'),
    attempts: safeInteger(row.attempts, 'ingestion attempts'),
    replayed: row.replayed === true,
    sourceId: row.result_source_id === null ? null : readId(row.result_source_id),
    authorityToken: state === 'pending' || state === 'leased' ? authorityToken : null,
  });
}

function ingestionOutcome(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new ServiceError('storage-corrupt', 'Invalid ingestion receipt'); }
  const record = readRecord(value,
    ['version', 'sourceId', 'topicId', 'topicIds', 'assignment', 'policyVersion']);
  const version = readRecord(record.version, ['generation', 'revision']);
  const topicIds = record.topicIds;
  if (!Array.isArray(topicIds) || Object.getPrototypeOf(topicIds) !== Array.prototype ||
      Reflect.ownKeys(topicIds).length !== topicIds.length + 1 || topicIds.length === 0 ||
      !['confirmed', 'provisional'].includes(record.assignment))
    throw new ServiceError('storage-corrupt', 'Invalid ingestion receipt');
  const normalizedTopicIds = topicIds.map(readId);
  if (new Set(normalizedTopicIds).size !== normalizedTopicIds.length ||
      normalizedTopicIds.some((id, index) => index > 0 && normalizedTopicIds[index - 1] >= id))
    throw new ServiceError('storage-corrupt', 'Invalid ingestion receipt');
  const revision = safeInteger(version.revision, 'ingestion revision');
  const result = {
    version: { generation: readId(version.generation), revision },
    sourceId: readId(record.sourceId),
    topicId: readId(record.topicId),
    topicIds: normalizedTopicIds,
    assignment: record.assignment,
    policyVersion: readText(record.policyVersion, 128),
  };
  if (!result.topicIds.includes(result.topicId))
    throw new ServiceError('storage-corrupt', 'Invalid ingestion receipt');
  return frozenClone(result);
}

function lifecycleEnvelope(text, type) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new ServiceError('storage-corrupt', 'Invalid learned lifecycle result'); }
  const envelope = readRecord(value, ['version', 'result']);
  const version = readExpectedVersion(envelope.version);
  let result;
  if (type === 'correct-source') {
    const record = readRecord(envelope.result,
      ['sourceId', 'topicId', 'topicIds', 'assignment', 'policyVersion', 'previousTopicId']);
    const outcome = ingestionOutcome(JSON.stringify({ version, sourceId: record.sourceId,
      topicId: record.topicId, topicIds: record.topicIds, assignment: record.assignment,
      policyVersion: record.policyVersion }));
    result = { sourceId: outcome.sourceId, topicId: outcome.topicId,
      topicIds: outcome.topicIds, assignment: outcome.assignment,
      policyVersion: outcome.policyVersion, previousTopicId: readId(record.previousTopicId) };
  } else if (type === 'forget-source') {
    const record = readRecord(envelope.result, ['sourceId']);
    result = { sourceId: readId(record.sourceId) };
  } else if (type === 'delete-learned-topic') {
    const record = readRecord(envelope.result, ['topicId', 'forgottenSourceIds']);
    if (!Array.isArray(record.forgottenSourceIds))
      throw new ServiceError('storage-corrupt', 'Invalid learned lifecycle result');
    result = { topicId: readId(record.topicId), forgottenSourceIds: record.forgottenSourceIds.map(readId) };
  } else {
    const record = readRecord(envelope.result, ['forgottenSourceIds', 'deletedTopicIds']);
    if (!Array.isArray(record.forgottenSourceIds) || !Array.isArray(record.deletedTopicIds))
      throw new ServiceError('storage-corrupt', 'Invalid learned lifecycle result');
    result = { forgottenSourceIds: record.forgottenSourceIds.map(readId),
      deletedTopicIds: record.deletedTopicIds.map(readId) };
  }
  return frozenClone({ version, result });
}

function representedVector(value) {
  if (!value || types.isProxy(value) || !(Array.isArray(value) || value instanceof Float64Array) ||
      ![Array.prototype, Float64Array.prototype].includes(Object.getPrototypeOf(value)) || value.length !== 384 ||
      Reflect.ownKeys(value).length !== (Array.isArray(value) ? 385 : 384))
    fail('invalid', 'Invalid Ridge coordinates');
  const result = [];
  for (let axis = 0; axis < 384; axis += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(axis));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value))
      fail('invalid', 'Invalid Ridge coordinates');
    result.push(descriptor.value);
  }
  if (Math.abs(Math.hypot(...result) - 1) > 1e-6) fail('invalid', 'Invalid Ridge coordinates');
  return result;
}

// Claimed material was normalized exactly once at admission. Revalidate its
// canonical shape without running readLearnedIngest again: dividing an already
// normalized binary64 vector by its near-one norm can change its exact receipt
// bytes and operation digest.
function claimedOperation(value) {
  const input = readRecord(value,
    ['expected', 'operationId', 'url', 'title', 'embedding', 'extractorVersion']);
  const embedding = readRecord(input.embedding, ['modelId', 'values']);
  if (!compatibleExtractor(input.extractorVersion) || embedding.modelId !== BROWSER_MODEL_ID)
    fail('invalid', 'Invalid queued ingestion material');
  const normalized = {
    expected: readExpectedVersion(input.expected),
    operationId: readId(input.operationId),
    url: readLearnedUrl(input.url),
    title: readText(input.title, 200),
    embedding: { modelId: embedding.modelId, values: representedVector(embedding.values) },
    extractorVersion: input.extractorVersion,
  };
  if (normalized.url !== input.url || normalized.title !== input.title)
    fail('invalid', 'Invalid queued ingestion material');
  const requestMaterial = JSON.stringify({ url: normalized.url, title: normalized.title,
    embedding: normalized.embedding, extractorVersion: normalized.extractorVersion });
  return { input: normalized, requestMaterial, operationDigest: operationDigestFor(normalized) };
}

function decodeClaim(row) {
  let material;
  try { material = JSON.parse(row.request_material); }
  catch { throw new ServiceError('storage-corrupt', 'Invalid queued ingestion material'); }
  const expected = {
    generation: readId(row.generation),
    revision: safeInteger(row.expected_revision, 'ingestion expected revision'),
  };
  const operationId = readId(row.operation_id);
  let prepared;
  try {
    const queued = readRecord(material, ['url', 'title', 'embedding', 'extractorVersion']);
    prepared = claimedOperation({ expected, operationId, ...queued });
  }
  catch { throw new ServiceError('storage-corrupt', 'Invalid queued ingestion material'); }
  if (prepared.requestMaterial !== row.request_material || prepared.operationDigest !== row.operation_digest)
    throw new ServiceError('storage-corrupt', 'Invalid queued ingestion material');
  return frozenClone({
    operationId,
    operationDigest: row.operation_digest,
    requestMaterial: row.request_material,
    input: prepared.input,
    jobClass: row.job_class,
    ordinal: safeInteger(row.ordinal, 'ingestion ordinal'),
    attempts: safeInteger(row.attempts, 'ingestion attempts'),
    leaseToken: readId(row.lease_token),
    leaseUntil: storedTime(row.lease_until, 'ingestion lease'),
    authorityUntil: storedTime(row.authority_until, 'ingestion authority'),
  });
}

async function schemaHealth(database, schemaProfile) {
  const schemaVersion = canonicalV4SchemaVersion(schemaProfile);
  const { rows } = await database.query(
    'SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version');
  let manifest;
  try { manifest = await readCanonicalV4MigrationManifest(schemaProfile); }
  catch { fail('unavailable', 'Canonical ingestion schema unavailable'); }
  if (rows.length !== schemaVersion || rows.length !== manifest.length || rows.some((row, index) =>
    Number(row.version) !== manifest[index].version || row.hash !== manifest[index].hash))
    fail('unavailable', 'Canonical ingestion schema unavailable');
  return Object.freeze({ schemaVersion });
}

export function createCanonicalV4IngestionRepository({ database,
  schemaProfile = 'legacy9',
  nextId = (kind) => `${kind}-${randomUUID()}`,
  now = () => new Date().toISOString() } = {}) {
  canonicalV4SchemaVersion(schemaProfile);
  if (!database || typeof database.query !== 'function')
    throw new TypeError('Invalid canonical PostgreSQL ingestion dependencies');
  if (typeof nextId !== 'function' || typeof now !== 'function')
    throw new TypeError('Invalid canonical PostgreSQL ingestion dependencies');

  const enqueue = async (jobClass, value, options) => {
    const prepared = operation(value);
    const authority = enqueueOptions(options);
    const functionName = jobClass === 'interactive' ?
      'ingest_enqueue_interactive' : 'ingest_enqueue_crawler';
    try {
      const { rows } = await database.query(`SELECT * FROM canonical_v4.${functionName}(
        $1,$2,$3,$4,$5,$6,$7
      )`, [prepared.input.operationId, prepared.operationDigest, prepared.requestMaterial,
        prepared.input.expected.generation, prepared.input.expected.revision,
        authority.authorityToken, authority.authoritySeconds]);
      if (rows.length !== 1)
        throw new ServiceError('storage-corrupt', 'Invalid ingestion enqueue result');
      return enqueueResult(rows[0], authority.authorityToken);
    } catch (error) { throw storageFailure(error); }
  };

  return Object.freeze({
    health: () => schemaHealth(database, schemaProfile),

    enqueueInteractive(value, options) {
      return enqueue('interactive', value, options);
    },

    enqueueCrawler(value, options) {
      return enqueue('crawler', value, options);
    },

    async claim(value = {}) {
      const input = readRecord(value, ['workerId', 'leaseToken', 'leaseSeconds'], ['workerId']);
      const workerId = readId(input.workerId);
      const leaseToken = input.leaseToken === undefined ? randomUUID() : readId(input.leaseToken);
      const leaseSeconds = duration(input.leaseSeconds ?? MAX_SECONDS, 'lease duration');
      try {
        const { rows } = await database.query(
          'SELECT * FROM canonical_v4.ingest_claim($1,$2,$3)',
          [workerId, leaseToken, leaseSeconds]);
        if (rows.length > 1)
          throw new ServiceError('storage-corrupt', 'Invalid ingestion claim result');
        return rows.length === 0 ? null : decodeClaim(rows[0]);
      } catch (error) { throw storageFailure(error); }
    },

    async renewAuthority(value) {
      const input = readRecord(value,
        ['operationId', 'operationDigest', 'authorityToken', 'authoritySeconds']);
      const seconds = duration(input.authoritySeconds, 'authority duration');
      try {
        const { rows } = await database.query(
          'SELECT canonical_v4.ingest_renew_authority($1,$2,$3,$4) AS renewed',
          [readId(input.operationId), input.operationDigest, readId(input.authorityToken), seconds]);
        return rows.length === 1 && rows[0].renewed === true;
      } catch (error) { throw storageFailure(error); }
    },

    async renewLease(value) {
      const input = readRecord(value,
        ['workerId', 'operationId', 'leaseToken', 'leaseSeconds']);
      const seconds = duration(input.leaseSeconds, 'lease duration');
      try {
        const { rows } = await database.query(
          'SELECT canonical_v4.ingest_renew_lease($1,$2,$3,$4) AS renewed',
          [readId(input.workerId), readId(input.operationId), readId(input.leaseToken), seconds]);
        return rows.length === 1 && rows[0].renewed === true;
      } catch (error) { throw storageFailure(error); }
    },

    async revokeAuthority(value) {
      const input = readRecord(value, ['operationId', 'operationDigest', 'authorityToken']);
      try {
        const { rows } = await database.query(
          'SELECT canonical_v4.ingest_revoke_authority($1,$2,$3) AS revoked',
          [readId(input.operationId), input.operationDigest, readId(input.authorityToken)]);
        return rows.length === 1 && rows[0].revoked === true;
      } catch (error) { throw storageFailure(error); }
    },

    async exactMatches(values) {
      const coordinates = representedVector(values);
      try {
        const { rows } = await database.query(
          'SELECT * FROM canonical_v4.ingest_ridge_scan($1::double precision[],$2)',
          [coordinates, RIDGE_PARAMETER_SHA256]);
        const matches = rows.map((row) => {
          const similarity = Number(row.similarity);
          if (!Number.isFinite(similarity) || similarity < -1 || similarity > 1)
            throw new ServiceError('storage-corrupt', 'Invalid Ridge scan result');
          return { topicId: readId(row.topic_id), similarity };
        });
        return frozenClone({ complete: true, topicIds: matches.map(({ topicId }) => topicId), matches });
      } catch (error) { throw storageFailure(error); }
    },

    async receipt(value) {
      const input = readRecord(value, ['operationId', 'operationDigest']);
      try {
        const { rows } = await database.query(
          'SELECT canonical_v4.ingest_receipt($1,$2) AS response_text',
          [readId(input.operationId), input.operationDigest]);
        if (rows.length !== 1 || typeof rows[0].response_text !== 'string')
          throw new ServiceError('storage-corrupt', 'Invalid ingestion receipt');
        return ingestionOutcome(rows[0].response_text);
      } catch (error) { throw storageFailure(error); }
    },

    async status(value) {
      const input = readRecord(value, ['operationId', 'operationDigest']);
      try {
        const { rows } = await database.query(
          'SELECT * FROM canonical_v4.ingest_status($1,$2)',
          [readId(input.operationId), input.operationDigest]);
        if (rows.length !== 1 || !['pending', 'leased', 'complete', 'failed', 'cancelled'].includes(rows[0].state))
          throw new ServiceError('storage-corrupt', 'Invalid ingestion status');
        if (rows[0].state === 'complete') {
          if (rows[0].terminal_code !== null || typeof rows[0].response_text !== 'string')
            throw new ServiceError('storage-corrupt', 'Invalid ingestion status');
          return frozenClone({ state: 'complete', result: ingestionOutcome(rows[0].response_text) });
        }
        if (rows[0].response_text !== null ||
            (['failed', 'cancelled'].includes(rows[0].state)) !== (typeof rows[0].terminal_code === 'string'))
          throw new ServiceError('storage-corrupt', 'Invalid ingestion status');
        return frozenClone({ state: rows[0].state,
          ...(rows[0].terminal_code === null ? {} : { terminalCode: readText(rows[0].terminal_code, 64) }) });
      } catch (error) { throw storageFailure(error); }
    },

    async failClaim(claim, value) {
      const claimed = readRecord(claim,
        ['operationId', 'operationDigest', 'requestMaterial', 'input', 'jobClass', 'ordinal',
          'attempts', 'leaseToken', 'leaseUntil', 'authorityUntil']);
      const options = readRecord(value, ['code']);
      if (!['representation-failed', 'worker-failed'].includes(options.code))
        fail('invalid', 'Invalid ingestion failure');
      try {
        const { rows } = await database.query(
          'SELECT canonical_v4.ingest_fail_claim($1,$2,$3,$4) AS failed',
          [readId(claimed.operationId), claimed.operationDigest, readId(claimed.leaseToken), options.code]);
        return rows.length === 1 && rows[0].failed === true;
      } catch (error) { throw storageFailure(error); }
    },

    async lifecycle(expectedValue, value) {
      const expected = readExpectedVersion(expectedValue);
      const discriminator = readRecord(value,
        ['type', 'sourceId', 'topicId', 'confirmation'], ['type']);
      const type = readText(discriminator.type, 64);
      let sql, parameters;
      if (type === 'correct-source') {
        const command = readRecord(value, ['type', 'sourceId', 'topicId']);
        const sourceId = readId(command.sourceId);
        const topicId = command.topicId === null ? null : readId(command.topicId);
        sql = 'SELECT canonical_v4.ingest_correct_source($1,$2,$3,$4,$5,$6) AS response_text';
        parameters = [expected.generation, sourceId, topicId,
          readId(nextId('topic')), readId(nextId('discussion')), readText(now(), 64)];
      } else if (type === 'forget-source') {
        const command = readRecord(value, ['type', 'sourceId']);
        sql = 'SELECT canonical_v4.ingest_forget_source($1,$2) AS response_text';
        parameters = [expected.generation, readId(command.sourceId)];
      } else if (type === 'delete-learned-topic') {
        const command = readRecord(value, ['type', 'topicId', 'confirmation']);
        sql = 'SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3) AS response_text';
        parameters = [expected.generation, readId(command.topicId), command.confirmation];
      } else if (type === 'clear-learned-data') {
        const command = readRecord(value, ['type', 'confirmation']);
        sql = 'SELECT canonical_v4.ingest_clear_learned_data($1,$2) AS response_text';
        parameters = [expected.generation, command.confirmation];
      } else fail('forbidden', 'Action unavailable');
      try {
        const { rows } = await database.query(sql, parameters);
        if (rows.length !== 1 || typeof rows[0].response_text !== 'string')
          throw new ServiceError('storage-corrupt', 'Invalid learned lifecycle result');
        return lifecycleEnvelope(rows[0].response_text, type);
      } catch (error) { throw storageFailure(error); }
    },

    async apply(claim, value) {
      const claimed = readRecord(claim,
        ['operationId', 'operationDigest', 'requestMaterial', 'input', 'jobClass', 'ordinal',
          'attempts', 'leaseToken', 'leaseUntil', 'authorityUntil']);
      const options = readRecord(value, ['representedValues']);
      const prepared = claimedOperation(claimed.input);
      if (prepared.input.operationId !== claimed.operationId ||
          prepared.operationDigest !== claimed.operationDigest ||
          prepared.requestMaterial !== claimed.requestMaterial)
        fail('invalid', 'Invalid ingestion claim');
      const input = prepared.input;
      const qualified = qualifyRetainedTopicContext({
        url: input.url,
        title: input.title,
      }) === null;
      let representedValues = null;
      if (qualified) representedValues = representedVector(options.representedValues);
      else if (options.representedValues !== null)
        fail('invalid', 'Invalid Ridge coordinates');
      const inspected = inspectPageUrl(input.url);
      if (!inspected?.supported || inspected.url !== input.url)
        fail('invalid', 'Unsupported page context');
      const sourceId = readId(nextId('source'));
      const topicId = readId(nextId('topic'));
      const discussionId = readId(nextId('discussion'));
      const createdAt = readText(now(), 64);
      const stamp = sourceStamp(input);
      try {
        const { rows } = await database.query(`SELECT * FROM canonical_v4.ingest_apply(
          $1,$2,$3,$4::double precision[],$5,$6,$7,$8,$9,$10,$11
        )`, [input.operationId, prepared.operationDigest,
          readId(claimed.leaseToken), representedValues, RIDGE_PARAMETER_SHA256,
          sourceId, topicId, discussionId, createdAt, stamp, true]);
        if (rows.length !== 1)
          throw new ServiceError('storage-corrupt', 'Invalid ingestion apply result');
        if (rows[0].terminal_code === 'source-changed')
          throw new ServiceError('conflict', 'State changed');
        if (rows[0].terminal_code !== null || typeof rows[0].response_text !== 'string')
          throw new ServiceError('storage-corrupt', 'Invalid ingestion apply result');
        return ingestionOutcome(rows[0].response_text);
      } catch (error) { throw storageFailure(error); }
    },
  });
}

export const CANONICAL_V4_INGESTION_SCHEMA_VERSION = SCHEMA_VERSION;
export const CANONICAL_V4_INGESTION_CAPACITY = Object.freeze({
  interactive: 8,
  crawler: 8,
  maximumInteractiveStreak: 4,
});
export const CANONICAL_V4_RIDGE_PARAMETER_SHA256 = RIDGE_PARAMETER_SHA256;
export const CANONICAL_V4_INGESTION_MODEL_ID = BROWSER_MODEL_ID;
