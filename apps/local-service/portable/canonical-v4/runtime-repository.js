import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { isAccountActor } from '../../src/accounts/account-principal.js';
import { ServiceError, fail } from '../../src/domain/errors.js';
import { frozenClone, readBody, readExpectedVersion, readId, readRecord, readText } from '../../src/domain/validation.js';
import { readCanonicalV4MigrationManifest, canonicalV4SchemaVersion } from './index.js';

const RUNTIME_SCHEMA_VERSION = 9;
// These are the only non-account human actors accepted by the canonical state
// contract, and exist solely for synthetic/demo fixtures.
const SYNTHETIC_DEMO_ACTORS = new Set(['demo-alex', 'demo-blair']);

function digestText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new ServiceError('storage-corrupt', `Invalid ${name}`);
  return number;
}

function decode(text, label) {
  if (typeof text !== 'string') throw new ServiceError('storage-corrupt', `Invalid ${label}`);
  try { return JSON.parse(text); }
  catch { throw new ServiceError('storage-corrupt', `Invalid ${label}`); }
}

function normalizeOrigin(value) {
  return value === undefined || value === null ? null : readId(value);
}

function normalizeSemanticTarget(value) {
  if (types.isProxy(value)) fail('invalid', 'Invalid request');
  const target = readRecord(value, ['nodeId', 'topicId', 'rootRevision', 'targetRevision']);
  if (![target.rootRevision, target.targetRevision].every(value => Number.isSafeInteger(value) && value > 0))
    fail('invalid', 'Invalid request');
  return Object.freeze({ nodeId: readText(target.nodeId, 160), topicId: readId(target.topicId),
    rootRevision: target.rootRevision, targetRevision: target.targetRevision });
}

function normalizeCommand(value) {
  const discriminator = readRecord(value,
    ['type', 'topicId', 'discussionId', 'rootId', 'replyToId', 'body', 'originSourceId', 'semanticTarget'], ['type']);
  const type = readText(discriminator.type, 64);
  if (type === 'create-root') {
    const command = readRecord(value, ['type', 'topicId', 'body', 'originSourceId'], ['type', 'topicId', 'body']);
    return Object.freeze({ type, topicId: readId(command.topicId), body: readBody(command.body),
      originSourceId: normalizeOrigin(command.originSourceId) });
  }
  if (type === 'reply') {
    const command = readRecord(value,
      ['type', 'discussionId', 'rootId', 'replyToId', 'body', 'originSourceId', 'semanticTarget'],
      ['type', 'discussionId', 'rootId', 'replyToId', 'body']);
    const target = Object.hasOwn(command, 'semanticTarget') ? normalizeSemanticTarget(command.semanticTarget) : null;
    if (target && command.replyToId === null) fail('invalid', 'Invalid request');
    return Object.freeze({ type, discussionId: readId(command.discussionId), rootId: readId(command.rootId),
      replyToId: command.replyToId === null ? null : readId(command.replyToId), body: readBody(command.body),
      originSourceId: normalizeOrigin(command.originSourceId), ...(target ? { semanticTarget: target } : {}) });
  }
  fail('forbidden', 'Action unavailable');
}

function normalizeRequest(value) {
  const input = readRecord(value, ['actorId', 'requestId', 'expected', 'command']);
  const actorId = readId(input.actorId), requestId = readId(input.requestId);
  if (!isAccountActor(actorId) && !SYNTHETIC_DEMO_ACTORS.has(actorId))
    fail('forbidden', 'Action unavailable');
  const expected = readExpectedVersion(input.expected), command = normalizeCommand(input.command);
  // A catalog revision is an advisory observation, not a write precondition.
  // Excluding it lets an exact ambiguous request replay after unrelated writes.
  const requestMaterial = JSON.stringify({ generation: expected.generation, command });
  const requestDigest = digestText(requestMaterial);
  return Object.freeze({ actorId, requestId, expected, command, requestMaterial, requestDigest });
}

async function runtimeHeader(database) {
  const { rows } = await database.query(`SELECT generation,revision,catalog_version,matching_version
    FROM canonical_v4.runtime_state WHERE singleton=true`);
  if (rows.length !== 1) fail('unavailable', 'Canonical runtime unavailable');
  return Object.freeze({ generation: rows[0].generation, revision: safeInteger(rows[0].revision, 'runtime revision'),
    catalogVersion: safeInteger(rows[0].catalog_version, 'catalog version'),
    matchingVersion: safeInteger(rows[0].matching_version, 'matching version') });
}

function replayResponse(text) {
  const value = decode(text, 'command receipt');
  const record = readRecord(value, ['version', 'discussionVersion', 'result']);
  const version = readExpectedVersion(record.version);
  if (!Number.isSafeInteger(record.discussionVersion) || record.discussionVersion < 1) fail('storage-corrupt', 'Invalid command receipt');
  const result = readRecord(record.result, ['contributionId']);
  return frozenClone({ version, discussionVersion: record.discussionVersion,
    result: { contributionId: readId(result.contributionId) } });
}

function commandArguments(request, contributionId, timestamp) {
  const command = request.command;
  return [request.actorId, request.requestId, request.requestDigest, request.requestMaterial,
    request.expected.generation, command.type,
    command.type === 'create-root' ? command.topicId : null,
    command.type === 'reply' ? command.discussionId : null,
    command.type === 'reply' ? command.rootId : null,
    command.type === 'reply' ? command.replyToId : null,
    command.body, command.originSourceId, contributionId, timestamp];
}

function storageFailure(error) {
  if (error instanceof ServiceError) return error;
  if (error?.code === 'P1001') return new ServiceError('conflict', 'State changed');
  if (error?.code === 'P1002') return new ServiceError('not-found', 'Object unavailable');
  if (error?.code === 'P1003') return new ServiceError('invalid', 'Invalid request');
  if (error?.code === 'P1004') return new ServiceError('storage-corrupt', 'Invalid canonical runtime state');
  if (error?.code === '23505') return new ServiceError('conflict', 'Identifier already used');
  if (error?.code === '23503' || error?.code === '23514') return new ServiceError('conflict', 'State changed');
  return new ServiceError('storage-failure', 'Canonical PostgreSQL write failed');
}

export function createCanonicalV4RuntimeRepository({ database,
  schemaProfile = 'legacy9',
  nextId = (kind) => `${kind}-${randomUUID()}`,
  now = () => new Date().toISOString(),
  beforeWatermark = null } = {}) {
  const schemaVersion = canonicalV4SchemaVersion(schemaProfile);
  if (!database || typeof database.query !== 'function' || typeof database.transaction !== 'function' ||
      typeof nextId !== 'function' || typeof now !== 'function' ||
      beforeWatermark !== null && typeof beforeWatermark !== 'function')
    throw new TypeError('Invalid canonical PostgreSQL runtime dependencies');

  return Object.freeze({
    async health() {
      const { rows } = await database.query('SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version');
      let migrations;
      try { migrations = await readCanonicalV4MigrationManifest(schemaProfile); }
      catch { fail('unavailable', 'Canonical runtime schema unavailable'); }
      if (rows.length !== schemaVersion || rows.length !== migrations.length || rows.some((row, index) =>
        Number(row.version) !== migrations[index].version || row.hash !== migrations[index].hash))
        fail('unavailable', 'Canonical runtime schema unavailable');
      const state = await runtimeHeader(database);
      return frozenClone({ schemaVersion, version: {
        generation: state.generation, revision: state.revision,
      } });
    },

    async version() {
      const state = await runtimeHeader(database);
      return frozenClone({ generation: state.generation, revision: state.revision });
    },

    async discussionVersion(discussionId) {
      discussionId = readId(discussionId);
      const { rows } = await database.query(`SELECT write_version FROM canonical_v4.discussions WHERE id=$1`, [discussionId]);
      if (rows.length !== 1) fail('not-found', 'Object unavailable');
      return safeInteger(rows[0].write_version, 'discussion version');
    },

    async command(value) {
      const request = normalizeRequest(value);
      try {
        return await database.transaction(async (tx) => {
          const contributionId = readId(nextId('contribution'));
          const timestamp = readText(now(), 64);
          const parameters = commandArguments(request, contributionId, timestamp);
          if (beforeWatermark === null) {
            const { rows } = await tx.query(`SELECT canonical_v4.runtime_append_command(
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
            ) AS response_text`, parameters);
            if (rows.length !== 1) throw new ServiceError('storage-corrupt', 'Command boundary failed');
            return replayResponse(rows[0].response_text);
          }
          // The split functions are owner-only and exist exclusively for the
          // rollback/concurrency harness. murmingle_app can execute only the
          // atomic wrapper above.
          const { rows: preparedRows } = await tx.query(`SELECT * FROM canonical_v4.runtime_prepare_command(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
          )`, parameters);
          if (preparedRows.length !== 1) throw new ServiceError('storage-corrupt', 'Command boundary failed');
          const prepared = preparedRows[0];
          if (prepared.replayed) return replayResponse(prepared.response_text);
          await beforeWatermark(Object.freeze({ actorId: request.actorId, requestId: request.requestId,
            discussionId: prepared.discussion_id, contributionId: prepared.contribution_id }));
          const { rows: completed } = await tx.query(`SELECT canonical_v4.runtime_complete_command(
            $1,$2,$3,$4,$5,$6
          ) AS response_text`, [request.actorId, request.requestId, request.expected.generation,
            prepared.discussion_id, prepared.contribution_id, prepared.discussion_version]);
          if (completed.length !== 1) throw new ServiceError('storage-corrupt', 'Command boundary failed');
          return replayResponse(completed[0].response_text);
        });
      } catch (error) { throw storageFailure(error); }
    },
  });
}

export const CANONICAL_V4_RUNTIME_SCHEMA_VERSION = RUNTIME_SCHEMA_VERSION;
