// Vector-only offline contrastive projection. The low-rank residual remains anchored to identity.
export const D = 384;
export const RANK = 8;
export const STRENGTHS = [0, 0.25, 0.5, 1, 2, 4];
export const SAFETY_GAP = 0.002;
export const LANGUAGES = ['en', 'nl', 'de', 'fr', 'es'];

export function normalize(x) {
  if (x.length !== D) throw new Error('Wrong dimension');
  const n = Math.hypot(...x);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid vector');
  return Float64Array.from(x, y => y / n);
}
export function dot(a, b) { let sum = 0; for (let i = 0; i < D; i++) sum += a[i] * b[i]; return sum; }
export function focusInput(row) {
  return { id: row.id, title: row.title,
    body: row.body.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 384) };
}
export function lang(row) { return row.id.split('-')[1]; }
export function pairs(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
    out.push({ a: rows[i].id, b: rows[j].id,
      positive: rows[i].topicLabel === rows[j].topicLabel,
      hard: rows[i].family === rows[j].family && rows[i].topicLabel !== rows[j].topicLabel,
      cross: lang(rows[i]) !== lang(rows[j]) });
  return out;
}
export function checkTrain(rows) {
  if (rows.length !== 200 || new Set(rows.map(x => x.id)).size !== rows.length ||
      rows.some(x => x.split !== 'train' || !LANGUAGES.includes(lang(x)))) throw new Error('Invalid train');
  const families = new Set(rows.map(x => x.family));
  if (families.size !== 16 || new Set(rows.map(x => x.topicLabel)).size !== 40) throw new Error('Invalid train topics');
}
export function checkValidation(rows, train, expectedLength) {
  if (rows.length !== expectedLength || new Set(rows.map(x => x.id)).size !== rows.length ||
      rows.some(x => x.split !== 'validation' || !LANGUAGES.includes(lang(x)))) throw new Error('Invalid validation');
  const families = new Set(train.map(x => x.family));
  if (rows.some(x => families.has(x.family))) throw new Error('Family leakage');
}

// Maximize hard-event separation relative to within-event variation. The
// covariance of within-event pair differences is subtracted from that of
// adjacent-event pair differences. Only positive eigendirections are retained:
// unlike v2's signed cross-product residual, this cannot collapse a hard
// difference direction. A capped gain and train-only safety gap regularize it.
export function trainProjection(rows, vectors) {
  const examples = pairs(rows).filter(p => p.positive || p.hard);
  const positives = examples.filter(p => p.positive).length;
  const negatives = examples.length - positives;
  const matrix = new Float64Array(D * D);
  for (const p of examples) {
    const a = vectors.get(p.a), b = vectors.get(p.b);
    const w = p.hard ? 1 / negatives : -1 / positives;
    for (let i = 0; i < D; i++) {
      const di = a[i] - b[i];
      for (let j = 0; j < D; j++) matrix[i * D + j] += w * di * (a[j] - b[j]);
    }
  }
  const axes = [], eigenvalues = [];
  const multiply = x => {
    const y = new Float64Array(D);
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) y[i] += matrix[i * D + j] * x[j];
    return y;
  };
  const orthogonal = x => {
    for (const u of axes) { const c = dot(x, u); for (let i = 0; i < D; i++) x[i] -= c * u[i]; }
    return normalize(x);
  };
  // Shifted power iteration retrieves largest algebraic eigenvalues even when
  // the contrastive matrix has strong negative eigenvalues.
  let bound = 0;
  for (let i = 0; i < D; i++) {
    let row = 0; for (let j = 0; j < D; j++) row += Math.abs(matrix[i * D + j]);
    bound = Math.max(bound, row);
  }
  for (let k = 0; k < RANK; k++) {
    let x = orthogonal(Float64Array.from({ length: D }, (_, i) => Math.sin((i + 1) * (k + 3))));
    for (let t = 0; t < 75; t++) {
      const y = multiply(x);
      for (let i = 0; i < D; i++) y[i] += bound * x[i];
      x = orthogonal(y);
    }
    const value = dot(x, multiply(x));
    if (!(value > 0)) break;
    if (x.find(v => Math.abs(v) > 1e-7) < 0) x = x.map(v => -v);
    axes.push(x); eigenvalues.push(value);
  }
  return { axes, eigenvalues };
}
export function project(x, model, strength) {
  const y = Float64Array.from(x);
  const top = model.eigenvalues[0];
  if (!top || strength === 0) return normalize(y);
  for (let k = 0; k < model.axes.length; k++) {
    const axis = model.axes[k];
    const gain = Math.min(0.4, strength * model.eigenvalues[k] / top / (1 + strength));
    const c = gain * dot(x, axis);
    for (let i = 0; i < D; i++) y[i] += c * axis[i];
  }
  return normalize(y);
}
export function cutoff(rows, vectors, gap = 0) {
  const negatives = pairs(rows).filter(p => !p.positive);
  return Math.max(...negatives.map(p => dot(vectors.get(p.a), vectors.get(p.b)))) + gap + 1e-9;
}
export function evaluate(rows, vectors, threshold) {
  const all = pairs(rows), accepted = all.filter(p => dot(vectors.get(p.a), vectors.get(p.b)) >= threshold);
  const byLanguage = Object.fromEntries(LANGUAGES.map(l => [l, { queries: 0, rank1: 0, crossRank1: 0 }]));
  for (const row of rows) {
    const ranked = rows.filter(x => x.id !== row.id)
      .map(x => ({ row: x, score: dot(vectors.get(row.id), vectors.get(x.id)) }))
      .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
    const cross = ranked.filter(x => lang(x.row) !== lang(row));
    const cell = byLanguage[lang(row)]; cell.queries++;
    cell.rank1 += Number(ranked[0].row.topicLabel === row.topicLabel);
    cell.crossRank1 += Number(cross[0].row.topicLabel === row.topicLabel);
  }
  const parent = new Map(rows.map(x => [x.id, x.id]));
  const root = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  for (const p of accepted) parent.set(root(p.a), root(p.b));
  const groups = new Map();
  for (const row of rows) {
    const id = root(row.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const topics = new Map();
  for (const row of rows) {
    if (!topics.has(row.topicLabel)) topics.set(row.topicLabel, []);
    topics.get(row.topicLabel).push(row);
  }
  const exactTopics = [...topics.values()].filter(gold => groups.has(root(gold[0].id)) &&
    groups.get(root(gold[0].id)).length === gold.length && gold.every(x => root(x.id) === root(gold[0].id))).length;
  return { rank1: Object.values(byLanguage).reduce((n, x) => n + x.rank1, 0),
    crossRank1: Object.values(byLanguage).reduce((n, x) => n + x.crossRank1, 0), byLanguage,
    pairs: { tp: accepted.filter(p => p.positive).length, trueTotal: all.filter(p => p.positive).length,
      fp: accepted.filter(p => !p.positive).length, falseTotal: all.filter(p => !p.positive).length,
      hardFp: accepted.filter(p => p.hard).length, hardTotal: all.filter(p => p.hard).length,
      crossTp: accepted.filter(p => p.positive && p.cross).length,
      crossTrueTotal: all.filter(p => p.positive && p.cross).length },
    partition: { exactTopics, totalTopics: topics.size, groups: groups.size,
      mixedGroups: [...groups.values()].filter(g => new Set(g.map(x => x.topicLabel)).size > 1).length } };
}
