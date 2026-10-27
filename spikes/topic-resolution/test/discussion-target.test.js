import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiscussionTarget, resolveSemanticTarget } from "../browser/core/discussion-target.js";

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

function semanticFixture(){const value=fixture(),post=(id,rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',actorType:'human',authorId:'demo-blair',
  body:'Public '+id,createdAt:'2026-10-27T12:00:00.000Z',edited:false});
  return {...value,draft:{mode:'reply',semantic:true,targetId:'semantic-reply',detached:false,body:'Draft'},
    semanticSelection:{version:{...value.catalog.version},policyRevision:2,nodeId:'public-node',topic:{id:'different-topic',title:'Original canonical A',kind:'general'},
      discussionId:'different-discussion',root:{...post('semantic-root'),replies:[{...post('semantic-reply','semantic-root'),replyToId:'off-page-parent'}]},
      targetId:'semantic-reply',rootRevision:3,targetRevision:2,actors:[{id:'demo-blair',displayName:'Public Blair',type:'human'}]}};}

test('semantic display resolver preserves independent canonical destination and bounded page actors',()=>{
  const state=semanticFixture(),before=structuredClone(state);const selected=resolveSemanticTarget(state);
  assert.equal(selected.topicId,'different-topic');assert.equal(selected.discussionId,'different-discussion');assert.equal(selected.root.id,'semantic-root');
  assert.equal(selected.target.replyToId,'off-page-parent');assert.equal(selected.actors[0].displayName,'Public Blair');assert.deepEqual(state,before);
  assert.equal(resolveDiscussionTarget(state,'semantic-reply'),null,'display resolver does not widen generic/AI reply authority');
  for(const binding of [{topicId:'current'},{discussionId:'current-discussion'},{rootId:'other-root'},{targetId:'other-target'},
    {rootRevision:4},{targetRevision:3},{rootBody:'Different body'},{targetBody:'Different body'}])assert.equal(resolveSemanticTarget(state,'semantic-reply',binding),null);
});

test('semantic display resolver rejects unavailable, malformed or mismatched selections and preserves saved readiness',()=>{
  for(const change of [value=>{value.draft.semantic=false;},value=>{value.draft.detached=true;},value=>{value.draft.targetId='another-target';},
    value=>{value.needsFreshRead=true;},value=>{value.semanticSelection.version.generation='different-generation';},
    value=>{value.semanticSelection.root.replies[0].state='deleted';},value=>{value.semanticSelection.actors=[];}]){
    const state=semanticFixture();change(state);assert.equal(resolveSemanticTarget(state),null);
  }
  const state=semanticFixture();state.phase='loading';assert.equal(resolveSemanticTarget(state),null);state.humanPostingReady=true;assert.ok(resolveSemanticTarget(state));
});
