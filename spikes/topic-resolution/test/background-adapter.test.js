import assert from "node:assert/strict";
import test from "node:test";

const KEY = "pageMatchingPreferences";
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

async function harness(t, { enabled = true, paired = true } = {}) {
  const descriptors = new Map(["chrome", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events = Object.fromEntries(["message", "connect", "activated", "updated", "removed", "replaced", "focus", "permissionRemoved", "storageChanged"].map((name) => [name, event()]));
  const gates = [];
  const pendingControls = [];
  const calls = { reads: 0, windowQueries: 0, tabQueries: 0, attestations: 0, embeddings: 0, closes: 0, fetches: [], storageWrites: [], permissionRemovals: [] };
  const state = {
    local: { enabled, origins: [ORIGIN] }, token: paired ? `synthetic-test-token-${"x".repeat(40)}` : undefined,
    tab: { id: 7, active: true, incognito: false, status: "complete", url: PAGE },
    window: { id: 1, focused: true, type: "normal" }, permitted: true, exists: false,
    writeGate: null, permissionGate: null, embedGate: null, unauthorized: false,
    windowError: false, tabQueryError: false,
    popupContexts: [], popupAnswer: null,
    now: 0, windowQueryHook: null, tabQueryHook: null,
  };
  t.mock.method(globalThis.performance, "now", () => state.now);
  const createGate = () => { const gate = deferred(); gates.push(gate); return gate; };
  const api = {
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
        get: async (key) => { assert.equal(key, KEY); return { [KEY]: structuredClone(state.local) }; },
        async set(value) {
          calls.storageWrites.push(structuredClone(value));
          if (state.writeGate) await state.writeGate.promise;
          const oldValue = state.local; state.local = structuredClone(value[KEY]);
          events.storageChanged.emit({ [KEY]: { oldValue, newValue: state.local } }, "local");
        } },
      session: { setAccessLevel: async (value) => assert.equal(value.accessLevel, "TRUSTED_CONTEXTS"),
        get: async (key) => { assert.equal(key, TOKEN_KEY); return state.token ? { [TOKEN_KEY]: state.token } : {}; },
        set: async (value) => { state.token = value[TOKEN_KEY]; },
        remove: async (key) => { assert.equal(key, TOKEN_KEY); const oldValue = state.token; state.token = undefined; events.storageChanged.emit({ [TOKEN_KEY]: { oldValue } }, "session"); } },
      onChanged: events.storageChanged,
    },
    windows: { getLastFocused: async (options) => { assert.deepEqual(options, { populate: false });
      calls.windowQueries++;
      if (state.windowQueryHook) return state.windowQueryHook(calls.windowQueries);
      if (state.windowError) throw new Error("private window detail"); return structuredClone(state.window); }, onFocusChanged: events.focus },
    tabs: { query: async (options) => { assert.deepEqual(options, { active: true, windowId: 1 });
      calls.tabQueries++;
      if (state.tabQueryHook) return state.tabQueryHook(calls.tabQueries);
      if (state.tabQueryError) throw new Error("private tab detail"); return state.tab ? [structuredClone(state.tab)] : []; },
      onActivated: events.activated, onUpdated: events.updated, onRemoved: events.removed, onReplaced: events.replaced },
    permissions: {
      async contains(value) { assert.ok(value.origins.length === 1); const gate = state.permissionGate; state.permissionGate = null; return gate ? gate.promise : state.permitted; },
      async remove(value) { calls.permissionRemovals.push(value); state.permitted = false; events.permissionRemoved.emit(value); return true; },
      onRemoved: events.permissionRemoved,
    },
    scripting: { async executeScript({ args, target, world }) {
      assert.equal(world, "ISOLATED"); assert.equal(target.tabId, 7);
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
    if (url.endsWith("/catalog")) return new Response(JSON.stringify({ version: { generation: "generation-a", revision: 0 }, model: { id: "hand-authored-demo-vectors/1", status: "fixture-only" }, actors: [], topics: [], sources: [] }), { headers });
    assert.ok(url.endsWith("/sources/ingest"));
    assert.ok(!options.body.includes("bounded public article sample"));
    return new Response(JSON.stringify({ version: { generation: "generation-a", revision: 1 }, sourceId: "source-a", topicId: "topic-a", assignment: "provisional", policyVersion: "provisional-all-source-cosine/v1" }), { headers });
  };
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: api });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: fakeFetch });
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
    state.local.enabled = false; state.token = undefined;
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
  assert.equal(h.state.local.enabled, false); assert.equal(h.calls.reads, 0);
});

test("adapter remove-site masks consent while preference writes and permission removal are pending", async (t) => {
  const h = await harness(t);
  h.state.writeGate = h.createGate();
  const removal = h.send("remove-site", { origin: ORIGIN }); await flush();
  h.events.updated.emit(7, { url: PAGE }, h.state.tab); await h.advance();
  assert.deepEqual((await h.send("status")).origins, []);
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.fetches.length, 0);
  h.state.writeGate.resolve(); h.state.writeGate = null;
  await removal; await h.advance();
  assert.equal(h.state.permitted, false); assert.deepEqual(h.state.local.origins, []);
  assert.equal(h.calls.reads, 0);
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

test("enable-site reattests expected origin after a delayed permission check", async (t) => {
  const h = await harness(t, { enabled: false });
  h.state.permissionGate = h.createGate(); const gate = h.state.permissionGate;
  const enabling = h.send("enable-site", { origin: ORIGIN }); await flush();
  h.state.tab.url = "https://example.org/other";
  h.events.updated.emit(7, { url: h.state.tab.url }, h.state.tab);
  gate.resolve(true);
  assert.deepEqual(await enabling, { error: "unavailable" });
  await h.advance(); assert.equal(h.state.local.enabled, false); assert.equal(h.calls.reads, 0);
});

for (const action of ["pause", "remove-site"]) test(`late enable-site cannot undo completed ${action}`, async (t) => {
  const h = await harness(t, { enabled: false });
  h.state.permissionGate = h.createGate(); const gate = h.state.permissionGate;
  const enabling = h.send("enable-site", { origin: ORIGIN }); await flush();
  await h.send(action, action === "remove-site" ? { origin: ORIGIN } : {});
  gate.resolve(true);
  assert.deepEqual(await enabling, { error: "unavailable" });
  await h.advance();
  if (action === "pause") assert.equal(h.state.local.enabled, false);
  else assert.deepEqual(h.state.local.origins, []);
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
  assert.equal(h.calls.windowQueries, 1); assert.equal(h.calls.tabQueries, 1);
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
