import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { corpus } from '../../topic-identity/corpus.js';
import { digest, validateCorpus, inputFor } from '../../topic-identity/evaluate.js';
import { evaluate, VARIANTS } from './scoring.js';
import { readAssetManifest, prefixTokenInput, poolHidden, ORT_VERSION, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const EXPECTED_CORPUS = '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';
const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, '../../../../../spikes/topic-resolution/browser/embedding/.assets');
async function boundedFile(filename, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('Invalid fixed asset');
  const bytes = await readFile(filename);
  if (bytes.length > maximum) throw new Error('Asset exceeds bound');
  return bytes;
}
async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  validateCorpus(corpus);
  if (digest(corpus) !== EXPECTED_CORPUS) throw new Error('Frozen corpus mismatch');
  const target = path.join(here, 'results-negation-amended.json');
  try { await lstat(target); throw new Error('Report already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = readAssetManifest(JSON.parse(await boundedFile(path.join(assetRoot,'manifest.json'),16384)));
  const verified = new Map();
  for (const [filename,spec] of manifest) {
    const bytes = await boundedFile(path.join(assetRoot,filename),spec.bytes);
    if (bytes.length !== spec.bytes || createHash('sha256').update(bytes).digest('hex') !== spec.sha256) throw new Error('Packaged asset integrity mismatch');
    verified.set(filename,bytes);
  }
  const { Tokenizer } = await import('../../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  const ort = await import('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) throw new Error('Runtime version mismatch');
  const tokenJson = JSON.parse(verified.get('tokenizer.json'));
  const config = JSON.parse(verified.get('config.json'));
  if (tokenJson.truncation !== null || tokenJson.padding !== null || config.hidden_size !== 384 || config.model_type !== 'bert') throw new Error('Packaged configuration mismatch');
  const tokenizer = new Tokenizer(tokenJson, JSON.parse(verified.get('tokenizer_config.json')));
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = { mjs: new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',import.meta.url).href };
  ort.env.wasm.wasmBinary = verified.get('ort-wasm-simd-threaded.wasm');
  const started = performance.now();
  const session = await ort.InferenceSession.create(verified.get('model.onnx'), {
    executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
  });
  if ([...session.inputNames].sort().join() !== 'attention_mask,input_ids,token_type_ids' || !session.outputNames.includes('last_hidden_state')) throw new Error('Packaged graph mismatch');
  const vectors = {};
  try {
    for (const document of corpus.documents) {
      const encoded = prefixTokenInput(tokenizer,inputFor(document,'body-prefix'));
      const feeds = {};
      for (const name of session.inputNames) {
        const values = name === 'input_ids' ? encoded.ids : encoded[name];
        feeds[name] = new ort.Tensor('int64',BigInt64Array.from(values,BigInt),[1,encoded.ids.length]);
      }
      const result = await session.run(feeds);
      vectors[document.id] = poolHidden(result.last_hidden_state,encoded.attention_mask);
    }
  } finally { await session.release(); }
  const similarities = {};
  for (let i=0;i<corpus.documents.length;i++) for (let j=i+1;j<corpus.documents.length;j++) {
    const a = corpus.documents[i].id, b = corpus.documents[j].id;
    similarities[[a,b].sort().join('|')] = vectors[a].reduce((n,v,k)=>n+v*vectors[b][k],0);
  }
  const report = {
    schema:'subject-rerank-report/v1', corpusDigest:EXPECTED_CORPUS,
    provenance:{ node:process.version, runtime:ORT_VERSION, modelSha256:MODEL_SHA256, tokenizerSha256:TOKENIZER_SHA256,
      execution:'Node CPU WASM; packaged body E5; synthetic only' },
    variants: VARIANTS, elapsedMs:performance.now()-started,
    evaluation:evaluate(corpus,similarities),
  };
  await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  process.stdout.write('Synthetic subject rerank report written; no vectors or text saved.\n');
}
main().catch(error=>{process.stderr.write(`Synthetic probe failed: ${error.message}\n`); process.exitCode=1;});
