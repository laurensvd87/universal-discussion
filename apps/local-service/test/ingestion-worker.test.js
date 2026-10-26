import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createIngestionWorkerQueue } from "../src/application/ingestion-worker-queue.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION, readLearnedIngest } from "../src/domain/learned-sources.js";
import { ingestionScopes } from "../src/application/ingestion-plan.js";
import { operationDigestFor, routeSourceThreads } from "../src/domain/source-threads.js";

function location(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-ingestion-worker-"));
  const closers = [];
  t.after(async () => { for (const close of closers) await close(); rmSync(directory, { recursive: true, force: true }); });
  return { databasePath: path.join(directory, "canonical.sqlite"), closers };
}
let serial = 0;
const dependencies = () => ({ nextId: kind => `${kind}-worker-${++serial}`, now: () => "2026-10-12T12:00:00Z" });
const input = (expected, suffix = "one", angle = 0) => {
  const values = Array(384).fill(0); values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return { expected, operationId: `operation-${suffix}`, url: `https://example.org/worker-${suffix}`,
    title: `Worker ${suffix}`, embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION };
};

test("real readonly ingestion worker commits scoped plans and exact operation receipts", async t => {
  const { databasePath, closers } = location(t);
  const app = createSqliteDemoService({ databasePath, storageMode: "normalized", asyncIngest: true, ...dependencies() });
  closers.push(() => app.close());
  const request = input(app.service.version());
  // Accepted drift is normalized exactly once, identically to synchronous ingest.
  request.embedding.values[0] = 1.003;
  const accepted = await app.service.ingest(request);
  assert.equal(accepted.version.revision, request.expected.revision + 1);
  assert.deepEqual(await app.service.ingest(request), accepted);
  const inspection = createNormalizedSqliteRepository(databasePath, null, { readOnly: true });
  try { assert.equal(inspection.load().sources.find(source => source.id === accepted.sourceId).operationDigest,
    operationDigestFor(readLearnedIngest(request))); } finally { inspection.close(); }
  const second = await app.service.ingest(input(app.service.version(), "two", 0.1));
  assert.equal(second.topicId, accepted.topicId);
  const root = app.service.command(app.service.version(), { type: "create-root", topicId: accepted.topicId,
    originSourceId: accepted.sourceId, body: "Retain this exact root" }, "demo-alex").result.contributionId;
  await app.service.ingest(input(app.service.version(), "three", 1.57));
  assert.equal(app.service.discussionForContribution(accepted.topicId, root).roots[0].body, "Retain this exact root");
  assert.ok(app.service.discover.search({ query: "Retain", limit: 20, cursor: null }).results.length > 0);
});

test("a real prepared plan cannot overwrite a concurrent canonical comment", async t => {
  const { databasePath, closers } = location(t);
  const state = createDemoState({ generation: "worker-generation", createdAt: "2026-10-12T12:00:00Z", sources: [],
    topicSeeds: [{ id: "topic-one", title: "One", kind: "general" }] });
  const repository = createNormalizedSqliteRepository(databasePath, state);
  const queue = createIngestionWorkerQueue({ databasePath });
  closers.push(async () => { await queue.close(); repository.close(); });
  let release, ready;
  const prepared = new Promise(resolve => { ready = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const ingestionExecutor = { async prepare(...args) { const plan = await queue.prepare(...args); ready(); await gate; return plan; } };
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [],
    ingestionExecutor, ...dependencies() });
  const pending = service.ingest(input(service.version()));
  await prepared;
  const accepted = service.command(service.version(), { type: "create-root", topicId: "topic-one", body: "Concurrent accepted comment" }, "demo-alex");
  release();
  await assert.rejects(pending, error => error.code === "conflict");
  assert.deepEqual(service.version(), accepted.version);
  assert.equal(repository.load().sources.length, 0);
  assert.equal(repository.load().contributions[0].revisions[0].body, "Concurrent accepted comment");
});

test("closed request guard refuses an already prepared plan before any mutation", async t => {
  const { databasePath, closers } = location(t);
  const app = createSqliteDemoService({ databasePath, storageMode: "normalized", asyncIngest: true, ...dependencies() });
  closers.push(() => app.close());
  const expected = app.service.version();
  await assert.rejects(app.service.ingest(input(expected), { isCurrent: () => false }), error => error.code === "unavailable");
  assert.deepEqual(app.service.version(), expected);
  await assert.rejects(app.service.ingest({ ...input(expected), url: "https://example.com/" }), error => error.code === "forbidden");
  assert.deepEqual(app.service.version(), expected);
});

test("queue admission is bounded and cancellation never redispatches a job", async () => {
  const workers = [];
  const queue = createIngestionWorkerQueue({ databasePath: "unused", maxPending: 2, workerFactory() {
    const worker = new EventEmitter(); worker.messages = []; worker.postMessage = message => worker.messages.push(message);
    worker.terminate = async () => { worker.terminated = true; }; workers.push(worker); return worker;
  } });
  const controller = new AbortController();
  const first = queue.prepare({}, { signal: controller.signal });
  const second = queue.prepare({});
  await assert.rejects(queue.prepare({}), error => error.code === "capacity");
  controller.abort();
  await assert.rejects(first, error => error.code === "unavailable");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[0].messages.length, 1);
  assert.equal(workers[1].messages.length, 1);
  queue.close();
  await assert.rejects(second, error => error.code === "unavailable");
});

test("worker scope includes whole moved subtrees and excludes unrelated catalog rows", async t => {
  const { databasePath, closers } = location(t);
  const app = createSqliteDemoService({ databasePath, storageMode: "normalized", ...dependencies() });
  closers.push(() => app.close());
  const one = app.service.ingest(input(app.service.version(), "one", 0));
  const two = app.service.ingest(input(app.service.version(), "two", 1.57));
  assert.notEqual(one.topicId, two.topicId);
  const root = app.service.command(app.service.version(), { type: "create-root", topicId: two.topicId,
    originSourceId: two.sourceId, body: "Root moves whole subtree" }, "demo-alex").result.contributionId;
  app.service.command(app.service.version(), { type: "reply", discussionId: app.service.discussion(two.topicId).discussionId,
    rootId: root, replyToId: root, originSourceId: two.sourceId, body: "Nested reply is preserved" }, "demo-alex");
  const repository = createNormalizedSqliteRepository(databasePath, null);
  closers.push(() => repository.close());
  const before = repository.load(), after = structuredClone(before);
  const movedLink = after.sourceLinks.find(link => link.sourceId === two.sourceId);
  movedLink.topicId = one.topicId; movedLink.method = "manual-confirmed";
  routeSourceThreads(after); after.revision++;
  const [oldScope, newScope] = ingestionScopes(before, after);
  assert.ok(oldScope.sources.length < before.sources.length);
  assert.equal(oldScope.contributions.length, 2);
  repository.saveScoped(app.service.version(), oldScope, newScope);
  const actual = repository.load();
  for (const name of ["topics", "discussions", "sources", "sourceLinks", "contributions"])
    assert.deepEqual(actual[name], after[name]);
});

test("queue absolute timeout settles both requests without retry", async () => {
  const worker = new EventEmitter(); worker.messages = []; worker.postMessage = message => worker.messages.push(message);
  worker.terminate = async () => {};
  const queue = createIngestionWorkerQueue({ databasePath: "unused", maxPending: 2, timeoutMs: 20, workerFactory: () => worker });
  const outcomes = await Promise.allSettled([queue.prepare({}), queue.prepare({})]);
  assert.ok(outcomes.every(outcome => outcome.status === "rejected" && outcome.reason.code === "unavailable"));
  // The second job may be dispatched only if its absolute admission timer has
  // not expired; neither job is redispatched after timing out.
  assert.ok(worker.messages.length <= 2);
  assert.equal(new Set(worker.messages.map(message => message.id)).size, worker.messages.length);
  await queue.close();
});

test("a prepared ingestion cannot resurrect a concurrently forgotten Source and its posts", async t => {
  const { databasePath, closers } = location(t);
  const app = createSqliteDemoService({ databasePath, storageMode: "normalized", ...dependencies() });
  closers.push(() => app.close());
  const original = app.service.ingest(input(app.service.version(), "original"));
  app.service.command(app.service.version(), { type: "create-root", topicId: original.topicId,
    originSourceId: original.sourceId, body: "Source-owned thread" }, "demo-alex");
  const repository = createNormalizedSqliteRepository(databasePath, null);
  const queue = createIngestionWorkerQueue({ databasePath });
  closers.push(async () => { await queue.close(); repository.close(); });
  let ready, release;
  const prepared = new Promise(resolve => { ready = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [],
    ...dependencies(), ingestionExecutor: { async prepare(...args) { const plan = await queue.prepare(...args); ready(); await gate; return plan; } } });
  const pending = service.ingest(input(service.version(), "new"));
  await prepared;
  app.service.command(app.service.version(), { type: "forget-source", sourceId: original.sourceId }, "demo-alex");
  const accepted = repository.load();
  release();
  await assert.rejects(pending, error => error.code === "conflict");
  assert.deepEqual(repository.load(), accepted);
  assert.ok(!accepted.sources.some(source => source.id === original.sourceId));
});

test("replacement waits for actual retirement and close waits for a retiring worker", async () => {
  const workers = [];
  let retire;
  const retirement = new Promise(resolve => { retire = resolve; });
  const queue = createIngestionWorkerQueue({ databasePath: "unused", workerFactory() {
    const worker = new EventEmitter(); worker.messages = []; worker.postMessage = message => worker.messages.push(message);
    worker.terminate = () => retirement; workers.push(worker); return worker;
  } });
  const first = queue.prepare({}), second = queue.prepare({});
  const firstRejected = assert.rejects(first, error => error.code === "unavailable");
  workers[0].emit("error", new Error("Synthetic crash"));
  await firstRejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(workers.length, 1, "replacement cannot overlap a retiring working set");
  assert.doesNotThrow(() => workers[0].emit("error", new Error("Late synthetic error during retirement")));
  assert.equal(workers.length, 1);
  const secondRejected = assert.rejects(second, error => error.code === "unavailable");
  let closed = false;
  const closing = queue.close().then(() => { closed = true; });
  await secondRejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false);
  retire(); await closing;
  assert.equal(closed, true); assert.equal(workers.length, 1);
});

test("worker crash and unexpected message fail once without retrying the operation", async () => {
  for (const event of ["error", "exit", "unexpected-message"]) {
    const workers = [];
    const queue = createIngestionWorkerQueue({ databasePath: "unused", workerFactory() {
      const worker = new EventEmitter(); worker.messages = []; worker.postMessage = message => worker.messages.push(message);
      worker.terminate = async () => {}; workers.push(worker); return worker;
    } });
    const first = queue.prepare({}), second = queue.prepare({});
    const firstRejected = assert.rejects(first, error => error.code === "unavailable");
    if (event === "unexpected-message") workers[0].emit("message", { id: -1, ok: true, plan: {} });
    else workers[0].emit(event, event === "error" ? new Error("Synthetic failure") : 1);
    await firstRejected;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(workers.length, 2);
    assert.equal(workers[0].messages.length, 1);
    assert.notEqual(workers[0].messages[0].id, workers[1].messages[0].id);
    const secondRejected = assert.rejects(second, error => error.code === "unavailable");
    await queue.close(); await secondRejected;
  }
});

test("an expired active result is rejected even before its delayed timeout callback", async t => {
  let monotonicTime = 1000;
  t.mock.method(performance, "now", () => monotonicTime);
  const worker = new EventEmitter(); worker.messages = []; worker.postMessage = message => worker.messages.push(message);
  worker.terminate = async () => {};
  const queue = createIngestionWorkerQueue({ databasePath: "unused", timeoutMs: 15000, workerFactory: () => worker });
  const pending = queue.prepare({});
  const rejected = assert.rejects(pending, error => error.code === "unavailable");
  monotonicTime += 15001;
  worker.emit("message", { id: worker.messages[0].id, ok: true, plan: { receipt: true } });
  await rejected; await queue.close();
});
