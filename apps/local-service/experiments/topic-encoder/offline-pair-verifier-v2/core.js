// Synthetic-only offline probe. Parameters and features remain in process memory.
const DIM = 384, FEATURES = 1 + 2 * DIM;
const STEPS = 100, RATE = 0.03, DECAY = 0.01;

export function pairFeatures(a, b) {
  if (!a || !b || a.length !== DIM || b.length !== DIM)
    throw new TypeError('VECTOR');
  const x = new Float64Array(FEATURES);
  for (let k = 0; k < DIM; k++) {
    const product = a[k] * b[k];
    x[0] += product;
    x[1 + k] = Math.abs(a[k] - b[k]);
    x[1 + DIM + k] = product;
  }
  return x;
}

const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const standardized = (x, stats) => Float64Array.from(x, (value, k) =>
  Math.max(-4, Math.min(4, (value - stats.mean[k]) / stats.scale[k])));

export function fitVerifier(documents, vectors) {
  const examples = [];
  let positives = 0, hardNegatives = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    const positive = a.eventKey === b.eventKey;
    const sameFamily = a.categories[0] === b.categories[0];
    if (!positive && !sameFamily) continue;
    examples.push({ x: pairFeatures(vectors.get(a.id), vectors.get(b.id)), y: positive ? 1 : 0 });
    if (positive) positives++; else hardNegatives++;
  }
  if (positives < 2 || hardNegatives < 2) throw new TypeError('TRAIN_STRATA');
  const mean = new Float64Array(FEATURES), scale = new Float64Array(FEATURES);
  for (const example of examples) for (let k = 0; k < FEATURES; k++) mean[k] += example.x[k];
  for (let k = 0; k < FEATURES; k++) mean[k] /= examples.length;
  for (const example of examples) for (let k = 0; k < FEATURES; k++)
    scale[k] += (example.x[k] - mean[k]) ** 2;
  for (let k = 0; k < FEATURES; k++) scale[k] = Math.max(1e-6, Math.sqrt(scale[k] / examples.length));
  const stats = { mean, scale };
  for (const example of examples) example.x = standardized(example.x, stats);
  // Convex regularized logistic model: zero initialization is deterministic.
  const weights = new Float64Array(FEATURES + 1);
  const first = new Float64Array(weights.length), second = new Float64Array(weights.length);
  for (let step = 1; step <= STEPS; step++) {
    const gradient = new Float64Array(weights.length);
    for (const example of examples) {
      let logit = weights[FEATURES];
      for (let k = 0; k < FEATURES; k++) logit += weights[k] * example.x[k];
      const delta = (sigmoid(logit) - example.y) /
        (2 * (example.y ? positives : hardNegatives));
      for (let k = 0; k < FEATURES; k++) gradient[k] += delta * example.x[k];
      gradient[FEATURES] += delta;
    }
    for (let k = 0; k < weights.length; k++) {
      const g = gradient[k] + (k < FEATURES ? DECAY * weights[k] : 0);
      first[k] = 0.9 * first[k] + 0.1 * g;
      second[k] = 0.999 * second[k] + 0.001 * g * g;
      const m = first[k] / (1 - 0.9 ** step), v = second[k] / (1 - 0.999 ** step);
      weights[k] -= RATE * m / (Math.sqrt(v) + 1e-8);
    }
  }
  return { weights, stats, trainCounts: { positives, hardNegatives } };
}

export function verifierScore(model, a, b) {
  const x = standardized(pairFeatures(a, b), model.stats);
  let logit = model.weights[FEATURES];
  for (let k = 0; k < FEATURES; k++) logit += model.weights[k] * x[k];
  return sigmoid(logit);
}
