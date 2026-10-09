import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, safeDiagnostic, prepareCorpus, selectWholeClusters } from '../jrc-story-v1/core.js';
import { buildEventGraph, evaluateGraph } from './core.js';

const EXPECTED_SHA256 = '05cbdc609102ef026accc5ad5c9d7202b1c0718a651448132ad04b1bb4396ab2';
const ownDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(ownDir, '../../../../..');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    throw new BenchmarkError('path', 'ABSOLUTE_PATH_REQUIRED');
  let root, file, repo;
  try { [root, file, repo] = await Promise.all([realpath(privateDir), realpath(input), realpath(repoRoot)]); }
  catch { throw new BenchmarkError('path', 'PATH_ACCESS'); }
  if (!path.relative(repo, root) || inside(repo, root) || !inside(root, file) ||
      !path.relative(repo, file) || inside(repo, file))
    throw new BenchmarkError('path', 'PRIVATE_PATH_SCOPE');
  const info = await lstat(input).catch(() => { throw new BenchmarkError('path', 'INPUT_STAT'); });
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 16 * 1024 * 1024)
    throw new BenchmarkError('path', 'INPUT_FILE_BOUND');
  return readFile(input).catch(() => { throw new BenchmarkError('path', 'INPUT_READ'); });
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, testSupported: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  const [privateFlag, privateDir, inputFlag, input, splitFlag, split] = process.argv.slice(2);
  if (process.argv.length !== 8 || privateFlag !== '--private-dir' || inputFlag !== '--input' ||
      splitFlag !== '--split' || !['train', 'validation'].includes(split))
    throw new BenchmarkError('arguments', 'TRAIN_OR_VALIDATION_REQUIRED');
  const bytes = await privateInput(privateDir, input);
  const corpus = prepareCorpus(bytes, EXPECTED_SHA256);
  const documents = selectWholeClusters(corpus).splits[split];
  if (!documents.length) throw new BenchmarkError('selection', 'EMPTY_SPLIT');
  const started = performance.now();
  const { embedDocuments } = await import('../e5-infer.js');
  const { vectors, assets, elapsedMs } = await embedDocuments(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.title })), 'body');
  const graph = buildEventGraph(documents, vectors);
  const metrics = evaluateGraph(documents, graph);
  process.stdout.write(`${JSON.stringify({ mode: 'development-score', split,
    representation: 'packaged-E5-title-only', modelSha256: assets.modelSha256,
    pairScope: 'distinct-valid-URL-hosts', runtimeLabelsUsedForMatching: false,
    baseline: 'fixed-cosine-0.90-connected-components', metrics,
    embeddingMs: Math.round(elapsedMs), totalMs: Math.round(performance.now() - started) }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
