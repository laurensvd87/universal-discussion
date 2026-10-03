import { EN } from "../locales/en.js";
import { createUiModePreference } from "./ui-mode.js";

export function projectDiscussionShell(state, messages = EN) {
  const text = (key) => messages?.[key] ?? EN[key];
  let connection = "disconnected";
  if (state.phase === "connecting") connection = "connecting";
  else if (state.error === "unauthorized" || state.phase === "disconnected") connection = "disconnected";
  else if (state.phase === "error" && !["conflict", "capacity", "invalid-request", "context-changed"].includes(state.error)) connection = "unavailable";
  else if (state.catalog && ["ready", "choose-topic", "loading", "error"].includes(state.phase)) connection = "connected";
  if (connection === "connected" && state.resolution?.phase === "error" && state.resolution.reason === "unavailable") connection = "unverified";
  const selected = ["ready", "loading"].includes(state.phase) && !state.error
    ? state.catalog?.topics.find((topic) => topic.id === state.topicId) : null;
  const processing = state.resolution?.enabled === true && ["checking", "processing"].includes(state.resolution?.phase);
  const source = state.catalog?.sources?.find((item) => item.id === state.sourceId);
  const selectionCue = !selected ? "" : text(state.selection === "manual" ? "uiTopicManual"
    : source?.provenance === "owner-local-page-embedding/v1"
      ? state.resolution?.assignment === "confirmed" ? "uiTopicConfirmed" : "uiTopicProvisional"
      : "uiTopicFixture");
  return Object.freeze({ connection,
    connectionText: text({ connected: "uiConnected", connecting: "uiConnecting", disconnected: "uiDisconnected", unavailable: "uiServiceUnavailable", unverified: "uiConnectionUnverified" }[connection]),
    topicTitle: selected?.title ?? text(connection === "disconnected" ? "uiTopicDisconnected" : connection === "unavailable" ? "uiTopicUnavailable" : processing ? "uiTopicProcessing" : "uiTopicEmpty"),
    selectionCue,
  });
}

export function mountPopupShell(document, { storageLocal, onModeChange = () => {}, messages = EN } = {}) {
  const find = (selector) => document.querySelector(selector);
  const text = (key) => messages?.[key] ?? EN[key];
  const shellCopy = [
    ["#app-settings-button", "uiSettingsTitle"],
    ["#app-welcome-kicker", "uiWelcomeKicker"], ["#app-welcome-heading", "uiWelcomeTitle"],
    ["#app-welcome-intro", "uiWelcomeIntro"],
    ["#app-tab-discussion", "uiTabDiscussion"], ["#app-tab-pages", "uiTabPages"],
    ["#app-tab-insights", "uiTabInsights"], ["#app-pages-heading", "uiTabPages"],
    ["#app-pages-empty", "uiPagesEmpty"], ["#app-settings-back", "uiSettingsBack"],
    ["#app-settings-kicker", "uiSettingsKicker"], ["#app-settings-heading", "uiSettingsTitle"],
    ["#app-settings-intro", "uiSettingsIntro"], ["#app-start-session", "uiStartSession"],
    ["#app-choose-topic", "uiChooseTopicAction"],
  ];
  for (const [selector, key] of shellCopy) {
    const element = find(selector);
    if (element) element.textContent = text(key);
  }
  find("#app-navigation")?.setAttribute("aria-label", text("uiNavigationLabel"));
  find("#app-view-discussion")?.setAttribute("aria-label", text("uiDiscussionViewLabel"));
  find("#app-view-insights")?.setAttribute("aria-label", text("uiInsightsViewLabel"));
  const app = {
    welcome: find("#app-welcome"), nav: find("#app-navigation"), topicHeader: find("#app-topic-header"),
    discussion: find("#app-view-discussion"), pages: find("#app-view-pages"),
    insights: find("#app-view-insights"), settings: find("#app-settings-view"),
    pageList: find("#app-pages-list"), pageEmpty: find("#app-pages-empty"),
    pageContext: find("#app-pages-context"),
    startSession: find("#app-start-session"), chooseTopic: find("#app-choose-topic"),
  };
  let activeView = "discussion";
  let lastState;
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
  function showView(view) {
    if (!app.nav || !["discussion", "pages", "insights", "settings"].includes(view)) return;
    activeView = view;
    if (document.body.dataset.uiMode !== "user") return;
    const connected = Boolean(lastState?.catalog);
    move("#discussion-connection-settings", connected || view === "settings"
      ? find("#app-settings-connection") : find("#app-welcome-connection"));
    move("#discussion-status", connected || view === "settings"
      ? find("#local-discussion") : find("#app-welcome-connection"));
    if (view === "pages") {
      const related = find("#discussion-related");
      if (related) related.open = true;
    }
    if (view === "insights") {
      const workspace = find("#insight-workspace");
      if (workspace) workspace.open = true;
    }
    app.welcome.hidden = connected || view === "settings";
    app.nav.hidden = !connected;
    app.topicHeader.hidden = !connected || view === "settings";
    for (const name of ["discussion", "pages", "insights", "settings"]) {
      app[name].hidden = (name !== "settings" && !connected) || name !== view;
    }
    for (const name of ["discussion", "pages", "insights"]) {
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
  on(find("#app-tab-insights"), "click", () => navigate("insights"));
  on(find("#app-settings-button"), "click", () => {
    navigate("settings"); find("#app-settings-heading")?.focus?.({ preventScroll: true });
  });
  on(find("#app-settings-back"), "click", () => {
    navigate("discussion"); find("#app-tab-discussion")?.focus?.({ preventScroll: true });
  });
  on(find("#discussion-ai-insights"), "click", () => {
    navigate("insights");
    find("#insight-user-heading")?.focus?.({ preventScroll: true });
    const create = find("#insight-createInsights");
    if (create && !create.disabled && document.body.dataset.uiMode === "user") create.click();
  });
  on(app.startSession, "click", () => {
    navigate("settings");
    const settings = find("#capture-settings");
    if (settings) settings.open = true;
    find("#capture-settings-summary")?.focus?.({ preventScroll: true });
  });
  on(app.chooseTopic, "click", () => {
    navigate("settings");
    const advanced = find("#discussion-advanced");
    if (advanced) advanced.open = true;
    const topic = find("#discussion-topic");
    topic?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    topic?.focus?.({ preventScroll: true });
  });
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
        app.welcome.hidden = app.nav.hidden = app.topicHeader.hidden = app.pages.hidden = app.settings.hidden = true;
        app.discussion.hidden = app.insights.hidden = false;
        for (const selector of [".topic-eyebrow", "#selected-topic-title", "#selected-topic-provenance"]) move(selector, find("#local-discussion"));
        move("#discussion-connection-settings", find("#local-discussion"));
        move("#discussion-advanced", find("#local-discussion"));
        move("#discussion-related", find("#local-discussion"));
        move("#discussion-status", find("#local-discussion"));
        move("#capture-settings", find("main"));
        move("#popup-preferences", find("main"));
      } else {
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
    const view = projectDiscussionShell(state, messages);
    connection.dataset.state = view.connection; connection.textContent = view.connectionText;
    if (app.nav && document.body.dataset.uiMode === "user") {
      const connected = Boolean(state.catalog);
      for (const selector of [".topic-eyebrow", "#selected-topic-title", "#selected-topic-provenance"]) move(selector, app.topicHeader);
      move("#discussion-advanced", find("#app-settings-connection"));
      move("#discussion-related", app.pageList);
      move("#capture-settings", find("#app-settings-capture"));
      move("#popup-preferences", find("#app-settings-display"));
      const suggestions = state.related?.results ?? [];
      app.pageEmpty.hidden = suggestions.length > 0;
      app.pageContext.textContent = text(state.phase === "ready" ? "uiPagesSameTopicIntro" : "uiPagesNoTopicIntro");
      app.startSession.hidden = !connected || state.phase === "ready";
      app.chooseTopic.hidden = !connected || state.phase === "ready";
      const discussion = find("#local-discussion");
      const counts = find("#discussion-counts");
      if (discussion && counts && app.startSession && app.chooseTopic) {
        const children = [...discussion.children];
        const index = children.indexOf(app.startSession);
        if (children[index + 1] !== app.chooseTopic || children[index + 2] !== counts) {
          discussion.insertBefore(app.startSession, counts);
          discussion.insertBefore(app.chooseTopic, counts);
        }
      }
      showView(activeView);
    }
  }
  return Object.freeze({ render, dispose() {
    preference.dispose(); user.removeEventListener("click", chooseUser); developer.removeEventListener("click", chooseDeveloper);
    captureControls.removeEventListener("click", showCaptureControls);
    for (const [element, event, handler] of appListeners) element.removeEventListener(event, handler);
  } });
}
