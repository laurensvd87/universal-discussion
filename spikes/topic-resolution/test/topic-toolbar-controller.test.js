import assert from "node:assert/strict";
import test from "node:test";
import { createTopicToolbarController, hasSharedLearnedTopic } from "../browser/core/topic-toolbar-controller.js";

const LEARNED = "owner-local-page-embedding/v1";
const ready = (patch = {}) => ({ phase: "ready", tabId: 7, documentId: "document-a", url: "https://example.com/a",
  sourceId: "source-a", topicId: "topic-a", sequence: 1, ...patch });
const source = (id, url, topicId = "topic-a", provenance = LEARNED) => ({ id, url, topicId, provenance, title: "Synthetic article" });
function catalog(sources = [source("source-a", ready().url), source("source-b", "https://example.org/b")]) {
  return { version: { generation: "generation-a", revision: 2 }, actors: [],
    model: { id: "hand-authored-demo-vectors/1", status: "fixture-only" },
    topics: [{ id: "topic-a", title: "A", kind: "general", learned: true }, { id: "topic-b", title: "B", kind: "general", learned: true }], sources };
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { await new Promise((done) => setImmediate(done)); };
function harness(options = {}) {
  const writes = [];
  let marker = options.marker;
  let reads = 0;
  const painted = new Map();
  const controller = createTopicToolbarController({
    catalog: async (request) => { reads++; return options.catalog ? options.catalog(request) : catalog(); },
    paint: async (id, shared) => {
      writes.push([id, shared]);
      if (options.paint) await options.paint(id, shared);
      painted.set(id, shared);
    },
    readMarker: async () => { if (options.readMarker) await options.readMarker(); return marker; },
    writeMarker: async (id) => { if (options.writeMarker) await options.writeMarker(id); marker = id; },
    removeMarker: async () => { if (options.removeMarker) await options.removeMarker(); marker = undefined; },
  });
  return { controller, writes, painted, marker: () => marker, reads: () => reads };
}

test("only exact current learned source and a distinct learned page sharing its Topic qualify", () => {
  assert.equal(hasSharedLearnedTopic(ready(), catalog()), true);
  assert.equal(hasSharedLearnedTopic(ready({ assignment: "manual-confirmed" }), catalog()), true);
  const a = source("source-a", ready().url);
  for (const sources of [[], [a], [a, source("source-b", a.url)],
    [a, source("source-b", "https://example.org/b", "topic-b")],
    [a, source("source-b", "https://example.org/b", "topic-a", "project-created-hand-authored-demo/1")],
    [source("source-a", "https://example.com/stale"), source("source-b", "https://example.org/b")],
    [source("source-a", ready().url, "topic-b"), source("source-b", "https://example.org/b")],
    [source("source-a", ready().url, "topic-a", "project-created-hand-authored-demo/1"), source("source-b", "https://example.org/b")],
    [a, { ...a }]]) assert.equal(hasSharedLearnedTopic(ready(), catalog(sources)), false);
  assert.equal(hasSharedLearnedTopic(ready(), { ...catalog(), sources: null }), false);
  assert.equal(hasSharedLearnedTopic(ready(), { ...catalog(), results: [{ relationship: "related" }] }), false);
  for (const patch of [{ phase: "processing" }, { tabId: -1 }, { documentId: null }, { sequence: undefined }, { sourceId: null }, { topicId: null }]) {
    assert.equal(hasSharedLearnedTopic(ready(patch), catalog()), false);
  }
});

test("startup restores neutral default; blue persists one inert integer before painting", async () => {
  const h = harness({ paint: async (id, shared) => { if (shared) assert.equal(h.marker(), id); } });
  await h.controller.initialized(); assert.deepEqual(h.writes, [[null, false]]);
  await h.controller.update(ready());
  assert.deepEqual(h.writes, [[null, false], [7, true]]); assert.equal(h.marker(), 7); assert.equal(h.reads(), 1);
  await h.controller.update({ phase: "off" });
  assert.equal(h.painted.get(7), false); assert.equal(h.marker(), undefined); assert.equal(h.reads(), 1);
});

test("worker reconstruction clears saved override before discarding marker and setting default", async () => {
  const h = harness({ marker: 7, removeMarker: async () => { assert.equal(h.painted.get(7), false); } });
  await h.controller.initialized();
  assert.deepEqual(h.writes, [[7, false], [null, false]]); assert.equal(h.marker(), undefined);
  await h.controller.update(ready()); assert.equal(h.painted.get(7), true);
});

test("reconstruction accepts only exact missing-tab errors; other API errors preserve cleanup marker", async () => {
  for (const missing of [true, false]) {
    const h = harness({ marker: 7, paint: async (id) => { if (id === 7) throw new Error(missing ? "No tab with id: 7." : "API unavailable"); } });
    await h.controller.initialized();
    assert.equal(h.marker(), missing ? undefined : 7);
    await h.controller.update(ready({ tabId: 8 }));
    assert.equal(h.painted.get(8), missing ? true : undefined);
  }
});

test("malformed startup markers never authorize a blue icon or a catalog read", async () => {
  for (const marker of [-1, "7", { tabId: 7 }, [7], Number.NaN]) {
    const h = harness({ marker }); await h.controller.update(ready());
    assert.deepEqual(h.writes, [[null, false]]); assert.equal(h.reads(), 0);
  }
});

for (const phase of ["off", "unpaired", "checking", "processing", "error", "unsupported", "not-enabled"]) {
  test(`${phase} neutralizes a ready icon without another catalog request`, async () => {
    const h = harness(); await h.controller.update(ready());
    await h.controller.update(ready({ phase }));
    assert.equal(h.painted.get(7), false); assert.equal(h.reads(), 1); assert.equal(h.marker(), undefined);
  });
}

for (const patch of [{ phase: "off" }, { phase: "checking" }, ready({ url: "https://example.com/next", sequence: 2 }), ready({ documentId: "document-reloaded", sequence: 2 }), ready({ tabId: 8, sequence: 2 })]) {
  test(`late catalog is fenced by ${JSON.stringify(patch)}`, async () => {
    const gate = deferred(); let count = 0;
    const h = harness({ catalog: () => ++count === 1 ? gate.promise : catalog([]) });
    const first = h.controller.update(ready()); await flush();
    const next = h.controller.update(patch); await flush();
    gate.resolve(catalog()); await Promise.all([first, next]);
    assert.ok(h.writes.every(([, shared]) => !shared)); assert.equal(h.marker(), undefined);
  });
}

test("catalog receives abort and late rejected requests cannot clear or repaint newer ready state", async () => {
  const gate = deferred(); let oldSignal; let count = 0;
  const h = harness({ catalog: ({ signal }) => { if (++count === 1) { oldSignal = signal; return gate.promise; } return catalog(); } });
  const first = h.controller.update(ready()); await flush();
  await h.controller.update(ready({ tabId: 8, sequence: 2 }));
  assert.equal(oldSignal.aborted, true); assert.equal(h.painted.get(8), true);
  gate.reject(Object.assign(new Error("401"), { code: "unauthorized" })); await first;
  assert.equal(h.painted.get(8), true); assert.equal(h.marker(), 8);
});

test("serialized icon writes neutralize an in-flight old blue before a newer blue", async () => {
  const gate = deferred(); let blocked = false;
  const h = harness({ paint: async (id, shared) => { if (id === 7 && shared && !blocked) { blocked = true; await gate.promise; } } });
  const first = h.controller.update(ready()); await flush();
  const second = h.controller.update(ready({ tabId: 8, sequence: 2 })); await flush();
  assert.equal(h.marker(), 7); assert.ok(!h.writes.some(([id]) => id === 8));
  gate.resolve(); await Promise.all([first, second]);
  assert.deepEqual(h.writes, [[null, false], [7, true], [7, false], [8, true]]);
  assert.equal(h.painted.get(7), false); assert.equal(h.painted.get(8), true);
});

test("navigation during marker persistence prevents blue and clears the recorded tab", async () => {
  const gate = deferred(); const h = harness({ writeMarker: () => gate.promise });
  const first = h.controller.update(ready()); await flush();
  const next = h.controller.update({ phase: "checking" });
  gate.resolve(); await Promise.all([first, next]);
  assert.ok(h.writes.every(([, shared]) => !shared)); assert.equal(h.marker(), undefined);
});

test("tab removal during catalog or marker write prevents blue and removes inert marker", async () => {
  for (const stage of ["catalog", "storage"]) {
    const gate = deferred();
    const h = harness(stage === "catalog" ? { catalog: () => gate.promise } : { writeMarker: () => gate.promise });
    const first = h.controller.update(ready()); await flush();
    const removal = h.controller.tabRemoved(7); gate.resolve(stage === "catalog" ? catalog() : undefined);
    await Promise.all([first, removal]);
    assert.ok(h.writes.every(([, shared]) => !shared)); assert.equal(h.marker(), undefined);
    await h.controller.update(ready({ tabId: 8, sequence: 2 }));
    assert.equal(h.painted.get(8), true);
  }
});

test("catalog errors, deleted Sources/Topics and invalid responses stay neutral", async () => {
  for (const value of [catalog([]), { ...catalog(), topics: [] }, null, { results: [] }]) {
    const h = harness({ catalog: () => value }); await h.controller.update(ready());
    assert.deepEqual(h.writes, [[null, false]]); assert.equal(h.marker(), undefined);
  }
  for (const code of ["unauthorized", "unavailable", "invalid-response"]) {
    const h = harness({ catalog: () => { throw Object.assign(new Error("Synthetic failure"), { code }); } });
    await h.controller.update(ready()); assert.deepEqual(h.writes, [[null, false]]);
  }
});

test("storage and action failures fail closed and retain cleanup evidence if neutralization fails", async () => {
  for (const failure of ["read", "write", "title", "icon", "remove"]) {
    const h = harness({
      readMarker: failure === "read" ? () => { throw new Error("storage"); } : undefined,
      writeMarker: failure === "write" ? () => { throw new Error("storage"); } : undefined,
      removeMarker: failure === "remove" ? () => { throw new Error("storage"); } : undefined,
      paint: ["title", "icon"].includes(failure) ? (id, shared) => { if (shared) throw new Error(failure); } : undefined,
    });
    await h.controller.update(ready());
    if (failure === "remove") { await h.controller.update({ phase: "off" }); assert.equal(h.marker(), 7); }
    else assert.ok(![...h.painted.values()].includes(true));
  }
});

test("failed neutral API never discards the marker or paints a different blue tab", async () => {
  let rejectNeutral = false;
  const h = harness({ paint: (id, shared) => { if (id === 7 && !shared && rejectNeutral) throw new Error("API unavailable"); } });
  await h.controller.update(ready()); rejectNeutral = true;
  await h.controller.update(ready({ tabId: 8, sequence: 2 }));
  assert.equal(h.marker(), 7); assert.equal(h.painted.get(8), undefined);
  await h.controller.tabRemoved(7); assert.equal(h.marker(), undefined);
  await h.controller.update(ready({ tabId: 8, sequence: 3 })); assert.equal(h.painted.get(8), true);
});
