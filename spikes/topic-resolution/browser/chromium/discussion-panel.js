import { EN } from "../locales/en.js";
import { projectDiscussionShell } from "./popup-shell.js";
import { readPostOrigin } from "../core/local-service-contract.js";
import { ownsContribution, selectedPostingSource } from "../core/local-discussion-controller.js";

export function mountDiscussionPanel(document, root, { messages = EN } = {}) {
  const text = (key) => messages?.[key] ?? EN[key];
  const handlers = [];
  let controller;
  let lastState;
  let disposed = false;
  let uiMode = "user";
  function node(tag, key) {
    const item = document.createElement(tag);
    if (key) item.textContent = text(key);
    return item;
  }
  function label(control, key, id, parent = root) {
    control.id = id;
    const item = node("label", key); item.htmlFor = id;
    parent.append(item, control);
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
  const topicLabel = node("p", "uiTopicLabel"); topicLabel.className = "topic-eyebrow user-only";
  const topicTitle = node("h1"); topicTitle.id = "selected-topic-title"; topicTitle.className = "user-only";
  const selectionCue = node("p"); selectionCue.id = "selected-topic-provenance"; selectionCue.className = "user-only topic-selection-cue";
  const insightShortcut = node("button", "uiCreateInsights"); insightShortcut.type = "button";
  insightShortcut.id = "discussion-ai-insights"; insightShortcut.className = "user-only insight-shortcut";
  listen(insightShortcut, "click", () => {
    const workspace = document.querySelector?.("#insight-workspace");
    if (!workspace) return;
    workspace.open = true;
    workspace.scrollIntoView?.({ block: "start", behavior: "smooth" });
    workspace.querySelector?.("summary")?.focus?.({ preventScroll: true });
  });
  root.setAttribute("aria-labelledby", heading.id);
  const scope = node("p", "discussionScope"); scope.className = "developer-only";
  root.append(topicLabel, topicTitle, selectionCue, insightShortcut, heading, scope);
  const status = node("p"); status.id = "discussion-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); root.append(status);
  const connectionSettings = node("details"); connectionSettings.id = "discussion-connection-settings";
  connectionSettings.className = "compact-details";
  connectionSettings.append(node("summary", "uiConnectionSetup")); root.append(connectionSettings);
  const advanced = node("details"); advanced.id = "discussion-advanced"; advanced.className = "compact-details";
  const advancedSummary = node("summary", "uiAdvanced");
  advanced.append(advancedSummary, node("p", "discussionScope"));
  const token = node("input"); token.type = "password"; token.autocomplete = "off";
  token.spellcheck = false; token.maxLength = 512;
  label(token, "discussionToken", "discussion-token", connectionSettings);
  const pairForm = node("form"); const pair = node("button", "discussionPair"); pair.type = "submit";
  pair.id = "discussion-pair";
  // The input is intentionally outside the form: no native form serialization.
  pairForm.append(pair); connectionSettings.append(pairForm);
  listen(pairForm, "submit", (event) => {
    event.preventDefault(); const value = token.value; token.value = "";
    void controller?.pair(value);
  });
  const disconnect = button("discussionDisconnect", () => { token.value = ""; void controller?.disconnect(); }, connectionSettings);
  const reload = button("discussionReload", () => void controller?.open(), connectionSettings);
  const topic = node("select"); label(topic, "discussionTopic", "discussion-topic", advanced);
  listen(topic, "change", () => void controller?.selectTopic(topic.value));
  const source = node("select"); label(source, "discussionSource", "discussion-source", advanced);
  listen(source, "change", () => void controller?.selectSource(source.value));
  const actor = node("select"); label(actor, "discussionActor", "discussion-actor", advanced);
  listen(actor, "change", () => void controller?.selectActor(actor.value));
  const createForm = node("form"); advanced.append(createForm);
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
  root.append(counts, thread);
  const composer = node("form"); const mode = node("p"); root.append(composer);
  const identity = node("p"); identity.id = "discussion-demo-identity"; composer.append(identity);
  const originDisclosure = node("p"); originDisclosure.id = "discussion-origin-disclosure"; composer.append(originDisclosure);
  const body = node("textarea"); body.id = "discussion-body"; body.maxLength = 8000;
  body.rows = 5;
  const bodyLabel = node("label", "discussionBody"); bodyLabel.htmlFor = body.id;
  const detached = node("p", "discussionDetached"); detached.setAttribute("role", "status");
  const submit = node("button", "discussionSubmit"); submit.type = "submit";
  submit.id = "discussion-submit";
  composer.append(mode, bodyLabel, body, detached, submit);
  listen(body, "input", () => controller?.setDraft(body.value));
  listen(composer, "submit", (event) => { event.preventDefault(); void controller?.submitDraft(); });
  const reattach = button("discussionReattach", () => { controller?.reattachDraft(); body.focus(); }, composer);
  const discard = button("discussionDiscard", () => { controller?.discardDraft(); body.focus(); }, composer);
  const relatedHeading = node("h3", "discussionRelated"); const model = node("p");
  model.className = "developer-only";
  const related = node("ul"); root.append(relatedHeading, model, related);
  const provenance = node("p"); provenance.id = "discussion-provenance"; provenance.className = "developer-only"; root.append(provenance);
  const learnedControls = node("section"); learnedControls.id = "discussion-learned-controls";
  learnedControls.append(node("h3", "discussionCorrectionHeading"), node("p", "discussionCorrectionIntro")); advanced.append(learnedControls);
  const correctionTarget = node("select"); correctionTarget.id = "discussion-correction-topic";
  const correctionLabel = node("label", "discussionCorrectionTarget"); correctionLabel.htmlFor = correctionTarget.id;
  const correctConfirm = node("input"); correctConfirm.id = "discussion-correction-confirm"; correctConfirm.type = "checkbox";
  const correctLabel = node("label", "discussionCorrectConfirm"); correctLabel.htmlFor = correctConfirm.id;
  learnedControls.append(correctionLabel, correctionTarget, correctLabel, correctConfirm);
  const correct = button("discussionCorrect", async () => {
    if (!correctConfirm.checked) return;
    if (await controller?.correctSource(correctionTarget.value || null, "CONFIRM SOURCE TOPIC")) correctConfirm.checked = false;
  }, learnedControls);
  const forget = button("discussionForget", () => void controller?.forgetSource(), learnedControls);
  const deleteInput = node("input"); deleteInput.id = "discussion-delete-confirmation"; deleteInput.autocomplete = "off";
  const deleteLabel = node("label", "discussionDeleteLabel"); deleteLabel.htmlFor = deleteInput.id;
  learnedControls.append(deleteLabel, deleteInput);
  const deleteTopic = button("discussionDelete", async () => {
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
    const selectedLearned = lastState?.catalog?.sources.some((source) => source.id === lastState.sourceId && source.provenance === "owner-local-page-embedding/v1");
    const selectedLearnedTopic = lastState?.catalog?.topics.some((topic) => topic.id === lastState.topicId && topic.learned === true);
    correct.disabled = !usable || !selectedLearned || !correctConfirm.checked;
    forget.disabled = !usable || !selectedLearned;
    deleteTopic.disabled = !usable || !selectedLearnedTopic || deleteInput.value !== "DELETE TOPIC AND DISCUSSION";
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
  function clearThreadHandlers() {
    for (const [item, callback] of threadHandlers) item.removeEventListener("click", callback);
    threadHandlers = [];
  }
  function contribution(entry, rootEntry, state) {
    const card = node("article"); card.className = "discussion-contribution";
    if (entry.state === "deleted") { card.append(node("p", "discussionDeleted")); return card; }
    const author = node("p"); author.textContent = state.catalog.actors.find((item) => item.id === entry.authorId)?.displayName ?? entry.authorId;
    if (entry.actorType === "agent") {
      const operator = state.catalog.actors.find((item) => item.id === entry.insight?.operatorId)?.displayName ?? "";
      author.textContent = text("discussionImportedInsight").replace("{operator}", operator);
      author.className = "insight-provenance";
    }
    const content = node("p"); content.className = "discussion-body"; content.textContent = entry.body;
    card.append(author, content);
    if (entry.origin) {
      try {
        const origin = readPostOrigin(entry.origin);
        const link = node("a"); link.className = "discussion-source-link";
        link.textContent = "↗";
        link.href = origin.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.referrerPolicy = "no-referrer";
        const destination = text("discussionOriginOpen").replace("{title}", origin.title.slice(0, 160)).replace("{url}", origin.url.slice(0, 240));
        link.setAttribute("aria-label", destination); link.title = destination;
        card.append(link);
      } catch { /* Invalid projections never become navigable links. */ }
    }
    if (entry === rootEntry && entry.regrouped === true) card.append(node("p", "discussionRegrouped"));
    if (entry.edited) card.append(node("span", "discussionEdited"));
    function action(key, callback) {
      const item = node("button", key); item.type = "button"; item.disabled = state.busy || state.needsFreshRead || state.phase !== "ready";
      item.setAttribute("data-action", key.replace(/^discussion/u, "").toLowerCase());
      item.setAttribute("data-contribution-id", entry.id);
      item.addEventListener("click", callback); threadHandlers.push([item, callback]); card.append(item);
    }
    if (rootEntry.state === "visible") action("discussionReply", () => { if (controller?.begin("reply", entry.id)) body.focus(); });
    if (ownsContribution(entry, state.actorId)) {
      action("discussionEdit", () => { if (controller?.begin("edit", entry.id)) body.focus(); });
      action("discussionWithdraw", () => void controller?.withdraw(entry.id));
    }
    return card;
  }
  let renderedDiscussion;
  let renderedActor;
  let renderedBusy;
  let renderedFreshRead;
  let confirmationContext;
  function render(state) {
    if (disposed) return;
    const previousState = lastState;
    lastState = state;
    const shellView = projectDiscussionShell(state, messages);
    topicTitle.textContent = shellView.topicTitle;
    selectionCue.textContent = shellView.selectionCue; selectionCue.hidden = !shellView.selectionCue;
    heading.textContent = text(uiMode === "user" ? "uiDiscussions" : "discussionHeading");
    advancedSummary.textContent = text(uiMode === "user" ? "uiAdvanced" : "uiAdvancedDeveloper");
    insightShortcut.disabled = !state.catalog || !["ready", "choose-topic"].includes(state.phase) || state.busy;
    relatedHeading.textContent = text(uiMode === "user" ? "uiRelated" : "discussionRelated");
    identity.textContent = !state.catalog ? "" : text("uiDemoIdentity").replace("{actor}",
      state.catalog.actors.find((entry) => entry.id === state.actorId)?.displayName ?? text("discussionChoose"));
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
    confirmationContext = nextConfirmationContext;
    const errorKey = { unauthorized: "discussionUnauthorized", conflict: "discussionConflict", capacity: "discussionCapacity",
      "invalid-request": "discussionInvalid", "invalid-response": "discussionInvalid", "context-changed": "discussionContextChanged" }[state.error];
    status.textContent = text(errorKey ?? (state.error ? "discussionUnavailable" : {
      ready: "discussionReady", disconnected: "discussionDisconnected", connecting: "discussionConnecting",
      loading: "discussionLoading", "choose-topic": "discussionChooseStatus" }[state.phase] ?? "discussionUnavailable"));
    if (state.needsFreshRead) status.textContent += ` · ${text("discussionReload")}`;
    status.hidden = uiMode === "user" && state.phase === "ready" && !state.error && !state.needsFreshRead;
    const usable = ["ready", "choose-topic"].includes(state.phase) && !state.busy && !state.needsFreshRead;
    pair.disabled = state.busy || state.phase === "connecting";
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
    if (body.value !== state.draft.body) body.value = state.draft.body;
    composer.hidden = uiMode === "user" && !state.catalog && !state.draft.body;
    body.disabled = !ready;
    detached.hidden = !state.draft.detached;
    reattach.hidden = !state.draft.detached; reattach.disabled = !ready;
    submit.disabled = !ready || state.draft.detached || !state.draft.body.trim();
    mode.textContent = text((uiMode === "user" ? { root: "discussionComposerRoot", reply: "uiReplyMode", edit: "uiEditMode" }
      : { root: "discussionComposerRoot", reply: "discussionComposerReply", edit: "discussionComposerEdit" })[state.draft.mode])
      .replace("{id}", state.draft.targetId ?? "");
    if (uiMode === "user" && state.draft.mode === "root") mode.textContent = text("uiComposerRoot");
    submit.textContent = text(uiMode === "user" ? state.draft.mode === "edit" ? "uiSaveChanges" : "uiPostComment" : "discussionSubmit");
    discard.textContent = text(uiMode === "user" ? "uiDiscard" : "discussionDiscard");
    const postingSource = selectedPostingSource(state);
    originDisclosure.textContent = state.draft.mode === "edit" ? text("discussionOriginEdit") : postingSource
      ? text("discussionOriginDisclosure").replace("{title}", postingSource.title)
      : text("discussionOriginNone");
    const entries = state.discussion?.roots.flatMap((entry) => [entry, ...entry.replies]) ?? [];
    counts.textContent = state.discussion ? text(uiMode === "user" ? "uiContributionCounts" : "discussionCounts")
      .replace("{human}", String(entries.filter((entry) => entry.state === "visible" && entry.actorType === "human").length))
      .replace("{agent}", String(entries.filter((entry) => entry.state === "visible" && entry.actorType === "agent").length)) : "";
    // Input updates leave contribution buttons in place so keyboard focus survives.
    const signature = JSON.stringify(state.discussion);
    if (signature !== renderedDiscussion || renderedActor !== state.actorId || renderedBusy !== state.busy || renderedFreshRead !== state.needsFreshRead) {
      clearThreadHandlers(); const cards = [];
      for (const rootEntry of state.discussion?.roots ?? []) {
        const group = node("section"); group.append(contribution(rootEntry, rootEntry, state));
        for (const reply of rootEntry.replies) group.append(contribution(reply, rootEntry, state)); cards.push(group);
      }
      if (state.discussion && !cards.length) cards.push(node("p", "discussionEmpty"));
      thread.replaceChildren(...cards); renderedDiscussion = signature; renderedActor = state.actorId; renderedBusy = state.busy;
      renderedFreshRead = state.needsFreshRead;
    }
    const modelStatus = state.related?.model?.status ?? state.catalog?.model.status;
    model.textContent = !state.catalog ? "" : text(modelStatus === "experimental-local" ? "discussionModelLearned" : modelStatus === "model-unavailable" ? "discussionModelUnavailable" : "discussionModelFixture");
    const selectedSource = state.catalog?.sources.find((source) => source.id === state.sourceId);
    const learned = selectedSource?.provenance === "owner-local-page-embedding/v1";
    provenance.textContent = !selectedSource ? "" : text(learned ? "discussionProvenanceLearned" : "discussionProvenanceFixture");
    learnedControls.hidden = !(state.catalog?.sources.some((source) => source.provenance === "owner-local-page-embedding/v1") ||
      state.catalog?.topics.some((topic) => topic.learned === true));
    choices(correctionTarget, state.catalog?.topics ?? [], correctionTarget.value, "discussionSeparate");
    learnedActions();
    const suggestions = (state.related?.results ?? []).map((source) => {
      const item = node("li"); const sourceTitle = node("p"); sourceTitle.textContent = source.title;
      const address = node("p"); address.textContent = source.url;
      const association = node("p", source.relationship === "same-topic" ? "discussionSameTopic" : "discussionRelatedReading");
      item.append(sourceTitle, address, association); return item;
    });
    if (state.related && !suggestions.length) suggestions.push(node("li", "discussionRelatedEmpty"));
    related.replaceChildren(...suggestions);
    relatedHeading.hidden = related.hidden = !state.related;
    reset.disabled = !state.catalog || !usable || confirmation.value !== "RESET DEMO STATE";
  }
  function bind(value) { controller = value; render(controller.currentState()); }
  function setMode(value) {
    if (!["user", "developer"].includes(value) || disposed) return;
    uiMode = value;
    if (value === "developer") { connectionSettings.open = true; advanced.open = true; }
    else { connectionSettings.open = false; advanced.open = false; }
    // Never rebuild controls or call the controller on a display-only change.
    if (lastState) render(lastState);
  }
  function dispose() {
    if (disposed) return; disposed = true; token.value = ""; body.value = ""; clearThreadHandlers();
    for (const [item, event, callback] of handlers) item.removeEventListener(event, callback);
    root.replaceChildren();
  }
  return Object.freeze({ bind, render, setMode, dispose });
}
