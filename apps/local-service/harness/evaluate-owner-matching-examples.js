// Numerical regression for the owner's two public Kapsalon examples. Historical
// stored body vectors plus freshly encoded stored titles are explicitly separate
// from a fresh page capture/native observation or independent quality holdout.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createPackagedCrawlerEmbedder } from '../src/crawler/packaged-e5.js';
import { compileHierarchyQualityMethods } from './hierarchy-quality-methods.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (process.argv.length !== 2) throw new Error('Unexpected example evaluation arguments');
const examplesBytes = await readFile(new URL('../data/hierarchy-owner-matching-examples-20261026.json', import.meta.url));
if (hash(examplesBytes) !== 'b52edb13c961b639c4b83d574bf9ef59febe2abb2208c48a2853aa78db475b19')
  throw new Error('Example snapshot pin mismatch');
const examples = JSON.parse(examplesBytes).observations;
if (examples.length !== 2) throw new Error('Expected both owner examples');
const inputBytes = await readFile(new URL('../data/hierarchy-public-quality-20261026/inputs.json', import.meta.url));
if (hash(inputBytes) !== '97eb983acc5ac88d8067abd34ce25e8c99fd4beeea8efa01c3ef30f8d90b8341')
  throw new Error('Candidate input pin mismatch');
const pins = JSON.parse(inputBytes).inputPins;
const files = { rootModel: 'hierarchical-e5-current-producer-transfer-v1/output/root-model.json',
  rootPolicy: 'hierarchical-e5-current-producer-transfer-v1/output/root-policy.json',
  rootInputDefinition: 'hierarchical-e5-current-producer-transfer-v1/output/input-definition.json',
  realRootArtifact: 'hierarchical-e5-local-evidence-dev-v1/output/real-root-only.artifact.json',
  detailArtifact: 'hierarchical-e5-local-evidence-dev-v1/output/real-plus-synthetic-detail.artifact.json',
  localInputDefinition: 'hierarchical-e5-broad-heads-v1/output/input-definition.json' };
const bundle = {};
for (const [key, relative] of Object.entries(files)) {
  const bytes = await readFile(new URL('../experiments/topic-encoder/' + relative, import.meta.url));
  if (hash(bytes) !== pins[key].sha256 || bytes.length !== pins[key].bytes) throw new Error('Candidate pin mismatch');
  bundle[key] = JSON.parse(bytes);
}
const methods = compileHierarchyQualityMethods(bundle);
const output = new URL('../data/hierarchy-owner-matching-evaluation-20261026.json', import.meta.url);
await writeFile(new URL('../data/hierarchy-owner-matching-evaluation-20261026.attempt.json', import.meta.url),
  JSON.stringify({ snapshotSha256: hash(examplesBytes), startedAt: new Date().toISOString() }), { flag: 'wx' });
let embedder;
const rows = [];
try {
  embedder = await createPackagedCrawlerEmbedder();
  for (const example of examples) {
    const title = await embedder.embed(example.title), before = performance.now();
    const decision = methods.classify({ sourceId: example.id, sourceVersion: hash(examplesBytes),
      bodyVector: example.values_double, titleVector: title.values });
    rows.push({ url: example.url, title: example.title, extractorVersion: example.extractor_version,
      methods: decision, matchingMilliseconds: performance.now() - before });
  }
  let cosine = 0;
  for (let index = 0; index < 384; index++) cosine += examples[0].values_double[index] * examples[1].values_double[index];
  const result = { schema: 'owner-public-matching-regression/v1', rows, storedBodyCosine: cosine,
    construction: 'stored-body-vector-plus-new-encoding-of-stored-title',
    sourceSnapshotSha256: hash(examplesBytes), nativeObservation: false, freshCapture: false,
    independentQualityHoldout: false, productionValidated: false, assignmentAuthority: false };
  await writeFile(output, JSON.stringify(result), { flag: 'wx' });
  process.stdout.write(JSON.stringify(result) + '\n');
} catch { process.stderr.write('Owner example evaluation failed.\n'); process.exitCode = 1; }
finally { if (embedder) await embedder.close(); }
