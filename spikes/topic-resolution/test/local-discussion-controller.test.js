import assert from "node:assert/strict";
import test from "node:test";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";
import { localServiceSourceId } from "../browser/fixtures/local-service-fixture-bridge.js";
import { validateAndProjectActiveTabResponse } from "../browser/core/indicator-contract.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { createTabLifecycleObserver } from "../browser/chromium/active-tab-reader.js";
import { LocalServiceSessionProxyError } from "../browser/core/local-service-session.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
function harness(overrides = {}) {
  let id = 0;
  const service = createMemoryDemoService({ nextId: (type) => `${type}-${++id}`, now: () => "2026-09-28T12:00:00.000Z" });
  const requests = [];
  const client = {
    async health() { return {}; }, async catalog() { return service.catalog(); },
    async discussion(topicId) { requests.push(["discussion", topicId]); return service.discussion(topicId); },
    async related(sourceId, limit) { requests.push(["related", sourceId, limit]); return service.related(sourceId, limit); },
    async command(expected, command, actor) { requests.push(["command", command]); return service.command(expected, command, actor); },
    async reset(expected, confirmation) { return { version: service.reset(expected, confirmation) }; },
    ...overrides.client,
  };
  let paired = true, clears = 0, invalidation, stopped = 0;
  const session = { async isPaired() { return paired; }, async setToken() { paired = true; },
    async clear() { paired = false; clears += 1; }, ...overrides.session };
  const controller = createLocalDiscussionController({ client, session,
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle(tabId, callback) { assert.equal(tabId, 7); invalidation = callback; return () => { stopped += 1; }; },
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl, ...overrides,
    client, session });
  return { controller, service, requests, invalidate: () => invalidation(),
    clears: () => clears, stopped: () => stopped };
}

test("bridge pins both original validated reserved-domain fixtures without Harbor relabeling", async () => {
  for (const [domain, id] of [["com", "reserved-example-com"], ["org", "reserved-example-org"]]) {
    const input = { normalizedUrl: `https://example.${domain}/`, requestToken: "activation-000001" };
    const view = validateAndProjectActiveTabResponse(await lookupIndicatorFixtureByNormalizedUrl(input), {
      ...input, scenarioId: `active-tab-example-${domain}` });
    assert.equal(localServiceSourceId(view), id);
  }
  assert.equal(localServiceSourceId({ outcome: "resolved", source: { id: "harbor-s2" } }), null);
});

test("paired popup automatically loads bridged service discussion and sends IDs only", async () => {
  const ui = harness(); await ui.controller.open();
  assert.equal(ui.controller.currentState().topicId, "reserved-domain-demo");
  assert.equal(ui.controller.currentState().phase, "ready");
  assert.deepEqual(ui.requests.find((entry) => entry[0] === "related"), ["related", "reserved-example-com", 5]);
  assert.equal(JSON.stringify(ui.requests).includes("https:"), false);
  assert.equal(ui.controller.currentState().discussion.roots.length, 0);
});

test("new pairing is not persisted until durable service validation succeeds", async () => {
  let saved = 0;
  const ui = harness({ validatePairing: async () => { throw Object.assign(new Error(), { code: "durable-pairing-required" }); },
    session: { async setToken() { saved++; } } });
  await ui.controller.pair("synthetic-new-capability-for-tests-only");
  assert.equal(saved, 0);
  assert.equal(ui.controller.currentState().error, "durable-pairing-required");
});
test("extension pairing RPC failure stays distinct from local HTTP outage", async () => {
  let healthCalls = 0;
  const ui = harness({ session: { async isPaired() { throw new LocalServiceSessionProxyError(); } },
    client: { async health() { healthCalls++; } } });
  await ui.controller.open();
  assert.equal(ui.controller.currentState().phase, "error");
  assert.equal(ui.controller.currentState().error, "extension-connection-unavailable");
  assert.equal(healthCalls, 0);
  assert.equal(ui.clears(), 0);
});

test("root and reply link their own deliberately selected Sources; manual Topic has no origin", async () => {
  const ui = harness(); await ui.controller.open();
  ui.controller.setDraft("Root from first Source"); assert.equal(await ui.controller.submitDraft(), true);
  const root = ui.controller.currentState().discussion.roots[0];
  assert.equal(ui.requests.find((entry) => entry[0] === "command")[1].originSourceId, "reserved-example-com");
  assert.equal(root.origin.sourceId, "reserved-example-com");
  await ui.controller.selectSource("reserved-example-org");
  assert.equal(ui.controller.begin("reply", root.id), true);
  ui.controller.setDraft("Reply from second Source"); assert.equal(await ui.controller.submitDraft(), true);
  const replied = ui.controller.currentState().discussion.roots[0];
  assert.equal(replied.replies[0].rootId, replied.id);
  assert.equal(replied.replies[0].origin.sourceId, "reserved-example-org");
  assert.equal(ui.requests.filter((entry) => entry[0] === "command")[1][1].originSourceId, "reserved-example-org");
  assert.equal(ui.controller.begin("edit", replied.replies[0].id), true);
  ui.controller.setDraft("Edited reply"); assert.equal(await ui.controller.submitDraft(), true);
  assert.equal(ui.controller.currentState().discussion.roots[0].replies[0].origin.sourceId, "reserved-example-org");
  assert.equal(Object.hasOwn(ui.requests.filter((entry) => entry[0] === "command")[2][1], "originSourceId"), false);
  await ui.controller.selectTopic("reserved-domain-demo");
  ui.controller.setDraft("Manual Topic root"); assert.equal(await ui.controller.submitDraft(), true);
  assert.equal(ui.requests.filter((entry) => entry[0] === "command").at(-1)[1].originSourceId, null);
  assert.equal(Object.hasOwn(ui.controller.currentState().discussion.roots.find((entry) => entry.body === "Manual Topic root"), "origin"), false);
});

test("a retained-only account Source can be viewed but cannot poison a new post origin", async () => {
  let sequence = 0;
  const service = createMemoryDemoService({ nextId: (type) => `${type}-${++sequence}`,
    now: () => "2026-10-04T00:00:00.000Z" });
  const retained = { id: "source-retained-account", url: "https://account.example.com/articles/public-story",
    title: "Historical account-host Source", provenance: "owner-local-page-embedding/v1",
    topicId: "reserved-domain-demo" };
  let posted;
  const client = {
    async health() { return {}; },
    async catalog() { const value = service.catalog(); return { ...value, sources: [...value.sources, retained] }; },
    async discussion(topicId) { return service.discussion(topicId); },
    async related(sourceId) { return sourceId === retained.id
      ? { version: service.catalog().version, model: service.catalog().model, results: [] }
      : service.related(sourceId, 5); },
    async command(expected, command, actorId) { posted = command; return service.command(expected, command, actorId); },
  };
  const controller = createLocalDiscussionController({ client,
    session: { async isPaired() { return true; } },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl });
  await controller.open();
  await controller.selectSource(retained.id);
  assert.equal(controller.currentState().phase, "ready");
  controller.setDraft("A deliberate topic comment");
  assert.equal(await controller.submitDraft(), true);
  assert.equal(posted.originSourceId, null);
  assert.equal(controller.currentState().phase, "ready");
  assert.equal(controller.currentState().discussion.roots[0].body, "A deliberate topic comment");
  assert.equal(Object.hasOwn(controller.currentState().discussion.roots[0], "origin"), false);
  controller.dispose();
});

test("changed manual Source Topic detaches unsent draft before a fresh read", async () => {
  let moved = false;
  const ui = harness({ client: { async catalog() {
    const value = structuredClone(ui.service.catalog());
    if (moved) value.sources.find((entry) => entry.id === "reserved-example-com").topicId = "harbor-s2";
    return value;
  } } });
  await ui.controller.open(); await ui.controller.selectSource("reserved-example-com");
  ui.controller.setDraft("Never silently retarget"); moved = true; await ui.controller.open();
  assert.equal(ui.controller.currentState().topicId, "harbor-s2");
  assert.equal(ui.controller.currentState().draft.detached, true);
  assert.equal(await ui.controller.submitDraft(), false);
});

test("unsupported observed private-like URL offers manual choice without transmitting it", async () => {
  const ui = harness({ readActiveTab: async () => ({ tabId: 7, url: "https://private.invalid/account?secret=private-title" }) });
  await ui.controller.open(); assert.equal(ui.controller.currentState().topicId, null);
  assert.equal(ui.requests.length, 0);
  await ui.controller.selectTopic(ui.service.catalog().topics[0].id);
  assert.equal(ui.controller.currentState().phase, "ready");
  assert.equal(JSON.stringify(ui.requests).includes("private"), false);
});

test("manual selection wins late automatic fixture response and source navigation detaches draft", async () => {
  const lookup = deferred();
  const ui = harness({ lookupByNormalizedUrl: () => lookup.promise });
  const opening = ui.controller.open(); await turn();
  const topicId = ui.service.catalog().topics[0].id;
  await ui.controller.selectTopic(topicId); ui.controller.setDraft("Unsent demo");
  const request = { normalizedUrl: "https://example.com/", requestToken: "activation-000002" };
  lookup.resolve(await lookupIndicatorFixtureByNormalizedUrl(request)); await opening;
  assert.equal(ui.controller.currentState().topicId, topicId);
  ui.invalidate(); assert.equal(ui.controller.currentState().topicId, null);
  assert.equal(ui.controller.currentState().draft.detached, true);
  assert.equal(await ui.controller.submitDraft(), false);
  await ui.controller.selectTopic(topicId); assert.equal(await ui.controller.submitDraft(), false);
  ui.controller.reattachDraft(); assert.equal(await ui.controller.submitDraft(), true);
});

test("manual selection before slow initial tab observation still installs lifecycle watcher", async () => {
  const tab = deferred(); const ui = harness({ readActiveTab: () => tab.promise });
  const opening = ui.controller.open(); await turn();
  await ui.controller.selectTopic(ui.service.catalog().topics[0].id);
  ui.controller.setDraft("Detached on same-URL reload/close/replacement");
  tab.resolve({ tabId: 7, url: "https://example.com/" }); await opening;
  ui.invalidate(); assert.equal(ui.controller.currentState().discussion, null);
  assert.equal(ui.controller.currentState().draft.detached, true);
});

test("human CRUD, actor ownership, reply topology, edited state and reset use service data", async () => {
  const ui = harness(); await ui.controller.open();
  ui.controller.setDraft("Root\nsecond line"); assert.equal(await ui.controller.submitDraft(), true);
  let root = ui.controller.currentState().discussion.roots[0];
  assert.equal(ui.controller.begin("reply", root.id), true);
  ui.controller.setDraft("Reply"); await ui.controller.submitDraft();
  assert.equal(ui.controller.begin("edit", root.id), true);
  ui.controller.setDraft("Edited root"); await ui.controller.submitDraft();
  root = ui.controller.currentState().discussion.roots[0]; assert.equal(root.edited, true);
  await ui.controller.selectActor("demo-blair");
  assert.equal(ui.controller.begin("edit", root.id), false); assert.equal(await ui.controller.withdraw(root.id), false);
  await ui.controller.selectActor("demo-alex"); await ui.controller.withdraw(root.id);
  root = ui.controller.currentState().discussion.roots[0];
  assert.equal(root.state, "deleted"); assert.equal(root.replies[0].body, "Reply");
  assert.equal(await ui.controller.reset("wrong"), false);
  assert.equal(await ui.controller.reset("RESET DEMO STATE"), true);
  assert.equal(ui.controller.currentState().discussion.roots.length, 0);
});

test("actor change detaches text; late unauthorized read cannot wipe fresh session", async () => {
  const oldRead = deferred(); let reads = 0;
  const ui = harness({ client: { async discussion(topicId) {
    if (++reads === 2) return oldRead.promise;
    return ui.service.discussion(topicId);
  } } });
  await ui.controller.open(); ui.controller.setDraft("Review before changing actor");
  const old = ui.controller.selectActor("demo-blair"); await turn();
  await ui.controller.selectActor("demo-alex");
  oldRead.reject(Object.assign(new Error(), { code: "unauthorized" })); await old;
  assert.equal(ui.clears(), 0); assert.equal(ui.controller.currentState().phase, "ready");
  assert.equal(ui.controller.currentState().draft.detached, true);
});

test("late unpaired session read and disposed requests do not publish old state", async () => {
  const first = deferred(); let reads = 0;
  const ui = harness({ session: { isPaired: () => ++reads === 1 ? first.promise : Promise.resolve(true) } });
  const old = ui.controller.open(); await ui.controller.open();
  first.resolve(false); await old; assert.equal(ui.controller.currentState().phase, "ready");
  ui.controller.setDraft("Memory only"); ui.controller.dispose();
  assert.equal(ui.controller.currentState().catalog, null);
  assert.equal(ui.controller.currentState().draft.body, ""); assert.ok(ui.stopped() > 0);
});

test("ambiguous failure never retries or permits writes until reload; duplicate/editor locked", async () => {
  const pending = deferred(); let writes = 0;
  const ui = harness({ client: { command: () => { writes += 1; return pending.promise; } } });
  await ui.controller.open(); ui.controller.setDraft("Only one write");
  const writing = ui.controller.submitDraft();
  ui.controller.setDraft("Cannot replace busy text");
  assert.equal(ui.controller.currentState().draft.body, "Only one write");
  assert.equal(await ui.controller.submitDraft(), false);
  pending.reject(Object.assign(new Error(), { code: "unavailable" })); await writing;
  assert.equal(writes, 1); assert.equal(ui.controller.currentState().discussion, null);
  assert.equal(await ui.controller.createTopic("Another topic", "general"), false);
  assert.equal(await ui.controller.reset("RESET DEMO STATE"), false);
  await ui.controller.open(); assert.equal(ui.controller.currentState().phase, "ready");
  assert.equal(ui.controller.currentState().draft.detached, true);
});

test("active unauthorized clears projections; credential compare-clear belongs to the client", async () => {
  for (const code of ["unauthorized", "conflict", "capacity", "invalid-response"]) {
    const ui = harness({ client: { command: async () => { throw Object.assign(new Error(), { code }); } } });
    await ui.controller.open(); ui.controller.setDraft("Demo failure"); await ui.controller.submitDraft();
    assert.equal(ui.controller.currentState().error, code);
    assert.equal(ui.controller.currentState().discussion, null);
    assert.equal(ui.clears(), 0);
  }
});

test("manual known-source selection requests service ranking; unlinked source never implies a Topic", async () => {
  const ui = harness(); await ui.controller.open();
  const sources = ui.service.catalog().sources;
  const linked = sources.find((entry) => entry.id === "harbor-overview");
  assert.ok(linked); await ui.controller.selectSource(linked.id);
  assert.equal(ui.controller.currentState().related.results.length, 4);
  ui.controller.setDraft("Review retargeting");
  const unlinked = sources.find((entry) => entry.topicId === null);
  await ui.controller.selectSource(unlinked.id);
  assert.equal(ui.controller.currentState().topicId, null);
  assert.equal(ui.controller.currentState().discussion, null);
  assert.equal(ui.controller.currentState().draft.detached, true);
  await ui.controller.open();
  assert.equal(ui.controller.currentState().sourceId, unlinked.id);
  assert.equal(ui.controller.currentState().topicId, null);
});

test("storage failures in pairing and disconnect are visible without rejection", async () => {
  const ui = harness({ session: {
    async setToken() { throw new Error("Private storage details"); },
    async clear() { throw new Error("Private storage details"); },
  } });
  await ui.controller.pair("test-session");
  assert.equal(ui.controller.currentState().error, "unavailable");
  await ui.controller.disconnect(); assert.equal(ui.controller.currentState().discussion, null);
  const denied = harness({ client: { async health() { throw Object.assign(new Error(), { code: "unauthorized" }); } },
    session: { async clear() { throw new Error("Private storage details"); } } });
  await denied.controller.open();
  assert.equal(denied.controller.currentState().phase, "disconnected");
  assert.equal(denied.controller.currentState().error, "unauthorized");
});

test("creating a Topic preserves existing unsent contribution text only as detached", async () => {
  const ui = harness(); await ui.controller.open(); ui.controller.setDraft("Review before attaching to new Topic");
  assert.equal(await ui.controller.createTopic("New synthetic Topic", "general"), true);
  assert.equal(ui.controller.currentState().draft.body, "Review before attaching to new Topic");
  assert.equal(ui.controller.currentState().draft.detached, true);
  assert.equal(await ui.controller.submitDraft(), false);
});

test("one-shot Chromium lifecycle observer rearms across two navigations and manual selection", async () => {
  const event = () => ({ listeners: new Set(), addListener(fn) { this.listeners.add(fn); },
    removeListener(fn) { this.listeners.delete(fn); }, emit(...args) { for (const fn of [...this.listeners]) fn(...args); } });
  const tabs = { onUpdated: event(), onRemoved: event(), onReplaced: event() };
  const observer = createTabLifecycleObserver(tabs);
  const ui = harness({ observeTabLifecycle: observer.observe });
  await ui.controller.open(); ui.controller.setDraft("First navigation");
  tabs.onUpdated.emit(7); await turn();
  assert.equal(ui.controller.currentState().draft.detached, true);
  await ui.controller.selectTopic("reserved-domain-demo"); ui.controller.reattachDraft();
  tabs.onUpdated.emit(7); await turn();
  assert.equal(ui.controller.currentState().draft.detached, true);
  assert.equal(ui.controller.currentState().topicId, null);
  assert.equal(await ui.controller.submitDraft(), false);
  await ui.controller.selectTopic("reserved-domain-demo"); ui.controller.reattachDraft();
  tabs.onReplaced.emit(8, 7); await turn();
  assert.equal(ui.controller.currentState().draft.detached, true);
  assert.equal(ui.controller.currentState().discussion, null);
  ui.controller.dispose(); assert.equal(tabs.onUpdated.listeners.size, 0);
  assert.equal(tabs.onRemoved.listeners.size, 0); assert.equal(tabs.onReplaced.listeners.size, 0);
});

test("reload reattests automatic selection when source becomes unsupported without an event", async () => {
  let url = "https://example.com/";
  const ui = harness({ readActiveTab: async () => ({ tabId: 7, url }) });
  await ui.controller.open(); ui.controller.setDraft("Unsent automatic-context text");
  url = "chrome://extensions/"; await ui.controller.open();
  assert.equal(ui.controller.currentState().phase, "choose-topic");
  assert.equal(ui.controller.currentState().topicId, null);
  assert.equal(ui.controller.currentState().discussion, null);
  assert.equal(ui.controller.currentState().draft.detached, true);
});

test("navigation during an uncertain write blocks subsequent create/reset until fresh reload", async () => {
  const pending = deferred();
  const ui = harness({ client: { command: () => pending.promise } });
  await ui.controller.open(); ui.controller.setDraft("Unknown write outcome");
  const writing = ui.controller.submitDraft(); ui.invalidate();
  await ui.controller.selectTopic("reserved-domain-demo");
  pending.reject(Object.assign(new Error(), { code: "unavailable" })); await writing;
  assert.equal(ui.controller.currentState().phase, "error");
  assert.equal(await ui.controller.createTopic("Another Topic", "general"), false);
  assert.equal(await ui.controller.reset("RESET DEMO STATE"), false);
  await ui.controller.open(); assert.equal(ui.controller.currentState().phase, "ready");
});

test("initial connecting and unsupported choose-topic cannot silently attach typed text later", async () => {
  const health = deferred(); let url = "https://example.com/";
  const ui = harness({ client: { health: () => health.promise }, readActiveTab: async () => ({ tabId: 7, url }) });
  const opening = ui.controller.open(); await turn();
  ui.controller.setDraft("Cannot type before selection exists");
  assert.equal(ui.controller.currentState().draft.body, "");
  health.resolve({}); await opening;
  assert.equal(ui.controller.currentState().phase, "ready");
  assert.equal(ui.controller.currentState().draft.body, "");
  url = "chrome://extensions/"; await ui.controller.open();
  ui.controller.setDraft("Cannot type without a topic");
  assert.equal(ui.controller.currentState().draft.body, "");
  url = "https://example.com/"; await ui.controller.open();
  assert.equal(ui.controller.currentState().draft.body, "");
});

test("settled ambiguous write latch survives later navigation and selections until successful open", async () => {
  const ui = harness({ client: { async command() { throw Object.assign(new Error(), { code: "unavailable" }); } } });
  await ui.controller.open(); ui.controller.setDraft("Possibly committed text");
  await ui.controller.submitDraft();
  assert.equal(ui.controller.currentState().needsFreshRead, true);
  ui.invalidate(); await turn();
  assert.equal(await ui.controller.createTopic("Must read first", "general"), false);
  assert.equal(await ui.controller.reset("RESET DEMO STATE"), false);
  await ui.controller.selectTopic("reserved-domain-demo");
  assert.equal(ui.controller.currentState().needsFreshRead, true);
  ui.controller.reattachDraft(); assert.equal(ui.controller.currentState().draft.detached, true);
  ui.controller.setDraft("Cannot edit before fresh read");
  assert.equal(ui.controller.currentState().draft.body, "Possibly committed text");
  assert.equal(await ui.controller.createTopic("Still needs open", "general"), false);
  await ui.controller.open();
  assert.equal(ui.controller.currentState().needsFreshRead, false);
  assert.equal(ui.controller.currentState().draft.detached, true);
});

function backgroundHarness(overrides = {}) {
  const url = "http://127.0.0.1:4173/background-fixture/page-a.html";
  let resolution = { phase: "processing", reason: "embedding", tabId: 7, url, documentId: "doc-1", sourceId: null, topicId: null,
    assignment: null, sequence: 1, enabled: true, blockedOrigins: [], sessionWindowId: 2, currentWindowId: 2, sessionRevision: "fixture-revision", hostAccess: true, currentOrigin: "http://127.0.0.1:4173", currentTabId: 7, currentUrl: url, contextReason: null };
  const pauses = [];
  const ui = harness({ readPageResolution: async () => resolution,
    readActiveTab: async () => ({ tabId: resolution.currentTabId, url: resolution.currentUrl }),
    async pausePageMatching() { pauses.push("pause"); resolution = { ...resolution, enabled: false, sessionWindowId: null, phase: "off", sequence: resolution.sequence + 1 }; return resolution; }, ...overrides });
  function ingest() {
    const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
    const result = ui.service.ingest({ expected: ui.service.catalog().version, operationId: "owned-operation-1", url,
      title: "Owned synthetic learned article", embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: vector }, extractorVersion: "main-text-prefix/v1" });
    resolution = { ...resolution, phase: "ready", reason: null, sourceId: result.sourceId, topicId: result.topicId, assignment: result.assignment };
    return result;
  }
  return { ...ui, ingest, pauses, resolution: () => resolution,
    setResolution(patch) { resolution = { ...resolution, ...patch }; }, publish: () => ui.controller.updatePageResolution(resolution) };
}

test("delayed learned readiness loads real service Topic and comment; manual selection wins", async () => {
  const ui = backgroundHarness(); await ui.controller.open();
  assert.equal(ui.controller.currentState().phase, "choose-topic"); assert.equal(ui.controller.currentState().topicId, null);
  const learned = ui.ingest(); await ui.publish();
  assert.equal(ui.controller.currentState().selection, "background"); assert.equal(ui.controller.currentState().topicId, learned.topicId);
  ui.controller.setDraft("Owner-only comment on learned Topic"); assert.equal(await ui.controller.submitDraft(), true);
  assert.equal(ui.service.discussion(learned.topicId).roots[0].body, "Owner-only comment on learned Topic");
  await ui.controller.selectTopic("harbor-s2"); ui.controller.setDraft("Explicit manual destination");
  await ui.publish(); assert.equal(ui.controller.currentState().topicId, "harbor-s2");
  assert.equal(ui.controller.currentState().draft.detached, false);
});

test("background document/processing changes detach drafts without retargeting, late stale status rejected on submit", async () => {
  const ui = backgroundHarness(); await ui.controller.open(); ui.ingest(); await ui.publish();
  ui.controller.setDraft("Keep this text detached");
  ui.setResolution({ phase: "checking", documentId: null, sourceId: null, topicId: null, sequence: 2 }); await ui.publish();
  assert.equal(ui.controller.currentState().discussion, null); assert.equal(ui.controller.currentState().draft.detached, true);
  const catalogSource = ui.service.catalog().sources.find((source) => source.provenance === "owner-local-page-embedding/v1");
  ui.setResolution({ phase: "ready", documentId: "doc-2", sourceId: catalogSource.id, topicId: catalogSource.topicId, assignment: "provisional" });
  await ui.publish(); assert.equal(ui.controller.currentState().draft.detached, true);
  ui.controller.reattachDraft();
  ui.setResolution({ currentUrl: ui.resolution().url + "?navigation=changed" });
  assert.equal(await ui.controller.submitDraft(), false);
  assert.equal(ui.requests.some(([type]) => type === "command"), false);
  assert.equal(ui.controller.currentState().draft.detached, true);
});

test("correction pauses before fresh-version write, detaches unsent text and moves source-anchored root with its Topic", async () => {
  const ui = backgroundHarness(); await ui.controller.open(); const learned = ui.ingest(); await ui.publish();
  ui.controller.setDraft("Old shared comment"); await ui.controller.submitDraft();
  ui.controller.setDraft("Unsent must not move with correction");
  assert.equal(await ui.controller.correctSource(null, "wrong"), false); assert.equal(ui.pauses.length, 0);
  assert.equal(await ui.controller.correctSource(null, "CONFIRM SOURCE TOPIC"), true);
  assert.equal(ui.pauses.length, 1); assert.notEqual(ui.controller.currentState().topicId, learned.topicId);
  assert.equal(ui.controller.currentState().draft.detached, true);
  assert.equal(ui.service.discussion(learned.topicId).roots.length, 0);
  assert.equal(ui.controller.currentState().discussion.roots[0].body, "Old shared comment");
  assert.equal(ui.controller.currentState().discussion.roots[0].regrouped, true);
  assert.equal(ui.controller.currentState().discussion.roots[0].origin.sourceId, learned.sourceId);
});

test("Forget retains shared comments; learned deletion/clear require exact confirmation and pause", async () => {
  const ui = backgroundHarness(); await ui.controller.open(); const learned = ui.ingest(); await ui.publish();
  ui.controller.setDraft("Shared remains after Forget"); await ui.controller.submitDraft();
  assert.equal(await ui.controller.forgetSource(), true); assert.equal(ui.pauses.length, 1);
  assert.equal(ui.service.discussion(learned.topicId).roots[0].body, "Shared remains after Forget");
  const deletion = backgroundHarness(); await deletion.controller.open(); const target = deletion.ingest(); await deletion.publish();
  assert.equal(await deletion.controller.deleteLearnedTopic("incorrect"), false);
  assert.equal(await deletion.controller.deleteLearnedTopic("DELETE TOPIC AND DISCUSSION"), true);
  assert.throws(() => deletion.service.discussion(target.topicId));
  const clearing = backgroundHarness(); await clearing.controller.open(); clearing.ingest(); await clearing.publish();
  assert.equal(await clearing.controller.clearLearnedData("incorrect"), false);
  assert.equal(await clearing.controller.clearLearnedData("CLEAR LEARNED DATA"), true);
  assert.equal(clearing.service.catalog().sources.length, 8); assert.equal(clearing.pauses.length, 1);
});

test("learned control duplicate/ambiguous failure remains locked until fresh read", async () => {
  const pause = deferred();
  const ui = backgroundHarness({ pausePageMatching: () => pause.promise,
    client: { async command() { throw Object.assign(new Error(), { code: "unavailable" }); } } });
  await ui.controller.open(); ui.ingest(); await ui.publish();
  const forgetting = ui.controller.forgetSource(); assert.equal(ui.controller.currentState().busy, true);
  assert.equal(await ui.controller.forgetSource(), false); pause.resolve(); await forgetting;
  assert.equal(ui.controller.currentState().needsFreshRead, true);
  assert.equal(await ui.controller.clearLearnedData("CLEAR LEARNED DATA"), false);
});

test("manual choice wins learned auto-resolution with a late catalog response", async () => {
  const catalog = deferred(); let calls = 0;
  const ui = backgroundHarness({ client: { async catalog() {
    if (++calls === 2) return catalog.promise;
    return ui.service.catalog();
  } } });
  await ui.controller.open(); ui.ingest();
  const applying = ui.publish(); await turn();
  await ui.controller.selectTopic("harbor-s2"); ui.controller.setDraft("Manual text destination");
  catalog.resolve(ui.service.catalog()); await applying;
  assert.equal(ui.controller.currentState().selection, "manual");
  assert.equal(ui.controller.currentState().topicId, "harbor-s2");
  assert.equal(ui.controller.currentState().draft.body, "Manual text destination");
  assert.equal(ui.controller.currentState().draft.detached, false);
});

test("Forgotten orphan learned Topic remains deletable; corrected fixture Topic cannot be deleted", async () => {
  const ui = backgroundHarness(); await ui.controller.open(); const learned = ui.ingest(); await ui.publish();
  ui.controller.setDraft("Shared orphan comment"); await ui.controller.submitDraft();
  await ui.controller.forgetSource();
  await ui.controller.selectTopic(learned.topicId);
  assert.equal(ui.controller.currentState().sourceId, null);
  assert.equal(ui.controller.currentState().catalog.topics.find((topic) => topic.id === learned.topicId).learned, true);
  assert.equal(await ui.controller.deleteLearnedTopic("DELETE TOPIC AND DISCUSSION"), true);
  assert.throws(() => ui.service.discussion(learned.topicId));
  const corrected = backgroundHarness(); await corrected.controller.open(); corrected.ingest(); await corrected.publish();
  await corrected.controller.correctSource("harbor-s2", "CONFIRM SOURCE TOPIC");
  assert.equal(corrected.controller.currentState().topicId, "harbor-s2");
  assert.equal(await corrected.controller.deleteLearnedTopic("DELETE TOPIC AND DISCUSSION"), false);
  assert.equal(corrected.pauses.length, 1);
});
