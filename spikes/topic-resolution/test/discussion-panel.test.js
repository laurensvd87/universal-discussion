import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscussionPanel } from "../browser/chromium/discussion-panel.js";
import { EN } from "../browser/locales/en.js";
import { readFileSync } from "node:fs";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";
import { RIDGE_POLICY, RIDGE_REPRESENTATION } from "../browser/core/topic-view-mode.js";
import { createInsightController } from "../browser/core/insight-controller.js";

function harness(messages, workspace, insightsTab, settingsButton, accountDetails, controllerOverrides = {}, panelOptions = {}) {
  const created = [];
  const contains = (parent, target) => parent === target || parent.children?.some((child) => contains(child, target));
  const detach = (item) => {
    if (!item.parentElement) return;
    if (contains(item, document.activeElement)) document.activeElement = document.body;
    item.parentElement.children = item.parentElement.children.filter((child) => child !== item);
    item.parentElement = null;
  };
  const document = { querySelector: (selector) => selector === "#insight-workspace" ? workspace
    : selector === "#app-tab-insights" ? insightsTab : selector === "#app-settings-button" ? settingsButton
      : selector === "#insight-account-details" ? accountDetails
        : selector === "#insight-account-details > summary" ? accountDetails?.summary
      : selector === "#app-discussion-insights-host" ? descendants(root).find((item) => item.id === "app-discussion-insights-host")
        : selector === "#insight-followup-progress" ? descendants(root).find((item) => item.id === "insight-followup-progress")
          : null, createElement(tag) {
    const item = { tag, children: [], attributes: {}, style: {}, textContent: "", value: "", listeners: new Map(),
      get nextSibling() { if (!this.parentElement) return null;
        return this.parentElement.children[this.parentElement.children.indexOf(this) + 1] ?? null; },
      contains(target) { return contains(this, target); },
      append(...items) { for (const child of items) { detach(child); child.parentElement = this; this.children.push(child); } },
      replaceChildren(...items) { for (const child of [...this.children]) detach(child);
        this.children = []; this.append(...items); },
      insertBefore(item, sibling) {
        detach(item);
        item.parentElement = this;
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
      scrollIntoView(options) { (this.scrollCalls ??= []).push(options); },
      focus(options) { if (this.disabled || this.inert) return; this.focused = true;
        this.focusOptions = options; document.activeElement = this; },
      addEventListener(event, callback) { this.listeners.set(event, callback); },
      removeEventListener(event, callback) { if (this.listeners.get(event) === callback) this.listeners.delete(event); } };
    created.push(item); return item;
  }, body: {} };
  const root = document.createElement("section");
  const panel = mountDiscussionPanel(document, root, { messages, ...panelOptions });
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
  assert.ok(descendants(composer).includes(shortcut));
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
  assert.equal(ui.byId("discussion-insight-activity").textContent, EN.uiInsightReady);
  shortcut.listeners.get("click")();
  assert.equal(actions.length, 1);
});
test("composer provides a single model rehome target without duplicating controls", () => {
  const ui = harness();
  const composer = ui.byId("discussion-composer");
  const modelHost = ui.byId("discussion-model-host");
  assert.ok(composer.children.some((item) => item.children?.includes(modelHost)));
  assert.equal(ui.created.filter((item) => item.id === "discussion-model-host").length, 1);
  assert.equal(ui.created.some((item) => item.id === "insight-model"), false);
});

test("root and message corner voice menus save the current preference snapshot without generation", () => {
  const ui = harness();
  const preferences = [], generations = [];
  let current = { context: { currentSource: { id: "source-demo" } }, preferences: { language: "de", voice: "friendly" },
    ai: { planEnabled: true, model: "chosen", status: "idle" } };
  ui.panel.bindInsight({ currentState: () => current,
    setInsightPreferences: value => { preferences.push(value); current = { ...current, preferences: value }; ui.panel.renderInsightState(current); },
    createInsights: options => { generations.push(options); return Promise.resolve(true); } });
  const shortcut = ui.byId("discussion-ai-insights"), control = shortcut.parentElement;
  const toggle = control.children.find(item => item.className === "assistant-voice-toggle");
  assert.equal(toggle.hidden === true, false);
  toggle.listeners.get("click")({});
  current = { ...current, preferences: { language: "nl", country: "NL", voice: "friendly" } };
  const menu = control.children.find(item => item.className === "assistant-voice-menu");
  const standard = menu.children.find(item => item.attributes["data-voice"] === "standard");
  standard.listeners.get("click")({});
  assert.deepEqual(preferences, [{ language: "nl", country: "NL" }]);
  assert.deepEqual(generations, []);
  shortcut.listeners.get("click")();
  assert.deepEqual(generations, [{ automatic: true }]);
  const spark = descendants(ui.root).find(item => item.attributes["data-action"] === "getinsights");
  assert.equal(spark.parentElement.className, "assistant-voice-control");
  const corner = spark.parentElement.children.find(item => item.className === "assistant-voice-toggle");
  assert.equal(corner.disabled, spark.disabled);
  assert.equal(ui.byId("discussion-voice-host").hidden, true);
});

test("per-message corner voice choice closes and disables through provider work without re-enabling unavailable targets", () => {
  const ui = harness();
  const insight = { context: { currentSource: { id: "source-demo" } },
    preferences: {}, ai: { planEnabled: true, model: "chosen", status: "idle" } };
  ui.panel.bindInsight({ currentState: () => insight, setInsightPreferences: () => {} });
  ui.panel.render(state({ sourceId: "source-demo" }));
  const spark = descendants(ui.root).find(item => item.attributes["data-action"] === "getinsights");
  const corner = spark.parentElement.children.find(item => item.className === "assistant-voice-toggle");
  const menu = spark.parentElement.children.find(item => item.className === "assistant-voice-menu");
  assert.equal(corner.disabled, false);
  corner.listeners.get("click")({}); assert.equal(menu.hidden, false);
  for (const status of ["preparingArticle", "fetchingRelated", "generating", "resuming"]) {
    ui.panel.renderInsightState({ ...insight, ai: { ...insight.ai, status } });
    assert.equal(corner.disabled, true); assert.equal(menu.hidden, true);
  }
  ui.panel.renderInsightState({ ...insight, busy: true }); assert.equal(corner.disabled, true);
  ui.panel.renderInsightState(insight); assert.equal(corner.disabled, false);
  ui.panel.render(state());
  const disabledSpark = descendants(ui.root).find(item => item.attributes["data-action"] === "getinsights");
  ui.panel.renderInsightState(insight);
  assert.equal(disabledSpark.disabled, true);
  assert.equal(disabledSpark.parentElement.children.find(item => item.className === "assistant-voice-toggle").disabled, true);
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
test("User matching states stay quiet except accessible loading and bottom errors", () => {
  const ui = harness();
  const status = ui.byId("discussion-status"), scene = ui.byId("discussion-loading-scene");
  for (const resolution of [null, { enabled: false, phase: "off" },
    { enabled: true, phase: "unsupported", reason: "unsupported-url" },
    { enabled: true, phase: "unsupported", reason: "rights-restricted" }]) {
    ui.panel.render(state({ phase: "choose-topic", topicId: null, discussion: null, resolution }));
    assert.equal(status.hidden, true);
    assert.equal(scene.hidden, true);
  }
  ui.panel.render(state({ phase: "choose-topic", topicId: null, discussion: null,
    resolution: { enabled: true, phase: "processing" } }));
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, EN.uiLoadingDiscussions);
  assert.equal(status.attributes["data-loading"], "true");
  assert.equal(scene.hidden, false);
  assert.equal(status.nextSibling.id, "discussion-root-dock");
  assert.equal(status.attributes["aria-live"], "polite");
  for (const resolution of [{ enabled: true, phase: "error", reason: "unavailable" },
    { enabled: true, phase: "unsupported", reason: "capture-node-budget" },
    { enabled: true, phase: "unsupported", reason: "missing-region" }]) {
    ui.panel.render(state({ phase: "loading", resolution }));
    assert.equal(scene.hidden, true);
    assert.equal(status.attributes["data-loading"], "false");
    assert.equal(status.textContent, resolution.phase === "error" ? EN.uiMatchingServiceBusy : EN.uiMatchingFailed);
    assert.equal(status.hidden, false);
  }
  ui.panel.render(state({ phase: "error", error: null }));
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, EN.discussionUnavailable);
  ui.panel.render(state({ needsFreshRead: true }));
  assert.equal(status.textContent, EN.discussionReload);
  ui.panel.render(state({ phase: "choose-topic", topicId: null, discussion: null }));
  ui.panel.setMode("developer");
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, EN.discussionChooseStatus);
  ui.panel.setMode("user");
  assert.equal(status.hidden, true);
});

test("same-page matching errors keep a saved discussion visible but disable every write action", () => {
  const ui = harness();
  const snapshot = state({ phase: "loading", sourceId: "source-demo",
    catalog: { ...state().catalog, sources: [{ id: "source-demo", topicId: "topic-demo", title: "Synthetic source" }] },
    resolution: { enabled: true, phase: "error", reason: "conflict" } });
  ui.panel.render(snapshot);
  assert.equal(ui.created.find((item) => item.className === "discussion-thread").hidden, false);
  assert.equal(ui.byId("discussion-loading-scene").hidden, true);
  assert.equal(ui.byId("discussion-status").textContent, EN.uiMatchingServiceBusy);
  assert.equal(ui.byId("discussion-body").disabled, true);
  assert.equal(ui.byId("discussion-submit").disabled, true);
  assert.equal(ui.byId("discussion-ai-insights").disabled, true);
  for (const action of descendants(ui.root).filter((item) => item.attributes["data-action"]))
    assert.equal(action.disabled, true, action.attributes["data-action"]);
});

test("attested saved discussion enables human root/reply controls while AI, private and edit controls wait", () => {
  const ui = harness();
  const snapshot = state({ phase: "loading", humanPostingReady: true, sourceId: "source-demo",
    resolution: { enabled: true, phase: "processing", reason: "matching" },
    draft: { body: "Human message while matching continues", detached: false, mode: "root", targetId: null } });
  snapshot.catalog.sources[0].topicId = snapshot.topicId;
  ui.panel.render(snapshot);
  assert.equal(ui.byId("discussion-body").disabled, false);
  assert.equal(ui.byId("discussion-submit").disabled, false);
  assert.equal(ui.byId("discussion-ai-insights").disabled, true);
  for (const action of descendants(ui.root).filter(item => item.attributes["data-action"]))
    assert.equal(action.disabled, action.attributes["data-action"] !== "reply", action.attributes["data-action"]);
  ui.panel.render({ ...snapshot, draft: { ...snapshot.draft, body: "@AI please answer this" } });
  assert.equal(ui.byId("discussion-body").disabled, false, "the mention remains editable");
  assert.equal(ui.byId("discussion-submit").disabled, true, "AI mentions keep the existing Ready gate");
  ui.panel.render({ ...snapshot, humanPostingReady: false });
  assert.equal(ui.byId("discussion-submit").disabled, true);
});

test("User alternate failures are bounded bottom messages and never mask read or detached warnings", () => {
  const ui = harness();
  const snapshot = state({ sourceId: "source-demo", topicViewMode: "experimental" });
  snapshot.catalog.sources[0].provenance = "owner-local-page-embedding/v1";
  snapshot.catalog.sources[0].topicId = snapshot.topicId;
  ui.panel.render({ ...snapshot, alternateError: "unavailable",
    resolution: { enabled: true, phase: "processing" } });
  const status = ui.byId("discussion-status");
  assert.equal(status.textContent, EN.uiTopicViewFailed);
  assert.equal(status.hidden, false);
  assert.equal(ui.byId("discussion-loading-scene").hidden, true);
  assert.equal(ui.byId("discussion-alternate-notice").hidden, true);
  ui.panel.render({ ...snapshot, error: "conflict", needsFreshRead: true,
    resolution: { enabled: true, phase: "error" }, alternateError: "unavailable",
    priorDiscussionsError: "hostile raw provider text",
    draft: { body: "Keep detached", detached: true, mode: "root", targetId: null } });
  assert.ok(status.textContent.includes(EN.discussionConflict));
  assert.ok(status.textContent.includes(EN.uiMatchingFailed));
  assert.ok(status.textContent.includes(EN.uiTopicViewFailed));
  assert.ok(status.textContent.includes(EN.uiEarlierThreadsUnavailable));
  assert.ok(status.textContent.includes(EN.discussionReload));
  assert.equal(status.textContent.includes("hostile raw"), false);
  assert.equal(ui.byId("discussion-body").value, "Keep detached");
  assert.equal(ui.byId("discussion-submit").disabled, true);
  ui.panel.render(state({ topicViewMode: "experimental", alternateError: "unavailable" }));
  assert.equal(status.hidden, true, "inapplicable synthetic source is not a failed read");
  assert.equal(ui.byId("discussion-loading-scene").hidden, true);
  ui.panel.render(state({ topicViewMode: "experimental", sourceId: null, alternateDiscussion: null }));
  assert.equal(status.hidden, true, "manual Topic without Source is quiet");
  assert.equal(ui.byId("discussion-loading-scene").hidden, true);
});

test("no-topic User view shows no empty composer or Create shortcut, while drafts remain recoverable", () => {
  const ui = harness();
  const composer = ui.byId("discussion-composer");
  const shortcut = ui.byId("discussion-ai-insights");
  const discard = ui.byId("discussion-discard");
  const noTopic = state({ phase: "choose-topic", topicId: null, discussion: null });
  ui.panel.render(noTopic);
  assert.equal(ui.byId("discussion-status").textContent, EN.uiTopicAwaitingPage);
  assert.equal(ui.byId("discussion-status").hidden, true);
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
test('composer displays the frozen topic as inert text, keeps typing available and offers an explicit failed-read retry',()=>{
 let retries=0;const ui=harness(undefined,undefined,undefined,undefined,undefined,{refreshAuthorContext(){retries++;}});
 const pending=state({authorContextEnabled:true,authorContextError:true,draft:{mode:'root',body:'Keep this message',detached:false,targetId:null,authorPendingPage:true}});
 ui.panel.render(pending);assert.equal(ui.byId('discussion-body').disabled,false);assert.equal(ui.byId('discussion-submit').disabled,true);
 assert.equal(ui.byId('discussion-topic-retry').hidden,false);ui.byId('discussion-topic-retry').listeners.get('click')();assert.equal(retries,1);
 const scope={caption:'<img src=x onerror=alert(1)>',id:'first-topic'};
 ui.panel.render({...pending,authorContextError:false,authorContext:{context:{scope:{caption:'New preferred child'}}},draft:{...pending.draft,authorScope:scope}});
 const caption=ui.byId('discussion-topic-caption');assert.equal(caption.textContent,'Topic: '+scope.caption);assert.equal(caption.children.length,0);
 assert.equal(ui.byId('discussion-body').value,'Keep this message');assert.equal(ui.byId('discussion-body').attributes['aria-describedby'],caption.id);ui.panel.dispose();
});
function semanticComposerState(patch={}){
  const current=emptyPageDiscussion(),post=(id,rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',actorType:'human',authorId:'demo-blair',
    body:'Public text '+id,createdAt:'2026-10-27T12:00:00.000Z',edited:false});
  return {...current,semanticAiAvailable:false,semanticWritePending:false,
    semanticSelection:{version:{...current.catalog.version},policyRevision:2,nodeId:'semantic-node',topic:{id:'canonical-a',title:'<Original topic A>',kind:'general'},discussionId:'discussion-a',
      root:{...post('semantic-root'),replies:[{...post('semantic-target','semantic-root'),replyToId:'off-page-parent'}]},targetId:'semantic-target',rootRevision:3,targetRevision:2,
      actors:[{id:'demo-blair',displayName:'<Actual Blair>',type:'human'}]},
    draft:{mode:'reply',semantic:true,targetId:'semantic-target',detached:false,body:'Human reply'},...patch};
}

test('semantic composer shows canonical Topic A quote and page actors without altering the foreground graph',()=>{
  const ui=harness();const current=semanticComposerState(),before=structuredClone(current);ui.panel.render(current);
  assert.equal(ui.byId('discussion-composer').attributes['data-semantic-reply'],'true');
  assert.equal(ui.byId('discussion-reply-context').hidden,false);assert.equal(ui.created.find(n=>n.className==='discussion-new-thread-heading').textContent,'Reply in <Original topic A>');
  assert.equal(ui.created.find(n=>n.className==='discussion-reply-author').textContent,'Replying to @<Actual Blair>');
  assert.equal(ui.created.find(n=>n.className==='discussion-reply-excerpt').textContent,'Public text semantic-target');
  assert.equal(ui.byId('discussion-submit').disabled,false);assert.equal(ui.byId('discussion-composer').parentElement,ui.byId('discussion-root-dock'));
  assert.equal(ui.byId('discussion-origin-disclosure').hidden,false);assert.ok(ui.byId('discussion-origin-disclosure').textContent.includes('<Original topic A>'));
  assert.equal(descendants(ui.byId('discussion-feed')).some(n=>n.attributes['data-post-id']==='semantic-root'),false);assert.deepEqual(current,before);
  const agent=structuredClone(current);Object.assign(agent.semanticSelection.root.replies[0],{actorType:'agent',authorId:'demo-imported-ai',insight:{kind:'generated',operatorId:'demo-blair'}});
  ui.panel.render(agent);assert.equal(ui.created.find(n=>n.className==='discussion-reply-author').textContent,'Replying to AI · @<Actual Blair>');
  assert.equal(descendants(ui.root).some(n=>n.tag==='script'||n.tag==='img'),false);ui.panel.render(state());
  assert.equal(ui.byId('discussion-composer').attributes['data-semantic-reply'],'false');ui.panel.dispose();
});

test('explicitly disabled semantic AI keeps human submission available without invoking the foreground provider',async()=>{
  for(const loading of [false,true]){let current=semanticComposerState({phase:loading?'loading':'ready',humanPostingReady:loading});current.draft.body='@AI is literal human text here';
    const calls=[];const ui=harness(undefined,null,null,null,null,{currentState:()=>current,async submitDraft(){calls.push('submit');return true;}},{semanticAiEnabled:false});
    ui.panel.bindInsight({currentState:()=>({context:{topic:{id:current.topicId},currentSource:{id:current.sourceId}},ai:{planEnabled:true,model:'chosen',status:'idle'}}),
      async createFollowup(){calls.push('followup');},async createInsights(){calls.push('insights');}});ui.panel.render(current);
    assert.equal(ui.byId('discussion-submit').disabled,false);assert.equal(ui.byId('discussion-ai-insights').disabled,true);
    assert.equal(ui.byId('discussion-mention-status').textContent,EN.uiSemanticAiUnavailable);
    ui.byId('discussion-ai-insights').listeners.get('click')();await ui.byId('discussion-composer').listeners.get('submit')({preventDefault(){}});
    assert.deepEqual(calls,['submit']);assert.equal(current.sourceId,'source-demo');ui.panel.dispose();
  }
});

test('semantic submit requires both the selected target and existing human readiness',()=>{
  const ui=harness();for(const alter of [value=>{value.semanticSelection=null;},value=>{value.draft.targetId='wrong-target';},value=>{value.draft.detached=true;},
    value=>{value.needsFreshRead=true;},value=>{value.phase='loading';value.humanPostingReady=false;},value=>{value.busy=true;},value=>{value.semanticWritePending=true;}]){
    const current=semanticComposerState();alter(current);ui.panel.render(current);assert.equal(ui.byId('discussion-submit').disabled,true);
  }ui.panel.dispose();
});

test('uncertain semantic writes require checked acknowledgement and fresh read without automatic resubmission',async()=>{
  let current=semanticComposerState({semanticWritePending:true,needsFreshRead:true});const calls=[];
  const ui=harness(undefined,null,null,null,null,{currentState:()=>current,
    acknowledgeSemanticWriteUncertainty(value){calls.push(['ack',value]);current={...current,semanticWritePending:false};return true;},
    async open(){calls.push('open');ui.panel.render(current);},async submitDraft(){calls.push('submit');}});ui.panel.render(current);
  const checked=ui.byId('discussion-semantic-checked'),action=ui.byId('discussion-semantic-continue');assert.equal(ui.byId('discussion-semantic-uncertainty').hidden,false);
  assert.equal(action.disabled,true);await action.listeners.get('click')();assert.deepEqual(calls,[]);
  checked.checked=true;checked.listeners.get('change')();assert.equal(action.disabled,false);await action.listeners.get('click')();
  assert.deepEqual(calls,[['ack','ACKNOWLEDGE POSSIBLE SEMANTIC REPLY'],'open']);assert.equal(ui.byId('discussion-semantic-uncertainty').hidden,true);
  current={...current,semanticWritePending:true};ui.panel.render(current);checked.checked=true;checked.listeners.get('change')();current={...current,actorId:'demo-blair'};ui.panel.render(current);
  assert.equal(checked.checked,false);assert.equal(action.disabled,true);ui.panel.dispose();assert.equal(checked.listeners.size,0);assert.equal(action.listeners.size,0);
});

test('semantic feed mode hides only canonical lists and restores them without changing drafts or dispatching',()=>{
  const ui=harness();const current=emptyPageDiscussion({draft:{mode:'root',body:'Keep Page B draft',targetId:null,detached:false}});ui.panel.render(current);const calls=ui.calls.length;
  assert.equal(ui.panel.setSemanticFeedMode(true),true);assert.equal(ui.byId('discussion-feed').children.find(n=>n.className==='discussion-thread').hidden,true);
  assert.equal(ui.byId('discussion-related-conversations').hidden,true);assert.equal(ui.byId('discussion-composer').hidden,false);assert.equal(ui.byId('discussion-body').value,'Keep Page B draft');
  assert.equal(ui.byId('discussion-composer').parentElement,ui.byId('discussion-root-dock'));assert.equal(ui.panel.setSemanticFeedMode(false),false);
  assert.equal(ui.byId('discussion-feed').children.find(n=>n.className==='discussion-thread').hidden,false);assert.equal(ui.byId('discussion-body').value,'Keep Page B draft');
  const reply=emptyPageDiscussion({draft:{mode:'reply',body:'Inline Page B draft',targetId:'page-b-root',detached:false}});
  reply.discussion.roots=[{id:'page-b-root',rootId:null,replyToId:null,state:'visible',actorType:'human',authorId:'demo-alex',body:'Foreground root',replies:[]}];ui.panel.render(reply);
  assert.notEqual(ui.byId('discussion-composer').parentElement,ui.byId('discussion-root-dock'));
  ui.panel.setSemanticFeedMode(true);assert.equal(ui.byId('discussion-composer').parentElement,ui.byId('discussion-root-dock'));assert.equal(ui.byId('discussion-body').value,'Inline Page B draft');
  ui.panel.setSemanticFeedMode(false);assert.notEqual(ui.byId('discussion-composer').parentElement,ui.byId('discussion-root-dock'));
  assert.equal(ui.calls.length,calls);ui.panel.dispose();
});
function samePageHistory(root, patch = {}) {
  const base = state();
  const version = { generation: 7, revision: 3 };
  const origin = { sourceId: "source-demo", url: "https://example.org/story", title: "Story" };
  const historicalRoot = { ...root, origin };
  return state({ sourceId: "source-demo", catalog: { ...base.catalog, version,
    topics: [...base.catalog.topics, { id: "older-topic", title: "Older", kind: "manual" }] },
    discussion: { discussionId: "discussion-demo", version, roots: [] },
    priorDiscussions: { sourceId: "source-demo", currentTopicId: "topic-demo", version,
      topics: [{ id: "older-topic", title: "Older", kind: "manual", rootCount: 1 }] },
    earlierDiscussions: [{ topicId: "older-topic", discussionId: "older-discussion", title: "Older",
      version, roots: [historicalRoot] }], ...patch });
}

function emptyPageDiscussion(patch = {}) {
  const base = state();
  const version = { generation: "generation-empty-page", revision: 2 };
  return state({ sourceId: "source-demo", catalog: { ...base.catalog, version,
    sources: [{ id: "source-demo", topicId: "topic-demo", title: "Current page",
      url: "https://example.org/story" }, { id: "related-page", topicId: "other-topic",
      url: "https://example.com/related", title: "<img src=x> Related page" }] },
    discussion: { discussionId: "discussion-demo", version, roots: [] },
    related: { version, results: [{ id: "related-page", topicId: "other-topic", relationship: "related",
      url: "https://example.com/related", title: "<img src=x> Related page" }] }, ...patch });
}

function mentionHarness({ mode = "root", accepted = true, mutateAccepted = value => value,
  aiReady = true, generate = async () => true } = {}) {
  let current = emptyPageDiscussion({ selection: "automatic", draft: { body: "@AI, what is the biggest drawback?", mode,
    targetId: mode === "root" ? null : "existing-root", detached: false } });
  const parent = { id: "existing-root", rootId: null, replyToId: null, state: "visible",
    actorType: "human", authorId: "demo-alex", body: "Product question", replies: [] };
  if (mode !== "root") current.discussion = { ...current.discussion, roots: [parent] };
  const calls = [];
  const ui = harness(undefined, null, null, null, null, {
    currentState: () => current,
    async submitDraft() {
      calls.push("submit");
      if (!accepted) return false;
      const message = { id: "accepted-mention", rootId: mode === "root" ? null : parent.id,
        replyToId: mode === "root" ? null : parent.id, state: "visible", actorType: "human",
        authorId: current.actorId, body: current.draft.body, replies: [] };
      current = mutateAccepted({ ...current,
        draft: { body: "", detached: false, mode: "root", targetId: null },
        discussion: { ...current.discussion, roots: mode === "root" ? [message] : [{ ...parent, replies: [message] }] },
        createdPost: { id: message.id, actorId: current.actorId, sourceId: current.sourceId,
          topicId: current.topicId, discussionId: current.discussion.discussionId } });
      ui.panel.render(current); return true;
    },
  });
  ui.panel.bindInsight({ currentState: () => ({ ai: { planEnabled: aiReady, model: aiReady ? "selected" : "", status: "idle" } }),
    async createFollowup(...args) { calls.push(["generate", ...args]); return generate(); } });
  return { ...ui, calls, current: () => current,
    send: () => ui.byId("discussion-composer").listeners.get("submit")({ preventDefault() {} }) };
}

test("submitting @AI publishes the human post first and requests one reply to its accepted canonical ID", async () => {
  for (const mode of ["root", "reply"]) {
    const ui = mentionHarness({ mode });
    await ui.send();
    assert.deepEqual(ui.calls, ["submit", ["generate", "accepted-mention"]]);
    ui.panel.render(ui.current()); ui.panel.render(ui.current());
    assert.equal(ui.calls.length, 2, "polling cannot replay a deliberate mention");
  }
});

test("failed writes, edits, changed context and mismatched published bodies cannot dispatch an AI mention", async () => {
  for (const options of [
    { accepted: false }, { mode: "edit" },
    { mutateAccepted: value => ({ ...value, actorId: "demo-blair" }) },
    { mutateAccepted: value => ({ ...value, sourceId: null }) },
    { mutateAccepted: value => ({ ...value, needsFreshRead: true }) },
    { mutateAccepted: value => ({ ...value, createdPost: null }) },
    { mutateAccepted: value => ({ ...value, discussion: { ...value.discussion,
      roots: value.discussion.roots.map(root => ({ ...root, body: "Edited elsewhere" })) } }) },
  ]) {
    const ui = mentionHarness(options); await ui.send();
    assert.equal(ui.calls.some(call => Array.isArray(call) && call[0] === "generate"), false);
  }
});

test("missing model or failed mention generation leaves the saved post and offers an explicit retry only", async () => {
  const setup = mentionHarness({ aiReady: false }); await setup.send();
  assert.deepEqual(setup.calls, ["submit"]);
  assert.equal(setup.byId("discussion-mention-status").textContent, EN.uiAiMentionSetup);
  const failed = mentionHarness({ generate: async () => { throw new Error("private provider detail"); } });
  await failed.send();
  assert.equal(failed.byId("discussion-mention-status").textContent, EN.uiAiMentionUnavailable);
  assert.equal(failed.byId("discussion-mention-status").hidden, false);
  assert.equal(failed.current().discussion.roots[0].body, "@AI, what is the biggest drawback?");
});

test("a second submit during AI mention generation cannot publish or invoke twice", async () => {
  let release;
  const ui = mentionHarness({ generate: () => new Promise(resolve => { release = resolve; }) });
  const first = ui.send(); await new Promise(resolve => setImmediate(resolve));
  await ui.send(); assert.deepEqual(ui.calls, ["submit", ["generate", "accepted-mention"]]);
  release(true); await first;
});

test("real discussion and Insight controllers post one AI answer to each deliberate @AI root or nested reply", async () => {
  const ui = harness();
  let sequence = 0, insight;
  const requests = [], commands = [];
  const service = createMemoryDemoService({ nextId: kind => `${kind}-${++sequence}`,
    now: () => "2026-10-15T08:00:00.000Z" });
  const client = {
    health: async () => ({}), catalog: async () => service.catalog(),
    discussion: async id => service.discussion(id), related: async (id, limit) => service.related(id, limit),
    priorDiscussions: async id => service.priorDiscussions(id),
    command: async (expected, command, actor) => {
      commands.push(command);
      const generated = ["share-insight", "share-insight-reply"].includes(command.type);
      return service.command(expected, command, actor, generated ? {
        kind: "generated-insight", operationId: command.operationId, actorId: actor,
        topicId: command.topicId, originSourceId: command.originSourceId, body: command.body,
        rootId: command.rootId ?? null, replyToId: command.replyToId ?? null,
        discussionId: command.discussionId ?? null,
      } : null);
    },
  };
  const discussion = createLocalDiscussionController({ client, session: { isPaired: async () => true },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange: snapshot => { insight?.observe(snapshot); ui.panel.render(snapshot); },
  });
  insight = createInsightController({ shareInsight: review => discussion.shareInsight(review), shareOnCompletion: true,
    randomId: () => `mention-op-${++sequence}`,
    readArticle: async () => ({ url: "https://example.com/", documentId: "synthetic-document", text: "Public product page." }),
    attestArticle: async () => true,
    onStateChange: snapshot => ui.panel.renderInsightState(snapshot),
    aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "synthetic-client", label: "Owner" } }),
      models: async () => [{ slug: "synthetic-model", displayName: "Synthetic" }],
      start: async request => { requests.push(request); return { operationId: request.operationId, state: "running" }; },
      result: async operationId => ({ operationId, state: "completed", result: {
        body: "The biggest drawback is the limited capacity.", model: "synthetic-model", citations: [] } }),
      cancel: async () => true,
    },
  });
  ui.panel.bind(discussion); ui.panel.bindInsight(insight);
  await discussion.open(); await insight.checkConnection(); await insight.loadModels();
  for (const index of [0, 1]) {
    if (index) {
      const roots = discussion.currentState().discussion.roots;
      const generated = roots.flatMap(root => root.replies).find(reply => reply.actorType === "agent");
      assert.ok(generated); assert.equal(discussion.begin("reply", generated.id), true);
    }
    discussion.setDraft(index ? "@ai, explain that drawback" : "@AI, what is the biggest drawback?");
    await ui.byId("discussion-composer").listeners.get("submit")({ preventDefault() {} });
    assert.equal(requests.length, index + 1);
    const question = commands.filter(command => ["create-root", "reply"].includes(command.type)).at(-1);
    const share = commands.filter(command => command.type === "share-insight-reply").at(-1);
    assert.ok(share, "completed response must be published through the exact generated-reply path");
    assert.equal(share.replyToId, requests.at(-1).followupQuestionId);
    const target = discussion.currentState().discussion.roots.flatMap(root => [root, ...root.replies])
      .find(entry => entry.id === share.replyToId);
    assert.equal(target.body, question.body);
    assert.equal(share.body, "The biggest drawback is the limited capacity.");
  }
  await discussion.open(); assert.equal(requests.length, 2);
  insight.dispose(); discussion.dispose(); ui.panel.dispose();
});

test("Discussion never renders related-page suggestions, including empty or tombstone-only conversations", () => {
  const ui = harness(), snapshot = emptyPageDiscussion();
  const deleted = { id: "deleted-root", state: "deleted", replies: [] };
  for (const patch of [{}, { discussion: null }, { discussion: { ...snapshot.discussion, roots: [deleted] } },
    { phase: "loading" }, { phase: "disconnected" }, { needsFreshRead: true },
    { error: "context-changed" }, { topicViewMode: "experimental", alternateDiscussion: {
      sourceId: "source-demo", sourceIds: ["source-demo"], roots: [deleted], pinnedRoots: [] } }]) {
    ui.panel.render({ ...snapshot, ...patch });
    assert.equal(ui.byId("discussion-related-page-suggestions"), undefined);
    assert.equal(descendants(ui.byId("discussion-feed")).some(item => item.className === "related-page-card"), false);
  }
  assert.deepEqual(ui.calls, []);
  assert.ok(ui.byId("discussion-root-dock"));
  ui.panel.dispose();
});

test("hiding page suggestions does not remove developer matching diagnostics or actual conversations", () => {
  const ui = harness();
  ui.panel.render(emptyPageDiscussion());
  assert.equal(ui.byId("discussion-related").hidden, true);
  ui.panel.setMode("developer");
  assert.equal(ui.byId("discussion-related").hidden, false);
  assert.equal(ui.byId("discussion-related-page-suggestions"), undefined);
  ui.panel.render(state());
  assert.ok(descendants(ui.byId("discussion-feed")).some(item => item.attributes["data-post-id"]));
  ui.panel.dispose();
});
test("experimental view shows grouped and pinned roots while cross-topic actions stay disabled", () => {
  const ui = harness();
  const canonical = { id: "root-1", rootId: null, state: "visible", authorId: "demo-alex",
    actorType: "human", body: "Canonical post", replies: [], canonicalTopicId: "topic-demo",
    canonicalDiscussionId: "discussion-demo" };
  const foreign = { ...canonical, id: "foreign-root", body: "From another page",
    canonicalTopicId: "topic-other", canonicalDiscussionId: "discussion-other",
    origin: { sourceId: "source-other", url: "https://example.org/story", title: "Other article" } };
  const snapshot = state({ sourceId: "source-demo", topicViewMode: "experimental",
    discussion: { discussionId: "discussion-demo", roots: [canonical] },
    relatedDiscussions: [{ topicId: "topic-other", title: "Other discussion", rootCount: 1, roots: [] }],
    alternateDiscussion: { sourceId: "source-demo", sourceIds: ["source-demo", "source-other"],
      roots: [foreign], pinnedRoots: [canonical] } });
  ui.panel.render(snapshot);
  const cards = descendants(ui.byId("discussion-alternate-notice").parentElement ?? ui.root)
    .filter((item) => item.attributes?.["data-thread-root-id"]);
  assert.deepEqual(cards.map((card) => card.attributes["data-thread-root-id"]), ["foreign-root", "root-1"]);
  const foreignReply = descendants(cards[0]).find((item) => item.attributes?.["data-action"] === "reply");
  const canonicalReply = descendants(cards[1]).find((item) => item.attributes?.["data-action"] === "reply");
  assert.equal(foreignReply, undefined);
  const openToReply = descendants(cards[0]).find((item) => item.className?.includes("discussion-open-to-reply"));
  assert.equal(openToReply.textContent, EN.uiTopicViewOpenToReply);
  assert.equal(openToReply.href, foreign.origin.url);
  assert.equal(openToReply.referrerPolicy, "no-referrer");
  assert.equal(canonicalReply.disabled, false);
  assert.equal(ui.byId("discussion-alternate-notice").hidden, true);
  assert.ok(descendants(ui.root).some((item) => item.textContent === EN.uiTopicViewPinned));
  assert.equal(ui.byId("discussion-related-conversations").hidden, true);
  ui.panel.render({ ...snapshot, alternateDiscussion: null, alternateError: "unavailable" });
  const fallbackCards = descendants(ui.root).filter((item) => item.attributes?.["data-thread-root-id"]);
  assert.deepEqual(fallbackCards.map((card) => card.attributes["data-thread-root-id"]), ["root-1"]);
  assert.equal(ui.byId("discussion-alternate-notice").hidden, true);
  assert.equal(ui.byId("discussion-related-conversations").hidden, true);
});
test("experimental related-source growth preserves an opened reply branch", () => {
  const ui = harness();
  const root = { id: "root-cloud", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Question", canonicalTopicId: "topic-demo", canonicalDiscussionId: "discussion-demo",
    replies: [{ id: "reply-cloud", rootId: "root-cloud", replyToId: "root-cloud",
      state: "visible", actorType: "human", authorId: "demo-alex", body: "Reply" }] };
  const base = state({ sourceId: "source-demo", topicViewMode: "experimental",
    discussion: { discussionId: "discussion-demo", roots: [root] },
    alternateDiscussion: { sourceId: "source-demo", sourceIds: ["source-demo"],
      roots: [root], pinnedRoots: [] } });
  ui.panel.render(base);
  const branch = () => descendants(ui.root).find((item) => item.attributes?.["data-action"] === "expand" &&
    item.attributes?.["data-contribution-id"] === root.id);
  branch().listeners.get("click")();
  ui.panel.render({ ...base, alternateDiscussion: { ...base.alternateDiscussion,
    sourceIds: ["source-demo", "source-new"] } });
  assert.equal(branch().attributes["aria-expanded"], "true");
});

test("canonical multi-Topic feed is visible even with the legacy view preference and reports incomplete reads", () => {
  const ui = harness();
  const version = { generation: "generation-reference", revision: 3 };
  const primary = { id: "root-1", rootId: null, state: "visible", authorId: "demo-alex", actorType: "human",
    body: "Original message A", replies: [], canonicalTopicId: "topic-demo", canonicalDiscussionId: "discussion-demo" };
  const secondary = { ...primary, id: "root-b", body: "Original message B", canonicalTopicId: "topic-b",
    canonicalDiscussionId: "discussion-b", origin: { sourceId: "source-b", url: "https://example.org/article-b", title: "B" } };
  const snapshot = state({ sourceId: "source-demo", topicViewMode: "classic",
    catalog: { ...state().catalog, version, topics: [{ id: "topic-demo", title: "A", kind: "general" }, { id: "topic-b", title: "B", kind: "general" }],
      sources: [{ id: "source-demo", title: "Middle", url: "https://example.org/middle", provenance: "owner-local-page-embedding/v1",
        topicId: "topic-demo", topicIds: ["topic-b", "topic-demo"] }] },
    discussion: { version, discussionId: "discussion-demo", roots: [primary] },
    alternateDiscussion: { sourceId: "source-demo", policyVersion: "ridge1-fixed-reference-radius/v1",
      representation: RIDGE_REPRESENTATION, sourceIds: ["source-demo", "source-b"], roots: [primary, secondary], pinnedRoots: [] } });
  ui.panel.render(snapshot);
  const cards = descendants(ui.root).filter(item => item.attributes?.["data-thread-root-id"]);
  assert.deepEqual(cards.map(card => card.attributes["data-thread-root-id"]), ["root-1", "root-b"]);
  assert.equal(descendants(cards[1]).some(item => ["reply", "getinsights", "edit", "withdraw"].includes(item.attributes?.["data-action"])), false);
  ui.panel.render({ ...snapshot, alternateDiscussion: null, alternateError: "capacity" });
  assert.ok(descendants(ui.root).some(item => item.textContent.includes(EN.uiTopicMembershipFailed)));
  ui.panel.render({ ...snapshot, sourceId: null });
  assert.equal(descendants(ui.root).some(item => item.attributes?.["data-thread-root-id"] === "root-b"), false);
});
test("Earlier topic navigation stays in Developer Mode and Back remains available", () => {
  const ui = harness();
  const prior = { sourceId: "source-demo", currentTopicId: "topic-demo", topics: [
    { id: "old-topic", title: "<img src=x>", kind: "general", rootCount: 3 },
  ] };
  ui.panel.render(state({ sourceId: "source-demo", priorDiscussions: prior }));
  const details = ui.byId("discussion-prior");
  assert.equal(details.hidden, true);
  ui.panel.setMode("developer");
  assert.equal(details.hidden, false);
  assert.equal(ui.byId("discussion-prior-summary").textContent, EN.uiEarlierDiscussionOnPage.replace("{count}", "3"));
  const action = ui.byId("discussion-prior-list").children[0].children[0];
  assert.equal(action.tag, "button");
  assert.equal(action.textContent, EN.uiEarlierDiscussionEntry.replace("{title}", "<img src=x>").replace("{count}", "3"));
  action.listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["selectTopic", "old-topic"]);
  ui.panel.setMode("user");
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
test("same-page earlier roots and replies share the ordinary feed with inline actions", () => {
  const ui = harness();
  const origin = { sourceId: "source-demo", url: "https://example.org/story", title: "Story" };
  const current = { id: "current-root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Current question", origin, replies: [] };
  const older = { id: "older-root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Earlier question", origin, replies: [{ id: "older-reply", rootId: "older-root",
      replyToId: "older-root", state: "visible", actorType: "human", authorId: "demo-alex",
      body: "Earlier answer" }] };
  const otherSource = { ...older, id: "other-source-root",
    origin: { ...origin, sourceId: "another-source" } };
  const version = { generation: 1, revision: 2 };
  const snapshot = state({ sourceId: "source-demo", discussion: { discussionId: "discussion-demo", version, roots: [current] },
    catalog: { ...state().catalog, version,
      topics: [...state().catalog.topics, { id: "older-topic", title: "Older", kind: "manual" }] },
    priorDiscussions: { sourceId: "source-demo", currentTopicId: "topic-demo", version,
      topics: [{ id: "older-topic", title: "Older", kind: "manual", rootCount: 1 }] },
    earlierDiscussions: [{ topicId: "older-topic", discussionId: "older-discussion", version,
      title: "Older", roots: [current, older, otherSource] }] });
  ui.panel.render(snapshot);
  const thread = ui.created.find((item) => item.className === "discussion-thread");
  const groups = descendants(thread).filter((item) => item.attributes["data-thread-root-id"]);
  assert.deepEqual(groups.map((item) => item.attributes["data-thread-root-id"]), ["current-root", "older-root"]);
  assert.equal(groups[1].attributes["data-earlier-discussion"], "true");
  assert.ok(descendants(groups[1]).some((item) => item.textContent === "Earlier answer"));
  assert.equal(descendants(groups[1]).filter((item) => item.attributes["data-action"] === "reply").length, 2);
  assert.equal(descendants(groups[1]).filter((item) => item.attributes["data-action"] === "getinsights").length, 2);
  assert.equal(descendants(groups[1]).some((item) =>
    ["edit", "withdraw", "openconversation"].includes(item.attributes["data-action"])), false);
  assert.equal(descendants(groups[1]).find((item) => item.tag === "a").href, origin.url);
  assert.equal(ui.byId("discussion-prior").hidden, true);
  assert.equal(descendants(thread).some((item) => item.className === "discussion-earlier-heading user-only"), false);
  const reply = descendants(groups[1]).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "older-reply");
  const staleClick = reply.listeners.get("click");
  staleClick();
  assert.equal(ui.calls.at(-1)[0], "begin");
  assert.equal(ui.calls.at(-1)[1], "reply");
  assert.equal(ui.calls.at(-1)[2], "older-reply");
  assert.equal(ui.calls.at(-1)[3].topicId, "older-topic");
  const count = ui.calls.length;
  ui.panel.render({ ...snapshot, sourceId: "another-source" });
  staleClick();
  assert.equal(ui.calls.length, count);
  ui.panel.render({ ...snapshot, earlierDiscussions: [] });
  staleClick();
  assert.equal(ui.calls.length, count);
});
test("nested historical reply uses one inline form and confirmed post unfolds its ancestry", () => {
  const ui = harness();
  const parent = { id: "older-parent", rootId: "older-root", replyToId: "older-root",
    state: "visible", actorType: "human", authorId: "demo-alex", body: "Parent" };
  const target = { id: "older-target", rootId: "older-root", replyToId: parent.id,
    state: "visible", actorType: "human", authorId: "demo-alex", body: "Target" };
  const root = { id: "older-root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Historical opener", replies: [parent, target], createdAt: "2024-01-01T00:00:00Z" };
  const snapshot = samePageHistory(root);
  ui.panel.render(snapshot);
  const action = descendants(ui.root).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === target.id);
  action.listeners.get("click")();
  assert.equal(ui.calls.at(-1)[3].discussionId, "older-discussion");
  const binding = { topicId: "older-topic", discussionId: "older-discussion", rootId: root.id,
    rootBody: root.body, targetBody: target.body };
  const draft = { ...snapshot, draft: { body: "A reply", detached: false,
    mode: "reply", targetId: target.id, targetBinding: binding } };
  ui.panel.render(draft);
  const composer = ui.byId("discussion-composer");
  const body = ui.byId("discussion-body");
  const post = descendants(ui.root).find((item) => item.attributes["data-post-id"] === target.id);
  assert.equal(composer.parentElement, post.parentElement);
  assert.equal(post.nextSibling, composer);
  assert.equal(composer.attributes["data-inline-target"], "valid");
  assert.equal(ui.byId("discussion-ai-insights").hidden, true);
  assert.equal(ui.byId("discussion-submit").disabled, false);
  body.focus();
  const changed = { ...draft, earlierDiscussions: snapshot.earlierDiscussions.map((prior) => ({ ...prior,
    roots: prior.roots.map((entry) => ({ ...entry, replies: [...entry.replies] })) })) };
  ui.panel.render(changed);
  assert.equal(ui.document.activeElement, body);
  assert.equal(composer.parentElement, descendants(ui.root).find((item) =>
    item.attributes["data-post-id"] === target.id).parentElement);
  const created = { id: "new-historical-reply", rootId: root.id, replyToId: target.id,
    state: "visible", actorType: "human", authorId: "demo-alex", body: "A reply" };
  const arrival = { ...snapshot, earlierDiscussions: [{ ...snapshot.earlierDiscussions[0],
    roots: [{ ...snapshot.earlierDiscussions[0].roots[0], replies: [...root.replies, created] }] }],
    createdPost: { id: created.id, actorId: snapshot.actorId, sourceId: snapshot.sourceId,
      currentTopicId: snapshot.topicId, topicId: "older-topic", discussionId: "older-discussion",
      rootId: root.id } };
  ui.panel.render(arrival);
  const createdCard = descendants(ui.root).find((item) => item.attributes["data-post-id"] === created.id);
  assert.equal(ui.document.activeElement, createdCard);
  const toggle = (id) => descendants(ui.root).find((item) => item.attributes["data-action"] === "expand" &&
    item.attributes["data-contribution-id"] === id);
  assert.equal(toggle(root.id).attributes["aria-expanded"], "true");
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "true");
  assert.equal(toggle(target.id).attributes["aria-expanded"], "true");
  toggle(target.id).listeners.get("click")();
  ui.panel.render({ ...arrival, earlierDiscussions: arrival.earlierDiscussions.map((prior) => ({ ...prior })) });
  assert.equal(toggle(target.id).attributes["aria-expanded"], "false");
});
test("historical sparkle is inline and stale or disabled clicks never invoke generation", () => {
  const ui = harness();
  const calls = [];
  const root = { id: "older-root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Historical opener", replies: [] };
  const snapshot = samePageHistory(root);
  const host = ui.document.createElement("div"); host.id = "app-discussion-insights-host";
  const progress = ui.document.createElement("p"); progress.id = "insight-followup-progress";
  host.append(progress); ui.root.append(host);
  ui.panel.bindInsight({ createFollowup: (...args) => {
    calls.push(args);
    ui.panel.renderInsightState({ context: { topic: { id: snapshot.topicId },
      currentSource: { id: snapshot.sourceId } },
    followup: { topicId: "older-topic", discussionId: "older-discussion", rootId: root.id,
      replyToId: root.id, rootBody: root.body, targetBody: root.body }, ai: { status: "generating" } });
    return Promise.resolve(true);
  } });
  ui.panel.render(snapshot);
  const sparkle = descendants(ui.root).find((item) => item.attributes["data-action"] === "getinsights" &&
    item.attributes["data-contribution-id"] === root.id);
  const staleClick = sparkle.listeners.get("click");
  staleClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].topicId, "older-topic");
  const card = descendants(ui.root).find((item) => item.attributes["data-post-id"] === root.id);
  assert.equal(host.parentElement, card.parentElement);
  assert.ok(progress.scrollCalls?.length);
  ui.panel.render({ ...snapshot, busy: true });
  const disabled = descendants(ui.root).find((item) => item.attributes["data-action"] === "getinsights");
  assert.equal(disabled.disabled, true);
  disabled.listeners.get("click")();
  assert.equal(calls.length, 1);
  ui.panel.render({ ...snapshot, earlierDiscussions: [] });
  staleClick();
  assert.equal(calls.length, 1);
});
test("cloned canonical alternate root keeps its actions while foreign projection stays read-only", () => {
  const ui = harness();
  const canonical = { id: "current", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Current body", replies: [], canonicalTopicId: "topic-demo",
    canonicalDiscussionId: "discussion-demo" };
  const foreign = { ...canonical, id: "foreign", body: "Foreign body",
    canonicalTopicId: "other-topic", canonicalDiscussionId: "other-discussion" };
  ui.panel.render(state({ sourceId: "source-demo", topicViewMode: "experimental",
    discussion: { discussionId: "discussion-demo", roots: [canonical] },
    alternateDiscussion: { sourceId: "source-demo", sourceIds: ["source-demo"],
      roots: [foreign], pinnedRoots: [{ ...canonical }] } }));
  const groups = descendants(ui.root).filter((item) => item.attributes["data-thread-root-id"]);
  assert.equal(descendants(groups[0]).some((item) => item.attributes["data-action"] === "reply"), false);
  assert.equal(descendants(groups[1]).some((item) => item.attributes["data-action"] === "reply"), true);
  assert.equal(descendants(groups[1]).some((item) => item.attributes["data-action"] === "getinsights"), true);
});
test("dated current and same-page historical threads share chronological order", () => {
  const ui = harness();
  const historical = { id: "historical", state: "visible", actorType: "human",
    authorId: "demo-alex", body: "Past", replies: [], createdAt: "2024-01-01T00:00:00Z" };
  const current = { ...historical, id: "current", body: "Now", createdAt: "2025-01-01T00:00:00Z" };
  const snapshot = samePageHistory(historical, { discussion: { discussionId: "discussion-demo",
    version: { generation: 7, revision: 3 }, roots: [current] } });
  ui.panel.render(snapshot);
  const thread = ui.created.find((item) => item.className === "discussion-thread");
  assert.deepEqual(descendants(thread).filter((item) => item.attributes["data-thread-root-id"])
    .map((item) => item.attributes["data-thread-root-id"]), ["historical", "current"]);
});
test("canonical same-page history replaces its alternate projection without duplicate or lost actions", () => {
  const ui = harness();
  const child = { id: "historical-child", rootId: "historical", replyToId: "historical",
    state: "visible", actorType: "human", authorId: "demo-alex", body: "Full child" };
  const historical = { id: "historical", state: "visible", actorType: "human",
    authorId: "demo-alex", body: "Full historical body", replies: [child] };
  const foreign = { ...historical, id: "foreign", body: "Foreign projection", replies: [],
    canonicalTopicId: "foreign-topic", canonicalDiscussionId: "foreign-discussion" };
  const snapshot = samePageHistory(historical, { topicViewMode: "experimental",
    alternateDiscussion: { sourceId: "source-demo", sourceIds: ["source-demo"],
      roots: [{ ...historical, body: "Stale projection", replies: [] }, foreign], pinnedRoots: [] } });
  ui.panel.render({ ...snapshot, earlierDiscussions: [] });
  const thread = ui.created.find((item) => item.className === "discussion-thread");
  assert.equal(descendants(thread).filter((item) => item.attributes["data-thread-root-id"] === "historical").length, 1);
  assert.equal(descendants(thread).some((item) => item.textContent === "Stale projection"), true);
  assert.equal(descendants(thread).some((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "historical"), false);
  ui.panel.render(snapshot);
  const groups = descendants(thread).filter((item) => item.attributes["data-thread-root-id"]);
  assert.deepEqual(groups.map((item) => item.attributes["data-thread-root-id"]), ["historical", "foreign"]);
  assert.equal(groups[0].attributes["data-earlier-discussion"], "true");
  assert.equal(descendants(groups[0]).some((item) => item.textContent === "Full historical body"), true);
  assert.equal(descendants(groups[0]).some((item) => item.textContent === "Stale projection"), false);
  assert.equal(descendants(groups[0]).some((item) => item.attributes["data-action"] === "reply"), true);
  assert.equal(descendants(groups[0]).some((item) => item.attributes["data-action"] === "getinsights"), true);
  assert.equal(descendants(groups[1]).some((item) => item.attributes["data-action"] === "reply"), false);
  const changedBody = { ...snapshot, earlierDiscussions: [{ ...snapshot.earlierDiscussions[0],
    roots: [{ ...snapshot.earlierDiscussions[0].roots[0], body: "Corrected historical body" }] }] };
  ui.panel.render(changedBody);
  assert.equal(descendants(thread).some((item) => item.textContent === "Corrected historical body"), true);
  assert.equal(descendants(thread).some((item) => item.textContent === "Full historical body"), false);
  ui.panel.render({ ...changedBody, busy: true });
  const busyReply = descendants(thread).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "historical");
  assert.equal(busyReply.disabled, true);
  ui.panel.render(snapshot);
  const reply = descendants(thread).find((item) => item.attributes["data-action"] === "reply" &&
    item.attributes["data-contribution-id"] === "historical");
  reply.listeners.get("click")();
  assert.equal(ui.calls.at(-1)[3].topicId, "older-topic");
  const draft = { ...snapshot, draft: { body: "Reply", detached: false, mode: "reply",
    targetId: historical.id, targetBinding: { topicId: "older-topic", discussionId: "older-discussion",
      rootId: historical.id, rootBody: historical.body, targetBody: historical.body } } };
  ui.panel.render(draft);
  const card = descendants(thread).find((item) => item.attributes["data-post-id"] === historical.id);
  assert.equal(ui.byId("discussion-composer").parentElement, card.parentElement);
  assert.equal(card.nextSibling, ui.byId("discussion-composer"));
});
test("canonical message sparkle remains visible but disabled when Source is unavailable or busy", () => {
  const ui = harness();
  const followups = [];
  ui.panel.bindInsight({ createFollowup: (id) => { followups.push(id); return Promise.resolve(true); } });
  const root = { id: "root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Question", replies: [] };
  for (const patch of [{ sourceId: null }, { sourceId: "source-demo", busy: true },
    { sourceId: "source-demo", needsFreshRead: true },
    { sourceId: "source-demo", error: "context-changed" }]) {
    ui.panel.render(state({ discussion: { discussionId: "discussion-demo", roots: [root] }, ...patch }));
    const sparkle = descendants(ui.root).find((item) => item.attributes["data-action"] === "getinsights");
    assert.ok(sparkle);
    assert.equal(sparkle.disabled, true);
    assert.equal(sparkle.attributes["aria-label"], EN.uiGenerateInsightReplyUnavailable);
    sparkle.listeners.get("click")();
    assert.deepEqual(followups, []);
  }
  ui.panel.render(state({ sourceId: "source-demo",
    discussion: { discussionId: "discussion-demo", roots: [root] } }));
  const restored = descendants(ui.root).find((item) => item.attributes["data-action"] === "getinsights");
  assert.equal(restored.disabled, false);
  assert.equal(restored.attributes["aria-label"], EN.uiGenerateInsightReplyLabel);
});
test("connected settings and persistent composer dock retain their DOM order", () => {
  const ui = harness();
  const settings = ui.byId("discussion-connection-settings");
  const counts = ui.byId("discussion-counts");
  const dock = ui.byId("discussion-root-dock");
  assert.ok(ui.root.children.indexOf(settings) < ui.root.children.indexOf(dock));
  const sameChildren = [...ui.root.children];
  ui.panel.render(state());
  assert.deepEqual(ui.root.children, sameChildren);
  ui.panel.render(state({ phase: "disconnected", catalog: null, discussion: null, related: null }));
  assert.ok(ui.root.children.indexOf(settings) < ui.root.children.indexOf(ui.byId("discussion-feed")));
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
  assert.equal(card.children[1].textContent, EN.uiShowReplies.replace("{count}", "3"));
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
test("User threads omit deleted leaves and all-deleted roots but keep arbitrary-depth deleted connectors", () => {
  const ui = harness();
  const reply = (id, replyToId, stateValue = "deleted") => ({ id, rootId: "kept-root",
    replyToId, state: stateValue, authorId: "demo-alex", actorType: "human", body: id });
  const kept = { id: "kept-root", state: "deleted", replies: [
    reply("visible-grandchild", "deleted-parent", "visible"),
    reply("deleted-leaf", "kept-root"),
    reply("deleted-parent", "deleted-grandparent"),
    reply("deleted-grandparent", "kept-root"),
    reply("deleted-sibling", "deleted-grandparent"),
  ] };
  const empty = { id: "empty-root", state: "deleted", replies: [
    { id: "empty-child", replyToId: "empty-root", state: "deleted" } ] };
  ui.panel.render(state({ discussion: { roots: [kept, empty] } }));
  const posts = () => descendants(ui.root).filter((item) => item.attributes?.["data-post-id"]);
  assert.deepEqual(posts().map((item) => item.attributes["data-post-id"]),
    ["kept-root", "deleted-grandparent", "deleted-parent", "visible-grandchild"]);
  assert.equal(descendants(ui.root).filter((item) => item.className === "discussion-thread-card").length, 1);
  const toggle = (id) => descendants(ui.root).find((item) => item.attributes?.["data-action"] === "expand" &&
    item.attributes["data-contribution-id"] === id);
  for (const id of ["kept-root", "deleted-grandparent", "deleted-parent"])
    assert.equal(toggle(id).textContent, EN.uiShowReply.replace("{count}", "1"));
  toggle("kept-root").listeners.get("click")();
  toggle("deleted-grandparent").listeners.get("click")();
  toggle("deleted-parent").listeners.get("click")();
  assert.equal(descendants(ui.root).filter((item) => item.textContent === EN.discussionDeleted).length, 3);
  ui.panel.setMode("developer");
  assert.equal(posts().length, 8);
});
test("a newly created reply remains revealed through a deleted connector and pruning clears it", () => {
  const ui = harness();
  const root = { id: "reveal-root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Opening", replies: [
      { id: "deleted-connector", rootId: "reveal-root", replyToId: "reveal-root", state: "deleted" },
      { id: "new-grandchild", rootId: "reveal-root", replyToId: "deleted-connector",
        state: "visible", actorType: "human", authorId: "demo-alex", body: "New reply" },
    ] };
  const snapshot = state({ discussion: { discussionId: "reveal-discussion", roots: [root] } });
  const createdPost = { id: "new-grandchild", actorId: snapshot.actorId, sourceId: snapshot.sourceId,
    topicId: snapshot.topicId, discussionId: snapshot.discussion.discussionId };
  ui.panel.render({ ...snapshot, createdPost });
  const toggle = (id) => descendants(ui.root).find((item) => item.attributes?.["data-action"] === "expand" &&
    item.attributes["data-contribution-id"] === id);
  assert.equal(toggle("reveal-root").attributes["aria-expanded"], "true");
  assert.equal(toggle("deleted-connector").attributes["aria-expanded"], "true");
  assert.equal(ui.document.activeElement?.attributes?.["data-post-id"], "new-grandchild");
  const withdrawn = { ...snapshot, discussion: { ...snapshot.discussion, roots: [{ ...root,
    replies: root.replies.map((reply) => reply.id === "new-grandchild"
      ? { ...reply, state: "deleted" } : reply) }] } };
  ui.panel.render(withdrawn);
  assert.equal(descendants(ui.root).some((item) => item.attributes?.["data-post-id"] === "deleted-connector"), false);
  assert.equal(descendants(ui.root).some((item) => item.attributes?.["data-post-id"] === "new-grandchild"), false);
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
  assert.equal(ui.document.activeElement.className, "discussion-thread");
  assert.equal(descendants(ui.root).some((item) => item.attributes["data-post-id"] === "focus-root"), false);
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
  const actions = descendants(card).filter((item) => item.tag === "button" && item.attributes["data-action"])
    .map((item) => item.attributes["data-action"]);
  assert.deepEqual(actions, ["reply", "getinsights", "withdraw"]);
  assert.equal(descendants(card).find((item) => item.attributes["data-action"] === "getinsights").disabled, true);
  descendants(card).find((item) => item.attributes["data-action"] === "withdraw").listeners.get("click")();
  assert.deepEqual(ui.calls.at(-1), ["withdraw", "ai-root"]);
  ui.panel.render(state({ discussion: { roots: [{ id: "ai-root", rootId: null, state: "deleted", replies: agent.replies }] } }));
  assert.ok(descendants(ui.root).some((item) => item.textContent === "Deleted by user"));
  assert.ok(descendants(ui.root).some((item) => item.textContent === "Question"));
});
test("each visible canonical message offers one-click follow-up", () => {
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
  ui.panel.render(state({ sourceId: "source-demo", discussion: { roots: [root] } }));
  const actions = descendants(ui.root).filter((item) => item.attributes["data-action"] === "getinsights");
  assert.deepEqual(actions.map((item) => item.attributes["data-contribution-id"]),
    ["robot-root", "own-question", "other-question"]);
  assert.equal(actions[1].textContent, "");
  assert.match(actions[1].className, /discussion-action-robot/u);
  assert.equal(actions[1].attributes["aria-label"], EN.uiGenerateInsightReplyLabel);
  assert.equal(actions[1].title, EN.uiGenerateInsightReplyLabel);
  actions[1].listeners.get("click")();
  assert.deepEqual(navigation, []);
  assert.deepEqual(followups, ["own-question"]);
});
test("follow-up Insight host stays beneath the exact question through generation and result", () => {
  const ui = harness();
  const thread = ui.byId("discussion-feed").children.find((item) => item.className === "discussion-thread");
  const host = ui.document.createElement("div"); host.id = "app-discussion-insights-host";
  const workspace = ui.document.createElement("details"); workspace.id = "insight-workspace";
  const focusedControl = ui.document.createElement("button"); workspace.append(focusedControl); host.append(workspace);
  ui.byId("discussion-feed").insertBefore(host, thread);
  const robot = { id: "robot-root", rootId: null, state: "visible", actorType: "agent",
    authorId: "demo-imported-ai", insight: { kind: "generated", operatorId: "demo-alex" }, body: "Answer",
    replies: [{ id: "question-one", rootId: "robot-root", replyToId: "robot-root", state: "visible",
      actorType: "human", authorId: "demo-alex", body: "First question" },
    { id: "question-two", rootId: "robot-root", replyToId: "robot-root", state: "visible",
      actorType: "human", authorId: "demo-alex", body: "Second question" }] };
  const snapshot = state({ sourceId: "source-demo", discussion: { discussionId: "discussion-demo", roots: [robot] } });
  ui.panel.render(snapshot);
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  const followup = { discussionId: "discussion-demo", rootId: "robot-root", replyToId: "question-two" };
  for (const status of ["preparingArticle", "generating", "generated"]) {
    ui.panel.renderInsightState({ context, followup, ai: { status, result: status === "generated" ? { body: "Draft" } : null } });
    const question = descendants(ui.root).find((item) => item.attributes["data-post-id"] === "question-two");
    assert.equal(question.nextSibling, host);
    assert.equal(descendants(ui.root).filter((item) => item === host).length, 1);
    assert.equal(ui.byId("discussion-composer").parentElement, ui.byId("discussion-root-dock"));
    assert.equal(ui.byId("discussion-insight-activity").hidden, true);
    assert.equal(ui.byId("discussion-insight-activity").textContent, "");
  }
  focusedControl.focus();
  ui.panel.render({ ...snapshot, discussion: { ...snapshot.discussion,
    roots: [{ ...robot, replies: [...robot.replies, { id: "question-three", rootId: "robot-root",
      replyToId: "robot-root", state: "visible", actorType: "human", authorId: "demo-alex", body: "Third" }] }] } });
  assert.equal(ui.document.activeElement, focusedControl);
  assert.equal(descendants(ui.root).find((item) => item.attributes["data-post-id"] === "question-two").nextSibling, host);
  ui.panel.render({ ...snapshot, discussion: { ...snapshot.discussion,
    roots: [{ ...robot, replies: robot.replies.map((reply) => reply.id === "question-two"
      ? { ...reply, state: "deleted" } : reply) }] } });
  assert.equal(host.parentElement, ui.byId("discussion-feed"));
  assert.equal(host.nextSibling, thread);
  assert.equal(ui.byId("discussion-insight-activity").hidden, false);
});
test("follow-up host accepts exact canonical root and nested targets through posting", () => {
  const ui = harness();
  const thread = ui.byId("discussion-feed").children.find((item) => item.className === "discussion-thread");
  const host = ui.document.createElement("div"); host.id = "app-discussion-insights-host";
  ui.byId("discussion-feed").insertBefore(host, thread);
  const root = { id: "human-root", state: "visible", actorType: "human", authorId: "demo-blair",
    body: "Opening", replies: [
      { id: "human-reply", rootId: "human-root", replyToId: "human-root", state: "visible",
        actorType: "human", authorId: "demo-alex", body: "First" },
      { id: "nested-agent", rootId: "human-root", replyToId: "human-reply", state: "visible",
        actorType: "agent", authorId: "demo-ai", insight: { kind: "generated", operatorId: "demo-alex" },
        body: "Nested" },
    ] };
  const snapshot = state({ sourceId: "source-demo",
    discussion: { discussionId: "discussion-demo", roots: [root] } });
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  ui.panel.render(snapshot);
  for (const targetId of ["human-root", "nested-agent"]) {
    const binding = { discussionId: "discussion-demo", rootId: "human-root", replyToId: targetId };
    ui.panel.renderInsightState({ context, followup: binding, ai: { status: "generating" } });
    const selected = descendants(ui.root).find((item) => item.attributes["data-post-id"] === targetId);
    assert.equal(selected.nextSibling, host);
    ui.panel.render({ ...snapshot, busy: true });
    assert.equal(descendants(ui.root).find((item) => item.attributes["data-post-id"] === targetId).nextSibling, host);
    ui.panel.render(snapshot);
  }
  ui.panel.renderInsightState({ context, followup: { discussionId: "discussion-demo",
    rootId: "human-root", replyToId: "missing" }, ai: { status: "generating" } });
  assert.equal(host.parentElement, ui.byId("discussion-feed"));
  assert.equal(host.nextSibling, thread);
});
test("deliberate robot click scrolls only its validated inline progress into view", () => {
  const ui = harness();
  const thread = ui.byId("discussion-feed").children.find((item) => item.className === "discussion-thread");
  const host = ui.document.createElement("div"); host.id = "app-discussion-insights-host";
  const progress = ui.document.createElement("p"); progress.id = "insight-followup-progress";
  progress.hidden = true;
  const scrolls = [];
  progress.scrollIntoView = (options) => scrolls.push(options);
  host.append(progress); ui.byId("discussion-feed").insertBefore(host, thread);
  const robot = { id: "robot-root", rootId: null, state: "visible", actorType: "agent",
    authorId: "demo-imported-ai", insight: { kind: "generated", operatorId: "demo-alex" }, body: "Answer",
    replies: [{ id: "question", rootId: "robot-root", replyToId: "robot-root", state: "visible",
      actorType: "human", authorId: "demo-alex", body: "Why?" }] };
  const snapshot = state({ sourceId: "source-demo", discussion: { discussionId: "discussion-demo", roots: [robot] } });
  ui.panel.render(snapshot);
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  const followup = { discussionId: "discussion-demo", rootId: "robot-root", replyToId: "question" };
  ui.panel.bindInsight({ currentState: () => ({ context, followup: null, ai: { status: "idle" } }),
    createFollowup: () => {
      progress.hidden = false;
      ui.panel.renderInsightState({ context, followup, ai: { status: "preparingArticle" } });
      return Promise.resolve(true);
    } });
  const action = descendants(ui.root).find((item) => item.attributes["data-action"] === "getinsights" &&
    item.attributes["data-contribution-id"] === "question");
  action.listeners.get("click")();
  assert.deepEqual(scrolls, [{ block: "nearest", behavior: "instant" }]);
  assert.equal(ui.byId("discussion-insight-activity").hidden, true);
  ui.panel.renderInsightState({ context, followup, ai: { status: "generating" } });
  ui.panel.render({ ...snapshot, discussion: { ...snapshot.discussion, roots: [{ ...robot }] } });
  assert.equal(scrolls.length, 1);
});
test("follow-up host rejects a foreign or stale canonical context", () => {
  const ui = harness();
  const thread = ui.byId("discussion-feed").children.find((item) => item.className === "discussion-thread");
  const host = ui.document.createElement("div"); host.id = "app-discussion-insights-host";
  ui.byId("discussion-feed").insertBefore(host, thread);
  const robot = { id: "robot-root", rootId: null, state: "visible", actorType: "agent",
    authorId: "demo-imported-ai", insight: { kind: "generated", operatorId: "demo-alex" }, body: "Answer",
    replies: [{ id: "question", rootId: "robot-root", replyToId: "robot-root", state: "visible",
      actorType: "human", authorId: "demo-alex", body: "Why?" }] };
  const snapshot = state({ sourceId: "source-demo", discussion: { discussionId: "discussion-demo", roots: [robot] } });
  ui.panel.render(snapshot);
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  const binding = { discussionId: "other-discussion", rootId: "robot-root", replyToId: "question" };
  for (const [otherContext, followup] of [[context, binding],
    [{ ...context, currentSource: { id: "other-source" } }, { ...binding, discussionId: "discussion-demo" }],
    [context, { ...binding, discussionId: "discussion-demo", replyToId: "missing" }]]) {
    ui.panel.renderInsightState({ context: otherContext, followup, ai: { status: "generating" } });
    assert.equal(host.parentElement, ui.byId("discussion-feed"));
    assert.equal(host.nextSibling, thread);
  }
});
test("manual imports can start follow-ups but withdrawn targets cannot", () => {
  const ui = harness();
  const directReply = { id: "question", rootId: "robot-root", replyToId: "robot-root", state: "visible", actorType: "human",
    authorId: "demo-alex", body: "Why?" };
  const root = { id: "robot-root", rootId: null, state: "visible", authorId: "demo-imported-ai",
    actorType: "agent", insight: { kind: "manual-import", operatorId: "demo-alex" }, body: "Opener",
    replies: [directReply] };
  const snapshot = () => state({ sourceId: "source-demo", discussion: { roots: [root] } });
  ui.panel.render(snapshot());
  const actions = () => descendants(ui.root).filter((item) => item.attributes["data-action"] === "getinsights");
  assert.deepEqual(actions().map((item) => item.attributes["data-contribution-id"]), ["robot-root", "question"]);
  directReply.state = "deleted"; ui.panel.render(snapshot());
  assert.deepEqual(actions().map((item) => item.attributes["data-contribution-id"]), ["robot-root"]);
  root.state = "deleted"; ui.panel.render(snapshot());
  assert.equal(actions().length, 0);
});
test("per-message sparkle targets the exact visible canonical message without sending draft text", () => {
  const ui = harness();
  const calls = [];
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  ui.panel.bindInsight({ currentState: () => ({ context,
    ai: { planEnabled: true, model: "chosen", status: "idle" } }),
    createFollowup: (id) => { calls.push(["followup", id]); return Promise.resolve(true); },
    createInsights: (options) => { calls.push(["root", options]); return Promise.resolve(true); } });
  const root = { id: "root", state: "visible", actorType: "human", authorId: "demo-blair",
    body: "Blair's opener", replies: [
      { id: "other-reply", rootId: "root", replyToId: "root", state: "visible", actorType: "human",
        authorId: "demo-blair", body: "Blair's reply" },
      { id: "nested-ai", rootId: "root", replyToId: "other-reply", state: "visible", actorType: "agent",
        authorId: "demo-ai", insight: { kind: "generated", operatorId: "demo-alex" }, body: "AI reply" },
    ] };
  const snapshot = (mode, targetId) => state({ sourceId: "source-demo",
    discussion: { discussionId: "discussion-demo", roots: [root] },
    draft: { mode, targetId, body: "Unsent human text", detached: false } });
  const shortcut = ui.byId("discussion-ai-insights");
  for (const target of ["root", "other-reply", "nested-ai"]) {
    ui.panel.render(snapshot("reply", target));
    assert.equal(shortcut.hidden, true);
    const action = descendants(ui.root).find((item) => item.attributes["data-action"] === "getinsights" &&
      item.attributes["data-contribution-id"] === target);
    assert.ok(action);
    const body = ui.byId("discussion-body");
    body.focus();
    action.listeners.get("click")();
    assert.equal(body.value, "Unsent human text");
    assert.equal(ui.document.activeElement, body);
  }
  assert.deepEqual(calls, [["followup", "root"], ["followup", "other-reply"], ["followup", "nested-ai"]]);
  ui.panel.render(snapshot("root", null));
  assert.equal(shortcut.attributes["data-followup"], "false");
  shortcut.listeners.get("click")();
  assert.deepEqual(calls.at(-1), ["root", { automatic: true }]);
});

test("reply composer has no extra sparkle for removed, foreign, detached or stale targets", () => {
  const ui = harness();
  const calls = [];
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  ui.panel.bindInsight({ currentState: () => ({ context,
    ai: { planEnabled: true, model: "chosen", status: "idle" } }),
    createFollowup: (id) => { calls.push(id); return Promise.resolve(true); },
    createInsights: () => { calls.push("wrong-root"); return Promise.resolve(true); } });
  const root = { id: "root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Opener", replies: [{ id: "reply", rootId: "root", replyToId: "root", state: "visible",
      actorType: "human", authorId: "demo-blair", body: "Published" }] };
  const snapshot = (overrides = {}) => state({ sourceId: "source-demo",
    discussion: { discussionId: "discussion-demo", roots: [root] },
    draft: { mode: "reply", targetId: "reply", body: "Do not send this", detached: false }, ...overrides });
  const shortcut = ui.byId("discussion-ai-insights");
  ui.panel.render(snapshot());
  assert.equal(shortcut.hidden, true);
  for (const changed of [
    snapshot({ draft: { mode: "reply", targetId: "missing", body: "Do not send this", detached: false } }),
    snapshot({ draft: { mode: "reply", targetId: "reply", body: "Do not send this", detached: true } }),
    snapshot({ phase: "loading" }),
    snapshot({ needsFreshRead: true }),
    snapshot({ sourceId: "other-source" }),
    snapshot({ discussion: { discussionId: "discussion-demo", roots: [] },
      alternateDiscussion: { sourceId: "source-demo", roots: [root], pinnedRoots: [] } }),
  ]) {
    ui.panel.render(changed);
    assert.equal(shortcut.hidden, true);
    shortcut.listeners.get("click")();
  }
  root.replies[0].state = "deleted";
  ui.panel.render(snapshot());
  assert.equal(shortcut.hidden, true);
  shortcut.listeners.get("click")();
  assert.deepEqual(calls, []);
});
test("long visible canonical posts retain per-post follow-up actions", () => {
  const ui = harness();
  const calls = [];
  const context = { topic: { id: "topic-demo" }, currentSource: { id: "source-demo" } };
  ui.panel.bindInsight({ currentState: () => ({ context,
    ai: { planEnabled: true, model: "chosen", status: "idle" } }),
    createFollowup: (id) => { calls.push(id); return Promise.resolve(true); } });
  const root = { id: "long-root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "R".repeat(2_001), replies: [{ id: "long-reply", rootId: "long-root",
      replyToId: "long-root", state: "visible", actorType: "human", authorId: "demo-blair",
      body: "Q".repeat(2_001) }] };
  ui.panel.render(state({ sourceId: "source-demo",
    discussion: { discussionId: "discussion-demo", roots: [root] },
    draft: { mode: "reply", targetId: "long-reply", body: "Unsent", detached: false } }));
  const actions = descendants(ui.root).filter((item) => item.attributes["data-action"] === "getinsights");
  assert.deepEqual(actions.map((item) => item.attributes["data-contribution-id"]), ["long-root", "long-reply"]);
  const shortcut = ui.byId("discussion-ai-insights");
  assert.equal(shortcut.hidden, true);
  actions[1].listeners.get("click")();
  assert.deepEqual(calls, ["long-reply"]);
  assert.equal(ui.byId("discussion-body").value, "Unsent");
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
  assert.ok(ui.byId("discussion-feed").children.indexOf(section) > ui.byId("discussion-feed").children.indexOf(thread));
  assert.ok(ui.root.children.indexOf(ui.byId("discussion-feed")) < ui.root.children.indexOf(ui.byId("discussion-root-dock")));
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
test("related previews omit roots already visible in current or earlier threads", () => {
  const ui = harness();
  const origin = { sourceId: "source-demo", url: "https://example.org/story", title: "Story" };
  const current = { id: "current", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Current body", origin, replies: [] };
  const earlier = { ...current, id: "earlier", body: "Earlier body" };
  const preview = (id, body) => ({ id, actorType: "human", authorId: "demo-alex",
    body, replyCount: 0 });
  const version = { generation: 1, revision: 2 };
  ui.panel.render(state({ sourceId: "source-demo", discussion: { discussionId: "discussion-demo", version, roots: [current] },
    catalog: { ...state().catalog, version, topics: [...state().catalog.topics,
      { id: "old-topic", title: "Old", kind: "manual" }] },
    priorDiscussions: { sourceId: "source-demo", currentTopicId: "topic-demo", version,
      topics: [{ id: "old-topic", title: "Old", kind: "manual", rootCount: 1 }] },
    earlierDiscussions: [{ topicId: "old-topic", discussionId: "old-discussion", version,
      title: "Old", roots: [earlier] }],
    relatedDiscussions: [
      { topicId: "duplicates", title: "Duplicates", rootCount: 2,
        roots: [preview("current", "Repeated current"), preview("earlier", "Repeated earlier")] },
      { topicId: "mixed", title: "Mixed", rootCount: 4,
        roots: [preview("earlier", "Repeated earlier"), preview("unrelated", "Unrelated body")] },
    ] }));
  const section = ui.byId("discussion-related-conversations");
  assert.equal(section.hidden, false);
  assert.equal(section.children[1].children.length, 1);
  const group = section.children[1].children[0];
  assert.equal(group.attributes["data-related-topic-id"], "mixed");
  assert.equal(group.children[0].children[1].textContent, EN.uiRelatedThreadCount.replace("{count}", "4"));
  assert.equal(descendants(group).some((item) => item.textContent === "Unrelated body"), true);
  assert.equal(descendants(group).some((item) => item.textContent === "Repeated earlier"), false);
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
  assert.equal(descendants(ui.root).some((item) => item.textContent === EN.discussionDeleted), false);
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
test("post actions keep full localized names and tooltips for compact icon styling", () => {
  const ui = harness();
  for (const [action, key] of [["reply", "discussionReply"], ["edit", "discussionEdit"],
    ["withdraw", "discussionWithdraw"]]) {
    const control = descendants(ui.root).find((item) => item.attributes["data-action"] === action);
    assert.ok(control, action);
    assert.equal(control.textContent, EN[key]);
    assert.equal(control.attributes["aria-label"], EN[key]);
    assert.equal(control.title, EN[key]);
  }
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

test("first-page local root composer accepts typing without a Source while all delivery stays gated", async () => {
  const ui = harness(), pending = state({ phase: "loading", sourceId: null, topicId: null, discussion: null, related: null,
    localRootDraftReady: true, humanPostingReady: false,
    resolution: { phase: "processing", documentId: "first-document", currentUrl: "https://public.example/page", currentTabId: 7, sessionRevision: "capture-1" } });
  pending.catalog.sources = [];pending.catalog.topics = [];
  ui.panel.render(pending);const body = ui.byId("discussion-body"), composer = ui.byId("discussion-composer");
  assert.equal(composer.hidden, false);assert.equal(body.disabled, false);assert.equal(ui.byId("discussion-submit").disabled, true);
  assert.equal(ui.byId("discussion-ai-insights").disabled, true);assert.equal(ui.byId("discussion-private-toggle").disabled, true);
  body.focus();body.listeners.get("compositionstart")();body.value = "Typing before body E5 settles";
  const ready = state({ sourceId: "source-demo", resolution: pending.resolution });ready.catalog.sources[0].topicId = ready.topicId;
  ui.panel.render(ready);assert.equal(body.value, "Typing before body E5 settles");assert.equal(ui.document.activeElement, body);
  body.listeners.get("compositionend")();assert.deepEqual(ui.calls.at(-1), ["setDraft", "Typing before body E5 settles"]);
  assert.equal(ui.calls.some(([kind]) => kind === "submitDraft" || kind === "begin"), false);
  for (const patch of [{ localRootDraftReady: false }, { needsFreshRead: true }, { busy: true },
    { draft: { ...pending.draft, detached: true } }, { draft: { ...pending.draft, mode: "reply" } }, { draft: { ...pending.draft, mode: "edit" } }]) {
    ui.panel.render({ ...pending, ...patch });assert.equal(body.disabled, true);assert.equal(ui.byId("discussion-submit").disabled, true);
  }
  ui.panel.dispose();
});

test("saved discussion matching permits local root typing and preserves IME while delivery stays gated", async () => {
  const ui = harness(); const generations = [];
  ui.panel.bindInsight({ currentState: () => ({ context: { currentSource: { id: "source-demo" } },
    ai: { planEnabled: true, model: "chosen", status: "idle" } }),
    createInsights: options => { generations.push(options); return Promise.resolve(true); } });
  const loading = state({ phase: "loading", sourceId: "source-demo", selection: "background",
    resolution: { enabled: true, phase: "processing" }, related: null });
  loading.catalog.sources[0].topicId = loading.topicId;
  loading.discussion.topic = { id: loading.topicId };
  ui.panel.render(loading);
  const body = ui.byId("discussion-body"), submit = ui.byId("discussion-submit"),
    shortcut = ui.byId("discussion-ai-insights"), composer = ui.byId("discussion-composer");
  assert.equal(composer.hidden, false);
  assert.equal(body.disabled, false);
  body.focus(); body.listeners.get("compositionstart")();
  body.value = "@AI Local composing text";
  ui.panel.render({ ...loading, resolution: { ...loading.resolution, phase: "checking" } });
  assert.equal(body.value, "@AI Local composing text");
  assert.equal(ui.document.activeElement, body);
  body.listeners.get("compositionend")();
  assert.deepEqual(ui.calls.at(-1), ["setDraft", "@AI Local composing text"]);
  const staged = { ...loading, draft: { ...loading.draft, body: "@AI Local composing text" } };
  ui.panel.render(staged);
  assert.equal(submit.disabled, true); assert.equal(shortcut.disabled, true);
  await composer.listeners.get("submit")({ preventDefault() {} });
  shortcut.listeners.get("click")();
  assert.equal(ui.calls.some(([kind]) => kind === "submitDraft" || kind === "begin"), false);
  assert.deepEqual(generations, []);
  for (const patch of [{ busy: true }, { needsFreshRead: true },
    { draft: { ...staged.draft, detached: true } }, { draft: { ...staged.draft, mode: "reply" } },
    { draft: { ...staged.draft, mode: "edit" } }]) {
    ui.panel.render({ ...staged, ...patch });
    assert.equal(body.disabled, true);
    assert.equal(submit.disabled, true);
    assert.equal(shortcut.disabled, true);
  }
  ui.panel.dispose();
});

test("real first-page controller publications keep the composing textarea enabled through canonical promotion", async t => {
  const ui = harness();let next = 0, promoting = false;const frames = [], commands = [];
  const service = createMemoryDemoService({ nextId: kind => `${kind}-${++next}`, now: () => "2026-10-27T12:00:00.000Z" });
  const url = "http://127.0.0.1:4173/background-fixture/first-composition.html";
  let resolution = { phase: "processing", reason: "embedding", tabId: 7, url, documentId: "composition-document", sourceId: null, topicId: null,
    assignment: null, sequence: 1, enabled: true, blockedOrigins: [], sessionWindowId: 2, currentWindowId: 2,
    sessionRevision: "composition-capture", hostAccess: true, currentOrigin: "http://127.0.0.1:4173", currentTabId: 7, currentUrl: url, contextReason: null };
  const controller = createLocalDiscussionController({
    client: { health: async () => ({}), catalog: async () => service.catalog(), discussion: async id => service.discussion(id),
      related: async id => service.related(id, 5), priorDiscussions: async sourceId => ({ version: service.catalog().version, sourceId, currentTopicId: resolution.topicId, topics: [] }),
      command: async (...args) => { commands.push(args);return service.command(...args); } },
    session: { isPaired: async () => true }, readPostingSessionRevision: () => 1,
    readPageResolution: async () => resolution, readActiveTab: async () => ({ tabId: 7, windowId: 2, url }),
    observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange(state) { ui.panel.render(state);if (promoting) frames.push({ state, enabled: !ui.byId("discussion-body").disabled, text: ui.byId("discussion-body").value }); },
  });
  t.after(() => { controller.dispose();ui.panel.dispose(); });ui.panel.bind(controller);await controller.setTopicViewMode("classic");await controller.open();
  const body = ui.byId("discussion-body");body.focus();controller.setDraft("Committed prefix");
  body.listeners.get("compositionstart")();body.value = "Committed prefix 未完";
  body.selectionStart = 4;body.selectionEnd = 9;body.selectionDirection = "backward";
  const result = service.ingest({ expected: service.catalog().version, operationId: "composition-operation", url, title: "First composition document",
    embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0) }, extractorVersion: "main-text-prefix/v1" });
  resolution = { ...resolution, phase: "ready", reason: null, sourceId: result.sourceId, topicId: result.topicId, assignment: result.assignment, sequence: 2 };
  promoting = true;await controller.updatePageResolution(resolution);
  assert.ok(frames.some(({ state }) => state.resolution?.phase === "ready" && !state.sourceId));
  assert.ok(frames.length >= 3);for (const frame of frames) { assert.equal(frame.enabled, true);assert.equal(frame.text, "Committed prefix 未完"); }
  assert.equal(ui.document.activeElement, body);assert.deepEqual([body.selectionStart, body.selectionEnd, body.selectionDirection], [4, 9, "backward"]);
  assert.equal(controller.currentState().draft.body, "Committed prefix");body.listeners.get("compositionend")();
  assert.equal(controller.currentState().draft.body, "Committed prefix 未完");assert.equal(commands.length, 0);
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
  assert.equal(ui.byId("discussion-ai-insights").hidden, false);
  assert.equal(ui.byId("discussion-ai-insights").disabled, false);
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

test("experimental matching disables saved Topic correction and deletion but keeps source and global controls", async () => {
  const ui = harness();
  const learned = state({ sourceId: "learned-source" });
  learned.catalog.topics[0].learned = true;
  learned.catalog.sources = [{ id: "learned-source", title: "Learned page",
    provenance: "owner-local-page-embedding/v1", topicId: "topic-demo" }];
  ui.panel.render(learned);
  const confirm = ui.byId("discussion-correction-confirm");
  const deletion = ui.byId("discussion-delete-confirmation");
  confirm.checked = true; confirm.listeners.get("change")();
  deletion.value = "DELETE TOPIC AND DISCUSSION"; deletion.listeners.get("input")();
  assert.equal(ui.byId("discussion-correct").disabled, false);
  assert.equal(ui.byId("discussion-delete").disabled, false);
  ui.panel.render({ ...learned, topicViewMode: "experimental" });
  assert.equal(ui.byId("discussion-saved-topic-hint").textContent, EN.uiTopicViewSavedTopicHint);
  assert.equal(ui.byId("discussion-saved-topic-hint").hidden, false);
  assert.equal(confirm.checked, false);
  assert.equal(deletion.value, "");
  for (const id of ["discussion-correction-topic", "discussion-correction-confirm", "discussion-correct",
    "discussion-delete-confirmation", "discussion-delete"]) assert.equal(ui.byId(id).disabled, true);
  assert.equal(ui.byId("discussion-forget").disabled, false);
  const clearing = ui.byId("discussion-clear-confirmation");
  clearing.value = "CLEAR LEARNED DATA"; clearing.listeners.get("input")();
  assert.equal(ui.byId("discussion-clear").disabled, false);
  const before = ui.calls.length;
  await ui.byId("discussion-correct").listeners.get("click")();
  await ui.byId("discussion-delete").listeners.get("click")();
  assert.equal(ui.calls.length, before);
  ui.panel.render(learned);
  assert.equal(ui.byId("discussion-saved-topic-hint").hidden, true);
  assert.equal(confirm.disabled, false);
  assert.equal(deletion.disabled, false);
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
  assert.equal(ui.byId("discussion-body").attributes["aria-label"], "Your reply · Replying to Alex (root-a)");
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

test("valid User reply is compact, target-labelled, and grows without losing the shared focused editor", () => {
  const ui = harness();
  const root = { id: "root-small", state: "visible", authorId: "demo-alex", actorType: "human",
    body: "Opening", replies: [] };
  const snapshot = state({ discussion: { roots: [root] },
    draft: { body: "", detached: false, mode: "reply", targetId: "root-small" } });
  const composer = ui.byId("discussion-composer"), body = ui.byId("discussion-body");
  ui.panel.render(snapshot);
  assert.equal(composer.attributes["data-composer-mode"], "reply");
  assert.equal(composer.attributes["data-inline-target"], "valid");
  assert.equal(body.rows, 1);
  assert.equal(body.attributes["aria-label"], "Your reply · Replying to Alex (root-small)");
  assert.equal(body.attributes["aria-describedby"], "discussion-reply-context");
  assert.equal(ui.byId("discussion-ai-insights").hidden, true);
  assert.equal(ui.byId("discussion-submit").attributes["aria-label"], EN.uiPostReply);
  body.scrollHeight = 208;
  body.focus(); body.value = "Several lines of text"; body.listeners.get("input")();
  assert.equal(body.style.height, "128px");
  ui.panel.render({ ...snapshot, draft: { ...snapshot.draft, body: body.value } });
  assert.equal(ui.document.activeElement, body);
  assert.equal(ui.byId("discussion-body"), body);
  assert.equal(body.style.height, "128px");
  ui.panel.render(state());
  assert.equal(body.rows, 3);
  assert.equal(body.style.height, "");
});

test("reply context uses compact User AI provenance and full Developer provenance", () => {
  const ui = harness();
  const roots = [
    { id: "generated", state: "visible", actorType: "agent", authorId: "demo-ai",
      insight: { kind: "generated", operatorId: "demo-alex" }, body: "Generated answer", replies: [] },
    { id: "imported", state: "visible", actorType: "agent", authorId: "demo-ai",
      insight: { kind: "manual-import", operatorId: "demo-alex" }, body: "Imported answer", replies: [] },
  ];
  const snapshot = state({ catalog: { ...state().catalog, actors: [
    ...state().catalog.actors, { id: "demo-ai", displayName: "Demo AI" },
  ] }, discussion: { roots } });
  const context = ui.byId("discussion-reply-context");
  const author = context.children[0];
  const replyTo = (targetId) => ui.panel.render({ ...snapshot,
    draft: { body: "", detached: false, mode: "reply", targetId } });
  replyTo("generated");
  assert.equal(author.textContent, "Replying to Alex");
  replyTo("imported");
  assert.equal(author.textContent, "Replying to Alex · unverified import");
  ui.panel.setMode("developer");
  assert.equal(author.textContent, "Replying to AI-assisted · unverified manual import · shared …");
  replyTo("generated");
  assert.equal(author.textContent, "Replying to Robot · shared by Alex · synthetic");
});

test("nested replies name their agent parent without visible AI badge text", () => {
  const ui = harness();
  const root = { id: "root", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Opening", replies: [
      { id: "generated-parent", rootId: "root", replyToId: "root", state: "visible",
        actorType: "agent", authorId: "demo-ai", insight: { kind: "generated", operatorId: "demo-alex" },
        body: "Generated" },
      { id: "generated-child", rootId: "root", replyToId: "generated-parent", state: "visible",
        actorType: "human", authorId: "demo-alex", body: "Reply" },
      { id: "imported-parent", rootId: "root", replyToId: "root", state: "visible",
        actorType: "agent", authorId: "demo-ai", insight: { kind: "manual-import", operatorId: "demo-alex" },
        body: "Imported" },
      { id: "imported-child", rootId: "root", replyToId: "imported-parent", state: "visible",
        actorType: "human", authorId: "demo-alex", body: "Reply" },
    ] };
  ui.panel.render(state({ discussion: { roots: [root] } }));
  const cue = (id) => descendants(descendants(ui.root)
    .find((item) => item.attributes["data-post-id"] === id))
    .find((item) => item.className === "discussion-parent-cue");
  assert.equal(cue("generated-parent").textContent, "@Alex:");
  assert.equal(cue("generated-parent").attributes["data-reply-to-id"], "root");
  assert.equal(cue("generated-parent").attributes["aria-label"], "Reply to Alex");
  assert.equal(cue("generated-child").textContent, "@AI:");
  assert.equal(cue("generated-child").attributes["data-reply-to-id"], "generated-parent");
  assert.equal(cue("generated-child").attributes["aria-label"], "Reply to AI-generated · shared by Alex");
  assert.equal(cue("generated-child").title, cue("generated-child").attributes["aria-label"]);
  assert.equal(cue("imported-child").textContent, "@Alex · unverified import:");
  assert.equal(cue("imported-child").attributes["aria-label"],
    "Reply to AI-assisted · unverified manual import · shared by Alex");
  assert.equal(cue("imported-child").title, cue("imported-child").attributes["aria-label"]);
});

test("stable root ordering keeps the live textarea focused through synchronous typing", () => {
  const ui = harness();
  const composer = ui.byId("discussion-composer"), body = ui.byId("discussion-body");
  const thread = ui.byId("discussion-feed").children.find((item) => item.className === "discussion-thread");
  const insightHost = ui.document.createElement("div"); insightHost.id = "app-discussion-insights-host";
  ui.byId("discussion-feed").insertBefore(insightHost, thread);
  const snapshot = state();
  ui.panel.render(snapshot);
  body.focus();
  let value = "";
  for (const character of "reply") {
    value += character;
    body.value = value;
    ui.panel.render({ ...snapshot, draft: { ...snapshot.draft, body: value } });
    assert.equal(ui.document.activeElement, body);
    assert.equal(body.parentElement, composer);
    assert.equal(composer.parentElement, ui.byId("discussion-root-dock"));
    assert.equal(insightHost.nextSibling, thread);
  }
});

test("accepted nested human and generated posts reveal once without polling stealing focus", () => {
  for (const actorType of ["human", "agent"]) {
    const ui = harness();
    const parent = { id: "reply-parent", rootId: "root-created", replyToId: "root-created",
      state: "visible", actorType: "human", authorId: "demo-alex", body: "Parent" };
    const root = { id: "root-created", state: "visible", actorType: "human", authorId: "demo-alex",
      body: "Opener", replies: [parent] };
    const base = state({ discussion: { discussionId: "discussion-created", roots: [root] } });
    ui.panel.render(base);
    const child = { id: `${actorType}-created`, rootId: root.id, replyToId: parent.id,
      state: "visible", actorType, authorId: "demo-alex", body: "New answer",
      ...(actorType === "agent" ? { insight: { kind: "generated", operatorId: "demo-alex" } } : {}) };
    const arrival = { ...base, discussion: { ...base.discussion,
      roots: [{ ...root, replies: [parent, child] }] },
      createdPost: { id: child.id, topicId: base.topicId, sourceId: base.sourceId,
        actorId: base.actorId, discussionId: base.discussion.discussionId } };
    ui.panel.render(arrival);
    const post = descendants(ui.root).find((item) => item.attributes["data-post-id"] === child.id);
    assert.equal(ui.document.activeElement, post);
    assert.equal(post.scrollCalls?.length, 1);
    const toggle = (id) => descendants(ui.root).find((item) =>
      item.attributes["data-action"] === "expand" && item.attributes["data-contribution-id"] === id);
    assert.equal(toggle(root.id).attributes["aria-expanded"], "true");
    assert.equal(toggle(parent.id).attributes["aria-expanded"], "true");
    toggle(parent.id).listeners.get("click")();
    const editor = ui.byId("discussion-body"); editor.focus();
    ui.panel.render({ ...arrival, discussion: { ...arrival.discussion,
      roots: [{ ...root, body: "Opener after polling", replies: [parent, child] }] } });
    assert.equal(ui.document.activeElement, editor);
    assert.equal(toggle(parent.id).attributes["aria-expanded"], "false");
    assert.equal(post.scrollCalls?.length, 1);
  }
});

test("confirmed generated reply remains unfolded when alternate view follows canonical refresh", () => {
  const ui = harness();
  const parent = { id: "reply-parent", rootId: "root-created", replyToId: "root-created",
    state: "visible", actorType: "human", authorId: "demo-alex", body: "Parent" };
  const root = { id: "root-created", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Opener", canonicalTopicId: "topic-demo", canonicalDiscussionId: "discussion-demo",
    replies: [parent] };
  const base = state({ sourceId: "source-demo", topicViewMode: "experimental",
    discussion: { discussionId: "discussion-demo", roots: [root] },
    alternateDiscussion: { sourceId: "source-demo", sourceIds: ["source-demo"], roots: [root], pinnedRoots: [] } });
  ui.panel.render(base);
  const child = { id: "generated-created", rootId: root.id, replyToId: parent.id,
    state: "visible", actorType: "agent", authorId: "demo-alex", body: "New answer",
    insight: { kind: "generated", operatorId: "demo-alex" } };
  const createdRoot = { ...root, replies: [parent, child] };
  const refreshed = { ...base, discussion: { ...base.discussion, roots: [createdRoot] },
    alternateDiscussion: null, createdPost: { id: child.id, topicId: base.topicId,
      sourceId: base.sourceId, actorId: base.actorId, discussionId: base.discussion.discussionId } };
  ui.panel.render({ ...refreshed, busy: true });
  ui.panel.render({ ...refreshed, busy: false });
  ui.panel.render({ ...refreshed, alternateDiscussion: { ...base.alternateDiscussion,
    roots: [createdRoot] } });
  const toggle = (id) => descendants(ui.root).find((item) =>
    item.attributes["data-action"] === "expand" && item.attributes["data-contribution-id"] === id);
  assert.equal(toggle(root.id).attributes["aria-expanded"], "true");
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "true");
});

test("context invalidation clears reveal expansion even if the next page resolves to the same Topic", () => {
  const ui = harness();
  const root = { id: "root-context", state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Opener", replies: [{ id: "reply-context", rootId: "root-context", replyToId: "root-context",
      state: "visible", actorType: "agent", authorId: "demo-alex", body: "Answer",
      insight: { kind: "generated", operatorId: "demo-alex" } }] };
  const base = state({ sourceId: "source-demo", topicViewMode: "experimental",
    discussion: { discussionId: "discussion-context", roots: [root] } });
  ui.panel.render({ ...base, createdPost: { id: "reply-context", topicId: base.topicId,
    sourceId: base.sourceId, actorId: base.actorId, discussionId: base.discussion.discussionId } });
  const branch = () => descendants(ui.root).find((item) =>
    item.attributes["data-action"] === "expand" && item.attributes["data-contribution-id"] === root.id);
  assert.equal(branch().attributes["aria-expanded"], "true");
  ui.panel.render({ ...base, phase: "choose-topic", error: "context-changed",
    sourceId: null, topicId: null, discussion: null, createdPost: null });
  ui.panel.render({ ...base, createdPost: null });
  assert.equal(branch().attributes["aria-expanded"], "false");
});

test("a different actor or Source in the same legacy Topic cannot inherit a revealed post's feed anchor", () => {
  for (const change of [{ actorId: "demo-blair" }, { sourceId: "source-other" }]) {
    const ui = harness();
    const feed = ui.byId("discussion-feed");
    const root = { id: "root-fenced", state: "visible", actorType: "human", authorId: "demo-alex",
      body: "Opener", replies: [{ id: "reply-fenced", rootId: "root-fenced", replyToId: "root-fenced",
        state: "visible", actorType: "agent", authorId: "demo-alex", body: "Answer",
        insight: { kind: "generated", operatorId: "demo-alex" } }] };
    const base = state({ sourceId: "source-demo", topicViewMode: "classic",
      discussion: { discussionId: "discussion-fenced", roots: [root] } });
    ui.panel.render({ ...base, createdPost: { id: "reply-fenced", actorId: base.actorId,
      sourceId: base.sourceId, topicId: base.topicId, discussionId: base.discussion.discussionId } });
    feed.scrollTop = 61;
    ui.panel.render({ ...base, ...change, phase: "loading", discussion: null, createdPost: null });
    feed.scrollTop = 0;
    ui.panel.render({ ...base, ...change, createdPost: null });
    assert.equal(feed.scrollTop, 0, `${JSON.stringify(change)} must not restore a previous context's scroll position`);
  }
});

test("accepted command, canonical read, and delayed alternate projection keep the exact AI reply open", async () => {
  const ui = harness();
  let serial = 0, delayAlternate = false, releaseAlternate;
  const service = createMemoryDemoService({ nextId: (kind) => `${kind}-${++serial}`,
    now: () => "2026-10-10T12:00:00.000Z" });
  const client = {
    health: async () => ({}),
    catalog: async () => { const catalog = structuredClone(service.catalog());
      catalog.sources.find((entry) => entry.id === "reserved-example-com").provenance = "owner-local-page-embedding/v1";
      return catalog; },
    discussion: async (id) => service.discussion(id),
    related: async (id, limit) => service.related(id, limit),
    priorDiscussions: async (id) => service.priorDiscussions(id),
    command: async (expected, command, actor) => service.command(expected, command, actor,
      ["share-insight", "share-insight-reply"].includes(command.type) ? {
        kind: "generated-insight", operationId: command.operationId, actorId: actor,
        topicId: command.topicId, originSourceId: command.originSourceId, body: command.body,
        rootId: command.rootId ?? null, replyToId: command.replyToId ?? null,
        discussionId: command.discussionId ?? null,
      } : null),
    alternateDiscussion: async (sourceId, _catalog, discussion) => {
      if (delayAlternate) await new Promise((resolve) => { releaseAlternate = resolve; });
      return { policyVersion: RIDGE_POLICY, representation: RIDGE_REPRESENTATION,
        sourceId, sourceIds: [sourceId], pinnedRoots: [],
        roots: discussion.roots.map((entry) => ({ ...entry,
          canonicalTopicId: discussion.topic.id, canonicalDiscussionId: discussion.discussionId })) };
    },
  };
  const controller = createLocalDiscussionController({ client,
    session: { isPaired: async () => true },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {},
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange: (snapshot) => ui.panel.render(snapshot),
  });
  ui.panel.bind(controller);
  await controller.open();
  assert.equal(controller.currentState().phase, "ready", JSON.stringify(controller.currentState()));
  controller.setDraft("Opener"); assert.equal(await controller.submitDraft(), true);
  let snapshot = controller.currentState();
  const root = snapshot.discussion.roots.find((entry) => entry.body === "Opener");
  assert.equal(controller.begin("reply", root.id), true);
  controller.setDraft("Parent"); assert.equal(await controller.submitDraft(), true);
  snapshot = controller.currentState();
  const parent = snapshot.discussion.roots.find((entry) => entry.id === root.id).replies[0];
  delayAlternate = true;
  assert.equal(await controller.shareInsight({ topicId: snapshot.topicId, sourceId: snapshot.sourceId,
    actorId: snapshot.actorId, discussionId: snapshot.discussion.discussionId,
    rootId: root.id, replyToId: parent.id, expected: snapshot.discussion.version,
    body: "Generated answer", operationId: "synthetic-accepted-reply" }), true);
  const created = controller.currentState().createdPost;
  assert.ok(created?.id);
  const toggle = (id) => descendants(ui.root).find((item) =>
    item.attributes["data-action"] === "expand" && item.attributes["data-contribution-id"] === id);
  assert.equal(toggle(root.id).attributes["aria-expanded"], "true");
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "true");
  delayAlternate = false;
  releaseAlternate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(toggle(root.id).attributes["aria-expanded"], "true");
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "true");
  const post = descendants(ui.root).find((item) => item.attributes["data-post-id"] === created.id);
  assert.ok(post);
  await controller.open();
  assert.equal(toggle(root.id).attributes["aria-expanded"], "true");
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "true");
  toggle(parent.id).listeners.get("click")();
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "false");
  await controller.open();
  assert.equal(toggle(parent.id).attributes["aria-expanded"], "false");
});

test("created-post cue rejects changed account and withdrawn targets", () => {
  const ui = harness();
  const root = { id: "new-root", state: "visible", actorType: "agent", authorId: "demo-alex",
    insight: { kind: "generated", operatorId: "demo-alex" }, body: "Generated", replies: [] };
  const base = state({ discussion: { discussionId: "discussion-created", roots: [root] } });
  const createdPost = { id: root.id, topicId: base.topicId, sourceId: base.sourceId,
    actorId: base.actorId, discussionId: base.discussion.discussionId };
  ui.panel.render({ ...base, actorId: "different-actor", createdPost });
  assert.notEqual(ui.document.activeElement?.attributes?.["data-post-id"], root.id);
  ui.panel.render({ ...base, discussion: { ...base.discussion,
    roots: [{ ...root, state: "deleted" }] }, createdPost });
  assert.notEqual(ui.document.activeElement?.attributes?.["data-post-id"], root.id);
  ui.panel.render({ ...base, createdPost });
  assert.equal(ui.document.activeElement?.attributes?.["data-post-id"], root.id);
});

test("one inline composer follows exact nested target, keeps selection on refresh, and recovers when target vanishes", () => {
  const ui = harness();
  const root = { id: "root-inline", rootId: null, state: "visible", actorType: "human",
    authorId: "demo-alex", body: "Opening", replies: [
      { id: "reply-parent", rootId: "root-inline", replyToId: "root-inline", state: "visible",
        actorType: "human", authorId: "demo-alex", body: "Parent" },
      { id: "reply-child", rootId: "root-inline", replyToId: "reply-parent", state: "visible",
        actorType: "human", authorId: "demo-alex", body: "Child" },
    ] };
  const snapshot = state({ discussion: { roots: [root] }, draft: {
    mode: "reply", targetId: "reply-child", body: "Draft answer", detached: false } });
  ui.panel.render(snapshot);
  const composer = ui.byId("discussion-composer"), body = ui.byId("discussion-body");
  const card = descendants(ui.root).find((item) => item.attributes["data-post-id"] === "reply-child");
  assert.equal(card.nextSibling, composer);
  assert.equal(ui.byId("discussion-model-host").hidden, true);
  assert.equal(ui.byId("discussion-voice-host").hidden, true);
  assert.equal(descendants(ui.root).filter((item) => item === composer).length, 1);
  assert.equal(ui.byId("discussion-discard").hidden, true);
  assert.equal(ui.byId("discussion-back-to-new-thread").hidden, false);
  assert.equal(ui.byId("discussion-back-to-new-thread").textContent, EN.uiDiscardDraftToNewThread);
  const replyLists = descendants(ui.root).filter((item) => item.className === "discussion-reply-children" ||
    item.className === "discussion-replies");
  assert.ok(replyLists.every((item) => item.inert === false));
  body.selectionStart = 2; body.selectionEnd = 7; body.selectionDirection = "forward";
  body.setSelectionRange = (...selection) => { [body.selectionStart, body.selectionEnd, body.selectionDirection] = selection; };
  body.focus();
  ui.panel.render({ ...snapshot, discussion: { roots: [{ ...root, replies: [
    ...root.replies, { id: "sibling", rootId: "root-inline", replyToId: "root-inline",
      state: "visible", actorType: "human", authorId: "demo-alex", body: "New" },
  ] }] } });
  assert.equal(ui.document.activeElement, body);
  assert.deepEqual([body.selectionStart, body.selectionEnd, body.selectionDirection], [2, 7, "forward"]);
  assert.equal(body.value, "Draft answer");
  const removed = { ...snapshot, discussion: { roots: [{ ...root, replies: root.replies.map((reply) =>
    reply.id === "reply-child" ? { ...reply, state: "deleted" } : reply) }] } };
  ui.panel.render(removed);
  assert.equal(composer.parentElement, ui.byId("discussion-root-dock"));
  assert.equal(body.value, "Draft answer");
  assert.equal(ui.byId("discussion-submit").disabled, true);
  assert.equal(ui.byId("discussion-back-to-new-thread").hidden, false);
  ui.panel.setMode("developer");
  assert.equal(ui.byId("discussion-discard").hidden, false);
  assert.equal(ui.byId("discussion-back-to-new-thread").hidden, true);
});

test("composition defers same-context thread replacement and an inline ancestor stays open", () => {
  const ui = harness();
  const root = { id: "root-ime", rootId: null, state: "visible", actorType: "human", authorId: "demo-alex",
    body: "Opening", replies: [{ id: "reply-ime", rootId: "root-ime", replyToId: "root-ime",
      state: "visible", actorType: "human", authorId: "demo-alex", body: "Answer" }] };
  const snapshot = state({ discussion: { roots: [root] }, draft: {
    mode: "reply", targetId: "reply-ime", body: "", detached: false } });
  ui.panel.render(snapshot);
  const body = ui.byId("discussion-body"), card = descendants(ui.root).find((item) =>
    item.attributes["data-post-id"] === "reply-ime");
  const rootToggle = descendants(ui.root).find((item) => item.attributes["data-action"] === "expand" &&
    item.attributes["data-contribution-id"] === "root-ime");
  rootToggle.listeners.get("click")();
  assert.equal(rootToggle.attributes["aria-expanded"], "true");
  body.focus(); body.listeners.get("compositionstart")(); body.value = "語";
  ui.panel.render({ ...snapshot, discussion: { roots: [{ ...root, body: "Updated opening" }] } });
  assert.equal(ui.document.activeElement, body);
  assert.equal(body.value, "語");
  assert.equal(card.nextSibling, ui.byId("discussion-composer"));
  body.listeners.get("compositionend")();
  assert.deepEqual(ui.calls.at(-1), ["setDraft", "語"]);
  assert.equal(body.value, "語");
  ui.panel.render({ ...snapshot, draft: { ...snapshot.draft, body: "語" },
    discussion: { roots: [{ ...root, body: "Updated opening" }] } });
  assert.equal(body.value, "語");
  assert.equal(ui.document.activeElement, body);
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
  assert.equal(ui.byId("discussion-composer").attributes["data-inline-target"], "unavailable");
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
  const demo = descendants(ui.root).find((item) => item.className === "discussion-demo-badge");
  assert.equal(demo.textContent, EN.uiDemoBadge);
  assert.equal(demo.attributes["aria-label"], EN.uiDemoBadgeLabel);
  assert.equal(author.attributes["aria-label"], "Human · Alex");
  assert.equal(ui.byId("discussion-counts").hidden, true);
});

test("User contribution headers keep generated and imported provenance distinct", () => {
  const ui = harness();
  const current = state({ discussion: { roots: [
    { id: "generated", state: "visible", actorType: "agent", authorId: "demo-ai",
      insight: { kind: "generated", operatorId: "demo-alex" }, body: "Generated answer",
      createdAt: "2026-10-10T12:00:00.000Z", replies: [],
      origin: { sourceId: "source-demo", url: "https://example.org/generated", title: "Generated source" } },
    { id: "imported", state: "visible", actorType: "agent", authorId: "demo-ai",
      insight: { kind: "manual-import", operatorId: "demo-alex" }, body: "Imported answer", replies: [] },
    { id: "human", state: "visible", actorType: "human", authorId: "demo-alex",
      body: "Human answer", replies: [] },
  ] } });
  ui.panel.render(current);
  const renderedCards = () => Object.fromEntries(descendants(ui.root)
    .filter((item) => item.attributes?.["data-post-id"])
    .map((item) => [item.attributes["data-post-id"], item]));
  let cards = renderedCards();
  const author = (id) => descendants(cards[id]).find((item) =>
    item.className === "insight-provenance" || item.className === "human-provenance");
  const generated = author("generated");
  const imported = author("imported");
  assert.equal(generated.textContent, "Alex");
  assert.equal(generated.attributes["aria-label"], "AI-generated · shared by Alex");
  assert.equal(generated.title, generated.attributes["aria-label"]);
  assert.equal(cards.generated.attributes["aria-label"], "Post by AI-generated · shared by Alex");
  assert.equal(imported.textContent, "Alex · unverified import");
  assert.equal(imported.attributes["aria-label"], "AI-assisted · unverified manual import · shared by Alex");
  assert.equal(imported.title, imported.attributes["aria-label"]);
  assert.equal(author("human").textContent, "Alex");
  assert.equal(descendants(cards.generated).some((item) => item.className?.includes("discussion-actor-badge-agent")), false);
  assert.equal(descendants(cards.imported).some((item) => item.className?.includes("discussion-actor-badge-agent")), false);
  assert.equal(descendants(cards.human).some((item) => item.className?.includes("discussion-actor-badge-human")), false);
  assert.equal(descendants(cards.generated).some((item) => item.tag === "time"), true);
  assert.equal(descendants(cards.generated).find((item) => item.className === "discussion-source-link").href,
    "https://example.org/generated");
  ui.panel.setMode("developer");
  cards = renderedCards();
  assert.equal(author("generated").textContent, "Robot · shared by Alex · synthetic");
  assert.equal(author("imported").textContent, "AI-assisted · unverified manual import · shared by Alex · synthetic");
  assert.equal(descendants(cards.generated).some((item) => item.className?.includes("discussion-actor-badge-agent")), false);
});

test("related discussion generated and imported headers keep operator and provenance", () => {
  const ui = harness();
  const current = state({ relatedDiscussions: [{ topicId: "nearby", title: "Nearby", rootCount: 2,
    roots: [{ id: "nearby-generated", actorType: "agent", authorId: "demo-ai",
      insight: { kind: "generated", operatorId: "demo-alex" }, body: "Generated", replyCount: 0 },
    { id: "nearby-imported", actorType: "agent", authorId: "demo-ai",
      insight: { kind: "manual-import", operatorId: "demo-alex" }, body: "Imported", replyCount: 0 }] }] });
  ui.panel.render(current);
  const cards = descendants(ui.byId("discussion-related-conversations"))
    .filter((item) => item.className === "related-discussion-card");
  assert.equal(cards.length, 2);
  const generated = cards[0].children[0].children[0];
  const imported = cards[1].children[0].children[0];
  assert.equal(generated.className, "insight-provenance");
  assert.equal(generated.textContent, "Alex");
  assert.equal(generated.attributes["aria-label"], "AI-generated · shared by Alex");
  assert.equal(imported.textContent, "Alex · unverified import");
  assert.equal(imported.attributes["aria-label"], "AI-assisted · unverified manual import · shared by Alex");
  assert.equal(cards[0].attributes["aria-label"], "Post by AI-generated · shared by Alex");
  assert.equal(descendants(ui.byId("discussion-related-conversations"))
    .some((item) => item.textContent === EN.uiAgentBadge), false);
});

test("User generated markers and creation actions use the same bundled sparkle", () => {
  const css = readFileSync(new URL("../browser/chromium/popup.css", import.meta.url), "utf8");
  assert.match(css, /#discussion-ai-insights::before\s*\{[^}]*icons\/spark\.svg/su);
  assert.match(css, /\.discussion-contribution \.insight-provenance::before,[^}]*icons\/spark\.svg/su);
  assert.match(css, /\.discussion-action-getinsights::before\s*\{[^}]*icons\/spark\.svg/su);
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
function releasedSemanticPanel({generate=async()=>true,aiPatch={},settingsButton,readTarget,submit}={}) {
 let current=semanticComposerState({selection:'automatic'}),insight={context:{topic:{id:current.topicId},currentSource:{id:current.sourceId}},
  ai:{planEnabled:true,model:'chosen',status:'idle',...aiPatch}};
 const calls=[];
 const ui=harness(undefined,null,null,settingsButton,null,{currentState:()=>current,
  async submitDraft(){calls.push(['submit']);if(submit)return submit(current,value=>{current=value;});return false;},
  async readSemanticFollowupTarget(tuple){calls.push(['read',tuple]);return readTarget?.(tuple,current,value=>{current=value;});}},
  {});
 ui.panel.bindInsight({currentState:()=>insight,async createFollowup(...args){calls.push(['followup',...args]);return generate(...args);},
  async createInsights(...args){calls.push(['insights',...args]);}});ui.panel.render(current);
 return {...ui,calls,current:()=>current,setCurrent(value){current=value;ui.panel.render(current);},
  setInsight(patch){insight={...insight,...patch,ai:{...insight.ai,...patch.ai}};ui.panel.renderInsightState(insight);}};
}

test('released semantic composer AI button sends exact displayed IDs and preserves an unsent human draft',async t=>{
 const ui=releasedSemanticPanel();t.after(()=>ui.panel.dispose());const before=structuredClone(ui.current());
 const button=ui.byId('discussion-ai-insights');assert.equal(button.hidden,false);assert.equal(button.disabled,false);
 assert.equal(button.textContent,EN.uiCreateInsights);assert.equal(button.attributes['data-followup'],'true');
 await button.listeners.get('click')();
 assert.deepEqual(ui.calls,[['followup','semantic-target',{nodeId:'semantic-node',topicId:'canonical-a',discussionId:'discussion-a',rootId:'semantic-root',targetId:'semantic-target'}]]);
 assert.equal(JSON.stringify(ui.calls).includes('Human reply'),false);assert.deepEqual(ui.current(),before);
 assert.equal(ui.byId('discussion-body').value,'Human reply');assert.equal(ui.byId('discussion-mention-status').textContent===EN.uiSemanticAiUnavailable,false);
});

test('released semantic AI click offers setup without submitting or discarding a draft',async t=>{
 for(const aiPatch of [{model:''},{planEnabled:false}]){
  let opened=0;const ui=releasedSemanticPanel({aiPatch,settingsButton:{click(){opened++;}}});t.after(()=>ui.panel.dispose());
  const before=structuredClone(ui.current());assert.equal(ui.byId('discussion-ai-insights').disabled,false);
  await ui.byId('discussion-ai-insights').listeners.get('click')();assert.equal(opened,1);assert.deepEqual(ui.calls,[]);assert.deepEqual(ui.current(),before);
 }
});

test('released semantic AI requires current readable target, Ready Page B Source and no pending result or write',async t=>{
 const ui=releasedSemanticPanel();t.after(()=>ui.panel.dispose());const original=structuredClone(ui.current());
 for(const alter of [s=>{s.phase='loading';s.humanPostingReady=true;},s=>{s.sourceId=null;},s=>{s.draft.detached=true;},
  s=>{s.semanticSelection.root.replies[0]={id:'semantic-target',rootId:'semantic-root',state:'deleted'};},s=>{s.needsFreshRead=true;},
  s=>{s.busy=true;},s=>{s.semanticWritePending=true;},s=>{s.semanticSelection=null;}]){
  const value=structuredClone(original);alter(value);ui.setCurrent(value);const button=ui.byId('discussion-ai-insights');
  assert.ok(button.hidden||button.disabled);await button.listeners.get('click')();
 }
 ui.setCurrent(original);
 for(const patch of [{ai:{status:'preparingArticle'}},{ai:{status:'generating'}},{ai:{status:'resuming'}},{busy:true},{ai:{result:{body:'Private answer'}}}]){
  ui.setInsight(patch);const button=ui.byId('discussion-ai-insights');assert.ok(button.hidden||button.disabled);await button.listeners.get('click')();
  ui.setInsight({busy:false,ai:{status:'idle',result:null}});
 }
 assert.deepEqual(ui.calls,[]);
});

test('released semantic AI click latches one async job and gives finite failure without changing the human draft',async t=>{
 let settle;const ui=releasedSemanticPanel({generate:()=>new Promise(resolve=>{settle=resolve;})});t.after(()=>ui.panel.dispose());
 const button=ui.byId('discussion-ai-insights'),first=button.listeners.get('click')();
 assert.equal(button.disabled,true);await button.listeners.get('click')();assert.equal(ui.calls.length,1);
 settle(false);await first;assert.equal(button.disabled,false);assert.equal(ui.byId('discussion-body').value,'Human reply');
 assert.equal(ui.byId('discussion-mention-status').hidden,false);assert.equal(ui.byId('discussion-mention-status').textContent,EN.uiAiMentionUnavailable);
 const thrown=releasedSemanticPanel({generate:async()=>{throw new Error('private detail');}});t.after(()=>thrown.panel.dispose());
 await thrown.byId('discussion-ai-insights').listeners.get('click')();assert.equal(thrown.byId('discussion-mention-status').textContent,EN.uiAiMentionUnavailable);
 assert.equal(thrown.byId('discussion-ai-insights').disabled,false);
});

function acceptedSemanticFixture({afterRead,changeAccepted,aiPatch}={}){
 let originalBody;const ui=releasedSemanticPanel({aiPatch,
  submit:async(current,set)=>{originalBody=current.draft.body;const selected=current.semanticSelection;
   const tuple={nodeId:selected.nodeId,topicId:selected.topic.id,discussionId:selected.discussionId,rootId:selected.root.id,targetId:'accepted-semantic-question'};
   let next={...current,draft:{body:'',mode:'root',detached:false,targetId:null},semanticSelection:null,
    createdPost:{id:tuple.targetId,actorId:current.actorId,sourceId:current.sourceId,topicId:tuple.topicId,discussionId:tuple.discussionId,rootId:tuple.rootId,semantic:tuple}};
   if(changeAccepted)next=changeAccepted(next);set(next);return true;},
  readTarget:(tuple,current,set)=>{const question={id:tuple.targetId,rootId:tuple.rootId,actorType:'human',authorId:current.actorId,body:originalBody};
   const dto={targetId:tuple.targetId,root:{id:tuple.rootId,replies:[question]},topic:{id:tuple.topicId},discussionId:tuple.discussionId};
   if(afterRead)return afterRead(dto,current,set);return dto;}});
 const value=structuredClone(ui.current());value.draft.body='Accepted question @AI';ui.setCurrent(value);return ui;
}

test('released semantic @AI publishes human first then freshly resolves only its returned accepted question',async t=>{
 const ui=acceptedSemanticFixture();t.after(()=>ui.panel.dispose());
 await ui.byId('discussion-composer').listeners.get('submit')({preventDefault(){}});
 assert.deepEqual(ui.calls.map(call=>call[0]),['submit','read','followup']);
 assert.equal(ui.calls[1][1].targetId,'accepted-semantic-question');assert.equal(ui.calls[2][1],'accepted-semantic-question');
 assert.deepEqual(ui.calls[2][2],ui.calls[1][1]);assert.equal(JSON.stringify(ui.calls[2]).includes('Accepted question @AI'),false);
 assert.equal(ui.current().topicId,'topic-demo');assert.equal(ui.current().discussion.roots.length,0);
});

test('released semantic @AI drops stale navigation, account, changed question and foreign accepted destination',async t=>{
 const cases=[{afterRead:(dto,current,set)=>{set({...current,sourceId:'new-page'});return dto;}},
  {afterRead:(dto,current,set)=>{set({...current,actorId:'demo-other'});return dto;}},
  {afterRead:dto=>({...dto,root:{...dto.root,replies:[{...dto.root.replies[0],body:'Edited question'}]}})},
  {changeAccepted:current=>({...current,createdPost:{...current.createdPost,semantic:{...current.createdPost.semantic,rootId:'foreign-root'}}})},
  {aiPatch:{status:'generating'}}];
 for(const options of cases){const ui=acceptedSemanticFixture(options);t.after(()=>ui.panel.dispose());
  await ui.byId('discussion-composer').listeners.get('submit')({preventDefault(){}});
  assert.equal(ui.calls.filter(call=>call[0]==='submit').length,1);assert.equal(ui.calls.some(call=>call[0]==='followup'),false);
 }
});
test('released semantic accepted-human handoff preserves a newer unsent draft while fresh target is read',async t=>{
 const ui=acceptedSemanticFixture({afterRead:(dto,current,set)=>{
  set({...current,draft:{body:'A new private human draft',mode:'root',targetId:null,detached:false}});return dto;}});
 t.after(()=>ui.panel.dispose());await ui.byId('discussion-composer').listeners.get('submit')({preventDefault(){}});
 assert.equal(ui.calls.filter(call=>call[0]==='followup').length,1);
 assert.equal(ui.current().draft.body,'A new private human draft');assert.equal(JSON.stringify(ui.calls).includes('A new private human draft'),false);
});
