// Offline fixed linear teacher transfer. Fit uses paired coordinates, not labels.
import { cholesky } from '../topic-metric-rethink-v1/core.js';
import { pairs, calibrate, evaluate } from '../compact-paraphrase-probe-v1/core.js';

export const POLICY = Object.freeze({ dimensions: 384, lambdas: Object.freeze([.01, .1, 1]),
  fitArticles: 475, calibrationArticles: 274, developmentArticles: 150, batchArticles: 64,
  ridgeScale: 'lambda-times-mean-centered-source-coordinate-variance',
  prediction: 'teacher-mean-plus-W-times-source-centered;unit-normalized',
  calibration: 'all-pairs-at-least20true-and98percent-observed-precision;whole-score-ties',
  grouping: 'strongest-cosine-edge-complete-link;no-neighbor-or-member-count',
});
const fail = code => { throw new TypeError(code); };
export function unit(vector, dimensions = POLICY.dimensions) {
  if (!vector || vector.length !== dimensions || [...vector].some(value => !Number.isFinite(value))) fail('VECTOR');
  const norm = Math.hypot(...vector);
  if (!(norm > 1e-9)) fail('VECTOR_NORM');
  return Float64Array.from(vector, value => value / norm);
}
export function pairedStatistics(rows, source, teacher, dimensions = POLICY.dimensions) {
  if (!Array.isArray(rows) || rows.length < 4 || new Set(rows.map(row => row.id)).size !== rows.length ||
      rows.some(row => typeof row.id !== 'string' || !row.id) || !(source instanceof Map) || !(teacher instanceof Map) ||
      !Number.isInteger(dimensions) || dimensions < 2 || dimensions > POLICY.dimensions) fail('FIT_ROWS');
  const x = rows.map(row => unit(source.get(row.id), dimensions));
  const y = rows.map(row => unit(teacher.get(row.id), dimensions));
  const meanX = new Float64Array(dimensions), meanY = new Float64Array(dimensions);
  for (let i = 0; i < rows.length; i++) for (let k = 0; k < dimensions; k++) {
    meanX[k] += x[i][k] / rows.length; meanY[k] += y[i][k] / rows.length;
  }
  const cxx = new Float64Array(dimensions ** 2), cyx = new Float64Array(dimensions ** 2);
  for (let i = 0; i < rows.length; i++) {
    const xc = Float64Array.from(x[i], (value, k) => value - meanX[k]);
    const yc = Float64Array.from(y[i], (value, k) => value - meanY[k]);
    for (let k = 0; k < dimensions; k++) {
      for (let j = 0; j <= k; j++) cxx[k * dimensions + j] += xc[k] * xc[j] / rows.length;
      for (let j = 0; j < dimensions; j++) cyx[j * dimensions + k] += yc[j] * xc[k] / rows.length;
    }
  }
  let trace = 0;
  for (let k = 0; k < dimensions; k++) {
    trace += cxx[k * dimensions + k];
    for (let j = 0; j < k; j++) cxx[j * dimensions + k] = cxx[k * dimensions + j];
  }
  if (!(trace > 1e-10) || [...cxx, ...cyx, ...meanX, ...meanY].some(value => !Number.isFinite(value))) fail('FIT_DEGENERATE');
  return { dimensions, rows: rows.length, meanX, meanY, cxx, cyx, varianceScale: trace / dimensions };
}
export function solveSymmetric(lower, right, dimensions) {
  if (lower?.length !== dimensions ** 2 || right?.length !== dimensions ||
      [...lower, ...right].some(value => !Number.isFinite(value))) fail('SOLVE');
  const forward = new Float64Array(dimensions), output = new Float64Array(dimensions);
  for (let k = 0; k < dimensions; k++) {
    if (!(lower[k * dimensions + k] > 0)) fail('SOLVE');
    let value = right[k];
    for (let j = 0; j < k; j++) value -= lower[k * dimensions + j] * forward[j];
    forward[k] = value / lower[k * dimensions + k];
  }
  for (let k = dimensions - 1; k >= 0; k--) {
    let value = forward[k];
    for (let j = k + 1; j < dimensions; j++) value -= lower[j * dimensions + k] * output[j];
    output[k] = value / lower[k * dimensions + k];
  }
  if ([...output].some(value => !Number.isFinite(value))) fail('SOLVE');
  return output;
}
export function fitRidge(statistics, lambda) {
  if (!POLICY.lambdas.includes(lambda) || !statistics || !(statistics.varianceScale > 0)) fail('RIDGE');
  const { dimensions, cxx, cyx } = statistics, ridge = lambda * statistics.varianceScale;
  const regularized = Float64Array.from(cxx);
  for (let k = 0; k < dimensions; k++) regularized[k * dimensions + k] += ridge;
  const lower = cholesky(regularized, dimensions), weights = new Float64Array(dimensions ** 2);
  for (let k = 0; k < dimensions; k++) weights.set(solveSymmetric(lower,
    cyx.subarray(k * dimensions, (k + 1) * dimensions), dimensions), k * dimensions);
  return { dimensions, lambda, ridge, weights, meanX: Float64Array.from(statistics.meanX),
    meanY: Float64Array.from(statistics.meanY) };
}
export function predicted(vector, model) {
  const source = unit(vector, model.dimensions), output = new Float64Array(model.dimensions);
  for (let k = 0; k < model.dimensions; k++) {
    let value = model.meanY[k];
    for (let j = 0; j < model.dimensions; j++) value += model.weights[k * model.dimensions + j] * (source[j] - model.meanX[j]);
    output[k] = value;
  }
  return unit(output, model.dimensions);
}
export function transfer(rows, vectors, model) {
  return new Map(rows.map(row => [row.id, predicted(vectors.get(row.id), model)]));
}
export function center(rows, vectors, mean) {
  return new Map(rows.map(row => {
    const source = unit(vectors.get(row.id), mean.length);
    return [row.id, unit(Float64Array.from(source, (value, k) => value - mean[k]), mean.length)];
  }));
}
export function alignment(rows, predictedVectors, teacherVectors) {
  let cosine = 0, mse = 0;
  for (const row of rows) {
    const a = unit(predictedVectors.get(row.id)), b = unit(teacherVectors.get(row.id));
    for (let k = 0; k < POLICY.dimensions; k++) { cosine += a[k] * b[k] / rows.length; mse += (a[k] - b[k]) ** 2 / rows.length; }
  }
  return { meanPredictionTeacherCosine: cosine, meanUnitSquaredError: mse };
}

function groupedIndices(rows, values, threshold) {
  const groups = rows.map((_, index) => [index]);
  const lookup = new Map(values.map(pair => [`${pair.i}:${pair.j}`, pair.score]));
  for (const pair of values) {
    if (pair.score < threshold) break;
    const a = groups.findIndex(group => group.includes(pair.i)), b = groups.findIndex(group => group.includes(pair.j));
    if (a === b || !groups[a].every(i => groups[b].every(j =>
      lookup.get(`${Math.min(i, j)}:${Math.max(i, j)}`) >= threshold))) continue;
    groups[a] = [...groups[a], ...groups[b]]; groups.splice(b, 1);
  }
  return groups;
}
export function assess(rows, vectors, threshold) {
  const values = pairs(rows, vectors), metrics = evaluate(rows, values, threshold), groups = groupedIndices(rows, values, threshold);
  const groupFor = new Map(groups.flatMap((group, index) => group.map(i => [i, index])));
  let sameFamilyFalsePairs = 0, outsideFamilyFalsePairs = 0, sameFamilyFalseTotal = 0, opposingTrueTotal = 0, opposingTrueJoined = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const joined = groupFor.get(i) === groupFor.get(j), same = rows[i].eventKey === rows[j].eventKey;
    if (!same && rows[i].family && rows[j].family) {
      if (rows[i].family === rows[j].family) { sameFamilyFalseTotal++; sameFamilyFalsePairs += Number(joined); }
      else outsideFamilyFalsePairs += Number(joined);
    }
    if (same && rows[i].viewpoint && rows[j].viewpoint && rows[i].viewpoint !== rows[j].viewpoint) {
      opposingTrueTotal++; opposingTrueJoined += Number(joined);
    }
  }
  return { ...metrics, sameFamilyDifferentEvent: { total: sameFamilyFalseTotal, joined: sameFamilyFalsePairs },
    outsideFamilyFalsePairs, opposingViewpointPairs: { total: opposingTrueTotal, joined: opposingTrueJoined } };
}
export function calibrateRepresentation(rows, vectors) { return calibrate(pairs(rows, vectors)); }
export function chooseUseful(methods) {
  const raw = methods['raw-E5'], diagonal = methods['old-diagonal'];
  if (!raw || !diagonal) fail('SELECTION');
  const candidates = Object.entries(methods).filter(([name, value]) => name.startsWith('ridge-') &&
    value.development.groupedFalse <= raw.development.groupedFalse && value.development.mixedPages <= raw.development.mixedPages &&
    value.authored.groupedFalse <= diagonal.authored.groupedFalse && value.authored.mixedPages <= diagonal.authored.mixedPages &&
    value.spentV6.groupedFalse === 0 && value.spentV6.mixedPages === 0 &&
    value.development.purePages > diagonal.development.purePages &&
    value.authored.groupedTrue >= diagonal.authored.groupedTrue && value.spentV6.groupedTrue >= diagonal.spentV6.groupedTrue);
  candidates.sort(([a, x], [b, y]) => y.development.purePages - x.development.purePages ||
    y.development.groupedTrue - x.development.groupedTrue || Number(b.slice(6)) - Number(a.slice(6)));
  return candidates[0]?.[0] ?? null;
}
