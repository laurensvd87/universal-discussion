import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, prepareCorpus, selectWholeEvents, inspect } from
  '../wikinews-benchmark-v1/core.js';
import { freezeWiki, evaluateTransfer } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');
const syntheticFile = path.resolve(here, '../multilingual-train-v2/validation.jsonl');
const syntheticSha256 = 'EF9F405DF2F8C98054E4F5B465F4FEC3D06287D537E9A08BE3455CE36D35DB99';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
};

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    throw new BenchmarkError('path', 'ABSOLUTE_PATH_REQUIRED');
  let root, file, repository;
  try { [root, file, repository] = await Promise.all([
    realpath(privateDir), realpath(input), realpath(repo)]); }
  catch { throw new BenchmarkError('path', 'PATH_ACCESS'); }
  if (!path.relative(repository, root) || inside(repository, root) || !inside(root, file) ||
      !path.relative(repository, file) || inside(repository, file))
    throw new BenchmarkError('path', 'PRIVATE_PATH_SCOPE');
  const info = await lstat(input);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new BenchmarkError('path', 'INPUT_FILE_BOUND');
  return readFile(input);
}

export function syntheticDocuments(bytes) {
  if (sha256(bytes) !== syntheticSha256) throw new BenchmarkError('synthetic', 'DIGEST');
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
  if (rows.length !== 60 || new Set(rows.map(row => row.id)).size !== 60 ||
      new Set(rows.map(row => row.topicLabel)).size !== 12 ||
      new Set(rows.map(row => row.family)).size !== 4 ||
      rows.some(row => row.split !== 'validation' || typeof row.title !== 'string' ||
        typeof row.body !== 'string' || !row.title.trim() || !row.body.trim()))
    throw new BenchmarkError('synthetic', 'SCHEMA');
  return rows.map(row => ({ id: row.id, eventKey: row.topicLabel, title: row.title,
    lead: row.body.slice(0, 384), lang: row.id.split('-')[1], categories: [row.family],
    duplicateKey: sha256(Buffer.from(`${row.title}\0${row.body}`)) }));
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', privateCorpusOpened: false,
      syntheticCorpusOpened: false, modelLoaded: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  const [mode, privateFlag, privateDir, inputFlag, input] = process.argv.slice(2);
  if (process.argv.length !== 7 || mode !== '--run' || privateFlag !== '--private-dir' ||
      inputFlag !== '--input')
    throw new BenchmarkError('arguments', 'EXPECTED_RUN_PRIVATE_DIR_INPUT');
  const corpus = prepareCorpus(await privateInput(privateDir, input));
  const selection = selectWholeEvents(corpus.documents);
  const wiki = selection.documents;
  const train = wiki.filter(doc => doc.split === 'train');
  const validation = wiki.filter(doc => doc.split === 'validation');
  if (train.length < 2 || validation.length < 2)
    throw new BenchmarkError('selection', 'SPLIT_EMPTY');
  const { embedDocuments } = await import('../e5-infer.js');
  const wikiEmbeddings = await embedDocuments(wiki.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const frozen = freezeWiki(train, validation, wikiEmbeddings.vectors);

  // Open the second corpus only after the learned and raw Wiki gates are frozen.
  const synthetic = syntheticDocuments(await readFile(syntheticFile));
  const syntheticEmbeddings = await embedDocuments(synthetic.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const outcome = evaluateTransfer(synthetic, syntheticEmbeddings.vectors, frozen);
  process.stdout.write(`${JSON.stringify({ mode: 'cross-corpus-transfer', researchOnly: true,
    wikiSha256: corpus.inputSha256, syntheticSha256,
    modelSha256: wikiEmbeddings.assets.modelSha256,
    wikiSelection: inspect(corpus, selection),
    wikiTraining: { articles: train.length, triplets: frozen.model.triplets,
      sharedCategoryTriplets: frozen.model.categoryTriplets },
    wikiValidation: { articles: validation.length, rawThreshold: frozen.rawThreshold,
      selectedStrength: frozen.selected?.strength ?? null,
      selectedThreshold: frozen.selected?.threshold ?? null },
    synthetic: { articles: synthetic.length, goldTopics: 12,
      families: 4, languages: 5, outcome },
    embeddingMs: { wiki: Math.round(wikiEmbeddings.elapsedMs),
      synthetic: Math.round(syntheticEmbeddings.elapsedMs) },
    savedWeights: false, activated: false }, null, 2)}\n`);
}

try { await main(); }
catch (error) {
  const code = error instanceof BenchmarkError ? error.code :
    error instanceof TypeError && /^[A-Z_]+$/u.test(error.message) ? error.message :
      'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
