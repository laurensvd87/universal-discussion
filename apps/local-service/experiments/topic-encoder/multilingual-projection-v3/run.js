import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { project as v2Project } from '../multilingual-projection-v2/core.js';
import { checkTrain, checkValidation, cutoff, evaluate, focusInput, normalize,
  project, STRENGTHS, SAFETY_GAP, trainProjection } from './core.js';

const SHA = {
  v1Train: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  v2Part1: '94a14a36b016795b504e22be9c5c3e1aadb372bdd6d013b9b791e09ac5d81254',
  v2Part2: '7240a9848cee76a2857a737740e4f280f9a9cd7c15d1b38689c9246ff2160db6',
  v1Validation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53',
  // Independently authored and frozen after the training rule above.
  v2Validation: 'ef9f405df2f8c98054e4f5b465f4fec3d06287d537e9a08be3455ce36d35db99',
  v2Artifact: '78d2f22b2d3ba0bcce6c3439601f40cee70ea8069be6575c468daeebf1cafa63',
};
const URLS = {
  v1Train: '../multilingual-train-v1/train.jsonl',
  v2Part1: '../multilingual-train-v2/train-part-1.jsonl',
  v2Part2: '../multilingual-train-v2/train-part-2.jsonl',
  v1Validation: '../multilingual-train-v1/validation.jsonl',
  v2Validation: '../multilingual-train-v2/validation.jsonl',
  v2Artifact: '../multilingual-projection-v2/model.generated.json',
};
async function checkedBytes(key) {
  const bytes = await readFile(new URL(URLS[key], import.meta.url));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== SHA[key]) throw new Error(`${key} hash mismatch`);
  return bytes;
}
async function records(key) {
  return (await checkedBytes(key)).toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse);
}
const transformed = (raw, fn) => new Map([...raw].map(([id, x]) => [id, fn(x)]));

async function main() {
  const trainOnly = process.argv.length === 3 && process.argv[2] === '--train-only';
  if (!trainOnly && process.argv.length !== 2) throw new Error('Only --train-only is supported');
  if (!trainOnly && !SHA.v2Validation) throw new Error('Fresh validation hash is not yet frozen');
  const v1Train = await records('v1Train');
  const train = [...v1Train, ...await records('v2Part1'), ...await records('v2Part2')];
  checkTrain(train);
  const v1Validation = trainOnly ? [] : await records('v1Validation');
  const v2Validation = trainOnly ? [] : await records('v2Validation');
  if (!trainOnly) {
    checkValidation(v1Validation, train, 40);
    checkValidation(v2Validation, train, 60);
    if (new Set(v1Validation.map(x => x.family)).size === 0) throw new Error('Empty validation');
  }
  const embedded = await embedDocuments([...train, ...v1Validation, ...v2Validation].map(focusInput), 'title-lead');
  const raw = new Map([...embedded.vectors].map(([id, v]) => [id, normalize(v)]));
  const model = trainProjection(train, raw);
  const v2Artifact = JSON.parse((await checkedBytes('v2Artifact')).toString('utf8'));
  const v2Model = { axes: v2Artifact.axes, values: v2Artifact.eigenvalues };
  const old = transformed(raw, x => v2Project(x, v2Model, v2Artifact.strength));
  const candidates = STRENGTHS.map(strength => {
    const vectors = transformed(raw, x => project(x, model, strength));
    const threshold = cutoff(train, vectors, SAFETY_GAP);
    return { strength, vectors, threshold, score: evaluate(train, vectors, threshold) };
  });
  candidates.sort((a, b) => b.score.pairs.tp - a.score.pairs.tp || a.strength - b.strength);
  const selected = candidates[0];
  const thresholds = { raw: cutoff(v1Train, raw), v2: cutoff(v1Train, old), v3: selected.threshold };
  const artifact = { kind: 'offline-multilingual-hard-contrastive-projection-v3',
    input: 'NFKC title plus 384 normalized lead characters, packaged E5 title-lead',
    trainSha256: { v1: SHA.v1Train, v2Part1: SHA.v2Part1, v2Part2: SHA.v2Part2 },
    baseModelSha256: embedded.assets.modelSha256, tokenizerSha256: embedded.assets.tokenizerSha256,
    dimensions: 384, rank: model.axes.length, safetyGap: SAFETY_GAP,
    strength: selected.strength, threshold: selected.threshold,
    axes: model.axes.map(x => Array.from(x)), eigenvalues: model.eigenvalues };
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact)}\n`);
  await writeFile(new URL('./model.generated.json', import.meta.url), artifactBytes);
  const score = rows => ({ raw: evaluate(rows, raw, thresholds.raw),
    v2: evaluate(rows, old, thresholds.v2), v3: evaluate(rows, selected.vectors, thresholds.v3) });
  const output = { sha256: SHA, modelSha256: embedded.assets.modelSha256,
    tokenizerSha256: embedded.assets.tokenizerSha256,
    artifactBytes: artifactBytes.length,
    artifactSha256: createHash('sha256').update(artifactBytes).digest('hex'),
    candidateTraining: candidates.map(x => ({ strength: x.strength,
      threshold: x.threshold, tp: x.score.pairs.tp, fp: x.score.pairs.fp,
      hardFp: x.score.pairs.hardFp })), thresholds, train: score(train) };
  if (!trainOnly) {
    output.v1Validation = score(v1Validation);
    output.v2Validation = score(v2Validation);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
