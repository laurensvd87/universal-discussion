// Offline pooled-vector metric research. Labels are used only for fit/evaluation.
import { createHash } from 'node:crypto';

export const DIM = 384;
export const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new TypeError(code); };
export function unit(vector) {
  if (!vector || vector.length !== DIM || [...vector].some(v => !Number.isFinite(v))) fail('VECTOR');
  const norm = Math.hypot(...vector);
  if (!(norm > 1e-10)) fail('VECTOR_NORM');
  return Float64Array.from(vector, v => v / norm);
}
export const cosine = (a, b) => { let s = 0; for (let k = 0; k < DIM; k++) s += a[k] * b[k]; return Math.max(-1, Math.min(1, s)); };

export function covarianceFit(rows, vectors) {
  if (!Array.isArray(rows) || rows.length < 8 || new Set(rows.map(r => r.id)).size !== rows.length) fail('FIT_ROWS');
  const samples = rows.map(row => unit(vectors.get(row.id)));
  const mean = new Float64Array(DIM), labels = new Map();
  for (let i = 0; i < rows.length; i++) {
    if (typeof rows[i].eventKey !== 'string' || !rows[i].eventKey) fail('FIT_LABEL');
    const indices = labels.get(rows[i].eventKey) ?? []; indices.push(i); labels.set(rows[i].eventKey, indices);
    for (let k = 0; k < DIM; k++) mean[k] += samples[i][k] / rows.length;
  }
  const global = new Float64Array(DIM * DIM), within = new Float64Array(DIM * DIM);
  const addOuter = (matrix, vector, weight) => {
    for (let k = 0; k < DIM; k++) for (let j = 0; j <= k; j++) matrix[k * DIM + j] += weight * vector[k] * vector[j];
  };
  for (const sample of samples) addOuter(global, Float64Array.from(sample, (v, k) => v - mean[k]), 1 / rows.length);
  // Equal event weight prevents the largest multilingual event dominating nuisance axes.
  const eligible = [...labels.values()].filter(indices => indices.length > 1);
  if (eligible.length < 2) fail('FIT_EVENTS');
  for (const indices of eligible) {
    const eventMean = new Float64Array(DIM);
    for (const i of indices) for (let k = 0; k < DIM; k++) eventMean[k] += samples[i][k] / indices.length;
    for (const i of indices) addOuter(within, Float64Array.from(samples[i], (v, k) => v - eventMean[k]), 1 / (eligible.length * indices.length));
  }
  for (const matrix of [global, within]) for (let k = 0; k < DIM; k++) for (let j = 0; j < k; j++) matrix[j * DIM + k] = matrix[k * DIM + j];
  return { mean, global, within, fitRows: rows.length, fitEvents: labels.size };
}

export function cholesky(matrix, dimension = DIM) {
  if (!matrix || matrix.length !== dimension * dimension) fail('MATRIX');
  const lower = new Float64Array(matrix.length);
  for (let i = 0; i < dimension; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i * dimension + j];
    for (let k = 0; k < j; k++) value -= lower[i * dimension + k] * lower[j * dimension + k];
    if (i === j) { if (!(value > 1e-15) || !Number.isFinite(value)) fail('NOT_POSITIVE_DEFINITE'); lower[i * dimension + j] = Math.sqrt(value); }
    else lower[i * dimension + j] = value / lower[j * dimension + j];
  }
  return lower;
}
export function makeMetric(fit, name) {
  if (name === 'centered') return { name, mean: fit.mean, lower: null };
  const match = /^(global|within)-shrink-(50|90)$/u.exec(name);
  if (!match) fail('METRIC');
  const covariance = fit[match[1]], shrink = Number(match[2]) / 100;
  let trace = 0; for (let k = 0; k < DIM; k++) trace += covariance[k * DIM + k];
  if (!(trace > 1e-10)) fail('COVARIANCE_TRACE');
  const regularized = Float64Array.from(covariance, v => (1 - shrink) * v);
  for (let k = 0; k < DIM; k++) regularized[k * DIM + k] += shrink * trace / DIM;
  return { name, mean: fit.mean, lower: cholesky(regularized) };
}
export function metricVector(vector, metric) {
  const source = unit(vector), output = new Float64Array(DIM);
  if (!metric || metric.mean?.length !== DIM || metric.lower && metric.lower.length !== DIM * DIM) fail('METRIC');
  for (let k = 0; k < DIM; k++) {
    let value = source[k] - metric.mean[k];
    if (metric.lower) {
      for (let j = 0; j < k; j++) value -= metric.lower[k * DIM + j] * output[j];
      value /= metric.lower[k * DIM + k];
    }
    output[k] = value;
  }
  return unit(output);
}
export const transformMetric = (rows, vectors, metric) => new Map(rows.map(row => [row.id, metricVector(vectors.get(row.id), metric)]));

export function selectFreshRethink(all, exposedCohorts, budget = 300) {
  if (!Array.isArray(all) || all.length !== 4687 || !Array.isArray(exposedCohorts) || budget !== 300) fail('SELECTION');
  const allById = new Map(all.map(row => [row.id, row]));
  const exposed = exposedCohorts.flat();
  if (exposed.some(row => allById.get(row.id) !== row)) fail('SELECTION_IDENTITY');
  const exposedEvents = new Set(exposed.map(row => row.eventKey)), exposedInputs = new Set(exposed.map(row => row.duplicateKey));
  const events = new Map();
  for (const row of all) { const members = events.get(row.eventKey) ?? []; members.push(row); events.set(row.eventKey, members); }
  for (const cohort of exposedCohorts) {
    const ids = new Set(cohort.map(row => row.id));
    if ([...events.values()].some(members => members.some(row => ids.has(row.id)) && !members.every(row => ids.has(row.id)))) fail('PARTIAL_EXPOSURE');
  }
  const available = [...events].filter(([key, members]) => !exposedEvents.has(key) && members.every(row => !exposedInputs.has(row.duplicateKey)));
  available.sort(([a], [b]) => sha(`topic-metric-rethink-v1\0${a}`).localeCompare(sha(`topic-metric-rethink-v1\0${b}`)));
  const selected = [];
  for (const [, members] of available) if (selected.length + members.length <= budget) selected.push(...members);
  if (selected.length < 250) fail('SELECTION_BOUND');
  selected.sort((a,b) => a.eventKey.localeCompare(b.eventKey) || a.duplicateKey.localeCompare(b.duplicateKey) || a.id.localeCompare(b.id));
  return { documents: selected, events: new Set(selected.map(r => r.eventKey)).size, availableEvents: available.length,
    availableArticles: available.reduce((n, [,r]) => n + r.length, 0), excludedEvents: exposedEvents.size };
}

// Development selection permits a small, explicit precision cost; it does not
// impose complete-event reconstruction or reinterpret an inspected test as fresh.
export function selectDevelopment(methods) {
  const entries = Object.entries(methods).filter(([name, value]) => !['raw-body-E5', 'diagonal-body-E5'].includes(name) &&
    value.coverage.grouped.falsePairs <= 5 && value.coverage.grouped.articlesInMixedGroups <= 6 &&
    value.coverage.grouped.falsePairs <= .02 * Math.max(1, value.coverage.grouped.truePairs + value.coverage.grouped.falsePairs));
  entries.sort(([a,x],[b,y]) => y.coverage.grouped.articlesInPureNonSingletonGroups - x.coverage.grouped.articlesInPureNonSingletonGroups ||
    y.coverage.grouped.truePairs - x.coverage.grouped.truePairs || x.coverage.grouped.falsePairs - y.coverage.grouped.falsePairs || a.localeCompare(b));
  return entries[0]?.[0] ?? null;
}
