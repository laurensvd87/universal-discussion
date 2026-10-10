import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents, omitConflictingInputs, normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { selectFreshRethink } from '../topic-metric-rethink-v1/core.js';
import { pairedStatistics, fitRidge, predicted } from '../teacher-distillation-v1/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { embedDocuments } from '../e5-infer.js';
import { embedParaphrase } from '../compact-paraphrase-probe-v1/infer.js';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { createPracticalTopicPlanner, checkedUnit, PRACTICAL_POLICY } from './planner.js';
import { aggregatePartition, policyDifference, exposure, practicalSuccess } from './core.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PRIVATE_DIRECTORY = path.join(os.tmpdir(), 'udl-globesumm-research-20261008');
const INPUT = path.join(PRIVATE_DIRECTORY, 'news_only.json');
const CORPUS_SHA = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const TEACHER_DIRECTORY = path.join(os.tmpdir(), 'udl-paraphrase-research-20261010');
const V7 = '../independent-topic-challenge-v7/records.jsonl';
const V7_SHA = '2f1c0b30313f79f8ee662ec216c447945f1b9fdf2a257835d757080e40618abb';
const CLOSED_HASH = '8951b0aef42b90260080d81997225b9aa12d959f04e81d9c7563ca766a33a3b8';
const PARAMETER_SHA = '593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4';
const FLOORS = Object.freeze({ raw: .9040571956970351, diagonal: .9071894401066846, ridge1: .8639003810829322 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stage = (name, values = {}) => process.stdout.write(`${JSON.stringify({ stage: name, ...values })}\n`);
async function regularFile(filename, maximum, expectedSize = null) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum ||
      expectedSize !== null && info.size !== expectedSize) throw new Error('FILE');
  const bytes = await readFile(filename);
  if (bytes.length !== info.size) throw new Error('FILE_CHANGED');
  return bytes;
}
async function externalDirectory(directory) {
  const [resolved, root, info] = await Promise.all([realpath(directory), realpath(ROOT), lstat(directory)]);
  const relative = path.relative(root, resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || !relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('PRIVATE_SCOPE');
  return { resolved, root };
}
async function reference() {
  const bytes = await regularFile(new URL('../teacher-distillation-v1/aggregate.json', import.meta.url), 65536);
  const result = JSON.parse(bytes);
  if (result.freezeHash !== CLOSED_HASH || result.selected !== null || result.useful !== false ||
      result.fitDiagnostics.lambdas['ridge-1'].parametersSha256 !== PARAMETER_SHA ||
      result.methods['raw-E5'].calibration.threshold !== FLOORS.raw ||
      result.methods['old-diagonal'].calibration.threshold !== FLOORS.diagonal ||
      result.methods['ridge-1'].calibration.threshold !== FLOORS.ridge1) throw new Error('REFERENCE');
  return { result, sha256: sha(bytes) };
}
async function corpus(closed) {
  const { resolved: directory, root } = await externalDirectory(PRIVATE_DIRECTORY);
  const filename = await realpath(INPUT);
  if (!privateScopeAllowed(root, directory, filename)) throw new Error('PRIVATE_SCOPE');
  const bytes = await regularFile(INPUT, 14972999, 14972999);
  if (sha(bytes) !== CORPUS_SHA) throw new Error('CORPUS_HASH');
  const short = parseCorpus(bytes).documents, bodies = parseCorpus(bytes, { leadCharacters: 4096 }).documents;
  const byId = new Map(bodies.map(row => [row.id, { ...row, body: row.lead }]));
  const original = selectEventDisjoint(short), preliminary = selectEventDisjoint(short, 300);
  const prior = selectFreshEvents(short, original.documents, preliminary.documents);
  const bodyPrior = selectBodyTransferEvents(short, original.documents, preliminary.documents, prior.documents);
  const shared = selectFreshRethink(short, [original.documents, preliminary.documents, prior.documents, bodyPrior.documents]);
  const exposed = [original.documents, preliminary.documents, prior.documents, bodyPrior.documents, shared.documents];
  if (exposed.some((rows, index) => rows.length !== [1192, 298, 292, 300, 296][index]) ||
      sha(JSON.stringify(shared.documents.map(row => [row.id, row.eventKey]))) !== 'ff9c612bed4e52f1413955e32fd4a3ed9bab07029a85d236e9614dddf9ecf2ca')
    throw new Error('EXPOSURE');
  const fresh = selectFreshRethink(short, exposed);
  const exposedEvents = new Set(exposed.flat().map(row => row.eventKey));
  const exposedKeys = new Set(exposed.flat().map(row => row.duplicateKey));
  if (fresh.documents.some(row => exposedEvents.has(row.eventKey) || exposedKeys.has(row.duplicateKey))) throw new Error('FRESH_LEAK');
  const originalTrain = original.documents.filter(row => row.split === 'train'), clean = new Set(omitConflictingInputs(originalTrain).rows.map(row => row.id));
  const fit = splitTrainEvents(originalTrain).fit.filter(row => clean.has(row.id)).map(row => byId.get(row.id));
  if (fit.length !== 475 || sha(JSON.stringify(fit.map(row => [row.id, row.eventKey]))) !== closed.descriptor.cohorts.fit.selectionSha256)
    throw new Error('FIT_SELECTION');
  return { fit, fresh: fresh.documents.map(row => byId.get(row.id)), metadata: {
    fit: { rows: fit.length, events: new Set(fit.map(row => row.eventKey)).size,
      selectionSha256: sha(JSON.stringify(fit.map(row => [row.id, row.eventKey]))) },
    fresh: { rows: fresh.documents.length, events: fresh.events, selectionSha256: sha(JSON.stringify(fresh.documents.map(row => [row.id, row.eventKey]))),
      inputKeysSha256: sha(JSON.stringify(fresh.documents.map(row => row.duplicateKey))), availableEvents: fresh.availableEvents,
      availableArticles: fresh.availableArticles, excludedEvents: fresh.excludedEvents },
    exposed: exposed.map((rows, index) => ({ name: ['original', 'preliminary', 'title-fresh', 'body-fresh', 'shared296'][index], rows: rows.length,
      events: new Set(rows.map(row => row.eventKey)).size, selectionSha256: sha(JSON.stringify(rows.map(row => [row.id, row.eventKey]))) })) } };
}
async function assets(closed) {
  const { resolved: directory } = await externalDirectory(TEACHER_DIRECTORY), verified = {};
  for (const [name, spec] of Object.entries(closed.descriptor.assets.teacher.files)) {
    const filename = path.join(directory, name), bytes = await regularFile(filename, spec.bytes, spec.bytes);
    if (sha(bytes) !== spec.sha256) throw new Error('TEACHER_HASH');
    verified[name] = { bytes: bytes.length, sha256: spec.sha256 };
  }
  const config = JSON.parse(await readFile(path.join(directory, 'config.json'))), sentence = JSON.parse(await readFile(path.join(directory, 'sentence_bert_config.json')));
  if (config.hidden_size !== 384 || config.auto_map || sentence.max_seq_length !== 128) throw new Error('TEACHER_CONFIG');
  const manifest = await regularFile(new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json', import.meta.url), 16384);
  if (sha(manifest) !== closed.descriptor.assets.packagedE5ManifestSha256) throw new Error('E5_MANIFEST');
  return { teacher: { revision: closed.descriptor.assets.teacher.revision, files: verified }, packagedE5ManifestSha256: sha(manifest) };
}
async function v7Bytes() {
  const bytes = await regularFile(new URL(V7, import.meta.url), 2 * 1024 * 1024);
  if (sha(bytes) !== V7_SHA) throw new Error('V7_HASH');
  return bytes;
}
function parseV7(bytes) {
  const rows = bytes.toString('utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line));
  const fields = ['body', 'family', 'id', 'lang', 'title', 'topicLabel', 'viewpoint'].join(',');
  if (rows.length !== 60 || new Set(rows.map(row => row.id)).size !== 60 ||
      new Set(rows.map(row => row.topicLabel)).size !== 12 || new Set(rows.map(row => row.lang)).size !== 5 ||
      new Set(rows.map(row => row.family)).size !== 6 || rows.some(row => !row || Object.keys(row).sort().join(',') !== fields ||
        Object.values(row).some(value => typeof value !== 'string' || !value.trim()) || row.body.length > 100000 || row.title.length > 1000))
    throw new Error('V7_SCHEMA');
  return rows.map(row => ({ ...row, eventKey: row.topicLabel }));
}
async function sourceHashes() {
  const result = {};
  for (const name of ['README.md', 'planner.js', 'core.js', 'core.test.js', 'trust.test.js', 'run.js',
    '../teacher-distillation-v1/core.js', '../teacher-distillation-v1/aggregate.json',
    '../e5-infer.js', '../compact-paraphrase-probe-v1/infer.js', '../real-event-eval/core.js',
    '../real-diagonal-adapter-v1/core.js', '../real-diagonal-fresh-v1/core.js', '../real-diagonal-body-transfer-v1/core.js',
    '../real-diagonal-holdout-v1/core.js', '../topic-metric-rethink-v1/core.js', '../synthetic-to-globesumm-v1/scope.js',
    '../indexed-body-quality-v1/core.js', '../compact-paraphrase-probe-v1/core.js',
    '../../../src/domain/diagonal-adapter.js', '../../../src/domain/body-topic-metric.js', '../../../src/domain/owner-topic-planner.js',
    '../../../src/domain/alternate-topic-planner-indexed.js', '../../../src/domain/alternate-topic-planner.js',
    '../../../src/domain/guarded-body-topic-planner.js', '../../../src/domain/errors.js',
    '../../../../../spikes/topic-resolution/browser/core/page-content-policy.js',
    '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
    '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'])
    result[name] = sha(await readFile(new URL(name, import.meta.url)));
  return result;
}
function guardMap(rows, vectors) {
  if (!(vectors instanceof Map) || vectors.size !== rows.length) throw new Error('VECTOR_MAP');
  for (const row of rows) checkedUnit(vectors.get(row.id));
  return normalizeVectors(rows, vectors);
}
async function embed(rows, method, label) {
  const vectors = new Map(); let elapsedMs = 0;
  for (let offset = 0; offset < rows.length; offset += 64) {
    const batch = rows.slice(offset, offset + 64), result = await method(batch); elapsedMs += result.elapsedMs;
    for (const [id, vector] of result.vectors) { checkedUnit(vector); vectors.set(id, vector); }
    stage(label, { completed: Math.min(offset + batch.length, rows.length), total: rows.length });
  }
  return { vectors: guardMap(rows, vectors), elapsedMs };
}
function datasetSnapshot(documents, raw) {
  const rows = documents.map((row, index) => ({ id: `source-${String(index).padStart(4, '0')}`, eventKey: row.eventKey,
    family: row.family ?? (row.familyKey?.startsWith('family:') ? row.familyKey : null), lang: row.lang, viewpoint: row.viewpoint }));
  return { rows, snapshot: { sources: rows.map((row, index) => ({ id: row.id, provenance: 'owner-local-page-embedding/v1',
    extractorVersion: 'main-text-prefix/v1', title: documents[index].title.slice(0, 200),
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: Array.from(raw.get(documents[index].id)) } })),
    sourceLinks: rows.map(row => ({ sourceId: row.id, method: 'learned-provisional' })) } };
}
async function main() {
  const args = process.argv.slice(2), freezing = args.length === 1 && args[0] === '--freeze';
  if (!freezing && !(args.length === 3 && args[0] === '--measure' && args[1] === '--freeze-hash' && /^[a-f0-9]{64}$/u.test(args[2])))
    throw new Error('ARGUMENTS');
  const began = performance.now(), closed = await reference();
  const [cohort, pinnedAssets, v7, sources, diagonal] = await Promise.all([corpus(closed.result), assets(closed.result), v7Bytes(), sourceHashes(),
    loadDiagonalAdapter(fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url)))]);
  if (diagonal.manifestSha256 !== closed.result.descriptor.oldDiagonalManifestSha256) throw new Error('DIAGONAL');
  const descriptor = { schema: 'ridge1-practical-evaluation/v1', policy: PRACTICAL_POLICY, sources, corpusSha256: CORPUS_SHA,
    assets: pinnedAssets, closedReferenceSha256: closed.sha256, closedFreezeHash: CLOSED_HASH,
    expectedRidge1ParameterSha256: PARAMETER_SHA, lambda: 1, floors: FLOORS,
    diagonalManifestSha256: diagonal.manifestSha256, cohorts: cohort.metadata,
    independentV7: { sha256: V7_SHA, reports: 60, topics: 12, languages: 5, families: 6, prefreezeParsed: false },
    inputs: 'fit475-E5-query512+teacher-plain128;fresh-and-v7-E5-query512-only;BODY4096',
    success: 'aggregate-correct-and-pure-strictly-better-than-diagonal;wrong-and-mixed-no-worse-per-real-and-v7;all-methods-complete',
    currentCatalogMeasured: false, productionComposition: false, pureDeployableProposal: true };
  const freezeHash = sha(JSON.stringify(descriptor));
  if (freezing) { stage('freeze', { descriptor, freezeHash, privateInference: false, fitting: false, qualityMeasured: false }); return; }
  if (freezeHash !== args[2]) throw new Error('FREEZE_MISMATCH');
  stage('selection', { fit: cohort.fit.length, fresh: cohort.fresh.length, freshEvents: cohort.metadata.fresh.events, v7: 60, freezeHash });
  const fitRaw = await embed(cohort.fit, rows => embedDocuments(rows, 'body'), 'fit-E5-body');
  const fitTeacher = await embed(cohort.fit, embedParaphrase, 'fit-teacher-body');
  const fitStarted = performance.now(), model = fitRidge(pairedStatistics(cohort.fit, fitRaw.vectors, fitTeacher.vectors), 1);
  const parameterSha256 = sha(JSON.stringify([Array.from(model.weights), Array.from(model.meanX), Array.from(model.meanY)]));
  if (parameterSha256 !== PARAMETER_SHA) throw new Error('REFIT_MISMATCH');
  const fitElapsedMs = performance.now() - fitStarted;
  stage('refit-matched', { parameterSha256, lambda: 1, noEvaluationInferenceYet: true });
  const synthetic = parseV7(v7), datasets = [{ name: 'real-fresh', documents: cohort.fresh }, { name: 'independent-v7', documents: synthetic }];
  const scales = diagonal.parameters.map(value => Math.exp(value));
  const planners = { raw: createPracticalTopicPlanner({ representation: 'raw-e5-baseline', floor: FLOORS.raw, transform: values => values }),
    diagonal: createPracticalTopicPlanner({ representation: 'owner-local-diagonal-adapter/v1', floor: FLOORS.diagonal,
      transform: values => checkedUnit(values.map((value, index) => value * scales[index])) }),
    ridge1: createPracticalTopicPlanner({ representation: 'owner-local-linear-teacher-transfer/ridge1-v1', floor: FLOORS.ridge1,
      transform: values => { checkedUnit(values); return predicted(values, model); } }) };
  const results = []; let evaluationInferenceMs = 0;
  for (const dataset of datasets) {
    const raw = await embed(dataset.documents, rows => embedDocuments(rows, 'body'), `evaluate-E5-${dataset.name}`);
    evaluationInferenceMs += raw.elapsedMs;
    const { rows, snapshot } = datasetSnapshot(dataset.documents, raw.vectors), methods = {}, partitions = {};
    for (const [name, planner] of Object.entries(planners)) {
      try {
        const result = planner.plan(snapshot), reverse = planner.plan({ ...snapshot,
          sources: [...snapshot.sources].reverse(), sourceLinks: [...snapshot.sourceLinks].reverse() });
        const orderStable = JSON.stringify(result.partitions) === JSON.stringify(reverse.partitions);
        if (!orderStable) throw new Error('ORDER_UNSTABLE');
        methods[name] = { status: 'complete', policyVersion: result.policyVersion, representation: planner.representation,
          diagnostics: result.diagnostics, reverseDiagnostics: reverse.diagnostics, orderStable,
          ...aggregatePartition(rows, result.partitions), ...exposure(rows, result.partitions) };
        partitions[name] = result.partitions;
      } catch (error) {
        if (error.code !== 'capacity') throw error;
        methods[name] = { status: 'capacity-failclosed', partialPartitionReturned: false,
          policyVersion: planner.policyVersion, representation: planner.representation };
      }
      stage('method-complete', { cohort: dataset.name, method: name, ...methods[name] });
    }
    const differences = {};
    for (const [a, b] of [['raw', 'diagonal'], ['raw', 'ridge1'], ['diagonal', 'ridge1']])
      differences[`${a}-to-${b}`] = partitions[a] && partitions[b] ? policyDifference(rows, partitions[a], partitions[b]) : null;
    results.push({ name: dataset.name, rows: rows.length, events: new Set(rows.map(row => row.eventKey)).size,
      previouslyMeasured: false, methods, differences });
  }
  if (JSON.stringify(await sourceHashes()) !== JSON.stringify(sources)) throw new Error('SOURCES_CHANGED');
  stage('result', { descriptor, freezeHash, parameterSha256, success: practicalSuccess(results), cohorts: results,
    elapsedMs: Math.round(performance.now() - began), inferenceMs: { fitE5: fitRaw.elapsedMs, fitTeacher: fitTeacher.elapsedMs,
      evaluationE5: evaluationInferenceMs }, fitElapsedMs, weightsSaved: false, vectorsSaved: false, proseSaved: false,
    noProviderCall: true, activated: false, currentCatalogMeasured: false,
    caveats: ['new-precision-first-protocol-not-closed-screen-rescue', 'pure-proposal-not-production-version-seam',
      'fixed-control-floors-not-existing-active-policy', 'body-prefix-not-actual-Chrome-capture', 'no-context-URLs-in-quality-cohorts',
      'real-family-viewpoint-not-independent-gold', 'synthetic-adjacent-story-labels-not-owner-broad-topic-gold',
      'no-calibration-or-model-selection-from-fresh', 'no-rights-release-or-activation-conclusion'] });
}
main().catch(() => { stage('failure', { code: 'FIXED_RIDGE1_PRACTICAL_CONTRACT_FAILURE' }); process.exitCode = 1; });
