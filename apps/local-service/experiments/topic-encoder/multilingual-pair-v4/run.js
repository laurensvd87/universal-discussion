import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedDocuments } from '../e5-infer.js';
import { evidence, fit, metrics, pairs, score } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parent = path.resolve(here, '..');
const trainFiles = ['multilingual-train-v1/train.jsonl', 'multilingual-train-v2/train-part-1.jsonl', 'multilingual-train-v2/train-part-2.jsonl'];
const validationFile = 'multilingual-train-v2/validation.jsonl';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readRows = async file => (await readFile(path.join(parent, file), 'utf8')).trim().split(/\r?\n/u).map(JSON.parse);
const sourceHash = async () => sha(Buffer.concat(await Promise.all(['core.js', 'run.js'].map(async x => readFile(path.join(here, x))))));
const fileHash = async f => sha(await readFile(path.join(parent, f)));
function checkTrain(rows) {
  if (rows.length !== 200 || rows.some(x => x.split !== 'train') || new Set(rows.map(x => x.id)).size !== 200 ||
      new Set(rows.map(x => x.topicLabel)).size !== 40) throw new Error('Training corpus unexpected');
}
async function views(rows) {
  const focusInput = rows.map(x => ({ id: x.id, title: x.title, body: x.body.normalize('NFKC').replace(/\s+/gu, ' ').slice(0, 384) }));
  const titleInput = rows.map(x => ({ id: x.id, title: x.title, body: x.title }));
  const focus = await embedDocuments(focusInput, 'title-lead');
  const title = await embedDocuments(titleInput, 'body');
  return { focus: focus.vectors, title: title.vectors,
    evidence: new Map(rows.map(x => [x.id, evidence(x)])),
    assets: focus.assets, embeddingMs: focus.elapsedMs + title.elapsedMs };
}
function rawBaseline(all, feature) {
  const maxNegative = Math.max(...all.filter(p => !p.positive).map(p => p.f[feature]));
  const model = { bias: 0, weights: Array(6).fill(0), cutoff: maxNegative + 0.001 };
  model.weights[feature] = 1;
  return model;
}
function components(rows, all, model) {
  const parentMap = new Map(rows.map(x => [x.id, x.id]));
  const root = x => { while (parentMap.get(x) !== x) x = parentMap.get(x); return x; };
  for (const p of all) if (score(p.f, model) >= model.cutoff) parentMap.set(root(p.a), root(p.b));
  const groups = new Map();
  for (const row of rows) { const key = root(row.id); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const complete = new Set([...groups.values()].filter(g => g.length === 5 && new Set(g.map(x => x.topicLabel)).size === 1).map(g => g[0].topicLabel));
  return { groups: groups.size, impureGroups: [...groups.values()].filter(g => new Set(g.map(x => x.topicLabel)).size > 1).length,
    completeEvents: complete.size, possibleEvents: new Set(rows.map(x => x.topicLabel)).size };
}
const mode = process.argv[2];
if (!['train', 'validate'].includes(mode)) throw new Error('Use train or validate');
if (mode === 'train') {
  const rows = (await Promise.all(trainFiles.map(readRows))).flat(); checkTrain(rows);
  const v = await views(rows), all = pairs(rows, v), model = fit(all);
  const artifact = { kind: 'offline-multilingual-pair-v4', codeSha256: await sourceHash(),
    trainSha256: Object.fromEntries(await Promise.all(trainFiles.map(async f => [f, await fileHash(f)]))),
    validationSha256Expected: 'ef9f405df2f8c98054e4f5b465f4fec3d06287d537e9a08be3455ce36d35db99',
    assets: v.assets, features: ['focusCos', 'titleCos', 'numberOverlap', 'numberConflict', 'nameOverlap', 'nameConflict'],
    model, baselines: { focus: rawBaseline(all, 0), title: rawBaseline(all, 1) },
    train: { model: metrics(all, model), partitions: components(rows, all, model),
      focus: metrics(all, rawBaseline(all, 0)), title: metrics(all, rawBaseline(all, 1)) } };
  await writeFile(path.join(here, 'model.generated.json'), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ codeSha256: artifact.codeSha256, train: artifact.train, embeddingMs: v.embeddingMs }, null, 2));
} else {
  const artifact = JSON.parse(await readFile(path.join(here, 'model.generated.json'), 'utf8'));
  if (artifact.codeSha256 !== await sourceHash()) throw new Error('Code changed after training freeze');
  for (const [f, hash] of Object.entries(artifact.trainSha256)) if (await fileHash(f) !== hash) throw new Error('Training data changed');
  if (await fileHash(validationFile) !== artifact.validationSha256Expected) throw new Error('Validation digest mismatch');
  const rows = await readRows(validationFile);
  const trainFamilies = new Set((await Promise.all(trainFiles.map(readRows))).flat().map(x => x.family));
  if (rows.length !== 60 || rows.some(x => x.split !== 'validation') ||
      rows.some(x => trainFamilies.has(x.family))) throw new Error('Validation shape unexpected');
  const v = await views(rows), all = pairs(rows, v);
  if (JSON.stringify(v.assets) !== JSON.stringify(artifact.assets)) throw new Error('Assets changed');
  const result = { kind: artifact.kind, codeSha256: artifact.codeSha256, validationSha256: artifact.validationSha256Expected,
    model: metrics(all, artifact.model), partitions: components(rows, all, artifact.model),
    baselines: { focus: metrics(all, artifact.baselines.focus), title: metrics(all, artifact.baselines.title) },
    embeddingMs: v.embeddingMs };
  await writeFile(path.join(here, 'validation.generated.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
}
