import assert from "node:assert/strict";
import test from "node:test";
import { mountInsightPanel } from "../browser/chromium/insight-panel.js";
import { mountPrivateConversationPanel } from "../browser/chromium/private-conversation-panel.js";
import { INSIGHT_VOICES } from "../browser/core/insight-voices.js";

function dom() {
  const created = [];
  const document = { body: { dataset: { uiMode: "user" } }, activeElement: null,
    createTextNode(textContent) { return { textContent, children: [] }; },
    createElement(tag) {
      const item = { tag, children: [], attributes: {}, dataset: {}, listeners: new Map(), value: "", textContent: "",
        append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } },
        replaceChildren(...children) { this.children = []; this.append(...children); },
        insertBefore(child, next) { this.children.splice(this.children.indexOf(next), 0, child); child.parentElement = this; },
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(key, callback) { this.listeners.set(key, callback); },
        removeEventListener(key) { this.listeners.delete(key); },
        focus() { document.activeElement = this; }, scrollIntoView() {},
        get lastElementChild() { return this.children.at(-1); } };
      created.push(item); return item;
    } };
  return { document, root: document.createElement("section"), created,
    byId: id => created.find(item => item.id === id) };
}
function state(preferences = { replyLanguage: "en" }) {
  return { preferences, status: "idle", available: false, busy: false, context: null, draft: "",
    ai: { status: "idle", connected: false, models: [] } };
}
test("public voice has twelve bounded localized choices, writes preferences only and restores Standard", () => {
  const ui = dom(), calls = []; let current = state({ replyLanguage: "de", currency: "EUR" });
  const panel = mountInsightPanel(ui.document, ui.root);
  panel.bind({ currentState: () => current, setInsightPreferences(preferences) { calls.push(preferences); current = state(preferences); panel.render(current); } });
  const select = ui.byId("insight-voice"), options = [...select.children];
  assert.equal(select.attributes["aria-label"], "Assistant voice");
  assert.equal(select.value, "standard"); assert.equal(select.children.length, 12);
  assert.deepEqual(select.children.map(item => item.value), INSIGHT_VOICES.map(item => item.id));
  assert.ok(select.children.every(item => typeof item.textContent === "string" && item.textContent.length > 0));
  assert.equal(ui.byId("insight-related-settings").children.includes(select), false);
  select.value = "curious"; select.listeners.get("change")();
  assert.deepEqual(calls, [{ replyLanguage: "de", currency: "EUR", voice: "curious" }]);
  select.value = "standard"; select.listeners.get("change")();
  assert.deepEqual(calls[1], { replyLanguage: "de", currency: "EUR" });
  assert.deepEqual(select.children, options);
});
test("public voice sync preserves draft control, focus and options while request states block changes", () => {
  const ui = dom(), panel = mountInsightPanel(ui.document, ui.root), current = state(); let writes = 0;
  current.ai.articleText = "Typing with composition";
  panel.bind({ currentState: () => current, setInsightPreferences() { writes++; } });
  const select = ui.byId("insight-voice"), article = ui.byId("insight-article-text");
  article.value = "Typing with composition"; article.focus();
  panel.render({ ...current, preferences: { replyLanguage: "en", voice: "funny" } });
  assert.equal(select.value, "funny"); assert.equal(ui.document.activeElement, article);
  assert.equal(ui.byId("insight-article-text"), article);
  assert.equal(article.value, "Typing with composition");
  for (const status of ["generating", "fetchingRelated", "preparingArticle", "resuming"]) {
    panel.render({ ...current, ai: { ...current.ai, status } });
    assert.equal(select.disabled, true); select.listeners.get("change")();
  }
  assert.equal(writes, 0);
  panel.render({ ...current, busy: true }); assert.equal(select.disabled, true);
});
const flush = () => new Promise(resolve => setImmediate(resolve));
test("private composer shares current voice without refetch or focus loss; list and public previews hide it", async () => {
  const ui = dom(), calls = [], conversation = { id: "private", title: "Private", sourceId: "source", visibility: "private" };
  let current = state(), actor = "owner";
  const panel = mountPrivateConversationPanel(ui.document, ui.root, {
    readActor: () => actor, randomId: () => "operation", readPublicState: () => ({ sourceId: "source" }), showView() {},
    readInsightState: () => current,
    setInsightPreferences(preferences) { current = state(preferences); calls.push(["preferences", preferences]); panel.observe(); },
    schedule: () => null, unschedule() {},
    client: {
      async privateConversation(action) { calls.push([action]);
        if (action === "list") return { conversations: [conversation], next: null };
        if (action === "read") return { conversation, messages: [{ id: "agent", body: "Answer", actorType: "agent", citations: [] }], next: null };
        throw new Error(action);
      },
      async accountPublicChats(action) { calls.push([`public-${action}`]);
        if (action === "list") return { chats: [{ id: "public", title: "Public", visibility: "public", topicId: "topic" }], next: null };
        return { conversation: { id: "public", title: "Public", visibility: "public", topicId: "topic" }, messages: [], next: null };
      },
    },
  });
  const toggle = ui.byId("private-generate-voice-toggle");
  const voice = ui.created.find(item => item.className === "assistant-voice-control");
  const menu = voice.children.find(item => item.className === "assistant-voice-menu");
  assert.equal(voice.hidden, true);
  panel.setActive(true); await flush();
  const feed = ui.byId("private-chat-feed");
  feed.children.find(item => item.className === "private-chat-card" && item.children[0]?.children?.some(child => child.textContent === "Private"))
    .listeners.get("click")(); await flush();
  assert.equal(voice.hidden, false);
  assert.equal(toggle.attributes["aria-label"], "Assistant voice: Standard"); assert.equal(menu.children.length, 12);
  const draft = ui.byId("private-message-body"); draft.value = "Still typing"; draft.focus();
  const beforeReads = calls.filter(item => item[0] === "read").length;
  toggle.listeners.get("click")({}); menu.children.find(item=>item.attributes["data-voice"] === "mediator").listeners.get("click")({});
  assert.equal(current.preferences.voice, "mediator");
  assert.equal(draft.value, "Still typing"); assert.equal(calls.filter(item => item[0] === "read").length, beforeReads);
  current = state({ replyLanguage: "en", voice: "challenger" }); panel.observe(); assert.match(toggle.attributes["aria-label"], /Challenger/);
  current.busy = true; panel.observe(); assert.equal(toggle.disabled, true);
  current.busy = false;
  ui.created.find(item => item.tag === "button" && item.textContent === "All chats").listeners.get("click")(); await flush();
  assert.equal(voice.hidden, true);
  feed.children.find(item => item.className === "private-chat-card" && item.children[0]?.children?.some(child => child.textContent === "Public"))
    .listeners.get("click")(); await flush();
  assert.equal(voice.hidden, true); assert.equal(toggle.disabled, true);
  actor = null; panel.observe(); assert.equal(voice.hidden, true); panel.dispose();
  assert.ok(calls.every(item => ["list", "read", "public-list", "public-read", "preferences"].includes(item[0])));
});
