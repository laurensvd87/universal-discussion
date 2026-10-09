// Offline, RAM-only 384-parameter diagonal adapter. No model artefact is saved.
import { createHash } from 'node:crypto';

const DIM = 384;
const STEPS = 40;
const RATE = 0.01;
const MARGIN = 0.05;
const SCALE = 8;
const REGULARIZATION = 0.001;
const BOUND = 0.5;
const fail = code => { throw new TypeError(code); };
const sha = value => createHash('sha256').update(value).digest('hex');
const dot = (a, b) => {
  let sum = 0;
  for (let k = 0; k < DIM; k++) sum += a[k] * b[k];
  return sum;
};
const sigmoid = value => value >= 0 ? 1 / (1 + Math.exp(-value)) :
  Math.exp(value) / (1 + Math.exp(value));

export function splitTrainEvents(train) {
  if (!Array.isArray(train) || train.length !== 749) fail('TRAIN_COUNT');
  const fit = [], calibration = [];
  const split = new Map();
  for (const row of train) {
    if (typeof row?.eventKey !== 'string' || !row.eventKey) fail('TRAIN_LABEL');
    if (!split.has(row.eventKey))
      split.set(row.eventKey, parseInt(sha(row.eventKey).slice(0, 8), 16) % 3 === 0 ? 'cal' : 'fit');
    (split.get(row.eventKey) === 'fit' ? fit : calibration).push(row);
  }
  if (fit.length < 100 || calibration.length < 40 || calibration.length > 324 ||
      new Set(fit.map(row => row.eventKey)).size < 3 ||
      new Set(calibration.map(row => row.eventKey)).size < 3) fail('TRAIN_PARTITION');
  return { fit, calibration };
}

export function omitConflictingInputs(rows) {
  const labels = new Map();
  for (const row of rows) {
    if (typeof row?.duplicateKey !== 'string' || !row.duplicateKey ||
        typeof row.eventKey !== 'string' || !row.eventKey) fail('DUPLICATE_LABEL');
    const group = labels.get(row.duplicateKey) ?? new Set();
    group.add(row.eventKey); labels.set(row.duplicateKey, group);
  }
  const clean = rows.filter(row => labels.get(row.duplicateKey).size === 1);
  return { rows: clean, excluded: rows.length - clean.length };
}

export function normalizeVectors(rows, vectors) {
  if (!(vectors instanceof Map)) fail('VECTOR_MAP');
  const output = new Map();
  for (const row of rows) {
    const vector = vectors.get(row.id);
    if (!vector || vector.length !== DIM || [...vector].some(value => !Number.isFinite(value)))
      fail('VECTOR_INPUT');
    const norm = Math.hypot(...vector);
    if (!(norm > 1e-9) || !Number.isFinite(norm)) fail('VECTOR_NORM');
    output.set(row.id, Float64Array.from(vector, value => value / norm));
  }
  return output;
}

export function transform(rows, vectors, parameters) {
  if (!parameters || parameters.length !== DIM ||
      [...parameters].some(value => !Number.isFinite(value) || Math.abs(value) > BOUND + 1e-9))
    fail('PARAMETERS');
  const normalized = normalizeVectors(rows, vectors);
  return new Map(rows.map(row => {
    const source = normalized.get(row.id);
    const scaled = Float64Array.from(source, (value, k) => value * Math.exp(parameters[k]));
    const norm = Math.hypot(...scaled);
    if (!(norm > 1e-9) || !Number.isFinite(norm)) fail('NUMERIC');
    return [row.id, Float64Array.from(scaled, value => value / norm)];
  }));
}

function derivative(a, b, similarity, output, coefficient) {
  for (let k = 0; k < DIM; k++)
    output[k] += coefficient * (2 * a[k] * b[k] -
      similarity * (a[k] * a[k] + b[k] * b[k]));
}

export function tripletObjective(a, p, n) {
  const positive = dot(a, p), negative = dot(a, n);
  const argument = SCALE * (negative - positive + MARGIN);
  const loss = Math.max(argument, 0) + Math.log1p(Math.exp(-Math.abs(argument)));
  const factor = SCALE * sigmoid(argument);
  const gradient = new Float64Array(DIM);
  derivative(a, n, negative, gradient, factor);
  derivative(a, p, positive, gradient, -factor);
  if (!Number.isFinite(loss) || [...gradient].some(value => !Number.isFinite(value)))
    fail('NUMERIC');
  return { loss, gradient };
}

// One reproducible hardest cross-language positive and one negative per anchor.
// Every fourth anchor uses an outside-category negative; the rest use the
// hardest different event in the same category. No validation label enters.
export function mineTriplets(rows, vectors) {
  if (!Array.isArray(rows) || rows.length < 100) fail('FIT_COUNT');
  const triplets = [];
  for (let i = 0; i < rows.length; i++) {
    const anchor = rows[i];
    let positive = null, negative = null;
    const outside = i % 4 === 0;
    for (const candidate of rows) {
      if (candidate.id === anchor.id) continue;
      const score = dot(vectors.get(anchor.id), vectors.get(candidate.id));
      if (candidate.eventKey === anchor.eventKey && candidate.lang !== anchor.lang &&
          (!positive || score < positive.score ||
            score === positive.score && candidate.id < positive.id))
        positive = { id: candidate.id, score };
      if (candidate.eventKey !== anchor.eventKey &&
          (candidate.category === anchor.category) !== outside &&
          (!negative || score > negative.score ||
            score === negative.score && candidate.id < negative.id))
        negative = { id: candidate.id, score };
    }
    if (positive && negative) triplets.push({ anchor: anchor.id,
      positive: positive.id, negative: negative.id });
  }
  if (triplets.length < 100 || triplets.length < rows.length / 2)
    fail('FIT_TRIPLETS');
  return triplets;
}

export function fitDiagonal(rows, inputVectors) {
  const base = normalizeVectors(rows, inputVectors);
  const triplets = mineTriplets(rows, base);
  const parameters = new Float64Array(DIM);
  const first = new Float64Array(DIM), second = new Float64Array(DIM);
  for (let step = 1; step <= STEPS; step++) {
    const adapted = transform(rows, base, parameters);
    const gradient = new Float64Array(DIM);
    for (const item of triplets) {
      const result = tripletObjective(adapted.get(item.anchor),
        adapted.get(item.positive), adapted.get(item.negative));
      for (let k = 0; k < DIM; k++) gradient[k] += result.gradient[k] / triplets.length;
    }
    for (let k = 0; k < DIM; k++) gradient[k] += REGULARIZATION * parameters[k];
    const norm = Math.hypot(...gradient);
    if (!Number.isFinite(norm)) fail('NUMERIC');
    const scale = norm > 1 ? 1 / norm : 1;
    for (let k = 0; k < DIM; k++) {
      const g = gradient[k] * scale;
      first[k] = 0.9 * first[k] + 0.1 * g;
      second[k] = 0.999 * second[k] + 0.001 * g * g;
      const m = first[k] / (1 - 0.9 ** step);
      const v = second[k] / (1 - 0.999 ** step);
      parameters[k] = Math.max(-BOUND, Math.min(BOUND,
        parameters[k] - RATE * m / (Math.sqrt(v) + 1e-8)));
    }
  }
  return { parameters, steps: STEPS, triplets: triplets.length };
}
