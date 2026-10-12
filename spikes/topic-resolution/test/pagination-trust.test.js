import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateDiscussionService } from "../../../apps/local-service/src/private/private-service.js";
import { mountPrivateConversationPanel } from "../browser/chromium/private-conversation-panel.js";
import { mountDiscoveryPanel } from "../browser/chromium/discovery-panel.js";
import { mountAssistantVoicePicker } from "../browser/chromium/assistant-voice-picker.js";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function dom() {
  const nodes = [];
  const document = { activeElement: null, body: {}, querySelector(selector) { return selector.startsWith("#") ? nodes.findLast(element => element.id === selector.slice(1)) ?? null : null; },
    createTextNode(textContent) { return { textContent, children: [] }; }, createElement(tag) {
    const element = { tag, children: [], listeners: new Map(), attributes: {}, dataset: {}, style: {}, value: "", textContent: "", scrollTop: 0,
      append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } },
      replaceChildren(...items) { this.children = []; this.append(...items); },
      insertBefore(item, sibling) { if (item.parentElement) item.parentElement.children = item.parentElement.children.filter(child => child !== item);
        item.parentElement = this; this.children.splice(sibling ? this.children.indexOf(sibling) : this.children.length, 0, item); },
      setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key] ?? null; },
      removeAttribute(key) { delete this.attributes[key]; },
      contains(target) { const visit = item => item === target || item.children.some(visit); return visit(this); },
      querySelectorAll() { const visit = item => [item, ...item.children.flatMap(visit)]; return visit(this).slice(1); },
      addEventListener(key, handler) { this.listeners.set(key, handler); },
      removeEventListener(key, handler) { if (this.listeners.get(key) === handler) this.listeners.delete(key); },
      focus() { document.activeElement = this; }, scrollIntoView() {},
    };
    nodes.push(element); return element;
  } };
  const root = document.createElement("section");
  const all = item => [item, ...item.children.flatMap(all)];
  return { document, root, nodes, all, byId: id => nodes.findLast(element => element.id === id),
    click(id) { this.byId(id).listeners.get("click")({ stopPropagation() {} }); } };
}

test("Trust: returning from a real accepted private reply refreshes page one instead of falsely conflicting with old owner version", async t => {
  const actor = { id: "account-11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", displayName: "Alice", type: "human", demo: false };
  let serial = 0;
  const source = { id: "source-one", topicId: "topic-one", url: "https://example.org/current" };
  const service = createPrivateDiscussionService({ databasePath: ":memory:",
    nextId: kind => `${kind}-${String(++serial).padStart(4, "0")}`, now: () => "2026-10-12T12:00:00.000Z",
    ai: { generatePrivate() { assert.fail("Paging must not generate"); } },
    publicService: { actor: () => actor, exactSource: () => source, insightAnchor: () => ({}) } });
  t.after(() => service.close());
  for (let i = 0; i < 41; i++) service.create(actor, { operationId: `create-${i}`, body: `Private synthetic chat ${i}`, sourceId: source.id, sourceUrl: source.url });
  const ui = dom(), client = {
    version: async () => ({ version: { generation: "public-generation", revision: 0 } }),
    privateConversation: async (action, input, owner) => { assert.equal(owner, actor.id); return service[action](actor, input); },
  };
  const panel = mountPrivateConversationPanel(ui.document, ui.root, { client, readActor: () => actor.id,
    readPublicState: () => ({ sourceId: source.id }), showView() {}, randomId: () => "reply-operation",
    schedule: () => null, unschedule() {}, prepareGeneration() { assert.fail("Human-parent reply needs no generation"); } });
  t.after(() => panel.dispose()); panel.setActive(true); await settle();
  const cards = () => ui.byId("private-chat-feed").children.filter(element => element.className === "private-chat-card");
  assert.equal(cards().length, 20);
  cards()[0].listeners.get("click")(); await settle();
  ui.byId("private-message-body").value = "Synthetic accepted human reply";
  ui.nodes.find(element => element.className === "private-composer").listeners.get("submit")({ preventDefault() {} });
  await settle();
  assert.equal(ui.all(ui.root).some(element => element.textContent === "Synthetic accepted human reply"), true);
  ui.nodes.find(element => element.tag === "button" && element.textContent === "All chats").listeners.get("click")();
  await settle();
  assert.equal(cards().length, 20);
  assert.equal(ui.byId("my-chats-next").disabled, false);
});

test("Trust: asynchronous Discover reply-page checks serialize rapid clicks and never skip past final page", async () => {
  const ui = dom(), check = deferred(), version = { generation: "fixture", revision: 1 }; let checks = 0;
  const message = id => ({ id, state: "visible", actorType: "human", body: id });
  const panel = mountDiscoveryPanel(ui.document, ui.root, { client: {
    discover: async () => ({ version, results: [{ topicId: "topic", title: "Topic", snippet: "", visibleCount: 1, sources: [] }], nextCursor: null }),
    discussion: async () => ({ version, topic: { id: "topic", title: "Topic" }, roots: [{ ...message("root"), replies: Array.from({ length: 21 }, (_, index) => message(`reply-${index}`)) }] }),
    version: async () => { checks++; return check.promise; },
  } });
  ui.byId("discovery-search").value = "query"; panel.setActive(true); panel.observeConnected(true); await settle();
  ui.click("discovery-open-topic"); await settle();
  ui.click("discovery-replies-next-root"); ui.click("discovery-replies-next-root");
  check.resolve({ version }); await settle();
  const ids = ui.all(ui.byId("discovery-preview")).filter(element => element.attributes["data-post-id"]?.startsWith("reply-")).map(element => element.attributes["data-post-id"]);
  assert.deepEqual(ids, ["reply-20"]);
  assert.equal(checks, 1);
  assert.equal(ui.byId("discovery-replies-next-root").disabled, true);
  panel.dispose();
});

test("Trust: split voice button keeps main generation separate, blocks stale row actions and removes handlers on disposal", () => {
  const ui = dom(), main = ui.document.createElement("button"); main.id = "generate"; main.type = "button";
  let generations = 0; const choices = [];
  main.addEventListener("click", () => { generations++; });
  const picker = mountAssistantVoicePicker(ui.document, { button: main, onVoiceSelect: value => choices.push(value) });
  const toggle = picker.element.children.find(element => element.className === "assistant-voice-toggle");
  const menu = picker.element.children.find(element => element.className === "assistant-voice-menu");
  assert.equal(toggle.type, "button"); assert.equal(menu.children.length, 12);
  toggle.listeners.get("click")({ stopPropagation() {} });
  menu.children.find(element => element.attributes["data-voice"] === "funny").listeners.get("click")({ stopPropagation() {} });
  assert.deepEqual(choices, ["funny"]); assert.equal(generations, 0);
  toggle.listeners.get("click")({ stopPropagation() {} }); picker.update({ disabled: true });
  assert.equal(menu.hidden, true); assert.equal(toggle.attributes["aria-expanded"], "false");
  menu.children[0].listeners.get("click")({ stopPropagation() {} }); assert.deepEqual(choices, ["funny"]);
  picker.update({ voice: "sarcastic" }); assert.equal(toggle.disabled, true);
  picker.update({ disabled: false, hidden: true }); assert.equal(picker.element.hidden, true);
  picker.dispose(); assert.equal(toggle.listeners.size, 0); assert.ok(menu.children.every(row => row.listeners.size === 0));
  main.listeners.get("click")(); assert.equal(generations, 1);
});

test("Trust: a per-message voice menu closes and rejects a stale choice when real Discussion enters provider-busy state", async () => {
  let serial = 0, writes = 0;
  const service = createMemoryDemoService({ nextId: kind => `${kind}-${++serial}`, now: () => "2026-10-12T12:00:00.000Z" });
  service.command(service.catalog().version, { type: "create-root", topicId: "reserved-domain-demo", originSourceId: "reserved-example-com", body: "Synthetic published target" }, "demo-alex");
  const controller = createLocalDiscussionController({ client: { health: async () => ({}), catalog: async () => service.catalog(),
    discussion: async id => service.discussion(id), related: async (id, limit) => service.related(id, limit), priorDiscussions: async id => service.priorDiscussions(id) },
    session: { isPaired: async () => true }, readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl });
  await controller.open();
  const ui = dom(), panel = mountDiscussionPanel(ui.document, ui.root);
  let insight = { preferences: { replyLanguage: "en" }, busy: false, context: { currentSource: { id: "reserved-example-com" }, topic: { id: "reserved-domain-demo" } },
    ai: { status: "idle", connected: true, planEnabled: true, model: "synthetic" } };
  panel.bind(controller); panel.bindInsight({ currentState: () => insight,
    setInsightPreferences() { writes++; }, createFollowup() { assert.fail("Choosing a voice must not generate"); } });
  const wrapper = ui.all(ui.root).find(element => element.className === "assistant-voice-control" && element.children[0]?.attributes["data-action"] === "getinsights");
  assert.ok(wrapper);
  const toggle = wrapper.children.find(element => element.className === "assistant-voice-toggle");
  const menu = wrapper.children.find(element => element.className === "assistant-voice-menu");
  toggle.listeners.get("click")({ stopPropagation() {} }); assert.equal(menu.hidden, false);
  insight = { ...insight, busy: true, ai: { ...insight.ai, status: "generating" } };
  panel.renderInsightState(insight);
  assert.equal(toggle.disabled, true); assert.equal(menu.hidden, true);
  menu.children[0].listeners.get("click")({ stopPropagation() {} }); assert.equal(writes, 0);
  panel.dispose(); controller.dispose();
});
