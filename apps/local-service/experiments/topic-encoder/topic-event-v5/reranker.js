// Offline numeric diagnostic, no text or corpus vocabulary is learned.
import { weightedOverlap } from '../topic-focus-shadow/core.js';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
function anchors(title) {
  return new Set((title.match(/\p{Lu}[\p{L}\p{N}-]{2,}/gu) ?? [])
    .map(item => item.toLowerCase()).filter(item =>
      !['the', 'whether', 'how', 'county', 'city', 'street', 'ward', 'market'].includes(item)));
}
export function features(sources, facets, idf) {
  const byId = new Map(sources.map(item => [item.id, item]));
  const cosine = (a, b) => dot(byId.get(a).embedding.values, byId.get(b).embedding.values);
  const host = id => {
    try { return new URL(byId.get(id).url).hostname; } catch { return null; }
  };
  const ranks = new Map(sources.map(a => [a.id, sources.filter(b => a.id !== b.id)
    .map(b => ({ id: b.id, value: cosine(a.id, b.id) }))
    .sort((x, y) => y.value - x.value || x.id.localeCompare(y.id))]));
  // Offline pair-candidate budget. This fixed rank is a known scaling flaw:
  // a diverse same-event crowd can evict valid pairs. The matcher below is a
  // diagnostic, not a production Topic decision.
  const near = id => {
    const list = ranks.get(id);
    if (list.length <= 3) return list;
    const boundary = list[2].value;
    return list.filter((item, index) => index < 3 || item.value >= boundary - 1e-10);
  };
  const result = [];
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const [a, b] = [sources[i].id, sources[j].id].sort();
    const rankA = ranks.get(a).findIndex(item => item.id === b);
    const rankB = ranks.get(b).findIndex(item => item.id === a);
    if (!near(a).some(item => item.id === b) || !near(b).some(item => item.id === a))
      continue;
    const bNear = new Set(near(b).map(item => item.id));
    const possible = near(a).filter(item => bNear.has(item.id)).map(item => item.id)
      .filter(id => !host(id) || (host(id) !== host(a) && host(id) !== host(b)));
    const common = [];
    for (const id of possible) {
      const title = byId.get(id).title.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
      if (common.some(previous => {
        const other = byId.get(previous).title.normalize('NFKC').toLowerCase()
          .replace(/\s+/gu, ' ').trim();
        return (host(id) && host(id) === host(previous)) || title === other;
      })) continue;
      common.push(id);
    }
    const minWitness = Math.max(0, ...common.map(c =>
      Math.min(cosine(a, c), cosine(b, c))));
    const overlap = weightedOverlap(facets.get(a), facets.get(b), idf);
    const left = anchors(byId.get(a).title), right = anchors(byId.get(b).title);
    const sharedAnchor = [...left].some(term => right.has(term)) ? 1 : 0;
    result.push({ a, b, values: [cosine(a, b), 2 - Math.min(2, rankA) - Math.min(2, rankB),
      Math.min(2, common.length), overlap, sharedAnchor, minWitness,
      cosine(a, b) - ranks.get(a)[0].value,
      cosine(a, b) - ranks.get(b)[0].value] });
  }
  return result;
}

const sigmoid = value => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, value))));
export function fit(rows) {
  const dimensions = rows[0].values.length;
  const mean = Array.from({ length: dimensions }, (_, i) =>
    rows.reduce((sum, row) => sum + row.values[i], 0) / rows.length);
  const scale = Array.from({ length: dimensions }, (_, i) =>
    Math.max(1e-5, Math.sqrt(rows.reduce((sum, row) =>
      sum + (row.values[i] - mean[i]) ** 2, 0) / rows.length)));
  const standardized = rows.map(row => row.values.map((value, i) =>
    (value - mean[i]) / scale[i]));
  const weights = Array(dimensions + 1).fill(0);
  const positives = rows.filter(row => row.label === 1).length;
  const negatives = rows.length - positives;
  if (!positives || !negatives) throw new Error('Need both pair classes');
  for (let epoch = 0; epoch < 1200; epoch++) {
    const gradient = Array(weights.length).fill(0);
    for (let j = 0; j < rows.length; j++) {
      const vector = standardized[j];
      const z = weights[0] + vector.reduce((sum, value, i) =>
        sum + value * weights[i + 1], 0);
      const balance = rows[j].label ? rows.length / (2 * positives) :
        rows.length / (2 * negatives);
      const error = (sigmoid(z) - rows[j].label) * balance;
      gradient[0] += error;
      for (let i = 0; i < dimensions; i++) gradient[i + 1] += error * vector[i];
    }
    const rate = 0.08 / Math.sqrt(1 + epoch / 100);
    weights[0] -= rate * gradient[0] / rows.length;
    for (let i = 1; i < weights.length; i++)
      weights[i] -= rate * (gradient[i] / rows.length + 0.02 * weights[i]);
  }
  const score = row => sigmoid(weights[0] + row.values.reduce((sum, value, i) =>
    sum + weights[i + 1] * (value - mean[i]) / scale[i], 0));
  const cutoff = Math.max(...rows.filter(row => !row.label).map(score)) + 1e-9;
  return { weights, mean, scale, cutoff, score };
}
