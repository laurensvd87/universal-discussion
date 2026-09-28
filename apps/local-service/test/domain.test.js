import assert from "node:assert/strict";
import test from "node:test";
import { ServiceError } from "../src/domain/errors.js";
import { createUnavailableRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { demoService, deterministicDependencies } from "./helpers.js";

function errorCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ServiceError && error.code === code);
}

test("catalog keeps confirmed same-topic links distinct from related ranking", () => {
  const service = demoService();
  const catalog = service.catalog();
  assert.equal(catalog.sources.length, 6);
  assert.equal(catalog.sources.find((source) => source.id === "harbor-overview").topicId, "harbor-s2");
  assert.equal(Object.hasOwn(catalog.sources[0], "embedding"), false);
  const related = service.related("harbor-overview", 10);
  assert.deepEqual(related.results.slice(0, 2).map((entry) => entry.relationship), ["same-topic", "same-topic"]);
  assert.ok(related.results.some((entry) => entry.id === "harbor-successor" && entry.relationship === "related"));
  assert.equal(related.results.some((entry) => Object.hasOwn(entry, "similarity")), false);
});

test("unavailable model returns no candidates and makes no semantic claim", () => {
  const deps = deterministicDependencies();
  const state = createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const service = createDiscussionService({ repository: createMemoryRepository(state), ranking: createUnavailableRankingAdapter(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...deps });
  assert.deepEqual(service.related("harbor-overview").results, []);
  assert.equal(service.catalog().model.status, "model-unavailable");
});

test("create root, reply and edit preserve ordering and current-body projection", () => {
  const service = demoService();
  let version = service.catalog().version;
  service.command(version, { type: "create-root", topicId: "harbor-s2", body: "First root" }, "demo-alex");
  version = service.catalog().version;
  service.command(version, { type: "create-root", topicId: "harbor-s2", body: "Newest root" }, "demo-blair");
  let view = service.discussion("harbor-s2");
  assert.deepEqual(view.roots.map((root) => root.body), ["Newest root", "First root"]);
  const rootId = view.roots[1].id;
  service.command(view.version, { type: "reply", discussionId: view.discussionId, rootId, replyToId: null, body: "Reply" }, "demo-blair");
  view = service.discussion("harbor-s2");
  const replyId = view.roots[1].replies[0].id;
  service.command(view.version, { type: "edit", contributionId: replyId, body: "Edited reply" }, "demo-blair");
  view = service.discussion("harbor-s2");
  assert.equal(view.roots[1].replies[0].body, "Edited reply");
  assert.equal(view.roots[1].replies[0].edited, true);
  assert.equal(JSON.stringify(view).includes('"Reply"'), false);
});

test("withdraw purges author and revision bodies while replies survive", () => {
  const service = demoService();
  let version = service.catalog().version;
  service.command(version, { type: "create-root", topicId: "harbor-s2", body: "Sensitive original" }, "demo-alex");
  let view = service.discussion("harbor-s2");
  const rootId = view.roots[0].id;
  service.command(view.version, { type: "reply", discussionId: view.discussionId, rootId, replyToId: null, body: "Survives" }, "demo-blair");
  view = service.discussion("harbor-s2");
  service.command(view.version, { type: "withdraw", contributionId: rootId }, "demo-alex");
  view = service.discussion("harbor-s2");
  assert.deepEqual(view.roots[0], {
    id: rootId, rootId: null, replyToId: null, state: "deleted", label: "Deleted",
    replies: [view.roots[0].replies[0]],
  });
  assert.equal(view.roots[0].replies[0].body, "Survives");
  assert.equal(JSON.stringify(view).includes("Sensitive original"), false);
});

test("ownership, forged actors, stale versions and unsupported commands deny", () => {
  const service = demoService();
  const initial = service.catalog().version;
  service.command(initial, { type: "create-root", topicId: "harbor-s2", body: "Mine" }, "demo-alex");
  const view = service.discussion("harbor-s2");
  errorCode(() => service.command(view.version, { type: "edit", contributionId: view.roots[0].id, body: "Stolen" }, "demo-blair"), "forbidden");
  errorCode(() => service.command(initial, { type: "create-root", topicId: "harbor-s2", body: "Stale" }, "demo-alex"), "conflict");
  errorCode(() => service.command(view.version, { type: "publish-agent", body: "No" }, "demo-alex"), "forbidden");
  errorCode(() => service.command(view.version, { type: "create-root", topicId: "harbor-s2", body: "No", authorId: "demo-blair" }, "demo-alex"), "invalid");
  errorCode(() => service.command(view.version, { type: "create-root", topicId: "harbor-s2", body: "No" }, "unknown"), "forbidden");
});

test("reply cannot cross discussions, roots or withdrawn targets", () => {
  const service = demoService();
  service.command(service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "A" }, "demo-alex");
  service.command(service.catalog().version, { type: "create-root", topicId: "harbor-s3", body: "B" }, "demo-alex");
  const a = service.discussion("harbor-s2");
  const b = service.discussion("harbor-s3");
  errorCode(() => service.command(b.version, { type: "reply", discussionId: b.discussionId, rootId: a.roots[0].id, replyToId: null, body: "Cross" }, "demo-alex"), "invalid");
  service.command(service.catalog().version, { type: "withdraw", contributionId: a.roots[0].id }, "demo-alex");
  const latest = service.discussion("harbor-s2");
  errorCode(() => service.command(latest.version, { type: "reply", discussionId: latest.discussionId, rootId: latest.roots[0].id, replyToId: null, body: "Late" }, "demo-alex"), "invalid");
});

test("create topic works without a URL and reset rotates generation", () => {
  const service = demoService();
  const oldVersion = service.catalog().version;
  service.command(oldVersion, { type: "create-topic", title: "Manual topic", kind: "claim" }, "demo-alex");
  assert.ok(service.catalog().topics.some((topic) => topic.title === "Manual topic"));
  const version = service.catalog().version;
  const reset = service.reset(version, "RESET DEMO STATE");
  assert.notEqual(reset.generation, version.generation);
  assert.equal(reset.revision, 0);
  assert.equal(service.catalog().topics.some((topic) => topic.title === "Manual topic"), false);
  errorCode(() => service.command(version, { type: "create-root", topicId: "harbor-s2", body: "Old" }, "demo-alex"), "conflict");
});

test("returned views are deeply frozen and cannot mutate repository state", () => {
  const service = demoService();
  const catalog = service.catalog();
  assert.equal(Object.isFrozen(catalog.sources), true);
  assert.throws(() => { catalog.sources[0].title = "Changed"; }, TypeError);
  assert.notEqual(service.catalog().sources[0].title, "Changed");
});
