import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents } from '../real-diagonal-adapter-v1/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { selectFreshRethink } from '../topic-metric-rethink-v1/core.js';
import { embedDocuments } from '../e5-infer.js';
import { embedParaphrase } from './infer.js';
import { pairs, calibrate, evaluate } from './core.js';

const sha = data => createHash('sha256').update(data).digest('hex');
const corpusSha = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const filename = path.join(os.tmpdir(), 'udl-globesumm-research-20261008', 'news_only.json');
async function embed(rows, method) {
  const vectors = new Map();
  for (let offset = 0; offset < rows.length; offset += 64) {
    const result = await method(rows.slice(offset, offset + 64).map(row => ({ ...row, body: row.lead })));
    for (const [id, vector] of result.vectors) vectors.set(id, vector);
    process.stderr.write(`${JSON.stringify({ progress: 'embedding', rows: Math.min(offset + 64, rows.length), total: rows.length })}\n`);
  }
  return vectors;
}
async function main() {
  const fresh = process.argv.includes('--fresh');
  const expected = process.argv.includes('--freeze-hash') ? process.argv[process.argv.indexOf('--freeze-hash') + 1] : null;
  if (fresh && !/^[a-f0-9]{64}$/u.test(expected ?? '')) throw new Error('FREEZE_REQUIRED');
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== 14_972_999) throw new Error('PRIVATE_FILE');
  const bytes = await readFile(filename); if (sha(bytes) !== corpusSha) throw new Error('CORPUS_SHA');
  const short = parseCorpus(bytes).documents, body = parseCorpus(bytes, { leadCharacters: 4096 }).documents;
  const byId = new Map(body.map(row => [row.id, row]));
  const original = selectEventDisjoint(short), preliminary = selectEventDisjoint(short, 300);
  const { calibration } = splitTrainEvents(original.documents.filter(row => row.split === 'train'));
  const dev = original.documents.filter(row => row.split === 'validation');
  if (calibration.length !== 274 || dev.length !== 150) throw new Error('CALIBRATION_SPLIT');
  const sourceNames = ['core.js', 'core.test.js', 'infer.js', 'real-transfer.js', 'README.md',
    '../topic-metric-rethink-v1/core.js', '../real-event-eval/core.js', '../real-diagonal-adapter-v1/core.js',
    '../real-diagonal-fresh-v1/core.js', '../real-diagonal-body-transfer-v1/core.js', '../e5-infer.js'];
  const sources = {};
  for (const name of sourceNames) sources[name] = sha(await readFile(new URL(name, import.meta.url)));
  const methods = [['raw-E5-body-512', rows => embedDocuments(rows, 'body')], ['paraphrase-MiniLM-body-128', embedParaphrase]];
  const cutoffs = {}, development = {};
  for (const [name, infer] of methods) {
    process.stderr.write(`${JSON.stringify({ stage: 'calibration', method: name })}\n`);
    const cal = await embed(calibration.map(row => byId.get(row.id)), infer);
    cutoffs[name] = calibrate(pairs(calibration, cal));
    const vectors = await embed(dev.map(row => byId.get(row.id)), infer);
    development[name] = evaluate(dev, pairs(dev, vectors), cutoffs[name]);
  }
  const freeze = { sources, corpusSha, cutoffs, calibrationRows: 274, developmentRows: 150,
    comparison: 'separate calibrated >=98% pair precision floors; strongest-edge complete-link',
    sourceSelection: 'shared whole-event metric-rethink-v1 300 cohort; old four exposed cohorts excluded' };
  const freezeHash = sha(JSON.stringify(freeze));
  const result = { researchOnly: true, freeze, freezeHash, development, developmentReused: true, weightsSaved: false, vectorsSaved: false, activated: false };
  process.stdout.write(`${JSON.stringify({ checkpoint: 'development', freezeHash, cutoffs, methods: development })}\n`);
  if (fresh) {
    if (freezeHash !== expected) throw new Error('FREEZE_MISMATCH');
    const priorFresh = selectFreshEvents(short, original.documents, preliminary.documents);
    const bodyPrior = selectBodyTransferEvents(short, original.documents, preliminary.documents, priorFresh.documents);
    const cohort = selectFreshRethink(short, [original.documents, preliminary.documents, priorFresh.documents, bodyPrior.documents]);
    const rows = cohort.documents; result.test = { rows: rows.length, events: cohort.events, methods: {} };
    for (const [name, infer] of methods) {
      const vectors = await embed(rows.map(row => byId.get(row.id)), infer);
      result.test.methods[name] = evaluate(rows, pairs(rows, vectors), cutoffs[name]);
    }
  }
  result.caveats = ['same-corpus-not-independent-publishers', 'no-real-opposing-viewpoint-gold', 'body-prefix-not-Chrome-capture',
    'pair-precision-on-calibration-not-confidence-bound', 'complete-link-policy-not-live-planner', 'new-encoder-needs-new-vectors', 'no-product-or-rights-clearance'];
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
main().catch(() => { process.stderr.write('{"error":"PARAPHRASE_TRANSFER_FAILED"}\n'); process.exitCode = 1; });
