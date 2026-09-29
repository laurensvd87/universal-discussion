import { inspectPageUrl } from "./page-content-policy.js";
import { buildTopicInput } from "./topic-input.js";

// One foreground observation, never a tab catalog/history. All capabilities are
// injected; invalidation aborts ingestion and prevents late inference rendering.
export function createBackgroundMatcher({ getPreferences, readForeground, hasPermission,
  isPaired, reader, embed, client, nextOperationId, onUnauthorized = async () => {}, onStateChange = () => {} }) {
  let epoch = 0;
  let abort = new AbortController();
  let state = { phase: "off", reason: null, tabId: null, url: null, documentId: null,
    sourceId: null, topicId: null, assignment: null, sequence: 0 };
  let disposed = false;
  function currentState() { return Object.freeze({ ...state }); }
  function publish(patch) {
    if (disposed) return;
    state = { ...state, ...patch, sequence: epoch };
    onStateChange(currentState());
  }
  function invalidate() {
    epoch++; abort.abort(); abort = new AbortController();
    publish({ phase: "checking", reason: null, tabId: null, url: null, documentId: null,
      sourceId: null, topicId: null, assignment: null });
  }
  const alive = (own) => !disposed && epoch === own;
  async function authorized(tab, own) {
    if (!alive(own)) return false;
    const [preferences, foreground, paired] = await Promise.all([getPreferences(), readForeground(), isPaired()]);
    if (!alive(own)) return false;
    if (!preferences.enabled || preferences.sessionWindowId !== tab.windowId || !paired || !foreground ||
        foreground.windowId !== tab.windowId || foreground.tabId !== tab.tabId || foreground.url !== tab.url ||
        !Array.isArray(preferences.blockedOrigins) || preferences.blockedOrigins.includes(tab.origin) ||
        !await hasPermission(tab.origin)) {
      if (alive(own)) publish({ phase: preferences.enabled ? "not-enabled" : "off", reason: null,
        sourceId: null, topicId: null, assignment: null });
      return false;
    }
    return alive(own);
  }
  async function refresh() {
    invalidate(); const own = epoch;
    const signal = abort.signal;
    let text = null;
    try {
      const preferences = await getPreferences();
      if (!alive(own)) return;
      if (!preferences.enabled) { publish({ phase: "off" }); return; }
      const foreground = await readForeground();
      if (!alive(own)) return;
      if (!foreground) { publish({ phase: "unsupported", reason: "no-focused-page" }); return; }
      const url = inspectPageUrl(foreground.url);
      if (!url.supported) { publish({ phase: "unsupported", reason: url.reason }); return; }
      const tab = { tabId: foreground.tabId, windowId: foreground.windowId, url: url.url, origin: url.origin };
      publish({ tabId: tab.tabId, url: tab.url });
      if (!Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || preferences.sessionWindowId !== tab.windowId ||
          !Array.isArray(preferences.blockedOrigins) || preferences.blockedOrigins.includes(tab.origin) || !await hasPermission(tab.origin)) {
        if (alive(own)) publish({ phase: "not-enabled" }); return;
      }
      if (!await isPaired()) { if (alive(own)) publish({ phase: "unpaired" }); return; }
      const catalog = await client.catalog({ signal });
      if (!await authorized(tab, own)) return;
      publish({ phase: "processing", reason: "reading" });
      let capture = await reader.read(tab.tabId, tab.url);
      if (!alive(own)) return;
      if (capture.result.status !== "collected") { publish({ phase: "unsupported", reason: capture.result.reason }); return; }
      const { extractorVersion } = capture.result;
      const title = capture.result.title.trim() || new URL(tab.url).hostname;
      const documentId = capture.documentId;
      text = buildTopicInput({ title: capture.result.title, text: capture.result.text, extractorVersion });
      capture = null;
      if (!await authorized(tab, own)) return;
      publish({ documentId, reason: "embedding" });
      const embedding = await embed(text, { signal });
      text = null;
      if (!await authorized(tab, own)) return;
      const attestation = await reader.attest(tab.tabId, documentId, tab.url);
      if (!alive(own)) return;
      if (attestation.status !== "attested" || !await authorized(tab, own)) {
        if (alive(own)) publish({ phase: "unsupported", reason: "document-changed" }); return;
      }
      publish({ reason: "matching" });
      const result = await client.ingest({ expected: catalog.version, operationId: nextOperationId(),
        url: tab.url, title, embedding, extractorVersion }, { signal });
      if (!await authorized(tab, own)) return;
      publish({ phase: "ready", reason: null, sourceId: result.sourceId, topicId: result.topicId,
        assignment: result.assignment });
    } catch (error) {
      if (alive(own) && error?.code === "unauthorized") {
        try { await onUnauthorized(); } catch { /* Remain unavailable; never capture on failed pairing. */ }
      }
      if (alive(own)) publish({ phase: "error", reason: ["unauthorized", "conflict", "capacity", "invalid-request"].includes(error?.code)
        ? error.code : "unavailable", sourceId: null, topicId: null, assignment: null });
    } finally { text = null; }
  }
  function dispose() { invalidate(); disposed = true; }
  return Object.freeze({ currentState, invalidate, refresh, dispose });
}
