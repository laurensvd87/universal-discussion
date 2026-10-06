// A small project-owned metric head over the existing 384D E5 embedding.
// Training uses only local synthetic pair labels; inference takes one E5 vector.
export const DIMENSIONS = 384;
export const SCHEMA = 'synthetic-e5-diagonal-projection/v1';

function valid(vector) {
  return vector?.length === DIMENSIONS && [...vector].every(Number.isFinite) &&
    Math.abs(Math.hypot(...vector) - 1) < 0.01;
}

export function trainProjection(documents, vectors) {
  if (!Array.isArray(documents) || documents.length < 4 || documents.length > 64 ||
      documents.some(d => typeof d?.id !== 'string' || typeof d.family !== 'string' ||
        typeof d.topicLabel !== 'string' || !valid(vectors.get(d.id))))
    throw new TypeError('Invalid projection training data');
  const positive = new Float64Array(DIMENSIONS);
  const negative = new Float64Array(DIMENSIONS);
  let positivePairs = 0, hardNegativePairs = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    if (a.family !== b.family) continue;
    const same = a.topicLabel === b.topicLabel;
    const total = same ? positive : negative;
    const va = vectors.get(a.id), vb = vectors.get(b.id);
    for (let k = 0; k < DIMENSIONS; k++) total[k] += (va[k] - vb[k]) ** 2;
    if (same) positivePairs++; else hardNegativePairs++;
  }
  if (!positivePairs || !hardNegativePairs) throw new Error('Both pair classes required');
  // Freeze a moderate gain before measuring. Cap weights to avoid singular
  // directions on a 20-document training set. This is not a confidence model.
  const weights = Float64Array.from(positive, (sum, k) => Math.exp(Math.max(-1,
    Math.min(1, 256 * (negative[k] / hardNegativePairs - sum / positivePairs)))));
  return { schema: SCHEMA, weights, trainingDocuments: documents.length,
    positivePairs, hardNegativePairs };
}

export function project(vector, head) {
  if (!valid(vector) || head?.schema !== SCHEMA || head.weights?.length !== DIMENSIONS ||
      [...head.weights].some(value => !Number.isFinite(value) || value <= 0))
    throw new TypeError('Invalid projection input');
  const raw = Float64Array.from(vector, (value, k) => value * Math.sqrt(head.weights[k]));
  const norm = Math.hypot(...raw);
  return Float64Array.from(raw, value => value / norm);
}

export function dot(a, b) {
  if (!valid(a) || !valid(b)) throw new TypeError('Invalid similarity input');
  return a.reduce((sum, value, k) => sum + value * b[k], 0);
}
