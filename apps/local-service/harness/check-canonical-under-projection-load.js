// Run with: node harness/check-canonical-under-projection-load.js
// This process and its workers permit only synthetic127.0.0.1:4175 traffic.
import './concurrency-only-capabilities.js';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { createSqliteDemoService } from '../src/application/create-sqlite-demo-service.js';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { BROWSER_MODEL_ID } from '../src/domain/learned-sources.js';
import { ADAPTIVE_TOPIC_POLICY } from '../src/domain/adaptive-topics.js';
import { operationDigestFor } from '../src/domain/source-threads.js';
import { makeRidgeTopicAdapter } from '../src/domain/ridge-topic-adapter.js';
import { createRequestHandler } from '../src/http/request-handler.js';
import { createLoopbackServer } from '../src/http/loopback-listener.js';

const PORT = 4175, FIXTURE_PAGES = 2000, SELECTED_SOURCES = 8;
const stamp = '2026-10-13T12:00:00Z';
const origin = `chrome-extension://${'a'.repeat(32)}`;
const token = 'synthetic-projection-load-capability';
const guardPath = new URL('./concurrency-only-capabilities.js', import.meta.url).href;
function bounded(promise, ms, explanation) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(explanation)), ms); })])
    .finally(() => clearTimeout(timer));
}

export async function checkCanonicalUnderProjectionLoad() {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-core-projection-load-'));
  const databasePath = path.join(directory, 'canonical.sqlite');
  const config = { hostHeader: `127.0.0.1:${PORT}`, origin, capability: token };
  const gate = new Int32Array(new SharedArrayBuffer(8));
  const sockets = [], coreTasks = [], projectionTasks = [], observations = [];
  const pendingHeld = [], heldWaiters = [], pendingCoreDispatch = [];
  let serial = 0, application, server, coreDispatchHeld = false, clientActive = 0, peakClients = 0;
  let terminatedProjectionWorkers = 0;
  const nextId = kind => `${kind}-projection-load-${++serial}`;
  const execArgv = [...process.execArgv.filter(argument => !argument.startsWith('--test')), '--import', guardPath];
  const weights = Array(384 * 384).fill(0);
  for (let i = 0; i < 384; i++) weights[i * 384 + i] = 1;
  const alternateRidgeAdapter = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
  const state = createDemoState({ generation: 'synthetic-projection-load', createdAt: stamp, sources: [], topicSeeds: [] });
  state.topics = Array.from({ length: FIXTURE_PAGES }, (_, i) => ({ id: `topic-${i}`, title: 'Synthetic Topic',
    kind: 'general', createdAt: stamp, provenance: 'owner-local-learned-topic/v1', retainTight: false }));
  state.discussions = state.topics.map(topic => ({ id: `discussion-${topic.id}`, topicId: topic.id }));
  state.sources = state.topics.map((topic, i) => {
    const value = { id: `source-${i}`, url: `https://example.org/projection-load/${i}`, title: 'Synthetic article',
      embedding: { modelId: BROWSER_MODEL_ID, values: Array.from({ length: 384 }, (_, axis) => axis === i % 384 ? 1 : 0) },
      extractorVersion: 'crawler-static-html-prefix/v1', provenance: 'owner-local-page-embedding/v1',
      operationId: `operation-${i}`, policyVersion: ADAPTIVE_TOPIC_POLICY.version };
    return { ...value, operationDigest: operationDigestFor(value) };
  });
  state.sourceLinks = state.sources.map((source, i) => ({ sourceId: source.id, topicId: state.topics[i].id, method: 'learned-provisional' }));
  const repository = createNormalizedSqliteRepository(databasePath, state); repository.close();

  function report(value) { observations.push(value); process.stdout.write(`${JSON.stringify(value)}\n`); }
  function holdProjection() { pendingHeld.length = 0; Atomics.store(gate, 0, 0); Atomics.store(gate, 1, 1); }
  function releaseProjection() { Atomics.store(gate, 1, 0); Atomics.store(gate, 0, 1); Atomics.notify(gate, 0); }
  function nextHeld() {
    return pendingHeld.length ? Promise.resolve(pendingHeld.shift()) : new Promise(resolve => heldWaiters.push(resolve));
  }
  function workerFactory(projection) {
    return () => {
      const real = new Worker(new URL(projection ? './fixtures/held-projection-read-worker.js' : '../src/application/canonical-read-worker.js', import.meta.url), {
        workerData: { databasePath, alternateRidgeAdapter: projection ? alternateRidgeAdapter : null,
          alternateAdapter: null, alternateBodyMetric: null, syntheticProjectionGate: gate.buffer,
          allowedMethods: projection ? ['enrichment', 'related', 'priorDiscussions', 'alternateDiscussion'] :
            ['catalog', 'catalogContext', 'catalogPage', 'discussion', 'discussionPage', 'exactSource'] },
        execArgv, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
      const bridge = new EventEmitter();
      bridge.postMessage = value => {
        (projection ? projectionTasks : coreTasks).push(value.input);
        if (!projection && coreDispatchHeld) pendingCoreDispatch.push(() => real.postMessage(value));
        else real.postMessage(value);
      };
      bridge.terminate = async () => { const result = await real.terminate(); if (projection) terminatedProjectionWorkers++; return result; };
      real.on('message', message => {
        if (message.syntheticProjectionHeld) {
          const marker = { id: message.id, heldAt: performance.now() };
          if (heldWaiters.length) heldWaiters.shift()(marker); else pendingHeld.push(marker);
        } else bridge.emit('message', message);
      });
      real.on('error', error => { report({ phase: 'synthetic-worker-error', lane: projection ? 'projection' : 'core', code: error.code ?? error.name }); bridge.emit('error', error); });
      real.on('exit', code => bridge.emit('exit', code));
      return bridge;
    };
  }
  function request(route, body, { connection, signal, deadlineMs } = {}) {
    const began = performance.now(), bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
    peakClients = Math.max(peakClients, ++clientActive);
    const projection = route === '/v1/related' || /alternate-discussion|prior-discussions|enrichment/u.test(route);
    return new Promise((resolve, reject) => {
      const outgoing = http.request({ host: '127.0.0.1', port: PORT, path: route, method: bytes ? 'POST' : 'GET',
        agent: connection ? undefined : false, ...(connection ? { createConnection: () => connection } : {}), signal,
        headers: { host: config.hostHeader, authorization: `Bearer ${token}`, origin,
          ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}) } }, incoming => {
        const chunks = []; let size = 0;
        incoming.on('data', chunk => { size += chunk.length; if (size > 1048576) outgoing.destroy(new Error('Response bound')); else chunks.push(chunk); });
        incoming.on('error', reject);
        incoming.on('end', () => resolve({ status: incoming.statusCode, elapsedMs: performance.now() - began,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      });
      outgoing.setTimeout(deadlineMs ?? (projection || route === '/v1/sources/ingest' ? 30000 : 5000),
        () => outgoing.destroy(new Error('Synthetic request deadline')));
      outgoing.on('error', reject); outgoing.end(bytes);
    }).finally(() => { clientActive--; });
  }
  async function connections(count) {
    const prepared = [];
    for (let offset = 0; offset < count; offset += 16) await Promise.all(Array.from({ length: Math.min(16, count - offset) }, () =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port: PORT });
        sockets.push(socket); prepared.push(socket); socket.on('error', () => {});
        socket.once('error', reject); socket.once('connect', resolve);
      })));
    return prepared;
  }
  async function coreWave(label, count, version) {
    const previous = coreTasks.length, began = performance.now(), prepared = await connections(count);
    const setupMs = performance.now() - began, users = new Set();
    const responses = await Promise.all(prepared.map(async (connection, i) => {
      users.add(`synthetic-reader-${i}`);
      const selected = Math.floor(i / 4) % SELECTED_SOURCES, sourceId = `source-${selected}`, topicId = `topic-${selected}`;
      const choices = [['health', '/v1/health'], ['version', '/v1/version'],
        ['context', '/v1/catalog/context', { sourceId, topicId }], ['discussion', `/v1/topics/${topicId}/discussion`]];
      const [kind, route, body] = choices[i % choices.length];
      const result = await request(route, body, { connection });
      assert.equal(result.status, 200, `${label}/${kind}`);
      assert.ok(result.elapsedMs + setupMs < 5000, `${label}/${kind} absolute accept window`);
      if (kind !== 'health') assert.deepEqual(result.body.version, version);
      if (kind === 'context') {
        assert.equal(result.body.sources.find(value => value.id === sourceId)?.topicId, topicId);
        assert.ok(result.body.topics.some(value => value.id === topicId));
      }
      if (kind === 'discussion') assert.ok(result.body.roots.some(value => value.body === `Synthetic core thread ${selected}`));
      return result;
    }));
    assert.equal(users.size, count);
    assert.ok(coreTasks.length - previous <= SELECTED_SOURCES * 2, 'core duplicates coalesce within distinct-task budget');
    report({ phase: label, uniqueSyntheticReaders: users.size, selectedSources: SELECTED_SOURCES,
      accepted: responses.length, setupMs: Math.round(setupMs), maxRequestMs: Math.round(Math.max(...responses.map(value => value.elapsedMs))),
      coreWorkerTasks: coreTasks.length - previous });
  }

  try {
    application = createSqliteDemoService({ databasePath, storageMode: 'normalized', asyncReads: true, asyncIngest: true,
      alternateRidgeAdapter, nextId, now: () => stamp,
      readWorkerOptions: { workerFactory: workerFactory(false) }, projectionWorkerOptions: { workerFactory: workerFactory(true) } });
    for (let i = 0; i < SELECTED_SOURCES; i++) application.service.command(application.service.version(), {
      type: 'create-root', topicId: `topic-${i}`, originSourceId: `source-${i}`, body: `Synthetic core thread ${i}` }, 'demo-alex');
    server = createLoopbackServer({ handle: createRequestHandler({ service: application.service, config }) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: PORT, exclusive: true, backlog: 4096 }, resolve); });
    assert.equal((await request('/v1/catalog/context', { sourceId: null, topicId: null })).status, 200);
    const version = application.service.version();

    holdProjection();
    let optionalFinished = false;
    const optional = request('/v1/sources/enrichment', { sourceId: 'source-0', topicId: 'topic-0', includeAlternate: true }).finally(() => { optionalFinished = true; });
    optional.catch(() => {});
    await bounded(nextHeld(), 5000, 'Real projection did not reach synthetic hold');
    await coreWave('500-core-readers-during-held-projection', 500, version);
    await coreWave('2000-core-readers-during-held-projection', 2000, version);
    assert.equal(optionalFinished, false, 'core waves finish before held optional result');
    const result = await optional;
    assert.equal(result.status, 200); assert.deepEqual(result.body.catalog.version, version);
    for (const value of [result.body.discussion, result.body.related, result.body.priorDiscussions, result.body.alternateDiscussion])
      if (value) assert.deepEqual(value.version, version);
    assert.ok(result.body.alternateDiscussion.sourceIds.includes('source-0'));
    assert.ok(result.elapsedMs > 8000 && result.elapsedMs < 30000);
    report({ phase: 'slow-projection-success', projectionMs: Math.round(result.elapsedMs), version: 'exact-current', coreIndependent: true });

    holdProjection(); optionalFinished = false;
    const stale = request('/v1/sources/enrichment', { sourceId: 'source-1', topicId: 'topic-1', includeAlternate: true }).finally(() => { optionalFinished = true; });
    stale.catch(() => {}); await bounded(nextHeld(), 5000, 'Stale projection did not reach hold');
    const ingestion = await request('/v1/sources/ingest', { expected: version, operationId: 'operation-concurrent-projection',
      url: 'https://example.org/projection-load/accepted', title: 'Synthetic accepted page',
      extractorVersion: 'crawler-static-html-prefix/v1', embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] } });
    assert.equal(ingestion.status, 200);
    assert.equal(optionalFinished, false, 'ingestion must commit without waiting for projection');
    assert.deepEqual(ingestion.body.version, { ...version, revision: version.revision + 1 });
    const old = await stale;
    assert.equal(old.status, 409, 'stale projection cannot relabel old content with current version');
    assert.equal(Object.hasOwn(old.body, 'version'), false); assert.equal(Object.hasOwn(old.body, 'sourceIds'), false);
    releaseProjection();
    const fresh = await request('/v1/sources/enrichment', { sourceId: ingestion.body.sourceId, topicId: ingestion.body.topicId, includeAlternate: true });
    assert.equal(fresh.status, 200); assert.deepEqual(fresh.body.catalog.version, ingestion.body.version);
    assert.ok(fresh.body.alternateDiscussion.sourceIds.includes(ingestion.body.sourceId));
    report({ phase: 'projection-does-not-barrier-ingestion', ingestionMs: Math.round(ingestion.elapsedMs),
      staleStatus: old.status, freshStatus: fresh.status, acceptedRevision: ingestion.body.version.revision });

    holdProjection();
    const controller = new AbortController(), previousTerminations = terminatedProjectionWorkers;
    const cancelled = request('/v1/sources/enrichment', { sourceId: 'source-2', topicId: 'topic-2', includeAlternate: true }, { signal: controller.signal });
    const rejected = assert.rejects(cancelled, error => error.name === 'AbortError' || error.code === 'ABORT_ERR');
    await bounded(nextHeld(), 5000, 'Cancelled projection did not reach hold');
    controller.abort(); await rejected;
    await coreWave('500-core-readers-after-optional-abandonment', 500, ingestion.body.version);
    assert.ok(terminatedProjectionWorkers > previousTerminations, 'abandoned optional worker terminates independently');
    releaseProjection();
    report({ phase: 'projection-cancellation-core-available', terminatedProjectionWorkers });

    holdProjection();
    let observeOverflow;
    const overflowed = new Promise(resolve => { observeOverflow = resolve; });
    const overloaded = Promise.all(Array.from({ length: 24 }, (_, i) => request('/v1/sources/enrichment', {
      sourceId: `source-${100 + i}`, topicId: `topic-${100 + i}`, includeAlternate: true })
      .then(value => { if (value.status === 413) observeOverflow(); return value; })));
    overloaded.catch(() => {});
    await bounded(overflowed, 5000, 'Distinct projection overflow was not bounded');
    const core = await Promise.all([request('/v1/health'), request('/v1/version'),
      request('/v1/catalog/context', { sourceId: 'source-0', topicId: 'topic-0' }), request('/v1/topics/topic-0/discussion')]);
    assert.ok(core.every(value => value.status === 200 && value.elapsedMs < 5000));
    releaseProjection();
    const limited = await overloaded;
    assert.ok(limited.some(value => value.status === 413)); assert.ok(limited.every(value => [200, 413].includes(value.status)));
    report({ phase: 'distinct-projection-overload', requested: limited.length, taskBudget: 8,
      accepted: limited.filter(value => value.status === 200).length, boundedCapacity: limited.filter(value => value.status === 413).length,
      coreStatuses: core.map(value => value.status) });

    coreDispatchHeld = true;
    let coreOverflow;
    const capacity = new Promise(resolve => { coreOverflow = resolve; });
    const distinct = Promise.all(Array.from({ length: 64 }, (_, i) => request('/v1/catalog/context', {
      sourceId: `source-${300 + i}`, topicId: `topic-${300 + i}` }).then(value => { if (value.status === 413) coreOverflow(); return value; })));
    distinct.catch(() => {});
    try {
      await bounded(capacity, 4000, 'Distinct core overflow was not bounded');
      const live = await Promise.all([request('/v1/health'), request('/v1/version')]);
      assert.ok(live.every(value => value.status === 200 && value.elapsedMs < 5000));
    } finally {
      coreDispatchHeld = false;
      for (const dispatch of pendingCoreDispatch.splice(0)) dispatch();
    }
    const distinctResults = await distinct;
    assert.ok(distinctResults.some(value => value.status === 413));
    assert.ok(distinctResults.every(value => [200, 413].includes(value.status)));
    report({ phase: 'distinct-core-overload', requested: distinctResults.length, taskBudget: 32,
      accepted: distinctResults.filter(value => value.status === 200).length,
      boundedCapacity: distinctResults.filter(value => value.status === 413).length });
    report({ phase: 'complete', fixtureSources: FIXTURE_PAGES, peakSimultaneousClients: peakClients,
      ordinaryDeadlineMs: 5000, projectionDeadlineMs: 30000, ownerPortUsed: false, providerCalls: 0 });
    return observations;
  } finally {
    releaseProjection(); coreDispatchHeld = false;
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await application?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkCanonicalUnderProjectionLoad();
