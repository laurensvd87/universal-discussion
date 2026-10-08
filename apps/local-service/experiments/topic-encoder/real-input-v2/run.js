import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { pairs, score, trainPolicy, countPairs } from './core.js';
import { embedChunks, fixedFailure } from './chunks.js';

const ownDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(ownDir, '../../../../..');
let stage = 'arguments';
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
  if (args.length < 4 || args[0] !== '--private-dir' || args[2] !== '--input')
    throw new EvalError('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const trailing = args.slice(4);
  const preflight = trailing.includes('--preflight-long');
  const budgetArgs = trailing.filter(value => value !== '--preflight-long');
  if (trailing.filter(value => value === '--preflight-long').length > 1 ||
      budgetArgs.length !== 0 && (budgetArgs.length !== 2 ||
        budgetArgs[0] !== '--max-scored' || budgetArgs[1] !== '300'))
    throw new EvalError('arguments', 'MAX_SCORED_OPTION');
  const maxScored = budgetArgs.length ? 300 : 1200;
  stage = 'input';
  const bytes = await privateInput(args[1], args[3]);
  stage = 'parse';
  const corpus = parseCorpus(bytes, { leadCharacters: 4096 });
  stage = 'selection';
  const selection = selectEventDisjoint(corpus.documents, maxScored);
  const train = selection.documents.filter(d => d.split === 'train');
  const validation = selection.documents.filter(d => d.split === 'validation');
  if (train.length < 3 || validation.length < 2)
    throw new EvalError('selection', 'INSUFFICIENT_TRAIN_VALIDATION');
  // Test documents are never embedded or paired.
  const scored = [...train, ...validation];
  const longInput = scored.map(d => ({ id: d.id, title: d.title, body: d.lead }));
  if (preflight) {
    stage = 'preflight-long';
    const { preflightLongInput } = await import('../e5-infer.js');
    const result = await preflightLongInput(longInput);
    process.stdout.write(`${JSON.stringify({ mode: 'preflight-long', inputSha256: corpus.inputSha256,
      inputArticles: corpus.documents.length, maxScoredWorkBudget: maxScored,
      selectedArticles: selection.documents.length, unscoredArticles: selection.unscoredArticles,
      unscoredEvents: selection.unscoredEvents, trainArticles: train.length,
      validationArticles: validation.length,
      testArticlesUntouched: selection.documents.filter(d => d.split === 'test').length,
      ...result, onnxInference: false }, null, 2)}\n`);
    return;
  }
  stage = 'short-embed';
  const { embedDocuments } = await import('../e5-infer.js');
  const shortInput = scored.map(d => ({ id: d.id, title: d.title, body: d.lead.slice(0, 384) }));
  const short = await embedDocuments(shortInput, 'title-lead');
  stage = 'long-embed';
  const long = await embedChunks(longInput, embedDocuments);
  stage = 'training';
  const trainPairs = pairs(train, short.vectors, long.vectors);
  const policy = trainPolicy(trainPairs);
  stage = 'validation';
  const validationPairs = pairs(validation, short.vectors, long.vectors);
  process.stdout.write(`${JSON.stringify({
    mode: 'private-offline-research', inputSha256: corpus.inputSha256,
    modelSha256: short.assets.modelSha256, representation: 'packaged-local-E5-two-input-lengths',
    method: 'train-selected-short-long-cosine-ensemble-v2',
    familySplit: corpus.familyGold ? 'gold-family' : 'event-disjoint-fallback',
    inputArticles: corpus.documents.length, maxScoredWorkBudget: maxScored,
    selectedArticles: selection.documents.length,
    unscoredArticles: selection.unscoredArticles, unscoredEvents: selection.unscoredEvents,
    trainArticles: train.length, validationArticles: validation.length,
    testArticlesUntouched: selection.documents.filter(d => d.split === 'test').length,
    trainPositivePairs: trainPairs.filter(p => p.same).length,
    trainNegativePairs: trainPairs.filter(p => !p.same).length,
    trainTp: policy.trainTp, trainFp: 0,
    embeddingMs: { titleLead384: Math.round(short.elapsedMs), titleBody4096: Math.round(long.elapsedMs) },
    validation: {
      candidate: countPairs(validationPairs, p => score(p, policy.weight) >= policy.threshold),
      titleLead384Cosine094: countPairs(validationPairs, p => p.short >= .94),
      titleBody4096Cosine094: countPairs(validationPairs, p => p.long >= .94),
    },
  }, null, 2)}\n`);
}
try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: fixedFailure(stage, error) })}\n`);
  process.exitCode = 1;
}
