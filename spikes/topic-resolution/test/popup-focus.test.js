import assert from "node:assert/strict";
import test from "node:test";
import { createPopupFocusWitness, connectPopupFocusResponder } from "../browser/chromium/popup-focus.js";

const ID = "a".repeat(32), URL = `chrome-extension://${ID}/chromium/popup.html`;
const flush = async () => { await new Promise((done) => setImmediate(done)); await new Promise((done) => setImmediate(done)); };
function event() {
  const listeners = new Set();
  return { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => [...listeners].forEach((listener) => listener(...args)) };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function worker(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const state = { changes: 0, now: 0, contexts: [{ contextType: "POPUP", documentId: "popup-a", documentUrl: URL, tabId: -1, windowId: -1, incognito: false }], gate: null };
  const runtime = { id: ID, getURL: () => URL, onConnect: event(), getContexts: async (filter) => {
    assert.deepEqual(filter.contextTypes, ["POPUP"]); assert.deepEqual(filter.documentUrls, [URL]);
    if (filter.documentIds) assert.deepEqual(filter.documentIds, ["popup-a"]);
    if (state.gate) await state.gate.promise;
    return structuredClone(state.contexts);
  } };
  const witness = createPopupFocusWitness({ runtime, onChange: () => state.changes++, now: () => state.now });
  function port(sender = { id: ID, url: URL, documentId: "popup-a" }) {
    const value = { name: "page-matching-popup-focus/1", sender, onMessage: event(), onDisconnect: event(), messages: [], disconnected: false,
      postMessage: (message) => value.messages.push(message), disconnect: () => { value.disconnected = true; value.onDisconnect.emit(); } };
    runtime.onConnect.emit(value); return value;
  }
  t.after(() => { witness.dispose(); state.gate?.resolve(); t.mock.timers.reset(); });
  return { state, witness, port };
}
function reply(port, extra = {}) {
  const challenge = port.messages.at(-1);
  port.onMessage.emit({ type: "focus-response", sequence: challenge.sequence, focused: true, windowId: 1, ...extra });
}

test("popup witness challenges afresh and expires immediately on focus change", async (t) => {
  const h = worker(t), port = h.port(); await flush();
  const first = h.witness.check(1); await flush(); reply(port);
  const result = await first; assert.equal(result.isCurrent(), true);
  const second = h.witness.check(1); await flush();
  assert.equal(port.messages.length, 2);
  assert.notEqual(port.messages[0].sequence, port.messages[1].sequence);
  reply(port); assert.ok(await second);
  port.onMessage.emit({ type: "focus-change" }); assert.equal(result.isCurrent(), false);
});

for (const extra of [{ focused: false, windowId: null }, { windowId: 2 }, { extra: true }, { focused: "true" }]) {
  test(`popup witness rejects invalid focus response ${JSON.stringify(extra)}`, async (t) => {
    const h = worker(t), port = h.port(); await flush();
    const result = h.witness.check(1); await flush(); reply(port, extra); assert.equal(await result, null);
  });
}

test("blur, closure and replacement cancel pending witnesses and reject late replies", async (t) => {
  const h = worker(t); let port = h.port(); await flush();
  for (const action of [() => port.onMessage.emit({ type: "focus-change" }), () => port.disconnect(), () => h.port()]) {
    const result = h.witness.check(1); await flush();
    action(); assert.equal(await result, null); reply(port);
    port = h.port(); await flush();
  }
});

test("timeout includes stalled context validation and does not queue later witnesses", async (t) => {
  const h = worker(t), port = h.port(); await flush();
  h.state.gate = deferred();
  const result = h.witness.check(1);
  assert.equal(h.witness.check(1), result);
  assert.equal(await h.witness.check(2), null);
  t.mock.timers.tick(500); assert.equal(await result, null);
  h.state.gate.resolve(); h.state.gate = null; await flush();
  assert.equal(port.messages.length, 0);
  const next = h.witness.check(1); await flush(); reply(port); assert.ok(await next);
});

test("late response nonce cannot satisfy a newer challenge", async (t) => {
  const h = worker(t), port = h.port(); await flush();
  const first = h.witness.check(1); await flush(); const old = port.messages.at(-1);
  t.mock.timers.tick(500); assert.equal(await first, null);
  const next = h.witness.check(1); await flush();
  port.onMessage.emit({ type: "focus-response", sequence: old.sequence, focused: true, windowId: 1 });
  reply(port); assert.ok(await next);
});

for (const sender of [{ id: "other", url: URL, documentId: "popup-a" }, { id: ID, url: URL, documentId: "popup-a", tab: { id: 1 } },
  { id: ID, url: URL, tab: { id: 1 } }, { id: ID, url: URL, documentId: null },
  { id: ID, url: URL, documentId: "" }, { id: ID, url: URL, documentId: 7 },
  { id: ID, url: `chrome-extension://${ID}/embedding/offscreen.html`, documentId: "popup-a" }]) {
  test(`popup port rejects untrusted sender ${JSON.stringify(sender)}`, async (t) => {
    const h = worker(t), port = h.port(sender); assert.equal(port.disconnected, true); assert.equal(await h.witness.check(1), null);
  });
}

test("Chrome action popup without sender documentId supplies a fresh authenticated witness", async (t) => {
  const h = worker(t), port = h.port({ id: ID, url: URL }); await flush();
  const pending = h.witness.check(1); await flush(); reply(port); assert.ok(await pending);
});

test("missing sender documentId still requires eligible popup lifecycle corroboration", async (t) => {
  const h = worker(t); h.state.contexts = [];
  const port = h.port({ id: ID, url: URL }); await flush();
  assert.equal(port.disconnected, true); assert.equal(await h.witness.check(1), null);
});

test("retained hidden popup contexts cannot supply focus for a blurred or closed live port", async (t) => {
  const h = worker(t);
  h.state.contexts.push({ ...h.state.contexts[0], documentId: "closed-popup" });
  const port = h.port({ id: ID, url: URL }); await flush();
  const blurred = h.witness.check(1); await flush(); reply(port, { focused: false, windowId: null });
  assert.equal(await blurred, null);
  const closed = h.witness.check(1); await flush(); port.disconnect(); reply(port);
  assert.equal(await closed, null); assert.equal(await h.witness.check(1), null);
});

for (const patch of [null, { contextType: "OFFSCREEN_DOCUMENT" }, { tabId: 7 }, { incognito: true }, { documentId: "old-popup" }]) {
  test(`popup witness rejects absent or incompatible live context ${JSON.stringify(patch)}`, async (t) => {
    const h = worker(t);
    h.state.contexts = patch ? [{ ...h.state.contexts[0], ...patch }] : [];
    const port = h.port(); await flush(); assert.equal(port.disconnected, true); assert.equal(await h.witness.check(1), null);
  });
}

test("context must remain live after the response", async (t) => {
  const h = worker(t), port = h.port(); await flush();
  const result = h.witness.check(1); await flush(); h.state.contexts = []; reply(port);
  assert.equal(await result, null);
});

test("successful witness cannot authorize a delayed downstream tab query", async (t) => {
  const h = worker(t), port = h.port(); await flush();
  const pending = h.witness.check(1); await flush(); reply(port);
  const result = await pending; assert.equal(result.isCurrent(), true);
  h.state.now = 500; assert.equal(result.isCurrent(), false);
});

test("delayed context validation cannot restore a blurred or replaced popup", async (t) => {
  const h = worker(t), port = h.port(); await flush();
  h.state.gate = deferred();
  const result = h.witness.check(1); await flush();
  port.onMessage.emit({ type: "focus-change" });
  assert.equal(await result, null);
  h.port(); h.state.gate.resolve(); h.state.gate = null; await flush();
  assert.equal(port.messages.length, 0);
});

function responder(t) {
  const events = new Map(), state = { focused: true, visibility: "visible", window: { id: 1, type: "normal", incognito: false }, gate: null };
  const target = (name) => ({ addEventListener(type, listener) { events.set(`${name}:${type}`, listener); },
    removeEventListener(type) { events.delete(`${name}:${type}`); } });
  const document = { ...target("document"), hasFocus: () => state.focused, get visibilityState() { return state.visibility; } };
  const window = target("window");
  const port = { onMessage: event(), onDisconnect: event(), messages: [],
    postMessage(message) { this.messages.push(message); }, disconnect() { this.onDisconnect.emit(); } };
  const runtime = { connect: (options) => { assert.deepEqual(options, { name: "page-matching-popup-focus/1" }); return port; } };
  const windows = { getCurrent: async (options) => { assert.deepEqual(options, { populate: false }); if (state.gate) await state.gate.promise; return state.window; } };
  const controller = connectPopupFocusResponder({ runtime, windows, document, window });
  t.after(() => { controller.dispose(); state.gate?.resolve(); });
  return { state, port, events, controller };
}

test("popup responder reports only fresh focus and containing window ID", async (t) => {
  const h = responder(t); h.port.onMessage.emit({ type: "focus-challenge", sequence: 1 }); await flush();
  assert.deepEqual(h.port.messages, [{ type: "focus-response", sequence: 1, focused: true, windowId: 1 }]);
  h.state.focused = false; h.port.onMessage.emit({ type: "focus-challenge", sequence: 2 }); await flush();
  assert.deepEqual(h.port.messages.at(-1), { type: "focus-response", sequence: 2, focused: false, windowId: null });
});

test("popup blur during window query invalidates even if focus returns before reply", async (t) => {
  const h = responder(t); h.state.gate = deferred();
  h.port.onMessage.emit({ type: "focus-challenge", sequence: 1 }); await flush();
  h.events.get("window:blur")(); h.state.gate.resolve(); await flush();
  assert.deepEqual(h.port.messages.at(-1), { type: "focus-response", sequence: 1, focused: false, windowId: null });
});

test("hidden, incognito and nonnormal containing windows cannot attest focus", async (t) => {
  const h = responder(t);
  for (const setup of [() => { h.state.visibility = "hidden"; }, () => { h.state.visibility = "visible"; h.state.window.incognito = true; },
    () => { h.state.window.incognito = false; h.state.window.type = "popup"; }]) {
    setup(); h.port.onMessage.emit({ type: "focus-challenge", sequence: 1 }); await flush(); assert.equal(h.port.messages.at(-1).focused, false);
  }
});

test("disconnected popup cancels delayed reply and removes event listeners", async (t) => {
  const h = responder(t); h.state.gate = deferred();
  h.port.onMessage.emit({ type: "focus-challenge", sequence: 1 }); await flush();
  h.port.disconnect(); h.state.gate.resolve(); await flush();
  assert.equal(h.port.messages.length, 0); assert.equal(h.events.size, 0);
});

test("pagehide immediately disposes the popup responder", async (t) => {
  const h = responder(t); h.events.get("window:pagehide")();
  assert.equal(h.events.size, 0);
  h.port.onMessage.emit({ type: "focus-challenge", sequence: 1 }); await flush();
  assert.deepEqual(h.port.messages, [{ type: "focus-change" }]);
});
