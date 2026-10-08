// Synthetic-only, offline shadow benchmark. Never opens the service database.
import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { trainingCorpus, validateTrainingCorpus } from './data/train.js';
import { holdout } from './data/holdout.js';
import { embedDocuments } from './e5-infer.js';
import { evaluateHoldout, validateHoldout } from './evaluation.js';
import { projectTopicVector, trainTopicHead } from './model.js';

// Fixed before the second independent holdout is embedded. The earlier
// template-rich revision had a preliminary measurement and is not a blind
// result for this frozen training version.
const EXPECTED_TRAINING_DIGEST = 'a64accfe78405af4508d0612aef565bd07373b1005f1688796f9fc7f5eb945d1';

function cosine(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

function chooseZeroFalseJoinThreshold(documents, vectors, map) {
  let maximumNegative = -1, positivePairs = 0;
  const rows = documents.map(document => ({ document, vector: map(vectors.get(document.id)) }));
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const score = cosine(rows[i].vector, rows[j].vector);
    if (rows[i].document.topicLabel === rows[j].document.topicLabel) positivePairs++;
    else maximumNegative = Math.max(maximumNegative, score);
  }
  if (!positivePairs || maximumNegative < -1 || maximumNegative >= 1) return null;
  const threshold = maximumNegative + 1e-6;
  const acceptedPositives = rows.reduce((sum, row, i) => sum + rows.slice(i + 1)
    .filter(other => row.document.topicLabel === other.document.topicLabel &&
      cosine(row.vector, other.vector) >= threshold).length, 0);
  return { threshold, acceptedPositives, positivePairs, maximumValidationNegative: maximumNegative };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  validateTrainingCorpus(trainingCorpus);
  validateHoldout(holdout);
  const trainingFamilies = new Set(trainingCorpus.split.training);
  const validationFamilies = new Set(trainingCorpus.split.validation);
  const holdoutFamilies = new Set(holdout.documents.map(document => document.family));
  if ([...trainingFamilies, ...validationFamilies].some(family => holdoutFamilies.has(family)))
    throw new Error('Holdout family leakage');
  const allDocuments = [...trainingCorpus.documents, ...holdout.documents];
  if (new Set(allDocuments.map(document => document.id)).size !== allDocuments.length)
    throw new Error('Document ID leakage');
  const trainingDigest = createHash('sha256').update(JSON.stringify(trainingCorpus)).digest('hex');
  if (trainingDigest !== EXPECTED_TRAINING_DIGEST) throw new Error('Training corpus changed after freeze');
  const { vectors, elapsedMs, assets } = await embedDocuments(allDocuments);
  const train = trainingCorpus.documents.filter(document => trainingFamilies.has(document.family));
  const validation = trainingCorpus.documents.filter(document => validationFamilies.has(document.family));
  const started = performance.now();
  const head = trainTopicHead(train, vectors, validation, vectors);
  const trainingMs = performance.now() - started;
  const baselineThreshold = chooseZeroFalseJoinThreshold(validation, vectors, vector => vector);
  const learnedThreshold = chooseZeroFalseJoinThreshold(validation, vectors, vector => projectTopicVector(vector, head));
  const holdoutVectors = Object.fromEntries(holdout.documents.map(document =>
    [document.id, vectors.get(document.id)]));
  const outcome = (map, selected) => ({
    all: evaluateHoldout({ vectors: holdoutVectors, vectorMap: map,
      ...(selected ? { threshold: selected.threshold } : {}) }),
    englishOnly: evaluateHoldout({ vectors: holdoutVectors, vectorMap: map, slice: 'fresh',
      ...(selected ? { threshold: selected.threshold } : {}) }),
    multilingualSmoke: evaluateHoldout({ vectors: holdoutVectors, vectorMap: map, slice: 'legacy',
      ...(selected ? { threshold: selected.threshold } : {}) }),
  });
  const report = {
    schema: 'synthetic-topic-head-shadow-report/v1', trainingDigest,
    holdoutDigest: outcome(vector => vector, null).all.holdoutDigest,
    provenance: 'project-created synthetic English training and synthetic held-out cases; no provider, DB or network',
    assets, input: 'production E5 body-prefix query; no title-only vector',
    documents: { training: train.length, validation: validation.length, holdout: holdout.documents.length },
    model: { schema: head.schema, rank: head.rank, parameters: head.factors.length,
      parameterFloat32Bytes: head.factors.length * 4, bestEpoch: head.bestEpoch,
      epochsRun: head.epochsRun, trainingTriplets: head.trainingTriplets,
      validationTriplets: head.validationTriplets, identityValidationLoss: head.identityValidationLoss,
      validationLoss: head.validationLoss },
    timing: { e5InferenceAllMs: elapsedMs, trainHeadMs: trainingMs },
    validationThreshold: { rawE5: baselineThreshold, topicHead: learnedThreshold },
    holdout: { rawE5: outcome(vector => vector, baselineThreshold),
      topicHead: outcome(vector => projectTopicVector(vector, head), learnedThreshold) },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`Offline Topic encoder failed: ${error.message}\n`);
  process.exitCode = 1;
});
