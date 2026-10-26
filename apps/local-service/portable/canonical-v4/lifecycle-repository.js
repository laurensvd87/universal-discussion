import { createHash, randomUUID } from 'node:crypto';
import { isAccountActor, isAccountPrincipal } from '../../src/accounts/account-principal.js';
import { ServiceError, fail } from '../../src/domain/errors.js';
import {
  frozenClone,
  readBody,
  readExpectedVersion,
  readId,
  readRecord,
  readText,
} from '../../src/domain/validation.js';
import { readCanonicalV4MigrationManifest } from './index.js';

const SCHEMA_VERSION = 9;
const GENERATED_AUTHOR = 'demo-imported-ai';
const DEMO_ACTORS = new Set(['demo-alex', 'demo-blair']);
const GENERATED_TYPES = new Set(['share-insight', 'share-insight-reply']);

function digestText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new ServiceError('storage-corrupt', `Invalid ${label}`);
  return number;
}

function decode(text, label) {
  if (typeof text !== 'string') throw new ServiceError('storage-corrupt', `Invalid ${label}`);
  try { return JSON.parse(text); }
  catch { throw new ServiceError('storage-corrupt', `Invalid ${label}`); }
}

function actorIdFor(actor) {
  if (isAccountPrincipal(actor)) return actor.id;
  if (actor && typeof actor === 'object' && !Array.isArray(actor) &&
      actor.type === 'human' && actor.demo === true && DEMO_ACTORS.has(actor.id)) return actor.id;
  fail('forbidden', 'Action unavailable');
}

function optionalOrigin(value) {
  return value === undefined || value === null ? null : readId(value);
}

function normalizeCommand(value) {
  const discriminator = readRecord(value, [
    'type', 'topicId', 'discussionId', 'rootId', 'replyToId', 'body',
    'originSourceId', 'operationId', 'contributionId',
  ], ['type']);
  const type = readText(discriminator.type, 64);
  if (type === 'edit') {
    const input = readRecord(value, ['type', 'contributionId', 'body']);
    return Object.freeze({ type, contributionId: readId(input.contributionId), body: readBody(input.body) });
  }
  if (type === 'withdraw') {
    const input = readRecord(value, ['type', 'contributionId']);
    return Object.freeze({ type, contributionId: readId(input.contributionId) });
  }
  if (type === 'share-insight') {
    const input = readRecord(value,
      ['type', 'topicId', 'body', 'operationId', 'originSourceId'],
      ['type', 'topicId', 'body', 'operationId']);
    return Object.freeze({ type, topicId: readId(input.topicId), body: readBody(input.body),
      operationId: readId(input.operationId), originSourceId: optionalOrigin(input.originSourceId) });
  }
  if (type === 'share-insight-reply') {
    const input = readRecord(value,
      ['type', 'topicId', 'discussionId', 'rootId', 'replyToId', 'body', 'operationId', 'originSourceId'],
      ['type', 'topicId', 'discussionId', 'rootId', 'replyToId', 'body', 'operationId']);
    return Object.freeze({ type, topicId: readId(input.topicId), discussionId: readId(input.discussionId),
      rootId: readId(input.rootId), replyToId: readId(input.replyToId), body: readBody(input.body),
      operationId: readId(input.operationId), originSourceId: optionalOrigin(input.originSourceId) });
  }
  fail('forbidden', 'Action unavailable');
}

function generatedProofFor(value, actorId, command) {
  if (!GENERATED_TYPES.has(command.type)) {
    if (value !== null) fail('invalid', 'Invalid request');
    return null;
  }
  let proof;
  try {
    const input = readRecord(value, [
      'kind', 'operationId', 'actorId', 'topicId', 'originSourceId', 'body',
      'rootId', 'replyToId', 'discussionId',
    ]);
    proof = {
      kind: readText(input.kind, 64), operationId: readId(input.operationId),
      actorId: readId(input.actorId), topicId: readId(input.topicId),
      originSourceId: input.originSourceId === null ? null : readId(input.originSourceId),
      body: readBody(input.body),
      rootId: input.rootId === null ? null : readId(input.rootId),
      replyToId: input.replyToId === null ? null : readId(input.replyToId),
      discussionId: input.discussionId === null ? null : readId(input.discussionId),
    };
  } catch { fail('forbidden', 'Action unavailable'); }
  const expected = command.type === 'share-insight' ? {
    kind: 'generated-insight', operationId: command.operationId, actorId,
    topicId: command.topicId, originSourceId: command.originSourceId,
    body: command.body, rootId: null, replyToId: null, discussionId: null,
  } : {
    kind: 'generated-insight', operationId: command.operationId, actorId,
    topicId: command.topicId, originSourceId: command.originSourceId,
    body: command.body, rootId: command.rootId, replyToId: command.replyToId,
    discussionId: command.discussionId,
  };
  if (JSON.stringify(proof) !== JSON.stringify(expected)) fail('forbidden', 'Action unavailable');
  return Object.freeze(proof);
}

function storageFailure(error) {
  if (error instanceof ServiceError) return error;
  if (error?.code === 'P1001') return new ServiceError('conflict', 'State changed');
  if (error?.code === 'P1002') return new ServiceError('not-found', 'Object unavailable');
  if (error?.code === 'P1003') return new ServiceError('invalid', 'Invalid request');
  if (error?.code === 'P1004') return new ServiceError('storage-corrupt', 'Invalid canonical runtime state');
  if (error?.code === 'P1005') return new ServiceError('capacity', 'Capacity reached');
  if (error?.code === 'P1006') return new ServiceError('forbidden', 'Action unavailable');
  if (error?.code === '23505') return new ServiceError('conflict', 'Identifier already used');
  if (error?.code === '23503' || error?.code === '23514')
    return new ServiceError('conflict', 'State changed');
  return new ServiceError('storage-failure', 'Canonical PostgreSQL write failed');
}

function lifecycleResponse(text) {
  const value = decode(text, 'lifecycle command receipt');
  let record, result;
  try {
    record = readRecord(value, ['version', 'result']);
    result = readRecord(record.result, ['contributionId']);
  } catch { throw new ServiceError('storage-corrupt', 'Invalid lifecycle command receipt'); }
  const version = readExpectedVersion(record.version);
  return frozenClone({ version, result: { contributionId: readId(result.contributionId) } });
}

function withdrawalResponse(text) {
  const value = decode(text, 'account withdrawal result');
  let record;
  try { record = readRecord(value, ['withdrawn']); }
  catch { throw new ServiceError('storage-corrupt', 'Invalid account withdrawal result'); }
  return frozenClone({ withdrawn: safeInteger(record.withdrawn, 'withdrawal count') });
}

async function schemaHealth(database) {
  const { rows } = await database.query(
    'SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version');
  let manifest;
  try { manifest = await readCanonicalV4MigrationManifest(); }
  catch { fail('unavailable', 'Canonical lifecycle schema unavailable'); }
  if (rows.length !== SCHEMA_VERSION || rows.length !== manifest.length || rows.some((row, index) =>
    Number(row.version) !== manifest[index].version || row.hash !== manifest[index].hash))
    fail('unavailable', 'Canonical lifecycle schema unavailable');
  return Object.freeze({ schemaVersion: SCHEMA_VERSION });
}

export function createCanonicalV4LifecycleRepository({ database,
  nextId = (kind) => `${kind}-${randomUUID()}`,
  now = () => new Date().toISOString() } = {}) {
  if (!database || typeof database.query !== 'function' ||
      typeof nextId !== 'function' || typeof now !== 'function')
    throw new TypeError('Invalid canonical PostgreSQL lifecycle dependencies');

  return Object.freeze({
    health: () => schemaHealth(database),

    async command(expectedValue, commandValue, actor, generatedProof = null) {
      const actorId = actorIdFor(actor);
      const expected = readExpectedVersion(expectedValue);
      const command = normalizeCommand(commandValue);
      const proof = generatedProofFor(generatedProof, actorId, command);
      const requestMaterial = JSON.stringify({
        generation: expected.generation, revision: expected.revision, command,
      });
      const requestDigest = digestText(requestMaterial);
      const requestId = `lifecycle-${digestText(JSON.stringify({ actorId, expected, command }))}`;
      const generated = GENERATED_TYPES.has(command.type);
      const contributionId = generated ? readId(nextId('contribution')) : null;
      const timestamp = readText(now(), 64);
      const parameters = [
        actorId, requestId, requestDigest, requestMaterial,
        expected.generation, expected.revision, command.type,
        command.topicId ?? null, command.discussionId ?? null,
        command.rootId ?? null, command.replyToId ?? null,
        command.body ?? null, command.originSourceId ?? null,
        command.operationId ?? null, command.contributionId ?? null,
        contributionId, timestamp, proof === null ? null : JSON.stringify(proof),
      ];
      try {
        const { rows } = await database.query(`SELECT canonical_v4.runtime_lifecycle_command(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
        ) AS response_text`, parameters);
        if (rows.length !== 1)
          throw new ServiceError('storage-corrupt', 'Lifecycle command boundary failed');
        return lifecycleResponse(rows[0].response_text);
      } catch (error) { throw storageFailure(error); }
    },

    async withdrawAccountContributions(actorId) {
      if (!isAccountActor(actorId)) fail('forbidden', 'Actor unavailable');
      try {
        const { rows } = await database.query(
          'SELECT canonical_v4.runtime_withdraw_account_contributions($1) AS response_text',
          [actorId]);
        if (rows.length !== 1)
          throw new ServiceError('storage-corrupt', 'Account withdrawal boundary failed');
        return withdrawalResponse(rows[0].response_text);
      } catch (error) { throw storageFailure(error); }
    },
  });
}

export const CANONICAL_V4_LIFECYCLE_SCHEMA_VERSION = SCHEMA_VERSION;
export const CANONICAL_V4_GENERATED_AUTHOR_ID = GENERATED_AUTHOR;
