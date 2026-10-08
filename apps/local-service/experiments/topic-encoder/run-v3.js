// Predeclared five-way shadow comparison on a separately generated third set.
import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { trainingCorpus, validateTrainingCorpus } from './data/train.js';
import { holdoutV3, validateHoldoutV3 } from './data/holdout-v3.js';
import { embedDocuments } from './e5-infer.js';
import { projectTopicVector, trainTopicHead } from './model.js';
import { encodeFusedTopic, trainFusedTopicEncoder } from './fused.js';
import { score as hybridScore } from './hybrid.js';
import { evaluatePairScores, zeroFalseJoinThreshold } from './benchmark-v2.js';

const EXPECTED_TRAIN = 'a64accfe78405af4508d0612aef565bd07373b1005f1688796f9fc7f5eb945d1';
const EXPECTED_HOLDOUT = '382bcc715cebcbe37b80d86e79db5e09dcabc61c7526faf1e0abd6824af63d9a';

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function cosine(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  validateTrainingCorpus(trainingCorpus);
  validateHoldoutV3(holdoutV3);
  if (digest(trainingCorpus) !== EXPECTED_TRAIN || digest(holdoutV3) !== EXPECTED_HOLDOUT)
    throw new Error('Corpus changed after freeze');
  const trainFamilies = new Set(trainingCorpus.split.training);
  const validationFamilies = new Set(trainingCorpus.split.validation);
  // The independent author used distinct test-only key names. Adapt labels for
  // evaluation; embedDocuments and encodeFusedTopic read only title/body.
  const heldOut = holdoutV3.documents.map(document => ({ ...document,
    family: document.familyId, topicLabel: document.topicId, viewpoint: document.perspective }));
  const heldOutFamilies = new Set(heldOut.map(document => document.family));
  if ([...trainFamilies, ...validationFamilies].some(family => heldOutFamilies.has(family)))
    throw new Error('Topic-family leakage');
  const documents = [...trainingCorpus.documents, ...heldOut];
  if (new Set(documents.map(document => document.id)).size !== documents.length)
    throw new Error('Document ID leakage');
  const { vectors, elapsedMs, assets } = await embedDocuments(documents);
  const train = trainingCorpus.documents.filter(document => trainFamilies.has(document.family));
  const validation = trainingCorpus.documents.filter(document => validationFamilies.has(document.family));
  const trainingStarted = performance.now();
  const topicHead = trainTopicHead(train, vectors, validation, vectors);
  const fusedHead = trainFusedTopicEncoder(train, vectors, validation, vectors);
  const trainingMs = performance.now() - trainingStarted;
  const fusedVectors = new Map(documents.map(document => [document.id,
    encodeFusedTopic(document, vectors.get(document.id), fusedHead)]));
  const comparisons = [
    ['rawE5', vectors, (_a, av, _b, bv) => cosine(av, bv)],
    ['learnedE5Head', vectors, (_a, av, _b, bv) =>
      cosine(projectTopicVector(av, topicHead), projectTopicVector(bv, topicHead))],
    ['fusedOneVector', fusedVectors, (_a, av, _b, bv) => cosine(av, bv)],
    ['titleOnlyHybrid', vectors, (a, av, b, bv) =>
      hybridScore({ title: a.title }, av, { title: b.title }, bv)],
    ['titleAndLeadHybridUpperBound', vectors, (a, av, b, bv) => hybridScore(a, av, b, bv)],
  ];
  const results = {};
  for (const [name, map, scorer] of comparisons) {
    const selection = zeroFalseJoinThreshold(validation, map, scorer);
    results[name] = { validation: selection,
      heldOut: evaluatePairScores(heldOut, map, scorer, selection.threshold) };
  }
  process.stdout.write(`${JSON.stringify({ schema: 'topic-encoder-third-independent-shadow/v1',
    trainDigest: EXPECTED_TRAIN, holdoutDigest: EXPECTED_HOLDOUT,
    provenance: 'invented synthetic English text only; no owner DB/provider/download/network',
    assets, input: 'packaged E5 query-prefixed body prefix',
    documents: { training: train.length, validation: validation.length, holdout: heldOut.length },
    models: { lowRank: { schema: topicHead.schema, parameters: topicHead.factors.length,
      float32Bytes: topicHead.factors.length * 4, bestEpoch: topicHead.bestEpoch },
    fused: { schema: fusedHead.schema, dimensions: fusedHead.dimensions,
      float32VectorBytes: fusedHead.dimensions * 4, sparseShare: fusedHead.sparseShare,
      titleWeight: fusedHead.titleWeight, candidateCount: fusedHead.candidateCount } },
    timingMs: { e5AllDocuments: elapsedMs, experimentalTraining: trainingMs }, results }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`Offline third Topic benchmark failed: ${error.message}\n`);
  process.exitCode = 1;
});
