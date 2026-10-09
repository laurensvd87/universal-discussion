import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { embedDocuments } from '../e5-infer.js';
import { titleLexicon, makeEvidence, group, assess, selectRule } from './core.js';

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
  const info = await lstat(input).catch(() => { throw new EvalError('path', 'INPUT_STAT'); });
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new EvalError('path', 'INPUT_FILE_TYPE_OR_SIZE');
  return readFile(input).catch(() => { throw new EvalError('path', 'INPUT_READ'); });
}
async function embedBodyChunks(documents) {
  const vectors = new Map();
  let assets = null, elapsedMs = 0;
  for (let start = 0; start < documents.length; start += 80) {
    const part = documents.slice(start, start + 80);
    const result = await embedDocuments(part, 'body');
    if (!assets) assets = result.assets;
    else if (result.assets.modelSha256 !== assets.modelSha256 ||
        result.assets.tokenizerSha256 !== assets.tokenizerSha256 ||
        result.assets.runtime !== assets.runtime)
      throw new EvalError('inference', 'MODEL_ASSET_CHANGED');
    for (const [id, vector] of result.vectors) vectors.set(id, vector);
    elapsedMs += result.elapsedMs;
  }
  return { vectors, assets, elapsedMs };
}
function retrievalTopThree(evidence) {
  const { rows, pairs } = evidence;
  const neighbors = rows.map(() => []);
  for (const pair of pairs) {
    neighbors[pair.i].push({ index: pair.j, cosine: pair.cosine });
    neighbors[pair.j].push({ index: pair.i, cosine: pair.cosine });
  }
  let eligible = 0, found = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!rows.some((other, j) => j !== i && other.eventKey === rows[i].eventKey)) continue;
    eligible++;
    const ranked = neighbors[i].sort((a, b) => b.cosine - a.cosine || a.index - b.index);
    if (ranked.slice(0, 3).some(item => rows[item.index].eventKey === rows[i].eventKey)) found++;
  }
  return { found, eligible };
}
function cosine094(evidence) {
  let truePairs = 0, falsePairs = 0, hardFalse = 0;
  for (const pair of evidence.pairs) if (pair.cosine >= 0.94) {
    const a = evidence.rows[pair.i], b = evidence.rows[pair.j];
    if (a.eventKey === b.eventKey) truePairs++;
    else { falsePairs++; if (a.category === b.category) hardFalse++; }
  }
  return { truePairs, falsePairs, hardFalse };
}
async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, externalCapabilities: 'denied', testSplitOpened: false })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  if (![4, 5].includes(args.length) || args[0] !== '--private-dir' || args[2] !== '--input' ||
      args.length === 5 && args[4] !== '--body-4096')
    throw new EvalError('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const bodyCharacters = args.length === 5 ? 4096 : 384;
  const corpus = parseCorpus(await privateInput(args[1], args[3]), { leadCharacters: bodyCharacters });
  if (corpus.inputSha256 !== '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d')
    throw new EvalError('input', 'CORPUS_HASH_MISMATCH');
  const selection = selectEventDisjoint(corpus.documents);
  const train = selection.documents.filter(row => row.split === 'train');
  const validation = selection.documents.filter(row => row.split === 'validation');
  if (train.length !== 749 || validation.length !== 150 || selection.unscoredArticles !== 3495)
    throw new EvalError('selection', 'UNEXPECTED_FROZEN_SPLIT');
  const started = performance.now();
  const { vectors, assets, elapsedMs } = await embedBodyChunks([...train, ...validation]
    .map(row => ({ id: row.id, title: row.title, body: row.lead })));
  const lexicon = titleLexicon(train);
  const trainEvidence = makeEvidence(train, vectors, lexicon);
  const trainSelected = selectRule(trainEvidence);
  const rule = trainSelected.selected?.rule;
  const validationEvidence = makeEvidence(validation, vectors, lexicon);
  const report = { mode: 'private-offline-research', inputSha256: corpus.inputSha256,
    modelSha256: assets.modelSha256, representation: `body-${bodyCharacters}-E5-plus-retained-title`,
    bodyCharacters,
    method: 'local-title-neighborhood-graph-v1', selectedArticles: selection.documents.length,
    trainArticles: train.length, validationArticles: validation.length,
    selectedTestUntouched: selection.documents.filter(row => row.split === 'test').length,
    previouslyUnselectedUntouched: selection.unscoredArticles,
    policiesTried: trainSelected.tried, rule,
    train: trainSelected.selected?.result ?? null,
    validation: rule ? assess(validationEvidence, group(validationEvidence, rule), rule) : null,
    unchangedBodyCosine094: { train: cosine094(trainEvidence), validation: cosine094(validationEvidence) },
    retrievalTopThree: { train: retrievalTopThree(trainEvidence), validation: retrievalTopThree(validationEvidence) },
    strongestRejectedTrain: trainSelected.bestUnsafe?.result ?? null,
    embeddingMs: Math.round(elapsedMs), totalMs: Math.round(performance.now() - started) };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
