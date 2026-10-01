import { INSIGHT_EN } from "../locales/insight-en.js";
import { inspectPageUrl } from "../core/page-content-policy.js";

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

export function mountInsightPanel(document, root, { messages = INSIGHT_EN } = {}) {
  const text = (key) => messages?.[key] ?? INSIGHT_EN[key];
  const handlers = [];
  let controller;
  let disposed = false;
  let contextSignature;
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
  const details = node("details", null, "insight-workspace"); details.className = "compact-details insight-workspace";
  details.append(node("summary", "title"), node("p", "intro")); root.append(details);
  const status = node("p", null, "insight-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); details.append(status);
  const include = node("input", null, "insight-include-discussion"); include.type = "checkbox"; include.checked = false;
  const includeLabel = node("label", "includeDiscussion"); includeLabel.htmlFor = include.id;
  const sourceDetails = node("details", null, "insight-source-details"); sourceDetails.className = "insight-subdetails";
  sourceDetails.append(node("summary", "sourceWorkspace"), includeLabel, include); details.append(sourceDetails);
  const prepare = button(details, "prepare", () => controller?.prepare({ includeDiscussion: include.checked }));
  const aiControls = node("section", null, "insight-ai-controls"); details.append(aiControls);
  const accountDetails = node("details", null, "insight-account-details"); accountDetails.className = "insight-subdetails";
  const accountSummary = node("summary", "accountWorkspace"); accountDetails.append(accountSummary); aiControls.append(accountDetails);
  const connect = button(accountDetails, "connect", () => { void controller?.connect(); });
  const check = button(accountDetails, "checkConnection", () => { void controller?.checkConnection(); });
  const disconnect = button(accountDetails, "disconnect", () => { void controller?.disconnect(); });
  const models = button(accountDetails, "loadModels", () => { void controller?.loadModels(); });
  const modelLabel = node("label", "model"); modelLabel.htmlFor = "insight-model";
  const model = node("select", null, "insight-model"); accountDetails.append(modelLabel, model);
  const modelStatus = node("p", null, "insight-model-status");
  modelStatus.setAttribute("role", "status"); modelStatus.setAttribute("aria-live", "polite");
  accountDetails.append(modelStatus);
  listen(model, "change", () => controller?.selectModel(model.value));
  const usage = node("p", "usingChatgptPlan", "insight-plan-usage");
  const manageUsage = node("a", "manageUsage", "insight-manage-usage");
  manageUsage.href = "https://chatgpt.com/settings/usage";
  manageUsage.target = "_blank"; manageUsage.rel = "noopener noreferrer";
  manageUsage.referrerPolicy = "no-referrer";
  const usageSeparator = node("span"); usageSeparator.textContent = " · ";
  usage.append(usageSeparator, manageUsage); aiControls.append(usage);
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
  const create = button(aiControls, "createInsights", () => { void controller?.createInsights(); });
  const cancel = button(aiControls, "cancelInsights", () => controller?.cancelInsights());
  const aiStatus = node("p", null, "insight-ai-status"); aiStatus.setAttribute("role", "status"); aiControls.append(aiStatus);
  const account = node("p", null, "insight-ai-account"); accountDetails.append(account);
  const citations = node("section", null, "insight-citations"); aiControls.append(citations);
  const context = node("section", null, "insight-context"); context.hidden = true; sourceDetails.append(context);
  const draftDetails = node("details", null, "insight-draft-details"); draftDetails.className = "insight-subdetails";
  const draftSummary = node("summary", "draftWorkspace"); draftDetails.append(draftSummary); details.append(draftDetails);
  const composer = node("section", null, "insight-composer"); composer.hidden = true; draftDetails.append(composer);
  composer.append(node("p", "hint"));
  const body = node("textarea", null, "insight-body"); body.maxLength = 8_000; body.rows = 7;
  const label = node("label", "draft"); label.htmlFor = body.id; composer.append(label, body);
  listen(body, "input", () => controller?.setDraft(body.value));
  const review = button(composer, "review", () => controller?.preview());
  const discard = button(composer, "discard", () => controller?.discard());
  const preview = node("section", null, "insight-preview"); preview.className = "insight-preview"; preview.hidden = true;
  const target = node("p", null, "insight-preview-topic");
  const provenance = node("p", null, "insight-preview-provenance");
  const origin = node("p", null, "insight-preview-origin");
  const exactBody = node("p", null, "insight-preview-body"); exactBody.className = "insight-body";
  preview.append(node("h3", "preview"), target, provenance, origin, node("p", "shareScope"), exactBody);
  const share = button(preview, "share", () => { void controller?.share(); }); draftDetails.append(preview);

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
    const blocked = !state.available || state.busy;
    status.textContent = text(state.status === "preview" ? "previewStatus" :
      state.status === "idle" && !state.available ? "unavailable" : state.status);
    include.disabled = prepare.disabled = blocked;
    context.hidden = composer.hidden = !state.context;
    if (body.value !== state.draft) body.value = state.draft;
    body.disabled = blocked;
    review.disabled = blocked || !state.draft.trim();
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
    preview.hidden = !state.preview;
    target.textContent = state.preview ? text("selected").replace("{title}", state.preview.topicTitle) : "";
    provenance.textContent = state.preview ? text("provenance").replace("{operator}", state.preview.operatorName) : "";
    origin.textContent = !state.preview ? "" : state.preview.sourceTitle
      ? text("origin").replace("{title}", `${state.preview.sourceTitle} — ${state.preview.sourceUrl ?? ""}`) : text("noOrigin");
    exactBody.textContent = state.preview?.body ?? "";
    share.disabled = blocked || !state.preview;
    const ai = state.ai ?? { connected: false, planEnabled: false, pending: false, models: [], model: "", articleText: "", article: null,
      costConsent: false, result: null, status: "idle" };
    accountSummary.textContent = text(ai.pending ? "accountConnecting" : ai.connected ?
      ai.planEnabled ? ai.model ? "accountModelSelected" : "accountChooseModel" : "accountPlanUnavailable" :
      "accountDisconnected");
    usage.hidden = !ai.planEnabled;
    const generating = ai.status === "generating";
    const aiPending = generating || ai.status === "disconnecting" || ai.status === "loadingModels";
    include.disabled ||= generating;
    prepare.disabled ||= generating;
    body.disabled ||= generating;
    review.disabled ||= generating;
    share.disabled ||= generating;
    discard.disabled ||= generating;
    draftSummary.textContent = text(ai.status === "generated" ? "draftWorkspaceGenerated" : "draftWorkspace");
    if (ai.status === "generated" || state.preview) draftDetails.open = true;
    if (generating) draftDetails.open = false;
    const stageMessage = ai.status === "connectionFailed" && Object.hasOwn(FAILURE_STAGE_MESSAGES, ai.failureStage)
      ? FAILURE_STAGE_MESSAGES[ai.failureStage] : null;
    const substageMessage = ai.status === "connectionFailed" && ai.failureStage === "identity-verification-failed" &&
      Object.hasOwn(IDENTITY_FAILURE_SUBSTAGE_MESSAGES, ai.failureSubstage)
      ? IDENTITY_FAILURE_SUBSTAGE_MESSAGES[ai.failureSubstage] : null;
    aiStatus.textContent = text(substageMessage ?? stageMessage ??
      `ai${ai.status?.[0]?.toUpperCase() ?? "I"}${ai.status?.slice(1) ?? "dle"}`) ?? ai.status;
    aiStatus.setAttribute("data-state", ai.pending ? "connecting" : ai.planEnabled ? "connected" : "disconnected");
    modelStatus.hidden = !["loadingModels", "noModels", "modelListUnavailable"].includes(ai.status);
    modelStatus.textContent = modelStatus.hidden ? "" :
      text(`ai${ai.status[0].toUpperCase()}${ai.status.slice(1)}`);
    account.textContent = ai.account?.label ? text("connectedAccount").replace("{label}", ai.account.label) : "";
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
    model.disabled = !ai.planEnabled || !ai.models.length || aiPending || state.busy;
    read.disabled = !state.context?.currentSource || blocked || aiPending;
    article.disabled = !ai.article || generating;
    if (article.value !== ai.articleText) article.value = ai.articleText;
    cost.checked = ai.costConsent;
    cost.disabled = !ai.planEnabled || generating;
    create.disabled = !ai.planEnabled || !ai.model || !ai.articleText?.trim() || !ai.costConsent || blocked || generating;
    cancel.disabled = cancel.hidden = !generating;
    articleLabel.hidden = article.hidden = articleWarning.hidden = !ai.article;
    costLabel.hidden = cost.hidden = aiScope.hidden = !ai.article;
    citations.replaceChildren();
    if (ai.result?.citations?.length) {
      citations.append(node("h4", "citations"));
      const annotated = node("p"); annotated.className = "insight-body";
      const bodyText = ai.result.body;
      let cursor = 0;
      const ordered = [...ai.result.citations].sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
      for (const citation of ordered) {
        if (citation.startIndex < cursor || !Number.isSafeInteger(citation.startIndex) ||
            !Number.isSafeInteger(citation.endIndex) || citation.endIndex <= citation.startIndex ||
            citation.endIndex > bodyText.length || !safeCitationUrl(citation.url)) continue;
        const before = node("span"); before.textContent = bodyText.slice(cursor, citation.startIndex); annotated.append(before);
        const linked = node("a"); linked.textContent = bodyText.slice(citation.startIndex, citation.endIndex);
        linked.href = citation.url; linked.target = "_blank"; linked.rel = "noopener noreferrer";
        linked.referrerPolicy = "no-referrer"; annotated.append(linked); cursor = citation.endIndex;
      }
      const tail = node("span"); tail.textContent = bodyText.slice(cursor); annotated.append(tail); citations.append(annotated);
      const list = node("ul");
      for (const citation of ai.result.citations) {
        if (!safeCitationUrl(citation.url)) continue;
        const item = node("li");
        const link = node("a"); link.textContent = `${citation.title} (${citation.url})`;
        link.href = citation.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.referrerPolicy = "no-referrer"; item.append(link); list.append(item);
      }
      citations.append(list);
    }
  }
  function safeCitationUrl(url) {
    return typeof url === "string" && url.startsWith("https://") &&
      inspectPageUrl(url).supported && inspectPageUrl(url).url === url;
  }
  function bind(value) { controller = value; render(controller.currentState()); }
  function dispose() {
    disposed = true; controller = null; body.value = ""; article.value = ""; context.replaceChildren(); citations.replaceChildren(); exactBody.textContent = ""; account.textContent = "";
    target.textContent = provenance.textContent = origin.textContent = "";
    for (const [item, event, callback] of handlers) item.removeEventListener(event, callback);
  }
  return Object.freeze({ bind, render, dispose });
}
