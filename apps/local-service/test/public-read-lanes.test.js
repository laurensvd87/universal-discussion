import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { makeDiagonalAdapter } from "../src/domain/diagonal-adapter.js";
import { BROWSER_MODEL_ID } from "../src/domain/learned-sources.js";
import { readCatalog, readAlternateDiscussion } from "../../../spikes/topic-resolution/browser/core/local-service-contract.js";

let serial = 0;
const dependencies = () => ({ nextId: kind => `${kind}-lane-${++serial}`, now: () => "2026-10-13T12:00:00Z" });
function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-read-lanes-"));
  const databasePath = path.join(directory, "canonical.sqlite");
  const closers = [];
  t.after(async () => { for (const close of closers.reverse()) await close(); rmSync(directory, { recursive: true, force: true }); });
  const app = createSqliteDemoService({ databasePath, storageMode: "normalized", ...dependencies(), ...options });
  closers.push(() => app.close());
  return { app, databasePath, closers };
}
function ingest(service, name, angle = 0, operation = name) {
  const values = Array(384).fill(0); values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return service.ingest({ expected: service.version(), operationId: `operation-${operation}`, url: `https://example.org/lane-${name}`,
    title: `Synthetic lane ${name}`, extractorVersion: "main-text-prefix/v1", embedding: { modelId: BROWSER_MODEL_ID, values } });
}

test("fast selected canonical context performs no full catalog ranking, historical read or Ridge plan", t => {
  const { app, databasePath, closers } = fixture(t);
  const selected = ingest(app.service, "one");
  const repository = createNormalizedSqliteRepository(databasePath, null);
  closers.push(() => repository.close());
  const service = createDiscussionService({ repository: { ...repository,
    load() { throw new Error("Full snapshot forbidden for canonical context"); },
    readCatalogPage() { throw new Error("Full ranking forbidden for selected context"); },
    readPriorSourceState() { throw new Error("Historical enrichment forbidden for canonical context"); },
  }, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], ...dependencies(),
    alternateAdapter: makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 }) });
  const catalog = service.catalogContext({ sourceId: selected.sourceId, topicId: selected.topicId });
  assert.equal(catalog.sources.find(source => source.id === selected.sourceId).topicId, selected.topicId);
  assert.deepEqual(catalog.version, service.version());
});

test("enrichment carries exact proof metadata for related, historical and alternate projections", async t => {
  const alternateAdapter = makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 });
  const { app } = fixture(t, { alternateAdapter, asyncReads: true });
  const one = ingest(app.service, "one");
  app.service.command(app.service.version(), { type: "create-root", topicId: one.topicId, originSourceId: one.sourceId,
    body: "Historical source thread remains" }, "demo-alex");
  const two = ingest(app.service, "two", .1);
  app.service.command(app.service.version(), { type: "correct-source", sourceId: two.sourceId, topicId: null }, "demo-alex");
  const current = ingest(app.service, "one", Math.PI / 2, "one-update");
  const foreign = ingest(app.service, "two", Math.PI / 2 + .05, "two-update");
  const fast = app.service.catalogContext({ sourceId: current.sourceId, topicId: current.topicId });
  assert.ok(!fast.topics.some(topic => topic.id === one.topicId));
  assert.ok(!fast.sources.some(source => source.id === foreign.sourceId));
  const bundle = app.service.enrichment({ sourceId: current.sourceId, topicId: current.topicId, includeAlternate: true });
  assert.deepEqual(Object.keys(bundle).sort(), ["alternateDiscussion", "catalog", "discussion", "errors", "priorDiscussions", "related"]);
  assert.deepEqual(bundle.errors, { related: null, prior: null, alternate: null });
  assert.ok(bundle.catalog.sources.some(source => source.id === foreign.sourceId));
  assert.ok(bundle.catalog.topics.some(topic => topic.id === one.topicId));
  assert.ok(bundle.related.results.some(source => source.id === foreign.sourceId));
  assert.ok(bundle.priorDiscussions.topics.some(topic => topic.id === one.topicId));
  for (const value of [bundle.discussion, bundle.related, bundle.priorDiscussions, bundle.alternateDiscussion])
    assert.deepEqual(value.version, bundle.catalog.version);
  readAlternateDiscussion(bundle.alternateDiscussion, current.sourceId, readCatalog(bundle.catalog), bundle.discussion);
  const isolated = await app.service.readPublic("enrichment", { sourceId: current.sourceId, topicId: current.topicId, includeAlternate: true });
  assert.deepEqual(isolated, bundle, "dedicated real readonly projector preserves exact bundle DTO");
  assert.throws(() => app.service.enrichment({ sourceId: current.sourceId, topicId: one.topicId, includeAlternate: true }), error => error.code === "conflict");
});

test("optional Ridge unavailable preserves canonical bundle and false selection never requires it", t => {
  const { app } = fixture(t);
  const selected = ingest(app.service, "one");
  const falseBundle = app.service.enrichment({ sourceId: selected.sourceId, topicId: selected.topicId, includeAlternate: false });
  assert.equal(falseBundle.alternateDiscussion, null); assert.equal(falseBundle.errors.alternate, null);
  const trueBundle = app.service.enrichment({ sourceId: selected.sourceId, topicId: selected.topicId, includeAlternate: true });
  assert.equal(trueBundle.alternateDiscussion, null); assert.equal(trueBundle.errors.alternate, "unavailable");
  assert.deepEqual(trueBundle.discussion, app.service.discussion(selected.topicId));
  assert.equal(trueBundle.errors.related, null); assert.equal(trueBundle.errors.prior, null);
});

test("held projection cannot occupy fast canonical worker or block its ingestion barrier", async t => {
  const projections = [];
  const projection = new EventEmitter(); projection.postMessage = value => projections.push(value); projection.terminate = async () => 0;
  const { app } = fixture(t, { asyncIngest: true, asyncReads: true, projectionWorkerOptions: { workerFactory: () => projection, maxTasks: 1 } });
  const first = await ingest(app.service, "one");
  const held = app.service.readPublic("enrichment", { sourceId: first.sourceId, topicId: first.topicId, includeAlternate: false });
  const heldRejected = assert.rejects(held, error => error.code === "conflict");
  assert.equal(projections.length, 1);
  await assert.rejects(app.service.readPublic("related", { sourceId: first.sourceId, limit: 20 }), error => error.code === "capacity");
  const fast = await app.service.readPublic("catalogContext", { sourceId: first.sourceId, topicId: first.topicId });
  assert.equal(fast.sources.find(source => source.id === first.sourceId).topicId, first.topicId);
  const accepted = await ingest(app.service, "two", Math.PI / 2);
  assert.equal(accepted.version.revision, first.version.revision + 1);
  const message = projections[0];
  projection.emit("message", { id: message.id, ok: true, plan: { version: message.input.version,
    value: { catalog: fast, discussion: {}, related: null, priorDiscussions: null, alternateDiscussion: null, errors: {} } } });
  await heldRejected;
  const fresh = await app.service.readPublic("catalogContext", { sourceId: accepted.sourceId, topicId: accepted.topicId });
  assert.deepEqual(fresh.version, accepted.version);
});

test("disabled alternate never calls its planner path and optional failures disclose only fixed codes", t => {
  const { app, databasePath, closers } = fixture(t);
  const selected = ingest(app.service, "one");
  const repository = createNormalizedSqliteRepository(databasePath, null);
  closers.push(() => repository.close());
  let alternateCalls = 0;
  const service = createDiscussionService({ repository: { ...repository,
    readSourceState() { alternateCalls++; throw new Error("Private diagnostic must never be disclosed"); },
    readPriorSourceState() { throw new Error("Private prior diagnostic"); },
  }, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], ...dependencies(),
    alternateAdapter: makeDiagonalAdapter(Array(384).fill(0), { triplets: 100 }) });
  const disabled = service.enrichment({ sourceId: selected.sourceId, topicId: selected.topicId, includeAlternate: false });
  assert.equal(alternateCalls, 0); assert.equal(disabled.errors.prior, "invalid-response");
  assert.equal(disabled.errors.alternate, null); assert.equal(disabled.priorDiscussions, null);
  const enabled = service.enrichment({ sourceId: selected.sourceId, topicId: selected.topicId, includeAlternate: true });
  assert.equal(alternateCalls, 1); assert.equal(enabled.errors.alternate, "invalid-response");
  assert.equal(JSON.stringify(enabled).includes("Private"), false);
  assert.deepEqual(enabled.discussion.version, enabled.catalog.version);
});

test("canonical mutation during optional enrichment rejects the entire old bundle without rebasing", t => {
  const { app, databasePath, closers } = fixture(t);
  const selected = ingest(app.service, "one");
  const repository = createNormalizedSqliteRepository(databasePath, null);
  closers.push(() => repository.close());
  const service = createDiscussionService({ repository: { ...repository,
    readPriorSourceState(sourceId) {
      const prior = repository.readPriorSourceState(sourceId);
      app.service.command(app.service.version(), { type: "create-root", topicId: selected.topicId, body: "Concurrent canonical write" }, "demo-alex");
      return prior;
    },
  }, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], ...dependencies() });
  const before = app.service.version();
  assert.throws(() => service.enrichment({ sourceId: selected.sourceId, topicId: selected.topicId, includeAlternate: false }), error => error.code === "conflict");
  assert.equal(app.service.version().revision, before.revision + 1);
  assert.equal(app.service.discussion(selected.topicId).roots[0].body, "Concurrent canonical write");
});

test("projection cancellation retires only its own worker and core reads continue", async t => {
  let projectionRetired = false;
  const projection = new EventEmitter(); projection.postMessage = () => {};
  projection.terminate = async () => { projectionRetired = true; };
  const { app } = fixture(t, { asyncReads: true, projectionWorkerOptions: { workerFactory: () => projection } });
  const selected = ingest(app.service, "one");
  const controller = new AbortController();
  const pending = app.service.readPublic("enrichment", { sourceId: selected.sourceId, topicId: selected.topicId, includeAlternate: false }, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, error => error.code === "unavailable");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(projectionRetired, true);
  const context = await app.service.readPublic("catalogContext", { sourceId: selected.sourceId, topicId: selected.topicId });
  assert.deepEqual(context.version, app.service.version());
});
