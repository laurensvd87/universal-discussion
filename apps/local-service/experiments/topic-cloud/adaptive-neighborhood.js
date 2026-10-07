// Synthetic, fresh-batch shadow only. This module creates no Topic IDs or writes.
import { planAdaptiveTopics } from '../../src/domain/adaptive-topics.js';

const FLOOR = 0.90;
const TIGHT = 0.94;
const MARGIN = 0.04;
const COPY = 0.995;
const EPSILON = 1e-12;
const key = ids => ids.join('\0');
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const normalize = values => {
  const magnitude = Math.hypot(...values);
  if (!magnitude || !Number.isFinite(magnitude)) throw new TypeError('Invalid vector');
  return values.map(value => value / magnitude);
};

export function syntheticSource(id, coordinates, url = `https://example.test/${id}`) {
  if (coordinates.length > 384) throw new TypeError('Invalid dimensions');
  const values = normalize([...coordinates, ...Array(384 - coordinates.length).fill(0)]);
  return { id, url, provenance: 'owner-local-page-embedding/v1',
    extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } };
}

function partition(sources, floor = FLOOR, separation = true) {
  const ordered = [...sources].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(ordered.map(source => [source.id, source]));
  if (byId.size !== ordered.length) throw new TypeError('Duplicate source');
  const score = (a, b) => dot(byId.get(a).embedding.values, byId.get(b).embedding.values);
  const minCross = (a, b) => Math.min(...a.flatMap(id => b.map(other => score(id, other))));
  const maxCross = (a, b) => Math.max(...a.flatMap(id => b.map(other => score(id, other))));
  const cohesion = ids => ids.length < 2 ? 1 :
    Math.min(...ids.flatMap((id, i) => ids.slice(i + 1).map(other => score(id, other))));
  const support = ids => {
    const representatives = [];
    for (const id of ids) if (!representatives.some(other =>
      byId.get(id).url === byId.get(other).url || score(id, other) + EPSILON >= COPY)) {
      representatives.push(id);
    }
    return representatives.length;
  };
  function grow(threshold, forbidden = () => false) {
    const groups = ordered.map(source => [source.id]);
    for (;;) {
      const choices = [];
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const similarity = minCross(groups[i], groups[j]);
        if (similarity + EPSILON >= threshold && !forbidden(groups[i], groups[j]))
          choices.push({ i, j, similarity, pair: `${key(groups[i])}\0${key(groups[j])}` });
      }
      choices.sort((a, b) => b.similarity - a.similarity || a.pair.localeCompare(b.pair));
      if (!choices.length) break;
      const { i, j } = choices[0];
      groups[i] = [...groups[i], ...groups[j]].sort();
      groups.splice(j, 1);
      groups.sort((a, b) => key(a).localeCompare(key(b)));
    }
    return groups;
  }
  const tight = grow(TIGHT).filter(ids => support(ids) >= 2);
  const boundaries = [];
  if (separation) for (let i = 0; i < tight.length; i++) for (let j = i + 1; j < tight.length; j++) {
    if (Math.min(cohesion(tight[i]), cohesion(tight[j])) - maxCross(tight[i], tight[j]) + EPSILON >= MARGIN)
      boundaries.push([new Set(tight[i]), new Set(tight[j])]);
  }
  const crosses = (a, b) => boundaries.some(([left, right]) => {
    const joined = [...a, ...b];
    return joined.some(id => left.has(id)) && joined.some(id => right.has(id));
  });
  return { groups: grow(floor, crosses), tight, boundaryCount: boundaries.length };
}

export function compareFreshBatch(sources) {
  const baseline = planAdaptiveTopics({ sources, sourceLinks: [] }).partitions.map(part => part.sourceIds);
  const proposed = partition(sources);
  return { baseline, proposed: proposed.groups, supportedTightGroups: proposed.tight,
    supportedBoundaryCount: proposed.boundaryCount };
}
