import { INSIGHT_EN } from "../locales/insight-en.js";
import { appendInsightCitationNodes, formatInsightCitations } from "../core/insight-citations.js";

const FAILURE_STAGE_MESSAGES = Object.freeze({
  "callback-invalid": "aiFailureCallbackInvalid",
  "callback-expired": "aiFailureCallbackExpired",
  "callback-busy": "aiFailureCallbackBusy",
  "token-exchange-rejected": "aiFailureTokenExchangeRejected",
  "token-exchange-failed": "aiFailureTokenExchangeFailed",
  "token-response-invalid": "aiFailureTokenResponseInvalid",
  "discovery-failed": "aiFailureDiscoveryFailed",
  "identity-verification-failed": "aiFailureIdentityVerificationFailed",
  "registration-failed": "aiFailureRegistrationFailed",
});
const IDENTITY_FAILURE_SUBSTAGE_MESSAGES = Object.freeze({
  "jwks-request-failed": "aiFailureJwksRequestFailed",
  "jwks-invalid": "aiFailureJwksInvalid",
  "token-header-invalid": "aiFailureTokenHeaderInvalid",
  "matching-key-invalid": "aiFailureMatchingKeyInvalid",
  "signature-invalid": "aiFailureSignatureInvalid",
  "claims-invalid": "aiFailureClaimsInvalid",
});
const RESEARCH_FAILURE_STATUSES = new Set(["generationFailed", "usageLimit", "modelUnavailable",
  "webResearchUnavailable", "authorizationExpired", "researchTimeout", "researchBusy", "cancelled", "articleUnavailable"]);
const MODEL_LIST_STATUSES = new Set(["loadingModels", "noModels", "modelListUnavailable",
  "modelListAccessRejected", "modelListRateLimited", "modelListTimedOut", "modelListInvalidResponse",
  "modelListProviderUnavailable", "modelListBusy"]);
const RESEARCH_DETAILS = new Set(["response-redirect", "response-content-type", "response-content-json",
  "response-content-html", "response-content-text", "response-content-missing", "response-content-other", "response-stream",
  "response-too-large", "response-encoding", "response-event", "response-no-final",
  "response-empty-output", "response-no-message", "response-output-empty", "response-search-only",
  "response-reasoning-only", "response-final-item-missing", "response-item-identity",
  "response-item-conflict", "response-item-prefix", "response-item-text", "response-stream-text-unfinalized",
  "response-message-unfinished", "response-refusal",
  "response-no-text", "response-blank-text", "response-unsafe-text", "response-output-too-large", "response-excerpt-citation", "response-incomplete",
  "response-web-citation", "response-web-evidence", "response-unsafe-url",
  "response-failed", "response-http-400"]);
const CONTENT_TYPE_MESSAGES = Object.freeze({
  "response-content-json": "aiResearchContentJson",
  "response-content-html": "aiResearchContentHtml",
  "response-content-text": "aiResearchContentText",
  "response-content-missing": "aiResearchContentMissing",
  "response-content-other": "aiResearchContentOther",
  "response-content-type": "aiResearchContentType",
  "response-web-evidence": "aiResearchWebEvidence",
});

export function mountInsightPanel(document, root, { messages = INSIGHT_EN } = {}) {
  const text = (key) => messages?.[key] ?? INSIGHT_EN[key];
  const handlers = [];
  let controller;
  let disposed = false;
  let contextSignature;
  let generationContext = null;
  let previousResultContext = null;
  let hadVisibleResult = false;
  let relatedSettingsSignature;
  let previousAccountReady;
  let renderedDraftSignature = null;
  function node(tag, key, id) {
    const item = document.createElement(tag);
    if (key) item.textContent = text(key);
    if (id) item.id = id;
    return item;
  }
  function listen(item, event, callback) {
    item.addEventListener(event, callback); handlers.push([item, event, callback]);
  }
  function button(parent, key, callback) {
    const item = node("button", key, `insight-${key}`); item.type = "button";
    listen(item, "click", callback); parent.append(item); return item;
  }
  const userHeading = node("h2", "title", "insight-user-heading"); userHeading.className = "user-only";
  userHeading.tabIndex = -1; root.append(userHeading);
  const details = node("details", null, "insight-workspace"); details.className = "compact-details insight-workspace";
  details.append(node("summary", "title"), node("p", "intro")); root.append(details);
  const status = node("p", null, "insight-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); details.append(status);
  const accountDetails = node("details", null, "insight-account-details"); accountDetails.className = "insight-subdetails";
  const accountSummary = node("summary", "accountWorkspace"); accountDetails.append(accountSummary); details.append(accountDetails);
  const aiStatus = node("p", null, "insight-ai-status"); aiStatus.setAttribute("role", "status"); details.append(aiStatus);
  const inlineProgress = node("p", null, "insight-followup-progress");
  inlineProgress.setAttribute("role", "status"); inlineProgress.setAttribute("aria-live", "polite");
  inlineProgress.hidden = true; details.append(inlineProgress);
  const include = node("input", null, "insight-include-discussion"); include.type = "checkbox"; include.checked = false;
  const includeLabel = node("label", "includeDiscussion"); includeLabel.htmlFor = include.id;
  const sourceDetails = node("details", null, "insight-source-details"); sourceDetails.className = "insight-subdetails";
  sourceDetails.append(node("summary", "sourceWorkspace"), includeLabel, include); details.append(sourceDetails);
  const relatedSettings = node("details", null, "insight-related-settings");
  relatedSettings.className = "insight-subdetails";
  relatedSettings.append(node("summary", "relatedSettings"));
  relatedSettings.append(node("p", "relatedSettingsScope"));
  const relatedPageText = node("input", null, "insight-related-page-text");
  relatedPageText.type = "checkbox"; relatedPageText.checked = true;
  const relatedPageTextLabel = node("label", "relatedPageText"); relatedPageTextLabel.htmlFor = relatedPageText.id;
  relatedSettings.append(relatedPageTextLabel, relatedPageText);
  listen(relatedPageText, "change", () => controller?.setRelatedPageTextEnabled(relatedPageText.checked));
  const relatedExcerptSummary = node("p", null, "insight-related-excerpt-summary");
  relatedSettings.append(relatedExcerptSummary);
  const relatedChoices = node("div", null, "insight-related-choices");
  relatedSettings.append(relatedChoices); root.append(relatedSettings);
  listen(relatedChoices, "change", (event) => {
    if (event.target?.type === "checkbox") controller?.setRelatedSourceIncluded(event.target.value, event.target.checked);
  });
  const prepare = button(details, "prepare", () => controller?.prepare({ includeDiscussion: include.checked }));
  const aiControls = node("section", null, "insight-ai-controls"); details.append(aiControls);
  const nextStep = node("p", null, "insight-next-step");
  nextStep.setAttribute("role", "status"); nextStep.setAttribute("aria-live", "polite");
  aiControls.append(nextStep);
  const connect = button(accountDetails, "connect", () => { void controller?.connect(); });
  const check = button(accountDetails, "checkConnection", () => { void controller?.checkConnection(); });
  const disconnect = button(accountDetails, "disconnect", () => { void controller?.disconnect(); });
  const accountSwitchHint = node("p", "accountSwitchHint", "insight-account-switch-hint");
  accountDetails.append(accountSwitchHint);
  const models = button(accountDetails, "loadModels", () => { void controller?.loadModels(); });
  const modelLabel = node("label", "model"); modelLabel.htmlFor = "insight-model";
  const model = node("select", null, "insight-model");
  const modelStatus = node("p", null, "insight-model-status");
  modelStatus.setAttribute("role", "status"); modelStatus.setAttribute("aria-live", "polite");
  listen(model, "change", () => controller?.selectModel(model.value));
  const diagnostics = node("details", null, "insight-diagnostics");
  diagnostics.className = "insight-subdetails developer-only";
  diagnostics.append(node("summary", "diagnostics"));
  const loadDiagnostics = button(diagnostics, "loadDiagnostics", () => { void controller?.loadDiagnostics?.(); });
  const diagnosticStatus = node("p", null, "insight-diagnostics-status");
  diagnosticStatus.setAttribute("role", "status"); diagnosticStatus.setAttribute("aria-live", "polite");
  const localDiagnosticHeading = node("h4", "diagnosticsExtension");
  const localDiagnosticEvents = node("ul", null, "insight-local-diagnostics-events");
  const relatedExcerptDiagnostics = node("p", null, "insight-related-excerpt-diagnostics");
  relatedExcerptDiagnostics.hidden = true;
  const serviceDiagnosticHeading = node("h4", "diagnosticsService");
  const diagnosticEvents = node("ul", null, "insight-diagnostics-events");
  diagnostics.append(diagnosticStatus, localDiagnosticHeading, localDiagnosticEvents, relatedExcerptDiagnostics,
    serviceDiagnosticHeading, diagnosticEvents); details.append(diagnostics);
  const usage = node("p", "usingChatgptPlan", "insight-plan-usage");
  const manageUsage = node("a", "manageUsage", "insight-manage-usage");
  manageUsage.href = "https://chatgpt.com/settings/usage";
  manageUsage.target = "_blank"; manageUsage.rel = "noopener noreferrer";
  manageUsage.referrerPolicy = "no-referrer";
  const usageSeparator = node("span"); usageSeparator.textContent = " · ";
  usage.append(usageSeparator, manageUsage);
  const read = button(aiControls, "readPageText", () => { void controller?.readPageText(); });
  const articleLabel = node("label", "articleText"); articleLabel.htmlFor = "insight-article-text";
  const article = node("textarea", null, "insight-article-text"); article.maxLength = 4096; article.rows = 6;
  const articleWarning = node("p", "articleWarning"); articleWarning.className = "insight-warning";
  aiControls.append(articleLabel, article, articleWarning);
  listen(article, "input", () => controller?.setArticleText(article.value));
  const cost = node("input", null, "insight-cost-consent"); cost.type = "checkbox";
  const costLabel = node("label", "costConsent"); costLabel.htmlFor = cost.id;
  aiControls.append(costLabel, cost);
  const aiScope = node("p", "aiScope"); aiScope.className = "insight-send-scope"; aiControls.append(aiScope);
  listen(cost, "change", () => controller?.setCostConsent(cost.checked));
  const quickActions = node("div", null, "insight-quick-actions");
  quickActions.className = "insight-quick-actions";
  quickActions.append(modelLabel, model, modelStatus);
  const create = button(quickActions, "createInsights", () => {
    void controller?.createInsights({ automatic: document.body?.dataset?.uiMode === "user" });
  });
  const quickStatus = node("p", null, "insight-quick-status");
  quickStatus.setAttribute("role", "status"); quickStatus.setAttribute("aria-live", "polite");
  quickActions.append(quickStatus, usage);
  details.insertBefore(quickActions, accountDetails);
  const cancel = button(aiControls, "cancelInsights", () => controller?.cancelInsights());
  const account = node("p", null, "insight-ai-account"); account.className = "developer-only"; accountDetails.append(account);
  const context = node("section", null, "insight-context"); context.hidden = true; sourceDetails.append(context);
  const draftDetails = node("details", null, "insight-draft-details"); draftDetails.className = "insight-subdetails";
  const draftSummary = node("summary", "draftWorkspace"); draftDetails.append(draftSummary); details.append(draftDetails);
  const composer = node("section", null, "insight-composer"); composer.hidden = true; draftDetails.append(composer);
  const draftHint = node("p", null, "insight-draft-hint"); composer.append(draftHint);
  const privateDraftLabel = node("p", "uiPrivateInsightDraft", "insight-private-label"); composer.append(privateDraftLabel);
  const target = node("p", null, "insight-preview-topic"); composer.append(target);
  const origin = node("p", null, "insight-preview-origin"); composer.append(origin);
  const citations = node("p", null, "insight-citations"); citations.className = "insight-body"; composer.append(citations);
  const currentPageOnly = node("p", "currentPageOnly", "insight-current-page-only");
  currentPageOnly.className = "insight-source-note"; currentPageOnly.hidden = true;
  composer.append(currentPageOnly);
  const relatedExcerptIndicator = node("p", null, "insight-related-excerpt-indicator");
  composer.append(relatedExcerptIndicator);
  const shareScope = node("p", "shareScope", "insight-share-scope");
  composer.append(shareScope);
  const share = button(composer, "share", () => { void controller?.share(); });
  const discard = button(composer, "discard", () => controller?.discard());

  function sourceGroup(parent, key, sources) {
    parent.append(node("h4", key));
    if (!sources.length) { parent.append(node("p", "none")); return; }
    const list = node("ul"); list.className = "insight-sources";
    for (const source of sources) {
      const item = node("li"); const title = node("p"); title.textContent = source.title;
      const url = node("p"); url.className = "source-url"; url.textContent = source.url;
      item.append(title, url); list.append(item);
    }
    parent.append(list);
  }
  function render(state) {
    if (disposed) return;
    const inlineFollowup = document.body?.dataset?.uiMode === "user" && Boolean(state.followup);
    const progress = state.status === "sharing" ? "sharing" :
      { preparingArticle: "creatingInsights", fetchingRelated: "aiFetchingRelated",
        generating: "creatingInsights", resuming: "resumingInsights" }[state.ai?.status];
    inlineProgress.hidden = !(inlineFollowup || document.body?.dataset?.uiMode === "user" && state.status === "sharing") || !progress;
    inlineProgress.textContent = inlineProgress.hidden ? "" : text(progress);
    if (inlineFollowup || document.body?.dataset?.uiMode === "user" && state.status === "sharing") details.open = true;
    const blocked = !state.available || state.busy;
    status.textContent = text(state.status === "idle" && !state.available ? "unavailable" : state.status);
    include.disabled = prepare.disabled = blocked;
    context.hidden = !state.context;
    let exactGenerated = false;
    try {
      exactGenerated = Boolean(state.context && state.ai?.result && state.draft?.trim() &&
        state.draft === formatInsightCitations(state.ai.result.body, state.ai.result.citations));
    } catch { /* An invalid result cannot be offered for sharing. */ }
    const resultContext = state.context?.topic?.id && state.context?.currentSource?.id
      ? `${state.context.topic.id}:${state.context.currentSource.id}` : null;
    if (resultContext !== previousResultContext) {
      hadVisibleResult = false;
      generationContext = null;
    }
    if (["preparingArticle", "generating"].includes(state.ai?.status) && resultContext) generationContext = resultContext;
    if (exactGenerated && !hadVisibleResult && generationContext === resultContext &&
        document.body?.dataset?.uiMode === "user") {
      composer.className = "is-new";
      generationContext = null;
    } else if (!exactGenerated) composer.className = "";
    hadVisibleResult = exactGenerated;
    previousResultContext = resultContext;
    draftDetails.hidden = composer.hidden = !exactGenerated ||
      document.body?.dataset?.uiMode === "user" && state.status === "sharing";
    discard.disabled = state.busy;
    const signature = JSON.stringify(state.context);
    if (signature !== contextSignature) {
      context.replaceChildren(); contextSignature = signature;
      if (state.context) {
        const value = state.context;
        const topic = node("p"); topic.textContent = text("selected").replace("{title}", value.topic.title);
        context.append(node("h3", "context"), topic, node("p", "scope"), node("p", "goal"));
        sourceGroup(context, "current", value.currentSource ? [value.currentSource] : []);
        sourceGroup(context, "same", value.sameTopicSources);
        sourceGroup(context, "related", value.relatedSources);
        if (value.discussion.length) {
          context.append(node("h4", "discussion"));
          for (const entry of value.discussion) { const excerpt = node("blockquote"); excerpt.textContent = entry.body; context.append(excerpt); }
        }
        context.append(node("p", "limited"));
      }
    }
    const sourceChoices = [...(state.context?.sameTopicSources ?? []), ...(state.context?.relatedSources ?? [])]
      .filter((source, index, all) => source.id !== state.context?.currentSource?.id &&
        all.findIndex((candidate) => candidate.id === source.id) === index);
    relatedSettings.hidden = !state.context;
    relatedPageText.checked = state.relatedPageTextEnabled !== false;
    // Switching this off remains available while an Insight is preparing or reading pages.
    relatedPageText.disabled = !relatedPageText.checked &&
      (state.busy || ["generating", "fetchingRelated", "preparingArticle"].includes(state.ai?.status));
    relatedExcerptSummary.hidden = state.relatedExcerptCount === null || state.relatedExcerptCount === undefined;
    relatedExcerptSummary.textContent = relatedExcerptSummary.hidden ? "" :
      text("relatedExcerptCount").replace("{count}", String(state.relatedExcerptCount));
    const relatedSignature = JSON.stringify(sourceChoices);
    if (relatedSignature !== relatedSettingsSignature) {
      relatedSettingsSignature = relatedSignature;
      relatedChoices.replaceChildren();
      for (const source of sourceChoices) {
        const choice = node("input"); choice.type = "checkbox"; choice.value = source.id;
        const caption = node("span"); caption.textContent = source.title;
        const label = node("label"); label.className = "related-source-choice";
        label.append(choice, caption); relatedChoices.append(label);
      }
    }
    const excludedRelatedSourceIds = new Set(state.excludedRelatedSourceIds ?? []);
    Array.from(relatedChoices.children).forEach((label, index) => {
      label.children[0].checked = !excludedRelatedSourceIds.has(sourceChoices[index]?.id);
      label.children[0].disabled = state.busy ||
        ["generating", "fetchingRelated", "preparingArticle", "resuming"].includes(state.ai?.status);
    });
    shareScope.textContent = text("shareScope");
    share.textContent = text("share");
    const simplePreview = document.body?.dataset?.uiMode === "user";
    for (const decoration of [draftSummary, draftHint, target, origin, shareScope]) decoration.hidden = simplePreview;
    privateDraftLabel.hidden = !simplePreview;
    target.textContent = exactGenerated ? text("selected").replace("{title}", state.context.topic.title) : "";
    origin.textContent = !exactGenerated ? "" : state.context.currentSource?.title
      ? text("origin").replace("{title}", `${state.context.currentSource.title} — ${state.context.currentSource.url ?? ""}`) : text("noOrigin");
    const draftSignature = exactGenerated ? JSON.stringify([
      state.draft, state.context.topic, state.context.currentSource,
    ]) : null;
    if (draftSignature !== renderedDraftSignature) {
      appendInsightCitationNodes(document, citations, exactGenerated ? state.draft : "", text("citationOpen"),
        text("citationUnverifiedOpen"), text("citationUnverifiedNote"));
      renderedDraftSignature = draftSignature;
    }
    const acceptedCitations = state.ai?.result?.citations;
    const currentSourceUrl = state.context?.currentSource?.url;
    currentPageOnly.hidden = !exactGenerated || !Array.isArray(acceptedCitations) ||
      acceptedCitations.length > 0 && (typeof currentSourceUrl !== "string" ||
        acceptedCitations.some((citation) => citation?.url !== currentSourceUrl));
    relatedExcerptIndicator.hidden = simplePreview || !exactGenerated || state.relatedExcerptCount === null ||
      state.relatedExcerptCount === undefined;
    relatedExcerptIndicator.textContent = relatedExcerptIndicator.hidden ? "" :
      text("relatedExcerptCount").replace("{count}", String(state.relatedExcerptCount));
    share.disabled = blocked || !exactGenerated;
    const ai = state.ai ?? { connected: false, planEnabled: false, pending: false, models: [], model: "", articleText: "", article: null,
      costConsent: false, result: null, status: "idle" };
    const accountReady = ai.planEnabled && !!ai.model;
    accountDetails.setAttribute("data-ready", String(accountReady));
    if (document.body?.dataset?.uiMode === "user" && accountReady && previousAccountReady === false) accountDetails.open = false;
    previousAccountReady = accountReady;
    accountSummary.textContent = text(ai.pending ? "accountConnecting" : ai.connected ?
      ai.planEnabled ? ai.model ? "accountModelSelected" : "accountChooseModel" : "accountPlanUnavailable" :
      "accountDisconnected");
    accountSwitchHint.hidden = !ai.connected;
    usage.hidden = !ai.planEnabled && ai.status !== "usageLimit";
    const generating = ai.status === "generating" || ai.status === "fetchingRelated";
    const resuming = ai.status === "resuming";
    const aiPending = generating || resuming || ai.status === "preparingArticle" ||
      ai.status === "disconnecting" || ai.status === "loadingModels";
    include.disabled ||= generating || resuming;
    prepare.disabled ||= generating || resuming;
    share.disabled ||= generating || resuming;
    discard.disabled ||= generating || resuming;
    const generatedDraft = exactGenerated;
    details.setAttribute("data-has-result", String(exactGenerated));
    quickActions.setAttribute("data-phase", generating || resuming ? "generating" : "idle");
    quickActions.setAttribute("aria-busy", String(generating || resuming));
    create.textContent = text(resuming ? "resumingInsights" : generating ? "creatingInsights" : "createInsights");
    composer.setAttribute("data-phase", state.status === "sharing" ? "sharing" : "idle");
    composer.setAttribute("aria-busy", String(state.status === "sharing"));
    const workspaceOrder = [...details.children];
    if (generatedDraft && workspaceOrder[workspaceOrder.indexOf(draftDetails) + 1] !== quickActions)
      details.insertBefore(draftDetails, quickActions);
    else if (!generatedDraft && workspaceOrder.at(-1) !== draftDetails) details.append(draftDetails);
    draftDetails.setAttribute("data-has-draft", String(exactGenerated));
    draftSummary.textContent = text(generatedDraft ? "draftWorkspaceGenerated" : "draftWorkspace");
    draftHint.textContent = text(generatedDraft ? "hint" : generating || resuming ? "draftGenerating" :
      RESEARCH_FAILURE_STATUSES.has(ai.status) ? "draftResearchFailed" : "draftManualHint");
    if (exactGenerated) draftDetails.open = true;
    if (generating || resuming) draftDetails.open = false;
    const stageMessage = ai.status === "connectionFailed" && Object.hasOwn(FAILURE_STAGE_MESSAGES, ai.failureStage)
      ? FAILURE_STAGE_MESSAGES[ai.failureStage] : null;
    const substageMessage = ai.status === "connectionFailed" && ai.failureStage === "identity-verification-failed" &&
      Object.hasOwn(IDENTITY_FAILURE_SUBSTAGE_MESSAGES, ai.failureSubstage)
      ? IDENTITY_FAILURE_SUBSTAGE_MESSAGES[ai.failureSubstage] : null;
    aiStatus.textContent = text(substageMessage ?? stageMessage ??
      `ai${ai.status?.[0]?.toUpperCase() ?? "I"}${ai.status?.slice(1) ?? "dle"}`) ?? ai.status;
    if (RESEARCH_FAILURE_STATUSES.has(ai.status) && RESEARCH_DETAILS.has(ai.researchFailureDetail)) {
      const contentMessage = CONTENT_TYPE_MESSAGES[ai.researchFailureDetail];
      if (contentMessage) aiStatus.textContent = document.body?.dataset?.uiMode === "user"
        ? text(contentMessage) : `${aiStatus.textContent} ${text(contentMessage)}`;
      aiStatus.textContent += ` ${text("researchFailureCode").replace("{code}", ai.researchFailureDetail)}`;
    }
    aiStatus.setAttribute("data-state", ai.pending ? "connecting" : ai.planEnabled ? "connected" : "disconnected");
    aiStatus.setAttribute("data-attention", String(["connecting", "connectionFailed", "disconnectedUnconfirmed",
      "planUnavailable", "unavailable"].includes(ai.status)));
    quickStatus.hidden = !RESEARCH_FAILURE_STATUSES.has(ai.status) && !MODEL_LIST_STATUSES.has(ai.status) &&
      !["preparingArticle", "fetchingRelated", "modelRefreshed"].includes(ai.status);
    quickStatus.textContent = quickStatus.hidden ? "" :
      ai.status === "usageLimit" && document.body?.dataset?.uiMode === "user" ? text("usageLimitBrief") :
        ai.status === "fetchingRelated" ? text("aiFetchingRelated") : aiStatus.textContent;
    quickStatus.setAttribute("data-state", ["preparingArticle", "fetchingRelated", "loadingModels"].includes(ai.status) ? "preparing" :
      ai.status === "modelRefreshed" ? "ready" : "failed");
    quickActions.hidden = document.body?.dataset?.uiMode === "user" && quickStatus.hidden;
    nextStep.textContent = text(!state.context ? "nextPrepare" : resuming ? "nextResuming" : generating ? "nextGenerating" :
      RESEARCH_FAILURE_STATUSES.has(ai.status) ? "nextResearchFailed" :
      generatedDraft ? "nextReviewDraft" : !ai.planEnabled ? "nextConnect" :
      !ai.models.length ? "nextListModels" : !ai.model ? "nextChooseModel" :
      !ai.article ? "nextReadPage" : !ai.articleText?.trim() ? "nextEnterPageText" :
      !ai.costConsent ? "nextReviewConsent" : "nextCreateInsights");
    modelStatus.hidden = document.body?.dataset?.uiMode === "user" || !MODEL_LIST_STATUSES.has(ai.status);
    const allowedDetails = new Set(["catalog-redirect", "catalog-content-type", "catalog-body",
      "catalog-too-large", "catalog-stream", "catalog-encoding", "catalog-json", "catalog-shape", "catalog-entry"]);
    modelStatus.textContent = modelStatus.hidden ? "" :
      text(`ai${ai.status[0].toUpperCase()}${ai.status.slice(1)}`);
    if (!modelStatus.hidden && ai.status === "modelListInvalidResponse" && allowedDetails.has(ai.modelFailureDetail)) {
      modelStatus.textContent += ` ${text("modelFailureCode").replace("{code}", ai.modelFailureDetail)}`;
    }
    account.textContent = ai.account?.label ? text("connectedAccount").replace("{label}", ai.account.label) : "";
    const diagnostic = ai.diagnostics;
    const diagnosticState = ["idle", "loading", "ready", "unavailable"].includes(diagnostic?.status)
      ? diagnostic.status : "idle";
    diagnosticStatus.textContent = text({ idle: "diagnosticsIdle", loading: "diagnosticsLoading",
      ready: "diagnosticsReady", unavailable: "diagnosticsUnavailable" }[diagnosticState]);
    loadDiagnostics.disabled = diagnosticState === "loading" || state.busy;
    const allowedOutcomes = new Set(["success", "access-rejected", "rate-limited", "timed-out",
      "invalid-response", "provider-unavailable", "busy"]);
    const insightOutcomes = new Set(["success", "invalid-input", "model-unavailable", "unauthorized",
      "rate-limit", "busy", "timeout", "cancelled", "provider-unavailable", "invalid-response",
      "unsupported-capability"]);
    const fixedEvents = (events, local = false) => {
      const items = [];
      if (!Array.isArray(events)) return items;
      for (const event of events.slice(-12)) {
        if (event?.kind === "models") {
          if (!(allowedOutcomes.has(event.outcome) || local && event.outcome === "local-error")) continue;
          const detail = event.outcome === "invalid-response" && allowedDetails.has(event.detail) ? ` · ${event.detail}` : "";
          const item = node("li"); item.textContent = `models · ${event.outcome}${detail}`; items.push(item);
        } else if (!local && event?.kind === "insight" && insightOutcomes.has(event.outcome)) {
          const detail = RESEARCH_DETAILS.has(event.detail) ? ` · ${event.detail}` : "";
          const item = node("li"); item.textContent = `insight · ${event.outcome}${detail}`; items.push(item);
        }
      }
      return items;
    };
    localDiagnosticEvents.replaceChildren(...fixedEvents(diagnostic?.localEvents, true));
    diagnosticEvents.replaceChildren(...(diagnosticState === "ready" ? fixedEvents(diagnostic?.events) : []));
    const excerpt = diagnostic?.relatedExcerpts;
    const bounded = (count) => Number.isInteger(count) && count >= 0 && count <= 4;
    const failures = excerpt?.failures;
    const showExcerptDiagnostics = document.body?.dataset?.uiMode !== "user" &&
      bounded(excerpt?.eligible) && bounded(excerpt?.attempted) && bounded(excerpt?.accepted) &&
      excerpt.accepted <= excerpt.attempted && excerpt.attempted <= excerpt.eligible &&
      [failures?.noHostAccess, failures?.fetchHttpRedirect, failures?.sizeType, failures?.parseShort].every(bounded) &&
      failures.noHostAccess + failures.fetchHttpRedirect + failures.sizeType + failures.parseShort <= excerpt.eligible;
    relatedExcerptDiagnostics.hidden = !showExcerptDiagnostics;
    relatedExcerptDiagnostics.textContent = showExcerptDiagnostics
      ? text("relatedExcerptDiagnostics")
        .replace("{eligible}", String(excerpt.eligible))
        .replace("{attempted}", String(excerpt.attempted))
        .replace("{accepted}", String(excerpt.accepted))
        .replace("{noHostAccess}", String(failures.noHostAccess))
        .replace("{fetchHttpRedirect}", String(failures.fetchHttpRedirect))
        .replace("{sizeType}", String(failures.sizeType))
        .replace("{parseShort}", String(failures.parseShort)) : "";
    connect.disabled = ai.connected && ai.planEnabled || ai.pending || aiPending || state.busy;
    check.disabled = aiPending || state.busy;
    disconnect.disabled = (!ai.connected && !ai.pending) || ai.status === "disconnecting";
    models.disabled = !ai.planEnabled || aiPending || state.busy;
    const priorModel = model.value;
    const signatureModels = JSON.stringify(ai.models);
    if (model.dataset?.signature !== signatureModels) {
      model.replaceChildren();
      const blank = node("option"); blank.value = ""; blank.textContent = text("chooseModel"); model.append(blank);
      for (const option of ai.models) { const entry = node("option"); entry.value = option.slug; entry.textContent = option.displayName; model.append(entry); }
      if (model.dataset) model.dataset.signature = signatureModels;
    }
    model.value = ai.model || (priorModel && ai.models.some((item) => item.slug === priorModel) ? priorModel : "");
    model.disabled = !ai.planEnabled || !ai.models.length || aiPending || state.busy || Boolean(ai.result);
    read.disabled = !state.context?.currentSource || blocked || aiPending || Boolean(ai.result);
    article.disabled = !ai.article || generating || Boolean(ai.result);
    if (article.value !== ai.articleText) article.value = ai.articleText;
    cost.checked = ai.costConsent;
    cost.disabled = !ai.planEnabled || generating;
    const automatic = document.body?.dataset?.uiMode === "user";
    create.disabled = !ai.planEnabled || !ai.model || blocked || aiPending || Boolean(ai.result) ||
      (automatic ? !state.context?.currentSource : !ai.articleText?.trim() || !ai.costConsent);
    cancel.disabled = cancel.hidden = !generating;
    articleLabel.hidden = article.hidden = articleWarning.hidden = !ai.article;
    costLabel.hidden = cost.hidden = aiScope.hidden = !ai.article;
  }
  function bind(value) { controller = value; render(controller.currentState()); }
  function dispose() {
    disposed = true; controller = null; article.value = ""; context.replaceChildren(); citations.replaceChildren(); citations.textContent = ""; renderedDraftSignature = null; account.textContent = "";
    target.textContent = origin.textContent = "";
    for (const [item, event, callback] of handlers) item.removeEventListener(event, callback);
  }
  return Object.freeze({ bind, render, dispose });
}
