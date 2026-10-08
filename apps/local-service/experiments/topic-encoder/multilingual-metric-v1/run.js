// Reproducible offline development run; never reads the sealed holdout.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluate, focusInput, normalize, trainMetric, transform,
  validateSplits, zeroFalseCutoff } from './core.js';

const SHA = {
  train: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  validation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53',
};

async function readSplit(name) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${name}.jsonl`, import.meta.url));
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== SHA[name]) throw new Error(`${name} digest mismatch`);
  return bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  const train = await readSplit('train'), validation = await readSplit('validation');
  validateSplits(train, validation);
  const input = [...train, ...validation].map(focusInput);
  const embedded = await embedDocuments(input, 'title-lead');
  const raw = new Map([...embedded.vectors].map(([id, vector]) => [id, normalize(vector)]));
  const weights = trainMetric(train, raw);
  const learned = new Map([...raw].map(([id, vector]) => [id, transform(vector, weights)]));
  const rawCutoff = zeroFalseCutoff(train, raw);
  const learnedCutoff = zeroFalseCutoff(train, learned);
  const artifact = { kind: 'offline-multilingual-diagonal-metric-v1',
    baseModelSha256: embedded.assets.modelSha256,
    tokenizerSha256: embedded.assets.tokenizerSha256,
    corpusTrainSha256: SHA.train,
    input: 'NFKC title plus 384 normalized lead characters, E5 title-lead',
    dimensions: 384, weights: Array.from(weights) };
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact)}\n`);
  await writeFile(new URL('./model.generated.json', import.meta.url), artifactBytes);
  const output = { corpusSha256: SHA, modelSha256: embedded.assets.modelSha256,
    tokenizerSha256: embedded.assets.tokenizerSha256,
    leadCharacters: 384, dimensions: 384, metric: 'regularized positive diagonal',
    training: { epochs: 120, rate: 0.06, regularization: 0.12, margin: 0.08 },
    weights: { min: Math.min(...weights), max: Math.max(...weights),
      l2FromIdentity: Math.hypot(...weights.map(w => w - 1)),
      sha256Float64LE: (() => {
        const data = Buffer.alloc(weights.length * 8);
        weights.forEach((value, i) => data.writeDoubleLE(value, i * 8));
        return createHash('sha256').update(data).digest('hex');
      })(), artifactSha256: createHash('sha256').update(artifactBytes).digest('hex') },
    cutoffsFromTrain: { raw: rawCutoff, learned: learnedCutoff },
    train: { raw: evaluate(train, raw, rawCutoff), learned: evaluate(train, learned, learnedCutoff) },
    validation: { raw: evaluate(validation, raw, rawCutoff),
      learned: evaluate(validation, learned, learnedCutoff) } };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
