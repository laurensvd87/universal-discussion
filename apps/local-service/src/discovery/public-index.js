import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { fail, ServiceError } from "../domain/errors.js";
import { readRecord } from "../domain/validation.js";
import { inspectPageUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

export const DISCOVERY_LIMITS = Object.freeze({ query: 256, tokens: 16, page: 50, snippet: 320, sources: 5 });
const stamp = version => JSON.stringify([version.generation, version.revision]);
const RANKING_VERSION = "best-document-bm25-replies-v1";

// This is a disposable public projection, never the canonical document store.
export function createPublicDiscoveryIndex({ databasePath, repository }) {
  const db = new DatabaseSync(databasePath);
  const streaming = typeof repository.forEachPublicDiscoveryTopic === "function" &&
    typeof repository.readPublicDiscoveryTopic === "function" && typeof repository.subscribeChanges === "function";
  let unsubscribe;
  try {
    const allowed = new Set(["watermark","topics","topics_recent","documents","documents_topic","public_fts",
      "public_fts_data","public_fts_idx","public_fts_docsize","public_fts_config","documents_insert","documents_delete","documents_update"]);
    if (db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().some(row => !allowed.has(row.name)))
      fail("storage-schema", "Discovery requires a separate derived database");
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS watermark (singleton INTEGER PRIMARY KEY CHECK(singleton=1), value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, discussion_id TEXT NOT NULL, title TEXT NOT NULL,
        kind TEXT NOT NULL, visible_count INTEGER NOT NULL, updated_at TEXT NOT NULL, sources TEXT NOT NULL,
        reply_count INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE INDEX IF NOT EXISTS topics_recent ON topics(updated_at DESC, id);
      CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, doc_key TEXT UNIQUE NOT NULL, topic_id TEXT NOT NULL, text TEXT NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS documents_topic ON documents(topic_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS public_fts USING fts5(text, content='documents', content_rowid='id', tokenize='unicode61');
      CREATE TRIGGER IF NOT EXISTS documents_insert AFTER INSERT ON documents BEGIN
        INSERT INTO public_fts(rowid,text) VALUES(new.id,new.text); END;
      CREATE TRIGGER IF NOT EXISTS documents_delete AFTER DELETE ON documents BEGIN
        INSERT INTO public_fts(public_fts,rowid,text) VALUES('delete',old.id,old.text); END;
      CREATE TRIGGER IF NOT EXISTS documents_update AFTER UPDATE ON documents BEGIN
        INSERT INTO public_fts(public_fts,rowid,text) VALUES('delete',old.id,old.text);
        INSERT INTO public_fts(rowid,text) VALUES(new.id,new.text); END;`);
    // The projection is disposable. Older indexes need a canonical rebuild even
    // when their version watermark still matches, to derive accurate reply counts.
    if (!db.prepare("PRAGMA table_info(topics)").all().some(column => column.name === "reply_count")) {
      db.exec("BEGIN IMMEDIATE; ALTER TABLE topics ADD COLUMN reply_count INTEGER NOT NULL DEFAULT 0; DELETE FROM watermark; COMMIT;");
    }
    ensureFresh();
    unsubscribe = streaming ? repository.subscribeChanges(reconcileChanges) : repository.subscribe(state => reconcile(state));
  } catch (error) { db.close(); throw storageError(error); }

  function atomicProjection(version, work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (stamp(repository.version()) !== stamp(version)) fail("unavailable", "Discovery unavailable");
      work();
      if (stamp(repository.version()) !== stamp(version)) fail("unavailable", "Discovery unavailable");
      db.prepare("INSERT INTO watermark VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET value=excluded.value").run(stamp(version));
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw storageError(error); }
  }

  function removeTopic(topicId) {
    db.prepare("DELETE FROM documents WHERE topic_id=?").run(topicId);
    db.prepare("DELETE FROM topics WHERE id=?").run(topicId);
  }

  function saveSelectedTopic(topicId, state) {
    if (!state || !state.topics.some(topic => topic.id === topicId)) { removeTopic(topicId); return; }
    // A canonical closure can contain old/origin Topic metadata. Only this exact
    // selected Topic has a complete discussion and may replace indexed content.
    const projection = publicDocuments(state, topicId);
    saveTopicProjection(topicId, projection);
  }

  function saveTopicProjection(topicId, projection) {
    const existing = new Map(db.prepare("SELECT doc_key,topic_id,text FROM documents WHERE topic_id=?").all(topicId)
      .map(row => [row.doc_key,row]));
    const upsert = db.prepare(`INSERT INTO documents(doc_key,topic_id,text) VALUES(?,?,?)
      ON CONFLICT(doc_key) DO UPDATE SET topic_id=excluded.topic_id,text=excluded.text`);
    for (const doc of projection.documents) {
      const old = existing.get(doc.key);
      if (!old || old.text !== doc.text) upsert.run(doc.key,doc.topicId,doc.text);
      existing.delete(doc.key);
    }
    for (const key of existing.keys()) db.prepare("DELETE FROM documents WHERE doc_key=?").run(key);
    const topic = projection.topics[0];
    db.prepare(`INSERT INTO topics(id,discussion_id,title,kind,visible_count,updated_at,sources,reply_count)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      discussion_id=excluded.discussion_id,title=excluded.title,kind=excluded.kind,
      visible_count=excluded.visible_count,updated_at=excluded.updated_at,sources=excluded.sources,reply_count=excluded.reply_count`)
      .run(topic.id,topic.discussionId,topic.title,topic.kind,topic.visibleCount,topic.updatedAt,JSON.stringify(topic.sources),topic.replyCount);
  }

  function reconcile(state) {
    const version = state ?? repository.version();
    atomicProjection(version, () => {
      db.exec("DELETE FROM documents; DELETE FROM topics;");
      if (streaming) repository.forEachPublicDiscoveryTopic((topicId, selected) => saveSelectedTopic(topicId, selected));
      else {
        const projection = publicDocuments(state);
        const documents = new Map();
        for (const doc of projection.documents) {
          if (!documents.has(doc.topicId)) documents.set(doc.topicId,[]);
          documents.get(doc.topicId).push(doc);
        }
        for (const topic of projection.topics) saveTopicProjection(topic.id,{topics:[topic],documents:documents.get(topic.id) ?? []});
      }
    });
  }

  function reconcileChanges(event) {
    const watermark = db.prepare("SELECT value FROM watermark WHERE singleton=1").get()?.value;
    const predecessor = stamp({generation:event.version.generation,revision:event.version.revision-1});
    if (event.reset || watermark !== predecessor) { reconcile(); return; }
    atomicProjection(event.version, () => {
      const deleted = new Set(event.deletedTopicIds ?? []);
      for (const topicId of deleted) removeTopic(topicId);
      for (const topicId of new Set(event.topicIds ?? [])) {
        if (deleted.has(topicId)) continue;
        let state;
        try { state = repository.readPublicDiscoveryTopic(topicId); }
        catch (error) { if (error?.code !== "not-found") throw error; }
        saveSelectedTopic(topicId,state);
      }
    });
  }

  function ensureFresh() {
    const version = repository.version();
    if (db.prepare("SELECT value FROM watermark WHERE singleton=1").get()?.value !== stamp(version))
      reconcile(streaming ? undefined : repository.load());
    const current = repository.version();
    if (db.prepare("SELECT value FROM watermark WHERE singleton=1").get()?.value !== stamp(current)) fail("unavailable", "Discovery unavailable");
    return current;
  }

  return Object.freeze({
    search(value = {}) {
      const input = searchInput(value);
      try {
        const version = ensureFresh();
        const binding = createHash("sha256").update(JSON.stringify([RANKING_VERSION, stamp(version), input.query, input.limit])).digest("hex");
        const after = cursorPosition(input.cursor, binding);
        const rows = input.terms.length ? db.prepare(`WITH hits AS MATERIALIZED (
          SELECT documents.id AS document_id, documents.topic_id, bm25(public_fts) AS score,
            snippet(public_fts,0,'','',' … ',32) AS excerpt
          FROM public_fts JOIN documents ON documents.id=public_fts.rowid WHERE public_fts MATCH ?
        ), ranked AS (SELECT *, row_number() OVER(PARTITION BY topic_id ORDER BY score,document_id) AS position FROM hits)
        SELECT topics.*,ranked.score,ranked.excerpt FROM ranked JOIN topics ON topics.id=ranked.topic_id
        WHERE ranked.position=1 AND (? IS NULL OR ranked.score>? OR
          (ranked.score=? AND (topics.reply_count<? OR (topics.reply_count=? AND
            (topics.updated_at<? OR (topics.updated_at=? AND topics.id>?))))))
        ORDER BY ranked.score,topics.reply_count DESC,topics.updated_at DESC,topics.id LIMIT ?`).all(
          input.terms.map(term => '"' + term + '"').join(" AND "), after?.id ?? null,
          after?.score ?? 0, after?.score ?? 0, after?.replies ?? 0, after?.replies ?? 0,
          after?.updatedAt ?? "", after?.updatedAt ?? "", after?.id ?? "", input.limit + 1)
          : db.prepare(`SELECT topics.*,0 AS score,coalesce((SELECT substr(text,1,320) FROM documents
            WHERE topic_id=topics.id AND doc_key LIKE 'message:%' ORDER BY id DESC LIMIT 1),title) AS excerpt
            FROM topics WHERE visible_count>0 ${after ? "AND updated_at<=? AND (updated_at<? OR id>?)" : ""}
            ORDER BY updated_at DESC,id LIMIT ?`).all(...(after ? [after.updatedAt,after.updatedAt,after.id] : []),input.limit + 1);
        // Another canonical connection may have changed while SQLite was read.
        if (stamp(repository.version()) !== stamp(version)) fail("conflict", "Discovery changed");
        const page = rows.slice(0,input.limit);
        const last = page.at(-1);
        return { version, query: input.query, results: page.map(row => ({
          topicId: row.id, discussionId: row.discussion_id, title: row.title, kind: row.kind,
          visibleCount: row.visible_count, updatedAt: row.updated_at,
          snippet: row.excerpt.slice(0,DISCOVERY_LIMITS.snippet), sources: JSON.parse(row.sources),
        })), nextCursor: rows.length > input.limit ? Buffer.from(JSON.stringify({ binding,
          score:last.score,replies:last.reply_count,updatedAt:last.updated_at,id:last.id })).toString("base64url") : null };
      } catch (error) { throw storageError(error); }
    },
    close() { unsubscribe?.(); db.close(); },
  });
}

function searchInput(value) {
  const input = readRecord(value, ["query","limit","cursor"], []);
  const query = input.query === undefined ? "" : input.query;
  const limit = input.limit === undefined ? 20 : input.limit;
  if (typeof query !== "string" || query.length > DISCOVERY_LIMITS.query || /[\p{Cc}\p{Cf}]/u.test(query) ||
      !Number.isInteger(limit) || limit < 1 || limit > DISCOVERY_LIMITS.page) fail("invalid", "Invalid discovery query");
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length > DISCOVERY_LIMITS.tokens || (query.trim() && terms.length === 0)) fail("invalid", "Invalid discovery query");
  return { query: query.trim(), terms, limit, cursor: input.cursor ?? null };
}

function cursorPosition(cursor, binding) {
  if (cursor === null) return null;
  if (typeof cursor !== "string" || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) fail("invalid", "Invalid discovery cursor");
  let value;
  try { value = JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")); }
  catch { fail("invalid", "Invalid discovery cursor"); }
  const data = readRecord(value,["binding","score","replies","updatedAt","id"]);
  if (typeof data.score !== "number" || !Number.isFinite(data.score) || data.score > 0 ||
      !Number.isSafeInteger(data.replies) || data.replies < 0 || typeof data.binding !== "string" ||
      typeof data.updatedAt !== "string" || !data.updatedAt || data.updatedAt.length > 64 ||
      typeof data.id !== "string" || !data.id || data.id.length > 128 ||
      /[\p{Cc}\p{Cf}]/u.test(data.updatedAt + data.id)) fail("invalid", "Invalid discovery cursor");
  if (data.binding !== binding) fail("conflict", "Discovery changed");
  return data;
}

function publicDocuments(state, selectedTopicId) {
  const documents = [];
  const topics = [];
  const byDiscussion = new Map();
  for (const entry of state.contributions) {
    if (entry.visibility !== "local-public" || entry.withdrawn || !entry.revisions.length) continue;
    if (!byDiscussion.has(entry.discussionId)) byDiscussion.set(entry.discussionId,[]);
    byDiscussion.get(entry.discussionId).push(entry);
  }
  const discussions = new Map(state.discussions.map(entry => [entry.topicId,entry.id]));
  const sources = new Map(state.sources.filter(source => inspectPageUrl(source.url).supported).map(source => [source.id,source]));
  const links = new Map();
  for (const link of state.sourceLinks) {
    const source = sources.get(link.sourceId);
    if (!source) continue;
    if (!links.has(link.topicId)) links.set(link.topicId,[]);
    links.get(link.topicId).push(source);
  }
  for (const topic of state.topics) {
    if (selectedTopicId !== undefined && topic.id !== selectedTopicId) continue;
    const discussionId = discussions.get(topic.id);
    const visible = byDiscussion.get(discussionId) ?? [];
    const linked = (links.get(topic.id) ?? []).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    let updatedAt = topic.createdAt;
    documents.push({ key: `topic:${topic.id}`, topicId: topic.id, text: topic.title });
    for (const source of linked) documents.push({ key: `source:${source.id}`, topicId: topic.id, text: `${source.title}\n${source.url}` });
    for (const entry of visible) {
      const revision = entry.revisions.at(-1);
      if (revision.createdAt > updatedAt) updatedAt = revision.createdAt;
      documents.push({ key: `message:${entry.id}`, topicId: topic.id, text: revision.body });
    }
    topics.push({ ...topic, discussionId, visibleCount: visible.length,
      replyCount: visible.filter(entry => entry.rootId != null).length, updatedAt,
      sources: linked.slice(0,DISCOVERY_LIMITS.sources).map(({id,title,url}) => ({id,title,url})) });
  }
  return { topics, documents };
}

function storageError(error) {
  return error instanceof ServiceError ? error : new ServiceError("unavailable", "Discovery unavailable");
}
