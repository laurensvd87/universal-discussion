import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDemoState } from "../src/domain/demo-state.js";
import { migrateReferenceTopicState } from "../src/domain/reference-state-migration.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createIngestionWorkerQueue } from "../src/application/ingestion-worker-queue.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { readInstalledOwnerTopicConfiguration } from "../src/application/owner-topic-configuration.js";
import { readCatalog, readEnrichment } from "../../../spikes/topic-resolution/browser/core/local-service-contract.js";

const artifact = readInstalledOwnerTopicConfiguration().alternateRidgeAdapter;
const now = () => "2026-10-13T00:00:00.000Z";
let serial = 0;
const nextId = kind => `${kind}-worker-reference-${++serial}`;
function location(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-worker-check-"));
  const closers = [];
  t.after(async () => { for (const close of closers) await close(); rmSync(directory, { recursive: true, force: true }); });
  const databasePath = path.join(directory, "canonical.sqlite");
  const state = migrateReferenceTopicState(createDemoState({ generation: "generation-reference-worker", createdAt: now(), sources: [],
    topicSeeds: [{ id: "topic-retained", title: "Retained Topic", kind: "general" }] }), { represent: () => null });
  const seed = createNormalizedSqliteRepository(databasePath, state); seed.close();
  return { databasePath, closers };
}
const request = (expected, label) => ({ expected, operationId: `operation-${label}`, url: `https://example.org/article-${label}`,
  title: `Synthetic ${label}`, extractorVersion: "main-text-prefix/v1",
  embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [1, ...Array(383).fill(0)] } });

test("real factory carries the installed pinned artifact through readonly ingestion and projection workers", { skip: artifact === null }, async t => {
  const { databasePath, closers } = location(t);
  const app = createSqliteDemoService({ databasePath, nextId, now, asyncIngest: true, alternateRidgeAdapter: artifact });
  closers.push(() => app.close());
  const first = await app.service.ingest(request(app.service.version(), "first"));
  assert.equal(first.policyVersion, "ridge1-fixed-reference-radius/v1");
  const root = app.service.command(app.service.version(), { type: "create-root", topicId: first.topicId,
    originSourceId: first.sourceId, body: "Stored once by the canonical service" }, "demo-alex");
  const second = await app.service.ingest(request(app.service.version(), "second"));
  assert.deepEqual(second.topicIds, [first.topicId]);
  const selection = { sourceId: second.sourceId, topicId: second.topicId };
  const catalog = readCatalog(await app.service.readPublic("catalogContext", selection));
  assert.deepEqual(catalog.sources.find(source => source.id === second.sourceId).topicIds, [first.topicId]);
  const enrichmentInput = { ...selection, includeAlternate: true };
  const bundle = readEnrichment(await app.service.readPublic("enrichment", enrichmentInput), enrichmentInput);
  assert.equal(bundle.alternateDiscussion.policyVersion, "ridge1-fixed-reference-radius/v1");
  assert.equal(bundle.alternateDiscussion.roots[0].id, root.result.contributionId);
  assert.equal(JSON.stringify(bundle).includes("parameterSha256"), false);
});

test("real v4 prepared worker reference cannot commit over a concurrent accepted comment or survive cancellation", { skip: artifact === null }, async t => {
  const { databasePath, closers } = location(t);
  const repository = createNormalizedSqliteRepository(databasePath, null);
  const queue = createIngestionWorkerQueue({ databasePath, alternateRidgeAdapter: artifact });
  closers.push(async () => { await queue.close(); repository.close(); });
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], nextId, now });
  const expected = service.version(), plan = await queue.prepare(request(expected, "unaccepted"), { createdAt: now() });
  service.command(expected, { type: "create-root", topicId: "topic-retained", body: "Concurrent accepted comment" }, "demo-alex");
  assert.throws(() => repository.saveScoped(expected, plan.before, plan.after), { code: "conflict" });
  assert.equal(repository.load().sources.length, 0);
  const accepted = await queue.prepare(request(service.version(), "next"), { createdAt: now() });
  assert.equal(accepted.after.topics.length, 1);
  assert.notEqual(accepted.after.topics[0].id, plan.after.topics[0].id, "unaccepted prepared reference cannot be matched on the next request");
  const guarded = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], nextId, now,
    ingestionExecutor: { prepare: async () => accepted } });
  const before = repository.load();
  await assert.rejects(guarded.ingest(request(service.version(), "next"), { isCurrent: () => false }), { code: "unavailable" });
  assert.deepEqual(repository.load(), before);
});
