import { EN } from "../locales/en.js";

export function mountDiscussionPanel(document, root, { messages = EN } = {}) {
  const text = (key) => messages?.[key] ?? EN[key];
  const handlers = [];
  let controller;
  let lastState;
  let disposed = false;
  function node(tag, key) {
    const item = document.createElement(tag);
    if (key) item.textContent = text(key);
    return item;
  }
  function label(control, key, id) {
    control.id = id;
    const item = node("label", key); item.htmlFor = id;
    root.append(item, control);
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
  root.setAttribute("aria-labelledby", heading.id);
  root.append(heading, node("p", "discussionScope"));
  const status = node("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); root.append(status);
  const token = node("input"); token.type = "password"; token.autocomplete = "off";
  token.spellcheck = false; token.maxLength = 512;
  label(token, "discussionToken", "discussion-token");
  const pairForm = node("form"); const pair = node("button", "discussionPair"); pair.type = "submit";
  pair.id = "discussion-pair";
  // The input is intentionally outside the form: no native form serialization.
  pairForm.append(pair); root.append(pairForm);
  listen(pairForm, "submit", (event) => {
    event.preventDefault(); const value = token.value; token.value = "";
    void controller?.pair(value);
  });
  const disconnect = button("discussionDisconnect", () => { token.value = ""; void controller?.disconnect(); });
  const reload = button("discussionReload", () => void controller?.open());
  const topic = node("select"); label(topic, "discussionTopic", "discussion-topic");
  listen(topic, "change", () => void controller?.selectTopic(topic.value));
  const source = node("select"); label(source, "discussionSource", "discussion-source");
  listen(source, "change", () => void controller?.selectSource(source.value));
  const actor = node("select"); label(actor, "discussionActor", "discussion-actor");
  listen(actor, "change", () => void controller?.selectActor(actor.value));
  const createForm = node("form"); root.append(createForm);
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
  const counts = node("p"); const thread = node("div"); thread.className = "discussion-thread";
  root.append(counts, thread);
  const composer = node("form"); const mode = node("p"); root.append(composer);
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
  button("discussionDiscard", () => { controller?.discardDraft(); body.focus(); }, composer);
  const relatedHeading = node("h3", "discussionRelated"); const model = node("p");
  const related = node("ul"); root.append(relatedHeading, model, related);
  const resetForm = node("form"); root.append(resetForm);
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
  function choices(select, entries, selected, placeholder) {
    const items = [];
    if (placeholder) { const option = node("option", placeholder); option.value = ""; items.push(option); }
    for (const entry of entries) { const option = node("option"); option.value = entry.id;
      option.textContent = entry.title ?? entry.displayName; items.push(option); }
    select.replaceChildren(...items); select.value = selected ?? "";
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
    const content = node("p"); content.className = "discussion-body"; content.textContent = entry.body;
    card.append(author, content);
    if (entry.edited) card.append(node("span", "discussionEdited"));
    function action(key, callback) {
      const item = node("button", key); item.type = "button"; item.disabled = state.busy || state.needsFreshRead || state.phase !== "ready";
      item.setAttribute("data-action", key.replace(/^discussion/u, "").toLowerCase());
      item.setAttribute("data-contribution-id", entry.id);
      item.addEventListener("click", callback); threadHandlers.push([item, callback]); card.append(item);
    }
    if (rootEntry.state === "visible") action("discussionReply", () => { if (controller?.begin("reply", entry.id)) body.focus(); });
    if (entry.authorId === state.actorId) {
      action("discussionEdit", () => { if (controller?.begin("edit", entry.id)) body.focus(); });
      action("discussionWithdraw", () => void controller?.withdraw(entry.id));
    }
    return card;
  }
  let renderedDiscussion;
  let renderedActor;
  let renderedBusy;
  let renderedFreshRead;
  function render(state) {
    if (disposed) return;
    lastState = state;
    const errorKey = { unauthorized: "discussionUnauthorized", conflict: "discussionConflict", capacity: "discussionCapacity",
      "invalid-request": "discussionInvalid", "invalid-response": "discussionInvalid", "context-changed": "discussionContextChanged" }[state.error];
    status.textContent = text(errorKey ?? (state.error ? "discussionUnavailable" : {
      ready: "discussionReady", disconnected: "discussionDisconnected", connecting: "discussionConnecting",
      loading: "discussionLoading", "choose-topic": "discussionChooseStatus" }[state.phase] ?? "discussionUnavailable"));
    if (state.needsFreshRead) status.textContent += ` · ${text("discussionReload")}`;
    const usable = ["ready", "choose-topic"].includes(state.phase) && !state.busy && !state.needsFreshRead;
    pair.disabled = state.busy || state.phase === "connecting";
    token.disabled = pair.disabled; disconnect.disabled = state.busy;
    reload.disabled = state.busy || state.phase === "connecting";
    topic.disabled = !state.catalog || state.busy; actor.disabled = topic.disabled;
    source.disabled = topic.disabled;
    choices(topic, state.catalog?.topics ?? [], state.topicId, "discussionChoose");
    choices(source, state.catalog?.sources ?? [], state.sourceId, "discussionChooseSource");
    choices(actor, state.catalog?.actors ?? [], state.actorId);
    title.disabled = kind.disabled = create.disabled = !state.catalog || !usable;
    const ready = state.phase === "ready" && !state.busy && !state.needsFreshRead;
    if (body.value !== state.draft.body) body.value = state.draft.body;
    body.disabled = !ready;
    detached.hidden = !state.draft.detached;
    reattach.hidden = !state.draft.detached; reattach.disabled = !ready;
    submit.disabled = !ready || state.draft.detached || !state.draft.body.trim();
    mode.textContent = text({ root: "discussionComposerRoot", reply: "discussionComposerReply", edit: "discussionComposerEdit" }[state.draft.mode])
      .replace("{id}", state.draft.targetId ?? "");
    const entries = state.discussion?.roots.flatMap((entry) => [entry, ...entry.replies]) ?? [];
    counts.textContent = state.discussion ? text("discussionCounts")
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
    model.textContent = !state.catalog ? "" : text(state.catalog.model.status === "model-unavailable" ? "discussionModelUnavailable" : "discussionModelFixture");
    const suggestions = (state.related?.results ?? []).map((source) => {
      const item = node("li"); const sourceTitle = node("p"); sourceTitle.textContent = source.title;
      const address = node("p"); address.textContent = source.url;
      const association = node("p", source.relationship === "same-topic" ? "discussionSameTopic" : "discussionRelatedReading");
      item.append(sourceTitle, address, association); return item;
    });
    if (state.related && !suggestions.length) suggestions.push(node("li", "discussionRelatedEmpty"));
    related.replaceChildren(...suggestions);
    reset.disabled = !state.catalog || !usable || confirmation.value !== "RESET DEMO STATE";
  }
  function bind(value) { controller = value; render(controller.currentState()); }
  function dispose() {
    if (disposed) return; disposed = true; token.value = ""; body.value = ""; clearThreadHandlers();
    for (const [item, event, callback] of handlers) item.removeEventListener(event, callback);
    root.replaceChildren();
  }
  return Object.freeze({ bind, render, dispose });
}
