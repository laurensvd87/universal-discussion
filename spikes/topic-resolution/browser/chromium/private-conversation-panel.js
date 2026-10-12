import { appendInsightCitationNodes } from "../core/insight-citations.js";
import { inspectPageUrl } from "../core/page-content-policy.js";
import { EN } from "../locales/en.js";

// Private data is RAM-only in this surface. Durable storage belongs exclusively
// to the account-scoped backend, never the public controller/catalog.
export function mountPrivateConversationPanel(document, root, { client, readActor,
  requestSignIn, prepareGeneration, attestStart, readPublicState, showView, randomId,
  messages = EN, schedule = setTimeout, unschedule = clearTimeout }) {
  const text = key => messages[key] ?? EN[key];
  root.setAttribute("aria-label", text("privateChats"));
  const node = (tag, key, className) => {
    const value = document.createElement(tag);
    if (key) value.textContent = text(key);
    if (className) value.className = className;
    return value;
  };
  const button = (key, action, className) => {
    const item = node("button", key, className); item.type = "button";
    item.addEventListener("click", action); return item;
  };
  const privateLock = () => {
    const icon = node("span", null, "private-conversation-lock");
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", text("privateConversation"));
    icon.title = text("privateConversation");
    return icon;
  };
  const header = node("div", null, "community-heading");
  const heading = node("h2", "privateChats");
  const headerLock = privateLock();
  const back = button("privateBack", () => {
    epoch += 1; stopTimer(); busy = false; conversation = null; entries = []; cursor = replyToId = null;
    draft.value = ""; pendingOperation = null; error = ""; olderReads.clear(); render(); void loadInbox();
  });
  header.append(back, headerLock, heading);
  const list = node("div", null, "community-feed"); list.id = "private-chat-feed";
  const status = node("p", null, "community-status"); status.setAttribute("role", "status");
  const composer = node("form", null, "private-composer");
  const target = node("span", null, "private-reply-target");
  const draft = node("textarea"); draft.id = "private-message-body"; draft.rows = 2; draft.maxLength = 2000;
  draft.placeholder = text("privatePlaceholder"); draft.setAttribute("aria-label", text("privatePlaceholder"));
  const send = node("button", "privateSend", "private-send"); send.type = "submit";
  const spark = button("privateGenerate", () => void generateSelected(), "private-spark");
  spark.setAttribute("aria-label", text("privateGenerate")); spark.title = text("privateGenerate"); spark.textContent = "";
  const actions = node("div", null, "private-composer-actions"); actions.append(spark, send);
  composer.append(target, draft, actions);
  root.append(header, list, status, composer);
  let disposed = false, active = false, actorId = null, epoch = 0, busy = false, timer = null;
  let inbox = [], inboxCursor = null, conversation = null, entries = [], cursor = null, replyToId = null;
  let rendered = null, error = "", pendingOperation = null, pendingStart = null;
  let latestRead = 0;
  const olderReads = new Set();
  const ownActor = () => readActor();
  const valid = (ticket, actor) => !disposed && ticket === epoch && actor === ownActor() && actor === actorId;
  function operation() { return randomId(); }
  function failMessage(errorValue) {
    return errorValue?.code === "authentication-required" ? text("privateSignIn")
      : errorValue?.code === "conflict" ? text("privateChanged") : text("privateUnavailable");
  }
  function generationFailureMessage(code) {
    switch (code) {
      case "invalid-input": return text("privateGenerationInvalidInput");
      case "model-unavailable": return text("privateGenerationModelUnavailable");
      case "rate-limit": return text("privateGenerationRateLimit");
      case "context-unavailable": return text("privateGenerationContextUnavailable");
      case "stale-context": return text("privateGenerationStaleContext");
      default: return text("privateGenerationFailed");
    }
  }
  async function request(action, value, actor = actorId, beforeDispatch) {
    return client.privateConversation(action, value, actor, { beforeDispatch });
  }
  function stopTimer() { if (timer !== null) unschedule(timer); timer = null; }
  function reset() {
    epoch += 1; stopTimer(); conversation = null; entries = []; inbox = []; inboxCursor = cursor = replyToId = null;
    draft.value = ""; pendingOperation = pendingStart = null; busy = false; error = ""; rendered = null;
    olderReads.clear(); latestRead += 1;
    list.replaceChildren(); render();
  }
  function syncAccount() {
    const current = ownActor();
    if (current === actorId) return false;
    actorId = current; reset(); return true;
  }
  function render() {
    const title = conversation ? conversation.title : text("privateChats");
    heading.textContent = title; heading.title = title;
    headerLock.hidden = !conversation;
    back.hidden = !conversation;
    composer.hidden = !conversation || !actorId;
    draft.readOnly = busy;
    const selected = entries.find(item => item.id === replyToId);
    const missingTarget = Boolean(draft.value.trim() && replyToId && !selected);
    send.disabled = busy || !draft.value.trim() || !selected;
    target.textContent = missingTarget ? text("privateChanged")
      : selected ? text(selected.actorType === "agent" ? "privateReplyAssistant" : "privateReplyMessage") : "";
    target.hidden = !selected && !missingTarget;
    spark.disabled = busy || !selected || selected.actorType !== "human" || selected.generation?.state !== "none" ||
      readPublicState()?.sourceId !== conversation?.sourceId;
    root.setAttribute("aria-busy", String(busy));
    const running = entries.some(item => item.generation?.state === "running");
    status.dataset.loading = String(busy || running);
    status.textContent = error || (!actorId ? text("privateSignIn") : "");
    status.setAttribute("aria-label", running ? text("privateThinking") : busy ? text("communityLoading") : status.textContent);
    const signature = JSON.stringify([actorId, conversation?.id, entries, inbox, cursor, inboxCursor, busy]);
    if (signature === rendered) return;
    rendered = signature;
    list.replaceChildren();
    if (!actorId) {
      const signIn = button("privateSignInButton", () => { void requestSignIn(); }); list.append(signIn); return;
    }
    if (!conversation) {
      if (!inbox.length) list.append(node("p", "privateEmpty", "community-empty"));
      for (const chat of inbox) {
        const card = button(null, () => void open(chat.id), "private-chat-card");
        const titleRow = node("span", null, "private-chat-title");
        const name = node("strong"); name.textContent = chat.title;
        const origin = node("span");
        const inspected = inspectPageUrl(chat.sourceUrl);
        origin.textContent = inspected.supported ? new URL(inspected.url).hostname : "";
        titleRow.append(privateLock(), name);
        card.append(titleRow, origin); list.append(card);
      }
      if (inboxCursor) list.append(button("communityMore", () => void loadInbox(true)));
      return;
    }
    for (const message of entries) {
      const bubble = node("article", null, `private-bubble private-bubble-${message.actorType}`);
      bubble.setAttribute("data-message-id", message.id);
      const meta = node("div", null, "private-message-meta");
      const identity = node("span", null, `private-identity private-identity-${message.actorType}`);
      identity.setAttribute("aria-label", text(message.actorType === "agent" ? "privateAssistant" : "privateYou"));
      identity.title = text(message.actorType === "agent" ? "privateAssistant" : "privateYou");
      const time = node("time"); time.dateTime = message.createdAt;
      const date = new Date(message.createdAt); time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.append(identity, time);
      const prose = node("div", null, "private-message-body");
      if (message.actorType === "agent") appendInsightCitationNodes(document, prose, message.body);
      else prose.textContent = message.body;
      const reply = button("privateReply", () => {
        if (busy) return;
        replyToId = message.id; render(); draft.focus({ preventScroll: true });
      }, "private-message-reply");
      reply.disabled = busy;
      const tools = node("div", null, "private-message-tools"); tools.append(reply);
      if (message.actorType === "human" && message.generation?.state === "none") {
        const generate = button("privateGenerate", () => { if (busy) return; replyToId = message.id; void generateSelected(); }, "private-spark");
        generate.textContent = ""; generate.title = text("privateGenerate"); generate.setAttribute("aria-label", text("privateGenerate"));
        generate.disabled = busy || readPublicState()?.sourceId !== conversation.sourceId;
        tools.append(generate);
      }
      const checked = inspectPageUrl(conversation.sourceUrl);
      if (checked.supported) {
        const source = node("a"); source.href = checked.url; source.target = "_blank"; source.rel = "noopener noreferrer";
        source.textContent = "↗"; source.setAttribute("aria-label", text("communityOpenPage")); tools.append(source);
      }
      bubble.append(meta, prose, tools);
      if (message.actorType === "human" && message.generation?.state === "failed") {
        const failure = node("small", null, "community-status");
        failure.textContent = generationFailureMessage(message.generation.error); bubble.append(failure);
      }
      list.append(bubble);
    }
    if (cursor) list.append(button("communityMore", () => void readConversation(true)));
    const remove = button("privateDelete", () => void removeConversation(), "private-delete");
    list.append(remove);
  }
  async function loadInbox(more = false) {
    syncAccount(); if (!active || !actorId || busy) return;
    const ticket = epoch, actor = actorId; busy = true; error = ""; render();
    try {
      const page = await request("list", { after: more ? inboxCursor : null, limit: 25 });
      if (!valid(ticket, actor)) return;
      inbox = more ? [...inbox, ...page.conversations] : page.conversations; inboxCursor = page.next;
    } catch (failure) { if (valid(ticket, actor)) error = failMessage(failure); }
    finally { if (valid(ticket, actor)) { busy = false; render(); } }
  }
  async function open(id) {
    if (busy) return; epoch += 1; stopTimer(); entries = []; cursor = null; replyToId = null; draft.value = "";
    conversation = { id, title: text("privateChats") }; rendered = null; showView("private"); await readConversation();
  }
  async function readConversation(more = false, revealId = null) {
    syncAccount(); if (!actorId || !conversation?.id) return;
    const ticket = epoch, actor = actorId, id = conversation.id;
    const after = more ? cursor : null;
    if (more && (!after || olderReads.has(after))) return;
    if (more) olderReads.add(after);
    const sequence = more ? null : ++latestRead;
    try {
      const page = await request("read", { conversationId: id, after, limit: 25 });
      if (!valid(ticket, actor) || id !== conversation?.id || !more && sequence !== latestRead ||
          page.conversation.revision < (conversation.revision ?? 0)) return;
      conversation = page.conversation;
      const overlapping = page.messages.some(item => entries.some(loaded => loaded.id === item.id));
      // After a large jump, retain reachable contiguous pages, not an invisible gap.
      if (!more && entries.length && !overlapping && page.next) { entries = []; cursor = null; }
      const merged = new Map();
      for (const item of more ? [...page.messages, ...entries] : [...entries, ...page.messages]) merged.set(item.id, item);
      const hadEntries = entries.length > 0;
      const previousLatestId = entries.at(-1)?.id;
      entries = [...merged.values()];
      if (more || !hadEntries) cursor = page.next;
      // Replies default to the latest AI message, ensuring a normal back-and-forth.
      if (revealId || !draft.value.trim()) replyToId = entries.at(-1)?.id ?? null;
      render();
      const latest = entries.at(-1);
      const reveal = !more && (!hadEntries || latest?.actorType === "agent" && latest.id !== previousLatestId && !draft.value.trim())
        ? latest?.id : revealId;
      if (reveal) [...list.children].find(item => item.getAttribute?.("data-message-id") === reveal)
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      stopTimer();
      if (active && entries.some(item => item.generation?.state === "running")) timer = schedule(() => { timer = null; void readConversation(); }, 1000);
    } catch (failure) { if (valid(ticket, actor) && (more || sequence === latestRead)) { error = failMessage(failure); render(); } }
    finally { if (more && valid(ticket, actor)) olderReads.delete(after); }
  }
  async function start(body, withInsight = false) {
    syncAccount();
    if (!actorId) { await requestSignIn(); return false; }
    if (busy) return false;
    const snapshot = readPublicState();
    const source = snapshot?.catalog?.sources?.find(item => item.id === snapshot.sourceId && item.topicId === snapshot.topicId);
    if (snapshot?.phase !== "ready" || snapshot.needsFreshRead || !source) return false;
    const ticket = ++epoch, actor = actorId;
    busy = true; error = ""; render();
    let accepted = false;
    try {
      if (!attestStart || !await attestStart(snapshot)) throw Object.assign(new Error("Private context changed"), { code: "conflict" });
      const generation = withInsight ? await prepareGeneration(source.id) : null;
      if (!valid(ticket, actor) || readPublicState()?.sourceId !== source.id) return false;
      const initialBody = body.trim() || text("privateStarter");
      const initialKey = JSON.stringify([actor, source.id, source.url, initialBody]);
      if (pendingStart?.key !== initialKey) pendingStart = { key: initialKey, id: operation() };
      const outcome = await request("create", { operationId: pendingStart.id, body: initialBody, sourceId: source.id, sourceUrl: source.url }, actor,
        () => attestStart(snapshot));
      if (!valid(ticket, actor)) return false;
      pendingStart = null;
      conversation = { id: outcome.conversationId, revision: outcome.revision, sourceId: source.id, sourceUrl: source.url, title: body.trim().slice(0, 80) || text("privateStarter") };
      entries = []; cursor = replyToId = null; draft.value = ""; rendered = null; accepted = true;
      showView("private");
      if (generation) await request("generate", { conversationId: conversation.id, messageId: outcome.messageId, expectedRevision: outcome.revision, generation });
      if (valid(ticket, actor)) await readConversation(false, outcome.messageId);
      return true;
    } catch (failure) { if (valid(ticket, actor)) { error = failMessage(failure); showView("private"); } return accepted; }
    finally { if (valid(ticket, actor)) { busy = false; render(); } }
  }
  async function submit(event) {
    event.preventDefault(); syncAccount();
    if (busy || !actorId || !conversation || !draft.value.trim() || !entries.some(item => item.id === replyToId)) return;
    const body = draft.value, ticket = epoch, actor = actorId, id = conversation.id;
    const clickedTarget = replyToId, clickedRevision = conversation.revision;
    const parent = entries.find(item => item.id === clickedTarget);
    busy = true; error = ""; render();
    try {
      let generation = null;
      if (parent?.actorType === "agent") {
        try { generation = await prepareGeneration(conversation.sourceId); }
        catch { /* The human message still saves; no later automatic dispatch. */ }
      }
      if (!valid(ticket, actor) || conversation?.id !== id) return;
      const operationKey = JSON.stringify([id, clickedTarget, body]);
      if (pendingOperation?.key !== operationKey) pendingOperation = { key: operationKey, request: {
        operationId: operation(), conversationId: id, replyToId: clickedTarget,
        body, expectedRevision: clickedRevision, ...(generation ? { generation } : {}) } };
      const outcome = await request("send", pendingOperation.request);
      if (!valid(ticket, actor)) return;
      pendingOperation = null; conversation.revision = outcome.revision;
      if (draft.value === body) draft.value = "";
      await readConversation(false, outcome.messageId); draft.focus({ preventScroll: true });
    } catch (failure) { if (valid(ticket, actor)) {
      error = failMessage(failure);
      if (failure?.code === "conflict") { pendingOperation = null; await readConversation(); }
    } }
    finally { if (valid(ticket, actor)) { busy = false; render(); } }
  }
  async function generateSelected() {
    if (busy || !conversation || !actorId) return;
    const selected = entries.find(item => item.id === replyToId);
    if (!selected || selected.actorType !== "human" || selected.generation?.state !== "none") return;
    const ticket = epoch, actor = actorId, id = conversation.id, clickedRevision = conversation.revision; busy = true; error = ""; render();
    try {
      const generation = await prepareGeneration(conversation.sourceId);
      if (!valid(ticket, actor) || conversation?.id !== id) return;
      await request("generate", { conversationId: id, messageId: selected.id, expectedRevision: clickedRevision, generation });
      if (valid(ticket, actor)) await readConversation(false, selected.id);
    } catch (failure) { if (valid(ticket, actor)) error = failMessage(failure); }
    finally { if (valid(ticket, actor)) { busy = false; render(); } }
  }
  async function removeConversation() {
    if (busy || !conversation || !actorId) return;
    const id = conversation.id, ticket = epoch, actor = actorId; busy = true; render();
    try {
      await request("delete", { conversationId: id });
      if (!valid(ticket, actor)) return;
      reset(); await loadInbox();
    } catch (failure) { if (valid(ticket, actor)) error = failMessage(failure); }
    finally { if (valid(ticket, actor)) { busy = false; render(); } }
  }
  draft.addEventListener("input", render); composer.addEventListener("submit", submit);
  render();
  return Object.freeze({ start,
    setActive(value) {
      active = value; syncAccount(); stopTimer();
      if (active && !busy) { if (conversation) void readConversation(); else void loadInbox(); }
    },
    accountChanged() { if (syncAccount() && active) void loadInbox(); },
    observe() { syncAccount(); if (conversation) render(); },
    dispose() { disposed = true; epoch += 1; stopTimer(); draft.value = ""; pendingOperation = pendingStart = null;
      olderReads.clear(); entries = inbox = []; conversation = null; root.replaceChildren(); },
  });
}
