import { appendInsightCitationNodes } from "../core/insight-citations.js";
import { inspectPageUrl } from "../core/page-content-policy.js";
import { EN } from "../locales/en.js";
import { normalizeInsightVoice } from "../core/insight-voices.js";
import { mountAssistantVoicePicker } from "./assistant-voice-picker.js";

// Match each backend stream's SQLite TEXT DESC, id DESC ordering exactly.
// Parsing dates or locale collation would reorder valid legacy timestamps/IDs
// across a cursor boundary and could skip newer buffered entries.
function compareChats(a, b) {
  const descending = (left, right) => left === right ? 0 : left < right ? 1 : -1;
  return descending(a.updatedAt ?? a.createdAt ?? "", b.updatedAt ?? b.createdAt ?? "") ||
    descending(a.id, b.id) || (a.kind === b.kind ? 0 : a.kind === "private" ? -1 : 1);
}

// Private data is RAM-only in this surface. Durable storage belongs exclusively
// to the account-scoped backend, never the public controller/catalog.
export function mountPrivateConversationPanel(document, root, { client, readActor,
  requestSignIn, prepareGeneration, attestStart, readPublicState, showView, randomId,
  readInsightState, setInsightPreferences,
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
  const searchForm = node("form", null, "my-chats-search-form"); searchForm.id = "my-chats-search-form";
  const search = node("input"); search.id = "my-chats-search"; search.type = "search"; search.maxLength = 256;
  search.placeholder = text("myChatsSearch"); search.setAttribute("aria-label", text("myChatsSearch"));
  const searchButton = node("button", "myChatsSearchButton"); searchButton.type = "submit";
  searchForm.append(search, searchButton);
  const list = node("div", null, "community-feed"); list.id = "private-chat-feed";
  const status = node("p", null, "community-status"); status.setAttribute("role", "status");
  const composer = node("form", null, "private-composer");
  const target = node("span", null, "private-reply-target");
  const draft = node("textarea"); draft.id = "private-message-body"; draft.rows = 2; draft.maxLength = 2000;
  draft.placeholder = text("privatePlaceholder"); draft.setAttribute("aria-label", text("privatePlaceholder"));
  const send = node("button", "privateSend", "private-send"); send.type = "submit";
  const spark = button("privateGenerate", () => void generateSelected(), "private-spark");
  spark.id = "private-generate";
  spark.setAttribute("aria-label", text("privateGenerate")); spark.title = text("privateGenerate"); spark.textContent = "";
  const voice = mountAssistantVoicePicker(document, {button:spark,messages,onVoiceSelect(value) {
    if (busy || composer.hidden || !available || !setInsightPreferences) return false;
    const preferences = { ...readInsightState?.()?.preferences };
    const selected = normalizeInsightVoice(value);
    if (selected === "standard") delete preferences.voice; else preferences.voice = selected;
    setInsightPreferences(preferences);
  }});
  const actions = node("div", null, "private-composer-actions"); actions.append(voice.element, send);
  composer.append(target, draft, actions);
  const pagination = node("nav", null, "community-pagination");
  const previous = button("paginationPrevious", () => void changePage(-1)); previous.id = "my-chats-previous";
  const pageLabel = node("span"); pageLabel.setAttribute("aria-live", "polite");
  const next = button("paginationNext", () => void changePage(1)); next.id = "my-chats-next";
  pagination.append(previous, pageLabel, next);
  root.append(header, searchForm, list, pagination, status, composer);
  let disposed = false, active = false, available = true, actorId = null, epoch = 0, busy = false, timer = null;
  let detachedDraft = null;
  let inbox = [], inboxCursor = null, publicInbox = [], publicInboxCursor = null;
  let privateInboxFailed = false, publicInboxFailed = false;
  let conversation = null, entries = [], cursor = null, replyToId = null;
  let selection = "private";
  let rendered = null, error = "", pendingOperation = null, pendingStart = null;
  let latestRead = 0;
  const messagePickers = [];
  let inboxPage = 0, inboxBoundaries = [], inboxBoundary = null, inboxEnd = null;
  let privateVersion = null, publicVersion = null;
  let messagePage = 0, messageBoundaries = [null], messageScroll = [];
  let searchTimer = null, composingSearch = false, searchQuery = "";
  const olderReads = new Set();
  const ownActor = () => readActor();
  const hasPublicChats = () => typeof client.accountPublicChats === "function";
  const valid = (ticket, actor) => !disposed && available && ticket === epoch && actor === ownActor() && actor === actorId;
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
  function stopSearchTimer() { if (searchTimer !== null) unschedule(searchTimer); searchTimer = null; }
  const sameVersion = (a, b) => a?.generation === b?.generation && a?.revision === b?.revision;
  const cloneBoundary = (value, metadata = false) => value && ({
    private: { ...value.private, buffer: metadata ? [] : [...value.private.buffer], replay: metadata ? value.private.buffer.length > 0 || value.private.replay : value.private.replay },
    public: { ...value.public, buffer: metadata ? [] : [...value.public.buffer], replay: metadata ? value.public.buffer.length > 0 || value.public.replay : value.public.replay }, scroll: value.scroll ?? 0 });
  function clearPages() {
    inboxPage = 0; inboxBoundaries = []; inboxBoundary = inboxEnd = null;
    privateVersion = publicVersion = null; messagePage = 0; messageBoundaries = [null]; messageScroll = [];
  }
  async function changePage(direction) {
    if (busy || !available || !actorId) return;
    if (!conversation) return loadInbox(direction > 0 ? true : "previous");
    const older = selection === "private" ? direction < 0 : direction > 0;
    const index = messagePage + (older ? 1 : -1);
    if (index < 0 || older && !cursor) return;
    messageScroll[messagePage] = list.scrollTop ?? 0;
    if (older) messageBoundaries[index] = cursor;
    busy = true; render();
    try { await (selection === "public" ? readPublicConversation(index) : readConversation(index)); }
    finally { busy = false; render(); }
  }
  function clearInboxForSearch() {
    epoch += 1; busy = false; inbox = []; publicInbox = []; inboxCursor = publicInboxCursor = null;
    privateInboxFailed = publicInboxFailed = false; error = ""; rendered = null; clearPages();
    render();
  }
  function dispatchSearch() {
    if (disposed) return;
    stopSearchTimer(); syncAccount();
    if (disposed || composingSearch || !active || !available || !actorId || conversation) return;
    searchQuery = search.value.trim().slice(0, 256); clearInboxForSearch(); void loadInbox();
  }
  function searchChanged() {
    if (disposed) return;
    stopSearchTimer(); syncAccount();
    if (disposed || !active || !available || !actorId || conversation) return;
    searchQuery = search.value.trim().slice(0, 256); clearInboxForSearch();
    if (!composingSearch) searchTimer = schedule(() => { searchTimer = null; dispatchSearch(); }, 200);
  }
  function reset() {
    epoch += 1; stopTimer(); stopSearchTimer(); searchQuery = ""; search.value = ""; composingSearch = false;
    conversation = null; entries = []; inbox = []; publicInbox = [];
    inboxCursor = publicInboxCursor = cursor = replyToId = null; selection = "private";
    privateInboxFailed = publicInboxFailed = false;
    draft.value = ""; pendingOperation = pendingStart = null; busy = false; error = ""; rendered = null;
    detachedDraft = null;
    olderReads.clear(); latestRead += 1;
    clearPages();
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
    const publicPreview = selection === "public";
    headerLock.hidden = !conversation || publicPreview;
    back.hidden = !conversation;
    searchForm.hidden = !actorId || !available || Boolean(conversation);
    search.disabled = !available || !actorId;
    searchButton.disabled = search.disabled || composingSearch;
    composer.hidden = !actorId || publicPreview || !conversation && !detachedDraft;
    const insightState = readInsightState?.();
    const voiceHidden = composer.hidden || !conversation || !available;
    const voiceDisabled = busy || !available || !setInsightPreferences || Boolean(insightState?.busy) ||
      ["generating", "fetchingRelated", "preparingArticle", "resuming"].includes(insightState?.ai?.status) ||
      entries.some(item => item.generation?.state === "running");
    voice.update({voice:insightState?.preferences?.voice ?? "standard",hidden:voiceHidden,
      disabled:voiceHidden || voiceDisabled});
    messagePickers.forEach(picker=>picker.update({voice:insightState?.preferences?.voice ?? "standard",
      disabled:voiceDisabled}));
    draft.readOnly = busy || !available || !conversation;
    const selected = entries.find(item => item.id === replyToId);
    const missingTarget = Boolean(draft.value.trim() && replyToId && !selected);
    send.disabled = !available || publicPreview || busy || !draft.value.trim() || !selected;
    target.textContent = missingTarget || detachedDraft && !conversation ? text("privateChanged")
      : selected ? text(selected.actorType === "agent" ? "privateReplyAssistant" : "privateReplyMessage") : "";
    target.hidden = !selected && !missingTarget && !detachedDraft;
    spark.disabled = !available || publicPreview || busy || !selected || selected.actorType !== "human" || selected.generation?.state !== "none" ||
      readPublicState()?.sourceId !== conversation?.sourceId;
    root.setAttribute("aria-busy", String(busy));
    pagination.hidden = !actorId || !available;
    pageLabel.textContent = (text("paginationPage") ?? "Page {page}").replace("{page}", String((conversation ? messagePage : inboxPage) + 1));
    previous.disabled = busy || (conversation ? selection === "private" ? !cursor : messagePage === 0 : inboxPage === 0);
    next.disabled = busy || (conversation ? selection === "private" ? messagePage === 0 : !cursor : !inboxEnd ||
      ![inboxEnd.private, inboxEnd.public].some(pool => pool.buffer.length || pool.next));
    const running = entries.some(item => item.generation?.state === "running");
    status.dataset.loading = String(busy || running);
    status.textContent = error || (!actorId ? text("privateSignIn") : !available ? text("privateUnavailable") : detachedDraft ? text("privateChanged") : "");
    status.setAttribute("aria-label", running ? text("privateThinking") : busy ? text("communityLoading") : status.textContent);
    const signature = JSON.stringify([actorId, selection, conversation, entries, inbox, publicInbox, cursor, inboxCursor, publicInboxCursor, inboxPage, messagePage, busy]);
    if (signature === rendered) return;
    rendered = signature;
    messagePickers.forEach(picker=>picker.dispose()); messagePickers.length = 0;
    list.replaceChildren();
    if (!actorId) {
      const signIn = button("privateSignInButton", () => { void requestSignIn(); }); list.append(signIn); return;
    }
    if (!conversation) {
      const combined = [...inbox.map(chat => ({ ...chat, kind: "private" })), ...publicInbox.map(chat => ({ ...chat, kind: "public" }))]
        .sort(compareChats);
      if (available && !busy && !combined.length && !privateInboxFailed && !publicInboxFailed) list.append(node("p", searchQuery ? "myChatsSearchEmpty" : hasPublicChats() ? "myChatsEmpty" : "privateEmpty", "community-empty"));
      for (const chat of combined) {
        const card = button(null, () => void open(chat.id, chat.kind), "private-chat-card");
        card.setAttribute("data-chat-kind", chat.kind); card.setAttribute("data-chat-id", chat.id);
        const titleRow = node("span", null, "private-chat-title");
        const name = node("strong"); name.textContent = chat.title;
        const origin = node("span");
        const inspected = inspectPageUrl(chat.sourceUrl);
        origin.textContent = inspected.supported ? new URL(inspected.url).hostname : "";
        if (chat.kind === "private") titleRow.append(privateLock());
        else if (chat.actorType === "agent") {
          const identity = node("span", null, "private-identity private-identity-agent");
          identity.setAttribute("aria-label", text("privateAssistant")); identity.title = text("privateAssistant");
          titleRow.append(identity);
        }
        titleRow.append(name);
        card.append(titleRow, origin); list.append(card);
      }
      return;
    }
    if (publicPreview) { renderPublicConversation(); return; }
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
        const picker = mountAssistantVoicePicker(document,{button:generate,messages,onVoiceSelect(value) {
          if (busy || !available || !setInsightPreferences || entries.some(item => item.generation?.state === "running")) return false;
          const preferences = {...readInsightState?.()?.preferences};
          if (value === "standard") delete preferences.voice; else preferences.voice = value;
          setInsightPreferences(preferences);
        }});
        picker.update({voice:readInsightState?.()?.preferences?.voice ?? "standard",disabled:voiceDisabled});
        messagePickers.push(picker); tools.append(picker.element);
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
    const remove = button("privateDelete", () => void removeConversation(), "private-delete");
    list.append(remove);
  }
  async function loadInbox(more = false) {
    syncAccount(); if (!available || !active || !actorId || busy) return;
    // Fresh entry/refresh binds new store versions; only page navigation reuses
    // the previous cursor/history contract.
    if (!more) {
      inboxPage = 0; inboxBoundaries = []; inboxBoundary = inboxEnd = null;
      privateVersion = publicVersion = null;
    }
    const ticket = epoch, actor = actorId; busy = true; error = ""; render();
    try {
      const targetPage = more === "previous" ? inboxPage - 1 : more ? inboxPage + 1 : 0;
      if (targetPage < 0) return;
      if (more && typeof client.version === "function") {
        const [canonical, owner] = await Promise.all([client.version(), request("list", {order:"recent",limit:1,after:null,
          ...(searchQuery ? {query:searchQuery} : {})}, actor)]);
        if (!valid(ticket, actor)) return;
        if (publicVersion && !sameVersion(publicVersion, canonical.version) || privateVersion !== null && privateVersion !== owner.ownerVersion)
          throw Object.assign(new Error("Changed"), {code:"conflict"});
      }
      if (inboxBoundary) { inboxBoundary.scroll = list.scrollTop ?? 0; inboxBoundaries[inboxPage] = cloneBoundary(inboxBoundary,true); }
      const emptyPool = enabled => ({buffer:[],next:null,started:!enabled,batchAfter:null,skip:0});
      let boundary = more === "previous" ? cloneBoundary(inboxBoundaries[targetPage]) : more ? cloneBoundary(inboxEnd) :
        {private:emptyPool(true),public:emptyPool(hasPublicChats()),scroll:0};
      if (!boundary) return;
      inboxBoundary = cloneBoundary(boundary);
      const refill = async (kind) => {
        const pool = boundary[kind];
        if (pool.buffer.length || !pool.replay && pool.started && !pool.next) return;
        try {
          const payload = {after:pool.replay ? pool.batchAfter : pool.next,limit:20,...(searchQuery ? {query:searchQuery} : {})};
          const page = kind === "private" ? await request("list", {...payload,order:"recent"},actor) : await client.accountPublicChats("list",payload,actor);
          if (!valid(ticket,actor)) return;
          if (kind === "private") {
            if (privateVersion !== null && page.ownerVersion !== undefined && privateVersion !== page.ownerVersion) throw Object.assign(new Error("Changed"),{code:"conflict"});
            privateVersion = page.ownerVersion ?? privateVersion; privateInboxFailed = false;
          } else {
            if (publicVersion && page.version && !sameVersion(publicVersion,page.version)) throw Object.assign(new Error("Changed"),{code:"conflict"});
            publicVersion = page.version ?? publicVersion; publicInboxFailed = false;
          }
          const skip = pool.replay ? pool.skip : 0;
          pool.batchAfter = payload.after; pool.skip = skip; pool.replay = false;
          pool.buffer = (page.conversations ?? page.chats).slice(skip); pool.next = page.next; pool.started = true;
        } catch (failure) {
          if (failure?.code === "conflict") throw failure;
          if (kind === "private") privateInboxFailed = true; else publicInboxFailed = true;
          pool.started = true; pool.next = null; pool.buffer = [];
        }
      };
      const merged = [];
      while (merged.length < 20) {
        await Promise.all([refill("private"),refill("public")]);
        if (!valid(ticket,actor)) return;
        const choices = ["private","public"].filter(kind => boundary[kind].buffer.length);
        if (!choices.length) break;
        choices.sort((a,b) => compareChats({...boundary[a].buffer[0],kind:a},{...boundary[b].buffer[0],kind:b}));
        const kind = choices[0]; merged.push({...boundary[kind].buffer.shift(),kind}); boundary[kind].skip++;
      }
      inbox = merged.filter(chat => chat.kind === "private"); publicInbox = merged.filter(chat => chat.kind === "public");
      inboxCursor = boundary.private.next; publicInboxCursor = boundary.public.next;
      inboxPage = targetPage; inboxEnd = boundary;
      error = privateInboxFailed && publicInboxFailed ? text("myChatsUnavailable")
        : publicInboxFailed ? text("myChatsPublicUnavailable")
          : privateInboxFailed ? text(hasPublicChats() ? "myChatsPrivateUnavailable" : "privateUnavailable") : "";
    } catch (failure) { if (valid(ticket, actor)) { inbox = []; publicInbox = []; clearPages(); error = failMessage(failure); } }
    finally { if (valid(ticket, actor)) { busy = false; render(); list.scrollTop = inboxBoundary?.scroll ?? 0; } }
  }
  function publicSourceLink(url, compact = false) {
    const checked = inspectPageUrl(url);
    if (!checked.supported) return null;
    const source = node("a", "myChatsOpenPage"); source.href = checked.url;
    source.target = "_blank"; source.rel = "noopener noreferrer"; source.referrerPolicy = "no-referrer";
    source.setAttribute("aria-label", text("myChatsOpenPage"));
    if (compact) { source.textContent = "↗"; source.title = text("myChatsOpenPage"); }
    source.addEventListener("click", () => showView("discussion"));
    return source;
  }
  function renderPublicConversation() {
    const label = node("p", "myChatsPublic", "community-empty"); list.append(label);
    const source = publicSourceLink(conversation.sourceUrl); if (source) list.append(source);
    for (const message of entries) {
      const bubble = node("article", null, `private-bubble private-bubble-${message.actorType}`);
      bubble.setAttribute("data-message-id", message.id);
      const meta = node("div", null, "private-message-meta");
      const identity = node("span", null, `private-identity private-identity-${message.actorType}`);
      identity.setAttribute("aria-label", text(message.actorType === "agent" ? "uiAgentBadge" : "uiHumanBadge"));
      const author = node("span"); author.textContent = message.authorLabel;
      const time = node("time"); time.dateTime = message.createdAt;
      const date = new Date(message.createdAt); time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.append(identity, author, time);
      const prose = node("div", null, "private-message-body");
      if (message.state === "deleted") prose.textContent = text("discoveryDeleted");
      else if (message.actorType === "agent") appendInsightCitationNodes(document, prose, message.body);
      else prose.textContent = message.body;
      bubble.append(meta, prose);
      const messageSource = publicSourceLink(message.sourceUrl, true); if (messageSource) bubble.append(messageSource);
      list.append(bubble);
    }
  }
  async function readPublicConversation(pageIndex = 0) {
    syncAccount(); if (!available || !actorId || selection !== "public" || !conversation?.id) return;
    const ticket = epoch, actor = actorId, id = conversation.id, after = messageBoundaries[pageIndex] ?? null;
    busy = true; error = ""; render();
    try {
      if (pageIndex !== 0 && typeof client.version === "function") {
        const current = await client.version();
        if (!valid(ticket,actor)) return;
        if (publicVersion && !sameVersion(publicVersion,current.version)) throw Object.assign(new Error("Changed"),{code:"conflict"});
      }
      const page = await client.accountPublicChats("read", { rootId: id, after, limit: 20 }, actor);
      if (!valid(ticket, actor) || selection !== "public" || conversation?.id !== id) return;
      conversation = page.conversation;
      entries = page.messages; cursor = page.next; messagePage = pageIndex;
      publicVersion = page.version ?? publicVersion;
    } catch { if (valid(ticket, actor)) {
      entries = []; cursor = null; messagePage = 0; messageBoundaries = [null]; conversation = { id, title: text("privateChats") };
      error = text("myChatsPublicUnavailable");
    } }
    finally { if (valid(ticket, actor)) { busy = false; render(); list.scrollTop = messageScroll[messagePage] ?? 0; } }
  }
  async function open(id, kind = "private") {
    if (!available || busy) return; epoch += 1; stopTimer(); stopSearchTimer(); entries = []; cursor = null; replyToId = null; draft.value = "";
    if (kind === "private" && detachedDraft?.actor === actorId && detachedDraft.id === id) {
      draft.value = detachedDraft.body; replyToId = detachedDraft.replyToId; detachedDraft = null;
    }
    selection = kind; error = ""; olderReads.clear(); pendingOperation = null;
    messagePage = 0; messageBoundaries = [null]; messageScroll = [];
    conversation = { id, title: text("privateChats") }; rendered = null; showView("private"); await readConversation();
  }
  async function readConversation(pageIndex = false, revealId = null) {
    if (selection === "public") return readPublicConversation(pageIndex === false ? messagePage : pageIndex);
    syncAccount(); if (!available || !actorId || !conversation?.id) return;
    const ticket = epoch, actor = actorId, id = conversation.id;
    const index = pageIndex === false ? (revealId ? 0 : messagePage) : pageIndex;
    const after = messageBoundaries[index] ?? null;
    const sequence = ++latestRead;
    try {
      const page = await request("read", { conversationId: id, after, limit: 20 });
      if (!valid(ticket, actor) || id !== conversation?.id || sequence !== latestRead ||
          page.conversation.revision < (conversation.revision ?? 0)) return;
      if (index !== 0 && conversation.revision !== undefined && page.conversation.revision !== conversation.revision)
        throw Object.assign(new Error("Changed"),{code:"conflict"});
      conversation = page.conversation;
      const hadEntries = entries.length > 0;
      const previousLatestId = entries.at(-1)?.id;
      entries = page.messages; cursor = page.next; messagePage = index;
      if (revealId) { messageBoundaries = [null]; messageScroll = []; }
      // Replies default to the latest AI message, ensuring a normal back-and-forth.
      if (revealId || !draft.value.trim()) replyToId = entries.at(-1)?.id ?? null;
      render();
      const latest = entries.at(-1);
      list.scrollTop = messageScroll[index] ?? 0;
      const reveal = index === 0 && (!hadEntries || latest?.actorType === "agent" && latest.id !== previousLatestId && !draft.value.trim())
        ? latest?.id : revealId;
      if (reveal) [...list.children].find(item => item.getAttribute?.("data-message-id") === reveal)
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      stopTimer();
      if (active && index === 0 && entries.some(item => item.generation?.state === "running")) timer = schedule(() => { timer = null; void readConversation(); }, 1000);
    } catch (failure) { if (valid(ticket, actor) && sequence === latestRead) {
      entries = []; cursor = null; messagePage = 0; messageBoundaries = [null];
      conversation = {id,title:text("privateChats")}; error = failMessage(failure); render();
    } }
  }
  async function start(body, withInsight = false) {
    syncAccount();
    if (!available) return false;
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
      selection = "private";
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
    if (!available || selection === "public" || busy || !actorId || !conversation || !draft.value.trim() || !entries.some(item => item.id === replyToId)) return;
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
    if (!available || selection === "public" || busy || !conversation || !actorId) return;
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
    if (!available || selection === "public" || busy || !conversation || !actorId) return;
    const id = conversation.id, ticket = epoch, actor = actorId; busy = true; render();
    try {
      await request("delete", { conversationId: id });
      if (!valid(ticket, actor)) return;
      reset(); await loadInbox();
    } catch (failure) { if (valid(ticket, actor)) error = failMessage(failure); }
    finally { if (valid(ticket, actor)) { busy = false; render(); } }
  }
  search.addEventListener("input", searchChanged);
  search.addEventListener("compositionstart", () => { composingSearch = true; stopSearchTimer(); searchChanged(); });
  search.addEventListener("compositionend", () => { composingSearch = false; searchChanged(); });
  searchForm.addEventListener("submit", event => { event.preventDefault(); dispatchSearch(); });
  draft.addEventListener("input", render); composer.addEventListener("submit", submit);
  render();
  return Object.freeze({ start,
    setAvailable(value) {
      const next = Boolean(value); if (next === available) return;
      syncAccount(); available = next;
      if (!next) {
        const retained = selection === "private" && conversation && draft.value.trim()
          ? { actor: actorId, id: conversation.id, replyToId, body: draft.value } : detachedDraft;
        reset(); detachedDraft = retained;
        if (retained) { draft.value = retained.body; replyToId = retained.replyToId; }
        render();
      } else if (active) { void loadInbox(); }
      else render();
    },
    setActive(value) {
      stopSearchTimer();
      if (!value) composingSearch = false;
      if (!value && !conversation) { epoch += 1; busy = false; }
      active = value; syncAccount(); stopTimer();
      if (active && !busy) { if (conversation) void readConversation(); else void loadInbox(); }
    },
    accountChanged() { if (syncAccount() && active) void loadInbox(); },
    observe() { syncAccount(); if (conversation) render(); },
    dispose() { disposed = true; epoch += 1; stopTimer(); stopSearchTimer(); voice.dispose(); messagePickers.forEach(picker=>picker.dispose()); search.value = searchQuery = ""; draft.value = ""; pendingOperation = pendingStart = null;
      olderReads.clear(); entries = inbox = publicInbox = []; conversation = detachedDraft = null; root.replaceChildren(); },
  });
}
