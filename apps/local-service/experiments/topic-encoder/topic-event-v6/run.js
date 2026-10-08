import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher, makeSources } from '../topic-benchmark/benchmark.js';
import { matchEventV5 } from '../topic-event-v5/matcher.js';
import { loadTrainValidation } from '../topic-focus-shadow/corpus.js';
import { facet, focusDocument } from '../topic-focus-shadow/core.js';
import { matchEventV6 } from './matcher.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const SHA = { multiTrain: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  multiValidation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53' };
const english = await loadTrainValidation();
const multilingual = {};
for (const [name, filename] of [['multiTrain', 'train.jsonl'],
  ['multiValidation', 'validation.jsonl']]) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${filename}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== SHA[name])
    throw new Error(`Frozen ${name} mismatch`);
  multilingual[name] = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
}
const splits = { ...english, ...multilingual };
const all = Object.values(splits).flat();
const { vectors, assets, elapsedMs } = await embedDocuments(all.map(focusDocument), 'title-lead');
const facets = new Map(all.map(doc => [doc.id, facet(doc)]));
const result = {};
for (const [name, rows] of Object.entries(splits)) {
  const measured = await evaluateMatcher(rows, vectors,
    sources => matchEventV6(sources, facets).partitions);
  const sources = makeSources(rows, vectors);
  const uniform = Object.assign(new Map(), { unknownWeight: 1 });
  const seeds = matchEventV5(sources, facets, uniform).partitions;
  const final = matchEventV6(sources, facets).partitions;
  const covered = groups => new Set(groups.filter(group => group.length > 1).flat());
  const seedCovered = covered(seeds), finalCovered = covered(final);
  result[name] = { score: measured.score, order: measured.order,
    coverage: { seedPages: seedCovered.size, finalPages: finalCovered.size,
      addedPages: [...finalCovered].filter(id => !seedCovered.has(id)).length,
      seedGroups: seeds.length, finalGroups: final.length },
    matchingMs: measured.timingMs.median };
}
process.stdout.write(`${JSON.stringify({ modelSha256: assets.modelSha256,
  embeddingMs: elapsedMs, result }, null, 2)}\n`);
