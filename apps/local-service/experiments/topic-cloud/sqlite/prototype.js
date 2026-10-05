import { lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

const DB_NAME = 'topic-cloud-synthetic.sqlite';

function checkedPath(databasePath, create) {
  if (typeof databasePath !== 'string') throw new TypeError('A synthetic temporary database path is required');
  const resolved = resolve(databasePath);
  const directory = realpathSync(dirname(resolved));
  const temporaryRoot = realpathSync(tmpdir());
  const withinTemporaryRoot = relative(temporaryRoot, directory);
  if (withinTemporaryRoot.startsWith('..') || resolve(temporaryRoot, withinTemporaryRoot) !== directory ||
      !basename(directory).startsWith('topic-cloud-synthetic-') || basename(resolved) !== DB_NAME) {
    throw new Error('Only a topic-cloud-synthetic-* directory inside the OS temp directory is allowed');
  }
  let entry;
  try { entry = lstatSync(resolved); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (create && entry) throw new Error('Database already exists');
  if (!create && !entry) throw new Error('Database does not exist');
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) throw new Error('Synthetic database must be a regular file');
  return resolved;
}

function textId(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new TypeError(`${label} must be a short nonempty string`);
  return value;
}

function order(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('order must be a nonnegative safe integer');
  return value;
}

function transact(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* Keep original error. */ }
    throw error;
  }
}

export function openSyntheticCloud(databasePath, { create = false } = {}) {
  const path = checkedPath(databasePath, create);
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;');
    if (create) transact(db, () => db.exec(SCHEMA_SQL));
    const version = db.prepare('SELECT version FROM schema_meta WHERE singleton = 1').get()?.version;
    if (version !== SCHEMA_VERSION) throw new Error('Unsupported synthetic schema');
  } catch (error) { db.close(); throw error; }

  const insertSource = db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?)');
  const insertVector = db.prepare('INSERT INTO vectors VALUES (?, ?, ?, ?, ?)');
  const upsertEdge = db.prepare(`INSERT INTO scored_edges VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_a, source_b) DO UPDATE SET score=excluded.score,
      scorer_stamp=excluded.scorer_stamp, evidence_kind=excluded.evidence_kind`);
  const insertDiscussion = db.prepare('INSERT INTO discussions VALUES (?, ?, ?, ?)');
  const insertContribution = db.prepare('INSERT INTO contributions VALUES (?, ?, ?, ?, ?, ?, ?)');
  const parent = db.prepare('SELECT discussion_id, COALESCE(root_id, contribution_id) AS root_id FROM contributions WHERE contribution_id = ?');
  const fromA = db.prepare('SELECT source_b AS source_id, score, scorer_stamp, evidence_kind FROM scored_edges WHERE source_a = ? ORDER BY score DESC, source_b LIMIT ?');
  const fromB = db.prepare('SELECT source_a AS source_id, score, scorer_stamp, evidence_kind FROM scored_edges WHERE source_b = ? ORDER BY score DESC, source_a LIMIT ?');

  return Object.freeze({
    transaction(action) { return transact(db, action); },
    addSource({ id, url, title, createdOrder }) {
      insertSource.run(textId(id, 'source id'), textId(url, 'URL'), textId(title, 'title'), order(createdOrder));
    },
    addVector({ sourceId, modelStamp, values, updatedOrder }) {
      if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isFinite)) throw new TypeError('finite vector required');
      insertVector.run(textId(sourceId, 'source id'), textId(modelStamp, 'model stamp'), values.length, JSON.stringify(values), order(updatedOrder));
    },
    putEdge({ a, b, score, scorerStamp, evidenceKind = 'vector' }) {
      if (!Number.isFinite(score)) throw new TypeError('finite score required');
      const [lo, hi] = [textId(a, 'source a'), textId(b, 'source b')].sort();
      upsertEdge.run(lo, hi, score, textId(scorerStamp, 'scorer stamp'), evidenceKind);
    },
    removeEdge(a, b) {
      const [lo, hi] = [a, b].sort();
      return db.prepare('DELETE FROM scored_edges WHERE source_a = ? AND source_b = ?').run(lo, hi).changes;
    },
    neighbors(sourceId, limit = 8) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RangeError('neighbor limit must be 1..50');
      return [...fromA.all(sourceId, limit), ...fromB.all(sourceId, limit)]
        .sort((a, b) => b.score - a.score || a.source_id.localeCompare(b.source_id)).slice(0, limit);
    },
    sourcePage(afterOrder = -1, limit = 25) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('page limit must be 1..100');
      return db.prepare('SELECT * FROM sources WHERE created_order > ? ORDER BY created_order, source_id LIMIT ?').all(afterOrder, limit);
    },
    addDiscussion({ id, anchorSourceId, focusLabel, createdOrder }) {
      insertDiscussion.run(textId(id, 'discussion id'), textId(anchorSourceId, 'source id'), textId(focusLabel, 'focus'), order(createdOrder));
    },
    addRoot({ id, discussionId, originSourceId = null, body, createdOrder }) {
      insertContribution.run(textId(id, 'root id'), textId(discussionId, 'discussion id'), null, null,
        originSourceId, textId(body, 'body'), order(createdOrder));
    },
    addReply({ id, parentId, discussionId, originSourceId = null, body, createdOrder }) {
      const target = parent.get(textId(parentId, 'parent id'));
      if (!target || target.discussion_id !== discussionId) throw new Error('Reply parent belongs to a different discussion');
      insertContribution.run(textId(id, 'reply id'), textId(discussionId, 'discussion id'), parentId,
        target.root_id, originSourceId, textId(body, 'body'), order(createdOrder));
    },
    discussion(id) {
      return {
        identity: db.prepare('SELECT * FROM discussions WHERE discussion_id = ?').get(id),
        contributions: db.prepare('SELECT * FROM contributions WHERE discussion_id = ? ORDER BY created_order').all(id),
      };
    },
    counts() {
      return Object.fromEntries(['sources', 'vectors', 'scored_edges', 'discussions', 'contributions']
        .map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
    },
    integrity() { return db.prepare('PRAGMA integrity_check').get().integrity_check; },
    close() { db.close(); },
  });
}

export { DB_NAME };
