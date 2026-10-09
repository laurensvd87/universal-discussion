// Approved private corpus, packaged local model, aggregate-only offline research.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint,
  scorePartition, cosinePartition, diagnoseRetrieval } from '../real-event-eval/core.js';
import { groupDocuments } from '../adaptive-topic-graph-v1/core.js';

const inputDigest = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
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
  if (!info.isFile() || info.isSymbolicLink() || info.size !== 14972999)
    throw new EvalError('path', 'INPUT_FILE_TYPE_OR_SIZE');
  const bytes = await readFile(input);
  if (createHash('sha256').update(bytes).digest('hex') !== inputDigest)
    throw new EvalError('input', 'FROZEN_INPUT_DIGEST');
  return bytes;
}

const rules = [
  ['complete-link-0.94', null],
  ['strict-triangle', { method: 'triangle', minimum: 0.86, cover: 0.88, mean: 0.92, strongPair: 0.94 }],
  ['triangle-nearest-veto', { method: 'triangle-nearest', minimum: 0.86, cover: 0.88, mean: 0.88, strongPair: 0.94 }],
];
function exactGroups(documents, groups) {
  const labelOf = new Map(documents.map(doc => [doc.id, doc.eventKey]));
  const gold = new Map();
  for (const doc of documents) {
    const ids = gold.get(doc.eventKey) ?? new Set();
    ids.add(doc.id);
    gold.set(doc.eventKey, ids);
  }
  let exact = 0, mixed = 0;
  for (const group of groups) {
    if (new Set(group.map(id => labelOf.get(id))).size > 1) mixed++;
    const expected = gold.get(labelOf.get(group[0]));
    if (expected.size === group.length && group.every(id => expected.has(id))) exact++;
  }
  return { exact, total: gold.size, mixedPredictedGroups: mixed };
}
function measure(documents, vectors) {
  const inputs = documents.map(doc => ({ id: doc.id }));
  const grouping = rules.map(([name, rule]) => {
    const started = performance.now();
    const groups = rule ? groupDocuments(inputs, vectors, rule) : cosinePartition(documents, vectors, 0.94);
    const groupingMs = Math.round((performance.now() - started) * 100) / 100;
    const scored = scorePartition(documents, groups);
    return { name, groupingMs, predictedGroups: scored.predictedGroups,
      trueJoined: scored.tp, trueTotal: scored.tp + scored.fn,
      falseJoined: scored.fp, falseTotal: scored.fp + scored.tn,
      sameCategoryFalseJoined: scored.hardFalseJoins,
      exactEvents: exactGroups(documents, groups) };
  });
  const retrieval = diagnoseRetrieval(documents, vectors).nearestTrueEvent;
  return { grouping, retrieval };
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, testScored: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--private-dir' || args[2] !== '--input' ||
      args[4] !== '--split' || !['train', 'validation'].includes(args[5]))
    throw new EvalError('arguments', 'EXPECTED_PRIVATE_DIR_INPUT_TRAIN_OR_VALIDATION');
  const corpus = parseCorpus(await privateInput(args[1], args[3]));
  const selection = selectEventDisjoint(corpus.documents);
  const documents = selection.documents.filter(doc => doc.split === args[5]);
  if (documents.length < 3) throw new EvalError('selection', 'INSUFFICIENT_SPLIT');
  const { embedDocuments } = await import('../e5-infer.js');
  const modelDocs = documents.map(doc => ({ id: doc.id, title: doc.title, body: doc.lead }));
  const focus = await embedDocuments(modelDocs, 'title-lead');
  // Reuse the same model's body mode with title as its entire input. This is
  // exactly one title vector per document; there is no second model or asset.
  const title = await embedDocuments(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.title })), 'body');
  const reference = measure(documents, focus.vectors);
  const candidate = measure(documents, title.vectors);
  process.stdout.write(`${JSON.stringify({ mode: 'private-offline-research',
    inputSha256: corpus.inputSha256, modelSha256: title.assets.modelSha256,
    splitPolicy: corpus.familyGold ? 'gold-family-disjoint' : 'event-disjoint-fallback',
    evaluatedSplit: args[5], evaluatedArticles: documents.length,
    selectedTestArticlesUnscored: selection.documents.filter(doc => doc.split === 'test').length,
    rules: 'predeclared complete-link-0.94, strict-triangle, triangle-nearest-veto',
    titleLead: { embeddingMs: Math.round(focus.elapsedMs), ...reference },
    titleOnly: { embeddingMs: Math.round(title.elapsedMs), ...candidate } }, null, 2)}\n`);
}
try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
