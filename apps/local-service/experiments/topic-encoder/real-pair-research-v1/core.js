// Offline pair admission research. Never serialize documents, vectors, or fitted weights.
const tokens = value => (value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 80);
const numbers = value => new Set(value.match(/\p{N}+(?:[.,]\p{N}+)*/gu) ?? []);
const names = value => new Set((value.match(/\b\p{Lu}[\p{L}\p{M}]{2,}/gu) ?? [])
  .map(x => x.toLocaleLowerCase()));
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common++;
  return common / (a.size + b.size - common);
};
const agreement = (a, b) => {
  if (!a.size || !b.size) return 0;
  return overlap(a, b) > 0 ? 1 : -1;
};
export const view = (doc, vector) => {
  if (!vector || vector.length !== 384 || [...vector].some(v => !Number.isFinite(v)))
    throw new Error('Invalid vector');
  const norm = Math.hypot(...vector);
  if (norm < 1e-9) throw new Error('Invalid vector');
  return { id: doc.id, vector, norm, title: new Set(tokens(doc.title)),
    lead: new Set(tokens(doc.lead)), numbers: numbers(doc.title), names: names(doc.title) };
};
export function features(a, b) {
  let dot = 0;
  for (let i = 0; i < 384; i++) dot += a.vector[i] * b.vector[i];
  const cosine = dot / (a.norm * b.norm);
  return [cosine, overlap(a.title, b.title), overlap(a.lead, b.lead),
    overlap(new Set([...a.title, ...a.lead]), new Set([...b.title, ...b.lead])),
    agreement(a.numbers, b.numbers), agreement(a.names, b.names)];
}

const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
const probability = (model, f) => sigmoid(model.weights[0] + f.reduce((sum, x, i) =>
  sum + model.weights[i + 1] * ((x - model.means[i]) / model.scales[i]), 0));

export function fit(trainPairs) {
  const positives = trainPairs.filter(p => p.same);
  const negatives = trainPairs.filter(p => !p.same);
  if (!positives.length || !negatives.length) throw new Error('Insufficient train pairs');
  // Include every same-category negative and high-cosine negatives, with a fixed
  // work budget. Category is used for train sampling only, never as a feature.
  const ranked = negatives.filter(p => p.sameCategory || p.f[0] >= 0.78)
    .sort((a, b) => b.f[0] - a.f[0] || a.index - b.index).slice(0, 12000);
  if (!ranked.length) ranked.push(...negatives.sort((a, b) => b.f[0] - a.f[0]).slice(0, 12000));
  const sample = [...positives, ...ranked];
  const dimension = sample[0].f.length;
  const means = Array.from({ length: dimension }, (_, i) => sample.reduce((s, p) => s + p.f[i], 0) / sample.length);
  const scales = means.map((mean, i) => Math.max(0.05,
    Math.sqrt(sample.reduce((s, p) => s + (p.f[i] - mean) ** 2, 0) / sample.length)));
  const weights = new Float64Array(dimension + 1);
  for (let epoch = 0; epoch < 500; epoch++) {
    const gradient = new Float64Array(weights.length);
    for (const [group, target] of [[positives, 1], [ranked, 0]]) for (const p of group) {
      const error = (probability({ weights, means, scales }, p.f) - target) / (2 * group.length);
      gradient[0] += error;
      for (let i = 0; i < dimension; i++) gradient[i + 1] += error * (p.f[i] - means[i]) / scales[i];
    }
    for (let i = 1; i < weights.length; i++) gradient[i] += 0.02 * weights[i];
    for (let i = 0; i < weights.length; i++) weights[i] -= 0.15 * gradient[i];
  }
  const model = { weights, means, scales };
  let maximumNegative = 0;
  for (const p of negatives) maximumNegative = Math.max(maximumNegative, probability(model, p.f));
  // Train-only, precision-first margin. Cutoff above 1 means deliberate abstention.
  const threshold = Math.max(0.95, maximumNegative + 0.02);
  return { model, threshold, trainPositivePairs: positives.length,
    trainHardNegativePairs: ranked.length, trainNegativePairs: negatives.length };
}

export function makePairs(documents, vectors) {
  const views = documents.map(doc => view(doc, vectors.get(doc.id)));
  const pairs = [];
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    pairs.push({ index: pairs.length, f: features(views[i], views[j]),
      same: a.eventKey === b.eventKey, sameCategory: a.category === b.category,
      crossLanguage: a.lang !== b.lang });
  }
  return pairs;
}

export function scorePairs(pairs, predicate) {
  const result = { tp: 0, fp: 0, fn: 0, tn: 0, sameCategoryFp: 0,
    crossLanguageTp: 0, crossLanguageTotal: 0 };
  for (const p of pairs) {
    const admitted = predicate(p);
    result[p.same ? admitted ? 'tp' : 'fn' : admitted ? 'fp' : 'tn']++;
    if (!p.same && p.sameCategory && admitted) result.sameCategoryFp++;
    if (p.same && p.crossLanguage) {
      result.crossLanguageTotal++;
      if (admitted) result.crossLanguageTp++;
    }
  }
  return { ...result, precision: result.tp + result.fp ? result.tp / (result.tp + result.fp) : null,
    recall: result.tp + result.fn ? result.tp / (result.tp + result.fn) : null };
}

export const admit = (fitted, pair) => probability(fitted.model, pair.f) >= fitted.threshold;
