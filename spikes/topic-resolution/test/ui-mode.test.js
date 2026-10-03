import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  for (const id of ["#ui-mode-user", "#ui-mode-developer", "#connection-status", "#ui-mode-toggle", "#capture-controls-link", "#capture-settings-summary", "#page-matching",
    "#capture-settings", "#insight-workspace", "#insight-account-details", "#insight-source-details"]) nodes.set(id, {
    attributes: {}, dataset: {}, listeners: new Map(), setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key] ?? null; },
    addEventListener(key, value) { this.listeners.set(key, value); }, removeEventListener(key) { this.listeners.delete(key); },
    scrollIntoView(value) { uiActions.push(["scroll", id, value]); }, focus(value) { uiActions.push(["focus", id, value]); },
  });
  const document = { body: { dataset: {} }, querySelector: (id) => nodes.get(id), location: { href: "chrome-extension://test/popup.html" } };
  const modes = [];
  const shell = mountPopupShell(document, { onModeChange: (mode) => modes.push(mode) });
  assert.equal(document.body.dataset.uiMode, "user");
  assert.equal(nodes.get("#insight-workspace").open, true);
  assert.equal(nodes.get("#insight-account-details").open, true);
  assert.equal(nodes.get("#connection-status").attributes.title, EN.uiConnectionLastChecked);
  assert.equal(nodes.get("#capture-settings-summary").textContent, EN.uiCaptureSettings);
  nodes.get("#ui-mode-developer").listeners.get("click")();
  assert.equal(document.body.dataset.uiMode, "developer");
  for (const id of ["#capture-settings", "#insight-workspace", "#insight-account-details", "#insight-source-details"])
    assert.equal(nodes.get(id).open, true);
  assert.equal(nodes.get("#ui-mode-developer").attributes["aria-pressed"], "true");
  shell.render({ phase: "choose-topic", catalog: { topics: [] } });
  assert.equal(nodes.get("#connection-status").textContent, EN.uiConnected);
  nodes.get("#capture-controls-link").listeners.get("click")();
  nodes.get("#insight-account-details").setAttribute("data-ready", "true");
  nodes.get("#ui-mode-user").listeners.get("click")();
  assert.equal(nodes.get("#capture-settings").open, false);
  assert.equal(nodes.get("#insight-workspace").open, true);
  assert.equal(nodes.get("#insight-account-details").open, false);
  nodes.get("#capture-controls-link").listeners.get("click")();
  assert.equal(nodes.get("#capture-settings").open, true);
  assert.equal(document.location.href, "chrome-extension://test/popup.html");
  assert.equal(nodes.get("#capture-controls-link").attributes.href, undefined);
  assert.deepEqual(uiActions, [["scroll", "#page-matching", { block: "start", behavior: "smooth" }], ["focus", "#page-matching", { preventScroll: true }],
    ["scroll", "#page-matching", { block: "start", behavior: "smooth" }], ["focus", "#page-matching", { preventScroll: true }]]);
  shell.dispose(); assert.equal(nodes.get("#ui-mode-user").listeners.size, 0);
  assert.equal(nodes.get("#capture-controls-link").listeners.size, 0);
  assert.deepEqual(modes, ["user", "developer", "user"]);
});

test("User layout keeps the Topic first and hides account identity and diagnostics", () => {
  const html = readFileSync(new URL("../browser/chromium/popup.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../browser/chromium/popup.css", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="local-discussion"') < html.indexOf('id="local-insights"'));
  assert.doesNotMatch(css, /#local-insights\s*\{\s*order\s*:/u);
  assert.match(css, /body\[data-ui-mode="user"\]\s+#insight-ai-account\s*\{\s*display:\s*none/u);
  assert.match(css, /body\[data-ui-mode="user"\]\s+#insight-diagnostics\s*\{\s*display:\s*none/u);
});

test("app navigation rehomes controls without calling Create or losing drafts", () => {
  const selectors = ["main", "#ui-mode-user", "#ui-mode-developer", "#connection-status", "#ui-mode-toggle",
    "#capture-controls-link", "#capture-settings-summary", "#page-matching", "#capture-settings", "#popup-preferences",
    "#insight-workspace", "#insight-account-details", "#insight-source-details", "#app-welcome", "#app-navigation",
    "#app-topic-header", "#app-view-discussion", "#app-view-pages", "#app-view-insights", "#app-settings-view",
    "#app-welcome-kicker", "#app-welcome-heading", "#app-welcome-intro", "#app-pages-heading", "#app-settings-heading",
    "#app-settings-kicker", "#app-settings-intro",
    "#app-pages-list", "#app-pages-empty", "#app-pages-context", "#app-start-session", "#app-choose-topic", "#app-settings-button",
    "#app-settings-back", "#app-tab-discussion", "#app-tab-pages", "#app-tab-insights", "#app-settings-connection",
    "#app-welcome-connection", "#app-settings-capture", "#app-settings-display", "#local-discussion",
    "#discussion-connection-settings", "#discussion-status", "#discussion-advanced", "#discussion-related", "#discussion-counts", "#discussion-topic",
    ".topic-eyebrow", "#selected-topic-title", "#selected-topic-provenance", "#discussion-ai-insights",
    "#insight-createInsights", "#insight-body"];
  const elements = new Map();
  for (const selector of selectors) elements.set(selector, {
    children: [], dataset: {}, attributes: {}, listeners: new Map(), hidden: false,
    append(child) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
      this.children.push(child); child.parentElement = this;
    },
    insertBefore(child, sibling) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
      const index = this.children.indexOf(sibling); assert.notEqual(index, -1);
      this.children.splice(index, 0, child); child.parentElement = this;
    },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    getAttribute(key) { return this.attributes[key] ?? null; },
    addEventListener(key, value) { this.listeners.set(key, value); },
    removeEventListener(key) { this.listeners.delete(key); },
    click() { if (!this.disabled) this.listeners.get("click")?.(); },
    focus() {}, scrollIntoView() {}, querySelector() { return { focus() {} }; },
  });
  const get = (selector) => elements.get(selector);
  for (const selector of ["#discussion-connection-settings", "#discussion-status", "#discussion-advanced",
    "#discussion-related", ".topic-eyebrow", "#selected-topic-title", "#selected-topic-provenance", "#discussion-ai-insights", "#discussion-counts"])
    get("#local-discussion").append(get(selector));
  for (const selector of ["#capture-settings", "#popup-preferences"]) get("main").append(get(selector));
  const document = { body: { dataset: {} }, querySelector: get };
  const draft = get("#insight-body"); draft.value = "Private unsent draft";
  let creates = 0; get("#insight-createInsights").addEventListener("click", () => { creates++; });
  const shell = mountPopupShell(document, { messages: {
    uiWelcomeTitle: "Localized welcome", uiPagesSameTopicIntro: "Localized shared pages",
    uiPagesNoTopicIntro: "Localized setup pages", uiStartSession: "Localized session",
    uiSettingsTitle: "Localized settings", uiNavigationLabel: "Localized navigation",
  } });
  assert.equal(get("#app-welcome-heading").textContent, "Localized welcome");
  assert.equal(get("#app-start-session").textContent, "Localized session");
  assert.equal(get("#app-settings-button").textContent, "Localized settings");
  assert.equal(get("#app-navigation").getAttribute("aria-label"), "Localized navigation");
  assert.equal(get("#app-tab-pages").textContent, EN.uiTabPages, "missing translation uses English fallback");
  const disconnected = { phase: "disconnected", catalog: null, draft: { body: "" } };
  shell.render(disconnected);
  assert.equal(get("#app-welcome").hidden, false);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-welcome-connection"));
  assert.equal(get("#discussion-status").parentElement, get("#app-welcome-connection"));
  get("#app-settings-button").click();
  assert.equal(get("#app-settings-view").hidden, false);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-settings-connection"));
  get("#app-settings-back").click();
  const connected = { phase: "ready", catalog: { topics: [{ id: "t", title: "Topic" }], sources: [] }, topicId: "t",
    related: { results: [] } };
  shell.render(connected);
  assert.equal(get("#app-navigation").hidden, false);
  assert.equal(get("#app-pages-context").textContent, "Localized shared pages");
  assert.equal(get("#selected-topic-title").parentElement, get("#app-topic-header"));
  const noTopic = { ...connected, phase: "choose-topic", topicId: null };
  shell.render(noTopic);
  assert.equal(get("#app-pages-context").textContent, "Localized setup pages");
  assert.equal(get("#app-start-session").hidden, false);
  assert.equal(get("#app-choose-topic").hidden, false);
  assert.ok(get("#local-discussion").children.indexOf(get("#app-choose-topic")) <
    get("#local-discussion").children.indexOf(get("#discussion-counts")));
  get("#app-choose-topic").click();
  assert.equal(get("#app-settings-view").hidden, false);
  assert.equal(get("#discussion-advanced").open, true);
  shell.render(connected);
  get("#app-tab-pages").click();
  assert.equal(get("#app-view-pages").hidden, false);
  assert.equal(get("#app-tab-pages").getAttribute("aria-current"), "page");
  get("#app-tab-insights").click();
  assert.equal(creates, 0);
  get("#app-tab-discussion").click();
  get("#discussion-ai-insights").click();
  assert.equal(creates, 1);
  get("#insight-createInsights").disabled = true;
  get("#app-tab-discussion").click(); get("#discussion-ai-insights").click();
  assert.equal(creates, 1);
  assert.equal(draft.value, "Private unsent draft");
  get("#ui-mode-developer").click();
  assert.equal(get("#discussion-connection-settings").parentElement, get("#local-discussion"));
  get("#ui-mode-user").click();
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-settings-connection"));
  shell.render(disconnected);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-welcome-connection"));
  shell.render(connected);
  assert.equal(get("#app-navigation").hidden, false);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-settings-connection"));
  shell.dispose();
});
