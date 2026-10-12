import { inspectPageUrl } from "../core/page-content-policy.js";
import { appendInsightCitationNodes } from "../core/insight-citations.js";
import { EN } from "../locales/en.js";
import { projectRelatedPages } from "../core/related-page-suggestions.js";

export function mountDiscoveryPanel(document, root, { client, messages = {}, onOpenDiscussion = null,
  setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout } = {}) {
  const text = key => typeof messages?.[key] === "string" ? messages[key] : EN[key];
  const fixed = [];
  const transient = [];
  let active = false, connected = false, disposed = false, epoch = 0, pending = null, timer = null;
  let results = [], cursor = null, query = "", resultVersion = null, busy = false;
  let suggestions = {contextKey:null,pages:[],loading:false}, suggestionSignature = "";
  let pageIndex = 0, pageCursors = [null], pageScroll = [], previewTopic = null, previewPage = 0, previewVersion = null;
  function node(tag, content = "", className = "") {
    const element = document.createElement(tag); element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  function listen(element, type, handler, list = fixed) {
    element.addEventListener(type,handler); list.push([element,type,handler]);
  }
  function removeHandlers(list) {
    for (const [element,type,handler] of list) element.removeEventListener(type,handler);
    list.length = 0;
  }
  function button(content, id) {
    const element = node("button",content); element.type = "button"; element.id = id;
    return element;
  }
  const heading = node("h2",text("relatedSuggestionsHeading")); heading.id = "discovery-heading";
  root.setAttribute("aria-labelledby",heading.id);
  const form = node("form"); form.className = "discovery-search-form";
  const label = node("label",text("discoverySearch")); label.htmlFor = "discovery-search";
  const input = node("input"); input.id = "discovery-search"; input.type = "search"; input.maxLength = 256;
  input.autocomplete = "off"; input.value = "";
  form.append(label,input);
  const status = node("p"); status.id = "discovery-status"; status.setAttribute("role","status"); status.setAttribute("aria-live","polite");
  const spinner = node("span"); spinner.className = "discussion-feed-spinner discovery-spinner"; spinner.hidden = true;
  spinner.setAttribute("aria-hidden","true");
  const list = node("div"); list.id = "discovery-results"; list.className = "discovery-results";
  const detail = node("section"); detail.id = "discovery-preview"; detail.hidden = true;
  const more = button(text("paginationNext"),"discovery-more"); more.hidden = true;
  const previous = button(text("paginationPrevious"),"discovery-previous");
  const pageLabel = node("span"); pageLabel.setAttribute("aria-live","polite");
  const pagination = node("nav","","community-pagination"); pagination.append(previous,pageLabel,more);
  const refresh = button(text("discoveryRefresh"),"discovery-refresh"); refresh.hidden = true;
  root.replaceChildren(heading,form,status,spinner,list,detail,pagination,refresh);
  function renderPager() {
    pagination.hidden = Boolean(previewTopic);
    previous.disabled = busy || pageIndex === 0;
    more.hidden = false;
    more.disabled = busy || (input.value.trim() ? !cursor : (pageIndex + 1) * 20 >= suggestions.pages.length);
    pageLabel.textContent = (text("paginationPage") ?? "Page {page}").replace("{page}",String(pageIndex + 1));
  }

  function available() { return active && connected && !disposed; }
  function activity(value) {
    busy = value; spinner.hidden = !value;
    root.setAttribute("aria-busy",String(value)); renderPager();
  }
  function invalidate() {
    epoch++; pending?.abort(); pending = null;
    if (timer !== null) cancel(timer);
    timer = null; activity(false);
  }
  function sourceLink(source) {
    if (!source || typeof source.url !== "string" || !inspectPageUrl(source.url).supported) return null;
    const link = node("a",source.title || new URL(source.url).hostname,"discovery-source");
    link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.referrerPolicy = "no-referrer";
    return link;
  }
  function renderResults() {
    heading.textContent = text("discoveryHeading");
    removeHandlers(transient); list.replaceChildren(); detail.replaceChildren();
    detail.hidden = true; list.hidden = false; form.hidden = false;
    refresh.hidden = true; more.hidden = !cursor;
    previewTopic = null; renderPager();
    for (const result of results) {
      const card = node("article","","discovery-card");
      const title = button(result.title,"discovery-open-" + result.topicId); title.className = "discovery-title";
      listen(title,"click",() => { if (available()) void openDiscussion(result.topicId); },transient);
      card.append(title,node("p",result.snippet,"discovery-snippet"),
        node("p",text("discoveryCount").replace("{count}",String(result.visibleCount)),"field-note"));
      const sources = node("div","","discovery-sources");
      for (const source of result.sources ?? []) { const link = sourceLink(source); if (link) sources.append(link); }
      card.append(sources); list.append(card);
    }
  }
  function renderRelated() {
    removeHandlers(transient); list.replaceChildren(); detail.replaceChildren();
    detail.hidden = true; list.hidden = false; form.hidden = false;
    more.hidden = true; refresh.hidden = true;
    heading.textContent = text("relatedSuggestionsHeading");
    activity(available() && suggestions.loading);
    if (!available()) { status.textContent = text("discoveryConnect"); return; }
    previewTopic = null; renderPager();
    for (const page of suggestions.pages.slice(pageIndex * 20,(pageIndex + 1) * 20)) {
      const link = sourceLink(page); if (!link) continue;
      link.className = "discovery-related-link";
      link.textContent = "";
      const arrow = node("span","↗","discovery-related-arrow"); arrow.setAttribute("aria-hidden","true");
      link.append(node("span",page.title || page.hostname,"discovery-related-title"),
        node("span",page.hostname,"discovery-related-domain"),arrow);
      const card = node("article","","discovery-card discovery-related-card");
      card.append(link); list.append(card);
    }
    status.textContent = suggestions.loading || list.children.length ? "" :
      text(suggestions.contextKey ? "relatedSuggestionsEmpty" : "relatedSuggestionsContext");
  }
  async function search(targetPage = 0) {
    if (!available() || busy && targetPage !== 0) return;
    if (!input.value.trim()) {
      invalidate(); results = []; cursor = null; resultVersion = null; pageIndex = targetPage; renderRelated(); return;
    }
    pageScroll[pageIndex] = list.scrollTop ?? 0;
    const nextCursor = pageCursors[targetPage] ?? null;
    invalidate(); const requestEpoch = epoch;
    query = input.value.trim();
    results = []; cursor = null; renderResults();
    refresh.hidden = true; status.textContent = text("discoveryLoading"); activity(true);
    const abort = new AbortController(); pending = abort;
    try {
      const page = await client.discover({query,limit:20,cursor:nextCursor},{signal:abort.signal});
      if (!available() || requestEpoch !== epoch) return;
      if (targetPage !== 0 && resultVersion && (resultVersion.generation !== page.version.generation || resultVersion.revision !== page.version.revision))
        throw Object.assign(new Error("Changed"),{code:"conflict"});
      results = page.results; pageIndex = targetPage; pageCursors[targetPage + 1] = page.nextCursor;
      resultVersion = page.version; cursor = page.nextCursor; renderResults();
      status.textContent = results.length ? "" : text("discoveryEmpty");
      list.scrollTop = pageScroll[targetPage] ?? 0;
    } catch (error) {
      if (!available() || requestEpoch !== epoch) return;
      // Stale cursors cannot keep withdrawn text on the screen.
      results = []; cursor = null; pageIndex = 0; pageCursors = [null]; pageScroll = []; renderResults(); refresh.hidden = false;
      status.textContent = text(error?.code === "conflict" ? "discoveryChanged" : "discoveryUnavailable");
    } finally {
      if (requestEpoch === epoch) { pending = null; activity(false); }
    }
  }
  function visibleTree(rootMessage) {
    return rootMessage.state === "visible" || (rootMessage.replies ?? []).some(entry => entry.state === "visible");
  }
  function messageCard(entry) {
    const article = node("article","","discovery-message");
    article.setAttribute("data-post-id",entry.id);
    if (entry.state !== "visible") { article.append(node("p",text("discoveryDeleted"),"field-note")); return article; }
    const author = node("span","",`discovery-author private-identity private-identity-${entry.actorType}`);
    author.setAttribute("aria-label",text(entry.actorType === "agent" ? "discoveryAssistant" : "discoveryPerson"));
    author.title = text(entry.actorType === "agent" ? "discoveryAssistant" : "discoveryPerson");
    article.append(author);
    const body = node("p","","discussion-body");
    if (entry.actorType === "agent") appendInsightCitationNodes(document,body,entry.body,
      text("discoveryCitationOpen"),text("discoveryCitationUnverifiedOpen"),text("discoveryCitationUnverifiedNote"));
    else body.textContent = entry.body;
    article.append(body);
    const link = sourceLink(entry.origin); if (link) article.append(link);
    return article;
  }
  async function openDiscussion(topicId, targetPage = 0) {
    invalidate(); const requestEpoch = epoch;
    const expectedVersion = previewVersion;
    detail.replaceChildren();
    status.textContent = text("discoveryLoading"); activity(true);
    const abort = new AbortController(); pending = abort;
    try {
      const discussion = await client.discussion(topicId,{signal:abort.signal});
      if (!available() || requestEpoch !== epoch) return;
      if (targetPage !== 0 && expectedVersion && (expectedVersion.generation !== discussion.version.generation || expectedVersion.revision !== discussion.version.revision))
        throw Object.assign(new Error("Changed"),{code:"conflict"});
      previewVersion = discussion.version;
      removeHandlers(transient);
      list.hidden = true; form.hidden = true; more.hidden = true; refresh.hidden = true; detail.hidden = false;
      const back = button(text("discoveryBack"),"discovery-back");
      const changedVersion = resultVersion && discussion.version &&
        (resultVersion.generation !== discussion.version.generation || resultVersion.revision !== discussion.version.revision);
      listen(back,"click",() => {
        invalidate(); previewTopic = null; renderResults(); status.textContent = ""; input.focus?.();
        if (changedVersion) void search();
      },transient);
      const title = node("h3",discussion.topic.title); title.tabIndex = -1;
      detail.replaceChildren(back,title,node("p",text("discoveryReadOnly"),"field-note"));
      const visible = discussion.roots.filter(visibleTree);
      previewTopic = topicId; previewPage = targetPage; renderPager();
      for (const thread of visible.slice(targetPage * 20,(targetPage + 1) * 20)) {
        const tree = node("div","","discovery-thread"); tree.append(messageCard(thread));
        const replies = (thread.replies ?? []).filter(reply => reply.state === "visible");
        let replyPage = 0, replyPending = false;
        const body = node("div");
        const replyPager = node("nav","","community-pagination");
        const older = button(text("paginationPrevious"),"discovery-replies-previous-" + thread.id);
        const newer = button(text("paginationNext"),"discovery-replies-next-" + thread.id);
        const label = node("span");
        function renderReplies() {
          body.replaceChildren(...replies.slice(replyPage * 20,(replyPage + 1) * 20).map(messageCard));
          older.disabled = replyPending || replyPage === 0; newer.disabled = replyPending || (replyPage + 1) * 20 >= replies.length;
          label.textContent = (text("paginationPage") ?? "Page {page}").replace("{page}",String(replyPage + 1));
          replyPager.hidden = replies.length <= 20;
        }
        const navigateReplies = async direction => {
          const target = replyPage + direction;
          if (!available() || busy || replyPending || target < 0 || target * 20 >= replies.length) return;
          replyPending = true; renderReplies();
          try {
            if (typeof client.version === "function") {
              const current = await client.version();
              if (!available() || requestEpoch !== epoch) return;
              if (current.version.generation !== discussion.version.generation || current.version.revision !== discussion.version.revision)
                throw Object.assign(new Error("Changed"),{code:"conflict"});
            }
            if (!available() || requestEpoch !== epoch) return;
            replyPage = target;
          } catch { if (available() && requestEpoch === epoch) {
            detail.replaceChildren(); results = []; cursor = null; pageIndex = 0; pageCursors = [null];
            renderResults(); status.textContent = text("discoveryChanged"); refresh.hidden = false;
          } }
          finally { replyPending = false; if (available() && requestEpoch === epoch) renderReplies(); }
        };
        listen(older,"click",() => { if (replyPage > 0) void navigateReplies(-1); },transient);
        listen(newer,"click",() => { if ((replyPage + 1) * 20 < replies.length) void navigateReplies(1); },transient);
        replyPager.append(older,label,newer); renderReplies(); tree.append(body,replyPager);
        detail.append(tree);
      }
      const previewPager = node("nav","","community-pagination");
      const prev = button(text("paginationPrevious"),"discovery-preview-previous"); prev.disabled = targetPage === 0;
      const next = button(text("paginationNext"),"discovery-preview-next"); next.disabled = (targetPage + 1) * 20 >= visible.length;
      listen(prev,"click",() => { if (!prev.disabled) void openDiscussion(topicId,previewPage - 1); },transient);
      listen(next,"click",() => { if (!next.disabled) void openDiscussion(topicId,previewPage + 1); },transient);
      previewPager.append(prev,node("span",(text("paginationPage") ?? "Page {page}").replace("{page}",String(targetPage + 1))),next);
      detail.append(previewPager);
      status.textContent = ""; title.focus?.();
      onOpenDiscussion?.({topicId,discussion});
    } catch (failure) {
      if (available() && requestEpoch === epoch) {
        results = []; cursor = null; pageIndex = 0; pageCursors = [null]; previewVersion = null;
        renderResults(); status.textContent = text(failure?.code === "conflict" ? "discoveryChanged" : "discoveryUnavailable"); refresh.hidden = false;
      }
    } finally { if (requestEpoch === epoch) { pending = null; activity(false); } }
  }
  function changed() {
    invalidate(); results = []; cursor = null; resultVersion = null; pageIndex = 0; pageCursors = [null]; pageScroll = [];
    if (!input.value.trim()) { renderRelated(); return; }
    renderResults(); status.textContent = "";
    if (available()) timer = schedule(() => { timer = null; void search(); },250);
  }
  function submit(event) { event.preventDefault(); if (available()) void search(); }
  listen(input,"input",changed);
  listen(input,"keydown",event => { if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) submit(event); });
  listen(form,"submit",submit);
  listen(more,"click",() => { if (!more.disabled) void search(pageIndex + 1); });
  listen(previous,"click",() => { if (!previous.disabled) void search(pageIndex - 1); });
  listen(refresh,"click",() => { void search(); });
  status.textContent = text("discoveryConnect");
  return Object.freeze({
    setActive(value) {
      if (disposed || active === Boolean(value)) return;
      active = Boolean(value); invalidate();
      if (available()) void search();
    },
    observeConnected(value) {
      if (disposed || connected === Boolean(value)) return;
      connected = Boolean(value); invalidate();
      if (!connected) {
        results = []; cursor = null; resultVersion = null; pageIndex = 0; pageCursors = [null]; pageScroll = []; previewTopic = null;
        if (input.value.trim()) renderResults(); else renderRelated();
        status.textContent = text("discoveryConnect");
      }
      else if (active) void search();
    },
    observePage(state) {
      if (disposed) return;
      const next = projectRelatedPages(state);
      const signature = JSON.stringify(next);
      if (signature === suggestionSignature) return;
      const contextChanged = next.contextKey !== suggestions.contextKey;
      suggestions = next; suggestionSignature = signature;
      if (!input.value.trim()) {
        if (contextChanged) { invalidate(); pageIndex = 0; pageCursors = [null]; pageScroll = []; }
        renderRelated();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; invalidate(); removeHandlers(fixed); removeHandlers(transient); root.replaceChildren();
    },
  });
}
