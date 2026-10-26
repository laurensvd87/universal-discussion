import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createDemoState, applyCommand } from "../src/domain/demo-state.js";
import { ACCOUNT_STATE_SCHEMA } from "../src/accounts/account-principal.js";
import { ServiceError } from "../src/domain/errors.js";
import { sourceStamp, operationDigestFor } from "../src/domain/source-threads.js";
import { BROWSER_MODEL_ID, LEARNED_SOURCE_PROVENANCE, MATCH_POLICY_VERSION } from "../src/domain/learned-sources.js";
import { assertValidPersistedState } from "../src/domain/persisted-state.js";
import { priorDiscussionsView } from "../src/domain/prior-discussions.js";

function fixture() {
  return createDemoState({ generation: "synthetic-generation", createdAt: "2026-10-11T12:00:00Z", sources: [],
    topicSeeds: [{ id: "topic-one", title: "One", kind: "general" }, { id: "topic-two", title: "Two", kind: "general" }] });
}
function databasePath(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-normalized-"));
  t.after(() => { assert.ok(directory.startsWith(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  return path.join(directory, "canonical.sqlite");
}
function code(value) { return error => error instanceof ServiceError && error.code === value; }
function command(state, value, suffix = "new") {
  return applyCommand(state, value, { id: "demo-alex", type: "human", demo: true }, {
    nextId: kind => `${kind}-${suffix}`, now: () => "2026-10-11T12:01:00Z", largeScale: true,
  }).state;
}

test("read-only normalized RAM snapshot roundtrips and cannot write or target disk", t => {
  const file = databasePath(t); const initial = fixture();
  const original = createNormalizedSqliteRepository(file,initial); original.close();
  const raw = new DatabaseSync(file,{readOnly:true}); const snapshotBytes=raw.serialize(); raw.close();
  const restored=createNormalizedSqliteRepository(":memory:",null,{readOnly:true,snapshotBytes});
  assert.deepEqual(restored.load(),initial); assert.throws(()=>restored.save(restored.version(),initial),code("storage-read-only")); restored.close();
  assert.throws(()=>createNormalizedSqliteRepository(file,null,{readOnly:true,snapshotBytes}),code("storage-schema"));
  assert.throws(()=>createNormalizedSqliteRepository(":memory:",null,{snapshotBytes}),code("storage-schema"));
  assert.throws(()=>createNormalizedSqliteRepository(":memory:",null,{readOnly:true,snapshotBytes:Buffer.alloc(100)}));
  assert.throws(()=>createNormalizedSqliteRepository(":memory:",null,{readOnly:true,snapshotBytes:[]}));
  snapshotBytes.fill(0);
});

test("normalized roundtrip preserves all record fields, ordinals, versions and revisions", t => {
  const file = databasePath(t); const initial = fixture();
  const repository = createNormalizedSqliteRepository(file, initial);
  let next = command(repository.load(), { type: "create-root", topicId: "topic-one", body: "Exact body **proof**" });
  repository.save(repository.version(), next);
  next = command(next, { type: "edit", contributionId: "contribution-new", body: "Edited [citation](https://citation.example/a)" });
  repository.save(repository.version(), next);
  assert.deepEqual(repository.load(), next); repository.close();
  const reopened = createNormalizedSqliteRepository(file, fixture());
  assert.deepEqual(reopened.load(), next); assert.equal(reopened.readContribution("contribution-new").revisions.length, 2);
  reopened.close();
});

test("legacy v2 and account v3 migrate atomically and retire duplicate body blob", t => {
  for (const schema of ["demo-state/v2", ACCOUNT_STATE_SCHEMA]) {
    const file = databasePath(t); const initial = fixture(); initial.schema = schema;
    const legacy = createSqliteRepository(file, initial); legacy.close();
    assert.throws(() => createNormalizedSqliteRepository(file, fixture()), code("storage-migration-required"));
    const migrated = createNormalizedSqliteRepository(file, fixture(), { allowLegacyMigration: true }); assert.deepEqual(migrated.load(), initial); migrated.close();
    const raw = new DatabaseSync(file);
    assert.equal(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='demo_state'").get().n, 0); raw.close();
    assert.throws(() => createSqliteRepository(file, fixture()), code("storage-schema"));
    const reopened = createNormalizedSqliteRepository(file, fixture()); assert.deepEqual(reopened.load(), initial); reopened.close();
  }
});

test("trusted legacy cutover fence rejects a newer commit before normalized DDL",t=>{
  const file=databasePath(t),before=fixture(); const legacy=createSqliteRepository(file,before);
  const next=command(before,{type:"create-root",topicId:"topic-one",body:"Accepted after backup"},"race"); legacy.save(legacy.version(),next); legacy.close();
  const bytes=readFileSync(file);
  assert.throws(()=>createNormalizedSqliteRepository(file,null,{allowLegacyMigration:true,expectedLegacyState:before}),code("conflict"));
  assert.deepEqual(readFileSync(file),bytes);
  const raw=new DatabaseSync(file,{readOnly:true});
  assert.equal(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'canonical_%'").get().n,0);
  assert.deepEqual(JSON.parse(raw.prepare("SELECT document FROM demo_state").get().document),next); raw.close();
  const converted=createNormalizedSqliteRepository(file,null,{allowLegacyMigration:true,expectedLegacyState:next}); assert.deepEqual(converted.load(),next); converted.close();
  assert.throws(()=>createNormalizedSqliteRepository(file,null,{allowLegacyMigration:true,expectedLegacyState:next}),code("conflict"));
});

test("trusted legacy cutover fence detects payload tampering without a version change",t=>{
  const file=databasePath(t),before=fixture(); const legacy=createSqliteRepository(file,before); legacy.close();
  const tampered=structuredClone(before); tampered.topics[0].title="Changed without advancing revision";
  const raw=new DatabaseSync(file); raw.prepare("UPDATE demo_state SET document=?").run(JSON.stringify(tampered)); raw.close(); const bytes=readFileSync(file);
  assert.throws(()=>createNormalizedSqliteRepository(file,null,{allowLegacyMigration:true,expectedLegacyState:before}),code("conflict")); assert.deepEqual(readFileSync(file),bytes);
});

test("rejected legacy cutover fence preserves a held WAL database and journal",t=>{
  const file=databasePath(t),before=fixture(); const legacy=createSqliteRepository(file,before); legacy.close();
  const writer=new DatabaseSync(file); writer.exec("PRAGMA journal_mode=WAL");
  try {
    const changed=structuredClone(before); changed.topics[0].title="Accepted WAL change";
    writer.prepare("UPDATE demo_state SET document=?").run(JSON.stringify(changed));
    const bytes=readFileSync(file),wal=readFileSync(`${file}-wal`);
    assert.throws(()=>createNormalizedSqliteRepository(file,null,{allowLegacyMigration:true,expectedLegacyState:before}),code("conflict"));
    assert.deepEqual(readFileSync(file),bytes); assert.deepEqual(readFileSync(`${file}-wal`),wal); assert.equal(writer.prepare("PRAGMA journal_mode").get().journal_mode,"wal");
  } finally {writer.close();}
});

test("legacy v1 migration preserves original topic lineage without guessing Source", t => {
  const file = databasePath(t); let initial = command(fixture(), { type: "create-root", topicId: "topic-one", body: "Unclaimed old body" });
  initial.schema = "demo-state/v1";
  for (const entry of initial.contributions) { delete entry.anchor; delete entry.originalTopicId; delete entry.learnedOrigin; }
  const raw = new DatabaseSync(file);
  raw.exec("CREATE TABLE demo_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),schema TEXT NOT NULL,generation TEXT NOT NULL,revision INTEGER NOT NULL,document TEXT NOT NULL) STRICT");
  raw.prepare("INSERT INTO demo_state VALUES(1,?,?,?,?)").run(initial.schema, initial.generation, initial.revision, JSON.stringify(initial)); raw.close();
  const repository = createNormalizedSqliteRepository(file, fixture(), { allowLegacyMigration: true }); const migrated = repository.load();
  assert.equal(migrated.revision, initial.revision + 1); assert.equal(migrated.contributions[0].authorId, "demo-alex");
  assert.deepEqual(migrated.contributions[0].anchor, { kind: "topic", topicId: "topic-one" });
  assert.equal(migrated.contributions[0].originalTopicId, "topic-one"); assert.equal(migrated.contributions[0].learnedOrigin, false);
  repository.close();
});

test("failed migration rolls back all DDL and leaves original document unchanged", t => {
  const file = databasePath(t); const initial = fixture(); const legacy = createSqliteRepository(file, initial); legacy.close();
  assert.throws(() => createNormalizedSqliteRepository(file, fixture(), { allowLegacyMigration: true, beforeCommit() { throw new Error("synthetic interruption"); } }), code("storage-failure"));
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare("SELECT document FROM demo_state").get().document, JSON.stringify(initial));
  assert.equal(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'canonical_%'").get().n, 0); raw.close();
  const retry = createNormalizedSqliteRepository(file, fixture(), { allowLegacyMigration: true }); assert.deepEqual(retry.load(), initial); retry.close();
});

test("unknown and corrupt legacy schemas fail without reseeding or partial normalization", t => {
  const file = databasePath(t); const raw = new DatabaseSync(file); raw.exec("CREATE TABLE foreign_data(value TEXT)"); raw.close();
  assert.throws(() => createNormalizedSqliteRepository(file, fixture()), code("storage-schema"));
  const corruptFile = databasePath(t); const legacy = createSqliteRepository(corruptFile, fixture()); legacy.close();
  const corrupt = new DatabaseSync(corruptFile); corrupt.prepare("UPDATE demo_state SET document='{}'").run(); corrupt.close();
  assert.throws(() => createNormalizedSqliteRepository(corruptFile, fixture(), { allowLegacyMigration: true }), code("storage-corrupt"));
});

test("scoped indexed reads and delta writes preserve unrelated rows and enforce CAS", t => {
  const file = databasePath(t); const repository = createNormalizedSqliteRepository(file, fixture());
  const before = repository.readTopicState("topic-one"); const after = command(before, { type: "create-root", topicId: "topic-one", body: "Scoped body" });
  let event; repository.subscribeChanges(value => { event = value; });
  repository.saveScoped(repository.version(), before, after);
  assert.deepEqual(event.topicIds, ["topic-one"]); assert.equal(repository.readTopicState("topic-two").contributions.length, 0);
  assert.equal(repository.readThread("contribution-new")[0].revisions[0].body, "Scoped body");
  assert.throws(() => repository.saveScoped({ generation: before.generation, revision: before.revision }, before, after), code("conflict"));
  const page = repository.readCatalogPage({ limit: 1 }); assert.equal(page.items.length, 1); assert.equal(page.nextCursor, "topic-one");
  assert.equal(repository.readCatalogPage({ after: page.nextCursor, limit: 1, expectedVersion: page.version }).items[0].id, "topic-two");
  const current = repository.readTopicState("topic-one"); const edited = command(current, { type: "edit", contributionId: "contribution-new", body: "Updated" });
  repository.saveScoped(repository.version(), current, edited);
  assert.throws(() => repository.readCatalogPage({ after: page.nextCursor, expectedVersion: page.version }), code("conflict"));
  const raw = new DatabaseSync(file); assert.equal(raw.prepare("SELECT payload FROM canonical_topics WHERE id='topic-two'").get().payload, JSON.stringify(fixture().topics[1])); raw.close();
  repository.close();
});

test("scoped write rollback and account downgrade leave committed version unchanged", t => {
  const file = databasePath(t); let interrupt = false;
  const initial = fixture(); initial.schema = ACCOUNT_STATE_SCHEMA;
  const repository = createNormalizedSqliteRepository(file, initial, { beforeCommit() { if (interrupt) throw new Error("synthetic failure"); } });
  const before = repository.readTopicState("topic-one"); const after = command(before, { type: "create-root", topicId: "topic-one", body: "Atomic" });
  interrupt = true; assert.throws(() => repository.saveScoped(repository.version(), before, after), code("storage-failure"));
  assert.equal(repository.readContribution("contribution-new"), null); assert.equal(repository.version().revision, 0);
  interrupt = false; after.schema = "demo-state/v2";
  assert.throws(() => repository.saveScoped(repository.version(), before, after), code("conflict")); repository.close();
});

test("direct indexed reads and reopen reject tampered authority columns", t => {
  const file = databasePath(t); const initial = command(fixture(), { type: "create-root", topicId: "topic-one", body: "Integrity" });
  const repository = createNormalizedSqliteRepository(file, initial);
  const raw = new DatabaseSync(file); raw.prepare("UPDATE canonical_contributions SET author_id='demo-blair' WHERE id='contribution-new'").run(); raw.close();
  assert.throws(() => repository.readContribution("contribution-new"), code("storage-corrupt")); repository.close();
  assert.throws(() => createNormalizedSqliteRepository(file, fixture()), code("storage-corrupt"));
});

test("normalized canonical records exceed old aggregate 8 MiB and 1000-post limits", t => {
  const file = databasePath(t); const initial = fixture();
  const template = command(initial, { type: "create-root", topicId: "topic-one", body: "x".repeat(7900) }).contributions[0];
  initial.contributions = Array.from({ length: 1200 }, (_, index) => ({ ...template, id: `root-${String(index).padStart(5, "0")}`, revisions: structuredClone(template.revisions) }));
  assert.ok(Buffer.byteLength(JSON.stringify(initial)) > 8 * 1024 * 1024);
  const repository = createNormalizedSqliteRepository(file, initial); assert.deepEqual(repository.load(), initial);
  assert.equal(repository.counts().contributions, 1200); repository.close();
  const reopened = createNormalizedSqliteRepository(file, fixture()); assert.equal(reopened.counts().contributions, 1200);
  assert.equal(reopened.readContribution("root-01199").revisions[0].body.length, 7900); reopened.close();
});

test("learned vector, operation receipt, source stamp and immutable owner metadata survive migration", t => {
  const file = databasePath(t); const initial = fixture();
  const source = { id: "learned-source", url: "https://example.com/synthetic-story", title: "Synthetic article", embedding: { modelId: BROWSER_MODEL_ID, values: Array(384).fill(1 / Math.sqrt(384)) },
    provenance: LEARNED_SOURCE_PROVENANCE, extractorVersion: "main-text-prefix/v1", operationId: "operation-one", policyVersion: MATCH_POLICY_VERSION };
  source.operationDigest = operationDigestFor(source); initial.sources.push(source); initial.sourceLinks.push({ sourceId: source.id, topicId: "topic-one", method: "learned-provisional" });
  const withRoot = command(initial, { type: "create-root", topicId: "topic-one", body: "Source anchored", originSourceId: source.id });
  const legacy = createSqliteRepository(file, withRoot); legacy.close();
  const repository = createNormalizedSqliteRepository(file, fixture(), { allowLegacyMigration: true });
  assert.deepEqual(repository.exactSource(source.id), source); assert.deepEqual(repository.readOperation(source.operationId), source);
  assert.equal(repository.readContribution("contribution-new").anchor.stamp, sourceStamp(source));
  assert.deepEqual(repository.readEmbeddingPage({ limit: 1 }).items[0], source);
  const before = repository.readSourceState(source.id); const after = command(before, { type: "edit", contributionId: "contribution-new", body: "Edited" });
  after.contributions[0].originalTopicId = "topic-two";
  assert.throws(() => repository.saveScoped(repository.version(), before, after), code("conflict"));
  const raw = new DatabaseSync(file); raw.prepare("UPDATE canonical_embeddings SET model_id='tampered'").run(); raw.close();
  assert.throws(() => repository.exactSource(source.id), code("storage-corrupt")); repository.close();
});

test("scoped Source link move cannot strand an omitted anchored thread", t => {
  const initial = fixture(); initial.sources.push({ id: "source-one", url: "https://source.example/a", title: "Source", provenance: "synthetic", embedding: null });
  initial.sourceLinks.push({ sourceId: "source-one", topicId: "topic-one", method: "fixture-confirmed" });
  const withRoot = command(initial, { type: "create-root", topicId: "topic-one", body: "Anchored", originSourceId: "source-one" });
  const repository = createNormalizedSqliteRepository(databasePath(t), withRoot);
  const before = structuredClone(repository.load()); before.contributions = [];
  const after = structuredClone(before); after.revision += 1; after.sourceLinks[0].topicId = "topic-two";
  assert.throws(() => repository.saveScoped(repository.version(), before, after), code("conflict"));
  assert.equal(repository.readSourceState("source-one").contributions[0].discussionId, "discussion-topic-one"); repository.close();
});

test("delta edits update only changed contribution/revision rows and purge every withdrawn revision", t => {
  const file = databasePath(t); let initial = command(fixture(), { type: "create-root", topicId: "topic-one", body: "First exact revision" });
  initial = command(initial, { type: "edit", contributionId: "contribution-new", body: "Second exact revision" });
  const repository = createNormalizedSqliteRepository(file, initial);
  const raw = new DatabaseSync(file);
  raw.exec("CREATE TABLE synthetic_audit(table_name TEXT); CREATE TRIGGER synthetic_topic_update AFTER UPDATE ON canonical_topics BEGIN INSERT INTO synthetic_audit VALUES('topic'); END; CREATE TRIGGER synthetic_contribution_update AFTER UPDATE ON canonical_contributions BEGIN INSERT INTO synthetic_audit VALUES('contribution'); END; CREATE TRIGGER synthetic_revision_insert AFTER INSERT ON canonical_revisions BEGIN INSERT INTO synthetic_audit VALUES('revision'); END");
  const before = repository.readTopicState("topic-one"); const after = command(before, { type: "edit", contributionId: "contribution-new", body: "Third exact revision" });
  repository.saveScoped(repository.version(), before, after);
  assert.deepEqual(raw.prepare("SELECT table_name FROM synthetic_audit ORDER BY rowid").all().map(row => row.table_name), ["contribution", "revision"]);
  const visible = repository.readTopicState("topic-one"); const withdrawn = command(visible, { type: "withdraw", contributionId: "contribution-new" });
  repository.saveScoped(repository.version(), visible, withdrawn);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM canonical_revisions").get().n, 0);
  const payload = raw.prepare("SELECT payload FROM canonical_contributions WHERE id='contribution-new'").get().payload;
  assert.equal(payload.includes("exact revision"), false); assert.equal(JSON.parse(payload).authorId, null);
  raw.exec("DROP TRIGGER synthetic_topic_update; DROP TRIGGER synthetic_contribution_update; DROP TRIGGER synthetic_revision_insert; DROP TABLE synthetic_audit"); raw.close(); repository.close();
  const reopened = createNormalizedSqliteRepository(file, fixture()); assert.deepEqual(reopened.readContribution("contribution-new").revisions, []); reopened.close();
});

test("full snapshot reorder uses row deltas without ordinal collisions", t => {
  const repository = createNormalizedSqliteRepository(databasePath(t), fixture()); const before = repository.load(); const after = structuredClone(before);
  after.revision += 1; after.topics.reverse(); after.discussions.reverse(); repository.save(repository.version(), after);
  assert.deepEqual(repository.load(), after); repository.close();
});

test("serialization failure rolls back initialization and scoped rows", t => {
  const file = databasePath(t);
  assert.throws(() => createNormalizedSqliteRepository(file, fixture(), { serialize() { throw new Error("synthetic serialization failure"); } }), code("storage-failure"));
  const raw = new DatabaseSync(file); assert.equal(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'canonical_%'").get().n, 0); raw.close();
  let failSerialization = false;
  const repository = createNormalizedSqliteRepository(file, fixture(), { serialize(value) { if (failSerialization) throw new Error("synthetic serialization failure"); return JSON.stringify(value); } });
  const before = repository.readTopicState("topic-one"); const after = command(before, { type: "create-root", topicId: "topic-one", body: "Will roll back" });
  failSerialization = true;
  assert.throws(() => repository.saveScoped(repository.version(), before, after), code("storage-failure"));
  assert.equal(repository.version().revision, 0); assert.equal(repository.readContribution("contribution-new"), null); repository.close();
});

test("metadata, Source pages, historical thread and contribution scopes exclude unrelated posts", t => {
  let initial = fixture(); initial.sources.push({ id: "source-one", url: "https://source.example/a", title: "Source", provenance: "synthetic", embedding: null });
  initial.sourceLinks.push({ sourceId: "source-one", topicId: "topic-one", method: "fixture-confirmed" });
  initial = command(initial, { type: "create-root", topicId: "topic-one", body: "Historical exact root", originSourceId: "source-one" }, "historical");
  initial = command(initial, { type: "reply", discussionId: "discussion-topic-one", rootId: "contribution-historical", replyToId: null, body: "Historical complete reply" }, "reply");
  initial = command(initial, { type: "create-root", topicId: "topic-one", body: "Unrelated old root" }, "old-unrelated");
  // A fixture Source's old root may become pinned while its current link moves;
  // preserve the explicit source origin witness rather than inventing lineage.
  initial.contributions[0].anchor = { kind: "topic", topicId: "topic-one" };
  initial.sourceLinks[0].topicId = "topic-two";
  initial = command(initial, { type: "create-root", topicId: "topic-two", body: "Current unrelated root" }, "current-unrelated");
  const repository = createNormalizedSqliteRepository(databasePath(t), initial);
  const metadata = repository.readMetadataScope({ sourceIds: ["source-one"], topicIds: ["topic-one"] });
  assertValidPersistedState(metadata, { largeScale: true }); assert.equal(metadata.contributions.length, 0); assert.equal(metadata.topics.length, 2);
  const prior = repository.readPriorSourceState("source-one"); assertValidPersistedState(prior, { largeScale: true });
  assert.deepEqual(prior.contributions.map(entry => entry.id), ["contribution-historical", "contribution-reply"]);
  assert.deepEqual(priorDiscussionsView(prior, "source-one").topics, [{ id: "topic-one", title: "One", kind: "general", rootCount: 1 }]);
  const target = repository.readContributionState("contribution-reply"); assert.deepEqual(target.contributions, prior.contributions);
  const page = repository.readTopicSources("topic-two", { limit: 1 }); assert.equal(page.items[0].id, "source-one"); assert.equal(page.nextCursor, null);
  assert.equal(repository.readTopicSources("topic-one").items.length, 0);
  assert.throws(() => repository.readTopicSources("topic-two", { limit: 101 }), code("invalid")); repository.close();
});

test("Source metadata page rejects forged indexed Source association", t => {
  const file = databasePath(t); const initial = fixture();
  initial.sources.push({ id: "source-one", url: "https://source.example/a", title: "Source", provenance: "synthetic", embedding: null });
  initial.sourceLinks.push({ sourceId: "source-one", topicId: "topic-one", method: "fixture-confirmed" });
  const repository = createNormalizedSqliteRepository(file, initial); const raw = new DatabaseSync(file);
  raw.prepare("UPDATE canonical_source_links SET topic_id='topic-two'").run(); raw.close();
  assert.throws(() => repository.readTopicSources("topic-two"), code("storage-corrupt"));
  assert.throws(() => repository.readSourceState("source-one"), code("storage-corrupt")); repository.close();
});

test("paged Source/Topic reads use indexed keyset range plans", t => {
  const file = databasePath(t); const repository = createNormalizedSqliteRepository(file, fixture());
  const raw = new DatabaseSync(file);
  const topicPlan = raw.prepare("EXPLAIN QUERY PLAN SELECT * FROM canonical_topics WHERE id>? ORDER BY id LIMIT ?").all("topic-one", 100).map(row => row.detail).join(" ");
  const sourcePlan = raw.prepare("EXPLAIN QUERY PLAN SELECT s.* FROM canonical_source_links l JOIN canonical_sources s ON s.id=l.source_id WHERE l.topic_id=? AND l.source_id>? ORDER BY l.source_id LIMIT ?").all("topic-one", "source-one", 100).map(row => row.detail).join(" ");
  assert.match(topicPlan, /SEARCH.*id>\?/u); assert.match(sourcePlan, /SEARCH.*topic_id=\?.*source_id>\?/u);
  raw.close(); repository.close();
});

test("separate normalized connections enforce generation/revision fences and reset events", t => {
  const file = databasePath(t); const left = createNormalizedSqliteRepository(file, fixture()); const right = createNormalizedSqliteRepository(file, fixture());
  const before = left.readTopicState("topic-one"); const next = command(before, { type: "create-root", topicId: "topic-one", body: "First writer" });
  left.saveScoped(left.version(), before, next);
  assert.throws(() => right.saveScoped({ generation: before.generation, revision: before.revision }, before, next), code("conflict"));
  assert.equal(right.readContribution("contribution-new").revisions[0].body, "First writer");
  let event; left.subscribeChanges(value => { event = value; });
  const reset = fixture(); reset.generation = "new-synthetic-generation"; left.replace(left.version(), reset);
  assert.equal(event.reset, true); assert.equal(right.version().generation, reset.generation);
  assert.throws(() => right.readMetadataScope({ topicIds: ["topic-one"], expectedVersion: { generation: before.generation, revision: before.revision } }), code("conflict"));
  left.close(); right.close();
});

test("scoped new IDs cannot collide with omitted canonical records", t => {
  const initial = command(fixture(), { type: "create-root", topicId: "topic-two", body: "Other discussion" }, "shared");
  const repository = createNormalizedSqliteRepository(databasePath(t), initial);
  const before = repository.readTopicState("topic-one"); const after = command(before, { type: "create-root", topicId: "topic-one", body: "Would reuse root ID" }, "shared");
  assert.throws(() => repository.saveScoped(repository.version(), before, after), code("conflict"));
  assert.equal(repository.readContribution("contribution-shared").discussionId, "discussion-topic-two"); repository.close();
});

test("normalized embedding inventory grows beyond 8 MiB without a catalog count ceiling", t => {
  const initial = fixture(); const values = Array.from({ length: 384 }, (_, index) => (index + 1) / 387);
  initial.sources = Array.from({ length: 1300 }, (_, index) => ({ id: `source-${String(index).padStart(5, "0")}`, url: `https://synthetic.example/page/${index}`, title: `Source ${index}`, provenance: "synthetic", embedding: { modelId: "synthetic-vector-space", values: [...values] } }));
  initial.sourceLinks = initial.sources.map(source => ({ sourceId: source.id, topicId: "topic-one", method: "fixture-confirmed" }));
  assert.ok(Buffer.byteLength(JSON.stringify(initial)) > 8 * 1024 * 1024);
  const repository = createNormalizedSqliteRepository(databasePath(t), initial);
  let after = null; let count = 0; const version = repository.version();
  do { const page = repository.readEmbeddingPage({ after, limit: 300, expectedVersion: version }); count += page.items.length; after = page.nextCursor; } while (after !== null);
  assert.equal(count, 1300); assert.deepEqual(repository.exactSource("source-01299").embedding.values, values);
  repository.close();
});

test("dense Topic contribution pages use bounded indexed tuple reads and version-bound cursors", t => {
  const file = databasePath(t); const initial = fixture();
  const template = command(initial, { type: "create-root", topicId: "topic-one", body: "Bounded page body" }).contributions[0];
  initial.contributions = Array.from({ length: 1250 }, (_, index) => ({ ...template, id: `root-${String(index).padStart(5, "0")}`, createdAt: index < 600 ? "2026-10-11T12:00:00Z" : "2026-10-11T12:01:00Z", revisions: structuredClone(template.revisions) }));
  initial.contributions.reverse();
  const repository = createNormalizedSqliteRepository(file, initial); const originalPrepare = DatabaseSync.prototype.prepare;
  const ids = [];
  DatabaseSync.prototype.prepare = function(sql) {
    assert.doesNotMatch(sql, /FROM canonical_contributions ORDER BY ordinal/u, "page reads must not load all contributions");
    return Reflect.apply(originalPrepare, this, [sql]);
  };
  const version = repository.version(); let firstCursor;
  try {
    let after = null;
    do {
      const page = repository.readContributionPage("topic-one", { after, limit: 100, expectedVersion: version });
      assert.equal(page.topic.id, "topic-one"); assert.equal(page.discussionId, "discussion-topic-one"); assert.ok(page.items.length <= 100);
      assert.ok(page.items.every(item => item.revisions[0].body === "Bounded page body"));
      ids.push(...page.items.map(item => item.id)); after = page.nextCursor; firstCursor ??= after;
    } while (after !== null);
  } finally { DatabaseSync.prototype.prepare = originalPrepare; }
  assert.equal(ids.length, 1250); assert.equal(new Set(ids).size, 1250); assert.deepEqual(ids, [...ids].sort());
  const raw = new DatabaseSync(file);
  const plan = raw.prepare("EXPLAIN QUERY PLAN SELECT * FROM canonical_contributions WHERE discussion_id=? AND (created_at,id)>(?,?) ORDER BY created_at,id LIMIT ?").all("discussion-topic-one", firstCursor.createdAt, firstCursor.id, 101).map(row => row.detail).join(" ");
  assert.match(plan, /SEARCH.*canonical_contributions_discussion.*discussion_id=\?/u); assert.doesNotMatch(plan, /TEMP B-TREE/u); raw.close();
  const before = repository.readTopicState("topic-one"); const after = structuredClone(before); after.revision += 1; after.contributions[0].revisions.push({ body: "Edited current body", createdAt: "2026-10-11T12:02:00Z" });
  repository.saveScoped(version, before, after);
  assert.throws(() => repository.readContributionPage("topic-one", { after: firstCursor, expectedVersion: version }), code("conflict"));
  for (const cursor of ["root-00001", {}, { createdAt: "2026", id: "root", extra: true }, { createdAt: "", id: "root" }]) assert.throws(() => repository.readContributionPage("topic-one", { after: cursor }), code("invalid"));
  assert.throws(() => repository.readContributionPage("topic-one", { limit: 101 }), code("invalid")); repository.close();
});

test("normalized seed, legacy import, load and full save reject cross-kind ID collisions", t => {
  const colliding = fixture(); colliding.sources.push({ id: "topic-one", url: "https://synthetic.example/source", title: "Collision", provenance: "synthetic", embedding: null });
  assert.throws(() => createNormalizedSqliteRepository(databasePath(t), colliding));
  const legacyFile = databasePath(t); const legacy = createSqliteRepository(legacyFile, colliding); legacy.close();
  assert.throws(() => createNormalizedSqliteRepository(legacyFile, fixture(), { allowLegacyMigration: true }), code("storage-corrupt"));
  const file = databasePath(t); const repository = createNormalizedSqliteRepository(file, fixture()); const next = structuredClone(colliding); next.revision += 1;
  assert.throws(() => repository.save(repository.version(), next)); assert.equal(repository.counts().sources, 0); repository.close();
  const raw = new DatabaseSync(file); const source = colliding.sources[0];
  raw.prepare("INSERT INTO canonical_sources VALUES(?,?,?,NULL,0,0,?)").run(source.id, source.url, source.provenance, JSON.stringify({ id: source.id, url: source.url, title: source.title, provenance: source.provenance })); raw.close();
  assert.throws(() => createNormalizedSqliteRepository(file, fixture()), code("storage-corrupt"));
});

test("opaque ID registry prevents retired ID reuse in full and scoped writes, with reset generation boundary", t => {
  const file = databasePath(t); const initial = command(fixture(), { type: "create-root", topicId: "topic-one", body: "Will be removed" });
  const repository = createNormalizedSqliteRepository(file, initial);
  const before = repository.readTopicState("topic-one"); const removed = structuredClone(before); removed.revision += 1; removed.contributions = [];
  repository.saveScoped(repository.version(), before, removed);
  const recreated = command(removed, { type: "create-root", topicId: "topic-one", body: "Cannot recycle" });
  assert.throws(() => repository.saveScoped(repository.version(), removed, recreated), code("conflict"));
  const full = structuredClone(repository.load()); full.revision += 1; full.contributions = recreated.contributions;
  assert.throws(() => repository.save(repository.version(), full), code("conflict"));
  const crossKind = structuredClone(repository.load()); crossKind.revision += 1;
  crossKind.sources.push({ id: "contribution-new", url: "https://synthetic.example/source", title: "Cannot recycle as Source", provenance: "synthetic", embedding: null });
  assert.throws(() => repository.save(repository.version(), crossKind), code("conflict"));
  const raw = new DatabaseSync(file); assert.deepEqual(Object.keys(raw.prepare("SELECT * FROM canonical_id_registry WHERE id='contribution-new'").get()).sort(), ["id", "kind"]);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM canonical_contributions").get().n, 0); raw.close();
  const reset = fixture(); reset.generation = "fresh-generation"; repository.replace(repository.version(), reset);
  const freshBefore = repository.readTopicState("topic-one"); const freshAfter = command(freshBefore, { type: "create-root", topicId: "topic-one", body: "Allowed in new generation" });
  repository.saveScoped(repository.version(), freshBefore, freshAfter); assert.equal(repository.readContribution("contribution-new").revisions[0].body, "Allowed in new generation"); repository.close();
  const reopened = createNormalizedSqliteRepository(file, fixture()); assert.equal(reopened.version().generation, "fresh-generation"); reopened.close();
});

test("unapproved legacy migration is rejected before journal changes or WAL checkpoint", t => {
  const file = databasePath(t); const legacy = createSqliteRepository(file, fixture()); legacy.close();
  const writer = new DatabaseSync(file); writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  const updated = fixture(); updated.topics[0].title = "Synthetic WAL title";
  writer.prepare("UPDATE demo_state SET document=?").run(JSON.stringify(updated));
  const databaseBefore = readFileSync(file); const walBefore = readFileSync(`${file}-wal`);
  const originalExec = DatabaseSync.prototype.exec; let journalWrites = 0;
  DatabaseSync.prototype.exec = function(sql) { if (/journal_mode/iu.test(sql)) journalWrites += 1; return Reflect.apply(originalExec, this, [sql]); };
  try { assert.throws(() => createNormalizedSqliteRepository(file, fixture()), code("storage-migration-required")); }
  finally { DatabaseSync.prototype.exec = originalExec; }
  assert.equal(journalWrites, 0); assert.deepEqual(readFileSync(file), databaseBefore); assert.deepEqual(readFileSync(`${file}-wal`), walBefore);
  assert.equal(writer.prepare("PRAGMA journal_mode").get().journal_mode, "wal"); writer.close();
});

test("failed physical integrity check exposes only a fixed explanation", t => {
  const file = databasePath(t); const originalPrepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) {
    if (sql === "PRAGMA quick_check") return { all: () => [{ quick_check: "synthetic private database detail" }] };
    return Reflect.apply(originalPrepare, this, [sql]);
  };
  try {
    assert.throws(() => createNormalizedSqliteRepository(file, fixture()), error => error instanceof ServiceError && error.code === "storage-corrupt" && error.message === "Local database is inconsistent");
  } finally { DatabaseSync.prototype.prepare = originalPrepare; }
  const raw = new DatabaseSync(file); assert.equal(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'canonical_%'").get().n, 0); raw.close();
});

test("read-only catalog preserves exact vectors without selecting contribution authors, bodies or revisions", t => {
  const file = databasePath(t); let initial = fixture();
  initial.sources.push({ id: "source-vector", url: "https://synthetic.example/vector", title: "Synthetic vector Source", provenance: "synthetic", embedding: { modelId: "synthetic-space", values: [Math.PI, 0.1, 1 / 3] } });
  initial.sourceLinks.push({ sourceId: "source-vector", topicId: "topic-one", method: "fixture-confirmed" });
  initial = command(initial, { type: "create-root", topicId: "topic-one", body: "synthetic-body-never-in-catalog", originSourceId: "source-vector" });
  const writer = createNormalizedSqliteRepository(file, initial); writer.close(); const bytesBefore = readFileSync(file);
  const originalPrepare = DatabaseSync.prototype.prepare; const originalExec = DatabaseSync.prototype.exec; let reader;
  DatabaseSync.prototype.prepare = function(sql) {
    assert.doesNotMatch(sql, /SELECT\s+.*\s+(?:FROM|JOIN)\s+canonical_revisions/iu, "catalog must not select revisions");
    if (/SELECT\s+.*\s+FROM\s+canonical_contributions/iu.test(sql)) assert.match(sql, /^SELECT c\.id FROM canonical_contributions/iu, "catalog must select only contribution IDs for registry verification");
    return Reflect.apply(originalPrepare, this, [sql]);
  };
  DatabaseSync.prototype.exec = function(sql) {
    assert.doesNotMatch(sql, /journal_mode|BEGIN IMMEDIATE|\b(?:INSERT|UPDATE|DELETE|CREATE|DROP)\b/iu, "read-only catalog must not mutate storage");
    return Reflect.apply(originalExec, this, [sql]);
  };
  try {
    reader = createNormalizedSqliteRepository(file, null, { readOnly: true, serialize() { assert.fail("read-only open must not serialize"); } });
    const snapshot = reader.readCatalogSnapshot(); assert.deepEqual(snapshot, { ...initial, contributions: [] });
    assert.equal(JSON.stringify(snapshot).includes("demo-alex"), false); assert.equal(JSON.stringify(snapshot).includes("synthetic-body-never-in-catalog"), false);
    assert.equal(snapshot.sources[0].embedding.values[0], Math.PI);
    for (const operation of [() => reader.save(null, null), () => reader.replace(null, null), () => reader.saveScoped(null, null, null)]) assert.throws(operation, code("storage-read-only"));
    reader.close(); reader = null;
  } finally { reader?.close(); DatabaseSync.prototype.prepare = originalPrepare; DatabaseSync.prototype.exec = originalExec; }
  assert.deepEqual(readFileSync(file), bytesBefore);
});

test("read-only catalog does not create missing files or convert legacy databases", t => {
  const missing = databasePath(t); assert.equal(existsSync(missing), false);
  assert.throws(() => createNormalizedSqliteRepository(missing, fixture(), { readOnly: true }), code("storage-schema")); assert.equal(existsSync(missing), false);
  assert.throws(() => createNormalizedSqliteRepository(":memory:", fixture(), { readOnly: true }), code("storage-schema"));
  const legacyFile = databasePath(t); const legacy = createSqliteRepository(legacyFile, fixture()); legacy.close(); const before = readFileSync(legacyFile);
  assert.throws(() => createNormalizedSqliteRepository(legacyFile, fixture(), { readOnly: true, allowLegacyMigration: true }), code("storage-schema"));
  assert.deepEqual(readFileSync(legacyFile), before);
});

test("read-only catalog leaves held normalized WAL database and WAL bytes unchanged", t => {
  const file = databasePath(t); const normalized = createNormalizedSqliteRepository(file, fixture()); normalized.close();
  const writer = new DatabaseSync(file); writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  const updated = fixture().topics[0]; updated.title = "Synthetic WAL title";
  writer.prepare("UPDATE canonical_topics SET payload=? WHERE id=?").run(JSON.stringify(updated), updated.id);
  const mainBefore = readFileSync(file); const walBefore = readFileSync(`${file}-wal`);
  const reader = createNormalizedSqliteRepository(file, null, { readOnly: true }); assert.equal(reader.readCatalogSnapshot().topics[0].title, updated.title); reader.close();
  assert.deepEqual(readFileSync(file), mainBefore); assert.deepEqual(readFileSync(`${file}-wal`), walBefore);
  assert.equal(writer.prepare("PRAGMA journal_mode").get().journal_mode, "wal"); writer.close();
});

test("read-only catalog rejects a missing contribution ID reservation without reading its body", t => {
  const file = databasePath(t); const initial = command(fixture(), { type: "create-root", topicId: "topic-one", body: "Body not required for identity check" });
  const normalized = createNormalizedSqliteRepository(file, initial); normalized.close();
  const raw = new DatabaseSync(file); raw.prepare("DELETE FROM canonical_id_registry WHERE id='contribution-new'").run(); raw.close();
  assert.throws(() => createNormalizedSqliteRepository(file, null, { readOnly: true }), code("storage-corrupt"));
});
