// Explicit owner-approved local model download; no article/provider transfer.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const MODEL_DIRECTORY = path.join(os.tmpdir(), 'udl-paraphrase-research-20261010');
export const MODEL_REVISION = 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42';
export const MODEL_SHA256 = '783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672';
const files = [
  ['onnx/model_qint8_avx512_vnni.onnx', 'model.onnx', 125_000_000, MODEL_SHA256],
  ['tokenizer.json', 'tokenizer.json', 20_000_000, '2c3387be76557bd40970cec13153b3bbf80407865484b209e655e5e4729076b8'],
  ['tokenizer_config.json', 'tokenizer_config.json', 32_768, '5036ea374ffedd706e3bef33e2e0d6953cb868ef8a490e76e32ba0faa37a6b9b'],
  ['config.json', 'config.json', 32_768, '6300193cb75e01cf80c96decef7187dfb33094d97cc1490b7ead6ff134476e4e'],
  ['sentence_bert_config.json', 'sentence_bert_config.json', 32_768, '70f4448f31320443fe3557cacea5abf2dcc4915dda8c80646bec9f3bb0aa5a1f'],
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

await mkdir(MODEL_DIRECTORY, { recursive: true });
const directoryInfo = await lstat(MODEL_DIRECTORY);
if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Invalid research directory');
const inventory = [];
for (const [remote, filename, maximum, expected] of files) {
  const target = path.join(MODEL_DIRECTORY, filename);
  let bytes;
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('Invalid research file');
    bytes = await readFile(target);
    if (expected && sha(bytes) !== expected) throw new Error('Research asset digest mismatch');
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (!bytes) {
    const response = await fetch(`https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/${MODEL_REVISION}/${remote}`, {
      credentials: 'omit', signal: AbortSignal.timeout(180_000), redirect: 'follow',
    });
    if (!response.ok || !response.body) throw new Error('Research download unavailable');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maximum) throw new Error('Research download exceeds bound');
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks, size);
    if (expected && sha(bytes) !== expected) throw new Error('Research model digest mismatch');
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  inventory.push({ filename, bytes: bytes.length, sha256: sha(bytes) });
}
process.stdout.write(`${JSON.stringify({ localResearchOnly: true, revision: MODEL_REVISION, inventory })}\n`);
