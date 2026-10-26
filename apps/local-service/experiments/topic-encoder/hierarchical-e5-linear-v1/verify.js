// Post-run stored-evidence verification only. Never encode, train, classify,
// connect to a database, invoke a provider, repair evidence or create a receipt.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';

const here = new URL('./', import.meta.url);
const maximumBytes = 8 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const sha = value => assert.match(value, /^[a-f0-9]{64}$/u);
export const PUBLIC_SOURCES = Object.freeze(['run.js', 'supervise.py', 'assessment.js', 'vector-packet.js',
  'protocol.json', 'corpus.js', 'taxonomy.js', '../../../src/domain/hierarchical-e5-linear-heads.js',
  '../../../src/domain/hierarchical-e5-head-policy.js', '../../../src/crawler/packaged-e5.js',
  '../../../src/domain/ridge-topic-adapter.js',
  '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js']);
export const LOCAL_SOURCES = Object.freeze(['../../../data/ridge1-topic-adapter-v1.json',
  '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json']);
const allowed = new Set([...PUBLIC_SOURCES, ...LOCAL_SOURCES, 'freeze.json', 'execution-receipt.json',
  'measured-results.json', 'output/fit.json', 'output/model.json', 'output/policy.json',
  'output/vectors.json', 'output/encoding.json']);

async function readBounded(name) {
  assert.ok(allowed.has(name), 'Input is not on the fixed experiment allowlist');
  const file = new URL(name, here), stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maximumBytes,
    'Invalid stored experiment file');
  const bytes = await readFile(file);
  assert.equal(bytes.length, stat.size);
  return bytes;
}

function storedCounts(test) {
  const gold = CORPUS.filter(row => row.split === 'test');
  assert.equal(test.rowCount, gold.length);
  assert.equal(test.independentGroups, gold.length);
  assert.ok(Array.isArray(test.outcomes));
  assert.equal(test.outcomes.length, gold.length);
  const nodes = new Map(TAXONOMY.nodes.map(node => [node.id, node]));
  const parents = new Set(TAXONOMY.nodes.map(node => node.parentId).filter(id => id !== null));
  const path = id => {
    if (id === null) return [];
    assert.ok(nodes.has(id), 'Unknown stored prediction');
    const result = [];
    for (let cursor = nodes.get(id); cursor; cursor = nodes.get(cursor.parentId)) result.unshift(cursor.id);
    return result;
  };
  const counts = { accepted: 0, safeAccepted: 0, leafAccepted: 0, leafCorrect: 0, wrongBroad: 0,
    wrongSameBranch: 0, overSpecificSameBranch: 0, wrongSiblingOrCousin: 0,
    broadFallback: 0, correctDeepestOutcome: 0, nonRootAccepted: 0, nonRootSafeAccepted: 0,
    internalNonRootAccepted: 0, internalNonRootErrors: 0, internalNodeSpecificityErrors: 0 };
  for (let i = 0; i < gold.length; i++) {
    const row = test.outcomes[i], expected = gold[i];
    for (const field of ['id', 'groupId', 'language', 'expectedTopicId']) assert.equal(row[field], expected[field]);
    const goldPath = path(expected.expectedTopicId), predictedPath = path(row.primaryNodeId);
    const assigned = row.primaryNodeId !== null;
    const safe = assigned && goldPath.includes(row.primaryNodeId);
    const exact = row.primaryNodeId === expected.expectedTopicId;
    const nonRoot = assigned && predictedPath.length > 1;
    const internal = assigned && parents.has(row.primaryNodeId);
    assert.equal(row.safeAccepted, safe, 'Stored safety label differs from approved ancestry');
    assert.equal(row.exactOutcome, exact);
    assert.equal(row.goldDepth, goldPath.length);
    assert.equal(row.goldBranch, goldPath[0] ?? 'outside');
    if (exact) counts.correctDeepestOutcome++;
    if (!assigned) continue;
    counts.accepted++;
    if (safe) counts.safeAccepted++;
    if (!internal) { counts.leafAccepted++; if (safe) counts.leafCorrect++; }
    if (nonRoot) { counts.nonRootAccepted++; if (safe) counts.nonRootSafeAccepted++; }
    if (nonRoot && internal) {
      counts.internalNonRootAccepted++;
      if (!safe) counts.internalNonRootErrors++;
    }
    if (!goldPath.length || predictedPath[0] !== goldPath[0]) counts.wrongBroad++;
    else if (!safe) {
      counts.wrongSameBranch++;
      if (predictedPath.includes(expected.expectedTopicId)) {
        counts.overSpecificSameBranch++;
        if (nonRoot && internal) counts.internalNodeSpecificityErrors++;
      } else counts.wrongSiblingOrCousin++;
    }
    if (safe && !exact) counts.broadFallback++;
  }
  for (const key of ['accepted', 'safeAccepted', 'leafAccepted', 'leafCorrect', 'wrongBroad',
    'wrongSameBranch', 'overSpecificSameBranch', 'wrongSiblingOrCousin', 'broadFallback', 'correctDeepestOutcome']) {
    assert.equal(test[key], counts[key], `Stored ${key} count differs`);
  }
  assert.equal(test.acceptedPrecision, counts.accepted ? counts.safeAccepted / counts.accepted : null);
  assert.equal(test.coverage, counts.accepted / gold.length);
  assert.equal(test.leafPrecision, counts.leafAccepted ? counts.leafCorrect / counts.leafAccepted : null);
  assert.equal(test.observedBroadError, counts.wrongBroad / gold.length);
  assert.equal(test.deepestOutcomeAccuracy, counts.correctDeepestOutcome / gold.length);
  return Object.freeze({ ...counts,
    nonRootAcceptedPrecision: counts.nonRootAccepted ? counts.nonRootSafeAccepted / counts.nonRootAccepted : null,
    definition: 'all-assigned-non-root-nodes-including-internal-nodes-counted-from-stored-outcomes' });
}

/** Tests may inject a byte reader, which only receives these fixed file names.
 * This checks stored linkage and recomputes arithmetic on stored node decisions;
 * it is not reclassification, an external signature or independent validation. */
export async function verifyStoredLinearHierarchyExperiment({ includeLocal = false, readInput = readBounded } = {}) {
  assert.equal(typeof includeLocal, 'boolean');
  assert.equal(typeof readInput, 'function');
  const read = async name => {
    assert.ok(allowed.has(name));
    const bytes = await readInput(name);
    assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maximumBytes);
    return bytes;
  };
  const frozen = JSON.parse(await read('freeze.json'));
  const { freezeHash, ...descriptor } = frozen;
  sha(freezeHash);
  assert.equal(digest(descriptor), freezeHash, 'Freeze descriptor changed');
  assert.deepEqual(Object.keys(frozen.sourceHashes).sort(), [...PUBLIC_SOURCES, ...LOCAL_SOURCES].sort());
  for (const value of Object.values(frozen.sourceHashes)) sha(value);
  const checkedSources = includeLocal ? [...PUBLIC_SOURCES, ...LOCAL_SOURCES] : PUBLIC_SOURCES;
  for (const name of checkedSources) assert.equal(hash(await read(name)), frozen.sourceHashes[name], 'Frozen source changed');
  const protocol = JSON.parse(await read('protocol.json'));
  assert.deepEqual(protocol, frozen.protocol);
  assert.equal(frozen.schema, 'hierarchical-e5-linear-experiment/v1');
  assert.equal(frozen.schema, protocol.schema);
  assert.equal(digest(CORPUS), frozen.corpusHash);
  assert.equal(digest(TAXONOMY), frozen.taxonomyHash);
  assert.equal(CORPUS.length, frozen.rows);
  assert.equal(frozen.rows, protocol.maximumRows);
  for (const [split, count] of Object.entries(protocol.expectedSplits)) assert.equal(CORPUS.filter(row => row.split === split).length, count);

  const receipt = JSON.parse(await read('execution-receipt.json'));
  assert.equal(receipt.schema, 'hierarchical-e5-linear-execution-receipt/v1');
  assert.equal(receipt.freezeHash, freezeHash);
  assert.equal(receipt.productionReady, false);
  for (const key of ['reportSha256', 'modelSha256', 'policySha256', 'vectorPacketSha256']) sha(receipt[key]);
  const reportBytes = await read('measured-results.json'), report = JSON.parse(reportBytes);
  assert.equal(hash(reportBytes), receipt.reportSha256, 'Stored report changed');
  assert.equal(report.schema, frozen.schema);
  assert.equal(report.freezeHash, freezeHash);
  assert.equal(report.vectorPacketSha256, receipt.vectorPacketSha256);
  assert.equal(report.selectedModelSha256, receipt.modelSha256);
  assert.equal(report.selectedPolicySha256, receipt.policySha256);
  assert.equal(report.selection.basedOn, 'development-only');
  assert.equal(report.selection.calibrationSplit, 'separate-calibration');
  assert.equal(report.selection.testRetuning, false);
  assert.equal(report.productionReady, false);
  assert.equal(report.ownerDataRead, false);
  assert.equal(report.corpus.rows, frozen.rows);
  assert.equal(report.corpus.realWebQualityClaim, false);
  for (const key of ['providerCalls', 'canonicalWrites', 'crawlerActions']) assert.equal(report[key], 0);
  const fit = report.fit, test = report.test;
  assert.equal(fit.schema, frozen.schema); assert.equal(fit.freezeHash, freezeHash);
  assert.equal(fit.selection, 'development-only'); assert.equal(fit.finalTestOpened, false);
  assert.equal(fit.productionReady, false);
  assert.equal(fit.modelSha256, receipt.modelSha256); assert.equal(fit.policySha256, receipt.policySha256);
  assert.equal(fit.encoding.freezeHash, freezeHash);
  assert.equal(fit.encoding.vectorPacketSha256, receipt.vectorPacketSha256);
  assert.equal(fit.encoding.rows, frozen.rows);
  assert.equal(fit.representation, report.selection.representation); assert.equal(fit.lambda, report.selection.lambda);
  assert.ok(protocol.representations.includes(fit.representation)); assert.ok(protocol.lambdas.includes(fit.lambda));
  assert.equal(test.split, 'test'); assert.equal(test.rowCount, protocol.expectedSplits.test);
  assert.equal(test.gate.productionValidated, false); assert.equal(test.gate.representativeWebValidation, false);
  sha(test.modelArtifactHash); sha(test.policyHash);
  // The frozen runner writes model.json as compact JSON.stringify(model).
  assert.equal(test.modelArtifactHash, receipt.modelSha256);
  const outcomeCounts = storedCounts(test);

  if (includeLocal) {
    const modelBytes = await read('output/model.json'), policyBytes = await read('output/policy.json');
    const vectorBytes = await read('output/vectors.json');
    assert.equal(hash(modelBytes), receipt.modelSha256, 'Stored model changed');
    assert.equal(hash(policyBytes), receipt.policySha256, 'Stored policy changed');
    assert.equal(hash(vectorBytes), receipt.vectorPacketSha256, 'Stored vectors changed');
    assert.equal(digest(JSON.parse(await read('output/fit.json'))), digest(fit), 'Stored fit differs from report');
    assert.deepEqual(JSON.parse(await read('output/encoding.json')), fit.encoding);
    const model = JSON.parse(modelBytes), policy = JSON.parse(policyBytes), packet = JSON.parse(vectorBytes);
    assert.equal(digest(model), test.modelArtifactHash);
    assert.equal(policy.policyHash, test.policyHash);
    const { policyHash, ...body } = policy;
    assert.equal(digest(body), policyHash);
    assert.equal(policy.modelArtifactHash, test.modelArtifactHash);
    assert.equal(model.experimental, true); assert.equal(model.productionValidated, false);
    assert.equal(policy.experimental, true); assert.equal(policy.productionValidated, false);
    assert.equal(model.representation, fit.representation); assert.equal(model.lambda, fit.lambda);
    assert.equal(model.parameterHash, policy.modelParameterHash);
    assert.equal(model.trainingHash, policy.modelTrainingHash);
    assert.equal(model.provenanceHash, policy.modelProvenanceHash);
    assert.equal(model.taxonomyHash, policy.taxonomyHash);
    assert.equal(packet.schema, frozen.schema); assert.equal(packet.freezeHash, freezeHash);
    assert.ok(Array.isArray(packet.vectors)); assert.equal(packet.vectors.length, frozen.rows);
    assert.deepEqual(packet.vectors.map(row => row.id), CORPUS.map(row => row.id));
  }
  return Object.freeze({ status: 'verified', scope: 'stored-linkage-and-outcome-arithmetic-not-reclassification-or-independent-accuracy',
    freezeHash, sourceHashesChecked: checkedSources.length, totalSourceHashes: 15,
    localEvidenceVerified: includeLocal, productionReady: false, testRows: test.rowCount,
    selectedRepresentation: fit.representation, outcomeCounts,
    failedReleaseChecks: Object.freeze(['minimumUsefulCoveragePass', 'minimumSpecificCoveragePass',
      'enoughIndependentLeafDecisions', 'observedLeafPrecisionPass', 'leafIntervalLowerBoundPass',
      'observedBroadErrorPass', 'broadIntervalUpperBoundPass'].filter(key => test.gate[key] !== true)),
    classifierP95Ms: test.timing.p95Ms });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args.length) process.stdout.write('No action. Use --verify or --verify-local; neither reruns the experiment.\n');
  else if (args.length !== 1 || !['--verify', '--verify-local'].includes(args[0])) {
    process.stderr.write('Invalid verification operation.\n'); process.exitCode = 1;
  } else {
    try { process.stdout.write(JSON.stringify(await verifyStoredLinearHierarchyExperiment({ includeLocal: args[0] === '--verify-local' })) + '\n'); }
    catch { process.stderr.write('Stored linear hierarchy evidence verification failed; no experiment was rerun.\n'); process.exitCode = 1; }
  }
}
