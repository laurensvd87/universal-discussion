// Offline pair experiment. Labels are used for training/evaluation only.
export const FEATURES = ['focusCos', 'titleCos', 'numberOverlap', 'numberConflict', 'nameOverlap', 'nameConflict'];
const norm = s => s.normalize('NFKC').toLocaleLowerCase('und');
const tokens = s => [...s.normalize('NFKC').matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}-]*/gu)].map(x => x[0]);
const functionWords = new Set('The A An And Or Of In On At To For From With After Before By As Is Are Was Were Has Have Had This That Its It Their His Her They He She Der Die Das Den Dem Des Und Eine Ein Einer Einem Nach Vor Bei Mit Für Von Im Am Zum Zur Ist Sind Hat Haben Een De Het En Van Voor Na Bij Met Op Als Is Zijn Heeft Le La Les Un Une Des Du De Et Pour Après Avant Avec Sur Dans Est Sont A Ont El Los Las Un Una Del De Y Para Tras Antes Con En Es Son Ha Han'.split(/\s+/u).map(norm));
export function evidence(row) {
  const text = `${row.title} ${row.body.slice(0, 384)}`;
  const numerals = new Set((text.match(/\b\d+(?:[.,]\d+)?\b/gu) || []).map(x => x.replace(',', '.')));
  // Capitalization is a language-neutral, deliberately weak proper-name proxy.
  const names = new Set(tokens(text).filter((x, i) => i > 0 && /^\p{Lu}/u.test(x) && x.length >= 3 && !functionWords.has(norm(x))).map(norm));
  return { numerals, names };
}
function overlap(a, b) { const common = [...a].filter(x => b.has(x)).length; return common / Math.max(1, Math.min(a.size, b.size)); }
function conflict(a, b) { return Number(a.size > 0 && b.size > 0 && ![...a].some(x => b.has(x))); }
export function cosine(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }
export function pairFeatures(a, b, views) {
  const ea = views.evidence.get(a.id), eb = views.evidence.get(b.id);
  return [cosine(views.focus.get(a.id), views.focus.get(b.id)), cosine(views.title.get(a.id), views.title.get(b.id)),
    overlap(ea.numerals, eb.numerals), conflict(ea.numerals, eb.numerals),
    overlap(ea.names, eb.names), conflict(ea.names, eb.names)];
}
export function pairs(rows, views) {
  const out = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    out.push({ a: a.id, b: b.id, positive: a.topicLabel === b.topicLabel,
      hard: a.family === b.family && a.topicLabel !== b.topicLabel,
      cross: a.id.split('-')[1] !== b.id.split('-')[1],
      opposed: a.viewpoint !== b.viewpoint, f: pairFeatures(a, b, views) });
  }
  return out;
}
export function score(f, model) { return model.bias + f.reduce((s, x, i) => s + x * model.weights[i], 0); }
export function fit(trainPairs) {
  // Fixed, small linear model; class-balanced logistic gradient, with hard negatives
  // weighted twice as much as other negatives. No labels outside TRAIN enter fit.
  const positive = trainPairs.filter(p => p.positive), negative = trainPairs.filter(p => !p.positive);
  const hard = negative.filter(p => p.hard), easy = negative.filter(p => !p.hard);
  const model = { bias: 0, weights: [1, 0.5, 0.2, -0.2, 0.2, -0.2] };
  const groups = [[positive, 0.5], [hard, 0.35], [easy, 0.15]];
  for (let epoch = 0; epoch < 1200; epoch++) {
    let db = 0; const dw = model.weights.map(() => 0);
    for (const [group, mass] of groups) for (const p of group) {
      const y = p.positive ? 1 : 0;
      const z = Math.max(-30, Math.min(30, score(p.f, model)));
      const error = (1 / (1 + Math.exp(-z)) - y) * mass / group.length;
      db += error; for (let k = 0; k < dw.length; k++) dw[k] += error * p.f[k];
    }
    const rate = 0.7 / (1 + epoch / 200);
    model.bias -= rate * db;
    for (let k = 0; k < dw.length; k++) model.weights[k] -= rate * (dw[k] + 0.002 * model.weights[k]);
  }
  const maxNegative = Math.max(...negative.map(p => score(p.f, model)));
  // A visible safety margin beyond the highest TRAIN false pair.
  model.cutoff = maxNegative + 0.05;
  return model;
}
export function metrics(all, model) {
  const accepted = all.filter(p => score(p.f, model) >= model.cutoff);
  const truePairs = all.filter(p => p.positive), falsePairs = all.filter(p => !p.positive);
  const tp = accepted.filter(p => p.positive), fp = accepted.filter(p => !p.positive);
  return { tp: tp.length, possibleTrue: truePairs.length, fp: fp.length, possibleFalse: falsePairs.length,
    crossTp: tp.filter(p => p.cross).length, possibleCross: truePairs.filter(p => p.cross).length,
    opposedTp: tp.filter(p => p.opposed).length, possibleOpposed: truePairs.filter(p => p.opposed).length,
    hardFp: fp.filter(p => p.hard).length, possibleHard: falsePairs.filter(p => p.hard).length,
    accepted: accepted.length };
}
