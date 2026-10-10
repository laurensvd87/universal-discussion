import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { embedParaphrase, embedE5Short } from './infer.js';
import { pairs, calibrate, evaluate } from './core.js';

async function readRows(filename) {
  const rows = (await readFile(new URL(filename, import.meta.url), 'utf8')).trim().split(/\r?\n/u).map(line => JSON.parse(line));
  return rows.map(row => ({ ...row, eventKey: row.eventKey ?? row.topicLabel }));
}

const calibration = [...await readRows('../multilingual-authored-v2/chunk-a/records.jsonl'), ...await readRows('../multilingual-authored-v2/chunk-b/records.jsonl')];
const development = [...await readRows('../multilingual-authored-v2/chunk-c1/records.jsonl'), ...await readRows('../multilingual-authored-v2/chunk-c2/records.jsonl'), ...await readRows('../multilingual-authored-v2/chunk-c3/records.jsonl')];
const reusedHoldout = await readRows('../multilingual-holdout-v6/holdout.jsonl');
const all = [...calibration, ...development, ...reusedHoldout];
if (new Set(all.map(row => row.id)).size !== all.length) throw new Error('Duplicate synthetic IDs');
const output = { input: 'normalized body prefix', calibration: 'A+B reused; floor selected at 98% pair precision',
  heldoutStatus: 'C and v6 have prior research exposure; model comparison only, not independent validation', methods: {} };
const methods = process.argv.includes('--short-control') ? [['raw-E5-128-control', embedE5Short]] :
  [['raw-E5-512', rows => embedDocuments(rows, 'body')], ['raw-E5-128-control', embedE5Short], ['paraphrase-MiniLM-128', embedParaphrase]];
for (const [name, embed] of methods) {
  process.stdout.write(`${JSON.stringify({ stage: 'embedding', method: name, rows: all.length })}\n`);
  const result = await embed(all);
  const threshold = calibrate(pairs(calibration, result.vectors));
  output.methods[name] = { inferenceMs: result.elapsedMs, calibration: evaluate(calibration, pairs(calibration, result.vectors), threshold),
    development: evaluate(development, pairs(development, result.vectors), threshold), reusedHoldout: evaluate(reusedHoldout, pairs(reusedHoldout, result.vectors), threshold) };
}
process.stdout.write(`${JSON.stringify(output)}\n`);
