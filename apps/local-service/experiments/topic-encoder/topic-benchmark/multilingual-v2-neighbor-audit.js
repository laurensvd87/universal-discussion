// Descriptive frozen v2 neighbor audit; does not select a join rule.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusDocument } from '../topic-focus-shadow/core.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const bytes = await readFile(new URL('../multilingual-holdout-v2/holdout.jsonl', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !==
    'a9739faf8a306588f07296cfe5744829538d7423f2952c8ce4655331904ef4a9')
  throw new Error('Frozen corpus changed');
const docs = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
const byId = new Map(docs.map(row => [row.id, row]));
const output = {};
for (const [name, inputs, mode] of [
  ['body', docs, 'body'], ['titleLead', docs.map(focusDocument), 'title-lead']
]) {
  const { vectors } = await embedDocuments(inputs, mode);
  const cosine = (a, b) => vectors.get(a.id).reduce((sum, value, i) =>
    sum + value * vectors.get(b.id)[i], 0);
  const ranks = new Map(docs.map(a => [a.id, docs.filter(b => b.id !== a.id)
    .map(b => ({ id: b.id, score: cosine(a, b) }))
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))]));
  const counts = { rankOneCorrect: 0, topThreeIncludesCorrect: 0,
    topThreeAllCorrect: 0, queries: docs.length };
  for (const row of docs) {
    const top = ranks.get(row.id).slice(0, 3);
    const same = top.filter(item => byId.get(item.id).topicLabel === row.topicLabel).length;
    if (byId.get(top[0].id).topicLabel === row.topicLabel) counts.rankOneCorrect++;
    if (same >= 1) counts.topThreeIncludesCorrect++;
    if (same === 3) counts.topThreeAllCorrect++;
  }
  const same = [], different = [];
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++)
    (docs[i].topicLabel === docs[j].topicLabel ? same : different).push(cosine(docs[i], docs[j]));
  const range = values => ({ min: Math.min(...values), median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
    max: Math.max(...values) });
  output[name] = { ...counts, sameCosine: range(same), differentCosine: range(different) };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
