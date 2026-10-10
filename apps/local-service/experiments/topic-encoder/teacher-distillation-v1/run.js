import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents, omitConflictingInputs, normalizeVectors, transform as diagonalTransform } from '../real-diagonal-adapter-v1/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { embedDocuments } from '../e5-infer.js';
import { embedParaphrase } from '../compact-paraphrase-probe-v1/infer.js';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { POLICY, pairedStatistics, fitRidge, transfer, center, alignment, calibrateRepresentation, assess, chooseUseful } from './core.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PRIVATE_DIRECTORY = path.join(os.tmpdir(), 'udl-globesumm-research-20261008');
const INPUT = path.join(PRIVATE_DIRECTORY, 'news_only.json');
const CORPUS_SHA = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const TEACHER_DIRECTORY = path.join(os.tmpdir(), 'udl-paraphrase-research-20261010');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stage = (name, values = {}) => process.stdout.write(`${JSON.stringify({ stage: name, ...values })}\n`);
const files = Object.freeze({
  'model.onnx': [125000000, '783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672'],
  'tokenizer.json': [20000000, '2c3387be76557bd40970cec13153b3bbf80407865484b209e655e5e4729076b8'],
  'tokenizer_config.json': [32768, '5036ea374ffedd706e3bef33e2e0d6953cb868ef8a490e76e32ba0faa37a6b9b'],
  'config.json': [32768, '6300193cb75e01cf80c96decef7187dfb33094d97cc1490b7ead6ff134476e4e'],
  'sentence_bert_config.json': [32768, '70f4448f31320443fe3557cacea5abf2dcc4915dda8c80646bec9f3bb0aa5a1f'],
});
async function privateCorpus() {
  const [directory, filename, root, dirInfo, info] = await Promise.all([
    realpath(PRIVATE_DIRECTORY), realpath(INPUT), realpath(ROOT), lstat(PRIVATE_DIRECTORY), lstat(INPUT),
  ]);
  if (!privateScopeAllowed(root, directory, filename) || !dirInfo.isDirectory() || dirInfo.isSymbolicLink() ||
      !info.isFile() || info.isSymbolicLink() || info.size !== 14972999) throw new Error('PRIVATE_CONTRACT');
  const bytes = await readFile(filename);
  if (sha(bytes) !== CORPUS_SHA) throw new Error('PRIVATE_HASH');
  const short = parseCorpus(bytes).documents, bodies = parseCorpus(bytes, { leadCharacters: 4096 }).documents;
  const byId = new Map(bodies.map(row => [row.id, { ...row, body: row.lead }])), previous = selectEventDisjoint(short);
  const originalTrain = previous.documents.filter(row => row.split === 'train');
  const clean = new Set(omitConflictingInputs(originalTrain).rows.map(row => row.id));
  const split = splitTrainEvents(originalTrain);
  const fit = split.fit.filter(row => clean.has(row.id)).map(row => byId.get(row.id));
  const calibration = split.calibration.map(row => byId.get(row.id));
  const development = previous.documents.filter(row => row.split === 'validation').map(row => byId.get(row.id));
  if (fit.length !== 475 || calibration.length !== 274 || development.length !== 150) throw new Error('SELECTION');
  const fitEvents = new Set(fit.map(row => row.eventKey));
  const calEvents = new Set(calibration.map(row => row.eventKey));
  if (calibration.some(row => fitEvents.has(row.eventKey)) || development.some(row => fitEvents.has(row.eventKey) || calEvents.has(row.eventKey)))
    throw new Error('EVENT_LEAK');
  return { fit, calibration, development };
}
async function synthetic() {
  const sourceHashes = {}, authored = [], spentV6 = [];
  for (const name of ['../multilingual-authored-v2/chunk-c1/records.jsonl', '../multilingual-authored-v2/chunk-c2/records.jsonl',
    '../multilingual-authored-v2/chunk-c3/records.jsonl', '../multilingual-holdout-v6/holdout.jsonl']) {
    const bytes = await readFile(new URL(name, import.meta.url)); sourceHashes[name] = sha(bytes);
    const rows = bytes.toString('utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line));
    (name.includes('holdout-v6') ? spentV6 : authored).push(...rows.map(row => ({ ...row,
      eventKey: row.eventKey ?? row.topicLabel, lang: row.lang ?? row.id.split('-').at(-1) })));
  }
  if (authored.length !== 108 || spentV6.length !== 60 || [...authored, ...spentV6].some(row => !row.title || !row.body || !row.eventKey))
    throw new Error('SYNTHETIC_CONTRACT');
  return { authored, spentV6, sourceHashes };
}
async function assets() {
  const [directory, root, info] = await Promise.all([realpath(TEACHER_DIRECTORY), realpath(ROOT), lstat(TEACHER_DIRECTORY)]);
  const relative = path.relative(root, directory);
  if (!info.isDirectory() || info.isSymbolicLink() || !relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('TEACHER_SCOPE');
  const verified = {};
  for (const [name, [maximum, expected]] of Object.entries(files)) {
    const filename = path.join(directory, name), fileInfo = await lstat(filename);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size < 1 || fileInfo.size > maximum) throw new Error('TEACHER_FILE');
    const bytes = await readFile(filename);
    if (sha(bytes) !== expected) throw new Error('TEACHER_HASH');
    verified[name] = { bytes: bytes.length, sha256: expected };
  }
  const config = JSON.parse(await readFile(path.join(directory, 'config.json')));
  const sentence = JSON.parse(await readFile(path.join(directory, 'sentence_bert_config.json')));
  if (config.hidden_size !== 384 || config.auto_map || sentence.max_seq_length !== 128) throw new Error('TEACHER_CONFIG');
  const manifestBytes = await readFile(new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json', import.meta.url));
  return { teacher: { revision: 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42', files: verified },
    packagedE5ManifestSha256: sha(manifestBytes) };
}
async function sourceHashes() {
  const result = {};
  for (const name of ['README.md', 'core.js', 'core.test.js', 'run.js', '../e5-infer.js', '../compact-paraphrase-probe-v1/infer.js',
    '../compact-paraphrase-probe-v1/core.js', '../real-event-eval/core.js', '../real-diagonal-adapter-v1/core.js',
    '../topic-metric-rethink-v1/core.js', '../synthetic-to-globesumm-v1/scope.js', '../../../src/domain/diagonal-adapter.js',
    '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js',
    '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js'])
    result[name] = sha(await readFile(new URL(name, import.meta.url)));
  return result;
}
async function embed(rows, method, label) {
  const output = new Map(); let elapsedMs = 0;
  for (let index = 0; index < rows.length; index += POLICY.batchArticles) {
    const batch = rows.slice(index, index + POLICY.batchArticles), result = await method(batch);
    elapsedMs += result.elapsedMs;
    for (const [id, vector] of result.vectors) output.set(id, vector);
    stage(label, { completed: Math.min(index + batch.length, rows.length), total: rows.length });
  }
  if (output.size !== rows.length) throw new Error('EMBEDDING_COVERAGE');
  return { vectors: output, elapsedMs };
}
async function main() {
  const args = process.argv.slice(2), freezing = args.length === 1 && args[0] === '--freeze';
  if (!freezing && !(args.length === 3 && args[0] === '--measure' && args[1] === '--freeze-hash' && /^[a-f0-9]{64}$/u.test(args[2])))
    throw new Error('ARGUMENTS');
  const started = performance.now();
  const [cohort, challenge, assetHashes, sources, diagonal] = await Promise.all([privateCorpus(), synthetic(), assets(), sourceHashes(),
    loadDiagonalAdapter(fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url)))]);
  const all = [...cohort.fit, ...cohort.calibration, ...cohort.development, ...challenge.authored, ...challenge.spentV6];
  if (new Set(all.map(row => row.id)).size !== all.length) throw new Error('DUPLICATE_ID');
  const descriptor = { schema: 'linear-teacher-distillation/v1', policy: POLICY, sources, corpusSha256: CORPUS_SHA,
    syntheticHashes: challenge.sourceHashes, assets: assetHashes, oldDiagonalManifestSha256: diagonal.manifestSha256,
    cohorts: Object.fromEntries(Object.entries({ ...cohort, authored: challenge.authored, spentV6: challenge.spentV6 }).map(([name, rows]) =>
      [name, { reports: rows.length, events: new Set(rows.map(row => row.eventKey)).size,
        selectionSha256: sha(JSON.stringify(rows.map(row => [row.id, row.eventKey]))) }])),
    selection: 'no-worse-real-raw-false;no-worse-C-diagonal-false;v6-zero-false;real-diagonal-reach-better;challenge-diagonal-true-nondecreasing',
    noFreshMode: true };
  const freezeHash = sha(JSON.stringify(descriptor));
  if (freezing) { stage('freeze', { descriptor, freezeHash, privateInference: false, fitting: false, qualityMeasured: false }); return; }
  if (freezeHash !== args[2]) throw new Error('FREEZE_MISMATCH');
  stage('selection', { fit: cohort.fit.length, calibration: cohort.calibration.length, development: cohort.development.length,
    authored: challenge.authored.length, spentV6: challenge.spentV6.length, freezeHash });
  const rawResult = await embed(all, rows => embedDocuments(rows, 'body'), 'raw-E5-body');
  const teacherResult = await embed(all, embedParaphrase, 'teacher-body');
  const raw = normalizeVectors(all, rawResult.vectors), teacher = normalizeVectors(all, teacherResult.vectors);
  const fitStarted = performance.now(), statistics = pairedStatistics(cohort.fit, raw, teacher);
  const fitted = new Map(POLICY.lambdas.map(lambda => [`ridge-${lambda}`, fitRidge(statistics, lambda)]));
  const fitElapsedMs = performance.now() - fitStarted;
  const representations = new Map([['raw-E5', raw], ['centered-E5', center(all, raw, statistics.meanX)],
    ['old-diagonal', diagonalTransform(all, raw, diagonal.parameters)], ['teacher', teacher],
    ...[...fitted].map(([name, model]) => [name, transfer(all, raw, model)])]);
  const methods = {};
  for (const [name, vectors] of representations) {
    const threshold = calibrateRepresentation(cohort.calibration, vectors);
    methods[name] = { calibration: assess(cohort.calibration, vectors, threshold),
      development: assess(cohort.development, vectors, threshold), authored: assess(challenge.authored, vectors, threshold),
      spentV6: assess(challenge.spentV6, vectors, threshold),
      alignment: fitted.has(name) ? { fit: alignment(cohort.fit, vectors, teacher),
        calibration: alignment(cohort.calibration, vectors, teacher), development: alignment(cohort.development, vectors, teacher) } : null };
    stage('method-complete', { method: name, threshold, development: { purePages: methods[name].development.purePages,
      truePairs: methods[name].development.groupedTrue, falsePairs: methods[name].development.groupedFalse },
      authoredFalsePairs: methods[name].authored.groupedFalse, spentV6FalsePairs: methods[name].spentV6.groupedFalse });
  }
  const selected = chooseUseful(methods);
  stage('result', { descriptor, freezeHash, methods, selected, useful: selected !== null, elapsedMs: Math.round(performance.now() - started),
    inferenceMs: { E5: rawResult.elapsedMs, teacher: teacherResult.elapsedMs }, fitElapsedMs,
    fitDiagnostics: { dimensions: 384, matrixParametersPerMap: 147456, meanParametersPerMap: 768, varianceScale: statistics.varianceScale,
      lambdas: Object.fromEntries([...fitted].map(([name, model]) => [name, { lambda: model.lambda, ridge: model.ridge,
        parametersSha256: sha(JSON.stringify([Array.from(model.weights), Array.from(model.meanX), Array.from(model.meanY)])) }])) },
    weightsSaved: false, vectorsSaved: false, noProviderCall: true, activated: false, noFreshInference: true,
    caveats: ['all-quality-cohorts-reused', 'linear-only-information-recoverability', 'teacher128-vs-source512-input-mismatch',
      'no-publisher-or-real-viewpoint-gold', 'body-prefix-not-Chrome-capture', 'calibration-precision-not-confidence-bound',
      'complete-link-not-indexed-deployment-policy', 'old-diagonal-title-lead-fit-body-application', 'no-rights-release-or-activation-conclusion'] });
}
main().catch(() => { stage('failure', { code: 'FIXED_DISTILLATION_CONTRACT_FAILURE' }); process.exitCode = 1; });
