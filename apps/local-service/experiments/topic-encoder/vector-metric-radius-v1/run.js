import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents, omitConflictingInputs, transform, normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { covarianceFit, makeMetric, transformMetric, selectFreshRethink } from '../topic-metric-rethink-v1/core.js';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { embedDocuments } from '../e5-infer.js';
import { pairs, calibrate, evaluate } from '../compact-paraphrase-probe-v1/core.js';

const sha = data => createHash('sha256').update(data).digest('hex');
const corpusSha = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const filename = path.join(os.tmpdir(), 'udl-globesumm-research-20261008', 'news_only.json');
async function embed(rows) {
  const vectors = new Map();
  for (let offset = 0; offset < rows.length; offset += 64) {
    const result = await embedDocuments(rows.slice(offset, offset + 64).map(row => ({ ...row, body: row.lead })), 'body');
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
  const { fit, calibration } = splitTrainEvents(original.documents.filter(row => row.split === 'train'));
  const clean = new Set(omitConflictingInputs(original.documents.filter(row => row.split === 'train')).rows.map(row => row.id));
  const fitting = fit.filter(row => clean.has(row.id));
  const dev = original.documents.filter(row => row.split === 'validation');
  if (fitting.length !== 475 || calibration.length !== 274 || dev.length !== 150) throw new Error('SPLIT');
  const adapter = await loadDiagonalAdapter(fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url)));
  const sourceNames = ['README.md', 'run.js', '../compact-paraphrase-probe-v1/core.js', '../topic-metric-rethink-v1/core.js',
    '../real-event-eval/core.js', '../real-diagonal-adapter-v1/core.js', '../real-diagonal-fresh-v1/core.js',
    '../real-diagonal-body-transfer-v1/core.js', '../e5-infer.js', '../../../src/domain/diagonal-adapter.js'];
  const sources = {}; for (const name of sourceNames) sources[name] = sha(await readFile(new URL(name, import.meta.url)));
  const fitVectors = await embed(fitting.map(row => byId.get(row.id)));
  const metric = makeMetric(covarianceFit(fitting, fitVectors), 'within-shrink-50');
  const representations = (rows, vectors) => new Map([
    ['raw-body-E5', normalizeVectors(rows, vectors)], ['current-diagonal', transform(rows, vectors, adapter.parameters)],
    ['within-shrink-50', transformMetric(rows, vectors, metric)],
  ]);
  const calVectors = await embed(calibration.map(row => byId.get(row.id))), devVectors = await embed(dev.map(row => byId.get(row.id)));
  const cutoffs = {}, development = {};
  for (const [name, vectors] of representations(calibration, calVectors)) cutoffs[name] = calibrate(pairs(calibration, vectors));
  for (const [name, vectors] of representations(dev, devVectors)) development[name] = evaluate(dev, pairs(dev, vectors), cutoffs[name]);
  const freeze = { sources, corpusSha, controlManifest: adapter.manifestSha256, selectedMetric: 'within-shrink-50', cutoffs,
    fittingRows: 475, calibrationRows: 274, developmentRows: 150, policy: '98%-pair-floor-complete-link' };
  const freezeHash = sha(JSON.stringify(freeze));
  const result = { researchOnly: true, freeze, freezeHash, development, developmentReused: true, weightsSaved: false, vectorsSaved: false, activated: false };
  process.stdout.write(`${JSON.stringify({ checkpoint: 'development', freezeHash, cutoffs, methods: development })}\n`);
  if (fresh) {
    if (freezeHash !== expected) throw new Error('FREEZE_MISMATCH');
    const prior = selectFreshEvents(short, original.documents, preliminary.documents);
    const bodyPrior = selectBodyTransferEvents(short, original.documents, preliminary.documents, prior.documents);
    const cohort = selectFreshRethink(short, [original.documents, preliminary.documents, prior.documents, bodyPrior.documents]);
    const rows = cohort.documents, vectors = await embed(rows.map(row => byId.get(row.id)));
    result.test = { rows: rows.length, events: cohort.events, methods: {} };
    for (const [name, values] of representations(rows, vectors)) result.test.methods[name] = evaluate(rows, pairs(rows, values), cutoffs[name]);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
main().catch(() => { process.stderr.write('{"error":"METRIC_RADIUS_FAILED"}\n'); process.exitCode = 1; });
