import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildDashboardSnapshot, loadDashboardData, loadDashboardState } from "../src/data/catalog.js";
import { createNormalizedSqliteRepository } from "../../local-service/src/adapters/normalized-sqlite-repository.js";
import { buildGroupingPreview, readOwnerAdapter } from "../src/data/grouping-preview.js";
import { makeDiagonalAdapter } from "../../local-service/src/domain/diagonal-adapter.js";
import { makeRidgeTopicAdapter } from "../../local-service/src/domain/ridge-topic-adapter.js";
import { createOwnerTopicPlanner } from "../../local-service/src/domain/owner-topic-planner.js";
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
  assert.match(snapshot.catalogRevision, /^[a-f0-9]{64}$/u);
  const revised = { ...commented, revision: commented.revision + 1 };
  assert.notEqual(buildDashboardSnapshot(revised).catalogRevision, snapshot.catalogRevision);
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

function accountState() {
  const accountId = "12345678-1234-4123-8123-123456789abc";
  return applyCommand(state(), { type: "create-root", topicId: "topic-a", originSourceId: "page-a",
    body: "SYNTHETIC_ACCOUNT_BODY_SENTINEL" },
  { id: `account-${accountId}`, accountId, displayName: "SyntheticUser", type: "human", demo: false },
  { nextId: () => "account-contribution-one", now: () => "2026-01-01T00:00:00.000Z" }).state;
}

function syntheticDatabase(t, label) {
  const directory = mkdtempSync(join(tmpdir(), `topic-dashboard-${label}-`));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, filename: join(directory, "synthetic.sqlite") };
}

test("legacy v3 account state remains readable without exposing account bodies or changing database bytes", t => {
  const { directory, filename } = syntheticDatabase(t, "legacy-v3");
  const input = accountState();
  assert.equal(input.schema, "demo-state/v3");
  const database = new DatabaseSync(filename);
  database.exec("CREATE TABLE demo_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), schema TEXT NOT NULL, generation TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL) STRICT");
  database.prepare("INSERT INTO demo_state VALUES (1, ?, ?, ?, ?)").run(input.schema, input.generation, input.revision, JSON.stringify(input));
  database.close();
  const before = readFileSync(filename), modified = statSync(filename).mtimeMs;
  const files = readdirSync(directory);
  const now = () => new Date("2026-01-02T00:00:00.000Z");
  const actual = loadDashboardData(filename, { now });
  assert.deepEqual(actual, buildDashboardSnapshot(input, { now }));
  assert.equal(JSON.stringify(actual).includes("SYNTHETIC_ACCOUNT_BODY_SENTINEL"), false);
  assert.equal(JSON.stringify(actual).includes(input.contributions[0].authorId), false);
  assert.deepEqual(readFileSync(filename), before);
  assert.equal(statSync(filename).mtimeMs, modified);
  assert.deepEqual(readdirSync(directory), files);
});

test("normalized dashboard reads only complete catalog metadata and lossless vectors with identical graph counts and positions", t => {
  const { directory, filename } = syntheticDatabase(t, "normalized");
  const input = accountState();
  const template = input.contributions[0];
  input.contributions = Array.from({ length: 1201 }, (_, index) => ({ ...structuredClone(template), id: `synthetic-account-contribution-${index}` }));
  const repository = createNormalizedSqliteRepository(filename, input);
  repository.close();
  const before = readFileSync(filename), modified = statSync(filename).mtimeMs;
  const files = readdirSync(directory);
  const metadata = loadDashboardState(filename);
  assert.deepEqual(metadata.sources, input.sources);
  assert.deepEqual(metadata.topics, input.topics);
  assert.deepEqual(metadata.sourceLinks, input.sourceLinks);
  assert.deepEqual(metadata.contributions, []);
  assert.equal(metadata.schema, "demo-state/v3");
  const now = () => new Date("2026-01-02T00:00:00.000Z");
  const actual = loadDashboardData(filename, { now });
  assert.deepEqual(actual, buildDashboardSnapshot(input, { now }));
  const weights = Array(384 * 384).fill(0);
  for (let index = 0; index < 384; index++) weights[index * 384 + index] = 1;
  const ridge = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
  assert.deepEqual(buildGroupingPreview(metadata, actual, null, null, ridge), buildGroupingPreview(input, actual, null, null, ridge));
  for (const hidden of ["SYNTHETIC_ACCOUNT_BODY_SENTINEL", template.authorId, "embedding", "revisions"]) {
    assert.equal(JSON.stringify(actual).includes(hidden), false);
  }
  assert.equal(JSON.stringify(metadata).includes("SYNTHETIC_ACCOUNT_BODY_SENTINEL"), false);
  assert.equal(JSON.stringify(metadata).includes(template.authorId), false);
  assert.deepEqual(readFileSync(filename), before);
  assert.equal(statSync(filename).mtimeMs, modified);
  assert.deepEqual(readdirSync(directory), files);
  const inspection = new DatabaseSync(filename, { readOnly: true });
  try { assert.equal(inspection.prepare("PRAGMA journal_mode").get().journal_mode, "delete"); }
  finally { inspection.close(); }
});

test("dashboard never creates a missing database and retains the separate 1000-page graph guard", t => {
  const { filename } = syntheticDatabase(t, "missing");
  assert.throws(() => loadDashboardState(filename), { code: "ENOENT" });
  assert.equal(existsSync(filename), false);
  const input = state();
  input.sources = Array.from({ length: 1001 }, (_, index) => learned(`synthetic-page-${index}`, 0));
  input.sourceLinks = input.sources.map(source => ({ sourceId: source.id, topicId: "topic-a", method: "learned-provisional" }));
  assert.throws(() => buildDashboardSnapshot(input), /Dashboard capacity exceeded: 1001 pages; maximum 1000/u);
});

test("alternate preview covers every displayed Source once, preserving manual pins as singletons", () => {
  const input = state();
  input.sourceLinks[2].method = "manual-confirmed";
  const snapshot = buildDashboardSnapshot(input);
  const adapter = makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 });
  const preview = buildGroupingPreview(input, snapshot, adapter);
  assert.equal(preview.catalogRevision, snapshot.catalogRevision);
  assert.deepEqual(preview.groups, [{ sourceIds: ["page-a", "page-b"] }, { sourceIds: ["page-c"] }]);
  assert.deepEqual(Object.keys(preview), ["schemaVersion", "catalogRevision", "groups"]);
  assert.ok(!JSON.stringify(preview).includes("parameters"));
  assert.ok(!JSON.stringify(preview).includes("Synthetic"));
  assert.deepEqual(input.sourceLinks[2], { sourceId: "page-c", topicId: "topic-b", method: "manual-confirmed" });
});

test("Ridge dashboard preview uses the service planner partition without changing canonical assignments", () => {
  const input = state();
  const canonicalBefore = JSON.stringify(input);
  const weights = Array(384 * 384).fill(0);
  for (let index = 0; index < 384; index++) weights[index * 384 + index] = 1;
  const ridgeAdapter = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
  const snapshot = buildDashboardSnapshot(input);
  const expected = createOwnerTopicPlanner({ ridgeAdapter }).plan(input).partitions;
  const preview = buildGroupingPreview(input, snapshot, null, null, ridgeAdapter);
  assert.deepEqual(preview.groups, expected);
  assert.deepEqual(preview.groups, [{ sourceIds: ["page-a", "page-b"] }, { sourceIds: ["page-c"] }]);
  assert.deepEqual(Object.keys(preview), ["schemaVersion", "catalogRevision", "groups"]);
  assert.equal(preview.catalogRevision, snapshot.catalogRevision);
  assert.equal(JSON.stringify(input), canonicalBefore);
  assert.deepEqual(snapshot.pages.map(({ id, topicId }) => [id, topicId]),
    [["page-a", "topic-a"], ["page-b", "topic-b"], ["page-c", "topic-b"]]);
  assert.ok(!JSON.stringify(preview).includes("weights"));
  assert.ok(!JSON.stringify(preview).includes("embedding"));
  assert.ok(!JSON.stringify(preview).includes("Synthetic"));
});

test("owner adapter loader accepts only bounded, valid local file", () => {
  const directory = mkdtempSync(join(tmpdir(), "topic-dashboard-adapter-"));
  try {
    const filename = join(directory, "adapter.json");
    assert.equal(readOwnerAdapter(filename), null);
    writeFileSync(filename, JSON.stringify(makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 })));
    assert.equal(readOwnerAdapter(filename).parameters.length, 384);
    writeFileSync(filename, JSON.stringify({ parameters: Array(384).fill(0) }));
    assert.equal(readOwnerAdapter(filename), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
