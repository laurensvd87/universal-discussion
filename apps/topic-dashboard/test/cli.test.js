import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDemoState } from "../../local-service/src/domain/demo-state.js";
import { createNormalizedSqliteRepository, NORMALIZED_STORAGE_FORMAT } from "../../local-service/src/adapters/normalized-sqlite-repository.js";
import { generateDashboard, readDashboardRefreshKey, readDashboardRevision, renderDashboardDocument, renderSnapshotScript,
  watchDashboard } from "../src/cli.js";

const template = '<html><head><link rel="stylesheet" href="./style.css" data-dashboard-style></head><body>' +
  '<script id="dashboard-data" type="application/json"></script>' +
  '<script src="./app.js" defer data-dashboard-script></script></body></html>';

test("standalone report inlines local assets and escapes untrusted page titles", () => {
  const snapshot = { pages: [{ title: '</script><script>alert("x")</script>&' }] };
  const html = renderDashboardDocument({ template, style: "body{color:blue}", script: "window.ready=true;", snapshot });
  assert.match(html, /<style>body\{color:blue\}<\/style>/u);
  assert.match(html, /<script>window.ready=true;<\/script>/u);
  assert.ok(!html.includes('</script><script>alert("x")'));
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(!html.includes('href="./style.css"'));
  assert.ok(!html.includes('src="./app.js"'));
});

test("template drift fails closed", () => {
  assert.throws(() => renderDashboardDocument({ template: "<html></html>", style: "", script: "", snapshot: {} }),
    /template changed/u);
});

test("snapshot script escapes executable markup", () => {
  const script = renderSnapshotScript({ title: '</script><script>alert("x")</script>&' });
  assert.ok(script.startsWith("globalThis.__topicAtlasSnapshot = "));
  assert.ok(!script.includes("</script>"));
  assert.ok(script.includes("\\u003c/script>"));
  assert.ok(script.includes("\\u0026"));
});

test("one-shot generation writes a matching private snapshot bridge from synthetic SQLite", () => {
  const directory = mkdtempSync(join(tmpdir(), "topic-dashboard-cli-"));
  const databasePath = join(directory, "synthetic.sqlite");
  const outputPath = join(directory, "dashboard.html");
  const state = createDemoState({ generation: "synthetic", createdAt: "2026-01-01T00:00:00.000Z",
    sources: [], topicSeeds: [] });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("CREATE TABLE demo_state (singleton INTEGER PRIMARY KEY, schema TEXT, generation TEXT, revision INTEGER, document TEXT) STRICT");
    database.prepare("INSERT INTO demo_state VALUES (1, ?, ?, ?, ?)").run(
      state.schema, state.generation, state.revision, JSON.stringify(state));
    assert.equal(readDashboardRevision(databasePath), '["synthetic",0]');
    const ridgePath = join(directory, "ridge-artifact.json");
    const refreshOptions = { ridgePath, adapterPath: join(directory, "absent-diagonal.json"),
      bodyPath: join(directory, "absent-body.json") };
    const withoutRidge = readDashboardRefreshKey(databasePath, refreshOptions);
    assert.equal(JSON.parse(withoutRidge)[1], "absent");
    writeFileSync(ridgePath, "synthetic-content-free-fixture");
    const withRidge = readDashboardRefreshKey(databasePath, refreshOptions);
    assert.notEqual(withRidge, withoutRidge, "installed Ridge artifact changes watcher identity");
    assert.equal(JSON.parse(withRidge)[1][0], 30);
    const result = generateDashboard({ databasePath, outputPath,
      now: () => new Date("2026-01-02T00:00:00.000Z") });
    assert.equal(result.counts.displayedPages, 0);
    const html = readFileSync(outputPath, "utf8");
    const script = readFileSync(join(directory, "snapshot.js"), "utf8");
    assert.match(html, /"generatedAt":"2026-01-02T00:00:00.000Z"/u);
    assert.match(script, /"generatedAt":"2026-01-02T00:00:00.000Z"/u);
    assert.ok(!script.includes("synthetic"));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function syntheticDatabase(t, label) {
  const directory = mkdtempSync(join(tmpdir(), `topic-dashboard-cli-${label}-`));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, databasePath: join(directory, "synthetic.sqlite"),
    refreshOptions: { ridgePath: join(directory, "absent-ridge"),
      adapterPath: join(directory, "absent-adapter"), bodyPath: join(directory, "absent-body") } };
}

function databaseWitness(directory, databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let journalMode;
  try { journalMode = database.prepare("PRAGMA journal_mode").get().journal_mode; }
  finally { database.close(); }
  return { bytes: readFileSync(databasePath), modified: statSync(databasePath).mtimeMs,
    files: readdirSync(directory).filter(name => name.startsWith("synthetic.sqlite")), journalMode };
}

for (const schema of ["demo-state/v2", "demo-state/v3"]) {
  test(`normal startup refresh key and report support normalized ${schema} without database writes`, t => {
    const { directory, databasePath, refreshOptions } = syntheticDatabase(t, "normalized");
    const state = createDemoState({ generation: "synthetic-normalized", createdAt: "2026-01-01T00:00:00.000Z",
      sources: [], topicSeeds: [] });
    state.schema = schema;
    const repository = createNormalizedSqliteRepository(databasePath, state);
    repository.close();
    const before = databaseWitness(directory, databasePath);
    // Normal startup reads the key before generating, unlike --no-open.
    const initialKey = readDashboardRefreshKey(databasePath, refreshOptions);
    assert.equal(JSON.parse(initialKey)[0], '["synthetic-normalized",0]');
    const result = generateDashboard({ databasePath, outputPath: join(directory, "report", "dashboard.html"),
      adapter: null, bodyMetric: null, ridgeAdapter: null,
      now: () => new Date("2026-01-02T00:00:00.000Z") });
    assert.equal(result.counts.displayedPages, 0);
    assert.equal(result.counts.totalTopics, 0);
    assert.deepEqual(databaseWitness(directory, databasePath), before);

    const database = new DatabaseSync(databasePath);
    try {
      database.exec("UPDATE canonical_meta SET revision = 1 WHERE singleton = 1");
      const revisedBefore = databaseWitness(directory, databasePath);
      const revisedKey = readDashboardRefreshKey(databasePath, refreshOptions);
      assert.notEqual(revisedKey, initialKey);
      assert.equal(JSON.parse(revisedKey)[0], '["synthetic-normalized",1]');
      assert.deepEqual(databaseWitness(directory, databasePath), revisedBefore);
      database.exec("UPDATE canonical_meta SET generation = 'synthetic-reset', revision = 0 WHERE singleton = 1");
      const resetBefore = databaseWitness(directory, databasePath);
      const resetKey = readDashboardRefreshKey(databasePath, refreshOptions);
      assert.notEqual(resetKey, initialKey);
      assert.notEqual(resetKey, revisedKey);
      assert.equal(JSON.parse(resetKey)[0], '["synthetic-reset",0]');
      assert.deepEqual(databaseWitness(directory, databasePath), resetBefore);
    } finally { database.close(); }
  });
}

test("revision polling needs only canonical metadata or legacy v3 metadata, without reading payloads", t => {
  for (const normalized of [true, false]) {
    const { directory, databasePath, refreshOptions } = syntheticDatabase(t, normalized ? "metadata" : "legacy-v3");
    const database = new DatabaseSync(databasePath);
    if (normalized) {
      database.exec("CREATE TABLE canonical_meta(singleton INTEGER PRIMARY KEY, format TEXT, schema TEXT, generation TEXT, revision INTEGER) STRICT");
      database.prepare("INSERT INTO canonical_meta VALUES(1, ?, 'demo-state/v3', 'synthetic-metadata', 7)").run(NORMALIZED_STORAGE_FORMAT);
    } else {
      database.exec("CREATE TABLE demo_state(singleton INTEGER PRIMARY KEY, schema TEXT, generation TEXT, revision INTEGER, document TEXT) STRICT");
      database.prepare("INSERT INTO demo_state VALUES(1, 'demo-state/v3', 'synthetic-metadata', 7, ?)").run("unreadable-payload-sentinel");
    }
    database.close();
    const before = databaseWitness(directory, databasePath);
    for (let poll = 0; poll < 3; poll += 1) {
      assert.equal(readDashboardRevision(databasePath), '["synthetic-metadata",7]');
      assert.equal(JSON.parse(readDashboardRefreshKey(databasePath, refreshOptions))[0], '["synthetic-metadata",7]');
    }
    assert.deepEqual(databaseWitness(directory, databasePath), before);
  }
});

test("unsupported and incomplete polling metadata fails closed without file or journal mutation", t => {
  const fixtures = [
    ["no-metadata", "CREATE TABLE unrelated(id INTEGER)"],
    ["missing-row", "CREATE TABLE canonical_meta(singleton INTEGER, format TEXT, schema TEXT, generation TEXT, revision INTEGER)"],
    ["bad-format", "UPDATE canonical_meta SET format = 'canonical-relational/v2'"],
    ["bad-schema", "UPDATE canonical_meta SET schema = 'demo-state/v4'"],
    ["blank-generation", "UPDATE canonical_meta SET generation = ''"],
    ["control-generation", "UPDATE canonical_meta SET generation = char(1)"],
    ["long-generation", "UPDATE canonical_meta SET generation = printf('%0130d', 1)"],
    ["missing-generation", "UPDATE canonical_meta SET generation = NULL"],
    ["negative-revision", "UPDATE canonical_meta SET revision = -1"],
    ["unsafe-revision", "UPDATE canonical_meta SET revision = 9007199254740992"],
    ["fractional-revision", "UPDATE canonical_meta SET revision = 0.5"],
    ["missing-revision", "UPDATE canonical_meta SET revision = NULL"],
    ["view-metadata", "CREATE VIEW canonical_meta AS SELECT 'canonical-relational/v1' AS format, 'demo-state/v3' AS schema, 'synthetic' AS generation, 0 AS revision, 1 AS singleton"],
    ["bad-legacy-schema", "DROP TABLE canonical_meta; UPDATE demo_state SET schema = 'demo-state/v1'"],
  ];
  for (const [label, sql] of fixtures) {
    const { directory, databasePath, refreshOptions } = syntheticDatabase(t, label);
    const database = new DatabaseSync(databasePath);
    // A valid legacy row must never mask a malformed canonical metadata table.
    database.exec("CREATE TABLE demo_state(singleton INTEGER, schema TEXT, generation TEXT, revision INTEGER, document TEXT); INSERT INTO demo_state VALUES(1, 'demo-state/v2', 'synthetic', 0, '{}')");
    if (label === "no-metadata") database.exec("DROP TABLE demo_state");
    if (!["no-metadata", "missing-row", "view-metadata"].includes(label)) {
      database.exec("CREATE TABLE canonical_meta(singleton INTEGER, format TEXT, schema TEXT, generation TEXT, revision); INSERT INTO canonical_meta VALUES(1, 'canonical-relational/v1', 'demo-state/v3', 'synthetic', 0)");
    }
    database.exec(sql);
    database.close();
    const before = databaseWitness(directory, databasePath);
    const rejected = label === "unsafe-revision" ? RangeError : /Unsupported/u;
    assert.throws(() => readDashboardRevision(databasePath), rejected, label);
    assert.throws(() => readDashboardRefreshKey(databasePath, refreshOptions), rejected, label);
    assert.deepEqual(databaseWitness(directory, databasePath), before, label);
  }
  const { directory, databasePath } = syntheticDatabase(t, "missing-file");
  const before = readdirSync(directory);
  assert.throws(() => readDashboardRevision(databasePath));
  assert.equal(existsSync(databasePath), false);
  assert.deepEqual(readdirSync(directory), before);
});

test("watcher retries read and generation errors, serializes updates, and stops", async () => {
  const timers = new Map();
  let nextTimer = 0;
  const setTimer = (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; };
  const clearTimer = (id) => timers.delete(id);
  const fire = async () => {
    assert.equal(timers.size, 1);
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    await callback();
  };
  const errors = [];
  let current = "generation-a:0";
  let readFailure = true;
  let generationFailure = true;
  let releaseGeneration;
  const generated = [];
  const watcher = watchDashboard({ initialRevision: current, setTimer, clearTimer,
    readRevision: () => { if (readFailure) throw new Error("busy"); return current; },
    generate: async () => {
      if (generationFailure) throw new Error("write busy");
      generated.push(current);
      await new Promise((resolve) => { releaseGeneration = resolve; });
    },
    onError: (error) => errors.push(error.message),
  });
  await fire();
  await fire();
  assert.deepEqual(errors, ["busy"]);
  readFailure = false;
  current = "generation-a:1";
  await fire();
  assert.deepEqual(errors, ["busy", "write busy"]);
  generationFailure = false;
  const pending = fire();
  await Promise.resolve();
  assert.deepEqual(generated, ["generation-a:1"]);
  assert.equal(timers.size, 0, "no second tick is scheduled during generation");
  releaseGeneration();
  await pending;
  await fire();
  assert.deepEqual(generated, ["generation-a:1"], "unchanged revision is skipped");
  current = "generation-b:0";
  const reset = fire();
  await Promise.resolve();
  releaseGeneration();
  await reset;
  assert.deepEqual(generated, ["generation-a:1", "generation-b:0"]);
  watcher.stop();
  assert.equal(timers.size, 0);
});
