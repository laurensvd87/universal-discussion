// One-shot frozen holdout evaluation. No fitting, thresholds, or feature
// choices can use v6 labels. Only aggregate results leave this process.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusInput } from '../multilingual-projection-v2/core.js';
import { scoreGroups } from '../adaptive-topic-graph-v1/core.js';
import { buildLexicon, fitModel, groupRows, makePairs, pairCounts, dot } from './core.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const specs = [
  ['../multilingual-train-v1/train.jsonl', '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b', 'v1'],
  ['../multilingual-train-v2/train-part-1.jsonl', '94a14a36b016795b504e22be9c5c3e1aadb372bdd6d013b9b791e09ac5d81254', 'v2'],
  ['../multilingual-train-v2/train-part-2.jsonl', '7240a9848cee76a2857a737740e4f280f9a9cd7c15d1b38689c9246ff2160db6', 'v2'],
];
async function checkedRows(filename, digest, prefix) {
  const bytes = await readFile(new URL(filename, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Frozen corpus changed');
  return bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse).map(row => ({ ...row,
    id: `${prefix}:${row.id}`, family: `${prefix}:${row.family}`,
    topicLabel: `${prefix}:${row.topicLabel}` }));
}
const train = (await Promise.all(specs.map(([filename, digest, prefix]) =>
  checkedRows(filename, digest, prefix)))).flat();
const holdout = await checkedRows('../multilingual-holdout-v6/holdout.jsonl',
  '032eaa490d0ae6b9067ec479be4a80b563229606f83ce0f43a1bc9efd4098aeb', 'v6');
if (train.length !== 200 || holdout.length !== 60 ||
    holdout.some(row => row.split !== 'holdout')) throw new Error('Unexpected corpus structure');
const started = performance.now();
const all = [...train, ...holdout];
const { vectors: leadVectors, elapsedMs: leadEmbeddingMs, assets } =
  await embedDocuments(all.map(focusInput), 'title-lead');
const { vectors: bodyVectors, elapsedMs: bodyEmbeddingMs } =
  await embedDocuments(all, 'body');

function topThree(rows, vectors) {
  let found = 0;
  for (const row of rows) {
    const neighbors = rows.filter(other => other.id !== row.id)
      .map(other => ({ id: other.id, topicLabel: other.topicLabel,
        cosine: dot(vectors.get(row.id), vectors.get(other.id)) }))
      .sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
    if (neighbors.slice(0, 3).some(item => item.topicLabel === row.topicLabel)) found++;
  }
  return { found, eligible: rows.length };
}
function evaluate(vectors, titleOnly, rule) {
  const project = rows => titleOnly ? rows.map(row => ({ ...row, body: '' })) : rows;
  const trainRows = project(train), holdoutRows = project(holdout);
  const lexicon = buildLexicon(trainRows);
  const model = fitModel(makePairs(trainRows, vectors, lexicon));
  const pairs = makePairs(holdoutRows, vectors, lexicon, model);
  const groups = groupRows(holdoutRows, pairs, rule);
  return { retrievalTopThree: topThree(holdout, vectors),
    pair: pairCounts(pairs, rule.cutoff, rule.cosineFloor),
    topic: scoreGroups(holdout, groups) };
}
const fullRule = { cutoff: 6.1505557310739345, floor: 6.1505557310739345, cosineFloor: 0.78 };
const retainedRule = { cutoff: 6.197572640918079, floor: 6.197572640918079, cosineFloor: 0.78 };
const fullText = evaluate(leadVectors, false, fullRule);
const retainedCompatible = evaluate(bodyVectors, true, retainedRule);
process.stdout.write(`${JSON.stringify({ holdoutSha256: '032eaa490d0ae6b9067ec479be4a80b563229606f83ce0f43a1bc9efd4098aeb',
  rows: holdout.length, assets, leadEmbeddingMs: Math.round(leadEmbeddingMs),
  bodyEmbeddingMs: Math.round(bodyEmbeddingMs), elapsedMs: Math.round(performance.now() - started),
  fullText, retainedCompatible }, null, 2)}\n`);
