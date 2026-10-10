// Explicit owner-local installer. Never prints source text, vectors or parameters.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, parseCorpus, safeDiagnostic, selectEventDisjoint } from '../real-event-eval/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { splitTrainEvents, omitConflictingInputs, fitDiagonal } from '../real-diagonal-adapter-v1/core.js';
import { makeDiagonalAdapter, readDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const OUTPUT = path.resolve(ROOT, 'apps/local-service/data/diagonal-adapter-v1.json');
const CORPUS_SHA = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const CORPUS_BYTES = 14_972_999;
const reviewedPath = path.resolve(ROOT, 'apps/local-service/experiments/topic-encoder/real-diagonal-body-transfer-v1/reviewed-source-sha256.json');
const REVIEWED_SHA = '596f3a6ac8a29552d9ad542ca7c95d9ba205a41e1a7bb0e4c1005e9bc03ebd0b';
const sourceNames = [
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-event-eval/core.js',
  'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.js',
  'apps/local-service/experiments/topic-encoder/e5-infer.js',
  'spikes/topic-resolution/browser/embedding/embedding-contract.js',
  'spikes/topic-resolution/harness/deny-external-capabilities.js',
  'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (phase, code) => { throw new EvalError(phase, code); };

async function verifySources() {
  const reviewedBytes = await readFile(reviewedPath);
  if (sha(reviewedBytes) !== REVIEWED_SHA) fail('source', 'REVIEWED_MANIFEST_MISMATCH');
  const reviewed = JSON.parse(reviewedBytes.toString('utf8'));
  for (const name of sourceNames) {
    const filename = path.join(ROOT, name);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || sha(await readFile(filename)) !== reviewed[name])
      fail('source', 'REVIEWED_SOURCE_MISMATCH');
  }
}

async function verifiedPrivateCorpus(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input)) fail('path', 'ABSOLUTE_PATH_REQUIRED');
  const [directory, info, root, file, repo] = await Promise.all([
    lstat(privateDir), lstat(input), realpath(privateDir), realpath(input), realpath(ROOT),
  ]);
  if (!directory.isDirectory() || directory.isSymbolicLink() || !info.isFile() ||
      info.isSymbolicLink() || info.size !== CORPUS_BYTES || !privateScopeAllowed(repo, root, file))
    fail('path', 'PRIVATE_INPUT_SCOPE');
  const bytes = await readFile(input);
  if (bytes.length !== CORPUS_BYTES || sha(bytes) !== CORPUS_SHA) fail('input', 'PRIVATE_CORPUS_DIGEST');
  return bytes;
}

async function verifyOutput(output) {
  if (!path.isAbsolute(output) || path.resolve(output) !== OUTPUT) fail('output', 'OUTPUT_PATH');
  const directory = path.dirname(output);
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(directory)) !== directory)
    fail('output', 'OUTPUT_DIRECTORY_REPARSE');
  try { await lstat(output); fail('output', 'OUTPUT_EXISTS'); }
  catch (error) { if (error instanceof EvalError) throw error; if (error.code !== 'ENOENT') throw error; }
}

export async function install({ privateDir, input, output }) {
  await verifyOutput(output);
  await verifySources();
  const corpus = parseCorpus(await verifiedPrivateCorpus(privateDir, input));
  if (corpus.inputSha256 !== CORPUS_SHA) fail('input', 'PRIVATE_CORPUS_DIGEST');
  const selection = selectEventDisjoint(corpus.documents);
  const train = selection.documents.filter(row => row.split === 'train');
  if (selection.documents.length !== 1192 || train.length !== 749 ||
      selection.documents.filter(row => row.split === 'validation').length !== 150 ||
      selection.documents.filter(row => row.split === 'test').length !== 293)
    fail('selection', 'SPLIT_MISMATCH');
  const { fit, calibration } = splitTrainEvents(train);
  const clean = new Set(omitConflictingInputs(train).rows.map(row => row.id));
  const fitting = fit.filter(row => clean.has(row.id));
  if (fit.length !== 475 || fitting.length !== 475 || calibration.length !== 274)
    fail('selection', 'FIT_CALIBRATION_MISMATCH');
  const { embedDocuments } = await import('../e5-infer.js');
  const embedded = await embedDocuments(fitting.map(row => ({ id: row.id, title: row.title, body: row.lead })), 'title-lead');
  if (embedded.vectors.size !== 475) fail('model', 'VECTOR_COUNT');
  const trained = fitDiagonal(fitting, embedded.vectors);
  if (trained.steps !== 40) fail('fit', 'TRAINING_PROTOCOL');
  const manifest = readDiagonalAdapter(makeDiagonalAdapter(trained.parameters,
    { triplets: trained.triplets, tokenizerSha256: embedded.assets.tokenizerSha256 }));
  // The long fit can outlive the first path check. Repeat it immediately before
  // exclusive creation. Then resolve the newly opened file before any write.
  await verifyOutput(output);
  const handle = await open(output, 'wx', 0o600);
  try {
    const [opened, parent, file] = await Promise.all([
      handle.stat(), realpath(path.dirname(output)), realpath(output),
    ]);
    if (!opened.isFile() || path.resolve(parent) !== path.dirname(OUTPUT) ||
        path.resolve(file) !== OUTPUT) fail('output', 'OUTPUT_PATH_CHANGED');
    await handle.writeFile(`${JSON.stringify(manifest)}\n`, 'utf8');
    await handle.sync();
  }
  finally { await handle.close(); }
  return { schema: manifest.schema, modelId: manifest.modelId,
    modelSha256: manifest.modelSha256, fitProtocolSha256: manifest.fitProtocolSha256,
    privateCorpusSha256: manifest.privateCorpusSha256, manifestSha256: manifest.manifestSha256,
    fitArticles: manifest.fitArticles, steps: manifest.steps, triplets: manifest.triplets,
    weightsSaved: true, activated: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--private-dir' || args[2] !== '--input' || args[4] !== '--output') {
    process.stderr.write(`${JSON.stringify({ error: { phase: 'arguments', code: 'EXPECTED_PRIVATE_DIR_INPUT_OUTPUT' } })}\n`);
    process.exitCode = 1;
  } else {
    install({ privateDir: args[1], input: args[3], output: args[5] })
      .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(error => { process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`); process.exitCode = 1; });
  }
}
