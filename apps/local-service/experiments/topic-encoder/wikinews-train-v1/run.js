import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, prepareCorpus, selectWholeEvents, inspect } from
  '../wikinews-benchmark-v1/core.js';
import { freezeOnValidation, scoreFrozen, scoreRaw, validationCutoff, normalize } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
};

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    throw new BenchmarkError('path', 'ABSOLUTE_PATH_REQUIRED');
  let root, file, repo;
  try { [root, file, repo] = await Promise.all([
    realpath(privateDir), realpath(input), realpath(repoRoot)]); }
  catch { throw new BenchmarkError('path', 'PATH_ACCESS'); }
  if (!path.relative(repo, root) || inside(repo, root) || !inside(root, file) ||
      !path.relative(repo, file) || inside(repo, file))
    throw new BenchmarkError('path', 'PRIVATE_PATH_SCOPE');
  const info = await lstat(input);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new BenchmarkError('path', 'INPUT_FILE_BOUND');
  return readFile(input);
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  const [mode, privateFlag, privateDir, inputFlag, input] = process.argv.slice(2);
  if (process.argv.length !== 7 || !['--inspect', '--run'].includes(mode) ||
      privateFlag !== '--private-dir' || inputFlag !== '--input')
    throw new BenchmarkError('arguments', 'EXPECTED_MODE_PRIVATE_DIR_INPUT');
  const corpus = prepareCorpus(await privateInput(privateDir, input));
  const selection = selectWholeEvents(corpus.documents);
  const summary = inspect(corpus, selection);
  if (mode === '--inspect') {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  const docs = selection.documents;
  const train = docs.filter(doc => doc.split === 'train');
  const validation = docs.filter(doc => doc.split === 'validation');
  const test = docs.filter(doc => doc.split === 'test');
  if (train.length < 2 || validation.length < 2 || test.length < 2)
    throw new BenchmarkError('selection', 'SPLIT_EMPTY');
  const { embedDocuments } = await import('../e5-infer.js');
  // Test embeddings are computed alongside train/validation for one model load,
  // but no test gold labels or similarity scores are consulted before freeze.
  const { vectors, elapsedMs, assets } = await embedDocuments(docs.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const frozen = freezeOnValidation(train, validation, vectors);
  const rawValidation = new Map(validation.map(doc => [doc.id, normalize(vectors.get(doc.id))]));
  const rawThreshold = validationCutoff(validation, rawValidation);
  const baseline = { fixed094: scoreRaw(test, vectors, 0.94),
    validationCalibrated: rawThreshold === null ? null : scoreRaw(test, vectors, rawThreshold) };
  const learned = scoreFrozen(test, vectors, frozen.model, frozen.selected);
  const report = { mode: 'train-evaluate', researchOnly: true,
    inputSha256: corpus.inputSha256, modelSha256: assets.modelSha256,
    representation: 'packaged-local-E5-title-lead-384D', selection: summary,
    embeddingMs: Math.round(elapsedMs), train: { articles: train.length,
      triplets: frozen.model.triplets, categoryHardTriplets: frozen.model.categoryTriplets },
    validation: { articles: validation.length, gap: 0.002,
      rawCalibratedThreshold: rawThreshold,
      candidates: frozen.candidates, selectedStrength: frozen.selected?.strength ?? null,
      selectedThreshold: frozen.selected?.threshold ?? null },
    heldOutTest: { articles: test.length, baseline, learned },
    savedWeights: false, activated: false };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try { await main(); }
catch (error) {
  const code = error instanceof BenchmarkError ? error.code :
    error instanceof TypeError && /^[A-Z_]+$/u.test(error.message) ? error.message :
      'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
