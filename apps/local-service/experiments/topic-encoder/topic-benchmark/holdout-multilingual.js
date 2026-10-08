// One-shot independent synthetic multilingual check for the frozen candidates.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher, makeSources } from './benchmark.js';
import { loadTrainValidation } from '../topic-focus-shadow/corpus.js';
import { matchTopicDocumentsV3 } from '../topic-method/matcher-v3.js';
import { COSINE_FLOOR, facet, focusDocument, pairEvidence,
  partitionByEvidence, trainIdf, trainZeroFalseCutoff } from '../topic-focus-shadow/core.js';

const EXPECTED = new Map([
  ['../topic-method/matcher-v3.js', 'af49372ed6d9046e925495b94c2ddbeb05562cddcb2f1daa6146b0e0dac2853e'],
  ['../topic-focus-shadow/core.js', 'ecda4f5e12afc5a3152fb0cbd4a6a6b4aaec91b59f53130bab5dabbb446e250c'],
  ['../multilingual-holdout/holdout.jsonl', 'c25c367997ce5f0b1f9f1cbba3c7a037c3e2fe38d05b0f507cb8b4f9166b7776'],
]);
if (process.argv.length !== 2) throw new Error('This evaluator accepts no arguments');
for (const [relative, sha] of EXPECTED) {
  const bytes = await readFile(new URL(relative, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`Frozen input changed: ${relative}`);
}
const corpus = await readFile(new URL('../multilingual-holdout/holdout.jsonl', import.meta.url), 'utf8');
const docs = corpus.trim().split(/\r?\n/u).map(JSON.parse);
if (docs.length !== 24 || docs.some(row => row.split !== 'multilingual-challenge')) throw new Error('Invalid challenge');
const { train } = await loadTrainValidation();
const body = await embedDocuments(docs, 'body');
const focus = await embedDocuments([...train, ...docs].map(focusDocument), 'title-lead');
const trainingFacets = new Map(train.map(row => [row.id, facet(row)]));
const idf = trainIdf(trainingFacets);
const trainingEvidence = pairEvidence(makeSources(train, focus.vectors), focus.vectors,
  trainingFacets, idf);
const gate = trainZeroFalseCutoff(train, trainingEvidence);
const facets = new Map(docs.map(row => [row.id, facet(row)]));
const evidence = pairEvidence(makeSources(docs, focus.vectors), focus.vectors, facets, idf);
const focusMatcher = sources => partitionByEvidence(sources, evidence,
  pair => pair.focus >= COSINE_FLOOR && !pair.conflict && pair.overlap >= gate.cutoff);
const bodyResult = await evaluateMatcher(docs, body.vectors,
  sources => matchTopicDocumentsV3(sources).partitions);
const focusResult = await evaluateMatcher(docs, focus.vectors, focusMatcher);
process.stdout.write(`${JSON.stringify({ frozen: Object.fromEntries(EXPECTED),
  trainOnlyLexicalCutoff: gate.cutoff,
  bodyTitleV3: { score: bodyResult.score, order: bodyResult.order, vectorAudit: bodyResult.vectorAudit },
  focusFacetGate: { score: focusResult.score, order: focusResult.order,
    vectorAudit: focusResult.vectorAudit } }, null, 2)}\n`);
