import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDemoState } from "../../local-service/src/domain/demo-state.js";
import { generateDashboard, readDashboardRevision, renderDashboardDocument, renderSnapshotScript,
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
