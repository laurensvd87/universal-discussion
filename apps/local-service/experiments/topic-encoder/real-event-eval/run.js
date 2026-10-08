import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint, inspectCorpus,
  diagnoseRetrieval, evaluate } from './core.js';

const ownDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(ownDir, '../../../../..');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input)) throw new EvalError('path', 'ABSOLUTE_PATH_REQUIRED');
  let root, file, repo;
  try { [root, file, repo] = await Promise.all([realpath(privateDir), realpath(input), realpath(repoRoot)]); }
  catch { throw new EvalError('path', 'PATH_ACCESS'); }
  if (!path.relative(repo, root) || inside(repo, root) || !inside(root, file))
    throw new EvalError('path', 'PRIVATE_PATH_SCOPE');
  let info;
  try { info = await lstat(input); } catch { throw new EvalError('path', 'INPUT_STAT'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new EvalError('path', info.size < 1 || info.size > 64 * 1024 * 1024 ? 'INPUT_SIZE' : 'INPUT_FILE_TYPE');
  try { return await readFile(input); } catch { throw new EvalError('path', 'INPUT_READ'); }
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, externalCapabilities: 'denied', inputRequired: true })}\n`);
    return;
  }
  const inspect = process.argv[2] === '--inspect';
  const args = inspect ? process.argv.slice(3) : process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--private-dir' || args[2] !== '--input')
    throw new EvalError('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const bytes = await privateInput(args[1], args[3]);
  const corpus = parseCorpus(bytes);
  const selection = selectEventDisjoint(corpus.documents);
  if (!selection.documents.length) throw new EvalError('selection', 'NO_EVENT_FITS_BUDGET');
  if (inspect) {
    process.stdout.write(`${JSON.stringify(inspectCorpus(corpus, selection), null, 2)}\n`);
    return;
  }
  const { embedDocuments } = await import('../e5-infer.js');
  const modelDocs = selection.documents.map(d => ({ id: d.id, title: d.title, body: d.lead }));
  const { vectors, assets, elapsedMs } = await embedDocuments(modelDocs, 'title-lead');
  const score = evaluate(selection.documents, vectors);
  const retrieval = diagnoseRetrieval(selection.documents, vectors);
  process.stdout.write(`${JSON.stringify({ inputSha256: corpus.inputSha256, modelSha256: assets.modelSha256,
    representation: 'packaged-local-E5-title-lead', matcher: 'complete-link-cosine-0.94-baseline',
    familyGoldAvailable: corpus.familyGold, viewpointGoldAvailable: corpus.viewpointGold,
    opposingView: corpus.viewpointGold ? { joined: score.opposingViewJoined,
      total: score.opposingViewTotal } : 'unavailable: no viewpoint gold',
    familySplit: corpus.familyGold ? 'gold family_id' : 'event-disjoint fallback; no family gold',
    inputArticles: corpus.documents.length, scoredArticles: selection.documents.length,
    unscoredArticles: selection.unscoredArticles, unscoredEvents: selection.unscoredEvents,
    embeddingMs: Math.round(elapsedMs),
    metrics: { ...score, opposingViewJoined: undefined, opposingViewTotal: undefined },
    retrieval }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  // Only our fixed codes cross the output boundary; system/model errors are opaque.
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
