// Offline, vector-only supervised low-rank residual. No article text enters the artifact.
export const D = 384;
export const RANK = 8;
export const LANGUAGES = ['en', 'nl', 'de', 'fr', 'es'];
const EPS = 1e-9;

export function normalize(v) {
  if (v.length !== D) throw new Error('Wrong vector dimension');
  const n = Math.hypot(...v);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid vector');
  return Float64Array.from(v, x => x / n);
}
export function dot(a, b) { let s = 0; for (let i = 0; i < D; i++) s += a[i] * b[i]; return s; }
export function focusInput(row) {
  return { id: row.id, title: row.title,
    body: row.body.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 384) };
}
export function language(row) { return row.id.split('-')[1]; }
export function checkSplits(train, validation) {
  if (train.length !== 80 || validation.length !== 40) throw new Error('Wrong corpus size');
  const families = new Set(train.map(x => x.family));
  if (validation.some(x => families.has(x.family))) throw new Error('Family leakage');
  for (const [name, rows] of [['train', train], ['validation', validation]]) {
    if (new Set(rows.map(x => x.id)).size !== rows.length ||
        rows.some(x => x.split !== name || !LANGUAGES.includes(language(x)))) throw new Error('Bad split');
  }
}
export function pairs(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    out.push({ a: rows[i].id, b: rows[j].id,
      positive: rows[i].topicLabel === rows[j].topicLabel,
      hard: rows[i].family === rows[j].family && rows[i].topicLabel !== rows[j].topicLabel,
      cross: language(rows[i]) !== language(rows[j]) });
  }
  return out;
}

// Contrastive scatter: same-event (including opposed viewpoints) minus
// same-family adjacent-event cross products. A fixed ridge shrinks the
// eigendirection gains toward identity at inference.
export function trainProjection(rows, vectors, rank = RANK) {
  const samples = pairs(rows).filter(p => p.positive || p.hard);
  const np = samples.filter(p => p.positive).length, nn = samples.length - np;
  const matrix = new Float64Array(D * D);
  for (const p of samples) {
    const a = vectors.get(p.a), b = vectors.get(p.b);
    const w = (p.positive ? 1 / np : -1 / nn) * 0.5;
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++)
      matrix[i * D + j] += w * (a[i] * b[j] + b[i] * a[j]);
  }
  const axes = [], values = [];
  const multiply = x => {
    const y = new Float64Array(D);
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) y[i] += matrix[i * D + j] * x[j];
    return y;
  };
  const orthogonal = x => {
    for (const axis of axes) { const c = dot(x, axis); for (let i = 0; i < D; i++) x[i] -= c * axis[i]; }
    return normalize(x);
  };
  for (let k = 0; k < rank; k++) {
    let x = orthogonal(Float64Array.from({ length: D }, (_, i) => Math.sin((i + 1) * (k + 3))));
    for (let t = 0; t < 60; t++) x = orthogonal(multiply(multiply(x)));
    const value = dot(x, multiply(x));
    // Eigenvector orientation is immaterial, but fixed orientation makes the artifact stable.
    if (x.find(v => Math.abs(v) > 1e-7) < 0) x = x.map(v => -v);
    axes.push(x); values.push(value);
  }
  return { axes, values };
}
export function project(x, model, strength) {
  const y = Float64Array.from(x);
  const scale = Math.max(...model.values.map(Math.abs));
  if (scale <= 0 || strength === 0) return normalize(y);
  for (let k = 0; k < model.axes.length; k++) {
    const axis = model.axes[k], gain = Math.max(-0.45, Math.min(0.45,
      strength * model.values[k] / scale / (1 + strength * 0.5)));
    const c = gain * dot(x, axis);
    for (let i = 0; i < D; i++) y[i] += c * axis[i];
  }
  return normalize(y);
}
export function cutoff(rows, vectors) {
  return Math.max(...pairs(rows).filter(p => !p.positive)
    .map(p => dot(vectors.get(p.a), vectors.get(p.b)))) + EPS;
}
export function evaluate(rows, vectors, threshold) {
  const all = pairs(rows), accepted = all.filter(p => dot(vectors.get(p.a), vectors.get(p.b)) >= threshold);
  const byLang = Object.fromEntries(LANGUAGES.map(lang => [lang, { rank1: 0, crossRank1: 0, queries: 0 }]));
  for (const row of rows) {
    const ranked = rows.filter(x => x.id !== row.id).map(x => ({ row: x, score: dot(vectors.get(row.id), vectors.get(x.id)) }))
      .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
    const lang = language(row), cross = ranked.filter(x => language(x.row) !== lang);
    byLang[lang].queries++;
    byLang[lang].rank1 += Number(ranked[0].row.topicLabel === row.topicLabel);
    byLang[lang].crossRank1 += Number(cross[0].row.topicLabel === row.topicLabel);
  }
  return { rank1: Object.values(byLang).reduce((n, x) => n + x.rank1, 0),
    crossLanguageRank1: Object.values(byLang).reduce((n, x) => n + x.crossRank1, 0),
    pairs: { tp: accepted.filter(p => p.positive).length, totalTrue: all.filter(p => p.positive).length,
      fp: accepted.filter(p => !p.positive).length, totalFalse: all.filter(p => !p.positive).length,
      hardFp: accepted.filter(p => p.hard).length, totalHard: all.filter(p => p.hard).length,
      crossTp: accepted.filter(p => p.positive && p.cross).length,
      totalCrossTrue: all.filter(p => p.positive && p.cross).length }, byLanguage: byLang };
}
