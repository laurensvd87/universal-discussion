import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyStoredRootEvidence, runVerifyCli, ROOT_EVIDENCE_FILES } from './verify.js';
import { assessRootOnlyPredictions } from '../hierarchical-e5-real-root-v1/assessment.js';
import { serializeVectorPacket, VECTOR_PACKET_SCHEMA } from '../hierarchical-e5-broad-heads-v1/vector-packet.js';

// Entirely fresh metadata/axis-packet fixtures. No saved corpus or model reads.
const sha = value => createHash('sha256').update(value).digest('hex'), digest = value => sha(JSON.stringify(value));
const C = '../hierarchical-e5-broad-heads-v1/', D = '../hierarchical-e5-observed-cuts-v1/';
const VIEWS = ['current-static', 'wikipedia-prose-lead'];
const SELECTED = '../../../data/hierarchy-real-root-selection-adr137.json';
const CONTRACT = '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
const ASSETS = '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const CAPTURE_SOURCES = ['../hierarchical-public-capture-v2/capture.js', '../hierarchical-public-capture-v2/robots-deny-space-repair.js', '../../../data/hierarchy-real-root-capture-adr137.mjs',
  '../../../data/hierarchy-real-root-capture-adr137-supervise.py', '../../../src/crawler/public-fetch.js', '../../../src/crawler/robots.js', '../../../src/crawler/static-capture.js'];
const GOLD = ['../../../data/hierarchy-real-root-training-gold-adr136.json', '../../../data/hierarchy-real-root-calibration-gold-adr136.json',
  '../../../data/hierarchy-curated-web-gold-adr134.json', '../../../data/hierarchy-real-root-test-supplement-adr136.json'];
const key = name => new URL(name, import.meta.url).href;
function fixture() {
  const files = new Map(), reads = [];
  const put = (name, value) => files.set(key(name), Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + '\n'));
  const get = name => files.get(key(name));
  const json = name => JSON.parse(get(name));
  for (const name of ROOT_EVIDENCE_FILES) put(name, Buffer.from('fresh fixture source: ' + key(name)));
  // Only immutable implementation source bytes, never real gold or saved model data.
  for (const name of ['../hierarchical-e5-real-root-v1/manifest.js', '../hierarchical-e5-real-root-v1/assessment.js'])
    put(name, readFileSync(new URL(name, import.meta.url)));
  const roots = Array.from({ length: 16 }, (_, i) => ({ id: `root-${i}`, parentId: null }));
  const nodes = [...roots, ...Array.from({ length: 47 }, (_, i) => ({ id: `leaf-${i}`, parentId: roots[i % 16].id }))];
  const cases = ['training', 'calibration', 'test'].flatMap(split => Array.from({ length: split === 'test' ? 32 : 48 }, (_, i) => ({
    id: `${split}-${i}`, entityGroup: `${split}-entity-${i}`, language: 'en', publicUrl: `https://en.wikipedia.org/wiki/Fixture_${split}_${i}`,
    articleTitle: `Fresh fixture ${split} ${i}`, expectedRootId: roots[i % 16].id, split,
    specificityPath: split === 'test' && i < 4 ? [roots[i].id, `leaf-${i}`] : null,
  })));
  const protocol = { schema: 'hierarchical-e5-real-root-experiment/v2', expectedSplits: { training: 48, calibration: 48, test: 32 },
    inputViews: VIEWS, detailPolicyMode: 'observed', inputConstruction: 'fixture construction' };
  put('protocol.json', protocol);
  for (const name of GOLD) put(name, { fixtureGold: name });
  put(C + 'output/model.json', { fixture: 'detail model bytes, never compiled' });
  put(C + 'output/policy.json', { fixture: 'baseline policy bytes' });
  put(C + 'output/input-definition.json', { bodyWeight: .75, titleWeight: .25, encoderHash: 'a'.repeat(64) });
  const cBody = { fixture: 'closed ancestor descriptor' }, cHash = digest(cBody);
  put(C + 'freeze.json', { ...cBody, freezeHash: cHash });
  put(C + 'output/fit.json', { freezeHash: cHash, modelSha256: sha(get(C + 'output/model.json')),
    inputDefinitionSha256: sha(get(C + 'output/input-definition.json')), selection: 'development-only', finalTestEvaluated: false });
  put(D + 'output/policy.json', { fixture: 'observed detail policy bytes' });
  const dBody = { protocol: { baseline: { freezeHash: cHash, modelSha256: sha(get(C + 'output/model.json')) } },
    sourceHashes: { 'assessment.js': sha(get(D + 'assessment.js')) } }, dHash = digest(dBody);
  put(D + 'freeze.json', { ...dBody, freezeHash: dHash });
  const observed = { freezeHash: dHash, observedPolicySha256: sha(get(D + 'output/policy.json')), finalTestEvaluated: false };
  put(D + 'output/calibration.json', observed); put(D + 'measured-results.json', observed);
  const sourceNames = ROOT_EVIDENCE_FILES.filter(name => /\.(?:m?js|py)$/u.test(name) || name === 'protocol.json' || name === ASSETS);
  const sourceHashes = Object.fromEntries(sourceNames.map(name => [name, sha(get(name))]));
  const goldSourceHashes = Object.fromEntries(GOLD.map(name => [name, sha(get(name))]));
  const artifactNames = [C + 'output/model.json', C + 'output/policy.json', C + 'output/input-definition.json',
    C + 'freeze.json', C + 'output/fit.json', D + 'freeze.json', D + 'output/calibration.json', D + 'output/policy.json', D + 'measured-results.json'];
  const m = { cases, goldSourceHashes, taxonomyNodes: nodes, rootNodes: roots, inputDefinition: { bodyWeight: .75, titleWeight: .25 },
    detailArtifacts: { modelSha256: sha(get(C + 'output/model.json')), policySha256: sha(get(D + 'output/policy.json')),
      baselinePolicySha256: sha(get(C + 'output/policy.json')), inputDefinitionSha256: sha(get(C + 'output/input-definition.json')), observedFreezeHash: dHash },
    sourceHashes: { ...sourceHashes, ...goldSourceHashes, ...Object.fromEntries(artifactNames.map(name => [name, sha(get(name))])) } };
  const modelSha256 = 'b'.repeat(64), encoderHash = digest({ modelSha256, embeddingContractSha256: sourceHashes[CONTRACT], assetManifestSha256: sourceHashes[ASSETS] });
  const fBody = { schema: protocol.schema, protocol, protocolSha256: sourceHashes['protocol.json'], sourceHashes,
    manifestIdentity: m, manifestHash: digest(m), encoderHash, representation: 'fresh-fixture-space', representationHash: 'c'.repeat(64), modelSha256 };
  const f = { ...fBody, freezeHash: digest(fBody) }; put('freeze.json', f);
  const rootModel = { nodes: roots, trainingVersion: f.freezeHash + '|' + VIEWS[0], lambda: .1, representation: f.representation, representationHash: f.representationHash };
  const policyBody = { fixturePolicy: 'no classifier' }, rootPolicy = { ...policyBody, policyHash: digest(policyBody) };
  put('output/root-model.json', rootModel); put('output/root-policy.json', rootPolicy);
  const receipt = { schema: 'hierarchy-real-root-selection/v2', phase: 'selected-before-test', finalTestEvaluated: false,
    inputConstructionHash: digest({ schema: 'hierarchy-real-root-selected-input-construction/v2', inputView: VIEWS[0], inputConstruction: protocol.inputConstruction,
      representationHash: f.representationHash, inputDefinitionSha256: m.detailArtifacts.inputDefinitionSha256, modelSha256,
      embeddingContractSha256: sourceHashes[CONTRACT], assetManifestSha256: sourceHashes[ASSETS], pairedAdapterSha256: sourceHashes['../../../src/domain/hierarchical-e5-paired-input.js'],
      protocolSha256: f.protocolSha256, captureConstructorSourceHashes: Object.fromEntries(CAPTURE_SOURCES.map(name => [name, sourceHashes[name]])) }),
    selectedModelSha256: sha(get('output/root-model.json')), selectedPolicySha256: sha(get('output/root-policy.json')), protocolSha256: f.protocolSha256,
    freezeHash: f.freezeHash, detailModelSha256: m.detailArtifacts.modelSha256, detailPolicySha256: m.detailArtifacts.policySha256,
    detailPolicyMode: 'observed', consensusHash: 'd'.repeat(64), inputView: VIEWS[0] };
  put(SELECTED, receipt); const receiptHash = sha(get(SELECTED));
  const axis = Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0);
  const records = {};
  for (const phase of ['traincal', 'test']) {
    const rows = cases.filter(row => phase === 'test' ? row.split === 'test' : row.split !== 'test');
    const outcomes = rows.map(row => {
      const text = `Fresh fixture captured text for ${row.id}`, part = { text, characters: text.length, sha256: sha(text) };
      const outcome = { id: row.id, url: row.publicUrl, title: 'Public fixture title', titleProvenance: 'fixture-title', htmlSha256: 'e'.repeat(64),
        current: part, leadCandidate: { ...part, status: 'available' } };
      outcome.sourceInputHash = digest({ id: outcome.id, url: outcome.url, htmlSha256: outcome.htmlSha256, title: outcome.title,
        currentSha256: part.sha256, leadSha256: part.sha256 }); return outcome;
    });
    const captureCases = rows.map(row => ({ id: row.id, entityGroup: row.entityGroup, url: row.publicUrl, expectedRootId: row.expectedRootId, split: row.split, labelScope: 'root-only' }));
    const capture = { schema: 'hierarchy-real-root-public-capture-result/v2', phase, rawHtmlPersisted: false, modelExecuted: false, currentOwnerDataRead: false,
      canonicalWrites: false, publicLicensedTextOnly: true, noAutomaticRetry: true, cases: captureCases, goldHashes: goldSourceHashes,
      sourceHashes: Object.fromEntries(CAPTURE_SOURCES.map(name => [name.startsWith('../../../') ? name.slice('../../../'.length) :
        'experiments/topic-encoder/hierarchical-public-capture-v2/' + name.slice('../hierarchical-public-capture-v2/'.length), sourceHashes[name]])),
      capture: { phase, status: 'complete', expectedCases: rows.length, completedCases: rows.length, outcomes, failedCaseId: null, failedStage: null, failureCode: null,
        manifestHash: digest({ namespace: 'hierarchy-real-root-public-capture/v2', phase, cases: rows.map(row => ({ id: row.id, url: row.publicUrl })) }) },
      labelUidPathMapHash: digest(captureCases.map(row => ({ id: row.id, split: row.split, supportedPath: [row.expectedRootId] }))),
      selection: phase === 'test' ? { ...receipt, receiptSha256: receiptHash } : null };
    const captureName = `../../../data/hierarchy-real-root-capture-adr137.${phase}.json`; put(captureName, capture);
    const flags = outcomes.map(row => ({ id: row.id, sourceInputHash: row.sourceInputHash, sourceInputHashScope: 'captured-public-input',
      titleProvenance: row.titleProvenance, 'current-static': true, 'wikipedia-prose-lead': true }));
    const packets = VIEWS.map(inputView => {
      const name = `output/${phase}.${inputView}.vectors.json`, packet = serializeVectorPacket({ schema: VECTOR_PACKET_SCHEMA,
        freezeHash: f.freezeHash, encoderHash, vectors: rows.map(row => ({ id: row.id, bodyVector: axis, titleVector: axis })) });
      put(name, packet); return { inputView, rows: rows.length, vectorPacketSha256: sha(packet) };
    });
    records[phase] = { schema: f.schema, freezeHash: f.freezeHash, phase, captureSha256: sha(get(captureName)), captureStatus: 'complete',
      cases: flags, packets, encoderCalls: rows.length * 3, selectedReceiptSha256: phase === 'test' ? receiptHash : null,
      source: 'already-captured-public-text-only-no-network', productionReady: false };
    put(`output/encoding-${phase}.json`, records[phase]);
  }
  put('output/selection.json', { schema: f.schema, freezeHash: f.freezeHash, status: 'selected', receipt, receiptSha256: receiptHash,
    traincalEncodingSha256: sha(get('output/encoding-traincal.json')), finalTestEvaluated: false, calibrationIsSelectionData: true, notIndependentQualityEvidence: true,
    candidates: [{ inputView: VIEWS[0], status: 'eligible', rootModelArtifactHash: digest(rootModel), rootPolicyHash: rootPolicy.policyHash }] });
  const testCases = cases.filter(row => row.split === 'test');
  const outcomes = testCases.map((row, i) => ({ ...records.test.cases[i], inputView: VIEWS[0], selectedViewAvailable: true,
    rootPath: [row.expectedRootId], consensusPath: row.specificityPath ?? [row.expectedRootId], fixedBaselinePath: [row.expectedRootId] }));
  const reports = Object.fromEntries([['rootOnly', 'rootPath'], ['consensus', 'consensusPath'], ['fixedBaseline', 'fixedBaselinePath']].map(([name, path]) => [name,
    assessRootOnlyPredictions({ nodes, cases: testCases.map(({ id, entityGroup, language, expectedRootId, specificityPath }) => ({ id, entityGroup, language, expectedRootId, specificityPath })),
      predictions: outcomes.map(row => ({ id: row.id, sourceInputHash: row.sourceInputHash, selectedPath: row[path] })) })]));
  put('measured-results.json', { schema: f.schema, freezeHash: f.freezeHash, selectionReceipt: receipt, selectionReceiptSha256: receiptHash,
    testCaptureSha256: records.test.captureSha256, testEncodingSha256: sha(get('output/encoding-test.json')), ...reports, outcomes,
    calibrationUsedForSelection: true, testSelectionOrRetuning: false, rootOnlySupervision: true, unannotatedChildNegativesCreated: false,
    representativePopulationClaim: false, productionReady: false, assignmentAuthority: false, ownerDataRead: false,
    canonicalWrites: 0, providerCalls: 0, pageFetches: 0, crawlerActions: 0 });
  const reader = async name => { reads.push(name); if (!get(name)) throw Error('missing'); return get(name); };
  return { files, put, get, json, reader, reads };
}
test('default CLI is inert and unsupported phases cannot run', async () => {
  let calls = 0, output = '';
  assert.equal(await runVerifyCli([], { verify: async () => { calls++; }, write: value => { output += value; } }), 'inert');
  assert.match(output, /No action/); assert.equal(calls, 0);
  await assert.rejects(runVerifyCli(['--test'], { verify: async () => { calls++; } })); assert.equal(calls, 0);
});
test('complete fresh stored fixture verifies without inference and prints only bounded summaries', async () => {
  const f = fixture(), result = await verifyStoredRootEvidence({ readBytes: f.reader });
  assert.equal(result.assessmentsRecomputed, 3); assert.equal(result.testRows, 32); assert.equal(result.metrics.consensus.correctRoot, 32);
  assert.equal(result.metrics.rootOnly.specificity.unscored, 28); assert.equal(result.metrics.consensus.specificity.exactSupportedPath, 4);
  assert.equal(result.inferenceExecuted, false); assert.equal(result.assignmentAuthority, false);
  assert(result.sourceHashChecks > 40); assert(!JSON.stringify(result).includes('Public fixture title'));
  assert(!JSON.stringify(result).includes('bodyVector'));
});
test('missing evidence refuses clearly; no fabricated readiness or writes', async () => {
  await assert.rejects(verifyStoredRootEvidence({ readBytes: async () => { throw Error('missing'); } }), /Stored evidence unavailable: freeze.json/);
  const f = fixture(); f.files.delete(key('measured-results.json'));
  await assert.rejects(verifyStoredRootEvidence({ readBytes: f.reader }), /Stored evidence unavailable: measured-results.json/);
});
test('freeze tampering, source byte drift and nonallowlisted paths refuse', async () => {
  for (const mode of ['freeze', 'source', 'path']) {
    const f = fixture();
    if (mode === 'source') f.put('run.js', Buffer.from('changed bytes'));
    else { const frozen = f.json('freeze.json'); frozen.sourceHashes[mode === 'path' ? '../../../data/private-secret.json' : 'run.js'] = 'f'.repeat(64);
      if (mode === 'path') { const { freezeHash, ...body } = frozen; frozen.freezeHash = digest(body); } f.put('freeze.json', frozen); }
    await assert.rejects(verifyStoredRootEvidence({ readBytes: f.reader }));
    assert(!f.reads.some(name => name.includes('private-secret')));
  }
});
test('receipt, selected artifact, encoding and raw packet byte changes refuse', async () => {
  for (const name of [SELECTED, 'output/root-model.json', 'output/root-policy.json', 'output/encoding-traincal.json',
    'output/test.current-static.vectors.json', '../../../data/hierarchy-real-root-capture-adr137.test.json']) {
    const f = fixture(); f.put(name, Buffer.concat([f.get(name), Buffer.from(' ')]));
    await assert.rejects(verifyStoredRootEvidence({ readBytes: f.reader }), undefined, name);
  }
});
test('saved arithmetic changes and wrong outcome source witnesses refuse', async () => {
  for (const change of [report => { report.consensus.correctRoot--; }, report => { report.outcomes[0].sourceInputHash = 'f'.repeat(64); },
    report => { report.outcomes[0].id = report.outcomes[1].id; }, report => { report.outcomes[0].consensusPath = ['root-15']; }]) {
    const f = fixture(), report = f.json('measured-results.json'); change(report); f.put('measured-results.json', report);
    await assert.rejects(verifyStoredRootEvidence({ readBytes: f.reader }));
  }
});
test('per-file cap rejects oversized injected evidence before JSON parsing', async () => {
  const f = fixture();
  await assert.rejects(verifyStoredRootEvidence({ readBytes: async name => name === 'freeze.json' ? Buffer.alloc(8 * 1024 * 1024 + 1) : f.reader(name) }), /byte capacity/);
});
test('rehashing an invalid packet cannot bypass vector validation or packet identity', async () => {
  for (const change of [packet => { packet.vectors[0].bodyVector[0] = .5; },
    packet => { packet.vectors[0].id = 'invented-row'; }, packet => { packet.encoderHash = 'f'.repeat(64); }]) {
    const f = fixture(), name = 'output/test.current-static.vectors.json', packet = f.json(name);
    change(packet); f.put(name, packet);
    const encoding = f.json('output/encoding-test.json'); encoding.packets[0].vectorPacketSha256 = sha(f.get(name)); f.put('output/encoding-test.json', encoding);
    const report = f.json('measured-results.json'); report.testEncodingSha256 = sha(f.get('output/encoding-test.json')); f.put('measured-results.json', report);
    await assert.rejects(verifyStoredRootEvidence({ readBytes: f.reader }));
  }
});
