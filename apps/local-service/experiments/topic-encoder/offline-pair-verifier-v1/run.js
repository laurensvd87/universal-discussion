import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, safeDiagnostic, prepareCorpus, selectWholeEvents } from
  '../wikinews-benchmark-v1/core.js';
import { fitMetric, transform } from '../wikinews-train-v1/core.js';
import { normalizeMap, fitVerifier, verifierScore, developmentCutoff,
  evaluatePairs, cosineScore } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');
const WIKI_SHA = 'b03da8d71ada96779e860e29a523a7e9f8bf5de3b595b45fd3c12d53b81958fa';
const SYNTHETIC = [
  ['train-part-1.jsonl', '94A14A36B016795B504E22BE9C5C3E1AADB372BDD6D013B9B791E09AC5D81254'],
  ['train-part-2.jsonl', '7240A9848CEE76A2857A737740E4F280F9A9CD7C15D1B38689C9246FF2160DB6'],
  ['validation.jsonl', 'EF9F405DF2F8C98054E4F5B465F4FEC3D06287D537E9A08BE3455CE36D35DB99'],
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
};

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    throw new BenchmarkError('path', 'ABSOLUTE_PATH_REQUIRED');
  let root, file, repo;
  try { [root, file, repo] = await Promise.all([realpath(privateDir), realpath(input), realpath(REPO)]); }
  catch { throw new BenchmarkError('path', 'PATH_ACCESS'); }
  if (!path.relative(repo, root) || inside(repo, root) || !inside(root, file) ||
      !path.relative(repo, file) || inside(repo, file))
    throw new BenchmarkError('path', 'PRIVATE_PATH_SCOPE');
  const info = await lstat(input).catch(() => { throw new BenchmarkError('path', 'INPUT_STAT'); });
  if (!info.isFile() || info.isSymbolicLink() || info.size !== 45258115)
    throw new BenchmarkError('path', 'INPUT_FILE_BOUND');
  const bytes = await readFile(input).catch(() => { throw new BenchmarkError('path', 'INPUT_READ'); });
  if (sha(bytes).toLowerCase() !== WIKI_SHA) throw new BenchmarkError('input', 'HASH_MISMATCH');
  return bytes;
}

async function syntheticDocuments() {
  const groups = [];
  for (const [filename, expected] of SYNTHETIC) {
    const bytes = await readFile(path.resolve(HERE, '../multilingual-train-v2', filename));
    if (sha(bytes) !== expected) throw new BenchmarkError('synthetic', 'DIGEST');
    const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
    const expectedSplit = filename === 'validation.jsonl' ? 'validation' : 'train';
    if (rows.length !== 60 || rows.some(row => row.split !== expectedSplit ||
      typeof row.id !== 'string' || typeof row.family !== 'string' ||
      typeof row.topicLabel !== 'string' || typeof row.title !== 'string' ||
      typeof row.body !== 'string' || !row.title.trim() || !row.body.trim()))
      throw new BenchmarkError('synthetic', 'SCHEMA');
    groups.push(rows.map(row => ({ id: row.id, eventKey: row.topicLabel,
      title: row.title, lead: row.body.slice(0, 384), lang: row.id.split('-')[1],
      categories: [row.family], split: expectedSplit })));
  }
  const train = groups[0].concat(groups[1]), validation = groups[2];
  if (new Set([...train, ...validation].map(doc => doc.id)).size !== 180 ||
      new Set(train.map(doc => doc.eventKey)).size !== 24 ||
      new Set(validation.map(doc => doc.eventKey)).size !== 12 ||
      new Set(train.map(doc => doc.categories[0])).size !== 8 ||
      new Set(validation.map(doc => doc.categories[0])).size !== 4 ||
      train.some(doc => validation.some(other => other.categories[0] === doc.categories[0])))
    throw new BenchmarkError('synthetic', 'SPLIT_LEAKAGE');
  return { train, validation };
}

const buildInput = docs => docs.map(doc => ({ id: doc.id, title: doc.title, body: doc.lead }));
const scoreSet = (docs, vectors, verifier, diagonal) => ({
  verifier: evaluatePairs(docs, vectors, (a, b) => verifierScore(verifier.model, a, b), verifier.threshold),
  rawFixed094: evaluatePairs(docs, vectors, cosineScore, 0.94),
  rawPriorWikiCalibrated: evaluatePairs(docs, vectors, cosineScore, 0.895295),
  diagonalPriorWikiCalibrated: evaluatePairs(docs, diagonal, cosineScore, 0.897529),
});

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', privateCorpusOpened: false,
      modelLoaded: false, testEmbedded: false, savedWeights: false,
      externalCapabilities: 'denied' })}\n`);
    return;
  }
  const [mode, privateFlag, privateDir, inputFlag, input] = process.argv.slice(2);
  if (process.argv.length !== 7 || mode !== '--run' || privateFlag !== '--private-dir' ||
      inputFlag !== '--input') throw new BenchmarkError('arguments', 'EXPECTED_RUN_PRIVATE_DIR_INPUT');
  const wiki = prepareCorpus(await privateInput(privateDir, input));
  const selected = selectWholeEvents(wiki.documents).documents;
  const wikiTrain = selected.filter(doc => doc.split === 'train');
  const wikiValidation = selected.filter(doc => doc.split === 'validation');
  if (wikiTrain.length !== 737 || wikiValidation.length !== 207)
    throw new BenchmarkError('selection', 'SPLIT_COUNT');
  const synthetic = await syntheticDocuments();
  const started = performance.now();
  const { embedDocuments } = await import('../e5-infer.js');
  // Deliberately exclude Wiki test and any synthetic test before embedding.
  const wikiEmbedding = await embedDocuments(buildInput(wikiTrain.concat(wikiValidation)), 'title-lead');
  const syntheticEmbedding = await embedDocuments(buildInput(synthetic.train.concat(synthetic.validation)), 'title-lead');
  const wikiVectors = normalizeMap(wikiTrain.concat(wikiValidation), wikiEmbedding.vectors);
  const syntheticVectors = normalizeMap(synthetic.train.concat(synthetic.validation), syntheticEmbedding.vectors);
  const model = fitVerifier(wikiTrain, synthetic.train, wikiVectors, syntheticVectors);
  const threshold = developmentCutoff([wikiValidation, synthetic.validation],
    [wikiVectors, syntheticVectors], (a, b) => verifierScore(model, a, b));
  const diagonalModel = fitMetric(wikiTrain, wikiEmbedding.vectors);
  const wikiDiagonal = new Map(wikiValidation.map(doc => [doc.id,
    transform(wikiEmbedding.vectors.get(doc.id), diagonalModel.weights, 1)]));
  const syntheticDiagonal = new Map(synthetic.validation.map(doc => [doc.id,
    transform(syntheticEmbedding.vectors.get(doc.id), diagonalModel.weights, 1)]));
  const verifier = { model, threshold };
  const report = { mode: 'development-only', researchOnly: true, wikiSha256: WIKI_SHA,
    syntheticSha256: SYNTHETIC.map(item => item[1]),
    representation: 'packaged-E5-title-plus-384-character-lead',
    modelSha256: wikiEmbedding.assets.modelSha256,
    train: { wikiArticles: wikiTrain.length, syntheticArticles: synthetic.train.length,
      pairStrata: model.trainCounts },
    selection: { method: 'combined-development-max-negative-plus-0.002', threshold,
      abstained: threshold === null },
    development: { wiki: scoreSet(wikiValidation, wikiVectors, verifier, wikiDiagonal),
      synthetic: scoreSet(synthetic.validation, syntheticVectors, verifier, syntheticDiagonal) },
    embeddingMs: { wiki: Math.round(wikiEmbedding.elapsedMs),
      synthetic: Math.round(syntheticEmbedding.elapsedMs) },
    totalMs: Math.round(performance.now() - started), testEmbedded: false,
    savedWeights: false, activated: false };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
