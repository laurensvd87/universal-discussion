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
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key] ?? null; },
      querySelectorAll() { return descendants(this).filter((child) => child.attributes["data-action"] ||
        child.attributes["data-post-id"] || child.attributes["data-thread-root-id"]); },
      removeAttribute(key) { delete this.attributes[key]; },
      focus(options) { if (this.disabled || this.inert) return; this.focused = true;
        this.focusOptions = options; document.activeElement = this; },
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
  return { created, document, root, panel, calls, byId: (id) => created.find((item) => item.id === id) };
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
  for (const [status, label] of [["preparingArticle", EN.uiInsightPreparing],
    ["fetchingRelated", EN.uiInsightFindingRelated]]) {
    ui.panel.renderInsightState({ context: { currentSource: { id: "source-demo" } },
      ai: { planEnabled: true, model: "chosen", status } });
    assert.equal(shortcut.disabled, true);
    assert.equal(shortcut.attributes["aria-busy"], "true");
    assert.equal(shortcut.attributes["data-phase"], "working");
    assert.equal(shortcut.attributes["aria-label"], label);
    assert.equal(ui.byId("discussion-insight-activity").textContent, label);
  }
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
test("Insight entry is offered only while composing a new thread in User Mode", () => {
  const ui = harness();
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "idle" } }) });
  const shortcut = ui.byId("discussion-ai-insights");
  assert.equal(shortcut.hidden, false);
  ui.panel.render(state({ draft: { body: "", detached: false, mode: "reply", targetId: "root-1" } }));
  assert.equal(shortcut.hidden, true);
  ui.panel.render(state({ draft: { body: "Edited", detached: false, mode: "edit", targetId: "root-1" } }));
  assert.equal(shortcut.hidden, true);
  ui.panel.render(state());
  assert.equal(shortcut.hidden, false);
  ui.panel.setMode("developer");
  ui.panel.render(state({ draft: { body: "", detached: false, mode: "reply", targetId: "root-1" } }));
  assert.equal(shortcut.hidden, false);
});
test("User insight action opens account settings when ChatGPT is not ready", () => {
  const actions = [];
  const account = { open: false, summary: { focus: (options) => actions.push(["focus", options]) } };
  const ui = harness(undefined, null, null, { click: () => actions.push(["settings"]) }, account);
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: false, model: "", status: "idle" } }),
    createInsights: () => { actions.push(["create"]); } });
  ui.byId("discussion-ai-insights").listeners.get("click")();
  assert.equal(ui.byId("discussion-ai-insights").textContent, EN.uiInsightSetupButton);
  assert.equal(ui.byId("discussion-ai-insights").attributes["aria-label"], EN.uiInsightSetupLabel);
  assert.equal(ui.byId("discussion-insight-activity").textContent, EN.uiInsightSetupHint);
  assert.equal(account.open, true);
  assert.deepEqual(actions, [["settings"], ["focus", { preventScroll: true }]]);
});
test("connected account without insight plan shows accurate setup guidance", () => {
  const actions = [];
  const account = { open: false, summary: { focus: () => actions.push("focus") } };
  const ui = harness(undefined, null, null, { click: () => actions.push("settings") }, account);
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { connected: true, planEnabled: false, model: "", status: "planUnavailable" } }),
    createInsights: () => { actions.push("create"); } });
  assert.equal(ui.byId("discussion-insight-activity").textContent, EN.uiInsightPlanUnavailableHint);
  assert.equal(ui.byId("discussion-ai-insights").textContent, EN.uiInsightSetupButton);
  ui.byId("discussion-ai-insights").listeners.get("click")();
  assert.equal(account.open, true);
  assert.deepEqual(actions, ["settings", "focus"]);
});
test("pairing token helper, Enter submit, and busy guard use one cleared token", async () => {
  const received = [];
  let finish;
  const ui = harness(undefined, null, null, null, null, {
    pair: (value) => { received.push(value); return new Promise((resolve) => { finish = resolve; }); },
  });
  const disconnected = state({ phase: "disconnected", catalog: null, discussion: null, related: null });
  ui.panel.render(disconnected);
  const token = ui.byId("discussion-token");
  const pair = ui.byId("discussion-pair");
  const form = ui.created.find((item) => item.tag === "form" && item.children.includes(pair));
  assert.equal(token.attributes["aria-describedby"], "discussion-token-help");
  assert.equal(ui.byId("discussion-token-help").textContent, EN.uiPairingTokenHelp);
  token.value = "test-token";
  let prevented = 0;
  token.listeners.get("keydown")({ key: "Enter", preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 1);
  assert.deepEqual(received, ["test-token"]);
  assert.equal(token.value, "");
  assert.equal(token.disabled, true);
  assert.equal(pair.disabled, true);
  form.listeners.get("submit")({ preventDefault: () => { prevented += 1; } });
  assert.deepEqual(received, ["test-token"]);
  finish(true);
  await Promise.resolve();
  assert.equal(pair.disabled, false);
  assert.equal(token.disabled, false);
  assert.equal(token.value, "");
  form.listeners.get("submit")({ preventDefault: () => { prevented += 1; } });
  assert.deepEqual(received, ["test-token"]);
});
test("User Mode gives extension repair guidance without asking for a new token", () => {
  const ui = harness();
  ui.panel.render(state({ phase: "error", error: "extension-connection-unavailable", catalog: null,
    discussion: null, related: null }));
  assert.equal(ui.byId("discussion-status").textContent, EN.discussionExtensionUnavailable);
  assert.equal(ui.byId("discussion-token").hidden, true);
  assert.equal(ui.created.find((item) => item.tag === "form" && item.children.includes(ui.byId("discussion-pair"))).hidden, true);
  assert.equal(ui.byId("discussion-reload").hidden, false);
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
  assert.equal(ui.byId("discussion-status").textContent, EN.uiTopicAwaitingPage);
  assert.equal(ui.byId("discussion-status").hidden, false);
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
  assert.equal(ui.byId("discussion-status").textContent, EN.discussionChooseStatus);
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
test("User prior disclosure shows only old-topic actions and a Back action while viewing one", () => {
  const ui = harness();
  const prior = { sourceId: "source-demo", currentTopicId: "topic-demo", topics: [
    { id: "old-topic", title: "<img src=x>", kind: "general", rootCount: 3 },
  ] };
  ui.panel.render(state({ sourceId: "source-demo", priorDiscussions: prior }));
  const details = ui.byId("discussion-prior");
  assert.equal(details.hidden, false);
  assert.equal(ui.byId("discussion-prior-summary").textContent, EN.uiEarlierDiscussionOnPage.replace("{count}", "3"));
  const action = ui.byId("discussion-prior-list").children[0].children[0];
  assert.equal(action.tag, "button");
  assert.equal(action.textContent, EN.uiEarlierDiscussionEntry.replace("{title}", "<img src=x>").replace("{count}", "3"));
  action.listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["selectTopic", "old-topic"]);
  ui.panel.render(state({ topicId: "old-topic", sourceId: null, priorDiscussions: null, viewingPriorDiscussion: true }));
  assert.equal(details.hidden, true);
  const back = ui.byId("discussion-back-to-page");
  assert.ok(descendants(ui.root).includes(back));
  assert.equal(back.hidden, false);
  assert.equal(back.textContent, EN.uiBackToThisPage);
  back.listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["open"]);
  ui.panel.render(state({ sourceId: "source-demo", priorDiscussions: { ...prior, topics: [] } }));
  assert.equal(details.hidden, true);
  assert.equal(back.hidden, true);
  ui.panel.render(state({ sourceId: "source-demo", priorDiscussions: null,
    priorDiscussionsError: "stale-prior-discussions" }));
  assert.equal(ui.byId("discussion-prior").hidden, true);
  assert.equal(ui.byId("discussion-status").hidden, false);
  assert.equal(ui.byId("discussion-status").textContent, EN.uiEarlierThreadsUnavailable);
  ui.panel.render(state({ phase: "disconnected", sourceId: null, topicId: null,
    priorDiscussionsError: "stale-prior-discussions" }));
  assert.equal(ui.byId("discussion-status").hidden, true);
});
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
test("User thread cards reveal nested replies, retain expansion and focus, and show post metadata", () => {
  const ui = harness();
  const discussion = { roots: [{ id: "root-1", rootId: null, replyToId: null, state: "visible",
    authorId: "demo-alex", actorType: "human", body: "Opening message", edited: false,
    createdAt: "2026-10-06T10:30:00.000Z", replies: [
      { id: "reply-1", rootId: "root-1", replyToId: "root-1", state: "visible", authorId: "demo-alex",
        actorType: "human", body: "First reply", edited: false, createdAt: "2026-10-06T10:31:00.000Z" },
      { id: "reply-2", rootId: "root-1", replyToId: "reply-1", state: "visible", authorId: "demo-alex",
        actorType: "human", body: "Nested reply", edited: false, createdAt: "2026-10-06T10:32:00.000Z" },
      { id: "reply-3", rootId: "root-1", replyToId: "reply-2", state: "deleted" },
      { id: "reply-4", rootId: "root-1", replyToId: "reply-3", state: "visible", authorId: "demo-alex",
        actorType: "human", body: "Surviving reply", edited: false, createdAt: "2026-10-06T10:33:00.000Z" },
    ] }] };
  ui.panel.render(state({ discussion }));
  const thread = descendants(ui.root).find((item) => item.className === "discussion-thread");
  const card = thread.children[0];
  assert.equal(card.className, "discussion-thread-card");
  assert.equal(card.children[0].children.find((item) => item.className === "discussion-body").textContent, "Opening message");
  assert.equal(card.children[1].textContent, EN.uiShowReplies.replace("{count}", "4"));
  assert.equal(card.children[2].attributes["data-open"], "false");
  assert.equal(card.children[2].inert, true);
  assert.equal(descendants(card).filter((item) => item.tag === "time").length, 4);
  card.children[1].listeners.get("click")();
  assert.equal(card.children[2].attributes["data-open"], "true");
  const firstBranch = card.children[2].children[0].children[0];
  assert.equal(firstBranch.children[2].attributes["data-open"], "false");
  firstBranch.children[1].listeners.get("click")();
  assert.equal(firstBranch.children[2].attributes["data-open"], "true");
  firstBranch.children[1].listeners.get("click")();
  assert.equal(firstBranch.children[1].attributes["aria-expanded"], "false");
  assert.equal(firstBranch.children[2].attributes["aria-hidden"], "true");
  assert.equal(firstBranch.children[2].inert, true);
  firstBranch.children[1].listeners.get("click")();
  firstBranch.children[1].focus();
  ui.panel.render(state({ discussion, busy: true }));
  const updated = thread.children[0];
  assert.equal(updated.children[2].attributes["data-open"], "true");
  assert.equal(updated.children[2].children[0].children[0].children[2].attributes["data-open"], "true");
  assert.equal(ui.document.activeElement.attributes["data-contribution-id"], "reply-1");
  assert.equal(ui.document.activeElement.attributes["aria-expanded"], "true");
  const replyAction = descendants(updated).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "reply-2");
  ui.panel.render(state({ discussion }));
  const readyReplyAction = descendants(thread).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "reply-2");
  assert.equal(replyAction.disabled, true);
  readyReplyAction.listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["begin", "reply", "reply-2"]);
});
test("same-time child sorted before its parent still renders under that parent", () => {
  const ui = harness();
  const timestamp = "2026-10-06T10:30:00.000Z";
  const discussion = { roots: [{ id: "root-1", rootId: null, replyToId: null, state: "visible",
    authorId: "demo-alex", actorType: "human", body: "Root", edited: false, createdAt: timestamp,
    replies: [
      { id: "a-child", rootId: "root-1", replyToId: "z-parent", state: "visible",
        authorId: "demo-alex", actorType: "human", body: "Child", edited: false, createdAt: timestamp },
      { id: "z-parent", rootId: "root-1", replyToId: "root-1", state: "visible",
        authorId: "demo-alex", actorType: "human", body: "Parent", edited: false, createdAt: timestamp },
    ] }] };
  ui.panel.render(state({ discussion }));
  const card = descendants(ui.root).find((item) => item.className === "discussion-thread-card");
  card.children[1].listeners.get("click")();
  const parentBranch = card.children[2].children[0].children[0];
  assert.equal(parentBranch.children[0].children.find((item) => item.className === "discussion-body").textContent, "Parent");
  assert.equal(parentBranch.children[1].textContent, EN.uiShowReply.replace("{count}", "1"));
  assert.equal(parentBranch.children[1].attributes["aria-expanded"], "false");
  parentBranch.children[1].listeners.get("click")();
  assert.equal(parentBranch.children[1].textContent, EN.uiHideReplies);
  const childBranch = parentBranch.children[2].children[0].children[0];
  assert.equal(childBranch.children[0].children.find((item) => item.className === "discussion-body").textContent, "Child");
  const childReply = descendants(childBranch).find((item) => item.attributes["data-action"] === "reply");
  childReply.focus();
  ui.panel.render(state({ discussion, busy: true }));
  assert.equal(ui.document.activeElement.attributes["data-post-id"], "a-child");
  assert.equal(card.children[2].attributes["data-open"], "true");
});
test("focused action falls back to its post or discussion when disabled or removed", () => {
  const ui = harness();
  const original = state({ discussion: { roots: [{ id: "focus-root", rootId: null, replyToId: null,
    state: "visible", authorId: "demo-alex", actorType: "human", body: "Message",
    edited: false, createdAt: "2026-10-06T10:30:00.000Z", replies: [] }] } });
  const action = () => descendants(ui.root).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "focus-root");
  ui.panel.render(original);
  action().focus();
  ui.panel.render({ ...original, busy: true });
  assert.equal(ui.document.activeElement.attributes["data-post-id"], "focus-root");
  assert.deepEqual(ui.document.activeElement.focusOptions, { preventScroll: true });
  ui.panel.render(original);
  assert.equal(ui.document.activeElement.attributes["data-post-id"], "focus-root");
  assert.deepEqual(ui.document.activeElement.focusOptions, { preventScroll: true });
  action().focus();
  const withdrawn = { ...original, discussion: { roots: [{ id: "focus-root", rootId: null,
    replyToId: null, state: "deleted", label: "Deleted", replies: [] }] } };
  ui.panel.render(withdrawn);
  assert.equal(ui.document.activeElement.attributes["data-post-id"], "focus-root");
  assert.equal(ui.document.activeElement.attributes["aria-label"], EN.discussionDeleted);
  ui.panel.render(original);
  action().focus();
  ui.panel.render({ ...original, discussion: { roots: [] } });
  assert.equal(ui.document.activeElement.className, "discussion-thread");
  assert.equal(ui.document.activeElement.attributes["tabindex"], "-1");
  assert.deepEqual(ui.document.activeElement.focusOptions, { preventScroll: true });
});
test("focused thread card survives another discussion refresh after its reply disappears", () => {
  const ui = harness();
  const root = { id: "root-focus", rootId: null, replyToId: null, state: "visible",
    authorId: "demo-alex", actorType: "human", body: "Root", edited: false,
    createdAt: "2026-10-06T10:30:00.000Z", replies: [
      { id: "reply-focus", rootId: "root-focus", replyToId: "root-focus", state: "visible",
        authorId: "demo-alex", actorType: "human", body: "Reply", edited: false,
        createdAt: "2026-10-06T10:31:00.000Z" },
    ] };
  const original = state({ discussion: { roots: [root] } });
  ui.panel.render(original);
  descendants(ui.root).find((item) => item.className === "discussion-thread-card").children[1].listeners.get("click")();
  const replyAction = descendants(ui.root).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "reply-focus");
  replyAction.focus();
  const withoutReply = state({ discussion: { roots: [{ ...root, replies: [] }] } });
  ui.panel.render(withoutReply);
  assert.equal(ui.document.activeElement.attributes["data-thread-root-id"], "root-focus");
  ui.panel.render({ ...withoutReply, busy: true });
  assert.equal(ui.document.activeElement.attributes["data-thread-root-id"], "root-focus");
  assert.deepEqual(ui.document.activeElement.focusOptions, { preventScroll: true });
});
test("long root without replies has a separate Read more control", () => {
  const ui = harness();
  const discussion = { roots: [{ id: "root-long", rootId: null, replyToId: null, state: "visible",
    authorId: "demo-alex", actorType: "human", body: "Long opening thought. ".repeat(25),
    edited: false, createdAt: "2026-10-06T10:30:00.000Z", replies: [] }] };
  ui.panel.render(state({ discussion }));
  const card = descendants(ui.root).find((item) => item.className === "discussion-thread-card");
  const toggle = card.children[1];
  assert.equal(card.attributes["data-collapsible"], "true");
  assert.equal(toggle.textContent, EN.uiReadMore);
  assert.equal(toggle.attributes["aria-expanded"], "false");
  assert.equal(toggle.attributes["aria-controls"], card.children[0].children.find((item) => item.className === "discussion-body").id);
  toggle.listeners.get("click")();
  assert.equal(toggle.textContent, EN.uiReadLess);
  assert.equal(card.attributes["data-expanded"], "true");
  ui.panel.render(state({ discussion, busy: true }));
  assert.equal(descendants(ui.root).find((item) => item.className?.includes("discussion-body-toggle")).textContent, EN.uiReadLess);
});
test("reply disclosure motion respects reduced-motion preferences", () => {
  const css = readFileSync(new URL("../browser/chromium/popup.css", import.meta.url), "utf8");
  assert.match(css, /\.discussion-reply-children\s*\{[\s\S]*?grid-template-rows: 0fr;[\s\S]*?transition: grid-template-rows 180ms/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.discussion-reply-children\) \{ transition: none; \}/u);
});
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
  const actions = descendants(card).filter((item) => item.tag === "button").map((item) => item.attributes["data-action"]);
  assert.deepEqual(actions, ["reply", "withdraw"]);
  descendants(card).find((item) => item.attributes["data-action"] === "withdraw").listeners.get("click")();
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
test("raw related pages stay in Developer Mode while native open state survives polling", () => {
  const ui = harness();
  const details = ui.byId("discussion-related");
  const related = state({ related: { results: Array.from({ length: 4 }, (_, index) => ({
    title: `Synthetic page ${index + 1}`, url: `https://example.com/${index + 1}`, relationship: "related",
  })) } });
  ui.panel.render(related);
  assert.equal(details.hidden, true);
  ui.panel.setMode("developer");
  assert.equal(details.hidden, false);
  assert.equal(details.children[0].textContent, EN.discussionRelated);
  details.open = true;
  ui.panel.render(related);
  assert.equal(details.open, true);
  ui.panel.setMode("user");
  assert.equal(details.open, false);
  assert.equal(details.hidden, true);
  ui.panel.render(state({ related: { results: [] }, discussion: { roots: [] } }));
  assert.equal(details.hidden, true);
  assert.equal(ui.byId("discussion-counts").hidden, true);
  assert.equal(ui.byId("discussion-counts").textContent, "0 human · 0 AI");
  assert.ok(descendants(ui.root).some((item) => item.textContent === EN.uiDiscussionEmpty));
});
test("Related discussions sit below current threads, expand by keyboard, and offer no posting action", () => {
  const ui = harness();
  const relatedTopic = { topicId: "nearby-topic", title: "<img src=x> Nearby topic", rootCount: 1,
    roots: [{ id: "nearby-root", body: "A distinct conversation", actorType: "human",
      authorId: "demo-alex", createdAt: "2026-09-28T12:00:00.000Z", replyCount: 2,
      origin: { sourceId: "nearby-source", url: "https://example.org/article", title: "Nearby article" } }] };
  ui.panel.render(state({ relatedDiscussions: [relatedTopic] }));
  const section = ui.byId("discussion-related-conversations");
  const thread = ui.created.find((item) => item.className === "discussion-thread");
  const composer = ui.byId("discussion-composer");
  assert.equal(section.hidden, false);
  assert.ok(ui.root.children.indexOf(section) > ui.root.children.indexOf(thread));
  assert.ok(ui.root.children.indexOf(section) > ui.root.children.indexOf(composer));
  assert.equal(section.children[0].textContent, EN.uiRelatedDiscussions);
  const topic = section.children[1].children[0];
  assert.equal(topic.tag, "details");
  assert.equal(topic.children[0].tag, "summary");
  assert.equal(topic.children[0].children[0].textContent, relatedTopic.title);
  assert.equal(topic.children[1].children[1].textContent, "A distinct conversation");
  assert.equal(topic.children[1].children[2].textContent, "2 replies");
  assert.equal(descendants(topic).filter((item) => item.tag === "button").length, 0);
  const link = descendants(topic).find((item) => item.tag === "a");
  assert.equal(link.href, "https://example.org/article");
  assert.equal(link.referrerPolicy, "no-referrer");
  topic.open = true;
  ui.panel.render(state({ relatedDiscussions: [relatedTopic] }));
  assert.equal(topic.open, true);
  ui.panel.render(state({ phase: "disconnected", catalog: null, discussion: null,
    related: null, relatedDiscussions: [] }));
  assert.equal(section.hidden, true);
});
test("safe related Page titles are keyboard-accessible links with hostnames and relationship labels", () => {
  const ui = harness();
  const url = "https://example.com/articles/intro";
  ui.panel.render(state({ related: { results: [
    { title: "<img src=x> Page title", url, relationship: "same-topic" },
    { title: "Second page", url: "https://other.example.org/read", relationship: "related" },
  ] } }));
  const rows = ui.byId("discussion-related").children.find((item) => item.tag === "ul").children;
  assert.equal(rows.length, 2);
  const [title, address, relationship] = rows[0].children;
  assert.equal(title.tag, "a");
  assert.equal(title.textContent, "<img src=x> Page title");
  assert.equal(title.href, url);
  assert.equal(title.target, "_blank");
  assert.equal(title.rel, "noopener noreferrer");
  assert.equal(title.referrerPolicy, "no-referrer");
  assert.equal(title.listeners.size, 0);
  title.focus(); assert.equal(title.focused, true);
  assert.equal(address.tag, "p"); assert.equal(address.textContent, "example.com");
  assert.equal(relationship.textContent, EN.discussionSameTopic);
  assert.equal(rows[1].children[0].tag, "a");
  assert.equal(rows[1].children[1].textContent, "other.example.org");
  assert.equal(rows[1].children[2].textContent, EN.discussionRelatedReading);
  assert.equal(descendants(ui.byId("discussion-related")).some((item) => item.tag === "img"), false);
  assert.match(readFileSync(new URL("../browser/chromium/popup.css", import.meta.url), "utf8"),
    /a\.related-page-title:focus-visible\s*\{/u);
  ui.panel.setMode("developer");
  const developerRow = ui.byId("discussion-related").children.find((item) => item.tag === "ul").children[0];
  assert.equal(developerRow.children[0].href, url);
  assert.equal(developerRow.children[1].textContent, url);
  assert.deepEqual(ui.calls, []);
});
test("rejected related URLs, including retained account hosts, remain inert text", () => {
  const ui = harness();
  const rejected = ["https://account.example.com/profile", "https://example.com/account",
    "https://example.com/articles?token=private", "javascript:alert(1)"];
  ui.panel.render(state({ related: { results: rejected.map((url) => ({
    title: `<script>${url}</script>`, url, relationship: "related",
  })) } }));
  const rows = ui.byId("discussion-related").children.find((item) => item.tag === "ul").children;
  assert.equal(rows.length, rejected.length);
  rows.forEach((row, index) => {
    assert.equal(row.children[0].tag, "p");
    assert.equal(row.children[0].textContent, `<script>${rejected[index]}</script>`);
    assert.equal(row.children[1].tag, "p");
    assert.equal(row.children[1].textContent, rejected[index]);
    assert.equal(descendants(row).some((item) => item.tag === "a" || item.tag === "script"), false);
  });
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
  current.catalog.sources[0].url = "https://example.com/article";
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

test("selected discussion loading permits a root draft while posting and Insights remain gated", () => {
  const ui = harness();
  const loading = state({ phase: "loading", sourceId: "source-demo", discussion: null, related: null });
  loading.catalog.sources[0].topicId = loading.topicId;
  ui.panel.render(loading);
  assert.equal(ui.byId("discussion-status").textContent, EN.uiLoadingDiscussions);
  assert.equal(ui.byId("discussion-status").attributes["data-loading"], "true");
  assert.equal(ui.byId("discussion-status").attributes.role, "status");
  assert.equal(ui.byId("discussion-status").attributes["aria-live"], "polite");
  const loadingScene = ui.byId("discussion-loading-scene");
  assert.equal(loadingScene.hidden, false);
  assert.equal(loadingScene.attributes["aria-hidden"], "true");
  assert.equal(loadingScene.children.length, 2);
  assert.ok(loadingScene.children.every((card) => card.children.length === 2 &&
    card.children[1].children.length === 2));
  assert.equal(ui.created.find((item) => item.className === "discussion-thread").hidden, true);
  assert.equal(ui.byId("discussion-composer").hidden, false);
  assert.equal(ui.byId("discussion-body").disabled, false);
  assert.equal(ui.byId("discussion-submit").disabled, true);
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "idle" } }) });
  assert.equal(ui.byId("discussion-ai-insights").hidden, false);
  assert.equal(ui.byId("discussion-ai-insights").disabled, true);
  ui.panel.render(state());
  assert.equal(loadingScene.hidden, true);
  ui.panel.render(state({ phase: "choose-topic", topicId: null, sourceId: null, discussion: null }));
  assert.equal(loadingScene.hidden, true);
  ui.panel.render({ ...loading, draft: { body: "Detached after navigation", detached: true, mode: "root", targetId: null } });
  assert.equal(loadingScene.hidden, false);
  assert.equal(ui.byId("discussion-composer").hidden, false);
  assert.equal(ui.byId("discussion-body").value, "Detached after navigation");
  assert.equal(ui.byId("discussion-body").disabled, true);
  assert.equal(ui.byId("discussion-submit").disabled, true);
  assert.equal(ui.byId("discussion-reattach").disabled, true);
  ui.panel.render(state({ related: null }));
  assert.equal(ui.byId("discussion-ai-insights").disabled, true);
  for (const phase of ["connecting", "choose-topic", "disconnected", "error"]) {
    ui.panel.render(state({ phase }));
    assert.equal(ui.byId("discussion-body").disabled, true);
    assert.equal(ui.byId("discussion-submit").disabled, true);
  }
  ui.panel.render(state({ phase: "error", error: "unavailable", discussion: null }));
  assert.equal(ui.byId("discussion-status").attributes["data-loading"], "false");
  assert.equal(loadingScene.hidden, true);
  ui.panel.render(state({ phase: "loading", sourceId: null, discussion: null, related: null }));
  assert.equal(loadingScene.hidden, false);
  assert.equal(ui.byId("discussion-body").disabled, true);
  const confirmation = ui.byId("discussion-reset-confirmation"); confirmation.value = "RESET DEMO STATE";
  ui.panel.render(state({ needsFreshRead: true }));
  assert.equal(ui.byId("discussion-body").disabled, true);
  assert.equal(ui.byId("discussion-create").disabled, true);
  assert.equal(ui.byId("discussion-reset").disabled, true);
  confirmation.listeners.get("input")(); assert.equal(ui.byId("discussion-reset").disabled, true);
  assert.equal(loadingScene.hidden, true);
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
  const mode = ui.created.find((item) => item.textContent === EN.uiReplyMode);
  assert.equal(mode.hidden, true);
  ui.panel.setMode("developer");
  assert.equal(mode.hidden, false);
  assert.ok(ui.created.some((item) => item.textContent === "Reply to root-1"));
  ui.panel.setMode("user");
  assert.equal(mode.hidden, true);
  assert.equal(ui.byId("discussion-connection-settings").open, false);
  assert.equal(ui.byId("discussion-advanced").open, false);
  assert.equal(ui.byId("discussion-body"), body); assert.equal(body.value, "Unsent words");
  options.forEach((option, index) => assert.equal(topic.children[index], option));
  assert.deepEqual(ui.calls, calls);
  assert.equal(ui.byId("selected-topic-title"), undefined);
  assert.equal(ui.byId("discussion-demo-identity").textContent, "Alex · local profile");
  ui.panel.render({ ...snapshot, phase: "error", error: "unavailable" });
  assert.equal(ui.byId("selected-topic-title"), undefined);
  assert.equal(ui.byId("discussion-connection-settings").open, true);
});

test("reply context follows the exact selected author, including a reply to a reply, without submitting", () => {
  const ui = harness();
  const root = { id: "root-a", rootId: null, state: "visible", authorId: "demo-alex", actorType: "human",
    body: "Alex's opening comment", replies: [
      { id: "reply-b", rootId: "root-a", replyToId: "root-a", state: "visible", authorId: "demo-blair",
        actorType: "human", body: "Blair's answer" },
    ] };
  const snapshot = state({ catalog: { ...state().catalog, actors: [
    { id: "demo-alex", displayName: "Alex · synthetic" }, { id: "demo-blair", displayName: "Blair · synthetic" },
  ] }, discussion: { roots: [root] } });
  const context = ui.byId("discussion-reply-context");
  const [author, excerpt] = context.children;
  const replyButton = (id) => descendants(ui.root).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === id);
  ui.panel.render(snapshot);
  replyButton("root-a").listeners.get("click")();
  ui.panel.render({ ...snapshot, draft: { body: "", detached: false, mode: "reply", targetId: "root-a" } });
  assert.equal(context.hidden, false);
  assert.equal(author.textContent, "Replying to Alex");
  assert.equal(excerpt.textContent, "Alex's opening comment");
  assert.equal(ui.byId("discussion-body").placeholder, EN.uiReplyPlaceholder);
  assert.equal(ui.byId("discussion-body").attributes["aria-label"], EN.uiReplyBody);
  assert.equal(ui.byId("discussion-body").attributes["aria-describedby"], context.id);
  assert.equal(ui.byId("discussion-submit").textContent, "Post reply");
  replyButton("reply-b").listeners.get("click")();
  ui.panel.render({ ...snapshot, draft: { body: "A reply", detached: false, mode: "reply", targetId: "reply-b" } });
  assert.equal(author.textContent, "Replying to Blair");
  assert.equal(excerpt.textContent, "Blair's answer");
  assert.deepEqual(ui.calls, [["begin", "reply", "root-a"], ["begin", "reply", "reply-b"]]);
  ui.byId("discussion-discard").listeners.get("click")();
  ui.panel.render(snapshot);
  assert.equal(context.hidden, true);
  assert.equal(ui.byId("discussion-body").placeholder, EN.uiCommentPlaceholder);
  assert.equal(ui.byId("discussion-body").attributes["aria-describedby"], undefined);
  assert.equal(ui.byId("discussion-submit").textContent, EN.uiPostComment);
  assert.deepEqual(ui.calls.at(-1), ["discardDraft"]);
  assert.equal(ui.calls.some(([method]) => method === "submitDraft"), false);
});

test("reply context renders hostile long text as bounded plain text and never guesses a missing target", async () => {
  const ui = harness();
  const hostile = "<img src=x onerror=alert(1)>\n" + "😀".repeat(150);
  const root = { id: "root-hostile", rootId: null, state: "visible", authorId: "demo-alex",
    actorType: "human", body: hostile, replies: [] };
  const snapshot = state({ discussion: { roots: [root] },
    draft: { body: "Draft", detached: false, mode: "reply", targetId: "root-hostile" } });
  ui.panel.render(snapshot);
  const [author, excerpt] = ui.byId("discussion-reply-context").children;
  assert.equal(author.textContent, "Replying to Alex");
  assert.ok(excerpt.textContent.startsWith("<img src=x onerror=alert(1)> "));
  assert.equal(Array.from(excerpt.textContent).length, 121);
  assert.equal(excerpt.textContent.endsWith("…"), true);
  assert.equal(descendants(ui.byId("discussion-reply-context")).some((item) => item.tag === "img"), false);
  ui.panel.render({ ...snapshot, draft: { ...snapshot.draft, targetId: "missing" } });
  assert.equal(author.textContent, EN.uiReplyTargetUnavailable);
  assert.equal(excerpt.textContent, "");
  assert.equal(excerpt.hidden, true);
  assert.equal(ui.byId("discussion-reply-context").children[2].textContent, EN.uiReplyUnavailableAction);
  assert.equal(ui.byId("discussion-reply-context").children[2].attributes.role, "status");
  assert.equal(ui.byId("discussion-body").attributes["aria-describedby"], "discussion-reply-context");
  assert.equal(ui.byId("discussion-submit").attributes["aria-describedby"], "discussion-reply-context");
  assert.equal(ui.byId("discussion-submit").disabled, true);
  assert.equal(ui.byId("discussion-submit").textContent, EN.uiPostReply);
  await ui.byId("discussion-composer").listeners.get("submit")({ preventDefault() {} });
  assert.equal(ui.calls.some(([method]) => method === "submitDraft"), false);
  ui.panel.render({ ...snapshot, discussion: { roots: [{ ...root, state: "deleted" }] } });
  assert.equal(author.textContent, EN.uiReplyTargetUnavailable);
  assert.equal(ui.byId("discussion-submit").disabled, true);
  ui.panel.render(snapshot);
  assert.equal(ui.byId("discussion-submit").disabled, false);
  assert.equal(ui.byId("discussion-submit").attributes["aria-describedby"], undefined);
  assert.equal(ui.byId("discussion-reply-context").children[2].hidden, true);
  assert.equal(ui.calls.some(([method]) => method === "submitDraft"), false);
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
test("User view hides plain disconnected status but keeps error and fresh-read guidance", () => {
  const ui = harness();
  const status = ui.byId("discussion-status");
  const disconnected = state({ phase: "disconnected", catalog: null, discussion: null, related: null });
  ui.panel.render(disconnected);
  assert.equal(status.textContent, EN.discussionDisconnected);
  assert.equal(status.hidden, true);
  ui.panel.render({ ...disconnected, error: "unauthorized" });
  assert.equal(status.textContent, EN.discussionUnauthorized);
  assert.equal(status.hidden, false);
  ui.panel.render({ ...disconnected, needsFreshRead: true });
  assert.equal(status.hidden, false);
  ui.panel.setMode("developer");
  ui.panel.render(disconnected);
  assert.equal(status.hidden, false);
});
