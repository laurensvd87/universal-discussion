import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { deterministicDependencies } from "./helpers.js";

test("normal disk read-worker startup warms only empty public context without mutation", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-read-startup-"));
  const sent = [];
  const worker = new EventEmitter();
  worker.postMessage = message => sent.push(message);
  worker.terminate = async () => 0;
  const app = createSqliteDemoService({ databasePath: path.join(directory, "canonical.sqlite"),
    storageMode: "normalized", asyncReads: true, ...deterministicDependencies(),
    readWorkerOptions: { workerFactory: () => worker } });
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.method, "catalogContext");
  assert.deepEqual(sent[0].input.input, { sourceId: null, topicId: null });
  const expected = app.service.version();
  assert.deepEqual(sent[0].input.version, expected);
  const before = app.service.catalog();
  worker.emit("message", { id: sent[0].id, ok: true,
    plan: { version: expected, value: app.service.catalogContext({ sourceId: null, topicId: null }) } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(app.service.version(), expected);
  assert.deepEqual(app.service.catalog(), before);
});

test("failed disposable startup read cannot authorize a write or crash startup", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-read-startup-failed-"));
  const worker = new EventEmitter();
  worker.postMessage = () => { throw new Error("Synthetic worker startup failure"); };
  worker.terminate = async () => 0;
  const app = createSqliteDemoService({ databasePath: path.join(directory, "canonical.sqlite"),
    storageMode: "normalized", asyncReads: true, ...deterministicDependencies(),
    readWorkerOptions: { workerFactory: () => worker } });
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const expected = app.service.version();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(app.service.version(), expected);
});

test("shutdown waits for the still-pending startup worker to retire", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-read-startup-close-"));
  let retire, dispatched = 0;
  const worker = new EventEmitter();
  worker.postMessage = () => { dispatched++; };
  worker.terminate = () => new Promise(resolve => { retire = resolve; });
  const app = createSqliteDemoService({ databasePath: path.join(directory, "canonical.sqlite"),
    storageMode: "normalized", asyncReads: true, ...deterministicDependencies(),
    readWorkerOptions: { workerFactory: () => worker } });
  let closed = false;
  const pending = app.close().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof retire, "function");
  assert.equal(closed, false);
  assert.equal(dispatched, 1);
  retire(0);
  await pending;
  assert.equal(closed, true);
  assert.equal(dispatched, 1);
  rmSync(directory, { recursive: true, force: true });
});
