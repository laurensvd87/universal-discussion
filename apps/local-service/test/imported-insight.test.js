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

const command = { type: "share-insight", topicId: "harbor-s2", body: "Deliberately shared finding", operationId: "completed-op" };
const code = (expected) => (error) => error instanceof ServiceError && error.code === expected;
const proof = (value, actorId = "demo-alex") => ({ kind: "generated-insight", operationId: value.operationId,
  actorId, topicId: value.topicId, body: value.body, originSourceId: value.originSourceId ?? null,
  rootId: null, replyToId: null, discussionId: null });
const share = (service, expected, value = command, actorId = "demo-alex") =>
  service.command(expected, value, actorId, proof(value, actorId));

test("generated share requires matching server proof and cannot be edited", () => {
  const service = demoService();
  const initial = service.catalog().version;
  assert.deepEqual(service.catalog().actors.map((actor) => actor.id), ["demo-alex", "demo-blair"]);
  assert.throws(() => service.command(initial, command, "demo-imported-ai"), code("forbidden"));
  assert.throws(() => service.command(initial, command, "demo-alex"), code("forbidden"));
  for (const altered of [
    { body: "Forged finding" }, { topicId: "harbor-s3" }, { operationId: "other-op" },
    { originSourceId: "harbor-overview" },
  ]) assert.throws(() => service.command(initial, { ...command, ...altered }, "demo-alex", proof(command)), code("forbidden"));
  assert.throws(() => service.command(initial, command, "demo-blair", proof(command)), code("forbidden"));
  for (const extra of [{ authorId: "demo-alex" }, { actorType: "human" }, { operatorId: "demo-blair" },
    { provider: "claimed" }, { model: "claimed" }, { insight: { kind: "manual-import", operatorId: "demo-blair" } },
    { privateContext: "unshared" }]) {
    assert.throws(() => service.command(initial, { ...command, ...extra }, "demo-alex", proof(command)), code("invalid"));
  }
  share(service, initial);
  let view = service.discussion("harbor-s2");
  const root = view.roots[0];
  assert.equal(root.rootId, null);
  assert.equal(root.authorId, "demo-imported-ai");
  assert.equal(root.actorType, "agent");
  assert.deepEqual(root.insight, { kind: "generated", operatorId: "demo-alex" });
  assert.throws(() => service.command(initial, command, "demo-alex"), code("conflict"));
  assert.throws(() => service.command(view.version, { type: "edit", contributionId: root.id, body: "Stolen" }, "demo-blair"), code("forbidden"));
  assert.throws(() => service.command(view.version, { type: "withdraw", contributionId: root.id }, "demo-blair"), code("forbidden"));
  service.command(view.version, { type: "reply", discussionId: view.discussionId, rootId: root.id, replyToId: null, body: "Human reply" }, "demo-blair");
  view = service.discussion("harbor-s2");
  assert.equal(view.roots[0].replies[0].actorType, "human");
  assert.equal(Object.hasOwn(view.roots[0].replies[0], "insight"), false);
  assert.throws(() => service.command(view.version, { type: "edit", contributionId: root.id, body: "Corrected finding" }, "demo-alex"), code("forbidden"));
  assert.deepEqual(service.catalog().version, view.version);
  view = service.discussion("harbor-s2");
  assert.equal(view.roots[0].body, "Deliberately shared finding");
  assert.equal(view.roots[0].edited, false);
  assert.deepEqual(view.roots[0].insight, root.insight);
  service.command(view.version, { type: "withdraw", contributionId: root.id }, "demo-alex");
  view = service.discussion("harbor-s2");
  assert.deepEqual(view.roots[0], { id: root.id, rootId: null, replyToId: null, state: "deleted", label: "Deleted by user", replies: view.roots[0].replies });
  assert.equal(JSON.stringify(view).includes("Deliberately shared finding"), false);
  assert.equal(JSON.stringify(view).includes("operatorId"), false);
});

test("generated follow-up can answer only its operator's published direct question", () => {
  const service = demoService();
  const rootId = share(service, service.catalog().version).result.contributionId;
  const discussionId = service.discussion("harbor-s2").discussionId;
  const questionId = service.command(service.catalog().version, { type: "reply", discussionId,
    rootId, replyToId: rootId, body: "What evidence supports this?" }, "demo-blair").result.contributionId;
  const response = { type: "share-insight-reply", operationId: "followup-one", topicId: "harbor-s2",
    discussionId, rootId, replyToId: questionId, body: "The supporting detail is limited." };
  const responseProof = { kind: "generated-insight", operationId: response.operationId,
    actorId: "demo-blair", topicId: response.topicId, discussionId,
    rootId, replyToId: questionId, body: response.body, originSourceId: null };
  const expected = service.catalog().version;
  assert.throws(() => service.command(expected, response, "demo-blair"), code("forbidden"));
  for (const [candidate, actorId] of [
    [{ ...response, body: "Edited robot answer" }, "demo-blair"],
    [{ ...response, operationId: "forged-operation" }, "demo-blair"],
    [response, "demo-alex"],
    [{ ...response, replyToId: rootId }, "demo-blair"],
  ]) assert.throws(() => service.command(expected, candidate, actorId, responseProof), code("forbidden"));
  const nestedId = service.command(expected, { type: "reply", discussionId,
    rootId, replyToId: questionId, body: "Nested question" }, "demo-blair").result.contributionId;
  const nested = { ...response, replyToId: nestedId };
  assert.throws(() => service.command(service.catalog().version, nested, "demo-blair",
    { ...responseProof, replyToId: nestedId }), code("forbidden"));
  const answerId = service.command(service.catalog().version, response, "demo-blair", responseProof).result.contributionId;
  let view = service.discussion("harbor-s2");
  const answer = view.roots[0].replies.find((entry) => entry.id === answerId);
  assert.equal(answer.replyToId, questionId);
  assert.equal(answer.actorType, "agent");
  assert.deepEqual(answer.insight, { kind: "generated", operatorId: "demo-blair" });
  assert.throws(() => service.command(view.version,
    { type: "edit", contributionId: answerId, body: "Changed" }, "demo-blair"), code("forbidden"));
  service.command(view.version, { type: "withdraw", contributionId: questionId }, "demo-blair");
  view = service.discussion("harbor-s2");
  assert.equal(view.roots[0].replies.find((entry) => entry.id === answerId).body, response.body);
  service.command(view.version, { type: "withdraw", contributionId: answerId }, "demo-blair");
  assert.equal(service.discussion("harbor-s2").roots[0].replies.find((entry) => entry.id === answerId).state, "deleted");
});

test("SQLite v2 retains historical edited agent roots, rejects new edits, and permits withdrawal", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "insight-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "demo.sqlite");
  let app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  app.service.command(app.service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Existing human" }, "demo-blair");
  share(app.service, app.service.catalog().version, { ...command, originSourceId: "harbor-overview" });
  let view = app.service.discussion("harbor-s2");
  const importedId = view.roots[0].id;
  assert.equal(view.roots[0].origin.sourceId, "harbor-overview");
  app.close();
  const historicalDb = new DatabaseSync(databasePath);
  const historicalState = JSON.parse(historicalDb.prepare("SELECT document FROM demo_state WHERE singleton = 1").get().document);
  const historicalRoot = historicalState.contributions.find((item) => item.id === importedId);
  historicalRoot.insight.kind = "manual-import";
  historicalRoot.revisions.push({ body: "Historical corrected finding", createdAt: historicalRoot.createdAt });
  historicalDb.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run(JSON.stringify(historicalState));
  historicalDb.close();
  app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  view = app.service.discussion("harbor-s2");
  assert.equal(view.roots[0].insight.operatorId, "demo-alex");
  assert.equal(view.roots[0].insight.kind, "manual-import");
  assert.equal(view.roots[0].body, "Historical corrected finding");
  assert.equal(view.roots[0].edited, true);
  assert.equal(view.roots[1].actorType, "human");
  assert.throws(() => app.service.command(view.version, { type: "edit", contributionId: importedId, body: "Changed after restart" }, "demo-alex"), code("forbidden"));
  assert.deepEqual(app.service.discussion("harbor-s2"), view);
  app.service.command(view.version, { type: "withdraw", contributionId: importedId }, "demo-alex");
  app.close();
  const db = new DatabaseSync(databasePath);
  const document = db.prepare("SELECT document FROM demo_state WHERE singleton = 1").get().document;
  db.close();
  assert.equal(document.includes("Deliberately shared finding"), false);
  assert.equal(document.includes("Historical corrected finding"), false);
  assert.equal(document.includes("demo-imported-ai"), false);
  assert.equal(document.includes('"insight"'), false);
  assert.equal(document.includes('"originSourceId":"harbor-overview"'), false);
  assert.equal(document.includes("Existing human"), true);
});

test("persisted validator rejects spoofed agent variants and human insight metadata", () => {
  const deps = deterministicDependencies();
  const initial = createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const state = applyCommand(initial, command, { id: "demo-alex", type: "human", demo: true },
    { ...deps, generatedProof: proof(command) }).state;
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

test("persisted validator rejects a robot reply detached from its published question", () => {
  const deps = deterministicDependencies();
  const alex = { id: "demo-alex", type: "human", demo: true };
  const blair = { id: "demo-blair", type: "human", demo: true };
  let state = createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  let outcome = applyCommand(state, command, alex, { ...deps, generatedProof: proof(command) });
  state = outcome.state;
  const rootId = outcome.result.contributionId;
  const discussionId = state.discussions.find((item) => item.topicId === command.topicId).id;
  outcome = applyCommand(state, { type: "reply", discussionId, rootId, replyToId: rootId,
    body: "What evidence?" }, blair, deps);
  state = outcome.state;
  const questionId = outcome.result.contributionId;
  const reply = { type: "share-insight-reply", topicId: command.topicId, discussionId,
    rootId, replyToId: questionId, operationId: "completed-followup", body: "Limited evidence." };
  outcome = applyCommand(state, reply, blair, { ...deps, generatedProof: {
    ...proof(reply, blair.id), discussionId, rootId, replyToId: questionId,
  } });
  state = outcome.state;
  assert.doesNotThrow(() => assertValidPersistedState(state));
  for (const corrupt of [
    (copy) => { copy.contributions.at(-1).replyToId = rootId; },
    (copy) => { copy.contributions.at(-1).insight.operatorId = alex.id; },
    (copy) => { copy.contributions[1].actorType = "agent"; },
  ]) {
    const copy = structuredClone(state);
    corrupt(copy);
    assert.throws(() => assertValidPersistedState(copy), TypeError);
  }
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
  const rootId = share(service, service.catalog().version, { ...command, topicId: learned.topicId, originSourceId: learned.sourceId }).result.contributionId;
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
  assert.deepEqual(moved.insight, { kind: "generated", operatorId: "demo-alex" });
});
