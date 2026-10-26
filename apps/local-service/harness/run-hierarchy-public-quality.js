// Fresh public-page diagnostic comparison, with fixed methods and root-only gold.
// This command never ingests, trains, selects cutpoints or grants assignment rights.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createPackagedCrawlerEmbedder } from '../src/crawler/packaged-e5.js';
import { PUBLIC_HIERARCHY_PROBES } from './hierarchy-public-probes.js';
import { compileHierarchyQualityMethods } from './hierarchy-quality-methods.js';
import { createHierarchyPublicCapture } from './hierarchy-public-capture.js';
import { evaluateHierarchyPublicProbe } from './hierarchy-quality-evaluation.js';

const artifacts = {
  rootModel: ['hierarchical-e5-current-producer-transfer-v1/output/root-model.json', '442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'],
  rootPolicy: ['hierarchical-e5-current-producer-transfer-v1/output/root-policy.json', '309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'],
  rootInputDefinition: ['hierarchical-e5-current-producer-transfer-v1/output/input-definition.json', '2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'],
  realRootArtifact: ['hierarchical-e5-local-evidence-dev-v1/output/real-root-only.artifact.json', '9b5571e714fd66eb61a97ddd7bfda6ffbec5568030bde8d7988b4652276ac5fe'],
  detailArtifact: ['hierarchical-e5-local-evidence-dev-v1/output/real-plus-synthetic-detail.artifact.json', 'ce8aa12f452e973e0925b450b13513209e2825b04c7c328c3c15e52ffb851936'],
  localInputDefinition: ['hierarchical-e5-broad-heads-v1/output/input-definition.json', '75d443c8186a375b8e68cdefe383e77a31ef746ae3f725d92f84ae9341b46db2'],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
if (process.argv.length !== 2) throw new Error('Unexpected quality arguments');
const output = new URL('../data/hierarchy-public-quality-20261026/', import.meta.url);
// One invocation owns this directory permanently, including partial failures.
await mkdir(output);
const bundle = {}, inputPins = {};
for (const [name, [relative, expected]] of Object.entries(artifacts)) {
  const bytes = await readFile(new URL('../experiments/topic-encoder/' + relative, import.meta.url));
  if (bytes.length > 4 * 1024 * 1024 || hash(bytes) !== expected) throw new Error('Artifact pin mismatch');
  inputPins[name] = { sha256: expected, bytes: bytes.length };
  bundle[name] = JSON.parse(bytes);
}
const methods = compileHierarchyQualityMethods(bundle);
const sourcePins = {};
for (const relative of ['./run-hierarchy-public-quality.js', './hierarchy-public-capture.js',
  './hierarchy-quality-methods.js', './hierarchy-public-probes.js', './hierarchy-quality-evaluation.js',
  '../src/crawler/packaged-e5.js', '../src/crawler/public-fetch.js',
  '../src/crawler/static-capture.js', '../src/crawler/robots.js', '../src/crawler/url-policy.js']) {
  const bytes = await readFile(new URL(relative, import.meta.url));
  sourcePins[relative] = { sha256: hash(bytes), bytes: bytes.length };
}
const frozenInputs = JSON.stringify({ inputPins, sourcePins,
  methods: methods.identity, probes: PUBLIC_HIERARCHY_PROBES,
  scope: 'predeclared-English-public-diagnostic-probes-not-representative-web-holdout',
  labelScope: 'root-only-not-terminal-or-child-gold', fittingOrSelection: false });
await writeFile(new URL('inputs.json', output), frozenInputs, { flag: 'wx' });

const started = performance.now(), rows = [], timing = { body: [], title: [], matching: [] };
const capture = createHierarchyPublicCapture({ deadline: Date.now() + 240000 });
let embedder, initializationMilliseconds = null, failure = null;
async function getEmbedder() {
  if (!embedder) {
    const before = performance.now();
    embedder = await createPackagedCrawlerEmbedder();
    initializationMilliseconds = performance.now() - before;
  }
  return embedder;
}
try {
  for (const probe of PUBLIC_HIERARCHY_PROBES) {
    const { row, fatal } = await evaluateHierarchyPublicProbe({ probe, capture, getEmbedder,
      methods, now: () => performance.now() });
    rows.push(row);
    if (Number.isFinite(row.bodyMilliseconds)) timing.body.push(row.bodyMilliseconds);
    if (Number.isFinite(row.titleMilliseconds)) timing.title.push(row.titleMilliseconds);
    if (Number.isFinite(row.matchingMilliseconds)) timing.matching.push(row.matchingMilliseconds);
    await writeFile(new URL(`${probe.id}.json`, output), JSON.stringify(row), { flag: 'wx' });
    process.stdout.write(JSON.stringify({ completed: rows.length, total: PUBLIC_HIERARCHY_PROBES.length,
      available: rows.filter(value => value.methods).length }) + '\n');
    if (fatal) { failure = 'probe-evaluation-failed'; process.exitCode = 1; break; }
  }
} catch {
  failure = 'capture-or-encoding-or-scoring-failed';
  process.exitCode = 1;
} finally {
  if (embedder) {
    try { await embedder.close(); }
    catch { failure ??= 'encoder-close-failed'; process.exitCode = 1; }
  }
  for (const probe of PUBLIC_HIERARCHY_PROBES.slice(rows.length)) {
    const row = { id: probe.id, groupId: probe.groupId, url: probe.url,
      expectedRootId: probe.rootId, labelScope: probe.labelScope,
      attempted: false, captureStatus: 'not-attempted', captureReason: 'stopped-after-failure' };
    rows.push(row);
    await writeFile(new URL(`${probe.id}.json`, output), JSON.stringify(row), { flag: 'wx' });
  }
  let endPinsChecked = true;
  try {
    for (const [name, [relative, expected]] of Object.entries(artifacts)) {
      const bytes = await readFile(new URL('../experiments/topic-encoder/' + relative, import.meta.url));
      if (bytes.length !== inputPins[name].bytes || hash(bytes) !== expected) endPinsChecked = false;
    }
    for (const [relative, pin] of Object.entries(sourcePins)) {
      const bytes = await readFile(new URL(relative, import.meta.url));
      if (bytes.length !== pin.bytes || hash(bytes) !== pin.sha256) endPinsChecked = false;
    }
  } catch { endPinsChecked = false; }
  if (!endPinsChecked) { failure ??= 'input-end-pin-mismatch'; process.exitCode = 1; }
  const counts = {};
  const captureCounts = {
    captured: rows.filter(row => row.captureStatus === 'available').length,
    captureUnavailable: rows.filter(row => row.captureStatus === 'unavailable').length,
    captureIncomplete: rows.filter(row => row.captureStatus === 'attempted').length,
    evaluationFailed: rows.filter(row => row.evaluationStatus === 'failed').length,
    notAttempted: rows.filter(row => row.captureStatus === 'not-attempted').length,
  };
  for (const name of ['rootLinear', 'realRootReferences', 'rootWithSyntheticDetail']) {
    const available = rows.filter(row => row.methods);
    const accepted = available.filter(row => row.methods[name].status === 'accepted');
    const correct = accepted.filter(row => row.methods[name].rootId === row.expectedRootId);
    counts[name] = { total: PUBLIC_HIERARCHY_PROBES.length, available: available.length,
      accepted: accepted.length, correct: correct.length, wrong: accepted.length - correct.length,
      abstained: available.length - accepted.length,
      unavailable: PUBLIC_HIERARCHY_PROBES.length - available.length,
      childAccuracyMeasured: false };
  }
  const latencies = Object.fromEntries(Object.entries(timing).map(([name, values]) =>
    [name, { count: values.length, p50Milliseconds: percentile(values, 0.5),
      p95Milliseconds: percentile(values, 0.95) }]));
  const result = { schema: 'hierarchy-public-quality-result/v1',
    status: failure ? 'failed' : 'completed', failure, counts, captureCounts, latencies,
    inputsSha256: hash(frozenInputs), endPinsChecked,
    sourcePinScope: 'listed-ten-source-files-not-full-transitive-execution-closure',
    initializationMilliseconds, elapsedMilliseconds: performance.now() - started,
    capture: capture.snapshot(), memory: process.memoryUsage(),
    productionValidated: false, assignmentAuthority: false, childAccuracyMeasured: false,
    representativePopulation: false, retrainedOrRetuned: false };
  await writeFile(new URL('result.json', output), JSON.stringify(result), { flag: 'wx' });
  process.stdout.write(JSON.stringify(result) + '\n');
}
