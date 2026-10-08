// Descriptive audit only: no matching rule or threshold is selected here.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusDocument } from '../topic-focus-shadow/core.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const bytes = await readFile(new URL('../multilingual-holdout/holdout.jsonl', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !==
    'c25c367997ce5f0b1f9f1cbba3c7a037c3e2fe38d05b0f507cb8b4f9166b7776')
  throw new Error('Frozen corpus changed');
const docs = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
const output = {};
for (const [name, inputs, mode] of [
  ['body', docs, 'body'], ['titleLead', docs.map(focusDocument), 'title-lead']
]) {
  const { vectors } = await embedDocuments(inputs, mode);
  const score = (a, b) => vectors.get(a.id).reduce((sum, value, i) =>
    sum + value * vectors.get(b.id)[i], 0);
  const ranked = new Map(docs.map(a => [a.id, docs.filter(b => b.id !== a.id)
    .map(b => ({ id: b.id, score: score(a, b) }))
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))]));
  const best = new Map(docs.map(a => [a.id, ranked.get(a.id)[0]]));
  let rankOneCorrect = 0, topTwoBothCorrect = 0, reciprocalCorrect = 0, reciprocalWrong = 0;
  const seen = new Set(), trueScores = [], falseScores = [];
  const byId = new Map(docs.map(doc => [doc.id, doc]));
  for (const a of docs) {
    if (byId.get(best.get(a.id).id).topicLabel === a.topicLabel) rankOneCorrect++;
    if (ranked.get(a.id).slice(0, 2).every(item => byId.get(item.id).topicLabel === a.topicLabel))
      topTwoBothCorrect++;
    const b = byId.get(best.get(a.id).id);
    const pair = [a.id, b.id].sort().join('|');
    if (best.get(b.id).id !== a.id || seen.has(pair)) continue;
    seen.add(pair);
    if (a.topicLabel === b.topicLabel) reciprocalCorrect++; else reciprocalWrong++;
  }
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    (docs[i].topicLabel === docs[j].topicLabel ? trueScores : falseScores).push(score(docs[i], docs[j]));
  }
  const range = values => ({ min: Math.min(...values), median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
    max: Math.max(...values) });
  output[name] = { rankOneCorrect, topTwoBothCorrect, queries: docs.length, reciprocalCorrect,
    reciprocalWrong, truePairCosine: range(trueScores), falsePairCosine: range(falseScores) };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
