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

export function mountPopupShell(document, { storageLocal, onModeChange = () => {} } = {}) {
  const user = document.querySelector("#ui-mode-user");
  const developer = document.querySelector("#ui-mode-developer");
  const connection = document.querySelector("#connection-status");
  connection.setAttribute("title", EN.uiConnectionLastChecked);
  document.querySelector("#ui-mode-toggle").setAttribute("aria-label", EN.uiModeLabel);
  const captureControls = document.querySelector("#capture-controls-link");
  captureControls.textContent = EN.uiCaptureLink;
  const captureSummary = document.querySelector("#capture-settings-summary");
  if (captureSummary) captureSummary.textContent = EN.uiCaptureSettings;
  const showCaptureControls = () => {
    const settings = document.querySelector("#capture-settings");
    if (settings) settings.open = true;
    const panel = document.querySelector("#page-matching");
    panel.scrollIntoView({ block: "start", behavior: "smooth" });
    panel.focus({ preventScroll: true });
  };
  captureControls.addEventListener("click", showCaptureControls);
  user.textContent = EN.uiUser; developer.textContent = EN.uiDeveloper;
  const preference = createUiModePreference({ storageLocal, onChange(mode) {
    document.body.dataset.uiMode = mode;
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
    const view = projectDiscussionShell(state);
    connection.dataset.state = view.connection; connection.textContent = view.connectionText;
  }
  return Object.freeze({ render, dispose() {
    preference.dispose(); user.removeEventListener("click", chooseUser); developer.removeEventListener("click", chooseDeveloper);
    captureControls.removeEventListener("click", showCaptureControls);
  } });
}
