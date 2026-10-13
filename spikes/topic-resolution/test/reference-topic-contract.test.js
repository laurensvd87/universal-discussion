import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog, readIngestionOutcome, readAlternateDiscussion, REFERENCE_TOPIC_POLICY } from "../browser/core/local-service-contract.js";
import { isRidgeTopicView, RIDGE_REPRESENTATION } from "../browser/core/topic-view-mode.js";
import { resolveDiscussionTarget } from "../browser/core/discussion-target.js";

const version = { generation: "generation-reference", revision: 3 };
const topic = id => ({ id, title: id, kind: "general" });
const source = (id, topicIds) => ({ id, url: `https://example.com/${id}`, title: id,
  provenance: "owner-local-page-embedding/v1", topicId: topicIds[0], topicIds });
const catalogValue = () => ({ version, model: { id: "e5-small-q8-browser-main-prefix-v1", status: "experimental-local" },
  actors: [{ id: "demo-alex", displayName: "Alex", type: "human" }],
  topics: [topic("topic-a"), topic("topic-b"), topic("topic-outside")],
  sources: [source("source-a", ["topic-a"]), source("source-b", ["topic-b"]), source("source-middle", ["topic-a", "topic-b"])] });
const post = (id, topicId) => ({ id, rootId: null, replyToId: null, state: "visible", authorId: "demo-alex",
  actorType: "human", body: `Original message ${id}`, createdAt: "2026-10-13T00:00:00.000Z", edited: false,
  replies: [], canonicalTopicId: topicId, canonicalDiscussionId: topicId.replace("topic", "discussion") });
const discussion = () => ({ version, topic: topic("topic-a"), discussionId: "discussion-a", roots: [] });
const view = () => ({ mode: "alternate-provisional", policyVersion: REFERENCE_TOPIC_POLICY,
  representation: RIDGE_REPRESENTATION, version, sourceId: "source-middle",
  canonical: { topic: topic("topic-a"), discussionId: "discussion-a" },
  sourceIds: ["source-a", "source-b", "source-middle"], roots: [post("message-a", "topic-a"), post("message-b", "topic-b")], pinnedRoots: [] });

test("canonical membership DTO preserves both Topics, exact original destinations, and primary-only write authority", () => {
  const catalog = readCatalog(catalogValue());
  assert.deepEqual(catalog.sources[2].topicIds, ["topic-a", "topic-b"]);
  const projected = readAlternateDiscussion(view(), "source-middle", catalog, discussion());
  assert.equal(isRidgeTopicView(projected), true);
  assert.deepEqual(projected.roots.map(root => [root.id, root.canonicalTopicId, root.canonicalDiscussionId]),
    [["message-a", "topic-a", "discussion-a"], ["message-b", "topic-b", "discussion-b"]]);
  const state = { phase: "ready", needsFreshRead: false, sourceId: "source-middle", topicId: "topic-a",
    catalog, discussion: discussion(), alternateDiscussion: projected };
  assert.equal(resolveDiscussionTarget(state, "message-b"), null, "a membership feed alone never grants cross-Topic reply/Insight authority");
});

test("membership fields are dense sorted unique canonical IDs including the primary, never reference vectors", () => {
  for (const topicIds of [[], ["topic-b"], ["topic-a", "topic-a"], ["topic-b", "topic-a"], ["topic-a", "topic-missing"], Array(2)]) {
    const value = catalogValue(); value.sources[2].topicIds = topicIds;
    assert.throws(() => readCatalog(value));
  }
  const extra = catalogValue(); extra.sources[2].reference = { values: [1] };
  assert.throws(() => readCatalog(extra));
  const accessor = catalogValue();
  Object.defineProperty(accessor.sources[2], "topicIds", { enumerable: true, get() { assert.fail("getter must not execute"); } });
  assert.throws(() => readCatalog(accessor));
  const receipt = { version, sourceId: "source-middle", topicId: "topic-a", topicIds: ["topic-a", "topic-b"],
    assignment: "provisional", policyVersion: REFERENCE_TOPIC_POLICY };
  assert.deepEqual(readIngestionOutcome(receipt), receipt);
  const { topicIds, ...missing } = receipt;
  assert.throws(() => readIngestionOutcome(missing));
});

test("union proof rejects foreign Topics, inconsistent versions, duplicate messages and missing current memberships", () => {
  const catalog = readCatalog(catalogValue());
  for (const mutate of [
    value => { value.roots.push(post("message-outside", "topic-outside")); },
    value => { value.version = { ...version, revision: 2 }; },
    value => { value.roots.push(post("message-a", "topic-b")); },
    value => { value.canonical.discussionId = "discussion-wrong"; },
    value => { value.sourceIds.push("source-unknown"); },
  ]) { const value = view(); mutate(value); assert.throws(() => readAlternateDiscussion(value, "source-middle", catalog, discussion())); }
  const legacy = structuredClone(catalog); delete legacy.sources[2].topicIds;
  assert.throws(() => readAlternateDiscussion(view(), "source-middle", legacy, discussion()));
});
