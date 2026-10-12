import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDemoState } from "../../local-service/src/domain/demo-state.js";
import { ADAPTIVE_TOPIC_POLICY } from "../../local-service/src/domain/adaptive-topics.js";
import { operationDigestFor } from "../../local-service/src/domain/source-threads.js";
import { createNormalizedSqliteRepository } from "../../local-service/src/adapters/normalized-sqlite-repository.js";
import { createCatalogGrowthStore, readCatalogGrowthCounts } from "../../local-service/src/metrics/catalog-growth.js";
import { generateDashboard, generateDashboardSnapshot, renderDashboardDocument, renderSnapshotScript } from "../src/cli.js";

function fixture(t, count) {
  const directory = mkdtempSync(path.join(tmpdir(), "topic-growth-integration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "synthetic.sqlite");
  const state = createDemoState({ generation: "synthetic-growth", createdAt: "2026-01-01T00:00:00.000Z", sources: [], topicSeeds: [] });
  state.topics = [{ id: "topic-shared", kind: "general", title: "Synthetic shared", createdAt: "2026-01-01T00:00:00.000Z",
    provenance: "owner-local-learned-topic/v1", retainTight: false }];
  state.discussions = [{ id: "discussion-shared", topicId: "topic-shared" }];
  const values = [1, ...Array(383).fill(0)];
  state.sources = Array.from({ length: count }, (_, index) => {
    const source = { id: `source-${index}`, url: `https://example.com/articles/${index}`, title: "Synthetic page",
      provenance: "owner-local-page-embedding/v1", extractorVersion: "crawler-static-html-prefix/v1",
      embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values }, operationId: `operation-${index}`,
      policyVersion: ADAPTIVE_TOPIC_POLICY.version };
    source.operationDigest = operationDigestFor(source); return source;
  });
  state.sourceLinks = state.sources.map(source => ({ sourceId: source.id, topicId: "topic-shared", method: "learned-provisional" }));
  const repository = createNormalizedSqliteRepository(databasePath, state); repository.close();
  return { directory, databasePath, outputPath: path.join(directory, "report", "dashboard.html"),
    adapter: null, bodyMetric: null, ridgeAdapter: null };
}

test("statistics remain available above the graph limit without reading embedding payloads", t => {
  const options = fixture(t, 1001);
  const database = new DatabaseSync(options.databasePath);
  database.exec("UPDATE canonical_embeddings SET payload='UNREADABLE_VECTOR_SENTINEL'"); database.close();
  const before = readFileSync(options.databasePath);
  const result = generateDashboard({ ...options, now: () => new Date("2026-01-02T00:00:00.000Z") });
  assert.deepEqual(result.counts, { totalSources: 1001, learnedSources: 1001, displayedPages: 0, topics: 1, totalTopics: 1 });
  const bridge = readFileSync(path.join(path.dirname(options.outputPath), "snapshot.js"), "utf8");
  assert.match(bridge, /"graphLimited":true/u);
  assert.match(bridge, /"learnedPages":1001/u);
  assert.match(bridge, /"activeTopics":1/u);
  assert.equal(bridge.includes("UNREADABLE_VECTOR_SENTINEL"), false);
  assert.equal(bridge.includes("https:"), false);
  assert.deepEqual(readFileSync(options.databasePath), before);
});

test("history-only refresh is read-only and reuses the unchanged graph instead of self-triggering PCA", t => {
  const options = fixture(t, 2);
  const initial = () => new Date("2026-01-02T00:00:00.000Z");
  const later = () => new Date("2026-01-02T00:01:00.000Z");
  generateDashboard({ ...options, now: initial });
  const historyPath = path.join(options.directory, "topic-growth.sqlite");
  const history = createCatalogGrowthStore(historyPath, { now: later });
  history.sample(readCatalogGrowthCounts(options.databasePath, { now: later })); history.close();
  const before = readFileSync(historyPath), modified = statSync(historyPath).mtimeMs;
  generateDashboardSnapshot({ ...options, now: later });
  generateDashboardSnapshot({ ...options, now: later });
  assert.deepEqual(readFileSync(historyPath), before);
  assert.equal(statSync(historyPath).mtimeMs, modified);
  const bridge = readFileSync(path.join(path.dirname(options.outputPath), "snapshot.js"), "utf8");
  assert.match(bridge, /"generatedAt":"2026-01-02T00:00:00.000Z"/u);
  assert.match(bridge, /"at":"2026-01-02T00:01:00.000Z"/u);
});

test("history export rejects unknown private fields and accessors before writing the report", () => {
  const growth = { schemaVersion: "catalog-growth/v1", points: [],
    retention: { minuteHours: 24, hourlyDays: 90, maxPoints: 4096 }, token: "SECRET_SENTINEL" };
  const template = '<link rel="stylesheet" href="./style.css" data-dashboard-style>' +
    '<script src="./app.js" defer data-dashboard-script></script>' +
    '<script id="dashboard-data" type="application/json"></script>' +
    '<script id="dashboard-growth-data" type="application/json"></script>';
  assert.equal(renderSnapshotScript({}, null, growth).includes("SECRET_SENTINEL"), false);
  assert.equal(renderDashboardDocument({ template, style: "", script: "", snapshot: {}, growth }).includes("SECRET_SENTINEL"), false);
  let calls = 0;
  const poisoned = { schemaVersion: "catalog-growth/v1", retention: growth.retention };
  Object.defineProperty(poisoned, "points", { enumerable: true, get() { calls++; return "SECRET_SENTINEL"; } });
  assert.match(renderSnapshotScript({}, null, poisoned), /__topicAtlasGrowth = null/u);
  assert.equal(calls, 0);
});
