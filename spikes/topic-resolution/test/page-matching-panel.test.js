import assert from "node:assert/strict";
import test from "node:test";
import { mountPageMatchingPanel } from "../browser/chromium/page-matching-panel.js";
import { projectPageResolution, isReadyPageResolution, samePageResolution } from "../browser/core/page-resolution-contract.js";
import { EN } from "../browser/locales/en.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));
function resolution(patch = {}) {
  return { phase: "not-enabled", reason: null, tabId: 7, url: "https://public.example.com/article", documentId: null,
    sourceId: null, topicId: null, assignment: null, sequence: 1, enabled: true, blockedOrigins: [], sessionWindowId: 2, currentWindowId: 2, sessionRevision: "revision-1", hostAccess: true,
    currentOrigin: "https://public.example.com", currentTabId: 7, currentUrl: "https://public.example.com/article", contextReason: null, ...patch,
    sessionWindowId: Object.hasOwn(patch, "sessionWindowId") ? patch.sessionWindowId : patch.enabled === false ? null : 2,
    currentWindowId: Object.hasOwn(patch, "currentWindowId") ? patch.currentWindowId : patch.currentOrigin === null ? null : 2 };
}
function harness(overrides = {}) {
  const { initialState = resolution(), ...options } = overrides;
  const created = [], calls = [], scheduled = [], canceled = [], states = [];
  const document = { createElement(tag) {
    const item = { tag, children: [], attributes: {}, textContent: "", value: "", listeners: new Map(),
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attributes[key] = value; },
      focus() { this.focused = true; },
      addEventListener(event, fn) { this.listeners.set(event, fn); }, removeEventListener(event, fn) { if (this.listeners.get(event) === fn) this.listeners.delete(event); } };
    created.push(item); return item;
  } };
  const root = document.createElement("section");
  const panel = mountPageMatchingPanel(document, root, {
    async sendMessage(message) { calls.push(message); return initialState; },
    requestPermission(request) { calls.push({ permission: request }); return Promise.resolve(true); },
    onResolution(value) { states.push(value); }, schedule(fn, delay) { scheduled.push({ fn, delay }); return scheduled.length; },
    cancelSchedule(id) { canceled.push(id); }, ...options });
  return { created, calls, states, scheduled, canceled, panel, root, byId: (id) => created.find((item) => item.id === id) };
}
test("matching status DTO rejects raw bodies/vectors/accessors and readiness needs current foreground", () => {
  assert.ok(Object.isFrozen(projectPageResolution(resolution())));
  for (const hostile of [{ ...resolution(), text: "secret" }, { ...resolution(), vectors: [1, 2] },
    { ...resolution(), get phase() { throw new Error("hostile"); } }, { ...resolution(), blockedOrigins: ["https://private.invalid"] },
    { ...resolution(), contextReason: "secret-url-or-error" },
    { ...resolution(), currentOrigin: null, currentTabId: null, currentUrl: null },
    { ...resolution(), contextReason: "window-unfocused" }]) {
    assert.throws(() => projectPageResolution(hostile), /Page matching unavailable/);
  }
  assert.equal(projectPageResolution(resolution({ currentOrigin: null, currentTabId: null, currentUrl: null,
    contextReason: "window-unfocused" })).contextReason, "window-unfocused");
  const ready = resolution({ phase: "ready", documentId: "doc-1", sourceId: "source-1", topicId: "topic-1", assignment: "provisional", blockedOrigins: [] });
  assert.equal(isReadyPageResolution(ready), true);
  assert.equal(isReadyPageResolution({ ...ready, currentTabId: 8 }), false);
  assert.equal(isReadyPageResolution({ ...ready, blockedOrigins: ["https://public.example.com"] }), false);
});

test("active same-window session hides repeat consent and Start even after forged checkbox clicks", async () => {
  const ui = harness(); await turn();
  assert.equal(ui.byId("matching-consent").hidden, true);
  assert.equal(ui.byId("matching-consent").disabled, true);
  assert.equal(ui.byId("matching-consent-label").hidden, true);
  assert.equal(ui.byId("matching-enable").hidden, true);
  assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-pause").disabled, false);
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionActive);
  const before = ui.calls.length;
  ui.byId("matching-consent").checked = true;
  ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.calls.length, before);
  ui.panel.dispose();
});

test("one explicit first Start persists through popup reopening without repeat permission or consent", async () => {
  let current = resolution({ phase: "off", enabled: false });
  let grants = 0;
  const payloads = [];
  const dependencies = {
    requestPermission() { grants++; return Promise.resolve(true); },
    async sendMessage(message) {
      payloads.push(message);
      if (message.type === "start-session") current = resolution({ phase: "unpaired", sessionRevision: "started" });
      return current;
    },
  };
  const first = harness(dependencies); await turn();
  assert.equal(first.byId("matching-session-status").textContent, EN.matchingSessionOff);
  assert.equal(first.byId("matching-consent").hidden, false);
  assert.equal(!!first.byId("matching-consent").checked, false);
  assert.equal(first.byId("matching-enable").disabled, true);
  first.byId("matching-consent").checked = true;
  first.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(grants, 1); assert.equal(payloads.filter((item) => item.type === "start-session").length, 1);
  assert.equal(first.byId("matching-session-status").textContent, EN.matchingSessionActive);
  assert.equal(first.byId("matching-consent").hidden, true); assert.equal(first.byId("matching-consent").checked, false);
  assert.equal(first.byId("matching-enable").hidden, true); assert.equal(first.byId("matching-pause").disabled, false);
  first.panel.dispose();
  const reopened = harness(dependencies); await turn();
  reopened.scheduled[0].fn(); await turn();
  assert.equal(reopened.byId("matching-session-status").textContent, EN.matchingSessionActive);
  assert.equal(reopened.byId("matching-consent").hidden, true); assert.equal(reopened.byId("matching-enable").disabled, true);
  assert.equal(grants, 1); assert.equal(payloads.filter((item) => item.type === "start-session").length, 1);
  assert.equal(reopened.byId("matching-status").textContent, EN.matchingUnpaired);
  reopened.panel.dispose();
});
test("streamlined session offers one Chrome grant gesture without a repeated checkbox", async () => {
  let current = resolution({ phase: "off", enabled: false, hostAccess: false });
  const ui = harness({ streamlinedSession: true, initialState: current,
    async sendMessage(message) { ui.calls.push(message); if (message.type === "start-session") current = resolution({ phase: "checking" }); return current; } });
  await turn();
  assert.equal(ui.byId("matching-consent").hidden, true);
  assert.equal(ui.byId("matching-consent-label").hidden, true);
  assert.equal(ui.byId("matching-enable").disabled, false);
  assert.equal(ui.byId("matching-enable").textContent, EN.matchingGrantAccess);
  ui.byId("matching-enable").listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), { permission: { origins: ["https://*/*"] } });
  await turn();
  assert.equal(ui.calls.at(-1).type, "start-session");
  ui.panel.dispose();
});
test("streamlined Resume with an existing native grant skips Chrome permission request", async () => {
  const ui = harness({ streamlinedSession: true, initialState: resolution({ phase: "off", enabled: false }) });
  await turn();
  assert.equal(ui.byId("matching-enable").textContent, EN.matchingEnable);
  ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.calls.some((item) => Object.hasOwn(item, "permission")), false);
  assert.equal(ui.calls.at(-1).type, "start-session");
  ui.panel.dispose();
});

test("different eligible tabs in the same window retain active summary with no permission or Start on polling", async () => {
  let current = resolution({ phase: "unpaired" }); let grants = 0;
  const ui = harness({ requestPermission() { grants++; return true; }, async sendMessage(message) { ui.calls.push(message); return current; } });
  await turn();
  current = resolution({ phase: "unpaired", currentTabId: 8, tabId: 8,
    url: "https://another.example.com/new", currentUrl: "https://another.example.com/new", currentOrigin: "https://another.example.com" });
  ui.byId("matching-consent").checked = true; ui.scheduled[0].fn(); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionActive);
  assert.equal(ui.byId("matching-consent").hidden, true); assert.equal(ui.byId("matching-consent").checked, false);
  assert.equal(ui.byId("matching-enable").hidden, true); assert.equal(ui.byId("matching-pause").disabled, false);
  assert.equal(grants, 0); assert.ok(ui.calls.every((item) => item.type === "status"));
  ui.panel.dispose();
});

for (const reason of ["page-loading", "unsupported-url", "tab-unavailable", "window-unfocused", "incognito"]) {
  test(`enabled lease with unavailable ${reason} context retains original-window session without repeat consent`, async () => {
    const ui = harness({ initialState: resolution({ phase: "unsupported", reason: "no-focused-page", currentOrigin: null,
      currentTabId: null, currentUrl: null, currentWindowId: null, contextReason: reason }) }); await turn();
    assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionActiveUnknownPage);
    assert.equal(ui.byId("matching-session-status").attributes.role, "status");
    assert.equal(ui.byId("matching-consent").hidden, true); assert.equal(ui.byId("matching-consent").disabled, true);
    assert.equal(ui.byId("matching-consent-label").hidden, true); assert.equal(ui.byId("matching-enable").disabled, true);
    assert.equal(ui.byId("matching-enable").hidden, true); assert.equal(ui.byId("matching-pause").disabled, false);
    assert.ok(!ui.byId("matching-session-status").textContent.includes("active in this window"));
    assert.ok(!ui.byId("matching-context").textContent.includes("outside the active browsing session"));
    ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
    assert.deepEqual(ui.calls, [{ target: "page-matching", type: "status" }]);
    ui.panel.dispose();
  });
}

test("known other-window session offers only explicit disclosed movement into this window", async () => {
  let moved = false;
  const ui = harness({ async sendMessage(message) {
    ui.calls.push(message);
    if (message.type === "start-session") moved = true;
    return resolution({ phase: "unpaired", currentWindowId: 3, sessionWindowId: moved ? 3 : 2 });
  } }); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionElsewhere);
  assert.equal(ui.byId("matching-consent").hidden, false); assert.equal(ui.byId("matching-consent-label").hidden, false);
  assert.equal(ui.byId("matching-enable").hidden, false); assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-enable").textContent, EN.matchingMoveSession);
  assert.equal(ui.byId("matching-pause").disabled, false); assert.equal(ui.byId("matching-retry").disabled, true);
  ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.calls.length, 1);
  ui.byId("matching-consent").checked = true; ui.byId("matching-consent").listeners.get("change")();
  ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "start-session", windowId: 3, expectedRevision: "revision-1" });
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionActive);
  assert.equal(ui.byId("matching-enable").hidden, true); assert.equal(ui.byId("matching-consent").checked, false);
  ui.panel.dispose();
});

test("pending Stop keeps consent hidden and rejects Start until the worker confirms off", async () => {
  let complete;
  const stopped = new Promise((resolve) => { complete = resolve; });
  const ui = harness({ async sendMessage(message) { ui.calls.push(message); return message.type === "stop-session" ? stopped : resolution(); } });
  await turn(); ui.byId("matching-pause").listeners.get("click")(); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingStopping);
  assert.equal(ui.byId("matching-consent").hidden, true); assert.equal(ui.byId("matching-enable").hidden, true);
  ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.ok(ui.calls.every((item) => ["status", "stop-session"].includes(item.type)));
  complete(resolution({ phase: "off", enabled: false })); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionOff);
  assert.equal(ui.byId("matching-consent").hidden, false); assert.equal(ui.byId("matching-consent").disabled, false);
  assert.equal(ui.byId("matching-consent").checked, false); assert.equal(ui.byId("matching-consent-label").hidden, false);
  assert.equal(ui.byId("matching-enable").hidden, false); assert.equal(ui.byId("matching-enable").disabled, true);
  ui.panel.dispose();
});

test("initial delayed status and worker errors never claim active or offer unverified Start", async () => {
  let complete; let fails = false;
  const pending = new Promise((resolve) => { complete = resolve; });
  const ui = harness({ sendMessage: () => fails ? Promise.reject(new Error("private details")) : pending });
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionChecking);
  assert.equal(ui.byId("matching-enable").hidden, true); assert.equal(ui.byId("matching-consent").disabled, true);
  complete(resolution()); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionActive);
  fails = true; ui.scheduled[0].fn(); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionUnavailable);
  assert.equal(ui.byId("matching-enable").hidden, true); assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-consent").checked, false);
  assert.ok(ui.created.every((item) => !item.textContent.includes("private details")));
  ui.panel.dispose(); assert.equal(ui.byId("matching-session-status").textContent, "");
});

test("failed Stop shows unavailable session status and cannot offer a fresh Start", async () => {
  const ui = harness({ sendMessage: async (message) => message.type === "stop-session" ? { error: "unavailable" } : resolution() });
  await turn(); await assert.rejects(ui.panel.pauseMatching(), /Page matching unavailable/);
  assert.equal(ui.byId("matching-session-status").textContent, EN.matchingSessionUnavailable);
  assert.equal(ui.byId("matching-consent").hidden, true); assert.equal(ui.byId("matching-enable").hidden, true);
  assert.equal(ui.byId("matching-enable").disabled, true);
  ui.panel.dispose();
});

test("session summaries and movement label use supplied messages with English fallback", async () => {
  const ui = harness({ messages: { matchingSessionElsewhere: "Translated other-window session", matchingMoveSession: "Translated move action" },
    initialState: resolution({ currentWindowId: 3 }) }); await turn();
  assert.equal(ui.byId("matching-session-status").textContent, "Translated other-window session");
  assert.equal(ui.byId("matching-enable").textContent, "Translated move action");
  ui.panel.dispose();
  const english = harness({ messages: {} }); await turn();
  assert.equal(english.byId("matching-session-status").textContent, EN.matchingSessionActive);
  english.panel.dispose();
});
test("broad permission prompt starts synchronously in gesture after disclosed checkbox consent", async () => {
  const ui = harness({ initialState: resolution({ phase: "off", enabled: false }) }); await turn();
  assert.equal(ui.byId("matching-enable").disabled, true);
  ui.byId("matching-consent").checked = true; ui.byId("matching-consent").listeners.get("change")();
  assert.equal(ui.byId("matching-enable").disabled, false);
  ui.byId("matching-enable").listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), { permission: { origins: ["https://*/*"] } });
  await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "start-session", windowId: 2, expectedRevision: "revision-1" });
  assert.equal(ui.byId("matching-consent").checked, false);
  assert.ok(ui.created.some((item) => item.textContent === EN.matchingDisclosure));
  assert.match(EN.matchingDisclosure, /local build, publisher metadata does not block matching/);
  assert.match(EN.matchingDisclosure, /unverified working assumption, not legal or store clearance/);
  assert.ok(ui.created.some((item) => item.textContent === EN.matchingPartial));
});
test("polling is one-flight, every500ms, shared read; disposal cancels and ignores late work", async () => {
  let resolve, requests = 0;
  const pending = new Promise((yes) => { resolve = yes; });
  const ui = harness({ sendMessage() { requests++; return pending; } }); await turn();
  const read = ui.panel.readResolution(); assert.equal(requests, 1);
  const rejected = assert.rejects(read, /Page matching unavailable/);
  ui.panel.dispose(); resolve(resolution()); await rejected; await turn();
  assert.equal(ui.root.children.length, 0); assert.equal(ui.scheduled.length, 0);
  const stable = harness(); await turn();
  assert.equal(stable.scheduled[0].delay, 500); stable.scheduled[0].fn(); await turn();
  assert.equal(stable.calls.length, 2); stable.panel.dispose();
  assert.equal(stable.created.some((item) => item.listeners.size), false);
});
test("session controls send bounded stop/retry/block/unblock/remove-access messages", async () => {
  const ui = harness({ async sendMessage(message) { ui.calls.push(message); return resolution({ blockedOrigins: ["https://other.example.com"] }); } });
  await turn();
  for (const [control, type] of [["matching-retry", "retry"], ["matching-remove-access", "remove-access"], ["matching-pause", "stop-session"]]) {
    ui.byId(control).listeners.get("click")(); await turn();
    assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type });
  }
  ui.byId("matching-block").listeners.get("click")(); await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "block-site", origin: "https://public.example.com" });
  ui.created.find((item) => item.attributes["data-unblock-origin"] && item.listeners.has("click")).listeners.get("click")(); await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "unblock-site", origin: "https://other.example.com" });
  assert.equal(ui.byId("matching-resume"), undefined);
  ui.panel.dispose();
});
test("denied native permission never starts a session", async () => {
  const ui = harness({ initialState: resolution({ phase: "off", enabled: false }), requestPermission: () => Promise.resolve(false) }); await turn();
  const before = ui.calls.length;
  ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.calls.length, before); assert.equal(ui.byId("matching-status").textContent, EN.matchingPermissionDenied);
  ui.panel.dispose();
});

test("worker errors clear cached origin/enable and never render hostile content as HTML", async () => {
  const ui = harness({ sendMessage: async () => ({ error: "unavailable", text: "<img src=x>" }) }); await turn();
  assert.equal(ui.byId("matching-enable").disabled, true); assert.equal(ui.byId("matching-status").textContent, EN.matchingUnavailable);
  assert.equal(ui.byId("matching-origin").textContent, "");
  assert.equal(ui.byId("matching-context").textContent, EN.matchingContextWorkerUnavailable);
  assert.equal(ui.states.at(-1), null); assert.equal(ui.created.some((item) => ["script", "img", "iframe", "a"].includes(item.tag)), false);
});

test("context reason remains visible while matching is off and stale context clears on worker failure", async () => {
  let fails = false;
  const ui = harness({ async sendMessage() { if (fails) throw new Error("private URL must not render");
    return resolution({ phase: "off", enabled: false, currentOrigin: null, currentTabId: null,
      currentUrl: null, contextReason: "window-unfocused" }); } });
  await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
  assert.equal(ui.byId("matching-context").textContent, EN.matchingContextUnfocused);
  assert.equal(ui.byId("matching-context").attributes.role, "status");
  assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-enable").attributes["data-busy"], "false");
  fails = true; ui.scheduled[0].fn(); await turn();
  assert.equal(ui.byId("matching-context").textContent, EN.matchingContextWorkerUnavailable);
  assert.equal(ui.byId("matching-origin").textContent, "");
  ui.panel.dispose();
  assert.equal(ui.byId("matching-context").textContent, "");
});

test("only an in-flight matching action marks disabled controls busy", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const ui = harness({ sendMessage(message) { return message.type === "stop-session" ? pending : Promise.resolve(resolution()); } });
  await turn();
  assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-enable").attributes["data-busy"], "false");
  ui.byId("matching-pause").listeners.get("click")();
  assert.equal(ui.byId("matching-pause").disabled, true);
  assert.equal(ui.byId("matching-pause").attributes["data-busy"], "true");
  assert.equal(ui.byId("matching-status").textContent, EN.matchingStopping);
  release(resolution({ phase: "off", enabled: false })); await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
  assert.equal(ui.byId("matching-pause").attributes["data-busy"], "false");
  ui.panel.dispose();
});

const contextMessages = {
  "context-unavailable": "matchingContextUnavailable", "window-unavailable": "matchingContextWindowUnavailable",
  "window-query-failed": "matchingContextWindowQueryFailed", "tab-query-failed": "matchingContextTabQueryFailed",
  "window-changed": "matchingContextWindowChanged", "tab-changed": "matchingContextTabChanged",
  "focus-expired": "matchingContextFocusExpired", "focus-changed": "matchingContextFocusChanged",
  "window-unfocused": "matchingContextUnfocused", "unsupported-window": "matchingContextWindow",
  "tab-unavailable": "matchingContextTab", "page-loading": "matchingContextLoading",
  "url-unavailable": "matchingContextUrlUnavailable", incognito: "matchingContextIncognito",
  "unsupported-url": "matchingContextUnsupportedUrl",
};
for (const [reason, key] of Object.entries(contextMessages)) {
  test(`bounded context diagnostic ${reason} has visible guidance and clears on recovery`, async () => {
    let recovered = false;
    const ui = harness({ messages: {}, async sendMessage() {
      return recovered ? resolution({ enabled: false }) : resolution({ phase: "off", enabled: false,
        currentOrigin: null, currentTabId: null, currentUrl: null, contextReason: reason });
    } });
    await turn();
    const text = ui.byId("matching-context").textContent;
    assert.equal(typeof text, "string"); assert.ok(text.length > 0);
    assert.equal(text, EN[key]);
    assert.equal(ui.states.at(-1).contextReason, reason);
    assert.equal(ui.byId("matching-origin").textContent, "");
    ui.byId("matching-consent").checked = true;
    ui.byId("matching-consent").listeners.get("change")();
    assert.equal(ui.byId("matching-enable").disabled, true);
    assert.equal(ui.byId("matching-enable").attributes["data-busy"], "false");
    ui.byId("matching-enable").listeners.get("click")();
    assert.equal(ui.calls.length, 0, "Blocked context must not request a site permission");
    recovered = true; ui.scheduled[0].fn(); await turn();
    assert.equal(ui.byId("matching-context").textContent, "");
    assert.equal(ui.byId("matching-enable").disabled, false);
    ui.panel.dispose();
  });
}

test("new context guidance uses the language pack when supplied", async () => {
  const translated = "Translated bounded focus message";
  const ui = harness({ messages: { matchingContextFocusExpired: translated }, async sendMessage() {
    return resolution({ currentOrigin: null, currentTabId: null, currentUrl: null, contextReason: "focus-expired" });
  } });
  await turn();
  assert.equal(ui.byId("matching-context").textContent, translated);
  ui.panel.dispose();
});

test("hung status times out within8seconds, frees queued Pause, and clears request timers", async () => {
  const timers = [], canceled = [], messages = [];
  const ui = harness({
    sendMessage(message) {
      messages.push(message);
      return message.type === "status" ? new Promise(() => {}) : Promise.resolve(resolution({ phase: "off", enabled: false }));
    }, timeoutSchedule(fn, delay) { timers.push({ fn, delay }); return timers.length; }, timeoutCancel(id) { canceled.push(id); },
  }); await turn();
  const status = assert.rejects(ui.panel.readResolution(), /Page matching unavailable/);
  const pausing = ui.panel.pauseMatching(); await turn(); assert.equal(messages.length, 2);
  assert.equal(timers[0].delay, 8000); timers[0].fn(); await status; await pausing;
  assert.equal(messages.at(-1).type, "stop-session"); assert.ok(canceled.includes(1)); assert.ok(canceled.includes(2));
  ui.panel.dispose();
});

test("popup disposal during permission prompt does not enable after permission resolves", async () => {
  let resolve;
  const granted = new Promise((yes) => { resolve = yes; });
  const ui = harness({ initialState: resolution({ phase: "off", enabled: false }), requestPermission: () => granted }); await turn();
  ui.byId("matching-consent").checked = true;
  ui.byId("matching-enable").listeners.get("click")(); ui.panel.dispose(); resolve(true); await turn();
  assert.equal(ui.calls.some((message) => message.type === "start-session"), false);
});

test("unchanged blocked-site polling preserves focused Allow node and handler", async () => {
  const ui = harness({ async sendMessage() { return resolution({ blockedOrigins: ["https://public.example.com"] }); } });
  await turn();
  const sites = ui.byId("matching-sites"); const row = sites.children[0]; const remove = row.children[1];
  const callback = remove.listeners.get("click"); remove.focus();
  ui.scheduled[0].fn(); await turn();
  assert.equal(sites.children[0], row); assert.equal(sites.children[0].children[1], remove);
  assert.equal(remove.listeners.get("click"), callback); assert.equal(remove.focused, true);
  ui.byId("matching-pause").listeners.get("click")();
  assert.equal(remove.disabled, true); await turn();
  assert.equal(sites.children[0].children[1], remove); assert.equal(remove.disabled, false);
  ui.panel.dispose(); assert.equal(remove.listeners.size, 0);
});

const unsupportedMessages = {
  "missing-region": "matchingUnsupportedRegion", "rights-restricted": "matchingUnsupportedRestriction",
  "capture-budget": "matchingUnsupportedCapture", "invalid-content": "matchingUnsupportedContent",
  "capture-time-budget": "matchingUnsupportedCaptureTime", "capture-node-budget": "matchingUnsupportedCaptureNodes",
  "capture-head-budget": "matchingUnsupportedCaptureHead", "capture-attribute-budget": "matchingUnsupportedCaptureAttribute",
  "capture-failed": "matchingUnsupportedCaptureFailed",
  "document-mismatch": "matchingUnsupportedDocument", "document-changed": "matchingUnsupportedDocument",
  "no-focused-page": "matchingUnsupportedForeground", "invalid-url": "matchingUnsupportedUrl",
  credentials: "matchingUnsupportedSensitiveUrl", "sensitive-context": "matchingUnsupportedSensitiveUrl",
  "credential-query": "matchingUnsupportedSensitiveUrl", "unsupported-scheme-or-port": "matchingUnsupportedUrlScope",
  "unsupported-host": "matchingUnsupportedUrlScope",
};
for (const [reason, key] of Object.entries(unsupportedMessages)) {
  test(`unsupported reason ${reason} renders fixed guidance/code with English fallback`, async () => {
    const ui = harness({ messages: {}, async sendMessage() { return resolution({ phase: "unsupported", reason }); } });
    await turn();
    assert.equal(ui.byId("matching-status").textContent, EN[key]);
    assert.equal(ui.byId("matching-detail").textContent, `[${reason}]`);
    assert.equal(ui.byId("matching-detail").attributes.role, "status");
    assert.equal(ui.byId("matching-retry").disabled, false);
    assert.equal(ui.states.at(-1).reason, reason);
    ui.panel.dispose();
    assert.equal(ui.byId("matching-detail").textContent, "");
  });
}

test("unknown and null unsupported reasons use honest generic guidance without echo", async () => {
  for (const reason of [null, "private-page-secret", "constructor", "tostring", "toString", "__proto__"]) {
    const ui = harness({ async sendMessage() { return resolution({ phase: "unsupported", reason }); } });
    await turn();
    // Uppercase/underscore values violate the DTO reason syntax; their generic
    // worker failure must likewise expose no untrusted diagnostic.
    assert.equal(ui.byId("matching-status").textContent, ["toString", "__proto__"].includes(reason) ? EN.matchingUnavailable : EN.matchingUnsupported);
    assert.equal(ui.byId("matching-detail").textContent, "");
    assert.ok(!ui.created.some((item) => item.textContent.includes("private-page-secret")));
    assert.ok(!ui.byId("matching-status").textContent.includes("main-region"));
    ui.panel.dispose();
  }
});

test("unknown unsupported reason clears an earlier known diagnostic", async () => {
  let reason = "missing-region";
  const ui = harness({ async sendMessage() { return resolution({ phase: "unsupported", reason }); } });
  await turn();
  assert.equal(ui.byId("matching-detail").textContent, "[missing-region]");
  reason = "private-page-secret"; ui.scheduled[0].fn(); await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingUnsupported);
  assert.equal(ui.byId("matching-detail").textContent, "");
  reason = null; ui.scheduled[1].fn(); await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingUnsupported);
  assert.equal(ui.byId("matching-detail").textContent, "");
  ui.panel.dispose();
});

test("unsupported guidance uses supplied language pack while diagnostic code stays fixed", async () => {
  const translated = "Translated bounded capture message";
  const ui = harness({ messages: { matchingUnsupportedCapture: translated }, async sendMessage() {
    return resolution({ phase: "unsupported", reason: "capture-budget" });
  } });
  await turn();
  assert.equal(ui.byId("matching-status").textContent, translated);
  assert.equal(ui.byId("matching-detail").textContent, "[capture-budget]");
  ui.panel.dispose();
});

for (const phase of ["off", "checking", "not-enabled", "unpaired", "processing", "ready", "error"]) {
  test(`unsupported diagnostic clears when the phase becomes ${phase}`, async () => {
    let recovering = false;
    const ui = harness({ async sendMessage() {
      return resolution({ phase: recovering ? phase : "unsupported", reason: "missing-region" });
    } });
    await turn();
    assert.equal(ui.byId("matching-detail").textContent, "[missing-region]");
    recovering = true; ui.scheduled[0].fn(); await turn();
    assert.equal(ui.byId("matching-detail").textContent, "");
    assert.equal(ui.byId("matching-status").textContent, EN[{
      off: "matchingOff", checking: "matchingChecking", "not-enabled": "matchingNotEnabled", unpaired: "matchingUnpaired",
      processing: "matchingProcessing", ready: "matchingReady", error: "matchingUnavailable",
    }[phase]]);
    ui.panel.dispose();
  });
}

test("unsupported diagnostic clears on worker failure and permission denial", async () => {
  let failure = false;
  const ui = harness({ requestPermission: () => Promise.resolve(false), async sendMessage() {
    if (failure) throw new Error("https://private.invalid/body-secret");
    return resolution({ phase: "unsupported", enabled: false, reason: "missing-region" });
  } });
  await turn();
  assert.equal(ui.byId("matching-detail").textContent, "[missing-region]");
  ui.byId("matching-consent").checked = true;
  ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingPermissionDenied);
  assert.equal(ui.byId("matching-detail").textContent, "");
  ui.scheduled[0].fn(); await turn();
  assert.equal(ui.byId("matching-detail").textContent, "[missing-region]");
  failure = true; ui.scheduled[1].fn(); await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingUnavailable);
  assert.equal(ui.byId("matching-detail").textContent, "");
  assert.ok(!ui.created.some((item) => item.textContent.includes("body-secret")));
  ui.panel.dispose();
});

test("session DTO is exact, accessor-free and couples enabled and current context to window identity", () => {
  let executed = false;
  const getterList = [];
  Object.defineProperty(getterList, "0", { enumerable: true, get() { executed = true; return "https://public.example.com"; } });
  const sparse = new Array(1);
  for (const patch of [
    { sessionWindowId: -1 }, { currentWindowId: 0.5 }, { currentWindowId: null },
    { sessionRevision: "" }, { sessionRevision: "x".repeat(129) }, { sessionRevision: "<secret>" },
    { hostAccess: "true" }, { enabled: false, sessionWindowId: 2 },
    { enabled: true, sessionWindowId: null }, { blockedOrigins: getterList }, { blockedOrigins: sparse },
    { origins: [] }, { blockedOrigins: ["<img src=x>"] },
  ]) assert.throws(() => projectPageResolution(resolution(patch)), /Page matching unavailable/);
  const accessor = resolution();
  Object.defineProperty(accessor, "sessionRevision", { enumerable: true, get() { executed = true; return "revision-1"; } });
  assert.throws(() => projectPageResolution(accessor), /Page matching unavailable/);
  assert.equal(executed, false);
  const stopped = projectPageResolution(resolution({ enabled: false, hostAccess: true }));
  assert.equal(stopped.sessionWindowId, null);
  assert.equal(stopped.hostAccess, true);
  assert.ok(Object.isFrozen(stopped.blockedOrigins));
});

test("ready binding requires lease, native access, bound window and unblocked foreground", () => {
  const ready = projectPageResolution(resolution({ phase: "ready", documentId: "doc", sourceId: "source", topicId: "topic" }));
  assert.equal(isReadyPageResolution(ready), true);
  for (const patch of [{ enabled: false, sessionWindowId: null }, { currentWindowId: 3 }, { hostAccess: false },
    { blockedOrigins: [ready.currentOrigin] }]) assert.equal(isReadyPageResolution({ ...ready, ...patch }), false);
  for (const patch of [{ sessionWindowId: 3 }, { currentWindowId: 3 }, { sessionRevision: "revision-2" },
    { hostAccess: false }, { blockedOrigins: [ready.currentOrigin] }]) assert.equal(samePageResolution(ready, { ...ready, ...patch }), false);
  assert.equal(samePageResolution(ready, { ...ready, blockedOrigins: [] }), true);
});

test("stopped lease and retained Chrome access are displayed independently", async () => {
  const ui = harness({ sendMessage: async () => resolution({ phase: "off", enabled: false, hostAccess: true }) });
  await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
  assert.equal(ui.byId("matching-access").textContent, EN.matchingAccessGranted);
  assert.equal(ui.byId("matching-pause").disabled, true);
  assert.equal(ui.byId("matching-remove-access").disabled, false);
  ui.byId("matching-consent").checked = true; ui.byId("matching-consent").listeners.get("change")();
  assert.equal(ui.byId("matching-enable").disabled, false);
  ui.panel.dispose(); assert.equal(ui.byId("matching-access").textContent, "");
});

test("other window has fixed guidance and cannot retry or claim automatic readiness", async () => {
  const ui = harness({ sendMessage: async () => resolution({ phase: "ready", currentWindowId: 3,
    documentId: "doc", sourceId: "source", topicId: "topic" }) });
  await turn();
  assert.equal(ui.byId("matching-context").textContent, EN.matchingOtherWindow);
  assert.equal(ui.byId("matching-status").textContent, EN.matchingNotEnabled);
  assert.equal(ui.byId("matching-retry").disabled, true);
  assert.equal(isReadyPageResolution(ui.states.at(-1)), false);
  assert.equal(ui.byId("matching-pause").disabled, false);
  ui.panel.dispose();
});

test("Stop during native prompt invalidates its ticket and late grant cannot restart or clear new status", async () => {
  let grant;
  const prompt = new Promise((resolve) => { grant = resolve; });
  const ui = harness({ requestPermission: () => prompt,
    async sendMessage(message) { ui.calls.push(message); return resolution({ phase: "off", enabled: false, sessionRevision: "stopped-revision" }); } });
  await turn();
  ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")();
  assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-pause").disabled, false);
  ui.byId("matching-pause").listeners.get("click")(); await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "stop-session" });
  const before = ui.calls.length;
  grant(true); await turn();
  assert.equal(ui.calls.length, before);
  assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
  assert.equal(ui.byId("matching-access").textContent, EN.matchingAccessGranted);
  assert.equal(ui.byId("matching-consent").checked, false);
  assert.equal(ui.calls.some((call) => call.type === "start-session"), false);
  ui.panel.dispose();
});

for (const succeeds of [true, false]) {
  test(`Stop overtakes delayed Start ${succeeds ? "success" : "failure"} and ignores its stale UI outcome`, async () => {
    let complete, reject;
    const delayed = new Promise((resolve, no) => { complete = resolve; reject = no; });
    const ui = harness({ async sendMessage(message) {
      ui.calls.push(message);
      if (message.type === "start-session") return delayed;
      return resolution({ phase: "off", enabled: false, sessionRevision: message.type === "stop-session" ? "stopped" : "revision-1" });
    } });
    await turn();
    ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
    assert.equal(ui.calls.at(-1).type, "start-session");
    assert.equal(ui.byId("matching-pause").disabled, false);
    ui.byId("matching-pause").listeners.get("click")(); await turn();
    assert.equal(ui.calls.at(-1).type, "stop-session");
    assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
    const statesBefore = ui.states.length;
    if (succeeds) complete(resolution({ phase: "processing" })); else reject(new Error("secret"));
    await turn();
    assert.equal(ui.states.length, statesBefore);
    assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
    assert.equal(ui.byId("matching-access").textContent, EN.matchingAccessGranted);
    ui.panel.dispose();
  });
}

test("delayed permission from an older Start cannot override a newly started session", async () => {
  let grant;
  const delayed = new Promise((resolve) => { grant = resolve; }); let prompts = 0;
  let current = resolution({ phase: "off", enabled: false });
  const ui = harness({ requestPermission() { return ++prompts === 1 ? delayed : Promise.resolve(true); },
    async sendMessage(message) {
      ui.calls.push(message);
      if (message.type === "stop-session") current = resolution({ phase: "off", enabled: false, sessionRevision: "revision-2" });
      if (message.type === "start-session") current = resolution({ phase: "processing", sessionRevision: "revision-3" });
      return current;
    } });
  await turn();
  ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")();
  ui.byId("matching-pause").listeners.get("click")(); await turn();
  ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "start-session", windowId: 2, expectedRevision: "revision-2" });
  const before = ui.calls.length; grant(false); await turn();
  assert.equal(ui.calls.length, before);
  assert.equal(ui.byId("matching-status").textContent, EN.matchingProcessing);
  ui.panel.dispose();
});

test("blocked site stays blocked despite native access; allowing site is explicit", async () => {
  const ui = harness({ sendMessage: async () => resolution({ phase: "not-enabled", blockedOrigins: ["https://public.example.com"] }) });
  await turn();
  assert.equal(ui.byId("matching-block").disabled, true);
  assert.equal(ui.byId("matching-retry").disabled, true);
  assert.equal(ui.byId("matching-access").textContent, EN.matchingAccessGranted);
  const allow = ui.byId("matching-sites").children[0].children[1];
  assert.equal(allow.textContent, EN.matchingUnblockSite);
  assert.equal(allow.attributes["data-unblock-origin"], "https://public.example.com");
  ui.panel.dispose();
});

test("native access removal projects no grant; worker failure clears native access text", async () => {
  let fails = false;
  const ui = harness({ async sendMessage(message) {
    if (fails) throw new Error("private-url");
    return resolution({ phase: "off", enabled: false, hostAccess: message.type !== "remove-access" });
  } }); await turn();
  ui.byId("matching-remove-access").listeners.get("click")(); await turn();
  assert.equal(ui.byId("matching-access").textContent, EN.matchingAccessAbsent);
  assert.equal(ui.byId("matching-remove-access").disabled, true);
  fails = true; ui.scheduled[0].fn(); await turn();
  assert.equal(ui.byId("matching-access").textContent, "");
  assert.equal(ui.byId("matching-origin").textContent, "");
  ui.panel.dispose();
});

test("stale worker Start rejection clears cached state without echoing worker details", async () => {
  const ui = harness({ async sendMessage(message) {
    return message.type === "start-session" ? { error: "stale-ticket", secret: "private-url" } : resolution({ phase: "off", enabled: false });
  } }); await turn();
  ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingUnavailable);
  assert.equal(ui.byId("matching-access").textContent, "");
  assert.equal(ui.byId("matching-enable").disabled, true);
  assert.ok(ui.created.every((item) => !item.textContent.includes("private-url")));
  ui.panel.dispose();
});

test("Stop invalidates a shared stale status read and it cannot revive session display", async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const ui = harness({ async sendMessage(message) {
    ui.calls.push(message);
    return message.type === "status" ? delayed : resolution({ phase: "off", enabled: false, sessionRevision: "stopped" });
  } }); await turn();
  const stale = assert.rejects(ui.panel.readResolution(), /Page matching unavailable/);
  const stopping = ui.panel.pauseMatching(); await turn();
  assert.equal(ui.calls.at(-1).type, "stop-session");
  await stopping;
  assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
  release(resolution({ phase: "ready", documentId: "doc", sourceId: "source", topicId: "topic" }));
  await stale; await turn();
  assert.equal(ui.byId("matching-status").textContent, EN.matchingOff);
  assert.equal(ui.states.at(-1).sessionRevision, "stopped");
  ui.panel.dispose();
});
