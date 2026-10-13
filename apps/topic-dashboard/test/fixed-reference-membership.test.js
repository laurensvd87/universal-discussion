import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDemoState, FIXED_REFERENCE_STATE_SCHEMA } from '../../local-service/src/domain/demo-state.js';
import { BROWSER_MODEL_ID, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE } from '../../local-service/src/domain/learned-sources.js';
import { operationDigestFor } from '../../local-service/src/domain/source-threads.js';
import { RIDGE_PARAMETER_SHA256 } from '../../local-service/src/domain/ridge-topic-adapter.js';
import { createNormalizedSqliteRepository, NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT } from '../../local-service/src/adapters/normalized-sqlite-repository.js';
import { readCatalogGrowthCounts, readCatalogGrowthCountsV2 } from '../../local-service/src/metrics/catalog-growth.js';
import { buildDashboardSnapshotV2, loadDashboardState } from '../src/data/catalog.js';
import { readDashboardRevision } from '../src/cli.js';

const START = '2026-10-13T12:00:00.000Z';
const unit = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
function fixture() {
  const state = createDemoState({ generation: 'fixed-reference-dashboard', createdAt: START, sources: [],
    topicSeeds: ['a', 'c', 'empty'].map(id => ({ id: `topic-${id}`, title: `Synthetic ${id}`, kind: 'general' })) });
  state.schema = FIXED_REFERENCE_STATE_SCHEMA;
  state.sources = ['a', 'b', 'c'].map((id, index) => {
    const source = { id, title: `Synthetic ${id}`, url: `https://example.org/articles/${id}`,
      provenance: LEARNED_SOURCE_PROVENANCE, extractorVersion: 'main-text-prefix/v1',
      policyVersion: 'ridge1-fixed-reference-radius/v1', operationId: `operation-${id}`,
      embedding: { modelId: BROWSER_MODEL_ID, values: unit(index * .4) },
      topicIds: id === 'b' ? ['topic-a', 'topic-c'] : [`topic-${id}`] };
    return { ...source, operationDigest: operationDigestFor(source) };
  });
  state.sourceLinks = state.sources.map(source => ({ sourceId: source.id, topicId: source.topicIds[0], method: 'learned-provisional' }));
  for (const topic of state.topics.filter(topic => topic.id !== 'topic-empty')) {
    Object.assign(topic, { provenance: LEARNED_TOPIC_PROVENANCE, retainTight: false,
      reference: { sourceId: topic.id.slice(6), parameterSha256: RIDGE_PARAMETER_SHA256,
        values: unit(topic.id === 'topic-a' ? 0 : .8) } });
  }
  return state;
}
function directory(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'murmingle-overlap-dashboard-'));
  t.after(() => { assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)); rmSync(dir, { recursive: true, force: true }); }); return dir;
}

test('overlapping A/B/C memberships yield two multi-page Topics and three unique pages without exporting fixed references', t => {
  const state = fixture(), filename = path.join(directory(t), 'canonical.sqlite');
  const repository = createNormalizedSqliteRepository(filename, state); repository.close();
  const before = readFileSync(filename), mtime = statSync(filename).mtimeMs;
  const loaded = loadDashboardState(filename), snapshot = buildDashboardSnapshotV2(loaded, { now: () => new Date(START) });
  assert.equal(snapshot.counts.learnedSources, 3); assert.equal(snapshot.counts.displayedPages, 3);
  assert.equal(snapshot.counts.topics, 2); assert.equal(snapshot.counts.multiMemberTopics, 2); assert.equal(snapshot.counts.singletonTopics, 0);
  assert.deepEqual(snapshot.topics.map(topic => [topic.id, topic.pageCount]), [['topic-a', 2], ['topic-c', 2]]);
  assert.deepEqual(snapshot.pages.find(page => page.id === 'b').topicIds, ['topic-a', 'topic-c']);
  assert.equal(snapshot.pages.length, 3, 'the shared page B is drawn once');
  assert.equal(JSON.stringify(snapshot).includes('parameterSha256'), false); assert.equal(JSON.stringify(snapshot).includes('reference'), false);
  assert.deepEqual(readDashboardRevision(filename), JSON.stringify([state.generation, state.revision]));
  const current = readCatalogGrowthCountsV2(filename, { now: () => new Date(START) });
  assert.equal(current.multiMemberTopics, 2); assert.equal(current.singletonTopics, 0); assert.equal(current.learnedPages, 3);
  const old = readCatalogGrowthCounts(filename, { now: () => new Date(START) });
  assert.equal(old.activeTopics, 2); assert.equal(Object.hasOwn(old, 'multiMemberTopics'), false);
  assert.deepEqual(readFileSync(filename), before); assert.equal(statSync(filename).mtimeMs, mtime);
});

test('v4 aggregate counters use indexed memberships without selecting embeddings, references, posts or source payloads', t => {
  const filename = path.join(directory(t), 'canonical.sqlite'), repository = createNormalizedSqliteRepository(filename, fixture()); repository.close();
  const statements = [], original = DatabaseSync.prototype.prepare;
  const spy = t.mock.method(DatabaseSync.prototype, 'prepare', function(sql) { statements.push(sql); return original.call(this, sql); });
  try { assert.equal(readCatalogGrowthCountsV2(filename, { now: () => new Date(START) }).multiMemberTopics, 2); }
  finally { spy.mock.restore(); }
  assert.ok(statements.some(sql => /FROM canonical_topic_memberships/u.test(sql)));
  assert.equal(statements.some(sql => /FROM canonical_(?:embeddings|topic_references|contributions|revisions)\b/u.test(sql)), false);
  assert.equal(statements.some(sql => /SELECT[^;]*\bpayload\b/iu.test(sql)), false);
});

test('membership counters and canonical revision share one read snapshot during a concurrent synthetic write', t => {
  const filename = path.join(directory(t), 'canonical.sqlite'), writer = createNormalizedSqliteRepository(filename, fixture());
  const journal = new DatabaseSync(filename); journal.exec('PRAGMA journal_mode=WAL'); journal.close();
  const original = DatabaseSync.prototype.prepare; let advanced = false;
  const spy = t.mock.method(DatabaseSync.prototype, 'prepare', function(sql) {
    if (!advanced && sql.includes('WITH memberships AS') && sql.includes('FROM canonical_meta')) {
      advanced = true;
      const next = structuredClone(writer.load()); next.revision++;
      next.sources.find(source => source.id === 'b').topicIds = ['topic-a'];
      writer.save(writer.version(), next);
    }
    return original.call(this, sql);
  });
  try {
    const pinned = readCatalogGrowthCountsV2(filename, { now: () => new Date(START) });
    assert.equal(advanced, true); assert.equal(pinned.revision, 0); assert.equal(pinned.multiMemberTopics, 2); assert.equal(pinned.singletonTopics, 0);
    const current = readCatalogGrowthCountsV2(filename, { now: () => new Date(START) });
    assert.equal(current.revision, 1); assert.equal(current.multiMemberTopics, 1); assert.equal(current.singletonTopics, 1);
    assert.equal(current.learnedPages, 3);
  } finally { spy.mock.restore(); writer.close(); }
});

test('legacy JSON v4 counters honor sorted Topic memberships and metadata polling without rewriting the file', t => {
  const filename = path.join(directory(t), 'legacy.sqlite'), state = fixture();
  const database = new DatabaseSync(filename);
  database.exec('CREATE TABLE demo_state(singleton INTEGER PRIMARY KEY,schema TEXT,generation TEXT,revision INTEGER,document TEXT)');
  database.prepare('INSERT INTO demo_state VALUES(1,?,?,?,?)').run(state.schema, state.generation, state.revision, JSON.stringify(state)); database.close();
  const before = readFileSync(filename);
  const snapshot = buildDashboardSnapshotV2(loadDashboardState(filename), { now: () => new Date(START) });
  assert.equal(snapshot.counts.multiMemberTopics, 2); assert.equal(snapshot.counts.learnedSources, 3);
  assert.equal(readCatalogGrowthCountsV2(filename, { now: () => new Date(START) }).multiMemberTopics, 2);
  assert.equal(readDashboardRevision(filename), JSON.stringify([state.generation, state.revision]));
  assert.deepEqual(readFileSync(filename), before);
  const damaged = structuredClone(state); damaged.sources[1].topicIds = ['missing-topic', 'topic-a'];
  const edit = new DatabaseSync(filename); edit.prepare('UPDATE demo_state SET document=?').run(JSON.stringify(damaged)); edit.close();
  assert.throws(() => readCatalogGrowthCountsV2(filename, { now: () => new Date(START) }), /Catalog growth unavailable/);
});

test('web normalization keeps overlapping membership counts and Topic filters while preview groups remain separate', () => {
  let script = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  script = script.slice(0, script.indexOf("  $('zoom-in').addEventListener")) + 'globalThis.api={normalize,visiblePages,state,previewData};})();';
  const context = vm.createContext({ URL, Intl, Date }); vm.runInContext(script, context);
  const snapshot = buildDashboardSnapshotV2(fixture(), { now: () => new Date(START) }), view = context.api.normalize(snapshot);
  assert.equal(view.counts.multiMemberTopics, 2); assert.equal(view.counts.learnedSources, 3);
  context.api.state.data = view; context.api.state.topicId = 'topic-c'; context.api.state.query = '';
  assert.deepEqual(Array.from(context.api.visiblePages(), page => page.id), ['b', 'c']);
  const preview = context.api.previewData(view, [['a'], ['b'], ['c']]);
  assert.equal(preview.counts.singletonTopics, 3); assert.ok(preview.pages.every(page => page.topicIds.length === 1));
  const malformed = structuredClone(snapshot); malformed.pages[1].topicIds = ['topic-a', 'missing-topic'];
  assert.throws(() => context.api.normalize(malformed));
  assert.equal(NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT, 'canonical-relational/v2');
});
