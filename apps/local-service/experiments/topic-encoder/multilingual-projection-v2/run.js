import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { checkSplits, cutoff, evaluate, focusInput, normalize, project, trainProjection } from './core.js';

const sha = {
  train: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  validation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53',
};
async function split(name) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${name}.jsonl`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== sha[name]) throw new Error(`${name} hash mismatch`);
  return bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse);
}
async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  const train = await split('train'), validation = await split('validation');
  checkSplits(train, validation);
  const embedded = await embedDocuments([...train, ...validation].map(focusInput), 'title-lead');
  const raw = new Map([...embedded.vectors].map(([id, v]) => [id, normalize(v)]));
  const model = trainProjection(train, raw);
  const rawThreshold = cutoff(train, raw);
  const candidates = [0, 0.25, 0.5, 1, 2, 4];
  const trained = candidates.map(strength => {
    const vectors = new Map([...raw].map(([id, v]) => [id, project(v, model, strength)]));
    const threshold = cutoff(train, vectors);
    return { strength, vectors, threshold, trainScore: evaluate(train, vectors, threshold) };
  });
  // Select using TRAIN only; ties prefer the smaller departure from identity.
  trained.sort((a, b) => b.trainScore.pairs.tp - a.trainScore.pairs.tp || a.strength - b.strength);
  const selected = trained[0];
  const artifact = { kind: 'offline-multilingual-low-rank-residual-v2', dimensions: 384, rank: model.axes.length,
    input: 'NFKC title plus 384 normalized lead characters, packaged E5 title-lead',
    corpusTrainSha256: sha.train, baseModelSha256: embedded.assets.modelSha256,
    tokenizerSha256: embedded.assets.tokenizerSha256, strength: selected.strength,
    axes: model.axes.map(axis => Array.from(axis)), eigenvalues: model.values };
  const bytes = Buffer.from(`${JSON.stringify(artifact)}\n`);
  await writeFile(new URL('./model.generated.json', import.meta.url), bytes);
  const output = { inputSha256: sha, modelSha256: embedded.assets.modelSha256,
    tokenizerSha256: embedded.assets.tokenizerSha256, artifactBytes: bytes.length,
    artifactSha256: createHash('sha256').update(bytes).digest('hex'),
    rank: model.axes.length, selectedStrengthFromTrain: selected.strength,
    trainCandidates: trained.map(x => ({ strength: x.strength, cutoff: x.threshold,
      tp: x.trainScore.pairs.tp, fp: x.trainScore.pairs.fp })),
    cutoffFromTrain: { raw: rawThreshold, learned: selected.threshold },
    train: { raw: evaluate(train, raw, rawThreshold), learned: selected.trainScore },
    validation: { raw: evaluate(validation, raw, rawThreshold),
      learned: evaluate(validation, selected.vectors, selected.threshold) } };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
