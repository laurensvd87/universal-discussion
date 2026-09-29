// Explicit offline packaging of already-approved local assets. No acquisition,
// inference, remote imports or activation; importing this module performs no I/O.
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimentRoot, cacheRoot, INSTALLED_CAP, modelAssets, safePath, treeBytes,
  verifyFile, withAcquisitionLock } from '../../../apps/local-service/experiments/embeddings/src/acquire.js';
import { E5_REVISION, EXTRACTOR_VERSION, MODEL_ID, ORT_VERSION, TOKENIZER_VERSION,
  readAssetManifest } from '../browser/embedding/embedding-contract.js';

const browserRoot = fileURLToPath(new URL('../browser/', import.meta.url));
const assetRoot = path.join(browserRoot, 'embedding/.assets');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_ASSET_BYTES = 120 * 1024 * 1024;

export async function copyVerifiedAsset({ sourceRoot, outputRoot, source, filename, bytes, sha256 }) {
  if (!/^[A-Za-z0-9_.-]+$/u.test(filename) || !Number.isSafeInteger(bytes) || bytes < 1 ||
    bytes > MAX_ASSET_BYTES || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error('Invalid packaged asset specification');
  await safePath(source, { root: sourceRoot, allowMissing: false });
  await safePath(path.join(outputRoot, filename), { root: outputRoot });
  await verifyFile(source, { size: bytes, kind: 'sha256', hash: sha256 }, { root: sourceRoot });
  const target = path.join(outputRoot, filename);
  try {
    await lstat(target);
    await verifyFile(target, { size: bytes, kind: 'sha256', hash: sha256 }, { root: outputRoot });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(source, target, constants.COPYFILE_EXCL);
    await verifyFile(target, { size: bytes, kind: 'sha256', hash: sha256 }, { root: outputRoot });
  }
  return { filename, bytes, sha256 };
}

export function checkPackagingBudget(installedBytes, extensionBytes, additionalBytes) {
  for (const value of [installedBytes, extensionBytes, additionalBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid packaging footprint');
  }
  if (installedBytes + extensionBytes + additionalBytes > INSTALLED_CAP) throw new Error('Approved installed cap would be exceeded');
}

export async function packageBrowserEmbedding() {
  await safePath(assetRoot, { root: browserRoot });
  await mkdir(assetRoot, { recursive: true });
  const runtime = path.join(experimentRoot, 'runtime/node_modules');
  for (const [name, version] of [['@huggingface/tokenizers', TOKENIZER_VERSION], ['onnxruntime-web', ORT_VERSION]]) {
    const filename = path.join(runtime, name, 'package.json');
    await safePath(filename, { root: experimentRoot, allowMissing: false });
    const info = await lstat(filename);
    if (!info.isFile() || info.size > 65536) throw new Error('Invalid local runtime metadata');
    if (JSON.parse(await readFile(filename, 'utf8')).version !== version) throw new Error('Unapproved local browser runtime');
  }
  const selected = [];
  for (const [file, filename] of [['onnx/model_quantized.onnx', 'model.onnx'],
    ['tokenizer.json', 'tokenizer.json'], ['tokenizer_config.json', 'tokenizer_config.json'],
    ['config.json', 'config.json'], ['special_tokens_map.json', 'special_tokens_map.json']]) {
    const spec = modelAssets.find(item => item.target === `assets/e5/${file}`);
    if (!spec || spec.revision !== E5_REVISION) throw new Error('Pinned E5 asset unavailable');
    const source = path.join(cacheRoot, spec.target);
    const verified = await verifyFile(source, spec);
    selected.push({ source, filename, bytes: verified.bytes, sha256: verified.sha256 });
  }
  for (const [source, filename] of [
    [path.join(runtime, '@huggingface/tokenizers/dist/tokenizers.mjs'), 'tokenizers.mjs'],
    ...['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']
      .map(filename => [path.join(runtime, 'onnxruntime-web/dist', filename), filename]),
  ]) {
    await safePath(source, { root: experimentRoot, allowMissing: false });
    const info = await lstat(source);
    if (!info.isFile() || info.size < 1 || info.size > MAX_ASSET_BYTES) throw new Error('Invalid local runtime asset size');
    selected.push({ source, filename, bytes: info.size, sha256: sha(await readFile(source)) });
  }
  const manifest = { schema: 'browser-e5-assets/v1', modelId: MODEL_ID,
    extractorVersion: EXTRACTOR_VERSION, revision: E5_REVISION,
    tokenizerVersion: TOKENIZER_VERSION, ortVersion: ORT_VERSION,
    assets: selected.map(({ filename, bytes, sha256 }) => ({ filename, bytes, sha256 })) };
  readAssetManifest(manifest);
  let additional = 16384;
  for (const item of selected) {
    const target = await safePath(path.join(assetRoot, item.filename), { root: browserRoot });
    try { await lstat(target); }
    catch (error) { if (error.code !== 'ENOENT') throw error; additional += item.bytes; }
  }
  checkPackagingBudget(await treeBytes(experimentRoot), await treeBytes(browserRoot), additional);
  for (const item of selected) await copyVerifiedAsset({ sourceRoot: experimentRoot, outputRoot: assetRoot, ...item });
  const manifestPath = await safePath(path.join(assetRoot, 'manifest.json'), { root: browserRoot });
  const body = JSON.stringify(manifest, null, 2);
  try {
    await lstat(manifestPath);
    const info = await lstat(manifestPath);
    if (!info.isFile() || info.size > 16384 || await readFile(manifestPath, 'utf8') !== body) throw new Error('Existing packaged manifest mismatch');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(manifestPath, body, { flag: 'wx' });
  }
  const installedBytes = await treeBytes(experimentRoot) + await treeBytes(browserRoot);
  checkPackagingBudget(installedBytes, 0, 0);
  return { modelId: MODEL_ID, packagedBytes: selected.reduce((sum, item) => sum + item.bytes, Buffer.byteLength(body)),
    installedBytes, assets: manifest.assets.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withAcquisitionLock(packageBrowserEmbedding).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
