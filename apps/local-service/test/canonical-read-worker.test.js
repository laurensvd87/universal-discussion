import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanonicalReadQueue } from "../src/application/canonical-read-queue.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { makeDiagonalAdapter } from "../src/domain/diagonal-adapter.js";
import { BROWSER_MODEL_ID } from "../src/domain/learned-sources.js";

const version = { generation: "synthetic-read", revision: 0 };
function mockQueue(options = {}) {
  const workers = [];
  const queue = createCanonicalReadQueue({ databasePath: "unused", ...options, workerFactory() {
    const worker = new EventEmitter(); worker.messages = []; worker.postMessage = message => worker.messages.push(message);
    worker.terminate = async () => {}; workers.push(worker); return worker;
  } });
  return { queue, workers, respond(value = { public: true }) {
    const worker = workers.at(-1), message = worker.messages.at(-1);
    worker.emit("message", { id: message.id, ok: true, plan: { version: message.input.version, value } });
  } };
}

test("two thousand identical public reads share one worker operation and bounded DTO", async () => {
  const { queue, workers, respond } = mockQueue();
  const pending = Array.from({ length: 2000 }, () => queue.read("catalogContext", { sourceId: "source-one", topicId: null }, { version }));
  assert.equal(workers.length, 1); assert.equal(workers[0].messages.length, 1);
  const value = { version, actors: [], sources: [], topics: [] };
  respond(value);
  const results = await Promise.all(pending);
  assert.ok(results.every(result => result === results[0]));
  assert.deepEqual(results[0], value); assert.ok(Object.isFrozen(results[0].sources));
  await queue.close();
});

test("individual cancellation preserves shared work and each waiter revalidates delivery", async () => {
  const { queue, workers, respond } = mockQueue();
  const controller = new AbortController();
  const cancelled = queue.read("discussion", "topic-one", { version, signal: controller.signal });
  const current = queue.read("discussion", "topic-one", { version, isCurrent: () => true });
  const stale = queue.read("discussion", "topic-one", { version, isCurrent: () => false });
  const failedGuard = queue.read("discussion", "topic-one", { version, isCurrent() { throw new Error("Expired authority"); } });
  controller.abort();
  await assert.rejects(cancelled, error => error.code === "unavailable");
  assert.equal(workers[0].listenerCount("message"), 1, "shared work remains active");
  const staleRejected = assert.rejects(stale, error => error.code === "conflict");
  const guardRejected = assert.rejects(failedGuard, error => error.code === "conflict");
  respond();
  assert.deepEqual(await current, { public: true }); await staleRejected; await guardRejected;
  await queue.close();
});

test("waiter and distinct-task admission stay bounded; final cancellation terminates work", async () => {
  const { queue, workers } = mockQueue({ maxTasks: 2, maxWaiters: 3 });
  const one = queue.read("discussion", "topic-one", { version });
  const two = queue.read("discussion", "topic-two", { version });
  await assert.rejects(queue.read("discussion", "topic-three", { version }), error => error.code === "capacity");
  const same = queue.read("discussion", "topic-one", { version });
  await assert.rejects(queue.read("discussion", "topic-one", { version }), error => error.code === "capacity");
  const rejections = [one, two, same].map(pending => assert.rejects(pending, error => error.code === "unavailable"));
  await queue.close(); await Promise.all(rejections);
  assert.equal(workers.length, 1);
});

test("public read validation rejects writes, getters and oversized input without worker dispatch", async () => {
  const { queue, workers } = mockQueue();
  await assert.rejects(queue.read("command", {}, { version }), error => error.code === "invalid");
  let accessed = false;
  const input = { get sourceId() { accessed = true; return "source-one"; }, topicId: null };
  await assert.rejects(queue.read("catalogContext", input, { version }), error => error.code === "invalid");
  assert.equal(accessed, false);
  const proxy = new Proxy({}, { getPrototypeOf() { accessed = true; return Object.prototype; },
    ownKeys() { accessed = true; return []; }, getOwnPropertyDescriptor() { accessed = true; return undefined; } });
  await assert.rejects(queue.read("catalogContext", proxy, { version }), error => error.code === "invalid");
  assert.equal(accessed, false, "proxy traps never execute");
  await assert.rejects(queue.read("selection", { sourceId: null, topicId: null }, { version }), error => error.code === "invalid");
  await assert.rejects(queue.read("catalogPage", { large: "x".repeat(65537) }, { version }), error => error.code === "invalid");
  assert.equal(workers.length, 0); await queue.close();
});

test("real readonly worker preserves public context, related, alternate and exact snapshot fences", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-public-read-worker-"));
  const databasePath = path.join(directory, "canonical.sqlite");
  let serial = 0;
  const alternateAdapter = makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 });
  const app = createSqliteDemoService({ databasePath, storageMode: "normalized", alternateAdapter,
    nextId: kind => `${kind}-read-${++serial}`, now: () => "2026-10-12T12:00:00Z" });
  const queue = createCanonicalReadQueue({ databasePath, alternateAdapter });
  t.after(async () => { await queue.close(); await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const accepted = app.service.ingest({ expected: app.service.version(), operationId: "read-operation", url: "https://example.org/public-worker",
    title: "Public worker source", extractorVersion: "main-text-prefix/v1", embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] } });
  const expected = app.service.version();
  const checks = [
    ["catalogContext", { sourceId: accepted.sourceId, topicId: accepted.topicId }],
    ["selection", { sourceId: accepted.sourceId, topicId: accepted.topicId }],
    ["alternateDiscussion", accepted.sourceId], ["priorDiscussions", accepted.sourceId],
    ["related", { sourceId: accepted.sourceId, limit: 20 }], ["catalog", null],
    ["catalogPage", { kind: "sources", limit: 20, cursor: null }], ["discussion", accepted.topicId],
    ["discussionPage", { topicId: accepted.topicId, limit: 20, cursor: null }], ["exactSource", accepted.sourceId],
  ];
  for (const [method, input] of checks) {
    const actual = await queue.read(method, input, { version: expected });
    const wanted = method === "catalog" ? app.service.catalog() : method === "related" ? app.service.related(input.sourceId, input.limit) : app.service[method](input);
    assert.deepEqual(actual, wanted, method);
  }
  const pending = queue.read("catalogContext", { sourceId: accepted.sourceId, topicId: accepted.topicId }, { version: expected,
    isCurrent: () => app.service.version().generation === expected.generation && app.service.version().revision === expected.revision });
  app.service.command(expected, { type: "create-root", topicId: accepted.topicId, body: "New canonical revision" }, "demo-alex");
  await assert.rejects(pending, error => error.code === "conflict");
  await assert.rejects(queue.read("exactSource", "missing-source", { version: app.service.version() }), error => error.code === "not-found");
  assert.equal(app.service.version().revision, expected.revision + 1, "reads never mutate canonical storage");
});

test("commit barrier drains a shared read batch and lets its delivery chain finish first", async () => {
  const { queue, workers, respond } = mockQueue();
  let revision = 0, deliveries = 0, committed = false;
  const read = queue.read("discussion", "topic-one", { version });
  const delivery = read.then(value => value).then(value => {
    assert.equal(revision, 0, "read service/HTTP delivery remains on its admitted revision");
    deliveries++; return value;
  });
  const commit = queue.withCommit(() => { assert.equal(deliveries, 2); committed = true; revision++; return revision; }, { isCurrent: () => revision === 0 });
  const joined = queue.read("discussion", "topic-one", { version }).then(() => { assert.equal(revision, 0); deliveries++; });
  await assert.rejects(queue.read("discussion", "topic-two", { version }), error => error.code === "capacity");
  assert.equal(workers[0].messages.length, 1); assert.equal(committed, false);
  respond(); await delivery; await joined;
  assert.equal(await commit, 1);
  const freshVersion = { ...version, revision: 1 };
  const freshRead = queue.read("discussion", "topic-two", { version: freshVersion });
  respond({ version: freshVersion, roots: [] });
  assert.deepEqual(await freshRead, { version: freshVersion, roots: [] });
  await queue.close();
});

test("cancelled and expired commit barriers never invoke work and remain bounded", async () => {
  const { queue, respond } = mockQueue({ maxCommits: 2, timeoutMs: 30 });
  let writes = 0;
  const read = queue.read("discussion", "topic-one", { version });
  const readRejected = assert.rejects(read, error => error.code === "unavailable");
  const controller = new AbortController();
  const cancelled = queue.withCommit(() => writes++, { signal: controller.signal });
  const expired = queue.withCommit(() => writes++);
  await assert.rejects(queue.withCommit(() => writes++), error => error.code === "capacity");
  controller.abort(); await assert.rejects(cancelled, error => error.code === "unavailable");
  await assert.rejects(expired, error => error.code === "unavailable");
  await readRejected; assert.equal(writes, 0);
  await queue.close();
});

test("last read cancellation holds commit behind actual worker retirement", async () => {
  let finishRetirement;
  const retired = new Promise(resolve => { finishRetirement = resolve; });
  const worker = new EventEmitter(); worker.postMessage = () => {}; worker.terminate = () => retired;
  const queue = createCanonicalReadQueue({ databasePath: "unused", workerFactory: () => worker });
  const controller = new AbortController();
  const read = queue.read("discussion", "topic-one", { version, signal: controller.signal });
  let written = false;
  const commit = queue.withCommit(() => { written = true; });
  controller.abort(); await assert.rejects(read, error => error.code === "unavailable");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(written, false);
  finishRetirement(); await commit; assert.equal(written, true);
  await queue.close();
});

test("commit rechecks authority after drain and admits fresh reads between serialized commits", async () => {
  const { queue, respond } = mockQueue();
  let current = true, writes = 0;
  const read = queue.read("discussion", "topic-one", { version });
  const stale = queue.withCommit(() => writes++, { isCurrent: () => current });
  current = false; respond(); await read;
  await assert.rejects(stale, error => error.code === "unavailable"); assert.equal(writes, 0);
  current = true;
  const first = queue.withCommit(() => ++writes), second = queue.withCommit(() => ++writes);
  assert.equal(await first, 1);
  const fresh = queue.read("discussion", "topic-two", { version });
  respond(); await fresh;
  assert.equal(await second, 2); await queue.close();
});

test("commit cancellation during its fresh authority check cannot invoke work", async () => {
  const { queue } = mockQueue();
  const controller = new AbortController();
  let writes = 0;
  const pending = queue.withCommit(() => writes++, { signal: controller.signal, isCurrent() { controller.abort(); return true; } });
  await assert.rejects(pending, error => error.code === "unavailable");
  assert.equal(writes, 0); await queue.close();
});

test("uncertain worker retirement cannot authorize a later commit or read admission", async () => {
  const worker = new EventEmitter(); worker.postMessage = () => {};
  worker.terminate = async () => { throw new Error("Synthetic uncertain retirement"); };
  const queue = createCanonicalReadQueue({ databasePath: "unused", workerFactory: () => worker });
  const controller = new AbortController();
  const read = queue.read("discussion", "topic-one", { version, signal: controller.signal });
  let writes = 0;
  const commit = queue.withCommit(() => writes++);
  const rejected = assert.rejects(commit, error => error.code === "unavailable");
  controller.abort(); await assert.rejects(read, error => error.code === "unavailable"); await rejected;
  await assert.rejects(queue.withCommit(() => writes++), error => error.code === "unavailable");
  await assert.rejects(queue.read("discussion", "topic-two", { version }), error => error.code === "unavailable");
  assert.equal(writes, 0); await queue.close();
});
