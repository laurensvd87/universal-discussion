import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrivateDiscussionService } from "../src/private/private-service.js";

const ALICE = { id: "account-11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", displayName: "Alice", type: "human", demo: false };
const BOB = { ...ALICE, id: "account-22222222-2222-4222-8222-222222222222", accountId: "22222222-2222-4222-8222-222222222222", displayName: "Bob" };
function fixture(t, filename = ":memory:") {
  let serial = 0, clock = "2026-10-12T12:00:00.000Z";
  const service = createPrivateDiscussionService({ databasePath: filename,
    nextId: kind => `${kind}-${String(++serial).padStart(5, "0")}`, now: () => clock,
    ai: { generatePrivate() { assert.fail("List paging cannot generate"); } },
    publicService: { actor: id => id === ALICE.id ? ALICE : id === BOB.id ? BOB : null,
      exactSource: () => ({ id: "source", url: "https://example.org/current", topicId: "topic" }), insightAnchor: () => ({}) } });
  t.after(() => service.close());
  return { service, time(value) { clock = value; },
    create(body, owner = ALICE) { return service.create(owner, { operationId: `create-${++serial}`, body,
      sourceId: "source", sourceUrl: "https://example.org/current" }); },
    list(after = null, query = "needle", owner = ALICE, limit = 20) { return service.list(owner, { after, query, order: "recent", limit }); } };
}

test("Trust: recent twenty-item keysets exactly cover tied IDs, ownership and activity changes without gaps", t => {
  const f = fixture(t), roots = Array.from({ length: 47 }, (_, index) => f.create(`Private needle ${index}`));
  f.create("Private foreign needle", BOB);
  let page = f.list(), ids = [];
  assert.equal(page.conversations.length, 20); assert.equal(page.ownerVersion, 47);
  do { ids.push(...page.conversations.map(chat => chat.id)); page = page.next ? f.list(page.next) : null; } while (page);
  assert.deepEqual(ids, roots.map(root => root.conversationId).reverse()); assert.equal(new Set(ids).size, 47);
  const stale = f.list().next;
  f.time("2026-10-12T13:00:00.000Z");
  f.service.send(ALICE, { operationId: "own-activity", conversationId: roots[0].conversationId,
    replyToId: roots[0].messageId, body: "Private current needle reply", expectedRevision: 1 });
  assert.throws(() => f.list(stale), error => error.code === "conflict");
  assert.equal(f.list().conversations[0].id, roots[0].conversationId);
  assert.equal(f.list().ownerVersion, 48);
  f.create("Foreign needle change", BOB);
  assert.equal(f.list().ownerVersion, 48);
});

test("Trust: recent cursor is signed complete routing metadata, not a transferable body cache or legacy ID", t => {
  const f = fixture(t); for (let i = 0; i < 21; i++) f.create(`Private needle ${i}`);
  const result = f.list(), cursor = result.next;
  assert.ok(cursor && cursor.length <= 2048);
  const decoded = JSON.parse(Buffer.from(cursor.split(".")[0], "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(decoded).sort(), ["owner", "version", "query", "limit", "action", "order", "updatedAt", "id"].sort());
  assert.equal(decoded.owner, ALICE.id); assert.equal(decoded.action, "private-list"); assert.equal(decoded.order, "recent");
  assert.equal(decoded.id, result.conversations.at(-1).id); assert.equal(decoded.limit, 20);
  assert.equal(JSON.stringify(decoded).includes("Private needle"), false);
  for (const call of [() => f.list(cursor, "different"), () => f.list(cursor, "needle", BOB),
    () => f.list(cursor, "needle", ALICE, 19), () => f.service.list(ALICE, { after: cursor, limit: 20 }),
    () => f.service.read(ALICE, { conversationId: result.conversations[0].id, after: cursor, limit: 20 })]) {
    assert.throws(call, error => ["invalid", "conflict", "not-found"].includes(error.code));
  }
});

test("Trust: recent and legacy list reads preserve synthetic database bytes/schema and never activate provider work", t => {
  const directory = mkdtempSync(join(tmpdir(), "udl-page-trust-")), filename = join(directory, "private.sqlite");
  const f = fixture(t, filename);
  try {
    for (let i = 0; i < 44; i++) f.create(`Private needle ${i}`);
    const before = readFileSync(filename);
    const inspect = () => { const db = new DatabaseSync(filename, { readOnly: true });
      try { return db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(); }
      finally { db.close(); } };
    const schema = inspect(); let after = null, total = 0;
    do { const page = f.list(after); total += page.conversations.length; after = page.next; } while (after);
    assert.equal(total, 44);
    assert.equal(f.service.list(ALICE, { after: null, limit: 20 }).conversations.length, 20);
    assert.deepEqual(inspect(), schema); assert.deepEqual(readFileSync(filename), before);
  } finally { f.service.close(); rmSync(directory, { recursive: true, force: true }); }
});
