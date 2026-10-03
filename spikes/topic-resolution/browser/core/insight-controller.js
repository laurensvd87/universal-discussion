import { buildInsightContext } from "./insight-context.js";
import { ModelListFailure } from "./local-ai-client.js";
import { formatInsightCitations } from "./insight-citations.js";

const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const sameVersion = (a, b) => a && b && a.generation === b.generation && a.revision === b.revision;
const RESEARCH_FAILURE_STATUS = Object.freeze({
  "rate-limit": "usageLimit", "model-unavailable": "modelUnavailable",
  "unsupported-capability": "webResearchUnavailable", unauthorized: "authorizationExpired",
  timeout: "researchTimeout", busy: "researchBusy",
});
const MODEL_LIST_FAILURE_STATUS = Object.freeze({
  "access-rejected": "modelListAccessRejected", "rate-limited": "modelListRateLimited",
  "timed-out": "modelListTimedOut", "invalid-response": "modelListInvalidResponse",
  "provider-unavailable": "modelListProviderUnavailable", busy: "modelListBusy",
});
const MODEL_LIST_DETAILS = new Set(["catalog-redirect", "catalog-content-type", "catalog-body",
  "catalog-too-large", "catalog-stream", "catalog-encoding", "catalog-json", "catalog-shape", "catalog-entry"]);
const MODEL_LIST_OUTCOMES = new Set(["success", "access-rejected", "rate-limited", "timed-out",
  "invalid-response", "provider-unavailable", "busy", "local-error"]);
const RESEARCH_DETAILS = new Set(["response-redirect", "response-content-type", "response-content-json",
  "response-content-html", "response-content-text", "response-content-missing", "response-content-other", "response-stream",
  "response-too-large", "response-encoding", "response-event", "response-no-final",
  "response-empty-output", "response-no-message", "response-output-empty", "response-search-only",
  "response-reasoning-only", "response-final-item-missing", "response-item-identity",
  "response-item-conflict", "response-item-prefix", "response-item-text", "response-stream-text-unfinalized",
  "response-message-unfinished", "response-refusal",
  "response-no-text", "response-blank-text", "response-unsafe-text", "response-output-too-large", "response-incomplete",
  "response-failed", "response-http-400"]);

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
  let modelsEpoch = 0;
  let diagnosticsBusy = false;
  let automaticStartBusy = false;
  let job = null;
  let completedJob = null;
  let state = { available: false, context: null, excludedRelatedSourceIds: [], allowWebResearch: true,
    draft: "", preview: null, status: "idle", busy: false,
    ai: { connected: false, planEnabled: false, pending: false, account: null, models: [], model: "", costConsent: false, articleText: "", article: null,
      result: null, status: "idle", error: null, failureStage: null, failureSubstage: null,
      modelFailureDetail: null, researchFailureDetail: null,
      diagnostics: { status: "idle", events: [], localEvents: [] } } };

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
    cancelJob(); purgeCompleted(); epoch++;
    boundKey = null; review = null;
    publish({ context: null, excludedRelatedSourceIds: [], draft: "", preview: null, status, ai: { ...state.ai, articleText: "", article: null,
      result: null, costConsent: false, status: "idle", error: null, researchFailureDetail: null } });
  }
  function aiPatch(patch) { publish({ ai: { ...state.ai, ...patch } }); }
  function recordLocalModelOutcome(outcome, detail = null) {
    if (!MODEL_LIST_OUTCOMES.has(outcome)) return;
    const prior = state.ai.diagnostics;
    const event = { kind: "models", outcome,
      ...(outcome === "invalid-response" && MODEL_LIST_DETAILS.has(detail) ? { detail } : {}) };
    aiPatch({ diagnostics: { ...prior, localEvents: [...prior.localEvents, event].slice(-20) } });
  }
  function invalidateModels() { modelsEpoch++; modelsBusy = false; }
  function cancelJob() {
    const previous = job; job = null;
    if (previous) { previous.abort.abort(); void aiClient?.cancel(previous.id, previous.actorId).catch(() => {}); }
  }
  function purgeCompleted() {
    const previous = completedJob; completedJob = null;
    if (previous) void aiClient?.cancel(previous.id, previous.actorId).catch(() => {});
  }
  function observe(value) {
    if (disposed) return;
    observed = value;
    // The discussion controller sets busy before persisting our reviewed
    // Share. Do not revoke its completed-result proof mid-flight; the write
    // itself performs fresh context checks and this controller clears on exit.
    if (pending) { publish(); return; }
    if (boundKey !== null && key() !== boundKey) clear("changed");
    else if (boundKey === null && eligible()) prepare();
    else publish();
  }
  function prepare({ includeDiscussion = false } = {}) {
    if (disposed || pending || job || completedJob || !eligible()) return false;
    try {
      const context = buildInsightContext({ ...observed, includeDiscussion: includeDiscussion === true });
      boundKey = key(); review = null;
      cancelJob(); purgeCompleted(); epoch++;
      publish({ context, excludedRelatedSourceIds: [], draft: "", preview: null, status: "prepared", ai: { ...state.ai, articleText: "", article: null,
        result: null, costConsent: false, status: "idle", error: null, researchFailureDetail: null } });
      return true;
    } catch { clear("failed"); return false; }
  }
  function setRelatedSourceIncluded(sourceId, included) {
    if (disposed || pending || job || automaticStartBusy || !state.context ||
        !state.context.relatedSources.some((source) => source.id === sourceId) ||
        typeof included !== "boolean") return false;
    const excluded = new Set(state.excludedRelatedSourceIds);
    if (included) excluded.delete(sourceId); else excluded.add(sourceId);
    publish({ excludedRelatedSourceIds: [...excluded].sort() });
    return true;
  }
  function setAllowWebResearch(value) {
    if (disposed || pending || job || automaticStartBusy || typeof value !== "boolean") return false;
    publish({ allowWebResearch: value });
    return true;
  }
  function setDraft(body) {
    if (disposed || pending || job || boundKey === null || key() !== boundKey ||
        state.ai.result || typeof body !== "string" || body.length > 8_000) return false;
    review = null;
    publish({ draft: body, preview: null, status: "prepared", ai: { ...state.ai, result: null } });
    return true;
  }
  function preparedReview() {
    if (disposed || pending || job || boundKey === null || key() !== boundKey ||
        !state.ai.result || state.draft !== formatInsightCitations(state.ai.result.body, state.ai.result.citations) ||
        !state.draft.trim() || UNSAFE.test(state.draft) || !completedJob) return null;
    return { body: state.draft, operationId: completedJob.id, expected: { ...observed.discussion.version },
      topicId: observed.topicId, sourceId: observed.sourceId ?? null, actorId: observed.actorId,
      ...(completedJob.followup ? { ...completedJob.followup } : {}) };
  }
  function preview() {
    const candidate = preparedReview();
    if (!candidate) return false;
    review = candidate;
    const operator = observed.catalog.actors.find((actor) => actor.id === observed.actorId);
    publish({ preview: { body: review.body, topicTitle: state.context.topic.title,
      operatorName: operator.displayName, sourceTitle: state.context.currentSource?.title ?? null,
      sourceUrl: state.context.currentSource?.url ?? null, replyToId: review.replyToId ?? null }, status: "preview" });
    return true;
  }
  async function share() {
    // The already formatted private draft is the review. Share remains one
    // explicit action, and the service independently attests the exact result.
    const exactReview = preparedReview();
    if (!exactReview) return false;
    pending = true; publish({ status: "sharing" });
    let success = false;
    try { success = await shareInsight(exactReview) === true; }
    catch { /* A failed/uncertain write is never retried automatically. */ }
    finally {
      pending = false;
      if (success) completedJob = null;
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
      invalidateModels();
      const accountChanged = value.account?.clientId !== state.ai.account?.clientId ||
        value.account?.label !== state.ai.account?.label;
      if ((accountChanged || !value.connected || !value.planEnabled) && completedJob) clear("changed");
      aiPatch({ connected: value.connected, planEnabled: value.planEnabled, pending: value.pending, account: value.account,
        modelFailureDetail: null,
        failureStage: value.error === "connection-failed" ? value.failureStage ?? null : null,
        failureSubstage: value.error === "connection-failed" && value.failureStage === "identity-verification-failed"
          ? value.failureSubstage ?? null : null,
        status: value.error === "connection-failed" ? "connectionFailed" : value.pending ? "connecting" :
          value.connected ? value.planEnabled ? "connected" : "planUnavailable" : "disconnected",
        ...(value.planEnabled && !accountChanged ? {} : { models: [], model: "", result: null, costConsent: false }) });
      return value.connected;
    } catch { if (!disposed && current === connectionEpoch) {
      invalidateModels();
      aiPatch({ status: "unavailable", failureStage: null, failureSubstage: null, connected: false,
        planEnabled: false, account: null, models: [], model: "" });
    } return false; }
  }
  async function connect() {
    if (!aiClient || !openAuthorization || disposed || connectionBusy || state.ai.pending ||
        state.ai.connected && state.ai.planEnabled) return false;
    const current = ++connectionEpoch;
    invalidateModels();
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
    clear("changed"); connectionBusy = true; invalidateModels();
    aiPatch({ connected: false, planEnabled: false, pending: false, account: null, models: [], model: "",
      status: "disconnecting", failureStage: null, failureSubstage: null,
      diagnostics: { status: "idle", events: [], localEvents: [] } });
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
    const current = connectionEpoch, listEpoch = ++modelsEpoch;
    modelsBusy = true; aiPatch({ status: "loadingModels", modelFailureDetail: null });
    try {
      const models = await aiClient.models();
      if (disposed || current !== connectionEpoch || listEpoch !== modelsEpoch) return false;
      const selectedModel = models.some((item) => item.slug === state.ai.model)
        ? state.ai.model : models.at(-1)?.slug ?? "";
      aiPatch({ models, model: selectedModel, status: models.length ? "chooseModel" : "noModels",
        modelFailureDetail: null });
      recordLocalModelOutcome("success");
      return true;
    } catch (error) {
      if (!disposed && current === connectionEpoch && listEpoch === modelsEpoch) {
        const failure = error instanceof ModelListFailure && Object.hasOwn(MODEL_LIST_FAILURE_STATUS, error.failure)
          ? error.failure : null;
        const detail = failure === "invalid-response" && MODEL_LIST_DETAILS.has(error.detail) ? error.detail : null;
        aiPatch({ status: failure ? MODEL_LIST_FAILURE_STATUS[failure] : "modelListUnavailable",
          modelFailureDetail: detail, models: [], model: "" });
        recordLocalModelOutcome(failure ?? "local-error", detail);
      }
      return false;
    }
    finally { if (listEpoch === modelsEpoch) modelsBusy = false; }
  }
  async function loadDiagnostics() {
    if (!aiClient?.diagnostics || disposed || diagnosticsBusy) return false;
    const current = connectionEpoch;
    diagnosticsBusy = true;
    aiPatch({ diagnostics: { ...state.ai.diagnostics, status: "loading", events: [] } });
    try {
      const diagnostics = await aiClient.diagnostics();
      if (disposed || current !== connectionEpoch) return false;
      aiPatch({ diagnostics: { ...state.ai.diagnostics, status: "ready", events: diagnostics.events } });
      return true;
    } catch {
      if (!disposed && current === connectionEpoch)
        aiPatch({ diagnostics: { ...state.ai.diagnostics, status: "unavailable", events: [] } });
      return false;
    } finally { diagnosticsBusy = false; }
  }
  function selectModel(model) {
    if (!state.ai.planEnabled || !state.ai.models.some((item) => item.slug === model) ||
        job || completedJob || disposed) return false;
    aiPatch({ model, result: null }); return true;
  }
  function setCostConsent(value) { if (disposed || job) return false; aiPatch({ costConsent: value === true }); return true; }
  async function readPageText() {
    if (!readArticle || disposed || pending || job || completedJob || !state.context || key() !== boundKey) return false;
    const current = epoch, snapshot = observed, expectedKey = boundKey;
    try {
      const article = await readArticle(snapshot);
      if (disposed || epoch !== current || key() !== expectedKey) return false;
      if (!article?.text || article.text.length > 4096 || UNSAFE.test(article.text) ||
          article.url !== state.context.currentSource?.url) {
        aiPatch({ article: null, articleText: "", status: "articleUnavailable" });
        return false;
      }
      aiPatch({ article: { url: article.url, documentId: article.documentId }, articleText: article.text,
        result: null, status: "articleReady" }); return true;
    } catch { if (!disposed && epoch === current) aiPatch({ article: null, articleText: "", status: "articleUnavailable" }); return false; }
  }
  function setArticleText(value) {
    if (disposed || job || completedJob || !state.ai.article || typeof value !== "string" || value.length > 4096 || UNSAFE.test(value)) return false;
    aiPatch({ articleText: value, result: null }); return true;
  }
  async function createInsights({ automatic = false } = {}) {
    if (automatic) {
      if (automaticStartBusy || completedJob || !readArticle || !eligible() || !state.ai.planEnabled ||
          !state.ai.models.some((item) => item.slug === state.ai.model) || job || pending) return false;
      automaticStartBusy = true;
      try {
        if ((!state.context || key() !== boundKey) && !prepare()) return false;
        if (!state.context?.currentSource) return false;
        aiPatch({ status: "preparingArticle", error: null, researchFailureDetail: null });
        if (!await readPageText()) return false;
        return await runInsights({ skipConsent: true });
      } finally { automaticStartBusy = false; }
    }
    if (automaticStartBusy || completedJob) return false;
    return runInsights({ skipConsent: false });
  }
  async function createFollowup(questionId) {
    if (disposed || pending || job || automaticStartBusy || !eligible() ||
        state.ai.result || state.draft ||
        !state.ai.planEnabled || !state.ai.models.some((item) => item.slug === state.ai.model)) return false;
    const root = observed.discussion.roots.find((entry) => entry.state === "visible" &&
      entry.actorType === "agent" && entry.insight?.kind === "generated" &&
      entry.replies.some((reply) => reply.id === questionId));
    const question = root?.replies.find((entry) => entry.id === questionId);
    if (!question || question.state !== "visible" || question.actorType !== "human" ||
        question.authorId !== observed.actorId || question.replyToId !== root.id ||
        root.body.length > 2_000 || question.body.length > 2_000) return false;
    if ((!state.context || key() !== boundKey) && !prepare()) return false;
    if (!state.context?.currentSource) return false;
    automaticStartBusy = true;
    try {
      aiPatch({ status: "preparingArticle", error: null, researchFailureDetail: null });
      if (!await readPageText()) return false;
      return await runInsights({ skipConsent: true, followup: {
        questionId, discussionId: observed.discussion.discussionId, rootId: root.id, replyToId: question.id,
      } });
    } finally { automaticStartBusy = false; }
  }
  async function runInsights({ skipConsent, followup = null }) {
    if (!aiClient || !attestArticle || disposed || job || completedJob || pending || !state.ai.planEnabled ||
        (!skipConsent && !state.ai.costConsent) ||
        !state.ai.models.some((item) => item.slug === state.ai.model) || !state.ai.articleText.trim() ||
        !state.ai.article || !state.context || key() !== boundKey) return false;
    const current = epoch, expectedKey = boundKey;
    const operationId = randomId(), actorId = observed.actorId;
    if (typeof operationId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(operationId)) return false;
    const abort = new AbortController(); job = { id: operationId, actorId, abort };
    aiPatch({ status: "generating", error: null, result: null, researchFailureDetail: null });
    let failureStatus = "generationFailed";
    let failureDetail = null;
    const active = () => !disposed && epoch === current && key() === expectedKey && job?.id === operationId;
    try {
      const request = { operationId, model: state.ai.model, context: structuredClone(state.context),
        excludedRelatedSourceIds: [...state.excludedRelatedSourceIds], articleText: state.ai.articleText,
        allowWebResearch: state.allowWebResearch, expected: { ...observed.catalog.version },
        ...(followup ? { followupQuestionId: followup.questionId } : {}) };
      await attestArticle(observed, state.ai.article);
      if (!active()) return false;
      await aiClient.start(request, actorId, { signal: abort.signal });
      const end = Date.now() + 95000;
      while (active() && Date.now() < end) {
        const outcome = await aiClient.result(operationId, actorId, { signal: abort.signal });
        if (!active()) return false;
        if (outcome.state === "failed") {
          failureDetail = RESEARCH_DETAILS.has(outcome.detail) ? outcome.detail : null;
          throw new Error(outcome.error ?? "provider-unavailable");
        }
        if (outcome.state === "completed") {
          const draft = formatInsightCitations(outcome.result.body, outcome.result.citations);
          review = null; job = null;
          // Keep the short-lived service result until Share or Discard so the
          // service can attest the exact generated body before publication.
          completedJob = { id: operationId, actorId, followup: followup ? {
            discussionId: followup.discussionId, rootId: followup.rootId, replyToId: followup.replyToId,
          } : null };
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
      if (active()) aiPatch({ status: failureStatus, result: null, researchFailureDetail: failureDetail });
      return false;
    } finally { if (job?.id === operationId) { cancelJob(); if (!disposed) aiPatch({ status: failureStatus }); } }
  }
  function cancelInsights() { if (!job) return false; cancelJob(); epoch++; aiPatch({ status: "cancelled", result: null }); return true; }
  function dispose() {
    cancelJob(); purgeCompleted(); epoch++; connectionEpoch++; invalidateModels();
    disposed = true; observed = null; boundKey = null; review = null;
    state = { available: false, context: null, excludedRelatedSourceIds: [], allowWebResearch: true,
      draft: "", preview: null, status: "idle", busy: false,
      ai: { connected: false, planEnabled: false, pending: false, account: null, models: [], model: "", costConsent: false, articleText: "", article: null,
        result: null, status: "idle", error: null, diagnostics: { status: "idle", events: [], localEvents: [] } } };
  }
  return Object.freeze({ observe, currentState, prepare, setRelatedSourceIncluded, setAllowWebResearch,
    setDraft, preview, share, discard, dispose,
    checkConnection, connect, disconnect, loadModels, loadDiagnostics, selectModel, setCostConsent,
    readPageText, setArticleText, createInsights, createFollowup, cancelInsights });
}
