// One-shot score of frozen v4 against previously unopened Luna test/challenge
// articles and independently authored multilingual v2. No tuning in this file.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { loadLuna } from './corpora.js';
import { evaluateMatcher, makeSources } from './benchmark.js';
import { facet, focusDocument, pairEvidence, trainIdf,
  trainZeroFalseCutoff } from '../topic-focus-shadow/core.js';
import { matchFocusGraph } from '../topic-focus-graph/matcher.js';

const EXPECTED = new Map([
  ['../topic-focus-graph/matcher.js', '800ebb28c914ba3188686f88c422ac29c902d2c9853a46eeb5af99f33e2eeb19'],
  ['../topic-focus-shadow/core.js', 'ecda4f5e12afc5a3152fb0cbd4a6a6b4aaec91b59f53130bab5dabbb446e250c'],
  ['../multilingual-holdout-v2/holdout.jsonl', 'a9739faf8a306588f07296cfe5744829538d7423f2952c8ce4655331904ef4a9'],
]);
if (process.argv.length !== 2) throw new Error('This evaluator accepts no arguments');
for (const [relative, sha] of EXPECTED) {
  const bytes = await readFile(new URL(relative, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`Frozen input changed: ${relative}`);
}
const luna = await loadLuna();
const multilingual = (await readFile(new URL('../multilingual-holdout-v2/holdout.jsonl', import.meta.url), 'utf8'))
  .trim().split(/\r?\n/u).map(JSON.parse);
if (multilingual.length !== 48 || multilingual.some(row => row.split !== 'multilingual-challenge-v2'))
  throw new Error('Invalid multilingual inventory');
const sets = { test: luna.test, challenge: luna.challenge, multilingualV2: multilingual };
const all = [...luna.train, ...Object.values(sets).flat()];
const focus = await embedDocuments(all.map(focusDocument), 'title-lead');
const trainingFacets = new Map(luna.train.map(row => [row.id, facet(row)]));
const idf = trainIdf(trainingFacets);
const trainEvidence = pairEvidence(makeSources(luna.train, focus.vectors), focus.vectors,
  trainingFacets, idf);
const gate = trainZeroFalseCutoff(luna.train, trainEvidence);
const output = { frozen: Object.fromEntries(EXPECTED), trainOnlyLexicalCutoff: gate.cutoff,
  modelSha256: focus.assets.modelSha256, splits: {} };
for (const [name, docs] of Object.entries(sets)) {
  const facets = new Map(docs.map(row => [row.id, facet(row)]));
  const result = await evaluateMatcher(docs, focus.vectors, sources =>
    matchFocusGraph(sources, facets, idf, { lexicalCutoff: gate.cutoff }).partitions);
  output.splits[name] = { score: result.score, order: result.order, vectorAudit: result.vectorAudit };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
