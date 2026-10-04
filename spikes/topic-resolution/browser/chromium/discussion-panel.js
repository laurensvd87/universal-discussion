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
  const topicLabel = node("p", "uiTopicLabel"); topicLabel.className = "topic-eyebrow user-only";
  const topicTitle = node("h1"); topicTitle.id = "selected-topic-title"; topicTitle.className = "user-only";
  const selectionCue = node("p"); selectionCue.id = "selected-topic-provenance"; selectionCue.className = "user-only topic-selection-cue";
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
  root.append(topicLabel, topicTitle, selectionCue, sectionBar, scope);
  const status = node("p"); status.id = "discussion-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); root.append(status);
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
  const composer = node("form"); composer.id = "discussion-composer";
  const mode = node("p"); root.append(composer);
  const identity = node("p"); identity.id = "discussion-demo-identity"; composer.append(identity);
  const originDisclosure = node("p"); originDisclosure.id = "discussion-origin-disclosure"; composer.append(originDisclosure);
  const body = node("textarea"); body.id = "discussion-body"; body.maxLength = 8000;
  body.rows = 3;
  const bodyLabel = node("label", "discussionBody"); bodyLabel.htmlFor = body.id;
  const detached = node("p", "discussionDetached"); detached.setAttribute("role", "status");
  const submit = node("button", "discussionSubmit"); submit.type = "submit";
  submit.id = "discussion-submit";
  const composerActions = node("div"); composerActions.className = "discussion-composer-actions";
  const insightActivity = node("span"); insightActivity.id = "discussion-insight-activity";
  insightActivity.setAttribute("role", "status"); insightActivity.setAttribute("aria-live", "polite");
  insightShortcut.setAttribute("aria-describedby", insightActivity.id);
  composerActions.append(submit, insightShortcut, insightActivity);
  composer.append(mode, bodyLabel, body, detached, composerActions);
  listen(body, "input", () => controller?.setDraft(body.value));
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
  const relatedDetails = node("details"); relatedDetails.id = "discussion-related";
  relatedDetails.className = "compact-details";
  const relatedHeading = node("summary", "discussionRelated"); const model = node("p");
  model.className = "developer-only";
  const related = node("ul"); relatedDetails.append(relatedHeading, model, related); root.append(relatedDetails);
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
  function actorName(actor) {
    const raw = actor?.displayName ?? actor?.id ?? "";
    if (uiMode !== "user") return raw;
    if (actor?.id === "demo-alex" && raw === "Alex · synthetic") return "Alex";
    if (actor?.id === "demo-blair" && raw === "Blair · synthetic") return "Blair";
    return raw;
  }
  function contribution(entry, rootEntry, state, newlyArrived = false) {
    const card = node("article"); card.className = "discussion-contribution";
    if (newlyArrived && entry.state === "visible") card.className += " is-new";
    if (entry.state === "deleted") { card.append(node("p", "discussionDeleted")); return card; }
    const actor = state.catalog.actors.find((item) => item.id === entry.authorId);
    const author = node("p"); author.textContent = actorName(actor) || entry.authorId;
    if (actor?.displayName && author.textContent !== actor.displayName) author.title = actor.displayName;
    if (entry.actorType === "human") {
      author.className = "human-provenance";
      author.setAttribute("aria-label", text("uiHumanContributor").replace("{name}", author.textContent));
    }
    if (entry.actorType === "agent") {
      const operatorActor = state.catalog.actors.find((item) => item.id === entry.insight?.operatorId);
      const operator = actorName(operatorActor);
      author.textContent = text(entry.insight?.kind === "generated" ? "discussionGeneratedInsight" : "discussionImportedInsight")
        .replace("{operator}", operator);
      author.className = "insight-provenance";
    }
    const content = node("p"); content.className = "discussion-body";
    if (entry.actorType === "agent") appendInsightCitationNodes(document, content, entry.body, text("discussionCitationOpen"));
    else content.textContent = entry.body;
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
        });
      }
      if (entry.actorType !== "agent") action("discussionEdit", () => { if (controller?.begin("edit", entry.id)) body.focus(); });
      action("discussionWithdraw", () => void controller?.withdraw(entry.id));
    }
    return card;
  }
  let renderedDiscussion;
  let renderedActor;
  let renderedBusy;
  let renderedFreshRead;
  let renderedUiMode;
  let observedTopicId;
  let observedContributionIds = new Set();
  let observedDiscussion = false;
  let confirmationContext;
  let connectionPosition = "before";
  function render(state) {
    if (disposed) return;
    const previousState = lastState;
    lastState = state;
    // Keep the primary write/insight action above long conversations in User Mode.
    if (uiMode === "user") {
      const insightHost = document.querySelector?.("#app-discussion-insights-host");
      if (insightHost?.parentElement === root) {
        if (composer.nextSibling !== insightHost || insightHost.nextSibling !== thread) {
          root.insertBefore(composer, thread);
          root.insertBefore(insightHost, thread);
        }
      } else if (composer.nextSibling !== thread) root.insertBefore(composer, thread);
    } else if (thread.nextSibling !== composer) root.insertBefore(composer, thread.nextSibling);
    const shellView = projectDiscussionShell(state, messages);
    connectionSummary.textContent = text(shellView.connection === "connected" ? "uiConnectionReady" : "uiConnectionSetup");
    connectionSettings.setAttribute("data-connection", shellView.connection);
    // Keep keyboard order aligned with the compact visual order in User Mode.
    const nextConnectionPosition = uiMode === "user" && shellView.connection === "connected" ? "after" : "before";
    if (nextConnectionPosition !== connectionPosition && !document.querySelector?.("#app-navigation")) {
      root.insertBefore(connectionSettings, nextConnectionPosition === "after" ? advanced : counts);
      connectionPosition = nextConnectionPosition;
    }
    topicTitle.textContent = shellView.topicTitle;
    selectionCue.textContent = shellView.selectionCue; selectionCue.hidden = !shellView.selectionCue;
    heading.textContent = text(uiMode === "user" ? "uiDiscussions" : "discussionHeading");
    heading.hidden = uiMode === "user";
    advancedSummary.textContent = text(uiMode === "user" ? "uiAdvanced" : "uiAdvancedDeveloper");
    advancedScope.textContent = text(uiMode === "user" ? "uiDataScope" : "discussionScope");
    const selectedTopicReady = state.phase === "ready" && !state.busy && !state.needsFreshRead && !state.error &&
      state.catalog?.topics.some((entry) => entry.id === state.topicId);
    renderInsightState(lastInsightState);
    relatedHeading.textContent = uiMode === "user"
      ? text("uiRelatedCount").replace("{count}", String(state.related?.results?.length ?? 0))
      : text("discussionRelated");
    identity.textContent = !state.catalog ? "" : text("uiDemoIdentity").replace("{actor}",
      actorName(state.catalog.actors.find((entry) => entry.id === state.actorId)) || text("discussionChoose"));
    identity.hidden = uiMode === "user";
    bodyLabel.textContent = text(uiMode === "user" ? "uiCommentBody" : "discussionBody");
    bodyLabel.hidden = uiMode === "user";
    body.setAttribute("aria-label", text(uiMode === "user" ? "uiCommentBody" : "discussionBody"));
    body.placeholder = uiMode === "user" ? text("uiCommentPlaceholder") : "";
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
    const errorKey = { unauthorized: "discussionUnauthorized", "extension-connection-unavailable": "discussionExtensionUnavailable", "durable-pairing-required": "discussionDurableRequired",
      conflict: "discussionConflict", capacity: "discussionCapacity",
      "invalid-request": "discussionInvalid", "invalid-response": "discussionInvalid", "context-changed": "discussionContextChanged" }[state.error];
    status.textContent = text(errorKey ?? (state.error ? "discussionUnavailable" : {
      ready: "discussionReady", disconnected: "discussionDisconnected", connecting: "discussionConnecting",
      loading: "discussionLoading", "choose-topic": "discussionChooseStatus" }[state.phase] ?? "discussionUnavailable"));
    if (state.needsFreshRead) status.textContent += ` · ${text("discussionReload")}`;
    status.hidden = uiMode === "user" && state.phase === "ready" && !state.error && !state.needsFreshRead;
    const usable = ["ready", "choose-topic"].includes(state.phase) && !state.busy && !state.needsFreshRead;
    const showPairingInput = uiMode !== "user" || state.error !== "extension-connection-unavailable" &&
      (shellView.connection !== "connected" || state.error === "unauthorized");
    tokenLabel.hidden = token.hidden = pairForm.hidden = !showPairingInput;
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
    composer.hidden = uiMode === "user" && !posting && !selectedTopicReady && !state.draft.body.trim() &&
      !state.draft.detached && state.draft.mode === "root";
    body.disabled = !ready && !(posting && state.phase === "ready" && !state.needsFreshRead);
    body.readOnly = posting;
    detached.hidden = !state.draft.detached;
    reattach.hidden = !state.draft.detached; reattach.disabled = !ready;
    submit.disabled = posting || !ready || state.draft.detached || !state.draft.body.trim();
    mode.textContent = text((uiMode === "user" ? { root: "discussionComposerRoot", reply: "uiReplyMode", edit: "uiEditMode" }
      : { root: "discussionComposerRoot", reply: "discussionComposerReply", edit: "discussionComposerEdit" })[state.draft.mode])
      .replace("{id}", state.draft.targetId ?? "");
    if (uiMode === "user" && state.draft.mode === "root") mode.textContent = text("uiComposerRoot");
    mode.hidden = uiMode === "user" && state.draft.mode === "root";
    submit.textContent = text(uiMode === "user" ? posting && state.draft.mode !== "edit" ? "uiPostSending"
      : state.draft.mode === "edit" ? "uiSaveChanges" : "uiPostComment" : "discussionSubmit");
    submit.setAttribute("aria-busy", String(posting));
    discard.textContent = text(uiMode === "user" ? "uiDiscard" : "discussionDiscard");
    discard.hidden = uiMode === "user" && !state.draft.body.trim() && !state.draft.detached &&
      state.draft.mode === "root";
    const postingSource = selectedPostingSource(state);
    originDisclosure.textContent = state.draft.mode === "edit" ? text("discussionOriginEdit") : postingSource
      ? text(uiMode === "user" ? "uiOriginDisclosure" : "discussionOriginDisclosure").replace("{title}", postingSource.title)
      : text(uiMode === "user" ? "uiOriginNone" : "discussionOriginNone");
    originDisclosure.hidden = uiMode === "user";
    const entries = state.discussion?.roots.flatMap((entry) => [entry, ...entry.replies]) ?? [];
    counts.textContent = state.discussion ? text(uiMode === "user" ? "uiContributionCounts" : "discussionCounts")
      .replace("{human}", String(entries.filter((entry) => entry.state === "visible" && entry.actorType === "human").length))
      .replace("{agent}", String(entries.filter((entry) => entry.state === "visible" && entry.actorType === "agent").length)) : "";
    counts.hidden = uiMode === "user";
    // A discussion snapshot establishes the baseline for this Topic. Only a genuinely
    // new ID arriving later in that same Topic receives the entrance animation.
    if (observedTopicId !== state.topicId) {
      observedTopicId = state.topicId;
      observedContributionIds = new Set();
      observedDiscussion = false;
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
    // Input updates leave contribution buttons in place so keyboard focus survives.
    const signature = JSON.stringify(state.discussion);
    if (signature !== renderedDiscussion || renderedActor !== state.actorId || renderedBusy !== state.busy || renderedFreshRead !== state.needsFreshRead || renderedUiMode !== uiMode) {
      clearThreadHandlers(); const cards = [];
      for (const rootEntry of state.discussion?.roots ?? []) {
        const group = node("section"); group.append(contribution(rootEntry, rootEntry, state, arrivals.has(rootEntry.id)));
        for (const reply of rootEntry.replies) group.append(contribution(reply, rootEntry, state, arrivals.has(reply.id))); cards.push(group);
      }
      if (state.discussion && !cards.length) cards.push(node("p", uiMode === "user" ? "uiDiscussionEmpty" : "discussionEmpty"));
      thread.replaceChildren(...cards); renderedDiscussion = signature; renderedActor = state.actorId; renderedBusy = state.busy;
      renderedFreshRead = state.needsFreshRead; renderedUiMode = uiMode;
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
      const safeUrl = typeof source.url === "string" && inspectPageUrl(source.url).supported &&
        inspectPageUrl(source.url).url === source.url;
      const address = node(safeUrl ? "a" : "p"); address.textContent = source.url;
      if (safeUrl) {
        address.href = source.url; address.target = "_blank"; address.rel = "noopener noreferrer";
        address.referrerPolicy = "no-referrer";
      }
      const association = node("p", source.relationship === "same-topic" ? "discussionSameTopic" : "discussionRelatedReading");
      item.append(sourceTitle, address, association); return item;
    });
    if (state.related && !suggestions.length && uiMode === "developer") suggestions.push(node("li", "discussionRelatedEmpty"));
    related.replaceChildren(...suggestions);
    relatedDetails.hidden = !state.related || uiMode === "user" && !suggestions.length;
    if (uiMode === "developer") relatedDetails.open = true;
    reset.disabled = !state.catalog || !usable || confirmation.value !== "RESET DEMO STATE";
  }
  function renderInsightState(state) {
    if (disposed) return;
    lastInsightState = state;
    const selectedTopicReady = lastState?.phase === "ready" && !lastState.busy && !lastState.needsFreshRead &&
      !lastState.error && lastState.catalog?.topics.some((entry) => entry.id === lastState.topicId);
    const aiStatus = state?.ai?.status;
    const active = ["preparingArticle", "generating", "resuming"].includes(aiStatus);
    const hasResult = Boolean(state?.ai?.result);
    const noCurrentSource = Boolean(state) && !state.context?.currentSource;
    insightShortcut.hidden = uiMode === "user" && (!selectedTopicReady || noCurrentSource || hasResult);
    insightShortcut.disabled = !selectedTopicReady || uiMode === "user" && noCurrentSource || active || Boolean(state?.busy) || hasResult;
    insightShortcut.setAttribute("aria-busy", String(active));
    insightShortcut.setAttribute("data-phase", active ? "working" : "idle");
    insightShortcut.setAttribute("aria-label", text(active ? aiStatus === "resuming" ? "uiInsightResuming" : "uiInsightGenerating" : "uiGenerateInsightLabel"));
    insightShortcut.textContent = text("uiCreateInsights");
    insightActivity.textContent = active ? text(aiStatus === "resuming" ? "uiInsightResuming" : "uiInsightGenerating")
      : hasResult ? text("uiInsightReady") : "";
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
    if (disposed) return; disposed = true; token.value = ""; body.value = ""; clearThreadHandlers();
    for (const [item, event, callback] of handlers) item.removeEventListener(event, callback);
    root.replaceChildren();
  }
  return Object.freeze({ bind, bindInsight, render, renderInsightState, setMode, dispose });
}
