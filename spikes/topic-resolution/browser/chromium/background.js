import { createLocalServiceClient } from "../core/local-service-client.js";
import { createLocalServiceSession } from "../core/local-service-session.js";
import { createBackgroundMatcher } from "../core/background-matcher.js";
import { inspectPageUrl } from "../core/page-content-policy.js";
import { createPageContentReader } from "./page-content-reader.js";
import { createInferenceHost } from "./inference-host.js";

const api = globalThis.chrome;
const KEY = "pageMatchingPreferences";
const session = createLocalServiceSession({ storageSession: api.storage.session });
const client = createLocalServiceClient({ fetchImpl: globalThis.fetch.bind(globalThis), getToken: session.getToken });
const inference = createInferenceHost({ runtime: api.runtime, offscreen: api.offscreen });
let timer;
let preferenceOperations = Promise.resolve();
let pendingPause = false;
const pendingRevocations = new Set();
let consentGeneration = 0;
const defaults = () => ({ enabled: false, origins: [] });
async function preferences() {
  await api.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const value = (await api.storage.local.get(KEY))[KEY];
  if (!value || typeof value.enabled !== "boolean" || !Array.isArray(value.origins) || value.origins.length > 100 ||
      value.origins.some((origin) => !validOrigin(origin))) return defaults();
  return { enabled: value.enabled && !pendingPause,
    origins: [...new Set(value.origins)].filter((origin) => !pendingRevocations.has(origin)) };
}
function validOrigin(origin) {
  if (origin === "http://127.0.0.1:4173") return true;
  const inspected = inspectPageUrl(typeof origin === "string" ? `${origin}/` : null);
  return inspected.supported && inspected.origin === origin;
}
async function readForeground() {
  const window = await api.windows.getLastFocused({ populate: false });
  if (!window?.focused || window.type !== "normal") return null;
  const tabs = await api.tabs.query({ active: true, windowId: window.id });
  const tab = tabs[0];
  if (tabs.length !== 1 || !Number.isSafeInteger(tab?.id) || tab.incognito || tab.pendingUrl || tab.status !== "complete") return null;
  const inspected = inspectPageUrl(tab.url);
  return inspected.supported ? { tabId: tab.id, url: inspected.url, origin: inspected.origin } : null;
}
async function permission(origin) { return api.permissions.contains({ origins: [`${origin}/*`] }); }
const matcher = createBackgroundMatcher({ getPreferences: preferences, readForeground,
  hasPermission: permission, isPaired: session.isPaired, reader: createPageContentReader(api.scripting),
  embed: inference.embed, client, nextOperationId: () => crypto.randomUUID(),
  onUnauthorized: async () => { await session.clear(); void inference.close().catch(() => {}); } });
function schedule() {
  matcher.invalidate(); clearTimeout(timer);
  timer = setTimeout(() => { void matcher.refresh(); }, 400);
}
function updatePreferences(operation) {
  const work = preferenceOperations.then(async () => {
    const value = await operation(await preferences());
    await api.storage.local.set({ [KEY]: value });
    return value;
  });
  preferenceOperations = work.catch(() => {});
  return work;
}
async function status() {
  const [settings, foreground] = await Promise.all([preferences(), readForeground()]);
  return { ...matcher.currentState(), enabled: settings.enabled, origins: settings.origins,
    currentOrigin: foreground?.origin ?? null, currentTabId: foreground?.tabId ?? null,
    currentUrl: foreground?.url ?? null };
}
async function handle(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("invalid");
  const allowed = ["remove-site", "enable-site"].includes(message.type) ? ["target", "type", "origin"] : ["target", "type"];
  if (Object.keys(message).some((key) => !allowed.includes(key))) throw new Error("invalid");
  switch (message.type) {
    case "status": return status();
    case "enable-site": {
      const ticket = consentGeneration;
      if (pendingPause || pendingRevocations.has(message.origin)) throw new Error("busy");
      const foreground = await readForeground();
      if (!foreground || foreground.origin !== message.origin || !await permission(foreground.origin)) throw new Error("permission");
      await updatePreferences(async (value) => {
        const current = await readForeground();
        if (!current || current.origin !== message.origin || !await permission(message.origin) ||
            ticket !== consentGeneration || pendingPause || pendingRevocations.has(message.origin)) throw new Error("changed");
        const origins = [...new Set([...value.origins, foreground.origin])];
        if (origins.length > 100) throw new Error("capacity");
        return { enabled: true, origins };
      });
      schedule(); return status();
    }
    case "pause":
      consentGeneration++;
      pendingPause = true;
      matcher.invalidate(); clearTimeout(timer);
      await updatePreferences(async (value) => ({ ...value, enabled: false }));
      pendingPause = false;
      await inference.close(); await matcher.refresh(); return status();
    case "resume": {
      const ticket = consentGeneration;
      if (pendingPause) throw new Error("busy");
      await updatePreferences(async (value) => {
        if (ticket !== consentGeneration || pendingPause) throw new Error("changed");
        return { ...value, enabled: true };
      });
      schedule(); return status();
    }
    case "remove-site":
      if (!validOrigin(message.origin)) throw new Error("invalid");
      consentGeneration++;
      pendingRevocations.add(message.origin);
      matcher.invalidate(); clearTimeout(timer);
      await updatePreferences(async (value) => ({ ...value, origins: value.origins.filter((origin) => origin !== message.origin) }));
      if (message.origin !== "http://127.0.0.1:4173") await api.permissions.remove({ origins: [`${message.origin}/*`] });
      pendingRevocations.delete(message.origin);
      await inference.close(); schedule(); return status();
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
api.tabs.onRemoved.addListener((tabId) => { if (tabId === matcher.currentState().tabId) schedule(); });
api.tabs.onReplaced.addListener(schedule);
api.windows.onFocusChanged.addListener(schedule);
api.permissions.onRemoved.addListener(() => { schedule(); void inference.close().catch(() => {}); });
api.storage.onChanged.addListener((changes, area) => {
  if ((area === "session" && changes.localServicePairingToken) || (area === "local" && changes[KEY])) schedule();
});
schedule();
