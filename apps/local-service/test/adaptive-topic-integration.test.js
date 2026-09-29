import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { applyAdaptiveTopicPlan } from "../src/domain/adaptive-topic-integration.js";
import { ADAPTIVE_TOPIC_POLICY } from "../src/domain/adaptive-topics.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { deterministicDependencies } from "./helpers.js";

function harness() {
  const deps = deterministicDependencies();
  const initial = createDemoState({ generation: deps.nextId("generation"), createdAt: deps.now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createMemoryRepository(initial);
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...deps });
  const ingest = (name, angle) => {
    const values = Array(384).fill(0); values[0] = Math.cos(angle); values[1] = Math.sin(angle);
    return service.ingest({ expected: service.catalog().version, operationId: `op-${name}`,
      url: `https://example.com/articles/${name}`, title: `Synthetic ${name}`,
      embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION });
  };
  const command = (value, actor = "demo-alex") => service.command(service.catalog().version, value, actor).result;
  const plan = (partitions) => {
    const current = repository.load(); const next = structuredClone(current);
    const planner = () => ({ policyVersion: ADAPTIVE_TOPIC_POLICY.version, partitions, decisions: [] });
    applyAdaptiveTopicPlan(next, deps, { planner });
    next.revision++;
    repository.save({ generation: current.generation, revision: current.revision }, next);
  };
  return { service, repository, ingest, command, plan };
}
const part = (sourceIds, retainTight = false, pinnedTopicId = null) => ({ sourceIds, retainTight, pinnedTopicId });

test("staged split and merge materialize entire anchored subtree while preserving IDs and pinned manual roots", () => {
  const h = harness();
  const outcomes = [h.ingest("p-a", 0), h.ingest("p-b", .1), h.ingest("p-c", .2), h.ingest("p-d", .3)];
  assert.equal(new Set(outcomes.map((item) => item.topicId)).size, 1);
  const originalTopic = outcomes[0].topicId;
  const c = outcomes[2];
  const sourceRoot = h.command({ type: "create-root", topicId: originalTopic, body: "Anchored root", originSourceId: c.sourceId }).contributionId;
  const originalDiscussion = h.service.discussion(originalTopic).discussionId;
  const reply = h.command({ type: "reply", discussionId: originalDiscussion, rootId: sourceRoot,
    replyToId: sourceRoot, body: "Same subtree", originSourceId: outcomes[0].sourceId }, "demo-blair").contributionId;
  const manualRoot = h.command({ type: "create-root", topicId: originalTopic, body: "Pinned Topic root" }).contributionId;
  const stale = h.service.catalog().version;
  h.plan([part(outcomes.slice(0, 2).map((entry) => entry.sourceId)), part(outcomes.slice(2).map((entry) => entry.sourceId), true)]);
  assert.equal(h.service.discussion(originalTopic).roots.some((root) => root.id === manualRoot), true);
  const movedTopic = h.service.catalog().sources.find((item) => item.id === c.sourceId).topicId;
  assert.notEqual(movedTopic, originalTopic);
  const moved = h.service.discussion(movedTopic).roots[0];
  assert.equal(moved.id, sourceRoot); assert.equal(moved.replies[0].id, reply); assert.equal(moved.regrouped, true);
  assert.equal(h.repository.load().topics.find((topic) => topic.id === movedTopic).retainTight, true);
  assert.throws(() => h.service.command(stale, { type: "reply", discussionId: originalDiscussion,
    rootId: sourceRoot, replyToId: null, body: "Stale" }, "demo-alex"), (error) => error.code === "conflict");
  h.plan([part(outcomes.map((entry) => entry.sourceId), true)]);
  const mergedTopic = h.service.catalog().sources.find((item) => item.id === c.sourceId).topicId;
  const merged = h.service.discussion(mergedTopic).roots.find((root) => root.id === sourceRoot);
  assert.equal(merged.replies[0].id, reply);
  assert.equal(h.service.discussion(originalTopic).roots.some((root) => root.id === manualRoot), true);
});

test("staged mapper never reuses an orphan protected Topic for unrelated Source", () => {
  const h = harness();
  const a = h.ingest("orphan-a", 0); const oldTopic = a.topicId;
  h.command({ type: "create-root", topicId: oldTopic, body: "Pinned prior context" });
  const current = h.repository.load(); const detached = structuredClone(current);
  detached.sourceLinks = detached.sourceLinks.filter((link) => link.sourceId !== a.sourceId);
  // The staged planner accepts the temporary detached state; committed state
  // restores exactly one link to a fresh Topic before validation.
  const planner = () => ({ policyVersion: ADAPTIVE_TOPIC_POLICY.version,
    partitions: [part([a.sourceId])], decisions: [] });
  applyAdaptiveTopicPlan(detached, deterministicDependencies(), { planner });
  assert.notEqual(detached.sourceLinks.find((link) => link.sourceId === a.sourceId).topicId, oldTopic);
  assert.equal(detached.topics.some((topic) => topic.id === oldTopic), true);
});
