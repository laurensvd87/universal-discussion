import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDemoState } from '../src/domain/demo-state.js';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createSqliteRepository } from '../src/adapters/sqlite-repository.js';
import { BROWSER_MODEL_ID, MATCH_POLICY_VERSION } from '../src/domain/learned-sources.js';
import { operationDigestFor } from '../src/domain/source-threads.js';
import { CATALOG_GROWTH_FILENAME, CATALOG_GROWTH_V2_FILENAME, CATALOG_GROWTH_RETENTION,
  readCatalogGrowthCounts, readCatalogGrowthCountsV2, validateCatalogGrowthHistoryV2,
  createCatalogGrowthStore, createCatalogGrowthStoreV2, readCatalogGrowthHistory, readCatalogGrowthHistoryV2,
  startCatalogGrowthSamplerV2 } from '../src/metrics/catalog-growth.js';

const START = Date.parse('2026-10-13T12:00:00.000Z');
function directory(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'murmingle-growth-membership-'));
  t.after(() => { assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)); rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
function learned(id) {
  const value = { id, title: `Synthetic ${id}`, url: `https://example.org/articles/${id}`,
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    policyVersion: MATCH_POLICY_VERSION, operationId: `operation-${id}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] } };
  return { ...value, operationDigest: operationDigestFor(value) };
}
function fixture() {
  const state = createDemoState({ generation: 'membership-generation', createdAt: new Date(START).toISOString(), sources: [],
    topicSeeds: ['multi', 'mixed', 'single', 'empty', 'fixture-only'].map(id => ({ id: `topic-${id}`, title: id, kind: 'general' })) });
  state.sources = ['a', 'b', 'c', 'd'].map(learned);
  state.sources.push(...['fixture-mixed', 'fixture-only'].map(id => ({ id, title: id, url: `https://example.org/articles/${id}`,
    provenance: 'project-created-hand-authored-demo/1', embedding: null })));
  state.sourceLinks = [['a', 'multi'], ['b', 'multi'], ['c', 'mixed'], ['d', 'single'], ['fixture-mixed', 'mixed'], ['fixture-only', 'fixture-only']]
    .map(([sourceId, topic]) => ({ sourceId, topicId: `topic-${topic}`, method: sourceId.startsWith('fixture') ? 'fixture-confirmed' : 'learned-provisional' }));
  return state;
}
function sample(at = START, revision = 1, series = 'membership-generation') {
  return { at: new Date(at).toISOString(), seriesId: createHash('sha256').update(series).digest('hex'), revision,
    totalSources: 6, learnedPages: 4, activeTopics: 3, totalTopics: 5, multiMemberTopics: 1, singletonTopics: 2 };
}
const history = points => ({ schemaVersion: 'catalog-growth/v2', retention: { ...CATALOG_GROWTH_RETENTION }, points });

test('V2 counts only distinct learned members: multi-page Topics, singleton Topics, fixtures and empty containers stay separate', t => {
  const dir = directory(t);
  for (const kind of ['normalized', 'legacy-v2', 'legacy-v3']) {
    const filename = path.join(dir, `${kind}.sqlite`), state = fixture();
    if (kind === 'legacy-v3') state.schema = 'demo-state/v3';
    const repository = kind === 'normalized' ? createNormalizedSqliteRepository(filename, state) : createSqliteRepository(filename, state);
    repository.close();
    const before = readFileSync(filename), mtime = statSync(filename).mtimeMs;
    const point = readCatalogGrowthCountsV2(filename, { now: () => START });
    assert.deepEqual(point, sample(START, 0));
    assert.equal(point.totalTopics - point.activeTopics, 2, 'no-learned-member containers include an empty and a fixture-only Topic');
    const legacy = readCatalogGrowthCounts(filename, { now: () => START });
    assert.equal(legacy.activeTopics, 3); assert.equal(Object.hasOwn(legacy, 'multiMemberTopics'), false);
    assert.deepEqual(readFileSync(filename), before); assert.equal(statSync(filename).mtimeMs, mtime);
  }
});

test('V2 duplicate legacy links do not invent a multi-page Topic; overlapping membership never inflates unique pages', t => {
  const filename = path.join(directory(t), 'legacy.sqlite'), state = fixture();
  const repository = createSqliteRepository(filename, state); repository.close();
  state.sourceLinks.push({ ...state.sourceLinks.find(link => link.sourceId === 'c') });
  // Synthetic future overlapping membership is represented only in this fixture,
  // never a production canonical migration or authority expansion.
  state.sourceLinks.push(...['a', 'c'].map(sourceId => ({ sourceId, topicId: 'topic-empty', method: 'learned-provisional' })));
  const database = new DatabaseSync(filename); database.prepare('UPDATE demo_state SET document=? WHERE singleton=1').run(JSON.stringify(state)); database.close();
  const point = readCatalogGrowthCountsV2(filename, { now: () => START });
  assert.equal(point.learnedPages, 4); assert.equal(point.totalSources, 6);
  assert.equal(point.activeTopics, 4); assert.equal(point.multiMemberTopics, 2); assert.equal(point.singletonTopics, 2);
});

test('V2 validation permits future overlaps but rejects inconsistent counters, extra fields and accessor/proxy input', () => {
  const overlapping = { ...sample(), totalSources: 2, learnedPages: 2, totalTopics: 8,
    activeTopics: 8, multiMemberTopics: 7, singletonTopics: 1 };
  assert.deepEqual(validateCatalogGrowthHistoryV2(history([overlapping])), history([overlapping]));
  for (const point of [{ ...sample(), activeTopics: 4 }, { ...sample(), singletonTopics: -1 },
    { ...sample(), multiMemberTopics: 1.5 }, { ...sample(), learnedPages: 7 }, { ...sample(), totalTopics: 2 },
    { ...sample(), sourceUrl: 'https://example.org/unwanted' }]) assert.throws(() => validateCatalogGrowthHistoryV2(history([point])));
  let invoked = false; const accessor = sample(); Object.defineProperty(accessor, 'multiMemberTopics', { enumerable: true, get() { invoked = true; return 1; } });
  assert.throws(() => validateCatalogGrowthHistoryV2(history([accessor]))); assert.equal(invoked, false);
  assert.throws(() => validateCatalogGrowthHistoryV2(new Proxy(history([]), {})));
  assert.throws(() => validateCatalogGrowthHistoryV2({ ...history([]), schemaVersion: 'catalog-growth/v1' }));
});

test('V2 history is a separate strict aggregate-only series and never reads, rewrites or relabels V1 history', t => {
  const dir = directory(t), v1File = path.join(dir, CATALOG_GROWTH_FILENAME), v2File = path.join(dir, CATALOG_GROWTH_V2_FILENAME);
  let now = START; const old = createCatalogGrowthStore(v1File, { now: () => now });
  const { multiMemberTopics, singletonTopics, ...oldPoint } = sample(); old.sample(oldPoint); old.close();
  const oldBytes = readFileSync(v1File), oldMtime = statSync(v1File).mtimeMs;
  assert.deepEqual(readCatalogGrowthHistoryV2(v2File), history([]));
  const store = createCatalogGrowthStoreV2(v2File, { now: () => now }); t.after(() => store.close());
  assert.equal(store.sample(sample()), true); assert.equal(store.sample(sample()), false);
  now += 60_000; assert.equal(store.sample({ ...sample(now, 2), multiMemberTopics: 2, singletonTopics: 1 }), true);
  assert.equal(store.sample(sample(START, 1)), false);
  const result = readCatalogGrowthHistoryV2(v2File, { now: () => now });
  assert.equal(result.schemaVersion, 'catalog-growth/v2'); assert.equal(result.points.length, 2);
  assert.deepEqual(store.read(), result); assert.equal(readCatalogGrowthHistory(v1File, { now: () => now }).schemaVersion, 'catalog-growth/v1');
  assert.throws(() => readCatalogGrowthHistoryV2(v1File)); assert.throws(() => readCatalogGrowthHistory(v2File));
  assert.throws(() => createCatalogGrowthStoreV2(v1File)); assert.throws(() => createCatalogGrowthStore(v2File));
  assert.deepEqual(readFileSync(v1File), oldBytes); assert.equal(statSync(v1File).mtimeMs, oldMtime);
  const database = new DatabaseSync(v2File, { readOnly: true });
  const rows = database.prepare('SELECT * FROM catalog_growth').all(); database.close();
  assert.ok(rows.every(row => Object.values(row).every(value => typeof value === 'number' || /^[a-f0-9]{64}$/u.test(value))));
  store.close();
});

test('V2 sampler defaults to its own filename and preserves non-overlapping maintenance and disposal', async () => {
  let sampled, opened, reads = 0, closed = false;
  const sampler = startCatalogGrowthSamplerV2({ databasePath: path.resolve('synthetic-canonical.sqlite'), now: () => START,
    readCounts: async () => { reads++; return sample(); }, createStore(filename) { opened = filename; return { sample(point) { sampled = point; }, close() { closed = true; } }; },
    setIntervalImpl: () => ({ unref() {} }), clearIntervalImpl() {} });
  await sampler.sample(); assert.equal(reads, 1); assert.deepEqual(sampled, sample());
  assert.equal(path.basename(opened), CATALOG_GROWTH_V2_FILENAME);
  await sampler.close(); assert.equal(closed, true); await sampler.sample(); assert.equal(reads, 1);
});
