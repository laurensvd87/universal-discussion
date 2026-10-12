import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { types } from "node:util";
import { assertNormalizedCatalogSchema, NORMALIZED_STORAGE_FORMAT } from "../adapters/normalized-sqlite-repository.js";
import { readExpectedVersion, readRecord } from "../domain/validation.js";
import { MAX_DOCUMENT_BYTES } from "../domain/repository-contract.js";

export const CATALOG_GROWTH_INTERVAL_MS = 60_000;
export const CATALOG_GROWTH_FILENAME = "topic-growth.sqlite";
export const CATALOG_GROWTH_RETENTION = Object.freeze({ minuteHours: 24, hourlyDays: 90, maxPoints: 4096 });
const PROVENANCE = "owner-local-page-embedding/v1";
const SCHEMA = "catalog-growth/v1";
const COUNTERS = ["totalSources", "learnedPages", "activeTopics", "totalTopics"];
const HISTORY_DDL = `CREATE TABLE catalog_growth(
  series_id TEXT NOT NULL, bucket INTEGER NOT NULL, at INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=0), total_sources INTEGER NOT NULL CHECK(total_sources>=0),
  learned_pages INTEGER NOT NULL CHECK(learned_pages>=0), active_topics INTEGER NOT NULL CHECK(active_topics>=0),
  total_topics INTEGER NOT NULL CHECK(total_topics>=0), PRIMARY KEY(series_id,bucket)) STRICT`;
const normalizeSQL = value => value.replace(/\s+/gu, " ").trim();
const fail = () => { throw new Error("Catalog growth unavailable"); };

// Refuse links at every path component, including SQLite's possible sidecars.
// Paths are trusted local composition input, never request input.
function safePath(filename, { optional = false } = {}) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) fail();
  const resolved = path.resolve(filename);
  let current = path.parse(resolved).root;
  const parts = resolved.slice(current.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (optional && index === parts.length - 1 && error.code === "ENOENT") break;
      fail();
    }
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) fail();
  }
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    try { const stat = lstatSync(resolved + suffix); if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) fail(); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return resolved;
}
function epoch(now) {
  const date = new Date(typeof now === "function" ? now() : now);
  const value = date.getTime();
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
}
function validPoint(value) {
  if (!value || typeof value.seriesId !== "string" || !/^[a-f0-9]{64}$/u.test(value.seriesId) ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      typeof value.at !== "string" || new Date(value.at).toISOString() !== value.at ||
      COUNTERS.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0) ||
      value.learnedPages > value.totalSources || value.activeTopics > value.totalTopics || value.activeTopics > value.learnedPages) fail();
  return value;
}
function dto(points) { return { schemaVersion: SCHEMA, points, retention: { ...CATALOG_GROWTH_RETENTION } }; }
export function validateCatalogGrowthHistory(value) {
  try {
    if (types.isProxy(value)) fail();
    const history = readRecord(value, ["schemaVersion", "points", "retention"]);
    if (history.schemaVersion !== SCHEMA || types.isProxy(history.retention) || types.isProxy(history.points)) fail();
    const retention = readRecord(history.retention, Object.keys(CATALOG_GROWTH_RETENTION));
    if (Object.entries(CATALOG_GROWTH_RETENTION).some(([key, expected]) => retention[key] !== expected) ||
        !Array.isArray(history.points) || history.points.length > CATALOG_GROWTH_RETENTION.maxPoints) fail();
    const descriptors = Object.getOwnPropertyDescriptors(history.points);
    if (Reflect.ownKeys(descriptors).length !== history.points.length + 1) fail();
    let lastAt = -1;
    const revisions = new Map();
    return dto(Array.from({ length: history.points.length }, (_, index) => {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || types.isProxy(descriptor.value)) fail();
      const candidate = readRecord(descriptor.value, ["at", "seriesId", "revision", ...COUNTERS]);
      validPoint(candidate);
      const at = epoch(candidate.at);
      if (at < lastAt || candidate.revision < (revisions.get(candidate.seriesId) ?? -1)) fail();
      lastAt = at; revisions.set(candidate.seriesId, candidate.revision);
      return { at: candidate.at, seriesId: candidate.seriesId, revision: candidate.revision,
        ...Object.fromEntries(COUNTERS.map(key => [key, candidate[key]])) };
    }));
  } catch { fail(); }
}
function point(row) {
  return validPoint({ at: new Date(row.at).toISOString(), seriesId: row.series_id, revision: row.revision,
    totalSources: row.total_sources, learnedPages: row.learned_pages, activeTopics: row.active_topics, totalTopics: row.total_topics });
}
function integrity(database) {
  const results = database.prepare("PRAGMA quick_check").all();
  if (results.length !== 1 || results[0].quick_check !== "ok") fail();
}

// A single read transaction pins metadata, schema and all aggregate counts. No
// normalized payload, vector, contribution, revision or account row is selected.
export function readCatalogGrowthCounts(databasePath, { now = () => new Date() } = {}) {
  const filename = safePath(databasePath);
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    database.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN");
    const objects = database.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    let row;
    if (objects.some(value => value.name === "canonical_meta" && value.type === "table")) {
      assertNormalizedCatalogSchema(database);
      if (database.prepare("SELECT COUNT(*) AS n FROM canonical_meta").get().n !== 1 ||
          database.prepare(`SELECT 1 FROM canonical_source_links l LEFT JOIN canonical_sources s ON s.id=l.source_id
            LEFT JOIN canonical_topics t ON t.id=l.topic_id WHERE s.id IS NULL OR t.id IS NULL LIMIT 1`).get()) fail();
      row = database.prepare(`SELECT format,schema,generation,revision,
        (SELECT COUNT(*) FROM canonical_sources) AS totalSources,
        (SELECT COUNT(*) FROM canonical_sources WHERE provenance=?) AS learnedPages,
        (SELECT COUNT(DISTINCT l.topic_id) FROM canonical_source_links l
          JOIN canonical_sources s ON s.id=l.source_id JOIN canonical_topics t ON t.id=l.topic_id
          WHERE s.provenance=?) AS activeTopics,
        (SELECT COUNT(*) FROM canonical_topics) AS totalTopics FROM canonical_meta WHERE singleton=1`).get(PROVENANCE, PROVENANCE);
      if (!row || row.format !== NORMALIZED_STORAGE_FORMAT) fail();
    } else {
      if (objects.length !== 1 || objects[0].name !== "demo_state" || objects[0].type !== "table" ||
          database.prepare("PRAGMA table_info(demo_state)").all().map(value => value.name).join(",") !== "singleton,schema,generation,revision,document" ||
          database.prepare("SELECT COUNT(*) AS n FROM demo_state").get().n !== 1) fail();
      // SQLite parses the bounded legacy document internally; no document or
      // contribution body crosses into the sampler. Only counters leave SQLite.
      const metadata = database.prepare(`SELECT schema,generation,revision,length(CAST(document AS BLOB)) AS bytes,
        json_valid(document) AS valid FROM demo_state WHERE singleton=1`).get();
      if (!metadata || metadata.bytes > MAX_DOCUMENT_BYTES || metadata.valid !== 1) fail();
      row = database.prepare(`SELECT schema,generation,revision,
        json_extract(document,'$.schema') AS innerSchema,json_extract(document,'$.generation') AS innerGeneration,
        json_extract(document,'$.revision') AS innerRevision,
        json_type(document,'$.sources') AS sourcesType,json_type(document,'$.topics') AS topicsType,
        json_type(document,'$.sourceLinks') AS linksType,
        (SELECT COUNT(*) FROM json_each(document,'$.sources')) AS totalSources,
        (SELECT COUNT(*) FROM json_each(document,'$.sources') WHERE json_extract(value,'$.provenance')=?) AS learnedPages,
        (SELECT COUNT(DISTINCT json_extract(l.value,'$.topicId')) FROM json_each(document,'$.sourceLinks') l
          JOIN json_each(document,'$.sources') s ON json_extract(s.value,'$.id')=json_extract(l.value,'$.sourceId')
          JOIN json_each(document,'$.topics') t ON json_extract(t.value,'$.id')=json_extract(l.value,'$.topicId')
          WHERE json_extract(s.value,'$.provenance')=?) AS activeTopics,
        (SELECT COUNT(*) FROM json_each(document,'$.topics')) AS totalTopics FROM demo_state WHERE singleton=1`).get(PROVENANCE, PROVENANCE);
      if (!row || row.innerSchema !== row.schema || row.innerGeneration !== row.generation || row.innerRevision !== row.revision ||
          row.sourcesType !== "array" || row.topicsType !== "array" || row.linksType !== "array") fail();
    }
    if (!["demo-state/v2", "demo-state/v3"].includes(row.schema)) fail();
    readExpectedVersion({ generation: row.generation, revision: row.revision });
    const result = validPoint({ at: new Date(epoch(now)).toISOString(),
      seriesId: createHash("sha256").update(row.generation, "utf8").digest("hex"), revision: row.revision,
      ...Object.fromEntries(COUNTERS.map(key => [key, row[key]])) });
    database.exec("COMMIT");
    return result;
  } finally { database.close(); }
}

function checkHistory(database) {
  integrity(database);
  const objects = database.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
  if (objects.length !== 1 || objects[0].name !== "catalog_growth" || objects[0].type !== "table" ||
      normalizeSQL(objects[0].sql) !== normalizeSQL(HISTORY_DDL)) fail();
  const rows = database.prepare("SELECT * FROM catalog_growth LIMIT ?").all(CATALOG_GROWTH_RETENTION.maxPoints + 1);
  if (rows.length > CATALOG_GROWTH_RETENTION.maxPoints) fail();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.bucket) || row.bucket !== Math.floor(row.at / CATALOG_GROWTH_INTERVAL_MS) || row.at < 0) fail();
    point(row);
  }
}
function readHistory(database, { limit = CATALOG_GROWTH_RETENTION.maxPoints, now = () => new Date() } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > CATALOG_GROWTH_RETENTION.maxPoints) fail();
  return validateCatalogGrowthHistory(dto(database.prepare("SELECT * FROM catalog_growth WHERE at>=? ORDER BY at DESC,series_id DESC LIMIT ?")
    .all(epoch(now) - 90 * 86_400_000, limit).reverse().map(point)));
}
function pruneHistory(database, current) {
  database.prepare("DELETE FROM catalog_growth WHERE at<?").run(current - 90 * 86_400_000);
  database.prepare(`DELETE FROM catalog_growth WHERE at<? AND (series_id,bucket) NOT IN
    (SELECT series_id,MAX(bucket) FROM catalog_growth WHERE at<? GROUP BY series_id,CAST(at/3600000 AS INTEGER))`)
    .run(current - 86_400_000, current - 86_400_000);
  database.prepare(`DELETE FROM catalog_growth WHERE (series_id,bucket) NOT IN
    (SELECT series_id,bucket FROM catalog_growth ORDER BY at DESC,series_id DESC LIMIT ?)`)
    .run(CATALOG_GROWTH_RETENTION.maxPoints);
}

export function readCatalogGrowthHistory(filename, options = {}) {
  const safe = safePath(filename, { optional: true });
  if (!existsSync(safe)) return dto([]);
  const database = new DatabaseSync(safe, { readOnly: true });
  try { database.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN"); checkHistory(database); return readHistory(database, options); }
  finally { database.close(); }
}

export function createCatalogGrowthStore(filename, { now = () => new Date() } = {}) {
  const safe = safePath(filename, { optional: true });
  const existed = existsSync(safe);
  const database = new DatabaseSync(safe);
  try {
    database.exec("PRAGMA busy_timeout=1000; BEGIN IMMEDIATE");
    const objects = database.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    if (!objects.length && !existed) database.exec(HISTORY_DDL);
    checkHistory(database);
    pruneHistory(database, epoch(now));
    database.exec("COMMIT");
  } catch (error) { database.close(); throw error; }
  let closed = false;
  return Object.freeze({
    sample(counts) {
      if (closed) fail();
      validPoint(counts);
      const at = epoch(counts.at), current = epoch(now);
      if (at > current + CATALOG_GROWTH_INTERVAL_MS || at < current - 90 * 86_400_000) fail();
      safePath(safe);
      database.exec("BEGIN IMMEDIATE");
      try {
        const globalLatest = database.prepare("SELECT at FROM catalog_growth ORDER BY at DESC LIMIT 1").get();
        if (globalLatest && at < globalLatest.at) { database.exec("COMMIT"); return false; }
        const latest = database.prepare("SELECT revision,at FROM catalog_growth WHERE series_id=? ORDER BY at DESC LIMIT 1").get(counts.seriesId);
        if (latest && (counts.revision < latest.revision || at < latest.at)) { database.exec("COMMIT"); return false; }
        const existing = database.prepare("SELECT * FROM catalog_growth WHERE series_id=? AND bucket=?")
          .get(counts.seriesId, Math.floor(at / CATALOG_GROWTH_INTERVAL_MS));
        if (existing && existing.revision === counts.revision &&
            existing.total_sources === counts.totalSources && existing.learned_pages === counts.learnedPages &&
            existing.active_topics === counts.activeTopics && existing.total_topics === counts.totalTopics) {
          database.exec("COMMIT"); return false;
        }
        database.prepare(`INSERT INTO catalog_growth VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(series_id,bucket) DO UPDATE SET
          at=excluded.at,revision=excluded.revision,total_sources=excluded.total_sources,learned_pages=excluded.learned_pages,
          active_topics=excluded.active_topics,total_topics=excluded.total_topics`).run(counts.seriesId,
          Math.floor(at / CATALOG_GROWTH_INTERVAL_MS), at, counts.revision, ...COUNTERS.map(key => counts[key]));
        pruneHistory(database, current);
        database.exec("COMMIT"); return true;
      } catch (error) { try { database.exec("ROLLBACK"); } catch {} throw error; }
    },
    read(options = {}) { if (closed) fail(); safePath(safe); return readHistory(database, { now, ...options }); },
    close() { if (closed) return; closed = true; database.close(); },
  });
}

// Isolated derived maintenance: failure cannot stop the listener, overlap work,
// dispatch inference, change canonical storage or retain a failure's raw detail.
export function startCatalogGrowthSampler({ databasePath, filename = path.join(path.dirname(databasePath), CATALOG_GROWTH_FILENAME),
  now = () => new Date(), readCounts = readCatalogGrowthCounts, createStore = createCatalogGrowthStore,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, onOutcome = () => {} } = {}) {
  let closed = false, pending = null, store = null;
  function report(value) { try { onOutcome(value); } catch {} }
  function sample() {
    if (closed) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      if (closed) return;
      store ??= createStore(filename, { now });
      const counts = await readCounts(databasePath, { now });
      if (closed) return;
      await store.sample(counts);
    }).catch(() => report({ outcome: "failed" })).finally(() => { pending = null; });
    return pending;
  }
  let timer;
  try { timer = setIntervalImpl(() => { void sample(); }, CATALOG_GROWTH_INTERVAL_MS); timer?.unref?.(); }
  catch { report({ outcome: "failed" }); }
  void sample();
  return Object.freeze({ sample,
    async close() { if (closed) return; closed = true; try { clearIntervalImpl(timer); } catch {} await pending; try { store?.close(); } catch {} },
  });
}
