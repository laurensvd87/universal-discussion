import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { selectFreshRethink } from '../topic-metric-rethink-v1/core.js';
import { embedDocuments } from '../e5-infer.js';
import { loadBodyTopicMetric } from '../../../src/domain/body-topic-metric.js';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { createOwnerTopicPlanner, OWNER_BODY_TOPIC_ADMISSION } from '../../../src/domain/owner-topic-planner.js';
import { planIndexedAlternateTopics, INDEXED_TOPIC_POLICY } from '../../../src/domain/alternate-topic-planner-indexed.js';
import { aggregatePartition, policyDifference } from './core.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const corpusSha = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
async function main() {
  const measuring = process.argv.includes('--measure');
  if (process.argv.includes('--freeze') === measuring) throw new Error('MODE');
  const expected = process.argv[process.argv.indexOf('--freeze-hash') + 1];
  if (measuring && (!process.argv.includes('--freeze-hash') || !/^[a-f0-9]{64}$/u.test(expected ?? ''))) throw new Error('FREEZE');
  const filename = path.join(os.tmpdir(), 'udl-globesumm-research-20261008', 'news_only.json');
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== 14_972_999) throw new Error('FILE');
  const bytes = await readFile(filename);
  if (sha(bytes) !== corpusSha) throw new Error('CORPUS');
  const short = parseCorpus(bytes).documents, bodies = parseCorpus(bytes, { leadCharacters: 4096 }).documents;
  const byId = new Map(bodies.map(row => [row.id, row]));
  const original = selectEventDisjoint(short), preliminary = selectEventDisjoint(short, 300);
  const prior = selectFreshEvents(short, original.documents, preliminary.documents);
  const bodyPrior = selectBodyTransferEvents(short, original.documents, preliminary.documents, prior.documents);
  const cohort = selectFreshRethink(short, [original.documents, preliminary.documents, prior.documents, bodyPrior.documents]);
  if (cohort.documents.length !== 296 || cohort.events !== 24) throw new Error('COHORT');
  const syntheticFiles = ['../multilingual-authored-v2/chunk-c1/records.jsonl',
    '../multilingual-authored-v2/chunk-c2/records.jsonl', '../multilingual-authored-v2/chunk-c3/records.jsonl',
    '../multilingual-holdout-v6/holdout.jsonl'];
  const syntheticHashes = {}, syntheticRows = [];
  for (const name of syntheticFiles) {
    const content = await readFile(new URL(name, import.meta.url));
    syntheticHashes[name] = sha(content);
    syntheticRows.push(content.toString('utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line)));
  }
  const authored = syntheticRows.slice(0, 3).flat();
  const v6 = syntheticRows[3].map(row => ({ ...row, eventKey: row.topicLabel }));
  if (authored.length !== 108 || v6.length !== 60 || authored.some(row => !row.id.startsWith('C')) ||
      [...authored, ...v6].some(row => !row.eventKey || !row.body || !row.title)) throw new Error('SYNTHETIC_COHORT');
  const datasets = [
    { label: 'shared296-reused', documents: cohort.documents.map(row => ({ ...byId.get(row.id), body: byId.get(row.id).lead })) },
    { label: 'authored-C108-reused', documents: authored },
    { label: 'synthetic-v6-60-spent', documents: v6 },
  ];
  const bodyMetric = await loadBodyTopicMetric(fileURLToPath(new URL('../../../data/body-topic-metric-v1.json', import.meta.url)));
  const diagonalAdapter = await loadDiagonalAdapter(fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url)));
  const names = ['README.md', 'run.js', 'core.js', '../e5-infer.js', '../real-event-eval/core.js',
    '../real-diagonal-fresh-v1/core.js', '../real-diagonal-body-transfer-v1/core.js', '../real-diagonal-holdout-v1/core.js',
    '../topic-metric-rethink-v1/core.js',
    '../../../src/domain/body-topic-metric.js', '../../../src/domain/diagonal-adapter.js',
    '../../../src/domain/owner-topic-planner.js', '../../../src/domain/alternate-topic-planner-indexed.js',
    '../../../src/domain/alternate-topic-planner.js', '../../../src/domain/errors.js',
    '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
    '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
  const sources = {};
  for (const name of names) sources[name] = sha(await readFile(new URL(name, import.meta.url)));
  const freeze = { schema: 'indexed-body-quality/v1', sources, corpusSha, syntheticHashes,
    cohort: { rows: 296, events: 24, selectionSha256: sha(JSON.stringify(cohort.documents.map(row => [row.id, row.eventKey]))) },
    additionalReusedCohorts: datasets.slice(1).map(dataset => ({ label: dataset.label, rows: dataset.documents.length,
      events: new Set(dataset.documents.map(row => row.eventKey)).size })),
    bodyManifest: bodyMetric.manifestSha256, diagonalManifest: diagonalAdapter.manifestSha256,
    rawAndDiagonalPolicy: INDEXED_TOPIC_POLICY, bodyAdmission: OWNER_BODY_TOPIC_ADMISSION,
    input: 'body-prefix-4096-query-512/v1', reusedMeasuredCohort: true, fitting: false };
  const freezeHash = sha(JSON.stringify(freeze));
  if (!measuring) { process.stdout.write(`${JSON.stringify({ freeze, freezeHash })}\n`); return; }
  if (freezeHash !== expected) throw new Error('FREEZE_MISMATCH');
  const planners = { raw: { policyVersion: INDEXED_TOPIC_POLICY.version, representation: 'raw-e5-baseline', plan: planIndexedAlternateTopics },
    diagonal: createOwnerTopicPlanner({ diagonalAdapter }), body: createOwnerTopicPlanner({ bodyMetric }) };
  const results = [];
  for (const dataset of datasets) {
  const rawRows = dataset.documents;
  const vectors = new Map();
  for (let offset = 0; offset < rawRows.length; offset += 64) {
    const documents = rawRows.slice(offset, offset + 64);
    const batch = await embedDocuments(documents, 'body');
    if (batch.vectors.size !== documents.length) throw new Error('INFERENCE');
    for (const row of documents) {
      const vector = batch.vectors.get(row.id);
      if (!vector || vector.length !== 384 || ![...vector].every(Number.isFinite)) throw new Error('VECTOR');
      const norm = Math.hypot(...vector);
      if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) throw new Error('NORM');
      vectors.set(row.id, Array.from(vector, value => value / norm));
    }
    process.stderr.write(`${JSON.stringify({ progress: 'embedding', cohort: dataset.label,
      rows: Math.min(offset + 64, rawRows.length), total: rawRows.length })}\n`);
  }
  const rows = rawRows.map((row, index) => ({ id: `synthetic-source-${index}`, eventKey: row.eventKey,
    family: row.family ?? row.category, viewpoint: row.viewpoint }));
  const snapshot = { sources: rows.map((row, index) => ({ id: row.id, provenance: 'owner-local-page-embedding/v1',
    extractorVersion: 'main-text-prefix/v1', embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1',
      values: vectors.get(rawRows[index].id) } })),
    sourceLinks: rows.map(row => ({ sourceId: row.id, topicId: `synthetic-topic-${row.id}`, method: 'learned-provisional' })) };
  const methods = {}, partitions = {};
  for (const [name, planner] of Object.entries(planners)) {
    try {
      const result = planner.plan(snapshot);
      methods[name] = { status: 'complete', policyVersion: result.policyVersion,
        representation: result.diagnostics.representation, diagnostics: result.diagnostics,
        ...aggregatePartition(rows, result.partitions), ...challengeExposure(rows, result.partitions) };
      partitions[name] = result.partitions;
    } catch (error) {
      if (error.code !== 'capacity') throw error;
      methods[name] = { status: 'capacity-failclosed', partialPartitionReturned: false,
        policyVersion: planner.policyVersion, representation: planner.representation };
    }
  }
  const differences = {};
  for (const [a, b] of [['raw', 'diagonal'], ['raw', 'body'], ['diagonal', 'body']]) {
    differences[`${a}-to-${b}`] = partitions[a] && partitions[b] ? policyDifference(rows, partitions[a], partitions[b]) : null;
  }
  results.push({ label: dataset.label, reusedMeasuredCohort: true, rows: rows.length,
    events: new Set(rows.map(row => row.eventKey)).size, methods, differences });
  }
  process.stdout.write(`${JSON.stringify({ freezeHash, cohorts: results,
    caveats: ['all-cohorts-reused-not-independent-holdouts', 'synthetic-viewpoints-not-independent-publishers',
      'same-family-different-event-is-an-adjacent-story-proxy-not-gold', 'body-prefix-not-Chrome-capture',
      'representation-and-admission-both-differ', 'fixed-installed-artifacts-no-fit-or-retune', 'not-a-rights-or-release-gate'],
    vectorsSaved: false, weightsSaved: false, activated: false })}\n`);
}

function challengeExposure(rows, partitions) {
  const groups = new Map(partitions.flatMap((part, index) => part.sourceIds.map(id => [id, index])));
  const opposingViewpointPairs = { total: 0, joined: 0 }, sameFamilyDifferentEventPairs = { total: 0, joined: 0 };
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], joined = groups.get(a.id) === groups.get(b.id);
    if (a.eventKey === b.eventKey && a.viewpoint && b.viewpoint && a.viewpoint !== b.viewpoint) {
      opposingViewpointPairs.total++; if (joined) opposingViewpointPairs.joined++;
    }
    if (a.family && a.family === b.family && a.eventKey !== b.eventKey) {
      sameFamilyDifferentEventPairs.total++; if (joined) sameFamilyDifferentEventPairs.joined++;
    }
  }
  return { opposingViewpointPairs, sameFamilyDifferentEventPairs };
}
main().catch(() => { process.stderr.write('{"error":"INDEXED_BODY_QUALITY_FAILED"}\n'); process.exitCode = 1; });
