// Offline experiment: a small residual metric head over the packaged E5 vector.
// No text, provider, model download, database or production integration is used.
export const INPUT_DIMENSIONS = 384;
export const RANK = 12;
export const SCHEMA = 'synthetic-topic-residual-head/v1';

function validVector(vector) {
  if (!vector || vector.length !== INPUT_DIMENSIONS) return false;
  let square = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return false;
    square += value * value;
  }
  return Math.abs(square - 1) < 0.02;
}

function validateDocuments(documents, vectors, name) {
  if (!Array.isArray(documents) || documents.length < 4 || documents.length > 512 ||
      !(vectors instanceof Map)) throw new TypeError(`Invalid ${name} data`);
  const ids = new Set();
  for (const document of documents) {
    if (!document || typeof document.id !== 'string' || !document.id || ids.has(document.id) ||
        typeof document.family !== 'string' || !document.family ||
        typeof document.topicLabel !== 'string' || !document.topicLabel ||
        typeof document.viewpoint !== 'string' || !document.viewpoint ||
        !validVector(vectors.get(document.id))) throw new TypeError(`Invalid ${name} document`);
    ids.add(document.id);
  }
}

function triplets(documents, maximum) {
  const anchors = [];
  for (let a = 0; a < documents.length; a++) {
    const anchor = documents[a];
    const positives = [], negativeGroups = new Map();
    for (let i = 0; i < documents.length; i++) {
      if (i === a || documents[i].family !== anchor.family) continue;
      if (documents[i].topicLabel === anchor.topicLabel) {
        if (documents[i].viewpoint !== anchor.viewpoint) positives.push(i);
      } else {
        const group = negativeGroups.get(documents[i].topicLabel) ?? [];
        group.push(i);
        negativeGroups.set(documents[i].topicLabel, group);
      }
    }
    const negatives = [];
    const groups = [...negativeGroups.values()];
    for (let index = 0; index < Math.max(0, ...groups.map(group => group.length)); index++) {
      for (const group of groups) if (index < group.length) negatives.push(group[index]);
    }
    if (positives.length && negatives.length) anchors.push({ a, positives, negatives,
      count: positives.length * negatives.length, quota: 0 });
  }
  if (anchors.length > maximum) throw new RangeError('Too many triplet anchors for balanced cap');
  const available = anchors.reduce((sum, anchor) => sum + anchor.count, 0);
  let budget = Math.min(maximum, available);
  // Round-robin quotas give late families the same representation as early ones.
  while (budget) for (const anchor of anchors) {
    if (budget && anchor.quota < anchor.count) { anchor.quota++; budget--; }
  }
  const rows = [];
  for (const anchor of anchors) for (let slot = 0; slot < anchor.quota; slot++) {
    const index = Math.floor((slot + 0.5) * anchor.count / anchor.quota);
    const p = anchor.positives[Math.floor(index / anchor.negatives.length)];
    const n = anchor.negatives[index % anchor.negatives.length];
    rows.push([anchor.a, p, n]);
  }
  return rows;
}

function initialFactors() {
  const factors = new Float64Array(INPUT_DIMENSIONS * RANK);
  let state = 0x6d2b79f5;
  for (let i = 0; i < factors.length; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    factors[i] = (((state >>> 0) / 0xffffffff) * 2 - 1) * 0.014;
  }
  return factors;
}

function embedding(vector, factors) {
  const latent = new Float64Array(RANK);
  for (let k = 0; k < INPUT_DIMENSIONS; k++) {
    const base = k * RANK;
    for (let r = 0; r < RANK; r++) latent[r] += factors[base + r] * vector[k];
  }
  const raw = new Float64Array(INPUT_DIMENSIONS);
  let normSquared = 0;
  for (let k = 0; k < INPUT_DIMENSIONS; k++) {
    let value = vector[k];
    const base = k * RANK;
    for (let r = 0; r < RANK; r++) value += factors[base + r] * latent[r];
    raw[k] = value; normSquared += value * value;
  }
  const norm = Math.sqrt(normSquared);
  return { vector: Float64Array.from(raw, value => value / norm), norm, latent };
}

function dot(a, b) {
  let result = 0;
  for (let k = 0; k < INPUT_DIMENSIONS; k++) result += a[k] * b[k];
  return result;
}

function meanTripletLoss(rows, vectors, factors, margin) {
  if (!rows.length) throw new Error('Training and validation require opposing-viewpoint positives and hard negatives');
  const embedded = vectors.map(vector => embedding(vector, factors));
  let loss = 0, violations = 0;
  for (const [a, p, n] of rows) {
    const value = margin + dot(embedded[a].vector, embedded[n].vector) -
      dot(embedded[a].vector, embedded[p].vector);
    if (value > 0) { loss += value; violations++; }
  }
  return { loss: loss / rows.length, violations };
}

function accumulateDerivative(gradient, input, result, outputGradient, factors) {
  const scalar = dot(outputGradient, result.vector);
  const rawGradient = new Float64Array(INPUT_DIMENSIONS);
  const latentGradient = new Float64Array(RANK);
  for (let k = 0; k < INPUT_DIMENSIONS; k++) {
    rawGradient[k] = (outputGradient[k] - scalar * result.vector[k]) / result.norm;
    const base = k * RANK;
    for (let r = 0; r < RANK; r++) latentGradient[r] += factors[base + r] * rawGradient[k];
  }
  for (let k = 0; k < INPUT_DIMENSIONS; k++) {
    const base = k * RANK;
    for (let r = 0; r < RANK; r++)
      gradient[base + r] += rawGradient[k] * result.latent[r] + input[k] * latentGradient[r];
  }
}

function epochGradient(rows, vectors, factors, margin, regularization) {
  const embedded = vectors.map(vector => embedding(vector, factors));
  const gradient = new Float64Array(factors.length);
  let loss = 0;
  for (const [a, p, n] of rows) {
    const va = embedded[a].vector, vp = embedded[p].vector, vn = embedded[n].vector;
    const value = margin + dot(va, vn) - dot(va, vp);
    if (value <= 0) continue;
    loss += value;
    const ga = Float64Array.from(va, (_, k) => vn[k] - vp[k]);
    const gp = Float64Array.from(vp, (_, k) => -va[k]);
    const gn = Float64Array.from(vn, (_, k) => va[k]);
    accumulateDerivative(gradient, vectors[a], embedded[a], ga, factors);
    accumulateDerivative(gradient, vectors[p], embedded[p], gp, factors);
    accumulateDerivative(gradient, vectors[n], embedded[n], gn, factors);
  }
  const scale = 1 / rows.length;
  for (let i = 0; i < gradient.length; i++) {
    loss += regularization * factors[i] * factors[i] * rows.length;
    gradient[i] = gradient[i] * scale + 2 * regularization * factors[i];
  }
  return { gradient, loss: loss * scale };
}

// Whole-family validation is supplied separately and never contributes gradients.
// The identity transform is a candidate; validation can reject every learned epoch.
export function trainTopicHead(trainingDocuments, trainingVectors,
  validationDocuments, validationVectors, options = {}) {
  validateDocuments(trainingDocuments, trainingVectors, 'training');
  validateDocuments(validationDocuments, validationVectors, 'validation');
  const trainFamilies = new Set(trainingDocuments.map(document => document.family));
  const trainIds = new Set(trainingDocuments.map(document => document.id));
  if (validationDocuments.some(document => trainFamilies.has(document.family)) ||
      validationDocuments.some(document => trainIds.has(document.id)))
    throw new TypeError('Training and validation families and IDs must be disjoint');
  const epochs = options.epochs ?? 80;
  const margin = options.margin ?? 0.08;
  const learningRate = options.learningRate ?? 0.025;
  const regularization = options.regularization ?? 0.0005;
  const patience = options.patience ?? 12;
  const maxTrainingMs = options.maxTrainingMs ?? 30000;
  const clock = options.clock ?? (() => performance.now());
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 120 ||
      !Number.isInteger(patience) || patience < 1 || patience > epochs ||
      !Number.isInteger(maxTrainingMs) || maxTrainingMs < 1 || maxTrainingMs > 30000 ||
      typeof clock !== 'function' ||
      !Number.isFinite(margin) || margin <= 0 || margin > 0.5 ||
      !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.1 ||
      !Number.isFinite(regularization) || regularization < 0 || regularization > 0.1)
    throw new TypeError('Invalid training options');
  const started = clock();
  if (!Number.isFinite(started)) throw new TypeError('Invalid training clock');
  const checkBudget = () => {
    const elapsed = clock() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new TypeError('Invalid training clock');
    if (elapsed > maxTrainingMs) throw new Error('Topic head training exceeded time budget');
  };
  const trainRows = triplets(trainingDocuments, 4096);
  const validationRows = triplets(validationDocuments, 2048);
  if (!trainRows.length || !validationRows.length) throw new Error('Both splits need viewpoint triplets');
  const contributedFamilies = (rows, documents) => new Set(rows.map(([a]) => documents[a].family));
  if (contributedFamilies(trainRows, trainingDocuments).size !== trainFamilies.size ||
      contributedFamilies(validationRows, validationDocuments).size !==
        new Set(validationDocuments.map(document => document.family)).size)
    throw new Error('Every family must contribute viewpoint triplets');
  const trainVectors = trainingDocuments.map(document => trainingVectors.get(document.id));
  const valVectors = validationDocuments.map(document => validationVectors.get(document.id));
  const identity = new Float64Array(INPUT_DIMENSIONS * RANK);
  let bestFactors = identity, bestEpoch = 0;
  let bestLoss = meanTripletLoss(validationRows, valVectors, identity, margin).loss;
  const factors = initialFactors();
  const firstMoment = new Float64Array(factors.length);
  const secondMoment = new Float64Array(factors.length);
  let epochsRun = 0;
  for (let epoch = 1; epoch <= epochs; epoch++) {
    checkBudget();
    const { gradient } = epochGradient(trainRows, trainVectors, factors, margin, regularization);
    checkBudget();
    let gradientNorm = 0;
    for (const value of gradient) gradientNorm += value * value;
    const clip = Math.min(1, 2 / (Math.sqrt(gradientNorm) || 1));
    for (let i = 0; i < factors.length; i++) {
      const g = gradient[i] * clip;
      firstMoment[i] = 0.9 * firstMoment[i] + 0.1 * g;
      secondMoment[i] = 0.999 * secondMoment[i] + 0.001 * g * g;
      const m = firstMoment[i] / (1 - 0.9 ** epoch);
      const v = secondMoment[i] / (1 - 0.999 ** epoch);
      factors[i] -= learningRate * m / (Math.sqrt(v) + 1e-8);
    }
    // Prevent a tiny corpus from producing an arbitrarily amplified direction.
    for (let r = 0; r < RANK; r++) {
      let squared = 0;
      for (let k = 0; k < INPUT_DIMENSIONS; k++) squared += factors[k * RANK + r] ** 2;
      const cap = Math.min(1, 1.25 / (Math.sqrt(squared) || 1));
      if (cap < 1) for (let k = 0; k < INPUT_DIMENSIONS; k++) factors[k * RANK + r] *= cap;
    }
    epochsRun = epoch;
    const validation = meanTripletLoss(validationRows, valVectors, factors, margin).loss;
    checkBudget();
    if (validation < bestLoss - 1e-6) {
      bestLoss = validation; bestEpoch = epoch; bestFactors = Float64Array.from(factors);
    } else if (epoch - bestEpoch >= patience) break;
  }
  return { schema: SCHEMA, dimensions: INPUT_DIMENSIONS, rank: RANK,
    factors: bestFactors, bestEpoch, epochsRun, trainingDocuments: trainingDocuments.length,
    validationDocuments: validationDocuments.length, trainingTriplets: trainRows.length,
    validationTriplets: validationRows.length, margin, validationLoss: bestLoss,
    identityValidationLoss: meanTripletLoss(validationRows, valVectors, identity, margin).loss };
}

export function projectTopicVector(vector, head) {
  if (!validVector(vector) || head?.schema !== SCHEMA || head.dimensions !== INPUT_DIMENSIONS ||
      head.rank !== RANK || head.factors?.length !== INPUT_DIMENSIONS * RANK ||
      [...head.factors].some(value => !Number.isFinite(value) || Math.abs(value) > 2))
    throw new TypeError('Invalid topic projection');
  return embedding(vector, head.factors).vector;
}
