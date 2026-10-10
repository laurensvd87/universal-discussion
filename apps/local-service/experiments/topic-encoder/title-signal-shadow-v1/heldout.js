// Frozen 0.90 title-floor diagnostic on existing synthetic and private held-out sets.
// No URL fetch, provider call, file write, or raw content/vector output.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { planAlternateTopics } from '../../../src/domain/alternate-topic-planner.js';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { embedDocuments } from '../e5-infer.js';

const SYNTHETIC = fileURLToPath(new URL('../multilingual-holdout-v6/holdout.jsonl', import.meta.url));
const PRIVATE = path.join(os.tmpdir(), 'udl-globesumm-research-20261008', 'news_only.json');
const ADAPTER = fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url));
const SYNTHETIC_SHA = '032eaa490d0ae6b9067ec479be4a80b563229606f83ce0f43a1bc9efd4098aeb';
const PRIVATE_SHA = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const TITLE_FLOOR = 0.90;
const digest = value => createHash('sha256').update(value).digest('hex');
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

async function verifiedBytes(filename, expected, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('Invalid fixed corpus');
  const bytes = await readFile(filename);
  if (bytes.length !== info.size || digest(bytes) !== expected) throw new Error('Fixed corpus digest mismatch');
  return bytes;
}

async function loadSets() {
  const syntheticBytes = await verifiedBytes(SYNTHETIC, SYNTHETIC_SHA, 100_000);
  const synthetic = syntheticBytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  if (synthetic.length !== 60 || synthetic.some(row => row.split !== 'holdout')) throw new Error('Invalid synthetic split');
  const privateBytes = await verifiedBytes(PRIVATE, PRIVATE_SHA, 15_000_000);
  const selection = selectEventDisjoint(parseCorpus(privateBytes, { leadCharacters: 4096 }).documents);
  const real = selection.documents.filter(row => row.split === 'test');
  if (real.length !== 293 || new Set(real.map(row => row.eventKey)).size < 3)
    throw new Error('Invalid private held-out split');
  return [
    { label: 'authored-multilingual-v6', rows: synthetic.map(row => ({
      id: row.id, title: row.title, body: row.body, gold: row.topicLabel })) },
    { label: 'GlobeSumm-selected-test', rows: real.map(row => ({
      id: row.id, title: row.title, body: row.lead, gold: row.eventKey })) },
  ];
}

function titleSplit(partitions, titles) {
  const result = [];
  for (const part of partitions) {
    const clusters = [];
    for (const id of [...part.sourceIds].sort()) {
      const cluster = clusters.find(group => group.every(member => dot(titles.get(id), titles.get(member)) >= TITLE_FLOOR));
      if (cluster) cluster.push(id);
      else clusters.push([id]);
    }
    result.push(...clusters.map(sourceIds => ({ sourceIds })));
  }
  return result;
}

function score(partitions, rows) {
  const gold = new Map(rows.map(row => [row.id, row.gold]));
  let correctPairs = 0, falsePairs = 0, pagesInPureMultiGroups = 0;
  for (const part of partitions) {
    if (part.sourceIds.length < 2) continue;
    let pure = true;
    for (let i = 0; i < part.sourceIds.length; i++) for (let j = i + 1; j < part.sourceIds.length; j++) {
      if (gold.get(part.sourceIds[i]) === gold.get(part.sourceIds[j])) correctPairs++;
      else { falsePairs++; pure = false; }
    }
    if (pure) pagesInPureMultiGroups += part.sourceIds.length;
  }
  return { correctPairs, falsePairs, pagesInPureMultiGroups };
}

async function evaluate({ label, rows }, adapter) {
  const started = performance.now();
  const body = await embedDocuments(rows.map(({ id, title, body }) => ({ id, title, body })), 'body');
  const title = await embedDocuments(rows.map(({ id, title }) => ({ id, title, body: title })), 'body');
  const sources = rows.map(row => ({ id: row.id, provenance: 'owner-local-page-embedding/v1',
    extractorVersion: 'main-text-prefix/v1', embedding: {
      modelId: 'e5-small-q8-browser-main-prefix-v1', values: body.vectors.get(row.id) } }));
  const sourceLinks = rows.map(row => ({ sourceId: row.id, topicId: `topic-${row.id}`,
    method: 'learned-provisional' }));
  const methods = {};
  for (const [name, fitted] of [['raw-E5', null], ['diagonal', adapter]]) {
    const planStart = performance.now();
    const plan = planAlternateTopics({ sources, sourceLinks, adapter: fitted });
    const before = score(plan.partitions, rows);
    const after = score(titleSplit(plan.partitions, title.vectors), rows);
    methods[name] = { before, after, plannerAndTitleFilterMs: Math.round(performance.now() - planStart) };
  }
  const truePairDenominator = [...new Map(rows.map(row => [row.gold, null])).keys()].reduce((sum, key) => {
    const count = rows.filter(row => row.gold === key).length;
    return sum + count * (count - 1) / 2;
  }, 0);
  return { set: label, pages: rows.length, truePairDenominator, titleFloor: TITLE_FLOOR,
    bodyInferenceMs: Math.round(body.elapsedMs), titleInferenceMs: Math.round(title.elapsedMs),
    methods, totalMs: Math.round(performance.now() - started) };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No command-line options');
  const adapter = await loadDiagonalAdapter(ADAPTER);
  const sets = await loadSets();
  for (const selected of sets) process.stdout.write(`${JSON.stringify(await evaluate(selected, adapter))}\n`);
}

main().catch(() => { process.stderr.write('Held-out title shadow failed: invalid-or-unavailable\n'); process.exitCode = 1; });
