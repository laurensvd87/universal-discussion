// Offline two-view E5 pair experiment. Only aggregate counts may leave memory.
const WEIGHTS = [0, 0.25, 0.5, 0.75, 1];
const GAP = 0.003;
const DIM = 384;
const normalize = x => {
  if (!x || x.length !== DIM || [...x].some(v => !Number.isFinite(v))) throw new Error('Invalid vector');
  const norm = Math.hypot(...x);
  if (norm < 1e-9) throw new Error('Invalid vector');
  return Float64Array.from(x, v => v / norm);
};
const cosine = (a, b) => {
  let sum = 0;
  for (let i = 0; i < DIM; i++) sum += a[i] * b[i];
  return sum;
};

export function pairs(rows, shortVectors, longVectors) {
  const short = rows.map(r => normalize(shortVectors.get(r.id)));
  const long = rows.map(r => normalize(longVectors.get(r.id)));
  const out = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
    out.push({ short: cosine(short[i], short[j]), long: cosine(long[i], long[j]),
      same: rows[i].eventKey === rows[j].eventKey,
      sameCategory: rows[i].category === rows[j].category,
      crossLanguage: rows[i].lang !== rows[j].lang });
  return out;
}

export const score = (pair, weight) => weight * pair.short + (1 - weight) * pair.long;

export function trainPolicy(trainPairs) {
  if (!trainPairs.some(p => p.same) || !trainPairs.some(p => !p.same))
    throw new Error('Insufficient train pairs');
  let selected = null;
  for (const weight of WEIGHTS) {
    let maximumNegative = -Infinity;
    for (const pair of trainPairs) if (!pair.same)
      maximumNegative = Math.max(maximumNegative, score(pair, weight));
    const threshold = maximumNegative + GAP;
    let tp = 0;
    for (const pair of trainPairs) if (pair.same && score(pair, weight) >= threshold) tp++;
    // Ties prefer the established short-input view.
    if (!selected || tp > selected.trainTp || tp === selected.trainTp && weight > selected.weight)
      selected = { weight, threshold, trainTp: tp };
  }
  return selected;
}

export function countPairs(pairList, admitted) {
  const out = { tp: 0, fp: 0, fn: 0, tn: 0, sameCategoryFp: 0,
    crossLanguageTp: 0, crossLanguageTotal: 0 };
  for (const pair of pairList) {
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
