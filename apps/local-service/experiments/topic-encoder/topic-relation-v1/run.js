// Known v1/v2 development only. This script intentionally has no holdout path.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusInput } from '../multilingual-projection-v2/core.js';
import { scoreGroups } from '../adaptive-topic-graph-v1/core.js';
import { buildLexicon, fitModel, groupRows, makePairs, pairCounts } from './core.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const files = [
  ['v1', 'train', '../multilingual-train-v1/train.jsonl', '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b'],
  ['v1', 'validation', '../multilingual-train-v1/validation.jsonl', 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53'],
  ['v2', 'train', '../multilingual-train-v2/train-part-1.jsonl', '94a14a36b016795b504e22be9c5c3e1aadb372bdd6d013b9b791e09ac5d81254'],
  ['v2', 'train', '../multilingual-train-v2/train-part-2.jsonl', '7240a9848cee76a2857a737740e4f280f9a9cd7c15d1b38689c9246ff2160db6'],
  ['v2', 'validation', '../multilingual-train-v2/validation.jsonl', 'ef9f405df2f8c98054e4f5b465f4fec3d06287d537e9a08be3455ce36d35db99'],
];
const splits = { train: [], validation: [] };
for (const [version, split, filename, digest] of files) {
  const bytes = await readFile(new URL(filename, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Frozen corpus changed');
  for (const row of bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse))
    splits[split].push({ ...row, id: `${version}:${row.id}`,
      family: `${version}:${row.family}`, topicLabel: `${version}:${row.topicLabel}` });
}
for (const [name, rows] of Object.entries(splits)) if (rows.length !== (name === 'train' ? 200 : 100))
  throw new Error('Unexpected split size');
const started = performance.now();
const { vectors, elapsedMs, assets } = await embedDocuments([...splits.train, ...splits.validation].map(focusInput), 'title-lead');
const lexicon = buildLexicon(splits.train);
const train = makePairs(splits.train, vectors, lexicon);
const model = fitModel(train);
const scoredTrain = makePairs(splits.train, vectors, lexicon, model);
const scoredValidation = makePairs(splits.validation, vectors, lexicon, model);
// Strict pair calibration uses train negatives only. The small positive
// safety margin avoids using the single maximum as an exact float boundary.
const maxNegative = Math.max(...scoredTrain.filter(pair => !pair.positive).map(pair => pair.score));
const cutoffs = [maxNegative + 0.02, maxNegative + 0.10, maxNegative + 0.25];
const floors = [0.78, 0.82, 0.86];
const results = [];
for (const cutoff of cutoffs) for (const cosineFloor of floors) for (const floorGap of [0, 0.4]) {
  const rule = { cutoff, floor: cutoff - floorGap, cosineFloor };
  const trainGroups = groupRows(splits.train, scoredTrain, rule);
  const validationGroups = groupRows(splits.validation, scoredValidation, rule);
  results.push({ rule, trainPair: pairCounts(scoredTrain, cutoff, cosineFloor),
    validationPair: pairCounts(scoredValidation, cutoff, cosineFloor),
    trainTopic: scoreGroups(splits.train, trainGroups),
    validationTopic: scoreGroups(splits.validation, validationGroups) });
}
const eligible = results.filter(item => item.trainTopic.joinedFalse === 0 &&
  item.validationTopic.joinedFalse === 0 && item.trainPair.false === 0 && item.validationPair.false === 0)
  .sort((a, b) => b.validationTopic.joinedTrue - a.validationTopic.joinedTrue ||
    b.trainTopic.joinedTrue - a.trainTopic.joinedTrue || b.rule.cutoff - a.rule.cutoff);
const selected = eligible[0] ?? null;
// Frozen after the familiar development run. A later holdout must not select
// a fresh rule from its labels, or from this exploratory frontier again.
const frozenRule = { cutoff: 6.1505557310739345, floor: 6.1505557310739345, cosineFloor: 0.78 };
if (Math.abs(maxNegative + 0.10 - frozenRule.cutoff) > 1e-9 ||
    !selected || JSON.stringify(selected.rule) !== JSON.stringify(frozenRule))
  throw new Error('Frozen method no longer matches development selection');
// Separate retained-compatible ablation: body-only E5 matches the current
// representation, while the pair head sees retained title text only.
const titleTrain = splits.train.map(row => ({ ...row, body: '' }));
const titleValidation = splits.validation.map(row => ({ ...row, body: '' }));
const titleLexicon = buildLexicon(titleTrain);
const { vectors: bodyVectors, elapsedMs: bodyEmbeddingElapsedMs } =
  await embedDocuments([...splits.train, ...splits.validation], 'body');
const titleModel = fitModel(makePairs(titleTrain, bodyVectors, titleLexicon));
const titleTrainPairs = makePairs(titleTrain, bodyVectors, titleLexicon, titleModel);
const titleValidationPairs = makePairs(titleValidation, bodyVectors, titleLexicon, titleModel);
const titleMaxNegative = Math.max(...titleTrainPairs.filter(pair => !pair.positive).map(pair => pair.score));
const titleValidationMaxNegative = Math.max(...titleValidationPairs.filter(pair => !pair.positive).map(pair => pair.score));
const titleCutoff = 6.197572640918079;
if (Math.abs(Math.max(titleMaxNegative, titleValidationMaxNegative) + 0.10 - titleCutoff) > 1e-9)
  throw new Error('Frozen retained-compatible calibration changed');
const titleRule = { cutoff: titleCutoff, floor: titleCutoff, cosineFloor: 0.78 };
const retainedOnly = { rule: titleRule, model: titleModel,
  maxTrainNegative: titleMaxNegative, maxValidationNegative: titleValidationMaxNegative,
  trainPair: pairCounts(titleTrainPairs, titleRule.cutoff, titleRule.cosineFloor),
  validationPair: pairCounts(titleValidationPairs, titleRule.cutoff, titleRule.cosineFloor),
  trainTopic: scoreGroups(splits.train, groupRows(splits.train, titleTrainPairs, titleRule)),
  validationTopic: scoreGroups(splits.validation, groupRows(splits.validation, titleValidationPairs, titleRule)) };
const ranking = (pairs, referenceMaximum = maxNegative) => {
  const sorted = [...pairs].sort((a, b) => b.score - a.score);
  const positives = sorted.filter(pair => pair.positive).length;
  let tp = 0, fp = 0, area = 0;
  for (const pair of sorted) {
    if (pair.positive) { tp++; area += tp / (tp + fp); }
    else fp++;
  }
  const thresholds = [0.10, -1, -2, -3, -4].map(delta => referenceMaximum + delta);
  return { averagePrecision: area / positives,
    operatingPoints: thresholds.map(cutoff => ({ cutoff, ...pairCounts(pairs, cutoff) })) };
};
const nearest = rows => {
  const pool = rows === splits.train ? scoredTrain : scoredValidation;
  let found = 0, eligibleCount = 0;
  for (const row of rows) {
    const neighbors = pool.filter(pair => pair.a === row.id || pair.b === row.id)
      .sort((a, b) => b.features[0] - a.features[0]);
    if (neighbors.some(pair => pair.positive)) {
      eligibleCount++;
      if (neighbors.slice(0, 3).some(pair => pair.positive)) found++;
    }
  }
  return { found, eligible: eligibleCount };
};
const output = { corpus: { train: 200, validation: 100, sha256: Object.fromEntries(files.map(([, , name, hash]) => [name, hash])) },
  representation: 'packaged E5 title + 384-character lead; local train-fitted IDF lexical pair features',
  assets, elapsedMs: Math.round(performance.now() - started), embeddingElapsedMs: Math.round(elapsedMs),
  model: { mean: model.mean, scale: model.scale, weight: model.weight },
  maxTrainNegativeScore: maxNegative, candidateRetrievalTop3: { train: nearest(splits.train), validation: nearest(splits.validation) },
  selected, frozenRule, exploratoryRanking: { train: ranking(scoredTrain), validation: ranking(scoredValidation) },
  retainedOnly: { ...retainedOnly, bodyEmbeddingElapsedMs: Math.round(bodyEmbeddingElapsedMs),
    exploratoryRanking: { train: ranking(titleTrainPairs, titleMaxNegative), validation: ranking(titleValidationPairs, titleMaxNegative) } },
  tried: results.length,
  frontier: results.map(({ rule, trainPair, validationPair, trainTopic, validationTopic }) => ({ rule,
    trainPairTrue: trainPair.true, trainPairFalse: trainPair.false,
    validationPairTrue: validationPair.true, validationPairFalse: validationPair.false,
    trainTopicTrue: trainTopic.joinedTrue, trainTopicFalse: trainTopic.joinedFalse,
    validationTopicTrue: validationTopic.joinedTrue, validationTopicFalse: validationTopic.joinedFalse })) };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
