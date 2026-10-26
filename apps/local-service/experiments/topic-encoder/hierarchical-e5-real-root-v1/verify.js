// POST-RUN stored bytes and decision arithmetic only. No model/runner imports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assessRootOnlyPredictions } from './assessment.js';
import { parseVectorPacket } from '../hierarchical-e5-broad-heads-v1/vector-packet.js';

const HERE = new URL('./', import.meta.url), MAX = 8 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/u, sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(JSON.stringify(value));
const C = '../hierarchical-e5-broad-heads-v1/', D = '../hierarchical-e5-observed-cuts-v1/';
const CONTRACT = '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
const ASSETS = '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const SELECTION = '../../../data/hierarchy-real-root-selection-adr136.json';
const CAPTURES = { traincal: '../../../data/hierarchy-real-root-capture-adr136.traincal.json', test: '../../../data/hierarchy-real-root-capture-adr136.test.json' };
const VIEWS = ['current-static', 'wikipedia-prose-lead'];
const CAPTURE_SOURCES = ['../hierarchical-public-capture-v1/capture.js', '../../../data/hierarchy-real-root-capture-adr136.mjs',
  '../../../data/hierarchy-real-root-capture-adr136-supervise.py', '../../../src/crawler/public-fetch.js',
  '../../../src/crawler/robots.js', '../../../src/crawler/static-capture.js'];
const EXTERNAL = [...CAPTURE_SOURCES, '../../../src/domain/hierarchical-e5-paired-linear-heads.js',
  '../../../src/domain/hierarchical-e5-paired-head-policy.js', '../../../src/domain/hierarchical-e5-observed-head-policy.js',
  '../../../src/domain/hierarchical-e5-paired-input.js', '../../../src/domain/hierarchical-e5-root-detail-consensus.js',
  '../../../src/crawler/packaged-e5.js', C + 'vector-packet.js', '../hierarchical-e5-paired-v1/taxonomy.js', CONTRACT, ASSETS,
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
const LOCAL = ['assessment.js', 'assessment.test.js', 'manifest.js', 'manifest.test.js', 'protocol.json', 'run.js', 'supervise.py', 'verify.js', 'verify.test.js'];
const OBSERVED = ['assessment.js', 'assessment.test.js', 'corpus-calibration.js', 'corpus-test.js', 'corpus.js', 'corpus.test.js',
  'protocol.json', 'run.js', 'run.test.js', 'supervise.py', 'freeze.json', 'output/calibration.json', 'output/policy.json', 'measured-results.json'];
const BROAD = ['assessment.js', 'vector-packet.js', 'taxonomy.js', 'freeze.json', 'output/model.json',
  'output/policy.json', 'output/input-definition.json', 'output/fit.json'];
const GOLD = ['../../../data/hierarchy-real-root-training-gold-adr136.json', '../../../data/hierarchy-real-root-calibration-gold-adr136.json',
  '../../../data/hierarchy-curated-web-gold-adr134.json', '../../../data/hierarchy-real-root-test-supplement-adr136.json'];
const EVIDENCE = ['freeze.json', 'output/selection.json', 'output/root-model.json', 'output/root-policy.json', 'measured-results.json', SELECTION,
  ...Object.values(CAPTURES), ...['traincal', 'test'].flatMap(phase => [`output/encoding-${phase}.json`,
    ...VIEWS.map(view => `output/${phase}.${view}.vectors.json`)])];
export const ROOT_EVIDENCE_FILES = Object.freeze([...new Set([...LOCAL, ...EXTERNAL,
  ...OBSERVED.map(name => D + name), ...BROAD.map(name => C + name), ...GOLD, ...EVIDENCE])]);
const allowed = new Set(ROOT_EVIDENCE_FILES.map(name => new URL(name, HERE).href));
function checkedName(name) {
  assert.ok(typeof name === 'string' && name.length <= 256 && !name.includes('\\') && !name.includes('\0')
    && !name.includes(':') && !name.startsWith('/'), 'Invalid fixed evidence path');
  const url = new URL(name, HERE);
  assert.ok(allowed.has(url.href), 'Non-allowlisted evidence path');
  return url;
}
async function localBytes(name, maximum) {
  const url = checkedName(name), stat = await lstat(url);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maximum, 'Bounded regular evidence file required');
  const actual = await realpath(url), lexical = fileURLToPath(url);
  assert.equal(process.platform === 'win32' ? actual.toLowerCase() : actual,
    process.platform === 'win32' ? lexical.toLowerCase() : lexical, 'Symlinked evidence path refused');
  const bytes = await readFile(url); assert.equal(bytes.length, stat.size); return bytes;
}
const assessorCases = rows => rows.map(({ id, entityGroup, language, expectedRootId, specificityPath }) =>
  ({ id, entityGroup, language, expectedRootId, specificityPath }));
function sourceKey(name) {
  if (name.startsWith('../../../data/')) return 'data/' + name.slice('../../../data/'.length);
  if (name.startsWith('../../../src/')) return 'src/' + name.slice('../../../src/'.length);
  return 'experiments/topic-encoder/hierarchical-public-capture-v1/' + name.slice('../hierarchical-public-capture-v1/'.length);
}
function constructionHash(f, inputView) {
  return digest({ schema: 'hierarchy-real-root-selected-input-construction/v1', inputView,
    inputConstruction: f.protocol.inputConstruction, representationHash: f.representationHash,
    inputDefinitionSha256: f.manifestIdentity.detailArtifacts.inputDefinitionSha256, modelSha256: f.modelSha256,
    embeddingContractSha256: f.sourceHashes[CONTRACT], assetManifestSha256: f.sourceHashes[ASSETS],
    pairedAdapterSha256: f.sourceHashes['../../../src/domain/hierarchical-e5-paired-input.js'], protocolSha256: f.protocolSha256,
    captureConstructorSourceHashes: Object.fromEntries(CAPTURE_SOURCES.map(name => [name, f.sourceHashes[name]])) });
}

/** Injected reader receives only fixed allowlisted relative names and byte caps.
 * It is a fixture seam, not a CLI path/configuration option. */
export async function verifyStoredRootEvidence({ readBytes = localBytes } = {}) {
  assert.equal(typeof readBytes, 'function');
  const cache = new Map(); let cumulativeBytes = 0, sourceHashChecks = 0;
  async function bytes(name, maximum = MAX) {
    const url = checkedName(name), cap = Math.min(maximum, MAX);
    if (!cache.has(url.href)) {
      let value;
      try { value = await readBytes(name, cap); }
      catch { throw new Error(`Stored evidence unavailable: ${name}`); }
      assert.ok(Buffer.isBuffer(value) && value.length > 0 && value.length <= cap, 'Evidence byte capacity');
      cumulativeBytes += value.length;
      assert.ok(cache.size < 160 && cumulativeBytes <= 256 * 1024 * 1024, 'Cumulative evidence capacity');
      cache.set(url.href, Buffer.from(value));
    }
    const result = cache.get(url.href); assert.ok(result.length <= cap, 'Evidence byte capacity'); return result;
  }
  const json = async (name, maximum) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(name, maximum)));
  async function checkHashes(map) {
    assert.ok(map && typeof map === 'object' && !Array.isArray(map));
    const entries = Object.entries(map); assert.ok(entries.length > 0 && entries.length <= 128, 'Source hash count');
    for (const [name, expected] of entries) { assert.match(expected, HEX); assert.equal(sha(await bytes(name)), expected, `Stored source mismatch: ${name}`); sourceHashChecks++; }
  }
  const f = await json('freeze.json'), { freezeHash, ...body } = f;
  assert.match(freezeHash, HEX); assert.equal(digest(body), freezeHash, 'Freeze digest mismatch');
  assert.equal(f.schema, 'hierarchical-e5-real-root-experiment/v1');
  assert.deepEqual(f.protocol.expectedSplits, { training: 48, calibration: 48, test: 32 });
  assert.deepEqual(f.protocol.inputViews, VIEWS); assert.equal(f.protocol.detailPolicyMode, 'observed');
  for (const required of ['run.js', 'supervise.py', 'manifest.js', 'assessment.js', 'verify.js', 'protocol.json', C + 'vector-packet.js', ...EXTERNAL])
    assert.ok(Object.hasOwn(f.sourceHashes, required), 'Required source hash absent');
  await checkHashes(f.sourceHashes);
  assert.deepEqual(await json('protocol.json'), f.protocol); assert.equal(f.protocolSha256, f.sourceHashes['protocol.json']);
  const m = f.manifestIdentity; assert.equal(digest(m), f.manifestHash, 'Manifest digest mismatch');
  await checkHashes(m.sourceHashes); await checkHashes(m.goldSourceHashes);
  for (const name of GOLD) assert.equal(m.goldSourceHashes[name], m.sourceHashes[name], 'Gold linkage mismatch');
  assert.equal(m.cases.length, 128); assert.equal(m.rootNodes.length, 16); assert.equal(m.taxonomyNodes.length, 63);
  assert.deepEqual(m.rootNodes, m.taxonomyNodes.filter(node => node.parentId === null));
  for (const [split, count] of Object.entries(f.protocol.expectedSplits)) {
    const rows = m.cases.filter(row => row.split === split); assert.equal(rows.length, count);
    for (const root of m.rootNodes) assert.equal(rows.filter(row => row.expectedRootId === root.id).length, split === 'test' ? 2 : 3);
  }
  const cases = m.cases.filter(row => row.split === 'test');
  assert.equal(m.cases.filter(row => row.specificityPath !== null).length, 4);
  assert.equal(cases.filter(row => row.specificityPath !== null).length, 4);
  assessRootOnlyPredictions({ nodes: m.taxonomyNodes, cases: assessorCases(m.cases),
    predictions: m.cases.map(row => ({ id: row.id, sourceInputHash: '0'.repeat(64), selectedPath: [] })) });
  const detailNames = { modelSha256: C + 'output/model.json', policySha256: D + 'output/policy.json',
    baselinePolicySha256: C + 'output/policy.json', inputDefinitionSha256: C + 'output/input-definition.json' };
  for (const [key, name] of Object.entries(detailNames)) {
    assert.equal(sha(await bytes(name)), m.detailArtifacts[key]); assert.equal(m.sourceHashes[name], m.detailArtifacts[key]);
  }
  const d = await json(D + 'freeze.json'), { freezeHash: dHash, ...dBody } = d;
  assert.equal(digest(dBody), dHash); assert.equal(dHash, m.detailArtifacts.observedFreezeHash);
  for (const [name, expected] of Object.entries(d.sourceHashes)) {
    assert.equal(m.sourceHashes[D + name], expected, 'Observed implementation source linkage mismatch');
    assert.equal(sha(await bytes(D + name)), expected);
  }
  const cFreeze = await json(C + 'freeze.json'), { freezeHash: cHash, ...cBody } = cFreeze;
  assert.equal(digest(cBody), cHash); assert.equal(d.protocol.baseline.freezeHash, cHash);
  assert.equal(d.protocol.baseline.modelSha256, m.detailArtifacts.modelSha256);
  const cFit = await json(C + 'output/fit.json');
  assert.equal(cFit.freezeHash, cHash); assert.equal(cFit.modelSha256, m.detailArtifacts.modelSha256);
  assert.equal(cFit.inputDefinitionSha256, m.detailArtifacts.inputDefinitionSha256);
  assert.equal(cFit.selection, 'development-only'); assert.equal(cFit.finalTestEvaluated, false);
  const dCal = await json(D + 'output/calibration.json'), dTest = await json(D + 'measured-results.json');
  for (const record of [dCal, dTest]) { assert.equal(record.freezeHash, dHash); assert.equal(record.observedPolicySha256, m.detailArtifacts.policySha256); }
  assert.equal(dCal.finalTestEvaluated, false);
  assert.equal(f.encoderHash, digest({ modelSha256: f.modelSha256, embeddingContractSha256: f.sourceHashes[CONTRACT], assetManifestSha256: f.sourceHashes[ASSETS] }));
  const local = await json('output/selection.json'), receiptBytes = await bytes(SELECTION, 65536), receipt = JSON.parse(receiptBytes);
  assert.equal(local.status, 'selected'); assert.equal(local.freezeHash, freezeHash); assert.equal(local.finalTestEvaluated, false);
  assert.equal(local.calibrationIsSelectionData, true); assert.equal(local.notIndependentQualityEvidence, true);
  assert.equal(sha(receiptBytes), local.receiptSha256); assert.deepEqual(receipt, local.receipt);
  assert.equal(receipt.schema, 'hierarchy-real-root-selection/v1'); assert.equal(receipt.phase, 'selected-before-test');
  assert.equal(receipt.finalTestEvaluated, false); assert.equal(receipt.freezeHash, freezeHash); assert.equal(receipt.protocolSha256, f.protocolSha256);
  assert.ok(VIEWS.includes(receipt.inputView)); assert.equal(receipt.inputConstructionHash, constructionHash(f, receipt.inputView));
  assert.equal(receipt.detailPolicyMode, 'observed'); assert.equal(receipt.detailModelSha256, m.detailArtifacts.modelSha256);
  assert.equal(receipt.detailPolicySha256, m.detailArtifacts.policySha256);
  assert.equal(sha(await bytes('output/root-model.json')), receipt.selectedModelSha256);
  assert.equal(sha(await bytes('output/root-policy.json')), receipt.selectedPolicySha256);
  const rootModel = await json('output/root-model.json'), rootPolicy = await json('output/root-policy.json');
  assert.equal(rootModel.trainingVersion, freezeHash + '|' + receipt.inputView); assert.equal(rootModel.lambda, .1);
  assert.equal(rootModel.representationHash, f.representationHash); assert.equal(rootModel.representation, f.representation);
  const nodeOrder = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  assert.deepEqual([...rootModel.nodes].sort(nodeOrder), [...m.rootNodes].sort(nodeOrder));
  const { policyHash, ...policyBody } = rootPolicy; assert.equal(digest(policyBody), policyHash);
  const candidate = local.candidates.find(row => row.inputView === receipt.inputView && row.status === 'eligible');
  assert.ok(candidate); assert.equal(candidate.rootModelArtifactHash, digest(rootModel)); assert.equal(candidate.rootPolicyHash, policyHash);
  assert.equal(sha(await bytes('output/encoding-traincal.json')), local.traincalEncodingSha256);

  async function encoded(phase) {
    const rows = m.cases.filter(row => phase === 'traincal' ? row.split !== 'test' : row.split === 'test');
    const captureBytes = await bytes(CAPTURES[phase], 4 * 1024 * 1024), capture = JSON.parse(captureBytes), c = capture.capture;
    assert.equal(capture.schema, 'hierarchy-real-root-public-capture-result/v1'); assert.equal(capture.phase, phase); assert.equal(c.phase, phase);
    for (const key of ['rawHtmlPersisted', 'modelExecuted', 'currentOwnerDataRead', 'canonicalWrites']) assert.equal(capture[key], false);
    assert.equal(capture.publicLicensedTextOnly, true); assert.equal(capture.noAutomaticRetry, true);
    for (const name of CAPTURE_SOURCES) assert.equal(capture.sourceHashes[sourceKey(name)], f.sourceHashes[name]);
    assert.deepEqual(capture.cases, rows.map(row => ({ id: row.id, entityGroup: row.entityGroup, url: row.publicUrl,
      expectedRootId: row.expectedRootId, split: row.split, labelScope: 'root-only' })));
    assert.deepEqual(Object.values(capture.goldHashes).sort(), Object.values(m.goldSourceHashes).sort());
    assert.equal(c.manifestHash, digest({ namespace: 'hierarchy-real-root-public-capture/v1', phase, cases: rows.map(row => ({ id: row.id, url: row.publicUrl })) }));
    assert.equal(capture.labelUidPathMapHash, digest(capture.cases.map(row => ({ id: row.id, split: row.split, supportedPath: [row.expectedRootId] }))));
    assert.equal(c.expectedCases, rows.length); assert.ok(Array.isArray(c.outcomes) && c.outcomes.length <= rows.length);
    assert.equal(c.completedCases, c.outcomes.length); assert.ok(['complete', 'partial-failure'].includes(c.status));
    assert.equal(c.status === 'complete', c.outcomes.length === rows.length);
    if (phase === 'test') {
      const { receiptSha256, ...selection } = capture.selection; assert.equal(receiptSha256, local.receiptSha256); assert.deepEqual(selection, receipt);
    } else assert.equal(capture.selection, null);
    const available = rows.map((row, index) => {
      const outcome = c.outcomes[index];
      if (outcome) {
        assert.equal(outcome.id, row.id); assert.equal(outcome.url, row.publicUrl); assert.match(outcome.htmlSha256, HEX);
        assert.ok(typeof outcome.title === 'string' && outcome.title.length <= 200);
        for (const part of [outcome.current, outcome.leadCandidate]) {
          assert.ok(typeof part.text === 'string' && part.text.length <= 4096); assert.equal(part.characters, part.text.length);
          assert.equal(part.sha256, part.text ? sha(part.text) : null);
        }
        assert.ok(['available', 'unavailable'].includes(outcome.leadCandidate.status));
        assert.equal(outcome.leadCandidate.status === 'available', outcome.leadCandidate.text.length > 0);
        assert.equal(outcome.sourceInputHash, digest({ id: outcome.id, url: outcome.url, htmlSha256: outcome.htmlSha256, title: outcome.title,
          currentSha256: outcome.current.sha256, leadSha256: outcome.leadCandidate.sha256 }));
      }
      const title = !!outcome?.title.trim();
      return { id: row.id, sourceInputHash: outcome?.sourceInputHash ?? digest({ schema: 'real-root-missing-capture-witness/v1', id: row.id, captureSha256: sha(captureBytes) }),
        sourceInputHashScope: outcome ? 'captured-public-input' : 'missing-capture-marker-not-model-input', titleProvenance: outcome?.titleProvenance ?? 'missing-capture',
        'current-static': title && !!outcome?.current.text.trim(),
        'wikipedia-prose-lead': title && outcome?.leadCandidate.status === 'available' && !!outcome?.leadCandidate.text.trim() };
    });
    if (c.status === 'complete') for (const key of ['failedCaseId', 'failedStage', 'failureCode']) assert.equal(c[key], null);
    else { assert.equal(c.failedCaseId, rows[c.outcomes.length].id); assert.match(c.failureCode, /^[a-z0-9-]{1,120}$/u); }
    const name = `output/encoding-${phase}.json`, recordBytes = await bytes(name), record = JSON.parse(recordBytes);
    assert.equal(record.schema, f.schema); assert.equal(record.productionReady, false);
    assert.equal(record.source, 'already-captured-public-text-only-no-network');
    assert.equal(record.freezeHash, freezeHash); assert.equal(record.phase, phase); assert.equal(record.captureSha256, sha(captureBytes));
    assert.equal(record.captureStatus, c.status); assert.equal(record.selectedReceiptSha256, phase === 'test' ? local.receiptSha256 : null);
    assert.deepEqual(record.cases, available); assert.equal(record.packets.length, 2);
    for (const [index, view] of VIEWS.entries()) {
      const spec = record.packets[index], ids = available.filter(row => row[view]).map(row => row.id);
      assert.equal(spec.inputView, view); assert.equal(spec.rows, ids.length);
      if (!ids.length) { assert.equal(spec.vectorPacketSha256, null); continue; }
      const raw = await bytes(`output/${phase}.${view}.vectors.json`); assert.equal(sha(raw), spec.vectorPacketSha256);
      const packet = parseVectorPacket(raw); assert.equal(packet.freezeHash, freezeHash); assert.equal(packet.encoderHash, f.encoderHash);
      assert.deepEqual(packet.vectors.map(row => row.id), ids);
    }
    assert.equal(record.encoderCalls, available.reduce((sum, row) => sum + (VIEWS.some(view => row[view]) ? 1 : 0) + VIEWS.filter(view => row[view]).length, 0));
    return { record, available, receiptSha256: sha(recordBytes) };
  }
  const traincal = await encoded('traincal'); assert.equal(traincal.receiptSha256, local.traincalEncodingSha256);
  const test = await encoded('test'), report = await json('measured-results.json');
  assert.equal(report.freezeHash, freezeHash); assert.equal(report.schema, f.schema);
  assert.deepEqual(report.selectionReceipt, receipt); assert.equal(report.selectionReceiptSha256, local.receiptSha256);
  assert.equal(report.testCaptureSha256, test.record.captureSha256); assert.equal(report.testEncodingSha256, test.receiptSha256);
  assert.equal(report.outcomes.length, cases.length);
  for (const [index, outcome] of report.outcomes.entries()) {
    const flag = test.available[index]; assert.equal(outcome.id, cases[index].id); assert.equal(outcome.sourceInputHash, flag.sourceInputHash);
    assert.equal(outcome.sourceInputHashScope, flag.sourceInputHashScope); assert.equal(outcome.titleProvenance, flag.titleProvenance);
    assert.equal(outcome.inputView, receipt.inputView); assert.equal(outcome.selectedViewAvailable, flag[receipt.inputView]);
    assert.ok(Array.isArray(outcome.rootPath) && outcome.rootPath.length <= 1, 'Root-only result cannot select a descendant');
    if (!outcome.rootPath.length) assert.deepEqual(outcome.consensusPath, []);
    else if (outcome.consensusPath.length) assert.equal(outcome.consensusPath[0], outcome.rootPath[0], 'Consensus cannot change root assignment');
    if (!outcome.selectedViewAvailable) for (const key of ['rootPath', 'consensusPath', 'fixedBaselinePath']) assert.deepEqual(outcome[key], []);
  }
  const metrics = {};
  for (const [key, pathKey] of [['rootOnly', 'rootPath'], ['consensus', 'consensusPath'], ['fixedBaseline', 'fixedBaselinePath']]) {
    const predictions = report.outcomes.map(outcome => ({ id: outcome.id, sourceInputHash: outcome.sourceInputHash, selectedPath: outcome[pathKey] }));
    const actual = assessRootOnlyPredictions({ nodes: m.taxonomyNodes, cases: assessorCases(cases), predictions });
    assert.deepEqual(report[key], actual, `Stored ${key} assessment mismatch`);
    metrics[key] = { assigned: actual.assigned, correctRoot: actual.correctRoot, wrongRoot: actual.wrongRoot, unresolved: actual.unresolved,
      coverage: actual.coverage, precision: actual.precision, specificity: actual.specificity };
  }
  assert.equal(report.calibrationUsedForSelection, true); assert.equal(report.testSelectionOrRetuning, false);
  assert.equal(report.rootOnlySupervision, true); assert.equal(report.unannotatedChildNegativesCreated, false);
  for (const key of ['representativePopulationClaim', 'productionReady', 'assignmentAuthority', 'ownerDataRead']) assert.equal(report[key], false);
  for (const key of ['canonicalWrites', 'providerCalls', 'pageFetches', 'crawlerActions']) assert.equal(report[key], 0);
  return Object.freeze({ status: 'verified-stored-evidence', scope: 'Byte linkage and saved-decision arithmetic only; not classification replay, factual validation or independent quality proof.',
    freezeHash, sourceHashChecks, filesRead: cache.size, bytesRead: cumulativeBytes, assessmentsRecomputed: 3, testRows: cases.length,
    metrics, inferenceExecuted: false, productionValidated: false, assignmentAuthority: false });
}

export async function runVerifyCli(args, { verify = verifyStoredRootEvidence, write = text => process.stdout.write(text) } = {}) {
  if (!args.length) { write('No action. Explicit --verify-local checks existing stored evidence only.\n'); return 'inert'; }
  assert.deepEqual(args, ['--verify-local'], 'Only --verify-local is supported');
  const result = await verify(); write(JSON.stringify(result) + '\n'); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runVerifyCli(process.argv.slice(2)); }
  catch { process.stderr.write('Verification refused: required stored evidence is missing, changed or invalid. No phase was run.\n'); process.exitCode = 1; }
}
