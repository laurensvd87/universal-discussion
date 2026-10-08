// Offline diagonal metric on a single, already-packaged E5 view. Labels are
// used for training/evaluation only; inference takes vectors alone.
export const DIMENSION = 384;
export const LEAD_CHARACTERS = 384;
export const EPSILON = 1e-9;

export function focusInput(row) {
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.body !== 'string')
    throw new TypeError('Invalid article');
  return { id: row.id, title: row.title,
    body: row.body.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, LEAD_CHARACTERS) };
}

export function language(row) { return row.id.split('-')[1]; }

export function validateSplits(train, validation) {
  if (train.length !== 80 || validation.length !== 40) throw new Error('Unexpected corpus size');
  const trainFamilies = new Set(train.map(row => row.family));
  if (validation.some(row => trainFamilies.has(row.family))) throw new Error('Family leakage');
  for (const [name, rows] of [['train', train], ['validation', validation]]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length ||
        rows.some(row => row.split !== name || !['en', 'nl', 'de', 'fr', 'es'].includes(language(row))))
      throw new Error('Invalid split');
  }
}

export function normalize(vector) {
  if (vector.length !== DIMENSION) throw new Error('Wrong vector dimension');
  const norm = Math.hypot(...vector);
  if (!(norm > 0) || !Number.isFinite(norm)) throw new Error('Invalid vector');
  return Float64Array.from(vector, x => x / norm);
}

export function transform(vector, weights) {
  if (weights.length !== DIMENSION || weights.some(w => !(w > 0) || !Number.isFinite(w)))
    throw new Error('Invalid metric');
  return normalize(vector.map((x, i) => x * Math.sqrt(weights[i])));
}

export function dot(a, b) {
  let value = 0;
  for (let i = 0; i < DIMENSION; i++) value += a[i] * b[i];
  return value;
}

export function pairs(rows) {
  const result = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    result.push({ a: a.id, b: b.id, positive: a.topicLabel === b.topicLabel,
      hardNegative: a.family === b.family && a.topicLabel !== b.topicLabel,
      languages: [language(a), language(b)] });
  }
  return result;
}

// Train on same-event positives and adjacent-event hard negatives only. A
// diagonal metric has 384 positive coefficients; the L2 anchor to 1 constrains
// drift from raw E5. All pairs contribute, independent of article order.
export function trainMetric(rows, vectors, { epochs = 120, rate = 0.06,
  regularization = 0.12, margin = 0.08 } = {}) {
  const examples = pairs(rows).filter(p => p.positive || p.hardNegative);
  const base = new Map(rows.map(row => [row.id, normalize(vectors.get(row.id))]));
  const weights = new Float64Array(DIMENSION).fill(1);
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradient = new Float64Array(DIMENSION);
    for (const pair of examples) {
      const a = base.get(pair.a), b = base.get(pair.b);
      let ab = 0, aa = 0, bb = 0;
      for (let k = 0; k < DIMENSION; k++) {
        ab += weights[k] * a[k] * b[k];
        aa += weights[k] * a[k] * a[k];
        bb += weights[k] * b[k] * b[k];
      }
      const score = ab / Math.sqrt(aa * bb);
      const sign = pair.positive ? 1 : -1;
      // Smooth hinge, with the same fixed margin for both classes. Balanced
      // class weighting prevents 25 hard negatives/family drowning 20 positives.
      const target = pair.positive ? 0.90 : 0.82;
      const slope = sign * (score - target) < margin ? -sign : 0;
      if (!slope) continue;
      const balance = pair.positive ? 1 / 160 : 1 / 200;
      for (let k = 0; k < DIMENSION; k++) {
        const ds = a[k] * b[k] / Math.sqrt(aa * bb) -
          score * (a[k] * a[k] / aa + b[k] * b[k] / bb) / 2;
        gradient[k] += balance * slope * ds;
      }
    }
    for (let k = 0; k < DIMENSION; k++) {
      weights[k] = Math.max(0.25, Math.min(4,
        weights[k] - rate * (gradient[k] + regularization * (weights[k] - 1))));
    }
  }
  return weights;
}

export function zeroFalseCutoff(rows, vectors) {
  let maxNegative = -Infinity;
  for (const pair of pairs(rows)) if (!pair.positive) {
    maxNegative = Math.max(maxNegative, dot(vectors.get(pair.a), vectors.get(pair.b)));
  }
  return maxNegative + EPSILON;
}

export function evaluate(rows, vectors, cutoff) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const all = pairs(rows);
  const accepted = all.filter(p => dot(vectors.get(p.a), vectors.get(p.b)) >= cutoff);
  const counts = { truePairs: all.filter(p => p.positive).length,
    trueAdmitted: accepted.filter(p => p.positive).length,
    falseAdmitted: accepted.filter(p => !p.positive).length,
    hardFalseAdmitted: accepted.filter(p => p.hardNegative).length };
  const byLanguage = Object.fromEntries(['en', 'nl', 'de', 'fr', 'es'].map(lang =>
    [lang, { queries: 0, trueRank1: 0, trueTop3: 0, crossLanguageQueries: 0,
      crossLanguageTrueRank1: 0, truePairAdmitted: 0, falsePairAdmitted: 0,
      hardFalsePairAdmitted: 0 }]));
  for (const row of rows) {
    const lang = language(row);
    const ranked = rows.filter(other => other.id !== row.id)
      .map(other => ({ row: other, score: dot(vectors.get(row.id), vectors.get(other.id)) }))
      .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
    const hit = item => item.row.topicLabel === row.topicLabel;
    byLanguage[lang].queries++;
    byLanguage[lang].trueRank1 += Number(hit(ranked[0]));
    byLanguage[lang].trueTop3 += Number(ranked.slice(0, 3).some(hit));
    const cross = ranked.filter(item => language(item.row) !== lang);
    byLanguage[lang].crossLanguageQueries++;
    byLanguage[lang].crossLanguageTrueRank1 += Number(hit(cross[0]));
  }
  for (const pair of accepted) for (const lang of pair.languages) {
    byLanguage[lang][pair.positive ? 'truePairAdmitted' : 'falsePairAdmitted']++;
    if (pair.hardNegative) byLanguage[lang].hardFalsePairAdmitted++;
  }
  return { ...counts, byLanguage };
}
