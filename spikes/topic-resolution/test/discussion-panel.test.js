import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";
import { EN } from "../browser/locales/en.js";
import { readFileSync } from "node:fs";

function harness(messages, workspace) {
  const created = [];
  const document = { querySelector: (selector) => selector === "#insight-workspace" ? workspace : null, createElement(tag) {
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
test("User insight shortcut opens the compact workspace near the Topic", () => {
  const actions = [];
  const workspace = { open: false, scrollIntoView: (options) => actions.push(["scroll", options]),
    querySelector: (selector) => selector === "summary" ? { focus: (options) => actions.push(["focus", options]) } : null };
  const ui = harness(undefined, workspace);
  ui.panel.render(state());
  const shortcut = ui.byId("discussion-ai-insights");
  assert.equal(shortcut.disabled, false);
  shortcut.listeners.get("click")();
  assert.equal(workspace.open, true);
  assert.deepEqual(actions, [["scroll", { block: "start", behavior: "smooth" }], ["focus", { preventScroll: true }]]);
});
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
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
test("English disclosures describe adaptive regrouping, source links and the bounded Clear scope", () => {
  assert.match(EN.matchingPartial, /0\.90 and 0\.94/u);
  assert.match(EN.matchingPartial, /move whole Source-anchored conversations with their replies/u);
  assert.match(EN.matchingPartial, /Manual Topic and legacy threads stay pinned/u);
  assert.match(EN.discussionCorrectionIntro, /move posts started on it and all their replies/u);
  assert.match(EN.discussionCorrectionIntro, /removes its links from all posts but preserves comments/u);
  assert.match(EN.discussionClearLabel, /even if moved to manual or fixture Topics/u);
  assert.match(EN.discussionOriginDisclosure, /local demo/u);
  assert.doesNotMatch(EN.discussionOriginDisclosure, /publicly/u);
  assert.doesNotMatch(EN.discussionCorrectConfirm, /does not move comments/u);
  assert.doesNotMatch(EN.matchingPartial, /never merges/u);
});

test("each visible post links its own validated source with safe new-tab native navigation", () => {
  const ui = harness(); const current = state();
  const root = current.discussion.roots[0];
  root.origin = { sourceId: "source-a", url: "https://example.com/article-a", title: "<img src=x> Root source" };
  root.regrouped = true;
  root.replies.push({ id: "reply-visible", rootId: root.id, state: "visible", authorId: "demo-alex", actorType: "human", body: "Reply", edited: false,
    origin: { sourceId: "source-b", url: "https://example.org/article-b", title: "Reply source" } });
  ui.panel.render(current);
  const links = descendants(ui.root).filter((item) => item.tag === "a");
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((item) => item.href), [root.origin.url, root.replies[1].origin.url]);
  for (const link of links) {
    assert.equal(link.target, "_blank"); assert.equal(link.rel, "noopener noreferrer"); assert.equal(link.referrerPolicy, "no-referrer");
    assert.equal(link.textContent, "↗"); assert.equal(link.title, link.attributes["aria-label"]);
    assert.ok(link.title.includes(link.href)); assert.equal(link.listeners.size, 0); link.focus(); assert.equal(link.focused, true);
  }
  assert.ok(links[0].title.includes("<img src=x> Root source"));
  assert.ok(descendants(ui.root).some((item) => item.textContent === EN.discussionRegrouped));
  assert.equal(descendants(ui.root).some((item) => ["img", "script", "iframe"].includes(item.tag)), false);
  assert.deepEqual(ui.calls, []);
  assert.match(readFileSync(new URL("../browser/chromium/popup.css", import.meta.url), "utf8"), /\.discussion-source-link:focus-visible\s*\{/u);
});

test("legacy, forgotten, deleted and malicious origin projections never leave a clickable icon", () => {
  const ui = harness(); const current = state(); const root = current.discussion.roots[0];
  root.origin = { sourceId: "source-a", url: "https://example.com/article", title: "Source" };
  ui.panel.render(current); assert.equal(descendants(ui.root).filter((item) => item.tag === "a").length, 1);
  delete root.origin; ui.panel.render(current); assert.equal(descendants(ui.root).filter((item) => item.tag === "a").length, 0);
  for (const url of ["javascript:alert(1)", "https://127.0.0.1/article", "https://example.com/account", "https://example.com/article?token=secret"]) {
    root.origin = { sourceId: "source-a", url, title: "Unsafe" }; ui.panel.render(current);
    assert.equal(descendants(ui.root).filter((item) => item.tag === "a").length, 0);
  }
  root.state = "deleted"; root.origin = { sourceId: "source-a", url: "https://example.com/article", title: "Source" };
  ui.panel.render(current); assert.equal(descendants(ui.root).filter((item) => item.tag === "a").length, 0);
});

test("composer discloses deliberate selected-source association and honest manual Topic absence", () => {
  const ui = harness(); const current = state({ sourceId: "source-demo", selection: "manual" });
  current.catalog.sources[0].topicId = current.topicId;
  ui.panel.render(current);
  assert.equal(ui.byId("discussion-origin-disclosure").textContent, EN.discussionOriginDisclosure.replace("{title}", "Synthetic source"));
  current.sourceId = null; ui.panel.render(current); assert.equal(ui.byId("discussion-origin-disclosure").textContent, EN.discussionOriginNone);
  current.draft.mode = "edit"; ui.panel.render(current); assert.equal(ui.byId("discussion-origin-disclosure").textContent, EN.discussionOriginEdit);
});
test("panel renders hostile service text inertly, actual distinct counts, fixture model labels", () => {
  const ui = harness();
  assert.ok(ui.created.some((item) => item.textContent === "<script>hostile topic</script>"));
  assert.ok(ui.created.some((item) => item.textContent === "<img src=x onerror=alert(1)>\nplain text"));
  assert.ok(ui.created.some((item) => item.textContent === "1 human · 0 AI"));
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

test("display-mode toggles preserve draft/control nodes and actions while hiding opaque composer IDs", () => {
  const ui = harness();
  const snapshot = state({ draft: { body: "Unsent words", detached: false, mode: "reply", targetId: "root-1" } });
  ui.panel.render(snapshot);
  const body = ui.byId("discussion-body"), topic = ui.byId("discussion-topic");
  const options = [...topic.children]; const calls = [...ui.calls];
  assert.equal(body.value, "Unsent words");
  assert.ok(ui.created.some((item) => item.textContent === EN.uiReplyMode));
  ui.panel.setMode("developer");
  assert.ok(ui.created.some((item) => item.textContent === "Reply to root-1"));
  ui.panel.setMode("user");
  assert.equal(ui.byId("discussion-connection-settings").open, false);
  assert.equal(ui.byId("discussion-advanced").open, false);
  assert.equal(ui.byId("discussion-body"), body); assert.equal(body.value, "Unsent words");
  options.forEach((option, index) => assert.equal(topic.children[index], option));
  assert.deepEqual(ui.calls, calls);
  assert.equal(ui.byId("selected-topic-title").textContent, "<script>hostile topic</script>");
  assert.match(ui.byId("discussion-demo-identity").textContent, /Demo:.*not signed in/u);
  ui.panel.render({ ...snapshot, phase: "error", error: "unavailable" });
  assert.equal(ui.byId("selected-topic-title").textContent, EN.uiTopicUnavailable);
  assert.equal(ui.byId("discussion-connection-settings").open, true);
});

test("User copy stays concise while Developer labels and action IDs remain intact", () => {
  const ui = harness();
  ui.panel.render(state());
  assert.equal(ui.byId("discussion-submit").textContent, EN.uiPostComment);
  assert.equal(ui.byId("discussion-discard").textContent, EN.uiDiscard);
  assert.equal(ui.byId("discussion-counts").textContent, "1 human · 0 AI");
  assert.equal(ui.byId("discussion-status").hidden, true);
  assert.equal(ui.byId("discussion-advanced").children[0].textContent, EN.uiAdvanced);
  ui.panel.render(state({ draft: { body: "Edit", detached: false, mode: "edit", targetId: "root-1" } }));
  assert.equal(ui.byId("discussion-submit").textContent, EN.uiSaveChanges);
  ui.panel.render(state({ phase: "loading", error: null }));
  assert.equal(ui.byId("discussion-status").hidden, false);
  ui.panel.render(state({ phase: "error", error: "unavailable" }));
  assert.equal(ui.byId("discussion-status").hidden, false);
  ui.panel.setMode("developer");
  assert.equal(ui.byId("discussion-submit").textContent, EN.discussionSubmit);
  assert.equal(ui.byId("discussion-discard").textContent, EN.discussionDiscard);
  assert.equal(ui.byId("discussion-counts").textContent, "Human contributions: 1 · Agent contributions: 0");
  assert.equal(ui.byId("discussion-advanced").children[0].textContent, EN.uiAdvancedDeveloper);
});

test("User details stay compact through transient choose-topic; connection collapses on success but permits inspection", () => {
  const ui = harness();
  const connection = ui.byId("discussion-connection-settings");
  const advanced = ui.byId("discussion-advanced");
  ui.panel.setMode("user");
  ui.panel.render(state({ phase: "disconnected", catalog: null, discussion: null }));
  assert.equal(connection.open, true);
  ui.panel.render(state({ phase: "connecting", catalog: null, discussion: null }));
  ui.panel.render(state({ phase: "choose-topic", topicId: null, discussion: null }));
  assert.equal(connection.open, false); assert.equal(advanced.open, false);
  connection.open = true;
  ui.panel.render(state());
  assert.equal(connection.open, true);
  ui.panel.render(state({ draft: { body: "Draft survives", detached: false, mode: "root", targetId: null } }));
  assert.equal(connection.open, true);
  ui.byId("discussion-new-title").value = "Unsent new title";
  ui.byId("discussion-token").value = "unsubmitted local value";
  ui.panel.setMode("developer");
  assert.equal(connection.open, true); assert.equal(advanced.open, true);
  ui.panel.render(state({ phase: "choose-topic", draft: { body: "Draft survives", detached: false, mode: "root", targetId: null } }));
  assert.equal(connection.open, true); assert.equal(advanced.open, true);
  ui.panel.setMode("user");
  assert.equal(connection.open, false); assert.equal(advanced.open, false);
  assert.equal(ui.byId("discussion-body").value, "Draft survives");
  assert.equal(ui.byId("discussion-new-title").value, "Unsent new title");
  assert.equal(ui.byId("discussion-token").value, "unsubmitted local value");
});

test("unpaired User view hides redundant buttons/empty composer while retained drafts and error retry remain reachable", () => {
  const ui = harness();
  const composer = ui.created.find((item) => item.tag === "form" && item.children.includes(ui.byId("discussion-body")));
  const disconnected = state({ phase: "disconnected", catalog: null, discussion: null, related: null });
  ui.panel.render(disconnected);
  assert.equal(ui.byId("discussion-disconnect").hidden, true);
  assert.equal(ui.byId("discussion-reload").hidden, true);
  assert.equal(composer.hidden, true);
  assert.equal(ui.byId("discussion-connection-settings").open, true);
  ui.panel.render({ ...disconnected, draft: { body: "Retained disconnected draft", detached: true, mode: "root", targetId: null } });
  assert.equal(composer.hidden, false);
  assert.equal(ui.byId("discussion-body").value, "Retained disconnected draft");
  ui.panel.render({ ...disconnected, phase: "error", error: "unavailable" });
  assert.equal(ui.byId("discussion-reload").hidden, false);
  ui.panel.render(disconnected); ui.panel.setMode("developer");
  assert.equal(ui.byId("discussion-disconnect").hidden, false);
  assert.equal(ui.byId("discussion-reload").hidden, false);
  assert.equal(composer.hidden, false);
});
