import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher, makeSources } from '../topic-benchmark/benchmark.js';
import { loadTrainValidation } from '../topic-focus-shadow/corpus.js';
import { facet, focusDocument, hardConflict, weightedOverlap } from '../topic-focus-shadow/core.js';
import { matchEventV7 } from './matcher.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const SHA = { multiTrain: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  multiValidation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53' };
const english = await loadTrainValidation();
const multilingual = {};
for (const [name, file] of [['multiTrain', 'train.jsonl'], ['multiValidation', 'validation.jsonl']]) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${file}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== SHA[name]) throw new Error(`Frozen ${name} mismatch`);
  multilingual[name] = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
}
const splits = { ...english, ...multilingual };
const docs = Object.values(splits).flat();
const { vectors, assets, elapsedMs } = await embedDocuments(docs.map(focusDocument), 'title-lead');
const facets = new Map(docs.map(doc => [doc.id, facet(doc)]));
const uniform = Object.assign(new Map(), { unknownWeight: 1 });
const results = {};
for (const [name, rows] of Object.entries(splits)) {
  const measured = await evaluateMatcher(rows, vectors,
    sources => matchEventV7(sources, facets).partitions);
  const partitions = matchEventV7(makeSources(rows, vectors), facets).partitions;
  const byId = new Map(rows.map(row => [row.id, row]));
  let crossLanguageJoined = 0, crossLanguageTotal = 0;
  let opposingJoined = 0, opposingTotal = 0;
  let trueAboveCosine = 0, trueAboveCosineLexical = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.topicLabel !== b.topicLabel) continue;
    const sim = vectors.get(a.id).reduce((n, v, k) => n + v * vectors.get(b.id)[k], 0);
    if (sim >= 0.91 && !hardConflict(facets.get(a.id), facets.get(b.id))) {
      trueAboveCosine++;
      if (weightedOverlap(facets.get(a.id), facets.get(b.id), uniform) >= 0.20)
        trueAboveCosineLexical++;
    }
    const joined = partitions.some(group => group.includes(a.id) && group.includes(b.id));
    if (a.id.match(/-(en|nl|de|fr|es)-/u)?.[1] !== b.id.match(/-(en|nl|de|fr|es)-/u)?.[1]) {
      crossLanguageTotal++; if (joined) crossLanguageJoined++;
    }
    if (a.viewpoint !== b.viewpoint) { opposingTotal++; if (joined) opposingJoined++; }
  }
  results[name] = { score: measured.score, order: measured.order,
    partitions: partitions.map(group => ({ ids: group, labels: [...new Set(group.map(id => byId.get(id).topicLabel))] })),
    crossLanguage: { joined: crossLanguageJoined, total: crossLanguageTotal },
    opposingView: { joined: opposingJoined, total: opposingTotal },
    admissionDiagnostic: { trueAboveCosine, trueAboveCosineLexical },
    medianMatchingMs: measured.timingMs.median };
}
process.stdout.write(`${JSON.stringify({ modelSha256: assets.modelSha256,
  embeddingMs: elapsedMs, results }, null, 2)}\n`);
