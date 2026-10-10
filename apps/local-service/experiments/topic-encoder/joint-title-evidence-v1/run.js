import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { splitTrainEvents, omitConflictingInputs, fitDiagonal, transform, normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { selectFreshRethink } from '../topic-metric-rethink-v1/core.js';
import { evaluateTopicCoverage } from '../topic-coverage-metrics/core.js';
import { POLICY, HEADS, wholeEvents, allPairs, fitCandidates, evaluationCandidates,
  fitHead, headScore, calibrationGate, ranking } from './core.js';
import { createJointEncoder } from './infer.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORPUS_HASH = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stage = (name, counts = {}) => process.stdout.write(`${JSON.stringify({ stage: name, ...counts })}\n`);
async function loadCorpus(privateDir, filename) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(filename)) throw new Error('PRIVATE_PATH');
  const [directory, input, root, info, dirInfo] = await Promise.all([realpath(privateDir), realpath(filename), realpath(ROOT), lstat(filename), lstat(privateDir)]);
  if (!privateScopeAllowed(root, directory, input) || !info.isFile() || info.isSymbolicLink() ||
      !dirInfo.isDirectory() || dirInfo.isSymbolicLink() || info.size !== 14972999) throw new Error('PRIVATE_FILE');
  const bytes = await readFile(input);
  if (sha(bytes) !== CORPUS_HASH) throw new Error('CORPUS_HASH');
  return parseCorpus(bytes, { leadCharacters: 4096 });
}
function report(rows, pairs, candidates, score, gate) {
  const admitted = candidates.filter(pair => score(pair) >= gate.threshold);
  const coverage = evaluateTopicCoverage(rows, admitted.map(pair => [pair.a.id, pair.b.id]));
  return { calibration: { ...gate, threshold: Number.isFinite(gate.threshold) ? gate.threshold : null },
    ranking: ranking(candidates, score), candidateTruePairs: candidates.filter(pair => pair.same).length,
    retrievalTruePairsMissed: pairs.filter(pair => pair.same).length - candidates.filter(pair => pair.same).length,
    admittedTrue: admitted.filter(pair => pair.same).length, admittedFalse: admitted.filter(pair => !pair.same).length,
    sameCategoryFalse: admitted.filter(pair => !pair.same && pair.sameCategory).length,
    crossLanguageTrue: admitted.filter(pair => pair.same && pair.crossLanguage).length,
    coverage: { ...coverage.grouped, goldTruePairs: coverage.gold.truePairs },
  };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--dry-run') {
    stage('dry-run', { privateCorpusOpened: false, modelLoaded: false, policy: POLICY }); return;
  }
  const freshMode = args[6] === '--fresh';
  if ((args.length !== 7 && !(freshMode && args.length === 9 && args[7] === '--freeze-hash' && /^[a-f0-9]{64}$/u.test(args[8]))) ||
      args[0] !== '--private-dir' || args[2] !== '--input' || args[4] !== '--asset-dir' ||
      !['--development', '--fresh'].includes(args[6]) || freshMode && args.length !== 9) throw new Error('ARGUMENTS');
  const started = performance.now(), sourceHashes = {};
  for (const name of ['README.md', 'core.js', 'run.js', 'infer.js', 'onnx-output.js',
    '../e5-infer.js', '../real-event-eval/core.js', '../real-diagonal-adapter-v1/core.js',
    '../real-diagonal-fresh-v1/core.js', '../real-diagonal-body-transfer-v1/core.js', '../topic-metric-rethink-v1/core.js'])
    sourceHashes[name] = sha(await readFile(new URL(name, import.meta.url)));
  const corpus = await loadCorpus(args[1], args[3]);
  const previous = selectEventDisjoint(corpus.documents), preliminary = selectEventDisjoint(corpus.documents, 300);
  const titleFresh = selectFreshEvents(corpus.documents, previous.documents, preliminary.documents);
  const bodyFresh = selectBodyTransferEvents(corpus.documents, previous.documents, preliminary.documents, titleFresh.documents);
  if (previous.documents.length !== 1192) throw new Error('PREVIOUS_SELECTION');
  const originalTrain = previous.documents.filter(row => row.split === 'train');
  const splits = splitTrainEvents(originalTrain), clean = new Set(omitConflictingInputs(originalTrain).rows.map(row => row.id));
  const fitting = wholeEvents(splits.fit.filter(row => clean.has(row.id)), POLICY.fitArticleBudget, 'joint-title-fit-v1');
  const calibration = wholeEvents(splits.calibration, POLICY.calibrationArticleBudget, 'joint-title-calibration-v1');
  // Always reconstruct development before opening the fresh cohort to inference.
  const development = previous.documents.filter(row => row.split === 'validation');
  const evaluation = development;
  if (fitting.length < 150 || calibration.length < 70 || evaluation.length < 100) throw new Error('ARTICLE_BUDGET');
  stage('selection', { fitting: fitting.length, calibration: calibration.length, evaluation: evaluation.length,
    fresh: args[6] === '--fresh', eventGold: true, familyGold: corpus.familyGold, viewpointGold: corpus.viewpointGold });
  const { embedDocuments } = await import('../e5-infer.js');
  const vectors = new Map(), all = [...fitting, ...calibration, ...evaluation];
  // Separate short sessions bound WASM memory; texts and vectors remain RAM-only.
  for (let index = 0; index < all.length; index += 50) {
    const batch = all.slice(index, index + 50);
    const result = await embedDocuments(batch.map(row => ({ id: row.id, title: row.title, body: row.lead })), 'body');
    for (const [id, vector] of result.vectors) vectors.set(id, vector);
    stage('body-E5', { completed: Math.min(index + batch.length, all.length), total: all.length });
  }
  const diagonal = fitDiagonal(fitting, vectors), raw = normalizeVectors(all, vectors), adapted = transform(all, vectors, diagonal.parameters);
  const fitPairs = allPairs(fitting, raw, adapted), calPairs = allPairs(calibration, raw, adapted), evalPairs = allPairs(evaluation, raw, adapted);
  const fitSelected = fitCandidates(fitting, fitPairs), calSelected = evaluationCandidates(calPairs), evalSelected = evaluationCandidates(evalPairs);
  stage('candidate-pools', { fit: fitSelected.length, calibration: calSelected.length, evaluation: evalSelected.length,
    fitTrue: fitSelected.filter(pair => pair.same).length, fitFalse: fitSelected.filter(pair => !pair.same).length });
  let encoder = await createJointEncoder(args[5]);
  let diagnostics, priorEncoderDiagnostics = null;
  try {
    for (const [name, pairs] of [['fit', fitSelected], ['calibration', calSelected], ['evaluation', evalSelected]]) {
      for (let index = 0; index < pairs.length; index++) {
        const pair = pairs[index]; pair.joint = await encoder.pair(pair.a, pair.b);
        if ((index + 1) % 200 === 0 || index + 1 === pairs.length)
          stage(`joint-title-${name}`, { completed: index + 1, total: pairs.length });
      }
    }
    const results = {}, heads = new Map();
    for (const kind of HEADS) {
      const head = fitHead(fitSelected, kind), score = pair => headScore(head, pair);
      const gate = calibrationGate(calSelected, score, POLICY.headCalibrationGap);
      heads.set(kind, { head, gate });
      results[kind] = report(evaluation, evalPairs, evalSelected, score, gate);
    }
    for (const name of ['raw', 'adapted']) {
      const score = pair => pair[name], gate = calibrationGate(calSelected, score, POLICY.cosineCalibrationGap);
      results[name] = report(evaluation, evalPairs, evalSelected, score, gate);
    }
    const frozen = { sourceHashes, corpusSha256: CORPUS_HASH, policy: POLICY,
      heads: Object.fromEntries([...heads].map(([kind, item]) => [kind, { gate: item.gate,
        parametersSha256: sha(JSON.stringify([Array.from(item.head.weights), Array.from(item.head.mean), Array.from(item.head.scale)])) }])),
      cosineGates: Object.fromEntries(['raw','adapted'].map(name=>[name,results[name].calibration])),
      articleCounts: { fit: fitting.length, calibration: calibration.length, development: development.length } };
    const freezeHash = sha(JSON.stringify(frozen));
    stage('development-freeze', { freezeHash, methods: Object.fromEntries(Object.entries(results).map(([kind, result]) =>
      [kind, { averagePrecision: result.ranking.averagePrecision, admittedTrue: result.admittedTrue,
        admittedFalse: result.admittedFalse, purePages: result.coverage.articlesInPureNonSingletonGroups,
        mixedPages: result.coverage.articlesInMixedGroups }])) });
    let freshResult = null;
    if (freshMode) {
      if (freezeHash !== args[8]) throw new Error('FREEZE_MISMATCH');
      const cohort = selectFreshRethink(corpus.documents, [previous.documents, preliminary.documents,
        titleFresh.documents, bodyFresh.documents], POLICY.freshArticleBudget);
      priorEncoderDiagnostics = encoder.diagnostics();
      await encoder.release(); encoder = null;
      const freshVectors = new Map();
      for (let index = 0; index < cohort.documents.length; index += 50) {
        const batch = cohort.documents.slice(index, index + 50);
        const embedded = await embedDocuments(batch.map(row=>({id:row.id,title:row.title,body:row.lead})),'body');
        for (const [id,vector] of embedded.vectors) freshVectors.set(id,vector);
        stage('fresh-body-E5',{completed:Math.min(index+batch.length,cohort.documents.length),total:cohort.documents.length});
      }
      const freshRaw = normalizeVectors(cohort.documents,freshVectors), freshAdapted = transform(cohort.documents,freshVectors,diagonal.parameters);
      const freshPairs = allPairs(cohort.documents,freshRaw,freshAdapted), freshSelected = evaluationCandidates(freshPairs);
      encoder = await createJointEncoder(args[5]);
      for (let index=0;index<freshSelected.length;index++) {
        const pair=freshSelected[index]; pair.joint=await encoder.pair(pair.a,pair.b);
        if((index+1)%200===0||index+1===freshSelected.length) stage('fresh-joint-title',{completed:index+1,total:freshSelected.length});
      }
      const freshMethods = {};
      for (const [kind,item] of heads) freshMethods[kind]=report(cohort.documents,freshPairs,freshSelected,pair=>headScore(item.head,pair),item.gate);
      for (const name of ['raw','adapted']) freshMethods[name]=report(cohort.documents,freshPairs,freshSelected,pair=>pair[name],
        calibrationGate(calSelected,pair=>pair[name],POLICY.cosineCalibrationGap));
      freshResult={articles:cohort.documents.length,events:cohort.events,candidates:freshSelected.length,
        excludedEvents:cohort.excludedEvents,methods:freshMethods};
    }
    // Small fixed hash sample compares titles and leading context as an information ablation.
    // No head is fitted/selected from these ablation scores; they cannot be live backend input.
    const ablationPairs = [...evalSelected].sort((a, b) => sha(`joint-ablation-v1\0${a.key}`)
      .localeCompare(sha(`joint-ablation-v1\0${b.key}`))).slice(0, 120);
    const titleRanking = ranking(ablationPairs, pair => pair.joint.rankMean);
    const leadPairs = [];
    for (const pair of ablationPairs) leadPairs.push({ ...pair, joint: await encoder.pair(pair.a, pair.b, 'title-lead') });
    diagnostics = encoder.diagnostics();
    const borrowed = heads.get('joint-vectors');
    stage('result', { mode: freshMode ? 'new-events-exploratory' : 'reused-development', policy: POLICY, freezeHash, fresh: freshResult,
      sourceHashes, corpusSha256: CORPUS_HASH, articleCounts: { fit: fitting.length, calibration: calibration.length, evaluation: evaluation.length },
      eventCounts: { fit: new Set(fitting.map(row => row.eventKey)).size, calibration: new Set(calibration.map(row => row.eventKey)).size,
        evaluation: new Set(evaluation.map(row => row.eventKey)).size },
      results, ablation: { title: titleRanking, titleLead: ranking(leadPairs, pair => pair.joint.rankMean),
        borrowedJointHeadWithLead: report(evaluation, evalPairs, leadPairs,
          pair => headScore(borrowed.head, pair), borrowed.gate) },
      diagnostics, priorEncoderDiagnostics, elapsedMs: Math.round(performance.now() - started), weightsSaved: false, vectorsSaved: false,
      noProviderCall: true, activated: false,
      caveats: ['no-family-publisher-viewpoint-gold', 'corpus-events-not-app-topic-gold', 'body-prefix-surrogate-not-Chrome',
        'candidate-radius-can-miss-true-pairs', 'calibration-zero-false-is-in-sample', 'head-scores-not-calibrated-probabilities',
        'connected-component-exposure-diagnostic-not-production-policy', 'title-lead-ablation-unavailable-to-retained-backend'],
    });
  } finally { if (encoder) await encoder.release(); }
}
main().catch(error => { stage('failure', { code: ['PAIR_WORK_BUDGET', 'ARTICLE_BUDGET'].includes(error?.message) ? error.message : 'FIXED_CONTRACT_FAILURE' }); process.exitCode = 1; });
