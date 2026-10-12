import assert from "node:assert/strict";
import test from "node:test";
import { mountPrivateConversationPanel } from "../browser/chromium/private-conversation-panel.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const created = [], calls = [], tasks = new Map(), pending = []; let actor = "owner", taskId = 0, hold = false;
  const document = { activeElement: null, createElement(tag) {
    const item = { tag, children: [], listeners: new Map(), attributes: {}, dataset: {}, value: "", textContent: "",
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(event, fn) { this.listeners.set(event, fn); },
      removeEventListener(event,fn) { if (this.listeners.get(event) === fn) this.listeners.delete(event); },
      focus() { document.activeElement = this; }, scrollIntoView() {} };
    created.push(item); return item;
  } };
  const root = document.createElement("section");
  function reply(kind, packet) {
    const title = packet.query ?? "Unfiltered";
    const chat = { id: `${kind}-${title}`, title, sourceId: "source", sourceUrl: "https://example.com/", visibility: kind };
    return { [kind === "private" ? "conversations" : "chats"]: Array.from({length:20},(_,index) => ({...chat,id: `${kind}-${index}-${title}`})), next: packet.after ? null : `${kind}-cursor-${title}` };
  }
  function request(kind, action, packet) {
    calls.push({ kind, action, packet });
    if (action === "read") return Promise.resolve({ conversation: { id: packet.conversationId, title: "Detail", visibility: kind }, messages: [], next: null });
    if (hold) return new Promise(resolve => pending.push(() => resolve(reply(kind, packet))));
    return Promise.resolve(reply(kind, packet));
  }
  const panel = mountPrivateConversationPanel(document, root, {
    readActor: () => actor, readPublicState: () => ({}), showView() {}, randomId: () => "operation",
    schedule(fn, delay) { const id = ++taskId; tasks.set(id, { fn, delay }); return id; }, unschedule(id) { tasks.delete(id); },
    client: { privateConversation: (action, packet) => request("private", action, packet),
      accountPublicChats: (action, packet) => request("public", action, packet) },
  });
  const byId = id => created.find(item => item.id === id), input = byId("my-chats-search"), form = byId("my-chats-search-form"), feed = byId("private-chat-feed");
  return { panel, input, form, feed, root, document, created, calls, tasks, pending,
    type(value) { input.value = value; input.listeners.get("input")(); },
    enter() { form.listeners.get("submit")({ preventDefault() {} }); },
    fire() { for (const [id, task] of [...tasks]) { tasks.delete(id); task.fn(); } },
    hold(value) { hold = value; }, logout() { actor = null; panel.accountChanged(); },
  };
}
test("My chats search debounces both bounded pools, preserves input focus, and continues query through Next", async () => {
  const ui = fixture(); ui.panel.setActive(true); await flush();
  assert.ok(ui.calls.every(call => !Object.hasOwn(call.packet, "query")));
  ui.input.focus(); ui.type("  two words  ");
  assert.equal(ui.feed.children.some(item => item.className === "private-chat-card"), false);
  assert.equal(ui.tasks.size, 1); assert.equal([...ui.tasks.values()][0].delay, 200);
  assert.equal(ui.calls.length, 2); ui.fire(); await flush();
  assert.equal(ui.document.activeElement, ui.input); assert.equal(ui.input.value, "  two words  ");
  assert.ok(ui.calls.slice(2).every(call => call.packet.query === "two words" && call.packet.limit === 20 && call.packet.after === null));
  ui.created.find(item => item.id === "my-chats-next").listeners.get("click")(); await flush();
  assert.ok(ui.calls.slice(-2).every(call => call.packet.after?.endsWith("two words") || call.packet.after === null));
  assert.ok(ui.calls.slice(-2).every(call => call.packet.query === "two words"));
  ui.type(""); ui.enter(); await flush(); assert.equal(ui.tasks.size, 0);
  assert.ok(ui.calls.slice(-2).every(call => !Object.hasOwn(call.packet, "query") && call.packet.after === null));
  ui.panel.dispose();
});
test("changed query fences late results, IME waits for composition end, and leaving the view cancels debounce", async () => {
  const ui = fixture(); ui.panel.setActive(true); await flush(); ui.hold(true);
  ui.type("old"); ui.enter(); assert.equal(ui.pending.length, 2);
  ui.type("new"); ui.hold(false); ui.enter(); await flush();
  for (const complete of ui.pending) complete(); await flush();
  assert.ok(ui.feed.children.filter(item => item.className === "private-chat-card").every(item => item.attributes["data-chat-id"].endsWith("new")));
  const calls = ui.calls.length;
  ui.input.listeners.get("compositionstart")(); ui.type("日本語"); ui.enter();
  assert.equal(ui.tasks.size, 0); assert.equal(ui.calls.length, calls);
  ui.input.listeners.get("compositionend")(); assert.equal(ui.tasks.size, 1);
  ui.panel.setActive(false); assert.equal(ui.tasks.size, 0); assert.equal(ui.calls.length, calls);
  ui.panel.setActive(true); await flush();
  assert.ok(ui.calls.slice(-2).every(call => call.packet.query === "日本語"));
  ui.panel.dispose();
});
test("signout/disconnect/disposal clear search and fence delayed results; search remains outside feed and hides in details", async () => {
  const ui = fixture(); ui.panel.setActive(true); await flush();
  assert.equal(ui.feed.children.includes(ui.form), false); assert.equal(ui.form.hidden, false);
  ui.feed.children.find(item => item.className === "private-chat-card").listeners.get("click")(); await flush();
  assert.equal(ui.form.hidden, true);
  ui.created.find(item => item.tag === "button" && item.textContent === "All chats").listeners.get("click")(); await flush();
  ui.hold(true); ui.type("secret words"); ui.enter();
  ui.panel.setAvailable(false); assert.equal(ui.input.value, ""); assert.equal(ui.form.hidden, true);
  for (const complete of ui.pending) complete(); await flush();
  assert.equal(ui.feed.children.some(item => item.className === "private-chat-card"), false);
  ui.hold(false); ui.panel.setAvailable(true); await flush(); ui.type("account query");
  ui.logout(); assert.equal(ui.input.value, ""); assert.equal(ui.tasks.size, 0); assert.equal(ui.form.hidden, true);
  ui.panel.dispose(); ui.type("late event"); assert.equal(ui.tasks.size, 0);
});
