// Offline RAM-only token attention. No text, token states, or weights are saved.
const DIM = 384, SCALE = 8, MARGIN = 0.05;
const STEPS = 40, RATE = 0.01, DECAY = 0.001;
const fail = code => { throw new TypeError(code); };
const dot = (a, b) => {
  let total = 0;
  for (let k = 0; k < DIM; k++) total += a[k] * b[k];
  return total;
};
const sigmoid = value => value >= 0 ? 1 / (1 + Math.exp(-value)) :
  Math.exp(value) / (1 + Math.exp(value));
const softplus = value => Math.max(value, 0) + Math.log1p(Math.exp(-Math.abs(value)));

export function normalizedTokenMap(documents, copied) {
  const result = new Map();
  for (const doc of documents) {
    const item = copied.get(doc.id);
    if (!item || !Number.isInteger(item.count) || item.count < 1 || item.count > 64 ||
        !(item.states instanceof Float32Array) || item.states.length !== item.count * DIM)
      fail('TOKEN_STATES');
    const states = new Float32Array(item.states.length);
    for (let token = 0; token < item.count; token++) {
      const offset = token * DIM;
      let square = 0;
      for (let k = 0; k < DIM; k++) {
        const value = item.states[offset + k];
        if (!Number.isFinite(value)) fail('TOKEN_STATES');
        square += value * value;
      }
      const norm = Math.sqrt(square);
      if (!(norm > 1e-9)) fail('TOKEN_STATES');
      for (let k = 0; k < DIM; k++) states[offset + k] = item.states[offset + k] / norm;
    }
    result.set(doc.id, { states, count: item.count });
  }
  return result;
}

export function attend(item, weights) {
  if (!item || !(item.states instanceof Float32Array) ||
      !Number.isInteger(item.count) || item.count < 1 || item.count > 64 ||
      item.states.length !== item.count * DIM || !weights || weights.length !== DIM)
    fail('ATTENTION_INPUT');
  const logits = new Float64Array(item.count);
  let maximum = -Infinity;
  for (let token = 0; token < item.count; token++) {
    let value = 0;
    for (let k = 0; k < DIM; k++) value += weights[k] * item.states[token * DIM + k];
    logits[token] = SCALE * value;
    maximum = Math.max(maximum, logits[token]);
  }
  if (!Number.isFinite(maximum)) fail('NUMERIC');
  const alpha = new Float64Array(item.count);
  let sum = 0;
  for (let i = 0; i < item.count; i++) {
    alpha[i] = Math.exp(logits[i] - maximum);
    sum += alpha[i];
  }
  if (!Number.isFinite(sum) || !(sum > 0)) fail('NUMERIC');
  const raw = new Float64Array(DIM);
  for (let i = 0; i < item.count; i++) {
    alpha[i] /= sum;
    for (let k = 0; k < DIM; k++) raw[k] += alpha[i] * item.states[i * DIM + k];
  }
  const norm = Math.hypot(...raw);
  if (!Number.isFinite(norm) || !(norm > 1e-9)) fail('NUMERIC');
  const vector = Float64Array.from(raw, value => value / norm);
  return { vector, raw, norm, alpha, item };
}

function backward(attended, gradientVector, gradientWeights) {
  const { vector, raw, norm, alpha, item } = attended;
  const parallel = dot(vector, gradientVector);
  const gradientRaw = Float64Array.from(gradientVector,
    (value, k) => (value - vector[k] * parallel) / norm);
  for (let token = 0; token < item.count; token++) {
    let influence = 0;
    for (let k = 0; k < DIM; k++)
      influence += gradientRaw[k] * (item.states[token * DIM + k] - raw[k]);
    const factor = SCALE * alpha[token] * influence;
    for (let k = 0; k < DIM; k++)
      gradientWeights[k] += factor * item.states[token * DIM + k];
  }
}

export function tripletObjective(anchor, positive, negative, weights) {
  const a = attend(anchor, weights), p = attend(positive, weights), n = attend(negative, weights);
  const difference = dot(a.vector, n.vector) - dot(a.vector, p.vector) + MARGIN;
  const loss = softplus(difference), delta = sigmoid(difference);
  if (!Number.isFinite(loss) || !Number.isFinite(delta)) fail('NUMERIC');
  const gradient = new Float64Array(DIM);
  backward(a, Float64Array.from(a.vector, (_, k) => delta * (n.vector[k] - p.vector[k])), gradient);
  backward(p, Float64Array.from(a.vector, value => -delta * value), gradient);
  backward(n, Float64Array.from(a.vector, value => delta * value), gradient);
  if ([...gradient].some(value => !Number.isFinite(value))) fail('NUMERIC');
  return { loss, gradient };
}

const normalizeVector = vector => {
  if (!vector || vector.length !== DIM) fail('POOLED_VECTOR');
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || !(norm > 1e-9)) fail('POOLED_VECTOR');
  return Float64Array.from(vector, value => value / norm);
};

export function mineStaticTriplets(documents, pooledVectors) {
  const views = new Map(documents.map(doc => [doc.id, normalizeVector(pooledVectors.get(doc.id))]));
  const triplets = [];
  for (const anchor of documents) {
    let positive = null, negative = null;
    for (const candidate of documents) {
      if (candidate.id === anchor.id) continue;
      const score = dot(views.get(anchor.id), views.get(candidate.id));
      if (candidate.eventKey === anchor.eventKey && candidate.lang !== anchor.lang &&
          (!positive || score < positive.score)) positive = { id: candidate.id, score };
      if (candidate.eventKey !== anchor.eventKey &&
          candidate.categories[0] === anchor.categories[0] &&
          (!negative || score > negative.score)) negative = { id: candidate.id, score };
    }
    if (!positive || !negative) fail('TRAIN_TRIPLETS');
    triplets.push({ anchor: anchor.id, positive: positive.id, negative: negative.id });
  }
  return triplets;
}

export function fitAttention(documents, pooledVectors, tokens) {
  const triplets = mineStaticTriplets(documents, pooledVectors);
  const weights = new Float64Array(DIM), first = new Float64Array(DIM),
    second = new Float64Array(DIM);
  for (let step = 1; step <= STEPS; step++) {
    const gradient = new Float64Array(DIM);
    for (const triplet of triplets) {
      const item = tripletObjective(tokens.get(triplet.anchor), tokens.get(triplet.positive),
        tokens.get(triplet.negative), weights);
      for (let k = 0; k < DIM; k++) gradient[k] += item.gradient[k] / triplets.length;
    }
    for (let k = 0; k < DIM; k++) gradient[k] += DECAY * weights[k];
    const gradientNorm = Math.hypot(...gradient);
    if (!Number.isFinite(gradientNorm)) fail('NUMERIC');
    const scale = gradientNorm > 1 ? 1 / gradientNorm : 1;
    for (let k = 0; k < DIM; k++) {
      const g = gradient[k] * scale;
      first[k] = 0.9 * first[k] + 0.1 * g;
      second[k] = 0.999 * second[k] + 0.001 * g * g;
      const m = first[k] / (1 - 0.9 ** step), v = second[k] / (1 - 0.999 ** step);
      weights[k] -= RATE * m / (Math.sqrt(v) + 1e-8);
    }
    if (!Number.isFinite(Math.hypot(...weights)) || Math.hypot(...weights) > 100)
      fail('NUMERIC');
  }
  return { weights, triplets: triplets.length, steps: STEPS };
}

export function eventVectors(documents, tokenMap, weights) {
  return new Map(documents.map(doc => [doc.id, attend(tokenMap.get(doc.id), weights).vector]));
}

export function maxNegativeCutoff(documents, vectors) {
  let maximum = -Infinity;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++)
    if (documents[i].eventKey !== documents[j].eventKey)
      maximum = Math.max(maximum, dot(vectors.get(documents[i].id),
        vectors.get(documents[j].id)));
  if (!Number.isFinite(maximum)) fail('CALIBRATION');
  return maximum + 0.002 <= 1 ? maximum + 0.002 : null;
}

export function retrievalRanks(documents, vectors) {
  let eligible = 0, rank1 = 0, top3 = 0;
  for (let i = 0; i < documents.length; i++) {
    const others = Array.from({ length: documents.length }, (_, j) => j)
      .filter(j => j !== i)
      .sort((a, b) => dot(vectors.get(documents[i].id), vectors.get(documents[b].id)) -
        dot(vectors.get(documents[i].id), vectors.get(documents[a].id)) || a - b);
    const first = others.findIndex(j => documents[j].eventKey === documents[i].eventKey);
    if (first < 0) continue;
    eligible++;
    if (first === 0) rank1++;
    if (first < 3) top3++;
  }
  return { eligible, rank1, top3 };
}

export const cosine = dot;
