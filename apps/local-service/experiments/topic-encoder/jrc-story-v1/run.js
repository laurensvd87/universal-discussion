import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, safeDiagnostic, prepareCorpus, selectWholeClusters,
  inspect, evaluateSplit, requireScoreSplit, parseQuotedCsv } from './core.js';
import { auditCorpus } from './audit.js';

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
      modelLoaded: false, externalCapabilities: 'denied', inputRequired: true })}\n`);
    return;
  }
  const [mode, privateFlag, privateDir, inputFlag, input, ...trailing] = process.argv.slice(2);
  if (!['--inspect', '--score', '--audit'].includes(mode) ||
      privateFlag !== '--private-dir' || inputFlag !== '--input')
    throw new BenchmarkError('arguments', 'EXPECTED_MODE_PRIVATE_DIR_INPUT');
  if (mode !== '--score' && trailing.length)
    throw new BenchmarkError('arguments', 'NON_SCORE_ARGUMENTS');
  const split = mode === '--score' ? requireScoreSplit(trailing) : null;
  const bytes = await privateInput(privateDir, input);
  const corpus = prepareCorpus(bytes, EXPECTED_SHA256);
  const selection = selectWholeClusters(corpus);
  const summary = inspect(corpus, selection);
  if (mode === '--inspect') {
    process.stdout.write(`${JSON.stringify({ mode: 'inspect', ...summary, modelLoaded: false }, null, 2)}\n`);
    return;
  }
  if (mode === '--audit') {
    const parsed = parseQuotedCsv(bytes);
    process.stdout.write(`${JSON.stringify(auditCorpus(corpus, parsed.rows, selection), null, 2)}\n`);
    return;
  }
  const started = performance.now();
  const { embedDocuments } = await import('../e5-infer.js');
  // The body-mode contract embeds only its body argument; passing the title
  // there gives exactly one title copy, with no article text or new model.
  const scopedDocuments = selection.splits[split];
  if (!scopedDocuments.length) throw new BenchmarkError('selection', 'EMPTY_SPLIT');
  const { vectors, assets, elapsedMs } = await embedDocuments(scopedDocuments.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.title })), 'body');
  const metrics = evaluateSplit(scopedDocuments, vectors);
  process.stdout.write(`${JSON.stringify({ mode: 'score', ...summary,
    split,
    representation: 'packaged-E5-title-only', modelSha256: assets.modelSha256,
    methods: { e5Cosine094: 'fixed', e5Cosine090Diagnostic: 'fixed', titleJaccard050: 'fixed' },
    pairScope: 'distinct-valid-URL-hosts', metrics,
    embeddingMs: Math.round(elapsedMs), totalMs: Math.round(performance.now() - started) }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
