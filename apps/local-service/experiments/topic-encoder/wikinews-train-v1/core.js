// Private offline research. The learned weights exist only in process memory.
import { evaluate } from '../wikinews-benchmark-v1/core.js';

const DIM = 384;
const STRENGTHS = Object.freeze([0, 0.5, 1, 2]);
const GAP = 0.002;
const dot = (a, b) => {
  let sum = 0;
  for (let k = 0; k < DIM; k++) sum += a[k] * b[k];
  return sum;
};

export function normalize(vector) {
  if (!vector || vector.length !== DIM || [...vector].some(v => !Number.isFinite(v)))
    throw new TypeError('VECTOR');
  const norm = Math.hypot(...vector);
  if (!(norm > 1e-9)) throw new TypeError('VECTOR');
  return Float64Array.from(vector, value => value / norm);
}

function normalizedMap(documents, vectors) {
  return new Map(documents.map(doc => [doc.id, normalize(vectors.get(doc.id))]));
}

// Each train anchor supplies its most difficult same-event translation and its
// nearest different-event article. Shared-category neighbors take priority when
// their cosine is within 0.02 of the global hardest neighbor.
export function mineTriplets(documents, vectors) {
  const triplets = [];
  for (const anchor of documents) {
    const a = vectors.get(anchor.id);
    let positive, negative, categoryNegative;
    for (const candidate of documents) {
      if (candidate.id === anchor.id) continue;
      const score = dot(a, vectors.get(candidate.id));
      if (candidate.eventKey === anchor.eventKey) {
        if (!positive || score < positive.score) positive = { id: candidate.id, score };
      } else {
        if (!negative || score > negative.score) negative = { id: candidate.id, score };
        if (anchor.categories.some(category => candidate.categories.includes(category)) &&
            (!categoryNegative || score > categoryNegative.score))
          categoryNegative = { id: candidate.id, score };
      }
    }
    if (!positive || !negative) continue;
    const chosen = categoryNegative && categoryNegative.score >= negative.score - 0.02
      ? categoryNegative : negative;
    triplets.push({ anchor: anchor.id, positive: positive.id, negative: chosen.id,
      categoryNegative: chosen === categoryNegative });
  }
  return triplets;
}

// Diagonal metric: reduce dimensions unstable across translations and increase
// dimensions that distinguish difficult neighboring events. Shrinkage keeps the
// identity embedding dominant on a small and imperfect training corpus.
export function fitMetric(documents, rawVectors) {
  const vectors = normalizedMap(documents, rawVectors);
  const triplets = mineTriplets(documents, vectors);
  if (triplets.length < 2) throw new TypeError('TRAIN_TRIPLETS');
  const contrast = new Float64Array(DIM);
  for (const item of triplets) {
    const a = vectors.get(item.anchor), p = vectors.get(item.positive);
    const n = vectors.get(item.negative);
    for (let k = 0; k < DIM; k++) {
      const pd = a[k] - p[k], nd = a[k] - n[k];
      contrast[k] += nd * nd - pd * pd;
    }
  }
  const mean = contrast.reduce((sum, value) => sum + value, 0) / DIM;
  const scale = Math.sqrt(contrast.reduce((sum, value) =>
    sum + (value - mean) ** 2, 0) / DIM) || 1;
  const weights = Float64Array.from(contrast, value =>
    Math.max(0.5, Math.min(2, Math.exp((value - mean) / scale * 0.2))));
  return { weights, triplets: triplets.length,
    categoryTriplets: triplets.filter(item => item.categoryNegative).length };
}

export function transform(vector, weights, strength) {
  const input = normalize(vector);
  if (!weights || weights.length !== DIM || !STRENGTHS.includes(strength))
    throw new TypeError('MODEL');
  return normalize(Float64Array.from(input, (value, k) =>
    value * (1 + strength * (weights[k] - 1))));
}

function transformedMap(documents, rawVectors, model, strength) {
  return new Map(documents.map(doc => [doc.id,
    transform(rawVectors.get(doc.id), model.weights, strength)]));
}

function scorePairs(documents, vectors, threshold) {
  let trueAdmitted = 0, trueTotal = 0, falseAdmitted = 0, falseTotal = 0;
  let hardFalseAdmitted = 0, hardFalseTotal = 0;
  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const a = documents[i], b = documents[j];
      const similarity = dot(vectors.get(a.id), vectors.get(b.id));
      const same = a.eventKey === b.eventKey;
      if (same) {
        trueTotal++; if (similarity >= threshold) trueAdmitted++;
      } else {
        falseTotal++; if (similarity >= threshold) falseAdmitted++;
        if (a.categories.some(category => b.categories.includes(category))) {
          hardFalseTotal++;
          if (similarity >= threshold) hardFalseAdmitted++;
        }
      }
    }
  }
  return { trueAdmitted, trueTotal, falseAdmitted, falseTotal,
    hardFalseAdmitted, hardFalseTotal };
}

export function validationCutoff(documents, vectors) {
  let maxNegative = -Infinity;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    if (documents[i].eventKey !== documents[j].eventKey)
      maxNegative = Math.max(maxNegative, dot(vectors.get(documents[i].id),
        vectors.get(documents[j].id)));
  }
  if (!Number.isFinite(maxNegative)) throw new TypeError('VALIDATION_NEGATIVES');
  // A conflicting identical cross-event pair makes a zero-false cosine gate
  // impossible. Callers represent this as abstention, never a threshold > 1.
  const cutoff = maxNegative + GAP;
  return cutoff > 1 ? null : cutoff;
}

export function freezeOnValidation(trainDocs, validationDocs, rawVectors) {
  const model = fitMetric(trainDocs, rawVectors);
  const candidates = STRENGTHS.map(strength => {
    const transformed = transformedMap(validationDocs, rawVectors, model, strength);
    const threshold = validationCutoff(validationDocs, transformed);
    return { strength, threshold, pairs: threshold === null ? null :
      scorePairs(validationDocs, transformed, threshold) };
  });
  const eligible = candidates.filter(item => item.pairs !== null);
  const selected = eligible.length ? eligible.reduce((best, item) =>
    item.pairs.trueAdmitted > best.pairs.trueAdmitted ? item : best) : null;
  return { model, selected, candidates };
}

export function scoreFrozen(documents, rawVectors, model, selected) {
  if (!selected) return null;
  const vectors = transformedMap(documents, rawVectors, model, selected.strength);
  return { pairAdmission: scorePairs(documents, vectors, selected.threshold),
    wholeTopics: evaluate(documents, vectors, selected.threshold) };
}

export function scoreRaw(documents, rawVectors, threshold) {
  const vectors = normalizedMap(documents, rawVectors);
  return { pairAdmission: scorePairs(documents, vectors, threshold),
    wholeTopics: evaluate(documents, vectors, threshold) };
}
