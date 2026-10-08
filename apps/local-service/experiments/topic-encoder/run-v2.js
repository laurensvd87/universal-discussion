// Independent second synthetic holdout. Offline shadow only; no service DB.
import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { trainingCorpus, validateTrainingCorpus } from './data/train.js';
import { holdoutV2, validateHoldoutV2 } from './data/holdout-v2.js';
import { embedDocuments } from './e5-infer.js';
import { projectTopicVector, trainTopicHead } from './model.js';
import { score as hybridScore } from './hybrid.js';
import { evaluatePairScores, zeroFalseJoinThreshold } from './benchmark-v2.js';

const EXPECTED_TRAIN = 'a64accfe78405af4508d0612aef565bd07373b1005f1688796f9fc7f5eb945d1';
const EXPECTED_HOLDOUT = '90e6530f68cd3517c5a7d5a294f651d3d21017f59644de3b85eaea96cac6d96e';

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function cosine(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  validateTrainingCorpus(trainingCorpus);
  validateHoldoutV2(holdoutV2.documents);
  if (digest(trainingCorpus) !== EXPECTED_TRAIN || digest(holdoutV2) !== EXPECTED_HOLDOUT)
    throw new Error('Corpus changed after freeze');
  const trainFamilies = new Set(trainingCorpus.split.training);
  const validationFamilies = new Set(trainingCorpus.split.validation);
  const holdoutFamilies = new Set(holdoutV2.documents.map(document => document.family));
  if ([...trainFamilies, ...validationFamilies].some(family => holdoutFamilies.has(family)))
    throw new Error('Topic-family leakage');
  const documents = [...trainingCorpus.documents, ...holdoutV2.documents];
  if (new Set(documents.map(document => document.id)).size !== documents.length)
    throw new Error('Document ID leakage');
  const { vectors, elapsedMs, assets } = await embedDocuments(documents);
  const train = trainingCorpus.documents.filter(document => trainFamilies.has(document.family));
  const validation = trainingCorpus.documents.filter(document => validationFamilies.has(document.family));
  const started = performance.now();
  const head = trainTopicHead(train, vectors, validation, vectors);
  const trainMs = performance.now() - started;
  const raw = (_a, av, _b, bv) => cosine(av, bv);
  const learned = (_a, av, _b, bv) => cosine(projectTopicVector(av, head), projectTopicVector(bv, head));
  const hybrid = (a, av, b, bv) => hybridScore(a, av, b, bv);
  const scorers = { rawE5: raw, topicHead: learned, textCueHybrid: hybrid };
  const results = {};
  for (const [name, scorer] of Object.entries(scorers)) {
    const selection = zeroFalseJoinThreshold(validation, vectors, scorer);
    results[name] = {
      validation: selection,
      heldOut: evaluatePairScores(holdoutV2.documents, vectors, scorer, selection.threshold),
    };
  }
  process.stdout.write(`${JSON.stringify({ schema: 'topic-encoder-independent-shadow/v1',
    trainDigest: EXPECTED_TRAIN, holdoutDigest: EXPECTED_HOLDOUT,
    provenance: 'invented synthetic English text only; no owner DB, provider, download or network',
    assets, input: 'packaged E5 query-prefixed body prefix',
    documents: { training: train.length, validation: validation.length, holdout: holdoutV2.documents.length },
    model: { schema: head.schema, rank: head.rank, parameters: head.factors.length,
      float32Bytes: head.factors.length * 4, bestEpoch: head.bestEpoch,
      epochsRun: head.epochsRun, trainTriplets: head.trainingTriplets,
      validationTriplets: head.validationTriplets, identityValidationLoss: head.identityValidationLoss,
      selectedValidationLoss: head.validationLoss },
    timingMs: { e5AllDocuments: elapsedMs, headTraining: trainMs }, results }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`Offline independent Topic benchmark failed: ${error.message}\n`);
  process.exitCode = 1;
});
