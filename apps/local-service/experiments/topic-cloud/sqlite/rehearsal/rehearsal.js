import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { mkdtempSync, realpathSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { assertValidPersistedState } from "../../../../src/domain/persisted-state.js";
import { LEARNED_SOURCE_PROVENANCE } from "../../../../src/domain/learned-sources.js";
import { sourceStamp } from "../../../../src/domain/source-threads.js";

const created = new Set();
const DB_NAME = "synthetic.sqlite";
const FORMAT = "normalized-state/rehearsal-v1";
const legacyObjects = ["demo_state"];
const normalizedObjects = ["state_meta", "topics", "discussions", "sources", "source_vectors", "source_topic_links", "contributions", "root_anchors", "contribution_revisions"];
const columns = ["singleton", "schema", "generation", "revision", "document"];
// Exact current service DDL (sqlite-repository.js), copied only for synthetic
// shape rehearsal. This still cannot authorize opening the owner database.
const LEGACY_TABLE_SQL = `CREATE TABLE demo_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema TEXT NOT NULL,
        generation TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        document TEXT NOT NULL
      ) STRICT`;

function guardedDirectory(path) {
  if (!created.has(path) || basename(path) !== DB_NAME) throw new Error("Unregistered synthetic database");
  const directory = realpathSync(dirname(path));
  const temp = realpathSync(tmpdir());
  if (!directory.startsWith(`${temp}${sep}`) || !basename(directory).startsWith("topic-cloud-synthetic-rehearsal-")) {
    throw new Error("Unsafe synthetic database path");
  }
  return directory;
}

function guard(path) {
  guardedDirectory(path);
  if (!existsSync(path)) throw new Error("Unregistered synthetic database");
  if (realpathSync(path) !== resolve(path)) throw new Error("Unsafe synthetic database path");
}

function open(path) {
  guard(path);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL");
  return db;
}

function objectNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
}

function expectObjects(db, expected) {
  if (JSON.stringify(objectNames(db)) !== JSON.stringify([...expected].sort())) throw new Error("Unsupported database schema");
}

function tableDefinitions(db, names) {
  const allowed = new Set(names);
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().filter(row => allowed.has(row.name));
}

let normalizedDefinition;
function expectedNormalizedDefinition() {
  if (normalizedDefinition === undefined) {
    const scratch = new DatabaseSync(":memory:");
    try { makeTables(scratch); normalizedDefinition = JSON.stringify(tableDefinitions(scratch, normalizedObjects)); }
    finally { scratch.close(); }
  }
  return normalizedDefinition;
}

function assertGlobalIds(state) {
  const ids = new Set();
  for (const row of [...state.topics, ...state.discussions, ...state.sources, ...state.contributions]) {
    if (ids.has(row.id)) throw new Error("Cross-kind ID collision");
    ids.add(row.id);
  }
}

function readLegacy(db) {
  expectObjects(db, legacyObjects);
  if (tableDefinitions(db, legacyObjects)[0]?.sql !== LEGACY_TABLE_SQL) throw new Error("Unsupported legacy table definition");
  const actualColumns = db.prepare("PRAGMA table_info(demo_state)").all().map(row => row.name);
  if (JSON.stringify(actualColumns) !== JSON.stringify(columns)) throw new Error("Unsupported legacy columns");
  const rows = db.prepare("SELECT * FROM demo_state").all();
  if (rows.length !== 1 || rows[0].singleton !== 1 || rows[0].schema !== "demo-state/v2" ||
      Buffer.byteLength(rows[0].document, "utf8") > 8 * 1024 * 1024) throw new Error("Unsupported legacy row");
  let state;
  try { state = JSON.parse(rows[0].document); } catch { throw new Error("Invalid legacy JSON"); }
  if (state.schema !== rows[0].schema || state.generation !== rows[0].generation || state.revision !== rows[0].revision) {
    throw new Error("Legacy header mismatch");
  }
  assertValidPersistedState(state);
  assertGlobalIds(state);
  return { state, document: rows[0].document };
}

export function createSyntheticDatabase(state) {
  assertValidPersistedState(state);
  const directory = mkdtempSync(join(tmpdir(), "topic-cloud-synthetic-rehearsal-"));
  const path = join(directory, DB_NAME);
  let db;
  try {
    db = new DatabaseSync(path);
    db.exec(LEGACY_TABLE_SQL);
    db.prepare("INSERT INTO demo_state VALUES (1, ?, ?, ?, ?)").run(state.schema, state.generation, state.revision, JSON.stringify(state));
  } catch (error) {
    try { db?.close(); } catch { /* Keep the creation error. */ }
    try {
      if (existsSync(path)) unlinkSync(path);
      rmdirSync(directory);
    } catch { /* An unexpected sidecar is left for explicit inspection. */ }
    throw error;
  }
  db.close();
  created.add(path);
  guard(path);
  return Object.freeze({ path, dispose() {
    guardedDirectory(path);
    if (existsSync(path)) {
      guard(path);
      unlinkSync(path);
    }
    rmdirSync(directory);
    created.delete(path);
  } });
}

function makeTables(db) {
  db.exec(`
    CREATE TABLE state_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), format TEXT NOT NULL,
      generation TEXT NOT NULL, revision INTEGER NOT NULL, source_schema TEXT NOT NULL) STRICT;
    CREATE TABLE topics (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, kind TEXT NOT NULL,
      title TEXT NOT NULL, created_at TEXT NOT NULL, provenance TEXT, retain_tight INTEGER) STRICT;
    CREATE TABLE discussions (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE,
      topic_id TEXT NOT NULL UNIQUE REFERENCES topics(id)) STRICT;
    CREATE TABLE sources (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, url TEXT NOT NULL,
      title TEXT NOT NULL, provenance TEXT NOT NULL, extractor_version TEXT, operation_id TEXT,
      operation_digest TEXT, policy_version TEXT) STRICT;
    CREATE TABLE source_vectors (source_id TEXT PRIMARY KEY REFERENCES sources(id), model_id TEXT NOT NULL,
      dimension INTEGER NOT NULL, vector_json TEXT NOT NULL, representation_stamp TEXT NOT NULL) STRICT;
    CREATE TABLE source_topic_links (source_id TEXT PRIMARY KEY REFERENCES sources(id), ordinal INTEGER NOT NULL UNIQUE,
      topic_id TEXT NOT NULL REFERENCES topics(id), method TEXT NOT NULL) STRICT;
    CREATE TABLE contributions (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE,
      discussion_id TEXT NOT NULL REFERENCES discussions(id), root_id TEXT REFERENCES contributions(id),
      reply_to_id TEXT REFERENCES contributions(id), created_at TEXT NOT NULL,
      visibility TEXT NOT NULL, withdrawn INTEGER NOT NULL CHECK(withdrawn IN (0,1)),
      actor_type TEXT NOT NULL, author_id TEXT, origin_source_id TEXT REFERENCES sources(id),
      insight_kind TEXT, insight_operator_id TEXT) STRICT;
    CREATE TABLE root_anchors (root_id TEXT PRIMARY KEY REFERENCES contributions(id), kind TEXT NOT NULL,
      topic_id TEXT REFERENCES topics(id), source_id TEXT REFERENCES sources(id), stamp TEXT,
      original_topic_id TEXT NOT NULL, learned_origin INTEGER NOT NULL CHECK(learned_origin IN (0,1))) STRICT;
    CREATE TABLE contribution_revisions (contribution_id TEXT NOT NULL REFERENCES contributions(id),
      ordinal INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(contribution_id,ordinal)) STRICT;
  `);
}

function inject(stage, requested) {
  if (stage === requested) throw new Error(`Injected failure: ${stage}`);
}

export function migrateSyntheticDatabase(handle, { failAt } = {}) {
  const db = open(handle.path);
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const { state, document } = readLegacy(db);
      makeTables(db);
      const insert = (sql, rows) => { const stmt = db.prepare(sql); rows.forEach((row, ordinal) => stmt.run(row[0], ordinal, ...row.slice(1))); };
      db.prepare("INSERT INTO state_meta VALUES(1, ?, ?, ?, ?)").run(FORMAT, state.generation, state.revision, state.schema);
      insert("INSERT INTO topics VALUES(?, ?, ?, ?, ?, ?, ?)", state.topics.map(t => [t.id, t.kind, t.title, t.createdAt, t.provenance ?? null, t.retainTight === undefined ? null : Number(t.retainTight)]));
      inject("topics", failAt);
      insert("INSERT INTO sources VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)", state.sources.map(s => [s.id, s.url, s.title, s.provenance, s.extractorVersion ?? null, s.operationId ?? null, s.operationDigest ?? null, s.policyVersion ?? null]));
      const vector = db.prepare("INSERT INTO source_vectors VALUES(?, ?, ?, ?, ?)");
      for (const s of state.sources) if (s.embedding !== null) vector.run(s.id, s.embedding.modelId, s.embedding.values.length, JSON.stringify(s.embedding.values), sourceStamp(s));
      inject("sources", failAt);
      insert("INSERT INTO source_topic_links VALUES(?, ?, ?, ?)", state.sourceLinks.map(l => [l.sourceId, l.topicId, l.method]));
      inject("links", failAt);
      insert("INSERT INTO discussions VALUES(?, ?, ?)", state.discussions.map(d => [d.id, d.topicId]));
      inject("discussions", failAt);
      const contribution = db.prepare("INSERT INTO contributions VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const byId = new Map(state.contributions.map((c, ordinal) => [c.id, { c, ordinal }]));
      const pending = new Set(byId.keys());
      while (pending.size) {
        let progress = false;
        for (const id of [...pending]) {
          const { c, ordinal } = byId.get(id);
          if (c.rootId !== null && pending.has(c.rootId)) continue;
          if (c.replyToId !== null && pending.has(c.replyToId)) continue;
          contribution.run(c.id, ordinal, c.discussionId, c.rootId, c.replyToId, c.createdAt,
            c.visibility, Number(c.withdrawn), c.actorType, c.authorId, c.originSourceId ?? null,
            c.insight?.kind ?? null, c.insight?.operatorId ?? null);
          pending.delete(id);
          progress = true;
          if (pending.size === Math.floor(byId.size / 2)) inject("half-contributions", failAt);
        }
        if (!progress) throw new Error("Contribution cycle");
      }
      const anchor = db.prepare("INSERT INTO root_anchors VALUES(?, ?, ?, ?, ?, ?, ?)");
      const revision = db.prepare("INSERT INTO contribution_revisions VALUES(?, ?, ?, ?)");
      for (const c of state.contributions) {
        if (c.rootId === null) anchor.run(c.id, c.anchor.kind, c.anchor.topicId ?? null,
          c.anchor.sourceId ?? null, c.anchor.stamp ?? null, c.originalTopicId, Number(c.learnedOrigin));
        c.revisions.forEach((r, ordinal) => revision.run(c.id, ordinal, r.body, r.createdAt));
      }
      inject("anchors", failAt);
      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations.length || db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("SQLite integrity failure");
      const projected = project(db, true);
      assertValidPersistedState(projected);
      if (!equal(state, projected)) throw new Error("Round-trip mismatch");
      inject("before-commit", failAt);
      db.exec("DROP TABLE demo_state");
      expectObjects(db, normalizedObjects);
      db.exec("COMMIT");
      return { byteLength: Buffer.byteLength(document, "utf8"), counts: counts(projected) };
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

function project(db, withinMigration = false) {
  expectObjects(db, withinMigration ? [...normalizedObjects, "demo_state"] : normalizedObjects);
  if (JSON.stringify(tableDefinitions(db, normalizedObjects)) !== expectedNormalizedDefinition()) {
    throw new Error("Unsupported normalized table definition");
  }
  const meta = db.prepare("SELECT * FROM state_meta").all();
  if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].format !== FORMAT || meta[0].source_schema !== "demo-state/v2") {
    throw new Error("Unsupported normalized schema");
  }
  const rows = name => db.prepare(`SELECT * FROM ${name} ORDER BY ordinal`).all();
  const vectors = new Map(db.prepare("SELECT * FROM source_vectors").all().map(v => [v.source_id, v]));
  const anchors = new Map(db.prepare("SELECT * FROM root_anchors").all().map(a => [a.root_id, a]));
  const revisions = db.prepare("SELECT * FROM contribution_revisions ORDER BY contribution_id, ordinal").all();
  const state = { schema: "demo-state/v2", generation: meta[0].generation, revision: meta[0].revision,
    topics: rows("topics").map(t => ({ id: t.id, kind: t.kind, title: t.title, createdAt: t.created_at,
      ...(t.provenance === null ? {} : { provenance: t.provenance, retainTight: Boolean(t.retain_tight) }) })),
    discussions: rows("discussions").map(d => ({ id: d.id, topicId: d.topic_id })),
    sources: rows("sources").map(s => {
      const v = vectors.get(s.id);
      if (v && (JSON.parse(v.vector_json).length !== v.dimension || v.representation_stamp !== sourceStamp({
        url: s.url, embedding: { modelId: v.model_id, values: JSON.parse(v.vector_json) }, extractorVersion: s.extractor_version ?? undefined
      }))) throw new Error("Vector mismatch");
      return { id: s.id, url: s.url, title: s.title, provenance: s.provenance,
        embedding: v ? { modelId: v.model_id, values: JSON.parse(v.vector_json) } : null,
        ...(s.extractor_version === null ? {} : { extractorVersion: s.extractor_version, operationId: s.operation_id,
          operationDigest: s.operation_digest, policyVersion: s.policy_version }) };
    }),
    sourceLinks: rows("source_topic_links").map(l => ({ sourceId: l.source_id, topicId: l.topic_id, method: l.method })),
    contributions: rows("contributions").map(c => {
      const a = anchors.get(c.id);
      return { id: c.id, discussionId: c.discussion_id, rootId: c.root_id, replyToId: c.reply_to_id,
        authorId: c.author_id, actorType: c.actor_type, visibility: c.visibility, withdrawn: Boolean(c.withdrawn),
        createdAt: c.created_at,
        revisions: revisions.filter(r => r.contribution_id === c.id).map(r => ({ body: r.body, createdAt: r.created_at })),
        ...(c.origin_source_id === null ? {} : { originSourceId: c.origin_source_id }),
        ...(c.insight_kind === null ? {} : { insight: { kind: c.insight_kind, operatorId: c.insight_operator_id } }),
        ...(a ? { anchor: a.kind === "topic" ? { kind: "topic", topicId: a.topic_id } :
          { kind: "source", sourceId: a.source_id, stamp: a.stamp }, originalTopicId: a.original_topic_id,
          learnedOrigin: Boolean(a.learned_origin) } : {}) };
    }) };
  assertValidPersistedState(state);
  return state;
}

function equal(a, b) { return isDeepStrictEqual(a, b); }
function counts(s) { return { topics: s.topics.length, discussions: s.discussions.length, sources: s.sources.length,
  links: s.sourceLinks.length, contributions: s.contributions.length,
  revisions: s.contributions.reduce((n, c) => n + c.revisions.length, 0) }; }

export function readSyntheticDatabase(handle) {
  const db = open(handle.path);
  try { return project(db); } finally { db.close(); }
}

export function readLegacySyntheticDatabase(handle) {
  const db = open(handle.path);
  try { return readLegacy(db); } finally { db.close(); }
}

// Synthetic lifecycle proof only. The production command also replans adaptive
// Topics; this narrow transaction deliberately exercises the storage invariants.
export function forgetSyntheticSource(handle, { sourceId, expectedGeneration, expectedRevision, failAt } = {}) {
  const db = open(handle.path);
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const before = project(db);
      if (before.generation !== expectedGeneration || !Number.isSafeInteger(expectedRevision) ||
          before.revision !== expectedRevision) throw new Error("Stale synthetic version");
      const source = before.sources.find(source => source.id === sourceId);
      if (!source || source.provenance !== LEARNED_SOURCE_PROVENANCE) throw new Error("Synthetic learned Source unavailable");
      const roots = db.prepare(`SELECT a.root_id, d.topic_id FROM root_anchors a
        JOIN contributions c ON c.id=a.root_id JOIN discussions d ON d.id=c.discussion_id
        WHERE a.kind='source' AND a.source_id=?`).all(sourceId);
      const pin = db.prepare(`UPDATE root_anchors SET kind='topic', topic_id=?, source_id=NULL, stamp=NULL WHERE root_id=?`);
      for (const root of roots) pin.run(root.topic_id, root.root_id);
      db.prepare("UPDATE contributions SET origin_source_id=NULL WHERE origin_source_id=?").run(sourceId);
      if (failAt === "after-origins") throw new Error("Injected failure: after-origins");
      db.prepare("DELETE FROM source_topic_links WHERE source_id=?").run(sourceId);
      db.prepare("DELETE FROM source_vectors WHERE source_id=?").run(sourceId);
      db.prepare("DELETE FROM sources WHERE id=?").run(sourceId);
      db.prepare("UPDATE state_meta SET revision=revision+1 WHERE singleton=1").run();
      if (db.prepare("PRAGMA foreign_key_check").all().length ||
          db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("SQLite integrity failure");
      const after = project(db);
      const expected = structuredClone(before);
      expected.revision += 1;
      expected.sources = expected.sources.filter(source => source.id !== sourceId);
      expected.sourceLinks = expected.sourceLinks.filter(link => link.sourceId !== sourceId);
      for (const contribution of expected.contributions) {
        if (contribution.rootId === null && contribution.anchor.kind === "source" && contribution.anchor.sourceId === sourceId) {
          contribution.anchor = { kind: "topic", topicId: expected.discussions.find(d => d.id === contribution.discussionId).topicId };
        }
        if (contribution.originSourceId === sourceId) delete contribution.originSourceId;
      }
      if (!equal(after, expected)) throw new Error("Forget projection mismatch");
      if (failAt === "before-commit") throw new Error("Injected failure: before-commit");
      db.exec("COMMIT");
      return { revision: after.revision, counts: counts(after) };
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}
