import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createDemoState } from "../src/domain/demo-state.js";
import { ServiceError } from "../src/domain/errors.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { openDormantLocalApplication } from "../src/startup.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { deterministicDependencies } from "./helpers.js";

function temporaryDatabase(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "universal-discussion-local-service-"));
  t.after(() => {
    assert.ok(directory.startsWith(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  return path.join(directory, "demo.sqlite");
}

function initialState() {
  const deps = deterministicDependencies();
  return createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
}

function isCode(code) {
  return (error) => error instanceof ServiceError && error.code === code;
}

test("SQLite persists commands across close and reopen", (t) => {
  const databasePath = temporaryDatabase(t);
  let deps = deterministicDependencies();
  let app = createSqliteDemoService({ databasePath, ...deps });
  app.service.command(app.service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Durable demo text" }, "demo-alex");
  app.close();

  deps = deterministicDependencies();
  app = createSqliteDemoService({ databasePath, ...deps });
  assert.equal(app.service.discussion("harbor-s2").roots[0].body, "Durable demo text");
  app.close();
});

test("SQLite compare-and-swap prevents concurrent lost updates", (t) => {
  const databasePath = temporaryDatabase(t);
  const seed = initialState();
  const left = createSqliteRepository(databasePath, seed);
  const right = createSqliteRepository(databasePath, seed);
  const expected = { generation: seed.generation, revision: seed.revision };
  const first = structuredClone(seed);
  first.revision = 1;
  left.save(expected, first);
  const stale = structuredClone(seed);
  stale.revision = 1;
  assert.throws(() => right.save(expected, stale), isCode("conflict"));
  assert.equal(right.load().revision, 1);
  left.close();
  right.close();
});

test("failed serialization rolls back and cannot report success", (t) => {
  const databasePath = temporaryDatabase(t);
  let calls = 0;
  const repository = createSqliteRepository(databasePath, initialState(), {
    serialize(value) {
      calls += 1;
      if (calls > 1) throw new Error("synthetic serialization failure");
      return JSON.stringify(value);
    },
  });
  const current = repository.load();
  const next = structuredClone(current);
  next.revision += 1;
  assert.throws(() => repository.save({ generation: current.generation, revision: current.revision }, next), isCode("storage-failure"));
  assert.equal(repository.load().revision, current.revision);
  repository.close();
});

test("failed first initialization rolls back the schema and allows a clean retry", (t) => {
  const databasePath = temporaryDatabase(t);
  assert.throws(() => createSqliteRepository(databasePath, initialState(), {
    serialize() { throw new Error("synthetic first-write failure"); },
  }), isCode("storage-failure"));
  const inspection = new DatabaseSync(databasePath);
  assert.deepEqual(inspection.prepare("SELECT name FROM sqlite_master WHERE name = 'demo_state'").all(), []);
  inspection.close();
  const repository = createSqliteRepository(databasePath, initialState());
  assert.equal(repository.load().revision, 0);
  repository.close();
});

test("unknown schema and corrupt document fail closed without reseeding", (t) => {
  const unknownPath = temporaryDatabase(t);
  let database = new DatabaseSync(unknownPath);
  database.exec("CREATE TABLE foreign_data (value TEXT)");
  database.close();
  assert.throws(() => createSqliteRepository(unknownPath, initialState()), isCode("storage-schema"));

  const corruptPath = temporaryDatabase(t);
  const repository = createSqliteRepository(corruptPath, initialState());
  repository.close();
  database = new DatabaseSync(corruptPath);
  database.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run("not-json");
  database.close();
  assert.throws(() => createSqliteRepository(corruptPath, initialState()), isCode("storage-corrupt"));
});

test("structurally manipulated state fails closed", (t) => {
  const databasePath = temporaryDatabase(t);
  const repository = createSqliteRepository(databasePath, initialState());
  repository.close();
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get();
  const state = JSON.parse(row.document);
  state.sources[0].embedding.values.push(Number.MAX_VALUE);
  state.sourceLinks[0].topicId = "missing-topic";
  database.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run(JSON.stringify(state));
  database.close();
  assert.throws(() => createSqliteRepository(databasePath, initialState()), isCode("storage-corrupt"));
});

test("an open repository cannot overwrite externally corrupted state", (t) => {
  const databasePath = temporaryDatabase(t);
  const repository = createSqliteRepository(databasePath, initialState());
  const current = repository.load();
  const external = new DatabaseSync(databasePath);
  external.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run("{}");
  external.close();
  const next = structuredClone(current);
  next.revision += 1;
  assert.throws(() => repository.save({ generation: current.generation, revision: current.revision }, next), isCode("storage-corrupt"));
  repository.close();
});

test("durable reset rotates generation and clears contributions", (t) => {
  const databasePath = temporaryDatabase(t);
  const deps = deterministicDependencies();
  const app = createSqliteDemoService({ databasePath, ...deps });
  app.service.command(app.service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Remove me" }, "demo-alex");
  const before = app.service.catalog().version;
  const reset = app.service.reset(before, "RESET DEMO STATE");
  assert.notEqual(reset.generation, before.generation);
  assert.equal(app.service.discussion("harbor-s2").roots.length, 0);
  app.close();
});

test("dormant composition opens storage and handler without binding a socket", async (t) => {
  const databasePath = temporaryDatabase(t);
  const deps = deterministicDependencies();
  const app = openDormantLocalApplication({
    config: {
      host: "127.0.0.1",
      port: 4174,
      origin: `chrome-extension://${"a".repeat(32)}`,
      capability: "test-capability-value-32-characters",
    },
    databasePath,
    ...deps,
  });
  const response = await app.handle({
    method: "GET",
    url: "/v1/health",
    headers: {
      host: "127.0.0.1:4174",
      authorization: "Bearer test-capability-value-32-characters",
    },
    body: null,
  });
  assert.equal(response.status, 200);
  app.close();
});
