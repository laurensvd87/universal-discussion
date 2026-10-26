import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrivateDiscussionService } from "../src/private/private-service.js";
import { PrivateRepository } from "../src/private/private-repository.js";
import { createChatGPTRuntime } from "../src/ai/chatgpt-runtime.js";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";
import { createAccountLifecycle } from "../src/accounts/account-lifecycle.js";
import { demoService, deterministicDependencies } from "./helpers.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { createInsightPageReader } from "../../../spikes/topic-resolution/browser/chromium/insight-page-reader.js";
import { preparePrivateGeneration } from "../../../spikes/topic-resolution/browser/core/private-generation-context.js";
import { ServiceError } from "../src/domain/errors.js";

const ALICE = { id: "account-11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111",
  displayName: "Alice", type: "human", demo: false };
const BOB = { ...ALICE, id: "account-22222222-2222-4222-8222-222222222222", accountId: "22222222-2222-4222-8222-222222222222", displayName: "Bob" };
const SOURCE = "reserved-example-com", TOPIC = "reserved-domain-demo";
const URL = "https://example.com/";
const PAGE = { after: null, limit: 25 };
const failure = code => error => error instanceof ServiceError && error.code === code;
function fixture(t, { filename = ":memory:", provider = null } = {}) {
  const canonical = demoService();
  const actors = new Map([[ALICE.id, ALICE], [BOB.id, BOB]]);
  const publicService = { ...canonical, actor(actorId) {
    const actor = actors.get(actorId); if (!actor) throw new ServiceError("forbidden", "Actor unavailable"); return actor;
  } };
  const calls = [];
  const ai = { generatePrivate: async (value, actorId, options) => {
    calls.push({ value, actorId, options });
    return provider ? provider(value, actorId, options) : { body: "Private generated answer", citations: [], model: "fixture" };
  } };
  const service = createPrivateDiscussionService({ databasePath: filename, ai, publicService,
    canGenerate: actorId => actors.has(actorId), ...deterministicDependencies() });
  t.after(() => service.close());
  const generation = () => {
    const catalog = canonical.catalog();
    return { model: "fixture", articleText: "Eligible public page", allowWebResearch: false, expected: catalog.version,
      context: buildInsightContext({ catalog, discussion: canonical.discussion(TOPIC), related: canonical.related(SOURCE, 20),
        sourceId: SOURCE, topicId: TOPIC, includeDiscussion: false }) };
  };
  const create = (owner = ALICE, operationId = "create-private", body = "PRIVATE_THREAD_MARKER") => service.create(owner, {
    operationId, body, sourceId: SOURCE, sourceUrl: URL });
  const read = conversationId => service.read(ALICE, { conversationId, ...PAGE });
  const generate = root => service.generate(ALICE, { conversationId: root.conversationId, messageId: root.messageId,
    expectedRevision: root.revision, generation: generation() });
  return { canonical, publicService, service, calls, generation, create, read, generate, actors };
}

test("private messages remain outside every canonical read and require exact account ownership", t => {
  const f = fixture(t), publicBefore = JSON.stringify(f.canonical.catalog());
  const root = f.create();
  assert.equal(JSON.stringify(f.canonical.catalog()), publicBefore);
  for (const value of [f.canonical.discussion(TOPIC), f.canonical.related(SOURCE), f.canonical.priorDiscussions(SOURCE)]) {
    assert.equal(JSON.stringify(value).includes("PRIVATE_THREAD_MARKER"), false);
    assert.equal(JSON.stringify(value).includes(root.conversationId), false);
  }
  assert.equal(f.read(root.conversationId).conversation.visibility, "private");
  assert.equal(f.service.list(BOB, PAGE).conversations.length, 0);
  assert.throws(() => f.service.read(BOB, { conversationId: root.conversationId, ...PAGE }), failure("not-found"));
  assert.throws(() => f.service.remove(BOB, { conversationId: root.conversationId }), failure("not-found"));
  assert.throws(() => f.service.create({ ...ALICE, accountId: BOB.accountId }, {
    operationId: "forged", body: "Text", sourceId: SOURCE, sourceUrl: URL }), failure("forbidden"));
  assert.throws(() => f.service.create(ALICE, {
    operationId: "forged-source", body: "Text", sourceId: SOURCE, sourceUrl: "https://elsewhere.example.net/" }), failure("forbidden"));
  assert.throws(() => f.service.create(ALICE, {
    operationId: "visibility", body: "Text", sourceId: SOURCE, sourceUrl: URL, visibility: "public" }), failure("invalid"));
});

test("accepted own-AI replies issue one bounded attempt; duplicate sends and explicit generation cannot retry", async t => {
  const f = fixture(t), root = f.create(ALICE, "root", "OLD_PRIVATE_HISTORY");
  f.generate(root); await f.service.whenIdle();
  const first = f.read(root.conversationId), parent = first.messages.find(message => message.actorType === "agent");
  const command = { operationId: "human-reply", conversationId: root.conversationId, replyToId: parent.id,
    body: "Q".repeat(3_000), expectedRevision: first.conversation.revision, generation: f.generation() };
  const sent = f.service.send(ALICE, command);
  assert.equal(f.service.send(ALICE, command).replayed, true);
  await f.service.whenIdle();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].value.followup.questionBody.length, 2_000);
  assert.equal(f.calls[1].value.followup.parentBody, parent.body);
  assert.equal(JSON.stringify(f.calls[1].value).includes("OLD_PRIVATE_HISTORY"), false);
  assert.equal(f.read(root.conversationId).messages.length, 4);
  assert.equal(f.service.generate(ALICE, { conversationId: root.conversationId, messageId: sent.messageId,
    expectedRevision: sent.revision, generation: f.generation() }).generation.state, "completed");
  assert.equal(f.calls.length, 2);
  assert.throws(() => f.service.send(ALICE, { ...command, body: "Changed duplicate" }), failure("conflict"));
  assert.throws(() => f.service.send(BOB, { ...command, operationId: "bob-reply" }), failure("not-found"));
});

test("missing context keeps the human reply and a terminal failure; later reopen cannot trigger generation", async t => {
  const f = fixture(t), root = f.create(); f.generate(root); await f.service.whenIdle();
  const first = f.read(root.conversationId), parent = first.messages.at(-1);
  const sent = f.service.send(ALICE, { operationId: "no-context", conversationId: root.conversationId,
    replyToId: parent.id, body: "Saved human reply", expectedRevision: first.conversation.revision });
  assert.deepEqual(sent.generation, { state: "failed", error: "context-unavailable" });
  f.service.generate(ALICE, { conversationId: root.conversationId, messageId: sent.messageId,
    expectedRevision: sent.revision, generation: f.generation() });
  assert.equal(f.calls.length, 1);
  assert.equal(f.read(root.conversationId).messages.at(-1).body, "Saved human reply");
});

test("replies to a human and generated answers never recursively issue requests", async t => {
  const f = fixture(t), root = f.create();
  const sent = f.service.send(ALICE, { operationId: "human-to-human", conversationId: root.conversationId,
    replyToId: root.messageId, body: "Second human", expectedRevision: root.revision, generation: f.generation() });
  assert.equal(sent.generation.state, "none"); assert.equal(f.calls.length, 0);
  f.generate(sent); await f.service.whenIdle();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].value.followup, { parentBody: "Second human", questionBody: "Second human" });
});

test("generation acceptance rejects changed revision, deletion and inactive accounts", async t => {
  let release;
  const f = fixture(t, { provider: () => new Promise(resolve => { release = resolve; }) });
  const root = f.create(); f.generate(root);
  f.service.send(ALICE, { operationId: "unrelated-private-send", conversationId: root.conversationId,
    replyToId: root.messageId, body: "Changed conversation", expectedRevision: root.revision });
  release({ body: "Stale answer", citations: [], model: "fixture" }); await f.service.whenIdle();
  assert.equal(f.read(root.conversationId).messages.length, 2);
  assert.equal(f.read(root.conversationId).messages[0].generation.error, "stale-context");
  const other = f.create(ALICE, "other"); f.generate(other);
  f.service.remove(ALICE, { conversationId: other.conversationId });
  release({ body: "Deleted answer", citations: [], model: "fixture" }); await f.service.whenIdle();
  assert.throws(() => f.read(other.conversationId), failure("not-found"));
  const third = f.create(ALICE, "third"); f.generate(third); f.actors.delete(ALICE.id);
  release({ body: "Inactive answer", citations: [], model: "fixture" }); await f.service.whenIdle();
  assert.throws(() => f.read(third.conversationId), failure("forbidden"));
});

test("export pages are bounded, own-only and version checked; erasure removes bodies, claims and receipts", async t => {
  const f = fixture(t), root = f.create(); f.generate(root); await f.service.whenIdle();
  const ownerVersion = f.service.exportPage(ALICE.id, { after: null, expectedVersion: null }).version;
  f.create(BOB, "bob-secret", "BOB_SECRET");
  assert.equal(f.service.exportPage(ALICE.id, { after: null, expectedVersion: ownerVersion }).version, ownerVersion);
  let after = null, version = null; const exported = [];
  do {
    const page = f.service.exportPage(ALICE.id, { after, expectedVersion: version });
    version = page.version; assert.ok(page.messages.length <= 1); exported.push(...page.messages); after = page.next;
    assert.equal(JSON.stringify(page).includes("BOB_SECRET"), false);
  } while (after !== null);
  assert.equal(exported.length, 2);
  assert.throws(() => f.service.exportPage(BOB.id, { after: exported[0].id, expectedVersion: version }), failure("conflict"));
  f.create(ALICE, "changed-export");
  assert.throws(() => f.service.exportPage(ALICE.id, { after: null, expectedVersion: version }), failure("conflict"));
  f.service.eraseAccount(ALICE.id);
  const erased = f.service.exportPage(ALICE.id, { after: null, expectedVersion: null });
  assert.equal(erased.messages.length, 0); assert.equal(erased.version, 0);
  assert.equal(f.service.list(BOB, PAGE).conversations.length, 1);
});

test("latest message pagination preserves insertion order, owned cursors and bounded Unicode response bytes", t => {
  const f = fixture(t), root = f.create(); let currentRevision = root.revision;
  for (let index = 0; index < 30; index++) {
    const sent = f.service.send(ALICE, { operationId: `large-${index}`, conversationId: root.conversationId,
      replyToId: root.messageId, body: `${index}:` + "界".repeat(7_995), expectedRevision: currentRevision });
    currentRevision = sent.revision;
  }
  const recent = f.service.read(ALICE, { conversationId: root.conversationId, ...PAGE });
  assert.ok(recent.messages.length < 25); assert.ok(Buffer.byteLength(JSON.stringify(recent)) < 512_000);
  assert.ok(recent.messages.at(-1).body.startsWith("29:"));
  const older = f.service.read(ALICE, { conversationId: root.conversationId, after: recent.next, limit: 25 });
  assert.equal(older.messages[0].id, root.messageId); assert.equal(older.next, null);
  assert.equal(new Set([...older.messages, ...recent.messages].map(row => row.id)).size, 31);
  const other = f.create(BOB, "foreign-page");
  assert.throws(() => f.service.read(ALICE, { conversationId: root.conversationId, after: other.messageId, limit: 25 }), failure("not-found"));
});

test("file restart retains receipts and marks a dispatched interrupted claim terminal without replay", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "private-restart-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "private.sqlite"), f = fixture(t, { filename });
  const root = f.create(); f.generate(root); await f.service.whenIdle(); f.service.close();
  const db = new DatabaseSync(filename);
  db.prepare("UPDATE private_claims SET state='running',answer_id=NULL WHERE message_id=?").run(root.messageId); db.close();
  const second = fixture(t, { filename });
  assert.equal(second.create().replayed, true);
  assert.deepEqual(second.read(root.conversationId).messages[0].generation, { state: "failed", error: "interrupted" });
  second.generate(root); assert.equal(second.calls.length, 0);
  second.service.close();
});

test("account erasure removes the private owner version record and cannot recreate it from a late answer", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "private-erasure-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "private.sqlite"); let release;
  const f = fixture(t, { filename, provider: () => new Promise(resolve => { release = resolve; }) });
  const root = f.create(); f.create(BOB, "bob-retained"); f.generate(root);
  f.service.eraseAccount(ALICE.id);
  release({ body: "Late erased answer", citations: [], model: "fixture" }); await f.service.whenIdle();
  f.service.close();
  const db = new DatabaseSync(filename);
  try {
    for (const table of ["private_conversations", "private_operations", "private_claims", "private_owner_versions"]) {
      assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table} WHERE owner_id=?`).get(ALICE.id).count, 0);
    }
    assert.equal(db.prepare("SELECT count(*) AS count FROM private_owner_versions WHERE owner_id=?").get(BOB.id).count, 1);
  } finally { db.close(); }
});

test("strict separate store refuses a canonical database and unexpected triggers without changing data", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "private-schema-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "canonical.sqlite"), db = new DatabaseSync(filename);
  db.exec("CREATE TABLE demo_state (document TEXT); INSERT INTO demo_state VALUES ('public fixture')"); db.close();
  assert.throws(() => new PrivateRepository(filename), failure("storage-schema"));
  const check = new DatabaseSync(filename); assert.equal(check.prepare("SELECT document FROM demo_state").get().document, "public fixture"); check.close();
  const privatePath = path.join(directory, "private.sqlite"), repository = new PrivateRepository(privatePath); repository.close();
  const modified = new DatabaseSync(privatePath); modified.exec("CREATE TRIGGER unexpected AFTER INSERT ON private_messages BEGIN DELETE FROM private_messages; END"); modified.close();
  assert.throws(() => new PrivateRepository(privatePath), failure("storage-schema"));
});

test("private runtime keeps separate public proof authority and suppresses debugging per invocation", async t => {
  const f = fixture(t); let identity = { issuer: "https://auth.openai.com", clientId: "fixture", subject: "alice" };
  const calls = [], runtime = createChatGPTRuntime({ service: f.publicService,
    connectionAdapter: { accountIdentity: () => identity, status: () => ({ connected: true, planEnabled: true, account: { clientId: identity.clientId, label: "Alice" } }), dispose() {} },
    insightsAdapter: { async createInsight(value, options) { calls.push({ value, options }); return { body: "Exact private response", citations: [], model: "fixture" }; }, cancel() {}, dispose() {} } });
  t.after(() => runtime.dispose());
  const value = { ...f.generation(), followup: { parentBody: "Private parent", questionBody: "Private question" } };
  const result = await runtime.generatePrivate(value, ALICE.id);
  assert.equal(result.body, "Exact private response"); assert.equal(calls[0].options.suppressDebug, true);
  assert.deepEqual(runtime.resumable(ALICE.id), { job: null });
  assert.throws(() => runtime.share({ expected: f.canonical.catalog().version, command: {
    type: "share-insight", operationId: "private-not-public", topicId: TOPIC, originSourceId: SOURCE, body: result.body } }, ALICE.id, () => assert.fail("public persist")), failure("not-found"));
  assert.equal(f.canonical.discussion(TOPIC).roots.length, 0);
});

test("private runtime refuses provider identity/source changes and cancellation before accepting exact results", async t => {
  const f = fixture(t); let identity = { issuer: "https://auth.openai.com", clientId: "fixture", subject: "alice" };
  let sourceChanged = false, release;
  const service = { ...f.publicService, insightAnchor(topicId, sourceId) {
    const anchor = f.publicService.insightAnchor(topicId, sourceId);
    return sourceChanged ? { ...anchor, sourceTitle: "Changed source" } : anchor;
  } };
  const runtime = createChatGPTRuntime({ service,
    connectionAdapter: { accountIdentity: () => identity, status: () => ({ connected: true, planEnabled: true, account: { clientId: "fixture", label: "Alice" } }), dispose() {} },
    insightsAdapter: { createInsight: () => new Promise(resolve => { release = resolve; }), cancel() {}, dispose() {} } });
  t.after(() => runtime.dispose());
  const input = { ...f.generation(), followup: { parentBody: "Private AI", questionBody: "Private human" } };
  const providerChanged = runtime.generatePrivate(input, ALICE.id);
  identity = { ...identity, subject: "bob" }; release({ body: "Changed identity answer", citations: [], model: "fixture" });
  await assert.rejects(providerChanged, failure("conflict"));
  const anchorChanged = runtime.generatePrivate(input, ALICE.id);
  sourceChanged = true; release({ body: "Changed source answer", citations: [], model: "fixture" });
  await assert.rejects(anchorChanged, failure("conflict")); sourceChanged = false;
  const abort = new AbortController(), cancelled = runtime.generatePrivate(input, ALICE.id, { signal: abort.signal });
  abort.abort(); release({ body: "Cancelled answer", citations: [], model: "fixture" });
  await assert.rejects(cancelled, failure("conflict"));
  assert.deepEqual(runtime.resumable(ALICE.id), { job: null });
});

test("private preflight reserves the provider lane and aborts before dispatch", async t => {
  const f = fixture(t);
  const identity = { issuer: "https://auth.openai.com", clientId: "fixture", subject: "alice" };
  const generation = f.generation(), catalog = f.canonical.catalog();
  const bundle = { version: catalog.version, catalog, discussion: f.canonical.discussion(TOPIC),
    related: f.canonical.related(SOURCE, 20), anchor: f.publicService.insightAnchor(TOPIC, SOURCE),
    followupDiscussion: null };
  const releases = [];
  let providerCalls = 0;
  const service = { ...f.publicService,
    insightBundle: () => new Promise(resolve => { releases.push(resolve); }) };
  const runtime = createChatGPTRuntime({ service,
    connectionAdapter: { accountIdentity: () => identity,
      status: () => ({ connected: true, planEnabled: true, account: { clientId: "fixture", label: "Alice" } }),
      dispose() {} },
    insightsAdapter: { async createInsight() { providerCalls += 1;
      return { body: "Private response", citations: [], model: "fixture" }; }, cancel() {}, dispose() {} } });
  t.after(() => runtime.dispose());
  const input = { ...generation, followup: { parentBody: "Private AI", questionBody: "Private human" } };
  const first = runtime.generatePrivate(input, ALICE.id);
  await assert.rejects(runtime.generatePrivate(input, ALICE.id), failure("conflict"));
  assert.throws(() => runtime.create({ ...generation, operationId: "public-during-private" }, ALICE.id),
    failure("conflict"));
  releases.shift()(bundle);
  assert.equal((await first).body, "Private response");
  assert.equal(providerCalls, 1);

  const abort = new AbortController();
  const cancelled = runtime.generatePrivate(input, ALICE.id, { signal: abort.signal });
  abort.abort();
  releases.shift()(bundle);
  await assert.rejects(cancelled, failure("conflict"));
  assert.equal(providerCalls, 1, "aborted preflight never reaches the provider");
});

test("private runtime accepts unrelated public revisions but rejects a reset recreating the identical Source", async t => {
  const f = fixture(t); let release;
  const identity = { issuer: "https://auth.openai.com", clientId: "fixture", subject: "alice" };
  const runtime = createChatGPTRuntime({ service: f.publicService,
    connectionAdapter: { accountIdentity: () => identity, status: () => ({ connected: true, planEnabled: true }), dispose() {} },
    insightsAdapter: { createInsight: () => new Promise(resolve => { release = resolve; }), cancel() {}, dispose() {} } });
  t.after(() => runtime.dispose());
  const input = () => ({ ...f.generation(), followup: { parentBody: "Private AI", questionBody: "Private human" } });
  const revisionOnly = runtime.generatePrivate(input(), ALICE.id);
  f.canonical.command(f.canonical.catalog().version, { type: "create-root", topicId: TOPIC, body: "Unrelated public write" }, "demo-alex");
  release({ body: "Accepted private response", citations: [], model: "fixture" });
  assert.equal((await revisionOnly).body, "Accepted private response");
  const reset = runtime.generatePrivate(input(), ALICE.id), before = f.canonical.insightAnchor(TOPIC, SOURCE);
  f.canonical.reset(f.canonical.catalog().version, "RESET DEMO STATE");
  const after = f.canonical.insightAnchor(TOPIC, SOURCE);
  assert.deepEqual({ ...before, version: null }, { ...after, version: null });
  assert.notEqual(after.version.generation, before.version.generation);
  release({ body: "Reset response", citations: [], model: "fixture" });
  await assert.rejects(reset, failure("conflict"));
});

test("private storage independently fences a mocked answer across canonical reset", async t => {
  let release;
  const f = fixture(t, { provider: () => new Promise(resolve => { release = resolve; }) });
  const root = f.create(); f.generate(root);
  f.canonical.reset(f.canonical.catalog().version, "RESET DEMO STATE");
  release({ body: "Reset private answer", citations: [], model: "fixture" }); await f.service.whenIdle();
  const view = f.read(root.conversationId);
  assert.equal(view.messages.length, 1);
  assert.deepEqual(view.messages[0].generation, { state: "failed", error: "stale-context" });
});

test("private generation requires an explicit provider-account match seam and preserves a terminal failure", async t => {
  const f = fixture(t); let dispatched = 0;
  const separate = createPrivateDiscussionService({ databasePath: ":memory:", publicService: f.publicService,
    ai: { generatePrivate() { dispatched++; return Promise.resolve({ body: "No dispatch", citations: [], model: "fixture" }); } }, ...deterministicDependencies() });
  t.after(() => separate.close());
  const root = separate.create(ALICE, { operationId: "denied-private", body: "Human root", sourceId: SOURCE, sourceUrl: URL });
  const status = separate.generate(ALICE, { conversationId: root.conversationId, messageId: root.messageId,
    expectedRevision: root.revision, generation: f.generation() });
  assert.deepEqual(status.generation, { state: "failed", error: "context-unavailable" });
  assert.equal(dispatched, 0);
});

test("provider adapter private debug suppression preserves ordinary public debug capture", async () => {
  const debug = [], payloads = [];
  const source = { id: "source", url: "https://example.com/", title: "Public source" };
  const request = { model: "fixture", articleText: "Public article", allowWebResearch: false,
    context: { schema: "insight-context/v1", topic: { id: "topic", title: "Topic" }, currentSource: source,
      sameTopicSources: [], relatedSources: [], discussion: [], coverage: { sameTopicTotal: 0, relatedTotal: 0, discussionIncluded: false }, limitations: [] } };
  const adapter = createChatGptInsights({ getAccessToken: async () => "synthetic-oauth-token-for-tests", onDebug: event => debug.push(event),
    fetchImpl: async (url, options) => {
      if (url.endsWith("/models")) return new Response(JSON.stringify({ models: [{ slug: "fixture", display_name: "Fixture", visibility: "list" }] }), { headers: { "content-type": "application/json" } });
      payloads.push(JSON.parse(options.body));
      return new Response(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: {
        status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Safe answer", annotations: [] }] }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
    } });
  await adapter.createInsight({ ...request, followup: { parentBody: "PRIVATE_PARENT", questionBody: "PRIVATE_QUESTION" } }, { suppressDebug: true });
  assert.equal(debug.length, 0); assert.equal(JSON.stringify(payloads[0]).includes("PRIVATE_QUESTION"), true);
  await adapter.createInsight(request); assert.equal(debug.length, 2); assert.equal(JSON.stringify(debug).includes("PRIVATE_QUESTION"), false);
  adapter.dispose();
});

test("composed private capture normalizes language marks, completes once per human and suppresses raw debug across reopen", async t => {
  const f = fixture(t), directory = mkdtempSync(path.join(tmpdir(), "private-composed-"));
  const databasePath = path.join(directory, "private.sqlite");
  const directionMarks = "\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069";
  const visibleText = "English العربية עברית ";
  let capturedText = (visibleText + directionMarks + "P".repeat(4_096)).slice(0, 4_096);
  const normalizedText = capturedText.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "");
  const documentUrl = URL + "?sid=synthetic-session&utm_source=fixture";
  let activeUrl = documentUrl;
  const scripts = [], payloads = [], debug = [], requests = [];
  const pageReader = createInsightPageReader({
    readActiveTab: async () => ({ tabId: 7, windowId: 1, url: activeUrl }),
    scriptingApi: { async executeScript(options) {
      scripts.push(options);
      return [{ frameId: 0, documentId: "document-private-fixture", result: options.target.documentIds
        ? { contractVersion: "page-content-attestation/1", status: "attested", url: URL }
        : { contractVersion: "page-content/1", status: "collected", url: URL, title: "Public fixture",
          text: capturedText, extractorVersion: "main-text-prefix/v1" } }];
    } },
  });
  const state = { phase: "ready", busy: false, needsFreshRead: false, selection: "background",
    actorId: ALICE.id, sourceId: SOURCE, topicId: TOPIC, catalog: f.canonical.catalog(),
    discussion: f.canonical.discussion(TOPIC), related: f.canonical.related(SOURCE, 20),
    resolution: { enabled: true, phase: "ready", tabId: 7, documentId: "document-private-fixture",
      sourceId: SOURCE, topicId: TOPIC, currentTabId: 7, url: documentUrl, currentUrl: documentUrl,
      hostAccess: true, sessionWindowId: 1, currentWindowId: 1, blockedOrigins: [], currentOrigin: "https://example.com" } };
  const identity = { issuer: "https://auth.openai.com", clientId: "fixture", subject: "alice" };
  const insight = { ai: { connected: true, planEnabled: true, pending: false, model: "fixture",
    models: [{ slug: "fixture" }], account: { clientId: "fixture", label: "Alice" } },
    busy: false, relatedPageTextEnabled: false, excludedRelatedSourceIds: [], preferences: {},
    browserLanguageHintEnabled: false, context: f.generation().context };
  const prepare = () => preparePrivateGeneration({ sourceId: SOURCE, readState: () => state,
    readInsight: () => insight, readArticle: pageReader.read, attestArticle: pageReader.attest });
  const adapter = createChatGptInsights({ getAccessToken: async () => "synthetic-oauth-token-for-tests",
    onDebug: event => debug.push(event), fetchImpl: async (url, options) => {
      requests.push(url);
      if (url.endsWith("/models")) return new Response(JSON.stringify({ models: [
        { slug: "fixture", display_name: "Fixture", visibility: "list" } ] }),
        { headers: { "content-type": "application/json" } });
      assert.ok(url.endsWith("/responses"));
      payloads.push(JSON.parse(options.body));
      return new Response(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: {
        status: "completed", output: [{ type: "message", role: "assistant", status: "completed",
          content: [{ type: "output_text", text: `Private answer ${payloads.length}`, annotations: [] }] }] } })}\n\n`,
        { headers: { "content-type": "text/event-stream" } });
    } });
  const runtime = createChatGPTRuntime({ service: f.publicService, insightsAdapter: adapter,
    connectionAdapter: { accountIdentity: () => identity, status: () => ({ connected: true,
      planEnabled: true, account: insight.ai.account }), dispose() {} } });
  t.after(() => runtime.dispose());
  const open = () => createPrivateDiscussionService({ databasePath, publicService: f.publicService,
    ai: runtime, canGenerate: actorId => actorId === ALICE.id && runtime.accountIdentity().subject === identity.subject,
    ...deterministicDependencies() });
  let service = open();
  t.after(() => { service.close(); rmSync(directory, { recursive: true, force: true }); });
  const publicBefore = JSON.stringify(f.canonical.catalog());
  const rootBody = "ROOT_PRIVATE_HISTORY " + "R".repeat(3_000);
  const root = service.create(ALICE, { operationId: "composed-root", body: rootBody, sourceId: SOURCE, sourceUrl: URL });
  const generation = await prepare();
  assert.equal(generation.articleText, normalizedText);
  assert.equal(generation.articleText.length, 4_096 - directionMarks.length);
  assert.deepEqual(scripts.map(script => script.args), [[URL, documentUrl], [URL, documentUrl]]);
  assert.deepEqual(scripts[1].target, { tabId: 7, documentIds: ["document-private-fixture"] });
  service.generate(ALICE, { conversationId: root.conversationId, messageId: root.messageId,
    expectedRevision: root.revision, generation });
  await service.whenIdle();
  let view = service.read(ALICE, { conversationId: root.conversationId, ...PAGE });
  const parent = view.messages.find(message => message.actorType === "agent");
  assert.ok(parent, JSON.stringify(view.messages[0].generation));
  assert.equal(view.conversation.visibility, "private");
  assert.deepEqual(parent.insight, { operatorId: ALICE.id, model: "fixture" });
  assert.deepEqual(view.messages[0].generation, { state: "completed", answerId: parent.id });
  assert.equal(parent.body, "Private answer 1");
  const firstContext = JSON.parse(payloads[0].input[0].content);
  assert.equal(firstContext.currentSource.url, URL);
  assert.ok(firstContext.sameTopicSources.length + firstContext.relatedSources.length <= 5);
  assert.equal(firstContext.articlePrefix, normalizedText);
  assert.ok(firstContext.articlePrefix.includes(visibleText));
  assert.equal(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(JSON.stringify(payloads[0])), false);
  assert.equal(firstContext.selectedMessage, rootBody.slice(0, 2_000));
  assert.equal(firstContext.threadOpener, rootBody.slice(0, 2_000));
  assert.equal(JSON.stringify(payloads[0]).includes("synthetic-session"), false);
  const replyBody = "FOLLOWUP_PRIVATE " + "Q".repeat(3_000);
  const command = { operationId: "composed-reply", conversationId: root.conversationId,
    replyToId: parent.id, body: replyBody, expectedRevision: view.conversation.revision, generation: await prepare() };
  const sent = service.send(ALICE, command);
  assert.equal(service.send(ALICE, command).replayed, true);
  await service.whenIdle();
  assert.equal(payloads.length, 2);
  const replyContext = JSON.parse(payloads[1].input[0].content);
  assert.equal(replyContext.articlePrefix, normalizedText);
  assert.equal(replyContext.threadOpener, parent.body);
  assert.equal(replyContext.selectedMessage, replyBody.slice(0, 2_000));
  assert.equal(JSON.stringify(payloads[1]).includes("ROOT_PRIVATE_HISTORY"), false);
  view = service.read(ALICE, { conversationId: root.conversationId, ...PAGE });
  assert.equal(view.messages.length, 4);
  assert.equal(view.messages.find(message => message.id === sent.messageId).generation.state, "completed");
  assert.deepEqual(runtime.resumable(ALICE.id), { job: null });
  assert.equal(debug.length, 0);
  assert.equal(JSON.stringify(f.canonical.catalog()), publicBefore);
  assert.equal(f.canonical.discussion(TOPIC).roots.length, 0);
  service.close(); service = open();
  assert.equal(service.read(ALICE, { conversationId: root.conversationId, ...PAGE }).messages.length, 4);
  assert.equal(service.send(ALICE, command).replayed, true);
  assert.equal(service.generate(ALICE, { conversationId: root.conversationId, messageId: sent.messageId,
    expectedRevision: sent.revision, generation }).generation.state, "completed");
  await service.whenIdle();
  assert.equal(payloads.length, 2);
  assert.equal(debug.length, 0);
  // The real preparer still rejects unsafe captures and same-Source navigation drift.
  capturedText = "Public text \u0080";
  await assert.rejects(prepare(), /Page content unavailable/);
  capturedText = "X".repeat(4_097);
  await assert.rejects(prepare(), /Page content unavailable/);
  capturedText = normalizedText; activeUrl = URL + "?sid=changed-session&utm_source=fixture";
  await assert.rejects(prepare(), /Current page changed/);
  assert.equal(payloads.length, 2);
  // Verify that the installed debug callback is active for ordinary public requests.
  await adapter.createInsight({ model: "fixture", context: generation.context,
    articleText: "Public fixture", allowWebResearch: false });
  assert.equal(debug.length, 2);
  assert.equal(JSON.stringify(debug).includes("FOLLOWUP_PRIVATE"), false);
  assert.equal(JSON.stringify(debug).includes("ROOT_PRIVATE_HISTORY"), false);
  assert.ok(requests.every(url => url.endsWith("/models") || url.endsWith("/responses")));
});

test("staged account deletion and startup recovery erase private data before purging identity", () => {
  const events = []; let deleting = [ALICE.accountId];
  const lifecycle = createAccountLifecycle({ accounts: { listDeletingAccountIds: () => deleting,
    finishDeletion(accountId) { events.push("identity"); deleting = []; return { deleted: true }; } },
    ai: { cancelAccount: () => events.push("ai") }, service: { withdrawAccountContributions: () => events.push("public") },
    privateDiscussions: { cancelAccount: () => events.push("private-cancel"), eraseAccount: () => events.push("private-erase") } });
  lifecycle.resume(); assert.deepEqual(events, ["ai", "private-cancel", "public", "private-erase", "identity"]);
  lifecycle.resume(); assert.equal(events.length, 5);
});
