// Fresh one-shot check of already-frozen vectors AND margin rule. Offline only.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { trainingCorpus } from '../data/train.js';
import { embedDocuments } from '../e5-infer.js';
import { splits } from '../next-data/corpus.js';
import { documents as challenge } from '../next-challenge/corpus.js';
import { encodePage } from '../next-model/model.js';
import { encodeLearnedPage } from '../next-model/learned.js';
import { evaluateVectors, strictValidationThreshold } from './metrics.js';
import { evaluateMutualMargin, strictValidationMargin } from './mutual.js';

const CHALLENGE_DIGEST = 'b120406f1405b0f2ed5e70ce667d733ce384206df51d9fb2cc49e89a825314e9';
const MODEL_DIGEST = 'f5f046c6f447dc2d3ebd680bd9131fa421d03a5338698ca4a0e43dbfb3857b5d';
const digest = value => createHash('sha256').update(value).digest('hex');

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  if (digest(JSON.stringify(challenge)) !== CHALLENGE_DIGEST) throw new Error('Challenge changed');
  const artifactText = await readFile(new URL('../next-model/model.generated.json', import.meta.url), 'utf8');
  if (digest(artifactText) !== MODEL_DIGEST) throw new Error('Model changed after freeze');
  const artifact = JSON.parse(artifactText);
  const oldValidationFamilies = new Set(trainingCorpus.split.validation);
  const validation = [...trainingCorpus.documents.filter(d => oldValidationFamilies.has(d.family)),
    ...splits.validation.map(d => ({ id:d.id, family:d.family, topicLabel:d.topicId,
      viewpoint:d.stance, title:d.title, body:d.body }))];
  if (challenge.length !== 95 || new Set(challenge.map(d => d.family)).size !== 19 ||
      challenge.some(d => validation.some(v => v.family === d.family || v.id === d.id)))
    throw new Error('Invalid challenge inventory or leakage');
  const all = [...validation, ...challenge];
  const { vectors: body, assets } = await embedDocuments(all, 'body');
  const { vectors: titleLead } = await embedDocuments(all, 'title-lead');
  if (assets.modelSha256 !== artifact.baseModelSha256) throw new Error('Base encoder mismatch');
  const methods = {
    'raw-e5-body': body,
    'raw-e5-title-lead': titleLead,
    'frozen-heuristic': new Map(all.map(d => [d.id, encodePage(d, body.get(d.id), artifact.features)])),
    'frozen-learned': new Map(all.map(d => [d.id, encodeLearnedPage(d, body.get(d.id), artifact)])),
  };
  const results = {};
  for (const [name, vectors] of Object.entries(methods)) {
    const cosineCutoff = strictValidationThreshold(validation, vectors);
    const challengeCosine = evaluateVectors(challenge, vectors, cosineCutoff);
    let margin;
    try {
      const marginCutoff = strictValidationMargin(validation, vectors);
      margin = { validation: evaluateMutualMargin(validation, vectors, marginCutoff),
        challenge: evaluateMutualMargin(challenge, vectors, marginCutoff) };
    } catch (error) {
      if (error.message !== 'Validation has no mutual hard/negative pair to calibrate') throw error;
      margin = { unavailable: 'No validation negative reciprocal pair' };
    }
    const { insertionOrders, ...cosine } = challengeCosine;
    results[name] = { cosine, insertionOrders, margin };
  }
  process.stdout.write(`${JSON.stringify({ challengeDigest: CHALLENGE_DIGEST,
    artifactDigest: MODEL_DIGEST, validationDocuments: validation.length,
    challengeDocuments: challenge.length, results }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
