import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap, evaluatePairs, developmentCutoff,
  cosineScore } from '../offline-pair-verifier-v1/core.js';
import { fitVerifier, verifierScore } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = [
  ['train-part-1.jsonl', '94A14A36B016795B504E22BE9C5C3E1AADB372BDD6D013B9B791E09AC5D81254'],
  ['train-part-2.jsonl', '7240A9848CEE76A2857A737740E4F280F9A9CD7C15D1B38689C9246FF2160DB6'],
  ['validation.jsonl', 'EF9F405DF2F8C98054E4F5B465F4FEC3D06287D537E9A08BE3455CE36D35DB99'],
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fail = code => { throw new TypeError(code); };

async function corpus() {
  const groups = [];
  for (const [filename, expected] of FILES) {
    const bytes = await readFile(path.resolve(HERE, '../multilingual-train-v2', filename));
    if (sha(bytes) !== expected) fail('DIGEST');
    const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
    const split = filename === 'validation.jsonl' ? 'validation' : 'train';
    if (rows.length !== 60 || rows.some(row => row.split !== split ||
      typeof row.id !== 'string' || typeof row.family !== 'string' ||
      typeof row.topicLabel !== 'string' || typeof row.title !== 'string' ||
      typeof row.body !== 'string' || !row.title.trim() || !row.body.trim()))
      fail('SCHEMA');
    groups.push(rows.map(row => ({ id: row.id, eventKey: row.topicLabel,
      title: row.title, lead: row.body.slice(0, 384), lang: row.id.split('-')[1],
      categories: [row.family] })));
  }
  const train = groups[0].concat(groups[1]), validation = groups[2];
  if (new Set([...train, ...validation].map(doc => doc.id)).size !== 180 ||
      new Set(train.map(doc => doc.eventKey)).size !== 24 ||
      new Set(validation.map(doc => doc.eventKey)).size !== 12 ||
      new Set(train.map(doc => doc.categories[0])).size !== 8 ||
      new Set(validation.map(doc => doc.categories[0])).size !== 4 ||
      train.some(doc => validation.some(other => other.categories[0] === doc.categories[0])))
    fail('SPLIT_LEAKAGE');
  return { train, validation };
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', dataOpened: false,
      modelLoaded: false, testEmbedded: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--run') fail('ARGUMENTS');
  const { train, validation } = await corpus();
  const started = performance.now();
  const { embedDocuments } = await import('../e5-infer.js');
  const { vectors: raw, elapsedMs, assets } = await embedDocuments(
    train.concat(validation).map(doc => ({ id: doc.id, title: doc.title, body: doc.lead })),
    'title-lead');
  const vectors = normalizeMap(train.concat(validation), raw);
  const model = fitVerifier(train, vectors);
  if (model.trainCounts.positives !== 240 || model.trainCounts.hardNegatives !== 600)
    fail('TRAIN_COUNTS');
  const cutoff = developmentCutoff([validation], [vectors],
    (a, b) => verifierScore(model, a, b));
  const result = { mode: 'synthetic-development', researchOnly: true,
    representation: 'packaged-E5-title-plus-384-character-lead',
    modelSha256: assets.modelSha256, syntheticSha256: FILES.map(item => item[1]),
    train: { articles: train.length, events: 24, families: 8,
      pairStrata: model.trainCounts },
    validation: { articles: validation.length, events: 12, families: 4,
      selectedCutoff: cutoff, selection: 'max-development-negative-plus-0.002',
      verifier: evaluatePairs(validation, vectors,
        (a, b) => verifierScore(model, a, b), cutoff),
      rawFixed094: evaluatePairs(validation, vectors, cosineScore, 0.94),
      rawPriorWikiCalibrated: evaluatePairs(validation, vectors, cosineScore, 0.895295) },
    embeddingMs: Math.round(elapsedMs), totalMs: Math.round(performance.now() - started),
    testEmbedded: false, savedWeights: false, activated: false };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
