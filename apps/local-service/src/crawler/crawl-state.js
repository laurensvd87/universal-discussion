import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { crawlHost, crawlSection } from "./url-policy.js";

const SCHEMA = "murmingle-crawl-state/v1";
const TERMINAL = new Set(["existing", "ingested", "alias", "duplicate", "blocked", "rejected", "failed", "abandoned"]);
const ERROR = /^[a-z0-9-]{1,64}$/u;

function nowIso(now) { return now().toISOString(); }

function checkFile(filename) {
  if (filename === ":memory:") return;
  const parent = path.dirname(filename);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  for (const candidate of [parent, ...(existsSync(filename) ? [filename] : [])]) {
    const info = lstatSync(candidate);
    if (info.isSymbolicLink() || candidate === filename && !info.isFile() || candidate === parent && !info.isDirectory())
      throw new Error("Crawler state unavailable");
  }
}

function vectorJson(vector) {
  if (!Array.isArray(vector) || Object.getPrototypeOf(vector) !== Array.prototype || vector.length !== 384 ||
      Reflect.ownKeys(vector).length !== 385 || vector.some(value => !Number.isFinite(value)))
    throw new TypeError("Invalid crawler vector");
  return JSON.stringify(vector);
}

export function createCrawlState({ filename, now = () => new Date() }) {
  if (typeof filename !== "string" || !filename || typeof now !== "function") throw new TypeError("Invalid crawler state");
  checkFile(filename);
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE;");
    db.exec("BEGIN EXCLUSIVE; COMMIT;");
    const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
    const allowedTables = new Set(["crawler_meta", "crawl_urls", "origin_policy", "origin_pacing"]);
    if (existing.some(name => !allowedTables.has(name)) || existing.length && !existing.includes("crawler_meta"))
      throw new Error("Crawler state unavailable");
    db.exec(`CREATE TABLE IF NOT EXISTS crawler_meta (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema TEXT NOT NULL, generation TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS crawl_urls (
        url_digest TEXT PRIMARY KEY, url TEXT, bucket TEXT NOT NULL, host TEXT NOT NULL, section TEXT NOT NULL,
        depth INTEGER NOT NULL, priority INTEGER NOT NULL, parent_digest TEXT, state TEXT NOT NULL,
        attempted_at TEXT, completed_at TEXT, status_code TEXT, final_digest TEXT,
        title TEXT, vector_json TEXT, extractor_version TEXT, representation_digest TEXT,
        content_digest TEXT, simhash TEXT, source_id TEXT, topic_id TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS crawl_queue ON crawl_urls(state,priority,depth,bucket,host,section,url_digest);
      CREATE INDEX IF NOT EXISTS crawl_content ON crawl_urls(content_digest) WHERE content_digest IS NOT NULL;
      CREATE TABLE IF NOT EXISTS origin_policy (
        origin TEXT PRIMARY KEY, robots_json TEXT NOT NULL, tdm_json TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS origin_pacing (
        origin TEXT PRIMARY KEY, last_request_at TEXT NOT NULL
      ) STRICT;`);
    const meta = db.prepare("SELECT * FROM crawler_meta WHERE singleton=1").get();
    const stamp = nowIso(now);
    if (!meta) db.prepare("INSERT INTO crawler_meta VALUES(1,?,?,?,?)").run(SCHEMA, null, stamp, stamp);
    else if (meta.schema !== SCHEMA) throw new Error("Crawler state unavailable");
    db.prepare(`UPDATE crawl_urls SET state='failed',completed_at=?,status_code='interrupted-uncertain',url=NULL,title=NULL,vector_json=NULL
      WHERE state='attempted'`).run(nowIso(now));
    if (filename !== ":memory:" && process.platform !== "win32") chmodSync(filename, 0o600);
  } catch (error) { db.close(); throw error; }

  const transaction = work => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  };
  const digest = url => hashSync(url);

  function enqueue({ url, bucket, depth, priority, parentDigest = null }) {
    if (typeof bucket !== "string" || !bucket || !Number.isSafeInteger(depth) || depth < 0 ||
        !Number.isInteger(priority) || priority < 0 || priority > 1_000_000 ||
        parentDigest !== null && (typeof parentDigest !== "string" || !/^[a-f0-9]{64}$/u.test(parentDigest)))
      throw new TypeError("Invalid crawler frontier item");
    const urlDigest = digest(url), host = crawlHost(url), section = crawlSection(url), stamp = nowIso(now);
    return transaction(() => {
      const old = db.prepare("SELECT state,depth,priority FROM crawl_urls WHERE url_digest=?").get(urlDigest);
      if (!old) {
        db.prepare(`INSERT INTO crawl_urls(url_digest,url,bucket,host,section,depth,priority,parent_digest,state)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(urlDigest, url, bucket, host, section, depth, priority, parentDigest, "queued");
        return true;
      }
      if (old.state !== "queued") return false;
      db.prepare("UPDATE crawl_urls SET depth=min(depth,?),priority=min(priority,?) WHERE url_digest=?").run(depth, priority, urlDigest);
      return false;
    });
  }

  function markExisting(url, bucket = "canonical") {
    const urlDigest = digest(url), host = crawlHost(url), section = crawlSection(url), stamp = nowIso(now);
    return transaction(() => {
      const old = db.prepare("SELECT state FROM crawl_urls WHERE url_digest=?").get(urlDigest);
      if (old && TERMINAL.has(old.state)) return false;
      db.prepare(`INSERT INTO crawl_urls(url_digest,url,bucket,host,section,depth,priority,state,completed_at,status_code)
        VALUES(?,?,?,?,?,0,0,'existing',?,'canonical-existing') ON CONFLICT(url_digest) DO UPDATE SET
        state='existing',completed_at=excluded.completed_at,status_code='canonical-existing',url=NULL,title=NULL,vector_json=NULL`).run(
        urlDigest, null, bucket, host, section, stamp);
      return true;
    });
  }

  function next({ maxDepth, perHost, bucketLimits = null, excludedHosts = new Set() }) {
    if (!Number.isSafeInteger(maxDepth) || maxDepth < -1 || !Number.isInteger(perHost) || perHost < 0 || perHost > 50_000 ||
        bucketLimits !== null && !(bucketLimits instanceof Map) || !(excludedHosts instanceof Set) ||
        [...excludedHosts].some(host => typeof host !== "string" || !host))
      throw new TypeError("Invalid crawler limits");
    if (bucketLimits) for (const [key, value] of bucketLimits) {
      if (typeof key !== "string" || !key || !Number.isInteger(value) || value < 0 || value > 10_000)
        throw new TypeError("Invalid crawler limits");
    }
    const excluded = [...excludedHosts];
    const excludedClause = excluded.length ? `AND q.host NOT IN (${excluded.map(() => "?").join(",")})` : "";
    const bucketEntries = bucketLimits ? [...bucketLimits] : [];
    const bucketExpression = bucketLimits
      ? bucketEntries.length ? `CASE q.bucket ${bucketEntries.map(() => "WHEN ? THEN ?").join(" ")} ELSE -1 END` : "-1"
      : null;
    const bucketClause = bucketExpression === null ? "" : `AND ((${bucketExpression})=0 OR coalesce(ba.count,0)<(${bucketExpression}))`;
    const parameters = [maxDepth, maxDepth, ...excluded, perHost, perHost, ...bucketEntries.flat(), ...bucketEntries.flat()];
    const row = db.prepare(`WITH
        ha AS (SELECT host,count(*) AS count FROM crawl_urls WHERE attempted_at IS NOT NULL GROUP BY host),
        sa AS (SELECT section,count(*) AS count FROM crawl_urls WHERE attempted_at IS NOT NULL GROUP BY section),
        ba AS (SELECT bucket,count(*) AS count FROM crawl_urls WHERE attempted_at IS NOT NULL GROUP BY bucket),
        bd AS (SELECT bucket,count(*) AS count FROM crawl_urls WHERE state IN ('staged','ingested') GROUP BY bucket)
      SELECT q.*,coalesce(ha.count,0) AS host_done,coalesce(sa.count,0) AS section_done,
        coalesce(bd.count,0) AS bucket_done,coalesce(ba.count,0) AS bucket_attempted
      FROM crawl_urls q
      LEFT JOIN ha ON ha.host=q.host LEFT JOIN sa ON sa.section=q.section
      LEFT JOIN ba ON ba.bucket=q.bucket LEFT JOIN bd ON bd.bucket=q.bucket
      WHERE q.state='queued' AND (?=-1 OR q.depth<=?) ${excludedClause}
        AND (?=0 OR coalesce(ha.count,0)<?) ${bucketClause}
      ORDER BY q.priority,
        coalesce(bd.count,0)*1000+coalesce(ha.count,0)*100+coalesce(sa.count,0)*10+q.depth,
        q.url_digest LIMIT 1`).get(...parameters);
    if (!row) return null;
    const stamp = nowIso(now);
    const changed = db.prepare("UPDATE crawl_urls SET state='attempted',attempted_at=? WHERE url_digest=? AND state='queued'").run(stamp, row.url_digest);
    if (changed.changes !== 1) return null;
    return Object.freeze(project(row, { state: "attempted", attempted_at: stamp }));
  }

  function claimRedirect({ url, bucket, depth, priority, parentDigest, maxAttempts = 0, bucketLimit = 0, perHost = 0 }) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 50_000 ||
        !Number.isInteger(bucketLimit) || bucketLimit < 0 || bucketLimit > 10_000 ||
        !Number.isInteger(perHost) || perHost < 0 || perHost > 50_000) throw new TypeError("Invalid crawler limits");
    enqueue({ url, bucket, depth, priority, parentDigest });
    const stamp = nowIso(now), urlDigest = digest(url);
    return transaction(() => {
      const row = db.prepare("SELECT * FROM crawl_urls WHERE url_digest=?").get(urlDigest);
      if (!row || row.state !== "queued") return null;
      const total = Number(db.prepare("SELECT count(*) AS count FROM crawl_urls WHERE attempted_at IS NOT NULL").get().count);
      const bucketAttempts = Number(db.prepare("SELECT count(*) AS count FROM crawl_urls WHERE bucket=? AND attempted_at IS NOT NULL").get(bucket).count);
      const hostAttempts = Number(db.prepare("SELECT count(*) AS count FROM crawl_urls WHERE host=? AND attempted_at IS NOT NULL").get(row.host).count);
      if (maxAttempts !== 0 && total >= maxAttempts || bucketLimit !== 0 && bucketAttempts >= bucketLimit ||
          perHost !== 0 && hostAttempts >= perHost) return null;
      const changed = db.prepare("UPDATE crawl_urls SET state='attempted',attempted_at=? WHERE url_digest=? AND state='queued'").run(stamp, urlDigest);
      return changed.changes === 1 ? Object.freeze(project(row, { state: "attempted", attempted_at: stamp })) : null;
    });
  }

  function stage({ urlDigest, title, vector, extractorVersion, representationDigest, contentDigest, simhash, links = [] }) {
    if (!/^[a-f0-9]{64}$/u.test(urlDigest) || typeof title !== "string" || !title || title.length > 200 ||
        typeof extractorVersion !== "string" || !extractorVersion || !/^[a-f0-9]{64}$/u.test(representationDigest) ||
        !/^[a-f0-9]{64}$/u.test(contentDigest) || !/^[a-f0-9]{16}$/u.test(simhash) || !Array.isArray(links) || links.length > 500)
      throw new TypeError("Invalid staged crawler page");
    const serialized = vectorJson(vector), stamp = nowIso(now);
    return transaction(() => {
      const changed = db.prepare(`UPDATE crawl_urls SET state='staged',completed_at=?,status_code='staged',title=?,vector_json=?,
        extractor_version=?,representation_digest=?,content_digest=?,simhash=? WHERE url_digest=? AND state='attempted'`).run(
        stamp, title, serialized, extractorVersion, representationDigest, contentDigest, simhash, urlDigest);
      if (changed.changes !== 1) throw new Error("Crawler state changed");
      for (const link of links) enqueueInside(link);
      return true;
    });
  }

  function enqueueInside({ url, bucket, depth, priority, parentDigest = null }) {
    const urlDigest = digest(url), host = crawlHost(url), section = crawlSection(url);
    const old = db.prepare("SELECT state FROM crawl_urls WHERE url_digest=?").get(urlDigest);
    if (!old) db.prepare(`INSERT INTO crawl_urls(url_digest,url,bucket,host,section,depth,priority,parent_digest,state)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(urlDigest, url, bucket, host, section, depth, priority, parentDigest, "queued");
  }

  function terminal(urlDigest, state, code, { finalDigest = null, contentDigest = null, simhash = null } = {}) {
    if (!/^[a-f0-9]{64}$/u.test(urlDigest) || !TERMINAL.has(state) || !ERROR.test(code) ||
        finalDigest !== null && !/^[a-f0-9]{64}$/u.test(finalDigest) || contentDigest !== null && !/^[a-f0-9]{64}$/u.test(contentDigest) ||
        simhash !== null && !/^[a-f0-9]{16}$/u.test(simhash)) throw new TypeError("Invalid crawler terminal state");
    const stamp = nowIso(now);
    const changed = db.prepare(`UPDATE crawl_urls SET state=?,completed_at=?,status_code=?,final_digest=?,content_digest=coalesce(?,content_digest),
      simhash=coalesce(?,simhash),url=NULL,title=NULL,vector_json=NULL WHERE url_digest=? AND state IN ('attempted','queued','staged')`).run(
      state, stamp, code, finalDigest, contentDigest, simhash, urlDigest);
    return changed.changes === 1;
  }

  function listStaged(limit = 512, { bucketLimits = null, perHost = 0, perSection = 0 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50_000) throw new TypeError("Invalid staged limit");
    if (bucketLimits !== null && !(bucketLimits instanceof Map) || !Number.isInteger(perHost) || perHost < 0 || perHost > 50_000 ||
        !Number.isInteger(perSection) || perSection < 0 || perSection > 10_000) throw new TypeError("Invalid staged limit");
    const entries = bucketLimits ? [...bucketLimits] : [];
    if (entries.some(([key, value]) => typeof key !== "string" || !key || !Number.isInteger(value) || value < 0 || value > 10_000))
      throw new TypeError("Invalid staged limit");
    const bucketExpression = entries.length ? `CASE q.bucket ${entries.map(() => "WHEN ? THEN ?").join(" ")} ELSE -1 END` : bucketLimits ? "-1" : "0";
    const bucketClause = `AND ((${bucketExpression})=0 OR coalesce(b.count,0)<(${bucketExpression}))`;
    return db.prepare(`WITH
      b AS (SELECT bucket,count(*) AS count FROM crawl_urls WHERE state='ingested' GROUP BY bucket),
      h AS (SELECT host,count(*) AS count FROM crawl_urls WHERE state='ingested' GROUP BY host),
      s AS (SELECT bucket,section,count(*) AS count FROM crawl_urls WHERE state='ingested' GROUP BY bucket,section),
      eligible AS (SELECT q.*,coalesce(b.count,0) AS bucket_done,coalesce(h.count,0) AS host_done,
        coalesce(s.count,0) AS section_done,
        row_number() OVER (PARTITION BY q.bucket ORDER BY coalesce(h.count,0),coalesce(s.count,0),q.url_digest) AS bucket_rank
        FROM crawl_urls q LEFT JOIN b ON b.bucket=q.bucket LEFT JOIN h ON h.host=q.host
        LEFT JOIN s ON s.bucket=q.bucket AND s.section=q.section
        WHERE q.state='staged' AND (?=0 OR coalesce(h.count,0)<?) AND (?=0 OR coalesce(s.count,0)<?) ${bucketClause})
      SELECT * FROM eligible ORDER BY bucket_rank,bucket_done,host_done,section_done,bucket,url_digest LIMIT ?`)
      .all(perHost, perHost, perSection, perSection, ...entries.flat(), ...entries.flat(), limit)
      .map(row => Object.freeze({ ...project(row), vector: Object.freeze(JSON.parse(row.vector_json)) }));
  }

  function selectionCounts() {
    const grouped = (expression, column) => new Map(db.prepare(`SELECT ${expression} AS key,count(*) AS count
      FROM crawl_urls WHERE state='ingested' GROUP BY ${column}`).all().map(row => [row.key, Number(row.count)]));
    return { bucket: grouped("bucket", "bucket"), host: grouped("host", "host"),
      section: grouped("bucket || '/' || section", "bucket,section") };
  }

  function listIngestedVectors(limit = 10_000) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) throw new TypeError("Invalid vector limit");
    return db.prepare("SELECT * FROM crawl_urls WHERE state='ingested' AND vector_json IS NOT NULL ORDER BY completed_at DESC LIMIT ?").all(limit)
      .map(row => Object.freeze({ ...project(row), vector: Object.freeze(JSON.parse(row.vector_json)) }));
  }

  function markIngested(urlDigest, { sourceId, topicId }) {
    if (!/^[a-f0-9]{64}$/u.test(urlDigest) || typeof sourceId !== "string" || typeof topicId !== "string")
      throw new TypeError("Invalid ingest result");
    const stamp = nowIso(now);
    const changed = db.prepare(`UPDATE crawl_urls SET state='ingested',completed_at=?,status_code='ingested',source_id=?,topic_id=?,url=NULL,title=NULL
      WHERE url_digest=? AND state='staged'`).run(stamp, sourceId, topicId, urlDigest);
    if (changed.changes !== 1) throw new Error("Crawler state changed");
  }

  function duplicateFor(contentDigest, simhash, excludeDigest) {
    if (!/^[a-f0-9]{64}$/u.test(contentDigest) || !/^[a-f0-9]{16}$/u.test(simhash) || !/^[a-f0-9]{64}$/u.test(excludeDigest))
      throw new TypeError("Invalid crawler fingerprint");
    const exact = db.prepare("SELECT url_digest FROM crawl_urls WHERE content_digest=? AND url_digest<>? AND state IN ('staged','ingested','duplicate') LIMIT 1")
      .get(contentDigest, excludeDigest);
    if (exact) return { kind: "exact", urlDigest: exact.url_digest };
    const rows = db.prepare("SELECT url_digest,simhash FROM crawl_urls WHERE simhash IS NOT NULL AND url_digest<>? AND state IN ('staged','ingested') ORDER BY completed_at DESC LIMIT 5000")
      .all(excludeDigest);
    const target = BigInt(`0x${simhash}`);
    for (const row of rows) {
      let value = target ^ BigInt(`0x${row.simhash}`), distance = 0;
      while (value) { distance++; value &= value - 1n; }
      if (distance <= 3) return { kind: "near", urlDigest: row.url_digest };
    }
    return null;
  }

  function bindGeneration(generation, { rebase = false } = {}) {
    if (typeof generation !== "string" || !generation || generation.length > 128) throw new TypeError("Invalid canonical generation");
    return transaction(() => {
      const meta = db.prepare("SELECT generation FROM crawler_meta WHERE singleton=1").get();
      if (meta.generation === null) db.prepare("UPDATE crawler_meta SET generation=?,updated_at=? WHERE singleton=1").run(generation, nowIso(now));
      else if (meta.generation !== generation) {
        if (!rebase) throw new Error("Crawler state belongs to another canonical generation");
        db.prepare("DELETE FROM crawl_urls WHERE state='queued'").run();
        db.prepare("UPDATE crawl_urls SET state='abandoned',status_code='generation-rebased',completed_at=?,url=NULL,title=NULL,vector_json=NULL WHERE state IN ('attempted','staged')")
          .run(nowIso(now));
        db.prepare("UPDATE crawler_meta SET generation=?,updated_at=? WHERE singleton=1").run(generation, nowIso(now));
      }
    });
  }

  function getPolicy(origin) {
    if (typeof origin !== "string") throw new TypeError("Invalid origin policy");
    const row = db.prepare("SELECT * FROM origin_policy WHERE origin=?").get(origin);
    if (!row || Date.parse(row.expires_at) <= now().getTime()) return null;
    try { return { robots: JSON.parse(row.robots_json), tdm: JSON.parse(row.tdm_json), fetchedAt: row.fetched_at, expiresAt: row.expires_at }; }
    catch { throw new Error("Crawler state unavailable"); }
  }

  function setPolicy(origin, { robots, tdm, ttlMs }) {
    if (typeof origin !== "string" || !Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 7 * 86_400_000)
      throw new TypeError("Invalid origin policy");
    const stamp = now(), expires = new Date(stamp.getTime() + ttlMs);
    const robotsJson = JSON.stringify(robots), tdmJson = JSON.stringify(tdm);
    if (robotsJson.length > 131_072 || tdmJson.length > 131_072) throw new TypeError("Invalid origin policy");
    db.prepare(`INSERT INTO origin_policy VALUES(?,?,?,?,?) ON CONFLICT(origin) DO UPDATE SET
      robots_json=excluded.robots_json,tdm_json=excluded.tdm_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at`)
      .run(origin, robotsJson, tdmJson, stamp.toISOString(), expires.toISOString());
  }

  function lastRequestAt(origin) {
    if (typeof origin !== "string") throw new TypeError("Invalid origin pacing");
    const value = db.prepare("SELECT last_request_at FROM origin_pacing WHERE origin=?").get(origin)?.last_request_at;
    if (value === undefined) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error("Crawler state unavailable");
    return timestamp;
  }

  function noteRequest(origin) {
    if (typeof origin !== "string") throw new TypeError("Invalid origin pacing");
    const stamp = nowIso(now);
    db.prepare(`INSERT INTO origin_pacing VALUES(?,?) ON CONFLICT(origin) DO UPDATE SET
      last_request_at=excluded.last_request_at`).run(origin, stamp);
    return Date.parse(stamp);
  }

  function counts() {
    return Object.freeze(Object.fromEntries(db.prepare("SELECT state,count(*) AS count FROM crawl_urls GROUP BY state").all()
      .map(row => [row.state, row.count])));
  }


  function metrics() {
    const byBucket = db.prepare(`SELECT bucket,state,count(*) AS count FROM crawl_urls
      WHERE state IN ('staged','ingested','duplicate','blocked','rejected','failed') GROUP BY bucket,state ORDER BY bucket,state`).all();
    const byHost = db.prepare(`SELECT host,count(*) AS count FROM crawl_urls WHERE state IN ('staged','ingested') GROUP BY host ORDER BY count DESC,host`).all();
    return Object.freeze({ byBucket: Object.freeze(byBucket.map(Object.freeze)), byHost: Object.freeze(byHost.map(Object.freeze)) });
  }

  return Object.freeze({ enqueue, markExisting, next, claimRedirect, stage, terminal, listStaged, listIngestedVectors, markIngested,
    duplicateFor, bindGeneration, getPolicy, setPolicy, lastRequestAt, noteRequest, counts, selectionCounts,
    attemptedCount() { return Number(db.prepare("SELECT count(*) AS count FROM crawl_urls WHERE attempted_at IS NOT NULL").get().count); },
    metrics,
    getByDigest(urlDigest) { const row = db.prepare("SELECT * FROM crawl_urls WHERE url_digest=?").get(urlDigest); return row ? project(row) : null; },
    close() { db.close(); } });
}

function project(row, overrides = {}) {
  const value = { ...row, ...overrides };
  return { url: value.url, urlDigest: value.url_digest, bucket: value.bucket, host: value.host, section: value.section,
    depth: value.depth, priority: value.priority, parentDigest: value.parent_digest, state: value.state,
    title: value.title, extractorVersion: value.extractor_version, representationDigest: value.representation_digest,
    contentDigest: value.content_digest, simhash: value.simhash, sourceId: value.source_id, topicId: value.topic_id };
}

function hashSync(value) {
  if (typeof value !== "string" || !value) throw new TypeError("Invalid crawler URL");
  return createHash("sha256").update(value).digest("hex");
}
