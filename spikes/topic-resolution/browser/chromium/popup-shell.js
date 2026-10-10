import { EN } from "../locales/en.js";
import { createUiModePreference } from "./ui-mode.js";
import { readTopicViewMode, writeTopicViewMode } from "../core/topic-view-mode.js";

export function projectDiscussionShell(state, messages = EN) {
  const text = (key) => messages?.[key] ?? EN[key];
  let connection = "disconnected";
  if (state.phase === "connecting") connection = "connecting";
  else if (state.error === "unauthorized" || state.phase === "disconnected") connection = "disconnected";
  else if (state.phase === "error" && state.error === "extension-connection-unavailable") connection = "extension-unavailable";
  else if (state.phase === "error" && !["conflict", "capacity", "invalid-request", "context-changed"].includes(state.error)) connection = "unavailable";
  else if (state.catalog && ["ready", "choose-topic", "loading", "error"].includes(state.phase)) connection = "connected";
  if (connection === "connected" && state.resolution?.phase === "error" && state.resolution.reason === "unavailable") connection = "unverified";
  const selected = ["ready", "loading"].includes(state.phase) && !state.error
    ? state.catalog?.topics.find((topic) => topic.id === state.topicId) : null;
  const processing = state.resolution?.enabled === true && ["checking", "processing"].includes(state.resolution?.phase);
  return Object.freeze({ connection,
    connectionText: text({ connected: "uiConnected", connecting: "uiConnecting", disconnected: "uiDisconnected", unavailable: "uiServiceUnavailable", "extension-unavailable": "uiExtensionUnavailable", unverified: "uiConnectionUnverified" }[connection]),
    topicState: selected ? "ready" : !["disconnected", "unavailable", "extension-unavailable"].includes(connection) && processing ? "working" : "idle",
  });
}

export function mountPopupShell(document, { storageLocal, storageSession, onModeChange = () => {}, messages = EN } = {}) {
  const find = (selector) => document.querySelector(selector);
  const text = (key) => messages?.[key] ?? EN[key];
  const shellCopy = [
    ["#app-settings-button", "uiSettingsTitle"],
    ["#app-welcome-kicker", "uiWelcomeKicker"], ["#app-welcome-heading", "uiWelcomeTitle"],
    ["#app-welcome-intro", "uiWelcomeIntro"],
    ["#app-tab-discussion", "uiTabDiscussion"], ["#app-tab-pages", "uiTabPages"],
    ["#app-pages-heading", "uiTabPages"],
    ["#app-pages-empty", "uiPagesEmpty"], ["#app-settings-back", "uiSettingsBack"],
    ["#app-settings-kicker", "uiSettingsKicker"], ["#app-settings-heading", "uiSettingsTitle"],
    ["#app-settings-intro", "uiSettingsIntro"],
  ];
  for (const [selector, key] of shellCopy) {
    const element = find(selector);
    if (element) element.textContent = text(key);
  }
  find("#app-settings-button")?.setAttribute("aria-label", text("uiSettingsTitle"));
  const insightSettingsHeading = find("#app-settings-insights-heading");
  if (insightSettingsHeading) insightSettingsHeading.textContent = messages?.uiInsightSettings ?? EN.uiInsightSettings ?? "Insight settings";
  const topicClassic = find("#app-topic-view-classic");
  const topicExperimental = find("#app-topic-view-experimental");
  const topicStatus = find("#app-topic-view-status");
  if (find("#app-topic-view-heading")) find("#app-topic-view-heading").textContent = text("uiTopicViewHeading");
  if (topicClassic) topicClassic.textContent = text("uiTopicViewClassic");
  if (topicExperimental) topicExperimental.textContent = text("uiTopicViewExperimental");
  find("#app-navigation")?.setAttribute("aria-label", text("uiNavigationLabel"));
  find("#app-view-discussion")?.setAttribute("aria-label", text("uiDiscussionViewLabel"));
  find("#app-view-insights")?.setAttribute("aria-label", text("uiInsightsViewLabel"));
  const app = {
    welcome: find("#app-welcome"), nav: find("#app-navigation"),
    discussion: find("#app-view-discussion"), pages: find("#app-view-pages"),
    insights: find("#app-view-insights"), settings: find("#app-settings-view"),
    pageList: find("#app-pages-list"), pageEmpty: find("#app-pages-empty"),
    pageContext: find("#app-pages-context"),
  };
  let activeView = "discussion";
  let lastState;
  let topicController;
  let topicChoiceRevision = 0;
  let requestedTopicMode = "experimental";
  let topicWrites = Promise.resolve();
  const appListeners = [];
  const on = (element, event, handler) => {
    if (!element) return;
    element.addEventListener(event, handler);
    appListeners.push([element, event, handler]);
  };
  const move = (selector, destination) => {
    const element = find(selector);
    if (element && destination && element.parentElement !== destination) destination.append(element);
  };
  const insightSettingsSelectors = ["#insight-account-details", "#insight-ai-status",
    'label[for="insight-model"]', "#insight-model", "#insight-model-status", "#insight-plan-usage",
    "#insight-source-details", "#insight-related-settings"];
  const insightSettingsNodes = insightSettingsSelectors.map((selector) => find(selector)).filter(Boolean);
  const originalInsightPlaces = new Map(insightSettingsNodes.map((element) =>
    [element, { parent: element.parentElement, next: element.nextSibling }]));
  const composerModelNodes = new Set(['label[for="insight-model"]', "#insight-model", "#insight-model-status"]
    .map((selector) => find(selector)).filter(Boolean));
  function placeInsightWorkspace(mode) {
    const host = find("#app-discussion-insights-host");
    const composer = find("#discussion-composer");
    const discussion = find("#local-discussion");
    if (host && composer?.parentElement === discussion && host.parentElement === discussion &&
        composer.nextSibling !== host) discussion.insertBefore(host, composer.nextSibling);
    move("#local-insights", mode === "user" ? host : app.insights);
    const settingsHost = find("#app-settings-insights");
    if (mode === "user") {
      const modelHost = find("#discussion-model-host") ?? settingsHost;
      for (const element of insightSettingsNodes) {
        const destination = composerModelNodes.has(element) ? modelHost : settingsHost;
        if (destination && element.parentElement !== destination) destination.append(element);
      }
    } else {
      for (const element of [...insightSettingsNodes].reverse()) {
        const place = originalInsightPlaces.get(element);
        if (!place?.parent || element.parentElement === place.parent) continue;
        place.parent.insertBefore(element, place.next?.parentElement === place.parent ? place.next : null);
      }
    }
  }
  function showView(view) {
    if (!app.nav || !["discussion", "pages", "settings"].includes(view)) return;
    if (view === "pages") view = "discussion";
    activeView = view;
    if (document.body.dataset.uiMode !== "user") return;
    const sourceContext = find("#app-source-context");
    if (sourceContext) sourceContext.hidden = view === "settings" || sourceContext.dataset.hasSource !== "true";
    const connected = Boolean(lastState?.catalog);
    move("#discussion-connection-settings", connected || view === "settings"
      ? find("#app-settings-connection") : find("#app-welcome-connection"));
    move("#discussion-status", connected || view === "settings"
      ? find("#local-discussion") : find("#app-welcome-connection"));
    if (view === "pages") {
      const related = find("#discussion-related");
      if (related) related.open = true;
    }
    app.welcome.hidden = connected || view === "settings";
    app.nav.hidden = true;
    for (const name of ["discussion", "pages", "settings"]) {
      app[name].hidden = (name !== "settings" && !connected) || name !== view;
    }
    app.insights.hidden = true;
    for (const name of ["discussion", "pages"]) {
      const tab = find(`#app-tab-${name}`);
      if (!tab) continue;
      if (name === view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    find("#app-settings-button")?.setAttribute("aria-expanded", String(view === "settings"));
  }
  const navigate = (view) => { showView(view); document.defaultView?.scrollTo?.(0, 0); };
  on(find("#app-tab-discussion"), "click", () => navigate("discussion"));
  on(find("#app-tab-pages"), "click", () => navigate("pages"));
  on(find("#app-settings-button"), "click", () => {
    navigate("settings"); find("#app-settings-heading")?.focus?.({ preventScroll: true });
  });
  on(find("#app-settings-back"), "click", () => {
    navigate("discussion");
    const composer = find("#discussion-body");
    (composer && !composer.hidden ? composer : find("#app-settings-button"))?.focus?.({ preventScroll: true });
  });
  function renderTopicView(state) {
    const mode = state?.topicViewMode ?? requestedTopicMode;
    topicClassic?.setAttribute("aria-pressed", String(mode === "classic"));
    topicExperimental?.setAttribute("aria-pressed", String(mode === "experimental"));
    if (!topicStatus) return;
    const active = mode === "experimental" && state?.alternateDiscussion?.sourceId === state?.sourceId &&
      state?.phase === "ready" && !state?.needsFreshRead;
    topicStatus.dataset.state = mode === "classic" ? "current" : active ? "active"
      : state?.alternateError || state?.phase !== "ready" ? "unavailable" : "loading";
    topicStatus.textContent = text({ current: "uiTopicViewCurrent", active: "uiTopicViewActive",
      unavailable: "uiTopicViewUnavailable", loading: "uiTopicViewLoading" }[topicStatus.dataset.state])
      .replace("{count}", String(state?.alternateDiscussion?.sourceIds?.length ?? 0));
  }
  function chooseTopicMode(mode) {
    if (mode !== "classic" && mode !== "experimental") return;
    topicChoiceRevision += 1;
    requestedTopicMode = mode;
    renderTopicView({ ...lastState, topicViewMode: mode, alternateDiscussion: null, alternateError: null });
    topicWrites = topicWrites.then(() => writeTopicViewMode(storageSession, mode)).catch(() => {});
    void topicController?.setTopicViewMode(mode);
  }
  on(topicClassic, "click", () => chooseTopicMode("classic"));
  on(topicExperimental, "click", () => chooseTopicMode("experimental"));
  const user = document.querySelector("#ui-mode-user");
  const developer = document.querySelector("#ui-mode-developer");
  const connection = document.querySelector("#connection-status");
  connection.setAttribute("title", text("uiConnectionLastChecked"));
  document.querySelector("#ui-mode-toggle").setAttribute("aria-label", text("uiModeLabel"));
  const captureControls = document.querySelector("#capture-controls-link");
  captureControls.textContent = text("uiCaptureLink");
  const captureSummary = document.querySelector("#capture-settings-summary");
  if (captureSummary) captureSummary.textContent = text("uiCaptureSettings");
  const showCaptureControls = () => {
    navigate("settings");
    const settings = document.querySelector("#capture-settings");
    if (settings) settings.open = true;
    const panel = document.querySelector("#page-matching");
    panel.scrollIntoView({ block: "start", behavior: "smooth" });
    panel.focus({ preventScroll: true });
  };
  captureControls.addEventListener("click", showCaptureControls);
  user.textContent = text("uiUser"); developer.textContent = text("uiDeveloper");
  const preference = createUiModePreference({ storageLocal, onChange(mode) {
    document.body.dataset.uiMode = mode;
    if (app.nav) {
      if (mode === "developer") {
        placeInsightWorkspace(mode);
        app.welcome.hidden = app.nav.hidden = app.pages.hidden = app.settings.hidden = true;
        app.discussion.hidden = app.insights.hidden = false;
        move("#discussion-connection-settings", find("#local-discussion"));
        move("#discussion-advanced", find("#local-discussion"));
        move("#discussion-related", find("#local-discussion"));
        move("#discussion-status", find("#local-discussion"));
        move("#capture-settings", find("main"));
        move("#popup-preferences", find("main"));
      } else {
        if (activeView === "insights") activeView = "discussion";
        placeInsightWorkspace(mode);
        if (lastState) render(lastState);
        showView(activeView);
      }
    }
    const settings = document.querySelector("#capture-settings");
    if (settings) settings.open = mode === "developer";
    const workspace = document.querySelector("#insight-workspace");
    if (workspace) workspace.open = true;
    const accountDetails = document.querySelector("#insight-account-details");
    if (accountDetails) accountDetails.open = mode === "developer" || accountDetails.getAttribute?.("data-ready") !== "true";
    const sourceDetails = document.querySelector("#insight-source-details");
    if (sourceDetails) sourceDetails.open = mode === "developer";
    const matchingHow = document.querySelector("#matching-how");
    if (matchingHow) matchingHow.open = mode === "developer";
    user.setAttribute("aria-pressed", String(mode === "user"));
    developer.setAttribute("aria-pressed", String(mode === "developer"));
    onModeChange(mode);
  } });
  const chooseUser = () => preference.select("user");
  const chooseDeveloper = () => preference.select("developer");
  user.addEventListener("click", chooseUser); developer.addEventListener("click", chooseDeveloper);
  void preference.load();
  function render(state) {
    lastState = state;
    renderTopicView(state);
    const sourceContext = find("#app-source-context");
    if (sourceContext) {
      const source = state?.catalog?.sources?.find((entry) => entry.id === state.sourceId) ?? state?.source;
      const title = typeof source?.title === "string" ? source.title.trim() : "";
      let domain = "";
      try { domain = new URL(source?.url).hostname; } catch { /* The source has no displayable URL. */ }
      sourceContext.dataset.hasSource = String(Boolean(title || domain));
      sourceContext.hidden = activeView === "settings" || !title && !domain;
      if (find("#app-source-title")) find("#app-source-title").textContent = title || domain;
      if (find("#app-source-domain")) find("#app-source-domain").textContent = title ? domain : "";
    }
    const view = projectDiscussionShell(state, messages);
    connection.dataset.state = view.connection; connection.textContent = view.connectionText;
    document.body.dataset.topicState = view.topicState;
    if (app.nav && document.body.dataset.uiMode === "user") {
      placeInsightWorkspace("user");
      const connected = Boolean(state.catalog);
      move("#discussion-advanced", find("#app-settings-connection"));
      move("#discussion-related", app.pageList);
      move("#capture-settings", find("#app-settings-capture"));
      move("#popup-preferences", find("#app-settings-display"));
      const suggestions = state.related?.results ?? [];
      app.pageEmpty.hidden = suggestions.length > 0;
      app.pageContext.textContent = text(state.phase === "ready" ? "uiPagesSameTopicIntro" : "uiPagesNoTopicIntro");
      showView(activeView);
    }
  }
  return Object.freeze({ render, bindTopicView(controller) {
    topicController = controller;
    const revision = topicChoiceRevision;
    void (async () => {
      const saved = await readTopicViewMode(storageSession);
      if (revision !== topicChoiceRevision || !topicController) return;
      requestedTopicMode = saved;
      await topicController.setTopicViewMode(saved);
    })();
  }, dispose() {
    topicController = null;
    preference.dispose(); user.removeEventListener("click", chooseUser); developer.removeEventListener("click", chooseDeveloper);
    captureControls.removeEventListener("click", showCaptureControls);
    for (const [element, event, handler] of appListeners) element.removeEventListener(event, handler);
  } });
}
