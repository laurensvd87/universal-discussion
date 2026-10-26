import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyStoredLinearHierarchyExperiment, PUBLIC_SOURCES, LOCAL_SOURCES } from './verify.js';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';

// In-memory stored metadata only. Never fit, score, encode, open actual results,
// load local vector files or create/change a real execution receipt.
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const bytes = value => Buffer.from(JSON.stringify(value));
const parse = buffer => JSON.parse(buffer);

function fixture() {
  const files = new Map([...PUBLIC_SOURCES, ...LOCAL_SOURCES].map(name => [name, Buffer.from(`fixed-source-fixture:${name}`)]));
  const protocol = { schema: 'hierarchical-e5-linear-experiment/v1', maximumRows: 384,
    expectedSplits: { training: 128, development: 64, calibration: 96, test: 96 },
    representations: ['pinned-ridge', 'raw-e5'], lambdas: [0.01, 0.1] };
  files.set('protocol.json', bytes(protocol));
  const descriptor = { schema: protocol.schema, protocol,
    sourceHashes: Object.fromEntries([...files].map(([name, buffer]) => [name, hash(buffer)])),
    corpusHash: digest(CORPUS), taxonomyHash: digest(TAXONOMY), rows: CORPUS.length };
  const frozen = { ...descriptor, freezeHash: digest(descriptor) };
  files.set('freeze.json', bytes(frozen));
  const model = { representation: 'pinned-ridge', lambda: 0.01, experimental: true, productionValidated: false,
    parameterHash: '1'.repeat(64), trainingHash: '2'.repeat(64), provenanceHash: '3'.repeat(64), taxonomyHash: '4'.repeat(64) };
  const policyBody = { modelArtifactHash: digest(model), modelParameterHash: model.parameterHash,
    modelTrainingHash: model.trainingHash, modelProvenanceHash: model.provenanceHash, taxonomyHash: model.taxonomyHash,
    experimental: true, productionValidated: false };
  const policy = { ...policyBody, policyHash: digest(policyBody) };
  const packet = { schema: frozen.schema, freezeHash: frozen.freezeHash, vectors: CORPUS.map(row => ({ id: row.id })) };
  files.set('output/model.json', bytes(model)); files.set('output/policy.json', bytes(policy));
  files.set('output/vectors.json', bytes(packet));
  const encoding = { freezeHash: frozen.freezeHash, vectorPacketSha256: hash(files.get('output/vectors.json')), rows: 384 };
  const fit = { schema: frozen.schema, freezeHash: frozen.freezeHash, selection: 'development-only',
    finalTestOpened: false, productionReady: false, modelSha256: hash(files.get('output/model.json')),
    policySha256: hash(files.get('output/policy.json')), representation: model.representation, lambda: model.lambda, encoding };
  files.set('output/fit.json', bytes(fit)); files.set('output/encoding.json', bytes(encoding));
  const gold = CORPUS.filter(row => row.split === 'test');
  const nodes = new Map(TAXONOMY.nodes.map(node => [node.id, node]));
  const ancestry = id => {
    const result = [];
    for (let node = nodes.get(id); node; node = nodes.get(node.parentId)) result.unshift(node.id);
    return result;
  };
  const selected = new Map([[gold[0].id, 'video-games'], [gold[1].id, 'games'],
    [gold.find(row => row.expectedTopicId === 'video-games').id, 'video-games'],
    [gold.find(row => row.expectedTopicId === 'gta').id, 'gta'],
    [gold.find(row => row.expectedTopicId === 'koalas').id, 'animals']]);
  const outcomes = gold.map(row => {
    const path = ancestry(row.expectedTopicId), primaryNodeId = selected.get(row.id) ?? null;
    return { id: row.id, groupId: row.groupId, language: row.language, expectedTopicId: row.expectedTopicId,
      primaryNodeId, safeAccepted: primaryNodeId !== null && path.includes(primaryNodeId),
      exactOutcome: primaryNodeId === row.expectedTopicId, goldDepth: path.length, goldBranch: path[0] ?? 'outside' };
  });
  const testResult = { split: 'test', modelArtifactHash: digest(model), policyHash: policy.policyHash,
    rowCount: 96, independentGroups: 96, accepted: 5, safeAccepted: 4, acceptedPrecision: 4 / 5,
    coverage: 5 / 96, leafAccepted: 1, leafCorrect: 1, leafPrecision: 1,
    wrongBroad: 0, observedBroadError: 0, wrongSameBranch: 1, overSpecificSameBranch: 1,
    wrongSiblingOrCousin: 0, broadFallback: 1, correctDeepestOutcome: 9, deepestOutcomeAccuracy: 9 / 96,
    outcomes, gate: { productionValidated: false, representativeWebValidation: false }, timing: { p95Ms: 1 } };
  const report = { schema: frozen.schema, freezeHash: frozen.freezeHash, vectorPacketSha256: encoding.vectorPacketSha256,
    selectedModelSha256: fit.modelSha256, selectedPolicySha256: fit.policySha256,
    selection: { representation: model.representation, lambda: model.lambda, basedOn: 'development-only',
      calibrationSplit: 'separate-calibration', testRetuning: false }, fit, test: testResult,
    corpus: { rows: 384, realWebQualityClaim: false }, productionReady: false, ownerDataRead: false,
    providerCalls: 0, canonicalWrites: 0, crawlerActions: 0 };
  files.set('measured-results.json', bytes(report));
  const receipt = { schema: 'hierarchical-e5-linear-execution-receipt/v1', freezeHash: frozen.freezeHash,
    reportSha256: hash(files.get('measured-results.json')), modelSha256: fit.modelSha256,
    policySha256: fit.policySha256, vectorPacketSha256: encoding.vectorPacketSha256, productionReady: false };
  files.set('execution-receipt.json', bytes(receipt));
  return files;
}

function reader(files, seen = []) {
  return async name => {
    seen.push(name); assert.ok(files.has(name), `Unexpected read: ${name}`);
    return files.get(name);
  };
}
async function verify(files, includeLocal = false) {
  return verifyStoredLinearHierarchyExperiment({ includeLocal, readInput: reader(files) });
}
function replaceReport(files, mutate) {
  const report = parse(files.get('measured-results.json'));
  mutate(report); files.set('measured-results.json', bytes(report));
  const receipt = parse(files.get('execution-receipt.json'));
  receipt.reportSha256 = hash(files.get('measured-results.json'));
  files.set('execution-receipt.json', bytes(receipt));
}

test('public verification checks exactly13public source hashes and exposes all non-root precision', async () => {
  assert.equal(PUBLIC_SOURCES.length, 13); assert.equal(LOCAL_SOURCES.length, 2);
  const files = fixture(), seen = [];
  const result = await verifyStoredLinearHierarchyExperiment({ readInput: reader(files, seen) });
  assert.equal(result.status, 'verified'); assert.equal(result.sourceHashesChecked, 13);
  assert.equal(result.totalSourceHashes, 15); assert.equal(result.localEvidenceVerified, false);
  assert.ok(!seen.some(name => LOCAL_SOURCES.includes(name) || name.startsWith('output/')));
  assert.equal(result.outcomeCounts.nonRootAccepted, 4);
  assert.equal(result.outcomeCounts.nonRootSafeAccepted, 3);
  assert.equal(result.outcomeCounts.nonRootAcceptedPrecision, 0.75);
  assert.equal(result.outcomeCounts.leafAccepted, 1); assert.equal(result.outcomeCounts.leafCorrect, 1);
  assert.equal(result.outcomeCounts.internalNonRootAccepted, 3);
  assert.equal(result.outcomeCounts.internalNonRootErrors, 1);
  assert.equal(result.outcomeCounts.internalNodeSpecificityErrors, 1);
  assert.equal(result.productionReady, false);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.outcomeCounts));
});

test('local verification additionally links2local hashes, fit, encoding, model, policy and ordered packet IDs', async () => {
  const files = fixture(), seen = [];
  const result = await verifyStoredLinearHierarchyExperiment({ includeLocal: true, readInput: reader(files, seen) });
  assert.equal(result.sourceHashesChecked, 15); assert.equal(result.localEvidenceVerified, true);
  for (const name of [...LOCAL_SOURCES, 'output/fit.json', 'output/model.json', 'output/policy.json',
    'output/vectors.json', 'output/encoding.json']) assert.ok(seen.includes(name));
});

test('source and report byte tampering, freeze edits and missing receipt fail closed', async () => {
  for (const name of [...PUBLIC_SOURCES, ...LOCAL_SOURCES, 'measured-results.json']) {
    const files = fixture(); files.set(name, Buffer.concat([files.get(name), Buffer.from(' ')]));
    await assert.rejects(verify(files, true), /changed|Expected/u);
  }
  const changed = fixture(), frozen = parse(changed.get('freeze.json'));
  frozen.rows++; changed.set('freeze.json', bytes(frozen));
  await assert.rejects(verify(changed), /Freeze descriptor changed/u);
  const missing = fixture(); missing.delete('execution-receipt.json');
  await assert.rejects(verify(missing), /Unexpected read/u);
});

test('local evidence is checked by exact byte hashes and anchored fit/encoding JSON linkage', async () => {
  for (const name of ['output/model.json', 'output/policy.json', 'output/vectors.json']) {
    const files = fixture(); files.set(name, Buffer.concat([files.get(name), Buffer.from(' ')]));
    await assert.rejects(verify(files, true), /changed/u);
  }
  for (const name of ['output/fit.json', 'output/encoding.json']) {
    const files = fixture(), value = parse(files.get(name)); value.freezeHash = 'f'.repeat(64);
    files.set(name, bytes(value)); await assert.rejects(verify(files, true));
  }
});

test('anchored report metadata, gold identity, safety and internal specificity counts cannot silently drift', async () => {
  for (const mutation of [
    report => { report.selectedModelSha256 = 'f'.repeat(64); },
    report => { report.fit.policySha256 = 'f'.repeat(64); },
    report => { report.test.modelArtifactHash = 'f'.repeat(64); },
    report => { report.selection.testRetuning = true; },
    report => { report.test.gate.productionValidated = true; },
    report => { report.test.outcomes[0].safeAccepted = true; },
    report => { report.test.outcomes[0].expectedTopicId = 'video-games'; },
    report => { report.test.outcomes[1].id = report.test.outcomes[0].id; },
    report => { report.test.overSpecificSameBranch = 0; },
    report => { report.test.acceptedPrecision = 1; },
    report => { report.canonicalWrites = 1; },
  ]) {
    const files = fixture(); replaceReport(files, mutation);
    await assert.rejects(verify(files));
  }
});

test('reader injection remains fixed-path, bounded, byte-only and explicit-mode', async () => {
  for (const invalid of [Buffer.alloc(0), Buffer.alloc(8 * 1024 * 1024 + 1), '{}']) {
    await assert.rejects(verifyStoredLinearHierarchyExperiment({ readInput: async () => invalid }));
  }
  await assert.rejects(verifyStoredLinearHierarchyExperiment({ includeLocal: 'yes', readInput: reader(fixture()) }));
  await assert.rejects(verifyStoredLinearHierarchyExperiment({ readInput: null }));
});
