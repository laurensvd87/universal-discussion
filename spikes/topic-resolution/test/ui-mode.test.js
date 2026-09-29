import assert from "node:assert/strict";
import test from "node:test";
import { createUiModePreference, UI_MODE_KEY } from "../browser/chromium/ui-mode.js";
import { mountPopupShell, projectDiscussionShell } from "../browser/chromium/popup-shell.js";
import { EN } from "../browser/locales/en.js";

test("mode defaults User; accepts only the inert enum and persists exactly its dedicated key", async () => {
  const writes = [], changes = [];
  const preference = createUiModePreference({ storageLocal: {
    get: async (key) => { assert.equal(key, UI_MODE_KEY); return { [key]: "invalid", token: "unrelated" }; },
    set: async (record) => writes.push(record),
  }, onChange: (mode) => changes.push(mode) });
  await preference.load(); assert.equal(preference.currentMode(), "user");
  preference.select("developer"); preference.select("user"); preference.select("invalid");
  await preference.settled();
  assert.deepEqual(writes, [{ [UI_MODE_KEY]: "developer" }, { [UI_MODE_KEY]: "user" }]);
  assert.deepEqual(changes, ["user", "developer", "user"]);
});

test("a delayed preference read cannot overwrite a newer explicit click", async () => {
  let complete;
  const preference = createUiModePreference({ storageLocal: {
    get: () => new Promise((resolve) => { complete = resolve; }), set: async () => {},
  } });
  const loading = preference.load(); preference.select("developer");
  complete({ [UI_MODE_KEY]: "user" }); await loading;
  assert.equal(preference.currentMode(), "developer"); await preference.settled();
});

test("saved modes load, storage failures stay usable and disposed reads cannot publish", async () => {
  const saved = createUiModePreference({ storageLocal: { get: async () => ({ [UI_MODE_KEY]: "developer" }) } });
  await saved.load(); assert.equal(saved.currentMode(), "developer");
  const failed = createUiModePreference({ storageLocal: { get: async () => { throw Error(); }, set: async () => { throw Error(); } } });
  await failed.load(); failed.select("developer"); await failed.settled(); assert.equal(failed.currentMode(), "developer");
  let complete; const changes = [];
  const disposed = createUiModePreference({ storageLocal: { get: () => new Promise((resolve) => { complete = resolve; }) }, onChange: (value) => changes.push(value) });
  const loading = disposed.load(); disposed.dispose(); complete({ [UI_MODE_KEY]: "developer" }); await loading;
  assert.deepEqual(changes, ["user"]);
});

test("connection relies on successful catalog state; titles clear on context/error and reflect processing", () => {
  const catalog = { topics: [{ id: "topic", title: "<script>plain title</script>" }] };
  const ready = { phase: "ready", catalog, topicId: "topic", error: null };
  assert.deepEqual(projectDiscussionShell(ready), { connection: "connected", connectionText: EN.uiConnected, topicTitle: "<script>plain title</script>", selectionCue: EN.uiTopicFixture });
  assert.equal(projectDiscussionShell({ ...ready, phase: "connecting" }).connection, "connecting");
  assert.equal(projectDiscussionShell({ phase: "disconnected", token: "presence is irrelevant" }).connection, "disconnected");
  const unavailable = projectDiscussionShell({ ...ready, phase: "error", error: "unavailable" });
  assert.equal(unavailable.connection, "unavailable"); assert.equal(unavailable.topicTitle, EN.uiTopicUnavailable);
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", error: "context-changed" }).topicTitle, EN.uiTopicEmpty);
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", resolution: { phase: "processing", enabled: true } }).topicTitle, EN.uiTopicProcessing);
  assert.equal(projectDiscussionShell({ ...ready, phase: "disconnected", catalog: null, resolution: { phase: "checking", enabled: false } }).topicTitle, EN.uiTopicDisconnected);
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", resolution: { phase: "checking", enabled: false } }).topicTitle, EN.uiTopicEmpty);
  assert.equal(projectDiscussionShell({ ...ready, phase: "error", error: "unavailable", resolution: { phase: "processing", enabled: true } }).topicTitle, EN.uiTopicUnavailable);
  assert.equal(projectDiscussionShell({ ...ready, phase: "disconnected", error: "unauthorized" }).topicTitle, EN.uiTopicDisconnected);
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", resolution: { phase: "error", reason: "unavailable" } }).connection, "unverified");
  assert.equal(projectDiscussionShell({ ...ready, selection: "manual" }).selectionCue, EN.uiTopicManual);
  assert.equal(projectDiscussionShell({ ...ready, catalog: { ...catalog, sources: [{ id: "source", provenance: "owner-local-page-embedding/v1" }] }, sourceId: "source", selection: "background" }).selectionCue, EN.uiTopicProvisional);
});

test("shell uses native keyboard buttons, accessible pressed state, visible connection text and removes listeners", async () => {
  const nodes = new Map();
  const uiActions = [];
  for (const id of ["#ui-mode-user", "#ui-mode-developer", "#connection-status", "#ui-mode-toggle", "#capture-controls-link", "#page-matching"]) nodes.set(id, {
    attributes: {}, dataset: {}, listeners: new Map(), setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, value) { this.listeners.set(key, value); }, removeEventListener(key) { this.listeners.delete(key); },
    scrollIntoView(value) { uiActions.push(["scroll", id, value]); }, focus(value) { uiActions.push(["focus", id, value]); },
  });
  const document = { body: { dataset: {} }, querySelector: (id) => nodes.get(id), location: { href: "chrome-extension://test/popup.html" } };
  const modes = [];
  const shell = mountPopupShell(document, { onModeChange: (mode) => modes.push(mode) });
  assert.equal(document.body.dataset.uiMode, "user");
  assert.equal(nodes.get("#connection-status").attributes.title, EN.uiConnectionLastChecked);
  nodes.get("#ui-mode-developer").listeners.get("click")();
  assert.equal(document.body.dataset.uiMode, "developer");
  assert.equal(nodes.get("#ui-mode-developer").attributes["aria-pressed"], "true");
  shell.render({ phase: "choose-topic", catalog: { topics: [] } });
  assert.equal(nodes.get("#connection-status").textContent, EN.uiConnected);
  nodes.get("#capture-controls-link").listeners.get("click")();
  assert.equal(document.location.href, "chrome-extension://test/popup.html");
  assert.equal(nodes.get("#capture-controls-link").attributes.href, undefined);
  assert.deepEqual(uiActions, [["scroll", "#page-matching", { block: "start", behavior: "smooth" }], ["focus", "#page-matching", { preventScroll: true }]]);
  shell.dispose(); assert.equal(nodes.get("#ui-mode-user").listeners.size, 0);
  assert.equal(nodes.get("#capture-controls-link").listeners.size, 0);
  assert.deepEqual(modes, ["user", "developer"]);
});
