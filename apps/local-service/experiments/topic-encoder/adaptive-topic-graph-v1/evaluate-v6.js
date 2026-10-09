// One-shot v6 check of the graph rules frozen before this holdout existed.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusInput } from '../multilingual-projection-v2/core.js';
import { currentMatcher, makeSources } from '../topic-benchmark/benchmark.js';
import { groupDocuments, scoreGroups } from './core.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const expected = '032eaa490d0ae6b9067ec479be4a80b563229606f83ce0f43a1bc9efd4098aeb';
const bytes = await readFile(new URL('../multilingual-holdout-v6/holdout.jsonl', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('Independent holdout hash mismatch');
const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse);
if (rows.length !== 60 || rows.some(row => row.split !== 'holdout')) throw new Error('Unexpected holdout shape');
const { vectors, elapsedMs, assets } = await embedDocuments(rows.map(focusInput), 'title-lead');
const rules = {
  fixedComplete094: { method: 'complete', cutoff: 0.94 },
  strictSelected: { method: 'triangle', minimum: 0.86, cover: 0.88, mean: 0.92, strongPair: 0.94 },
  exploratoryFrozen: { method: 'triangle', minimum: 0.86, cover: 0.88, mean: 0.88, strongPair: 0.94 },
  nearestVetoFrozen: { method: 'triangle-nearest', minimum: 0.86, cover: 0.88, mean: 0.88, strongPair: 0.94 },
};
const results = Object.fromEntries(Object.entries(rules)
  .map(([name, rule]) => [name, scoreGroups(rows, groupDocuments(rows, vectors, rule))]));
results.currentSnapshotNoHistory = scoreGroups(rows,
  currentMatcher(makeSources(rows, vectors)).map(part => part.sourceIds));
process.stdout.write(`${JSON.stringify({ fixtureSha256: expected, records: rows.length,
  representation: 'packaged-E5, NFKC title plus 384-character lead',
  assets, embeddingElapsedMs: Math.round(elapsedMs), results }, null, 2)}\n`);
