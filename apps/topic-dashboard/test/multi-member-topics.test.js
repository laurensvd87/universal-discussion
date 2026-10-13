import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildDashboardSnapshot, buildDashboardSnapshotV2, buildStatsOnlyDashboardSnapshotV2 } from '../src/data/catalog.js';
import { generateDashboard, renderSnapshotScript } from '../src/cli.js';
import { createNormalizedSqliteRepository } from '../../local-service/src/adapters/normalized-sqlite-repository.js';
import { createDemoState } from '../../local-service/src/domain/demo-state.js';
import { operationDigestFor } from '../../local-service/src/domain/source-threads.js';

function fixture() {
  const state = createDemoState({ generation: 'dashboard-v2', createdAt: '2026-01-01T00:00:00.000Z', sources: [], topicSeeds: [] });
  state.topics = ['multi', 'single', 'empty'].map(id => ({ id, title: `Synthetic ${id}`, kind: 'general', createdAt: '2026-01-01T00:00:00.000Z',
    provenance: 'owner-local-learned-topic/v1', retainTight: false }));
  state.discussions = state.topics.map(topic => ({ id: `discussion-${topic.id}`, topicId: topic.id }));
  state.sources = ['a', 'b', 'c'].map(id => {
    const source = { id, title: `Synthetic ${id}`, url: `https://example.org/${id}`, provenance: 'owner-local-page-embedding/v1',
      extractorVersion: 'main-text-prefix/v1', embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: [1, ...Array(383).fill(0)] },
      operationId: `operation-${id}`, policyVersion: 'adaptive-supported-partitions/v1' };
    source.operationDigest = operationDigestFor(source); return source;
  });
  state.sourceLinks = state.sources.map((source, index) => ({ sourceId: source.id, topicId: index < 2 ? 'multi' : 'single', method: 'learned-provisional' }));
  return state;
}
test('v2 snapshot distinguishes multi-page Topics and singleton containers while v1 remains exact', () => {
  const state = fixture(), old = buildDashboardSnapshot(state), current = buildDashboardSnapshotV2(state);
  assert.equal(old.schemaVersion, 1); assert.equal(old.counts.multiMemberTopics, undefined);
  assert.equal(current.schemaVersion, 2); assert.equal(current.counts.learnedSources, 3);
  assert.equal(current.counts.multiMemberTopics, 1); assert.equal(current.counts.singletonTopics, 1);
  assert.equal(current.counts.totalTopics, 3); assert.equal(current.counts.topics, 2);
  assert.throws(() => buildStatsOnlyDashboardSnapshotV2({ multiMemberTopics: 1, singletonTopics: 1, activeTopics: 3 }), TypeError);
});
test('explicit v2 CLI writes only separate v2 history and leaves existing v1 bytes unchanged', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-dashboard-v2-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'canonical.sqlite'); const repo = createNormalizedSqliteRepository(databasePath, fixture()); repo.close();
  const options = { databasePath, outputPath: path.join(directory, 'report', 'dashboard.html'), adapter: null, bodyMetric: null, ridgeAdapter: null,
    now: () => new Date('2026-01-02T00:00:00.000Z') };
  generateDashboard(options); const oldPath = path.join(directory, 'topic-growth.sqlite'), before = readFileSync(oldPath);
  const result = generateDashboard({ ...options, formatVersion: 2 });
  assert.equal(result.counts.multiMemberTopics, 1); assert.equal(result.counts.singletonTopics, 1);
  assert.equal(existsSync(path.join(directory, 'topic-growth-v2.sqlite')), true); assert.deepEqual(readFileSync(oldPath), before);
  const bridge = readFileSync(path.join(directory, 'report', 'snapshot.js'), 'utf8');
  assert.match(bridge, /catalog-growth\/v2/u); assert.match(bridge, /"multiMemberTopics":1/u);
});
test('v2 aggregate Topics remain available above graph limit without loading embedding payloads', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-dashboard-v2-capacity-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const state = fixture(), template = state.sources[0];
  state.sources = Array.from({ length: 1001 }, (_, index) => {
    const source = { ...template, id: `page-${index}`, operationId: `operation-${index}`, url: `https://example.org/page-${index}` };
    source.operationDigest = operationDigestFor(source); return source;
  });
  state.sourceLinks = state.sources.map((source, index) => ({ sourceId: source.id, topicId: index ? 'multi' : 'single', method: 'learned-provisional' }));
  const databasePath = path.join(directory, 'canonical.sqlite'), repo = createNormalizedSqliteRepository(databasePath, state); repo.close();
  const database = new DatabaseSync(databasePath); database.exec("UPDATE canonical_embeddings SET payload='UNREADABLE_VECTOR_SENTINEL'"); database.close();
  const before = readFileSync(databasePath);
  const result = generateDashboard({ databasePath, outputPath: path.join(directory, 'report', 'dashboard.html'), formatVersion: 2,
    adapter: null, bodyMetric: null, ridgeAdapter: null, now: () => new Date('2026-01-02T00:00:00.000Z') });
  assert.equal(result.counts.learnedSources, 1001); assert.equal(result.counts.displayedPages, 0);
  assert.equal(result.counts.multiMemberTopics, 1); assert.equal(result.counts.singletonTopics, 1);
  assert.deepEqual(readFileSync(databasePath), before);
  const bridge = readFileSync(path.join(directory, 'report', 'snapshot.js'), 'utf8');
  assert.equal(bridge.includes('UNREADABLE_VECTOR_SENTINEL'), false); assert.equal(bridge.includes('https:'), false);
});

function web() {
  class Node {
    constructor() { this.children = []; this.attributes = {}; this.hidden = false; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
  }
  const nodes = new Map(), document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
    createElement() { return new Node(); }, createElementNS() { return new Node(); }, querySelectorAll() { return []; } };
  let script = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  script = script.slice(0, script.indexOf("  $('zoom-in').addEventListener")) +
    'globalThis.testApi={normalize,previewData,loadGrowth,growthState};})();';
  const context = vm.createContext({ document, URL, Intl, Date, console }); vm.runInContext(script, context);
  return { api: context.testApi, nodes };
}
const retention = { minuteHours: 24, hourlyDays: 90, maxPoints: 4096 }, seriesId = 'a'.repeat(64);
test('web counts unique displayed members, preview singletons and legacy stats-only unknowns', () => {
  const { api } = web(); const raw = { schemaVersion: 1, counts: {}, topics: [{ id: 't', title: 'Synthetic', x: .5, y: .5, pageCount: 100 }],
    pages: ['a', 'b'].map(id => ({ id, title: id, url: `https://example.org/${id}`, topicId: 't', x: .5, y: .5 })), edges: [] };
  raw.pages.push(raw.pages[0]); const normalized = api.normalize(raw);
  assert.equal(normalized.pages.length, 2); assert.equal(normalized.counts.multiMemberTopics, 1);
  assert.equal(normalized.counts.learnedSources, 2, 'page count never multiplies duplicate membership rows');
  assert.equal(normalized.counts.singletonTopics, 0);
  const preview = api.previewData(normalized, [['a'], ['b']]); assert.equal(preview.counts.multiMemberTopics, 0); assert.equal(preview.counts.singletonTopics, 2);
  const unknown = api.normalize({ schemaVersion: 1, graphLimited: true, counts: { topics: 100 }, topics: [], pages: [], edges: [] });
  assert.equal(unknown.counts.multiMemberTopics, null); assert.equal(unknown.counts.singletonTopics, null);
});
test('v2 chart uses multi-member Topics on both views and never relabels strict v1 history', () => {
  const { api, nodes } = web(); const points = [10, 20].map((learnedPages, index) => ({ at: `2026-01-02T00:0${index}:00.000Z`, seriesId,
    revision: index, learnedPages, totalSources: 20, activeTopics: 9, multiMemberTopics: index + 1, singletonTopics: 8 - index, totalTopics: 10 }));
  api.growthState.view = 'pages'; api.loadGrowth({ schemaVersion: 'catalog-growth/v2', retention, points }, { growthSeriesId: seriesId });
  const topicLine = nodes.get('growth-plot').children.find(node => node.attributes.class === 'growth-line growth-line-topics');
  assert.equal(topicLine.attributes.d, 'M436.00,84.00 L814.00,28.00');
  api.growthState.view = 'time'; api.loadGrowth({ schemaVersion: 'catalog-growth/v2', retention, points }, { growthSeriesId: seriesId });
  assert.match(nodes.get('growth-chart-description').textContent, /Topics mit mindestens zwei Seiten 2, Singleton-Topics 7/u);
  const legacy = points.map(({ multiMemberTopics, singletonTopics, ...point }) => point);
  api.loadGrowth({ schemaVersion: 'catalog-growth/v1', retention, points: legacy }, { growthSeriesId: seriesId });
  assert.equal(nodes.get('growth-chart').hidden, true); assert.match(nodes.get('growth-status').textContent, /Legacy/u);
  assert.equal(nodes.get('growth-plot').children.length, 0);
  assert.match(renderSnapshotScript({}, null, { schemaVersion: 'catalog-growth/v2', retention, points }), /catalog-growth\/v2/u);
});
