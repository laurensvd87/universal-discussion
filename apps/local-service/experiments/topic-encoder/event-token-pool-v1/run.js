import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap } from '../offline-pair-verifier-v1/core.js';
import { validatePartition, verifyIsolation } from '../offline-pair-verifier-v3/adapter.js';
import { triangleOnly } from '../offline-pair-verifier-v5/core.js';
import { normalizedTokenMap, fitAttention, eventVectors, maxNegativeCutoff,
  retrievalRanks, cosine } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, '../multilingual-balanced-v1');
const HASHES = Object.freeze({
  train: '6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632',
  validation: '734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fail = code => { throw new TypeError(code); };

async function readPartition(name, count, families) {
  const bytes = await readFile(path.join(CORPUS, `${name}.jsonl`));
  if (sha(bytes) !== HASHES[name]) fail('DIGEST');
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
  return validatePartition(rows, name, count, families);
}

function familyPartition(train) {
  const families = [...new Set(train.map(doc => doc.categories[0]))]
    .sort((a, b) => {
      const left = sha(Buffer.from(a)), right = sha(Buffer.from(b));
      return left < right ? -1 : left > right ? 1 : 0;
    });
  if (families.length !== 8) fail('FAMILY_COUNT');
  const fitNames = new Set(families.slice(0, 6));
  const fit = train.filter(doc => fitNames.has(doc.categories[0]));
  const calibration = train.filter(doc => !fitNames.has(doc.categories[0]));
  if (fit.length !== 120 || calibration.length !== 40 ||
      new Set(fit.map(doc => doc.eventKey)).size !== 12 ||
      new Set(calibration.map(doc => doc.eventKey)).size !== 4)
    fail('FAMILY_SPLIT');
  return { fit, calibration };
}

function scorePolicy(documents, vectors, threshold) {
  if (threshold === null) return { abstained: true };
  const { researchScreen: ignored, ...aggregate } =
    triangleOnly(documents, vectors, cosine, threshold);
  return { abstained: false, ...aggregate };
}

function developmentScreen(policy) {
  if (policy.abstained) return { met: false, reason: 'CALIBRATION_ABSTAINED' };
  const d = policy.denominators, e = policy.edgeMetrics, c = policy.components;
  if (d.articles !== 40 || d.events !== 4 || d.families !== 2 ||
      d.truePairs !== 180 || d.falsePairs !== 600 || d.hardFalsePairs !== 200 ||
      d.crossLanguageTruePairs !== 160) fail('DENOMINATORS');
  return { requiredTrueEdges: 60, requiredCrossLanguageTrueEdges: 40,
    requiredCompleteEvents: 1, requiredFalseEdges: 0, requiredMixedGroups: 0,
    met: e.trueEdges >= 60 && e.crossLanguageTrueEdges >= 40 &&
      e.falseEdges === 0 && c.mixedGroups === 0 && c.completeEvents >= 1 };
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', corpusOpened: false,
      modelLoaded: false, holdoutOpened: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--development') fail('ARGUMENTS');
  const started = performance.now();
  const train = await readPartition('train', 160, 8);
  const validation = await readPartition('validation', 40, 2);
  verifyIsolation(train, validation);
  const { fit, calibration } = familyPartition(train);
  const { embedDocumentsWithTokens } = await import('../e5-infer.js');
  const documents = fit.concat(calibration, validation);
  const embedded = await embedDocumentsWithTokens(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const tokenMap = normalizedTokenMap(documents, embedded.tokenStates);
  const pooled = normalizeMap(documents, embedded.vectors);
  const trainingStarted = performance.now();
  const model = fitAttention(fit, pooled, tokenMap);
  if (model.triplets !== 120) fail('TRIPLET_COUNT');
  const trainingMs = Math.round(performance.now() - trainingStarted);
  const learnedCalibration = eventVectors(calibration, tokenMap, model.weights);
  const learnedValidation = eventVectors(validation, tokenMap, model.weights);
  const learnedCutoff = maxNegativeCutoff(calibration, learnedCalibration);
  const rawCutoff = maxNegativeCutoff(calibration, pooled);
  const learned = scorePolicy(validation, learnedValidation, learnedCutoff);
  const report = { mode: 'token-attention-development', researchOnly: true,
    representation: 'packaged-E5-title-plus-384-character-lead-first-64-content-token-states',
    corpusSha256: HASHES, modelSha256: embedded.assets.modelSha256,
    train: { fitArticles: fit.length, fitFamilies: 6, calibrationArticles: calibration.length,
      calibrationFamilies: 2, staticCrossLanguageTriplets: model.triplets,
      attentionSteps: model.steps },
    validation: { articles: 40, families: 2, developments: 4,
      learnedCutoff, rawCalibrationCutoff: rawCutoff,
      learnedRetrieval: retrievalRanks(validation, learnedValidation),
      rawRetrieval: retrievalRanks(validation, pooled),
      learnedTriangle: learned,
      rawFixed094Triangle: scorePolicy(validation, pooled, 0.94),
      rawCalibratedTriangle: scorePolicy(validation, pooled, rawCutoff),
      primaryScreen: developmentScreen(learned) },
    embeddingMs: Math.round(embedded.elapsedMs), trainingMs,
    totalMs: Math.round(performance.now() - started),
    holdoutOpened: false, savedWeights: false, activated: false };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
