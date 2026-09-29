import assert from "node:assert/strict";
import test from "node:test";
import { mountPageMatchingPanel } from "../browser/chromium/page-matching-panel.js";
import { projectPageResolution, isReadyPageResolution } from "../browser/core/page-resolution-contract.js";
import { EN } from "../browser/locales/en.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));
function resolution(patch = {}) {
  return { phase: "not-enabled", reason: null, tabId: 7, url: "https://public.example.com/article", documentId: null,
    sourceId: null, topicId: null, assignment: null, sequence: 1, enabled: true, origins: [],
    currentOrigin: "https://public.example.com", currentTabId: 7, currentUrl: "https://public.example.com/article", contextReason: null, ...patch };
}
function harness(overrides = {}) {
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
    async sendMessage(message) { calls.push(message); return resolution(); },
    requestPermission(request) { calls.push({ permission: request }); return Promise.resolve(true); },
    onResolution(value) { states.push(value); }, schedule(fn, delay) { scheduled.push({ fn, delay }); return scheduled.length; },
    cancelSchedule(id) { canceled.push(id); }, ...overrides });
  return { created, calls, states, scheduled, canceled, panel, root, byId: (id) => created.find((item) => item.id === id) };
}
test("matching status DTO rejects raw bodies/vectors/accessors and readiness needs current foreground", () => {
  assert.ok(Object.isFrozen(projectPageResolution(resolution())));
  for (const hostile of [{ ...resolution(), text: "secret" }, { ...resolution(), vectors: [1, 2] },
    { ...resolution(), get phase() { throw new Error("hostile"); } }, { ...resolution(), origins: ["https://private.invalid"] },
    { ...resolution(), contextReason: "secret-url-or-error" },
    { ...resolution(), currentOrigin: null, currentTabId: null, currentUrl: null },
    { ...resolution(), contextReason: "window-unfocused" }]) {
    assert.throws(() => projectPageResolution(hostile), /Page matching unavailable/);
  }
  assert.equal(projectPageResolution(resolution({ currentOrigin: null, currentTabId: null, currentUrl: null,
    contextReason: "window-unfocused" })).contextReason, "window-unfocused");
  const ready = resolution({ phase: "ready", documentId: "doc-1", sourceId: "source-1", topicId: "topic-1", assignment: "provisional", origins: ["https://public.example.com"] });
  assert.equal(isReadyPageResolution(ready), true);
  assert.equal(isReadyPageResolution({ ...ready, currentTabId: 8 }), false);
  assert.equal(isReadyPageResolution({ ...ready, origins: [] }), false);
});
test("site permission prompt starts synchronously in gesture after disclosed checkbox consent", async () => {
  const ui = harness(); await turn();
  assert.equal(ui.byId("matching-enable").disabled, true);
  ui.byId("matching-consent").checked = true; ui.byId("matching-consent").listeners.get("change")();
  assert.equal(ui.byId("matching-enable").disabled, false);
  ui.byId("matching-enable").listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), { permission: { origins: ["https://public.example.com/*"] } });
  await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "enable-site", origin: "https://public.example.com" });
  assert.equal(ui.byId("matching-consent").checked, false);
  assert.ok(ui.created.some((item) => item.textContent === EN.matchingDisclosure));
  assert.match(EN.matchingDisclosure, /owner-only prototype, publisher metadata does not block matching/);
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
test("pause/resume/retry/remove use exact bounded controls and denied permission never enables", async () => {
  const ui = harness({ async sendMessage(message) { ui.calls.push(message); return resolution({ origins: ["https://public.example.com"] }); }, requestPermission: () => Promise.resolve(false) });
  await turn();
  for (const [id, type] of [["matching-pause", "pause"], ["matching-resume", "resume"], ["matching-retry", "retry"]]) {
    ui.byId(id).listeners.get("click")(); await turn(); assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type });
  }
  ui.created.find((item) => item.attributes["data-remove-origin"] && item.listeners.has("click")).listeners.get("click")(); await turn();
  assert.deepEqual(ui.calls.at(-1), { target: "page-matching", type: "remove-site", origin: "https://public.example.com" });
  const before = ui.calls.length; ui.byId("matching-consent").checked = true; ui.byId("matching-enable").listeners.get("click")(); await turn();
  assert.equal(ui.calls.length, before); assert.equal(ui.byId("matching-status").textContent, EN.matchingPermissionDenied);
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
  const ui = harness({ sendMessage(message) { return message.type === "pause" ? pending : Promise.resolve(resolution()); } });
  await turn();
  assert.equal(ui.byId("matching-enable").disabled, true);
  assert.equal(ui.byId("matching-enable").attributes["data-busy"], "false");
  ui.byId("matching-pause").listeners.get("click")();
  assert.equal(ui.byId("matching-pause").disabled, true);
  assert.equal(ui.byId("matching-pause").attributes["data-busy"], "true");
  release(resolution({ phase: "off", enabled: false })); await turn();
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
      return recovered ? resolution() : resolution({ phase: "off", enabled: false,
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
  const pausing = ui.panel.pauseMatching(); assert.equal(messages.length, 1);
  assert.equal(timers[0].delay, 8000); timers[0].fn(); await status; await pausing;
  assert.equal(messages.at(-1).type, "pause"); assert.ok(canceled.includes(1)); assert.ok(canceled.includes(2));
  ui.panel.dispose();
});

test("popup disposal during permission prompt does not enable after permission resolves", async () => {
  let resolve;
  const granted = new Promise((yes) => { resolve = yes; });
  const ui = harness({ requestPermission: () => granted }); await turn();
  ui.byId("matching-consent").checked = true;
  ui.byId("matching-enable").listeners.get("click")(); ui.panel.dispose(); resolve(true); await turn();
  assert.equal(ui.calls.some((message) => message.type === "enable-site"), false);
});

test("unchanged enabled-site polling preserves focused Remove node and handler", async () => {
  const ui = harness({ async sendMessage() { return resolution({ origins: ["https://public.example.com"] }); } });
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
    return resolution({ phase: "unsupported", reason: "missing-region" });
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
