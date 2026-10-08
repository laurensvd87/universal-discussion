// Ephemeral, vector-only triplet metric. Gold labels never enter inference.
export const DIM = 384;
const dot = (a, b) => { let sum = 0; for (let i = 0; i < DIM; i++) sum += a[i] * b[i]; return sum; };
export function normalize(x) {
  if (!x || x.length !== DIM || [...x].some(v => !Number.isFinite(v))) throw new Error('Invalid vector');
  const length = Math.hypot(...x);
  if (length < 1e-9) throw new Error('Invalid vector');
  return Float64Array.from(x, v => v / length);
}
export const cosine = (a, b) => dot(a, b);

export function triplets(rows, vectors) {
  const result = [];
  for (const anchor of rows) {
    const a = vectors.get(anchor.id);
    const positive = rows.filter(x => x.id !== anchor.id && x.eventKey === anchor.eventKey)
      .map(x => ({ row: x, score: dot(a, vectors.get(x.id)) }))
      .sort((x, y) => x.score - y.score || x.row.id.localeCompare(y.row.id))[0];
    const negative = rows.filter(x => x.eventKey !== anchor.eventKey &&
      (x.category === anchor.category || dot(a, vectors.get(x.id)) >= .78))
      .map(x => ({ row: x, score: dot(a, vectors.get(x.id)) }))
      .sort((x, y) => y.score - x.score || x.row.id.localeCompare(y.row.id))[0];
    if (positive && negative) result.push({ anchor: anchor.id,
      positive: positive.row.id, negative: negative.row.id });
  }
  return result;
}

export function train(rows, vectors) {
  const base = new Map(rows.map(r => [r.id, normalize(vectors.get(r.id))]));
  const examples = triplets(rows, base);
  if (examples.length < 2) throw new Error('Insufficient train triplets');
  const differences = examples.map(t => {
    const a = base.get(t.anchor), p = base.get(t.positive), n = base.get(t.negative);
    return { positive: Float64Array.from(a, (v, i) => v - p[i]),
      negative: Float64Array.from(a, (v, i) => v - n[i]) };
  });
  // Signed contrastive covariance rewards dimensions separating confusable
  // developments, penalizing dimensions varying within one event. Matrix-vector
  // products avoid materializing a dense 384x384 matrix.
  const multiply = x => {
    const y = new Float64Array(DIM);
    for (const d of differences) {
      const np = dot(d.negative, x), pp = dot(d.positive, x);
      for (let i = 0; i < DIM; i++) y[i] += (d.negative[i] * np - d.positive[i] * pp) / differences.length;
    }
    return y;
  };
  const axes = [];
  const orthogonal = x => {
    for (const axis of axes) {
      const c = dot(x, axis);
      for (let i = 0; i < DIM; i++) x[i] -= c * axis[i];
    }
    const norm = Math.hypot(...x);
    return norm > 1e-10 ? x.map(v => v / norm) : null;
  };
  const shift = differences.reduce((s, d) => s + dot(d.positive, d.positive) +
    dot(d.negative, d.negative), 0) / differences.length + 1e-9;
  for (let k = 0; k < 8; k++) {
    let x = orthogonal(Float64Array.from({ length: DIM }, (_, i) =>
      Math.sin((i + 1) * (k + 3)) + Math.cos((i + 1) * (k + 7))));
    if (!x) break;
    for (let step = 0; step < 48; step++) {
      const y = multiply(x);
      for (let i = 0; i < DIM; i++) y[i] += shift * x[i];
      x = orthogonal(y);
      if (!x) break;
    }
    if (!x || dot(x, multiply(x)) <= 1e-6) break;
    axes.push(x);
  }
  return { axes, tripletCount: examples.length };
}

export function transform(vector, axes, strength) {
  const x = normalize(vector), y = Float64Array.from(x);
  for (const axis of axes) {
    const c = strength * dot(x, axis);
    for (let i = 0; i < DIM; i++) y[i] += c * axis[i];
  }
  return normalize(y);
}

export function pairCounts(rows, vectors, threshold) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0, sameCategoryFp: 0,
    crossLanguageTp: 0, crossLanguageTotal: 0 };
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], same = a.eventKey === b.eventKey;
    const admitted = dot(vectors.get(a.id), vectors.get(b.id)) >= threshold;
    counts[same ? admitted ? 'tp' : 'fn' : admitted ? 'fp' : 'tn']++;
    if (!same && admitted && a.category === b.category) counts.sameCategoryFp++;
    if (same && a.lang !== b.lang) {
      counts.crossLanguageTotal++;
      if (admitted) counts.crossLanguageTp++;
    }
  }
  return counts;
}

export function trainCutoff(rows, vectors) {
  let maximum = -Infinity;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
    if (rows[i].eventKey !== rows[j].eventKey)
      maximum = Math.max(maximum, dot(vectors.get(rows[i].id), vectors.get(rows[j].id)));
  if (!Number.isFinite(maximum)) throw new Error('Insufficient train negatives');
  return maximum + .005;
}

export function selectTrainMethod(rows, rawVectors) {
  const normalized = new Map(rows.map(r => [r.id, normalize(rawVectors.get(r.id))]));
  const model = train(rows, normalized);
  let winner;
  for (const strength of [0, .25, .5, 1]) {
    const projected = new Map(rows.map(r => [r.id, transform(normalized.get(r.id), model.axes, strength)]));
    const threshold = trainCutoff(rows, projected);
    const counts = pairCounts(rows, projected, threshold);
    if (!winner || counts.tp > winner.trainTp) winner = { model, strength, threshold,
      trainTp: counts.tp, trainPositiveTotal: counts.tp + counts.fn,
      trainNegativeTotal: counts.fp + counts.tn };
  }
  return winner;
}
