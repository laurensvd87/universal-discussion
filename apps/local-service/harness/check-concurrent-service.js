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

const directory = mkdtempSync(path.join(tmpdir(), "udl-concurrent-synthetic-"));
const databasePath = path.join(directory, "canonical.sqlite");
const origin = `chrome-extension://${"a".repeat(32)}`;
const token = "synthetic-concurrency-capability";
const config = { hostHeader: "127.0.0.1:4175", origin, capability: token };
const stamp = "2026-10-12T12:00:00Z";
let serial = 0, application, listener;
const sockets = [];
const nextId = kind => `${kind}-synthetic-${++serial}`;
const state = createDemoState({ generation: "synthetic-concurrency", createdAt: stamp, sources: [], topicSeeds: [] });
state.topics = Array.from({ length: 1500 }, (_, index) => ({ id: `topic-${index}`, title: "Synthetic topic", kind: "general",
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
    outgoing.setTimeout(15000, () => outgoing.destroy(new Error("Synthetic request timed out")));
    outgoing.on("error", reject);
    outgoing.end(bytes);
  }).finally(() => { clientActive--; });
}
try {
  application = createSqliteDemoService({ databasePath, asyncIngest: true, storageMode: "normalized", nextId, now: () => stamp,
    ingestionWorkerOptions: { workerFactory() {
      const real = new Worker(new URL("./fixtures/held-ingestion-worker.js", import.meta.url), {
        workerData: { databasePath, gate: gate.buffer }, execArgv: process.execArgv,
      });
      const bridge = new EventEmitter();
      bridge.postMessage = value => real.postMessage(value);
      bridge.terminate = () => real.terminate();
      real.on("message", message => message.started ? started() : bridge.emit("message", message));
      real.on("error", error => bridge.emit("error", error));
      real.on("exit", code => bridge.emit("exit", code));
      return bridge;
    } } });
  const server = createLoopbackServer({ handle: createRequestHandler({ service: application.service, config }) });
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
  try { for (let batch = 0; batch < 125; batch++) { await Promise.all(Array.from({ length: 16 }, () => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 4175 });
    sockets.push(socket); socket.on("error", () => {}); socket.once("error", reject); socket.once("connect", resolve);
  }))); } } catch (error) {
    process.stderr.write(JSON.stringify({ phase: "connection-setup", attempted: sockets.length, serverPeak,
      listening: server.listening, socketLimit: server.maxConnections }) + "\n");
    throw error;
  }
  process.stdout.write(JSON.stringify({ preparedConnections: sockets.length, serverPeak, listening: server.listening, socketLimit: server.maxConnections }) + "\n");
  const start = performance.now();
  const reads = await Promise.all(Array.from({ length: 2000 }, (_, index) => {
    if (index % 4 === 0) return request("/v1/health", undefined, {}, sockets[index]);
    if (index % 4 === 1) return request("/v1/version", undefined, {}, sockets[index]);
    if (index % 4 === 2) return request("/v1/catalog/page", { kind: "sources", limit: 1, cursor: null }, {}, sockets[index]);
    return request("/v1/topics/topic-0/discussion", undefined, {}, sockets[index]);
  }));
  assert.equal(reads.filter(result => result.status === 200).length, 2000);
  assert.equal(Atomics.load(gate, 0), 0, "all read requests finish while ingestion is still held");
  const comment = await request("/v1/commands", { expected, command: { type: "create-root", topicId: "topic-0",
    originSourceId: "source-0", body: "Concurrent synthetic comment remains" } }, { "x-demo-actor": "demo-alex" });
  assert.equal(comment.status, 200);
  Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
  const stale = await ingestion;
  assert.equal(stale.status, 409, "concurrently accepted comment makes plan stale without overwrite");
  assert.equal(application.service.version().revision, comment.body.version.revision);
  assert.equal(application.service.discussion("topic-0").roots[0].body, "Concurrent synthetic comment remains");
  const durations = reads.map(result => result.elapsedMs).sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({ fixturePages: 1500, concurrentReads: 2000, clientPeak,
    acceptedReads: 2000, elapsedMs: Math.round(performance.now() - start),
    p50Ms: Math.round(durations[1000]), p95Ms: Math.round(durations[1900]), maxMs: Math.round(durations.at(-1)),
    concurrentComment: "accepted", staleIngest: "conflict-without-write" }) + "\n");
} finally {
  Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
  for (const socket of sockets) socket.destroy();
  await listener?.close(); await application?.close();
  rmSync(directory, { recursive: true, force: true });
}
