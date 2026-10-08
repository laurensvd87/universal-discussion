// Train/validation-only diagnostic. Never load held-out test or challenge rows.
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher, makeSources, runSynthetic } from '../topic-benchmark/benchmark.js';
import { fixtureInputs, observedShape } from '../topic-benchmark/fixtures.js';
import { matchTopicDocumentsV2 } from './matcher-v2.js';

const mode = process.argv[2] ?? 'validation';
if (mode === 'synthetic') {
  const result = await runSynthetic(sources => matchTopicDocumentsV2(sources).partitions);
  const fixture = fixtureInputs(observedShape());
  result.observedPartition = matchTopicDocumentsV2(makeSources(fixture.documents, fixture.vectors));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}
if (!['train', 'validation'].includes(mode)) throw new Error('Only train, validation, and synthetic are available here');
const path = new URL(`../luna-corpus/${mode}.jsonl`, import.meta.url);
const rows = (await readFile(path, 'utf8')).trim().split(/\r?\n/u).map(JSON.parse);
const { vectors } = await embedDocuments(rows, 'body');
if (process.argv[3] === 'pairs') {
  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.family !== b.family && a.title.split(' ')[0] !== b.title.split(' ')[0]) continue;
    const score = vectors.get(a.id).reduce((sum, value, k) => sum + value * vectors.get(b.id)[k], 0);
    if (score > 0.86) pairs.push({ same: a.topicLabel === b.topicLabel, cosine: +score.toFixed(4), a: a.title, b: b.title });
  }
  process.stdout.write(`${JSON.stringify(pairs, null, 2)}\n`);
  process.exit(0);
}
const result = await evaluateMatcher(rows, vectors, sources => matchTopicDocumentsV2(sources).partitions);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
