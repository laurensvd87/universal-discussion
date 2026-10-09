import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, safeDiagnostic, prepareCorpus, selectWholeEvents,
  inspect, evaluate } from './core.js';

const ownDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(ownDir, '../../../../..');
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
  let info;
  try { info = await lstat(input); } catch { throw new BenchmarkError('path', 'INPUT_STAT'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new BenchmarkError('path', 'INPUT_FILE_BOUND');
  try { return await readFile(input); }
  catch { throw new BenchmarkError('path', 'INPUT_READ'); }
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, externalCapabilities: 'denied', inputRequired: true })}\n`);
    return;
  }
  const [mode, privateFlag, privateDir, inputFlag, input] = process.argv.slice(2);
  if (process.argv.length !== 7 || !['--inspect', '--score'].includes(mode) ||
      privateFlag !== '--private-dir' || inputFlag !== '--input')
    throw new BenchmarkError('arguments', 'EXPECTED_MODE_PRIVATE_DIR_INPUT');
  const bytes = await privateInput(privateDir, input);
  const corpus = prepareCorpus(bytes);
  const selection = selectWholeEvents(corpus.documents);
  if (!selection.documents.length) throw new BenchmarkError('selection', 'EMPTY_SELECTION');
  if (mode === '--inspect') {
    process.stdout.write(`${JSON.stringify(inspect(corpus, selection), null, 2)}\n`);
    return;
  }
  const { embedDocuments } = await import('../e5-infer.js');
  const { vectors, elapsedMs, assets } = await embedDocuments(selection.documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const scored = evaluate(selection.documents, vectors);
  const splits = Object.fromEntries(['train', 'validation', 'test'].map(split => {
    const slice = selection.documents.filter(doc => doc.split === split);
    return [split, slice.length ? evaluate(slice, vectors) : null];
  }));
  process.stdout.write(`${JSON.stringify({ mode: 'score', inputSha256: corpus.inputSha256,
    modelSha256: assets.modelSha256, representation: 'packaged-local-E5-title-lead',
    matcher: 'complete-link-cosine-0.94-baseline',
    selection: inspect(corpus, selection), embeddingMs: Math.round(elapsedMs),
    pooledExploratory: scored, eventDisjoint: splits }, null, 2)}\n`);
}

try { await main(); }
catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
