// Inert unless explicitly invoked. New synthetic content only; never owner pages.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';
import { createPackagedCrawlerEmbedder } from '../../../src/crawler/packaged-e5.js';
import { createRidgeTopicTransform, readRidgeTopicAdapter, RIDGE_PARAMETER_SHA256 } from '../../../src/domain/ridge-topic-adapter.js';
import { MODEL_ID, MODEL_SHA256 } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { HIERARCHY_RULE_GRID, fitHierarchyCandidate, evaluateHierarchyCandidate } from '../../../src/domain/hierarchical-e5-evaluation.js';

const here = new URL('./', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const sources = ['run.js', 'protocol.json', 'supervise.py', 'corpus.js', 'taxonomy.js',
  '../../../src/domain/hierarchical-e5-matcher.js', '../../../src/domain/hierarchical-e5-evaluation.js',
  '../../../src/domain/ridge-topic-adapter.js', '../../../src/crawler/packaged-e5.js',
  '../../../data/ridge1-topic-adapter-v1.json',
  '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
  '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json',
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
async function bounded(name, maximum = 8 * 1024 * 1024) {
  const file = new URL(name, here), info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) throw Error('Invalid experiment input');
  const bytes = await readFile(file);assert.equal(bytes.length, info.size);return bytes;
}
async function descriptor() {
  const protocol = JSON.parse(await bounded('protocol.json'));
  assert.deepEqual(protocol.ruleGrid, HIERARCHY_RULE_GRID);
  assert.equal(CORPUS.length, protocol.maximumRows);
  const groupSplits = new Map();
  for (const [split, count] of Object.entries(protocol.expectedSplits)) assert.equal(CORPUS.filter(row => row.split === split).length, count);
  for (const row of CORPUS) {
    assert.equal(row.provenance, 'synthetic-authored');assert.ok(row.text.length > 0 && row.text.length <= 4096);
    if (groupSplits.has(row.groupId)) assert.equal(groupSplits.get(row.groupId), row.split);
    groupSplits.set(row.groupId, row.split);
  }
  const sourceHashes = {};
  for (const name of sources) sourceHashes[name] = hash(await bounded(name));
  const value = { schema: protocol.schema, sourceHashes, protocol, corpusSha256: jsonHash(CORPUS),
    taxonomySha256: jsonHash(TAXONOMY), rowCount: CORPUS.length, modelId: MODEL_ID, modelSha256: MODEL_SHA256 };
  return { ...value, freezeHash: jsonHash(value) };
}
async function verifiedFreeze() {
  const current = await descriptor(), frozen = JSON.parse(await bounded('freeze.json'));
  assert.deepEqual(current, frozen, 'All frozen fields and source hashes must remain exact');return frozen;
}
async function requireAbsent(names) {
  for (const name of names) {
    try { await lstat(new URL(name, here)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw Error('Experiment output already exists; no automatic rerun');
  }
}
async function encode(frozen) {
  if (process.env.MURMINGLE_HIERARCHY_SUPERVISED !== '1') throw Error('Use the checked resource supervisor for encoding');
  await requireAbsent(['output/vectors.json', 'output/encoding.started.json']);
  await mkdir(new URL('output/', here), { recursive: true });
  await writeFile(new URL('output/encoding.started.json', here), JSON.stringify({ freezeHash: frozen.freezeHash }), { flag: 'wx' });
  const adapter = readRidgeTopicAdapter(JSON.parse(await bounded('../../../data/ridge1-topic-adapter-v1.json')),
    { expectedParameterSha256: RIDGE_PARAMETER_SHA256 });
  const transform = createRidgeTopicTransform(adapter), encoder = await createPackagedCrawlerEmbedder();
  const vectors = [], started = performance.now();
  try {
    for (let index = 0; index < CORPUS.length; index++) {
      const row = CORPUS[index], embedding = await encoder.embed(row.text);
      vectors.push({ id: row.id, raw: embedding.values, ridge: Array.from(transform(embedding.values)) });
      if ((index + 1) % 24 === 0) process.stdout.write(JSON.stringify({ stage: 'encoded', completed: index + 1,
        total: CORPUS.length, elapsedMs: Math.round(performance.now() - started) }) + '\n');
    }
  } finally { await encoder.close(); }
  await mkdir(new URL('output/', here), { recursive: true });
  await writeFile(new URL('output/vectors.json', here), JSON.stringify({ schema: frozen.schema,
    freezeHash: frozen.freezeHash, vectors, elapsedMs: performance.now() - started, resourceUsage: process.resourceUsage() }), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ stage: 'vectors-complete', rows: vectors.length, freezeHash: frozen.freezeHash }) + '\n');
}
function artifactFor(frozen, packet, representation) {
  const field = representation === 'raw-e5' ? 'raw' : 'ridge';
  const vectorMap = new Map(packet.vectors.map(row => [row.id, row[field]]));
  assert.equal(vectorMap.size, CORPUS.length);
  assert.ok(CORPUS.every(row => vectorMap.has(row.id)));
  const representationHash = jsonHash({ representation, encoderContract: frozen.sourceHashes[
    '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js'], modelSha256: MODEL_SHA256,
    ridgeParameterSha256: representation === 'pinned-ridge' ? RIDGE_PARAMETER_SHA256 : null });
  return { schema: 'hierarchical-e5-v1', representation, representationHash,
    taxonomyVersion: frozen.taxonomySha256, evidenceVersion: frozen.corpusSha256,
    calibrationVersion: 'unfitted', calibrationStatus: 'candidate',
    nodes: TAXONOMY.nodes.map(({ id, parentId }) => ({ id, parentId })),
    examples: TAXONOMY.exemplarRows.map((row, index) => ({ id: `example-${index}`, nodeId: row.nodeId,
      kind: row.kind, groupId: row.groupId, vector: vectorMap.get(row.rowId) })),
    nodeRules: TAXONOMY.nodes.map(node => ({ nodeId: node.id, enabled: true, minSimilarity: -1,
      meanSimilarity: -1, minMargin: 0, minNegativeMargin: 0, minSupport: 1 })) };
}
function samplesFor(packet, representation, split) {
  const vectorMap = new Map(packet.vectors.map(row => [row.id, row[representation === 'raw-e5' ? 'raw' : 'ridge']]));
  return CORPUS.filter(row => row.split === split).map(row => ({ id: row.id, groupId: row.groupId, split,
    language: row.language, expectedTopicId: row.expectedTopicId, vector: vectorMap.get(row.id) }));
}
async function evaluate(frozen) {
  await requireAbsent(['measured-results.json', 'output/selected-candidate.json', 'output/evaluation.started.json']);
  await writeFile(new URL('output/evaluation.started.json', here), JSON.stringify({ freezeHash: frozen.freezeHash }), { flag: 'wx' });
  const packetBytes = await bounded('output/vectors.json'), packet = JSON.parse(packetBytes);
  assert.equal(packet.freezeHash, frozen.freezeHash);assert.equal(packet.schema, frozen.schema);
  assert.equal(packet.vectors.length, CORPUS.length);
  const candidates = frozen.protocol.representationOrder.map(representation => {
    const artifact = artifactFor(frozen, packet, representation), fitted = fitHierarchyCandidate({ artifact,
      samples: samplesFor(packet, representation, 'development'),
      minimumAcceptedGroups: frozen.protocol.minimumAcceptedDevelopmentGroups,
      targetPrecision: frozen.protocol.developmentPrecisionObjective });
    return { representation, fitted, development: evaluateHierarchyCandidate({ artifact: fitted.artifact,
      samples: samplesFor(packet, representation, 'development'), split: 'development' }) };
  });
  candidates.sort((a, b) => a.development.wrongBroad - b.development.wrongBroad ||
    (b.development.acceptedPrecision ?? 0) - (a.development.acceptedPrecision ?? 0) ||
    b.development.deepestOutcomeAccuracy - a.development.deepestOutcomeAccuracy ||
    b.development.coverage - a.development.coverage ||
    frozen.protocol.representationOrder.indexOf(a.representation) - frozen.protocol.representationOrder.indexOf(b.representation));
  const selected = candidates[0];
  const calibration = candidates.map(candidate => evaluateHierarchyCandidate({ artifact: candidate.fitted.artifact,
    samples: samplesFor(packet, candidate.representation, 'calibration'), split: 'calibration' }));
  const lockedTest = evaluateHierarchyCandidate({ artifact: selected.fitted.artifact,
    samples: samplesFor(packet, selected.representation, 'test'), split: 'test' });
  const report = { schema: frozen.schema, freezeHash: frozen.freezeHash, vectorPacketSha256: hash(packetBytes),
    corpus: { rows: CORPUS.length, provenance: 'new-independently-authored-short-synthetic',
      multilingual: ['en', 'de', 'nl'], realWebQualityClaim: false },
    selection: { representation: selected.representation, basedOn: 'development-only',
      artifactSha256: selected.fitted.artifactSha256, postTestRetuning: false },
    candidates: candidates.map(candidate => ({ representation: candidate.representation,
      artifactSha256: candidate.fitted.artifactSha256, rules: candidate.fitted.artifact.nodeRules,
      fitting: candidate.fitted.summaries, development: candidate.development })),
    calibrationAssessmentOnly: calibration, lockedTest, encoding: { elapsedMs: packet.elapsedMs },
    productionReady: false, reason: 'small-synthetic-feasibility-and-no-production-calibration-or-cutover',
    ownerDataRead: false, providerCalls: 0, canonicalWrites: 0, crawlerActions: 0 };
  await writeFile(new URL('measured-results.json', here), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await writeFile(new URL('output/selected-candidate.json', here), JSON.stringify(selected.fitted.artifact), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ stage: 'evaluation-complete', representation: selected.representation,
    testRows: lockedTest.rowCount, accepted: lockedTest.accepted, safeAccepted: lockedTest.safeAccepted,
    exactDepth: lockedTest.correctDeepestOutcome, wrongBroad: lockedTest.wrongBroad,
    p95ClassifierMs: lockedTest.timing.p95Ms, productionReady: false }) + '\n');
}
const [mode, ...rest] = process.argv.slice(2);
if (mode === undefined) process.stdout.write('No action. Use --freeze, --encode (supervised), or --evaluate.\n');
else if (rest.length || !['--freeze', '--encode', '--evaluate'].includes(mode)) throw Error('Invalid experiment operation');
else if (mode === '--freeze') {
  const frozen = await descriptor();
  await writeFile(new URL('freeze.json', here), JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ stage: 'frozen', freezeHash: frozen.freezeHash, rows: frozen.rowCount }) + '\n');
} else {
  const frozen = await verifiedFreeze();
  if (mode === '--encode') await encode(frozen); else await evaluate(frozen);
}
