// Maintained public branch benchmark. Fixed corpus, separate fit/evaluation,
// ordinary immutable run artifacts; no ingestion, provider or native authority.
import { createHash } from 'node:crypto';
import { mkdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createPackagedCrawlerEmbedder } from '../src/crawler/packaged-e5.js';
import { compilePairedE5Input, describePairedE5Input, applyPairedE5Input } from '../src/domain/hierarchical-e5-paired-input.js';
import { trainBinaryHierarchyDetail, compileBinaryHierarchyDetail, describeBinaryHierarchyDetail } from '../src/domain/hierarchy-binary-detail.js';
import { compileRootedHierarchyMatcher, classifyRootedHierarchyMatcher } from '../src/domain/hierarchy-rooted-matcher.js';
import { createHierarchyPublicCapture } from './hierarchy-public-capture.js';
import { evaluateHierarchyPublicProbe } from './hierarchy-quality-evaluation.js';
import { GTA_TRAIN_PROBES, GTA_CAL_PROBES, GTA_TEST_PROBES, GTA_CORPUS_SCOPE } from './hierarchy-gta-corpus.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const requireTrue = value => { if (!value) throw new Error('Branch benchmark identity refused'); };
const INPUTS = {
  rootModel: ['hierarchical-e5-current-producer-transfer-v1/output/root-model.json', '442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'],
  rootPolicy: ['hierarchical-e5-current-producer-transfer-v1/output/root-policy.json', '309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'],
  inputDefinition: ['hierarchical-e5-current-producer-transfer-v1/output/input-definition.json', '2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'],
};
const SOURCES = ['./run-hierarchy-detail-quality.js', './hierarchy-gta-corpus.js',
  './hierarchy-public-capture.js', './hierarchy-public-probes.js', './hierarchy-recipe-corpus.js', './hierarchy-quality-evaluation.js',
  '../src/domain/hierarchy-rooted-matcher.js', '../src/domain/hierarchy-binary-detail.js',
  '../src/domain/hierarchical-e5-paired-input.js', '../src/domain/hierarchical-e5-paired-linear-heads.js',
  '../src/domain/hierarchical-e5-observed-head-policy.js',
  '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
  '../src/crawler/packaged-e5.js', '../src/crawler/public-fetch.js', '../src/crawler/robots.js',
  '../src/crawler/static-capture.js', '../src/crawler/url-policy.js',
  '../../../spikes/topic-resolution/browser/core/page-content-policy.js',
  '../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
  '../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json'];
// The first run is retained at hierarchy-gta-detail-fit-20261026: nine parser
// refusals left no positive TRAIN support. This fresh run follows the causal
// metadata-parser repair, using the identical subjects, labels and fit policy.
const FIT = new URL('../data/hierarchy-gta-detail-fit-parser-repair-20261026/', import.meta.url);
const EVALUATION = new URL('../data/hierarchy-gta-detail-evaluation-20261026/', import.meta.url);
const flags = { productionValidated: false, assignmentAuthority: false, nativeObservation: false,
  representativePopulation: false, statisticalIndependenceClaim: false };
async function bytes(url) {
  const info = await lstat(url);
  requireTrue(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 4 * 1024 * 1024);
  const raw = await readFile(url); requireTrue(raw.length === info.size); return raw;
}
async function save(folder, name, value) {
  const raw = Buffer.from(JSON.stringify(value) + '\n'); requireTrue(raw.length <= 4 * 1024 * 1024);
  await writeFile(new URL(name, folder), raw, { flag: 'wx' });
  return { file: name, bytes: raw.length, sha256: hash(raw) };
}
async function pinned(folder, name, pin) {
  requireTrue(pin?.file === name); const raw = await bytes(new URL(name, folder));
  requireTrue(raw.length === pin.bytes && hash(raw) === pin.sha256); return JSON.parse(raw);
}
async function loadInputs() {
  const values = {}, pins = {};
  for (const [name, [relative, expected]] of Object.entries(INPUTS)) {
    const raw = await bytes(new URL('../experiments/topic-encoder/' + relative, import.meta.url));
    requireTrue(hash(raw) === expected); values[name] = JSON.parse(raw); pins[name] = { bytes: raw.length, sha256: expected };
  }
  return { values, pins };
}
async function sourcePins() {
  const pins = {};
  for (const relative of SOURCES) { const raw = await bytes(new URL(relative, import.meta.url)); pins[relative] = { bytes: raw.length, sha256: hash(raw) }; }
  return pins;
}
async function recheck(pins, sources) {
  requireTrue(JSON.stringify((await loadInputs()).pins) === JSON.stringify(pins));
  requireTrue(JSON.stringify(await sourcePins()) === JSON.stringify(sources));
}
function allGroupsDisjoint() {
  const all = [...GTA_TRAIN_PROBES, ...GTA_CAL_PROBES, ...GTA_TEST_PROBES];
  requireTrue(all.length === 22 && new Set(all.map(row => row.id)).size === 22 &&
    new Set(all.map(row => row.groupId)).size === 22 && new Set(all.map(row => row.url)).size === 22);
}
export async function acquireHierarchyDetailRows(probes, methods, folder, rows, casePins, {
  createCapture = () => createHierarchyPublicCapture({ deadline: Date.now() + 240000 }),
  createEmbedder = createPackagedCrawlerEmbedder, persist = save,
  progress = value => process.stdout.write(JSON.stringify(value) + '\n'),
} = {}) {
  let capture = null, encoder = null, failure = null, current = null;
  try {
    capture = createCapture();
    for (const probe of probes) {
      current = probe;
      const value = await evaluateHierarchyPublicProbe({ probe, capture, methods,
        getEmbedder: async () => { encoder ??= await createEmbedder(); return encoder; },
        now: () => performance.now() });
      if (value.fatal) failure ??= value.row.failureStage;
      const row = { ...value.row, split: probe.split, member: probe.member };
      rows.push(row); casePins.push(await persist(folder, probe.id + '.json', row));
      progress({ completed: rows.length, total: probes.length,
        scored: rows.filter(entry => entry.evaluationStatus === 'scored').length });
      if (value.fatal) break;
    }
  } catch {
    failure ??= 'acquisition-or-persistence';
    if (current && !rows.some(row => row.id === current.id)) rows.push({ id: current.id,
      groupId: current.groupId, url: current.url, split: current.split, member: current.member,
      attempted: true, captureStatus: 'unknown', evaluationStatus: 'failed', failureStage: 'orchestration' });
  }
  finally { if (encoder) try { await encoder.close(); } catch { failure ??= 'encoder-close'; } }
  const suffix = [];
  for (const probe of probes.slice(rows.length)) {
    const row = { id: probe.id, groupId: probe.groupId, url: probe.url, split: probe.split,
      member: probe.member, attempted: false, captureStatus: 'not-attempted', evaluationStatus: 'not-attempted' };
    rows.push(row); suffix.push(row);
  }
  // Complete the in-memory roster before any more fallible output. The caller's
  // failure manifest retains it even when a case file cannot be written.
  for (const row of suffix) try { casePins.push(await persist(folder, row.id + '.json', row)); }
  catch { failure ??= 'case-persistence'; }
  let snapshot = null;
  try { snapshot = capture?.snapshot() ?? null; } catch { failure ??= 'capture-snapshot'; }
  return { failure, capture: snapshot };
}
export async function runHierarchyDetailQuality(mode, branch, acceptedFitSha) {
  requireTrue(branch === 'gta' && (mode === 'fit' && arguments.length === 2 ||
    mode === 'evaluate' && arguments.length === 3 && typeof acceptedFitSha === 'string' && /^[a-f0-9]{64}$/.test(acceptedFitSha)));
  allGroupsDisjoint();
  const folder = mode === 'fit' ? FIT : EVALUATION;
  await mkdir(folder); const start = performance.now(), rows = [], casePins = [];
  let stage = 'binding';
  try {
    const { values, pins } = await loadInputs(), sources = await sourcePins();
    const pair = compilePairedE5Input(values.inputDefinition), representation = describePairedE5Input(pair);
    const nodes = [...values.rootModel.nodes, { id: 'video-games', parentId: 'games' }, { id: 'gta', parentId: 'video-games' }];
    if (mode === 'fit') {
      const rootOnlyMatcher = compileRootedHierarchyMatcher({ ...values, nodes, detailArtifacts: [] });
      const inputs = await save(folder, 'inputs.json', { inputPins: pins, sourcePins: sources,
        training: GTA_TRAIN_PROBES, calibration: GTA_CAL_PROBES, scope: GTA_CORPUS_SCOPE, ...flags });
      stage = 'train-cal-capture';
      const captured = await acquireHierarchyDetailRows([...GTA_TRAIN_PROBES, ...GTA_CAL_PROBES], {
        classify(query) {
          const value = applyPairedE5Input(pair, query); requireTrue(value.status === 'available');
          return { vector: value.vector, root: classifyRootedHierarchyMatcher(rootOnlyMatcher, query) };
        },
      }, folder, rows, casePins);
      if (captured.failure) { await save(folder, 'failure.json', { stage, ...captured, rows, casePins, ...flags }); return { status: 'failed', stage }; }
      const known = rows.filter(row => row.evaluationStatus === 'scored');
      const trainingRows = known.filter(row => row.split === 'training').map(row =>
        ({ id: row.id, groupId: row.groupId, label: row.member, vector: row.methods.vector }));
      const calibrationRows = known.filter(row => row.split === 'calibration').map(row =>
        ({ id: row.id, groupId: row.groupId, label: row.member, vector: row.methods.vector, language: 'en' }));
      stage = 'binary-fit';
      const artifact = trainBinaryHierarchyDetail({ nodeId: 'gta', canonicalPath: GTA_CORPUS_SCOPE.canonicalPath,
        representation: representation.representation, representationHash: representation.representationHash,
        trainingVersion: 'gta-public-franchise-membership/20261026', trainingRows, calibrationRows });
      const description = describeBinaryHierarchyDetail(compileBinaryHierarchyDetail(artifact));
      await recheck(pins, sources);
      const savedArtifact = await save(folder, 'artifact.json', artifact);
      const calibration = await save(folder, 'calibration.json', { audit: artifact.audit, eligible: artifact.eligible,
        reason: artifact.reason, availability: rows.map(({ id, split, member, evaluationStatus, captureReason, methods }) =>
          ({ id, split, member, evaluationStatus, captureReason, rootPath: methods?.root?.rootPath })), casePins, ...captured, ...flags });
      const result = { schema: 'hierarchy-detail-public-fit/v1', status: 'completed', branch, inputs,
        artifact: savedArtifact, calibration, artifactHash: description.artifactHash, eligible: artifact.eligible,
        casePins, scope: GTA_CORPUS_SCOPE, rootRetuned: false, testEvaluated: false,
        elapsedMilliseconds: performance.now() - start, ...flags };
      const saved = await save(folder, 'fit-result.json', result);
      return { status: 'completed', eligible: result.eligible, fitResultSha256: saved.sha256 };
    }
    const rawFit = await bytes(new URL('fit-result.json', FIT)); requireTrue(hash(rawFit) === acceptedFitSha);
    const fit = JSON.parse(rawFit);
    requireTrue(fit.schema === 'hierarchy-detail-public-fit/v1' && fit.branch === branch && fit.eligible === true &&
      fit.status === 'completed' && fit.rootRetuned === false && fit.testEvaluated === false);
    const inputs = await pinned(FIT, 'inputs.json', fit.inputs);
    requireTrue(JSON.stringify(inputs.inputPins) === JSON.stringify(pins) && JSON.stringify(inputs.sourcePins) === JSON.stringify(sources));
    const artifact = await pinned(FIT, 'artifact.json', fit.artifact); await pinned(FIT, 'calibration.json', fit.calibration);
    requireTrue(describeBinaryHierarchyDetail(compileBinaryHierarchyDetail(artifact)).artifactHash === fit.artifactHash);
    const matcher = compileRootedHierarchyMatcher({ ...values, nodes, detailArtifacts: [artifact] });
    const binding = await save(folder, 'inputs.json', { acceptedFitSha256: acceptedFitSha, artifact: fit.artifact,
      inputPins: pins, sourcePins: sources, scope: GTA_CORPUS_SCOPE, ...flags });
    stage = 'test-capture';
    const captured = await acquireHierarchyDetailRows(GTA_TEST_PROBES, { classify: query => classifyRootedHierarchyMatcher(matcher, query) }, folder, rows, casePins);
    await recheck(pins, sources); requireTrue(hash(await bytes(new URL('fit-result.json', FIT))) === acceptedFitSha);
    await pinned(FIT, 'artifact.json', fit.artifact);
    const scored = rows.filter(row => row.evaluationStatus === 'scored'), positives = scored.filter(row => row.member),
      negatives = scored.filter(row => !row.member), refined = row => row.methods.semanticPath.includes('gta');
    const result = { schema: 'hierarchy-detail-public-evaluation/v1', status: captured.failure ? 'failed' : 'completed',
      branch, total: 6, available: scored.length, unavailable: 6 - scored.length,
      rootCorrect: scored.filter(row => row.methods.rootPath[0] === 'games').length,
      rootWrong: scored.filter(row => row.methods.rootPath.length && row.methods.rootPath[0] !== 'games').length,
      rootAbstained: scored.filter(row => !row.methods.rootPath.length).length,
      positiveAvailable: positives.length, positiveRefined: positives.filter(refined).length,
      negativeAvailable: negatives.length, falseRefinements: negatives.filter(refined).length,
      positiveNotRefined: positives.filter(row => !refined(row)).length,
      acceptedFitSha256: acceptedFitSha, inputsSha256: binding.sha256, casePins,
      timingRows: rows.map(({ id, bodyMilliseconds, titleMilliseconds, matchingMilliseconds }) =>
        ({ id, bodyMilliseconds, titleMilliseconds, matchingMilliseconds })),
      ...captured, elapsedMilliseconds: performance.now() - start, scope: GTA_CORPUS_SCOPE, rootRetuned: false, ...flags };
    await save(folder, 'result.json', result);
    return { status: result.status, available: result.available, positiveRefined: result.positiveRefined, falseRefinements: result.falseRefinements };
  } catch { await save(folder, 'failure.json', { stage, rows, casePins, elapsedMilliseconds: performance.now() - start, ...flags }); return { status: 'failed', stage }; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const result = args.length === 2 ? await runHierarchyDetailQuality(...args) :
      args.length === 3 ? await runHierarchyDetailQuality(...args) : { status: 'failed', stage: 'arguments' };
    process.stdout.write(JSON.stringify(result) + '\n'); if (result.status !== 'completed') process.exitCode = 1;
  } catch { process.stderr.write('Hierarchy branch benchmark failed.\n'); process.exitCode = 1; }
}
