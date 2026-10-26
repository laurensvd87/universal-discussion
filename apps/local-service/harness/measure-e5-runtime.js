// One local runtime measurement, not a quality evaluation or ingestion command.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createPackagedCrawlerEmbedder } from '../src/crawler/packaged-e5.js';

if (process.argv.length !== 2) throw new Error('Unexpected benchmark arguments');
const assetManifest = new URL('../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json', import.meta.url);
const manifest = await readFile(assetManifest);
const observation = {
  schema: 'hierarchy-local-e5-runtime/v1', startedAt: new Date().toISOString(),
  assetManifestSha256: createHash('sha256').update(manifest).digest('hex'),
  inputKind: 'short-public-article-titles', freshPageCapture: false,
  qualityEvaluated: false, productionValidated: false,
};
const directory = new URL('../data/', import.meta.url);
await writeFile(new URL('hierarchy-e5-runtime-20261026.attempt.json', directory),
  JSON.stringify(observation), { flag: 'wx' });
let embedder;
try {
  const start = performance.now();
  embedder = await createPackagedCrawlerEmbedder();
  observation.initializationMilliseconds = performance.now() - start;
  observation.modelId = embedder.modelId;
  observation.encodings = [];
  for (const title of ['Portal (video game)', 'Red panda', 'Ratatouille', 'Steam locomotive',
    'Entropy', 'Domain Name System', 'Human rights', 'Montessori education']) {
    const before = performance.now(), embedded = await embedder.embed(title);
    observation.encodings.push({ characters: title.length, milliseconds: performance.now() - before,
      dimensions: embedded.values.length, norm: Math.hypot(...embedded.values) });
  }
  observation.status = 'passed';
} catch {
  observation.status = 'failed';
  process.exitCode = 1;
} finally {
  if (embedder) await embedder.close();
  observation.memory = process.memoryUsage();
  observation.resourceUsage = process.resourceUsage();
  await writeFile(new URL('hierarchy-e5-runtime-20261026.json', directory),
    JSON.stringify(observation), { flag: 'wx' });
  process.stdout.write(JSON.stringify(observation) + '\n');
}
