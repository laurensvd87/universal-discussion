// Offline research. Train labels fit the small head; features and grouping
// never read labels. makePairs attaches labels only for training/evaluation.
export function dot(a, b) {
  let value = 0;
  for (let i = 0; i < a.length; i++) value += a[i] * b[i];
  return value;
}

const words = text => (text.normalize('NFKD').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
  .filter(word => !/^\d{4}$/.test(word));

export function buildLexicon(rows) {
  const counts = new Map();
  for (const row of rows) for (const word of new Set(words(`${row.title} ${row.body}`)))
    counts.set(word, (counts.get(word) ?? 0) + 1);
  return { counts, size: rows.length };
}

export function pairFeatures(a, b, va, vb, lexicon) {
  const titleA = new Set(words(a.title)), titleB = new Set(words(b.title));
  const allA = new Set(words(`${a.title} ${a.body}`));
  const allB = new Set(words(`${b.title} ${b.body}`));
  const weight = word => Math.log((lexicon.size + 1) / ((lexicon.counts.get(word) ?? 0) + 1));
  const overlap = (left, right) => [...left].filter(word => right.has(word));
  const weighted = tokens => tokens.reduce((sum, word) => sum + weight(word), 0);
  const titleOverlap = overlap(titleA, titleB);
  const crossOverlap = overlap(titleA, allB).concat(overlap(titleB, allA));
  const bodyOverlap = overlap(allA, allB);
  const numsA = new Set([...allA].filter(word => /^\d+$/u.test(word)));
  const numsB = new Set([...allB].filter(word => /^\d+$/u.test(word)));
  return [dot(va, vb), Math.log1p(weighted(titleOverlap)),
    Math.log1p(weighted(crossOverlap) / 2), Math.log1p(weighted(bodyOverlap)),
    Math.log1p(titleOverlap.length),
    numsA.size && numsB.size && ![...numsA].some(value => numsB.has(value)) ? 1 : 0];
}

export function fitModel(examples, options = {}) {
  // A tiny ridge logistic head. Hard adjacent-event pairs get equal class mass
  // to positives; unrelated negatives get smaller mass. This is a reranker,
  // not a probability calibration or a production model.
  const width = examples[0]?.features.length;
  if (!width || examples.some(row => row.features.length !== width)) throw new TypeError('Invalid examples');
  const mean = Array(width).fill(0), scale = Array(width).fill(0);
  for (const { features } of examples) for (let j = 0; j < width; j++) mean[j] += features[j] / examples.length;
  for (const { features } of examples) for (let j = 0; j < width; j++)
    scale[j] += (features[j] - mean[j]) ** 2 / examples.length;
  for (let j = 0; j < width; j++) scale[j] = Math.max(Math.sqrt(scale[j]), 0.05);
  const counts = [0, 0, 0];
  for (const row of examples) counts[row.positive ? 0 : row.hard ? 1 : 2]++;
  if (counts.some(count => count === 0)) throw new TypeError('Missing training class');
  const weight = Array(width + 1).fill(0);
  const passes = options.passes ?? 600;
  for (let pass = 0; pass < passes; pass++) {
    const gradient = Array(width + 1).fill(0);
    for (const row of examples) {
      const x = row.features.map((value, j) => (value - mean[j]) / scale[j]);
      const z = weight[0] + x.reduce((sum, value, j) => sum + value * weight[j + 1], 0);
      const predicted = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const classWeight = row.positive ? 0.45 / counts[0] : row.hard ? 0.45 / counts[1] : 0.10 / counts[2];
      const error = (predicted - Number(row.positive)) * classWeight;
      gradient[0] += error;
      for (let j = 0; j < width; j++) gradient[j + 1] += error * x[j];
    }
    weight[0] -= 5 * gradient[0];
    for (let j = 1; j < weight.length; j++) weight[j] -= 5 * (gradient[j] + 0.005 * weight[j]);
  }
  return { mean, scale, weight };
}

export function score(model, features) {
  return model.weight[0] + features.reduce((sum, value, j) =>
    sum + model.weight[j + 1] * (value - model.mean[j]) / model.scale[j], 0);
}

export function makePairs(rows, vectors, lexicon, model) {
  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const features = pairFeatures(a, b, vectors.get(a.id), vectors.get(b.id), lexicon);
    pairs.push({ a: a.id, b: b.id, features, score: model ? score(model, features) : null,
      positive: a.topicLabel === b.topicLabel, hard: a.family === b.family && a.topicLabel !== b.topicLabel });
  }
  return pairs;
}

export function groupRows(rows, pairs, rule) {
  const ids = rows.map(row => row.id).sort();
  const byPair = new Map(pairs.map(pair => [`${pair.a < pair.b ? pair.a : pair.b}\0${pair.a < pair.b ? pair.b : pair.a}`, pair]));
  const get = (a, b) => byPair.get(`${a < b ? a : b}\0${a < b ? b : a}`);
  let groups = ids.map(id => [id]);
  // Candidate retrieval is separate: pair scores are already computed; the
  // admission gate below can abstain even for the nearest candidate.
  const edges = pairs.filter(pair => pair.score >= rule.cutoff && pair.features[0] >= rule.cosineFloor)
    .sort((a, b) => b.score - a.score || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  for (const edge of edges) {
    const left = groups.findIndex(group => group.includes(edge.a));
    const right = groups.findIndex(group => group.includes(edge.b));
    if (left === right) continue;
    const cross = groups[left].flatMap(a => groups[right].map(b => get(a, b)));
    if (cross.every(pair => pair.score >= rule.floor && pair.features[0] >= rule.cosineFloor) &&
        groups[left].every(a => groups[right].some(b => get(a, b).score >= rule.cutoff)) &&
        groups[right].every(b => groups[left].some(a => get(a, b).score >= rule.cutoff))) {
      groups[left] = [...groups[left], ...groups[right]].sort();
      groups.splice(right, 1);
    }
  }
  return groups.sort((a, b) => a[0].localeCompare(b[0]));
}

export function pairCounts(pairs, cutoff, cosineFloor = -1) {
  const admitted = pairs.filter(pair => pair.score >= cutoff && pair.features[0] >= cosineFloor);
  return { true: admitted.filter(pair => pair.positive).length,
    false: admitted.filter(pair => !pair.positive).length,
    hardFalse: admitted.filter(pair => pair.hard).length,
    trueTotal: pairs.filter(pair => pair.positive).length,
    falseTotal: pairs.filter(pair => !pair.positive).length,
    hardTotal: pairs.filter(pair => pair.hard).length };
}
