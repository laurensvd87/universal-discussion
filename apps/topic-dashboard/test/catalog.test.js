import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildDashboardSnapshot, loadDashboardData } from "../src/data/catalog.js";
import { operationDigestFor } from "../../local-service/src/domain/source-threads.js";
import { applyCommand } from "../../local-service/src/domain/demo-state.js";
import { ADAPTIVE_TOPIC_POLICY } from "../../local-service/src/domain/adaptive-topics.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION, LEARNED_SOURCE_PROVENANCE,
  LEARNED_TOPIC_PROVENANCE } from "../../local-service/src/domain/learned-sources.js";

function vector(angle) {
  return [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
}

function learned(id, angle) {
  const source = { id, url: `https://example.com/articles/${id}`, title: `Synthetic ${id}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: vector(angle) },
    provenance: LEARNED_SOURCE_PROVENANCE, extractorVersion: EXTRACTOR_VERSION,
    operationId: `operation-${id}`, policyVersion: ADAPTIVE_TOPIC_POLICY.version };
  source.operationDigest = operationDigestFor(source);
  return source;
}

function state() {
  return { schema: "demo-state/v2", generation: "synthetic-generation", revision: 0,
    topics: [
      { id: "topic-a", kind: "general", title: "Synthetic A", createdAt: "2026-01-01T00:00:00.000Z",
        provenance: LEARNED_TOPIC_PROVENANCE, retainTight: false },
      { id: "topic-b", kind: "general", title: "Synthetic B", createdAt: "2026-01-01T00:00:00.000Z",
        provenance: LEARNED_TOPIC_PROVENANCE, retainTight: false },
      { id: "topic-empty", kind: "general", title: "Empty", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    discussions: ["topic-a", "topic-b", "topic-empty"].map((topicId) => ({ id: `discussion-${topicId}`, topicId })),
    contributions: [], sources: [learned("page-a", 0), learned("page-b", 0.1), learned("page-c", 2)],
    sourceLinks: [
      { sourceId: "page-a", topicId: "topic-a", method: "learned-provisional" },
      { sourceId: "page-b", topicId: "topic-b", method: "learned-provisional" },
      { sourceId: "page-c", topicId: "topic-b", method: "learned-provisional" },
    ] };
}

test("snapshot returns only allowlisted metadata and ranks cosine neighbors across Topic boundaries", () => {
  const commented = applyCommand(state(), { type: "create-root", topicId: "topic-a",
    originSourceId: "page-a", body: "SYNTHETIC_COMMENT_SENTINEL" },
  { id: "demo-alex", type: "human", demo: true },
  { nextId: () => "contribution-test", now: () => "2026-01-01T00:00:00.000Z" }).state;
  const snapshot = buildDashboardSnapshot(commented, { now: () => new Date("2026-01-02T00:00:00.000Z") });
  assert.deepEqual(snapshot.counts, { totalSources: 3, learnedSources: 3, displayedPages: 3, topics: 2, totalTopics: 3 });
  assert.equal(snapshot.generatedAt, "2026-01-02T00:00:00.000Z");
  assert.equal(snapshot.topics.length, 2);
  assert.deepEqual(Object.keys(snapshot.pages[0]), ["id", "title", "url", "host", "topicId", "x", "y"]);
  assert.ok(snapshot.pages.every((page) => page.x >= 0 && page.x <= 1 && page.y >= 0 && page.y <= 1));
  assert.ok(snapshot.edges.some((edge) => edge.sourceId === "page-a" && edge.targetId === "page-b" && edge.score > 0.99));
  assert.ok(!JSON.stringify(snapshot).includes("operation-page"));
  assert.ok(!JSON.stringify(snapshot).includes("embedding"));
  assert.ok(!JSON.stringify(snapshot).includes("SYNTHETIC_COMMENT_SENTINEL"));
  assert.deepEqual(buildDashboardSnapshot(commented, { now: () => new Date("2026-01-02T00:00:00.000Z") }), snapshot);
});

test("reads SQLite in read-only mode without changing its state", () => {
  const directory = mkdtempSync(join(tmpdir(), "topic-dashboard-test-"));
  const path = join(directory, "synthetic.sqlite");
  const input = state();
  const database = new DatabaseSync(path);
  try {
    database.exec("CREATE TABLE demo_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), schema TEXT NOT NULL, generation TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL) STRICT");
    database.prepare("INSERT INTO demo_state VALUES (1, ?, ?, ?, ?)").run(input.schema, input.generation, input.revision, JSON.stringify(input));
    const first = loadDashboardData(path, { now: () => new Date("2026-01-02T00:00:00.000Z") });
    assert.equal(first.pages.length, 3);
    assert.equal(database.prepare("SELECT revision FROM demo_state").get().revision, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("edge scores remain cosine similarities when retained vectors have permitted norm drift", () => {
  const input = state();
  input.sources[0].embedding.values[0] *= 1.005;
  input.sources[0].operationDigest = operationDigestFor(input.sources[0]);
  const snapshot = buildDashboardSnapshot(input);
  const edge = snapshot.edges.find((item) => item.sourceId === "page-a" && item.targetId === "page-b");
  assert.ok(edge);
  assert.ok(Math.abs(edge.score - Math.cos(0.1)) < 1e-12);
});
