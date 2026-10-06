import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createDemoState } from "../../../../src/domain/demo-state.js";
import { assertValidPersistedState } from "../../../../src/domain/persisted-state.js";
import { operationDigestFor, sourceStamp } from "../../../../src/domain/source-threads.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION, LEARNED_SOURCE_PROVENANCE, MATCH_POLICY_VERSION } from "../../../../src/domain/learned-sources.js";
import { createSyntheticDatabase, forgetSyntheticSource, migrateSyntheticDatabase, readLegacySyntheticDatabase, readSyntheticDatabase } from "./rehearsal.js";

const TIME = "2026-10-05T10:00:00.000Z";
function fixture() {
  const state = createDemoState({ generation: "synthetic-generation", createdAt: TIME,
    topicSeeds: [{ id: "topic-a", kind: "event", title: "Synthetic A" }, { id: "topic-b", kind: "claim", title: "Synthetic B" }],
    sources: [
      { id: "source-a", url: "https://example.test/a", title: "Synthetic source A", embedding: { modelId: "synthetic-model", values: [0.1, -0.2, 0.3] }, provenance: "fixture", topicId: "topic-a" },
      { id: "source-b", url: "https://example.test/b", title: "Synthetic source B", embedding: null, provenance: "fixture", topicId: "topic-b" },
    ] });
  state.revision = 7;
  const base = { actorType: "human", visibility: "local-public", createdAt: TIME };
  state.contributions = [
    { ...base, id: "source-root", discussionId: "discussion-topic-a", rootId: null, replyToId: null,
      authorId: "demo-alex", withdrawn: false, revisions: [{ body: "Synthetic first draft", createdAt: TIME }, { body: "Synthetic second draft", createdAt: TIME }],
      originSourceId: "source-a", anchor: { kind: "source", sourceId: "source-a", stamp: sourceStamp(state.sources[0]) },
      originalTopicId: "topic-a", learnedOrigin: false },
    { ...base, id: "reply", discussionId: "discussion-topic-a", rootId: "source-root", replyToId: "source-root",
      authorId: "demo-blair", withdrawn: false, revisions: [{ body: "Synthetic reply", createdAt: TIME }], originSourceId: "source-b" },
    { ...base, id: "legacy-root", discussionId: "discussion-topic-b", rootId: null, replyToId: null,
      authorId: "demo-alex", withdrawn: false, revisions: [{ body: "Legacy pin", createdAt: TIME }],
      anchor: { kind: "topic", topicId: "topic-b" }, originalTopicId: "topic-b", learnedOrigin: false },
    { ...base, id: "withdrawn-root", discussionId: "discussion-topic-b", rootId: null, replyToId: null,
      authorId: null, withdrawn: true, revisions: [], anchor: { kind: "topic", topicId: "topic-b" },
      originalTopicId: "deleted-topic-id", learnedOrigin: true },
  ];
  return assertValidPersistedState(state);
}

function learnedFixture() {
  const state = fixture();
  const source = state.sources[0];
  source.url = "https://example.org/synthetic-article";
  source.provenance = LEARNED_SOURCE_PROVENANCE;
  source.embedding = { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] };
  source.extractorVersion = EXTRACTOR_VERSION;
  source.operationId = "synthetic-operation";
  source.policyVersion = MATCH_POLICY_VERSION;
  source.operationDigest = operationDigestFor(source);
  state.sourceLinks[0].method = "learned-provisional";
  state.contributions[0].anchor.stamp = sourceStamp(source);
  state.contributions[0].learnedOrigin = true;
  state.contributions.push({ ...structuredClone(state.contributions[1]), id: "reply-same-source", originSourceId: "source-a" });
  return assertValidPersistedState(state);
}

test("full synthetic v2 round-trip through normalized tables and reopen", () => {
  const state = fixture();
  const handle = createSyntheticDatabase(state);
  try {
    const result = migrateSyntheticDatabase(handle);
    assert.deepEqual(result.counts, { topics: 2, discussions: 2, sources: 2, links: 2, contributions: 4, revisions: 4 });
    assert.deepEqual(readSyntheticDatabase(handle), state);
    assert.throws(() => readLegacySyntheticDatabase(handle), /Unsupported database schema/);
  } finally { handle.dispose(); }
});

test("every injected stage rolls back original JSON bytes and table set", () => {
  for (const failAt of ["topics", "sources", "links", "discussions", "half-contributions", "anchors", "before-commit"]) {
    const handle = createSyntheticDatabase(fixture());
    try {
      const before = readLegacySyntheticDatabase(handle);
      assert.throws(() => migrateSyntheticDatabase(handle, { failAt }), /Injected failure/);
      assert.deepEqual(readLegacySyntheticDatabase(handle), before);
      assert.throws(() => readSyntheticDatabase(handle), /Unsupported database schema/);
    } finally { handle.dispose(); }
  }
});

test("unknown schema and malformed legacy row fail closed without rewriting", () => {
  for (const change of ["CREATE TABLE unexpected (id TEXT) STRICT", "UPDATE demo_state SET schema='demo-state/v9'"]) {
    const handle = createSyntheticDatabase(fixture());
    try {
      const db = new DatabaseSync(handle.path);
      try { db.exec(change); } finally { db.close(); }
      assert.throws(() => migrateSyntheticDatabase(handle));
      const check = new DatabaseSync(handle.path);
      try { assert.equal(check.prepare("SELECT count(*) AS n FROM demo_state").get().n, 1); }
      finally { check.close(); }
    } finally { handle.dispose(); }
  }
});

test("unknown normalized marker is refused after conversion", () => {
  const handle = createSyntheticDatabase(fixture());
  try {
    migrateSyntheticDatabase(handle);
    const db = new DatabaseSync(handle.path);
    try { db.exec("UPDATE state_meta SET format='normalized-state/future'"); }
    finally { db.close(); }
    assert.throws(() => readSyntheticDatabase(handle), /Unsupported normalized schema/);
  } finally { handle.dispose(); }
});

test("cross-kind ID collision is refused without changing the old row", () => {
  const state = fixture();
  const oldDiscussionId = state.discussions[0].id;
  state.discussions[0].id = state.topics[0].id;
  for (const contribution of state.contributions) {
    if (contribution.discussionId === oldDiscussionId) contribution.discussionId = state.topics[0].id;
  }
  assertValidPersistedState(state); // The current validator is per kind.
  const handle = createSyntheticDatabase(state);
  try {
    const rowBytes = () => {
      const db = new DatabaseSync(handle.path);
      try { return db.prepare("SELECT document FROM demo_state WHERE singleton=1").get().document; }
      finally { db.close(); }
    };
    const before = rowBytes();
    assert.throws(() => migrateSyntheticDatabase(handle), /Cross-kind ID collision/);
    assert.equal(rowBytes(), before);
  } finally { handle.dispose(); }
});

test("altered legacy and normalized table definitions fail closed", () => {
  const oldHandle = createSyntheticDatabase(fixture());
  try {
    const db = new DatabaseSync(oldHandle.path);
    try { db.exec("ALTER TABLE demo_state ADD COLUMN extra TEXT"); }
    finally { db.close(); }
    assert.throws(() => migrateSyntheticDatabase(oldHandle), /Unsupported legacy/);
  } finally { oldHandle.dispose(); }

  const newHandle = createSyntheticDatabase(fixture());
  try {
    migrateSyntheticDatabase(newHandle);
    const db = new DatabaseSync(newHandle.path);
    try { db.exec("ALTER TABLE topics ADD COLUMN extra TEXT"); }
    finally { db.close(); }
    assert.throws(() => readSyntheticDatabase(newHandle), /Unsupported normalized table definition/);
  } finally { newHandle.dispose(); }
});

test("cleanup can be retried without deleting unexpected temp contents", () => {
  const handle = createSyntheticDatabase(fixture());
  const sidecar = join(dirname(handle.path), "unexpected-note.txt");
  writeFileSync(sidecar, "synthetic", { flag: "wx" });
  try {
    assert.throws(() => handle.dispose());
    unlinkSync(sidecar);
    handle.dispose();
  } finally {
    // If the assertion itself fails, remove only the named synthetic sidecar.
    try { unlinkSync(sidecar); } catch { /* Already removed. */ }
  }
});

test("synthetic Forget pins root, clears source origins and survives reopen", () => {
  const state = learnedFixture();
  const handle = createSyntheticDatabase(state);
  try {
    migrateSyntheticDatabase(handle);
    const result = forgetSyntheticSource(handle, { sourceId: "source-a", expectedGeneration: state.generation, expectedRevision: 7 });
    assert.equal(result.revision, 8);
    const after = readSyntheticDatabase(handle);
    assert.equal(after.sources.length, 1);
    assert.equal(after.sourceLinks.length, 1);
    assert.deepEqual(after.contributions[0].anchor, { kind: "topic", topicId: "topic-a" });
    assert.equal(after.contributions[0].originalTopicId, "topic-a");
    assert.equal(after.contributions[0].learnedOrigin, true);
    assert.equal(Object.hasOwn(after.contributions[0], "originSourceId"), false);
    assert.equal(after.contributions[1].originSourceId, "source-b");
    assert.equal(Object.hasOwn(after.contributions[4], "originSourceId"), false);
    assert.deepEqual(after.contributions.map(c => c.revisions), state.contributions.map(c => c.revisions));
    assert.throws(() => readLegacySyntheticDatabase(handle), /Unsupported database schema/);
    assert.throws(() => forgetSyntheticSource(handle, { sourceId: "source-b", expectedGeneration: state.generation, expectedRevision: 7 }), /Stale synthetic version/);
    assert.deepEqual(readSyntheticDatabase(handle), after);
  } finally { handle.dispose(); }
});

test("synthetic Forget failure rolls back roots, origins, Source and revision", () => {
  for (const failAt of ["after-origins", "before-commit"]) {
    const handle = createSyntheticDatabase(learnedFixture());
    try {
      migrateSyntheticDatabase(handle);
      const before = readSyntheticDatabase(handle);
      assert.throws(() => forgetSyntheticSource(handle, { sourceId: "source-a", expectedGeneration: before.generation, expectedRevision: 7, failAt }), /Injected failure/);
      assert.deepEqual(readSyntheticDatabase(handle), before);
    } finally { handle.dispose(); }
  }
});

test("synthetic Forget refuses fixture Source without changing normalized state", () => {
  const handle = createSyntheticDatabase(fixture());
  try {
    migrateSyntheticDatabase(handle);
    const before = readSyntheticDatabase(handle);
    assert.throws(() => forgetSyntheticSource(handle, { sourceId: "source-a", expectedGeneration: before.generation, expectedRevision: 7 }), /Synthetic learned Source unavailable/);
    assert.deepEqual(readSyntheticDatabase(handle), before);
  } finally { handle.dispose(); }
});

test("synthetic Forget rejects wrong generation at matching revision", () => {
  const handle = createSyntheticDatabase(learnedFixture());
  try {
    migrateSyntheticDatabase(handle);
    const before = readSyntheticDatabase(handle);
    assert.throws(() => forgetSyntheticSource(handle, {
      sourceId: "source-a", expectedGeneration: "different-synthetic-generation", expectedRevision: before.revision,
    }), /Stale synthetic version/);
    assert.deepEqual(readSyntheticDatabase(handle), before);
  } finally { handle.dispose(); }
});
