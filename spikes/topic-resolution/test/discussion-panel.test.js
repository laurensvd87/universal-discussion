import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";
import { EN } from "../browser/locales/en.js";

function harness(messages) {
  const created = [];
  const document = { createElement(tag) {
    const item = { tag, children: [], attributes: {}, textContent: "", value: "", listeners: new Map(),
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attributes[key] = value; }, focus() { this.focused = true; },
      addEventListener(event, callback) { this.listeners.set(event, callback); },
      removeEventListener(event, callback) { if (this.listeners.get(event) === callback) this.listeners.delete(event); } };
    created.push(item); return item;
  } };
  const root = document.createElement("section");
  const panel = mountDiscussionPanel(document, root, { messages });
  const calls = [];
  const controller = new Proxy({ currentState: () => state(), begin: (...args) => { calls.push(["begin", ...args]); return true; } }, {
    get(object, key) { return object[key] ?? ((...args) => { calls.push([key, ...args]); return Promise.resolve(true); }); } });
  panel.bind(controller);
  return { created, root, panel, calls, byId: (id) => created.find((item) => item.id === id) };
}
function state(patch = {}) {
  return { phase: "ready", busy: false, error: null, actorId: "demo-alex", topicId: "topic-demo", sourceId: null,
    catalog: { model: { status: "fixture-only" }, actors: [{ id: "demo-alex", displayName: "Alex · synthetic" }],
      topics: [{ id: "topic-demo", title: "<script>hostile topic</script>" }], sources: [{ id: "source-demo", title: "Synthetic source" }] },
    discussion: { roots: [{ id: "root-1", rootId: null, state: "visible", authorId: "demo-alex", actorType: "human",
      body: "<img src=x onerror=alert(1)>\nplain text", edited: true, replies: [
        { id: "reply-deleted", state: "deleted", rootId: "root-1" },
      ] }] }, related: { results: [{ title: "<iframe>inert source</iframe>", url: "https://synthetic.example/", relationship: "related" }] },
    draft: { body: "", detached: false, mode: "root", targetId: null }, ...patch };
}
test("panel renders hostile service text inertly, actual distinct counts, fixture model labels", () => {
  const ui = harness();
  assert.ok(ui.created.some((item) => item.textContent === "<script>hostile topic</script>"));
  assert.ok(ui.created.some((item) => item.textContent === "<img src=x onerror=alert(1)>\nplain text"));
  assert.ok(ui.created.some((item) => item.textContent === "Human contributions: 1 · Agent contributions: 0"));
  assert.ok(ui.created.some((item) => item.textContent === EN.discussionModelFixture));
  assert.ok(ui.created.some((item) => item.textContent === EN.discussionDeleted));
  assert.equal(ui.created.some((item) => ["a", "img", "iframe", "script"].includes(item.tag)), false);
});
test("labels, form submission, password clearing, source choice and keyboard focus are wired", async () => {
  const ui = harness();
  for (const id of ["discussion-topic", "discussion-source", "discussion-actor", "discussion-body", "discussion-token"]) {
    assert.ok(ui.created.some((item) => item.tag === "label" && item.htmlFor === id));
  }
  const token = ui.byId("discussion-token"); token.value = "session-only-test-value";
  const pairForm = ui.created.find((item) => item.tag === "form" && item.children.includes(ui.byId("discussion-pair")));
  pairForm.listeners.get("submit")({ preventDefault() {} });
  assert.equal(token.value, ""); assert.equal(token.type, "password"); assert.equal(token.maxLength, 512);
  assert.deepEqual(ui.calls[0], ["pair", "session-only-test-value"]);
  const source = ui.byId("discussion-source"); source.value = "source-demo"; source.listeners.get("change")();
  assert.deepEqual(ui.calls[1], ["selectSource", "source-demo"]);
  ui.created.find((item) => item.attributes["data-action"] === "edit").listeners.get("click")();
  assert.equal(ui.byId("discussion-body").focused, true);
  assert.ok(ui.created.some((item) => item.attributes.role === "status"));
});
test("detached drafts, unavailable service, conflict, reset confirmation and busy writes are disabled", () => {
  const ui = harness();
  ui.panel.render(state({ draft: { body: "Retained", detached: true, mode: "root", targetId: null } }));
  assert.equal(ui.byId("discussion-submit").disabled, true); assert.equal(ui.byId("discussion-reattach").hidden, false);
  const confirmation = ui.byId("discussion-reset-confirmation"); confirmation.value = "RESET DEMO STATE";
  confirmation.listeners.get("input")(); assert.equal(ui.byId("discussion-reset").disabled, false);
  ui.panel.render(state({ busy: true }));
  assert.equal(ui.byId("discussion-body").disabled, true); assert.equal(ui.byId("discussion-reset").disabled, true);
  ui.panel.render(state({ phase: "error", error: "conflict", discussion: null, related: null }));
  assert.equal(ui.byId("discussion-create").disabled, true); assert.equal(ui.byId("discussion-reset").disabled, true);
  assert.ok(ui.created.some((item) => item.textContent === EN.discussionConflict));
  ui.panel.render(state({ phase: "disconnected", catalog: null, discussion: null, related: null }));
  assert.equal(ui.byId("discussion-topic").children.length, 1);
  assert.equal(ui.byId("discussion-create").disabled, true);
});
test("typing preserves contribution button focus; language fallback and disposal remove all handlers", () => {
  const ui = harness({ discussionHeading: "<b>translated inert heading</b>" });
  const edit = ui.created.find((item) => item.attributes["data-action"] === "edit"); edit.focus();
  ui.panel.render(state({ draft: { body: "Typed", detached: false, mode: "edit", targetId: "root-1" } }));
  assert.equal(edit.listeners.size, 1); assert.equal(edit.focused, true);
  assert.ok(ui.created.some((item) => item.textContent === EN.discussionScope));
  ui.byId("discussion-token").value = "test-token";
  ui.panel.dispose(); ui.panel.dispose();
  assert.equal(ui.root.children.length, 0); assert.equal(ui.byId("discussion-token").value, "");
  assert.equal(ui.created.some((item) => item.listeners.size > 0), false);
});

test("composer disabled during loading/choose-topic and latched writes disable create/reset", () => {
  const ui = harness();
  for (const phase of ["connecting", "loading", "choose-topic", "disconnected", "error"]) {
    ui.panel.render(state({ phase }));
    assert.equal(ui.byId("discussion-body").disabled, true);
    assert.equal(ui.byId("discussion-submit").disabled, true);
  }
  const confirmation = ui.byId("discussion-reset-confirmation"); confirmation.value = "RESET DEMO STATE";
  ui.panel.render(state({ needsFreshRead: true }));
  assert.equal(ui.byId("discussion-body").disabled, true);
  assert.equal(ui.byId("discussion-create").disabled, true);
  assert.equal(ui.byId("discussion-reset").disabled, true);
  confirmation.listeners.get("input")(); assert.equal(ui.byId("discussion-reset").disabled, true);
});

test("learned source UI labels provenance/partial inference and explicit correction/deletion confirmations", async () => {
  const ui = harness();
  const learned = state(); learned.sourceId = "learned-source";
  learned.catalog.topics[0].learned = true;
  learned.catalog.sources = [{ id: "learned-source", title: "Learned owned page", provenance: "owner-local-page-embedding/v1", topicId: "topic-demo" }];
  learned.related = { model: { status: "experimental-local" }, results: [] };
  ui.panel.render(learned);
  assert.equal(ui.byId("discussion-provenance").textContent, EN.discussionProvenanceLearned);
  assert.ok(ui.created.some((item) => item.textContent === EN.discussionModelLearned));
  assert.equal(ui.byId("discussion-correct").disabled, true);
  ui.byId("discussion-correction-confirm").checked = true; ui.byId("discussion-correction-confirm").listeners.get("change")();
  assert.equal(ui.byId("discussion-correct").disabled, false);
  ui.byId("discussion-correction-topic").value = "";
  await ui.byId("discussion-correct").listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["correctSource", null, "CONFIRM SOURCE TOPIC"]);
  const deletion = ui.byId("discussion-delete-confirmation"); deletion.value = "DELETE TOPIC AND DISCUSSION"; deletion.listeners.get("input")();
  assert.equal(ui.byId("discussion-delete").disabled, false);
  await ui.byId("discussion-delete").listeners.get("click")(); assert.deepEqual(ui.calls.at(-1), ["deleteLearnedTopic", "DELETE TOPIC AND DISCUSSION"]);
  const clearing = ui.byId("discussion-clear-confirmation"); clearing.value = "CLEAR LEARNED DATA"; clearing.listeners.get("input")();
  await ui.byId("discussion-clear").listeners.get("click")(); assert.deepEqual(ui.calls.at(-1), ["clearLearnedData", "CLEAR LEARNED DATA"]);
  ui.panel.render({ ...learned, needsFreshRead: true });
  assert.equal(ui.byId("discussion-forget").disabled, true); assert.equal(ui.byId("discussion-clear").disabled, true);
});

test("forgotten-source orphan learned Topic retains Delete/Clear controls without any learned Source", () => {
  const ui = harness();
  const orphan = state(); orphan.sourceId = null; orphan.catalog.sources = [];
  orphan.catalog.topics[0].learned = true;
  ui.panel.render(orphan);
  assert.equal(ui.byId("discussion-learned-controls").hidden, false);
  const deletion = ui.byId("discussion-delete-confirmation"); deletion.value = "DELETE TOPIC AND DISCUSSION"; deletion.listeners.get("input")();
  assert.equal(ui.byId("discussion-delete").disabled, false);
  assert.equal(ui.byId("discussion-forget").disabled, true);
  const clearing = ui.byId("discussion-clear-confirmation"); clearing.value = "CLEAR LEARNED DATA"; clearing.listeners.get("input")();
  assert.equal(ui.byId("discussion-clear").disabled, false);
  const fixture = state(); fixture.sourceId = "learned-source";
  fixture.catalog.sources = [{ id: "learned-source", provenance: "owner-local-page-embedding/v1", topicId: "topic-demo" }];
  ui.panel.render(fixture);
  assert.equal(ui.byId("discussion-delete").disabled, true);
  assert.equal(ui.byId("discussion-forget").disabled, false);
});

test("unchanged polling preserves Topic/Source/Actor/correction option nodes and open-dropdown value", () => {
  const ui = harness(); const options = new Map();
  for (const id of ["discussion-topic", "discussion-source", "discussion-actor", "discussion-correction-topic"]) {
    options.set(id, [...ui.byId(id).children]);
  }
  ui.byId("discussion-topic").value = "temporary-keyboard-highlight";
  ui.panel.render(state());
  for (const [id, children] of options) {
    assert.deepEqual(ui.byId(id).children, children);
    children.forEach((child, index) => assert.equal(ui.byId(id).children[index], child));
  }
  assert.equal(ui.byId("discussion-topic").value, "temporary-keyboard-highlight");
  const changed = state(); changed.catalog.topics.push({ id: "topic-new", title: "New topic" });
  ui.panel.render(changed); assert.notEqual(ui.byId("discussion-topic").children[0], options.get("discussion-topic")[0]);
});

test("source/Topic changes clear correction/destructive intent; same-context polling preserves it", () => {
  const ui = harness(); const learned = state(); learned.sourceId = "learned-source";
  learned.catalog.topics[0].learned = true;
  learned.catalog.sources = [{ id: "learned-source", provenance: "owner-local-page-embedding/v1", topicId: "topic-demo" }];
  ui.panel.render(learned);
  const target = ui.byId("discussion-correction-topic"); target.value = "topic-demo";
  const correct = ui.byId("discussion-correction-confirm"); correct.checked = true;
  const deletion = ui.byId("discussion-delete-confirmation"); deletion.value = "DELETE TOPIC AND DISCUSSION";
  const clearing = ui.byId("discussion-clear-confirmation"); clearing.value = "CLEAR LEARNED DATA";
  const reset = ui.byId("discussion-reset-confirmation"); reset.value = "RESET DEMO STATE";
  ui.panel.render({ ...learned });
  assert.equal(target.value, "topic-demo"); assert.equal(correct.checked, true);
  assert.equal(deletion.value, "DELETE TOPIC AND DISCUSSION"); assert.equal(clearing.value, "CLEAR LEARNED DATA");
  assert.equal(reset.value, "RESET DEMO STATE");
  ui.panel.render({ ...learned, sourceId: "new-learned-source" });
  assert.equal(target.value, ""); assert.equal(correct.checked, false); assert.equal(deletion.value, "");
  assert.equal(clearing.value, ""); assert.equal(reset.value, "");
  deletion.value = "DELETE TOPIC AND DISCUSSION"; correct.checked = true;
  ui.panel.render({ ...learned, sourceId: "new-learned-source", topicId: "new-topic" });
  assert.equal(deletion.value, ""); assert.equal(correct.checked, false);
  assert.equal(ui.byId("discussion-delete").disabled, true);
});
