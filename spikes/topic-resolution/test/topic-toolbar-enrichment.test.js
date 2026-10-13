import assert from "node:assert/strict";
import test from "node:test";
import { createTopicToolbarController } from "../browser/core/topic-toolbar-controller.js";

const version = { generation: "synthetic-toolbar", revision: 2 };
const ready = patch => ({ phase: "ready", tabId: 7, documentId: "document-one", url: "https://example.org/one",
  sourceId: "source-one", topicId: "topic-one", sequence: 1, ...patch });
const topic = { id: "topic-one", title: "One", kind: "general", learned: true };
const source = { id: "source-one", title: "Synthetic page", url: ready().url, topicId: topic.id, provenance: "owner-local-page-embedding/v1" };
const coreCatalog = () => ({ version, actors: [{ id: "demo-alex", displayName: "Alex", type: "human" }],
  model: { id: "hand-authored-demo-vectors/1", status: "fixture-only" }, topics: [topic], sources: [source] });
const coreDiscussion = () => ({ version, topic: { id: topic.id, title: topic.title, kind: topic.kind }, discussionId: "discussion-one", roots: [] });
function bundle() {
  const catalog = coreCatalog(), discussion = coreDiscussion();
  catalog.topics.push({ id: "topic-two", title: "Two", kind: "general", learned: true });
  catalog.sources.push({ ...source, id: "source-two", url: "https://example.org/two", topicId: "topic-two" });
  return { catalog, discussion, related: null, priorDiscussions: null, errors: { related: "capacity", prior: "unavailable", alternate: null },
    alternateDiscussion: { mode: "alternate-provisional", policyVersion: "ridge1-qualified-complete-link/v1",
      representation: "owner-local-linear-teacher-transfer/ridge1-v1", version, sourceId: source.id,
      canonical: { topic: discussion.topic, discussionId: discussion.discussionId }, sourceIds: [source.id, "source-two"], roots: [], pinnedRoots: [] } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  let resolve, reject, mode = "experimental", marker;
  const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
  const painted = new Map(), calls = [];
  const controller = createTopicToolbarController({ catalogContext: async () => coreCatalog(), discussion: async () => coreDiscussion(),
    enrichment(input, options) { calls.push({ input, options }); return gate; },
    alternateDiscussion() { assert.fail("New toolbar must not dispatch legacy five-second projection"); },
    readMode: () => mode, paint: async (tabId, color) => { painted.set(tabId, color); }, readMarker: async () => marker,
    writeMarker: async id => { marker = id; }, removeMarker: async () => { marker = undefined; } });
  return { controller, painted, calls, resolve, reject, mode(value) { mode = value; } };
}

test("toolbar paints canonical badge before optional result and validates foreign group metadata", async () => {
  const h = harness();
  await h.controller.update(ready());
  assert.equal(h.painted.get(7), "topic"); assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].input, { sourceId: source.id, topicId: topic.id, includeAlternate: true });
  h.resolve(bundle()); await flush(); await h.controller.settled();
  assert.equal(h.painted.get(7), "shared", "coherent enriched catalog proves foreign Ridge membership");
});

for (const invalidation of ["navigation", "removed", "mode", "pairing", "actor"]) {
  test(`late toolbar enrichment cannot escape ${invalidation} fence`, async () => {
    const h = harness(); await h.controller.update(ready({ actorId: "demo-alex" }));
    const value = bundle();
    if (invalidation === "navigation") await h.controller.update(ready({ tabId: 8, documentId: "document-two", sequence: 2 }));
    if (invalidation === "removed") await h.controller.tabRemoved(7);
    if (invalidation === "mode") h.mode("classic");
    if (invalidation === "pairing") await h.controller.update({ phase: "unpaired", presentationTabId: 7 }, { pairingChanged: true });
    if (invalidation === "actor") value.catalog.actors = [];
    h.resolve(value); await flush(); await h.controller.settled();
    if (invalidation === "navigation") assert.equal(h.painted.get(8), "shared", "new coherent navigation owns its independent result");
    assert.notEqual(h.painted.get(7), "shared");
    if (["navigation", "removed", "pairing"].includes(invalidation)) assert.equal(h.calls[0].options.signal.aborted, true);
  });
}

test("optional toolbar failure leaves connection and canonical badge intact", async () => {
  const h = harness(); await h.controller.update(ready());
  h.reject(Object.assign(new Error("Synthetic optional failure"), { code: "capacity" }));
  await flush(); await h.controller.settled();
  assert.equal(h.painted.get(7), "topic"); assert.equal(h.painted.get(null), "connected");
});

test("classic toolbar makes no optional request", async () => {
  const h = harness(); h.mode("classic"); await h.controller.update(ready());
  assert.equal(h.calls.length, 0); assert.equal(h.painted.get(7), "topic");
});
