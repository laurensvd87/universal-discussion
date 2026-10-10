import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createUiModePreference, UI_MODE_KEY } from "../browser/chromium/ui-mode.js";
import { mountPopupShell, projectDiscussionShell } from "../browser/chromium/popup-shell.js";
import { EN } from "../browser/locales/en.js";
import { TOPIC_VIEW_SESSION_KEY, readTopicViewMode, writeTopicViewMode } from "../browser/core/topic-view-mode.js";

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

test("connection and discussion-loading state rely on current catalog and resolution", () => {
  const catalog = { topics: [{ id: "topic", title: "<script>plain title</script>" }] };
  const ready = { phase: "ready", catalog, topicId: "topic", error: null };
  assert.deepEqual(projectDiscussionShell(ready), { connection: "connected", connectionText: EN.uiConnected, topicState: "ready" });
  assert.equal(projectDiscussionShell({ ...ready, phase: "connecting" }).connection, "connecting");
  assert.equal(projectDiscussionShell({ phase: "disconnected", token: "presence is irrelevant" }).connection, "disconnected");
  const unavailable = projectDiscussionShell({ ...ready, phase: "error", error: "unavailable" });
  const extensionUnavailable = projectDiscussionShell({ ...ready, phase: "error", error: "extension-connection-unavailable" });
  assert.equal(extensionUnavailable.connection, "extension-unavailable");
  assert.equal(extensionUnavailable.connectionText, EN.uiExtensionUnavailable);
  assert.equal(unavailable.connection, "unavailable");
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", resolution: { phase: "processing", enabled: true } }).topicState, "working");
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic" }).topicState, "idle");
  assert.equal(projectDiscussionShell({ ...ready, phase: "disconnected", catalog: null, resolution: { phase: "checking", enabled: false } }).topicState, "idle");
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", resolution: { phase: "checking", enabled: false } }).topicState, "idle");
  assert.equal(projectDiscussionShell({ ...ready, phase: "error", error: "unavailable", resolution: { phase: "processing", enabled: true } }).topicState, "idle");
  assert.equal(projectDiscussionShell({ ...ready, phase: "disconnected", error: "unauthorized" }).topicState, "idle");
  assert.equal(projectDiscussionShell({ ...ready, phase: "choose-topic", resolution: { phase: "error", reason: "unavailable" } }).connection, "unverified");
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
  assert.equal(document.body.dataset.topicState, "idle");
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

test("Topic matching defaults after restart, while Legacy E5 lasts through popup and worker wake", async () => {
  const nodes = new Map();
  for (const id of ["#ui-mode-user", "#ui-mode-developer", "#ui-mode-toggle", "#connection-status",
    "#capture-controls-link", "#app-topic-view-heading", "#app-topic-view-classic",
    "#app-topic-view-experimental", "#app-topic-view-status"]) nodes.set(id, {
    attributes: {}, dataset: {}, listeners: new Map(),
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners.set(key, callback); },
    removeEventListener(key) { this.listeners.delete(key); },
  });
  let resolveSaved;
  const writes = [], modes = [];
  const saved = {};
  const storageLocal = { get: async () => ({ topicViewMode: "classic" }), set: async () => {} };
  const storageSession = { get: () => new Promise((resolve) => { resolveSaved = resolve; }),
    set: async (record) => { writes.push(record); Object.assign(saved, record); } };
  const document = { body: { dataset: {} }, querySelector: (selector) => nodes.get(selector) };
  const shell = mountPopupShell(document, { storageLocal, storageSession });
  shell.bindTopicView({ setTopicViewMode: async (mode) => { modes.push(mode); return true; } });
  shell.render({ phase: "ready", topicViewMode: "experimental", sourceId: "source-a",
    catalog: { topics: [] }, alternateDiscussion: null });
  nodes.get("#app-topic-view-classic").listeners.get("click")();
  resolveSaved({});
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(modes, ["classic"]);
  assert.deepEqual(writes, [{ [TOPIC_VIEW_SESSION_KEY]: "classic" }]);
  assert.equal(nodes.get("#app-topic-view-classic").attributes["aria-pressed"], "true");
  assert.equal(await readTopicViewMode({ get: async () => saved }), "classic");
  shell.render({ phase: "ready", topicViewMode: "experimental", sourceId: "source-a",
    catalog: { topics: [] }, alternateDiscussion: { sourceId: "source-a", sourceIds: ["source-a", "source-b"] } });
  assert.equal(nodes.get("#app-topic-view-status").textContent,
    EN.uiTopicViewActive.replace("{count}", "2"));
  shell.dispose();
  const restored = mountPopupShell(document, { storageLocal,
    storageSession: { get: async () => saved, set: async () => {} } });
  const restoredModes = [];
  restored.bindTopicView({ setTopicViewMode: async (mode) => { restoredModes.push(mode); return true; } });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(restoredModes, ["classic"]);
  restored.dispose();
  assert.equal(await readTopicViewMode({ get: async () => ({}) }), "experimental");
  assert.equal(await readTopicViewMode({ get: async () => ({ topicViewMode: "classic" }) }), "experimental");
  assert.equal(await readTopicViewMode({ get: async () => { throw Error("unavailable"); } }), "experimental");
  assert.equal(await writeTopicViewMode({ set: async (value) => writes.push(value) }, "forged"), false);
});

test("User layout removes the page-title Topic header and hides account identity and diagnostics", () => {
  const html = readFileSync(new URL("../browser/chromium/popup.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../browser/chromium/popup.css", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../browser/chromium/discussion-panel.js", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="local-discussion"') < html.indexOf('id="local-insights"'));
  assert.doesNotMatch(html, /id="app-topic-header"/u);
  assert.doesNotMatch(panel, /id = "selected-topic-title"/u);
  assert.doesNotMatch(html, /id="app-(?:start-session|choose-topic)"/u);
  assert.match(panel, /manualTopicControls\.className = "developer-only"/u);
  assert.match(panel, /label\(topic, "discussionTopic", "discussion-topic", manualTopicControls\)/u);
  assert.match(panel, /label\(source, "discussionSource", "discussion-source", manualTopicControls\)/u);
  assert.match(panel, /manualTopicControls\.append\(createForm\)/u);
  assert.match(panel, /correctionControls\.className = "developer-only"/u);
  assert.doesNotMatch(html, /id="app-tab-insights"/u);
  assert.match(html, /id="app-settings-insights"/u);
  assert.doesNotMatch(css, /#local-insights\s*\{\s*order\s*:/u);
  assert.match(css, /body\[data-ui-mode="user"\]\s+#insight-ai-account\s*\{\s*display:\s*none/u);
  assert.match(css, /body\[data-ui-mode="user"\]\s+#insight-diagnostics\s*\{\s*display:\s*none/u);
});

test("app navigation rehomes controls without calling Create or losing drafts", () => {
  const selectors = ["main", "#ui-mode-user", "#ui-mode-developer", "#connection-status", "#ui-mode-toggle",
    "#capture-controls-link", "#capture-settings-summary", "#page-matching", "#capture-settings", "#popup-preferences",
    "#insight-workspace", "#insight-account-details", "#insight-source-details", "#insight-ai-status",
    "#insight-related-settings", "#insight-model", "#insight-model-status", "#insight-plan-usage",
    'label[for="insight-model"]', "#insight-quick-actions", "#local-insights", "#app-discussion-insights-host",
    "#app-settings-insights", "#app-settings-insights-heading", "#discussion-composer", "#app-welcome", "#app-navigation",
    "#app-view-discussion", "#app-view-pages", "#app-view-insights", "#app-settings-view",
    "#app-welcome-kicker", "#app-welcome-heading", "#app-welcome-intro", "#app-pages-heading", "#app-settings-heading",
    "#app-settings-kicker", "#app-settings-intro",
    "#app-pages-list", "#app-pages-empty", "#app-pages-context", "#app-settings-button",
    "#app-settings-back", "#app-tab-discussion", "#app-tab-pages", "#app-settings-connection",
    "#app-welcome-connection", "#app-settings-capture", "#app-settings-display", "#local-discussion",
    "#discussion-connection-settings", "#discussion-status", "#discussion-advanced", "#discussion-related", "#discussion-counts", "#discussion-topic",
    "#discussion-ai-insights",
    "#insight-createInsights", "#insight-body", "#discussion-model-host",
    "#app-source-context", "#app-source-title", "#app-source-domain"];
  const elements = new Map();
  for (const selector of selectors) elements.set(selector, {
    children: [], dataset: {}, attributes: {}, listeners: new Map(), hidden: false,
    get nextSibling() { const siblings = this.parentElement?.children ?? []; return siblings[siblings.indexOf(this) + 1] ?? null; },
    append(...children) {
      for (const child of children) {
        if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
        this.children.push(child); child.parentElement = this;
      }
    },
    insertBefore(child, sibling) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
      const index = sibling === null ? this.children.length : this.children.indexOf(sibling); assert.notEqual(index, -1);
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
    "#discussion-related", "#discussion-ai-insights", "#discussion-counts", "#discussion-composer", "#app-discussion-insights-host"])
    get("#local-discussion").append(get(selector));
  for (const selector of ["#capture-settings", "#popup-preferences"]) get("main").append(get(selector));
  get("#app-view-insights").append(get("#local-insights"));
  get("#local-insights").append(get("#insight-workspace"), get("#insight-related-settings"));
  get("#discussion-composer").append(get("#discussion-model-host"));
  get("#insight-workspace").append(get("#insight-quick-actions"), get("#insight-account-details"),
    get("#insight-ai-status"), get("#insight-source-details"));
  get("#insight-quick-actions").append(get('label[for="insight-model"]'), get("#insight-model"),
    get("#insight-model-status"), get("#insight-createInsights"), get("#insight-plan-usage"));
  const document = { body: { dataset: {} }, querySelector: get };
  const draft = get("#insight-body"); draft.value = "Private unsent draft";
  let creates = 0; get("#insight-createInsights").addEventListener("click", () => { creates++; });
  const shell = mountPopupShell(document, { messages: {
    uiWelcomeTitle: "Localized welcome", uiPagesSameTopicIntro: "Localized shared pages",
    uiPagesNoTopicIntro: "Localized setup pages",
    uiSettingsTitle: "Localized settings", uiNavigationLabel: "Localized navigation",
  } });
  assert.equal(get("#app-welcome-heading").textContent, "Localized welcome");
  assert.equal(get("#app-settings-button").textContent, "Localized settings");
  assert.equal(get("#app-navigation").getAttribute("aria-label"), "Localized navigation");
  assert.equal(get("#app-tab-pages").textContent, EN.uiTabPages, "missing translation uses English fallback");
  assert.equal(get("#app-settings-insights-heading").textContent, "Insight settings");
  let modelChanges = 0;
  get("#insight-model").addEventListener("change", () => { modelChanges++; });
  const disconnected = { phase: "disconnected", catalog: null, draft: { body: "" } };
  shell.render(disconnected);
  assert.equal(get("#app-welcome").hidden, false);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-welcome-connection"));
  assert.equal(get("#discussion-status").parentElement, get("#app-welcome-connection"));
  get("#app-settings-button").click();
  assert.equal(get("#app-settings-view").hidden, false);
  assert.equal(get("#app-source-context").hidden, true);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-settings-connection"));
  get("#app-settings-back").click();
  const connected = { phase: "ready", catalog: { topics: [{ id: "t", title: "Topic" }],
    sources: [{ id: "s", title: "Actual page title", url: "https://example.org/story" }] }, topicId: "t", sourceId: "s",
    related: { results: [] } };
  shell.render(connected);
  assert.equal(document.body.dataset.topicState, "ready");
  assert.equal(get("#app-source-context").hidden, false);
  assert.equal(get("#app-source-title").textContent, "Actual page title");
  assert.equal(get("#app-source-domain").textContent, "example.org");
  get("#app-settings-button").click();
  assert.equal(get("#app-source-context").hidden, true);
  get("#app-settings-back").click();
  assert.equal(get("#app-source-context").hidden, false);
  assert.equal(get("#app-navigation").hidden, true);
  assert.equal(get("#local-insights").parentElement, get("#app-discussion-insights-host"));
  assert.equal(get("#discussion-composer").nextSibling, get("#app-discussion-insights-host"));
  assert.equal(get("#insight-model").parentElement, get("#discussion-model-host"));
  assert.equal(get("#insight-account-details").parentElement, get("#app-settings-insights"));
  get("#insight-model").listeners.get("change")();
  assert.equal(modelChanges, 1, "reparenting keeps the original model control and handler");
  assert.equal(get("#app-pages-context").textContent, "Localized shared pages");
  const noTopic = { ...connected, phase: "choose-topic", topicId: null };
  shell.render(noTopic);
  assert.equal(document.body.dataset.topicState, "idle");
  assert.equal(get("#app-pages-context").textContent, "Localized setup pages");
  assert.equal(get("#app-settings-view").hidden, true);
  shell.render({ ...noTopic, resolution: { phase: "processing", enabled: true } });
  assert.equal(document.body.dataset.topicState, "working");
  shell.render(connected);
  get("#app-tab-pages").click();
  assert.equal(get("#app-view-pages").hidden, true);
  assert.equal(get("#app-view-discussion").hidden, false);
  get("#app-tab-discussion").click();
  get("#discussion-ai-insights").click();
  assert.equal(creates, 0, "the discussion owns the generate action");
  get("#insight-createInsights").disabled = true;
  get("#app-tab-discussion").click(); get("#discussion-ai-insights").click();
  assert.equal(creates, 0);
  assert.equal(draft.value, "Private unsent draft");
  get("#ui-mode-developer").click();
  assert.equal(get("#discussion-connection-settings").parentElement, get("#local-discussion"));
  assert.equal(get("#local-insights").parentElement, get("#app-view-insights"));
  assert.equal(get("#insight-model").parentElement, get("#insight-quick-actions"));
  assert.equal(get("#insight-account-details").parentElement, get("#insight-workspace"));
  assert.ok(get("#insight-quick-actions").children.indexOf(get("#insight-model")) <
    get("#insight-quick-actions").children.indexOf(get("#insight-createInsights")));
  get("#ui-mode-user").click();
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-settings-connection"));
  assert.equal(get("#insight-model").parentElement, get("#discussion-model-host"));
  shell.render(disconnected);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-welcome-connection"));
  shell.render(connected);
  assert.equal(get("#app-navigation").hidden, true);
  assert.equal(get("#discussion-connection-settings").parentElement, get("#app-settings-connection"));
  shell.dispose();
});
