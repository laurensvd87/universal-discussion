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
  let disposed = false, polling = false, acting = false, timer, state = null;
  const listeners = [];
  let operations = Promise.resolve();
  let statusFlight = null;
  const pendingRequests = new Set();
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 10000) throw new TypeError("Page matching unavailable");
  function request(payload) {
    if (payload.type === "status" && statusFlight) return statusFlight;
    const work = operations.then(() => {
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
    operations = work.catch(() => {});
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
  const enable = button("matching-enable", "matchingEnable", () => {
    if (acting || !state?.currentOrigin || !consent.checked) return;
    // Initiate Chrome's prompt in the click's user gesture, using only the cached
    // disclosed origin. The worker rechecks actual foreground after the prompt.
    const selectedOrigin = state.currentOrigin;
    let permission;
    try { permission = requestPermission({ origins: [`${selectedOrigin}/*`] }); }
    catch { unavailable(); return; }
    void action(async () => {
      if (!await permission) { status.textContent = message("matchingPermissionDenied"); detail.textContent = ""; return; }
      if (disposed) return;
      await deliver({ target: "page-matching", type: "enable-site", origin: selectedOrigin });
      consent.checked = false;
    });
  });
  const pause = button("matching-pause", "matchingPause", () => void action(() => deliver({ target: "page-matching", type: "pause" })));
  const resume = button("matching-resume", "matchingResume", () => void action(() => deliver({ target: "page-matching", type: "resume" })));
  const retry = button("matching-retry", "matchingRetry", () => void action(() => deliver({ target: "page-matching", type: "retry" })));
  const sites = node("div"); sites.id = "matching-sites"; root.append(sites);
  let siteHandlers = [];
  let siteSignature = null;
  function clearSiteHandlers() { for (const [item, callback] of siteHandlers) item.removeEventListener("click", callback); siteHandlers = []; }
  function controls() {
    enable.disabled = acting || !state?.currentOrigin || !consent.checked;
    pause.disabled = acting || !state?.enabled; resume.disabled = acting || !state || state.enabled || !state.origins.length;
    retry.disabled = acting || !state?.enabled;
    for (const item of [enable, pause, resume, retry]) item.setAttribute("data-busy", acting ? "true" : "false");
    for (const [remove] of siteHandlers) {
      remove.disabled = acting;
      remove.setAttribute("data-busy", acting ? "true" : "false");
    }
  }
  const changed = () => controls(); consent.addEventListener("change", changed);
  function unavailable() {
    status.textContent = message("matchingUnavailable");
    detail.textContent = "";
    origin.textContent = "";
    context.textContent = message("matchingContextWorkerUnavailable");
    state = null; controls();
  }
  async function deliver(payload) {
    const result = await request(payload);
    if (disposed) return;
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
    const signature = JSON.stringify(result.origins);
    if (signature !== siteSignature) {
      clearSiteHandlers(); const rows = [];
      for (const enabledOrigin of result.origins) {
        const row = node("div"); const name = node("p"); name.textContent = enabledOrigin;
        const remove = node("button", "matchingRemoveSite"); remove.type = "button";
        remove.setAttribute("data-remove-origin", enabledOrigin);
        const callback = () => void action(() => deliver({ target: "page-matching", type: "remove-site", origin: enabledOrigin }));
        remove.addEventListener("click", callback); siteHandlers.push([remove, callback]); row.append(name, remove); rows.push(row);
      }
      sites.replaceChildren(...rows); siteSignature = signature;
    }
    controls(); await onResolution(result);
    return result;
  }
  async function action(work) {
    if (acting || disposed) return;
    acting = true; controls();
    try { await work(); } catch { if (!disposed) unavailable(); }
    finally { acting = false; if (!disposed) controls(); }
  }
  async function poll() {
    if (disposed || polling) return;
    polling = true;
    try { if (!acting) await deliver({ target: "page-matching", type: "status" }); }
    catch { if (!disposed) { unavailable(); try { await onResolution(null); } catch { /* Visible unavailable status already set. */ } } }
    finally {
      polling = false;
      if (!disposed) timer = schedule(() => void poll(), 500);
    }
  }
  async function readResolution() { return request({ target: "page-matching", type: "status" }); }
  async function pauseMatching() { return request({ target: "page-matching", type: "pause" }); }
  controls(); void poll();
  function dispose() {
    disposed = true; cancelSchedule(timer); clearSiteHandlers();
    state = null; status.textContent = ""; detail.textContent = ""; origin.textContent = ""; context.textContent = "";
    for (const cancel of [...pendingRequests]) cancel();
    for (const [item, callback] of listeners) item.removeEventListener("click", callback);
    consent.removeEventListener("change", changed); root.replaceChildren();
  }
  return Object.freeze({ readResolution, pauseMatching, dispose });
}
