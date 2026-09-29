import { EN } from "../locales/en.js";
import { projectPageResolution } from "../core/page-resolution-contract.js";

// Only fixed reader/coordinator policy codes may become visible diagnostics.
// Unknown reasons retain generic guidance and never echo worker-supplied text.
const UNSUPPORTED_MESSAGES = Object.freeze({
  "missing-region": ["matchingUnsupportedRegion", "[missing-region]"],
  "rights-restricted": ["matchingUnsupportedRestriction", "[rights-restricted]"],
  "capture-budget": ["matchingUnsupportedCapture", "[capture-budget]"],
  "invalid-content": ["matchingUnsupportedContent", "[invalid-content]"],
  "document-mismatch": ["matchingUnsupportedDocument", "[document-mismatch]"],
  "document-changed": ["matchingUnsupportedDocument", "[document-changed]"],
  "no-focused-page": ["matchingUnsupportedForeground", "[no-focused-page]"],
  "invalid-url": ["matchingUnsupportedUrl", "[invalid-url]"],
  credentials: ["matchingUnsupportedSensitiveUrl", "[credentials]"],
  "sensitive-context": ["matchingUnsupportedSensitiveUrl", "[sensitive-context]"],
  "credential-query": ["matchingUnsupportedSensitiveUrl", "[credential-query]"],
  "unsupported-scheme-or-port": ["matchingUnsupportedUrlScope", "[unsupported-scheme-or-port]"],
  "unsupported-host": ["matchingUnsupportedUrlScope", "[unsupported-host]"],
});

export function mountPageMatchingPanel(document, root, { sendMessage, requestPermission,
  onResolution = () => {}, messages = EN, schedule = setTimeout, cancelSchedule = clearTimeout,
  timeoutSchedule = setTimeout, timeoutCancel = clearTimeout, requestTimeoutMs = 8000 } = {}) {
  const message = (key) => messages?.[key] ?? EN[key];
  let disposed = false, polling = false, acting = false, startPending = false, timer, state = null;
  let controlEpoch = 0;
  const listeners = [];
  let operations = Promise.resolve();
  let statusFlight = null;
  let stopFlight = null;
  const pendingRequests = new Set();
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 10000) throw new TypeError("Page matching unavailable");
  function request(payload) {
    if (payload.type === "status" && statusFlight) return statusFlight;
    // Stop must reach the worker even while an older request is unresolved.
    const work = (payload.type === "stop-session" ? Promise.resolve() : operations).then(() => {
      if (disposed) throw new TypeError("Page matching unavailable");
      return new Promise((resolve, reject) => {
        let settled = false;
        let timeout;
        function finish(error, value) {
          if (settled) return; settled = true;
          timeoutCancel(timeout); pendingRequests.delete(cancel);
          if (error) reject(new TypeError("Page matching unavailable")); else resolve(value);
        }
        const cancel = () => finish(true);
        pendingRequests.add(cancel);
        timeout = timeoutSchedule(cancel, requestTimeoutMs);
        Promise.resolve().then(() => sendMessage(payload)).then((value) => finish(false, value), () => finish(true));
      });
    }).then(projectPageResolution);
    if (payload.type !== "stop-session") operations = work.catch(() => {});
    if (payload.type === "status") {
      statusFlight = work;
      void work.then(() => { if (statusFlight === work) statusFlight = null; }, () => { if (statusFlight === work) statusFlight = null; });
    }
    return work;
  }
  function node(tag, key) { const item = document.createElement(tag); if (key) item.textContent = message(key); return item; }
  function button(id, key, action) {
    const item = node("button", key); item.id = id; item.type = "button";
    item.addEventListener("click", action); listeners.push([item, action]); root.append(item); return item;
  }
  const heading = node("h2", "matchingHeading"); heading.id = "matching-heading";
  root.setAttribute("aria-labelledby", heading.id); root.append(heading, node("p", "matchingDisclosure"));
  const status = node("p"); status.id = "matching-status"; status.setAttribute("role", "status"); root.append(status);
  const detail = node("p"); detail.id = "matching-detail"; detail.setAttribute("role", "status"); root.append(detail);
  const sample = node("p", "matchingPartial"); root.append(sample);
  const consent = node("input"); consent.type = "checkbox"; consent.id = "matching-consent";
  const consentLabel = node("label", "matchingConsent"); consentLabel.htmlFor = consent.id; root.append(consentLabel, consent);
  const origin = node("p"); origin.id = "matching-origin"; root.append(origin);
  const context = node("p"); context.id = "matching-context"; context.setAttribute("role", "status"); root.append(context);
  const access = node("p"); access.id = "matching-access"; access.setAttribute("role", "status"); root.append(access);
  const enable = button("matching-enable", "matchingEnable", () => {
    if (disposed || acting || startPending || !state?.currentOrigin || state.currentWindowId === null || !consent.checked) return;
    // Initiate Chrome's broad prompt in this click's user gesture. The cached
    // window/revision binds Start; the worker rechecks it after the prompt.
    const windowId = state.currentWindowId, expectedRevision = state.sessionRevision;
    const ticket = ++controlEpoch;
    statusFlight = null;
    let permission;
    try { permission = requestPermission({ origins: ["https://*/*"] }); }
    catch { unavailable(); return; }
    startPending = true; controls();
    void (async () => {
      try {
        const granted = await permission;
        if (disposed || ticket !== controlEpoch) return;
        consent.checked = false;
        if (!granted) { status.textContent = message("matchingPermissionDenied"); detail.textContent = ""; return; }
        await deliver({ target: "page-matching", type: "start-session", windowId, expectedRevision }, ticket);
      } catch { if (!disposed && ticket === controlEpoch) unavailable(); }
      finally { if (ticket === controlEpoch) { startPending = false; if (!disposed) controls(); } }
    })();
  });
  const pause = button("matching-pause", "matchingPause", () => { void stop().catch(() => {}); });
  const retry = button("matching-retry", "matchingRetry", () => void action(() => deliver({ target: "page-matching", type: "retry" })));
  const block = button("matching-block", "matchingBlock", () => {
    if (state?.currentOrigin) void action(() => deliver({ target: "page-matching", type: "block-site", origin: state.currentOrigin }));
  });
  const removeAccess = button("matching-remove-access", "matchingRemoveAccess", () => void action(() => deliver({ target: "page-matching", type: "remove-access" })));
  const sites = node("div"); sites.id = "matching-sites"; root.append(sites);
  let siteHandlers = [];
  let siteSignature = null;
  function clearSiteHandlers() { for (const [item, callback] of siteHandlers) item.removeEventListener("click", callback); siteHandlers = []; }
  function controls() {
    const busy = acting || startPending;
    enable.disabled = busy || !state?.currentOrigin || state.currentWindowId === null || !consent.checked;
    pause.disabled = disposed || stopFlight !== null || (!state?.enabled && !startPending && !acting);
    retry.disabled = busy || !state?.enabled || state.currentWindowId !== state.sessionWindowId || state.blockedOrigins.includes(state.currentOrigin);
    block.disabled = busy || !state?.currentOrigin || state.blockedOrigins.includes(state.currentOrigin);
    removeAccess.disabled = busy || !state?.hostAccess;
    for (const item of [enable, pause, retry, block, removeAccess]) item.setAttribute("data-busy", busy ? "true" : "false");
    for (const [remove] of siteHandlers) {
      remove.disabled = busy || !state;
      remove.setAttribute("data-busy", busy ? "true" : "false");
    }
  }
  const changed = () => controls(); consent.addEventListener("change", changed);
  function unavailable() {
    status.textContent = message("matchingUnavailable");
    detail.textContent = "";
    origin.textContent = "";
    context.textContent = message("matchingContextWorkerUnavailable");
    access.textContent = "";
    state = null; controls();
  }
  async function deliver(payload, epoch = controlEpoch) {
    const result = await request(payload);
    if (disposed || epoch !== controlEpoch) return;
    state = result;
    status.textContent = message({ off: "matchingOff", checking: "matchingChecking", "not-enabled": "matchingNotEnabled", unpaired: "matchingUnpaired",
      processing: "matchingProcessing", ready: "matchingReady", unsupported: "matchingUnsupported", error: "matchingUnavailable" }[result.phase]);
    detail.textContent = "";
    if (result.phase === "unsupported" && Object.hasOwn(UNSUPPORTED_MESSAGES, result.reason)) {
      const [key, code] = UNSUPPORTED_MESSAGES[result.reason];
      status.textContent = message(key);
      detail.textContent = code;
    }
    origin.textContent = result.currentOrigin ?? "";
    access.textContent = message(result.hostAccess ? "matchingAccessGranted" : "matchingAccessAbsent");
    context.textContent = result.contextReason ? message({
      "context-unavailable": "matchingContextUnavailable", "window-unfocused": "matchingContextUnfocused",
      "window-unavailable": "matchingContextWindowUnavailable", "window-query-failed": "matchingContextWindowQueryFailed",
      "tab-query-failed": "matchingContextTabQueryFailed", "window-changed": "matchingContextWindowChanged",
      "tab-changed": "matchingContextTabChanged", "focus-expired": "matchingContextFocusExpired",
      "focus-changed": "matchingContextFocusChanged",
      "unsupported-window": "matchingContextWindow", "tab-unavailable": "matchingContextTab",
      "page-loading": "matchingContextLoading", "url-unavailable": "matchingContextUrlUnavailable",
      incognito: "matchingContextIncognito", "unsupported-url": "matchingContextUnsupportedUrl",
    }[result.contextReason]) : "";
    if (!result.contextReason && result.enabled) context.textContent = message(result.currentWindowId === result.sessionWindowId ? "matchingSessionWindow" : "matchingOtherWindow");
    if (result.enabled && result.currentOrigin && (result.currentWindowId !== result.sessionWindowId || result.blockedOrigins.includes(result.currentOrigin))) {
      status.textContent = message("matchingNotEnabled"); detail.textContent = "";
    }
    const signature = JSON.stringify(result.blockedOrigins);
    if (signature !== siteSignature) {
      clearSiteHandlers(); const rows = [];
      for (const blockedOrigin of result.blockedOrigins) {
        const row = node("div"); const name = node("p"); name.textContent = blockedOrigin;
        const remove = node("button", "matchingUnblockSite"); remove.type = "button";
        remove.setAttribute("data-unblock-origin", blockedOrigin);
        const callback = () => void action(() => deliver({ target: "page-matching", type: "unblock-site", origin: blockedOrigin }));
        remove.addEventListener("click", callback); siteHandlers.push([remove, callback]); row.append(name, remove); rows.push(row);
      }
      sites.replaceChildren(...rows); siteSignature = signature;
    }
    controls(); await onResolution(result);
    return result;
  }
  async function action(work) {
    if (acting || startPending || disposed) return;
    const epoch = controlEpoch;
    acting = true; controls();
    try { await work(); } catch { if (!disposed && epoch === controlEpoch) unavailable(); }
    finally { if (epoch === controlEpoch) { acting = false; if (!disposed) controls(); } }
  }
  function stop() {
    if (disposed) return Promise.resolve();
    if (stopFlight) return stopFlight;
    const epoch = ++controlEpoch;
    statusFlight = null;
    startPending = false; acting = true; consent.checked = false;
    if (state) state = { ...state, enabled: false, sessionWindowId: null, phase: "off" };
    if (!state?.contextReason) context.textContent = "";
    status.textContent = message("matchingStopping"); detail.textContent = ""; controls();
    try { void Promise.resolve(onResolution(null)).catch(() => {}); } catch { /* Stop still reaches the worker. */ }
    stopFlight = (async () => {
      try { return await deliver({ target: "page-matching", type: "stop-session" }, epoch); }
      catch { if (!disposed && epoch === controlEpoch) unavailable(); throw new TypeError("Page matching unavailable"); }
      finally { stopFlight = null; if (epoch === controlEpoch) { acting = false; if (!disposed) controls(); } }
    })();
    controls(); return stopFlight;
  }
  async function poll() {
    if (disposed || polling) return;
    polling = true;
    const epoch = controlEpoch;
    try { if (!acting && !startPending) await deliver({ target: "page-matching", type: "status" }, epoch); }
    catch { if (!disposed && epoch === controlEpoch) { unavailable(); try { await onResolution(null); } catch { /* Visible unavailable status already set. */ } } }
    finally {
      polling = false;
      if (!disposed) timer = schedule(() => void poll(), 500);
    }
  }
  async function readResolution() {
    const epoch = controlEpoch;
    const result = await request({ target: "page-matching", type: "status" });
    if (disposed || epoch !== controlEpoch) throw new TypeError("Page matching unavailable");
    return result;
  }
  async function pauseMatching() { return stop(); }
  controls(); void poll();
  function dispose() {
    disposed = true; controlEpoch++; cancelSchedule(timer); clearSiteHandlers();
    state = null; status.textContent = ""; detail.textContent = ""; origin.textContent = ""; context.textContent = ""; access.textContent = "";
    for (const cancel of [...pendingRequests]) cancel();
    for (const [item, callback] of listeners) item.removeEventListener("click", callback);
    consent.removeEventListener("change", changed); root.replaceChildren();
  }
  return Object.freeze({ readResolution, pauseMatching, dispose });
}
