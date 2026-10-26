import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createDemoState } from "../src/domain/demo-state.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { readCatalogGrowthCounts, createCatalogGrowthStore, readCatalogGrowthHistory,
  startCatalogGrowthSampler, CATALOG_GROWTH_INTERVAL_MS } from "../src/metrics/catalog-growth.js";
import { validateCatalogGrowthHistory } from "../src/metrics/catalog-growth.js";

const START = Date.parse("2026-10-12T12:00:00.000Z");
function directory(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "murmingle-catalog-growth-"));
  t.after(() => rmSync(dir, { recursive: true, force: true })); return dir;
}
function fixture() {
  const state = createDemoState({ generation: "synthetic-generation", createdAt: new Date(START).toISOString(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  return state;
}
function sample(at = START, revision = 1, series = "generation-one", learnedPages = 3) {
  return { at: new Date(at).toISOString(), seriesId: createHash("sha256").update(series).digest("hex"), revision,
    totalSources: 8, learnedPages, activeTopics: 1, totalTopics: 4 };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("normalized and legacy v2/v3 counts exclude fixtures and empty Topics without changing canonical bytes", t => {
  const dir = directory(t);
  for (const kind of ["normalized", "legacy-v2", "legacy-v3"]) {
    const filename = path.join(dir, `${kind}.sqlite`), state = fixture();
    if (kind === "legacy-v3") state.schema = "demo-state/v3";
    const repo = kind === "normalized" ? createNormalizedSqliteRepository(filename, state) : createSqliteRepository(filename, state);
    repo.close();
    const syntheticEdit = new DatabaseSync(filename);
    if (kind === "normalized") {
      for (const source of state.sources.slice(0, 3)) syntheticEdit.prepare("UPDATE canonical_sources SET provenance=? WHERE id=?")
        .run("owner-local-page-embedding/v1", source.id);
    } else {
      for (const source of state.sources.slice(0, 3)) source.provenance = "owner-local-page-embedding/v1";
      syntheticEdit.prepare("UPDATE demo_state SET document=?").run(JSON.stringify(state));
    }
    syntheticEdit.close();
    const before = readFileSync(filename), mtime = statSync(filename).mtimeMs;
    const counts = readCatalogGrowthCounts(filename, { now: () => new Date(START) });
    assert.equal(counts.totalSources, 8); assert.equal(counts.learnedPages, 3);
    const linked = new Set(state.sourceLinks.filter(link => state.sources.slice(0, 3).some(source => source.id === link.sourceId)).map(link => link.topicId));
    assert.equal(counts.activeTopics, linked.size); assert.equal(counts.totalTopics, state.topics.length);
    assert.deepEqual(Object.keys(counts).sort(), ["at", "seriesId", "revision", "totalSources", "learnedPages", "activeTopics", "totalTopics"].sort());
    assert.deepEqual(readFileSync(filename), before); assert.equal(statSync(filename).mtimeMs, mtime);
  }
});

test("history is aggregate-only, persisted and minute-idempotent across independent writers", t => {
  const filename = path.join(directory(t), "topic-growth.sqlite");
  let now = START;
  const one = createCatalogGrowthStore(filename, { now: () => now });
  const two = createCatalogGrowthStore(filename, { now: () => now });
  t.after(() => { one.close(); two.close(); });
  assert.equal(one.sample(sample()), true);
  const before = readFileSync(filename), mtime = statSync(filename).mtimeMs;
  now += 15_000; assert.equal(two.sample(sample(now)), false);
  assert.deepEqual(readFileSync(filename), before); assert.equal(statSync(filename).mtimeMs, mtime);
  assert.equal(two.sample(sample(now, 2, "generation-one", 2)), true);
  assert.equal(one.sample(sample(now + 1, 1)), false);
  now += 60_000; assert.equal(one.sample(sample(now, 2, "generation-one", 2)), true);
  assert.equal(two.sample(sample(now, 0, "generation-two", 1)), true);
  const history = readCatalogGrowthHistory(filename);
  assert.equal(history.schemaVersion, "catalog-growth/v1"); assert.equal(history.points.length, 3);
  assert.equal(history.points[0].learnedPages, 2); // Deletion/regrouping declines are legitimate.
  const db = new DatabaseSync(filename, { readOnly: true });
  const objects = db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
  assert.deepEqual(objects.map(row => row.name), ["catalog_growth"]);
  const contents = db.prepare("SELECT * FROM catalog_growth").all(); db.close();
  assert.ok(contents.every(row => Object.values(row).every(value => typeof value === "number" || /^[a-f0-9]{64}$/u.test(value))));
  assert.deepEqual(two.read(), history);
  one.close(); two.close();
});

test("retention keeps minute samples for24h, latest hourly per generation thereafter, expires90days, caps4096", t => {
  const filename = path.join(directory(t), "history.sqlite"); let now = START;
  const store = createCatalogGrowthStore(filename, { now: () => now }); t.after(() => store.close());
  store.sample(sample(now));
  now += 5 * 60_000; store.sample(sample(now, 2));
  now = START + 25 * 3600_000; store.sample(sample(now, 3));
  let points = store.read().points;
  assert.equal(points.length, 2); assert.equal(points[0].revision, 2);
  now = START + 92 * 86400_000; store.sample(sample(now, 4));
  assert.equal(store.read().points.length, 1);
  const db = new DatabaseSync(filename);
  const insert = db.prepare("INSERT INTO catalog_growth VALUES(?,?,?,?,?,?,?,?)");
  db.exec("BEGIN IMMEDIATE");
  for (let i = 1; i <= 4095; i++) {
    const value = sample(now - i * 60_000, i, `synthetic-series-${i}`);
    insert.run(value.seriesId, Math.floor((now-i*60_000)/60_000), now-i*60_000, i, 8, 3, 1, 4);
  }
  db.exec("COMMIT"); db.close();
  now += 60_000; store.sample(sample(now, 5));
  assert.equal(store.read().points.length, 4096);
  store.close();
});

test("unsupported, malformed metadata/history, symlink and invalid timestamps fail closed", t => {
  const dir = directory(t), absent = path.join(dir, "absent.sqlite");
  assert.deepEqual(readCatalogGrowthHistory(absent).points, []);
  assert.throws(() => readCatalogGrowthCounts(absent));
  const empty = path.join(dir, "empty.sqlite"), raw = new DatabaseSync(empty); raw.close();
  assert.throws(() => createCatalogGrowthStore(empty));
  const canonical = path.join(dir, "canonical.sqlite");
  const repo = createNormalizedSqliteRepository(canonical, fixture()); repo.close();
  const db = new DatabaseSync(canonical); db.exec("UPDATE canonical_meta SET format='unsupported'"); db.close();
  assert.throws(() => readCatalogGrowthCounts(canonical));
  const filename = path.join(dir, "history.sqlite"), store = createCatalogGrowthStore(filename, { now: () => START });
  assert.throws(() => store.sample({ ...sample(), at: "2026-10-12" }));
  assert.throws(() => store.sample({ ...sample(), learnedPages: 9 })); store.close();
  const linked = path.join(dir, "linked.sqlite");
  try { symlinkSync(filename, linked, "file"); }
  catch (error) { if (!["EPERM", "EACCES"].includes(error.code)) throw error; return; }
  assert.throws(() => createCatalogGrowthStore(linked)); assert.throws(() => readCatalogGrowthHistory(linked));
});

test("sampler starts immediately, serializes sync/async failures, retries, closes pending work and timer", async () => {
  let timerFn, timerCleared = false, resolve, calls = 0, stored = 0, closed = 0;
  const reports = [];
  const sampler = startCatalogGrowthSampler({ databasePath: path.resolve("synthetic.sqlite"),
    readCounts() { calls++; if (calls === 1) throw new Error("synthetic secret failure"); return new Promise(done => { resolve = done; }); },
    createStore() { return { sample() { stored++; }, close() { closed++; } }; },
    onOutcome(value) { reports.push(value); throw new Error("report failure"); },
    setIntervalImpl(fn, period) { assert.equal(period, CATALOG_GROWTH_INTERVAL_MS); timerFn = fn; return { unref() {} }; },
    clearIntervalImpl() { timerCleared = true; } });
  await flush(); assert.deepEqual(reports, [{ outcome: "failed" }]);
  timerFn(); await flush(); const pending = sampler.sample(); assert.equal(pending, sampler.sample()); assert.equal(calls, 2);
  resolve(sample()); await pending; assert.equal(stored, 1);
  timerFn(); await flush(); const closing = sampler.close(); resolve(sample()); await closing;
  timerFn(); await flush(); assert.equal(timerCleared, true); assert.equal(stored, 1); assert.equal(closed, 1);
});

test("export validator rejects extra fields, getters/proxies, sparse arrays and bad generation metadata without reading secrets", () => {
  const history = { schemaVersion: "catalog-growth/v1", points: [sample()], retention: { minuteHours: 24, hourlyDays: 90, maxPoints: 4096 } };
  assert.deepEqual(validateCatalogGrowthHistory(history), history);
  assert.notEqual(validateCatalogGrowthHistory(history).points[0], history.points[0]);
  let getterCalls = 0;
  const secret = { ...sample() };
  Object.defineProperty(secret, "token", { enumerable: true, get() { getterCalls++; return "secret"; } });
  for (const invalid of [
    { ...history, rawAccount: "secret" }, { ...history, points: [secret] },
    { ...history, points: new Array(1) }, { ...history, points: [new Proxy(sample(), {})] },
    { ...history, points: [{ ...sample(), seriesId: "raw-generation" }] },
    { ...history, points: [sample(START, 2), sample(START + 60_000, 1)] },
    new Proxy(history, {}),
  ]) assert.throws(() => validateCatalogGrowthHistory(invalid), /Catalog growth unavailable/u);
  assert.equal(getterCalls, 0);
});

test("read-only history excludes expired records, store startup prunes them without a new canonical sample", t => {
  const filename = path.join(directory(t), "history.sqlite");
  const initial = createCatalogGrowthStore(filename, { now: () => START }); initial.sample(sample()); initial.close();
  const before = readFileSync(filename);
  const later = START + 91 * 86400_000;
  assert.deepEqual(readCatalogGrowthHistory(filename, { now: () => later }).points, []);
  assert.deepEqual(readFileSync(filename), before);
  const reopened = createCatalogGrowthStore(filename, { now: () => later });
  assert.deepEqual(reopened.read().points, []); reopened.close();
  const raw = new DatabaseSync(filename, { readOnly: true });
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM catalog_growth").get().n, 0); raw.close();
});
