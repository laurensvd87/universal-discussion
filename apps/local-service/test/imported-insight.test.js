import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { applyCommand, createDemoState } from "../src/domain/demo-state.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { assertValidPersistedState } from "../src/domain/persisted-state.js";
import { ServiceError } from "../src/domain/errors.js";
import { demoService, deterministicDependencies } from "./helpers.js";

const command = { type: "share-insight", topicId: "harbor-s2", body: "Deliberately shared finding" };
const code = (expected) => (error) => error instanceof ServiceError && error.code === expected;

test("manual import has structural agent provenance, fixed identity, and human operator controls", () => {
  const service = demoService();
  const initial = service.catalog().version;
  assert.deepEqual(service.catalog().actors.map((actor) => actor.id), ["demo-alex", "demo-blair"]);
  assert.throws(() => service.command(initial, command, "demo-imported-ai"), code("forbidden"));
  for (const extra of [{ authorId: "demo-alex" }, { actorType: "human" }, { operatorId: "demo-blair" },
    { provider: "claimed" }, { model: "claimed" }, { insight: { kind: "manual-import", operatorId: "demo-blair" } },
    { privateContext: "unshared" }]) {
    assert.throws(() => service.command(initial, { ...command, ...extra }, "demo-alex"), code("invalid"));
  }
  service.command(initial, command, "demo-alex");
  let view = service.discussion("harbor-s2");
  const root = view.roots[0];
  assert.equal(root.rootId, null);
  assert.equal(root.authorId, "demo-imported-ai");
  assert.equal(root.actorType, "agent");
  assert.deepEqual(root.insight, { kind: "manual-import", operatorId: "demo-alex" });
  assert.throws(() => service.command(initial, command, "demo-alex"), code("conflict"));
  assert.throws(() => service.command(view.version, { type: "edit", contributionId: root.id, body: "Stolen" }, "demo-blair"), code("forbidden"));
  assert.throws(() => service.command(view.version, { type: "withdraw", contributionId: root.id }, "demo-blair"), code("forbidden"));
  service.command(view.version, { type: "reply", discussionId: view.discussionId, rootId: root.id, replyToId: null, body: "Human reply" }, "demo-blair");
  view = service.discussion("harbor-s2");
  assert.equal(view.roots[0].replies[0].actorType, "human");
  assert.equal(Object.hasOwn(view.roots[0].replies[0], "insight"), false);
  service.command(view.version, { type: "edit", contributionId: root.id, body: "Corrected finding" }, "demo-alex");
  view = service.discussion("harbor-s2");
  assert.equal(view.roots[0].body, "Corrected finding");
  assert.equal(view.roots[0].edited, true);
  assert.deepEqual(view.roots[0].insight, root.insight);
  service.command(view.version, { type: "withdraw", contributionId: root.id }, "demo-alex");
  view = service.discussion("harbor-s2");
  assert.deepEqual(view.roots[0], { id: root.id, rootId: null, replyToId: null, state: "deleted", label: "Deleted", replies: view.roots[0].replies });
  assert.equal(JSON.stringify(view).includes("Deliberately shared finding"), false);
  assert.equal(JSON.stringify(view).includes("Corrected finding"), false);
  assert.equal(JSON.stringify(view).includes("operatorId"), false);
});

test("SQLite v2 retains imported roots and old human roots, then purges imported personal data", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "insight-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "demo.sqlite");
  let app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  app.service.command(app.service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Existing human" }, "demo-blair");
  app.service.command(app.service.catalog().version, { ...command, originSourceId: "harbor-overview" }, "demo-alex");
  let view = app.service.discussion("harbor-s2");
  const importedId = view.roots[0].id;
  assert.equal(view.roots[0].origin.sourceId, "harbor-overview");
  app.close();
  app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  view = app.service.discussion("harbor-s2");
  assert.equal(view.roots[0].insight.operatorId, "demo-alex");
  assert.equal(view.roots[1].actorType, "human");
  app.service.command(view.version, { type: "withdraw", contributionId: importedId }, "demo-alex");
  app.close();
  const db = new DatabaseSync(databasePath);
  const document = db.prepare("SELECT document FROM demo_state WHERE singleton = 1").get().document;
  db.close();
  assert.equal(document.includes("Deliberately shared finding"), false);
  assert.equal(document.includes("demo-imported-ai"), false);
  assert.equal(document.includes('"insight"'), false);
  assert.equal(document.includes('"originSourceId":"harbor-overview"'), false);
  assert.equal(document.includes("Existing human"), true);
});

test("persisted validator rejects spoofed agent variants and human insight metadata", () => {
  const deps = deterministicDependencies();
  const initial = createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const state = applyCommand(initial, command, { id: "demo-alex", type: "human", demo: true }, deps).state;
  assert.doesNotThrow(() => assertValidPersistedState(state));
  for (const change of [
    (post) => { post.authorId = "demo-alex"; },
    (post) => { post.insight.operatorId = "demo-blair-unknown"; },
    (post) => { post.insight.kind = "provider-generated"; },
    (post) => { post.insight.provider = "claimed"; },
    (post) => { delete post.insight; },
    (post) => { post.rootId = "some-root"; },
    (post) => { post.actorType = "human"; },
  ]) {
    const variant = structuredClone(state);
    change(variant.contributions[0]);
    assert.throws(() => assertValidPersistedState(variant), TypeError);
  }
  const legacy = structuredClone(state);
  legacy.schema = "demo-state/v1";
  assert.throws(() => assertValidPersistedState(legacy), TypeError);
});

test("source correction moves imported root with human reply; forgetting source removes its link", () => {
  const deps = deterministicDependencies();
  const initial = createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createMemoryRepository(initial);
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...deps });
  const values = Array(384).fill(0); values[0] = 1;
  const learned = service.ingest({ expected: service.catalog().version, operationId: "insight-anchor-source",
    url: "https://example.com/articles/insight-anchor", title: "Synthetic article",
    embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION });
  const rootId = service.command(service.catalog().version, { ...command, topicId: learned.topicId, originSourceId: learned.sourceId }, "demo-alex").result.contributionId;
  const discussionId = service.discussion(learned.topicId).discussionId;
  service.command(service.catalog().version, { type: "reply", discussionId, rootId, replyToId: null, body: "Human context" }, "demo-blair");
  const movedTopicId = service.command(service.catalog().version, { type: "correct-source", sourceId: learned.sourceId, topicId: null }, "demo-alex").result.topicId;
  assert.equal(service.discussion(learned.topicId).roots.length, 0);
  let moved = service.discussion(movedTopicId).roots[0];
  assert.equal(moved.id, rootId);
  assert.equal(moved.actorType, "agent");
  assert.equal(moved.replies[0].body, "Human context");
  assert.equal(moved.origin.sourceId, learned.sourceId);
  service.command(service.catalog().version, { type: "forget-source", sourceId: learned.sourceId }, "demo-alex");
  moved = service.discussion(movedTopicId).roots[0];
  assert.equal(moved.origin, undefined);
  assert.deepEqual(moved.insight, { kind: "manual-import", operatorId: "demo-alex" });
});
