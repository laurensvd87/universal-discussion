import assert from "node:assert/strict";
import test from "node:test";
import { createTopicToolbarController, hasSharedLearnedTopic, hasPublishedPosts } from "../browser/core/topic-toolbar-controller.js";

const ready = (patch = {}) => ({ phase: "ready", tabId: 7, documentId: "document-a", url: "https://example.com/a", sourceId: "source-a", topicId: "topic-a", sequence: 1, ...patch });
const source = (id, url, topicId = "topic-a", provenance = "owner-local-page-embedding/v1") => ({ id, url, topicId, provenance, title: "Synthetic article" });
const topic = { id: "topic-a", title: "A", kind: "general", learned: true };
function catalog(sources = [source("source-a", ready().url), source("source-b", "https://example.org/b")], revision = 2) {
  return { version: { generation: "generation-a", revision }, actors: [], model: { id: "hand-authored-demo-vectors/1", status: "fixture-only" }, topics: [topic], sources };
}
const visible = (id, rootId = null) => ({ id, rootId, replyToId: null, state: "visible", authorId: "demo-alex", actorType: "human", body: "Synthetic published post", createdAt: "2026-09-29T00:00:00.000Z", edited: false });
const deleted = (id, rootId = null) => ({ id, rootId, replyToId: null, state: "deleted", label: "Deleted by user" });
const discussion = (roots = [], revision = 2) => ({ version: { generation: "generation-a", revision }, topic: { id: topic.id, title: topic.title, kind: topic.kind }, discussionId: "discussion-a", roots });
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { await new Promise((done) => setImmediate(done)); };
function harness(options = {}) {
  const writes = []; let marker = options.marker; let reads = 0; let discussionReads = 0;
  const painted = new Map();
  const controller = createTopicToolbarController({
    catalog: async (request) => { reads++; return options.catalog ? options.catalog(request) : catalog(); },
    discussion: async (id, request) => { discussionReads++; return options.discussion ? options.discussion(id, request) : discussion(); },
    paint: async (id, state) => { writes.push([id, state]); if (options.paint) await options.paint(id, state); painted.set(id, state); },
    readMarker: async () => { if (options.readMarker) await options.readMarker(); return marker; },
    writeMarker: async (id) => { if (options.writeMarker) await options.writeMarker(id); marker = id; },
    removeMarker: async () => { if (options.removeMarker) await options.removeMarker(); marker = undefined; },
  });
  return { controller, writes, painted, marker: () => marker, reads: () => reads, discussionReads: () => discussionReads };
}
test("catalog sharing requires exact learned Source, URL, Topic and distinct learned page", () => {
  assert.equal(hasSharedLearnedTopic(ready(), catalog()), true);
  const a = source("source-a", ready().url);
  for (const sources of [[], [a], [a, source("source-b", a.url)], [a, source("source-b", "https://example.org/b", null)], [a, source("source-b", "https://example.org/b", "topic-a", "project-created-hand-authored-demo/1")], [source("source-a", "https://example.com/stale"), source("source-b", "https://example.org/b")]]) assert.equal(hasSharedLearnedTopic(ready(), catalog(sources)), false);
  for (const patch of [{ phase: "processing" }, { tabId: -1 }, { documentId: null }, { sequence: undefined }]) assert.equal(hasSharedLearnedTopic(ready(patch), catalog()), false);
});
test("five states use verified connection and visible published posts, independent of peer count", async () => {
  const h = harness(); await h.controller.initialized();
  assert.equal(h.painted.get(null), "disconnected");
  await h.controller.update({ phase: "off" }, { verify: true });
  assert.equal(h.painted.get(null), "connected"); assert.equal(h.discussionReads(), 0);
  const lone = harness({ catalog: () => catalog([source("source-a", ready().url)]), discussion: () => discussion([{ ...visible("post-a"), replies: [] }]) });
  await lone.controller.update(ready()); assert.equal(lone.painted.get(7), "topic");
  await h.controller.update(ready()); assert.equal(h.painted.get(7), "shared");
  const posts = harness({ discussion: () => discussion([{ ...visible("post-a"), replies: [] }]) });
  await posts.controller.update(ready()); assert.equal(posts.painted.get(7), "posts");
});
test("deleted tombstones do not count, surviving visible replies do, private/draft data is rejected", async () => {
  const roots = [{ ...deleted("post-a"), replies: [deleted("reply-a", "post-a")] }];
  assert.equal(hasPublishedPosts(discussion(roots), "topic-a"), false);
  roots[0].replies.push(visible("reply-b", "post-a"));
  assert.equal(hasPublishedPosts(discussion(roots), "topic-a"), true);
  const h = harness({ discussion: () => discussion(roots) }); await h.controller.update(ready());
  assert.equal(h.painted.get(7), "posts");
  roots[0].replies.pop(); await h.controller.update(ready()); assert.equal(h.painted.get(7), "shared");
  const invalid = { ...visible("draft-a"), state: "draft", replies: [] };
  assert.throws(() => hasPublishedPosts(discussion([invalid]), "topic-a"));
});
test("post addition and withdrawal refresh current evidence without capture", async () => {
  let roots = []; const h = harness({ discussion: () => discussion(roots) });
  await h.controller.update(ready()); assert.equal(h.painted.get(7), "shared");
  roots = [{ ...visible("post-a"), replies: [] }]; await h.controller.update(ready(), { verify: true }); assert.equal(h.painted.get(7), "posts");
  roots = [{ ...deleted("post-a"), replies: [] }]; await h.controller.update(ready(), { verify: true }); assert.equal(h.painted.get(7), "shared");
});
for (const phase of ["off", "checking", "processing", "unsupported", "not-enabled"]) test(`${phase} clears page evidence but preserves last observed connection without requests`, async () => {
  const h = harness(); await h.controller.update(ready()); const reads = h.reads();
  await h.controller.update({ phase }); assert.equal(h.painted.get(7), "connected"); assert.equal(h.painted.get(null), "connected");
  assert.equal(h.marker(), undefined); assert.equal(h.reads(), reads);
});
for (const phase of ["unpaired", "error"]) test(`${phase} clears connection and page states`, async () => {
  const h = harness(); await h.controller.update(ready()); await h.controller.update({ phase });
  assert.equal(h.painted.get(7), "disconnected"); assert.equal(h.painted.get(null), "disconnected"); assert.equal(h.marker(), undefined);
});
test("credential change resets last connection before pending newer reads", async () => {
  const h = harness(); await h.controller.update(ready());
  await h.controller.update({ phase: "checking" }, { pairingChanged: true }); assert.equal(h.painted.get(null), "disconnected");
});
test("worker reconstruction clears saved override before removing marker", async () => {
  const h = harness({ marker: 7, removeMarker: () => assert.equal(h.painted.get(7), "disconnected") });
  await h.controller.initialized(); assert.deepEqual(h.writes, [[7, "disconnected"], [null, "disconnected"]]); assert.equal(h.marker(), undefined);
});
test("reconstruction only accepts exact missing-tab error; storage failures block new page icons", async () => {
  for (const missing of [true, false]) {
    const h = harness({ marker: 7, paint: (id) => { if (id === 7) throw new Error(missing ? "No tab with id: 7." : "API unavailable"); } });
    await h.controller.initialized(); await h.controller.update(ready({ tabId: 8 }));
    assert.equal(h.marker(), missing ? 8 : 7); assert.equal(h.painted.get(8), missing ? "shared" : undefined);
  }
  for (const marker of [-1, "7", {}, [7], Number.NaN]) {
    const h = harness({ marker }); await h.controller.update(ready()); assert.equal(h.reads(), 0); assert.equal(h.painted.get(null), "disconnected");
  }
});
for (const stage of ["catalog", "discussion"]) test(`late ${stage} results cannot restore page or connection after navigation/pairing`, async () => {
  for (const changed of [{ phase: "checking" }, { phase: "unpaired" }, ready({ tabId: 8, sequence: 2 })]) {
    const gate = deferred(); let count = 0;
    const options = stage === "catalog" ? { catalog: () => ++count === 1 ? gate.promise : catalog() } : { discussion: () => ++count === 1 ? gate.promise : discussion() };
    const h = harness(options); const first = h.controller.update(ready()); await flush();
    await h.controller.update(changed); gate.resolve(stage === "catalog" ? catalog() : discussion()); await first;
    assert.ok(!h.writes.some(([id, color]) => id === 7 && ["topic", "shared", "posts"].includes(color)));
    if (changed.phase === "unpaired") assert.equal(h.painted.get(null), "disconnected");
  }
});
test("old rejection never clears newer ready state and old signal aborts", async () => {
  const gate = deferred(); let oldSignal; let count = 0;
  const h = harness({ catalog: ({ signal }) => { if (++count === 1) { oldSignal = signal; return gate.promise; } return catalog(); } });
  const old = h.controller.update(ready()); await flush(); await h.controller.update(ready({ tabId: 8, sequence: 2 }));
  assert.equal(oldSignal.aborted, true); gate.reject(new Error("401")); await old; assert.equal(h.painted.get(8), "shared");
});
test("serialized paints clear old per-tab override before newer one", async () => {
  const gate = deferred(); let blocked = false;
  const h = harness({ paint: async (id, state) => { if (id === 7 && state === "shared" && !blocked) { blocked = true; await gate.promise; } } });
  const first = h.controller.update(ready()); await flush(); const second = h.controller.update(ready({ tabId: 8, sequence: 2 })); await flush();
  assert.ok(!h.writes.some(([id]) => id === 8)); gate.resolve(); await Promise.all([first, second]);
  assert.equal(h.painted.get(7), "connected"); assert.equal(h.painted.get(8), "shared"); assert.equal(h.marker(), 8);
});
test("navigation and removal during marker persistence prevent page paints", async () => {
  for (const removal of [false, true]) {
    const gate = deferred(); const h = harness({ writeMarker: () => gate.promise });
    const first = h.controller.update(ready()); await flush();
    const next = removal ? h.controller.tabRemoved(7) : h.controller.update({ phase: "checking" }); gate.resolve();
    await Promise.all([first, next]); assert.equal(h.marker(), undefined);
    assert.ok(!h.writes.some(([, state]) => ["topic", "shared", "posts"].includes(state)));
  }
});
test("failed catalog/discussion reads and invalid DTOs show disconnected", async () => {
  for (const options of [{ catalog: () => { throw new Error("401"); } }, { discussion: () => { throw new Error("offline"); } }, { catalog: () => null }, { discussion: () => ({ roots: [] }) }]) {
    const h = harness(options); await h.controller.update(ready()); assert.equal(h.painted.get(null), "disconnected"); assert.equal(h.marker(), undefined);
  }
  const h = harness({ catalog: () => catalog([]) }); await h.controller.update(ready()); assert.equal(h.painted.get(null), "connected"); assert.equal(h.discussionReads(), 0);
});
test("catalog/discussion mutation reconciles once and refuses inconsistent generation or stale Source", async () => {
  let count = 0;
  const h = harness({ catalog: () => catalog(undefined, ++count === 1 ? 2 : 3), discussion: () => discussion([], 3) });
  await h.controller.update(ready()); assert.equal(h.painted.get(7), "shared"); assert.equal(h.reads(), 2);
  const corrected = harness({ catalog: () => ++count === 1 ? catalog() : catalog([], 3), discussion: () => discussion([], 3) }); count = 0;
  await corrected.controller.update(ready()); assert.equal(corrected.painted.get(7), undefined); assert.equal(corrected.painted.get(null), "connected");
  const incoherent = harness({ discussion: () => ({ ...discussion(), version: { generation: "other-generation", revision: 2 } }) });
  await incoherent.controller.update(ready()); assert.equal(incoherent.reads(), 2); assert.equal(incoherent.painted.get(null), "disconnected");
});
test("failed neutralization retains marker and prevents a newer page override", async () => {
  let fail = false; const h = harness({ paint: (id, state) => { if (id === 7 && ["connected", "disconnected"].includes(state) && fail) throw new Error("API unavailable"); } });
  await h.controller.update(ready()); fail = true; await h.controller.update(ready({ tabId: 8 })); assert.equal(h.marker(), 7); assert.equal(h.painted.get(8), undefined);
  await h.controller.tabRemoved(7); assert.equal(h.marker(), undefined);
});
