// One-shot offline scoring of frozen precision-first candidates. Never tune
// these sources against the holdout output; publish a new unseen set instead.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { loadLuna } from './corpora.js';
import { evaluateMatcher, makeSources } from './benchmark.js';
import { matchTopicDocumentsV3 } from '../topic-method/matcher-v3.js';
import { COSINE_FLOOR, facet, focusDocument, pairEvidence,
  partitionByEvidence, trainIdf, trainZeroFalseCutoff } from '../topic-focus-shadow/core.js';

const EXPECTED = new Map([
  ['../topic-method/matcher-v3.js', 'af49372ed6d9046e925495b94c2ddbeb05562cddcb2f1daa6146b0e0dac2853e'],
  ['../topic-focus-shadow/core.js', 'ecda4f5e12afc5a3152fb0cbd4a6a6b4aaec91b59f53130bab5dabbb446e250c'],
]);
for (const [relative, sha] of EXPECTED) {
  const bytes = await readFile(new URL(relative, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`Frozen candidate changed: ${relative}`);
}
if (process.argv.length !== 2) throw new Error('This evaluator accepts no arguments');

const splits = await loadLuna();
const selected = [...splits.train, ...splits.test, ...splits.challenge];
const body = await embedDocuments([...splits.test, ...splits.challenge], 'body');
const focus = await embedDocuments(selected.map(focusDocument), 'title-lead');
const trainFacets = new Map(splits.train.map(row => [row.id, facet(row)]));
const idf = trainIdf(trainFacets);
const trainEvidence = pairEvidence(makeSources(splits.train, focus.vectors), focus.vectors,
  trainFacets, idf);
const selectedGate = trainZeroFalseCutoff(splits.train, trainEvidence);
const output = { frozen: Object.fromEntries(EXPECTED),
  input: { focusLeadCharacters: 384, focusCosineFloor: COSINE_FLOOR,
    trainOnlyLexicalCutoff: selectedGate.cutoff }, splits: {} };
for (const name of ['test', 'challenge']) {
  const docs = splits[name];
  const facets = new Map(docs.map(row => [row.id, facet(row)]));
  const evidence = pairEvidence(makeSources(docs, focus.vectors), focus.vectors, facets, idf);
  const focusMatcher = sources => partitionByEvidence(sources, evidence,
    pair => pair.focus >= COSINE_FLOOR && !pair.conflict && pair.overlap >= selectedGate.cutoff);
  const v3 = await evaluateMatcher(docs, body.vectors,
    sources => matchTopicDocumentsV3(sources).partitions);
  const focusResult = await evaluateMatcher(docs, focus.vectors, focusMatcher);
  output.splits[name] = {
    bodyTitleV3: { score: v3.score, order: v3.order, vectorAudit: v3.vectorAudit },
    focusFacetGate: { score: focusResult.score, order: focusResult.order,
      vectorAudit: focusResult.vectorAudit },
  };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
