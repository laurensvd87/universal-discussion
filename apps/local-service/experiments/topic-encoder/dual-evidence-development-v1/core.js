import { aggregatePartition } from '../indexed-body-quality-v1/core.js';

export const BODY_FLOORS = Object.freeze([0.3622392629925627, 0.5, 0.65, 0.8]);
export const RAW_FLOORS = Object.freeze([0.80, 0.85, 0.90, 0.94]);
export const RAW_RADIUS_FLOOR = 0.9040571956970354;
export const GRID = Object.freeze(BODY_FLOORS.flatMap(bodyFloor => RAW_FLOORS.map(rawFloor =>
  Object.freeze({ id: `body-${bodyFloor}-raw-${rawFloor}`, bodyFloor, rawFloor }))));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid dual evidence development input'); };

export function scoreMatrices(rows, rawVectors, bodyVectors) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 300 || !(rawVectors instanceof Map) ||
      !(bodyVectors instanceof Map) || rows.some(row => typeof row.id !== 'string' || !row.id) ||
      new Set(rows.map(row => row.id)).size !== rows.length) invalid();
  const n = rows.length, raw = new Float64Array(n * n), body = new Float64Array(n * n);
  for (const [matrix, vectors] of [[raw, rawVectors], [body, bodyVectors]]) {
    const inputs = rows.map(row => {
      const vector = vectors.get(row.id);
      if (!vector || vector.length !== 384 || ![...vector].every(Number.isFinite) ||
          Math.abs(Math.hypot(...vector) - 1) > 1e-5) invalid();
      return vector;
    });
    for (let i = 0; i < n; i++) {
      matrix[i * n + i] = 1;
      for (let j = i + 1; j < n; j++) {
        let value = 0;
        for (let k = 0; k < 384; k++) value += inputs[i][k] * inputs[j][k];
        matrix[i * n + j] = matrix[j * n + i] = Math.max(-1, Math.min(1, value));
      }
    }
  }
  return { ids: rows.map(row => row.id), raw, body };
}

// Exact strongest-edge complete-link on the intersection of the two graphs.
// BODY score orders dual edges; raw score breaks a tie, followed by Source IDs.
// No neighbor cap, competitor lead, truncation, labels or transitive bridge join.
export function completeLink(scores, { bodyFloor = null, rawFloor = null, coarsePartitions = null }) {
  const { ids, raw, body } = scores, n = ids.length;
  if (!n || raw.length !== n * n || body.length !== n * n ||
      bodyFloor === null && rawFloor === null || [bodyFloor, rawFloor].some(value =>
        value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1))) invalid();
  let blocks = null;
  if (coarsePartitions !== null) {
    const covered = coarsePartitions.flatMap(part => part.sourceIds);
    if (covered.length !== n || new Set(covered).size !== n || covered.some(id => !ids.includes(id)) ||
        coarsePartitions.some(part => !part.sourceIds.length)) invalid();
    blocks = new Map(coarsePartitions.flatMap((part, index) => part.sourceIds.map(id => [id, index])));
  }
  const admitted = (i, j) => (blocks === null || blocks.get(ids[i]) === blocks.get(ids[j])) &&
    (bodyFloor === null || body[i * n + j] >= bodyFloor) &&
    (rawFloor === null || raw[i * n + j] >= rawFloor);
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (admitted(i, j)) edges.push({ i, j, a: ids[i] < ids[j] ? ids[i] : ids[j], b: ids[i] < ids[j] ? ids[j] : ids[i] });
  }
  edges.sort((a, b) => (bodyFloor === null ? raw[b.i * n + b.j] - raw[a.i * n + a.j]
    : body[b.i * n + b.j] - body[a.i * n + a.j]) ||
    raw[b.i * n + b.j] - raw[a.i * n + a.j] || compare(a.a, b.a) || compare(a.b, b.b));
  const parents = rowsIndices(n), groups = new Map(parents.map(i => [i, [i]]));
  const root = index => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  };
  for (const edge of edges) {
    const a = root(edge.i), b = root(edge.j);
    if (a === b) continue;
    if (!groups.get(a).every(i => groups.get(b).every(j => admitted(i, j)))) continue;
    parents[b] = a; groups.set(a, [...groups.get(a), ...groups.get(b)]); groups.delete(b);
  }
  const partitions = [...groups.values()].map(group => ({ sourceIds: group.map(i => ids[i]).sort(compare) }))
    .sort((a, b) => compare(a.sourceIds[0], b.sourceIds[0]));
  return { partitions, admittedPairs: edges.length };
}
const rowsIndices = n => Array.from({ length: n }, (_, i) => i);

export function assess(rows, partitions) {
  const counts = aggregatePartition(rows, partitions);
  const groups = new Map(partitions.flatMap((part, index) => part.sourceIds.map(id => [id, index])));
  let crossLanguageTruePairs = 0, crossLanguageGroupedCorrect = 0;
  const opposingViewpointPairs = { total: 0, joined: 0 }, sameFamilyDifferentEventPairs = { total: 0, joined: 0 };
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], joined = groups.get(a.id) === groups.get(b.id), sameEvent = a.eventKey === b.eventKey;
    if (sameEvent && a.lang && b.lang && a.lang !== b.lang) {
      crossLanguageTruePairs++; if (joined) crossLanguageGroupedCorrect++;
    }
    if (sameEvent && a.viewpoint && b.viewpoint && a.viewpoint !== b.viewpoint) {
      opposingViewpointPairs.total++; if (joined) opposingViewpointPairs.joined++;
    }
    if (a.family && a.family === b.family && !sameEvent) {
      sameFamilyDifferentEventPairs.total++; if (joined) sameFamilyDifferentEventPairs.joined++;
    }
  }
  return { ...counts, crossLanguageTruePairs, crossLanguageGroupedCorrect, opposingViewpointPairs, sameFamilyDifferentEventPairs };
}

export function selectDevelopment(candidates) {
  const eligible = candidates.filter(candidate => candidate.cohorts.authored.falseGroupedPairs <= 19 &&
    candidate.cohorts.authored.mixedPages <= 23 && candidate.cohorts.v6.falseGroupedPairs === 0 && candidate.cohorts.v6.mixedPages === 0);
  const safe = eligible.filter(candidate => candidate.cohorts.realDev.falseGroupedPairs <= 1 && candidate.cohorts.realDev.mixedPages <= 2);
  const fictionalPure = candidate => candidate.cohorts.authored.purePages + candidate.cohorts.v6.purePages;
  const falsePairs = candidate => Object.values(candidate.cohorts).reduce((n, counts) => n + counts.falseGroupedPairs, 0);
  safe.sort((a, b) => b.cohorts.realDev.purePages - a.cohorts.realDev.purePages || fictionalPure(b) - fictionalPure(a) ||
    falsePairs(a) - falsePairs(b) || a.bodyFloor - b.bodyFloor || a.rawFloor - b.rawFloor);
  return { eligibleCandidates: safe.length, selected: safe[0]?.id ?? null };
}
