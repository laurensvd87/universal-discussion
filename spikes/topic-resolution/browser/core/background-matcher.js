import { inspectPageNavigationUrl, PAGE_CONTENT_LIMITS } from "./page-content-policy.js";
import { isConfirmedIngestionConflict, isConfirmedIngestionRejection } from "./local-service-client.js";
import { readVersion } from "./local-service-contract.js";

async function hashEmbeddingInput(text) {
  // Keep this pure core independent of the executable embedding adapter. These
  // are the same fixed input bounds; a failure still takes normal embed(), not
  // a weaker Ready path.
  if (typeof text !== "string" || !text.trim() || text.length > PAGE_CONTENT_LIMITS.text ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text))
    throw new TypeError("Invalid embedding text");
  // Hash exact UTF-16 code units: TextEncoder would collapse distinct lone
  // surrogates to the same replacement bytes. Nothing is logged or persisted.
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    bytes[index * 2] = unit >>> 8; bytes[index * 2 + 1] = unit & 255;
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
}

// One foreground observation, never a tab catalog/history. All capabilities are
// injected; invalidation aborts ingestion and prevents late inference rendering.
export function createBackgroundMatcher({ getPreferences, readForeground, hasPermission,
  isPaired, reader, embed, client, nextOperationId, onUnauthorized = async () => {}, onStateChange = () => {},
  digestInput = hashEmbeddingInput }) {
  if (typeof digestInput !== "function") throw new TypeError("Invalid embedding digest function");
  let epoch = 0;
  let abort = new AbortController();
  let state = { phase: "off", reason: null, tabId: null, url: null, documentId: null,
    sourceId: null, topicId: null, assignment: null, sequence: 0 };
  let disposed = false;
  let retryableError = false;
  // One successful observation and its RAM-only input digest. No article text,
  // digest log/persistence/egress, or browsing history is retained.
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
    epoch++; abort.abort(); abort = new AbortController(); retryableError = false;
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
    // Automatic retries are safe only until a write is dispatched, or after a
    // complete response proves that write was rejected. A successful response
    // followed by a local witness failure must not dispatch a second write.
    let retrySafe = true;
    try {
      const preferences = await getPreferences();
      if (!alive(own)) return;
      if (!preferences.enabled) { lastIngest = null; publish({ phase: "off" }); return; }
      const foreground = await readForeground();
      if (!alive(own)) return;
      if (!foreground) { lastIngest = null; publish({ phase: "unsupported", reason: "no-focused-page" }); return; }
      const url = inspectPageNavigationUrl(foreground.url);
      if (!url.supported) { lastIngest = null; publish({ phase: "unsupported", reason: url.reason }); return; }
      // The original document witness stays in extension RAM. Only sourceUrl
      // is eligible for persistence, post origins or provider context.
      const tab = { tabId: foreground.tabId, windowId: foreground.windowId,
        url: url.documentUrl, sourceUrl: url.url, origin: url.origin };
      if (lastIngest && (lastIngest.tabId !== tab.tabId || lastIngest.windowId !== tab.windowId ||
          lastIngest.url !== tab.url || lastIngest.sessionRevision !== preferences.sessionRevision)) lastIngest = null;
      publish({ tabId: tab.tabId, url: tab.url });
      if (!Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || preferences.sessionWindowId !== tab.windowId ||
          !Array.isArray(preferences.blockedOrigins) || preferences.blockedOrigins.includes(tab.origin) || !await hasPermission(tab.origin)) {
        if (alive(own)) { lastIngest = null; publish({ phase: "not-enabled" }); } return;
      }
      if (!await isPaired()) { if (alive(own)) { lastIngest = null; publish({ phase: "unpaired" }); } return; }
      const versionOnly = typeof client.version === "function";
      const catalog = await (versionOnly ? client.version({ signal }) : client.catalog({ signal }));
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      publish({ phase: "processing", reason: "reading" });
      let capture = await reader.read(tab.tabId, tab.sourceUrl, tab.url);
      if (!alive(own)) return;
      if (capture.result.status !== "collected") { lastIngest = null; publish({ phase: "unsupported", reason: capture.result.reason }); return; }
      const { extractorVersion } = capture.result;
      const title = capture.result.title.trim() || new URL(tab.url).hostname;
      const documentId = capture.documentId;
      text = capture.result.text;
      capture = null;
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      let inputDigest = null;
      try {
        const digest = await digestInput(text);
        if (typeof digest === "string" && /^[a-f0-9]{64}$/u.test(digest)) inputDigest = digest;
      } catch { /* Digest failure only disables computation reuse. */ }
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      const computation = lastIngest;
      const reuseComputation = inputDigest !== null && computation?.inputDigest === inputDigest &&
        computation.tabId === tab.tabId && computation.windowId === tab.windowId && computation.url === tab.url &&
        computation.sessionRevision === preferences.sessionRevision && typeof documentId === "string" && documentId.length > 0 &&
        computation.documentId === documentId && computation.title === title && computation.extractorVersion === extractorVersion;
      publish({ documentId, reason: "embedding" });
      let embedding = reuseComputation ? null : await embed(text, { signal });
      text = null;
      if (!await authorized(tab, own, preferences.sessionRevision)) { if (alive(own)) lastIngest = null; return; }
      const attestation = await reader.attest(tab.tabId, documentId, tab.sourceUrl, tab.url);
      if (!alive(own)) return;
      if (attestation.status !== "attested" || !await authorized(tab, own, preferences.sessionRevision)) {
        if (alive(own)) { lastIngest = null; publish({ phase: "unsupported", reason: "document-changed" }); } return;
      }
      // Reuse only computation, and only after fresh native/foreground proof.
      // The unchanged version/link checks below still decide write-skipping;
      // a new server revision follows the original new-operation ingest path.
      if (reuseComputation) embedding = { modelId: computation.embedding.modelId,
        values: [...computation.embedding.values] };
      publish({ reason: "matching" });
      const source = catalog.sources?.find((item) => item.id === lastIngest?.sourceId);
      if (lastIngest && sameVersion(catalog.version, lastIngest.version) &&
          (versionOnly || (source?.url === tab.sourceUrl && source.topicId === lastIngest.topicId)) &&
          lastIngest.documentId === documentId && lastIngest.title === title &&
          lastIngest.extractorVersion === extractorVersion && sameEmbedding(lastIngest.embedding, embedding)) {
        publish({ phase: "ready", reason: null, sourceId: lastIngest.sourceId,
          topicId: lastIngest.topicId, assignment: lastIngest.assignment });
        return;
      }
      lastIngest = null;
      // Keep the original representation and operation identity through the one
      // confirmed non-writing conflict recovery. No page text is read or embedded again.
      const representation = Object.freeze({ operationId: nextOperationId(), url: tab.sourceUrl, title,
        embedding: Object.freeze({ modelId: embedding.modelId, values: Object.freeze([...embedding.values]) }),
        extractorVersion });
      const expected = Object.freeze({ ...catalog.version });
      let result;
      try {
        retrySafe = false;
        result = await client.ingest({ expected, ...representation }, { signal });
      } catch (error) {
        if (!isConfirmedIngestionConflict(error)) throw error;
        // The branded complete 409 proves this attempt did not commit.
        retrySafe = true;
        if (!await authorized(tab, own, preferences.sessionRevision)) return;
        const fresh = await (versionOnly ? client.version({ signal }) : client.catalog({ signal }));
        if (!await authorized(tab, own, preferences.sessionRevision)) return;
        let renewed;
        try {
          const prior = readVersion(expected);
          renewed = readVersion(fresh.version);
          if (renewed.generation !== prior.generation || renewed.revision <= prior.revision) throw error;
        } catch { throw error; }
        const renewedAttestation = await reader.attest(tab.tabId, documentId, tab.sourceUrl, tab.url);
        if (!alive(own)) return;
        if (renewedAttestation.status !== "attested" || !await authorized(tab, own, preferences.sessionRevision)) {
          if (alive(own)) publish({ phase: "unsupported", reason: "document-changed" });
          return;
        }
        retrySafe = false;
        result = await client.ingest({ expected: Object.freeze(renewed), ...representation }, { signal });
      }
      if (!await authorized(tab, own, preferences.sessionRevision)) return;
      if (result.version && Array.isArray(embedding.values)) lastIngest = {
        tabId: tab.tabId, windowId: tab.windowId, sessionRevision: preferences.sessionRevision,
        url: tab.url, documentId, title, extractorVersion, inputDigest,
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
      if (alive(own)) {
        // A complete conflict/capacity response proves non-acceptance. An
        // unavailable result before ingestion is likewise safe to retry. Once
        // ingestion was dispatched, however, transport/shape failure is
        // ambiguous and must remain terminal until another explicit context
        // event; never replay a possibly accepted write automatically.
        retryableError = (retrySafe || isConfirmedIngestionRejection(error)) &&
          !["unauthorized", "invalid-request"].includes(error?.code);
        publish({ phase: "error", reason: ["unauthorized", "conflict", "capacity", "invalid-request"].includes(error?.code)
          ? error.code : "unavailable", sourceId: null, topicId: null, assignment: null });
      }
    } finally { text = null; }
  }
  function canRetry() { return !disposed && retryableError; }
  function dispose() { invalidate(); lastIngest = null; disposed = true; }
  return Object.freeze({ currentState, canRetry, invalidate, refresh, dispose });
}
