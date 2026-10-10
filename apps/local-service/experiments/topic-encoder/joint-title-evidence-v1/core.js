import { createHash } from 'node:crypto';
export const POLICY = Object.freeze({ fitArticleBudget: 200, calibrationArticleBudget: 100,
  freshArticleBudget: 300, retrievalFloor: 0.90, maxEvaluationPairs: 12000,
  fitPositivesPerAnchor: 2, fitNegativesPerAnchor: 3, steps: 120,
  learningRate: 0.03, regularization: 0.02, headCalibrationGap: 0.1, cosineCalibrationGap: 0.003 });
const hash = value => createHash('sha256').update(value).digest('hex');
const invalid = () => { throw new TypeError('JOINT_CORE'); };
export const pairKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
export const cosine = (a, b) => {
  if (!a || !b || a.length !== 384 || b.length !== 384) invalid();
  let score = 0;
  for (let k = 0; k < 384; k++) score += a[k] * b[k];
  if (!Number.isFinite(score)) invalid();
  return score;
};
export function wholeEvents(rows, budget, domain, excluded = []) {
  if (!Array.isArray(rows) || !Number.isInteger(budget) || budget < 1 || typeof domain !== 'string') invalid();
  const excludedEvents = new Set(excluded.map(row => row.eventKey));
  const excludedKeys = new Set(excluded.map(row => row.duplicateKey));
  const events = new Map();
  for (const row of rows) {
    if (!row?.id || !row.eventKey || !row.duplicateKey) invalid();
    if (!events.has(row.eventKey)) events.set(row.eventKey, []);
    events.get(row.eventKey).push(row);
  }
  const eligible = [...events].filter(([key, members]) => !excludedEvents.has(key) &&
    members.every(row => !excludedKeys.has(row.duplicateKey)))
    .sort(([a], [b]) => hash(`${domain}\0${a}`).localeCompare(hash(`${domain}\0${b}`)));
  const chosen = [];
  for (const [, members] of eligible) if (chosen.length + members.length <= budget) chosen.push(...members);
  return chosen.sort((a, b) => a.id.localeCompare(b.id));
}
export function allPairs(rows, raw, adapted) {
  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    pairs.push({ a, b, key: pairKey(a.id, b.id), raw: cosine(raw.get(a.id), raw.get(b.id)),
      adapted: cosine(adapted.get(a.id), adapted.get(b.id)), same: a.eventKey === b.eventKey,
      sameCategory: a.category === b.category, crossLanguage: a.lang !== b.lang });
  }
  return pairs;
}
export function evaluationCandidates(pairs) {
  const chosen = pairs.filter(pair => Math.max(pair.raw, pair.adapted) >= POLICY.retrievalFloor)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (chosen.length > POLICY.maxEvaluationPairs) throw new TypeError('PAIR_WORK_BUDGET');
  return chosen;
}
export function fitCandidates(rows, pairs) {
  const selected = new Set();
  for (const row of rows) {
    const incident = pairs.filter(pair => pair.a.id === row.id || pair.b.id === row.id);
    const positive = incident.filter(pair => pair.same).sort((a, b) => a.raw - b.raw || a.key.localeCompare(b.key));
    if (positive.length) {
      selected.add(positive[0].key);
      selected.add(positive.at(-1).key);
    }
    const negative = incident.filter(pair => !pair.same).sort((a, b) =>
      Number(b.sameCategory) - Number(a.sameCategory) || Math.max(b.raw, b.adapted) - Math.max(a.raw, a.adapted) || a.key.localeCompare(b.key));
    for (const pair of negative.slice(0, POLICY.fitNegativesPerAnchor)) selected.add(pair.key);
  }
  return pairs.filter(pair => selected.has(pair.key)).sort((a, b) => a.key.localeCompare(b.key));
}
export const HEADS = Object.freeze(['vectors', 'rank-vectors', 'joint', 'joint-vectors']);
export function headFeatures(pair, kind) {
  if (!HEADS.includes(kind)) invalid();
  const vectors = [pair.raw, pair.adapted];
  if (kind === 'vectors') return Float64Array.from(vectors);
  if (!pair.joint || pair.joint.hidden?.length !== 768) invalid();
  const rank = [pair.joint.rankMean, pair.joint.rankDifference];
  const out = kind === 'rank-vectors' ? [...rank, ...vectors] :
    kind === 'joint' ? pair.joint.hidden : [...pair.joint.hidden, ...rank, ...vectors];
  if ([...out].some(value => !Number.isFinite(value))) invalid();
  return Float64Array.from(out);
}
const sigmoid = value => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
export function fitHead(pairs, kind) {
  const examples = pairs.map(pair => ({ x: headFeatures(pair, kind), y: Number(pair.same) }));
  const positive = examples.filter(example => example.y).length, negative = examples.length - positive;
  if (!positive || !negative) invalid();
  const dimensions = examples[0].x.length, mean = new Float64Array(dimensions), scale = new Float64Array(dimensions);
  for (const item of examples) for (let k = 0; k < dimensions; k++) mean[k] += item.x[k] / examples.length;
  for (const item of examples) for (let k = 0; k < dimensions; k++) scale[k] += (item.x[k] - mean[k]) ** 2 / examples.length;
  for (let k = 0; k < dimensions; k++) scale[k] = Math.max(1e-5, Math.sqrt(scale[k]));
  for (const item of examples) item.x = Float64Array.from(item.x, (value, k) => Math.max(-5, Math.min(5, (value - mean[k]) / scale[k])));
  const weights = new Float64Array(dimensions + 1), first = new Float64Array(weights.length), second = new Float64Array(weights.length);
  for (let step = 1; step <= POLICY.steps; step++) {
    const gradient = new Float64Array(weights.length);
    for (const item of examples) {
      let logit = weights[dimensions];
      for (let k = 0; k < dimensions; k++) logit += weights[k] * item.x[k];
      const delta = (sigmoid(logit) - item.y) / (2 * (item.y ? positive : negative));
      for (let k = 0; k < dimensions; k++) gradient[k] += delta * item.x[k];
      gradient[dimensions] += delta;
    }
    for (let k = 0; k < weights.length; k++) {
      const g = gradient[k] + (k < dimensions ? POLICY.regularization * weights[k] : 0);
      first[k] = 0.9 * first[k] + 0.1 * g; second[k] = 0.999 * second[k] + 0.001 * g * g;
      weights[k] -= POLICY.learningRate * first[k] / (1 - 0.9 ** step) /
        (Math.sqrt(second[k] / (1 - 0.999 ** step)) + 1e-8);
    }
  }
  return { kind, dimensions, weights, mean, scale, positive, negative };
}
export function headScore(model, pair) {
  const x = headFeatures(pair, model.kind);
  let logit = model.weights[model.dimensions];
  for (let k = 0; k < model.dimensions; k++) logit += model.weights[k] * Math.max(-5,
    Math.min(5, (x[k] - model.mean[k]) / model.scale[k]));
  if (!Number.isFinite(logit)) invalid();
  return logit;
}
export function calibrationGate(pairs, score, gap) {
  const negative = pairs.filter(pair => !pair.same).map(score);
  if (!negative.length) return { threshold: Infinity, eligibleNegatives: 0 };
  return { threshold: Math.max(...negative) + gap, eligibleNegatives: negative.length };
}
export function ranking(pairs, score) {
  const ranked = [...pairs].sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key));
  const total = ranked.filter(pair => pair.same).length;
  let tp = 0, sum = 0;
  for (let i = 0; i < ranked.length; i++) if (ranked[i].same) { tp++; sum += tp / (i + 1); }
  return { pairs: ranked.length, truePairs: total, falsePairs: ranked.length - total,
    averagePrecision: total ? sum / total : null };
}
