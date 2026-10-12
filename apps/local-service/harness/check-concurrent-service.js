// Synthetic fixed-loopback load check. Never opens owner files or calls a provider.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { Worker } from "node:worker_threads";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { BROWSER_MODEL_ID } from "../src/domain/learned-sources.js";
import { ADAPTIVE_TOPIC_POLICY } from "../src/domain/adaptive-topics.js";
import { operationDigestFor } from "../src/domain/source-threads.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { createLoopbackServer } from "../src/http/loopback-listener.js";
import { makeRidgeTopicAdapter, RIDGE_TOPIC_SCHEMA } from "../src/domain/ridge-topic-adapter.js";

const directory = mkdtempSync(path.join(tmpdir(), "murmingle-concurrent-synthetic-"));
const databasePath = path.join(directory, "canonical.sqlite");
const origin = `chrome-extension://${"a".repeat(32)}`;
const token = "synthetic-concurrency-capability";
const config = { hostHeader: "127.0.0.1:4175", origin, capability: token };
const stamp = "2026-10-12T12:00:00Z";
let serial = 0, application, listener;
const sockets = [];
const FIXTURE_PAGES = 2000;
const CONCURRENT_READS = 2000;
const SELECTED_SOURCES = 8;
const weights = Array(384 * 384).fill(0);
for (let axis = 0; axis < 384; axis++) weights[axis * 384 + axis] = 1;
const alternateRidgeAdapter = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
const nextId = kind => `${kind}-synthetic-${++serial}`;
const state = createDemoState({ generation: "synthetic-concurrency", createdAt: stamp, sources: [], topicSeeds: [] });
state.topics = Array.from({ length: FIXTURE_PAGES }, (_, index) => ({ id: `topic-${index}`, title: "Synthetic topic", kind: "general",
  createdAt: stamp, provenance: "owner-local-learned-topic/v1", retainTight: false }));
state.discussions = state.topics.map(topic => ({ id: `discussion-${topic.id}`, topicId: topic.id }));
state.sources = state.topics.map((topic, index) => {
  const source = { id: `source-${index}`, url: `https://example.org/synthetic/${index}`, title: "Synthetic page",
    embedding: { modelId: BROWSER_MODEL_ID, values: Array.from({ length: 384 }, (_, axis) => axis === index % 384 ? 1 : 0) },
    extractorVersion: "crawler-static-html-prefix/v1", provenance: "owner-local-page-embedding/v1",
    operationId: `operation-${index}`, policyVersion: ADAPTIVE_TOPIC_POLICY.version };
  return { ...source, operationDigest: operationDigestFor(source) };
});
state.sourceLinks = state.sources.map((source, index) => ({ sourceId: source.id, topicId: state.topics[index].id, method: "learned-provisional" }));
const repository = createNormalizedSqliteRepository(databasePath, state); repository.close();
const gate = new Int32Array(new SharedArrayBuffer(4));
let started;
const workerStarted = new Promise(resolve => { started = resolve; });
let clientPeak = 0, clientActive = 0;
const readJobs = [];
let readJobsCompleted = 0;
let observeReadStarted = null;
let observeIngestionPrepared = null;
let observePublicAdmission = null;
let holdReadDispatch = false;
const heldReadMessages = [];
function request(route, body, extraHeaders = {}, connection) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
    clientPeak = Math.max(clientPeak, ++clientActive);
    const outgoing = http.request({ host: "127.0.0.1", port: 4175, path: route, method: bytes ? "POST" : "GET", agent: connection ? undefined : false,
      ...(connection ? { createConnection: () => connection } : {}),
      headers: { authorization: `Bearer ${token}`, host: config.hostHeader, ...extraHeaders,
        ...(bytes ? { "content-type": "application/json", "content-length": bytes.length } : {}) } }, incoming => {
      let size = 0; const chunks = [];
      incoming.on("data", chunk => { size += chunk.length; if (size > 1_048_576) outgoing.destroy(new Error("Response bound")); else chunks.push(chunk); });
      incoming.on("error", reject);
      incoming.on("end", () => resolve({ status: incoming.statusCode, elapsedMs: performance.now() - start,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    outgoing.setTimeout(route === "/v1/sources/ingest" ? 30_000 : 5_000, () => outgoing.destroy(new Error("Synthetic request timed out")));
    outgoing.on("error", reject);
    outgoing.end(bytes);
  }).finally(() => { clientActive--; });
}
try {
  application = createSqliteDemoService({ databasePath, asyncIngest: true, asyncReads: true, alternateRidgeAdapter,
    storageMode: "normalized", nextId, now: () => stamp,
    readWorkerOptions: { workerFactory() {
      const real = new Worker(new URL("../src/application/canonical-read-worker.js", import.meta.url), {
        workerData: { databasePath, alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter },
        execArgv: process.execArgv.filter(argument => !argument.startsWith("--test")),
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
      const bridge = new EventEmitter();
      bridge.postMessage = value => {
        readJobs.push(value.input);
        observeReadStarted?.(value.input);
        if (holdReadDispatch) heldReadMessages.push(() => real.postMessage(value));
        else real.postMessage(value);
      };
      bridge.terminate = () => real.terminate();
      real.on("message", message => { readJobsCompleted++; bridge.emit("message", message); });
      real.on("error", error => bridge.emit("error", error));
      real.on("exit", code => bridge.emit("exit", code));
      return bridge;
    } },
    ingestionWorkerOptions: { workerFactory() {
      const real = new Worker(new URL("./fixtures/held-public-load-ingestion-worker.js", import.meta.url), {
        workerData: { databasePath, gate: gate.buffer }, execArgv: process.execArgv,
      });
      const bridge = new EventEmitter();
      bridge.postMessage = value => real.postMessage(value);
      bridge.terminate = () => real.terminate();
      real.on("message", message => {
        if (message.started) { started(); observeIngestionPrepared?.(message); }
        else bridge.emit("message", message);
      });
      real.on("error", error => bridge.emit("error", error));
      real.on("exit", code => bridge.emit("exit", code));
      return bridge;
    } } });
  const normalHandle = createRequestHandler({ service: application.service, config });
  const server = createLoopbackServer({ handle(request, transport) {
    const pending = normalHandle(request, transport);
    // Synthetic observation runs after the real handler synchronously validates
    // and admits the request. It never bypasses the production read executor.
    if (request.url !== "/v1/sources/ingest" && request.url !== "/v1/commands") observePublicAdmission?.();
    return pending;
  } });
  await new Promise((resolve, reject) => {
    server.once("error", reject); server.listen({ host: "127.0.0.1", port: 4175, exclusive: true, backlog: 4096 }, resolve);
  });
  listener = { close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
  assert.equal((await request("/v1/health")).status, 200);
  process.stdout.write("Synthetic listener ready.\n");
  const expected = application.service.version();
  const ingestion = request("/v1/sources/ingest", { expected, operationId: "operation-background", title: "Synthetic background page",
    url: "https://example.org/synthetic/background", embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] },
    extractorVersion: "crawler-static-html-prefix/v1" });
  ingestion.catch(() => {}); // Cleanup may disconnect the pending synthetic request after a failed assertion.
  await Promise.race([workerStarted, ingestion.then(result => {
    throw new Error(`Synthetic ingestion ended before preparing a plan (${result.status})`);
  })]);
  process.stdout.write("Synthetic worker prepared; starting concurrent reads.\n");
  let serverPeak = 0, serverActive = 0;
  server.on("connection", socket => {
    serverPeak = Math.max(serverPeak, ++serverActive);
    socket.once("close", () => { serverActive--; });
  });
  // Establish sockets in batches so the client's own synchronous 2000-SYN burst
  // does not exhaust the Windows listen backlog. Requests are released together
  // AFTER all 2000 connections exist: this is request concurrency, not batching.
  async function prepareConnections() {
    const prepared = [];
    try { for (let batch = 0; batch < CONCURRENT_READS / 16; batch++) { await Promise.all(Array.from({ length: 16 }, () => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 4175 });
    sockets.push(socket); prepared.push(socket); socket.on("error", () => {}); socket.once("error", reject); socket.once("connect", resolve);
  }))); } } catch (error) {
    process.stderr.write(JSON.stringify({ phase: "connection-setup", attempted: sockets.length, serverPeak,
      listening: server.listening, socketLimit: server.maxConnections }) + "\n");
    throw error;
  }
    return prepared;
  }
  async function readWave(label, version) {
    const connectionStart = performance.now();
    const connections = await prepareConnections();
    const waveStart = performance.now();
    process.stdout.write(JSON.stringify({ phase: label, preparedConnections: connections.length,
      connectionSetupMs: Math.round(waveStart - connectionStart), serverPeak }) + "\n");
    const previousJobs = readJobs.length;
    const previousCompletedJobs = readJobsCompleted;
    const completedByKind = {};
    let firstFailureReported = false, maxHealthMs = 0;
    const reads = await Promise.all(Array.from({ length: CONCURRENT_READS }, async (_, index) => {
      const selected = Math.floor(index / 8) % SELECTED_SOURCES;
      const sourceId = `source-${selected}`, topicId = `topic-${selected}`;
      const routes = [
        ["health", "/v1/health"], ["version", "/v1/version"],
        ["context", "/v1/catalog/context", { sourceId, topicId }],
        ["discussion", "/v1/topics/topic-0/discussion"],
        ["related", "/v1/related", { sourceId, limit: 20 }],
        ["alternate", `/v1/sources/${sourceId}/alternate-discussion`],
        ["prior", "/v1/sources/source-0/prior-discussions"],
        ["catalog-page", "/v1/catalog/page", { kind: "sources", limit: 1, cursor: null }],
      ];
      const [kind, route, body] = routes[index % routes.length];
      let result;
      try { result = await request(route, body, {}, connections[index]); }
      catch (error) {
        if (!firstFailureReported) {
          firstFailureReported = true;
          process.stderr.write(JSON.stringify({ phase: label, kind, selectedSource: selected,
            elapsedMs: Math.round(performance.now() - waveStart), failure: error.code ?? "request-failed",
            completedByKind, maxHealthMs: Math.round(maxHealthMs),
            workerTasksDispatched: readJobs.length - previousJobs,
            workerTasksCompleted: readJobsCompleted - previousCompletedJobs }) + "\n");
        }
        throw error;
      }
      completedByKind[kind] = (completedByKind[kind] ?? 0) + 1;
      if (kind === "health") maxHealthMs = Math.max(maxHealthMs, result.elapsedMs);
      assert.equal(result.status, 200, `${label}/${kind} returns a complete read`);
      assert.ok(result.elapsedMs < 5_000, `${label}/${kind} stays within unchanged five-second reads`);
      if (kind !== "health") assert.deepEqual(result.body.version ?? result.body.catalog?.version, version);
      if (kind === "context") {
        assert.equal(result.body.sources.find(source => source.id === sourceId)?.topicId, topicId);
        assert.ok(result.body.topics.some(topic => topic.id === topicId));
      }
      if (kind === "alternate") {
        assert.equal(result.body.representation, RIDGE_TOPIC_SCHEMA);
        assert.equal(result.body.sourceId, sourceId);
        assert.ok(result.body.sourceIds.includes(sourceId));
      }
      return { ...result, kind };
    }));
    const durations = reads.map(result => result.elapsedMs).sort((a, b) => a - b);
    const health = reads.filter(result => result.kind === "health").map(result => result.elapsedMs).sort((a, b) => a - b);
    const workerTasks = readJobs.length - previousJobs;
    // Eight selected contexts/related/alternate keys, plus one discussion/prior/page.
    // The normal32 task cap applies; this workload must actually coalesce duplicates.
    assert.ok(workerTasks < CONCURRENT_READS / 2, `${label} coalesces repeated public reads`);
    process.stdout.write(JSON.stringify({ phase: label, fixturePages: FIXTURE_PAGES, selectedSources: SELECTED_SOURCES,
      concurrentReads: CONCURRENT_READS, clientPeak, acceptedReads: reads.length,
      elapsedMs: Math.round(performance.now() - waveStart), p50Ms: Math.round(durations[1000]),
      p95Ms: Math.round(durations[1900]), maxMs: Math.round(durations.at(-1)),
      healthP95Ms: Math.round(health[Math.floor(health.length * .95)]), healthMaxMs: Math.round(health.at(-1)),
      ridgeRepresentation: RIDGE_TOPIC_SCHEMA, workerTasks }) + "\n");
    return reads;
  }
  const start = performance.now();
  const reads = await readWave("cold-learned-ridge", expected);
  await readWave("warm-coalesced-learned-ridge", expected);
  assert.equal(Atomics.load(gate, 0), 0, "all read requests finish while ingestion is still held");
  const comment = await request("/v1/commands", { expected, command: { type: "create-root", topicId: "topic-0",
    originSourceId: "source-0", body: "Concurrent synthetic comment remains" } }, { "x-demo-actor": "demo-alex" });
  assert.equal(comment.status, 200);
  Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
  const stale = await ingestion;
  assert.equal(stale.status, 409, "concurrently accepted comment makes plan stale without overwrite");
  assert.equal(application.service.version().revision, comment.body.version.revision);
  assert.equal(application.service.discussion("topic-0").roots[0].body, "Concurrent synthetic comment remains");
  // Prepare the second REAL plan first and hold it at the synthetic gate. Its
  // preparation is faster/slower than Ridge depending on hardware, so releasing
  // an exact marker during the observed read batch makes overlap deterministic.
  Atomics.store(gate, 0, 0);
  let markIngestionPrepared;
  const exactIngestionPrepared = new Promise(resolve => { markIngestionPrepared = resolve; });
  observeIngestionPrepared = message => {
    if (message.operationId === "operation-concurrently-accepted") markIngestionPrepared();
  };
  const acceptedIngestion = request("/v1/sources/ingest", { expected: comment.body.version,
    operationId: "operation-concurrently-accepted", title: "Synthetic accepted concurrent page",
    url: "https://example.org/synthetic/concurrently-accepted",
    embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] },
    extractorVersion: "crawler-static-html-prefix/v1" });
  acceptedIngestion.catch(() => {});
  await Promise.race([exactIngestionPrepared, acceptedIngestion.then(() => {
    throw new Error("Concurrent ingestion ended before its exact prepared marker");
  })]);
  observeIngestionPrepared = null;
  let markReadStarted;
  const coldReadStarted = new Promise(resolve => { markReadStarted = resolve; });
  let readStartedAt = null;
  observeReadStarted = task => {
    if (task.method !== "catalogContext") return;
    readStartedAt = performance.now(); observeReadStarted = null; markReadStarted();
  };
  let coldWaveFinished = false, publicAdmissions = 0, markAllAdmitted;
  const allReadsAdmitted = new Promise(resolve => { markAllAdmitted = resolve; });
  observePublicAdmission = () => { if (++publicAdmissions === CONCURRENT_READS) markAllAdmitted(); };
  const coldWave = readWave("cold-after-comment-with-accepted-ingest", comment.body.version)
    .then(value => { coldWaveFinished = true; return value; });
  coldWave.catch(() => {});
  await Promise.race([Promise.all([coldReadStarted, allReadsAdmitted]), coldWave.then(() => {
    throw new Error("Cold wave ended before observed read admission and selected worker dispatch");
  })]);
  observePublicAdmission = null;
  const releasedDuringRead = !coldWaveFinished;
  const unfinishedJobsAtRelease = readJobs.length - readJobsCompleted;
  assert.equal(publicAdmissions, CONCURRENT_READS);
  assert.ok(releasedDuringRead && unfinishedJobsAtRelease > 0, "prepared write is released during a fully admitted active read batch");
  Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
  const [refreshed, accepted] = await Promise.all([coldWave, acceptedIngestion]);
  observeIngestionPrepared = null;
  assert.ok(readStartedAt !== null, "real selected-context worker started before concurrent ingestion");
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body.version, { ...comment.body.version, revision: comment.body.version.revision + 1 });
  assert.equal(application.service.exactSource(accepted.body.sourceId).url, "https://example.org/synthetic/concurrently-accepted");
  assert.deepEqual(application.service.version(), accepted.body.version);
  process.stdout.write(JSON.stringify({ phase: "concurrent-accepted-ingestion", acceptedReads: refreshed.length,
    oldRevision: comment.body.version.revision, acceptedRevision: accepted.body.version.revision,
    ingestionMs: Math.round(accepted.elapsedMs), publicAdmissions, releasedDuringRead, unfinishedWorkerJobsAtRelease: unfinishedJobsAtRelease,
    newSource: "visible", ingestion: "accepted-after-read-batch" }) + "\n");
  assert.ok(refreshed.filter(result => result.kind === "discussion" && result.body.topic.id === "topic-0")
    .every(result => result.body.roots.some(root => root.body === "Concurrent synthetic comment remains")));
  const afterWriteWarm = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
    const routes = [["/v1/health"], ["/v1/version"], ["/v1/catalog/context", {
      sourceId: accepted.body.sourceId, topicId: accepted.body.topicId }],
    ["/v1/related", { sourceId: accepted.body.sourceId, limit: 20 }],
    [`/v1/sources/${accepted.body.sourceId}/alternate-discussion`]];
    const [route, input] = routes[index % routes.length];
    const response = await request(route, input);
    assert.equal(response.status, 200);
    assert.ok(response.elapsedMs < 5_000);
    if (route !== "/v1/health") assert.deepEqual(response.body.version, accepted.body.version);
    return response;
  }));
  process.stdout.write(JSON.stringify({ phase: "after-accepted-ingestion", acceptedReads: afterWriteWarm.length,
    maxMs: Math.round(Math.max(...afterWriteWarm.map(value => value.elapsedMs))) }) + "\n");
  // Hold only synthetic dispatch to deterministically saturate the normal32-job
  // queue. The real public worker resumes afterward; no production diagnostic seam.
  holdReadDispatch = true;
  let reportOverflow;
  const overflowReported = new Promise(resolve => { reportOverflow = resolve; });
  const overflow = Promise.all(Array.from({ length: 64 }, (_, index) =>
    request("/v1/catalog/context", { sourceId: `source-${100 + index}`, topicId: `topic-${100 + index}` })
      .then(result => { if (result.status === 413) reportOverflow(); return result; })));
  overflow.catch(() => {});
  let overflowTimer;
  try {
    await Promise.race([overflowReported, new Promise((_, reject) => {
      overflowTimer = setTimeout(() => reject(new Error("Synthetic overflow did not reach bounded capacity")), 5_000);
    })]);
    const [availableHealth, availableVersion] = await Promise.all([request("/v1/health"), request("/v1/version")]);
    assert.equal(availableHealth.status, 200);
    assert.equal(availableVersion.status, 200);
    assert.ok(availableHealth.elapsedMs < 5_000);
    assert.ok(availableVersion.elapsedMs < 5_000);
    process.stdout.write(JSON.stringify({ phase: "bounded-public-read-overflow", queueLimit: 32,
      health: "accepted", healthMs: Math.round(availableHealth.elapsedMs), versionMs: Math.round(availableVersion.elapsedMs),
      overflow: "existing-413-capacity" }) + "\n");
  } finally {
    clearTimeout(overflowTimer);
    holdReadDispatch = false;
    for (const dispatch of heldReadMessages.splice(0)) dispatch();
  }
  const overflowResults = await overflow;
  assert.ok(overflowResults.some(result => result.status === 413));
  assert.ok(overflowResults.every(result => [200, 413].includes(result.status)));
  const durations = reads.map(result => result.elapsedMs).sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({ fixturePages: FIXTURE_PAGES, concurrentReads: CONCURRENT_READS, clientPeak,
    acceptedReads: 2000, elapsedMs: Math.round(performance.now() - start),
    p50Ms: Math.round(durations[1000]), p95Ms: Math.round(durations[1900]), maxMs: Math.round(durations.at(-1)),
    concurrentComment: "accepted", staleIngest: "conflict-without-write" }) + "\n");
} finally {
  Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
  for (const socket of sockets) socket.destroy();
  await listener?.close(); await application?.close();
  rmSync(directory, { recursive: true, force: true });
}
