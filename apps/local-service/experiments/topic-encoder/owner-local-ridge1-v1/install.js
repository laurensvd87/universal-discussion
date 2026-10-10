// Owner-local one-shot installer. Review before executing; never run from tests.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents, omitConflictingInputs, normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { pairedStatistics, fitRidge } from '../teacher-distillation-v1/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { embedDocuments } from '../e5-infer.js';
import { embedParaphrase } from '../compact-paraphrase-probe-v1/infer.js';
import { checkedUnit } from '../ridge1-practical-evaluation-v1/planner.js';
import { makeRidgeTopicAdapter, readRidgeTopicAdapter, RIDGE_PARAMETER_SHA256,
  RIDGE_TOPIC_MAX_BYTES } from '../../../src/domain/ridge-topic-adapter.js';
import { LOCAL_RIDGE_ADAPTER_PATH } from '../../../src/application/owner-topic-configuration.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PRIVATE_DIRECTORY = path.join(os.tmpdir(), 'udl-globesumm-research-20261008');
const TEACHER_DIRECTORY = path.join(os.tmpdir(), 'udl-paraphrase-research-20261010');
const CORPUS = path.join(PRIVATE_DIRECTORY, 'news_only.json');
const FREEZE = new URL('../ridge1-practical-evaluation-v1/freeze.json', import.meta.url);
const FREEZE_SHA = '2bef154d291cc8c77ddca5ad22974840a9affed53766559458110c7a5a863945';
const CORPUS_SHA = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('INSTALL_CONTRACT'); };

async function pinnedFile(filename, maximum, hash, exactSize = null) {
  const target = path.resolve(filename instanceof URL ? fileURLToPath(filename) : filename);
  const initial = await lstat(target);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size < 1 || initial.size > maximum ||
      exactSize !== null && initial.size !== exactSize || path.resolve(await realpath(target)) !== target) fail();
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== initial.dev || opened.ino !== initial.ino ||
        opened.size !== initial.size || path.resolve(await realpath(target)) !== target) fail();
    const buffer = Buffer.alloc(maximum + 1); let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    const final = await handle.stat();
    if (used !== initial.size || used > maximum || final.dev !== opened.dev || final.ino !== opened.ino ||
        final.size !== opened.size || final.mtimeMs !== opened.mtimeMs || final.ctimeMs !== opened.ctimeMs ||
        path.resolve(await realpath(target)) !== target) fail();
    const data = buffer.subarray(0, used);
    if (hash !== null && sha(data) !== hash) fail();
    return data;
  } finally { await handle.close(); }
}
async function externalDirectory(directory) {
  const [resolved, root, info] = await Promise.all([realpath(directory), realpath(ROOT), lstat(directory)]);
  const relative = path.relative(root, resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || !relative.startsWith('..') && !path.isAbsolute(relative)) fail();
  return { resolved, root };
}
async function verifyDependencies(descriptor) {
  // The fitted map is reproducible only against this exact closed fit machinery.
  for (const name of ['../teacher-distillation-v1/core.js', '../e5-infer.js',
    '../compact-paraphrase-probe-v1/infer.js', '../real-event-eval/core.js',
    '../real-diagonal-adapter-v1/core.js', '../synthetic-to-globesumm-v1/scope.js',
    '../topic-metric-rethink-v1/core.js', '../compact-paraphrase-probe-v1/core.js',
    '../real-diagonal-holdout-v1/core.js', 'planner.js',
    '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js']) {
    const filename = new URL(name, FREEZE);
    await pinnedFile(filename, 256 * 1024, descriptor.sources[name]);
  }
}
async function fitRows(descriptor) {
  const { resolved: directory, root } = await externalDirectory(PRIVATE_DIRECTORY);
  const filename = await realpath(CORPUS);
  if (!privateScopeAllowed(root, directory, filename)) fail();
  const bytes = await pinnedFile(CORPUS, 14972999, CORPUS_SHA, 14972999);
  const short = parseCorpus(bytes).documents, bodies = parseCorpus(bytes, { leadCharacters: 4096 }).documents;
  const byId = new Map(bodies.map(row => [row.id, { ...row, body: row.lead }]));
  const originalTrain = selectEventDisjoint(short).documents.filter(row => row.split === 'train');
  const clean = new Set(omitConflictingInputs(originalTrain).rows.map(row => row.id));
  const selected = splitTrainEvents(originalTrain).fit.filter(row => clean.has(row.id));
  if (selected.length !== 475 || sha(JSON.stringify(selected.map(row => [row.id, row.eventKey]))) !==
      descriptor.cohorts.fit.selectionSha256) fail();
  return selected.map(row => byId.get(row.id));
}
async function verifyAssets(descriptor) {
  const { resolved: directory } = await externalDirectory(TEACHER_DIRECTORY);
  const verified = new Map();
  for (const [name, spec] of Object.entries(descriptor.assets.teacher.files)) {
    if (!['model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json', 'sentence_bert_config.json'].includes(name)) fail();
    verified.set(name, await pinnedFile(path.join(directory, name), spec.bytes, spec.sha256, spec.bytes));
  }
  if (verified.size !== 5) fail();
  const config = JSON.parse(verified.get('config.json'));
  const sentence = JSON.parse(verified.get('sentence_bert_config.json'));
  if (config.hidden_size !== 384 || config.auto_map || sentence.max_seq_length !== 128) fail();
  await pinnedFile(new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json', import.meta.url),
    16_384, descriptor.assets.packagedE5ManifestSha256);
}
async function embedFit(rows, method) {
  const vectors = new Map();
  for (let offset = 0; offset < rows.length; offset += 64) {
    const batch = rows.slice(offset, offset + 64), result = await method(batch);
    for (const [id, vector] of result.vectors) {
      checkedUnit(vector);
      vectors.set(id, vector);
    }
  }
  if (vectors.size !== rows.length) fail();
  // Match the frozen practical run's guardMap: validate all raw inference
  // vectors, then normalize the complete 475-row map before pairedStatistics.
  for (const row of rows) checkedUnit(vectors.get(row.id));
  return normalizeVectors(rows, vectors);
}
async function verifyOutputParent() {
  const data = path.resolve(ROOT, 'apps/local-service/data');
  const target = path.resolve(LOCAL_RIDGE_ADAPTER_PATH);
  if (target !== path.join(data, 'ridge1-topic-adapter-v1.json')) fail();
  const info = await lstat(data);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(data)) !== data) fail();
  const ignore = await pinnedFile(path.resolve(ROOT, 'apps/local-service/.gitignore'), 1024, null);
  if (ignore.toString('utf8').trim() !== 'data/') fail();
}
async function main() {
  if (process.argv.length !== 2) fail();
  const frozen = JSON.parse(await pinnedFile(FREEZE, 64 * 1024, null));
  if (frozen.freezeHash !== FREEZE_SHA || sha(JSON.stringify(frozen.descriptor)) !== FREEZE_SHA ||
      frozen.descriptor.expectedRidge1ParameterSha256 !== RIDGE_PARAMETER_SHA256 ||
      frozen.descriptor.corpusSha256 !== CORPUS_SHA || frozen.descriptor.lambda !== 1) fail();
  await verifyDependencies(frozen.descriptor);
  await verifyAssets(frozen.descriptor);
  await verifyOutputParent();
  const rows = await fitRows(frozen.descriptor);
  const source = await embedFit(rows, async batch => {
    await pinnedFile(new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json', import.meta.url),
      16_384, frozen.descriptor.assets.packagedE5ManifestSha256);
    return embedDocuments(batch, 'body');
  });
  const teacher = await embedFit(rows, async batch => {
    // The frozen helper opens assets by pathname and validates model/tokenizer
    // bytes itself. Bracket its call with independent FD-safe exact receipts.
    await verifyAssets(frozen.descriptor);
    const result = await embedParaphrase(batch);
    await verifyAssets(frozen.descriptor);
    return result;
  });
  const model = fitRidge(pairedStatistics(rows, source, teacher), 1);
  if (sha(JSON.stringify([Array.from(model.weights), Array.from(model.meanX), Array.from(model.meanY)])) !==
      RIDGE_PARAMETER_SHA256) fail();
  const artifact = readRidgeTopicAdapter(makeRidgeTopicAdapter({ weights: Array.from(model.weights),
    meanX: Array.from(model.meanX), meanY: Array.from(model.meanY) }),
  { expectedParameterSha256: RIDGE_PARAMETER_SHA256 });
  const output = JSON.stringify(artifact);
  if (Buffer.byteLength(output, 'utf8') > RIDGE_TOPIC_MAX_BYTES) fail();
  await verifyDependencies(frozen.descriptor);
  await verifyOutputParent();
  const handle = await open(LOCAL_RIDGE_ADAPTER_PATH, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  let verified = false, created = null;
  try {
    created = await handle.stat();
    if (!created.isFile() || path.resolve(await realpath(LOCAL_RIDGE_ADAPTER_PATH)) !==
        path.resolve(LOCAL_RIDGE_ADAPTER_PATH)) fail();
    await verifyOutputParent();
    await handle.writeFile(output, 'utf8'); await handle.sync();
    await handle.close();
    const checked = await pinnedFile(LOCAL_RIDGE_ADAPTER_PATH, RIDGE_TOPIC_MAX_BYTES, sha(output),
      Buffer.byteLength(output, 'utf8'));
    const installed = readRidgeTopicAdapter(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(checked)),
      { expectedParameterSha256: RIDGE_PARAMETER_SHA256 });
    if (installed.manifestSha256 !== artifact.manifestSha256) fail();
    verified = true;
  } finally {
    await handle.close().catch(() => {});
    if (!verified) {
      const current = await lstat(LOCAL_RIDGE_ADAPTER_PATH).catch(() => null);
      if (created && current?.dev === created.dev && current?.ino === created.ino) await unlink(LOCAL_RIDGE_ADAPTER_PATH);
    }
  }
  process.stdout.write(JSON.stringify({ stage: 'installed', parameterSha256: RIDGE_PARAMETER_SHA256,
    manifestSha256: artifact.manifestSha256, fitArticles: 475 }) + '\n');
}
main().catch(() => { process.stderr.write('RIDGE1_INSTALL_CONTRACT_FAILURE\n'); process.exitCode = 1; });
