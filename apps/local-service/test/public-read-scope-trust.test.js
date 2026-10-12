import assert from "node:assert/strict";
import test from "node:test";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { applyCommand, createDemoState } from "../src/domain/demo-state.js";
import { BROWSER_MODEL_ID, MATCH_POLICY_VERSION } from "../src/domain/learned-sources.js";
import { makeRidgeTopicAdapter } from "../src/domain/ridge-topic-adapter.js";
import { operationDigestFor, routeSourceThreads } from "../src/domain/source-threads.js";
import { deterministicDependencies } from "./helpers.js";

const weights = Array(384 * 384).fill(0);
for (let axis = 0; axis < 384; axis++) weights[axis * 384 + axis] = 1;
const alternateRidgeAdapter = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
const actor = { id: "demo-alex", type: "human", demo: true };
const unit = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
function learned(id, angle) {
  const source = { id, url: `https://example.com/${id}`, title: `Synthetic ${id}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: unit(angle) },
    extractorVersion: "crawler-static-html-prefix/v1", provenance: "owner-local-page-embedding/v1",
    operationId: `operation-${id}`, policyVersion: MATCH_POLICY_VERSION };
  return { ...source, operationDigest: operationDigestFor(source) };
}

function fixture() {
  const dependencies = deterministicDependencies();
  let state = createDemoState({ generation: "synthetic-scoped-read-generation", createdAt: dependencies.now(), sources: [],
    topicSeeds: ["old", "alpha", "beta"].map(id => ({ id: `topic-${id}`, title: `Synthetic ${id}`, kind: "general" })) });
  state.sources = [learned("source-a", 0), learned("source-b", .1), learned("source-c", 1.5)];
  state.sourceLinks = [
    { sourceId: "source-a", topicId: "topic-old", method: "learned-provisional" },
    { sourceId: "source-b", topicId: "topic-old", method: "learned-provisional" },
    { sourceId: "source-c", topicId: "topic-alpha", method: "manual-confirmed" },
  ];
  const command = input => {
    const outcome = applyCommand(state, input, actor, dependencies);
    state = outcome.state;
    return outcome.result;
  };
  const root = (topicId, body, originSourceId) => command({ type: "create-root", topicId, body,
    ...(originSourceId ? { originSourceId } : {}) }).contributionId;
  const historical = root("topic-old", "Historical Source A opener", "source-a");
  command({ type: "reply", discussionId: "discussion-topic-old", rootId: historical, replyToId: null,
    body: "Reply origin B cannot choose the opener destination", originSourceId: "source-b" });
  const routed = root("topic-old", "Source B opener later regrouped", "source-b");
  const routedReply = command({ type: "reply", discussionId: "discussion-topic-old", rootId: routed, replyToId: null,
    body: "Source A link remains reply provenance", originSourceId: "source-a" }).contributionId;
  command({ type: "reply", discussionId: "discussion-topic-old", rootId: routed, replyToId: routedReply,
    body: "Nested child moves with its source-anchored opener" });
  root("topic-alpha", "Manually pinned Source C opener", "source-c");
  root("topic-alpha", "Topic-pinned opener with no Source");
  // A changed representation keeps A's older thread at its original destination,
  // while B's exact unchanged source stamp routes its entire subtree to beta.
  state.sources[0] = { ...state.sources[0], embedding: { modelId: BROWSER_MODEL_ID, values: unit(.03) },
    operationId: "operation-source-a-current" };
  state.sources[0].operationDigest = operationDigestFor(state.sources[0]);
  state.sourceLinks[0].topicId = "topic-alpha";
  state.sourceLinks[1].topicId = "topic-beta";
  routeSourceThreads(state);
  state.revision++;
  const current = root("topic-alpha", "Current Source A opener", "source-a");
  const currentReply = command({ type: "reply", discussionId: "discussion-topic-alpha", rootId: current, replyToId: null,
    body: "Manual Source C is reply provenance only", originSourceId: "source-c" }).contributionId;
  command({ type: "reply", discussionId: "discussion-topic-alpha", rootId: current, replyToId: currentReply,
    body: "Nested current reply" });
  return { state, dependencies, historical, routed, current, currentReply };
}

test("normalized scoped alternate views equal the aggregate oracle across pins, historical routing and edits/deletions", t => {
  const data = fixture();
  const repository = createNormalizedSqliteRepository(":memory:", data.state);
  t.after(() => repository.close());
  const configuration = { ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], alternateRidgeAdapter,
    ...data.dependencies };
  const scoped = createDiscussionService({ ...configuration, repository });
  function compare(label) {
    const before = repository.load();
    // A load-only read-only wrapper deliberately selects the original aggregate
    // branch, independently of the normalized scope and caches under test.
    const aggregate = createDiscussionService({ ...configuration,
      repository: Object.freeze({ load: () => structuredClone(before) }) });
    for (const source of before.sources) {
      assert.deepEqual(scoped.alternateDiscussion(source.id), aggregate.alternateDiscussion(source.id), `${label}/${source.id}`);
      assert.deepEqual(scoped.priorDiscussions(source.id), aggregate.priorDiscussions(source.id), `${label}/prior/${source.id}`);
      assert.deepEqual(scoped.related(source.id, 20), aggregate.related(source.id, 20), `${label}/related/${source.id}`);
    }
    assert.deepEqual(repository.load(), before, `${label} public projections cannot mutate canonical state`);
  }
  compare("initial");
  const a = scoped.alternateDiscussion("source-a"), c = scoped.alternateDiscussion("source-c");
  assert.deepEqual(new Set(a.sourceIds), new Set(["source-a", "source-b"]));
  assert.ok(a.roots.some(root => root.id === data.routed && root.canonicalTopicId === "topic-beta"));
  assert.ok(!a.roots.some(root => root.id === data.historical));
  assert.ok(a.pinnedRoots.some(root => root.body === "Manually pinned Source C opener"));
  assert.equal(c.mode, "canonical-pinned");
  assert.deepEqual(c.sourceIds, ["source-c"]);
  const routed = repository.load().contributions.find(entry => entry.id === data.routed);
  assert.equal(routed.originalTopicId, "topic-old");
  assert.equal(routed.discussionId, "discussion-topic-beta");
  assert.ok(scoped.priorDiscussions("source-a").topics.some(topic => topic.id === "topic-old"));
  const added = scoped.command(scoped.version(), { type: "create-root", topicId: "topic-alpha",
    body: "New canonical source opener", originSourceId: "source-a" }, actor.id);
  compare("accepted-new-root");
  scoped.command(scoped.version(), { type: "edit", contributionId: data.currentReply, body: "Edited nested parent" }, actor.id);
  compare("edited-reply");
  scoped.command(scoped.version(), { type: "withdraw", contributionId: data.current }, actor.id);
  compare("deleted-opener-with-surviving-replies");
  scoped.command(scoped.version(), { type: "withdraw", contributionId: added.result.contributionId }, actor.id);
  compare("deleted-leaf-root");
});
