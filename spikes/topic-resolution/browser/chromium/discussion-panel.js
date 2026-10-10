import { EN } from "../locales/en.js";
import { projectDiscussionShell } from "./popup-shell.js";
import { readPostOrigin } from "../core/local-service-contract.js";
import { ownsContribution, selectedPostingSource } from "../core/local-discussion-controller.js";
import { inspectPageUrl } from "../core/page-content-policy.js";
import { appendInsightCitationNodes } from "../core/insight-citations.js";

export function mountDiscussionPanel(document, root, { messages = EN } = {}) {
  const text = (key) => messages?.[key] ?? EN[key];
  const handlers = [];
  let controller;
  let insightController;
  let lastState;
  let disposed = false;
  let uiMode = "user";
  let lastInsightState;
  let insightHost;
  let rendering = false;
  let posting = false;
  function node(tag, key) {
    const item = document.createElement(tag);
    if (key) item.textContent = text(key);
    return item;
  }
  function label(control, key, id, parent = root) {
    control.id = id;
    const item = node("label", key); item.htmlFor = id;
    parent.append(item, control);
    return item;
  }
  function listen(item, event, callback) {
    item.addEventListener(event, callback); handlers.push([item, event, callback]);
  }
  function button(key, callback, parent = root) {
    const item = node("button", key); item.type = "button";
    item.id = key.replace(/^discussion/u, "discussion-").replace(/[A-Z]/gu, (value) => `-${value.toLowerCase()}`).replace("--", "-");
    listen(item, "click", callback); parent.append(item); return item;
  }
  const heading = node("h2", "discussionHeading"); heading.id = "discussion-heading";
  const insightShortcut = node("button", "uiCreateInsights"); insightShortcut.type = "button";
  insightShortcut.id = "discussion-ai-insights"; insightShortcut.className = "insight-shortcut";
  listen(insightShortcut, "click", () => {
    if (insightShortcut.disabled || !insightController) return;
    if (uiMode === "user") {
      const ai = lastInsightState?.ai ?? insightController.currentState?.()?.ai;
      if (!ai?.planEnabled || !ai?.model) {
        document.querySelector?.("#app-settings-button")?.click?.();
        const accountDetails = document.querySelector?.("#insight-account-details");
        if (accountDetails) accountDetails.open = true;
        document.querySelector?.("#insight-account-details > summary")?.focus?.({ preventScroll: true });
        return;
      }
      void insightController.createInsights({ automatic: true });
      return;
    }
    const workspace = document.querySelector?.("#insight-workspace");
    if (workspace) {
      workspace.open = true;
      workspace.scrollIntoView?.({ block: "start", behavior: "smooth" });
      workspace.querySelector?.("summary")?.focus?.({ preventScroll: true });
    }
  });
  root.setAttribute("aria-labelledby", heading.id);
  const scope = node("p", "discussionScope"); scope.className = "developer-only";
  const sectionBar = node("div"); sectionBar.className = "discussion-section-bar";
  sectionBar.append(heading);
  root.append(sectionBar, scope);
  const status = node("p"); status.id = "discussion-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); root.append(status);
  const loadingScene = node("div"); loadingScene.id = "discussion-loading-scene";
  loadingScene.setAttribute("aria-hidden", "true"); loadingScene.hidden = true;
  for (const variant of ["opening", "reply"]) {
    const card = node("div"); card.className = `discussion-loading-card discussion-loading-${variant}`;
    const avatar = node("span"); avatar.className = "discussion-loading-avatar";
    const lines = node("span"); lines.className = "discussion-loading-lines";
    for (let index = 0; index < 2; index += 1) {
      const line = node("span"); line.className = `discussion-loading-line discussion-loading-line-${index + 1}`;
      lines.append(line);
    }
    card.append(avatar, lines); loadingScene.append(card);
  }
  root.append(loadingScene);
  const connectionSettings = node("details"); connectionSettings.id = "discussion-connection-settings";
  connectionSettings.className = "compact-details";
  const connectionSummary = node("summary", "uiConnectionSetup");
  connectionSettings.append(connectionSummary); root.append(connectionSettings);
  const advanced = node("details"); advanced.id = "discussion-advanced"; advanced.className = "compact-details";
  const advancedSummary = node("summary", "uiAdvanced");
  const advancedScope = node("p", "discussionScope");
  advanced.append(advancedSummary, advancedScope);
  const token = node("input"); token.type = "password"; token.autocomplete = "off";
  token.spellcheck = false; token.maxLength = 512;
  const tokenLabel = label(token, "discussionToken", "discussion-token", connectionSettings);
  const tokenHelp = node("p", "uiPairingTokenHelp"); tokenHelp.id = "discussion-token-help";
  token.setAttribute("aria-describedby", tokenHelp.id);
  connectionSettings.append(tokenHelp);
  const pairForm = node("form"); const pair = node("button", "discussionPair"); pair.type = "submit";
  pair.id = "discussion-pair";
  // The input is intentionally outside the form: no native form serialization.
  pairForm.append(pair); connectionSettings.append(pairForm);
  let pairing = false;
  async function submitPair(event) {
    event.preventDefault();
    if (pairing || pair.disabled || token.disabled || !controller) return;
    const value = token.value; token.value = "";
    if (!value.trim()) return;
    pairing = true; pair.disabled = token.disabled = true;
    try { await controller.pair(value); }
    finally {
      pairing = false;
      if (lastState && !disposed) render(lastState);
    }
  }
  listen(pairForm, "submit", (event) => { void submitPair(event); });
  listen(token, "keydown", (event) => {
    if (event.key === "Enter") void submitPair(event);
  });
  const disconnect = button("discussionDisconnect", () => { token.value = ""; void controller?.disconnect(); }, connectionSettings);
  const reload = button("discussionReload", () => void controller?.open(), connectionSettings);
  const manualTopicControls = node("div"); manualTopicControls.className = "developer-only";
  advanced.append(manualTopicControls);
  const topic = node("select"); label(topic, "discussionTopic", "discussion-topic", manualTopicControls);
  listen(topic, "change", () => void controller?.selectTopic(topic.value));
  const source = node("select"); label(source, "discussionSource", "discussion-source", manualTopicControls);
  listen(source, "change", () => void controller?.selectSource(source.value));
  const actor = node("select"); label(actor, "discussionActor", "discussion-actor", advanced);
  listen(actor, "change", () => void controller?.selectActor(actor.value));
  const createForm = node("form"); manualTopicControls.append(createForm);
  const title = node("input"); title.maxLength = 200; title.required = true; title.id = "discussion-new-title";
  const titleLabel = node("label", "discussionNewTitle"); titleLabel.htmlFor = title.id;
  const kind = node("select"); kind.id = "discussion-kind";
  const kindLabel = node("label", "discussionKind"); kindLabel.htmlFor = kind.id;
  for (const [value, key] of [["general", "discussionKindGeneral"], ["event", "discussionKindEvent"],
    ["product", "discussionKindProduct"], ["claim", "discussionKindClaim"]]) {
    const option = node("option", key); option.value = value; kind.append(option);
  }
  kind.value = "general";
  const create = node("button", "discussionCreate"); create.type = "submit";
  create.id = "discussion-create";
  createForm.append(titleLabel, title, kindLabel, kind, create);
  listen(createForm, "submit", async (event) => {
    event.preventDefault(); if (await controller?.createTopic(title.value, kind.value)) title.value = "";
  });
  const counts = node("p"); counts.id = "discussion-counts"; const thread = node("div"); thread.className = "discussion-thread";
  thread.setAttribute("role", "region"); thread.setAttribute("aria-label", text("uiDiscussionRegionLabel"));
  thread.setAttribute("tabindex", "-1");
  const alternateNotice = node("p"); alternateNotice.id = "discussion-alternate-notice";
  alternateNotice.setAttribute("role", "status");
  const backToPage = button("uiBackToThisPage", () => void controller?.open());
  backToPage.id = "discussion-back-to-page"; backToPage.className = "user-only";
  const priorDetails = node("details"); priorDetails.id = "discussion-prior"; priorDetails.className = "compact-details";
  const priorSummary = node("summary"); priorSummary.id = "discussion-prior-summary";
  const priorList = node("ul"); priorList.id = "discussion-prior-list";
  priorDetails.append(priorSummary, priorList);
  root.append(priorDetails, backToPage, counts, alternateNotice, thread);
  const composer = node("form"); composer.id = "discussion-composer";
  const newThreadHeading = node("h3", "uiNewThread"); newThreadHeading.className = "discussion-new-thread-heading";
  composer.append(newThreadHeading);
  const mode = node("p"); root.append(composer);
  const replyContext = node("div"); replyContext.id = "discussion-reply-context";
  const replyAuthor = node("span"); replyAuthor.className = "discussion-reply-author";
  const replyExcerpt = node("span"); replyExcerpt.className = "discussion-reply-excerpt";
  const replyStatus = node("span"); replyStatus.className = "discussion-reply-status";
  replyStatus.setAttribute("role", "status");
  replyContext.append(replyAuthor, replyExcerpt, replyStatus);
  const identity = node("p"); identity.id = "discussion-demo-identity"; composer.append(identity);
  const originDisclosure = node("p"); originDisclosure.id = "discussion-origin-disclosure"; composer.append(originDisclosure);
  const body = node("textarea"); body.id = "discussion-body"; body.maxLength = 8000;
  body.rows = 3;
  let composing = false;
  const bodyLabel = node("label", "discussionBody"); bodyLabel.htmlFor = body.id;
  const detached = node("p", "discussionDetached"); detached.setAttribute("role", "status");
  const submit = node("button", "discussionSubmit"); submit.type = "submit";
  submit.id = "discussion-submit";
  const composerActions = node("div"); composerActions.className = "discussion-composer-actions";
  const modelHost = node("div"); modelHost.id = "discussion-model-host";
  modelHost.className = "discussion-model-host";
  const insightActivity = node("span"); insightActivity.id = "discussion-insight-activity";
  insightActivity.setAttribute("role", "status"); insightActivity.setAttribute("aria-live", "polite");
  insightShortcut.setAttribute("aria-describedby", insightActivity.id);
  composerActions.append(modelHost, insightShortcut, submit, insightActivity);
  composer.append(mode, replyContext, bodyLabel, body, detached, composerActions);
  listen(body, "input", () => controller?.setDraft(body.value));
  listen(body, "compositionstart", () => { composing = true; });
  listen(body, "compositionend", () => {
    composing = false;
    const committed = body.value;
    controller?.setDraft(committed);
    if (lastState?.draft.body === committed) render(lastState);
  });
  listen(composer, "submit", async (event) => {
    event.preventDefault();
    if (submit.disabled || posting || !controller) return;
    posting = true;
    if (lastState) render(lastState);
    try { await controller.submitDraft(); }
    finally { posting = false; if (lastState && !disposed) render(lastState); }
  });
  const reattach = button("discussionReattach", () => { controller?.reattachDraft(); body.focus(); }, composer);
  const discard = button("discussionDiscard", () => { controller?.discardDraft(); body.focus(); }, composer);
  const backToNewThread = button("uiBackToNewThread", () => { controller?.discardDraft(); body.focus(); }, composer);
  backToNewThread.id = "discussion-back-to-new-thread";
  const relatedDetails = node("details"); relatedDetails.id = "discussion-related";
  relatedDetails.className = "compact-details";
  const relatedHeading = node("summary", "discussionRelated"); const model = node("p");
  model.className = "developer-only";
  const related = node("ul"); relatedDetails.append(relatedHeading, model, related); root.append(relatedDetails);
  const relatedDiscussions = node("section"); relatedDiscussions.id = "discussion-related-conversations";
  relatedDiscussions.className = "related-discussions user-only";
  const relatedDiscussionsHeading = node("h3", "uiRelatedDiscussions");
  const relatedDiscussionsList = node("div"); relatedDiscussionsList.className = "related-discussions-list";
  relatedDiscussions.append(relatedDiscussionsHeading, relatedDiscussionsList);
  root.append(relatedDiscussions);
  const provenance = node("p"); provenance.id = "discussion-provenance"; provenance.className = "developer-only"; root.append(provenance);
  const learnedControls = node("section"); learnedControls.id = "discussion-learned-controls";
  const learnedIntro = node("p", "discussionCorrectionIntro");
  learnedControls.append(node("h3", "discussionCorrectionHeading"), learnedIntro); advanced.append(learnedControls);
  const savedTopicHint = node("p", "uiTopicViewSavedTopicHint"); savedTopicHint.id = "discussion-saved-topic-hint";
  learnedControls.append(savedTopicHint);
  const correctionTarget = node("select"); correctionTarget.id = "discussion-correction-topic";
  const correctionLabel = node("label", "discussionCorrectionTarget"); correctionLabel.htmlFor = correctionTarget.id;
  const correctConfirm = node("input"); correctConfirm.id = "discussion-correction-confirm"; correctConfirm.type = "checkbox";
  const correctLabel = node("label", "discussionCorrectConfirm"); correctLabel.htmlFor = correctConfirm.id;
  const correctionControls = node("div"); correctionControls.className = "developer-only";
  correctionControls.append(correctionLabel, correctionTarget, correctLabel, correctConfirm);
  learnedControls.append(correctionControls);
  const correct = button("discussionCorrect", async () => {
    if (correct.disabled || !correctConfirm.checked) return;
    if (await controller?.correctSource(correctionTarget.value || null, "CONFIRM SOURCE TOPIC")) correctConfirm.checked = false;
  }, correctionControls);
  const forget = button("discussionForget", () => void controller?.forgetSource(), learnedControls);
  const deleteInput = node("input"); deleteInput.id = "discussion-delete-confirmation"; deleteInput.autocomplete = "off";
  const deleteLabel = node("label", "discussionDeleteLabel"); deleteLabel.htmlFor = deleteInput.id;
  learnedControls.append(deleteLabel, deleteInput);
  const deleteTopic = button("discussionDelete", async () => {
    if (deleteTopic.disabled) return;
    if (await controller?.deleteLearnedTopic(deleteInput.value)) deleteInput.value = "";
  }, learnedControls);
  const clearInput = node("input"); clearInput.id = "discussion-clear-confirmation"; clearInput.autocomplete = "off";
  const clearLabel = node("label", "discussionClearLabel"); clearLabel.htmlFor = clearInput.id;
  learnedControls.append(clearLabel, clearInput);
  const clear = button("discussionClear", async () => {
    if (await controller?.clearLearnedData(clearInput.value)) clearInput.value = "";
  }, learnedControls);
  function learnedActions() {
    const usable = lastState?.catalog && ["ready", "choose-topic"].includes(lastState.phase) && !lastState.busy && !lastState.needsFreshRead;
    const virtual = lastState?.topicViewMode === "experimental";
    const selectedLearned = lastState?.catalog?.sources.some((source) => source.id === lastState.sourceId && source.provenance === "owner-local-page-embedding/v1");
    const selectedLearnedTopic = lastState?.catalog?.topics.some((topic) => topic.id === lastState.topicId && topic.learned === true);
    correctionTarget.disabled = correctConfirm.disabled = !usable || virtual || !selectedLearned;
    deleteInput.disabled = !usable || virtual || !selectedLearnedTopic;
    correct.disabled = !usable || virtual || !selectedLearned || !correctConfirm.checked;
    forget.disabled = !usable || !selectedLearned;
    deleteTopic.disabled = !usable || virtual || !selectedLearnedTopic || deleteInput.value !== "DELETE TOPIC AND DISCUSSION";
    clear.disabled = !usable || clearInput.value !== "CLEAR LEARNED DATA";
  }
  listen(correctConfirm, "change", learnedActions); listen(deleteInput, "input", learnedActions); listen(clearInput, "input", learnedActions);
  const resetForm = node("form"); advanced.append(resetForm); root.append(advanced);
  const confirmation = node("input"); confirmation.id = "discussion-reset-confirmation";
  confirmation.autocomplete = "off";
  const resetLabel = node("label", "discussionResetLabel"); resetLabel.htmlFor = confirmation.id;
  const reset = node("button", "discussionReset"); reset.type = "submit";
  reset.id = "discussion-reset";
  resetForm.append(resetLabel, confirmation, reset);
  listen(confirmation, "input", () => { reset.disabled = !lastState?.catalog || lastState.busy ||
    lastState.needsFreshRead || !["ready", "choose-topic"].includes(lastState.phase) || confirmation.value !== "RESET DEMO STATE"; });
  listen(resetForm, "submit", async (event) => {
    event.preventDefault(); if (await controller?.reset(confirmation.value)) confirmation.value = "";
  });
  const choiceStates = new WeakMap();
  function choices(select, entries, selected, placeholder) {
    const signature = JSON.stringify([placeholder ?? null, entries.map((entry) => [entry.id, entry.title ?? entry.displayName])]);
    const value = selected ?? "";
    const previous = choiceStates.get(select);
    if (signature !== previous?.signature) {
      const items = [];
      if (placeholder) { const option = node("option", placeholder); option.value = ""; items.push(option); }
      for (const entry of entries) { const option = node("option"); option.value = entry.id;
        option.textContent = entry.title ?? entry.displayName; items.push(option); }
      select.replaceChildren(...items); select.value = value;
    } else if (value !== previous.value) select.value = value;
    choiceStates.set(select, { signature, value });
  }
  let threadHandlers = [];
  let priorHandlers = [];
  let priorSignature;
  function clearThreadHandlers() {
    for (const [item, callback] of threadHandlers) item.removeEventListener("click", callback);
    threadHandlers = [];
  }
  function clearPriorHandlers() {
    for (const [item, callback] of priorHandlers) item.removeEventListener("click", callback);
    priorHandlers = [];
  }
  function branchToggle(id, count, expanded, bodyOnly = false) {
    const label = (open) => bodyOnly ? text(open ? "uiReadLess" : "uiReadMore")
      : text(open ? "uiHideReplies" : count === 1 ? "uiShowReply" : "uiShowReplies")
        .replace("{count}", String(count));
    const toggle = node("button"); toggle.type = "button";
    toggle.className = bodyOnly ? "discussion-branch-toggle discussion-body-toggle" : "discussion-branch-toggle";
    toggle.setAttribute("data-action", "expand");
    toggle.setAttribute("data-contribution-id", id);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = label(expanded);
    const callback = () => {
      const opening = (toggle.getAttribute?.("aria-expanded") ?? toggle.attributes?.["aria-expanded"]) !== "true";
      const children = toggle.replyChildren;
      if (!opening && children?.contains?.(composer)) return;
      if (opening) expandedBranches.add(id); else expandedBranches.delete(id);
      toggle.setAttribute("aria-expanded", String(opening));
      toggle.textContent = label(opening);
      toggle.threadGroup?.setAttribute("data-expanded", String(opening));
      if (children) {
        children.setAttribute("data-open", String(opening));
        children.setAttribute("aria-hidden", String(!opening));
        children.inert = !opening;
      }
    };
    toggle.addEventListener("click", callback); threadHandlers.push([toggle, callback]);
    return toggle;
  }
  function actorName(actor) {
    const raw = actor?.displayName ?? actor?.id ?? "";
    if (uiMode !== "user") return raw;
    if (actor?.id === "demo-alex" && raw === "Alex · synthetic") return "Alex";
    if (actor?.id === "demo-blair" && raw === "Blair · synthetic") return "Blair";
    return raw;
  }
  function compactText(value, limit) {
    const plain = value.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, " ")
      .replace(/\s+/gu, " ").trim();
    const chars = Array.from(plain);
    return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : plain;
  }
  function contribution(entry, rootEntry, state, newlyArrived = false) {
    const card = node("article"); card.className = `discussion-contribution ${entry === rootEntry ? "discussion-root-post" : "discussion-reply-post"}`;
    card.setAttribute("data-post-id", entry.id);
    card.setAttribute("tabindex", "-1");
    card.setAttribute("data-ownership", ownsContribution(entry, state.actorId) ? "own" : "other");
    card.setAttribute("data-actor-type", entry.actorType);
    if (ownsContribution(entry, state.actorId) && entry.actorType === "human") card.className += " discussion-own-human";
    if (entry.actorType === "agent") card.className += " discussion-ai-post";
    if (newlyArrived && entry.state === "visible") card.className += " is-new";
    if (entry.state === "deleted") {
      card.setAttribute("aria-label", text("discussionDeleted"));
      card.append(node("p", "discussionDeleted")); return card;
    }
    const actor = state.catalog.actors.find((item) => item.id === entry.authorId);
    const metadata = node("div"); metadata.className = "discussion-post-metadata";
    const author = node("p"); author.textContent = actorName(actor) || entry.authorId;
    if (actor?.displayName && author.textContent !== actor.displayName) author.title = actor.displayName;
    if (entry.actorType === "human") {
      author.className = "human-provenance";
      author.setAttribute("aria-label", text("uiHumanContributor").replace("{name}", author.textContent));
    }
    if (entry.actorType === "agent") {
      const operatorActor = state.catalog.actors.find((item) => item.id === entry.insight?.operatorId);
      const operator = actorName(operatorActor);
      const generated = entry.insight?.kind === "generated";
      const developerKey = generated ? "discussionGeneratedInsight" : "discussionImportedInsight";
      const visibleKey = uiMode === "user"
        ? generated ? "uiGeneratedInsightOperator" : "uiImportedInsightOperator"
        : developerKey;
      const provenanceKey = generated && uiMode === "user" ? "uiGeneratedInsightProvenance" : developerKey;
      const provenance = text(provenanceKey).replace("{operator}", operator);
      author.textContent = text(visibleKey).replace("{operator}", operator);
      author.className = "insight-provenance";
      author.setAttribute("aria-label", provenance);
      author.title = provenance;
    }
    card.setAttribute("aria-label", text("uiPostByAuthor").replace("{author}",
      entry.actorType === "agent" ? author.getAttribute("aria-label") : author.textContent));
    const content = node("p"); content.className = "discussion-body";
    if (entry.actorType === "agent") appendInsightCitationNodes(document, content, entry.body,
      text("discussionCitationOpen"), text("discussionCitationUnverifiedOpen"),
      text("discussionCitationUnverifiedNote"));
    else content.textContent = entry.body;
    metadata.append(author);
    if (actor?.id === "demo-alex" || actor?.id === "demo-blair") {
      const demo = node("span", "uiDemoBadge");
      demo.className = "discussion-demo-badge";
      demo.setAttribute("aria-label", text("uiDemoBadgeLabel"));
      metadata.append(demo);
    }
    if (uiMode === "user" && entry.actorType === "human") {
      const type = node("span", "uiHumanBadge");
      type.className = "discussion-actor-badge discussion-actor-badge-human";
      metadata.append(type);
    }
    if (typeof entry.createdAt === "string") {
      const date = new Date(entry.createdAt);
      if (Number.isFinite(date.getTime())) {
        const timestamp = node("time"); timestamp.className = "discussion-post-time";
        timestamp.dateTime = entry.createdAt;
        timestamp.textContent = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        metadata.append(timestamp);
      }
    }
    card.append(metadata, content);
    const actions = node("div"); actions.className = "discussion-actions";
    const alternateRoot = state.topicViewMode === "experimental" && state.alternateDiscussion &&
      state.alternateDiscussion.sourceId === state.sourceId;
    const canonicalRoot = !alternateRoot || rootEntry.canonicalDiscussionId === state.discussion?.discussionId &&
      rootEntry.canonicalTopicId === state.topicId && state.discussion?.roots.some((item) => item.id === rootEntry.id);
    let sourceLink = null;
    if (entry.origin) {
      try {
        const origin = readPostOrigin(entry.origin);
        const link = node("a"); link.className = "discussion-source-link";
        link.textContent = "↗";
        const openToReply = alternateRoot && !canonicalRoot && entry === rootEntry;
        if (openToReply) {
          link.textContent = text("uiTopicViewOpenToReply");
          link.className += " discussion-open-to-reply";
        }
        link.href = origin.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.referrerPolicy = "no-referrer";
        const destination = text("discussionOriginOpen").replace("{title}", origin.title.slice(0, 160)).replace("{url}", origin.url.slice(0, 240));
        link.setAttribute("aria-label", openToReply ? text("uiTopicViewOpenToReply") : destination);
        link.title = destination;
        sourceLink = link;
      } catch { /* Invalid projections never become navigable links. */ }
    }
    if (entry === rootEntry && entry.regrouped === true) card.append(node("p", "discussionRegrouped"));
    if (uiMode === "user" && entry !== rootEntry && entry.replyToId && entry.replyToId !== rootEntry.id) {
      const parent = rootEntry.replies?.find((item) => item.id === entry.replyToId);
      const parentActor = state.catalog.actors.find((item) => item.id === parent?.authorId);
      const parentName = parent?.state === "deleted" ? text("discussionDeleted")
        : parent?.actorType === "agent" ? text("uiAgentBadge") : actorName(parentActor);
      if (parentName) {
        const parentCue = node("p"); parentCue.className = "discussion-parent-cue";
        parentCue.textContent = text("uiInReplyTo").replace("{author}", compactText(parentName, 48));
        metadata.append(parentCue);
      }
    }
    if (entry.edited) card.append(node("span", "discussionEdited"));
    function action(key, callback, { iconOnly = false } = {}) {
      const item = node("button", key); item.type = "button";
      item.className = `discussion-action discussion-action-${key.replace(/^discussion/u, "").toLowerCase()}`;
      if (iconOnly && uiMode === "user") {
        item.className += " discussion-action-icon discussion-action-robot";
        item.textContent = "";
      }
      const actionLabel = iconOnly && uiMode === "user" ? text("uiGenerateInsightReplyLabel") : text(key);
      item.setAttribute("aria-label", actionLabel);
      item.title = actionLabel;
      item.disabled = !canonicalRoot || state.busy || state.needsFreshRead || state.phase !== "ready";
      item.setAttribute("data-action", key.replace(/^discussion/u, "").toLowerCase());
      item.setAttribute("data-contribution-id", entry.id);
      item.addEventListener("click", callback); threadHandlers.push([item, callback]); actions.append(item);
    }
    if (rootEntry.state === "visible" && canonicalRoot) action("discussionReply", () => { if (controller?.begin("reply", entry.id)) body.focus(); });
    if (canonicalRoot && ownsContribution(entry, state.actorId)) {
      if (entry !== rootEntry && entry.rootId === rootEntry.id && entry.replyToId === rootEntry.id &&
          entry.actorType === "human" &&
          rootEntry.actorType === "agent" && rootEntry.insight?.kind === "generated") {
        action("discussionGetInsights", () => {
          if (!insightController) return;
          if (uiMode === "developer") {
            const workspace = document.querySelector?.("#insight-workspace");
            if (workspace) workspace.open = true;
          }
          void insightController.createFollowup(entry.id);
          // The controller publishes the validated target before its first
          // await. Scroll only for this deliberate click, never for polling.
          if (followupTarget() === entry.id) {
            const progress = document.querySelector?.("#insight-followup-progress");
            if (progress && !progress.hidden && insightHost?.contains?.(progress))
              progress.scrollIntoView?.({ block: "nearest", behavior: "instant" });
          }
        }, { iconOnly: true });
      }
      if (entry.actorType !== "agent") action("discussionEdit", () => { if (controller?.begin("edit", entry.id)) body.focus(); });
      action("discussionWithdraw", () => void controller?.withdraw(entry.id));
    }
    if (sourceLink) actions.append(sourceLink);
    if (actions.children.length) card.append(actions);
    return card;
  }
  let renderedDiscussion;
  let renderedActor;
  let renderedBusy;
  let renderedFreshRead;
  let renderedUiMode;
  let renderedRelatedDiscussions;
  let observedViewKey;
  let observedContributionIds = new Set();
  let observedDiscussion = false;
  const expandedBranches = new Set();
  let confirmationContext;
  let connectionPosition = "before";
  function postSlot(parent, id) {
    for (const child of parent.children ?? []) {
      if (child.getAttribute?.("data-post-id") === id) return { parent, card: child };
      const nested = postSlot(child, id);
      if (nested) return nested;
    }
    return null;
  }
  function followupTarget(insightState = lastInsightState, discussionState = lastState) {
    const binding = insightState?.followup;
    const discussion = discussionState?.discussion;
    if (uiMode !== "user" || !binding || !discussion ||
        discussionState.phase !== "ready" || discussionState.needsFreshRead ||
        insightState.context?.topic?.id !== discussionState.topicId ||
        insightState.context?.currentSource?.id !== discussionState.sourceId ||
        discussion.discussionId !== binding.discussionId) return null;
    const rootEntry = discussion.roots.find((entry) => entry.id === binding.rootId &&
      entry.state === "visible" && entry.actorType === "agent" && entry.insight?.kind === "generated");
    const reply = rootEntry?.replies.find((entry) => entry.id === binding.replyToId);
    return reply?.state === "visible" && reply.actorType === "human" &&
      reply.authorId === discussionState.actorId && reply.rootId === rootEntry.id &&
      reply.replyToId === rootEntry.id ? reply.id : null;
  }
  function placeComposer(inlineTarget) {
    insightHost ??= document.querySelector?.("#app-discussion-insights-host");
    if (uiMode === "user") {
      const insightSlot = followupTarget() ? postSlot(thread, followupTarget()) : null;
      if (insightHost && !insightSlot && (insightHost.parentElement !== root || insightHost.nextSibling !== thread))
        root.insertBefore(insightHost, thread);
      const slot = inlineTarget ? postSlot(thread, inlineTarget) : null;
      if (slot) {
        if (composer.parentElement !== slot.parent || slot.card.nextSibling !== composer)
          slot.parent.insertBefore(composer, slot.card.nextSibling);
      } else {
        const afterComposer = insightHost?.parentElement === root ? insightHost : thread;
        if (composer.parentElement !== root || composer.nextSibling !== afterComposer)
          root.insertBefore(composer, afterComposer);
      }
      if (insightSlot && insightHost) {
        const after = insightSlot.card.nextSibling === composer ? composer : insightSlot.card;
        if (insightHost.parentElement !== insightSlot.parent || after.nextSibling !== insightHost)
          insightSlot.parent.insertBefore(insightHost, after.nextSibling);
      }
      const afterBack = composer.parentElement === root ? composer : insightHost?.parentElement === root ? insightHost : thread;
      if (backToPage.nextSibling !== afterBack) root.insertBefore(backToPage, afterBack);
      if (priorDetails.nextSibling !== backToPage) root.insertBefore(priorDetails, backToPage);
    } else {
      if (composer.parentElement !== root || thread.nextSibling !== composer)
        root.insertBefore(composer, thread.nextSibling);
      if (backToPage.nextSibling !== counts) root.insertBefore(backToPage, counts);
      if (priorDetails.nextSibling !== backToPage) root.insertBefore(priorDetails, backToPage);
    }
  }
  function render(state) {
    if (disposed) return;
    rendering = true;
    insightHost ??= document.querySelector?.("#app-discussion-insights-host");
    const previousState = lastState;
    lastState = state;
    const shellView = projectDiscussionShell(state, messages);
    connectionSummary.textContent = text(shellView.connection === "connected" ? "uiConnectionReady" : "uiConnectionSetup");
    connectionSettings.setAttribute("data-connection", shellView.connection);
    // Keep keyboard order aligned with the compact visual order in User Mode.
    const nextConnectionPosition = uiMode === "user" && shellView.connection === "connected" ? "after" : "before";
    if (nextConnectionPosition !== connectionPosition && !document.querySelector?.("#app-navigation")) {
      root.insertBefore(connectionSettings, nextConnectionPosition === "after" ? advanced : counts);
      connectionPosition = nextConnectionPosition;
    }
    heading.textContent = text(uiMode === "user" ? "uiDiscussions" : "discussionHeading");
    heading.hidden = uiMode === "user";
    advancedSummary.textContent = text(uiMode === "user" ? "uiAdvanced" : "uiAdvancedDeveloper");
    advancedScope.textContent = text(uiMode === "user" ? "uiDataScope" : "discussionScope");
    learnedIntro.textContent = text(uiMode === "user" ? "uiDataControlsIntro" : "discussionCorrectionIntro");
    const selectedTopicReady = state.phase === "ready" && !state.busy && !state.needsFreshRead && !state.error &&
      state.catalog?.topics.some((entry) => entry.id === state.topicId);
    backToPage.hidden = !state.viewingPriorDiscussion || uiMode !== "user";
    backToPage.disabled = state.busy || state.phase === "connecting" || state.phase === "loading";
    const priorTopics = selectedTopicReady && state.priorDiscussions?.sourceId === state.sourceId &&
      state.priorDiscussions.currentTopicId === state.topicId ? state.priorDiscussions.topics : [];
    priorDetails.hidden = priorTopics.length === 0;
    if (!priorTopics.length) priorDetails.open = false;
    priorSummary.textContent = text("uiEarlierDiscussionOnPage").replace("{count}",
      String(priorTopics.reduce((count, entry) => count + entry.rootCount, 0)));
    const nextPriorSignature = JSON.stringify(priorTopics);
    if (nextPriorSignature !== priorSignature) {
      clearPriorHandlers();
      const priorEntries = priorTopics.map((entry) => {
        const item = node("li");
        const action = node("button"); action.type = "button";
        action.textContent = text("uiEarlierDiscussionEntry").replace("{title}", entry.title)
          .replace("{count}", String(entry.rootCount));
        const callback = () => {
          if (!action.disabled && lastState?.priorDiscussions?.topics.some((topic) => topic.id === entry.id))
            void controller?.selectTopic(entry.id);
        };
        action.addEventListener("click", callback); priorHandlers.push([action, callback]);
        item.append(action); return item;
      });
      priorList.replaceChildren(...priorEntries);
      priorSignature = nextPriorSignature;
    }
    renderInsightState(lastInsightState);
    relatedHeading.textContent = uiMode === "user"
      ? text("uiRelatedCount").replace("{count}", String(state.related?.results?.length ?? 0))
      : text("discussionRelated");
    identity.textContent = !state.catalog ? "" : text("uiDemoIdentity").replace("{actor}",
      actorName(state.catalog.actors.find((entry) => entry.id === state.actorId)) || text("discussionChoose"));
    identity.hidden = uiMode === "user";
    bodyLabel.textContent = text(uiMode === "user" ? state.draft.mode === "reply" ? "uiReplyBody" : "uiCommentBody" : "discussionBody");
    bodyLabel.hidden = uiMode === "user";
    body.setAttribute("aria-label", bodyLabel.textContent);
    body.placeholder = uiMode === "user" ? text(state.draft.mode === "reply" ? "uiReplyPlaceholder" : "uiCommentPlaceholder") : "";
    if (state.draft.mode === "reply") body.setAttribute("aria-describedby", replyContext.id);
    else body.removeAttribute("aria-describedby");
    const arrivedCatalog = state.catalog && !previousState?.catalog;
    const reachedConnected = ["ready", "choose-topic"].includes(state.phase) &&
      !["ready", "choose-topic", "loading"].includes(previousState?.phase);
    if (uiMode === "user" && (arrivedCatalog || reachedConnected)) connectionSettings.open = false;
    if (["disconnected", "error"].includes(state.phase) && previousState?.phase !== state.phase) connectionSettings.open = true;
    const nextConfirmationContext = JSON.stringify([state.sourceId ?? null, state.topicId ?? null]);
    if (confirmationContext !== undefined && confirmationContext !== nextConfirmationContext) {
      correctConfirm.checked = false;
      correctionTarget.value = "";
      deleteInput.value = "";
      clearInput.value = "";
      confirmation.value = "";
    }
    if (state.topicViewMode === "experimental" && previousState?.topicViewMode !== "experimental") {
      correctConfirm.checked = false;
      deleteInput.value = "";
    }
    confirmationContext = nextConfirmationContext;
    const errorKey = { unauthorized: "discussionUnauthorized", "extension-connection-unavailable": "discussionExtensionUnavailable", "durable-pairing-required": "discussionDurableRequired",
      conflict: "discussionConflict", capacity: "discussionCapacity",
      "invalid-request": "discussionInvalid", "invalid-response": "discussionInvalid", "context-changed": "discussionContextChanged" }[state.error];
    const resolving = state.resolution?.enabled === true &&
      ["checking", "processing"].includes(state.resolution?.phase);
    const loadingDiscussions = uiMode === "user" && !state.needsFreshRead &&
      (["connecting", "loading"].includes(state.phase) || state.phase === "choose-topic" && resolving)
      && (!state.error || state.error === "context-changed") && !(selectedTopicReady && state.priorDiscussionsError);
    status.setAttribute("data-loading", String(loadingDiscussions));
    loadingScene.hidden = !loadingDiscussions;
    status.textContent = text(loadingDiscussions ? "uiLoadingDiscussions" : errorKey ?? (state.error ? "discussionUnavailable" : {
      ready: "discussionReady", disconnected: "discussionDisconnected", connecting: "discussionConnecting",
      loading: "discussionLoading", "choose-topic": uiMode === "user" ? "uiTopicAwaitingPage" : "discussionChooseStatus" }[state.phase] ?? "discussionUnavailable"));
    if (selectedTopicReady && state.priorDiscussionsError && uiMode === "user")
      status.textContent = text("uiEarlierThreadsUnavailable");
    if (state.needsFreshRead) status.textContent += ` · ${text("discussionReload")}`;
    status.hidden = uiMode === "user" && ["ready", "disconnected"].includes(state.phase) &&
      !state.error && !state.needsFreshRead && !(selectedTopicReady && state.priorDiscussionsError);
    const usable = ["ready", "choose-topic"].includes(state.phase) && !state.busy && !state.needsFreshRead;
    const showPairingInput = uiMode !== "user" || state.error !== "extension-connection-unavailable" &&
      (shellView.connection !== "connected" || state.error === "unauthorized");
    tokenLabel.hidden = token.hidden = tokenHelp.hidden = pairForm.hidden = !showPairingInput;
    pair.disabled = pairing || state.busy || state.phase === "connecting";
    token.disabled = pair.disabled; disconnect.disabled = state.busy;
    disconnect.hidden = reload.hidden = uiMode === "user" && state.phase === "disconnected";
    reload.disabled = state.busy || state.phase === "connecting";
    topic.disabled = !state.catalog || state.busy; actor.disabled = topic.disabled;
    source.disabled = topic.disabled;
    choices(topic, state.catalog?.topics ?? [], state.topicId, "discussionChoose");
    choices(source, state.catalog?.sources ?? [], state.sourceId, "discussionChooseSource");
    choices(actor, state.catalog?.actors ?? [], state.actorId);
    title.disabled = kind.disabled = create.disabled = !state.catalog || !usable;
    const ready = state.phase === "ready" && !state.busy && !state.needsFreshRead;
    const compositionContextChanged = previousState?.sourceId !== state.sourceId ||
      previousState?.topicId !== state.topicId || previousState?.draft.mode !== state.draft.mode ||
      previousState?.draft.targetId !== state.draft.targetId ||
      previousState?.draft.detached !== state.draft.detached;
    if (compositionContextChanged) composing = false;
    if ((!composing || compositionContextChanged) && body.value !== state.draft.body)
      body.value = state.draft.body;
    const loadingSelected = state.phase === "loading" && Boolean(state.topicId && state.sourceId) &&
      state.catalog?.sources.some((entry) => entry.id === state.sourceId && entry.topicId === state.topicId);
    composer.hidden = uiMode === "user" && !posting && !selectedTopicReady && !loadingSelected &&
      !state.draft.body.trim() && !state.draft.detached && state.draft.mode === "root";
    const stagingRoot = uiMode === "user" && state.draft.mode === "root" && !state.draft.detached && loadingSelected &&
      !state.busy && !state.needsFreshRead;
    body.disabled = !ready && !stagingRoot && !(posting && state.phase === "ready" && !state.needsFreshRead);
    body.readOnly = posting;
    detached.hidden = !state.draft.detached;
    reattach.hidden = !state.draft.detached; reattach.disabled = !ready;
    const replyRoot = state.draft.mode === "reply" ? state.discussion?.roots.find((entry) =>
      entry.state === "visible" && (entry.id === state.draft.targetId ||
        entry.replies?.some((reply) => reply.id === state.draft.targetId))) : null;
    const replyTarget = replyRoot ? [replyRoot, ...(replyRoot.replies ?? [])]
      .find((entry) => entry.id === state.draft.targetId && entry.state === "visible") : null;
    const editTarget = state.draft.mode === "edit" ? state.discussion?.roots
      .flatMap((entry) => [entry, ...(entry.replies ?? [])])
      .find((entry) => entry.id === state.draft.targetId && entry.state === "visible") : null;
    submit.disabled = posting || !ready || state.draft.detached || !state.draft.body.trim() ||
      state.draft.mode === "reply" && !replyTarget || state.draft.mode === "edit" && !editTarget;
    mode.textContent = text((uiMode === "user" ? { root: "discussionComposerRoot", reply: "uiReplyMode", edit: "uiEditMode" }
      : { root: "discussionComposerRoot", reply: "discussionComposerReply", edit: "discussionComposerEdit" })[state.draft.mode])
      .replace("{id}", state.draft.targetId ?? "");
    newThreadHeading.textContent = text(({ root: "uiNewThread", reply: "uiReplyThread", edit: "uiEditThread" })[state.draft.mode]);
    newThreadHeading.hidden = uiMode !== "user";
    if (uiMode === "user" && state.draft.mode === "root") mode.textContent = text("uiComposerRoot");
    mode.hidden = uiMode === "user" && ["root", "reply"].includes(state.draft.mode);
    replyContext.hidden = state.draft.mode !== "reply";
    if (!replyContext.hidden) {
      const author = replyTarget && state.catalog?.actors.find((entry) => entry.id === replyTarget.authorId);
      const authorText = author && replyTarget.actorType === "human" ? actorName(author)
        : author && replyTarget.actorType === "agent" ? text(replyTarget.insight?.kind === "generated"
          ? uiMode === "user" ? "uiGeneratedInsightOperator" : "discussionGeneratedInsight"
          : uiMode === "user" ? "uiImportedInsightOperator" : "discussionImportedInsight")
          .replace("{operator}", actorName(state.catalog.actors.find((entry) => entry.id === replyTarget.insight?.operatorId))) : "";
      replyAuthor.textContent = !replyTarget ? text("uiReplyTargetUnavailable")
        : text("uiReplyToAuthor").replace("{author}", compactText(authorText || text("uiReplyUnknownAuthor"), 48));
      replyExcerpt.textContent = replyTarget && typeof replyTarget.body === "string"
        ? compactText(replyTarget.body, 120) || text("uiReplyTextUnavailable") : "";
      replyExcerpt.hidden = !replyExcerpt.textContent;
      replyStatus.textContent = replyTarget ? "" : text("uiReplyUnavailableAction");
      replyStatus.hidden = Boolean(replyTarget);
    }
    if (state.draft.mode === "reply" && !replyTarget) submit.setAttribute("aria-describedby", replyContext.id);
    else submit.removeAttribute("aria-describedby");
    submit.textContent = text(uiMode === "user" ? posting && state.draft.mode !== "edit" ? "uiPostSending"
      : state.draft.mode === "edit" ? "uiSaveChanges" : state.draft.mode === "reply" ? "uiPostReply" : "uiPostComment" : "discussionSubmit");
    submit.setAttribute("aria-busy", String(posting));
    discard.textContent = text(uiMode === "user" ? "uiDiscard" : "discussionDiscard");
    discard.hidden = uiMode === "user" && (state.draft.mode !== "root" ||
      !state.draft.body.trim() && !state.draft.detached);
    backToNewThread.hidden = uiMode !== "user" || state.draft.mode === "root";
    backToNewThread.disabled = posting || state.busy;
    backToNewThread.textContent = text(state.draft.body.trim() ? "uiDiscardDraftToNewThread" : "uiBackToNewThread");
    modelHost.hidden = uiMode === "user" && state.draft.mode !== "root";
    const postingSource = selectedPostingSource(state);
    originDisclosure.textContent = state.draft.mode === "edit" ? text("discussionOriginEdit") : postingSource
      ? text(uiMode === "user" ? "uiOriginDisclosure" : "discussionOriginDisclosure").replace("{title}", postingSource.title)
      : text(uiMode === "user" ? "uiOriginNone" : "discussionOriginNone");
    originDisclosure.hidden = uiMode === "user";
    const alternateView = state.topicViewMode === "experimental" && state.phase === "ready" &&
      !state.needsFreshRead && state.alternateDiscussion?.sourceId === state.sourceId
      ? state.alternateDiscussion : null;
    const displayRoots = alternateView
      ? [...alternateView.roots, ...alternateView.pinnedRoots] : state.discussion?.roots ?? [];
    const entries = displayRoots.flatMap((entry) => [entry, ...(entry.replies ?? [])]);
    const inlineTarget = uiMode === "user" && !state.draft.detached &&
      ["reply", "edit"].includes(state.draft.mode) &&
      (state.draft.mode !== "reply" || replyTarget) &&
      (state.draft.mode !== "edit" || editTarget) &&
      entries.some((entry) => entry.id === state.draft.targetId && entry.state === "visible")
      ? state.draft.targetId : null;
    alternateNotice.hidden = state.topicViewMode !== "experimental";
    alternateNotice.textContent = alternateNotice.hidden ? "" : text(alternateView
      ? "uiTopicViewActive" : state.alternateError || state.phase !== "ready"
        ? "uiTopicViewUnavailable" : "uiTopicViewLoading")
      .replace("{count}", String(alternateView?.sourceIds.length ?? 0));
    alternateNotice.setAttribute("data-state", alternateView ? "active" : "fallback");
    counts.textContent = state.discussion ? text(uiMode === "user" ? "uiContributionCounts" : "discussionCounts")
      .replace("{human}", String(entries.filter((entry) => entry.state === "visible" && entry.actorType === "human").length))
      .replace("{agent}", String(entries.filter((entry) => entry.state === "visible" && entry.actorType === "agent").length)) : "";
    counts.hidden = uiMode === "user";
    thread.hidden = uiMode === "user" && !state.discussion;
    // A discussion snapshot establishes the baseline for this Topic. Only a genuinely
    // new ID arriving later in that same Topic receives the entrance animation.
    const viewKey = alternateView ? `experimental:${state.sourceId}:${alternateView.sourceIds.join(",")}` : `classic:${state.topicId}`;
    if (observedViewKey !== viewKey) {
      observedViewKey = viewKey;
      observedContributionIds = new Set();
      observedDiscussion = false;
      expandedBranches.clear();
    }
    const arrivals = new Set();
    if (state.discussion) {
      for (const entry of entries) {
        if (typeof entry.id !== "string" || !entry.id) continue;
        // A write can refresh the discussion while busy. Defer the cue until
        // the confirmed ready render, so an author's new post still appears.
        if (observedDiscussion && !observedContributionIds.has(entry.id) &&
            (state.phase !== "ready" || state.busy)) continue;
        if (observedDiscussion && !observedContributionIds.has(entry.id) && entry.state === "visible") arrivals.add(entry.id);
        observedContributionIds.add(entry.id);
      }
      observedDiscussion = true;
    }
    // A reply composer must remain reachable even when its parent branch was
    // previously collapsed. Open the selected post's lineage without closing
    // any branch the reader opened deliberately.
    for (const target of [inlineTarget, followupTarget()]) {
      if (!target) continue;
      const rootEntry = displayRoots.find((entry) => entry.id === target ||
        entry.replies?.some((reply) => reply.id === target));
      if (rootEntry) {
        expandedBranches.add(rootEntry.id);
        const byId = new Map((rootEntry.replies ?? []).map((entry) => [entry.id, entry]));
        let parent = byId.get(target);
        const visited = new Set();
        while (parent && !visited.has(parent.id)) {
          visited.add(parent.id);
          if (parent.id !== target) expandedBranches.add(parent.id);
          parent = byId.get(parent.replyToId);
        }
      }
    }
    // Input updates leave contribution buttons in place so keyboard focus survives.
    const signature = JSON.stringify([state.discussion, alternateView]);
    const changedThread = signature !== renderedDiscussion || renderedActor !== state.actorId ||
      renderedBusy !== state.busy || renderedFreshRead !== state.needsFreshRead || renderedUiMode !== uiMode;
    const sameDraftContext = previousState?.sourceId === state.sourceId &&
      previousState?.topicId === state.topicId && previousState?.draft.mode === state.draft.mode &&
      previousState?.draft.targetId === state.draft.targetId &&
      previousState?.draft.detached === state.draft.detached;
    if (changedThread && !(composing && sameDraftContext && (inlineTarget || state.draft.mode === "root"))) {
      const focused = document.activeElement;
      const composerFocused = focused === body || focused === composer || composer.contains?.(focused);
      const insightFocused = insightHost?.contains?.(focused) ? focused : null;
      const selection = focused === body ? [body.selectionStart, body.selectionEnd, body.selectionDirection] : null;
      const focusKey = focused?.getAttribute?.("data-contribution-id") ?? focused?.attributes?.["data-contribution-id"] ??
        focused?.getAttribute?.("data-post-id") ?? focused?.attributes?.["data-post-id"];
      const focusAction = focused?.getAttribute?.("data-action") ?? focused?.attributes?.["data-action"];
      const focusRootId = focused?.getAttribute?.("data-thread-root-id") ?? focused?.attributes?.["data-thread-root-id"] ??
        (focusKey && previousState?.discussion?.roots.find((entry) =>
          entry.id === focusKey || entry.replies?.some((reply) => reply.id === focusKey))?.id);
      clearThreadHandlers(); const cards = [];
      let branchSerial = 0;
      for (const [index, rootEntry] of displayRoots.entries()) {
        if (alternateView?.pinnedRoots.length && index === alternateView.roots.length) {
          const divider = node("h3", "uiTopicViewPinned"); divider.className = "discussion-pinned-heading";
          cards.push(divider);
        }
        const group = node("section"); group.className = "discussion-thread-card";
        group.setAttribute("data-thread-root-id", rootEntry.id);
        group.setAttribute("tabindex", "-1");
        group.setAttribute("aria-label", text("uiThreadFocusLabel"));
        group.setAttribute("data-expanded", String(expandedBranches.has(rootEntry.id)));
        group.setAttribute("data-has-replies", String(Boolean(rootEntry.replies?.length)));
        group.append(contribution(rootEntry, rootEntry, state, arrivals.has(rootEntry.id)));
        if (uiMode === "user") {
          const replies = rootEntry.replies ?? [];
          if (!replies.length && rootEntry.state === "visible" && rootEntry.body.length > 180) {
            group.setAttribute("data-collapsible", "true");
            const toggle = branchToggle(rootEntry.id, 0, expandedBranches.has(rootEntry.id), true);
            const content = [...group.children[0].children].find((item) => item.className === "discussion-body");
            content.id = `discussion-root-body-${++branchSerial}`;
            toggle.setAttribute("aria-controls", content.id);
            toggle.threadGroup = group;
            group.append(toggle);
          }
          const byParent = new Map([[rootEntry.id, []]]);
          for (const reply of replies) byParent.set(reply.id, []);
          for (const reply of replies) {
            const parentId = byParent.has(reply.replyToId) ? reply.replyToId : rootEntry.id;
            byParent.get(parentId).push(reply);
          }
          // Create every node before linking parents and children. Same-time replies
          // can sort before their parent by ID, so array position is not lineage.
          const assembled = new Map();
          const childContainers = new Map();
          for (const reply of replies) {
            const branch = node("div"); branch.className = "discussion-reply-branch";
            branch.append(contribution(reply, rootEntry, state, arrivals.has(reply.id)));
            const children = byParent.get(reply.id) ?? [];
            if (children.length) {
              const toggle = branchToggle(reply.id, children.length, expandedBranches.has(reply.id));
              const childList = node("div"); childList.className = "discussion-reply-children";
              childList.id = `discussion-branch-${++branchSerial}`;
              toggle.setAttribute("aria-controls", childList.id);
              childList.setAttribute("data-open", String(expandedBranches.has(reply.id)));
              childList.setAttribute("aria-hidden", String(!expandedBranches.has(reply.id)));
              childList.inert = !expandedBranches.has(reply.id);
              toggle.replyChildren = childList;
              const childContent = node("div"); childContent.className = "discussion-reply-content";
              childList.append(childContent);
              branch.append(toggle, childList);
              childContainers.set(reply.id, childContent);
            }
            assembled.set(reply.id, branch);
          }
          if (replies.length) {
            const toggle = branchToggle(rootEntry.id, replies.length, expandedBranches.has(rootEntry.id));
            const replyList = node("div"); replyList.className = "discussion-replies";
            replyList.id = `discussion-branch-${++branchSerial}`;
            toggle.setAttribute("aria-controls", replyList.id);
            toggle.threadGroup = group;
            replyList.setAttribute("data-open", String(expandedBranches.has(rootEntry.id)));
            replyList.setAttribute("aria-hidden", String(!expandedBranches.has(rootEntry.id)));
            replyList.inert = !expandedBranches.has(rootEntry.id);
            toggle.replyChildren = replyList;
            const replyContent = node("div"); replyContent.className = "discussion-reply-content";
            childContainers.set(rootEntry.id, replyContent);
            replyList.append(replyContent);
            group.append(toggle, replyList);
            for (const reply of replies) {
              const parentId = byParent.has(reply.replyToId) ? reply.replyToId : rootEntry.id;
              childContainers.get(parentId).append(assembled.get(reply.id));
            }
          }
        } else for (const reply of rootEntry.replies ?? []) group.append(contribution(reply, rootEntry, state, arrivals.has(reply.id)));
        cards.push(group);
      }
      if (state.discussion && !cards.length) cards.push(node("p", uiMode === "user" ? "uiDiscussionEmpty" : "discussionEmpty"));
      thread.replaceChildren(...cards); renderedDiscussion = signature; renderedActor = state.actorId; renderedBusy = state.busy;
      renderedFreshRead = state.needsFreshRead; renderedUiMode = uiMode;
      if (focusKey || focusRootId) {
        const descendants = [...(thread.querySelectorAll?.("[data-action], [data-post-id], [data-thread-root-id]") ?? [])];
        const replacement = descendants.find((item) => item.getAttribute("data-contribution-id") === focusKey &&
          item.getAttribute("data-action") === focusAction);
        const post = descendants.find((item) => item.getAttribute("data-post-id") === focusKey);
        const group = descendants.find((item) => item.getAttribute("data-thread-root-id") === focusRootId);
        const focusAvailable = (item) => {
          if (!item || item.disabled || item.closest?.("[inert]")) return false;
          item.focus?.({ preventScroll: true });
          return document.activeElement === item;
        };
        if (!focusAvailable(replacement) && !focusAvailable(post) && !focusAvailable(group))
          focusAvailable(thread);
      }
      // Reattach the original form before restoring focus. A snapshot rebuild
      // removes its old target card, which otherwise detaches the textarea.
      placeComposer(inlineTarget);
      if (sameDraftContext && composerFocused && (document.activeElement === focused || !document.activeElement ||
          document.activeElement === document.body)) {
        focused.focus?.({ preventScroll: true });
        if (focused === body && Number.isInteger(selection?.[0]) && Number.isInteger(selection?.[1]))
          body.setSelectionRange?.(...selection);
      } else if (insightFocused && followupTarget() && insightHost?.contains?.(insightFocused) &&
          (document.activeElement === focused || !document.activeElement || document.activeElement === document.body)) {
        insightFocused.focus?.({ preventScroll: true });
      }
    }
    placeComposer(inlineTarget);
    const alternateTopicIds = new Set((alternateView?.roots ?? []).map((entry) => entry.canonicalTopicId));
    const readOnlyRelated = selectedTopicReady ? (state.relatedDiscussions ?? [])
      .filter((entry) => !alternateTopicIds.has(entry.topicId)) : [];
    relatedDiscussions.hidden = uiMode !== "user" || readOnlyRelated.length === 0;
    const relatedSignature = JSON.stringify(readOnlyRelated);
    if (relatedSignature !== renderedRelatedDiscussions) {
      const openTopics = new Set([...relatedDiscussionsList.children]
        .filter((item) => item.open).map((item) => item.getAttribute("data-related-topic-id")));
      const cards = readOnlyRelated.map((relatedTopic) => {
        const group = node("details"); group.className = "related-discussion-topic";
        group.setAttribute("data-related-topic-id", relatedTopic.topicId);
        group.open = openTopics.has(relatedTopic.topicId);
        const summary = node("summary"); summary.className = "related-discussion-summary";
        const title = node("span"); title.textContent = relatedTopic.title;
        const count = node("span"); count.className = "related-discussion-count";
        count.textContent = text("uiRelatedThreadCount").replace("{count}", String(relatedTopic.rootCount));
        summary.append(title, count); group.append(summary);
        for (const entry of relatedTopic.roots) {
          const card = node("article"); card.className = "related-discussion-card";
          const actor = state.catalog.actors.find((item) => item.id === entry.authorId);
          const author = node("span");
          if (entry.actorType === "agent") {
            const generated = entry.insight?.kind === "generated";
            const operator = actorName(state.catalog.actors.find((item) => item.id === entry.insight?.operatorId));
            const provenance = text(generated ? "uiGeneratedInsightProvenance" : "discussionImportedInsight")
              .replace("{operator}", operator);
            author.textContent = text(generated ? "uiGeneratedInsightOperator" : "uiImportedInsightOperator")
              .replace("{operator}", operator);
            author.className = "insight-provenance";
            author.setAttribute("aria-label", provenance);
            author.title = provenance;
            card.setAttribute("aria-label", text("uiPostByAuthor").replace("{author}", provenance));
          } else author.textContent = actorName(actor) || entry.authorId;
          const meta = node("p"); meta.className = "related-discussion-meta"; meta.append(author);
          if (typeof entry.createdAt === "string") {
            const date = new Date(entry.createdAt);
            if (Number.isFinite(date.getTime())) {
              const time = node("time"); time.dateTime = entry.createdAt;
              time.textContent = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
              meta.append(time);
            }
          }
          const content = node("p"); content.className = "related-discussion-body";
          if (entry.actorType === "agent") appendInsightCitationNodes(document, content,
            entry.body, text("discussionCitationOpen"), text("discussionCitationUnverifiedOpen"),
            text("discussionCitationUnverifiedNote"));
          else content.textContent = entry.body;
          const footer = node("p"); footer.className = "related-discussion-footer";
          footer.textContent = text("uiRelatedReplyCount").replace("{count}", String(entry.replyCount));
          if (entry.origin) {
            try {
              const origin = readPostOrigin(entry.origin);
              const link = node("a"); link.className = "discussion-source-link";
              link.textContent = "↗"; link.href = origin.url; link.target = "_blank";
              link.rel = "noopener noreferrer"; link.referrerPolicy = "no-referrer";
              link.setAttribute("aria-label", text("discussionOriginOpen")
                .replace("{title}", origin.title.slice(0, 160)).replace("{url}", origin.url.slice(0, 240)));
              footer.append(link);
            } catch { /* Invalid origins are never navigable. */ }
          }
          card.append(meta, content, footer); group.append(card);
        }
        return group;
      });
      relatedDiscussionsList.replaceChildren(...cards);
      renderedRelatedDiscussions = relatedSignature;
    }
    const modelStatus = state.related?.model?.status ?? state.catalog?.model.status;
    model.textContent = !state.catalog ? "" : text(modelStatus === "experimental-local" ? "discussionModelLearned" : modelStatus === "model-unavailable" ? "discussionModelUnavailable" : "discussionModelFixture");
    const selectedSource = state.catalog?.sources.find((source) => source.id === state.sourceId);
    const learned = selectedSource?.provenance === "owner-local-page-embedding/v1";
    provenance.textContent = !selectedSource ? "" : text(learned ? "discussionProvenanceLearned" : "discussionProvenanceFixture");
    learnedControls.hidden = !(state.catalog?.sources.some((source) => source.provenance === "owner-local-page-embedding/v1") ||
      state.catalog?.topics.some((topic) => topic.learned === true));
    savedTopicHint.hidden = state.topicViewMode !== "experimental" || learnedControls.hidden;
    choices(correctionTarget, state.catalog?.topics ?? [], correctionTarget.value, "discussionSeparate");
    learnedActions();
    const suggestions = (state.related?.results ?? []).map((source) => {
      const item = node("li");
      const safeUrl = typeof source.url === "string" && inspectPageUrl(source.url).supported &&
        inspectPageUrl(source.url).url === source.url;
      const sourceTitle = node(safeUrl ? "a" : "p"); sourceTitle.className = "related-page-title";
      sourceTitle.textContent = source.title;
      if (safeUrl) {
        sourceTitle.href = source.url; sourceTitle.target = "_blank"; sourceTitle.rel = "noopener noreferrer";
        sourceTitle.referrerPolicy = "no-referrer";
      }
      const address = node("p"); address.className = "related-page-address";
      address.textContent = safeUrl && uiMode === "user" ? new URL(source.url).hostname : source.url;
      const association = node("p", source.relationship === "same-topic" ? "discussionSameTopic" : "discussionRelatedReading");
      item.append(sourceTitle, address, association); return item;
    });
    if (state.related && !suggestions.length && uiMode === "developer") suggestions.push(node("li", "discussionRelatedEmpty"));
    related.replaceChildren(...suggestions);
    relatedDetails.hidden = !state.related || uiMode === "user";
    if (uiMode === "developer") relatedDetails.open = true;
    reset.disabled = !state.catalog || !usable || confirmation.value !== "RESET DEMO STATE";
    rendering = false;
  }
  function renderInsightState(state) {
    if (disposed) return;
    const previousTarget = followupTarget();
    lastInsightState = state;
    const selectedTopicReady = lastState?.phase === "ready" && !lastState.busy && !lastState.needsFreshRead &&
      !lastState.error && Boolean(lastState.discussion && lastState.related) &&
      lastState.catalog?.topics.some((entry) => entry.id === lastState.topicId);
    const aiStatus = state?.ai?.status;
    const active = ["preparingArticle", "fetchingRelated", "generating", "resuming"].includes(aiStatus);
    const hasResult = Boolean(state?.ai?.result);
    const noCurrentSource = Boolean(state) && !state.context?.currentSource;
    const setupNeeded = uiMode === "user" && Boolean(state?.ai) && (!state.ai.planEnabled || !state.ai.model);
    const stageKey = { preparingArticle: "uiInsightPreparing", fetchingRelated: "uiInsightFindingRelated",
      generating: "uiInsightGenerating", resuming: "uiInsightResuming" }[aiStatus];
    const loadingSelected = lastState?.phase === "loading" && Boolean(lastState.topicId && lastState.sourceId) &&
      lastState.catalog?.sources.some((entry) => entry.id === lastState.sourceId && entry.topicId === lastState.topicId);
    insightShortcut.hidden = uiMode === "user" && ((!selectedTopicReady && !loadingSelected) || hasResult ||
      lastState?.draft.mode !== "root");
    insightShortcut.disabled = !selectedTopicReady || uiMode === "user" && noCurrentSource || active || Boolean(state?.busy) || hasResult;
    insightShortcut.setAttribute("aria-busy", String(active));
    insightShortcut.setAttribute("data-phase", active ? "working" : "idle");
    insightShortcut.setAttribute("aria-label", text(active ? stageKey : setupNeeded ? "uiInsightSetupLabel" : "uiGenerateInsightLabel"));
    insightShortcut.textContent = text(setupNeeded ? "uiInsightSetupButton" : "uiCreateInsights");
    const inlineFollowup = Boolean(followupTarget());
    insightActivity.hidden = inlineFollowup;
    insightActivity.textContent = inlineFollowup ? "" : active ? text(stageKey) : hasResult ? text("uiInsightReady")
      : setupNeeded ? text(state.ai.connected && !state.ai.planEnabled ? "uiInsightPlanUnavailableHint" : "uiInsightSetupHint") : "";
    if (!rendering && lastState && previousTarget !== followupTarget()) {
      renderedDiscussion = undefined;
      render(lastState);
    }
  }
  function bind(value) { controller = value; render(controller.currentState()); }
  function bindInsight(value) { insightController = value; renderInsightState(value?.currentState?.()); }
  function setMode(value) {
    if (!["user", "developer"].includes(value) || disposed) return;
    uiMode = value;
    if (value === "developer") { connectionSettings.open = true; advanced.open = true; relatedDetails.open = true; }
    else { connectionSettings.open = false; advanced.open = false; relatedDetails.open = false; }
    // Never rebuild controls or call the controller on a display-only change.
    if (lastState) render(lastState);
    renderInsightState(lastInsightState);
  }
  function dispose() {
    if (disposed) return; disposed = true; token.value = ""; body.value = ""; clearThreadHandlers(); clearPriorHandlers();
    for (const [item, event, callback] of handlers) item.removeEventListener(event, callback);
    root.replaceChildren();
  }
  return Object.freeze({ bind, bindInsight, render, renderInsightState, setMode, dispose });
}
