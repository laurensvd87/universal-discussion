// Offline, vector-only neighborhood pair admission. No fixed member count.
export const DIM = 384;
const RADII = [0.75, 0.80, 0.85];
const SUPPORT_WEIGHTS = [0, 0.04, 0.08, 0.16];
const DISTINCTIVE_WEIGHTS = [0, 0.05, 0.10];
const GAP = 0.003;

export function normalize(vector) {
  if (!vector || vector.length !== DIM || [...vector].some(x => !Number.isFinite(x)))
    throw new Error('Invalid vector');
  const norm = Math.hypot(...vector);
  if (norm < 1e-9) throw new Error('Invalid vector');
  return Float64Array.from(vector, x => x / norm);
}
const dot = (a, b) => { let sum = 0; for (let k = 0; k < DIM; k++) sum += a[k] * b[k]; return sum; };
const bitCount = value => {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export function neighborhood(rows, rawVectors) {
  const n = rows.length, vectors = rows.map(r => normalize(rawVectors.get(r.id)));
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    matrix[i][j] = matrix[j][i] = dot(vectors[i], vectors[j]);
  const words = Math.ceil(n / 32);
  const radiusViews = RADII.map(radius => {
    const bits = Array.from({ length: n }, () => new Uint32Array(words));
    const degrees = new Uint16Array(n), means = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (matrix[i][j] >= radius) {
      bits[i][j >>> 5] |= 1 << (j & 31);
      bits[j][i >>> 5] |= 1 << (i & 31);
      degrees[i]++; degrees[j]++;
      means[i] += matrix[i][j]; means[j] += matrix[i][j];
    }
    for (let i = 0; i < n; i++) if (degrees[i]) means[i] /= degrees[i];
    return { radius, bits, degrees, means };
  });
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const similarity = matrix[i][j];
    const local = radiusViews.map(v => {
      let common = 0;
      for (let w = 0; w < words; w++) common += bitCount(v.bits[i][w] & v.bits[j][w]);
      // Both endpoints are in one another's sets when directly linked. They
      // cannot be a shared third-party witness, so the intersection is clean.
      const union = v.degrees[i] + v.degrees[j] - common;
      const support = union ? common / union : 0;
      // A pair must be unusually close for both endpoints. No rank or top-K cap.
      const distinctive = v.degrees[i] && v.degrees[j]
        ? Math.max(-1, Math.min(1, Math.min(similarity - v.means[i], similarity - v.means[j]) / .15)) : 0;
      return [support, distinctive];
    });
    pairs.push({ i, j, similarity, local,
      same: rows[i].eventKey === rows[j].eventKey,
      sameCategory: rows[i].category === rows[j].category,
      crossLanguage: rows[i].lang !== rows[j].lang });
  }
  return pairs;
}

export const score = (pair, policy) => pair.similarity +
  policy.supportWeight * pair.local[policy.radiusIndex][0] +
  policy.distinctiveWeight * pair.local[policy.radiusIndex][1];

export function selectPolicy(trainPairs) {
  if (!trainPairs.some(p => p.same) || !trainPairs.some(p => !p.same))
    throw new Error('Insufficient train pairs');
  let winner = null;
  for (let radiusIndex = 0; radiusIndex < RADII.length; radiusIndex++)
    for (const supportWeight of SUPPORT_WEIGHTS)
      for (const distinctiveWeight of DISTINCTIVE_WEIGHTS) {
        const candidate = { radiusIndex, supportWeight, distinctiveWeight };
        let maxNegative = -Infinity;
        for (const pair of trainPairs) if (!pair.same)
          maxNegative = Math.max(maxNegative, score(pair, candidate));
        const threshold = maxNegative + GAP;
        let tp = 0;
        for (const pair of trainPairs) if (pair.same && score(pair, candidate) >= threshold) tp++;
        if (!winner || tp > winner.trainTp) winner = { ...candidate, threshold, trainTp: tp };
      }
  return winner;
}

export function countPairs(pairs, admitted) {
  const out = { tp: 0, fp: 0, fn: 0, tn: 0, sameCategoryFp: 0,
    crossLanguageTp: 0, crossLanguageTotal: 0 };
  for (const pair of pairs) {
    const yes = admitted(pair);
    out[pair.same ? yes ? 'tp' : 'fn' : yes ? 'fp' : 'tn']++;
    if (yes && !pair.same && pair.sameCategory) out.sameCategoryFp++;
    if (pair.same && pair.crossLanguage) {
      out.crossLanguageTotal++;
      if (yes) out.crossLanguageTp++;
    }
  }
  return out;
}
