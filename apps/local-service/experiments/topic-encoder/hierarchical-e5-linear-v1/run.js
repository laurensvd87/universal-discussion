// Explicit, supervised, one-shot synthetic experiment. No owner pages or provider.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';
import { balancedDevelopmentLoss, evaluateFrozenHeads } from './assessment.js';
import { serializeVectorPacket } from './vector-packet.js';
import { trainHierarchyLinearHeads, compileHierarchyLinearHeads } from '../../../src/domain/hierarchical-e5-linear-heads.js';
import { HEAD_POLICY_GRID, calibrateHierarchyHeadPolicy, compileHierarchyHeadAssignment } from '../../../src/domain/hierarchical-e5-head-policy.js';
import { createPackagedCrawlerEmbedder } from '../../../src/crawler/packaged-e5.js';
import { readRidgeTopicAdapter, createRidgeTopicTransform, RIDGE_PARAMETER_SHA256 } from '../../../src/domain/ridge-topic-adapter.js';
import { MODEL_ID, MODEL_SHA256 } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const here = new URL('./', import.meta.url), sha = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
const sources = ['run.js', 'supervise.py', 'assessment.js', 'vector-packet.js', 'protocol.json', 'corpus.js', 'taxonomy.js',
  '../../../src/domain/hierarchical-e5-linear-heads.js', '../../../src/domain/hierarchical-e5-head-policy.js',
  '../../../src/crawler/packaged-e5.js', '../../../src/domain/ridge-topic-adapter.js', '../../../data/ridge1-topic-adapter-v1.json',
  '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
  '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json',
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
async function bytes(name, maximum = 8 * 1024 * 1024) {
  const filename = new URL(name, here), stat = await lstat(filename);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maximum);
  const value = await readFile(filename);assert.equal(value.length, stat.size);return value;
}
async function absent(names) {
  for (const name of names) {
    try { await lstat(new URL(name, here)); }
    catch (error) { if (error.code === 'ENOENT') continue;throw error; }
    throw Error('Existing experiment evidence: repeat operation is forbidden');
  }
}
const write = (name, value) => writeFile(new URL(name, here), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function descriptor() {
  const protocol = JSON.parse(await bytes('protocol.json'));
  assert.deepEqual(protocol.policyGrid, HEAD_POLICY_GRID);assert.equal(CORPUS.length, protocol.maximumRows);
  assert.equal(protocol.minimumUsefulCoverage, 0.6);assert.equal(protocol.minimumSpecificCoverage, 0.3);
  assert.equal(protocol.representations.length * protocol.lambdas.length, protocol.maximumSearchModels);
  const ids = new Set(), groups = new Set();
  for (const [split, count] of Object.entries(protocol.expectedSplits)) assert.equal(CORPUS.filter(r => r.split === split).length, count);
  for (const row of CORPUS) {
    assert.equal(row.provenance, 'synthetic-authored');assert.ok(row.text.length > 0 && row.text.length <= 4096);
    assert.ok(!ids.has(row.id) && !groups.has(row.groupId));ids.add(row.id);groups.add(row.groupId);
  }
  const sourceHashes = {};
  for (const source of sources) sourceHashes[source] = sha(await bytes(source));
  const body = { schema: protocol.schema, protocol, sourceHashes, corpusHash: jsonHash(CORPUS), taxonomyHash: jsonHash(TAXONOMY),
    modelId: MODEL_ID, modelSha256: MODEL_SHA256, rows: CORPUS.length };
  return { ...body, freezeHash: jsonHash(body) };
}
async function verified() {
  const frozen = JSON.parse(await bytes('freeze.json'));assert.deepEqual(await descriptor(), frozen);return frozen;
}
async function claim(mode) {
  assert.equal(process.env.MURMINGLE_LINEAR_SUPERVISED, mode, 'Use the checked resource supervisor');
  await mkdir(new URL('output/', here), { recursive: true });
  await write(`output/${mode}.started.json`, { mode, operation: 'no-automatic-repeat' });
}
async function encode(frozen) {
  await absent(['output/encode.started.json', 'output/vectors.json', 'output/encoding.json']);await claim('encode');
  const ridge = createRidgeTopicTransform(readRidgeTopicAdapter(JSON.parse(await bytes('../../../data/ridge1-topic-adapter-v1.json')),
    { expectedParameterSha256: RIDGE_PARAMETER_SHA256 }));
  const coldStarted = performance.now(), encoder = await createPackagedCrawlerEmbedder(), initializationMs = performance.now() - coldStarted;
  const vectors = [], loopStarted = performance.now();
  try {
    for (const row of CORPUS) {
      const result = await encoder.embed(row.text);
      vectors.push({ id: row.id, raw: result.values, ridge: Array.from(ridge(result.values)) });
      if (vectors.length % 64 === 0) process.stdout.write(JSON.stringify({ stage: 'encoding', rows: vectors.length }) + '\n');
    }
  } finally { await encoder.close(); }
  const encodingAndTransformLoopMs = performance.now() - loopStarted, coldElapsedMs = performance.now() - coldStarted;
  const packet = { schema: frozen.schema, freezeHash: frozen.freezeHash, vectors };
  await writeFile(new URL('output/vectors.json', here), serializeVectorPacket(packet), { flag: 'wx' });
  await write('output/encoding.json', { freezeHash: frozen.freezeHash, vectorPacketSha256: sha(await bytes('output/vectors.json')),
    rows: vectors.length, initializationMs, encodingAndTransformLoopMs, coldElapsedMs });
}
function samples(packet, representation, split) {
  assert.equal(packet.vectors.length, CORPUS.length);
  const index = new Map(packet.vectors.map(r => [r.id, r[representation === 'raw-e5' ? 'raw' : 'ridge']]));
  assert.equal(index.size, CORPUS.length);assert.ok(CORPUS.every(r => index.has(r.id)));
  return CORPUS.filter(r => r.split === split).map(row => ({ id: row.id, groupId: row.groupId, split,
    language: row.language, expectedTopicId: row.expectedTopicId, vector: index.get(row.id) }));
}
function representationHash(frozen, representation) {
  return jsonHash({ representation, encoderHash: frozen.sourceHashes['../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js'],
    modelSha256: MODEL_SHA256, ridgeParameterSha256: representation === 'pinned-ridge' ? RIDGE_PARAMETER_SHA256 : null });
}
// Upper bound on the trainer's explicit charged arithmetic, not copying/hashing/wall time.
function maximumTrainingWork(n, nodeCount) {
  const d = 384;
  return 4 * n * d + d + d * n * (n + 1) / 2 + n + n * (n + 1) * (n + 2) / 6 +
    nodeCount * (n * 9 + n * (n - 1) + 4 * n + n * d + d + 2);
}
async function packetFor(frozen) {
  const encoding = JSON.parse(await bytes('output/encoding.json')), packetBytes = await bytes('output/vectors.json');
  assert.equal(encoding.freezeHash, frozen.freezeHash);assert.equal(sha(packetBytes), encoding.vectorPacketSha256);
  const packet = JSON.parse(packetBytes);assert.equal(packet.freezeHash, frozen.freezeHash);return { packet, encoding };
}
async function fit(frozen) {
  await absent(['output/fit.started.json', 'output/fit.json', 'output/model.json', 'output/policy.json']);await claim('fit');
  const { packet, encoding } = await packetFor(frozen), protocol = frozen.protocol, candidates = [];
  const bound = maximumTrainingWork(protocol.expectedSplits.training, TAXONOMY.nodes.length);
  assert.ok(bound <= 100_000_000 && bound * protocol.maximumSearchModels <= protocol.maximumAggregateCountedTrainingWork);
  let aggregateWork = 0;
  for (const representation of protocol.representations) for (const lambda of protocol.lambdas) {
    const training = samples(packet, representation, 'training').map(({ language, ...r }) => r);
    const started = performance.now(), model = trainHierarchyLinearHeads({ nodes: TAXONOMY.nodes.map(({ id, parentId }) => ({ id, parentId })),
      rows: training, representation, representationHash: representationHash(frozen, representation), trainingVersion: frozen.freezeHash, lambda });
    assert.ok(model.trainingWork.units <= bound);aggregateWork += model.trainingWork.units;
    assert.ok(aggregateWork <= protocol.maximumAggregateCountedTrainingWork);
    candidates.push({ model, elapsedMs: performance.now() - started,
      development: balancedDevelopmentLoss(model, samples(packet, representation, 'development')) });
  }
  assert.equal(candidates.length, protocol.maximumSearchModels);
  candidates.sort((a, b) => a.development.loss - b.development.loss); // stable predeclared prior order on exact ties
  const selected = candidates[0], policy = calibrateHierarchyHeadPolicy({ model: selected.model,
    rows: samples(packet, selected.model.representation, 'calibration'),
    minimumAcceptedGroups: protocol.calibration.minimumAcceptedGroups, targetPrecision: protocol.calibration.targetPrecision });
  compileHierarchyHeadAssignment({ model: selected.model, policy });
  const development = CORPUS.filter(r => r.split === 'development');
  // Persist the selected model and independently fitted policy BEFORE opening final classification.
  await writeFile(new URL('output/model.json', here), JSON.stringify(selected.model), { flag: 'wx' });
  await writeFile(new URL('output/policy.json', here), JSON.stringify(policy), { flag: 'wx' });
  await write('output/fit.json', { schema: frozen.schema, freezeHash: frozen.freezeHash,
    modelSha256: sha(await bytes('output/model.json')), policySha256: sha(await bytes('output/policy.json')),
    selection: 'development-only', representation: selected.model.representation, lambda: selected.model.lambda,
    developmentIdHashes: development.map(r => sha(r.id)).sort(), developmentGroupHashes: development.map(r => sha(r.groupId)).sort(),
    candidates: candidates.map(c => ({ representation: c.model.representation, lambda: c.model.lambda,
      trainingWork: c.model.trainingWork, trainingElapsedMs: c.elapsedMs, development: c.development })),
    aggregateCountedTrainingWork: aggregateWork, preflightTrainingWorkUpperBound: bound * protocol.maximumSearchModels,
    calibratedRules: policy.rules, encoding, finalTestOpened: false, productionReady: false });
  process.stdout.write(JSON.stringify({ stage: 'fitted-and-calibrated', representation: selected.model.representation,
    lambda: selected.model.lambda, aggregateWork, enabledRules: policy.rules.filter(r => r.enabled).length }) + '\n');
}
async function finalTest(frozen) {
  await absent(['output/test.started.json', 'measured-results.json']);await claim('test');
  const fitRecord = JSON.parse(await bytes('output/fit.json')), modelBytes = await bytes('output/model.json'), policyBytes = await bytes('output/policy.json');
  assert.equal(fitRecord.freezeHash, frozen.freezeHash);assert.equal(fitRecord.selection, 'development-only');assert.equal(fitRecord.finalTestOpened, false);
  assert.equal(sha(modelBytes), fitRecord.modelSha256);assert.equal(sha(policyBytes), fitRecord.policySha256);
  const model = JSON.parse(modelBytes), policy = JSON.parse(policyBytes), { packet, encoding } = await packetFor(frozen);
  compileHierarchyLinearHeads(model);assert.equal(model.representationHash, representationHash(frozen, model.representation));
  const test = evaluateFrozenHeads({ model, policy, rows: samples(packet, model.representation, 'test'),
    developmentIdHashes: fitRecord.developmentIdHashes, developmentGroupHashes: fitRecord.developmentGroupHashes });
  const caseTypes = new Map(CORPUS.filter(row => row.split === 'test').map(row => [row.id, row.caseType]));
  const byCaseType = [...new Set(caseTypes.values())].map(caseType => {
    const slice = test.outcomes.filter(row => caseTypes.get(row.id) === caseType);
    return { caseType, rows: slice.length, accepted: slice.filter(r => r.primaryNodeId !== null).length,
      safeAccepted: slice.filter(r => r.safeAccepted).length, deepestCorrect: slice.filter(r => r.exactOutcome).length };
  });
  await write('measured-results.json', { schema: frozen.schema, freezeHash: frozen.freezeHash,
    vectorPacketSha256: encoding.vectorPacketSha256, selectedModelSha256: fitRecord.modelSha256,
    selectedPolicySha256: fitRecord.policySha256, selection: { representation: model.representation, lambda: model.lambda,
      basedOn: 'development-only', calibrationSplit: 'separate-calibration', testRetuning: false },
    fit: fitRecord, test, byCaseType, corpus: { rows: CORPUS.length, provenance: 'new-authored-synthetic-feasibility', realWebQualityClaim: false },
    productionReady: false, ownerDataRead: false, providerCalls: 0, canonicalWrites: 0, crawlerActions: 0 });
  process.stdout.write(JSON.stringify({ stage: 'locked-test-complete', accepted: test.accepted, safe: test.safeAccepted,
    leafCorrect: test.leafCorrect, leafAccepted: test.leafAccepted, broadFallback: test.broadFallback,
    wrongBroad: test.wrongBroad, classifierP95Ms: test.timing.p95Ms, productionReady: false }) + '\n');
}

const [mode, ...rest] = process.argv.slice(2);
if (!mode) process.stdout.write('No action. Explicit --freeze, --verify, or supervised --encode/--fit/--test only.\n');
else if (rest.length || !['--freeze', '--verify', '--encode', '--fit', '--test'].includes(mode)) throw Error('Invalid experiment operation');
else if (mode === '--freeze') await write('freeze.json', await descriptor());
else {
  const frozen = await verified();
  if (mode === '--verify') process.stdout.write(JSON.stringify({ verified: true, freezeHash: frozen.freezeHash, sourceHashes: sources.length }) + '\n');
  else if (mode === '--encode') await encode(frozen);
  else if (mode === '--fit') await fit(frozen);
  else await finalTest(frozen);
}
