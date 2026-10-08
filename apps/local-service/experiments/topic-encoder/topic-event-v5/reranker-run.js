import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { makeSources } from '../topic-benchmark/benchmark.js';
import { loadTrainValidation } from '../topic-focus-shadow/corpus.js';
import { facet, focusDocument } from '../topic-focus-shadow/core.js';
import { weightedOverlap, hardConflict } from '../topic-focus-shadow/core.js';
import { features, fit } from './reranker.js';

const SHA = { train: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  validation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53' };
const multi = {};
for (const name of ['train', 'validation']) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${name}.jsonl`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== SHA[name])
    throw new Error('Frozen multilingual corpus mismatch');
  multi[name] = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
}
const english = await loadTrainValidation();
const all = [...english.train, ...english.validation, ...multi.train, ...multi.validation];
const { vectors, assets, elapsedMs } = await embedDocuments(all.map(focusDocument), 'title-lead');
const facets = new Map(all.map(row => [row.id, facet(row)]));
const idf = Object.assign(new Map(), { unknownWeight: 1 });
const split = rows => features(makeSources(rows, vectors), facets, idf)
  .map(item => ({ ...item, label: rows.find(row => row.id === item.a).topicLabel ===
    rows.find(row => row.id === item.b).topicLabel ? 1 : 0 }));
const train = [...split(english.train), ...split(multi.train)];
const model = fit(train);
let directNegativeMax = 0, directTrueAbove = 0;
for (const rows of [english.train, multi.train])
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const similarity = vectors.get(a.id).reduce((sum, value, k) =>
      sum + value * vectors.get(b.id)[k], 0);
    if (similarity < 0.90 || hardConflict(facets.get(a.id), facets.get(b.id))) continue;
    const overlap = weightedOverlap(facets.get(a.id), facets.get(b.id), idf);
    if (a.topicLabel !== b.topicLabel) directNegativeMax = Math.max(directNegativeMax, overlap);
  }
for (const rows of [english.train, multi.train])
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.topicLabel !== b.topicLabel) continue;
    const similarity = vectors.get(a.id).reduce((sum, value, k) =>
      sum + value * vectors.get(b.id)[k], 0);
    if (similarity >= 0.90 && weightedOverlap(facets.get(a.id), facets.get(b.id), idf) >
      directNegativeMax + 1e-9) directTrueAbove++;
  }
function summary(rows) {
  const predicted = rows.filter(row => model.score(row) >= model.cutoff);
  return { candidates: rows.length,
    candidateTrue: rows.filter(row => row.label).length,
    trueAccepted: predicted.filter(row => row.label).length,
    falseAccepted: predicted.filter(row => !row.label).length,
    cutoff: model.cutoff };
}
const results = { englishTrain: summary(split(english.train)),
  englishValidation: summary(split(english.validation)),
  multiTrain: summary(split(multi.train)),
  multiValidation: summary(split(multi.validation)) };
process.stdout.write(`${JSON.stringify({ assets, embeddingMs: elapsedMs,
  weights: model.weights, means: model.mean, scales: model.scale,
  directNegativeMax, directTrueAbove, results }, null, 2)}\n`);
