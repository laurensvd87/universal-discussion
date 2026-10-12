import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { ServiceError, fail } from "../domain/errors.js";
import { assertValidLegacyPersistedState, assertValidPersistedState } from "../domain/persisted-state.js";
import { migrateLegacyState } from "../domain/state-migration.js";
import { assertExpected, MAX_DOCUMENT_BYTES } from "../domain/repository-contract.js";
import { ACCOUNT_STATE_SCHEMA } from "../accounts/account-principal.js";
import { frozenClone, readId, readExpectedVersion, readRecord, readText } from "../domain/validation.js";
import { normalizeMyChatsQuery } from "../application/account-public-chats.js";
import { inspectPageUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

export const NORMALIZED_STORAGE_FORMAT = "canonical-relational/v1";

// Read-only aggregate consumers share the exact storage schema contract without
// opening a repository that loads catalog payloads or embedding vectors.
export function assertNormalizedCatalogSchema(database) {
  validateSchema(database.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all());
}

const FORMAT = NORMALIZED_STORAGE_FORMAT;
const COLLECTIONS = {
  topics: ["canonical_topics", "id"], discussions: ["canonical_discussions", "id"],
  sources: ["canonical_sources", "id"], sourceLinks: ["canonical_source_links", "sourceId"],
  contributions: ["canonical_contributions", "id"],
};
const DDL = [
  "CREATE TABLE canonical_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format TEXT NOT NULL, schema TEXT NOT NULL, generation TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0)) STRICT",
  "CREATE TABLE canonical_id_registry(id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('topics','discussions','sources','contributions'))) STRICT",
  "CREATE TABLE canonical_topics(id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, payload TEXT NOT NULL) STRICT",
  "CREATE TABLE canonical_discussions(id TEXT PRIMARY KEY, topic_id TEXT NOT NULL UNIQUE REFERENCES canonical_topics(id) DEFERRABLE INITIALLY DEFERRED, ordinal INTEGER NOT NULL UNIQUE, payload TEXT NOT NULL) STRICT",
  "CREATE TABLE canonical_sources(id TEXT PRIMARY KEY, url TEXT NOT NULL, provenance TEXT NOT NULL, operation_id TEXT, has_embedding INTEGER NOT NULL CHECK(has_embedding IN(0,1)), ordinal INTEGER NOT NULL UNIQUE, payload TEXT NOT NULL) STRICT",
  "CREATE INDEX canonical_sources_url ON canonical_sources(url)",
  "CREATE INDEX canonical_sources_operation ON canonical_sources(operation_id)",
  "CREATE TABLE canonical_embeddings(source_id TEXT PRIMARY KEY REFERENCES canonical_sources(id) DEFERRABLE INITIALLY DEFERRED, model_id TEXT NOT NULL, payload TEXT NOT NULL) STRICT",
  "CREATE INDEX canonical_embeddings_model ON canonical_embeddings(model_id,source_id)",
  "CREATE TABLE canonical_source_links(source_id TEXT PRIMARY KEY REFERENCES canonical_sources(id) DEFERRABLE INITIALLY DEFERRED, topic_id TEXT NOT NULL REFERENCES canonical_topics(id) DEFERRABLE INITIALLY DEFERRED, ordinal INTEGER NOT NULL UNIQUE, payload TEXT NOT NULL) STRICT",
  "CREATE INDEX canonical_links_topic ON canonical_source_links(topic_id,source_id)",
  "CREATE TABLE canonical_contributions(id TEXT PRIMARY KEY, discussion_id TEXT NOT NULL REFERENCES canonical_discussions(id) DEFERRABLE INITIALLY DEFERRED, root_id TEXT REFERENCES canonical_contributions(id) DEFERRABLE INITIALLY DEFERRED, reply_to_id TEXT REFERENCES canonical_contributions(id) DEFERRABLE INITIALLY DEFERRED, author_id TEXT, operator_id TEXT, origin_source_id TEXT REFERENCES canonical_sources(id) DEFERRABLE INITIALLY DEFERRED, anchor_source_id TEXT REFERENCES canonical_sources(id) DEFERRABLE INITIALLY DEFERRED, created_at TEXT NOT NULL, revision_count INTEGER NOT NULL CHECK(revision_count>=0), ordinal INTEGER NOT NULL UNIQUE, payload TEXT NOT NULL) STRICT",
  "CREATE INDEX canonical_contributions_discussion ON canonical_contributions(discussion_id,created_at,id)",
  "CREATE INDEX canonical_contributions_root ON canonical_contributions(root_id,created_at,id)",
  "CREATE INDEX canonical_contributions_origin ON canonical_contributions(origin_source_id,id)",
  "CREATE INDEX canonical_contributions_anchor ON canonical_contributions(anchor_source_id,id)",
  "CREATE INDEX canonical_contributions_author ON canonical_contributions(author_id,id)",
  "CREATE INDEX canonical_contributions_operator ON canonical_contributions(operator_id,id)",
  "CREATE TABLE canonical_revisions(contribution_id TEXT NOT NULL REFERENCES canonical_contributions(id) DEFERRABLE INITIALLY DEFERRED, ordinal INTEGER NOT NULL CHECK(ordinal>=0), payload TEXT NOT NULL, PRIMARY KEY(contribution_id,ordinal)) STRICT",
  "CREATE TABLE canonical_operation_receipts(source_id TEXT PRIMARY KEY REFERENCES canonical_sources(id) DEFERRABLE INITIALLY DEFERRED, operation_id TEXT NOT NULL, operation_digest TEXT NOT NULL) STRICT",
  "CREATE INDEX canonical_receipts_operation ON canonical_operation_receipts(operation_id,source_id)",
];
const EXPECTED_OBJECTS = DDL.map(sql => ({ name: sql.match(/^CREATE (?:TABLE|INDEX) ([^( ]+)/u)[1], type: sql.startsWith("CREATE TABLE") ? "table" : "index", sql }));

// Opening this adapter is an explicit migration operation. The legacy table is
// removed only after validated row import, inside the same atomic transaction.
export function createNormalizedSqliteRepository(databasePath, initialState, options = {}) {
  let database;
  const readOnly = options.readOnly === true;
  const listeners = new Set();
  const changeListeners = new Set();
  const serialize = options.serialize ?? JSON.stringify;
  let resettingIds = false;
  const validate = state => {
    assertValidPersistedState(state, { largeScale: true });
    const ids = new Set();
    for (const name of ["topics", "discussions", "sources", "contributions"]) for (const value of state[name]) {
      if (ids.has(value.id)) throw new TypeError("Invalid canonical identity");
      ids.add(value.id);
    }
    return state;
  };
  function encoded(value) {
    const result = serialize(value);
    if (typeof result !== "string") fail("storage-failure", "Local storage failed");
    const decoded = JSON.parse(result);
    if (!isDeepStrictEqual(decoded, value)) fail("storage-failure", "Local storage failed");
    return result;
  }
  function transaction(work) {
    if (readOnly) fail("storage-read-only", "Local storage is read-only");
    let active = false;
    try {
      database.exec("BEGIN IMMEDIATE"); active = true;
      const result = work(); database.exec("COMMIT"); active = false;
      return result;
    } catch (error) {
      if (active) { try { database.exec("ROLLBACK"); } catch { /* Keep original failure. */ } }
      throw storageError(error);
    }
  }
  function metadata() {
    const row = database.prepare("SELECT * FROM canonical_meta WHERE singleton=1").get();
    if (!row || row.format !== FORMAT || !["demo-state/v2", ACCOUNT_STATE_SCHEMA].includes(row.schema)) fail("storage-schema", "Unsupported local database schema");
    try { readExpectedVersion({ generation: row.generation, revision: row.revision }); } catch { fail("storage-corrupt", "Local database is inconsistent"); }
    return { schema: row.schema, generation: row.generation, revision: row.revision };
  }
  function sources(rows) {
    return rows.map(row => {
      const value = decoded(row.payload);
      const embedding = database.prepare("SELECT payload FROM canonical_embeddings WHERE source_id=?").get(row.id);
      value.embedding = embedding ? decoded(embedding.payload) : null;
      verifyIndexed("sources", row, value);
      if (embedding && decoded(embedding.payload).modelId !== database.prepare("SELECT model_id FROM canonical_embeddings WHERE source_id=?").get(row.id).model_id) fail("storage-corrupt", "Local database is inconsistent");
      const receipt = database.prepare("SELECT operation_id,operation_digest FROM canonical_operation_receipts WHERE source_id=?").get(row.id);
      if (Object.hasOwn(value, "operationId") ? !receipt || receipt.operation_id !== value.operationId || receipt.operation_digest !== value.operationDigest : receipt !== undefined) fail("storage-corrupt", "Local database is inconsistent");
      return value;
    });
  }
  function contributions(rows) {
    return rows.map(row => {
      const revisions = database.prepare("SELECT ordinal,payload FROM canonical_revisions WHERE contribution_id=? ORDER BY ordinal").all(row.id);
      if (revisions.some((item, index) => item.ordinal !== index)) fail("storage-corrupt", "Local database is inconsistent");
      const value = { ...decoded(row.payload), revisions: revisions.map(item => decoded(item.payload)) };
      verifyIndexed("contributions", row, value); return value;
    });
  }
  // My chats reads only the current revision of bounded selected messages.
  // Export/command reads retain their separate complete-revision semantics.
  function currentContribution(row) {
    const value = decoded(row.payload);
    verifyIndexed("contributions", row, { ...value, revisions: { length: row.revision_count } });
    const latest = database.prepare("SELECT payload FROM canonical_revisions WHERE contribution_id=? AND ordinal=?")
      .get(row.id, row.revision_count - 1);
    if (value.withdrawn ? row.revision_count !== 0 || latest : !latest) fail("storage-corrupt", "Local database is inconsistent");
    return { ...value, revisions: latest ? [decoded(latest.payload)] : [] };
  }
  const ownedPublic = `SELECT COALESCE(root_id,id) AS root_id,1 AS human,0 AS agent
    FROM canonical_contributions INDEXED BY canonical_contributions_author WHERE author_id=?
      AND json_extract(payload,'$.actorType')='human' AND json_extract(payload,'$.withdrawn')=0
      AND json_extract(payload,'$.visibility')='local-public'
    UNION ALL SELECT COALESCE(root_id,id),0,1
    FROM canonical_contributions INDEXED BY canonical_contributions_operator WHERE operator_id=?
      AND json_extract(payload,'$.actorType')='agent' AND json_extract(payload,'$.withdrawn')=0
      AND json_extract(payload,'$.visibility')='local-public'`;
  function publicChatHeader(actorId, rootId, ownership) {
    // The owner-index mirror is an optimization, never independent authority.
    // Verify bounded concrete witnesses for both types before accepting a root.
    for (const [kind,column] of [["human","author_id"],["agent","operator_id"]]) {
      if (!ownership[kind]) continue;
      const witness=database.prepare(`SELECT * FROM canonical_contributions WHERE ${column}=? AND COALESCE(root_id,id)=?
        AND json_extract(payload,'$.actorType')=? AND json_extract(payload,'$.withdrawn')=0
        AND json_extract(payload,'$.visibility')='local-public' ORDER BY id LIMIT 1`).get(actorId,rootId,kind);
      if (!witness) fail("storage-corrupt","Local database is inconsistent");
      const entry=decoded(witness.payload);
      verifyIndexed("contributions",witness,{...entry,revisions:{length:witness.revision_count}});
      if (kind === "human" ? entry.authorId !== actorId : entry.insight?.operatorId !== actorId) fail("storage-corrupt","Local database is inconsistent");
    }
    const row = database.prepare("SELECT * FROM canonical_contributions WHERE id=? AND root_id IS NULL").get(rootId);
    if (!row) fail("not-found", "Object unavailable");
    const root = currentContribution(row);
    const discussionRow = database.prepare("SELECT * FROM canonical_discussions WHERE id=?").get(root.discussionId);
    const topicRow = discussionRow && database.prepare("SELECT * FROM canonical_topics WHERE id=?").get(discussionRow.topic_id);
    if (!discussionRow || !topicRow) fail("storage-corrupt", "Local database is inconsistent");
    const topic = decoded(topicRow.payload), discussion = decoded(discussionRow.payload);
    verifyIndexed("topics", topicRow, topic); verifyIndexed("discussions", discussionRow, discussion);
    // Recency uses surviving current revisions; erased historical text is never read.
    const updated = database.prepare(`SELECT MAX(COALESCE(json_extract(v.payload,'$.createdAt'),c.created_at)) AS updated
      FROM canonical_contributions c LEFT JOIN canonical_revisions v ON v.contribution_id=c.id AND v.ordinal=c.revision_count-1
      WHERE c.id=? OR c.root_id=?`).get(rootId,rootId).updated;
    return { root, topic, ownedHuman: Boolean(ownership.human), ownedAgent: Boolean(ownership.agent), updatedAt: updated ?? root.createdAt };
  }
  function publicSources(entries) {
    return [...new Set(entries.filter(entry => !entry.withdrawn && entry.originSourceId).map(entry => entry.originSourceId))].map(id => {
      const row = database.prepare("SELECT id,url,payload FROM canonical_sources WHERE id=?").get(id);
      if (!row) fail("storage-corrupt", "Local database is inconsistent");
      const source = decoded(row.payload);
      if (source.id !== row.id || source.url !== row.url) fail("storage-corrupt", "Local database is inconsistent");
      return { id: source.id, url: source.url };
    });
  }
  function stateFromQueries(queries = {}) {
    const state = { ...metadata() };
    for (const [name, [table]] of Object.entries(COLLECTIONS)) {
      const rows = queries[name] ?? database.prepare(`SELECT * FROM ${table} ORDER BY ordinal`).all();
      state[name] = name === "sources" ? sources(rows) : name === "contributions" ? contributions(rows) : rows.map(row => { const value = decoded(row.payload); verifyIndexed(name, row, value); return value; });
    }
    return state;
  }
  function readState() { const state = stateFromQueries(); try { validate(state); } catch { fail("storage-corrupt", "Local database is inconsistent"); } verifyRows(state); return state; }
  function catalogState() {
    const state = stateFromQueries({ contributions: [] });
    try { validate(state); } catch { fail("storage-corrupt", "Local database is inconsistent"); }
    verifyRows(state);
    // Verify contribution identity reservations through their covering ID index;
    // dashboard reads never select contribution payloads or revision bodies.
    if (database.prepare("SELECT c.id FROM canonical_contributions c LEFT JOIN canonical_id_registry r ON r.id=c.id WHERE r.kind IS NULL OR r.kind!='contributions' LIMIT 1").get()) fail("storage-corrupt", "Local database is inconsistent");
    return state;
  }
  function verifyRows(state) {
    for (const [name, [table, key]] of Object.entries(COLLECTIONS)) {
      for (const value of state[name]) {
        const row = database.prepare(`SELECT * FROM ${table} WHERE ${name === "sourceLinks" ? "source_id" : "id"}=?`).get(value[key]);
        const expected = columnsFor(name, value);
        if (!row || Object.entries(expected).some(([column, wanted]) => row[column] !== wanted)) fail("storage-corrupt", "Local database is inconsistent");
        if (name !== "sourceLinks") {
          const reserved = database.prepare("SELECT kind FROM canonical_id_registry WHERE id=?").get(value.id);
          if (reserved?.kind !== name) fail("storage-corrupt", "Local database is inconsistent");
        }
      }
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length) fail("storage-corrupt", "Local database is inconsistent");
    const receipts = database.prepare("SELECT * FROM canonical_operation_receipts ORDER BY source_id").all();
    const wantedReceipts = new Map(state.sources.filter(source => source.operationId !== undefined).map(source => [source.id, source]));
    if (receipts.length !== wantedReceipts.size || receipts.some(row => { const source = wantedReceipts.get(row.source_id); return !source || source.operationId !== row.operation_id || source.operationDigest !== row.operation_digest; })) fail("storage-corrupt", "Local database is inconsistent");
  }
  function writeEntity(name, value, ordinal) {
    const [table] = COLLECTIONS[name];
    if (name !== "sourceLinks" && !resettingIds) {
      const reservation = database.prepare("SELECT kind FROM canonical_id_registry WHERE id=?").get(value.id);
      const existing = database.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(value.id);
      if (reservation && (reservation.kind !== name || !existing)) fail("conflict", "Identifier already used");
      if (!reservation) {
        if (existing) fail("storage-corrupt", "Local database is inconsistent");
        database.prepare("INSERT INTO canonical_id_registry VALUES(?,?)").run(value.id, name);
      }
    }
    const fields = columnsFor(name, value);
    const payload = { ...value };
    if (name === "sources") delete payload.embedding;
    if (name === "contributions") delete payload.revisions;
    const columns = [...Object.keys(fields), "ordinal", "payload"];
    const primary = name === "sourceLinks" ? "source_id" : "id";
    database.prepare(`INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(${primary}) DO UPDATE SET ${columns.filter(column => column !== primary).map(column => `${column}=excluded.${column}`).join(",")}`).run(...Object.values(fields), ordinal, encoded(payload));
    if (name === "sources") {
      const oldEmbedding = database.prepare("SELECT payload FROM canonical_embeddings WHERE source_id=?").get(value.id);
      const embeddingText = value.embedding === null ? null : encoded(value.embedding);
      if (oldEmbedding?.payload !== embeddingText) {
        if (embeddingText === null) database.prepare("DELETE FROM canonical_embeddings WHERE source_id=?").run(value.id);
        else database.prepare("INSERT INTO canonical_embeddings VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET model_id=excluded.model_id,payload=excluded.payload").run(value.id, value.embedding.modelId, embeddingText);
      }
      if (Object.hasOwn(value, "operationId")) database.prepare("INSERT INTO canonical_operation_receipts VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET operation_id=excluded.operation_id,operation_digest=excluded.operation_digest").run(value.id, value.operationId, value.operationDigest);
      else database.prepare("DELETE FROM canonical_operation_receipts WHERE source_id=?").run(value.id);
    }
    if (name === "contributions") {
      const previous = database.prepare("SELECT ordinal,payload FROM canonical_revisions WHERE contribution_id=? ORDER BY ordinal").all(value.id);
      for (let index = 0; index < value.revisions.length; index += 1) {
        const revision = encoded(value.revisions[index]);
        if (previous[index]?.payload !== revision) database.prepare("INSERT INTO canonical_revisions VALUES(?,?,?) ON CONFLICT(contribution_id,ordinal) DO UPDATE SET payload=excluded.payload").run(value.id, index, revision);
      }
      database.prepare("DELETE FROM canonical_revisions WHERE contribution_id=? AND ordinal>=?").run(value.id, value.revisions.length);
    }
  }
  function removeEntity(name, id) {
    if (name === "sources") {
      database.prepare("DELETE FROM canonical_embeddings WHERE source_id=?").run(id);
      database.prepare("DELETE FROM canonical_operation_receipts WHERE source_id=?").run(id);
    }
    if (name === "contributions") database.prepare("DELETE FROM canonical_revisions WHERE contribution_id=?").run(id);
    database.prepare(`DELETE FROM ${COLLECTIONS[name][0]} WHERE ${name === "sourceLinks" ? "source_id" : "id"}=?`).run(id);
  }
  function difference(before, after) {
    for (const [name, [, key]] of Object.entries(COLLECTIONS)) {
      const old = new Map(before[name].map((entry, index) => [entry[key], { entry, index }]));
      const next = new Map(after[name].map((entry, index) => [entry[key], { entry, index }]));
      for (const id of old.keys()) if (!next.has(id)) removeEntity(name, id);
      // Free moved ordinal slots before reusing them, without touching payloads.
      for (const [id, item] of old) if (next.has(id) && next.get(id).index !== item.index)
        database.prepare(`UPDATE ${COLLECTIONS[name][0]} SET ordinal=? WHERE ${name === "sourceLinks" ? "source_id" : "id"}=?`).run(-item.index - 1, id);
      for (const [id, { entry, index }] of next) {
        const previous = old.get(id);
        if (!previous || previous.index !== index || !isDeepStrictEqual(previous.entry, entry)) writeEntity(name, entry, index);
      }
    }
  }
  function publish(state) { for (const listener of listeners) { try { listener(frozenClone(state)); } catch { /* Disposable derived indexes fail closed at their watermark. */ } } }
  function publishChanges(before, after, reset = false) {
    const topicIds = new Set();
    const topicByDiscussion = new Map([...before.discussions, ...after.discussions].map(discussion => [discussion.id, discussion.topicId]));
    const links = [...before.sourceLinks, ...after.sourceLinks];
    for (const [name, [, key]] of Object.entries(COLLECTIONS)) {
      const old = new Map(before[name].map(value => [value[key], value]));
      const next = new Map(after[name].map(value => [value[key], value]));
      for (const id of new Set([...old.keys(), ...next.keys()])) {
        if (isDeepStrictEqual(old.get(id), next.get(id))) continue;
        const values = [old.get(id), next.get(id)].filter(Boolean);
        for (const value of values) {
          if (name === "topics") topicIds.add(value.id);
          if (name === "discussions" || name === "sourceLinks") topicIds.add(value.topicId);
          if (name === "contributions") topicIds.add(topicByDiscussion.get(value.discussionId));
          if (name === "sources") {
            for (const link of links) if (link.sourceId === value.id) topicIds.add(link.topicId);
            for (const entry of [...before.contributions, ...after.contributions]) if (entry.originSourceId === value.id) topicIds.add(topicByDiscussion.get(entry.discussionId));
          }
        }
      }
    }
    const deletedTopicIds = before.topics.filter(topic => !after.topics.some(next => next.id === topic.id)).map(topic => topic.id);
    const event = frozenClone({ version: { generation: after.generation, revision: after.revision }, topicIds: [...topicIds].filter(Boolean), deletedTopicIds, reset });
    for (const listener of changeListeners) { try { listener(event); } catch { /* Derived watermark stays stale. */ } }
  }
  function write(expected, next, reset) {
    let before;
    transaction(() => {
      const current = readState(); assertExpected(current, expected); validate(next); transition(current, next, reset);
      before = current;
      if (reset) database.exec("DELETE FROM canonical_id_registry");
      resettingIds = reset;
      try { difference(current, next); } finally { resettingIds = false; }
      if (reset) for (const name of ["topics", "discussions", "sources", "contributions"]) for (const value of next[name]) database.prepare("INSERT INTO canonical_id_registry VALUES(?,?)").run(value.id, name);
      database.prepare("UPDATE canonical_meta SET schema=?,generation=?,revision=? WHERE singleton=1").run(next.schema, next.generation, next.revision);
      options.beforeCommit?.();
    });
    publish(next); publishChanges(before, next, reset); return frozenClone(next);
  }
  try {
    const snapshot = options.snapshotBytes;
    if (snapshot !== undefined && (databasePath !== ":memory:" || !readOnly || !(snapshot instanceof Uint8Array) || snapshot.length < 100 || snapshot.length > 256 * 1024 * 1024 || typeof DatabaseSync.prototype.deserialize !== "function")) fail("storage-schema", "Invalid canonical memory snapshot");
    if (readOnly && snapshot === undefined && (databasePath === ":memory:" || !existsSync(databasePath))) fail("storage-schema", "Existing canonical database required");
    // Inspect an existing file through a read-only handle before changing its
    // journal mode. Declining migration must not checkpoint a legacy WAL.
    if (!readOnly && databasePath !== ":memory:" && existsSync(databasePath) && options.allowLegacyMigration !== true) {
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      try {
        if (inspection.prepare("SELECT 1 FROM sqlite_master WHERE name='demo_state' AND type='table'").get()) fail("storage-migration-required", "Explicit canonical migration required");
      } finally { inspection.close(); }
    }
    database = new DatabaseSync(databasePath, { readOnly: snapshot === undefined && readOnly });
    if (snapshot !== undefined) {
      database.deserialize(snapshot);
      database.exec("PRAGMA query_only=ON");
    }
    try {
      const results = database.prepare("PRAGMA quick_check").all();
      if (results.length !== 1 || results[0].quick_check !== "ok") fail("storage-corrupt", "Local database is inconsistent");
    } catch { fail("storage-corrupt", "Local database is inconsistent"); }
    if (readOnly) {
      if(options.expectedLegacyState !== undefined) fail("conflict", "Canonical migration source changed");
      validateSchema(database.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all());
      checkedRead(() => catalogState());
    } else {
      // A fenced cutover must not checkpoint/change the source journal before
      // the expected legacy state is compared under its write transaction.
      if(options.expectedLegacyState === undefined) database.exec("PRAGMA journal_mode=DELETE");
      database.exec("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
      transaction(() => {
        const objects = database.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
        const legacy = objects.find(object => object.name === "demo_state");
        if (objects.some(object => object.name === "canonical_meta")) {
          if (options.expectedLegacyState !== undefined) fail("conflict", "Canonical migration source changed");
          validateSchema(objects); readState(); return;
        }
        let seed = initialState;
        if (objects.length) {
          if (objects.length !== 1 || legacy?.type !== "table") fail("storage-schema", "Unsupported local database schema");
          if (options.allowLegacyMigration !== true) fail("storage-migration-required", "Explicit canonical migration required");
          if (database.prepare("PRAGMA table_info(demo_state)").all().map(column => column.name).join(",") !== "singleton,schema,generation,revision,document") fail("storage-schema", "Unsupported local database schema");
          const rows = database.prepare("SELECT * FROM demo_state").all();
          if (rows.length !== 1 || rows[0].singleton !== 1) fail("storage-corrupt", "Local database is inconsistent");
          const row = rows[0];
          if (!["demo-state/v1", "demo-state/v2", ACCOUNT_STATE_SCHEMA].includes(row.schema)) fail("storage-schema", "Unsupported local database schema");
          if (typeof row.document !== "string" || Buffer.byteLength(row.document) > MAX_DOCUMENT_BYTES) fail("storage-corrupt", "Local database is oversized");
          seed = decoded(row.document);
          if (!seed || seed.schema !== row.schema || seed.generation !== row.generation || seed.revision !== row.revision) fail("storage-corrupt", "Local database is inconsistent");
          try {
            if (row.schema === "demo-state/v1") assertValidLegacyPersistedState(seed);
            else validate(seed);
          } catch { fail("storage-corrupt", "Local database is inconsistent"); }
          // Trusted cutover proof belongs inside the same write transaction as
          // the import, before any DDL and before a possible v1 transformation.
          if (options.expectedLegacyState !== undefined && !isDeepStrictEqual(seed,options.expectedLegacyState)) fail("conflict", "Canonical migration source changed");
          if (row.schema === "demo-state/v1") { seed=migrateLegacyState(seed); validate(seed); }
        } else {
          if(options.expectedLegacyState !== undefined) fail("conflict", "Canonical migration source changed");
          validate(seed);
        }
        for (const ddl of DDL) database.exec(ddl);
        database.prepare("INSERT INTO canonical_meta VALUES(1,?,?,?,?)").run(FORMAT, seed.schema, seed.generation, seed.revision);
        for (const [name] of Object.entries(COLLECTIONS)) seed[name].forEach((value, index) => writeEntity(name, value, index));
        options.beforeCommit?.();
        if (!isDeepStrictEqual(readState(), seed)) fail("storage-corrupt", "Canonical migration verification failed");
        if (legacy) database.exec("DROP TABLE demo_state");
      });
    }
  } catch (error) { database?.close(); throw storageError(error); }

  function checkedRead(work, expected = null) {
    try {
      database.exec("BEGIN");
      const meta = metadata(); if (expected !== null) assertExpected(meta, expected);
      const result = work(meta); database.exec("COMMIT"); return frozenClone(result);
    } catch (error) { try { database.exec("ROLLBACK"); } catch { /* Keep error. */ } throw storageError(error); }
  }
  function paging({ after = null, limit = 100, expectedVersion = null } = {}) {
    if (after !== null) readId(after);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) fail("invalid", "Invalid request");
    return { after, limit, expectedVersion };
  }
  function paged(name, input = {}) {
    const { after, limit, expectedVersion } = paging(input);
    return checkedRead(meta => {
      const rows = after === null ? database.prepare(`SELECT * FROM ${COLLECTIONS[name][0]} ORDER BY id LIMIT ?`).all(limit + 1)
        : database.prepare(`SELECT * FROM ${COLLECTIONS[name][0]} WHERE id>? ORDER BY id LIMIT ?`).all(after, limit + 1);
      const items = rows.slice(0, limit);
      return { version: { generation: meta.generation, revision: meta.revision }, items: name === "sources" ? sources(items) : items.map(row => { const value = decoded(row.payload); verifyIndexed(name, row, value); return value; }), nextCursor: rows.length > limit ? items.at(-1).id : null };
    }, expectedVersion);
  }
  function topicState(topicId, contributionRows = null) {
    const selectedTopic = database.prepare("SELECT * FROM canonical_topics WHERE id=?").get(topicId);
    const selectedDiscussion = database.prepare("SELECT * FROM canonical_discussions WHERE topic_id=?").get(topicId);
    if (!selectedTopic || !selectedDiscussion) fail("not-found", "Object unavailable");
    const messageRows = contributionRows ?? database.prepare("SELECT * FROM canonical_contributions WHERE discussion_id=? ORDER BY ordinal").all(selectedDiscussion.id);
    const sourceRows = database.prepare(`SELECT DISTINCT s.* FROM canonical_sources s WHERE s.id IN (SELECT source_id FROM canonical_source_links WHERE topic_id=?)
      OR s.id IN (SELECT origin_source_id FROM canonical_contributions WHERE discussion_id=? AND origin_source_id IS NOT NULL) ORDER BY s.ordinal`).all(topicId, selectedDiscussion.id);
    const links = new Map(); const topics = new Map([[selectedTopic.id, selectedTopic]]); const discussions = new Map([[selectedDiscussion.id, selectedDiscussion]]);
    for (const source of sourceRows) {
      const link = database.prepare("SELECT * FROM canonical_source_links WHERE source_id=?").get(source.id);
      if (!link) continue;
      links.set(link.source_id, link);
      const topic = database.prepare("SELECT * FROM canonical_topics WHERE id=?").get(link.topic_id);
      const discussion = database.prepare("SELECT * FROM canonical_discussions WHERE topic_id=?").get(link.topic_id);
      if (!topic || !discussion) fail("storage-corrupt", "Local database is inconsistent");
      topics.set(topic.id, topic); discussions.set(discussion.id, discussion);
    }
    const state = stateFromQueries({ topics: [...topics.values()].sort(byOrdinal), discussions: [...discussions.values()].sort(byOrdinal), sources: sourceRows, sourceLinks: [...links.values()].sort(byOrdinal), contributions: messageRows });
    validate(state); return state;
  }
  function verifiedSourceLink(sourceId) {
    const row = database.prepare("SELECT * FROM canonical_source_links WHERE source_id=?").get(sourceId);
    if (row) verifyIndexed("sourceLinks", row, decoded(row.payload));
    return row;
  }
  function closureState({ sourceIds = [], topicIds = [], contributionRows = [] }) {
    const topics = new Map(); const discussions = new Map(); const sourceRows = new Map(); const links = new Map();
    const addTopic = topicId => {
      if (topics.has(topicId)) return;
      const topic = database.prepare("SELECT * FROM canonical_topics WHERE id=?").get(topicId);
      const discussion = database.prepare("SELECT * FROM canonical_discussions WHERE topic_id=?").get(topicId);
      if (!topic || !discussion) fail("not-found", "Object unavailable");
      topics.set(topic.id, topic); discussions.set(discussion.id, discussion);
    };
    const addSource = sourceId => {
      if (sourceRows.has(sourceId)) return;
      const source = database.prepare("SELECT * FROM canonical_sources WHERE id=?").get(sourceId);
      if (!source) fail("not-found", "Object unavailable");
      sourceRows.set(source.id, source);
      const link = database.prepare("SELECT * FROM canonical_source_links WHERE source_id=?").get(sourceId);
      if (link) { links.set(link.source_id, link); addTopic(link.topic_id); }
    };
    topicIds.forEach(addTopic); sourceIds.forEach(addSource);
    for (const row of contributionRows) {
      const discussion = database.prepare("SELECT * FROM canonical_discussions WHERE id=?").get(row.discussion_id);
      if (!discussion) fail("storage-corrupt", "Local database is inconsistent");
      addTopic(discussion.topic_id);
      if (row.origin_source_id !== null) addSource(row.origin_source_id);
      if (row.anchor_source_id !== null) addSource(row.anchor_source_id);
    }
    const state = stateFromQueries({ topics: [...topics.values()].sort(byOrdinal), discussions: [...discussions.values()].sort(byOrdinal), sources: [...sourceRows.values()].sort(byOrdinal), sourceLinks: [...links.values()].sort(byOrdinal), contributions: contributionRows });
    validate(state); return state;
  }
  function scopedWrite(expected, before, after) {
    transaction(() => {
      const current = metadata(); assertExpected(current, expected); assertExpected(before, expected);
      if (before.schema !== current.schema) fail("conflict", "State changed");
      validate(before); validate(after); transition(before, after, false);
      const modifiedDiscussions = new Set(); const modifiedSources = new Set();
      for (const [name, [table, key]] of Object.entries(COLLECTIONS)) {
        const old = new Map(before[name].map(value => [value[key], value]));
        const next = new Map(after[name].map(value => [value[key], value]));
        for (const [id, value] of old) {
          const row = database.prepare(`SELECT * FROM ${table} WHERE ${name === "sourceLinks" ? "source_id" : "id"}=?`).get(id);
          if (!row) fail("conflict", "State changed");
          const actual = name === "sources" ? sources([row])[0] : name === "contributions" ? contributions([row])[0] : decoded(row.payload);
          verifyIndexed(name, row, actual);
          if (!isDeepStrictEqual(actual, value)) fail("conflict", "State changed");
          if (!isDeepStrictEqual(value, next.get(id))) {
            if (name === "contributions") { modifiedDiscussions.add(value.discussionId); if (next.has(id)) modifiedDiscussions.add(next.get(id).discussionId); }
            if (name === "discussions") modifiedDiscussions.add(id);
            if (name === "sources") modifiedSources.add(id);
            if (name === "sourceLinks") modifiedSources.add(id);
          }
        }
        for (const [id, value] of next) if (!old.has(id)) {
          if (name !== "sourceLinks") {
            if (database.prepare("SELECT 1 FROM canonical_id_registry WHERE id=?").get(id)) fail("conflict", "Identifier already used");
            for (const [other, [, otherKey]] of Object.entries(COLLECTIONS)) if (other !== name && other !== "sourceLinks" && after[other].some(entry => entry[otherKey] === id)) fail("conflict", "Identifier collision");
            for (const [other, [otherTable]] of Object.entries(COLLECTIONS)) if (other !== "sourceLinks" && database.prepare(`SELECT 1 FROM ${otherTable} WHERE id=?`).get(id)) fail("conflict", "Identifier collision");
          } else if (database.prepare("SELECT 1 FROM canonical_source_links WHERE source_id=?").get(id)) fail("conflict", "State changed");
          if (name === "contributions") modifiedDiscussions.add(value.discussionId);
          if (name === "sourceLinks") modifiedSources.add(id);
        }
      }
      // The closure must contain every message of a modified discussion. This
      // prevents omitted children from surviving a root move or withdrawal.
      const oldContributionIds = new Set(before.contributions.map(value => value.id));
      for (const discussionId of modifiedDiscussions) {
        if (database.prepare("SELECT id FROM canonical_contributions WHERE discussion_id=?").all(discussionId).some(row => !oldContributionIds.has(row.id))) fail("conflict", "Incomplete canonical scope");
      }
      for (const sourceId of modifiedSources) {
        if (database.prepare("SELECT id FROM canonical_contributions WHERE anchor_source_id=? OR origin_source_id=?").all(sourceId, sourceId).some(row => !oldContributionIds.has(row.id))) fail("conflict", "Incomplete canonical scope");
      }
      for (const [name, [table, key]] of Object.entries(COLLECTIONS)) {
        const old = new Map(before[name].map(value => [value[key], value]));
        const next = new Map(after[name].map(value => [value[key], value]));
        for (const id of old.keys()) if (!next.has(id)) removeEntity(name, id);
        let ordinal = database.prepare(`SELECT COALESCE(max(ordinal),-1)+1 AS next FROM ${table}`).get().next;
        for (const [id, value] of next) {
          const previous = old.get(id);
          if (!previous || !isDeepStrictEqual(previous, value)) {
            const existing = previous ? database.prepare(`SELECT ordinal FROM ${table} WHERE ${name === "sourceLinks" ? "source_id" : "id"}=?`).get(id) : null;
            writeEntity(name, value, existing?.ordinal ?? ordinal++);
          }
        }
      }
      database.prepare("UPDATE canonical_meta SET schema=?,revision=? WHERE singleton=1").run(after.schema, after.revision);
      options.beforeCommit?.();
    });
    // Legacy whole-snapshot consumers are reconciled only when subscribed.
    if (listeners.size) { try { publish(readState()); } catch { /* Accepted canonical commit remains accepted. */ } }
    publishChanges(before, after);
    return frozenClone(after);
  }
  return Object.freeze({
    version() { try { const { generation, revision } = metadata(); return { generation, revision }; } catch (error) { throw storageError(error); } },
    load() { return checkedRead(() => readState()); },
    readCatalogSnapshot() { return checkedRead(() => catalogState()); },
    save(expected, next) { return write(expected, next, false); },
    saveScoped(expected, before, after) { return scopedWrite(expected, before, after); },
    replace(expected, next) { return write(expected, next, true); },
    subscribe(listener) { if (typeof listener !== "function") fail("invalid", "Invalid request"); listeners.add(listener); return () => listeners.delete(listener); },
    subscribeChanges(listener) { if (typeof listener !== "function") fail("invalid", "Invalid request"); changeListeners.add(listener); return () => changeListeners.delete(listener); },
    listTopics(input) { return paged("topics", input); },
    listSources(input) { return paged("sources", input); },
    readCatalogPage({ kind = "topics", ...input } = {}) { if (!["topics", "sources"].includes(kind)) fail("invalid", "Invalid request"); return paged(kind, input); },
    readEmbeddingPage(input = {}) {
      const { after, limit, expectedVersion } = paging(input);
      return checkedRead(meta => {
        const rows = after === null ? database.prepare("SELECT s.* FROM canonical_sources s JOIN canonical_embeddings e ON e.source_id=s.id ORDER BY s.id LIMIT ?").all(limit + 1)
          : database.prepare("SELECT s.* FROM canonical_sources s JOIN canonical_embeddings e ON e.source_id=s.id WHERE s.id>? ORDER BY s.id LIMIT ?").all(after, limit + 1);
        return { version: { generation: meta.generation, revision: meta.revision }, items: sources(rows.slice(0, limit)), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
      }, expectedVersion);
    },
    readTopicState(topicId) { readId(topicId); return checkedRead(() => topicState(topicId)); },
    readContributionPage(topicId, { after = null, limit = 100, expectedVersion = null } = {}) {
      readId(topicId);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("invalid", "Invalid request");
      let cursor = null;
      if (after !== null) {
        const value = readRecord(after, ["createdAt", "id"]);
        cursor = { createdAt: readText(value.createdAt, 64), id: readId(value.id) };
      }
      return checkedRead(meta => {
        const topicRow = database.prepare("SELECT * FROM canonical_topics WHERE id=?").get(topicId);
        const discussionRow = database.prepare("SELECT * FROM canonical_discussions WHERE topic_id=?").get(topicId);
        if (!topicRow || !discussionRow) fail("not-found", "Object unavailable");
        const topic = decoded(topicRow.payload); const discussion = decoded(discussionRow.payload);
        verifyIndexed("topics", topicRow, topic); verifyIndexed("discussions", discussionRow, discussion);
        if (discussion.topicId !== topicId) fail("storage-corrupt", "Local database is inconsistent");
        const rows = cursor === null ? database.prepare("SELECT * FROM canonical_contributions WHERE discussion_id=? ORDER BY created_at,id LIMIT ?").all(discussion.id, limit + 1)
          : database.prepare("SELECT * FROM canonical_contributions WHERE discussion_id=? AND (created_at,id)>(?,?) ORDER BY created_at,id LIMIT ?").all(discussion.id, cursor.createdAt, cursor.id, limit + 1);
        const selected = rows.slice(0, limit);
        return { version: { generation: meta.generation, revision: meta.revision }, topic, discussionId: discussion.id, items: contributions(selected),
          nextCursor: rows.length > limit ? { createdAt: selected.at(-1).created_at, id: selected.at(-1).id } : null };
      }, expectedVersion);
    },
    readSourceState(sourceId) { readId(sourceId); return checkedRead(() => { const link = verifiedSourceLink(sourceId); if (!link) fail("not-found", "Object unavailable"); return topicState(link.topic_id); }); },
    readMetadataScope({ sourceIds = [], topicIds = [], expectedVersion = null } = {}) {
      if (!Array.isArray(sourceIds) || !Array.isArray(topicIds) || sourceIds.length > 500 || topicIds.length > 500) fail("invalid", "Invalid request");
      sourceIds.forEach(readId); topicIds.forEach(readId);
      return checkedRead(() => closureState({ sourceIds, topicIds }), expectedVersion);
    },
    readTopicSources(topicId, input = {}) {
      readId(topicId); const { after, limit, expectedVersion } = paging({ limit: 100, ...input });
      if (limit > 100) fail("invalid", "Invalid request");
      return checkedRead(meta => {
        if (!database.prepare("SELECT 1 FROM canonical_topics WHERE id=?").get(topicId)) fail("not-found", "Object unavailable");
        const rows = after === null ? database.prepare("SELECT s.* FROM canonical_source_links l JOIN canonical_sources s ON s.id=l.source_id WHERE l.topic_id=? ORDER BY l.source_id LIMIT ?").all(topicId, limit + 1)
          : database.prepare("SELECT s.* FROM canonical_source_links l JOIN canonical_sources s ON s.id=l.source_id WHERE l.topic_id=? AND l.source_id>? ORDER BY l.source_id LIMIT ?").all(topicId, after, limit + 1);
        for (const row of rows) { const link = verifiedSourceLink(row.id); if (link?.topic_id !== topicId) fail("storage-corrupt", "Local database is inconsistent"); }
        return { version: { generation: meta.generation, revision: meta.revision }, items: sources(rows.slice(0, limit)), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
      }, expectedVersion);
    },
    readPriorSourceState(sourceId) {
      readId(sourceId); return checkedRead(() => {
        const roots = database.prepare("SELECT id FROM canonical_contributions WHERE origin_source_id=? AND root_id IS NULL ORDER BY ordinal").all(sourceId);
        const rows = new Map();
        for (const root of roots) for (const row of database.prepare("SELECT * FROM canonical_contributions WHERE id=? OR root_id=? ORDER BY ordinal").all(root.id, root.id)) rows.set(row.id, row);
        return closureState({ sourceIds: [sourceId], contributionRows: [...rows.values()].sort(byOrdinal) });
      });
    },
    readContributionState(id) {
      readId(id); return checkedRead(() => {
        const row = database.prepare("SELECT * FROM canonical_contributions WHERE id=?").get(id);
        if (!row) fail("not-found", "Object unavailable");
        const rootId = row.root_id ?? row.id;
        return closureState({ contributionRows: database.prepare("SELECT * FROM canonical_contributions WHERE id=? OR root_id=? ORDER BY ordinal").all(rootId, rootId) });
      });
    },
    readPublicDiscoveryTopic(topicId) { readId(topicId); return checkedRead(() => topicState(topicId)); },
    forEachPublicDiscoveryTopic(visitor) {
      if (typeof visitor !== "function") fail("invalid", "Invalid request");
      return checkedRead(() => { for (const row of database.prepare("SELECT id FROM canonical_topics ORDER BY ordinal").iterate()) visitor(row.id, topicState(row.id)); });
    },
    exactSource(id) { readId(id); return checkedRead(() => sources(database.prepare("SELECT * FROM canonical_sources WHERE id=?").all(id))[0] ?? null); },
    readContribution(id) { readId(id); return checkedRead(() => contributions(database.prepare("SELECT * FROM canonical_contributions WHERE id=?").all(id))[0] ?? null); },
    readSource(id) { readId(id); return checkedRead(() => sources(database.prepare("SELECT * FROM canonical_sources WHERE id=?").all(id))[0] ?? null); },
    readOperation(operationId) { readId(operationId); return checkedRead(() => sources(database.prepare("SELECT s.* FROM canonical_sources s JOIN canonical_operation_receipts r ON r.source_id=s.id WHERE r.operation_id=? ORDER BY s.ordinal LIMIT 1").all(operationId))[0] ?? null); },
    readThread(rootId) { readId(rootId); return checkedRead(() => contributions(database.prepare("SELECT * FROM canonical_contributions WHERE id=? OR root_id=? ORDER BY ordinal").all(rootId, rootId))); },
    accountContributions(actorId) { readId(actorId); return checkedRead(() => contributions(database.prepare("SELECT * FROM canonical_contributions WHERE author_id=? OR operator_id=? ORDER BY ordinal").all(actorId, actorId))); },
    readAccountPublicChats(actorId, input = {}) {
      readId(actorId); const { after = null, limit = 25, expectedVersion = null } = input;
      const query=Object.hasOwn(input,"query") ? normalizeMyChatsQuery(input.query):"";
      // Only URL metadata enters this policy callback; text matching stays in SQL.
      database.function("my_chats_safe_source", {deterministic:true}, value=> {
        const inspected=inspectPageUrl(value);return inspected.supported && inspected.url===value ? 1:0;
      });
      const terms=query ? query.split(" "):[];
      const search=terms.map(()=>`(instr(lower(json_extract(t.payload,'$.title')),lower(?))>0 OR
        (json_extract(r.payload,'$.withdrawn')=0 AND my_chats_safe_source(s.url)=1 AND instr(lower(json_extract(s.payload,'$.title')),lower(?))>0) OR
        EXISTS (SELECT 1 FROM canonical_contributions m JOIN canonical_revisions v
          ON v.contribution_id=m.id AND v.ordinal=m.revision_count-1
          WHERE (m.id=o.root_id OR m.root_id=o.root_id) AND json_extract(m.payload,'$.withdrawn')=0
          AND json_extract(m.payload,'$.visibility')='local-public' AND instr(lower(json_extract(v.payload,'$.body')),lower(?))>0))`).join(" AND ");
      if (!Number.isInteger(limit) || limit<1 || limit>100) fail("invalid","Invalid request");
      if (after !== null) { const cursor=readRecord(after,["updatedAt","id"]); readText(cursor.updatedAt,64); readId(cursor.id); }
      return checkedRead(meta => {
        const roots = database.prepare(`WITH owned_roots AS (
          SELECT root_id,MAX(human) AS human,MAX(agent) AS agent FROM (${ownedPublic}) GROUP BY root_id
        ), active_roots AS (
          SELECT o.*,(SELECT MAX(COALESCE(json_extract(v.payload,'$.createdAt'),c.created_at))
            FROM canonical_contributions c LEFT JOIN canonical_revisions v ON v.contribution_id=c.id AND v.ordinal=c.revision_count-1
            WHERE c.id=o.root_id OR c.root_id=o.root_id) AS updated_at FROM owned_roots o
        ) SELECT o.* FROM active_roots o JOIN canonical_contributions r ON r.id=o.root_id
          JOIN canonical_discussions d ON d.id=r.discussion_id JOIN canonical_topics t ON t.id=d.topic_id
          LEFT JOIN canonical_sources s ON s.id=r.origin_source_id
          WHERE (? IS NULL OR (updated_at,o.root_id)<(?,?)) ${search?`AND ${search}`:""}
          ORDER BY updated_at DESC,o.root_id DESC LIMIT ?`).all(actorId,actorId,after?.id??null,after?.updatedAt??null,after?.id??null,...terms.flatMap(term=>[term,term,term]),limit+1);
        const items = roots.slice(0,limit).map(row => publicChatHeader(actorId,row.root_id,row));
        return { version: { generation: meta.generation, revision: meta.revision }, items,
          sources: publicSources(items.map(item => item.root)), next: roots.length>limit ? {updatedAt:items.at(-1).updatedAt,id:items.at(-1).root.id} : null };
      },expectedVersion);
    },
    readAccountPublicChat(actorId, rootId, { after = null, limit = 25, expectedVersion = null } = {}) {
      readId(actorId); readId(rootId);
      if (!Number.isInteger(limit) || limit<1 || limit>100) fail("invalid","Invalid request");
      if (after !== null) { const cursor=readRecord(after,["createdAt","id"]); after={createdAt:readText(cursor.createdAt,64),id:readId(cursor.id)}; }
      return checkedRead(meta => {
        const owner = database.prepare(`SELECT MAX(human) AS human,MAX(agent) AS agent FROM (${ownedPublic}) WHERE root_id=?`)
          .get(actorId,actorId,rootId);
        if (!owner.human && !owner.agent) fail("not-found","Object unavailable");
        const conversation=publicChatHeader(actorId,rootId,owner);
        // Keep exactly the visible messages and their necessary deleted ancestors.
        // Recursive work contains IDs only, not complete bodies/history in RAM.
        const rows=database.prepare(`WITH RECURSIVE retained(id,parent) AS (
          SELECT id,COALESCE(reply_to_id,root_id) FROM canonical_contributions
            WHERE (id=? OR root_id=?) AND json_extract(payload,'$.withdrawn')=0
          UNION SELECT c.id,COALESCE(c.reply_to_id,c.root_id) FROM canonical_contributions c JOIN retained r ON c.id=r.parent
        ) SELECT c.* FROM canonical_contributions c JOIN (SELECT DISTINCT id FROM retained) r ON r.id=c.id
          WHERE (? IS NULL OR (c.created_at,c.id)>(?,?)) ORDER BY c.created_at,c.id LIMIT ?`)
          .all(rootId,rootId,after?.id??null,after?.createdAt??null,after?.id??null,limit+1);
        const items=rows.slice(0,limit).map(currentContribution);
        return { version:{generation:meta.generation,revision:meta.revision},conversation,items,
          sources:publicSources([conversation.root,...items]),next:rows.length>limit ? {createdAt:items.at(-1).createdAt,id:items.at(-1).id}:null };
      },expectedVersion);
    },
    counts() { return checkedRead(() => Object.fromEntries(Object.entries(COLLECTIONS).map(([name, [table]]) => [name, database.prepare(`SELECT count(*) AS total FROM ${table}`).get().total]))); },
    close() { database.close(); },
  });
}

function decoded(value) { try { return JSON.parse(value); } catch { fail("storage-corrupt", "Local database is unreadable"); } }
function byOrdinal(left, right) { return left.ordinal - right.ordinal; }
function verifyIndexed(name, row, value) {
  if (!Number.isSafeInteger(row.ordinal) || row.ordinal < 0) fail("storage-corrupt", "Local database is inconsistent");
  if (Object.entries(columnsFor(name, value)).some(([key, expected]) => row[key] !== expected)) fail("storage-corrupt", "Local database is inconsistent");
}
function columnsFor(name, value) {
  if (name === "topics") return { id: value.id };
  if (name === "discussions") return { id: value.id, topic_id: value.topicId };
  if (name === "sources") return { id: value.id, url: value.url, provenance: value.provenance, operation_id: value.operationId ?? null, has_embedding: value.embedding === null ? 0 : 1 };
  if (name === "sourceLinks") return { source_id: value.sourceId, topic_id: value.topicId };
  return { id: value.id, discussion_id: value.discussionId, root_id: value.rootId, reply_to_id: value.replyToId, author_id: value.authorId, operator_id: value.insight?.operatorId ?? null, origin_source_id: value.originSourceId ?? null, anchor_source_id: value.anchor?.kind === "source" ? value.anchor.sourceId : null, created_at: value.createdAt, revision_count: value.revisions.length };
}
function transition(current, next, reset) {
  if (current.schema === ACCOUNT_STATE_SCHEMA && next.schema !== ACCOUNT_STATE_SCHEMA && !reset) fail("conflict", "Account state cannot be downgraded");
  if (reset ? next.generation === current.generation || next.revision !== 0 : next.generation !== current.generation || next.revision !== current.revision + 1) fail("conflict", "Invalid successor version");
  if (!reset) {
    const previous = new Map(current.contributions.map(value => [value.id, value]));
    for (const root of next.contributions.filter(value => value.rootId === null)) {
      const old = previous.get(root.id);
      if (old && (old.originalTopicId !== root.originalTopicId || old.learnedOrigin !== root.learnedOrigin)) fail("conflict", "Original publication context changed");
    }
  }
}
function validateSchema(objects) {
  const actual = objects;
  if (actual.length !== EXPECTED_OBJECTS.length || EXPECTED_OBJECTS.some(expected => !actual.some(value => value.name === expected.name && value.type === expected.type && value.sql === expected.sql))) fail("storage-schema", "Unsupported local database schema");
}
function storageError(error) { return error instanceof ServiceError ? error : new ServiceError("storage-failure", "Local storage failed"); }
