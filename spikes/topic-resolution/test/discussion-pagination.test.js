import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";

const descendants = item => [item, ...item.children.flatMap(descendants)];
const post = (id, parent = null) => ({ id, rootId: parent ? "root-0" : null, replyToId: parent,
  authorId: "human", actorType: "human", state: "visible", body: id, replies: [] });
function fixture(roots) {
  const version = { generation: "generation", revision: 1 };
  return { phase: "ready", busy: false, needsFreshRead: false, error: null,
    actorId: "human", sourceId: null, topicId: "topic", topicViewMode: "classic",
    catalog: { version, actors: [{ id: "human", displayName: "Human" }],
      topics: [{ id: "topic", title: "Topic" }], sources: [], model: { status: "fixture-only" } },
    discussion: { discussionId: "discussion", version, roots }, related: { results: [] },
    draft: { mode: "root", body: "", detached: false, targetId: null } };
}
function harness(initial) {
  const document = { body: {}, activeElement: null, querySelector: () => null,
    createElement(tag) {
      const item = { tag, children: [], attributes: {}, listeners: new Map(), style: {}, value: "", textContent: "",
        get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null; },
        contains(target) { return descendants(this).includes(target); },
        append(...items) { for (const child of items) { detach(child); child.parentElement = this; this.children.push(child); } },
        replaceChildren(...items) { for (const child of [...this.children]) detach(child); this.append(...items); },
        insertBefore(child, sibling) { detach(child); child.parentElement = this;
          this.children.splice(sibling ? this.children.indexOf(sibling) : this.children.length, 0, child); },
        setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key] ?? null; },
        removeAttribute(key) { delete this.attributes[key]; },
        querySelectorAll() { return descendants(this); },
        closest(selector) { let current = this; while (current) { if (selector === "[inert]" && current.inert) return current;
          current = current.parentElement; } return null; },
        addEventListener(key, callback) { this.listeners.set(key, callback); },
        removeEventListener(key, callback) { if (this.listeners.get(key) === callback) this.listeners.delete(key); },
        focus() { if (!this.disabled && !this.closest("[inert]")) document.activeElement = this; },
        scrollIntoView() {}, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
      return item;
    } };
  function detach(item) { if (!item.parentElement) return;
    if (item.contains(document.activeElement)) document.activeElement = document.body;
    item.parentElement.children = item.parentElement.children.filter(child => child !== item); item.parentElement = null; }
  const root = document.createElement("section");
  const panel = mountDiscussionPanel(document, root, { messages: {
    paginationPrevious: "Previous", paginationNext: "Next", paginationPage: "Page {page}" } });
  panel.bind({ currentState: () => initial });
  const all = () => descendants(root);
  const pager = key => all().find(item => item.attributes["data-pagination-key"] === key);
  const click = (key, direction) => {
    const action = pager(key)?.children.find(item => item.attributes["data-page-direction"] === direction);
    assert.ok(action); action.listeners.get("click")(); return action;
  };
  return { root, panel, document, all, pager, click,
    roots: () => all().filter(item => item.attributes["data-thread-root-id"]),
    posts: () => all().filter(item => item.attributes["data-post-id"]),
    byId: id => all().find(item => item.id === id) };
}

test("Discussion pages 45 chronological roots, keeps page across revisions/loading, resets source and rejects stale controls", () => {
  const state = fixture(Array.from({ length: 45 }, (_, index) => post(`root-${index}`)));
  const ui = harness(state);
  assert.equal(ui.roots().length, 20);
  assert.equal(ui.pager("roots").children[0].disabled, true);
  ui.click("roots", "next");
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-20");
  ui.panel.render({ ...state, discussion: { ...state.discussion, version: { ...state.discussion.version, revision: 2 } } });
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-20");
  ui.panel.render({ ...state, phase: "loading", discussion: null }); ui.panel.render(state);
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-20");
  ui.click("roots", "next"); assert.equal(ui.roots().length, 5);
  assert.equal(ui.pager("roots").children.at(-1).disabled, true);
  const old = ui.click("roots", "previous");
  ui.panel.render({ ...state, sourceId: "new-source" });
  old.listeners.get("click")?.();
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-0");
  ui.panel.render(state); ui.click("roots", "next");
  ui.panel.render({ ...state, catalog: { ...state.catalog, version: { generation: "replacement", revision: 1 } },
    discussion: { ...state.discussion, version: { generation: "replacement", revision: 1 } } });
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-0");
  assert.equal(ui.byId("discussion-composer").parentElement.id, "discussion-root-dock");
});

test("45 same-parent replies page independently with nested lineage and manual expansion preserved", () => {
  const root = post("root-0");
  root.replies = Array.from({ length: 45 }, (_, index) => post(`reply-${index}`, root.id));
  root.replies.push(post("nested", "reply-23"));
  const state = fixture([root]), ui = harness(state);
  assert.equal(ui.posts().length, 21);
  ui.click("children:root-0:root-0", "next");
  assert.equal(ui.posts().length, 22);
  const nested = ui.posts().find(item => item.attributes["data-post-id"] === "nested");
  assert.equal(nested.parentElement.parentElement.parentElement.parentElement.children[0].attributes["data-post-id"], "reply-23");
  ui.click("children:root-0:root-0", "next"); assert.equal(ui.posts().length, 6);
  ui.click("children:root-0:root-0", "previous");
  assert.ok(ui.posts().some(item => item.attributes["data-post-id"] === "reply-23"));
});

test("deleted leaf roots/replies do not consume a page while deleted ancestors remain attached", () => {
  const roots = Array.from({ length: 45 }, (_, index) => post(`root-${index}`));
  roots[0].state = "deleted";
  roots[1].state = "deleted"; roots[1].replies = [post("survivor", roots[1].id)];
  const ui = harness(fixture(roots));
  assert.equal(ui.roots().length, 20);
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-1");
  assert.ok(ui.posts().some(item => item.attributes["data-post-id"] === "survivor"));
});

test("Related discussion windows hold 20 roots across topic groups with read-only cards", () => {
  const state = fixture([]);
  state.relatedDiscussions = Array.from({ length: 3 }, (_, index) => ({ topicId: `related-${index}`,
    title: `Related ${index}`, rootCount: 17, roots: Array.from({ length: 17 }, (_, rootIndex) =>
      ({ ...post(`related-${index}-${rootIndex}`), replyCount: 0 })) }));
  const ui = harness(state);
  const cards = () => ui.all().filter(item => item.className === "related-discussion-card");
  assert.equal(cards().length, 20);
  assert.equal(cards().some(item => descendants(item).some(child => child.attributes["data-action"])), false);
  ui.click("related", "next"); assert.equal(cards().length, 20);
  const group = ui.all().find(item => item.attributes["data-related-topic-id"] === "related-1");
  group.open = true;
  ui.click("related", "next"); assert.equal(cards().length, 11);
  ui.click("related", "previous"); assert.equal(cards().length, 20);
  const restored = ui.all().find(item => item.attributes["data-related-topic-id"] === "related-1");
  assert.equal(restored.open, true);
  restored.open = false;
  ui.panel.render({ ...state, relatedDiscussions: state.relatedDiscussions.map(topic => ({ ...topic, title: topic.title + " revised" })) });
  assert.equal(ui.all().find(item => item.attributes["data-related-topic-id"] === "related-1").open, false);
});

test("empty Discussion omits retained page links and their pager without changing selection", () => {
  const state = fixture([]);
  state.sourceId = "source-current";
  state.catalog.sources = [{ id: state.sourceId, topicId: "topic", title: "Current", url: "https://example.org/current" },
    ...Array.from({ length: 45 }, (_, index) => ({ id: `source-${index}`, topicId: "topic",
      title: `Source ${index}`, url: `https://example.org/page-${index}` }))];
  const ui = harness(state);
  const links = () => ui.all().filter(item => item.className === "related-page-card");
  assert.equal(links().length, 0);assert.equal(ui.pager("pages"),undefined);
  ui.panel.render({ ...state, phase: "loading", discussion: null }); ui.panel.render(state);
  assert.equal(links().length, 0);assert.equal(state.sourceId,"source-current");
  ui.panel.render({ ...state, sourceId: "source-0" });
  assert.equal(links().length, 0);assert.equal(ui.pager("pages"),undefined);
});

test("accepted root/reply cues select their pages and open ancestry before the one-time focus", () => {
  const roots = Array.from({ length: 45 }, (_, index) => post(`root-${index}`));
  roots[44].replies = Array.from({ length: 45 }, (_, index) => ({ ...post(`reply-${index}`, "root-44"), rootId: "root-44" }));
  const state = fixture(roots), ui = harness(state);
  const cue = id => ({ id, rootId: "root-44", discussionId: "discussion", topicId: "topic", actorId: "human", sourceId: null });
  ui.panel.render({ ...state, createdPost: cue("root-44") });
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-40");
  assert.equal(ui.document.activeElement.attributes["data-post-id"], "root-44");
  ui.panel.render({ ...state, createdPost: cue("reply-44") });
  assert.equal(ui.document.activeElement.attributes["data-post-id"], "reply-44");
  assert.equal(ui.document.activeElement.closest("[inert]"), null);
  assert.equal(ui.posts().filter(item => item.className.includes("discussion-reply-post")).length, 5);
  ui.click("roots", "previous");
  ui.panel.render({ ...state, createdPost: cue("reply-44") });
  assert.equal(ui.roots()[0].attributes["data-thread-root-id"], "root-20");
});

test("selecting an off-page reply keeps the one composer, text selection and IME through refresh", () => {
  const roots = Array.from({ length: 45 }, (_, index) => post(`root-${index}`));
  roots[44].replies = Array.from({ length: 45 }, (_, index) => ({ ...post(`reply-${index}`, "root-44"), rootId: "root-44" }));
  const state = fixture(roots), ui = harness(state);
  const selected = { ...state, draft: { mode: "reply", targetId: "reply-44", detached: false, body: "Typed text" } };
  ui.panel.render(selected);
  assert.ok(ui.posts().some(item => item.attributes["data-post-id"] === "reply-44"));
  const body = ui.byId("discussion-body"), composer = ui.byId("discussion-composer");
  body.focus(); body.setSelectionRange(2, 4);
  ui.panel.render({ ...selected, catalog: { ...state.catalog, version: { ...state.catalog.version, revision: 2 } },
    discussion: { ...state.discussion, version: { ...state.discussion.version, revision: 2 } } });
  assert.equal(ui.byId("discussion-composer"), composer);
  assert.equal(ui.document.activeElement, body);
  assert.deepEqual([body.selectionStart, body.selectionEnd], [2, 4]);
  body.listeners.get("compositionstart")();
  const oldCard = ui.posts().find(item => item.attributes["data-post-id"] === "reply-44");
  ui.panel.render({ ...selected, catalog: { ...state.catalog, version: { ...state.catalog.version, revision: 3 } },
    discussion: { ...state.discussion, version: { ...state.discussion.version, revision: 3 } } });
  assert.equal(ui.posts().find(item => item.attributes["data-post-id"] === "reply-44"), oldCard);
  ui.panel.render({ ...selected, draft: { ...selected.draft, detached: true }, sourceId: "changed" });
  assert.equal(composer.parentElement.id, "discussion-root-dock");
  assert.equal(body.value, "Typed text");
});
