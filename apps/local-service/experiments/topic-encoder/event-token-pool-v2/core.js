import { attend } from '../event-token-pool-v1/core.js';
import { createHash } from 'node:crypto';

const DIM = 384;
const fail = code => { throw new TypeError(code); };
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();

export function partitionTrain(train) {
  const names = [...new Set(train.map(doc => doc.categories[0]))].sort((a, b) => {
    const left = sha256(a), right = sha256(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (names.length !== 8) fail('FAMILY_COUNT');
  const fitNames = new Set(names.slice(0, 6));
  const fit = train.filter(doc => fitNames.has(doc.categories[0]));
  const calibration = train.filter(doc => !fitNames.has(doc.categories[0]));
  if (fit.length !== 120 || calibration.length !== 40 ||
      new Set(fit.map(doc => doc.eventKey)).size !== 12 ||
      new Set(calibration.map(doc => doc.eventKey)).size !== 4)
    fail('FAMILY_SPLIT');
  return { fit, calibration };
}

export function first32TokenMap(documents, fullMap) {
  const result = new Map();
  for (const document of documents) {
    const item = fullMap.get(document.id);
    if (!item || !(item.states instanceof Float32Array) ||
        !Number.isInteger(item.count) || item.count < 1 || item.count > 64 ||
        item.states.length !== item.count * DIM) fail('TOKEN_STATES');
    const count = Math.min(item.count, 32);
    result.set(document.id, { count, states: item.states.slice(0, count * DIM) });
  }
  return result;
}

export function attendedVectors(documents, tokens, weights) {
  return new Map(documents.map(doc => [doc.id,
    attend(tokens.get(doc.id), weights).vector]));
}

export function pooledResidual(documents, attention, pooled) {
  const result = new Map();
  for (const document of documents) {
    const a = attention.get(document.id), p = pooled.get(document.id);
    if (!a || !p || a.length !== DIM || p.length !== DIM) fail('RESIDUAL_INPUT');
    const vector = new Float64Array(DIM);
    let square = 0;
    for (let k = 0; k < DIM; k++) {
      vector[k] = 0.75 * a[k] + 0.25 * p[k];
      if (!Number.isFinite(vector[k])) fail('RESIDUAL_INPUT');
      square += vector[k] * vector[k];
    }
    const norm = Math.sqrt(square);
    if (!(norm > 1e-9) || !Number.isFinite(norm)) fail('RESIDUAL_INPUT');
    for (let k = 0; k < DIM; k++) vector[k] /= norm;
    result.set(document.id, vector);
  }
  return result;
}

export function chooseDevelopmentVariant(reports) {
  const names = ['prefix-attention-32', 'attention64-pooled25'];
  const eligible = names.filter(name => {
    const report = reports[name];
    if (!report || report.abstained) return false;
    const d = report.denominators, e = report.edgeMetrics, c = report.components;
    const retrieval = report.retrieval;
    return d.articles === 40 && d.events === 4 && d.truePairs === 180 &&
      d.falsePairs === 600 && d.hardFalsePairs === 200 &&
      d.crossLanguageTruePairs === 160 && retrieval.eligible === 40 &&
      retrieval.rank1 === 40 && retrieval.top3 === 40 &&
      e.falseEdges === 0 && c.mixedGroups === 0 &&
      c.completeEvents >= 3 &&
      (c.completeEvents === 4 || e.trueEdges > 135);
  });
  if (!eligible.length) return { selected: null, reason: 'NO_DEVELOPMENT_IMPROVEMENT' };
  eligible.sort((left, right) => {
    const a = reports[left], b = reports[right];
    return b.components.completeEvents - a.components.completeEvents ||
      b.edgeMetrics.trueEdges - a.edgeMetrics.trueEdges ||
      b.edgeMetrics.crossLanguageTrueEdges - a.edgeMetrics.crossLanguageTrueEdges ||
      names.indexOf(left) - names.indexOf(right);
  });
  return { selected: eligible[0], reason: 'EXPLORATORY_DEVELOPMENT_SELECTION' };
}
