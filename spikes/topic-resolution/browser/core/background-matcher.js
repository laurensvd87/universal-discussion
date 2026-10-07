import { inspectPageUrl } from "./page-content-policy.js";

// One foreground observation, never a tab catalog/history. All capabilities are
// injected; invalidation aborts ingestion and prevents late inference rendering.
export function createBackgroundMatcher({ getPreferences, readForeground, hasPermission,
  isPaired, reader, embed, client, nextOperationId, onUnauthorized = async () => {}, onStateChange = () => {} }) {
  let epoch = 0;
  let abort = new AbortController();
  let state = { phase: "off", reason: null, tabId: null, url: null, documentId: null,
    sourceId: null, topicId: null, assignment: null, sequence: 0 };
  let disposed = false;
  // A single successful observation only. No article text or browsing history is retained.
  let lastIngest = null;
  const sameVersion = (a, b) => a?.generation === b?.generation && a?.revision === b?.revision;
  const sameEmbedding = (a, b) => a?.modelId === b?.modelId && Array.isArray(a?.values) &&
    Array.isArray(b?.values) && a.values.length === b.values.length &&
    a.values.every((value, index) => Object.is(value, b.values[index]));
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
  async function authorized(tab, own, sessionRevision) {
    if (!alive(own)) return false;
    const [preferences, foreground, paired] = await Promise.all([getPreferences(), readForeground(), isPaired()]);
    if (!alive(own)) return false;
    if (!preferences.enabled || preferences.sessionWindowId !== tab.windowId ||
        preferences.sessionRevision !== sessionRevision || !paired || !foreground ||
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
      if (!preferences.enabled) { lastIngest = null; publish({ phase: "off" }); return; }
      const foreground = await readForeground();
      if (!alive(own)) return;
      if (!foreground) { lastIngest = null; publish({ phase: "unsupported", reason: "no-focused-page" }); return; }
      const url = inspectPageUrl(foreground.url);
      if (!url.supported) { lastIngest = null; publish({ phase: "unsupported", reason: url.reason }); return; }
      const tab = { tabId: foreground.tabId, windowId: foreground.windowId, url: url.url, origin: url.origin };
      if (lastIngest && (lastIngest.tabId !== tab.tabId || lastIngest.windowId !== tab.windowId ||
          lastIngest.url !== tab.url || lastIngest.sessionRevision !== preferences.sessionRevision)) lastIngest = null;
      publish({ tabId: tab.tabId, url: tab.url });
      if (!Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || preferences.sessionWindowId !== tab.windowId ||
          !Array.isArray(preferences.blockedOrigins) || preferences.blockedOrigins.includes(tab.origin) || !await hasPermission(tab.origin)) {
        if (alive(own)) { lastIngest = null; publish({ phase: "not-enabled" }); } return;
      }
      if (!await isPaired()) { if (alive(own)) { lastIngest = null; publish({ phase: "unpaired" }); } return; }
      const catalog = await client.catalog({ signal });
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      publish({ phase: "processing", reason: "reading" });
      let capture = await reader.read(tab.tabId, tab.url);
      if (!alive(own)) return;
      if (capture.result.status !== "collected") { lastIngest = null; publish({ phase: "unsupported", reason: capture.result.reason }); return; }
      const { extractorVersion } = capture.result;
      const title = capture.result.title.trim() || new URL(tab.url).hostname;
      const documentId = capture.documentId;
      text = capture.result.text;
      capture = null;
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      publish({ documentId, reason: "embedding" });
      const embedding = await embed(text, { signal });
      text = null;
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      const attestation = await reader.attest(tab.tabId, documentId, tab.url);
      if (!alive(own)) return;
      if (attestation.status !== "attested" || !await authorized(tab, own, preferences.sessionRevision)) {
        if (alive(own)) { lastIngest = null; publish({ phase: "unsupported", reason: "document-changed" }); } return;
      }
      publish({ reason: "matching" });
      const source = catalog.sources?.find((item) => item.id === lastIngest?.sourceId);
      if (lastIngest && sameVersion(catalog.version, lastIngest.version) &&
          source?.url === tab.url && source.topicId === lastIngest.topicId &&
          lastIngest.documentId === documentId && lastIngest.title === title &&
          lastIngest.extractorVersion === extractorVersion && sameEmbedding(lastIngest.embedding, embedding)) {
        publish({ phase: "ready", reason: null, sourceId: lastIngest.sourceId,
          topicId: lastIngest.topicId, assignment: lastIngest.assignment });
        return;
      }
      lastIngest = null;
      const result = await client.ingest({ expected: catalog.version, operationId: nextOperationId(),
        url: tab.url, title, embedding, extractorVersion }, { signal });
      if (!await authorized(tab, own, preferences.sessionRevision)) return;
      if (result.version && Array.isArray(embedding.values)) lastIngest = {
        tabId: tab.tabId, windowId: tab.windowId, sessionRevision: preferences.sessionRevision,
        url: tab.url, documentId, title, extractorVersion,
        embedding: { modelId: embedding.modelId, values: [...embedding.values] },
        version: { ...result.version }, sourceId: result.sourceId, topicId: result.topicId,
        assignment: result.assignment };
      publish({ phase: "ready", reason: null, sourceId: result.sourceId, topicId: result.topicId,
        assignment: result.assignment });
    } catch (error) {
      if (alive(own)) lastIngest = null;
      if (alive(own) && error?.code === "unauthorized") {
        try { await onUnauthorized(); } catch { /* Remain unavailable; never capture on failed pairing. */ }
      }
      if (alive(own)) publish({ phase: "error", reason: ["unauthorized", "conflict", "capacity", "invalid-request"].includes(error?.code)
        ? error.code : "unavailable", sourceId: null, topicId: null, assignment: null });
    } finally { text = null; }
  }
  function dispose() { invalidate(); lastIngest = null; disposed = true; }
  return Object.freeze({ currentState, invalidate, refresh, dispose });
}
