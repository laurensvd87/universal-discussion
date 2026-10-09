import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedDocuments } from '../e5-infer.js';
import { fitDiagonal, normalizeVectors, transform } from '../real-diagonal-adapter-v1/core.js';
import { prepareGraph, calibrate, admit, evaluate, denominators } from '../local-contrast-gate-v1/core.js';
import { coverageForGraph } from '../real-diagonal-adapter-v1/coverage.js';
import { cosine } from '../event-token-pool-v1/core.js';
import { loadOwned } from '../owned-diagonal-transfer-v1/runner.js';
import { fitMultiDiagonal } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, '../multilingual-authored-v2');
const C_HASHES = Object.freeze({
  c1: '20BAB9B116C6F32C2FB7058C3D822AF333503EC36CBCF9CBB7365E9F45BAC581',
  c2: '44AC29625DFBD86F7AF2C278EAB991E042D0E6E0FA64A92D95D3B1F7951BBF6F',
  c3: '659F2E9A27651B6577D2686F8B3849E56E6A36984471620980BCCA68B880F1FE',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

async function loadDevelopment() {
  const chunks = [];
  for (const [name, expected] of Object.entries(C_HASHES)) {
    const bytes = await readFile(path.join(CORPUS, `chunk-${name}`, 'records.jsonl'));
    if (sha(bytes) !== expected || !bytes.toString('utf8').endsWith('\n'))
      throw new TypeError('DEVELOPMENT_DIGEST');
    const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse);
    if (rows.length !== 36) throw new TypeError('DEVELOPMENT_COUNT');
    chunks.push(...rows);
  }
  const events = new Map();
  for (const row of chunks) {
    if (typeof row.id !== 'string' || typeof row.family !== 'string' ||
        typeof row.eventKey !== 'string' || typeof row.lang !== 'string' ||
        typeof row.title !== 'string' || typeof row.body !== 'string' ||
        !['de', 'en', 'es', 'fr', 'nl'].includes(row.lang))
      throw new TypeError('DEVELOPMENT_SCHEMA');
    const members = events.get(row.eventKey) ?? [];
    members.push(row); events.set(row.eventKey, members);
  }
  if (new Set(chunks.map(row => row.id)).size !== 108 || events.size !== 18 ||
      [...events.values()].some(rows => rows.length !== 6 ||
        new Set(rows.map(row => row.lang)).size !== 5 ||
        new Set(rows.map(row => row.family)).size !== 1))
    throw new TypeError('DEVELOPMENT_PARTITION');
  return chunks;
}

export function evaluateMethods(calibration, development, vectors, learned) {
  const rowsB = calibration.map(row => ({ ...row, categories: [row.family] }));
  const rowsC = development.map(row => ({ ...row, categories: [row.family] }));
  const all = [...calibration, ...development];
  const results = {};
  for (const [name, methodVectors] of [
    ['raw-E5', normalizeVectors(all, vectors)],
    ['static-owned-diagonal', transform(all, vectors, learned.static.parameters)],
    ['multi-mined-owned-diagonal', transform(all, vectors, learned.multi.parameters)],
  ]) {
    const setting = calibrate(prepareGraph(rowsB, methodVectors, cosine))['double-support'];
    const graph = prepareGraph(rowsC, methodVectors, cosine);
    const gold = denominators(graph);
    if (gold.articles !== 108 || gold.events !== 18 || gold.truePairs !== 270)
      throw new TypeError('DEVELOPMENT_GOLD');
    const edges = admit(graph, 'double-support', setting);
    const admission = evaluate(graph, edges);
    results[name] = { calibration: setting, gold, admission,
      coverage: coverageForGraph(graph, edges, admission) };
  }
  return results;
}

async function main() {
  if (process.argv.length !== 2) throw new TypeError('NO_ARGUMENTS');
  const { a, b } = await loadOwned();
  const c = await loadDevelopment();
  const ids = [...a, ...b, ...c].map(row => row.id);
  if (new Set(ids).size !== 324) throw new TypeError('SPLIT_COLLISION');
  const inputs = [...a, ...b, ...c].map(row => ({ id: row.id, title: row.title,
    body: row.body.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 384) }));
  const embedded = await embedDocuments(inputs, 'title-lead');
  if (embedded.assets.modelSha256.toUpperCase() !==
      'F80102D3F2A1229F387D3C81909990D8945513E347B0EAB049F7DE3C6F98C193')
    throw new TypeError('MODEL_DIGEST');
  const staticFit = fitDiagonal(a.map(row => ({ ...row, category: row.family })),
    embedded.vectors);
  const multiFit = fitMultiDiagonal(a, embedded.vectors);
  const methods = evaluateMethods(b, c, embedded.vectors,
    { static: staticFit, multi: multiFit });
  process.stdout.write(`${JSON.stringify({ experiment: 'owned-diagonal-mining-v1',
    researchOnly: true, data: { fit: a.length, calibration: b.length,
      development: c.length, input: 'E5-title-plus-384-character-lead',
      cHashes: C_HASHES },
    fit: { staticTriplets: staticFit.triplets, multiComparisonsPerRound:
      multiFit.comparisonsPerRound, multiRemineRounds: multiFit.remineRounds,
      steps: multiFit.steps }, methods, limitations: [
      'synthetic-authoring-shortcuts', 'development-cases-previously-used',
      'calibration-B-negative-maximum-is-not-independent-precision',
      'no-real-publisher-transfer', 'title-lead-is-not-live-body-input',
      'root-route-churn-unmeasured', 'v5-holdout-unopened' ],
    weightsSaved: false, providerCalls: false, activated: false }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.message ?? 'UNKNOWN' })}\n`);
  process.exitCode = 1;
}
