import test from "node:test";
import assert from "node:assert/strict";
import { createInsightController } from "../browser/core/insight-controller.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { preparePrivateGeneration } from "../browser/core/private-generation-context.js";
import { mountPrivateConversationPanel } from "../browser/chromium/private-conversation-panel.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

const ACTOR = "account-11111111-1111-4111-8111-111111111111";
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function controllerFixture(options = {}) {
  let sequence = 0, insight;
  const service = createMemoryDemoService({ nextId: kind => `${kind}-${++sequence}`, now: () => "2026-10-12T12:00:00.000Z" });
  const requests = [], saves = [];
  const discussion = createLocalDiscussionController({
    client: { health: async () => ({}), catalog: async () => service.catalog(),
      discussion: async id => service.discussion(id), related: async (id, limit) => service.related(id, limit),
      priorDiscussions: async id => service.priorDiscussions(id) },
    session: { isPaired: async () => true }, readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange: state => insight?.observe(state),
  });
  insight = createInsightController({ shareInsight() { assert.fail("Voice preferences must not share anything"); },
    aiClient: { status: async () => ({ connected: true, planEnabled: true, pending: false,
      account: { clientId: "synthetic", label: "Synthetic" } }), models: async () => [{ slug: "synthetic" }],
      start: async value => { requests.push(value); return { operationId: value.operationId, state: "running" }; },
      result: async operationId => ({ operationId, state: "completed", result: { body: "Synthetic result", model: "synthetic", citations: [] } }),
      cancel: async () => true },
    readArticle: async () => ({ url: "https://example.com/", documentId: "synthetic-document", text: "Bounded public prefix" }),
    attestArticle: async () => true, saveInsightPreferences: async value => saves.push(value),
    readBrowserLanguage: () => null, randomId: () => "voice-trust-operation", ...options });
  await discussion.open(); await insight.checkConnection(); await insight.loadModels();
  return { service, discussion, insight, requests, saves, dispose() { insight.dispose(); discussion.dispose(); } };
}

test("Trust: late saved voice cannot overwrite an explicit edit or change an existing private draft/context", async () => {
  const load = deferred(), app = await controllerFixture({ loadInsightPreferences: () => load.promise });
  assert.equal(app.insight.prepare(), true); assert.equal(app.insight.setDraft("UNSENT_DRAFT"), true);
  const context = app.insight.currentState().context;
  assert.equal(app.insight.setInsightPreferences({ replyLanguage: "fr", voice: "challenger" }, false), true);
  load.resolve({ preferences: { replyLanguage: "de", voice: "sarcastic" }, browserLanguageHintEnabled: true });
  await flush();
  assert.deepEqual(app.insight.currentState().preferences, { replyLanguage: "fr", voice: "challenger" });
  assert.equal(app.insight.currentState().draft, "UNSENT_DRAFT");
  assert.deepEqual(app.insight.currentState().context, context);
  assert.deepEqual(app.requests, []); assert.equal(app.saves.length, 1);
  app.dispose();
});

test("Trust: a public request snapshots clicked voice through asynchronous capture without retarget/retry", async () => {
  const capture = deferred(), entered = deferred();
  const app = await controllerFixture({ readArticle: async () => { entered.resolve(); return capture.promise; } });
  assert.equal(app.insight.setInsightPreferences({ replyLanguage: "en", voice: "skeptic" }, false), true);
  app.insight.setRelatedPageTextEnabled(false);
  const binding = app.discussion.currentState();
  const pending = app.insight.createInsights({ automatic: true }); await entered.promise;
  assert.equal(app.insight.setInsightPreferences({ replyLanguage: "en", voice: "optimist" }, false), true);
  capture.resolve({ url: "https://example.com/", documentId: "synthetic-document", text: "Bounded public prefix" });
  assert.equal(await pending, true);
  assert.equal(app.requests.length, 1); assert.equal(app.requests[0].preferences.voice, "skeptic");
  assert.equal(app.requests[0].context.currentSource.id, binding.sourceId);
  assert.equal(app.requests[0].context.topic.id, binding.topicId);
  assert.equal(app.requests[0].allowWebResearch, false);
  assert.equal(app.insight.currentState().preferences.voice, "optimist");
  await flush(); assert.equal(app.requests.length, 1);
  app.dispose();
});

test("Trust: changing voice during private capture invalidates preparation rather than dispatching a different style", async () => {
  const app = await controllerFixture(), capture = deferred();
  app.insight.setInsightPreferences({ replyLanguage: "en", voice: "funny" }, false);
  const readState = () => ({ ...app.discussion.currentState(), actorId: ACTOR });
  const pending = preparePrivateGeneration({ sourceId: readState().sourceId, readState,
    readInsight: app.insight.currentState, readArticle: () => capture.promise, attestArticle: async () => true });
  app.insight.setInsightPreferences({ replyLanguage: "en", voice: "realist" }, false);
  capture.resolve({ text: "Bounded public prefix", url: "https://example.com/", documentId: "synthetic-document" });
  await assert.rejects(pending, TypeError);
  assert.deepEqual(app.requests, []);
  app.dispose();
});

test("Trust: uncertain private send preserves exact voice payload on deliberate retry despite later selector change", async () => {
  const elements = [], sends = []; let failFirst = true, preferences = { replyLanguage: "en", voice: "skeptic" };
  const document = { createTextNode(textContent) { return { textContent, children: [] }; }, createElement(tag) {
    const element = { tag, children: [], attributes: {}, dataset: {}, value: "", listeners: new Map(),
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key]; },
      addEventListener(name, fn) { this.listeners.set(name, fn); }, scrollIntoView() {},
      removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); },
      get lastElementChild() { return this.children.at(-1); } };
    elements.push(element); return element;
  } };
  const conversation = { id: "private-chat", title: "Private opener", sourceId: "source-one", sourceUrl: "https://example.com/", revision: 2 };
  const root = document.createElement("section"), panel = mountPrivateConversationPanel(document, root, {
    readActor: () => ACTOR, randomId: () => "operation-one", requestSignIn() { assert.fail("Unexpected sign in"); },
    readPublicState: () => ({ sourceId: "source-one" }), showView() {},
    readInsightState: () => ({ preferences, ai: { status: "idle" }, busy: false }),
    setInsightPreferences(value) { preferences = value; panel.observe(); },
    prepareGeneration: async () => ({ model: "synthetic", preferences: structuredClone(preferences) }),
    schedule: () => null, unschedule() {}, client: { async privateConversation(action, input) {
      if (action === "list") return { conversations: [conversation], next: null };
      if (action === "read") return { conversation, messages: [{ id: "private-agent", actorType: "agent", body: "Private answer", citations: [] }], next: null };
      if (action === "send") {
        sends.push(structuredClone(input));
        if (failFirst) { failFirst = false; throw { code: "unavailable" }; }
        return { conversationId: conversation.id, messageId: "accepted-reply", revision: 3 };
      }
      assert.fail(`Unexpected action ${action}`);
    } } });
  panel.setActive(true); await flush();
  const feed = elements.find(element => element.id === "private-chat-feed");
  feed.children.find(element => element.className === "private-chat-card").listeners.get("click")(); await flush();
  const draft = elements.find(element => element.id === "private-message-body"), form = elements.find(element => element.className === "private-composer");
  draft.value = "An accepted bounded private reply.";
  await form.listeners.get("submit")({ preventDefault() {} });
  const toggle = elements.find(element => element.id === "private-generate-voice-toggle");
  toggle.listeners.get("click")({ stopPropagation() {} });
  const funny = elements.find(element => element.className === "assistant-voice-option" && element.attributes["data-voice"] === "funny");
  funny.listeners.get("click")({ stopPropagation() {} });
  assert.equal(preferences.voice, "funny");
  await form.listeners.get("submit")({ preventDefault() {} });
  assert.equal(sends.length, 2); assert.deepEqual(sends[1], sends[0]);
  assert.equal(sends[1].generation.preferences.voice, "skeptic");
  assert.equal(sends[1].replyToId, "private-agent"); assert.equal(sends[1].operationId, "operation-one");
  panel.dispose();
});
