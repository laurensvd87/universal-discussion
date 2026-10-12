import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalPages } from "../src/application/canonical-pages.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createDemoState, applyCommand } from "../src/domain/demo-state.js";
import { ServiceError } from "../src/domain/errors.js";
import { MAX_RESPONSE_BYTES } from "../src/domain/discussion-view.js";
import { sourceStamp } from "../src/domain/source-threads.js";

const NOW = "2026-10-12T12:00:00.000Z";
const actor = { id: "demo-alex", type: "human", demo: true };
const code = value => error => error instanceof ServiceError && error.code === value;
function fixture(t, count = 1207, body = "Current public body", createdAt = NOW) {
  let state = createDemoState({ generation: "synthetic-page-generation", createdAt: NOW,
    sources: [{ id: "source-one", url: "https://synthetic.example/page", title: "Public source", topicId: "topic-one",
      embedding: { modelId: "synthetic-model", values: [1] }, provenance: "project-created-hand-authored-demo/1" }],
    topicSeeds: [{ id: "topic-one", title: "One", kind: "general" }, { id: "topic-two", title: "Empty", kind: "general" }] });
  state = applyCommand(state, { type: "create-root", topicId: "topic-one", body, originSourceId: "source-one" }, actor,
    { nextId: () => "contribution-0000", now: () => createdAt, largeScale: true }).state;
  const template = state.contributions[0];
  state.contributions = Array.from({ length: count }, (_, index) => ({ ...structuredClone(template),
    id: `contribution-${String(index).padStart(4, "0")}` }));
  const repository = createNormalizedSqliteRepository(":memory:", state);
  t.after(() => repository.close());
  const reads = [];
  const selected = { ...repository,
    load() { throw new Error("Whole snapshot must never be loaded"); },
    readTopicState() { throw new Error("Whole Topic must never be loaded"); },
    readMetadataScope(input) { reads.push(input); return repository.readMetadataScope(input); },
  };
  return { state, repository, selected, reads, pages: createCanonicalPages(selected) };
}

test("over 1000 canonical records page in stable tied timestamp order without whole state or vector DTOs", t => {
  const f = fixture(t);
  const ids = [];
  let cursor = null, count = 0;
  do {
    const page = f.pages.contributions({ topicId: "topic-one", limit: 100, cursor });
    assert.ok(page.items.length <= 100);
    assert.ok(Object.isFrozen(page) && Object.isFrozen(page.items));
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= MAX_RESPONSE_BYTES - 4096);
    ids.push(...page.items.map(item => item.id)); count++;
    const serialized = JSON.stringify(page);
    for (const hidden of ["embedding", "revisions", "anchor", "visibility", "originalTopicId", "operationDigest"]) assert.equal(serialized.includes(`"${hidden}"`), false);
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.equal(count, 13);
  assert.deepEqual(ids, f.state.contributions.map(item => item.id));
  assert.equal(new Set(ids).size, 1207);
  assert.ok(f.reads.every(input => input.sourceIds.length === 1 && input.topicIds.length === 1));
  const empty = f.pages.contributions({ topicId: "topic-two", limit: 100, cursor: null });
  assert.deepEqual(empty.items, []); assert.equal(empty.nextCursor, null);
});

test("byte trimmed pages resume after the last included record and preserve long origin URLs and latest multilingual bodies", t => {
  const f = fixture(t, 130, "😀".repeat(3000));
  const next = structuredClone(f.state);
  next.revision++;
  next.sources[0].url = `https://synthetic.example/${"a".repeat(7700)}`;
  for (const entry of next.contributions) entry.anchor.stamp = sourceStamp(next.sources[0]);
  next.contributions[0].revisions.push({ ...next.contributions[0].revisions[0], body: "Latest edited public text" });
  f.repository.save(f.repository.version(), next);
  let cursor = null;
  const ids = [];
  do {
    const page = f.pages.contributions({ topicId: "topic-one", limit: 100, cursor });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= MAX_RESPONSE_BYTES - 4096);
    assert.ok(page.items.length > 0 && page.items.length < 100);
    if (!cursor) {
      assert.equal(page.items[0].body, "Latest edited public text");
      assert.equal(page.items[0].edited, true);
      assert.equal(page.items[0].origin.url, next.sources[0].url);
    }
    ids.push(...page.items.map(item => item.id));
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.deepEqual(ids, next.contributions.map(item => item.id));
});

test("cursor version, Topic and page limit are bound and malformed requests fail before repository paging", t => {
  const f = fixture(t, 8);
  const first = f.pages.contributions({ topicId: "topic-one", limit: 2, cursor: null });
  const cursor = first.nextCursor;
  assert.throws(() => f.pages.contributions({ topicId: "topic-two", limit: 2, cursor }), code("conflict"));
  assert.throws(() => f.pages.contributions({ topicId: "topic-one", limit: 3, cursor }), code("conflict"));
  const data = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  for (const bad of [{ ...data, extra: true }, { ...data, after: { ...data.after, createdAt: "unsafe\u0000time" } },
    { ...data, after: { ...data.after, secret: "hidden" } }, { ...data, version: { ...data.version, revision: -1 } }, { ...data, schema: "other" }]) {
    assert.throws(() => f.pages.contributions({ topicId: "topic-one", limit: 2,
      cursor: Buffer.from(JSON.stringify(bad)).toString("base64url") }), code("invalid"));
  }
  for (const invalid of ["x", "=", "a".repeat(2049), {}, 1, ""]) {
    assert.throws(() => f.pages.contributions({ topicId: "topic-one", limit: 2, cursor: invalid }), code("invalid"));
  }
  for (const invalid of [{ topicId: "topic-one", limit: 2 }, { topicId: "topic-one", limit: 0, cursor: null },
    { topicId: "topic-one", limit: 101, cursor: null }, { topicId: "topic-one", limit: 1.5, cursor: null },
    { topicId: "topic-one", limit: 2, cursor: null, body: "hidden" }]) assert.throws(() => f.pages.contributions(invalid), code("invalid"));
  let getters = 0;
  assert.throws(() => f.pages.contributions({ topicId: "topic-one", limit: 2, get cursor() { getters++; return null; } }), code("invalid"));
  assert.equal(getters, 0);
  const next = structuredClone(f.state); next.revision++;
  f.repository.save(f.repository.version(), next);
  assert.throws(() => f.pages.contributions({ topicId: "topic-one", limit: 2, cursor }), code("conflict"));
});

test("valid date-only and legacy timestamp text traverse using the persisted lexicographic cursor contract", t => {
  for (const createdAt of ["2026-10-12", "legacy-safe-timestamp"]) {
    const f = fixture(t, 3, "Legacy public body", createdAt);
    let cursor = null;
    const ids = [];
    do {
      const page = f.pages.contributions({ topicId: "topic-one", limit: 1, cursor });
      assert.equal(page.items[0].createdAt, createdAt);
      ids.push(page.items[0].id);
      cursor = page.nextCursor;
    } while (cursor !== null);
    assert.deepEqual(ids, f.state.contributions.map(item => item.id));
  }
});

test("withdrawn records expose only tombstones and off-page parents remain flat references", t => {
  const f = fixture(t, 3);
  let next = applyCommand(f.state, { type: "reply", discussionId: "discussion-topic-one", rootId: "contribution-0000",
    replyToId: null, body: "Reply to earlier page" }, actor,
  { nextId: () => "contribution-9999", now: () => NOW, largeScale: true }).state;
  f.repository.save(f.repository.version(), next);
  next = applyCommand(next, { type: "withdraw", contributionId: "contribution-0001" }, actor,
    { nextId: () => "unused", now: () => NOW, largeScale: true }).state;
  f.repository.save(f.repository.version(), next);
  const first = f.pages.contributions({ topicId: "topic-one", limit: 2, cursor: null });
  assert.deepEqual(first.items[1], { id: "contribution-0001", rootId: null, replyToId: null, state: "deleted", label: "Deleted by user" });
  const second = f.pages.contributions({ topicId: "topic-one", limit: 2, cursor: first.nextCursor });
  const reply = second.items[1];
  assert.equal(reply.rootId, "contribution-0000");
  assert.equal(second.items.some(item => item.id === reply.rootId), false);
  assert.equal(Object.hasOwn(reply, "replies"), false);
});

test("revision change between page and metadata rejects a mixed snapshot", t => {
  const f = fixture(t, 5);
  const pages = createCanonicalPages({ ...f.selected,
    readMetadataScope(input) {
      const next = structuredClone(f.state); next.revision++;
      f.repository.save(f.repository.version(), next);
      return f.repository.readMetadataScope(input);
    },
  });
  assert.throws(() => pages.contributions({ topicId: "topic-one", limit: 2, cursor: null }), code("conflict"));
});
