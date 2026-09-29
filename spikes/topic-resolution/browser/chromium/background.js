import { createLocalServiceClient } from "../core/local-service-client.js";
import { createLocalServiceSession } from "../core/local-service-session.js";
import { createBackgroundMatcher } from "../core/background-matcher.js";
import { inspectPageUrl } from "../core/page-content-policy.js";
import { createPageContentReader } from "./page-content-reader.js";
import { createInferenceHost } from "./inference-host.js";
import { createPopupFocusWitness } from "./popup-focus.js";
import { createCaptureSession, HTTPS_ACCESS } from "../core/capture-session.js";
import { createTopicToolbarController, TOOLBAR_TAB_KEY } from "../core/topic-toolbar-controller.js";
import { createTopicToolbarPainter } from "./topic-toolbar-icon.js";

const api = globalThis.chrome;
const session = createLocalServiceSession({ storageSession: api.storage.session });
const client = createLocalServiceClient({ fetchImpl: globalThis.fetch.bind(globalThis), getToken: session.getToken });
const toolbar = createTopicToolbarController({ catalog: client.catalog, discussion: client.discussion, paint: createTopicToolbarPainter(api.action),
  readMarker: async () => {
    await api.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    return (await api.storage.session.get(TOOLBAR_TAB_KEY))[TOOLBAR_TAB_KEY];
  },
  writeMarker: (id) => api.storage.session.set({ [TOOLBAR_TAB_KEY]: id }),
  removeMarker: () => api.storage.session.remove(TOOLBAR_TAB_KEY) });
const inference = createInferenceHost({ runtime: api.runtime, offscreen: api.offscreen });
const popupFocus = createPopupFocusWitness({ runtime: api.runtime, onChange: () => schedule() });
let timer;
let presentationTabId = null;
let presentationEpoch = 0;
let removingAccess = false;
const captureSession = createCaptureSession({ storageSession: api.storage.session, storageLocal: api.storage.local,
  getWindow: (id) => api.windows.get(id), hasAccess: permission, readForeground, validOrigin,
  onInvalidate: () => { matcher.invalidate(); clearTimeout(timer); void inference.close().catch(() => {}); } });
async function preferences() { return captureSession.snapshot(); }
function validOrigin(origin) {
  if (origin === "http://127.0.0.1:4173") return true;
  const inspected = inspectPageUrl(typeof origin === "string" ? `${origin}/` : null);
  return inspected.supported && inspected.origin === origin;
}
async function inspectForeground() {
  const ownPresentation = presentationEpoch;
  const rejected = (contextReason) => ({ foreground: null, contextReason });
  const tabReason = (tab) => {
    if (tab.incognito) return "incognito";
    if (tab.pendingUrl || tab.status !== "complete") return "page-loading";
    if (!tab.url) return "url-unavailable";
    if (!inspectPageUrl(tab.url).supported) return "unsupported-url";
    return null;
  };
  const queryWindow = () => api.windows.getLastFocused({ populate: false });
  const queryTabs = (windowId) => api.tabs.query({ active: true, windowId });
  try {
    let window;
    try { window = await queryWindow(); } catch { return rejected("window-query-failed"); }
    if (!window) return rejected("window-unavailable");
    if (!Number.isSafeInteger(window.id) || window.id < 0) return rejected("window-unavailable");
    if (window.type !== "normal") return { foreground: null, contextReason: "unsupported-window" };
    if (window.incognito) return { foreground: null, contextReason: "incognito" };
    const witness = window.focused ? null : await popupFocus.check(window.id);
    if (!window.focused && !witness?.isCurrent()) return { foreground: null, contextReason: "window-unfocused" };
    let tabs;
    try { tabs = await queryTabs(window.id); } catch { return rejected("tab-query-failed"); }
    if (tabs.length !== 1 || !Number.isSafeInteger(tabs[0]?.id)) return { foreground: null, contextReason: "tab-unavailable" };
    const tab = tabs[0];
    if (ownPresentation === presentationEpoch && presentationTabId !== tab.id) {
      presentationTabId = tab.id;
      void toolbar.update({ ...matcher.currentState(), presentationTabId });
    }
    const initialReason = tabReason(tab);
    if (initialReason) return rejected(initialReason);
    if (!window.focused) {
      let currentWindow;
      try { currentWindow = await queryWindow(); } catch { return rejected("window-query-failed"); }
      if (!currentWindow) return rejected("window-unavailable");
      if (currentWindow.id !== window.id) return rejected("window-changed");
      if (currentWindow.type !== "normal") return rejected("unsupported-window");
      if (currentWindow.incognito) return rejected("incognito");
      let currentTabs;
      try { currentTabs = await queryTabs(window.id); } catch { return rejected("tab-query-failed"); }
      if (currentTabs.length !== 1 || !Number.isSafeInteger(currentTabs[0]?.id)) return rejected("tab-unavailable");
      const current = currentTabs[0];
      const currentReason = tabReason(current);
      if (currentReason) return rejected(currentReason);
      if (current.id !== tab.id || current.url !== tab.url) return rejected("tab-changed");
      const focusReason = witness.failureReason();
      if (focusReason) return rejected(focusReason);
    }
    const inspected = inspectPageUrl(tab.url);
    return { foreground: { tabId: tab.id, windowId: window.id, url: inspected.url, origin: inspected.origin }, contextReason: null };
  } catch {
    return { foreground: null, contextReason: "context-unavailable" };
  }
}
async function readForeground() { return (await inspectForeground()).foreground; }
async function permission() { return api.permissions.contains({ origins: [HTTPS_ACCESS] }); }
const matcher = createBackgroundMatcher({ getPreferences: preferences, readForeground,
  hasPermission: permission, isPaired: session.isPaired, reader: createPageContentReader(api.scripting),
  embed: inference.embed, client, nextOperationId: () => crypto.randomUUID(),
  onStateChange: (state) => { void toolbar.update({ ...state, presentationTabId }); },
  onUnauthorized: async () => { await session.clear(); void inference.close().catch(() => {}); } });
function schedule(observation) {
  presentationEpoch++;
  if (Number.isSafeInteger(observation?.tabId) && observation.tabId >= 0) presentationTabId = observation.tabId;
  matcher.invalidate(); clearTimeout(timer);
  timer = setTimeout(() => { void matcher.refresh(); }, 400);
}
async function observePresentation(windowId, own = presentationEpoch) {
  // Only the focused normal window's single active tab is observed. This can
  // repaint an off-session icon but conveys no capture or Topic authority.
  let next = null;
  try {
    const window = windowId === undefined ? await api.windows.getLastFocused({ populate: false }) : await api.windows.get(windowId);
    if (window?.focused && window.type === "normal" && !window.incognito) {
      const tabs = await api.tabs.query({ active: true, windowId: window.id });
      const current = await api.windows.get(window.id);
      if (current?.focused && current.id === window.id && current.type === "normal" && !current.incognito &&
          tabs.length === 1 && !tabs[0].incognito && Number.isSafeInteger(tabs[0].id) && tabs[0].id >= 0) next = tabs[0].id;
    }
  } catch { /* Failed observations clear current presentation authority. */ }
  if (own !== presentationEpoch) return;
  presentationTabId = next;
  void toolbar.update({ ...matcher.currentState(), presentationTabId });
}
async function status() {
  const [settings, context] = await Promise.all([preferences(), inspectForeground()]);
  const { foreground, contextReason } = context;
  const observed = matcher.currentState();
  // A failed foreground observation can recover without a Chrome lifecycle
  // event. Fresh eligibility only schedules the ordinary fully fenced refresh.
  // Invalidation changes the phase immediately, so polling cannot defer it.
  if (settings.enabled && foreground && settings.sessionWindowId === foreground.windowId && !settings.blockedOrigins.includes(foreground.origin) &&
      observed.phase === "unsupported" && observed.reason === "no-focused-page" &&
      observed.tabId === null && observed.url === null) schedule();
  const hostAccess = await permission().catch(() => false);
  return { ...matcher.currentState(), ...settings, hostAccess,
    currentWindowId: foreground?.windowId ?? null,
    currentOrigin: foreground?.origin ?? null, currentTabId: foreground?.tabId ?? null,
    currentUrl: foreground?.url ?? null, contextReason };
}
async function handle(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("invalid");
  const allowed = ["block-site", "unblock-site", "remove-site"].includes(message.type) ? ["target", "type", "origin"]
    : message.type === "start-session" ? ["target", "type", "windowId", "expectedRevision"] : ["target", "type"];
  if (Object.keys(message).some((key) => !allowed.includes(key))) throw new Error("invalid");
  switch (message.type) {
    case "status": return status();
    case "toolbar-refresh":
      await toolbar.update({ ...matcher.currentState(), presentationTabId }, { verify: true }); return { refreshed: true };
    case "start-session": {
      if (removingAccess) throw new Error("busy");
      await captureSession.start(message.windowId, message.expectedRevision);
      schedule(); return status();
    }
    case "pause":
    case "stop-session":
      await captureSession.stop();
      await inference.close(); await matcher.refresh(); return status();
    case "block-site":
    case "remove-site":
      await captureSession.setBlocked(message.origin, true);
      schedule(); return status();
    case "unblock-site":
      await captureSession.setBlocked(message.origin, false);
      schedule(); return status();
    case "remove-access":
      removingAccess = true;
      try {
        await captureSession.stop();
        await api.permissions.remove({ origins: [HTTPS_ACCESS] });
        await inference.close(); await matcher.refresh(); return await status();
      } finally { removingAccess = false; }
    case "retry": schedule(); return status();
    default: throw new Error("invalid");
  }
}
api.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== "page-matching") return false;
  if (sender.id !== api.runtime.id || sender.tab || sender.url !== api.runtime.getURL("chromium/popup.html")) {
    reply({ error: "forbidden" }); return false;
  }
  void handle(message).then(reply).catch(() => reply({ error: "unavailable" }));
  return true;
});
api.tabs.onActivated.addListener(schedule);
api.tabs.onUpdated.addListener((tabId, changes, tab) => {
  if ((tab.active || tabId === matcher.currentState().tabId) && (changes.status || changes.url)) schedule();
});
api.tabs.onRemoved.addListener((tabId) => {
  if (tabId === presentationTabId) presentationTabId = null;
  void toolbar.tabRemoved(tabId);
  if (tabId === matcher.currentState().tabId) schedule();
});
api.tabs.onReplaced.addListener(schedule);
api.windows.onFocusChanged.addListener((id) => {
  schedule();
  const own = presentationEpoch;
  void preferences().then((settings) => settings.enabled ? undefined : observePresentation(id, own)).catch(() => {});
});
api.windows.onRemoved.addListener((id) => { void captureSession.closeWindow(id).then(schedule).catch(() => {}); });
api.permissions.onRemoved.addListener((removed) => {
  matcher.invalidate(); clearTimeout(timer); void inference.close().catch(() => {});
  // Fence before any asynchronous contains() observation: a fast regrant must
  // not revive a Start ticket that predates native access removal.
  if (removed?.origins?.length) {
    void captureSession.stop().then(schedule).catch(() => {});
    return;
  }
  void permission().then((access) => access ? undefined : captureSession.stop()).then(schedule).catch(() => {});
});
api.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.localServicePairingToken) {
    void toolbar.update({ phase: "unpaired", presentationTabId }, { pairingChanged: true });
    schedule(); void inference.close().catch(() => {});
  }
  // Capture control writes fence synchronously in their trusted owner. Never
  // restore authority from storage events (or legacy local preferences).
});
schedule();
const startupPresentation = presentationEpoch;
void preferences().then((settings) => settings.enabled ? undefined : observePresentation(undefined, startupPresentation)).catch(() => {});
