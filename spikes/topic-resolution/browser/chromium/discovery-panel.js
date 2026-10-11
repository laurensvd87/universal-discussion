import { inspectPageUrl } from "../core/page-content-policy.js";
import { appendInsightCitationNodes } from "../core/insight-citations.js";
import { EN } from "../locales/en.js";

export function mountDiscoveryPanel(document, root, { client, messages = {}, onOpenDiscussion = null,
  setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout } = {}) {
  const text = key => typeof messages?.[key] === "string" ? messages[key] : EN[key];
  const fixed = [];
  const transient = [];
  let active = false, connected = false, disposed = false, epoch = 0, pending = null, timer = null;
  let results = [], cursor = null, query = "", resultVersion = null, busy = false;
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
  const heading = node("h2",text("discoveryHeading")); heading.id = "discovery-heading";
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
  const more = button(text("discoveryMore"),"discovery-more"); more.hidden = true;
  const refresh = button(text("discoveryRefresh"),"discovery-refresh"); refresh.hidden = true;
  root.replaceChildren(heading,form,status,spinner,list,detail,more,refresh);

  function available() { return active && connected && !disposed; }
  function activity(value) {
    busy = value; spinner.hidden = !value;
    root.setAttribute("aria-busy",String(value)); more.disabled = value;
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
    removeHandlers(transient); list.replaceChildren(); detail.replaceChildren();
    detail.hidden = true; list.hidden = false; form.hidden = false;
    refresh.hidden = true; more.hidden = !cursor;
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
  async function search(append = false) {
    if (!available() || (append && (!cursor || busy))) return;
    const nextCursor = append ? cursor : null;
    invalidate(); const requestEpoch = epoch;
    query = input.value.trim();
    if (!append) { results = []; cursor = null; renderResults(); }
    refresh.hidden = true; status.textContent = text("discoveryLoading"); activity(true);
    const abort = new AbortController(); pending = abort;
    try {
      const page = await client.discover({query,limit:20,cursor:nextCursor},{signal:abort.signal});
      if (!available() || requestEpoch !== epoch) return;
      results = append ? [...results,...page.results] : page.results;
      resultVersion = page.version; cursor = page.nextCursor; renderResults();
      status.textContent = results.length ? "" : text("discoveryEmpty");
    } catch (error) {
      if (!available() || requestEpoch !== epoch) return;
      // Stale cursors cannot keep withdrawn text on the screen.
      results = []; cursor = null; renderResults(); refresh.hidden = false;
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
  async function openDiscussion(topicId) {
    invalidate(); const requestEpoch = epoch;
    status.textContent = text("discoveryLoading"); activity(true);
    const abort = new AbortController(); pending = abort;
    try {
      const discussion = await client.discussion(topicId,{signal:abort.signal});
      if (!available() || requestEpoch !== epoch) return;
      removeHandlers(transient);
      list.hidden = true; form.hidden = true; more.hidden = true; refresh.hidden = true; detail.hidden = false;
      const back = button(text("discoveryBack"),"discovery-back");
      const changedVersion = resultVersion && discussion.version &&
        (resultVersion.generation !== discussion.version.generation || resultVersion.revision !== discussion.version.revision);
      listen(back,"click",() => {
        invalidate(); renderResults(); status.textContent = ""; input.focus?.();
        if (changedVersion) void search();
      },transient);
      const title = node("h3",discussion.topic.title); title.tabIndex = -1;
      detail.replaceChildren(back,title,node("p",text("discoveryReadOnly"),"field-note"));
      for (const thread of discussion.roots.filter(visibleTree)) {
        const tree = node("div","","discovery-thread"); tree.append(messageCard(thread));
        for (const reply of thread.replies ?? []) if (reply.state === "visible") tree.append(messageCard(reply));
        detail.append(tree);
      }
      status.textContent = ""; title.focus?.();
      onOpenDiscussion?.({topicId,discussion});
    } catch {
      if (available() && requestEpoch === epoch) { status.textContent = text("discoveryUnavailable"); refresh.hidden = false; }
    } finally { if (requestEpoch === epoch) { pending = null; activity(false); } }
  }
  function changed() {
    invalidate(); results = []; cursor = null; renderResults(); status.textContent = "";
    if (available()) timer = schedule(() => { timer = null; void search(); },250);
  }
  function submit(event) { event.preventDefault(); if (available()) void search(); }
  listen(input,"input",changed);
  listen(input,"keydown",event => { if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) submit(event); });
  listen(form,"submit",submit);
  listen(more,"click",() => { void search(true); });
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
      if (!connected) { results = []; cursor = null; renderResults(); status.textContent = text("discoveryConnect"); }
      else if (active) void search();
    },
    dispose() {
      if (disposed) return;
      disposed = true; invalidate(); removeHandlers(fixed); removeHandlers(transient); root.replaceChildren();
    },
  });
}
