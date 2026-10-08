// One-shot sealed synthetic holdout. Never writes model weights or the owner DB.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { trainingCorpus } from '../data/train.js';
import { embedDocuments } from '../e5-infer.js';
import { splits } from '../next-data/corpus.js';
import { encodePage } from '../next-model/model.js';
import { encodeLearnedPage } from '../next-model/learned.js';
import { evaluateVectors, strictValidationThreshold } from './metrics.js';
import { evaluateMutualMargin, mutualMarginPairs, strictValidationMargin } from './mutual.js';

const HOLDOUT_DIGEST = '0b12b1cd12a1c691796d6a3870fc8829f300998aeb3fd901ce8d229815a93336';
const MODEL_DIGEST = 'f5f046c6f447dc2d3ebd680bd9131fa421d03a5338698ca4a0e43dbfb3857b5d';
const digest = value => createHash('sha256').update(value).digest('hex');

function compact(result) {
  const { insertionOrders, ...rest } = result;
  return { ...rest, insertionOrders };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  if (digest(JSON.stringify(splits.holdout)) !== HOLDOUT_DIGEST)
    throw new Error('Sealed holdout changed');
  const artifactText = await readFile(new URL('../next-model/model.generated.json', import.meta.url), 'utf8');
  if (digest(artifactText) !== MODEL_DIGEST) throw new Error('Candidate changed after freeze');
  const artifact = JSON.parse(artifactText);
  const adapt = doc => ({ id: doc.id, family: doc.family, topicLabel: doc.topicId,
    viewpoint: doc.stance, title: doc.title, body: doc.body });
  const oldValidationFamilies = new Set(trainingCorpus.split.validation);
  const validation = [...trainingCorpus.documents.filter(d => oldValidationFamilies.has(d.family)),
    ...splits.validation.map(adapt)];
  const holdout = splits.holdout.map(adapt);
  if (new Set([...validation, ...holdout].map(d => d.id)).size !== validation.length + holdout.length ||
      holdout.some(d => validation.some(v => v.family === d.family)))
    throw new Error('Holdout leaks into validation');
  const all = [...validation, ...holdout];
  const { vectors: bodyVectors, assets } = await embedDocuments(all, 'body');
  const { vectors: titleLeadVectors } = await embedDocuments(all, 'title-lead');
  if (assets.modelSha256 !== artifact.baseModelSha256) throw new Error('Base encoder mismatch');
  const methods = {
    'raw-e5-body': bodyVectors,
    'raw-e5-title-lead': titleLeadVectors,
    'frozen-heuristic': new Map(all.map(d => [d.id, encodePage(d, bodyVectors.get(d.id), artifact.features)])),
    'frozen-learned': new Map(all.map(d => [d.id, encodeLearnedPage(d, bodyVectors.get(d.id), artifact)])),
  };
  const results = {};
  for (const [name, map] of Object.entries(methods)) {
    const threshold = strictValidationThreshold(validation, map);
    let mutual;
    try {
      const marginThreshold = strictValidationMargin(validation, map);
      const holdoutIds = new Set(holdout.map(d => d.id));
      const combinedPairs = mutualMarginPairs(all, map).filter(pair =>
        holdoutIds.has(pair.left) && holdoutIds.has(pair.right));
      const combinedAccepted = combinedPairs.filter(pair => pair.margin >= marginThreshold);
      mutual = { validation: evaluateMutualMargin(validation, map, marginThreshold),
        holdout: evaluateMutualMargin(holdout, map, marginThreshold),
        combinedGalleryHoldout: { candidatePairs: combinedPairs.length,
          correct: combinedAccepted.filter(pair => pair.positive).length,
          falseJoins: combinedAccepted.filter(pair => !pair.positive).length } };
    } catch (error) {
      if (error.message !== 'Validation has no mutual hard/negative pair to calibrate') throw error;
      mutual = { unavailable: 'validation had no negative mutual-neighbor candidate' };
    }
    results[name] = { validation: compact(evaluateVectors(validation, map, threshold)),
      holdout: compact(evaluateVectors(holdout, map, threshold)), mutual };
  }
  process.stdout.write(`${JSON.stringify({ holdoutDigest: HOLDOUT_DIGEST,
    artifactDigest: MODEL_DIGEST, validationDocuments: validation.length,
    sealedHoldoutDocuments: holdout.length, results }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
