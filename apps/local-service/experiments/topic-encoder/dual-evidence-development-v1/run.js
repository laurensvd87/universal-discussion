import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { embedDocuments } from '../e5-infer.js';
import { loadBodyTopicMetric, createBodyTopicMetricTransform } from '../../../src/domain/body-topic-metric.js';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { createOwnerTopicPlanner } from '../../../src/domain/owner-topic-planner.js';
import { planIndexedAlternateTopics, INDEXED_TOPIC_POLICY } from '../../../src/domain/alternate-topic-planner-indexed.js';
import { GRID, BODY_FLOORS, RAW_FLOORS, RAW_RADIUS_FLOOR, scoreMatrices, completeLink, assess, selectDevelopment } from './core.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const corpusSha = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
async function main() {
  const args = process.argv.slice(2), development = args.includes('--development');
  if (args.includes('--freeze') === development || args.some((arg, i) =>
    !['--freeze', '--development', '--freeze-hash'].includes(arg) && args[i - 1] !== '--freeze-hash')) throw new Error('MODE');
  const expected = args[args.indexOf('--freeze-hash') + 1];
  if (development && (!args.includes('--freeze-hash') || !/^[a-f0-9]{64}$/u.test(expected ?? ''))) throw new Error('FREEZE');
  const filename = path.join(os.tmpdir(), 'udl-globesumm-research-20261008', 'news_only.json');
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== 14_972_999) throw new Error('FILE');
  const bytes = await readFile(filename);
  if (sha(bytes) !== corpusSha) throw new Error('CORPUS');
  const short = parseCorpus(bytes).documents, bodies = parseCorpus(bytes, { leadCharacters: 4096 }).documents;
  const byId = new Map(bodies.map(row => [row.id, row]));
  const original = selectEventDisjoint(short), realDev = original.documents.filter(row => row.split === 'validation');
  if (original.documents.length !== 1192 || realDev.length !== 150) throw new Error('DEVELOPMENT_COHORT');
  const fixtureNames = ['../multilingual-authored-v2/chunk-c1/records.jsonl',
    '../multilingual-authored-v2/chunk-c2/records.jsonl', '../multilingual-authored-v2/chunk-c3/records.jsonl',
    '../multilingual-holdout-v6/holdout.jsonl'];
  const fixtureHashes = {}, fixtureRows = [];
  for (const name of fixtureNames) {
    const content = await readFile(new URL(name, import.meta.url));
    fixtureHashes[name] = sha(content);
    fixtureRows.push(content.toString('utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line)));
  }
  const authored = fixtureRows.slice(0, 3).flat();
  const v6 = fixtureRows[3].map(row => ({ ...row, eventKey: row.topicLabel, lang: row.id.split('-').at(-1) }));
  if (authored.length !== 108 || v6.length !== 60 || new Set(authored.map(row => row.eventKey)).size !== 18 ||
      new Set(v6.map(row => row.eventKey)).size !== 12 || authored.some(row => !row.id.startsWith('C'))) throw new Error('FIXTURES');
  const datasets = {
    realDev: realDev.map(row => ({ ...byId.get(row.id), body: byId.get(row.id).lead })), authored, v6,
  };
  const bodyMetric = await loadBodyTopicMetric(fileURLToPath(new URL('../../../data/body-topic-metric-v1.json', import.meta.url)));
  const diagonalAdapter = await loadDiagonalAdapter(fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url)));
  if (bodyMetric.manifestSha256 !== '4ee584e21acc180ca721dc520781f7abdf0b770d96ef28e32ac2b3bb6dc42eeb' ||
      diagonalAdapter.manifestSha256 !== '64067f20d65a2775eb82b428e70fa093e465da3adfca3ab7ad013bbac81997a9') throw new Error('ARTIFACT');
  const names = ['README.md', 'run.js', 'core.js', 'core.test.js', '../indexed-body-quality-v1/core.js', '../e5-infer.js',
    '../real-event-eval/core.js', '../../../src/domain/body-topic-metric.js', '../../../src/domain/diagonal-adapter.js',
    '../../../src/domain/owner-topic-planner.js', '../../../src/domain/alternate-topic-planner-indexed.js',
    '../../../src/domain/alternate-topic-planner.js', '../../../src/domain/errors.js',
    '../compact-paraphrase-probe-v1/RESULTS.md',
    '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
    '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
  const sources = {};
  for (const name of names) sources[name] = sha(await readFile(new URL(name, import.meta.url)));
  const freeze = { schema: 'dual-evidence-development/v1', sources, corpusSha, fixtureHashes,
    cohorts: Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, { rows: rows.length,
      events: new Set(rows.map(row => row.eventKey)).size,
      selectionSha256: sha(JSON.stringify(rows.map(row => [row.id, row.eventKey]))) }])),
    bodyManifest: bodyMetric.manifestSha256, diagonalManifest: diagonalAdapter.manifestSha256,
    bodyFloors: BODY_FLOORS, rawFloors: RAW_FLOORS, rawRadiusFloor: RAW_RADIUS_FLOOR,
    bodyOnlyFloor: BODY_FLOORS[0], indexedControlPolicy: INDEXED_TOPIC_POLICY,
    grouping: 'indexed-body-coarse-then-strongest-body-edge-complete-link-dual-inclusive/v1',
    globalDualComparison: 'separate-global-complete-link-not-runtime',
    selection: { realDevMaxFalse: 1, realDevMaxMixedPages: 2, authoredMaxFalse: 19, authoredMaxMixedPages: 23, v6MaxFalse: 0, v6MaxMixedPages: 0,
      ranking: ['real-dev-pure-pages-desc', 'authored-plus-v6-pure-pages-desc', 'total-false-pairs-asc', 'body-floor-asc', 'raw-floor-asc'] },
    input: 'body-prefix-4096-query-512/v1', developmentOnly: true, reusedSpentCohorts: true,
    fitting: false, shared296Measured: false };
  const freezeHash = sha(JSON.stringify(freeze));
  if (!development) { process.stdout.write(`${JSON.stringify({ freeze, freezeHash })}\n`); return; }
  if (freezeHash !== expected) throw new Error('FREEZE_MISMATCH');
  const bodyTransform = createBodyTopicMetricTransform(bodyMetric), diagonalPlanner = createOwnerTopicPlanner({ diagonalAdapter });
  const bodyPlanner = createOwnerTopicPlanner({ bodyMetric });
  const candidates = GRID.map(candidate => ({ ...candidate, cohorts: {}, globalComparison: {} })), controls = {};
  for (const [name, documents] of Object.entries(datasets)) {
    const rawVectors = new Map(), bodyVectors = new Map();
    for (let offset = 0; offset < documents.length; offset += 64) {
      const chunk = documents.slice(offset, offset + 64), batch = await embedDocuments(chunk, 'body');
      if (batch.vectors.size !== chunk.length) throw new Error('INFERENCE');
      for (const row of chunk) {
        const vector = batch.vectors.get(row.id), norm = vector && Math.hypot(...vector);
        if (!vector || vector.length !== 384 || ![...vector].every(Number.isFinite) ||
            !Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) throw new Error('VECTOR');
        const unit = Array.from(vector, value => value / norm);
        rawVectors.set(row.id, unit); bodyVectors.set(row.id, bodyTransform(unit));
      }
      process.stderr.write(`${JSON.stringify({ progress: 'embedding', cohort: name, rows: Math.min(offset + 64, documents.length), total: documents.length })}\n`);
    }
    const rows = documents.map((row, index) => ({ id: `synthetic-source-${index}`, eventKey: row.eventKey,
      family: row.family ?? row.category, lang: row.lang, viewpoint: row.viewpoint }));
    const relabel = vectors => new Map(rows.map((row, index) => [row.id, vectors.get(documents[index].id)]));
    const raw = relabel(rawVectors), scores = scoreMatrices(rows, raw, relabel(bodyVectors));
    const snapshot = { sources: rows.map(row => ({ id: row.id, provenance: 'owner-local-page-embedding/v1',
      extractorVersion: 'main-text-prefix/v1', embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: raw.get(row.id) } })),
      sourceLinks: rows.map(row => ({ sourceId: row.id, topicId: `synthetic-topic-${row.id}`, method: 'learned-provisional' })) };
    const rawIndexed = planIndexedAlternateTopics(snapshot), diagonalIndexed = diagonalPlanner.plan(snapshot), bodyCoarse = bodyPlanner.plan(snapshot);
    const radius = completeLink(scores, { rawFloor: RAW_RADIUS_FLOOR });
    const bodyOnly = completeLink(scores, { bodyFloor: BODY_FLOORS[0] });
    controls[name] = { rawIndexed: assess(rows, rawIndexed.partitions), diagonalIndexed: assess(rows, diagonalIndexed.partitions),
      bodyIndexedCoarse: assess(rows, bodyCoarse.partitions),
      rawRadius: { ...assess(rows, radius.partitions), admittedPairs: radius.admittedPairs },
      bodyOnly: { ...assess(rows, bodyOnly.partitions), admittedPairs: bodyOnly.admittedPairs } };
    for (const candidate of candidates) {
      const plan = completeLink(scores, { ...candidate, coarsePartitions: bodyCoarse.partitions });
      candidate.cohorts[name] = { ...assess(rows, plan.partitions), admittedPairs: plan.admittedPairs };
      const global = completeLink(scores, candidate);
      candidate.globalComparison[name] = { ...assess(rows, global.partitions), admittedPairs: global.admittedPairs };
    }
    process.stderr.write(`${JSON.stringify({ progress: 'scored-development-grid', cohort: name, candidates: 16, rows: rows.length })}\n`);
  }
  const selection = selectDevelopment(candidates);
  process.stdout.write(`${JSON.stringify({ freezeHash, developmentOnly: true, reusedSpentCohorts: true,
    shared296Measured: false, controls, candidates, selection, errors: 0, partialPartitionsReturned: false,
    caveats: ['development-selection-not-independent-precision', 'synthetic-viewpoints-not-independent-publishers',
      'same-family-adjacent-story-proxy-not-gold', 'body-prefix-not-Chrome-capture', 'no-live-activation'],
    vectorsSaved: false, weightsSaved: false, fitting: false, activated: false })}\n`);
}
main().catch(() => { process.stderr.write('{"error":"DUAL_EVIDENCE_DEVELOPMENT_FAILED"}\n'); process.exitCode = 1; });
