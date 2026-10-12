import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrivateDiscussionService } from "../src/private/private-service.js";
import { readPrivateResponse } from "../../../spikes/topic-resolution/browser/core/community-contract.js";

const ALICE = { id: "account-11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", displayName: "Alice", type: "human", demo: false };
const BOB = { ...ALICE, id: "account-22222222-2222-4222-8222-222222222222", accountId: "22222222-2222-4222-8222-222222222222", displayName: "Bob" };
const conflict = error => error.code === "conflict";
function fixture(t, databasePath = ":memory:") {
  let serial = 0, clock = "2026-10-12T00:00:00.000Z";
  const actors = new Map([[ALICE.id, ALICE], [BOB.id, BOB]]);
  const options = { databasePath, nextId: prefix => `${prefix}-${String(++serial).padStart(5, "0")}`,
    now: () => clock, publicService: { actor: id => actors.get(id),
      exactSource: () => ({ id: "source", topicId: "topic", url: "https://example.com/" }), insightAnchor: () => ({}) } };
  let service = createPrivateDiscussionService(options);
  t.after(() => service.close());
  return { actors, get service() { return service; }, time(value) { clock = value; },
    restart() { service.close(); service = createPrivateDiscussionService(options); },
    create(body = "sharedneedle", owner = ALICE) { return service.create(owner, { operationId: `op-${++serial}`, body, sourceId: "source", sourceUrl: "https://example.com/" }); },
    list(after = null, limit = 20, query, owner = ALICE) { return service.list(owner, { after, limit, order: "recent", ...(query === undefined ? {} : { query }) }); } };
}

test("recent private inbox keysets cover 57 chats, stable ties and current reply activity", t => {
  const f = fixture(t), roots = Array.from({ length: 57 }, () => f.create());
  const first = f.list();
  assert.deepEqual(readPrivateResponse(structuredClone(first)), first);
  assert.equal(first.conversations.length, 20); assert.equal(first.ownerVersion, 57);
  assert.match(first.next, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u); assert.ok(first.next.length <= 2048);
  const ids = []; let page = first;
  do { ids.push(...page.conversations.map(chat => chat.id)); page = page.next ? f.list(page.next) : null; } while (page);
  assert.deepEqual(ids, roots.map(root => root.conversationId).sort().reverse());
  assert.equal(new Set(ids).size, 57);
  f.time("2026-10-12T01:00:00.000Z");
  f.service.send(ALICE, { operationId: "activity", conversationId: roots[0].conversationId,
    replyToId: roots[0].messageId, expectedRevision: 1, body: "deepreply %_* OR" });
  assert.throws(() => f.list(first.next), conflict);
  const current = f.list();
  assert.equal(current.conversations[0].id, roots[0].conversationId);
  assert.equal(current.conversations[0].updatedAt, "2026-10-12T01:00:00.000Z");
  assert.equal(current.conversations[1].updatedAt, current.conversations[1].createdAt);
  assert.equal(current.ownerVersion, 58);
  assert.equal(f.service.read(ALICE, { conversationId: current.conversations[0].id, after: null, limit: 20 }).conversation.id, roots[0].conversationId);
  assert.deepEqual(f.list(null, 20, "deepreply OR %_*").conversations.map(chat => chat.id), [roots[0].conversationId]);
  assert.deepEqual(f.list(null, 20, "sharedneedle deepreply").conversations.map(chat => chat.id), [roots[0].conversationId]);
});

test("recent cursors bind owner/query/limit/order/version and never expose foreign or deleted chats", t => {
  const f = fixture(t); for (let i = 0; i < 46; i++) f.create();
  f.create("foreignsecret", BOB);
  const page = f.list(null, 20, " sharedneedle ");
  assert.equal(f.list(null, 20, "foreignsecret").conversations.length, 0);
  assert.equal(f.list(page.next, 20, "sharedneedle").conversations.length, 20);
  for (const [limit, query, owner] of [[19, "sharedneedle", ALICE], [20, "other", ALICE], [20, "sharedneedle", BOB]]) {
    assert.throws(() => f.list(page.next, limit, query, owner), conflict);
  }
  assert.throws(() => f.service.list(ALICE, { after: page.next, limit: 20, query: "sharedneedle" }), error => error.code === "invalid");
  const unfiltered = f.list();
  f.create("different owner activity", BOB);
  assert.equal(f.list(unfiltered.next).conversations.length, 20);
  assert.throws(() => f.list(`${unfiltered.next.slice(0, -1)}${unfiltered.next.endsWith("A") ? "B" : "A"}`), conflict);
  f.service.remove(ALICE, { conversationId: unfiltered.conversations[0].id });
  assert.throws(() => f.list(unfiltered.next), conflict);
  assert.ok(!f.list().conversations.some(chat => chat.id === unfiltered.conversations[0].id));
  f.actors.delete(ALICE.id); assert.throws(() => f.list(), error => error.code === "forbidden");
});

test("recent restart invalidates signed pages; default ID pagination and DTO bytes remain compatible", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "private-recent-"));
  const f = fixture(t, path.join(directory, "private.sqlite"));
  t.after(() => { f.service.close(); rmSync(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 46; i++) f.create();
  const recent = f.list(), legacy = f.service.list(ALICE, { after: null, limit: 20 });
  assert.deepEqual(Object.keys(legacy), ["conversations", "next"]);
  assert.deepEqual(Object.keys(legacy.conversations[0]), ["id", "visibility", "sourceId", "sourceUrl", "title", "revision", "createdAt"]);
  assert.match(legacy.next, /^private-conversation-/u);
  const bytes = JSON.stringify(legacy);
  assert.equal(JSON.stringify(f.service.list(ALICE, { after: null, limit: 20, query: " " })), bytes);
  const legacySecond = JSON.stringify(f.service.list(ALICE, { after: legacy.next, limit: 20 }));
  f.restart();
  assert.throws(() => f.list(recent.next), conflict);
  assert.equal(JSON.stringify(f.service.list(ALICE, { after: null, limit: 20 })), bytes);
  assert.equal(JSON.stringify(f.service.list(ALICE, { after: legacy.next, limit: 20 })), legacySecond);
  assert.equal(f.list().ownerVersion, recent.ownerVersion);
});

test("recent lists strictly reject getters, controls, invalid order/limit and malformed cursors", t => {
  const f = fixture(t); f.create();
  const packet = { after: null, limit: 20, order: "recent" }; let getters = 0;
  const getter = { ...packet }; Object.defineProperty(getter, "order", { enumerable: true, get() { getters++; return "recent"; } });
  for (const input of [getter, { ...packet, ownerId: BOB.id }, { ...packet, order: "oldest" },
    { ...packet, order: undefined }, { ...packet, limit: 26 }, { ...packet, limit: 0 },
    { ...packet, query: "bad\u202etext" }, { ...packet, after: "x".repeat(2049) }, { ...packet, after: "private-conversation-00002" }]) {
    assert.throws(() => f.service.list(ALICE, input), error => error.code === "invalid");
  }
  assert.equal(getters, 0);
});

test("recent activity uses timestamp maximum, empty-thread fallback and adaptive bounded metadata pages", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "private-recent-size-"));
  const filename = path.join(directory, "private.sqlite"), f = fixture(t, filename);
  t.after(() => { f.service.close(); rmSync(directory, { recursive: true, force: true }); });
  f.time("2026-10-12T03:00:00.000Z"); const root = f.create("Maximum timestamp");
  f.time("2026-10-12T02:00:00.000Z");
  f.service.send(ALICE, { operationId: "earlier-time", conversationId: root.conversationId,
    replyToId: root.messageId, expectedRevision: 1, body: "Later insert but earlier timestamp" });
  assert.equal(f.list().conversations[0].updatedAt, "2026-10-12T03:00:00.000Z");
  const empty = f.create("Empty fixture"), db = new DatabaseSync(filename);
  try {
    // Synthetic storage fixtures exercise legacy/corrupt oversized metadata only;
    // ordinary creation already bounds titles to 160 characters.
    db.prepare("DELETE FROM private_messages WHERE conversation_id=?").run(empty.conversationId);
    assert.equal(f.list().conversations.find(chat => chat.id === empty.conversationId).updatedAt, "2026-10-12T02:00:00.000Z");
    for (let i = 0; i < 23; i++) f.create();
    db.prepare("UPDATE private_conversations SET title=?").run("wide metadata ".repeat(12_000));
    const page = f.list(null, 25);
    assert.ok(page.conversations.length > 0 && page.conversations.length < 25);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) < 1_048_576);
    assert.ok(page.next && page.next.length <= 2048);
    const ids = []; let current = page;
    do { ids.push(...current.conversations.map(chat => chat.id)); current = current.next ? f.list(current.next, 25) : null; } while (current);
    assert.equal(ids.length, 25); assert.equal(new Set(ids).size, 25);
  } finally { db.close(); }
});
