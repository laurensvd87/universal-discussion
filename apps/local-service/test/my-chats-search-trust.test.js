import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoState } from "../src/domain/demo-state.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createAccountPublicChats, normalizeMyChatsQuery } from "../src/application/account-public-chats.js";
import { createPrivateDiscussionService } from "../src/private/private-service.js";
import { readAccountPublicChatsRequest } from "../../../spikes/topic-resolution/browser/core/community-contract.js";

const ALICE = { id: "account-11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", displayName: "Alice", type: "human", demo: false };
const BOB = { ...ALICE, id: "account-22222222-2222-4222-8222-222222222222", accountId: "22222222-2222-4222-8222-222222222222", displayName: "Bob" };
const DATE = "2026-10-12T12:00:00.000Z";
const SOURCE = { id: "source-one", url: "https://example.org/current", title: "Public Source", topicId: "topic-one" };
const failClosed = error => ["invalid", "conflict"].includes(error.code);
function post(id, body, { actor = ALICE.id, rootId = null, sourceId = null } = {}) {
  return { id, discussionId: "discussion-topic-one", rootId, replyToId: rootId,
    authorId: actor, actorType: "human", visibility: "local-public", withdrawn: false, createdAt: DATE,
    revisions: [{ body, createdAt: DATE }], ...(sourceId ? { originSourceId: sourceId } : {}),
    ...(rootId === null ? { anchor: { kind: "topic", topicId: "topic-one" }, originalTopicId: "topic-one", learnedOrigin: false } : {}) };
}
function publicFixture(t, normalized = true) {
  const seed = createDemoState({ generation: "generation-search-trust", createdAt: DATE,
    topicSeeds: [{ id: "topic-one", title: "General topic", kind: "general" }], sources: [
      { ...SOURCE, embedding: null, provenance: "fixture" },
      { id: "unsafe-source", url: "https://example.org/account/profile", title: "UNSAFE_SOURCE_TITLE", topicId: "topic-one", embedding: null, provenance: "fixture" },
    ] });
  seed.schema = "demo-state/v3";
  seed.contributions = [post("own-one", "Current neutral message"),
    post("own-two", "Current pricing %_ literal OR NOT word"),
    post("own-emoji", "Astral 😀 中文 and Ömega"),
    post("own-source", "Source metadata root", { sourceId: SOURCE.id }),
    post("own-unsafe", "No unsafe metadata", { sourceId: "unsafe-source" }),
    post("foreign-root", "FOREIGN_ACCOUNT_WORD", { actor: BOB.id }),
    post("participating-root", "Other person's visible comment", { actor: BOB.id }),
    post("own-participation", "OWN_REPLY_WORD", { rootId: "participating-root" })];
  seed.contributions[0].revisions.unshift({ body: "OLD_REVISION_SECRET", createdAt: "2026-10-12T11:00:00.000Z" });
  const raw = normalized ? createNormalizedSqliteRepository(":memory:", seed) : createMemoryRepository(seed);
  const repository = normalized ? { ...raw, load() { assert.fail("Search must not load whole canonical state"); },
    accountContributions() { assert.fail("Search must not materialize account histories"); } } : raw;
  const chats = createAccountPublicChats({ repository, authorLabel: () => "Synthetic person" });
  t.after(() => raw.close?.());
  return { raw, seed, chats, list: (query, after = null, limit = 25, actor = ALICE.id) => chats.list(actor, { after, limit, query }) };
}
function privateFixture(t, filename = ":memory:") {
  let counter = 0;
  const actors = new Map([[ALICE.id, ALICE], [BOB.id, BOB]]);
  const service = createPrivateDiscussionService({ databasePath: filename,
    nextId: kind => `${kind}-${String(++counter).padStart(4, "0")}`, now: () => DATE,
    ai: { generatePrivate() { assert.fail("Search must not dispatch generation"); } }, canGenerate: () => false,
    publicService: { actor: id => actors.get(id), exactSource: () => SOURCE,
      insightAnchor: () => ({ topicId: SOURCE.topicId, sourceId: SOURCE.id, version: { generation: "public", revision: 0 } }),
      catalog() { assert.fail("Private search must not load public catalog"); } } });
  t.after(() => service.close());
  const create = (body, owner = ALICE) => service.create(owner, {
    operationId: `create-${++counter}`, body, sourceId: SOURCE.id, sourceUrl: SOURCE.url });
  return { service, create, list: (query, after = null, limit = 25, owner = ALICE) => service.list(owner, { after, limit, query }) };
}

test("Trust: public search matches only current participating-thread content and safe source titles", t => {
  for (const normalized of [true, false]) {
    const f = publicFixture(t, normalized);
    assert.deepEqual(f.list("OLD_REVISION_SECRET").chats, []);
    assert.deepEqual(f.list("FOREIGN_ACCOUNT_WORD").chats, []);
    assert.deepEqual(f.list("UNSAFE_SOURCE_TITLE").chats, []);
    assert.deepEqual(f.list("Public Source").chats.map(chat => chat.id), ["own-source"]);
    assert.deepEqual(f.list("own_reply_word").chats.map(chat => chat.id), ["participating-root"]);
    assert.deepEqual(f.list("pricing %_").chats.map(chat => chat.id), ["own-two"]);
    assert.deepEqual(f.list("OR NOT").chats.map(chat => chat.id), ["own-two"]);
    assert.deepEqual(f.list("' OR 1=1 --").chats, []);
    assert.deepEqual(f.list("😀 中文").chats.map(chat => chat.id), ["own-emoji"]);
    assert.deepEqual(f.list("Ömega").chats.map(chat => chat.id), ["own-emoji"]);
    // Contract is ASCII-case-insensitive literal AND, not an ICU/semantic index.
    assert.deepEqual(f.list("ömega").chats, []);
  }
});

test("Trust: public query cursor binds normalized whitespace, query/actor/limit and current withdrawal revision", t => {
  const f = publicFixture(t), first = f.list("  General\n\ttopic  ", null, 1);
  assert.ok(first.next);
  assert.equal(f.list("General topic", first.next, 1).chats.length, 1);
  assert.throws(() => f.list("Current", first.next, 1), failClosed);
  assert.throws(() => f.list("General topic", first.next, 2), failClosed);
  assert.throws(() => f.list("General topic", first.next, 1, BOB.id), failClosed);
  const next = structuredClone(f.seed); next.revision++;
  const withdrawn = next.contributions.find(entry => entry.id === "own-two");
  withdrawn.withdrawn = true; withdrawn.authorId = null; withdrawn.revisions = [];
  f.raw.save(f.raw.version(), next);
  assert.throws(() => f.list("General topic", first.next, 1), failClosed);
  assert.deepEqual(f.list("pricing").chats, []);
});

test("Trust: private SQL search finds messages beyond first page/title without exposing other accounts or canonical content", t => {
  const f = privateFixture(t), all = [];
  for (let i = 0; i < 57; i++) all.push(f.create(`Private own searchable entry ${i} with %_ 😀`).conversationId);
  f.create("OTHER_ACCOUNT_PRIVATE_SECRET", BOB);
  const tail = f.create("Unremarkable public anchor introduction. ".repeat(100) + "PRIVATE_MESSAGE_TAIL");
  const ids = []; let after = null;
  do {
    const page = f.list("searchable entry", after, 7);
    assert.ok(page.conversations.length <= 7);
    assert.ok(page.conversations.every(chat => !Object.hasOwn(chat, "messages") && !Object.hasOwn(chat, "body")));
    ids.push(...page.conversations.map(chat => chat.id)); after = page.next;
    if (after !== null) assert.ok(after.length <= 2048);
  } while (after !== null);
  assert.deepEqual(ids, all);
  assert.deepEqual(f.list("OTHER_ACCOUNT_PRIVATE_SECRET").conversations, []);
  assert.deepEqual(f.list("PRIVATE_MESSAGE_TAIL").conversations.map(chat => chat.id), [tail.conversationId]);
  assert.deepEqual(f.list("' OR 1=1 --").conversations, []);
  assert.equal(f.list("%_ 😀").conversations.length, 25);
});

test("Trust: filtered private cursors fence owner/query/limit/mutation while foreign writes do not invalidate", t => {
  const f = privateFixture(t);
  for (let i = 0; i < 3; i++) f.create(`matching entry ${i}`);
  const first = f.list("matching entry", null, 1); assert.ok(first.next);
  assert.throws(() => f.list("matching entry", first.next, 1, BOB), failClosed);
  assert.throws(() => f.list("matching", first.next, 1), failClosed);
  assert.throws(() => f.list("matching entry", first.next, 2), failClosed);
  const plain = f.list("", null, 1).next;
  assert.throws(() => f.list("matching entry", plain, 1), failClosed);
  assert.throws(() => f.list("", first.next, 1), failClosed);
  f.create("matching other-account entry", BOB);
  assert.equal(f.list("matching\n entry", first.next, 1).conversations.length, 1);
  f.create("matching new own entry");
  assert.throws(() => f.list("matching entry", first.next, 1), failClosed);
});

test("Trust: reopening the same private store rejects old filtered cursors but preserves legacy plain-ID paging", t => {
  const directory = mkdtempSync(join(tmpdir(), "udl-private-search-trust-"));
  const filename = join(directory, "private.sqlite");
  const first = privateFixture(t, filename); let second;
  try {
    for (let i = 0; i < 3; i++) first.create(`restart searchable entry ${i}`);
    const filtered = first.list("searchable", null, 1).next;
    const plain = first.list("", null, 1).next;
    assert.ok(filtered && plain); first.service.close();
    second = privateFixture(t, filename);
    assert.throws(() => second.list("searchable", filtered, 1), failClosed);
    assert.equal(second.list("", plain, 1).conversations.length, 1);
    assert.equal(second.list("searchable").conversations.length, 3);
  } finally {
    second?.service.close(); first.service.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test("Trust: query normalizers reject behavioral/oversized/control data before canonical reads and preserve literal Unicode", t => {
  let reads = 0;
  const chats = createAccountPublicChats({ repository: { load() { reads++; assert.fail("Invalid query reached repository"); } }, authorLabel: () => "Human" });
  for (const query of [undefined, null, 1, {}, [], "x".repeat(257), "secret\u0000", "hidden\u202e", "lone\ud800"]) {
    assert.throws(() => normalizeMyChatsQuery(query));
    assert.throws(() => chats.list(ALICE.id, { after: null, limit: 25, query }));
    assert.throws(() => readAccountPublicChatsRequest("list", { after: null, limit: 25, query }));
  }
  const packet = { after: null, limit: 25 };
  Object.defineProperty(packet, "query", { enumerable: true, get() { assert.fail("Query getter ran"); } });
  assert.throws(() => chats.list(ALICE.id, packet));
  assert.throws(() => readAccountPublicChatsRequest("list", packet));
  assert.equal(reads, 0);
  assert.equal(normalizeMyChatsQuery(" \t😀\n中文  "), "😀 中文");
  assert.equal(normalizeMyChatsQuery("a\fb"), "a b");
});
