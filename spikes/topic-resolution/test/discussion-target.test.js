import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiscussionTarget } from "../browser/core/discussion-target.js";

function fixture() {
  const version = { generation: "generation-1", revision: 4 };
  const topic = { id: "current", title: "Current", kind: "general" };
  const old = { id: "earlier", title: "Earlier", kind: "general" };
  const root = { id: "root", body: "original root", state: "visible",
    origin: { sourceId: "page" }, replies: [{ id: "reply", rootId: "root",
      replyToId: "root", state: "visible", body: "original reply" }] };
  return { phase: "ready", needsFreshRead: false, topicId: "current", sourceId: "page",
    catalog: { version, sources: [{ id: "page", topicId: "current" }], topics: [topic, old] },
    discussion: { version, topic, discussionId: "current-discussion", roots: [] },
    priorDiscussions: { version, sourceId: "page", currentTopicId: "current", topics: [old] },
    earlierDiscussions: [{ version: { ...version }, topicId: "earlier", title: "Earlier",
      discussionId: "earlier-discussion", roots: [root] }] };
}

test("only an exact visible earlier same-Source chain resolves", () => {
  const state = fixture();
  const binding = resolveDiscussionTarget(state, "reply");
  assert.equal(binding?.topicId, "earlier");
  assert.equal(binding?.discussionId, "earlier-discussion");
  assert.equal(binding?.earlier, true);
  assert.equal(binding?.root.id, "root");
  assert.equal(resolveDiscussionTarget(state, "reply", { topicId: "current" }), null);
  assert.equal(resolveDiscussionTarget(state, "reply", { rootBody: "old text" }), null);
  assert.equal(resolveDiscussionTarget(state, "reply", { targetBody: "old text" }), null);
  state.earlierDiscussions[0].roots[0].origin.sourceId = "another-page";
  assert.equal(resolveDiscussionTarget(state, "reply"), null);
});

test("stale metadata, hidden targets and related projections confer no reply authority", () => {
  for (const alter of [
    (state) => { state.earlierDiscussions[0].version.revision++; },
    (state) => { state.priorDiscussions.topics = []; },
    (state) => { state.catalog.topics[1].title = "Changed"; },
    (state) => { state.earlierDiscussions[0].roots[0].replies[0].rootId = "wrong"; },
    (state) => { state.earlierDiscussions[0].roots[0].replies[0].state = "withdrawn"; },
    (state) => { state.sourceId = "another-page"; },
    (state) => { state.needsFreshRead = true; },
  ]) {
    const state = fixture();
    alter(state);
    assert.equal(resolveDiscussionTarget(state, "reply"), null);
  }
  const state = fixture();
  state.earlierDiscussions = [];
  state.relatedDiscussions = [{ topicId: "earlier", roots: [{ id: "reply" }] }];
  assert.equal(resolveDiscussionTarget(state, "reply"), null);
});

test("human-ready loading resolves only the same canonical bound reply chain", () => {
  const state = fixture();state.phase = "loading";
  assert.equal(resolveDiscussionTarget(state, "reply"), null);
  state.humanPostingReady = true;
  assert.equal(resolveDiscussionTarget(state, "reply")?.discussionId, "earlier-discussion");
  assert.equal(resolveDiscussionTarget(state, "reply", { discussionId: "different" }), null);
  state.needsFreshRead = true;assert.equal(resolveDiscussionTarget(state, "reply"), null);
});
