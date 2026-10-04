import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";
import { EN } from "../browser/locales/en.js";
import { readFileSync } from "node:fs";

function harness(messages, workspace, insightsTab, settingsButton, accountDetails, controllerOverrides = {}) {
  const created = [];
  const document = { querySelector: (selector) => selector === "#insight-workspace" ? workspace
    : selector === "#app-tab-insights" ? insightsTab : selector === "#app-settings-button" ? settingsButton
      : selector === "#insight-account-details" ? accountDetails
        : selector === "#insight-account-details > summary" ? accountDetails?.summary : null, createElement(tag) {
    const item = { tag, children: [], attributes: {}, textContent: "", value: "", listeners: new Map(),
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      insertBefore(item, sibling) {
        this.children = this.children.filter((child) => child !== item);
        if (sibling == null) { this.children.push(item); return; }
        const index = this.children.indexOf(sibling);
        assert.notEqual(index, -1);
        this.children.splice(index, 0, item);
      },
      setAttribute(key, value) { this.attributes[key] = value; }, focus() { this.focused = true; },
      addEventListener(event, callback) { this.listeners.set(event, callback); },
      removeEventListener(event, callback) { if (this.listeners.get(event) === callback) this.listeners.delete(event); } };
    created.push(item); return item;
  } };
  const root = document.createElement("section");
  const panel = mountDiscussionPanel(document, root, { messages });
  const calls = [];
  const controller = new Proxy({ currentState: () => state(), begin: (...args) => { calls.push(["begin", ...args]); return true; },
    ...controllerOverrides }, {
    get(object, key) { return object[key] ?? ((...args) => { calls.push([key, ...args]); return Promise.resolve(true); }); } });
  panel.bind(controller);
  return { created, root, panel, calls, byId: (id) => created.find((item) => item.id === id) };
}
test("User insight action lives in the composer and starts one automatic private request", () => {
  const actions = [];
  const ui = harness();
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "idle" } }),
    createInsights: (options) => { actions.push(options); return Promise.resolve(true); } });
  ui.panel.render(state());
  const shortcut = ui.byId("discussion-ai-insights");
  const composer = ui.byId("discussion-composer");
  assert.equal(shortcut.type, "button");
  assert.ok(composer.children.some((item) => item.children?.includes(shortcut)));
  assert.equal(shortcut.disabled, false);
  shortcut.listeners.get("click")();
  assert.deepEqual(actions, [{ automatic: true }]);
  ui.panel.renderInsightState({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "generating" } });
  assert.equal(shortcut.disabled, true);
  assert.equal(shortcut.attributes["aria-busy"], "true");
  assert.equal(ui.byId("discussion-insight-activity").textContent, "Generating insight…");
  ui.panel.renderInsightState({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "resuming" } });
  assert.equal(ui.byId("discussion-insight-activity").textContent, "Resuming insight…");
  ui.panel.renderInsightState({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "generated", result: { body: "Message" } } });
  assert.equal(shortcut.hidden, true);
  assert.equal(ui.byId("discussion-insight-activity").textContent, "Insight ready. Review it below before sharing.");
  shortcut.listeners.get("click")();
  assert.equal(actions.length, 1);
});
test("User insight action opens account settings when ChatGPT is not ready", () => {
  const actions = [];
  const account = { open: false, summary: { focus: (options) => actions.push(["focus", options]) } };
  const ui = harness(undefined, null, null, { click: () => actions.push(["settings"]) }, account);
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: false, model: "", status: "idle" } }),
    createInsights: () => { actions.push(["create"]); } });
  ui.byId("discussion-ai-insights").listeners.get("click")();
  assert.equal(account.open, true);
  assert.deepEqual(actions, [["settings"], ["focus", { preventScroll: true }]]);
});
test("Developer insight action still opens detailed workspace", () => {
  const actions = [];
  const workspace = { open: false, scrollIntoView: () => actions.push("scroll"),
    querySelector: () => ({ focus: () => actions.push("focus") }) };
  const ui = harness(undefined, workspace);
  ui.panel.setMode("developer");
  ui.panel.bindInsight({ currentState: () => ({ ai: { status: "idle" } }) });
  ui.byId("discussion-ai-insights").listeners.get("click")();
  assert.equal(workspace.open, true);
  assert.deepEqual(actions, ["scroll", "focus"]);
});
test("no-topic User view shows no empty composer or Create shortcut, while drafts remain recoverable", () => {
  const ui = harness();
  const composer = ui.root.children.find((item) => item.tag === "form" && item.children.some((child) => child.id === "discussion-body"));
  const shortcut = ui.byId("discussion-ai-insights");
  const discard = ui.byId("discussion-discard");
  const noTopic = state({ phase: "choose-topic", topicId: null, discussion: null });
  ui.panel.render(noTopic);
  assert.equal(composer.hidden, true);
  assert.equal(shortcut.hidden, true);
  assert.equal(discard.hidden, true);
  ui.panel.render(state());
  assert.equal(composer.hidden, false);
  assert.equal(shortcut.hidden, false);
  assert.equal(discard.hidden, true);
  ui.panel.render(state({ phase: "choose-topic", topicId: null, discussion: null,
    draft: { body: "Keep this draft", detached: true, mode: "root", targetId: null } }));
  assert.equal(composer.hidden, false);
  assert.equal(discard.hidden, false);
  ui.panel.setMode("developer");
  assert.equal(composer.hidden, false);
  assert.equal(discard.hidden, false);
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
test("connected settings follow the composer in User DOM order and return before content when disconnected", () => {
  const ui = harness();
  const settings = ui.byId("discussion-connection-settings");
  const counts = ui.byId("discussion-counts");
  const composer = ui.root.children.find((item) => item.tag === "form" && item.children.some((child) => child.id === "discussion-body"));
  assert.ok(ui.root.children.indexOf(settings) > ui.root.children.indexOf(composer));
  const sameChildren = [...ui.root.children];
  ui.panel.render(state());
  assert.deepEqual(ui.root.children, sameChildren);
  ui.panel.render(state({ phase: "disconnected", catalog: null, discussion: null, related: null }));
  assert.ok(ui.root.children.indexOf(settings) < ui.root.children.indexOf(counts));
});
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
test("only AI-labelled posts render validated inline source icons", () => {
  const ui = harness();
  const marker = "A claim [↗](https://example.org/article) <img src=x>";
  ui.panel.render(state({ discussion: { roots: [
    { id: "ai-root", rootId: null, state: "visible", authorId: "demo-imported-ai", actorType: "agent",
      insight: { kind: "manual-import", operatorId: "demo-alex" }, body: marker, edited: false, replies: [] },
    { id: "human-root", rootId: null, state: "visible", authorId: "demo-alex", actorType: "human",
      body: marker, edited: false, replies: [] },
  ] } }));
  const cards = descendants(ui.root).filter((item) => item.tag === "article" && item.children.some((child) => child.className === "discussion-body"));
  assert.equal(cards.length, 2);
  const aiBody = cards[0].children.find((item) => item.className === "discussion-body");
  const humanBody = cards[1].children.find((item) => item.className === "discussion-body");
  const links = descendants(aiBody).filter((item) => item.tag === "a");
  assert.equal(links.length, 1);
  assert.equal(links[0].href, "https://example.org/article");
  assert.equal(links[0].rel, "noopener noreferrer");
  assert.equal(aiBody.children[2].textContent, " <img src=x>");
  assert.equal(humanBody.textContent, marker);
  assert.equal(descendants(humanBody).some((item) => item.tag === "a"), false);
});
test("owned robot post can be withdrawn but never edited; withdrawn root retains replies", () => {
  const ui = harness();
  const agent = { id: "ai-root", rootId: null, state: "visible", authorId: "demo-imported-ai", actorType: "agent",
    insight: { kind: "manual-import", operatorId: "demo-alex" }, body: "Answer", edited: false,
    replies: [{ id: "human-reply", rootId: "ai-root", state: "visible", authorId: "demo-alex", actorType: "human", body: "Question" }] };
  ui.panel.render(state({ discussion: { roots: [agent] } }));
  const card = descendants(ui.root).find((item) => item.tag === "article" && item.children.some((child) => child.className === "discussion-body"));
  const actions = card.children.filter((item) => item.tag === "button").map((item) => item.attributes["data-action"]);
  assert.deepEqual(actions, ["reply", "withdraw"]);
  card.children.find((item) => item.attributes["data-action"] === "withdraw").listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["withdraw", "ai-root"]);
  ui.panel.render(state({ discussion: { roots: [{ id: "ai-root", rootId: null, state: "deleted", replies: agent.replies }] } }));
  assert.ok(descendants(ui.root).some((item) => item.textContent === "Deleted by user"));
  assert.ok(descendants(ui.root).some((item) => item.textContent === "Question"));
});
test("own published question under a generated robot opener offers one-click private follow-up", () => {
  const navigation = [];
  const ui = harness(undefined, null, { click: () => navigation.push("insights") });
  const followups = [];
  ui.panel.bindInsight({ createFollowup: (id) => { followups.push(id); return Promise.resolve(true); } });
  const root = { id: "robot-root", rootId: null, state: "visible", authorId: "demo-imported-ai",
    actorType: "agent", insight: { kind: "generated", operatorId: "demo-alex" }, body: "An opener",
    replies: [
      { id: "own-question", rootId: "robot-root", replyToId: "robot-root", state: "visible", actorType: "human",
        authorId: "demo-alex", body: "Why?" },
      { id: "other-question", rootId: "robot-root", replyToId: "robot-root", state: "visible", actorType: "human",
        authorId: "demo-blair", body: "How?" },
    ] };
  ui.panel.render(state({ discussion: { roots: [root] } }));
  const actions = descendants(ui.root).filter((item) => item.attributes["data-action"] === "getinsights");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].attributes["data-contribution-id"], "own-question");
  assert.equal(actions[0].textContent, "Get insights");
  actions[0].listeners.get("click")();
  assert.deepEqual(navigation, []);
  assert.deepEqual(followups, ["own-question"]);
});
test("manual import, non-reply and withdrawn questions cannot initiate a robot follow-up", () => {
  const ui = harness();
  const directReply = { id: "question", rootId: "robot-root", replyToId: "robot-root", state: "visible", actorType: "human",
    authorId: "demo-alex", body: "Why?" };
  const root = { id: "robot-root", rootId: null, state: "visible", authorId: "demo-imported-ai",
    actorType: "agent", insight: { kind: "manual-import", operatorId: "demo-alex" }, body: "Opener",
    replies: [directReply] };
  for (const mutation of [
    () => {},
    () => { root.insight.kind = "generated"; directReply.state = "deleted"; },
    () => { directReply.state = "visible"; directReply.replyToId = "other-reply"; },
  ]) {
    mutation(); ui.panel.render(state({ discussion: { roots: [root] } }));
    assert.equal(descendants(ui.root).filter((item) => item.attributes["data-action"] === "getinsights").length, 0);
  }
});
test("User related pages are a count disclosure; native open state survives polling and resets on mode switch", () => {
  const ui = harness();
  const details = ui.byId("discussion-related");
  const related = state({ related: { results: Array.from({ length: 4 }, (_, index) => ({
    title: `Synthetic page ${index + 1}`, url: `https://example.com/${index + 1}`, relationship: "related",
  })) } });
  ui.panel.render(related);
  assert.equal(details.hidden, false);
  assert.equal(details.children[0].textContent, "Related pages (4)");
  details.open = true;
  ui.panel.render(related);
  assert.equal(details.open, true);
  ui.panel.setMode("developer");
  assert.equal(details.open, true);
  ui.panel.setMode("user");
  assert.equal(details.open, false);
  ui.panel.render(state({ related: { results: [] }, discussion: { roots: [] } }));
  assert.equal(details.hidden, true);
  assert.equal(ui.byId("discussion-counts").hidden, true);
  assert.equal(ui.byId("discussion-counts").textContent, "0 human · 0 AI");
  assert.ok(descendants(ui.root).some((item) => item.textContent === EN.uiDiscussionEmpty));
});
test("only registered synthetic actors get compact User names; full names stay available", () => {
  const current = state();
  current.catalog.actors.push({ id: "demo-blair", displayName: "Blair · synthetic" },
    { id: "owner-other", displayName: "Other · synthetic" });
  current.discussion.roots[0].authorId = "demo-blair";
  const ui = harness(); ui.panel.render(current);
  const author = descendants(ui.root).find((item) => item.title === "Blair · synthetic");
  assert.equal(author.textContent, "Blair");
  assert.equal(ui.byId("discussion-demo-identity").textContent, "Alex · local profile");
  current.discussion.roots[0].authorId = "owner-other"; ui.panel.render(current);
  assert.ok(descendants(ui.root).some((item) => item.textContent === "Other · synthetic"));
});
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
  assert.equal(ui.byId("discussion-origin-disclosure").textContent, EN.uiOriginDisclosure.replace("{title}", "Synthetic source"));
  current.sourceId = null; ui.panel.render(current); assert.equal(ui.byId("discussion-origin-disclosure").textContent, EN.uiOriginNone);
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
  assert.equal(ui.byId("discussion-demo-identity").textContent, "Alex · local profile");
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
  for (const id of ["discussion-heading", "discussion-counts", "discussion-demo-identity", "discussion-origin-disclosure"]) {
    assert.equal(ui.byId(id).hidden, true);
  }
  assert.equal(ui.byId("discussion-body").placeholder, EN.uiCommentPlaceholder);
  assert.equal(ui.byId("discussion-body").attributes["aria-label"], EN.uiCommentBody);
  assert.equal(ui.created.find((item) => item.tag === "label" && item.htmlFor === "discussion-body").hidden, true);
  assert.equal(ui.byId("discussion-status").hidden, true);
  assert.equal(ui.byId("discussion-advanced").children[0].textContent, EN.uiAdvanced);
  ui.panel.render(state({ draft: { body: "Edit", detached: false, mode: "edit", targetId: "root-1" } }));
  assert.equal(ui.byId("discussion-submit").textContent, EN.uiSaveChanges);
  ui.panel.render(state({ phase: "loading", error: null }));
  assert.equal(ui.byId("discussion-status").hidden, false);
  ui.panel.render(state({ phase: "error", error: "unavailable" }));
  assert.equal(ui.byId("discussion-status").hidden, false);
  ui.panel.setMode("developer");
  for (const id of ["discussion-heading", "discussion-counts", "discussion-demo-identity", "discussion-origin-disclosure"]) {
    assert.equal(ui.byId(id).hidden, false);
  }
  assert.equal(ui.byId("discussion-body").placeholder, "");
  assert.equal(ui.byId("discussion-submit").textContent, EN.discussionSubmit);
  assert.equal(ui.byId("discussion-discard").textContent, EN.discussionDiscard);
  assert.equal(ui.byId("discussion-counts").textContent, "Human contributions: 1 · Agent contributions: 0");
  assert.equal(ui.byId("discussion-advanced").children[0].textContent, EN.uiAdvancedDeveloper);
});

test("only a later contribution in the same Topic receives a one-shot entrance cue", () => {
  const ui = harness();
  const cards = () => descendants(ui.root).filter((item) => item.tag === "article");
  const isNew = (item) => item.className?.split(" ").includes("is-new");
  assert.equal(cards().some(isNew), false);
  ui.panel.render(state());
  assert.equal(cards().some(isNew), false);
  const withReply = state();
  withReply.discussion.roots[0].replies.push({ id: "reply-2", rootId: "root-1", state: "visible",
    authorId: "demo-alex", actorType: "human", body: "A new reply" });
  ui.panel.render(withReply);
  assert.equal(cards().filter(isNew).length, 1);
  assert.equal(cards().find((item) => isNew(item)).children.some((item) => item.textContent === "A new reply"), true);
  ui.panel.render({ ...withReply, busy: true });
  assert.equal(cards().some(isNew), false);
  ui.panel.render(withReply);
  assert.equal(cards().some(isNew), false);
  const busyArrival = state();
  busyArrival.discussion.roots[0].replies.push(withReply.discussion.roots[0].replies.at(-1),
    { id: "reply-during-write", rootId: "root-1", state: "visible", authorId: "demo-alex",
      actorType: "human", body: "Posted during refresh" });
  ui.panel.render({ ...busyArrival, busy: true });
  assert.equal(cards().some(isNew), false);
  ui.panel.render(busyArrival);
  assert.equal(cards().filter(isNew).length, 1);
  const newTopic = state({ topicId: "topic-other", discussion: { roots: [{ id: "new-topic-root", state: "visible",
    authorId: "demo-alex", actorType: "human", body: "First seen in this Topic", replies: [] }] } });
  ui.panel.render(newTopic);
  assert.equal(cards().some(isNew), false);
  newTopic.discussion.roots.push({ id: "later-root", state: "visible", authorId: "demo-alex",
    actorType: "human", body: "Later", replies: [] });
  ui.panel.render(newTopic);
  assert.equal(cards().filter(isNew).length, 1);
});

test("human post provenance stays accessible without repeating counts or prose", () => {
  const ui = harness();
  const author = descendants(ui.root).find((item) => item.className === "human-provenance");
  assert.equal(author.textContent, "Alex");
  assert.equal(author.attributes["aria-label"], "Human · Alex");
  assert.equal(ui.byId("discussion-counts").hidden, true);
});

test("a real composer submit shows pending feedback and preserves draft focus until the outcome", async () => {
  let release;
  let calls = 0;
  const completion = new Promise((resolve) => { release = resolve; });
  const ui = harness(undefined, null, null, null, null, { submitDraft: () => { calls += 1; return completion; } });
  const draft = state({ draft: { body: "Keep this while posting", detached: false, mode: "root", targetId: null } });
  ui.panel.render(draft);
  const input = ui.byId("discussion-body");
  input.focus();
  const composer = ui.byId("discussion-composer");
  const submit = ui.byId("discussion-submit");
  const pending = composer.listeners.get("submit")({ preventDefault() {} });
  ui.panel.render({ ...draft, busy: true });
  assert.equal(calls, 1);
  assert.equal(input.focused, true);
  assert.equal(input.value, "Keep this while posting");
  assert.equal(input.disabled, false);
  assert.equal(input.readOnly, true);
  assert.equal(submit.disabled, true);
  assert.equal(submit.textContent, EN.uiPostSending);
  assert.equal(submit.attributes["aria-busy"], "true");
  await composer.listeners.get("submit")({ preventDefault() {} });
  assert.equal(calls, 1);
  release(false);
  await pending;
  assert.equal(input.readOnly, false);
  assert.equal(submit.attributes["aria-busy"], "false");
  assert.equal(input.value, "Keep this while posting");
  ui.panel.render(state({ busy: true, draft: draft.draft }));
  assert.notEqual(submit.textContent, EN.uiPostSending);
});

test("User details stay compact through transient choose-topic; connection collapses on success but permits inspection", () => {
  const ui = harness();
  const connection = ui.byId("discussion-connection-settings");
  const advanced = ui.byId("discussion-advanced");
  ui.panel.setMode("user");
  ui.panel.render(state({ phase: "disconnected", catalog: null, discussion: null }));
  assert.equal(connection.open, true);
  assert.equal(connection.children[0].textContent, EN.uiConnectionSetup);
  ui.panel.render(state({ phase: "connecting", catalog: null, discussion: null }));
  ui.panel.render(state({ phase: "choose-topic", topicId: null, discussion: null }));
  assert.equal(connection.open, false); assert.equal(advanced.open, false);
  assert.equal(connection.children[0].textContent, EN.uiConnectionReady);
  connection.open = true;
  ui.panel.render(state());
  assert.equal(connection.open, true);
  assert.equal(ui.byId("discussion-token").hidden, true);
  assert.equal(connection.children.find((item) => item.tag === "form").hidden, true);
  ui.panel.render(state({ draft: { body: "Draft survives", detached: false, mode: "root", targetId: null } }));
  assert.equal(connection.open, true);
  ui.byId("discussion-new-title").value = "Unsent new title";
  ui.byId("discussion-token").value = "unsubmitted local value";
  ui.panel.setMode("developer");
  assert.equal(connection.open, true); assert.equal(advanced.open, true);
  assert.equal(ui.byId("discussion-token").hidden, false);
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
