// Frozen v4 check on a local, hash-pinned real-language research archive.
// CDEC storyline labels are NOT ground truth for atomic discussion Topics.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { loadCdecTestIfAvailable, loadLuna } from './corpora.js';
import { evaluateMatcher, makeSources } from './benchmark.js';
import { facet, focusDocument, pairEvidence, trainIdf,
  trainZeroFalseCutoff } from '../topic-focus-shadow/core.js';
import { matchFocusGraph } from '../topic-focus-graph/matcher.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const frozen = new Map([
  ['../topic-focus-graph/matcher.js', '800ebb28c914ba3188686f88c422ac29c902d2c9853a46eeb5af99f33e2eeb19'],
  ['../topic-focus-shadow/core.js', 'ecda4f5e12afc5a3152fb0cbd4a6a6b4aaec91b59f53130bab5dabbb446e250c'],
]);
for (const [relative, sha] of frozen) {
  if (createHash('sha256').update(await readFile(new URL(relative, import.meta.url))).digest('hex') !== sha)
    throw new Error(`Frozen input changed: ${relative}`);
}
const docs = await loadCdecTestIfAvailable();
if (docs === null) throw new Error('Hash-pinned CDEC archive is unavailable locally');
const { train } = await loadLuna();
const focus = await embedDocuments([...train, ...docs].map(focusDocument), 'title-lead');
const trainFacets = new Map(train.map(row => [row.id, facet(row)]));
const idf = trainIdf(trainFacets);
const trainEvidence = pairEvidence(makeSources(train, focus.vectors), focus.vectors, trainFacets, idf);
const cutoff = trainZeroFalseCutoff(train, trainEvidence).cutoff;
const facets = new Map(docs.map(row => [row.id, facet(row)]));
const result = await evaluateMatcher(docs, focus.vectors, sources =>
  matchFocusGraph(sources, facets, idf, { lexicalCutoff: cutoff }).partitions);
process.stdout.write(`${JSON.stringify({ frozen: Object.fromEntries(frozen),
  caveat: 'CDEC-WN single-publisher disaster storylines, not atomic Topic labels',
  pages: docs.length, trainOnlyLexicalCutoff: cutoff, score: result.score,
  order: result.order, vectorAudit: result.vectorAudit }, null, 2)}\n`);
