import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusDocument } from '../topic-focus-shadow/core.js';

const SHA = { train: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  validation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53' };
const splits = {};
for (const name of ['train', 'validation']) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${name}.jsonl`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== SHA[name])
    throw new Error(`Frozen ${name} mismatch`);
  splits[name] = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
}
const all = [...splits.train, ...splits.validation];
const modes = {
  titleOnly: all.map(row => ({ ...row, body: row.title })),
  titleLead: all.map(focusDocument),
};
const output = {};
for (const [mode, docs] of Object.entries(modes)) {
  const { vectors, elapsedMs, assets } = await embedDocuments(docs,
    mode === 'titleOnly' ? 'body' : 'title-lead');
  output[mode] = { elapsedMs, modelSha256: assets.modelSha256 };
  for (const [name, rows] of Object.entries(splits)) {
    const score = (a, b) => vectors.get(a.id).reduce((sum, value, i) =>
      sum + value * vectors.get(b.id)[i], 0);
    const ranges = { sameEvent: [], adjacentEvent: [] };
    let top3 = 0, top1 = 0;
    for (const a of rows) {
      const ranked = rows.filter(b => a.id !== b.id)
        .map(b => ({ b, value: score(a, b) }))
        .sort((x, y) => y.value - x.value || x.b.id.localeCompare(y.b.id));
      if (ranked[0].b.topicLabel === a.topicLabel) top1++;
      if (ranked.slice(0, 3).some(item => item.b.topicLabel === a.topicLabel)) top3++;
    }
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].topicLabel === rows[j].topicLabel)
        ranges.sameEvent.push(score(rows[i], rows[j]));
      else if (rows[i].family === rows[j].family)
        ranges.adjacentEvent.push(score(rows[i], rows[j]));
    }
    const summary = values => ({ min: Math.min(...values),
      median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
      max: Math.max(...values) });
    output[mode][name] = { pages: rows.length, top1, top3,
      sameEvent: summary(ranges.sameEvent), adjacentEvent: summary(ranges.adjacentEvent) };
  }
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
