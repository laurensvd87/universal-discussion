import assert from "node:assert/strict";
import test from "node:test";
import { preparePrivateGeneration } from "../browser/core/private-generation-context.js";
import { readPrivateResponse } from "../browser/core/community-contract.js";
import { mountPrivateConversationPanel } from "../browser/chromium/private-conversation-panel.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { buildInsightContext } from "../browser/core/insight-context.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";
import { EN } from "../browser/locales/en.js";

const SOURCE = "reserved-example-com", TOPIC = "reserved-domain-demo";
const ACTOR = "account-11111111-1111-4111-8111-111111111111";
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture({ attest = true } = {}) {
  let counter = 0;
  const service = createMemoryDemoService({ nextId: prefix => `${prefix}-${++counter}`, now: () => "2026-10-11T12:00:00.000Z" });
  const catalog = service.catalog(), discussion = service.discussion(TOPIC), related = service.related(SOURCE, 20);
  let state = { phase: "ready", busy: false, needsFreshRead: false, sourceId: SOURCE, topicId: TOPIC,
    actorId: ACTOR, selection: "background", catalog, discussion, related,
    resolution: { documentId: "fixture-document", url: "https://example.com/", tabId: 7, currentWindowId: 2 } };
  let insight = { busy: false, ai: { connected: true, planEnabled: true, pending: false, model: "fixture",
    models: [{ slug: "fixture" }], account: { clientId: "fixture-client", label: "Alice" } },
    preferences: { replyLanguage: "en" }, browserLanguageHintEnabled: false, excludedRelatedSourceIds: [],
    relatedPageTextEnabled: true,
    context: buildInsightContext({ catalog, discussion, related, sourceId: SOURCE, topicId: TOPIC, sourceLimit: 21 }) };
  const article = deferred(); let attestCalls = 0;
  return {
    state: () => state, insight: () => insight,
    patchState: update => { state = { ...state, ...update }; },
    patchInsight: update => { insight = { ...insight, ...update }; },
    finish: () => article.resolve({ text: "Eligible public prefix", url: "https://example.com/", documentId: "fixture-document" }),
    attestCalls: () => attestCalls,
    prepare: () => preparePrivateGeneration({ sourceId: SOURCE, readState: () => structuredClone(state),
      readInsight: () => structuredClone(insight), readArticle: () => article.promise,
      attestArticle: async () => { attestCalls++; return attest; }, readBrowserLanguage: () => "de-DE" }),
  };
}

test("private preparation sends bounded public context without public discussion text or private history", async () => {
  const f = fixture(), pending = f.prepare(); f.finish(); const payload = await pending;
  assert.equal(payload.articleText, "Eligible public prefix");
  assert.equal(payload.context.currentSource.id, SOURCE);
  assert.equal(payload.context.coverage.discussionIncluded, false);
  assert.deepEqual(payload.context.discussion, []);
  assert.equal(f.attestCalls(), 1);
  assert.ok(payload.context.sameTopicSources.length + payload.context.relatedSources.length <= 5);
  assert.equal(Object.hasOwn(payload, "followup"), false);
});

for (const [name, change] of [
  ["account", f => f.patchState({ actorId: "account-22222222-2222-4222-8222-222222222222" })],
  ["original navigation witness", f => f.patchState({ resolution: { ...f.state().resolution, url: "https://example.com/?sessionId=changed" } })],
  ["document", f => f.patchState({ resolution: { ...f.state().resolution, documentId: "later-document" } })],
  ["public write busy", f => f.patchState({ busy: true })],
  ["fresh read requirement", f => f.patchState({ needsFreshRead: true })],
  ["research off", f => f.patchInsight({ relatedPageTextEnabled: false })],
  ["excluded source", f => f.patchInsight({ excludedRelatedSourceIds: [f.insight().context.sameTopicSources[0]?.id ?? f.insight().context.relatedSources[0]?.id ?? "different-source"] })],
  ["language preference", f => f.patchInsight({ preferences: { replyLanguage: "de" } })],
  ["Chrome language hint", f => f.patchInsight({ browserLanguageHintEnabled: true })],
  ["provider pending", f => f.patchInsight({ ai: { ...f.insight().ai, pending: true } })],
  ["provider model removal", f => f.patchInsight({ ai: { ...f.insight().ai, models: [] } })],
]) {
  test(`private preparation rejects a ${name} change during public capture`, async () => {
    const f = fixture(), pending = f.prepare(); change(f); f.finish();
    await assert.rejects(pending, TypeError);
  });
}

test("false attestation cannot authorize a private provider request", async () => {
  const f = fixture({ attest: false }), pending = f.prepare(); f.finish(); await assert.rejects(pending, TypeError);
});

test("private client accepts the existing fifty-provider-citation bound and rejects secret fields", () => {
  const citations = Array.from({ length: 50 }, (_, index) => ({ url: "https://example.com/", title: "Source", startIndex: index, endIndex: index + 1 }));
  const page = { messages: [{ id: "message", actorType: "agent", body: "Bounded answer", citations }] };
  assert.equal(readPrivateResponse(page).messages[0].citations.length, 50);
  assert.throws(() => readPrivateResponse({ ...page, accessToken: "must-not-arrive" }), TypeError);
  assert.throws(() => readPrivateResponse({ messages: Array(26).fill({ body: "bounded" }) }), TypeError);
});

function panelFixture() {
  const created = [], calls = [], reads = []; let actor = ACTOR, generationVersion = 1, failNextSend = false, holdGeneration = null;
  const document = { activeElement: null,
    createTextNode(value) { return { tag: "#text", textContent: value, children: [] }; },
    createElement(tag) {
      const item = { tag, children: [], listeners: new Map(), attributes: {}, dataset: {}, value: "", textContent: "",
        append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
        setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(event, fn) { this.listeners.set(event, fn); },
        focus() { document.activeElement = this; }, scrollIntoView() {},
        get lastElementChild() { return this.children.at(-1); } };
      created.push(item); return item;
    } };
  const conversation = { id: "private-conversation", sourceId: SOURCE, sourceUrl: "https://example.com/",
    visibility: "private", title: "Private opener", revision: 2, createdAt: "2026-10-11T12:00:00.000Z" };
  const messages = [
    { id: "private-human", actorType: "human", body: "Private opener", citations: [], createdAt: conversation.createdAt, generation: { state: "completed" } },
    { id: "private-agent", actorType: "agent", body: "Private AI answer", citations: [], createdAt: conversation.createdAt,
      insight: { operatorId: ACTOR, model: "fixture" } },
  ];
  let sequence = 0;
  const root = document.createElement("section");
  const panel = mountPrivateConversationPanel(document, root, {
    readActor: () => actor, requestSignIn: async () => false, randomId: () => `operation-${++sequence}`,
    showView() {}, attestStart: async () => true,
    readPublicState: () => ({ phase: "ready", sourceId: SOURCE, topicId: TOPIC,
      catalog: { sources: [{ id: SOURCE, topicId: TOPIC, url: "https://example.com/" }] } }),
    prepareGeneration: () => holdGeneration?.promise ?? Promise.resolve({ model: `fixture-${generationVersion}` }),
    client: { command() { assert.fail("Private text reached public command"); },
      async privateConversation(action, input, owner) {
        calls.push({ action, input: structuredClone(input), owner });
        if (action === "create") return { conversationId: conversation.id, messageId: messages[0].id, revision: 1 };
        if (action === "read") return reads.length ? reads.shift() : { conversation: { ...conversation }, messages: structuredClone(messages), next: null };
        if (action === "send") {
          if (failNextSend) { failNextSend = false; throw { code: "unavailable" }; }
          return { conversationId: conversation.id, messageId: "accepted-human", revision: 3 };
        }
        if (action === "list") return { conversations: [], next: null };
        throw new Error(`Unexpected action ${action}`);
      } } });
  const draft = created.find(item => item.id === "private-message-body"), form = created.find(item => item.tag === "form");
  return { panel, root, draft, calls, document, form,
    page(items = messages, revision = 2, next = null) { return { conversation: { ...conversation, revision }, messages: structuredClone(items), next }; },
    messages: structuredClone(messages), queueRead(value) { reads.push(value); },
    bubbles() { return root.children.find(item => item.id === "private-chat-feed").children.filter(item => item.tag === "article").map(item => item.attributes["data-message-id"]); },
    more() { return root.children.find(item => item.id === "private-chat-feed").children.find(item => item.tag === "button" && item.textContent === EN.communityMore); },
    submit: () => form.listeners.get("submit")({ preventDefault() {} }),
    setActor(value) { actor = value; panel.accountChanged(); },
    pauseGeneration() { holdGeneration = deferred(); return holdGeneration; },
    failSend() { failNextSend = true; }, changeGeneration() { generationVersion++; },
  };
}

test("a failed private send preserves its exact operation payload across a deliberate second click", async () => {
  const f = panelFixture(); await f.panel.start("Private opener"); f.draft.value = "PRIVATE_REPLY_TEXT";
  f.failSend(); await f.submit(); f.changeGeneration(); await f.submit();
  const sends = f.calls.filter(call => call.action === "send"); assert.equal(sends.length, 2);
  assert.deepEqual(sends[0], sends[1]); assert.equal(sends[0].input.body, "PRIVATE_REPLY_TEXT");
  assert.ok(f.calls.every(call => call.owner === ACTOR)); f.panel.dispose();
});

const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
test("late private latest reads cannot roll back a newer answer or conversation revision", async () => {
  const f = panelFixture(); await f.panel.start("Private opener");
  const older = deferred(), newer = deferred(); f.queueRead(older.promise); f.queueRead(newer.promise);
  f.panel.setActive(true); f.panel.setActive(true);
  const answer = { ...f.messages[1], id: "new-private-agent", body: "Completed newest answer" };
  newer.resolve(f.page([...f.messages, answer], 4)); await flush();
  older.resolve(f.page(f.messages, 2)); await flush();
  assert.deepEqual(f.bubbles(), ["private-human", "private-agent", "new-private-agent"]);
  f.draft.value = "Next private reply"; await f.submit();
  const sent = f.calls.find(call => call.action === "send");
  assert.equal(sent.input.expectedRevision, 4); assert.equal(sent.input.replyToId, "new-private-agent"); f.panel.dispose();
});

test("private older-page loads deduplicate a repeated click and survive a latest poll", async () => {
  const f = panelFixture(); f.queueRead(f.page(f.messages, 2, "private-human")); await f.panel.start("Private opener");
  const earlier = { ...f.messages[0], id: "earlier-human", body: "Earlier private root" }, old = deferred();
  f.queueRead(old.promise);
  const more = f.more(); assert.ok(more, "Earlier page control is visible");
  more.listeners.get("click")(); more.listeners.get("click")();
  assert.equal(f.calls.filter(call => call.action === "read" && call.input.after === "private-human").length, 1);
  old.resolve(f.page([earlier, f.messages[0]], 2)); await flush();
  assert.deepEqual(f.bubbles(), ["earlier-human", "private-human", "private-agent"]);
  f.queueRead(f.page(f.messages, 2, "private-human")); f.panel.setActive(true); await flush();
  assert.deepEqual(f.bubbles(), ["earlier-human", "private-human", "private-agent"]); f.panel.dispose();
});

test("a non-overlapping latest page keeps its earlier cursor without retargeting an unsent private reply", async () => {
  const f = panelFixture(); await f.panel.start("Private opener"); f.draft.value = "Reply intended for original own assistant";
  const next = { ...f.messages[1], id: "distant-latest-agent", body: "New distant answer" };
  f.queueRead(f.page([next], 20, "missing-middle-cursor")); f.panel.setActive(true); await flush();
  assert.deepEqual(f.bubbles(), ["distant-latest-agent"]); assert.ok(f.more());
  assert.equal(f.draft.value, "Reply intended for original own assistant");
  await f.submit();
  assert.ok(f.calls.filter(call => call.action === "send").every(call => call.input.replyToId === "private-agent"),
    "An accepted reply must retain its deliberately selected original target, never latest by accident");
  f.panel.dispose();
});

test("private preparation holds editor text/focus and account switching discards the late send intent", async () => {
  const f = panelFixture(); await f.panel.start("Private opener"); f.draft.value = "PRIVATE_REPLY_TEXT"; f.draft.focus();
  const capture = f.pauseGeneration(), pending = f.submit();
  assert.equal(f.draft.readOnly, true); assert.equal(f.document.activeElement, f.draft);
  f.setActor("account-22222222-2222-4222-8222-222222222222");
  capture.resolve({ model: "fixture" }); await pending;
  assert.equal(f.calls.filter(call => call.action === "send").length, 0);
  assert.equal(f.draft.value, "");
  assert.equal(JSON.stringify(f.root.children).includes("PRIVATE_REPLY_TEXT"), false); f.panel.dispose();
});

for (const key of ["pairingToken", "idToken", "authorization", "accountSession", "access_token", "refresh_token"]) {
  test(`private transport refuses a nested ${key} credential alias`, () => {
    assert.throws(() => readPrivateResponse({ messages: [{ body: "Private prose", insight: { [key]: "secret" } }] }), TypeError);
  });
}

function attestationFixture({ background = false } = {}) {
  const service = createMemoryDemoService({ nextId: prefix => `${prefix}-attestation`, now: () => "2026-10-11T12:00:00.000Z" });
  let actor = ACTOR, tab = { tabId: 7, url: "https://example.com/", windowId: 2 }, gate = null;
  let resolution = { phase: "ready", reason: null, tabId: 7, url: tab.url, documentId: "fixture-doc", sourceId: SOURCE, topicId: TOPIC,
    assignment: "confirmed", sequence: 1, enabled: true, blockedOrigins: [], sessionWindowId: 2, currentWindowId: 2,
    sessionRevision: "fixture-revision", hostAccess: true, currentOrigin: "https://example.com", currentTabId: 7, currentUrl: tab.url, contextReason: null };
  const catalog = () => {
    const value = structuredClone(service.catalog());
    value.actors.push({ id: ACTOR, displayName: "Synthetic Alice", type: "human", demo: false });
    if (background) value.sources.find(source => source.id === SOURCE).provenance = "owner-local-page-embedding/v1";
    return value;
  };
  const controller = createLocalDiscussionController({ session: { isPaired: async () => true },
    client: { health: async () => ({}), catalog: async () => catalog(), discussion: async topic => service.discussion(topic),
      related: async source => service.related(source, 20),
      priorDiscussions: async sourceId => ({ version: service.catalog().version, sourceId, currentTopicId: TOPIC, topics: [] }),
      command() { assert.fail("Attestation may not post public text"); } },
    readPostingActor: () => actor, readActiveTab: async () => tab, observeTabLifecycle: () => () => {},
    attestActiveContext: async () => gate ? gate.promise : true,
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    ...(background ? { readPageResolution: async () => resolution } : {}) });
  return { controller, changeActor(value) { actor = value; }, changeTab(update) { tab = { ...tab, ...update }; },
    changeResolution(update) { resolution = { ...resolution, ...update }; }, pause() { gate = deferred(); return gate; } };
}

test("real public controller attests an active named-account private root without posting", async () => {
  const f = attestationFixture(); await f.controller.open(); f.controller.setDraft("Private root draft");
  assert.equal(f.controller.currentState().phase, "ready");
  assert.equal(await f.controller.attestPrivateStart(f.controller.currentState()), true);
  f.controller.dispose();
});

for (const [name, change] of [
  ["account", f => f.changeActor("account-22222222-2222-4222-8222-222222222222")],
  ["root draft", f => f.controller.setDraft("New unsent draft")],
  ["panel invalidation", f => f.controller.invalidateContext()],
  ["active page", f => f.changeTab({ url: "https://example.org/" })],
]) {
  test(`real private-root attestation rejects ${name} racing the panel witness`, async () => {
    const f = attestationFixture(); await f.controller.open(); f.controller.setDraft("Private root draft");
    const gate = f.pause(), pending = f.controller.attestPrivateStart(f.controller.currentState());
    change(f); gate.resolve(true); assert.equal(await pending, false); f.controller.dispose();
  });
}

for (const [name, change] of [
  ["original navigation query", f => f.changeTab({ url: "https://example.com/?sessionId=different" })],
  ["document identity", f => f.changeResolution({ documentId: "different-doc" })],
  ["owning window", f => f.changeTab({ windowId: 3 })],
]) {
  test(`background private-root attestation preserves the ${name} fence`, async () => {
    const f = attestationFixture({ background: true }); await f.controller.open(); f.controller.setDraft("Private root draft");
    assert.equal(f.controller.currentState().selection, "background");
    assert.equal(await f.controller.attestPrivateStart(f.controller.currentState()), true);
    const gate = f.pause(), pending = f.controller.attestPrivateStart(f.controller.currentState());
    change(f); gate.resolve(true); assert.equal(await pending, false); f.controller.dispose();
  });
}
