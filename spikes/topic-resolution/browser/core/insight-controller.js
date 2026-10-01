import { buildInsightContext } from "./insight-context.js";

const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const sameVersion = (a, b) => a && b && a.generation === b.generation && a.revision === b.revision;
const RESEARCH_FAILURE_STATUS = Object.freeze({
  "rate-limit": "usageLimit", "model-unavailable": "modelUnavailable",
  "unsupported-capability": "webResearchUnavailable", unauthorized: "authorizationExpired",
  timeout: "researchTimeout", busy: "researchBusy",
});

// Private popup state only. Explicit actions invoke injected page/provider
// adapters; only final sharing persists the reviewed discussion text.
export function createInsightController({ shareInsight, onStateChange = () => {}, aiClient = null,
  readArticle = null, attestArticle = null, openAuthorization = null,
  randomId = () => globalThis.crypto.randomUUID() }) {
  let observed = null;
  let boundKey = null;
  let disposed = false;
  let pending = false;
  let review = null;
  let epoch = 0;
  let connectionEpoch = 0;
  let connectionBusy = false;
  let modelsBusy = false;
  let job = null;
  let state = { available: false, context: null, draft: "", preview: null, status: "idle", busy: false,
    ai: { connected: false, planEnabled: false, pending: false, account: null, models: [], model: "", costConsent: false, articleText: "", article: null,
      result: null, status: "idle", error: null, failureStage: null, failureSubstage: null } };

  function eligible() {
    return observed?.phase === "ready" && !observed.busy && !observed.needsFreshRead &&
      observed.catalog?.actors.some((actor) => actor.id === observed.actorId && actor.type === "human") &&
      observed.discussion?.topic?.id === observed.topicId &&
      sameVersion(observed.catalog.version, observed.discussion.version) &&
      (!observed.related || sameVersion(observed.related.version, observed.catalog.version));
  }
  function key() {
    if (!eligible()) return null;
    return JSON.stringify([observed.catalog.version, observed.topicId, observed.sourceId,
      observed.actorId, observed.selection, observed.resolution?.documentId ?? null]);
  }
  function currentState() { return structuredClone(state); }
  function publish(patch = {}) {
    if (disposed) return;
    state = { ...state, ...patch, available: Boolean(eligible()) && !pending, busy: pending };
    onStateChange(currentState());
  }
  function clear(status = "idle") {
    cancelJob(); epoch++;
    boundKey = null; review = null;
    publish({ context: null, draft: "", preview: null, status, ai: { ...state.ai, articleText: "", article: null,
      result: null, costConsent: false, status: "idle", error: null } });
  }
  function aiPatch(patch) { publish({ ai: { ...state.ai, ...patch } }); }
  function cancelJob() {
    const previous = job; job = null;
    if (previous) { previous.abort.abort(); void aiClient?.cancel(previous.id, previous.actorId).catch(() => {}); }
  }
  function observe(value) {
    if (disposed) return;
    observed = value;
    if (boundKey !== null && key() !== boundKey) clear("changed");
    else publish();
  }
  function prepare({ includeDiscussion = false } = {}) {
    if (disposed || pending || job || !eligible()) return false;
    try {
      const context = buildInsightContext({ ...observed, includeDiscussion: includeDiscussion === true });
      boundKey = key(); review = null;
      cancelJob(); epoch++;
      publish({ context, draft: "", preview: null, status: "prepared", ai: { ...state.ai, articleText: "", article: null,
        result: null, costConsent: false, status: "idle", error: null } });
      return true;
    } catch { clear("failed"); return false; }
  }
  function setDraft(body) {
    if (disposed || pending || job || boundKey === null || key() !== boundKey ||
        typeof body !== "string" || body.length > 8_000) return false;
    review = null;
    publish({ draft: body, preview: null, status: "prepared", ai: { ...state.ai, result: null } });
    return true;
  }
  function preview() {
    if (disposed || pending || job || boundKey === null || key() !== boundKey ||
        !state.draft.trim() || UNSAFE.test(state.draft)) return false;
    const operator = observed.catalog.actors.find((actor) => actor.id === observed.actorId);
    review = { body: state.draft, expected: { ...observed.discussion.version },
      topicId: observed.topicId, sourceId: observed.sourceId ?? null, actorId: observed.actorId };
    publish({ preview: { body: review.body, topicTitle: state.context.topic.title,
      operatorName: operator.displayName, sourceTitle: state.context.currentSource?.title ?? null,
      sourceUrl: state.context.currentSource?.url ?? null }, status: "preview" });
    return true;
  }
  async function share() {
    if (disposed || pending || job || !review || key() !== boundKey || state.draft !== review.body) return false;
    const exactReview = structuredClone(review);
    pending = true; publish({ status: "sharing" });
    let success = false;
    try { success = await shareInsight(exactReview) === true; }
    catch { /* A failed/uncertain write is never retried automatically. */ }
    finally {
      pending = false;
      if (!disposed) clear(success ? "shared" : "failed");
    }
    return success;
  }
  function discard() { if (!disposed && !pending) clear(); }
  async function checkConnection() {
    if (!aiClient || disposed || connectionBusy || job) return false;
    const current = connectionEpoch;
    try {
      const value = await aiClient.status();
      if (disposed || current !== connectionEpoch) return false;
      aiPatch({ connected: value.connected, planEnabled: value.planEnabled, pending: value.pending, account: value.account,
        failureStage: value.error === "connection-failed" ? value.failureStage ?? null : null,
        failureSubstage: value.error === "connection-failed" && value.failureStage === "identity-verification-failed"
          ? value.failureSubstage ?? null : null,
        status: value.error === "connection-failed" ? "connectionFailed" : value.pending ? "connecting" :
          value.connected ? value.planEnabled ? "connected" : "planUnavailable" : "disconnected",
        ...(value.planEnabled ? {} : { models: [], model: "", result: null, costConsent: false }) });
      return value.connected;
    } catch { if (!disposed && current === connectionEpoch) aiPatch({ status: "unavailable", failureStage: null,
      failureSubstage: null, connected: false,
      planEnabled: false, account: null, models: [], model: "" }); return false; }
  }
  async function connect() {
    if (!aiClient || !openAuthorization || disposed || connectionBusy || state.ai.pending ||
        state.ai.connected && state.ai.planEnabled) return false;
    const current = ++connectionEpoch;
    connectionBusy = true; aiPatch({ pending: true, status: "connecting", failureStage: null, failureSubstage: null });
    const active = () => !disposed && current === connectionEpoch;
    try {
      const { authorizationUrl } = await aiClient.connect();
      if (!active()) return false;
      await openAuthorization(authorizationUrl);
      if (!active()) return false;
      aiPatch({ pending: true, status: "connecting" });
      return true;
    } catch { if (active()) aiPatch({ pending: false, status: "unavailable", failureStage: null,
      failureSubstage: null }); return false; }
    finally { if (current === connectionEpoch) connectionBusy = false; }
  }
  async function disconnect() {
    if (!aiClient || disposed) return false;
    const current = ++connectionEpoch;
    clear("changed"); connectionBusy = true; modelsBusy = false;
    aiPatch({ connected: false, planEnabled: false, pending: false, account: null, models: [], model: "",
      status: "disconnecting", failureStage: null, failureSubstage: null });
    let outcome;
    try { outcome = await aiClient.disconnect(); }
    catch { /* The local bridge may be unavailable. Clear private popup material anyway. */ }
    if (disposed || current !== connectionEpoch) return false;
    connectionBusy = false;
    aiPatch({ connected: false, planEnabled: false, pending: false, account: null, models: [], model: "",
      status: outcome?.revocationConfirmed === true ? "disconnected" : "disconnectedUnconfirmed" });
    return true;
  }
  async function loadModels() {
    if (!aiClient || !state.ai.planEnabled || disposed || job || modelsBusy || connectionBusy) return false;
    const current = connectionEpoch;
    modelsBusy = true; aiPatch({ status: "loadingModels" });
    try {
      const models = await aiClient.models();
      if (disposed || current !== connectionEpoch) return false;
      aiPatch({ models, model: "", status: models.length ? "chooseModel" : "noModels" }); return true;
    } catch { if (!disposed && current === connectionEpoch) aiPatch({ status: "unavailable", models: [], model: "" }); return false; }
    finally { if (current === connectionEpoch) modelsBusy = false; }
  }
  function selectModel(model) {
    if (!state.ai.planEnabled || !state.ai.models.some((item) => item.slug === model) || job || disposed) return false;
    aiPatch({ model, result: null }); return true;
  }
  function setCostConsent(value) { if (disposed || job) return false; aiPatch({ costConsent: value === true }); return true; }
  async function readPageText() {
    if (!readArticle || disposed || pending || job || !state.context || key() !== boundKey) return false;
    const current = epoch, snapshot = observed, expectedKey = boundKey;
    try {
      const article = await readArticle(snapshot);
      if (disposed || epoch !== current || key() !== expectedKey || !article?.text || article.text.length > 4096 ||
          UNSAFE.test(article.text) ||
          article.url !== state.context.currentSource?.url) return false;
      aiPatch({ article: { url: article.url, documentId: article.documentId }, articleText: article.text,
        result: null, status: "articleReady" }); return true;
    } catch { if (!disposed && epoch === current) aiPatch({ article: null, articleText: "", status: "articleUnavailable" }); return false; }
  }
  function setArticleText(value) {
    if (disposed || job || !state.ai.article || typeof value !== "string" || value.length > 4096 || UNSAFE.test(value)) return false;
    aiPatch({ articleText: value, result: null }); return true;
  }
  async function createInsights() {
    if (!aiClient || !attestArticle || disposed || job || pending || !state.ai.planEnabled || !state.ai.costConsent ||
        !state.ai.models.some((item) => item.slug === state.ai.model) || !state.ai.articleText.trim() ||
        !state.ai.article || !state.context || key() !== boundKey) return false;
    const current = epoch, expectedKey = boundKey;
    const operationId = randomId(), actorId = observed.actorId;
    if (typeof operationId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(operationId)) return false;
    const abort = new AbortController(); job = { id: operationId, actorId, abort };
    aiPatch({ status: "generating", error: null, result: null });
    let failureStatus = "generationFailed";
    const active = () => !disposed && epoch === current && key() === expectedKey && job?.id === operationId;
    try {
      const request = { operationId, model: state.ai.model, context: structuredClone(state.context),
        articleText: state.ai.articleText, allowWebResearch: true, expected: { ...observed.catalog.version } };
      await attestArticle(observed, state.ai.article);
      if (!active()) return false;
      await aiClient.start(request, actorId, { signal: abort.signal });
      const end = Date.now() + 95000;
      while (active() && Date.now() < end) {
        const outcome = await aiClient.result(operationId, actorId, { signal: abort.signal });
        if (!active()) return false;
        if (outcome.state === "failed") throw new Error(outcome.error ?? "provider-unavailable");
        if (outcome.state === "completed") {
          let draft = outcome.result.body;
          if (outcome.result.citations.length) {
            const links = [...new Set(outcome.result.citations.map((citation) => citation.url))];
            const withLinks = `${draft}\n\nSources:\n${links.join("\n")}`;
            if (withLinks.length <= 8000) draft = withLinks;
          }
          review = null; job = null;
          // The completed result is now owned by this popup. Purge the service
          // copy immediately; its short TTL is only a fallback for lost popups.
          void aiClient.cancel(operationId, actorId).catch(() => {});
          publish({ draft, preview: null, status: "prepared", ai: { ...state.ai, result: outcome.result,
            status: "generated", costConsent: false } });
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("timeout");
    } catch (error) {
      if (error instanceof Error && Object.hasOwn(RESEARCH_FAILURE_STATUS, error.message))
        failureStatus = RESEARCH_FAILURE_STATUS[error.message];
      if (active()) aiPatch({ status: failureStatus, result: null });
      return false;
    } finally { if (job?.id === operationId) { cancelJob(); if (!disposed) aiPatch({ status: failureStatus }); } }
  }
  function cancelInsights() { if (!job) return false; cancelJob(); epoch++; aiPatch({ status: "cancelled", result: null }); return true; }
  function dispose() {
    cancelJob(); epoch++; connectionEpoch++;
    disposed = true; observed = null; boundKey = null; review = null;
    state = { available: false, context: null, draft: "", preview: null, status: "idle", busy: false,
      ai: { connected: false, planEnabled: false, pending: false, account: null, models: [], model: "", costConsent: false, articleText: "", article: null,
        result: null, status: "idle", error: null } };
  }
  return Object.freeze({ observe, currentState, prepare, setDraft, preview, share, discard, dispose,
    checkConnection, connect, disconnect, loadModels, selectModel, setCostConsent,
    readPageText, setArticleText, createInsights, cancelInsights });
}
