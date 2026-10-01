import assert from "node:assert/strict";
import test from "node:test";
import { projectPageResolution } from "../browser/core/page-resolution-contract.js";

const KEY = "pageMatchingPreferences";
const CAPTURE_KEY = "pageMatchingCaptureSession";
const BLOCKED_KEY = "pageMatchingBlockedOrigins";
const TOKEN_KEY = "localServicePairingToken";
const ORIGIN = "https://example.com";
const EXTENSION_ID = "a".repeat(32);
const PAGE = `${ORIGIN}/article`;
let moduleSequence = 0;
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { await new Promise((done) => setImmediate(done)); await new Promise((done) => setImmediate(done)); };
function event() {
  const listeners = new Set();
  return { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener),
    emit(...args) { return [...listeners].map((listener) => listener(...args)); }, clear: () => listeners.clear(), listeners };
}
function embedding() { const values = Array(384).fill(0); values[0] = 1; return { modelId: "e5-small-q8-browser-main-prefix-v1", values }; }

async function harness(t, { enabled = true, paired = true, blocked = [], autoEligible = false } = {}) {
  const descriptors = new Map(["chrome", "fetch", "OffscreenCanvas"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events = Object.fromEntries(["message", "connect", "activated", "updated", "removed", "replaced", "focus", "windowRemoved", "permissionRemoved", "storageChanged"].map((name) => [name, event()]));
  const gates = [];
  const pendingControls = [];
  const calls = { reads: 0, windowQueries: 0, tabQueries: 0, attestations: 0, embeddings: 0, closes: 0, fetches: [], storageWrites: [], permissionRemovals: [], icons: [], titles: [] };
  const state = {
    local: { enabled, origins: [ORIGIN] }, token: paired ? `synthetic-test-token-${"x".repeat(40)}` : undefined,
    capture: autoEligible ? { schema: "capture-session/2", revision: "synthetic-control-revision-0001", windowId: enabled ? 1 : null, autoStart: true }
      : { schema: "capture-session/1", revision: "synthetic-control-revision-0001", windowId: enabled ? 1 : null }, blocked,
    tab: { id: 7, active: true, incognito: false, status: "complete", url: PAGE },
    window: { id: 1, focused: true, type: "normal" }, permitted: true, exists: false,
    writeGate: null, permissionGate: null, embedGate: null, unauthorized: false, healthUnavailable: false,
    windowError: false, tabQueryError: false,
    popupContexts: [], popupAnswer: null,
    now: 0, windowQueryHook: null, tabQueryHook: null,
    toolbarTabId: undefined, catalog: null, roots: [],
  };
  t.mock.method(globalThis.performance, "now", () => state.now);
  const createGate = () => { const gate = deferred(); gates.push(gate); return gate; };
  const api = {
    action: { setIcon: async (value) => calls.icons.push(value), setTitle: async (value) => calls.titles.push(value) },
    runtime: { id: EXTENSION_ID, getURL: (filename) => `chrome-extension://${EXTENSION_ID}/${filename}`, onMessage: events.message, onConnect: events.connect,
      getContexts: async (filter) => filter.contextTypes?.includes("POPUP") ? structuredClone(state.popupContexts) : state.exists ? [{}] : [],
      async sendMessage(message) {
        assert.equal(message.target, "embedding"); assert.equal(message.type, "embed");
        assert.equal(message.text, "Project-created bounded public article sample.");
        calls.embeddings++;
        if (state.embedGate) return state.embedGate.promise;
        return { embedding: embedding() };
      } },
    storage: {
      local: { setAccessLevel: async (value) => assert.equal(value.accessLevel, "TRUSTED_CONTEXTS"),
        get: async (key) => { assert.equal(key, BLOCKED_KEY); return { [BLOCKED_KEY]: structuredClone(state.blocked) }; },
        async set(value) {
          calls.storageWrites.push(structuredClone(value));
          if (state.writeGate) await state.writeGate.promise;
          const oldValue = state.blocked; state.blocked = structuredClone(value[BLOCKED_KEY]);
          events.storageChanged.emit({ [BLOCKED_KEY]: { oldValue, newValue: state.blocked } }, "local");
        } },
      session: { setAccessLevel: async (value) => assert.equal(value.accessLevel, "TRUSTED_CONTEXTS"),
        get: async (key) => key === "pageMatchingToolbarTabId" ? { [key]: state.toolbarTabId }
          : key === CAPTURE_KEY ? { [CAPTURE_KEY]: structuredClone(state.capture) } : state.token ? { [TOKEN_KEY]: state.token } : {},
        set: async (value) => {
          if (Object.hasOwn(value, CAPTURE_KEY)) {
            calls.storageWrites.push(structuredClone(value));
            if (state.writeGate) await state.writeGate.promise;
            state.capture = structuredClone(value[CAPTURE_KEY]);
          } else if (Object.hasOwn(value, "pageMatchingToolbarTabId")) state.toolbarTabId = value.pageMatchingToolbarTabId;
          else state.token = value[TOKEN_KEY];
        },
        remove: async (key) => {
          if (key === CAPTURE_KEY) { state.capture = undefined; return; }
          if (key === "pageMatchingToolbarTabId") { state.toolbarTabId = undefined; return; }
          assert.equal(key, TOKEN_KEY); const oldValue = state.token; state.token = undefined; events.storageChanged.emit({ [TOKEN_KEY]: { oldValue } }, "session");
        } },
      onChanged: events.storageChanged,
    },
    windows: { get: async (id) => state.window?.id === id ? structuredClone(state.window) : null, onRemoved: events.windowRemoved,
      getLastFocused: async (options) => { assert.deepEqual(options, { populate: false });
      calls.windowQueries++;
      if (state.windowQueryHook) return state.windowQueryHook(calls.windowQueries);
      if (state.windowError) throw new Error("private window detail"); return structuredClone(state.window); }, onFocusChanged: events.focus },
    tabs: { query: async (options) => { assert.deepEqual(options, { active: true, windowId: state.window.id });
      calls.tabQueries++;
      if (state.tabQueryHook) return state.tabQueryHook(calls.tabQueries);
      if (state.tabQueryError) throw new Error("private tab detail"); return state.tab ? [structuredClone(state.tab)] : []; },
      onActivated: events.activated, onUpdated: events.updated, onRemoved: events.removed, onReplaced: events.replaced },
    permissions: {
      async contains(value) { assert.deepEqual(value.origins, ["https://*/*"]); const gate = state.permissionGate; state.permissionGate = null; return gate ? gate.promise : state.permitted; },
      async remove(value) { calls.permissionRemovals.push(value); state.permitted = false; events.permissionRemoved.emit(value); return true; },
      onRemoved: events.permissionRemoved,
    },
    scripting: { async executeScript({ args, target, world }) {
      assert.equal(world, "ISOLATED"); assert.equal(target.tabId, state.tab.id);
      const attestation = Object.hasOwn(target, "documentIds");
      if (attestation) calls.attestations++; else calls.reads++;
      return [{ frameId: 0, documentId: "document-a", result: attestation
        ? { contractVersion: "page-content-attestation/1", status: "attested", url: args[0] }
        : { contractVersion: "page-content/1", status: "collected", url: args[0], title: "Synthetic article",
          text: "Project-created bounded public article sample.", extractorVersion: "main-text-prefix/v1" } }];
    } },
    offscreen: { createDocument: async () => { state.exists = true; }, closeDocument: async () => { calls.closes++; state.exists = false; } },
  };
  const fakeFetch = async (url, options) => {
    // Never delegate to ambient fetch. Only a mocked approved loopback route exists.
    assert.ok(url.startsWith("http://127.0.0.1:4174/v1/"));
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    calls.fetches.push({ url, body: options.body });
    const headers = { "content-type": "application/json" };
    if (state.unauthorized) return new Response('{"error":"unauthorized"}', { status: 401, headers });
    if (url.endsWith("/health")) {
      if (state.healthUnavailable) throw new Error("Synthetic local service unavailable");
      return new Response(JSON.stringify({ protocol: "local-service/v1", capability: "paired-demo" }), { headers });
    }
    if (url.endsWith("/catalog")) return new Response(JSON.stringify(state.catalog ?? { version: { generation: "generation-a", revision: 0 }, model: { id: "hand-authored-demo-vectors/1", status: "fixture-only" }, actors: [], topics: [], sources: [] }), { headers });
    if (url.endsWith("/topics/topic-a/discussion")) return new Response(JSON.stringify({ version: state.catalog.version, topic: { id: "topic-a", title: "Synthetic Topic", kind: "general" }, discussionId: "discussion-a", roots: state.roots }), { headers });
    assert.ok(url.endsWith("/sources/ingest"));
    assert.ok(!options.body.includes("bounded public article sample"));
    return new Response(JSON.stringify({ version: { generation: "generation-a", revision: 1 }, sourceId: "source-a", topicId: "topic-a", assignment: "provisional", policyVersion: "provisional-all-source-cosine/v1" }), { headers });
  };
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: api });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: fakeFetch });
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { const colors = []; return { scale() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      quadraticCurveTo() {}, closePath() {}, arc() {}, fill() { colors.push(this.fillStyle); },
      getImageData: () => ({ width: this.width, height: this.height, colors }) }; }
  } });
  const sender = { id: EXTENSION_ID, url: api.runtime.getURL("chromium/popup.html") };
  async function send(type, extra = {}, from = sender) {
    const work = new Promise((resolve) => {
      const results = events.message.emit({ target: "page-matching", type, ...extra }, from, resolve);
      assert.equal(results.length, 1);
    });
    pendingControls.push(work);
    return work;
  }
  async function advance() { t.mock.timers.tick(400); await flush(); }
  async function unpair() { const oldValue = state.token; state.token = undefined; events.storageChanged.emit({ [TOKEN_KEY]: { oldValue } }, "session"); await flush(); }
  t.after(async () => {
    state.local.enabled = false; state.capture.windowId = null; state.token = undefined;
    for (const gate of gates) gate.resolve(false);
    events.storageChanged.emit({ [KEY]: { newValue: state.local } }, "local");
    await flush(); await Promise.allSettled(pendingControls); await advance();
    Object.values(events).forEach((value) => value.clear());
    t.mock.timers.reset();
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await import(`../browser/chromium/background.js?adapter-test=${++moduleSequence}`);
  function connectPopup({ includeDocumentId = true } = {}) {
    const popupUrl = api.runtime.getURL("chromium/popup.html");
    state.popupContexts = [{ contextType: "POPUP", documentId: "popup-a", documentUrl: popupUrl, tabId: -1, windowId: -1, incognito: false }];
    const port = { name: "page-matching-popup-focus/1", sender: { id: EXTENSION_ID, url: popupUrl,
      ...(includeDocumentId ? { documentId: "popup-a" } : {}) },
      onMessage: event(), onDisconnect: event(),
      postMessage(message) {
        if (state.popupAnswer) state.popupAnswer(message, port);
        else port.onMessage.emit({ type: "focus-response", sequence: message.sequence, focused: true, windowId: 1 });
      }, disconnect() { port.onDisconnect.emit(); } };
    events.connect.emit(port);
    return port;
  }
  return { state, calls, events, api, send, advance, createGate, unpair, connectPopup };
}

test("adapter pause remains fail-closed across delayed storage and navigation", async (t) => {
  const h = await harness(t);
  h.state.writeGate = h.createGate();
  const pause = h.send("pause"); await flush();
  h.events.activated.emit({ tabId: 7, windowId: 1 }); await h.advance();
  const status = await h.send("status");
  assert.equal(status.enabled, false);
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.fetches.length, 0);
  h.state.writeGate.resolve(); h.state.writeGate = null;
  await pause; await h.advance();
  assert.equal(h.state.capture.windowId, null); assert.equal(h.state.local.enabled, true); assert.equal(h.calls.reads, 0);
});

test("adapter block masks capture while control and blocked-origin writes are pending", async (t) => {
  const h = await harness(t);
  assert.equal((await h.send("status")).enabled, true);
  h.state.writeGate = h.createGate();
  const removal = h.send("remove-site", { origin: ORIGIN }); await flush();
  h.events.updated.emit(7, { url: PAGE }, h.state.tab); await h.advance();
  assert.deepEqual((await h.send("status")).blockedOrigins, [ORIGIN]);
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.fetches.length, 0);
  h.state.writeGate.resolve(); h.state.writeGate = null;
  await removal; await h.advance();
  assert.equal(h.state.permitted, true); assert.deepEqual(h.state.blocked, [ORIGIN]);
  assert.equal(h.calls.reads, 0);
  assert.equal((await h.send("status")).enabled, true);
  h.state.tab.url = "https://example.org/other";
  h.events.updated.emit(7, { url: h.state.tab.url }, h.state.tab); await h.advance();
  assert.equal(h.calls.reads, 1);
});

test("adapter accepts commands only from the packaged popup without a tab sender", async (t) => {
  const h = await harness(t, { enabled: false });
  for (const sender of [
    { id: "b".repeat(32), url: h.api.runtime.getURL("chromium/popup.html") },
    { id: EXTENSION_ID, url: h.api.runtime.getURL("chromium/popup.html"), tab: { id: 7 } },
    { id: EXTENSION_ID, url: "https://example.com/" },
    { id: EXTENSION_ID, url: h.api.runtime.getURL("embedding/offscreen.html") },
  ]) assert.deepEqual(await h.send("resume", {}, sender), { error: "forbidden" });
  await h.advance();
  assert.equal(h.state.local.enabled, false); assert.equal(h.calls.storageWrites.length, 0);
  assert.equal(h.calls.reads, 0);
});

test("legacy enable-site and resume cannot create a capture lease", async (t) => {
  const h = await harness(t, { enabled: false });
  assert.deepEqual(await h.send("enable-site", { origin: ORIGIN }), { error: "unavailable" });
  assert.deepEqual(await h.send("resume"), { error: "unavailable" });
  await h.advance(); assert.equal(h.state.local.enabled, false); assert.equal(h.calls.reads, 0);
});

test("full blocked list overflow keeps status DTO valid and Stop usable while ending capture", async (t) => {
  const blocked = Array.from({ length: 100 }, (_, index) => `https://site${index}.example.com`);
  const h = await harness(t, { blocked });
  assert.equal(projectPageResolution(await h.send("status")).enabled, true);
  h.state.writeGate = h.createGate();
  const overflow = h.send("block-site", { origin: ORIGIN }); await flush();
  const pending = projectPageResolution(await h.send("status"));
  assert.equal(pending.enabled, false); assert.deepEqual(pending.blockedOrigins, blocked);
  h.events.activated.emit({ tabId: 7, windowId: 1 }); await h.advance(); assert.equal(h.calls.reads, 0);
  h.state.writeGate.resolve(); h.state.writeGate = null;
  assert.deepEqual(await overflow, { error: "unavailable" });
  const stopped = projectPageResolution(await h.send("stop-session"));
  assert.equal(stopped.enabled, false); assert.deepEqual(stopped.blockedOrigins, blocked);
  assert.equal(h.state.capture.windowId, null); assert.deepEqual(h.state.blocked, blocked);
});

test("wildcard plus legacy enabled preferences stays off until fresh Start", async (t) => {
  const h = await harness(t, { enabled: false }); h.state.local.enabled = true;
  const before = await h.send("status"); await h.advance();
  assert.equal(before.enabled, false); assert.equal(before.hostAccess, true); assert.equal(h.calls.reads, 0);
  const started = await h.send("start-session", { windowId: before.currentWindowId, expectedRevision: before.sessionRevision });
  assert.equal(started.enabled, true); assert.equal(started.sessionWindowId, 1); await h.advance();
  assert.equal(h.calls.reads, 1); assert.equal(h.state.local.enabled, true);
});
test("paired fresh session with existing Chrome grant starts and captures the focused public tab automatically", async (t) => {
  const h = await harness(t, { enabled: false, autoEligible: true });
  const state = projectPageResolution(await h.send("status"));
  assert.equal(state.enabled, true);
  assert.equal(state.sessionWindowId, 1);
  await h.advance();
  assert.equal(h.calls.reads, 1);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 1);
});
test("automatic capture waits for authenticated local health instead of sampling with a stale pairing", async (t) => {
  const h = await harness(t, { enabled: false, autoEligible: true });
  h.state.healthUnavailable = true;
  assert.equal((await h.send("status")).enabled, false);
  await h.advance();
  assert.equal(h.calls.reads, 0);
  h.state.healthUnavailable = false;
  assert.equal((await h.send("status")).enabled, true);
  await h.advance();
  assert.equal(h.calls.reads, 1);
});
test("automatic start waits for pairing and native grant; Stop survives popup polling and navigation", async (t) => {
  const h = await harness(t, { enabled: false, paired: false, autoEligible: true });
  await h.advance();
  assert.equal((await h.send("status")).enabled, false);
  assert.equal(h.calls.reads, 0);
  h.state.permitted = false;
  const token = `synthetic-test-token-${"x".repeat(40)}`;
  await h.api.storage.session.set({ [TOKEN_KEY]: token });
  h.events.storageChanged.emit({ [TOKEN_KEY]: { newValue: token } }, "session");
  await h.advance();
  assert.equal((await h.send("status")).enabled, false);
  assert.equal(h.calls.reads, 0);
  h.state.permitted = true;
  assert.equal((await h.send("status")).enabled, true);
  await h.advance();
  assert.equal(h.calls.reads, 1);
  await h.send("stop-session");
  h.events.updated.emit(7, { url: PAGE }, h.state.tab); await h.advance();
  assert.equal((await h.send("status")).enabled, false);
  assert.equal(h.state.capture.autoStart, false);
  assert.equal(h.calls.reads, 1);
});
test("automatic start never captures an incognito or blocked foreground page", async (t) => {
  const h = await harness(t, { enabled: false, autoEligible: true, blocked: [ORIGIN] });
  h.state.tab.incognito = true;
  await h.advance();
  assert.equal((await h.send("status")).enabled, false);
  assert.equal(h.calls.reads, 0);
  h.state.tab.incognito = false;
  await h.advance();
  assert.equal((await h.send("status")).enabled, true);
  assert.equal(h.calls.reads, 0);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 0);
});

test("same bound window automatically processes a new eligible HTTPS origin", async (t) => {
  const h = await harness(t); await h.advance();
  h.state.tab.url = "https://example.org/other";
  h.events.updated.emit(7, { url: h.state.tab.url }, h.state.tab); await h.advance();
  assert.equal(h.calls.reads, 2);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 2);
  assert.deepEqual(h.state.local.origins, [ORIGIN]);
});

test("new blank/loading tab, eligible navigation, switchback and non-last-tab closure retain one window lease", async (t) => {
  const h = await harness(t); await h.advance();
  const original = structuredClone(h.state.tab);
  const lease = structuredClone(h.state.capture);
  const writes = h.calls.storageWrites.length;
  const ingestions = () => h.calls.fetches.filter(call => call.url.endsWith("/sources/ingest"));
  assert.equal(ingestions().length, 1);
  h.state.tab = { ...original, id: 8, url: "about:blank" };
  h.events.activated.emit({ tabId: 8, windowId: 1 }); await h.advance();
  const blank = projectPageResolution(await h.send("status"));
  assert.equal(blank.enabled, true); assert.equal(blank.sessionWindowId, 1);
  assert.equal(blank.currentWindowId, null); assert.equal(blank.contextReason, "unsupported-url");
  assert.equal(h.calls.reads, 1); assert.equal(ingestions().length, 1);
  h.state.tab = { ...h.state.tab, status: "loading", url: "https://example.org/new-tab" };
  h.events.updated.emit(8, { status: "loading", url: h.state.tab.url }, h.state.tab); await h.advance();
  const loading = projectPageResolution(await h.send("status"));
  assert.equal(loading.enabled, true); assert.equal(loading.contextReason, "page-loading");
  assert.equal(h.calls.reads, 1); assert.equal(ingestions().length, 1);
  h.state.tab.status = "complete";
  h.events.updated.emit(8, { status: "complete" }, h.state.tab); await h.advance();
  const ready = projectPageResolution(await h.send("status"));
  assert.equal(ready.phase, "ready"); assert.equal(ready.currentTabId, 8);
  assert.equal(ready.sessionRevision, lease.revision); assert.equal(ingestions().length, 2);
  assert.equal(JSON.parse(ingestions().at(-1).body).url, "https://example.org/new-tab");
  const newTab = h.state.tab;
  h.state.tab = original; h.events.activated.emit({ tabId: original.id, windowId: 1 }); await h.advance();
  assert.equal((await h.send("status")).currentTabId, original.id);
  assert.equal(ingestions().length, 3);
  h.state.tab = newTab; h.events.activated.emit({ tabId: newTab.id, windowId: 1 }); await h.advance();
  assert.equal((await h.send("status")).currentTabId, newTab.id);
  h.state.tab = original; h.events.removed.emit(newTab.id, { windowId: 1, isWindowClosing: false }); await h.advance();
  const after = projectPageResolution(await h.send("status"));
  assert.equal(after.phase, "ready"); assert.equal(after.enabled, true);
  assert.equal(after.currentTabId, original.id); assert.equal(after.sessionRevision, lease.revision);
  assert.deepEqual(h.state.capture, lease); assert.equal(h.calls.storageWrites.length, writes);
  assert.deepEqual(h.calls.permissionRemovals, []);
});

test("opening an inactive tab never scans it; activation is covered by the existing window lease", async (t) => {
  const h = await harness(t); await h.advance();
  const lease = structuredClone(h.state.capture);
  const backgroundTab = { ...h.state.tab, id: 8, active: false, url: "https://example.org/background-tab" };
  h.events.updated.emit(8, { status: "complete", url: backgroundTab.url }, backgroundTab); await h.advance();
  assert.equal(h.calls.reads, 1);
  assert.equal((await h.send("status")).currentTabId, 7);
  h.state.tab = { ...backgroundTab, active: true };
  h.events.activated.emit({ tabId: 8, windowId: 1 }); await h.advance();
  assert.equal(h.calls.reads, 2); assert.equal((await h.send("status")).currentTabId, 8);
  assert.deepEqual(h.state.capture, lease);
});

test("switching to another same-URL tab cancels the previous tab's pending embedding without ending consent", async (t) => {
  const h = await harness(t); const lease = structuredClone(h.state.capture);
  h.state.embedGate = h.createGate(); await h.advance();
  assert.equal(h.calls.embeddings, 1);
  h.state.tab = { ...h.state.tab, id: 8 };
  h.events.activated.emit({ tabId: 8, windowId: 1 });
  h.state.embedGate.resolve({ embedding: embedding() }); h.state.embedGate = null; await flush();
  assert.equal(h.calls.fetches.filter(call => call.url.endsWith("/sources/ingest")).length, 0);
  await h.advance();
  assert.equal(h.calls.fetches.filter(call => call.url.endsWith("/sources/ingest")).length, 1);
  const status = projectPageResolution(await h.send("status"));
  assert.equal(status.currentTabId, 8); assert.equal(status.phase, "ready");
  assert.equal(status.sessionRevision, lease.revision); assert.deepEqual(h.state.capture, lease);
});

test("other focused window pauses matching without binding that window", async (t) => {
  const h = await harness(t); const bound = structuredClone(h.state.window);
  h.api.windows.get = async (id) => id === 1 ? bound : structuredClone(h.state.window);
  h.state.window.id = 2; h.events.focus.emit(2); await h.advance();
  const status = await h.send("status");
  assert.equal(status.enabled, true); assert.equal(status.sessionWindowId, 1); assert.equal(status.currentWindowId, 2);
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.fetches.length, 0);
  h.state.window.id = 1; h.events.focus.emit(1); await h.advance(); assert.equal(h.calls.reads, 1);
});

test("Stop retains pairing/native access; explicit remove-access removes only broad HTTPS", async (t) => {
  const h = await harness(t); const token = h.state.token;
  const stopped = await h.send("stop-session");
  assert.equal(stopped.enabled, false); assert.equal(stopped.hostAccess, true); assert.equal(h.state.token, token);
  assert.deepEqual(h.calls.permissionRemovals, []);
  const removed = await h.send("remove-access");
  assert.equal(removed.enabled, false); assert.equal(removed.hostAccess, false); assert.equal(h.state.token, token);
  assert.deepEqual(h.calls.permissionRemovals, [{ origins: ["https://*/*"] }]);
});

test("bound window removal and native permission revocation cancel late inference", async (t) => {
  const h = await harness(t); h.state.embedGate = h.createGate(); await h.advance();
  assert.equal(h.calls.embeddings, 1);
  h.events.windowRemoved.emit(1); await flush();
  h.state.embedGate.resolve({ embedding: embedding() }); h.state.embedGate = null; await flush();
  assert.equal((await h.send("status")).enabled, false);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 0);
  // A genuinely new window gets its own fresh Start; a closed ID never rebinds.
  h.state.window.id = 2;
  const before = await h.send("status"); await h.send("start-session", { windowId: 2, expectedRevision: before.sessionRevision });
  h.state.embedGate = h.createGate(); await h.advance();
  h.state.permitted = false; h.events.permissionRemoved.emit({ origins: ["https://*/*"] }); await flush();
  h.state.permitted = true; h.state.embedGate.resolve({ embedding: embedding() }); await flush();
  assert.equal((await h.send("status")).enabled, false);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 0);
});

for (const action of ["stop-session", "block-site"]) test(`late start cannot undo completed ${action}`, async (t) => {
  const h = await harness(t, { enabled: false });
  const before = await h.send("status");
  h.state.permissionGate = h.createGate(); const gate = h.state.permissionGate;
  const enabling = h.send("start-session", { windowId: 1, expectedRevision: before.sessionRevision }); await flush();
  await h.send(action, action === "block-site" ? { origin: ORIGIN } : {});
  gate.resolve(true);
  assert.deepEqual(await enabling, { error: "unavailable" });
  await h.advance();
  assert.equal(h.state.capture.windowId, null);
  if (action === "block-site") assert.deepEqual(h.state.blocked, [ORIGIN]);
  assert.equal(h.calls.reads, 0);
});

test("unpair during inference cancels native context and never ingests a late vector", async (t) => {
  const h = await harness(t);
  h.state.embedGate = h.createGate(); await h.advance();
  assert.equal(h.calls.reads, 1); assert.equal(h.calls.embeddings, 1);
  await h.unpair();
  h.state.embedGate.resolve({ embedding: embedding() }); await flush(); await h.advance();
  assert.ok(h.calls.closes >= 1);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 0);
  assert.equal((await h.send("status")).phase, "unpaired");
});

test("backend 401 clears session pairing and prevents further automatic captures/requests", async (t) => {
  const h = await harness(t); h.state.unauthorized = true;
  await h.advance(); assert.equal(h.state.token, undefined); assert.equal(h.calls.reads, 0);
  const count = h.calls.fetches.length;
  h.events.activated.emit({ tabId: 7, windowId: 1 }); await h.advance();
  assert.equal(h.calls.fetches.length, count); assert.equal((await h.send("status")).phase, "unpaired");
});

function sharedToolbarCatalog() {
  return { version: { generation: "generation-a", revision: 1 },
    model: { id: "hand-authored-demo-vectors/1", status: "fixture-only" }, actors: [],
    topics: [{ id: "topic-a", title: "Synthetic shared event", kind: "general", learned: true }],
    sources: [{ id: "source-a", url: PAGE, title: "A", provenance: "owner-local-page-embedding/v1", topicId: "topic-a" },
      { id: "source-b", url: "https://example.org/peer", title: "B", provenance: "owner-local-page-embedding/v1", topicId: "topic-a" }] };
}

test("ready same-Topic peer colors only the current tab with bounded catalog and discussion reads", async (t) => {
  const h = await harness(t); h.state.catalog = sharedToolbarCatalog(); await h.advance();
  assert.equal((await h.send("status")).phase, "ready");
  const last = h.calls.icons.at(-1);
  assert.equal(last.tabId, 7); assert.equal(last.imageData[16].colors[0], "#38bdf8");
  assert.equal(h.state.toolbarTabId, 7);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/catalog")).length, 2);
  assert.equal(h.calls.reads, 1); assert.equal(h.calls.embeddings, 1);
  const count = h.calls.fetches.length;
  await h.send("status"); await h.send("status"); assert.equal(h.calls.fetches.length, count);
});

test("trusted popup refresh updates posts and withdrawals without capture; status is read-free", async (t) => {
  const h = await harness(t); h.state.catalog = sharedToolbarCatalog(); await h.advance();
  const captures = h.calls.reads; const embeddings = h.calls.embeddings;
  h.state.roots = [{ id: "post-a", rootId: null, replyToId: null, state: "visible", authorId: "demo-alex", actorType: "human", body: "Synthetic published post", createdAt: "2026-09-29T00:00:00.000Z", edited: false, replies: [] }];
  assert.deepEqual(await h.send("toolbar-refresh"), { refreshed: true });
  assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#1d4ed8");
  h.state.roots = [{ id: "post-a", rootId: null, replyToId: null, state: "deleted", label: "Deleted", replies: [] }];
  await h.send("toolbar-refresh"); assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#38bdf8");
  const reads = h.calls.fetches.length; await h.send("status"); await h.send("status");
  assert.equal(h.calls.fetches.length, reads); assert.equal(h.calls.reads, captures); assert.equal(h.calls.embeddings, embeddings);
  assert.deepEqual(await h.send("toolbar-refresh", { posts: true }), { error: "unavailable" });
  assert.deepEqual(await h.send("toolbar-refresh", {}, { id: EXTENSION_ID, url: "https://example.com/" }), { error: "forbidden" });
});

test("paired but capture off verifies connection only on trusted refresh and fails red", async (t) => {
  const h = await harness(t, { enabled: false }); await h.advance();
  assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#dc2626");
  await h.send("toolbar-refresh"); assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#64748b");
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.embeddings, 0);
  h.state.unauthorized = true; await h.send("toolbar-refresh"); assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#dc2626");
});

test("activation repaints surviving per-tab gray override red after unpair, even when capture off", async (t) => {
  const h = await harness(t); h.state.catalog = sharedToolbarCatalog(); await h.advance();
  h.state.tab.id = 8; h.events.activated.emit({ tabId: 8, windowId: 1 }); await flush();
  assert.equal(h.calls.icons.filter((call) => call.tabId === 7).at(-1).imageData[16].colors[0], "#64748b");
  await h.send("stop-session"); await h.unpair();
  h.state.tab.id = 7; h.events.activated.emit({ tabId: 7, windowId: 1 }); await flush();
  assert.equal(h.calls.icons.filter((call) => call.tabId === 7).at(-1).imageData[16].colors[0], "#dc2626");
  assert.equal(h.state.toolbarTabId, 7);
});

test("off-session startup and normal-window focus repaint only the active tab without service reads", async (t) => {
  const h = await harness(t, { enabled: false }); await flush();
  assert.equal(h.state.toolbarTabId, 7);
  assert.equal(h.calls.icons.filter((call) => call.tabId === 7).at(-1).imageData[16].colors[0], "#dc2626");
  await h.send("toolbar-refresh"); const requests = h.calls.fetches.length;
  h.state.window.id = 2; h.state.tab.id = 8; h.state.tab.url = "chrome://newtab/";
  h.events.focus.emit(2); await flush();
  assert.equal(h.state.toolbarTabId, 8);
  assert.equal(h.calls.icons.filter((call) => call.tabId === 8).at(-1).imageData[16].colors[0], "#64748b");
  assert.equal(h.calls.fetches.length, requests); assert.equal(h.calls.reads, 0); assert.equal(h.calls.embeddings, 0);
});

test("off-session focus query failure clears presentation authority without capture or service reads", async (t) => {
  const h = await harness(t, { enabled: false }); await flush();
  h.state.tabQueryError = true; h.events.focus.emit(1); await flush();
  assert.equal(h.state.toolbarTabId, undefined); assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#dc2626");
  assert.equal(h.calls.fetches.length, 0); assert.equal(h.calls.reads, 0);
});

test("delayed old off-session focus observation cannot repaint after newer activation", async (t) => {
  const h = await harness(t, { enabled: false }); await flush();
  const gate = h.createGate(); h.state.window.id = 2; h.state.tab.id = 8;
  h.state.tabQueryHook = () => gate.promise; h.events.focus.emit(2); await flush();
  h.state.tab.id = 9; h.events.activated.emit({ tabId: 9, windowId: 2 }); await flush();
  h.state.tabQueryHook = null; gate.resolve([{ id: 8, active: true, incognito: false }]); await flush();
  assert.equal(h.state.toolbarTabId, 9);
  assert.ok(!h.calls.icons.some((call) => call.tabId === 8));
  assert.equal(h.calls.fetches.length, 0); assert.equal(h.calls.reads, 0);
});

for (const change of ["stop", "block", "permission", "navigation", "same-url-reload", "unpair", "other-window", "bound-window-close", "tab-removal"]) {
  test(`actual background scheduling clears blue on ${change}`, async (t) => {
    const h = await harness(t); h.state.catalog = sharedToolbarCatalog(); await h.advance();
    assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#38bdf8");
    if (change === "stop") await h.send("stop-session");
    if (change === "block") await h.send("block-site", { origin: ORIGIN });
    if (change === "permission") { h.state.permitted = false; h.events.permissionRemoved.emit({ origins: ["https://*/*"] }); }
    if (change === "navigation") { h.state.tab.url = "https://example.org/unrelated"; h.events.updated.emit(7, { url: h.state.tab.url }, h.state.tab); }
    if (change === "same-url-reload") h.events.updated.emit(7, { status: "loading" }, h.state.tab);
    if (change === "unpair") await h.unpair();
    if (change === "other-window") { h.state.window.id = 2; h.events.focus.emit(2); }
    if (change === "bound-window-close") h.events.windowRemoved.emit(1);
    if (change === "tab-removal") h.events.removed.emit(7);
    await flush();
    assert.equal(h.state.toolbarTabId, change === "tab-removal" ? undefined : 7);
    if (change !== "tab-removal") assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], change === "unpair" ? "#dc2626" : "#64748b");
  });
}

test("ready pages with only demo or unassigned peers remain green", async (t) => {
  const h = await harness(t); h.state.catalog = sharedToolbarCatalog();
  h.state.catalog.sources[1].provenance = "project-created-hand-authored-demo/1";
  await h.advance(); assert.equal(h.state.toolbarTabId, 7);
  assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#16a34a");
  h.state.catalog.sources[1].provenance = "owner-local-page-embedding/v1";
  h.state.catalog.sources[1].topicId = null;
  await h.send("retry"); await h.advance(); assert.equal(h.state.toolbarTabId, 7);
  assert.equal(h.calls.icons.at(-1).imageData[16].colors[0], "#16a34a");
});

test("foreground adapter excludes unfocused/incognito pages and retains only preference settings", async (t) => {
  const h = await harness(t);
  h.state.window.focused = false; await h.advance(); assert.equal(h.calls.reads, 0);
  assert.equal(h.calls.tabQueries, 0);
  h.state.window.focused = true; h.state.tab.incognito = true;
  h.events.focus.emit(1); await h.advance(); assert.equal(h.calls.reads, 0);
  assert.deepEqual(Object.keys(h.state.local).sort(), ["enabled", "origins"]);
  assert.equal(h.calls.fetches.length, 0);
});

test("foreground status reports only bounded eligibility reasons without relaxing capture checks", async (t) => {
  const h = await harness(t, { enabled: false });
  const status = async () => h.send("status");
  assert.equal((await status()).contextReason, null);
  h.state.window.focused = false; assert.equal((await status()).contextReason, "window-unfocused");
  h.state.window.focused = true; h.state.window.type = "popup";
  assert.equal((await status()).contextReason, "unsupported-window");
  h.state.window.type = "normal"; h.state.tab = null;
  assert.equal((await status()).contextReason, "tab-unavailable");
  h.state.tab = { id: 7, active: true, incognito: false, status: "loading", url: PAGE };
  assert.equal((await status()).contextReason, "page-loading");
  h.state.tab.status = "complete"; h.state.tab.url = undefined;
  assert.equal((await status()).contextReason, "url-unavailable");
  h.state.tab.url = "chrome://extensions/";
  assert.equal((await status()).contextReason, "unsupported-url");
  h.state.tab.incognito = true; assert.equal((await status()).contextReason, "incognito");
  h.state.tab.incognito = false; h.state.tab.url = PAGE;
  h.state.windowError = true;
  const windowFailure = await status();
  assert.equal(windowFailure.contextReason, "window-query-failed");
  assert.equal(windowFailure.currentOrigin, null);
  assert.ok(!JSON.stringify(windowFailure).includes("private"));
  h.state.windowError = false; h.state.tabQueryError = true;
  assert.equal((await status()).contextReason, "tab-query-failed");
  assert.equal(h.calls.reads, 0);
  assert.equal(h.calls.fetches.length, 0);
});

test("fresh popup witness permits the containing active page while its window flag is false", async (t) => {
  const h = await harness(t);
  h.state.window.focused = false; h.connectPopup({ includeDocumentId: false }); await flush();
  assert.equal((await h.send("status")).currentOrigin, ORIGIN);
  await h.advance();
  assert.equal(h.calls.reads, 1);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 1);
});

test("popup fallback rejects navigation during the active-tab recheck", async (t) => {
  const h = await harness(t, { enabled: false });
  h.state.window.focused = false;
  h.connectPopup(); await flush();
  const query = h.api.tabs.query;
  let count = 0;
  h.api.tabs.query = async (options) => {
    if (++count === 2) h.state.tab.url = "https://example.org/other";
    return query(options);
  };
  const status = await h.send("status");
  assert.equal(status.currentOrigin, null); assert.equal(status.contextReason, "tab-changed");
  assert.equal(h.calls.reads, 0);
});

test("ordinary focused browser path never challenges a popup", async (t) => {
  const h = await harness(t, { enabled: false });
  h.state.popupAnswer = () => assert.fail("Focused browser needs no popup witness");
  h.connectPopup(); await flush();
  assert.equal((await h.send("status")).currentOrigin, ORIGIN);
  // Startup presentation observes the focused tab once, independently of capture.
  assert.equal(h.calls.windowQueries, 2); assert.equal(h.calls.tabQueries, 2);
});

test("popup blur between witness and active-tab recheck rejects foreground", async (t) => {
  const h = await harness(t, { enabled: false });
  h.state.window.focused = false;
  const port = h.connectPopup(); await flush();
  const query = h.api.tabs.query;
  let count = 0;
  h.api.tabs.query = async (options) => {
    const result = await query(options);
    if (++count === 2) port.onMessage.emit({ type: "focus-change" });
    return result;
  };
  const status = await h.send("status");
  assert.equal(status.currentOrigin, null); assert.equal(status.contextReason, "focus-changed");
  assert.equal(h.calls.reads, 0);
});

test("popup closure cancels a late vector, then restored browser focus resumes background capture", async (t) => {
  const h = await harness(t);
  h.state.window.focused = false;
  const port = h.connectPopup(); await flush();
  h.state.embedGate = h.createGate(); await h.advance();
  assert.equal(h.calls.embeddings, 1);
  port.disconnect(); h.state.popupContexts = [];
  h.state.embedGate.resolve({ embedding: embedding() }); h.state.embedGate = null;
  await flush(); await h.advance();
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 0);
  h.state.window.focused = true; h.events.focus.emit(1); await h.advance();
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 1);
});

function assertRejected(status, reason, calls) {
  assert.equal(status.contextReason, reason);
  assert.equal(status.currentOrigin, null);
  assert.equal(status.currentUrl, null);
  assert.equal(status.currentTabId, null);
  assert.equal(calls.reads, 0);
  assert.equal(calls.embeddings, 0);
  assert.equal(calls.fetches.length, 0);
  assert.ok(!JSON.stringify(status).includes("private"));
}

test("fresh popup foreground recovers a missed observation without resetting the timer on polling", async (t) => {
  const h = await harness(t);
  h.state.window.focused = false;
  h.connectPopup({ includeDocumentId: false }); await flush();
  h.state.tabQueryError = true; await h.advance();
  h.state.tabQueryError = false;
  const recovering = await h.send("status");
  assert.equal(recovering.currentOrigin, ORIGIN);
  assert.equal(recovering.contextReason, null);
  assert.equal(recovering.phase, "checking");
  assert.equal(h.calls.reads, 0);
  t.mock.timers.tick(200); await flush();
  assert.equal((await h.send("status")).sequence, recovering.sequence);
  t.mock.timers.tick(200); await flush();
  const ready = await h.send("status");
  assert.equal(ready.phase, "ready");
  assert.equal(h.calls.reads, 1);
  assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 1);
  assert.equal((await h.send("status")).sequence, ready.sequence);
});

for (const condition of ["disabled", "site-not-enabled", "no-current-context"]) {
  test(`status does not recover a missed observation while ${condition}`, async (t) => {
    const h = await harness(t);
    h.state.tabQueryError = true; await h.advance();
    if (condition !== "no-current-context") h.state.tabQueryError = false;
    if (condition === "disabled") await h.send("stop-session");
    if (condition === "site-not-enabled") await h.send("block-site", { origin: ORIGIN });
    if (condition === "site-not-enabled") await h.advance();
    const before = await h.send("status");
    if (condition === "no-current-context") {
      assert.equal(before.phase, "unsupported");
      assert.equal(before.reason, "no-focused-page");
    }
    await h.advance();
    assert.equal((await h.send("status")).sequence, before.sequence);
    assert.equal(h.calls.reads, 0);
    assert.equal(h.calls.fetches.length, 0);
  });
}

for (const reason of ["missing-region", "rights-restricted", "capture-budget", "document-mismatch", "invalid-content"]) {
  test(`status never retries a reader rejection: ${reason}`, async (t) => {
    const h = await harness(t);
    let reads = 0;
    h.api.scripting.executeScript = async () => {
      reads++;
      return [{ frameId: 0, documentId: "document-a", result: { contractVersion: "page-content/1", status: "unsupported", reason } }];
    };
    await h.advance();
    const before = await h.send("status");
    assert.equal(before.phase, "unsupported");
    assert.equal(before.reason, reason);
    assert.equal(before.currentOrigin, ORIGIN);
    await h.advance();
    assert.equal((await h.send("status")).sequence, before.sequence);
    assert.equal(reads, 1);
    assert.equal(h.calls.embeddings, 0);
    assert.equal(h.calls.fetches.filter((call) => call.url.endsWith("/sources/ingest")).length, 0);
  });
}

for (const change of ["pause", "permission", "remove-site", "navigation", "unpair"]) {
  test(`scheduled foreground recovery remains fenced across ${change}`, async (t) => {
    const h = await harness(t);
    h.state.tabQueryError = true; await h.advance();
    h.state.tabQueryError = false;
    assert.equal((await h.send("status")).phase, "checking");
    if (change === "pause") await h.send("pause");
    if (change === "permission") h.state.permitted = false;
    if (change === "remove-site") await h.send("remove-site", { origin: ORIGIN });
    if (change === "navigation") {
      h.state.tab.url = "chrome://extensions/";
      h.events.updated.emit(7, { url: h.state.tab.url }, h.state.tab);
    }
    if (change === "unpair") await h.unpair();
    await h.advance();
    await h.send("status");
    assert.equal(h.calls.reads, 0);
    assert.equal(h.calls.embeddings, 0);
    assert.equal(h.calls.fetches.length, 0);
  });
}

for (const [reason, setup] of [
  ["window-unavailable", (h) => { h.state.window = null; }],
  ["window-query-failed", (h) => { h.state.windowError = true; }],
  ["tab-query-failed", (h) => { h.state.tabQueryError = true; }],
  ["context-unavailable", (h) => { h.state.tabQueryHook = () => null; }],
]) test(`foreground failure ${reason} leaves no current context or capture`, async (t) => {
  const h = await harness(t);
  setup(h);
  await h.advance();
  assertRejected(await h.send("status"), reason, h.calls);
});

for (const [reason, patch] of [
  ["incognito", { incognito: true }],
  ["page-loading", { status: "loading" }],
  ["page-loading", { pendingUrl: `${ORIGIN}/next` }],
  ["url-unavailable", { url: undefined }],
  ["unsupported-url", { url: "chrome://extensions/" }],
]) test(`popup fallback classifies initial ${reason} before revalidation ${JSON.stringify(patch)}`, async (t) => {
  const h = await harness(t);
  h.state.window.focused = false; Object.assign(h.state.tab, patch);
  h.connectPopup(); await flush();
  h.state.windowQueryHook = (count) => {
    assert.equal(count, 1, "Ineligible initial tab must not requery the window");
    return structuredClone(h.state.window);
  };
  assertRejected(await h.send("status"), reason, h.calls);
  assert.equal(h.calls.tabQueries, 1);
  h.state.windowQueryHook = null;
  await h.advance(); assert.equal(h.calls.reads, 0);
});

for (const [reason, result] of [
  ["window-unavailable", null],
  ["window-changed", { id: 2, focused: false, type: "normal" }],
  ["unsupported-window", { id: 1, focused: false, type: "popup" }],
  ["incognito", { id: 1, focused: false, type: "normal", incognito: true }],
  ["window-query-failed", "reject"],
]) test(`popup window recheck reports ${reason} without querying a tab afterward`, async (t) => {
  const h = await harness(t);
  h.state.window.focused = false; h.connectPopup(); await flush();
  h.state.windowQueryHook = (count) => {
    if (count % 2) return structuredClone(h.state.window);
    if (result === "reject") throw new Error("private recheck window detail");
    return result;
  };
  await h.advance();
  assert.equal(h.calls.tabQueries, 1);
  assertRejected(await h.send("status"), reason, h.calls);
  assert.equal(h.calls.tabQueries, 2, "Only one initial tab query per inspection");
});

for (const [reason, patch] of [
  ["tab-unavailable", null],
  ["tab-unavailable", "multiple"],
  ["tab-unavailable", { id: undefined }],
  ["tab-changed", { id: 8 }],
  ["tab-changed", { url: "https://example.org/other" }],
  ["incognito", { incognito: true, url: "https://example.org/other" }],
  ["page-loading", { status: "loading", url: "https://example.org/other" }],
  ["page-loading", { pendingUrl: `${ORIGIN}/next` }],
  ["url-unavailable", { url: undefined }],
  ["unsupported-url", { url: "chrome://extensions/" }],
  ["tab-query-failed", "reject"],
]) test(`popup active-tab recheck reports ${reason} ${JSON.stringify(patch)}`, async (t) => {
  const h = await harness(t);
  h.state.window.focused = false; h.connectPopup(); await flush();
  h.state.tabQueryHook = (count) => {
    if (count % 2) return [structuredClone(h.state.tab)];
    if (patch === "reject") throw new Error("private recheck tab detail");
    if (patch === "multiple") return [structuredClone(h.state.tab), { ...structuredClone(h.state.tab), id: 8 }];
    return patch ? [{ ...structuredClone(h.state.tab), ...patch }] : [];
  };
  await h.advance();
  assertRejected(await h.send("status"), reason, h.calls);
});

for (const change of ["expiry", "blur", "closure", "replacement"]) {
  test(`popup witness ${change} after queries fails with precise focus reason`, async (t) => {
    const h = await harness(t);
    h.state.window.focused = false; let port = h.connectPopup(); await flush();
    h.state.tabQueryHook = (count) => {
      if (count % 2 === 0) {
        if (change === "expiry") h.state.now += 500;
        else if (change === "blur") port.onMessage.emit({ type: "focus-change" });
        else if (change === "closure") port.disconnect();
        else port = h.connectPopup();
      }
      return [structuredClone(h.state.tab)];
    };
    assertRejected(await h.send("status"), change === "expiry" ? "focus-expired" : "focus-changed", h.calls);
    // Expiry/blur retain the port and can prove the capture path rejects again.
    if (change === "expiry" || change === "blur") {
      await h.advance(); assert.equal(h.calls.reads, 0); assert.equal(h.calls.fetches.length, 0);
    }
  });
}
