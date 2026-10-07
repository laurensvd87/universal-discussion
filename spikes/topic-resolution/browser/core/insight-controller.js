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
  "response-no-text", "response-blank-text", "response-unsafe-text", "response-output-too-large", "response-excerpt-citation", "response-incomplete",
  "response-failed", "response-http-400"]);
const EXCERPT_FAILURES = ["noHostAccess", "fetchHttpRedirect", "sizeType", "parseShort"];
const LUNA_MODEL_SLUG = /^gpt-[0-9]+(?:\.[0-9]+)*-luna(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/u;
const GPT_6_LUNA_SLUG = /^gpt-6-luna(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/u;

function defaultListedModel(models) {
  return models.find((item) => typeof item?.slug === "string" && GPT_6_LUNA_SLUG.test(item.slug))?.slug ??
    models.find((item) => typeof item?.slug === "string" && LUNA_MODEL_SLUG.test(item.slug))?.slug ??
    models.at(-1)?.slug ?? "";
}

function fixedExcerptDiagnostic(value) {
  const bounded = (count) => Number.isInteger(count) && count >= 0 && count <= 4;
  if (!value || !bounded(value.eligible) || !bounded(value.attempted) || !bounded(value.accepted) ||
      value.accepted > value.attempted || value.attempted > value.eligible ||
      !EXCERPT_FAILURES.every((key) => bounded(value.failures?.[key]))) return null;
  const failures = Object.fromEntries(EXCERPT_FAILURES.map((key) => [key, value.failures[key]]));
  if (Object.values(failures).reduce((sum, count) => sum + count, 0) > value.eligible) return null;
  return { eligible: value.eligible, attempted: value.attempted, accepted: value.accepted, failures };
}

// The local catalog may be available before the current page resolves to a
// Topic. A one-shot startup check must wait for that later ready transition.
export function createInsightResumeGate(resume) {
  if (typeof resume !== "function") throw new TypeError("Invalid resume callback");
  let primed = false;
  let attemptedKey = null;
  return Object.freeze({
    prime() { primed = true; },
    observe(state, accountReady) {
      if (!primed || accountReady !== true || state?.phase !== "ready" || !state.catalog ||
          !state.topicId || !state.sourceId || !state.actorId) return false;
      const key = JSON.stringify([state.catalog.version.generation, state.topicId, state.sourceId, state.actorId,
        state.selection, state.resolution?.documentId ?? null]);
      if (key === attemptedKey) return false;
      attemptedKey = key;
      void Promise.resolve().then(resume).catch(() => {});
      return true;
    },
  });
}

// Private popup state only. Explicit actions invoke injected page/provider
// adapters; only final sharing persists the reviewed discussion text.
export function createInsightController({ shareInsight, onStateChange = () => {}, aiClient = null,
  readArticle = null, attestArticle = null, readRelatedExcerpts = null,
  loadRelatedTextPreference = async () => null, saveRelatedTextPreference = () => {}, openAuthorization = null,
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
  let manualModel = null;
  let diagnosticsBusy = false;
  let automaticStartBusy = false;
  let resumeBusy = false;
  let job = null;
  let completedJob = null;
  let relatedReadAbort = null;
  let relatedPreferenceTouched = false;
  const relatedPreferenceReady = Promise.resolve().then(loadRelatedTextPreference).then((value) => {
    if (!disposed && !relatedPreferenceTouched && typeof value === "boolean")
      publish({ relatedPageTextEnabled: value, relatedExcerptCount: null });
  }).catch(() => {
    if (!disposed && !relatedPreferenceTouched)
      publish({ relatedPageTextEnabled: false, relatedExcerptCount: null });
  });
  let state = { available: false, context: null, excludedRelatedSourceIds: [], allowWebResearch: true,
    relatedPageTextEnabled: true, relatedExcerptCount: null,
    draft: "", preview: null, status: "idle", busy: false,
    ai: { connected: false, planEnabled: false, pending: false, account: null, models: [], model: "", costConsent: false, articleText: "", article: null,
      result: null, status: "idle", error: null, failureStage: null, failureSubstage: null,
      modelFailureDetail: null, researchFailureDetail: null,
      diagnostics: { status: "idle", events: [], localEvents: [], relatedExcerpts: null } } };

  function eligible() {
    return observed?.phase === "ready" && !observed.busy && !observed.needsFreshRead &&
      observed.catalog?.actors.some((actor) => actor.id === observed.actorId && actor.type === "human") &&
      observed.discussion?.topic?.id === observed.topicId &&
      sameVersion(observed.catalog.version, observed.discussion.version) &&
      (!observed.related || sameVersion(observed.related.version, observed.catalog.version));
  }
  function contextKey(value) {
    const catalog = value?.catalog;
    if (!catalog?.version?.generation || !value.topicId || !value.actorId ||
        !Array.isArray(catalog.topics) || !Array.isArray(catalog.sources)) return null;
    const topic = catalog.topics.find((entry) => entry.id === value.topicId);
    const source = value.sourceId === null ? null : catalog.sources.find((entry) => entry.id === value.sourceId);
    if (!topic || value.sourceId !== null && (!source || source.topicId !== value.topicId)) return null;
    return JSON.stringify([catalog.version.generation, value.topicId, value.sourceId, value.actorId,
      value.selection, value.resolution?.documentId ?? null, topic.title,
      source?.url ?? null, source?.title ?? null]);
  }
  function key() {
    if (!eligible()) return null;
    return contextKey(observed);
  }
  function accountKey(account = state.ai.account) {
    return JSON.stringify([account?.clientId ?? null, account?.label ?? null]);
  }
  function materiallyChanged(value) {
    if (value?.phase === "disconnected" || value?.error === "context-changed") return true;
    const [generation, topicId, sourceId, actorId, selection, documentId] = JSON.parse(boundKey);
    if (value?.catalog?.version?.generation && value.catalog.version.generation !== generation) return true;
    if (value?.topicId && value.topicId !== topicId || value?.sourceId && value.sourceId !== sourceId ||
        value?.actorId && value.actorId !== actorId || value?.selection && value.selection !== selection ||
        value?.resolution?.documentId && value.resolution.documentId !== documentId) return true;
    const current = contextKey(value);
    // A coherent ready projection can prove a change. During connecting and
    // loading, the discussion controller temporarily drops the selection.
    return value?.phase === "ready" ? current !== boundKey : current !== null && current !== boundKey;
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
    publish({ context: null, excludedRelatedSourceIds: [], relatedExcerptCount: null, draft: "", preview: null, status, ai: { ...state.ai, articleText: "", article: null,
      result: null, costConsent: false, status: "idle", error: null, researchFailureDetail: null,
      diagnostics: { ...state.ai.diagnostics, relatedExcerpts: null } } });
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
  function detachJob() {
    // Closing a popup stops only its polling. The already-started local
    // service request may complete in RAM and be recovered on reopen.
    const previous = job; job = null;
    previous?.abort.abort();
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
    if (boundKey !== null && materiallyChanged(value)) clear("changed");
    else if (boundKey === null && eligible()) prepare();
    else publish();
  }
  function prepare({ includeDiscussion = false } = {}) {
    if (disposed || pending || job || completedJob || !eligible()) return false;
    try {
      const context = buildInsightContext({ ...observed, includeDiscussion: includeDiscussion === true });
      boundKey = key(); review = null;
      cancelJob(); purgeCompleted(); epoch++;
      publish({ context, excludedRelatedSourceIds: [], relatedExcerptCount: null, draft: "", preview: null, status: "prepared", ai: { ...state.ai, articleText: "", article: null,
        result: null, costConsent: false, status: "idle", error: null, researchFailureDetail: null,
        diagnostics: { ...state.ai.diagnostics, relatedExcerpts: null } } });
      return true;
    } catch { clear("failed"); return false; }
  }
  function setRelatedSourceIncluded(sourceId, included) {
    if (disposed || pending || job || automaticStartBusy || resumeBusy || !state.context ||
        ![...(state.context.sameTopicSources ?? []), ...(state.context.relatedSources ?? [])]
          .some((source) => source.id === sourceId) ||
        typeof included !== "boolean") return false;
    const excluded = new Set(state.excludedRelatedSourceIds);
    if (included) excluded.delete(sourceId); else excluded.add(sourceId);
    publish({ excludedRelatedSourceIds: [...excluded].sort() });
    return true;
  }
  function setAllowWebResearch(value) {
    if (disposed || pending || job || automaticStartBusy || resumeBusy || typeof value !== "boolean") return false;
    publish({ allowWebResearch: value });
    return true;
  }
  function setRelatedPageTextEnabled(value, { persist = true } = {}) {
    if (disposed || typeof value !== "boolean" || value && (pending || job || automaticStartBusy || resumeBusy)) return false;
    if (persist) relatedPreferenceTouched = true;
    if (!value) relatedReadAbort?.abort();
    publish({ relatedPageTextEnabled: value, relatedExcerptCount: null,
      ai: { ...state.ai, diagnostics: { ...state.ai.diagnostics, relatedExcerpts: null } } });
    if (persist) void Promise.resolve().then(() => saveRelatedTextPreference(value)).catch(() => {});
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
        !state.ai.connected || !state.ai.planEnabled ||
        !state.ai.result || state.draft !== formatInsightCitations(state.ai.result.body, state.ai.result.citations) ||
        !state.draft.trim() || UNSAFE.test(state.draft) || !completedJob ||
        completedJob.account !== accountKey()) return null;
    if (completedJob.followup) {
      const root = observed.discussion.roots.find((entry) => entry.id === completedJob.followup.rootId);
      const question = root?.replies.find((entry) => entry.id === completedJob.followup.replyToId);
      if (observed.discussion.discussionId !== completedJob.followup.discussionId ||
          root?.state !== "visible" || root.insight?.kind !== "generated" ||
          question?.state !== "visible" || question.actorType !== "human" ||
          question.authorId !== observed.actorId || question.replyToId !== root.id) return null;
    }
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
    let uncertain = false;
    try { success = await shareInsight(exactReview) === true; }
    catch { uncertain = true; /* An uncertain write is never retried automatically. */ }
    finally {
      pending = false;
      if (success) completedJob = null;
      if (!disposed) {
        if (!success && !uncertain && !observed?.needsFreshRead && key() === boundKey)
          publish({ status: "failed" });
        else clear(success ? "shared" : "failed");
      }
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
      if (accountChanged || !value.connected || !value.planEnabled) manualModel = null;
      if ((accountChanged || !value.connected || !value.planEnabled) && (job || completedJob)) clear("changed");
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
      manualModel = null;
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
    manualModel = null;
    const current = ++connectionEpoch;
    clear("changed"); connectionBusy = true; invalidateModels();
    aiPatch({ connected: false, planEnabled: false, pending: false, account: null, models: [], model: "",
      status: "disconnecting", failureStage: null, failureSubstage: null,
      diagnostics: { status: "idle", events: [], localEvents: [], relatedExcerpts: null } });
    let outcome;
    try { outcome = await aiClient.disconnect(); }
    catch { /* The local bridge may be unavailable. Clear private popup material anyway. */ }
    if (disposed || current !== connectionEpoch) return false;
    connectionBusy = false;
    aiPatch({ connected: false, planEnabled: false, pending: false, account: null, models: [], model: "",
      status: outcome?.revocationConfirmed === true ? "disconnected" : "disconnectedUnconfirmed" });
    return true;
  }
  async function loadModels({ afterUnavailable = false } = {}) {
    if (!aiClient || !state.ai.planEnabled || disposed || job || modelsBusy || connectionBusy) return false;
    const current = connectionEpoch, listEpoch = ++modelsEpoch;
    const recoveryEpoch = afterUnavailable ? epoch : null;
    const recoveryKey = afterUnavailable ? boundKey : null;
    const activeList = () => !disposed && current === connectionEpoch && listEpoch === modelsEpoch &&
      (!afterUnavailable || recoveryEpoch === epoch && recoveryKey === boundKey && !materiallyChanged(observed));
    modelsBusy = true; aiPatch({ status: "loadingModels", modelFailureDetail: null });
    try {
      const models = await aiClient.models();
      if (!activeList()) return false;
      if (manualModel && !models.some((item) => item.slug === manualModel)) manualModel = null;
      const selectedModel = manualModel ?? defaultListedModel(models);
      aiPatch({ models, model: selectedModel, status: models.length
        ? afterUnavailable ? "modelRefreshed" : "chooseModel" : "noModels",
        modelFailureDetail: null });
      recordLocalModelOutcome("success");
      return true;
    } catch (error) {
      if (activeList()) {
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
    manualModel = model;
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
    if (resumeBusy) return false;
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
    if (disposed || pending || job || automaticStartBusy || resumeBusy || !eligible() ||
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
    await relatedPreferenceReady;
    if (!aiClient || !attestArticle || disposed || job || completedJob || pending || !state.ai.planEnabled ||
        (!skipConsent && !state.ai.costConsent) ||
        !state.ai.models.some((item) => item.slug === state.ai.model) || !state.ai.articleText.trim() ||
        !state.ai.article || !state.context || key() !== boundKey) return false;
    const current = epoch, expectedKey = boundKey;
    const operationId = randomId(), actorId = observed.actorId;
    if (typeof operationId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(operationId)) return false;
    const abort = new AbortController(); job = { id: operationId, actorId, abort };
    aiPatch({ status: "generating", error: null, result: null, researchFailureDetail: null,
      diagnostics: { ...state.ai.diagnostics, relatedExcerpts: null } });
    let failureStatus = "generationFailed";
    let failureDetail = null;
    let refreshUnavailableModel = false;
    const active = () => !disposed && epoch === current && boundKey === expectedKey &&
      !materiallyChanged(observed) && job?.id === operationId;
    try {
      const request = { operationId, model: state.ai.model, context: structuredClone(state.context),
        excludedRelatedSourceIds: [...state.excludedRelatedSourceIds], articleText: state.ai.articleText,
        allowWebResearch: state.allowWebResearch, expected: { ...observed.catalog.version },
        ...(followup ? { followupQuestionId: followup.questionId } : {}) };
      if (state.relatedPageTextEnabled && readRelatedExcerpts) {
        aiPatch({ status: "fetchingRelated" });
        const excerptAbort = new AbortController();
        relatedReadAbort = excerptAbort;
        const cancelExcerpt = () => excerptAbort.abort();
        abort.signal.addEventListener("abort", cancelExcerpt, { once: true });
        let excerpts = [];
        let excerptDiagnostic = null;
        try {
          excerpts = await readRelatedExcerpts(request.context,
            request.excludedRelatedSourceIds, excerptAbort.signal,
            (value) => { excerptDiagnostic = fixedExcerptDiagnostic(value); });
        } catch (error) {
          if (state.relatedPageTextEnabled) throw error;
        } finally {
          abort.signal.removeEventListener("abort", cancelExcerpt);
          if (relatedReadAbort === excerptAbort) relatedReadAbort = null;
        }
        if (!active()) return false;
        if (state.relatedPageTextEnabled) {
          request.relatedExcerpts = excerpts;
          publish({ relatedExcerptCount: excerpts.length });
          if (excerptDiagnostic) aiPatch({ diagnostics: { ...state.ai.diagnostics,
            relatedExcerpts: excerptDiagnostic } });
        }
        aiPatch({ status: "generating" });
      }
      await attestArticle(observed, state.ai.article);
      if (!active()) return false;
      if (!state.relatedPageTextEnabled) {
        delete request.relatedExcerpts;
        publish({ relatedExcerptCount: null });
      }
      if (!eligible() || key() !== expectedKey) return false;
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
          completedJob = { id: operationId, actorId, account: accountKey(), followup: followup ? {
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
      if (active()) {
        refreshUnavailableModel = failureStatus === "modelUnavailable";
        aiPatch({ status: failureStatus, result: null, researchFailureDetail: failureDetail,
          ...(refreshUnavailableModel ? { models: [], model: "" } : {}) });
      }
      return false;
    } finally {
      if (job?.id === operationId) {
        cancelJob();
        if (!disposed && !refreshUnavailableModel) aiPatch({ status: failureStatus });
      }
      if (refreshUnavailableModel && !disposed && epoch === current && boundKey === expectedKey &&
          !materiallyChanged(observed))
        await loadModels({ afterUnavailable: true });
    }
  }
  async function resumeInsights() {
    if (!aiClient?.resumable || disposed || resumeBusy || modelsBusy || job || completedJob || pending ||
        !state.ai.planEnabled || !eligible()) return false;
    if ((!state.context || key() !== boundKey) && !prepare()) return false;
    const snapshot = observed, expectedKey = boundKey, current = epoch;
    const account = state.ai.account;
    const previousStatus = state.ai.status;
    let refreshUnavailableModel = false;
    resumeBusy = true;
    aiPatch({ status: "resuming" });
    const stillHere = () => !disposed && epoch === current && boundKey === expectedKey &&
      !materiallyChanged(observed) &&
      observed.actorId === snapshot.actorId && state.ai.planEnabled &&
      state.ai.account?.clientId === account?.clientId && state.ai.account?.label === account?.label;
    try {
      const resumable = await aiClient.resumable(snapshot.actorId);
      if (!stillHere() || !resumable ||
          resumable.expected?.generation !== snapshot.catalog.version.generation ||
          resumable.topicId !== snapshot.topicId ||
          resumable.originSourceId !== (snapshot.sourceId ?? null)) return false;
      const followup = resumable.replyToId === null ? null : {
        discussionId: resumable.discussionId, rootId: resumable.rootId, replyToId: resumable.replyToId,
      };
      if (followup && !snapshot.discussion.roots.some((root) => root.id === followup.rootId &&
          root.state === "visible" && root.insight?.kind === "generated" &&
          root.replies.some((reply) => reply.id === followup.replyToId && reply.state === "visible" &&
            reply.authorId === snapshot.actorId && reply.replyToId === root.id))) return false;
      const abort = new AbortController();
      job = { id: resumable.operationId, actorId: snapshot.actorId, abort };
      aiPatch({ status: "generating", error: null, result: null, researchFailureDetail: null });
      const active = () => stillHere() && job?.id === resumable.operationId;
      const end = Date.now() + 95000;
      while (active() && Date.now() < end) {
        const outcome = await aiClient.result(resumable.operationId, snapshot.actorId, { signal: abort.signal });
        if (!active()) return false;
        if (outcome.state === "failed") {
          const detail = RESEARCH_DETAILS.has(outcome.detail) ? outcome.detail : null;
          const failureStatus = RESEARCH_FAILURE_STATUS[outcome.error] ?? "generationFailed";
          refreshUnavailableModel = failureStatus === "modelUnavailable";
          aiPatch({ status: failureStatus, result: null, researchFailureDetail: detail,
            ...(refreshUnavailableModel ? { models: [], model: "" } : {}) });
          return false;
        }
        if (outcome.state === "completed") {
          const draft = formatInsightCitations(outcome.result.body, outcome.result.citations);
          job = null; review = null;
          completedJob = { id: resumable.operationId, actorId: snapshot.actorId, account: accountKey(), followup };
          publish({ draft, preview: null, status: "prepared", ai: { ...state.ai, result: outcome.result,
            status: "generated", costConsent: false } });
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (active()) aiPatch({ status: "researchTimeout" });
      return false;
    } catch {
      if (stillHere()) aiPatch({ status: "generationFailed", result: null });
      return false;
    } finally {
      resumeBusy = false;
      if (job && stillHere()) { detachJob(); }
      if (stillHere() && state.ai.status === "resuming") aiPatch({ status: previousStatus });
      if (refreshUnavailableModel && stillHere()) await loadModels({ afterUnavailable: true });
    }
  }
  function cancelInsights() { if (!job) return false; cancelJob(); epoch++; aiPatch({ status: "cancelled", result: null }); return true; }
  function dispose() {
    detachJob(); completedJob = null; epoch++; connectionEpoch++; invalidateModels();
    disposed = true; observed = null; boundKey = null; review = null;
    state = { available: false, context: null, excludedRelatedSourceIds: [], allowWebResearch: true,
      relatedPageTextEnabled: true, relatedExcerptCount: null,
      draft: "", preview: null, status: "idle", busy: false,
      ai: { connected: false, planEnabled: false, pending: false, account: null, models: [], model: "", costConsent: false, articleText: "", article: null,
        result: null, status: "idle", error: null, diagnostics: { status: "idle", events: [], localEvents: [] } } };
  }
  return Object.freeze({ observe, currentState, prepare, setRelatedSourceIncluded, setAllowWebResearch,
    setRelatedPageTextEnabled,
    setDraft, preview, share, discard, dispose,
    checkConnection, connect, disconnect, loadModels, loadDiagnostics, selectModel, setCostConsent,
    readPageText, setArticleText, createInsights, createFollowup, cancelInsights, resumeInsights });
}
