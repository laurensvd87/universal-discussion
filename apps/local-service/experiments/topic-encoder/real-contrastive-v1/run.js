import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { normalize, transform, pairCounts, selectTrainMethod } from './core.js';

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
      modelLoaded: false, externalCapabilities: 'denied', inputRequired: true,
      evaluationSplits: ['train', 'validation'] })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--private-dir' || args[2] !== '--input')
    throw new EvalError('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const corpus = parseCorpus(await privateInput(args[1], args[3]));
  const selection = selectEventDisjoint(corpus.documents);
  const train = selection.documents.filter(d => d.split === 'train');
  const validation = selection.documents.filter(d => d.split === 'validation');
  if (train.length < 3 || validation.length < 2)
    throw new EvalError('selection', 'INSUFFICIENT_TRAIN_VALIDATION');
  const { embedDocuments } = await import('../e5-infer.js');
  // Test documents are neither embedded nor paired in this first experiment.
  const scored = [...train, ...validation];
  const { vectors, assets, elapsedMs } = await embedDocuments(
    scored.map(d => ({ id: d.id, title: d.title, body: d.lead })), 'title-lead');
  const selected = selectTrainMethod(train, vectors);
  const rawValidation = new Map(validation.map(d => [d.id, normalize(vectors.get(d.id))]));
  const projectedValidation = new Map(validation.map(d => [d.id,
    transform(rawValidation.get(d.id), selected.model.axes, selected.strength)]));
  process.stdout.write(`${JSON.stringify({
    mode: 'private-offline-research', inputSha256: corpus.inputSha256,
    modelSha256: assets.modelSha256, representation: 'packaged-local-E5-title-lead',
    method: 'hard-negative-triplet-low-rank-contrastive-v1',
    familySplit: corpus.familyGold ? 'gold-family' : 'event-disjoint-fallback',
    inputArticles: corpus.documents.length, selectedArticles: selection.documents.length,
    unscoredArticles: selection.unscoredArticles, unscoredEvents: selection.unscoredEvents,
    trainArticles: train.length, validationArticles: validation.length,
    testArticlesUntouched: selection.documents.filter(d => d.split === 'test').length,
    trainTriplets: selected.model.tripletCount, trainedAxes: selected.model.axes.length,
    selectedStrength: selected.strength, trainTp: selected.trainTp,
    trainPositiveTotal: selected.trainPositiveTotal,
    trainNegativeTotal: selected.trainNegativeTotal,
    embeddingMs: Math.round(elapsedMs),
    validation: {
      candidate: pairCounts(validation, projectedValidation, selected.threshold),
      cosine094: pairCounts(validation, rawValidation, .94),
    },
  }, null, 2)}\n`);
}
try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
