import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDemoState, FIXED_REFERENCE_STATE_SCHEMA } from "../../local-service/src/domain/demo-state.js";
import { BROWSER_MODEL_ID, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE } from "../../local-service/src/domain/learned-sources.js";
import { operationDigestFor } from "../../local-service/src/domain/source-threads.js";
import { RIDGE_PARAMETER_SHA256 } from "../../local-service/src/domain/ridge-topic-adapter.js";
import { readCatalogGrowthHistoryV2 } from "../../local-service/src/metrics/catalog-growth.js";
import { createNormalizedSqliteRepository } from "../../local-service/src/adapters/normalized-sqlite-repository.js";
import { createPGliteDatabase } from "../../local-service/portable/src/database.js";
import { importCanonicalV4, migrateCanonicalV4 } from "../../local-service/portable/canonical-v4/index.js";
import { buildDashboardSnapshotV2 } from "../src/data/catalog.js";
import { createPostgresDashboardSource } from "../src/data/postgres-catalog.js";
import { generatePostgresDashboard, readPostgresDashboardRefreshKey,
  startPostgresDashboardGrowthSampler } from "../src/cli.js";

const START = "2026-10-13T12:00:00.000Z";
const unit = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];

function canonicalState() {
  const state = createDemoState({ generation: "postgres-dashboard-fixture", createdAt: START, sources: [],
    topicSeeds: ["a", "c", "empty"].map(id => ({ id: `topic-${id}`, title: `Synthetic ${id}`, kind: "general" })) });
  state.schema = FIXED_REFERENCE_STATE_SCHEMA;
  state.sources = ["a", "b", "c"].map((id, index) => {
    const source = { id, title: `Synthetic ${id}`, url: `https://example.org/articles/${id}`,
      provenance: LEARNED_SOURCE_PROVENANCE, extractorVersion: "main-text-prefix/v1",
      policyVersion: "ridge1-fixed-reference-radius/v1", operationId: `operation-${id}`,
      embedding: { modelId: BROWSER_MODEL_ID, values: unit(index * 0.4) },
      topicIds: id === "b" ? ["topic-a", "topic-c"] : [`topic-${id}`] };
    return { ...source, operationDigest: operationDigestFor(source) };
  });
  state.sourceLinks = state.sources.map(source => ({ sourceId: source.id,
    topicId: source.topicIds[0], method: "learned-provisional" }));
  for (const topic of state.topics) {
    if (topic.id === "topic-empty") { topic.reference = null; continue; }
    Object.assign(topic, { provenance: LEARNED_TOPIC_PROVENANCE, retainTight: false,
      reference: { sourceId: topic.id.slice(6), parameterSha256: RIDGE_PARAMETER_SHA256,
        values: unit(topic.id === "topic-a" ? 0 : 0.8) } });
  }
  return state;
}

async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-postgres-dashboard-"));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const sqlitePath = path.join(directory, "canonical.sqlite"), state = canonicalState();
  const repository = createNormalizedSqliteRepository(sqlitePath, state); repository.close();
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec("CREATE ROLE murmingle_owner; CREATE ROLE murmingle_app");
  await migrateCanonicalV4(database);
  await importCanonicalV4({ database, sqlitePath });
  const queries = [];
  const observed = {
    query: (...args) => database.query(...args),
    transaction: callback => database.transaction(tx => callback({ ...tx,
      query(sql, parameters = []) { queries.push(sql); return tx.query(sql, parameters); } })),
  };
  return { directory, state, database, queries, source: createPostgresDashboardSource({ database: observed }) };
}

test("PostgreSQL dashboard reads one validated v4 MVCC catalog without contribution bodies", async t => {
  const f = await fixture(t);
  const current = await f.source.readSnapshot({ now: () => new Date(START) });
  assert.equal(current.header.generation, f.state.generation);
  assert.equal(current.header.revision, f.state.revision);
  assert.deepEqual(current.state, { ...f.state, contributions: [] });
  assert.deepEqual(current.point, {
    at: START,
    seriesId: createHashFor(f.state.generation),
    revision: 0,
    totalSources: 3,
    learnedPages: 3,
    activeTopics: 2,
    totalTopics: 3,
    multiMemberTopics: 2,
    singletonTopics: 0,
  });
  const dashboard = buildDashboardSnapshotV2(current.state, { now: () => new Date(START) });
  assert.equal(dashboard.counts.learnedSources, 3);
  assert.equal(dashboard.counts.multiMemberTopics, 2);
  assert.deepEqual(dashboard.pages.find(page => page.id === "b").topicIds, ["topic-a", "topic-c"]);
  assert.equal(f.queries.some(sql => /FROM canonical_v4\.revisions/u.test(sql)), false);
  assert.equal(f.queries.some(sql => /SELECT\s+\*\s+FROM canonical_v4\.contributions/iu.test(sql)), false);
});

test("PostgreSQL aggregate-only path does not select vectors or private payloads above the graph limit", async t => {
  const f = await fixture(t);
  f.queries.length = 0;
  const current = await f.source.readSnapshot({ now: () => new Date(START), graphLimit: 2 });
  assert.equal(current.state, null);
  assert.equal(current.point.learnedPages, 3);
  assert.equal(current.point.multiMemberTopics, 2);
  assert.equal(f.queries.some(sql => /canonical_v4\.(?:embeddings|fixed_references|operation_receipts|contributions|revisions)/u.test(sql)), false);
  assert.equal(f.queries.some(sql => /\bpayload\b/iu.test(sql)), false);
});

test("PostgreSQL dashboard generation keeps v2 overlap history outside the canonical database", async t => {
  const f = await fixture(t), outputPath = path.join(f.directory, "report", "dashboard.html");
  const growthPath = path.join(f.directory, "derived", "topic-growth-v2.sqlite");
  mkdirSync(path.dirname(growthPath), { mode: 0o700 });
  const result = await generatePostgresDashboard({ source: f.source, outputPath, growthPath,
    adapter: null, bodyMetric: null, ridgeAdapter: null, now: () => new Date(START) });
  assert.equal(result.counts.learnedSources, 3);
  assert.equal(result.counts.multiMemberTopics, 2);
  assert.equal(result.counts.singletonTopics, 0);
  assert.equal(existsSync(outputPath), true);
  assert.equal(existsSync(growthPath), true);
  const bridge = readFileSync(path.join(path.dirname(outputPath), "snapshot.js"), "utf8");
  assert.match(bridge, /catalog-growth\/v2/u);
  assert.match(bridge, /"multiMemberTopics":2/u);
  const key = JSON.parse(await readPostgresDashboardRefreshKey(f.source, { growthPath,
    ridgePath: path.join(f.directory, "absent-ridge"), adapterPath: path.join(f.directory, "absent-adapter"),
    bodyPath: path.join(f.directory, "absent-body") }));
  assert.equal(JSON.parse(key[0])[0], f.state.generation);
  assert.equal(Number.isSafeInteger(JSON.parse(key[0])[1]), true);
});

test("PostgreSQL dashboard growth sampler keeps live v2 history advancing after startup", async t => {
  const f = await fixture(t), growthPath = path.join(f.directory, "derived", "topic-growth-v2.sqlite");
  mkdirSync(path.dirname(growthPath), { mode: 0o700 });
  let now = new Date(START), scheduled;
  const sampler = startPostgresDashboardGrowthSampler({ source: f.source, growthPath, now: () => now,
    setIntervalImpl: callback => { scheduled = callback; return 1; }, clearIntervalImpl: () => {} });
  try {
    await sampler.sample();
    let history = readCatalogGrowthHistoryV2(growthPath, { now: () => now });
    assert.equal(history.points.length, 1);
    assert.equal(history.points[0].learnedPages, 3);
    now = new Date("2026-10-13T12:01:00.000Z");
    scheduled();
    await sampler.sample();
    history = readCatalogGrowthHistoryV2(growthPath, { now: () => now });
    assert.equal(history.points.length, 2);
    assert.equal(history.points.at(-1).at, now.toISOString());
    assert.equal(history.points.at(-1).learnedPages, 3);
  } finally { await sampler.close(); }
});

function createHashFor(value) {
  // Keep the expected series calculation independent of dashboard internals.
  return createHash("sha256").update(value, "utf8").digest("hex");
}
