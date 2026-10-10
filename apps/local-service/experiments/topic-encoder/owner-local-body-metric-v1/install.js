// CODE ONLY until lead/Trust review. Explicit local command; no provider/network,
// SQLite access, downloads, text/vector persistence or runtime activation.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents, omitConflictingInputs } from '../real-diagonal-adapter-v1/core.js';
import { covarianceFit, makeMetric } from '../topic-metric-rethink-v1/core.js';
import { BODY_METRIC_CORPUS_SHA256, BODY_METRIC_FIT_SHA256, BODY_METRIC_MAX_BYTES,
  loadBodyTopicMetric, makeBodyTopicMetric } from '../../../src/domain/body-topic-metric.js';
import { MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const PRIVATE_DIRECTORY = path.join(os.tmpdir(), 'udl-globesumm-research-20261008');
const PRIVATE_INPUT = path.join(PRIVATE_DIRECTORY, 'news_only.json');
const CORPUS_BYTES = 14_972_999;
const OUTPUT = path.join(ROOT, 'apps/local-service/data/body-topic-metric-v1.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('BODY_METRIC_INSTALL_FAILED'); };
const SOURCES = {
  'apps/local-service/experiments/topic-encoder/topic-metric-rethink-v1/core.js': BODY_METRIC_FIT_SHA256,
  'apps/local-service/experiments/topic-encoder/topic-metric-rethink-v1/freeze.json': '5f0b9bed8f04a5a45552cc82d19a2858fba28d0781de97d098866092de553d9b',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.js': '6c01b5c9562e7784ca59811610e6dbce4bffc817ef5668a4b7afe0f0a93b35d0',
  'apps/local-service/experiments/topic-encoder/real-event-eval/core.js': '4c5e4d1b1e9f543b6ab837e4467e18b3ce5b5c4a0b14172699ef355eaca3496c',
  'apps/local-service/experiments/topic-encoder/e5-infer.js': '4292c83b462d8fa1bd109e6b94f575c52d13a9a89717cad64a1f8300a5208a17',
  'spikes/topic-resolution/browser/embedding/embedding-contract.js': '6b26cc2766acdbcba39259d1459e703995c3b5ae5a6fd4a4c78b7a968d0b3920',
  'spikes/topic-resolution/harness/deny-external-capabilities.js': 'b37675f06d3d7961f2498d663189120302263cf2bba0b79cb3668892a4ef92cc',
};

async function verifySources() {
  for (const [name, expected] of Object.entries(SOURCES)) {
    const filename = path.join(ROOT, name), info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024 ||
        sha(await readFile(filename)) !== expected) fail();
  }
  // Fixed local data directory is already ignored by the tracked service rule.
  if ((await readFile(path.join(ROOT, 'apps/local-service/.gitignore'), 'utf8')).trim() !== 'data/') fail();
}

async function verifyParent() {
  const directory = path.dirname(OUTPUT), info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(directory)) !== directory) fail();
}

async function existingArtifact() {
  await verifyParent();
  try { await lstat(OUTPUT); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  // Existing corrupt artifact fails closed; the installer never repairs/overwrites.
  return loadBodyTopicMetric(OUTPUT);
}

async function corpusBytes() {
  const directory = await lstat(PRIVATE_DIRECTORY), info = await lstat(PRIVATE_INPUT);
  if (!directory.isDirectory() || directory.isSymbolicLink() || !info.isFile() ||
      info.isSymbolicLink() || info.size !== CORPUS_BYTES ||
      path.resolve(await realpath(PRIVATE_DIRECTORY)) !== path.resolve(PRIVATE_DIRECTORY) ||
      path.resolve(await realpath(PRIVATE_INPUT)) !== path.resolve(PRIVATE_INPUT)) fail();
  const relative = path.relative(ROOT, PRIVATE_DIRECTORY);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) fail();
  const handle = await open(PRIVATE_INPUT, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== CORPUS_BYTES || opened.dev !== info.dev || opened.ino !== info.ino) fail();
    const bytes = Buffer.alloc(CORPUS_BYTES + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await handle.read(bytes, count, bytes.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    const final = await handle.stat();
    if (count !== CORPUS_BYTES || final.size !== CORPUS_BYTES || final.mtimeMs !== opened.mtimeMs ||
        final.ctimeMs !== opened.ctimeMs || sha(bytes.subarray(0, count)) !== BODY_METRIC_CORPUS_SHA256) fail();
    return bytes.subarray(0, count);
  } finally { await handle.close(); }
}

const summary = (artifact, created) => ({ schema: artifact.schema, selected: artifact.selected,
  manifestSha256: artifact.manifestSha256, fitArticles: artifact.fitArticles,
  weightsSaved: true, created, activated: false });

export async function installBodyTopicMetric() {
  await verifySources();
  const existing = await existingArtifact();
  if (existing) return summary(existing, false);
  const bytes = await corpusBytes();
  const short = parseCorpus(bytes).documents;
  const body = new Map(parseCorpus(bytes, { leadCharacters: 4096 }).documents.map(row => [row.id, row]));
  const selection = selectEventDisjoint(short), train = selection.documents.filter(row => row.split === 'train');
  if (selection.documents.length !== 1192 || train.length !== 749 ||
      selection.documents.filter(row => row.split === 'validation').length !== 150 ||
      selection.documents.filter(row => row.split === 'test').length !== 293) fail();
  const { fit, calibration } = splitTrainEvents(train);
  const clean = new Set(omitConflictingInputs(train).rows.map(row => row.id));
  const fitting = fit.filter(row => clean.has(row.id));
  if (fit.length !== 475 || fitting.length !== 475 || calibration.length !== 274) fail();
  const { embedDocuments } = await import('../e5-infer.js');
  const vectors = new Map();
  let assets;
  // Same 64-report chunking and BODY-only inputs as the frozen experiment.
  for (let i = 0; i < fitting.length; i += 64) {
    const rows = fitting.slice(i, i + 64).map(row => {
      const source = body.get(row.id);
      if (!source) fail();
      return { id: source.id, title: source.title, body: source.body ?? source.lead };
    });
    const embedded = await embedDocuments(rows, 'body');
    if (embedded.assets.modelSha256 !== MODEL_SHA256 || embedded.assets.tokenizerSha256 !== TOKENIZER_SHA256 ||
        embedded.vectors.size !== rows.length || rows.some(row => !embedded.vectors.has(row.id))) fail();
    assets = embedded.assets;
    for (const [id, vector] of embedded.vectors) {
      if (vectors.has(id)) fail();
      vectors.set(id, vector);
    }
  }
  if (vectors.size !== 475) fail();
  const fitted = makeMetric(covarianceFit(fitting, vectors), 'within-shrink-50');
  const artifact = makeBodyTopicMetric({ mean: fitted.mean, lower: fitted.lower },
    { modelSha256: assets.modelSha256, tokenizerSha256: assets.tokenizerSha256 });
  const serialized = `${JSON.stringify(artifact)}\n`;
  if (Buffer.byteLength(serialized) > BODY_METRIC_MAX_BYTES) fail();
  await verifySources();
  const appeared = await existingArtifact();
  if (appeared) return summary(appeared, false);
  const handle = await open(OUTPUT, 'wx', 0o600);
  try {
    const info = await handle.stat();
    if (!info.isFile() || path.resolve(await realpath(OUTPUT)) !== OUTPUT) fail();
    await verifyParent();
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  const verified = await loadBodyTopicMetric(OUTPUT);
  if (verified.manifestSha256 !== artifact.manifestSha256) fail();
  return summary(verified, true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write('{"error":"BODY_METRIC_INSTALL_ARGUMENTS"}\n'); process.exitCode = 1;
  } else {
    installBodyTopicMetric().then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(() => { process.stderr.write('{"error":"BODY_METRIC_INSTALL_FAILED"}\n'); process.exitCode = 1; });
  }
}
