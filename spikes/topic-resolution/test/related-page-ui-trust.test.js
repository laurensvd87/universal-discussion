import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { mountDiscoveryPanel } from "../browser/chromium/discovery-panel.js";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";
import { projectRelatedPages } from "../browser/core/related-page-suggestions.js";

const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function dom() {
  const elements = [];
  const all = element => [element, ...element.children.flatMap(all)];
  const detach = element => {
    if (!element.parentElement) return;
    element.parentElement.children = element.parentElement.children.filter(child => child !== element);
    element.parentElement = null;
  };
  const document = { body: {}, activeElement: null,
    querySelector(selector) { return selector.startsWith("#") ? elements.find(item => item.id === selector.slice(1)) ?? null : null; },
    createElement(tag) {
      const element = { tag, children: [], attributes: {}, dataset: {}, style: {}, listeners: new Map(),
        textContent: "", value: "", hidden: false,
        append(...children) { for (const child of children) { detach(child); child.parentElement = this; this.children.push(child); } },
        replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); },
        insertBefore(child, sibling) { detach(child); child.parentElement = this;
          const index = sibling ? this.children.indexOf(sibling) : this.children.length; this.children.splice(index, 0, child); },
        contains(target) { return all(this).includes(target); },
        setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key] ?? null; },
        removeAttribute(key) { delete this.attributes[key]; },
        addEventListener(name, fn) { this.listeners.set(name, fn); },
        removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); },
        querySelectorAll() { return all(this).slice(1).filter(item => item.attributes["data-action"] || item.attributes["data-post-id"] || item.attributes["data-thread-root-id"]); },
        focus() { document.activeElement = this; }, scrollIntoView() {},
        get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null; },
      };
      elements.push(element); return element;
    } };
  return { document, all, byId: id => elements.find(item => item.id === id) };
}

async function composition() {
  let sequence = 0;
  const service = createMemoryDemoService({ nextId: kind => `${kind}-${++sequence}`, now: () => "2026-10-12T12:00:00.000Z" });
  const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
  const add = (url, title) => service.ingest({ expected: service.catalog().version,
    operationId: `ingest-${++sequence}`, url, title,
    embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: vector }, extractorVersion: "main-text-prefix/v1" });
  const current = add("https://news.public.org/current", "Current article");
  add("https://news.public.org/related", "<img src=x onerror=BAD> Related article");
  const navigation = "https://news.public.org/current?utm_source=campaign&sessionid=RAM_ONLY_SESSION";
  let resolution = { phase: "ready", reason: null, tabId: 7, url: navigation, documentId: "document-1",
    sourceId: current.sourceId, topicId: current.topicId, assignment: current.assignment,
    sequence: 1, enabled: true, blockedOrigins: [], currentOrigin: "https://news.public.org",
    currentTabId: 7, currentUrl: navigation, contextReason: null,
    sessionWindowId: 2, currentWindowId: 2, sessionRevision: "capture-session-1", hostAccess: true };
  const ui = dom(), discussionRoot = ui.document.createElement("section"), discoveryRoot = ui.document.createElement("section");
  const searchCalls = [], timers = new Map(); let timer = 0, searchResolve;
  const discovery = mountDiscoveryPanel(ui.document, discoveryRoot, { client: {
    discover(input, options) { searchCalls.push({ input, options }); return new Promise(resolve => { searchResolve = resolve; }); },
    discussion() { assert.fail("Contextual pages must not fetch a discussion preview"); },
  }, setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); } });
  const discussion = mountDiscussionPanel(ui.document, discussionRoot);
  const controller = createLocalDiscussionController({ client: {
    async health() { return {}; }, async catalogContext(input) { return service.catalogContext(input); },
    async discussion(id) { return service.discussion(id); },
    async related(id, limit) { return service.related(id, limit); },
    async priorDiscussions(id) { return service.priorDiscussions(id); },
    command() { assert.fail("Presentation must not write"); },
  }, session: { async isPaired() { return true; }, async clear() {} },
  readActiveTab: async () => ({ tabId: 7, windowId: 2, url: resolution.currentUrl }),
  observeTabLifecycle: () => () => {}, readPageResolution: async () => resolution,
  lookupByNormalizedUrl() { assert.fail("Ready matching must not trigger another lookup"); },
  onStateChange(state) { discussion.render(state); discovery.observePage(state);
    discovery.observeConnected(Boolean(state.catalog) && !["disconnected", "error"].includes(state.phase)); },
  });
  discussion.bind(controller); discovery.setActive(true);
  await controller.setTopicViewMode("classic"); await controller.open(); await settle();
  function flushSearch() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) fn(); }
  function input(value) { const field = ui.byId("discovery-search"); field.value = value; field.listeners.get("input")(); }
  return { ...ui, service, current, controller, discussion, discovery, discussionRoot, discoveryRoot,
    searchCalls, flushSearch, input, finishSearch(value) { searchResolve(value); },
    async navigate() { resolution = { ...resolution, phase: "processing", reason: "embedding", sequence: 2,
      currentUrl: "https://news.public.org/later", url: "https://news.public.org/later", sourceId: null, topicId: null,
      documentId: "document-2", assignment: null }; await controller.updatePageResolution(resolution); },
    dispose() { controller.dispose(); discussion.dispose(); discovery.dispose(); } };
}

test("Trust: real canonical service/controller drives both contextual page surfaces with tracked exact navigation", async () => {
  const f = await composition(), state = f.controller.currentState();
  assert.equal(state.phase, "ready"); assert.equal(state.selection, "background");
  assert.equal(typeof state.catalog.version.generation, "string");
  assert.equal(state.discussion.roots.length, 0);
  const projected = projectRelatedPages(state);
  assert.ok(projected.contextKey.includes("RAM_ONLY_SESSION"));
  assert.equal(projected.pages.some(page => page.url === "https://news.public.org/related"), true);
  assert.equal(JSON.stringify(projected.pages).includes("RAM_ONLY_SESSION"), false);
  const fallback = f.byId("discussion-related-page-suggestions");
  assert.equal(fallback.hidden, false);
  for (const root of [fallback, f.byId("discovery-results")]) {
    const links = f.all(root).filter(element => element.tag === "a");
    assert.ok(links.some(link => link.href === "https://news.public.org/related"));
    assert.ok(links.every(link => link.href !== "https://news.public.org/current"));
    assert.ok(links.every(link => link.rel === "noopener noreferrer" && link.referrerPolicy === "no-referrer"));
    assert.equal(f.all(root).some(element => ["img", "script", "iframe", "button"].includes(element.tag)), false);
  }
  assert.deepEqual(f.searchCalls, []);
  const before = f.service.catalog().version;
  await f.navigate();
  assert.equal(fallback.hidden, true); assert.equal(fallback.children[1].children.length, 0);
  assert.equal(f.byId("discovery-results").children.length, 0);
  assert.deepEqual(f.service.catalog().version, before); assert.deepEqual(f.searchCalls, []);
  f.dispose();
});

test("Trust: real navigation preserves deliberate global query, while clear fences late search into contextual mode", async () => {
  const f = await composition(); f.input("deliberate global query"); f.flushSearch();
  assert.equal(f.searchCalls.length, 1); assert.equal(f.searchCalls[0].input.query, "deliberate global query");
  await f.navigate();
  assert.equal(f.byId("discovery-search").value, "deliberate global query");
  assert.equal(f.searchCalls[0].options.signal.aborted, false);
  f.input(" \t ");
  assert.equal(f.searchCalls[0].options.signal.aborted, true);
  f.finishSearch({ version: f.service.catalog().version, results: [{ topicId: "late", title: "LATE_TEXT", sources: [], visibleCount: 1 }], nextCursor: null });
  await settle();
  assert.equal(f.byId("discovery-results").children.length, 0);
  assert.equal(f.all(f.discoveryRoot).some(element => element.textContent === "LATE_TEXT"), false);
  f.discovery.observeConnected(false); f.discovery.observeConnected(true);
  assert.equal(f.searchCalls.length, 1);
  f.dispose();
});

test("Trust: actual accepted root hides Discussion fallback and withdrawal reveals it without altering Discover", async () => {
  const f = await composition(), fallback = f.byId("discussion-related-page-suggestions");
  const created = f.service.command(f.service.catalog().version, { type: "create-root",
    topicId: f.current.topicId, body: "Synthetic visible conversation" }, "demo-alex");
  await f.controller.open(); await settle();
  assert.equal(f.controller.currentState().discussion.roots[0].state, "visible");
  assert.equal(fallback.hidden, true); assert.equal(fallback.children[1].children.length, 0);
  assert.ok(f.byId("discovery-results").children.length > 0);
  f.service.command(f.service.catalog().version, { type: "withdraw",
    contributionId: created.result.contributionId }, "demo-alex");
  await f.controller.open(); await settle();
  // discussionView deliberately omits a withdrawn root with no live replies.
  assert.deepEqual(f.controller.currentState().discussion.roots, []);
  assert.equal(fallback.hidden, false);
  assert.deepEqual(f.searchCalls, []);
  f.dispose();
});
