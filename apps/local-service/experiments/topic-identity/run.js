// No acquisition path, listener, owner input, arbitrary path or input argument.
import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { corpus } from './corpus.js';
import { digest, validateCorpus, inputFor, MODES, RULE, THRESHOLDS, evaluate } from './evaluate.js';
import { readAssetManifest, prefixTokenInput, poolHidden, ORT_VERSION, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

export const EXPECTED_CORPUS_DIGEST = '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';
const root = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(root,'../../../..','spikes/topic-resolution/browser/embedding/.assets');
async function boundedFile(filename, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('Invalid fixed experiment file');
  const bytes = await readFile(filename);
  if (bytes.length > maximum) throw new Error('Experiment file exceeds bound');
  return bytes;
}
async function main() {
  if (process.argv.length !== 2) throw new Error('No experiment arguments are accepted');
  validateCorpus(corpus);
  if (digest(corpus) !== EXPECTED_CORPUS_DIGEST) throw new Error('Frozen corpus mismatch');
  const target = path.join(root,'results.json');
  try { await lstat(target); throw new Error('Report already exists; retain or review it before another run'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = readAssetManifest(JSON.parse(await boundedFile(path.join(assetRoot,'manifest.json'),16384)));
  const verified = new Map();
  for (const [filename,spec] of manifest) {
    const bytes = await boundedFile(path.join(assetRoot,filename),spec.bytes);
    if (bytes.length !== spec.bytes || createHash('sha256').update(bytes).digest('hex') !== spec.sha256) throw new Error('Packaged asset integrity mismatch');
    verified.set(filename,bytes);
  }
  const { Tokenizer } = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  const ort = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) throw new Error('Packaged runtime version mismatch');
  const tokenJson = JSON.parse(verified.get('tokenizer.json'));
  const config = JSON.parse(verified.get('config.json'));
  if (tokenJson.truncation !== null || tokenJson.padding !== null || config.hidden_size !== 384 || config.model_type !== 'bert') throw new Error('Packaged configuration mismatch');
  const tokenizer = new Tokenizer(tokenJson, JSON.parse(verified.get('tokenizer_config.json')));
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = { mjs: new URL('../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',import.meta.url).href };
  ort.env.wasm.wasmBinary = verified.get('ort-wasm-simd-threaded.wasm');
  const start = performance.now();
  const session = await ort.InferenceSession.create(verified.get('model.onnx'), {
    executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
  });
  if ([...session.inputNames].sort().join() !== 'attention_mask,input_ids,token_type_ids' || !session.outputNames.includes('last_hidden_state')) throw new Error('Packaged graph mismatch');
  const report = { schema: 'topic-identity-report/v1', corpusDigest: EXPECTED_CORPUS_DIGEST,
    evidence: '32 invented documents; whole-family held-out evaluation; synthetic engineering evidence only',
    provenance: { node: process.version, runtime: ORT_VERSION, execution: 'Node CPU WASM; production packaged graph/tokenizer/truncation/pooling; browser lifecycle not exercised', modelSha256: MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA256 },
    rules: { ...RULE, thresholds: THRESHOLDS }, loadMs: performance.now()-start, modes: {} };
  try {
    for (const mode of MODES) {
      const vectors = {}, timings = [], tokens = [];
      for (const document of corpus.documents) {
        const began = performance.now();
        const encoded = prefixTokenInput(tokenizer,inputFor(document,mode));
        const feeds = {};
        for (const name of session.inputNames) {
          const values = name === 'input_ids' ? encoded.ids : encoded[name];
          feeds[name] = new ort.Tensor('int64',BigInt64Array.from(values,BigInt),[1,encoded.ids.length]);
        }
        const result = await session.run(feeds);
        vectors[document.id] = poolHidden(result.last_hidden_state,encoded.attention_mask);
        timings.push(performance.now()-began); tokens.push(encoded.ids.length);
      }
      report.modes[mode] = { ...evaluate(corpus,vectors), measurements: { totalInferenceMs: timings.reduce((a,b)=>a+b,0), maxTokens: Math.max(...tokens) } };
      process.stdout.write(JSON.stringify({ progress: mode, completedDocuments: corpus.documents.length })+'\n');
    }
  } finally { await session.release(); }
  report.elapsedMs = performance.now()-start;
  // Fixed generated synthetic report contains pair scores and IDs, never vectors.
  await writeFile(target,JSON.stringify(report,null,2)+'\n',{ flag: 'wx' });
  const summary = Object.fromEntries(Object.entries(report.modes).map(([mode,data])=>[mode, {
    developmentPositive:data.development.positive, developmentHardNegative:data.development.hardNegative,
    heldOutPositive:data.heldOut.positive, heldOutHardNegative:data.heldOut.hardNegative,
    heldOutRecallAt1:data.heldOut.recallAt1, heldOutRecallAt5:data.heldOut.recallAt5,
    selectedThreshold:data.selectedThreshold, heldOutSelected:data.heldOutSelected,
    baselineSequential:data.baselineSequential, selectedSequential:data.selectedSequential,
  }]));
  process.stdout.write(JSON.stringify({ corpusDigest:EXPECTED_CORPUS_DIGEST, report:'results.json', summary })+'\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error=>{
  process.stderr.write(`Synthetic experiment failed: ${error.message}\n`); process.exitCode=1;
});
