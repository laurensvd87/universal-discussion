import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDemoState } from "../src/domain/demo-state.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createAccountPublicChats } from "../src/application/account-public-chats.js";
import { readAccountPublicChatsResponse } from "../../../spikes/topic-resolution/browser/core/community-contract.js";

const ALICE = "account-11111111-1111-4111-8111-111111111111";
const BOB = "account-22222222-2222-4222-8222-222222222222";
const DATE = "2026-10-12T12:00:00.000Z";
const code = expected => error => error.code === expected;
function contribution(id, authorId, { rootId = null, agent = false, operator = null, withdrawn = false } = {}) {
  return { id, discussionId: "discussion-topic-one", rootId, replyToId: rootId,
    authorId: withdrawn ? null : agent ? "demo-imported-ai" : authorId, actorType: agent ? "agent" : "human",
    visibility: "local-public", withdrawn, createdAt: DATE,
    revisions: withdrawn ? [] : [{ body: `CURRENT_${id}`, createdAt: DATE }],
    ...(!withdrawn && agent ? { insight: { kind: "generated", operatorId: operator } } : {}),
    ...(rootId === null ? { anchor: { kind: "topic", topicId: "topic-one" }, originalTopicId: "topic-one", learnedOrigin: false } : {}) };
}
function seed() {
  const state = createDemoState({ generation: "generation-trust", createdAt: DATE, sources: [],
    topicSeeds: [{ id: "topic-one", title: "Synthetic topic", kind: "general" }] });
  state.schema = "demo-state/v3";
  state.contributions = [contribution("alice-root", ALICE), contribution("bob-root", BOB),
    contribution("alice-reply", ALICE, { rootId: "bob-root" }),
    contribution("alice-bot-reply", null, { rootId: "bob-root", agent: true, operator: ALICE }),
    contribution("alice-bot-root", null, { agent: true, operator: ALICE }),
    contribution("foreign-root", BOB), contribution("foreign-reply", BOB, { rootId: "foreign-root" }),
    contribution("legacy-demo-root", "demo-alex")];
  state.contributions[0].revisions.unshift({ body: "HISTORICAL_BODY_MUST_NOT_PROJECT", createdAt: "2026-10-12T11:00:00.000Z" });
  return state;
}
function fixture(t, { legacy = false, file = false } = {}) {
  const initial = seed(); let directory, databasePath = ":memory:";
  if (file) { directory = mkdtempSync(join(tmpdir(), "udl-my-chats-trust-")); databasePath = join(directory, "canonical.sqlite"); }
  const raw = legacy ? createMemoryRepository(initial) : createNormalizedSqliteRepository(databasePath, initial);
  const repository = legacy ? raw : { ...raw, load() { assert.fail("My chats must not load whole canonical state"); } };
  const chats = createAccountPublicChats({ repository, authorLabel: () => "Synthetic human" });
  const closers = [];
  t.after(() => { for (const close of closers) close(); raw.close?.(); if (directory) rmSync(directory, { recursive: true, force: true }); });
  return { raw, chats, databasePath, initial, onClose(close) { closers.push(close); } };
}

test("Trust: human author and generated-bot operator select roots, including participation beneath foreign root", t => {
  for (const legacy of [false, true]) {
    const f = fixture(t, { legacy });
    const list = f.chats.list(ALICE, { after: null, limit: 25 });
    assert.deepEqual(new Set(list.chats.map(chat => chat.id)), new Set(["alice-root", "bob-root", "alice-bot-root"]));
    assert.equal(list.chats.find(chat => chat.id === "bob-root").ownedHuman, true);
    assert.equal(list.chats.find(chat => chat.id === "bob-root").ownedAgent, true);
    assert.equal(list.chats.find(chat => chat.id === "alice-bot-root").ownedHuman, false);
    assert.equal(list.chats.find(chat => chat.id === "alice-bot-root").ownedAgent, true);
    const thread = f.chats.read(ALICE, { rootId: "bob-root", after: null, limit: 25 });
    assert.deepEqual(new Set(thread.messages.map(message => message.id)), new Set(["bob-root", "alice-reply", "alice-bot-reply"]));
    assert.ok(!JSON.stringify(list).includes("HISTORICAL_BODY_MUST_NOT_PROJECT"));
    assert.ok(!JSON.stringify(f.chats.read(ALICE, { rootId: "alice-root", after: null, limit: 25 })).includes("HISTORICAL_BODY_MUST_NOT_PROJECT"));
    assert.throws(() => f.chats.read(ALICE, { rootId: "foreign-root", after: null, limit: 25 }), code("not-found"));
    assert.throws(() => f.chats.list("demo-alex", { after: null, limit: 25 }), code("forbidden"));
  }
});

test("Trust: signed cursors bind actor, route, root, limit and revision; tampering cannot introduce authority", t => {
  const f = fixture(t), first = f.chats.list(ALICE, { after: null, limit: 1 });
  assert.ok(first.next);
  const second = f.chats.list(ALICE, { after: first.next, limit: 1 });
  assert.notEqual(second.chats[0].id, first.chats[0].id);
  assert.throws(() => f.chats.list(BOB, { after: first.next, limit: 1 }), code("conflict"));
  assert.throws(() => f.chats.list(ALICE, { after: first.next, limit: 2 }), code("conflict"));
  assert.throws(() => f.chats.read(ALICE, { rootId: "bob-root", after: first.next, limit: 1 }), code("conflict"));
  const thread = f.chats.read(ALICE, { rootId: "bob-root", after: null, limit: 1 });
  assert.ok(thread.next);
  assert.throws(() => f.chats.read(ALICE, { rootId: "alice-root", after: thread.next, limit: 1 }), code("conflict"));
  const segments = first.next.split("."); segments[0] = Buffer.from(JSON.stringify({ actorId: BOB })).toString("base64url");
  assert.throws(() => f.chats.list(ALICE, { after: segments.join("."), limit: 1 }), code("conflict"));
  const next = structuredClone(f.initial); next.revision++;
  f.raw.save(f.raw.version(), next);
  assert.throws(() => f.chats.list(ALICE, { after: first.next, limit: 1 }), code("conflict"));
});

test("Trust: withdrawing last owned messages removes thread membership without claiming surviving foreign posts", t => {
  const f = fixture(t), next = structuredClone(f.initial); next.revision++;
  for (const id of ["alice-reply", "alice-bot-reply"]) {
    const entry = next.contributions.find(entry => entry.id === id);
    entry.withdrawn = true; entry.authorId = null; entry.revisions = []; delete entry.insight;
  }
  f.raw.save(f.raw.version(), next);
  assert.ok(!f.chats.list(ALICE, { after: null, limit: 25 }).chats.some(chat => chat.id === "bob-root"));
  assert.throws(() => f.chats.read(ALICE, { rootId: "bob-root", after: null, limit: 25 }), code("not-found"));
  assert.equal(f.chats.read(BOB, { rootId: "bob-root", after: null, limit: 25 }).messages[0].body, "CURRENT_bob-root");
});

test("Trust: withdrawn foreign root remains a content-free connector for an owned descendant", t => {
  const f = fixture(t), next = structuredClone(f.initial); next.revision++;
  const root = next.contributions.find(entry => entry.id === "bob-root");
  root.withdrawn = true; root.authorId = null; root.revisions = [];
  f.raw.save(f.raw.version(), next);
  const thread = f.chats.read(ALICE, { rootId: "bob-root", after: null, limit: 25 });
  const connector = thread.messages.find(message => message.id === root.id);
  assert.equal(connector.state, "deleted"); assert.equal(connector.body, "");
  assert.equal(connector.sourceUrl, null); assert.ok(!JSON.stringify(thread).includes("CURRENT_bob-root"));
  assert.equal(thread.conversation.title, "Synthetic topic");
});

test("Trust: real normalized and legacy projections compose with the strict browser public DTO reader", t => {
  for (const legacy of [false, true]) {
    const f = fixture(t, { legacy });
    for (const actor of [ALICE, BOB]) {
      const list = f.chats.list(actor, { after: null, limit: 25 });
      assert.deepEqual(readAccountPublicChatsResponse("list", list), list);
      for (const chat of list.chats) {
        const page = f.chats.read(actor, { rootId: chat.id, after: null, limit: 25 });
        assert.deepEqual(readAccountPublicChatsResponse("read", page, chat.id), page);
        assert.throws(() => readAccountPublicChatsResponse("read", page, "wrong-root"), TypeError);
      }
    }
  }
});

for (const field of ["author_id", "operator_id"]) {
  test(`Trust: corrupted ${field} ownership mirror cannot admit an unrelated thread`, t => {
    const f = fixture(t, { file: true }), direct = new DatabaseSync(f.databasePath);
    f.onClose(() => direct.close());
    if (field === "author_id") direct.prepare("UPDATE canonical_contributions SET author_id=? WHERE id='foreign-reply'").run(ALICE);
    else direct.prepare("UPDATE canonical_contributions SET operator_id=? WHERE id='alice-bot-reply'").run(BOB);
    const actor = field === "author_id" ? ALICE : BOB;
    const root = field === "author_id" ? "foreign-root" : "bob-root";
    assert.throws(() => f.chats.read(actor, { rootId: root, after: null, limit: 1 }), code("storage-corrupt"));
    assert.throws(() => f.chats.list(actor, { after: null, limit: 25 }), code("storage-corrupt"));
  });
}
