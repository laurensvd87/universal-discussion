// Train/validation-only v3 diagnostic. No held-out file is loaded.
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher, makeSources } from '../topic-benchmark/benchmark.js';
import { matchTopicDocumentsV2 } from './matcher-v2.js';

const mode = process.argv[2] ?? 'validation';
if (!['train', 'validation'].includes(mode)) throw new Error('Only train and validation are available');
const rows = (await readFile(new URL(`../luna-corpus/${mode}.jsonl`, import.meta.url), 'utf8')).trim().split(/\r?\n/u).map(JSON.parse);
const { vectors } = await embedDocuments(rows, 'body');
if (process.argv[3] === 'v2-false-pairs' || process.argv[3] === 'v3-false-pairs') {
  const { matchTopicDocumentsV3 } = await import('./matcher-v3.js');
  const groups = (process.argv[3] === 'v2-false-pairs' ? matchTopicDocumentsV2 : matchTopicDocumentsV3)(makeSources(rows, vectors)).partitions;
  const byId = new Map(rows.map(row => [row.id, row]));
  const falsePairs = [];
  for (const group of groups) for (let i = 0; i < group.sourceIds.length; i++)
    for (let j = i + 1; j < group.sourceIds.length; j++) {
      const a = byId.get(group.sourceIds[i]), b = byId.get(group.sourceIds[j]);
      if (a.topicLabel !== b.topicLabel) falsePairs.push({ a: a.title, b: b.title });
    }
  process.stdout.write(`${JSON.stringify(falsePairs, null, 2)}\n`);
} else {
  const { matchTopicDocumentsV3 } = await import('./matcher-v3.js');
  process.stdout.write(`${JSON.stringify(await evaluateMatcher(rows, vectors,
    sources => matchTopicDocumentsV3(sources).partitions), null, 2)}\n`);
}
