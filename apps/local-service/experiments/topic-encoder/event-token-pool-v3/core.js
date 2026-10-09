// Offline RAM-only dynamic mining on bounded packaged-E5 token states.
import { attend, tripletObjective, cosine } from '../event-token-pool-v1/core.js';

const DIM = 384, STEPS = 40, RATE = 0.01, DECAY = 0.001;
const fail = code => { throw new TypeError(code); };

function checkDocuments(documents) {
  if (!Array.isArray(documents) || documents.length < 6 || documents.length > 216)
    fail('TRAIN_COUNT');
  const ids = new Set();
  for (const doc of documents) {
    if (!doc || typeof doc.id !== 'string' || !doc.id || ids.has(doc.id) ||
        typeof doc.eventKey !== 'string' || !doc.eventKey ||
        !Array.isArray(doc.categories) || typeof doc.categories[0] !== 'string' ||
        !doc.categories[0] || typeof doc.lang !== 'string' || !doc.lang)
      fail('TRAIN_SCHEMA');
    ids.add(doc.id);
  }
}

export function mineDynamicTriplets(documents, tokens, weights) {
  checkDocuments(documents);
  if (!(weights instanceof Float64Array) || weights.length !== DIM)
    fail('TRAIN_WEIGHTS');
  const vectors = documents.map(doc => attend(tokens.get(doc.id), weights).vector);
  const triplets = [];
  for (let i = 0; i < documents.length; i++) {
    const anchor = documents[i];
    let positive = null, familyNegative = null, outsideNegative = null;
    for (let j = 0; j < documents.length; j++) {
      if (i === j) continue;
      const candidate = documents[j], score = cosine(vectors[i], vectors[j]);
      if (!Number.isFinite(score)) fail('TRAIN_NUMERIC');
      if (candidate.eventKey === anchor.eventKey && candidate.lang !== anchor.lang) {
        if (!positive || score < positive.score)
          positive = { id: candidate.id, score };
      } else if (candidate.eventKey !== anchor.eventKey &&
          candidate.categories[0] === anchor.categories[0]) {
        if (!familyNegative || score > familyNegative.score)
          familyNegative = { id: candidate.id, score };
      } else if (candidate.categories[0] !== anchor.categories[0]) {
        if (!outsideNegative || score > outsideNegative.score)
          outsideNegative = { id: candidate.id, score };
      }
    }
    if (!positive || !familyNegative || !outsideNegative)
      fail('TRAIN_STRATA');
    triplets.push({ anchor: anchor.id, positive: positive.id,
      familyNegative: familyNegative.id, outsideNegative: outsideNegative.id });
  }
  return triplets;
}

export function fitDynamicAttention(documents, tokens) {
  checkDocuments(documents);
  const weights = new Float64Array(DIM), first = new Float64Array(DIM),
    second = new Float64Array(DIM);
  for (let step = 1; step <= STEPS; step++) {
    const triplets = mineDynamicTriplets(documents, tokens, weights);
    const gradient = new Float64Array(DIM);
    for (const row of triplets) {
      const a = tokens.get(row.anchor), p = tokens.get(row.positive);
      const family = tripletObjective(a, p, tokens.get(row.familyNegative), weights);
      const outside = tripletObjective(a, p, tokens.get(row.outsideNegative), weights);
      for (let k = 0; k < DIM; k++)
        gradient[k] += (0.75 * family.gradient[k] +
          0.25 * outside.gradient[k]) / triplets.length;
    }
    for (let k = 0; k < DIM; k++) gradient[k] += DECAY * weights[k];
    const gradientNorm = Math.hypot(...gradient);
    if (!Number.isFinite(gradientNorm)) fail('TRAIN_NUMERIC');
    const scale = gradientNorm > 1 ? 1 / gradientNorm : 1;
    for (let k = 0; k < DIM; k++) {
      const value = gradient[k] * scale;
      first[k] = 0.9 * first[k] + 0.1 * value;
      second[k] = 0.999 * second[k] + 0.001 * value * value;
      const mean = first[k] / (1 - 0.9 ** step);
      const variance = second[k] / (1 - 0.999 ** step);
      weights[k] -= RATE * mean / (Math.sqrt(variance) + 1e-8);
    }
    const norm = Math.hypot(...weights);
    if (!Number.isFinite(norm) || norm > 100) fail('TRAIN_NUMERIC');
  }
  return { weights, steps: STEPS, fitArticles: documents.length,
    dynamicTripletsPerStep: documents.length, tripletLossesPerStep: 2 * documents.length };
}
