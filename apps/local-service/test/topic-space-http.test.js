import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestHandler } from '../src/http/request-handler.js';
import { ServiceError } from '../src/domain/errors.js';
import { readRecord } from '../src/domain/validation.js';
import { createMemoryTopicSpacePolicyStore } from '../src/application/topic-space-policy.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPGliteDatabase } from '../portable/src/database.js';
import { seedCanonicalV4RuntimeFixture } from '../portable/test/canonical-v4-runtime-fixture.js';
import { openDormantPostgresApplication } from '../src/startup.js';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = `account-${OWNER_ID}`, OTHER = `account-${OTHER_ID}`;
const config = { hostHeader: '127.0.0.1:4174', origin: `chrome-extension://${'a'.repeat(32)}`,
  capability: 'synthetic-topic-space-capability' };
const update = { expectedRevision: 0, defaultSpecificity: 47, topicOverrides: [] };
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const decode = response => JSON.parse(response.body);

function fixture({ accountsEnabled = true, feature = true, ownerId = OWNER_ID,
  queryGate = null, ownerGate = null, updateGate = null } = {}) {
  const sessions = new Map([['owner-session', OWNER], ['other-session', OTHER]]);
  const calls = [], store = createMemoryTopicSpacePolicyStore({ ownerAccountId: ownerId });
  let paired = true;
  const actor = token => {
    const id = sessions.get(token);
    if (!id) throw new ServiceError('unauthorized', 'Synthetic expired session');
    return { id, accountId: id.slice('account-'.length), type: 'human', demo: false, displayName: 'Synthetic' };
  };
  const accounts = accountsEnabled ? { resolvePrincipal: actor, me: actor } : null;
  const topicSpaces = {
    async query(body, options) {
      calls.push(['query', body, options]);
      readRecord(body, ['query', 'sourceId', 'offset', 'limit']);
      assert.equal(typeof options.isCurrent, 'function');
      if (queryGate) await queryGate.promise;
      return Object.freeze({ schema: 'synthetic-topic-spaces/v1', cards: ['PUBLIC_SNAPSHOT_MARKER'] });
    },
    async owner(actorId) {
      calls.push(['owner', actorId]);
      if (ownerGate) await ownerGate.promise;
      return { policy: store.read().policy, canManage: actorId === OWNER && store.read().ownerAccountId === OWNER_ID };
    },
    async updatePolicy(body, actorId, options) {
      calls.push(['policy', actorId, options]);
      if (actorId !== `account-${store.read().ownerAccountId}`) throw new ServiceError('forbidden', 'Not owner');
      if (updateGate) await updateGate.promise;
      return { policy: store.update(body, options.isCurrent), canManage: true };
    },
  };
  const handle = createRequestHandler({ config, accounts, accountWrites: accountsEnabled,
    service: { coherentSnapshotReads: true, command() { assert.fail('Topic spaces cannot create canonical commands'); },
      version() { assert.fail('Topic spaces must not couple to global revision checks'); } },
    pairingVerifier: { verify: () => paired }, topicSpaces: feature ? topicSpaces : null });
  function request(action, body = action === 'owner' ? {} : action === 'policy' ? update :
    { query: '', sourceId: null, offset: 0, limit: 20 }, headers = {}, options = {}) {
    return handle({ method: 'POST', url: `/v1/topic-spaces/${action}`, body: JSON.stringify(body), headers: {
      host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
      'content-type': 'application/json', ...headers,
    } }, options);
  }
  return { request, handle, calls, sessions, store, revokePairing() { paired = false; } };
}

test('paired Topic space reads admit guests and current named sessions without canonical or provider authority', async () => {
  const f = fixture();
  assert.equal((await f.request('query')).status, 200);
  assert.equal((await f.request('query', undefined, { 'x-account-session': 'other-session' })).status, 200);
  assert.equal(decode(await f.request('owner')).canManage, false);
  assert.equal(decode(await f.request('owner', {}, { 'x-account-session': 'other-session' })).canManage, false);
  assert.equal(decode(await f.request('owner', {}, { 'x-account-session': 'owner-session' })).canManage, true);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'owner').map(([, actorId]) => actorId), [null, OTHER, OWNER]);
  assert.equal(f.store.read().policy.revision, 0);
  assert.equal((await f.request('owner', { actorId: OWNER })).status, 400);
  assert.equal((await f.request('query', { vector: [1, 0] })).status, 400);
  assert.equal((await fixture({ feature: false }).request('query')).status, 404);
});

test('policy writes require the configured named owner and exact Origin, never pairing or demo headers', async () => {
  const f = fixture();
  for (const headers of [{}, { 'x-demo-actor': OWNER }, { 'x-account-session': 'other-session' },
    { 'x-account-session': 'owner-session', 'x-demo-actor': 'demo-alex' },
    { 'x-account-session': 'owner-session', origin: 'https://example.org' }]) {
    assert.equal((await f.request('policy', update, headers)).status, 403);
    assert.equal(f.store.read().policy.revision, 0);
  }
  assert.equal((await fixture({ accountsEnabled: false }).request('policy', update,
    { 'x-demo-actor': OWNER })).status, 403);
  assert.equal((await fixture({ ownerId: null }).request('policy', update,
    { 'x-account-session': 'owner-session' })).status, 403);
  assert.equal((await f.request('policy', update, { 'x-account-session': 'expired-session' })).status, 401);
  const accepted = await f.request('policy', update, { 'x-account-session': 'owner-session' });
  assert.equal(accepted.status, 200);
  assert.equal(decode(accepted).policy.defaultSpecificity, 47);
  assert.equal(decode(accepted).policy.revision, 1);
  assert.equal((await f.request('policy', update, { 'x-account-session': 'owner-session' })).status, 409);
  assert.equal(f.store.read().policy.revision, 1);
});

test('Topic space read delivery renews current session, pairing and transport after async work', async () => {
  for (const fence of ['session', 'pairing', 'transport', 'abort']) {
    const gate = defer(), controller = new AbortController(), f = fixture({ queryGate: gate });
    let current = true;
    const pending = f.request('query', undefined, { 'x-account-session': 'owner-session' },
      { signal: controller.signal, isCurrent: () => current });
    assert.equal(f.calls[0][0], 'query');
    if (fence === 'session') f.sessions.delete('owner-session');
    if (fence === 'pairing') f.revokePairing();
    if (fence === 'transport') current = false;
    if (fence === 'abort') controller.abort();
    gate.resolve();
    const response = await pending;
    assert.notEqual(response.status, 200, fence);
    assert.equal(response.body.includes('PUBLIC_SNAPSHOT_MARKER'), false, fence);
  }
});

test('Topic space owner delivery renews optional sessions and does not publish revoked ownership', async () => {
  const gate = defer(), f = fixture({ ownerGate: gate });
  const pending = f.request('owner', {}, { 'x-account-session': 'owner-session' });
  f.sessions.delete('owner-session'); gate.resolve();
  const response = await pending;
  assert.equal(response.status, 401);
  assert.equal(response.body.includes('canManage'), false);
});

test('policy publication renews actor, pairing and transport immediately before the store commit', async () => {
  for (const fence of ['session', 'account-switch', 'pairing', 'transport', 'abort']) {
    const gate = defer(), controller = new AbortController(), f = fixture({ updateGate: gate });
    let current = true;
    const pending = f.request('policy', update, { 'x-account-session': 'owner-session' },
      { signal: controller.signal, isCurrent: () => current });
    assert.equal(f.calls[0][0], 'policy');
    assert.equal(f.calls[0][2].isCurrent(), true);
    if (fence === 'session') f.sessions.delete('owner-session');
    if (fence === 'account-switch') f.sessions.set('owner-session', OTHER);
    if (fence === 'pairing') f.revokePairing();
    if (fence === 'transport') current = false;
    if (fence === 'abort') controller.abort();
    gate.resolve();
    assert.equal((await pending).status, 403, fence);
    assert.equal(f.store.read().policy.revision, 0, fence);
  }
});

test('Topic space routes retain strict ingress capability, Host, JSON and method fences', async () => {
  const f = fixture();
  assert.equal((await f.request('query', undefined, { authorization: 'missing' })).status, 401);
  assert.equal((await f.request('query', undefined, { host: 'example.org' })).status, 403);
  assert.equal((await f.handle({ method: 'POST', url: '/v1/topic-spaces/query',
    body: JSON.stringify({ query: '', sourceId: null, offset: 0, limit: 20 }), headers: {
      host: config.hostHeader, authorization: `Bearer ${config.capability}`, 'content-type': 'application/json',
    } })).status, 403);
  assert.equal((await f.request('query', undefined, { 'content-type': 'text/plain' })).status, 400);
  assert.equal((await f.handle({ method: 'GET', url: '/v1/topic-spaces/policy', body: null,
    headers: { host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}` } })).status, 404);
  assert.equal(f.calls.length, 0);
});

test('PostgreSQL startup without the installed Ridge artifact preserves canonical reads and leaves Topic Spaces absent',
  { timeout: 15000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-topic-space-http-'));
    const database = await createPGliteDatabase();
    await seedCanonicalV4RuntimeFixture(database);
    let application = null, disposed = 0, ownedPoolClosed = 0, topicInputReads = 0;
    t.after(async () => {
      await application?.close();
      await database.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const canonicalDatabase = { ...database,
      transaction: work => database.transaction(tx => work({ ...tx, async query(sql, parameters) {
        if (sql.includes('root_id IS NULL') && sql.includes('LIMIT 4097')) topicInputReads++;
        return tx.query(sql, parameters);
      } })),
      async close() {
        ownedPoolClosed++;
        assert.equal(application.topicSpaces, null);
      },
    };
    application = await openDormantPostgresApplication({
      config: { host: '127.0.0.1', port: 4174, origin: config.origin, capability: config.capability },
      databasePath: path.join(directory, 'unused-canonical.sqlite'), canonicalDatabase, canonicalDatabaseOwned: true,
      nextId: prefix => `${prefix}-topic-space-startup`, now: () => '2026-10-18T10:00:00.000Z',
      ai: { dispose() { disposed++; }, restore: async () => false },
    });
    assert.equal(application.topicSpaces, null);
    const headers = { host: config.hostHeader, origin: config.origin,
      authorization: `Bearer ${config.capability}`, 'content-type': 'application/json' };
    const owner = await application.handle({ method: 'POST', url: '/v1/topic-spaces/owner', headers, body: '{}' });
    assert.equal(owner.status, 404);
    const response = await application.handle({ method: 'POST', url: '/v1/topic-spaces/query', headers,
      body: JSON.stringify({ sourceId: null, query: '', offset: 0, limit: 20 }) });
    assert.equal(response.status, 404);
    const catalog = await application.handle({ method: 'GET', url: '/v1/catalog', headers, body: null });
    assert.equal(catalog.status, 200);
    assert.equal(decode(catalog).sources.length, 3);
    assert.equal(topicInputReads, 0, 'missing Ridge artifact never starts a raw E5 build');
    assert.equal(existsSync(path.join(directory, 'topic-space-policy.json')), false,
      'first read never appoints an owner or publishes a policy file');
    await application.close();
    assert.equal(disposed, 1);
    assert.equal(ownedPoolClosed, 1);
    await application.close();
    assert.equal(ownedPoolClosed, 1);
  });
