// Read-only stored-evidence verification. No encoder, classifier, database or provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';

const here = new URL('./', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const publicSources = Object.freeze(['run.js', 'protocol.json', 'supervise.py', 'corpus.js', 'taxonomy.js',
  '../../../src/domain/hierarchical-e5-matcher.js', '../../../src/domain/hierarchical-e5-evaluation.js',
  '../../../src/domain/ridge-topic-adapter.js', '../../../src/crawler/packaged-e5.js',
  '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js']);
const localSources = Object.freeze(['../../../data/ridge1-topic-adapter-v1.json',
  '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json']);
const allowed = new Set([...publicSources, ...localSources, 'freeze.json', 'execution-receipt.json',
  'measured-results.json', 'output/vectors.json', 'output/selected-candidate.json']);

async function readBounded(name) {
  assert.ok(allowed.has(name), 'Input is not on the fixed experiment allowlist');
  const file = new URL(name, here), stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 8 * 1024 * 1024,
    'Invalid stored experiment file');
  const bytes = await readFile(file);assert.equal(bytes.length, stat.size);return bytes;
}

/** The injected reader is for tests; it receives only fixed allowlisted names. */
export async function verifyStoredHierarchyExperiment({ includeLocal = false, readInput = readBounded } = {}) {
  assert.equal(typeof includeLocal, 'boolean');assert.equal(typeof readInput, 'function');
  const read = async name => {
    assert.ok(allowed.has(name));
    const bytes = await readInput(name);
    assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8 * 1024 * 1024);
    return bytes;
  };
  const frozen = JSON.parse(await read('freeze.json'));
  const { freezeHash, ...descriptor } = frozen;
  assert.equal(jsonHash(descriptor), freezeHash, 'Freeze descriptor changed');
  assert.deepEqual(Object.keys(frozen.sourceHashes).sort(), [...publicSources, ...localSources].sort());
  const checkedSources = includeLocal ? [...publicSources, ...localSources] : publicSources;
  for (const name of checkedSources) assert.equal(hash(await read(name)), frozen.sourceHashes[name], 'Frozen source changed');
  assert.deepEqual(JSON.parse(await read('protocol.json')), frozen.protocol);
  assert.equal(jsonHash(CORPUS), frozen.corpusSha256);assert.equal(jsonHash(TAXONOMY), frozen.taxonomySha256);
  assert.equal(CORPUS.length, frozen.rowCount);

  const receipt = JSON.parse(await read('execution-receipt.json'));
  assert.equal(receipt.schema, 'hierarchical-e5-execution-receipt/v1');
  assert.equal(receipt.freezeHash, freezeHash);assert.equal(receipt.productionReady, false);
  const reportBytes = await read('measured-results.json'), report = JSON.parse(reportBytes);
  assert.equal(hash(reportBytes), receipt.reportSha256, 'Stored report changed');
  assert.equal(report.schema, frozen.schema);assert.equal(report.freezeHash, freezeHash);
  assert.equal(report.vectorPacketSha256, receipt.vectorPacketSha256);
  assert.equal(receipt.encodingLoopElapsedMs, report.encoding.elapsedMs, 'Stored encoding timing changed');
  assert.equal(report.selection.artifactSha256, receipt.selectedArtifactSha256);
  assert.equal(report.selection.basedOn, 'development-only');assert.equal(report.selection.postTestRetuning, false);
  assert.equal(report.productionReady, false);assert.equal(report.corpus.realWebQualityClaim, false);
  assert.equal(report.ownerDataRead, false);
  for (const key of ['providerCalls', 'canonicalWrites', 'crawlerActions']) assert.equal(report[key], 0);
  const test = report.lockedTest;
  assert.equal(test.split, 'test');assert.equal(test.artifactSha256, report.selection.artifactSha256);
  assert.equal(test.representation, report.selection.representation);assert.equal(test.gate.productionValidated, false);
  assert.equal(test.rowCount, frozen.protocol.expectedSplits.test);assert.equal(test.outcomes.length, test.rowCount);
  assert.equal(test.accepted, test.outcomes.filter(row => row.primaryNodeId !== null).length);
  assert.equal(test.safeAccepted, test.outcomes.filter(row => row.safeAccepted).length);
  assert.equal(test.correctDeepestOutcome, test.outcomes.filter(row => row.correctOutcome).length);
  if (includeLocal) {
    const vectors = await read('output/vectors.json'), candidate = await read('output/selected-candidate.json');
    assert.equal(hash(vectors), receipt.vectorPacketSha256);assert.equal(hash(candidate), receipt.selectedArtifactSha256);
    const packet = JSON.parse(vectors);
    assert.equal(packet.freezeHash, freezeHash);assert.equal(packet.vectors.length, frozen.rowCount);
    assert.equal(packet.elapsedMs, receipt.encodingLoopElapsedMs, 'Stored vector timing changed');
    assert.deepEqual(packet.vectors.map(row => row.id), CORPUS.map(row => row.id));
    assert.equal(JSON.parse(candidate).calibrationStatus, 'candidate');
  }
  return Object.freeze({ status: 'verified',
    scope: 'stored-byte-linkage-not-reclassification-or-independent-accuracy',
    freezeHash, sourceHashesChecked: checkedSources.length, totalSourceHashes: 13,
    localEvidenceVerified: includeLocal, productionReady: false,
    failedReleaseChecks: Object.freeze(['enoughIndependentLeafDecisions', 'observedLeafPrecisionPass',
      'intervalLowerBoundPass', 'observedBroadErrorPass'].filter(key => test.gate[key] !== true)),
    selectedRepresentation: test.representation, testRows: test.rowCount,
    accepted: test.accepted, safeAccepted: test.safeAccepted, leafPrecision: test.leafPrecision,
    classifierP95Ms: test.timing.p95Ms });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args.length) process.stdout.write('No action. Use --verify or --verify-local; neither reruns the experiment.\n');
  else if (args.length !== 1 || !['--verify', '--verify-local'].includes(args[0])) {
    process.stderr.write('Invalid verification operation.\n');process.exitCode = 1;
  } else {
    try { process.stdout.write(JSON.stringify(await verifyStoredHierarchyExperiment({ includeLocal: args[0] === '--verify-local' })) + '\n'); }
    catch { process.stderr.write('Stored hierarchy evidence verification failed; no experiment was rerun.\n');process.exitCode = 1; }
  }
}
