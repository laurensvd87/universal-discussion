import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { operationDigestFor } from "../src/domain/source-threads.js";
import { CrawlerApiError } from "../src/crawler/local-ingest-client.js";
import { createPostgresCrawlerClient } from "../src/crawler/postgres-ingest-client.js";

const VERSION = Object.freeze({ generation: "postgres-crawler-generation", revision: 10 });
const values = Object.freeze([1, ...Array(383).fill(0)]);
const representation = Object.freeze({
  url: "https://example.org/articles/postgres-crawler",
  title: "PostgreSQL crawler fixture",
  embedding: Object.freeze({ modelId: "e5-small-q8-browser-main-prefix-v1", values }),
  extractorVersion: "crawler-static-html-prefix/v1",
});

function receipt(version = { ...VERSION, revision: VERSION.revision + 1 }) {
  return { version, sourceId: "source-postgres-crawler", topicId: "topic-postgres-primary",
    topicIds: ["topic-postgres-primary", "topic-postgres-secondary"], assignment: "provisional",
    policyVersion: "ridge1-fixed-reference-radius/v1" };
}

function fixture({ statuses = [], enqueue = null, versions = [], versionRead = null, knownRead = null,
  readSleep = null } = {}) {
  const calls = { enqueue: [], status: [], renew: [], revoke: [], version: 0, known: 0, sleep: [] };
  let clock = 1_000, statusIndex = 0, versionIndex = 0;
  const readClient = {
    async version(options) {
      calls.version += 1;
      return versionRead ? versionRead(options, calls.version) : versions[versionIndex++] ?? VERSION;
    },
    async knownSourceUrls(options) {
      calls.known += 1;
      return knownRead ? knownRead(options, calls.known) : { version: VERSION, urls: [representation.url] };
    },
  };
  const ingestionRepository = {
    async enqueueCrawler(input, options) {
      calls.enqueue.push({ input: structuredClone(input), options: structuredClone(options) });
      const custom = enqueue ? await enqueue(input, options, calls.enqueue.length) : undefined;
      if (custom !== undefined) return custom;
      return { operationId: input.operationId, operationDigest: operationDigestFor(input), jobClass: "crawler",
        state: "pending", ordinal: 1, attempts: 0, replayed: false, sourceId: null,
        authorityToken: options.authorityToken };
    },
    async status(input) {
      calls.status.push(structuredClone(input));
      const value = statuses[Math.min(statusIndex++, statuses.length - 1)];
      if (value instanceof Error) throw value;
      return structuredClone(value ?? { state: "complete", result: receipt() });
    },
    async renewAuthority(input) { calls.renew.push(structuredClone(input)); return true; },
    async revokeAuthority(input) { calls.revoke.push(structuredClone(input)); return true; },
  };
  const client = createPostgresCrawlerClient({ readClient, ingestionRepository,
    nextAuthorityToken: () => "crawler-authority-token", now: () => clock,
    sleep: async (milliseconds, signal) => {
      calls.sleep.push(milliseconds);
      if (signal?.aborted) throw new CrawlerApiError("aborted");
      if (readSleep) return readSleep(milliseconds, signal, calls.sleep.length);
      clock += milliseconds;
    } });
  return { client, calls, ingestionRepository };
}

test("crawler submits through the crawler PostgreSQL lane and waits for the exact durable v4 receipt", async () => {
  const f = fixture({ statuses: [{ state: "pending" }, { state: "leased" }, { state: "complete", result: receipt() }] });
  assert.deepEqual(await f.client.version(), VERSION);
  assert.deepEqual(await f.client.knownSourceUrls(), { version: VERSION, urls: [representation.url] });
  const result = await f.client.ingest(representation, "crawler-postgres-operation", VERSION);
  assert.deepEqual(result, receipt());
  assert.equal(f.calls.enqueue.length, 1);
  assert.deepEqual(f.calls.enqueue[0].input, { expected: VERSION, operationId: "crawler-postgres-operation", ...representation });
  assert.deepEqual(f.calls.enqueue[0].options, { authorityToken: "crawler-authority-token", authoritySeconds: 30 });
  const digest = operationDigestFor(f.calls.enqueue[0].input);
  assert.deepEqual(f.calls.status, Array(3).fill(null).map(() => ({ operationId: "crawler-postgres-operation", operationDigest: digest })));
  assert.deepEqual(f.calls.revoke, []);
  assert.deepEqual(f.calls.sleep, [100, 100]);
});

test("read-only catalogue calls recover with a fresh bounded backoff loop", async () => {
  const controller = new AbortController();
  const f = fixture({
    versionRead(options, call) {
      assert.equal(options.signal, controller.signal);
      if (call === 1) throw new CrawlerApiError("unavailable");
      if (call === 2) throw Object.assign(new Error("private storage detail"), { code: "storage-failure" });
      return VERSION;
    },
    knownRead(options, call) {
      assert.equal(options.signal, controller.signal);
      if (call === 1) throw new CrawlerApiError("conflict");
      if (call === 2) throw new CrawlerApiError("capacity");
      if (call === 3) throw new CrawlerApiError("response-timeout");
      return { version: VERSION, urls: [representation.url] };
    },
  });
  assert.deepEqual(await f.client.version({ signal: controller.signal }), VERSION);
  assert.deepEqual(await f.client.knownSourceUrls({ signal: controller.signal }),
    { version: VERSION, urls: [representation.url] });
  assert.equal(f.calls.version, 3);
  assert.equal(f.calls.known, 4);
  assert.deepEqual(f.calls.sleep, [2_000, 4_000, 2_000, 4_000, 8_000]);
});

test("read-only retry backoff stays capped at sixteen seconds without accumulating attempts", async () => {
  const transient = ["ambiguous", "service-error", "service-unavailable", "unavailable", "conflict", "capacity"];
  const f = fixture({ versionRead(_options, call) {
    if (call <= transient.length) throw new CrawlerApiError(transient[call - 1]);
    throw new CrawlerApiError("forbidden");
  } });
  await assert.rejects(f.client.version(), error => error instanceof CrawlerApiError && error.code === "forbidden");
  assert.equal(f.calls.version, 7);
  assert.deepEqual(f.calls.sleep, [2_000, 4_000, 8_000, 16_000, 16_000, 16_000]);
});

test("cancelling a read-only retry removes its delay listener and stops further calls", async () => {
  const controller = new AbortController();
  let releaseAttempt;
  const attemptStarted = new Promise(resolve => { releaseAttempt = resolve; });
  const f = fixture();
  const client = createPostgresCrawlerClient({
    readClient: {
      async version() { releaseAttempt(); throw new CrawlerApiError("unavailable"); },
      async knownSourceUrls() { return { version: VERSION, urls: [] }; },
    },
    ingestionRepository: f.ingestionRepository,
  });
  const pending = client.version({ signal: controller.signal });
  await attemptStarted;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  controller.abort();
  await assert.rejects(pending, error => error instanceof CrawlerApiError && error.code === "aborted");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("authentication and invalid read failures remain terminal without retry", async () => {
  for (const code of ["unauthorized", "forbidden", "invalid-request", "invalid-response"]) {
    const f = fixture({ versionRead() { throw new CrawlerApiError(code); } });
    await assert.rejects(f.client.version(), error => error instanceof CrawlerApiError && error.code === code);
    assert.equal(f.calls.version, 1, code);
    assert.deepEqual(f.calls.sleep, [], code);
  }
});

test("stale admission refreshes only the version and preserves operation identity and normalized bytes", async () => {
  const next = { ...VERSION, revision: 12 }, final = receipt({ ...VERSION, revision: 13 });
  const conflict = Object.assign(new Error("private database detail"), { code: "conflict" });
  const f = fixture({ versions: [next], statuses: [{ state: "complete", result: final }],
    enqueue(_input, _options, call) { if (call === 1) throw conflict; } });
  assert.deepEqual(await f.client.ingest(representation, "crawler-postgres-conflict", VERSION), final);
  assert.equal(f.calls.version, 1);
  assert.equal(f.calls.enqueue.length, 2);
  assert.deepEqual(f.calls.enqueue.map(call => call.input.expected), [VERSION, next]);
  for (const key of ["operationId", "url", "title", "embedding", "extractorVersion"])
    assert.deepEqual(f.calls.enqueue[1].input[key], f.calls.enqueue[0].input[key]);
});

test("an uncertain enqueue consults durable status before any exact replay", async () => {
  const uncertain = Object.assign(new Error("private transport detail"), { code: "storage-failure" });
  const final = receipt();
  const f = fixture({ statuses: [{ state: "pending" }, { state: "complete", result: final }],
    enqueue(_input, _options, call) { if (call === 1) throw uncertain; assert.fail("live durable operation must not enqueue twice"); } });
  assert.deepEqual(await f.client.ingest(representation, "crawler-postgres-uncertain", VERSION), final);
  assert.equal(f.calls.enqueue.length, 1);
  assert.equal(f.calls.status.length, 2);
});

test("timeout and cancellation revoke authority but leave the stable operation resumable", async () => {
  const timeout = fixture({ statuses: [{ state: "pending" }] });
  await assert.rejects(timeout.client.ingest(representation, "crawler-postgres-timeout", VERSION),
    error => error instanceof CrawlerApiError && error.code === "response-timeout" && error.message === "response-timeout");
  assert.equal(timeout.calls.enqueue.length, 1);
  assert.equal(timeout.calls.revoke.length, 1);
  assert.equal(timeout.calls.revoke[0].operationId, "crawler-postgres-timeout");
  assert.ok(timeout.calls.renew.length >= 1, "long pending work renews bounded authority before the deadline");

  const controller = new AbortController();
  const cancelled = fixture({ statuses: [{ state: "pending" }] });
  cancelled.client = createPostgresCrawlerClient({
    readClient: { version: () => VERSION, knownSourceUrls: () => ({ version: VERSION, urls: [] }) },
    ingestionRepository: cancelled.ingestionRepository,
    nextAuthorityToken: () => "crawler-cancel-authority", now: () => 1_000,
    sleep: async (_milliseconds, signal) => { controller.abort(); if (signal.aborted) throw new CrawlerApiError("aborted"); },
  });
  await assert.rejects(cancelled.client.ingest(representation, "crawler-postgres-cancel", VERSION, { signal: controller.signal }),
    error => error instanceof CrawlerApiError && error.code === "aborted");
  assert.equal(cancelled.calls.revoke.length, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("malformed completed receipts fail closed without leaking database details", async () => {
  const malformed = fixture({ statuses: [{ state: "complete", result: { ...receipt(), private: "secret" } }] });
  await assert.rejects(malformed.client.ingest(representation, "crawler-postgres-malformed", VERSION), error => {
    assert.equal(error instanceof CrawlerApiError, true);
    assert.equal(error.code, "invalid-response");
    assert.equal(error.message.includes("secret"), false);
    return true;
  });
  assert.equal(malformed.calls.revoke.length, 1);

  const status = fixture({ statuses: [{ state: "pending", private: "secret" }] });
  await assert.rejects(status.client.ingest(representation, "crawler-postgres-status", VERSION), error => {
    assert.equal(error instanceof CrawlerApiError, true);
    assert.equal(error.code, "invalid-response");
    assert.equal(error.message.includes("secret"), false);
    return true;
  });
  assert.equal(status.calls.revoke.length, 1);
});

test("invalid crawler input and dependencies fail before PostgreSQL access", async () => {
  assert.throws(() => createPostgresCrawlerClient(), /Invalid PostgreSQL crawler dependencies/u);
  const f = fixture();
  await assert.rejects(f.client.ingest({ ...representation, embedding: { ...representation.embedding, values: Array(384).fill(1) } },
    "crawler-postgres-invalid", VERSION), /Invalid crawler ingestion/u);
  assert.equal(f.calls.enqueue.length, 0);
});

test('read retry diagnostics expose only fixed codes and numeric backoff without changing replay', async () => {
  const events = [];
  const f = fixture({ knownRead(_options, call) {
    if (call === 1) throw new CrawlerApiError('conflict');
    if (call === 2) throw Object.assign(new Error('PRIVATE DATABASE TEXT'), { code: 'storage-failure' });
    return { version: VERSION, urls: [] };
  } });
  await f.client.knownSourceUrls({ onProgress: event => events.push(event) });
  assert.deepEqual(events, [
    { event: 'read-retry', code: 'conflict', retry: 1, delayMs: 2000 },
    { event: 'read-retry', code: 'service-unavailable', retry: 2, delayMs: 4000 },
  ]);
  assert.equal(f.calls.enqueue.length, 0);
  const hostile = fixture({ versionRead(_options, call) {
    if (call === 1) throw new CrawlerApiError('unavailable'); return VERSION;
  } });
  assert.deepEqual(await hostile.client.version({ onProgress() { throw new Error('observer'); } }), VERSION);
});

test('durable terminal state diagnostics remain allowlisted and never replay a failed or cancelled job', async () => {
  for (const [state, terminalCode, wanted] of [
    ['cancelled', 'authority-expired', 'status-cancelled:authority-expired'],
    ['failed', 'representation-failed', 'status-failed:representation-failed'],
    ['failed', 'private-subject-123', 'status-failed:unknown'],
  ]) {
    const f = fixture({ statuses: [{ state, terminalCode }] });
    await assert.rejects(f.client.ingest(representation, 'diagnostic-terminal-operation', VERSION), error => {
      assert.equal(error.code, state === 'failed' ? 'service-error' : 'unavailable');
      assert.equal(error.detail, wanted);
      assert.equal(error.message.includes('private'), false);
      return true;
    });
    assert.equal(f.calls.enqueue.length, 1);
    assert.equal(f.calls.revoke.length, 1);
  }
  for (const [errorCode, detail] of [['not-found', 'status-missing'], ['storage-failure', 'status-read-failed']]) {
    const f = fixture({ statuses: [Object.assign(new Error('PRIVATE DETAIL'), { code: errorCode })] });
    await assert.rejects(f.client.ingest(representation, 'diagnostic-status-operation', VERSION), error => {
      assert.equal(error.detail, detail); return true;
    });
    assert.equal(f.calls.enqueue.length, 1);
  }
});

test('ingestion timeouts identify pending versus leased work without renewing or replaying after timeout', async () => {
  for (const state of ['pending', 'leased']) {
    const f = fixture({ statuses: [{ state }] });
    await assert.rejects(f.client.ingest(representation, 'diagnostic-timeout-operation', VERSION), error => {
      assert.equal(error.code, 'response-timeout'); assert.equal(error.detail, `timeout-${state}`); return true;
    });
    assert.equal(f.calls.enqueue.length, 1);
    assert.equal(f.calls.revoke.length, 1);
  }
});

function renewalRace({ renew = 'false', finalStatus = { state: 'complete', result: receipt() }, abortAt = null } = {}) {
  const controller = new AbortController(), calls = { enqueue: 0, status: 0, renew: 0, revoke: 0 };
  let clockCalls = 0;
  const client = createPostgresCrawlerClient({
    readClient: { version: async () => VERSION, knownSourceUrls: async () => ({ version: VERSION, urls: [] }) },
    ingestionRepository: {
      async enqueueCrawler(input, options) {
        calls.enqueue++;
        return { operationId: input.operationId, operationDigest: operationDigestFor(input), jobClass: 'crawler',
          state: 'pending', ordinal: 1, attempts: 0, replayed: false, sourceId: null, authorityToken: options.authorityToken };
      },
      async status() {
        calls.status++;
        if (abortAt === 'ordinary-status') { controller.abort(); return { state: 'complete', result: receipt() }; }
        if (calls.status === 1) return { state: 'leased' };
        if (abortAt === 'during-status') controller.abort();
        if (finalStatus instanceof Error) throw finalStatus;
        return finalStatus;
      },
      async renewAuthority() {
        calls.renew++;
        if (abortAt === 'before-status') controller.abort();
        if (renew === 'storage-failure') throw Object.assign(new Error('PRIVATE DATABASE DETAIL'), { code: 'storage-failure' });
        if (renew === 'forbidden') throw Object.assign(new Error('PRIVATE ROLE DETAIL'), { code: 'forbidden' });
        return false;
      },
      async revokeAuthority() { calls.revoke++; return true; },
    },
    now: () => clockCalls++ === 0 ? 1000 : 16000,
    sleep: async () => assert.fail('a rejected renewal must not poll or sleep again'),
    nextAuthorityToken: () => 'renewal-race-authority',
  });
  return { client, controller, calls };
}

test('completion racing a false or uncertain renewal resolves exactly one durable status without reenqueue/revoke', async () => {
  for (const renew of ['false', 'storage-failure']) {
    const f = renewalRace({ renew });
    assert.deepEqual(await f.client.ingest(representation, 'renewal-race-complete', VERSION,
      { signal: f.controller.signal }), receipt());
    assert.deepEqual(f.calls, { enqueue: 1, status: 2, renew: 1, revoke: 0 });
  }
});

test('final renewal status cannot accept live, terminal, malformed or foreign-generation receipts', async () => {
  for (const [finalStatus, wantedCode, detail] of [
    [{ state: 'leased' }, 'unavailable', 'renewal-rejected'],
    [{ state: 'pending' }, 'unavailable', 'renewal-rejected'],
    [{ state: 'cancelled', terminalCode: 'authority-revoked' }, 'unavailable', 'status-cancelled:authority-revoked'],
    [{ state: 'failed', terminalCode: 'worker-failed' }, 'service-error', 'status-failed:worker-failed'],
    [{ state: 'complete', result: { ...receipt(), private: 'PRIVATE MATERIAL' } }, 'invalid-response', undefined],
    [{ state: 'complete', result: receipt({ ...VERSION, generation: 'foreign-generation' }) }, 'invalid-response', undefined],
    [{ state: 'complete', result: receipt({ ...VERSION, revision: VERSION.revision - 1 }) }, 'invalid-response', undefined],
    [Object.assign(new Error('PRIVATE STATUS ERROR'), { code: 'storage-failure' }), 'unavailable', 'renewal-rejected'],
  ]) {
    const f = renewalRace({ finalStatus });
    await assert.rejects(f.client.ingest(representation, 'renewal-race-denied', VERSION), error => {
      assert.equal(error.code, wantedCode); assert.equal(error.detail, detail);
      assert.equal(error.message.includes('PRIVATE'), false); return true;
    });
    assert.deepEqual(f.calls, { enqueue: 1, status: 2, renew: 1, revoke: 1 });
  }
});

test('abort before or during renewal status resolution wins over an exact completed receipt', async () => {
  for (const abortAt of ['before-status', 'during-status']) {
    const f = renewalRace({ abortAt });
    await assert.rejects(f.client.ingest(representation, 'renewal-race-abort', VERSION,
      { signal: f.controller.signal }), error => error.code === 'aborted');
    assert.equal(f.calls.enqueue, 1); assert.equal(f.calls.revoke, 1);
    assert.equal(f.calls.status, abortAt === 'before-status' ? 1 : 2);
  }
  const forbidden = renewalRace({ renew: 'forbidden' });
  await assert.rejects(forbidden.client.ingest(representation, 'renewal-race-forbidden', VERSION),
    error => error.code === 'forbidden');
  assert.equal(forbidden.calls.status, 1, 'non-ambiguous authorization errors never trigger completion resolution');
  const ordinary = renewalRace({ abortAt: 'ordinary-status' });
  await assert.rejects(ordinary.client.ingest(representation, 'ordinary-status-abort', VERSION,
    { signal: ordinary.controller.signal }), error => error.code === 'aborted');
  assert.deepEqual(ordinary.calls, { enqueue: 1, status: 1, renew: 0, revoke: 1 });
});

function lateRenewalRace({ renewal = 'storage-failure', firstRecovery = { state: 'leased' },
  finalStatus = { state: 'complete', result: receipt() }, revoked = false,
  revokeThrows = false, abortAt = null, timeout = false } = {}) {
  const controller = new AbortController(), events = [], statusInputs = [];
  const calls = { enqueue: 0, status: 0, renew: 0, revoke: 0, version: 0 };
  let clockCalls = 0;
  const client = createPostgresCrawlerClient({
    readClient: {
      async version() { calls.version++; return VERSION; },
      async knownSourceUrls() { return { version: VERSION, urls: [] }; },
    },
    ingestionRepository: {
      async enqueueCrawler(input, options) {
        events.push('enqueue'); calls.enqueue++;
        return { operationId: input.operationId, operationDigest: operationDigestFor(input), jobClass: 'crawler',
          state: 'pending', ordinal: 1, attempts: 0, replayed: false, sourceId: null, authorityToken: options.authorityToken };
      },
      async status(input) {
        events.push(`status${++calls.status}`); statusInputs.push(structuredClone(input));
        if (calls.status === 1) return { state: 'leased' };
        const value = calls.status === 2 ? firstRecovery : finalStatus;
        if (abortAt === 'first-recovery' && calls.status === 2 || abortAt === 'final-read' && calls.status === 3)
          controller.abort();
        if (value instanceof Error) throw value;
        return structuredClone(value);
      },
      async renewAuthority() {
        events.push('renew'); calls.renew++;
        if (renewal === 'false') return false;
        throw Object.assign(new Error('PRIVATE RENEWAL DATABASE DETAIL'), { code: renewal });
      },
      async revokeAuthority() {
        events.push('revoke'); calls.revoke++;
        if (abortAt === 'revoke') controller.abort();
        if (revokeThrows) throw Object.assign(new Error('PRIVATE REVOKE DETAIL'), { code: 'storage-failure' });
        return revoked;
      },
    },
    now: () => clockCalls++ === 0 ? 1000 : timeout ? 31000 : 16000,
    sleep: async () => assert.fail('late recovery never polls, renews or sleeps again'),
    nextAuthorityToken: () => 'late-renewal-authority',
  });
  return { client, controller, events, calls, statusInputs };
}

test('late renewal completion after false or uncertain revoke consumes one exact receipt with no replay', async () => {
  for (const revokeThrows of [false, true]) {
    const f = lateRenewalRace({ revokeThrows });
    assert.deepEqual(await f.client.ingest(representation, 'late-renewal-operation', VERSION,
      { signal: f.controller.signal }), receipt());
    assert.deepEqual(f.events, ['enqueue', 'status1', 'renew', 'status2', 'revoke', 'status3']);
    assert.deepEqual(f.calls, { enqueue: 1, status: 3, renew: 1, revoke: 1, version: 0 });
    const expected = { operationId: 'late-renewal-operation', operationDigest: operationDigestFor(representation) };
    assert.deepEqual(f.statusInputs, [expected, expected, expected]);
  }
});

test('late recovery preserves original renewal error for every non-complete or invalid final proof', async () => {
  for (const finalStatus of [
    { state: 'pending' }, { state: 'leased' },
    { state: 'failed', terminalCode: 'worker-failed' },
    { state: 'cancelled', terminalCode: 'authority-revoked' },
    { state: 'complete', result: { ...receipt(), private: 'PRIVATE MATERIAL' } },
    { state: 'complete', result: receipt({ ...VERSION, generation: 'different-generation' }) },
    { state: 'complete', result: receipt({ ...VERSION, revision: VERSION.revision - 1 }) },
    { state: 'unknown' },
    Object.assign(new Error('PRIVATE STATUS DETAIL'), { code: 'storage-failure' }),
    Object.assign(new Error('PRIVATE NOT FOUND'), { code: 'not-found' }),
  ]) {
    const f = lateRenewalRace({ finalStatus });
    await assert.rejects(f.client.ingest(representation, 'late-renewal-denied', VERSION), error => {
      assert.equal(error.code, 'service-unavailable'); assert.equal(error.detail, 'renewal-error');
      assert.equal(error.message.includes('PRIVATE'), false); return true;
    });
    assert.deepEqual(f.calls, { enqueue: 1, status: 3, renew: 1, revoke: 1, version: 0 });
  }
});

test('definite revoke, malformed revoke and already-terminal first proof never seek contradictory late completion', async () => {
  for (const revoked of [true, null, 'false', {}]) {
    const f = lateRenewalRace({ revoked });
    await assert.rejects(f.client.ingest(representation, 'late-renewal-revoked', VERSION),
      error => error.code === 'service-unavailable' && error.detail === 'renewal-error');
    assert.equal(f.calls.status, 2); assert.equal(f.calls.revoke, 1);
  }
  for (const firstRecovery of [
    { state: 'cancelled', terminalCode: 'authority-revoked' },
    { state: 'failed', terminalCode: 'worker-failed' },
    { state: 'complete', result: receipt({ ...VERSION, generation: 'different-generation' }) },
  ]) {
    const f = lateRenewalRace({ firstRecovery });
    await assert.rejects(f.client.ingest(representation, 'late-renewal-first-denied', VERSION),
      error => error.detail?.startsWith('status-') || error.code === 'invalid-response');
    assert.equal(f.calls.status, 2); assert.equal(f.calls.revoke, 1);
  }
});

test('abort wins before revoke completion and during the one final receipt read', async () => {
  for (const abortAt of ['first-recovery', 'revoke', 'final-read']) {
    const f = lateRenewalRace({ abortAt });
    await assert.rejects(f.client.ingest(representation, 'late-renewal-aborted', VERSION,
      { signal: f.controller.signal }), error => error.code === 'aborted');
    assert.equal(f.calls.status, abortAt === 'final-read' ? 3 : 2);
    assert.equal(f.calls.revoke, 1); assert.equal(f.calls.enqueue, 1); assert.equal(f.calls.renew, 1);
  }
});

test('first recovery completion retains old no-revoke path; false or definite renewal errors do not gain new reads', async () => {
  const complete = lateRenewalRace({ firstRecovery: { state: 'complete', result: receipt() } });
  assert.deepEqual(await complete.client.ingest(representation, 'late-renewal-early', VERSION), receipt());
  assert.equal(complete.calls.status, 2); assert.equal(complete.calls.revoke, 0);
  for (const renewal of ['false', 'forbidden', 'storage-corrupt', 'conflict']) {
    const f = lateRenewalRace({ renewal });
    await assert.rejects(f.client.ingest(representation, 'late-renewal-not-ambiguous', VERSION));
    assert.equal(f.calls.status, renewal === 'false' ? 2 : 1); assert.equal(f.calls.revoke, 1);
  }
  const timeout = lateRenewalRace({ timeout: true });
  await assert.rejects(timeout.client.ingest(representation, 'late-renewal-timeout-unchanged', VERSION),
    error => error.code === 'response-timeout' && error.detail === 'timeout-leased');
  assert.equal(timeout.calls.status, 1); assert.equal(timeout.calls.renew, 0); assert.equal(timeout.calls.revoke, 1);
});
