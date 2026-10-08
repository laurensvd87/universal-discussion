import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher } from '../topic-benchmark/benchmark.js';
import { loadTrainValidation } from '../topic-focus-shadow/corpus.js';
import { facet, focusDocument, trainIdf } from '../topic-focus-shadow/core.js';
import { matchFocusGraph } from './matcher.js';

const MULTILINGUAL_SHA = 'c25c367997ce5f0b1f9f1cbba3c7a037c3e2fe38d05b0f507cb8b4f9166b7776';
const bytes = await readFile(new URL('../multilingual-holdout/holdout.jsonl', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !== MULTILINGUAL_SHA)
  throw new Error('Frozen multilingual input changed');
const multilingual = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
const splits = await loadTrainValidation();
const all = [...splits.train, ...splits.validation, ...multilingual];
const { vectors, assets, elapsedMs } = await embedDocuments(all.map(focusDocument), 'title-lead');
const facets = new Map(all.map(row => [row.id, facet(row)]));
const idf = trainIdf(new Map(splits.train.map(row => [row.id, facets.get(row.id)])));
const results = {};
for (const [name, docs] of Object.entries({ train: splits.train,
  validation: splits.validation, multilingual })) {
  const score = await evaluateMatcher(docs, vectors,
    sources => matchFocusGraph(sources, facets, idf).partitions);
  results[name] = { score: score.score, order: score.order,
    medianMatchingMs: score.timingMs.median };
}
process.stdout.write(`${JSON.stringify({ modelSha256: assets.modelSha256,
  embeddingMs: elapsedMs, results }, null, 2)}\n`);
