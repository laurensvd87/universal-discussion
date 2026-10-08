// Offline-only matcher. The caller supplies transient title/lead facets and
// focus vectors; no gold labels, bodies, or persisted second vectors enter here.
import { cosine, hardConflict, weightedOverlap } from '../topic-focus-shadow/core.js';

const key = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
const EPS = 1e-9;

export function matchFocusGraph(sources, facets, idf, options = {}) {
  const ids = sources.map(source => source.id).sort();
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate source ID');
  const byId = new Map(sources.map(source => [source.id, source]));
  const pair = new Map();
  const neighbors = new Map(ids.map(id => [id, []]));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    const av = byId.get(a).embedding.values, bv = byId.get(b).embedding.values;
    if (av.length !== 384 || bv.length !== 384 || !facets.has(a) || !facets.has(b))
      throw new TypeError('Missing focus evidence');
    const value = cosine(av, bv);
    const entry = { a, b, cosine: value,
      overlap: weightedOverlap(facets.get(a), facets.get(b), idf),
      conflict: hardConflict(facets.get(a), facets.get(b)) };
    pair.set(key(a, b), entry);
    neighbors.get(a).push({ id: b, score: value });
    neighbors.get(b).push({ id: a, score: value });
  }
  for (const list of neighbors.values()) list.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const edge = (a, b) => pair.get(key(a, b));
  const lexicalCutoff = options.lexicalCutoff ?? 0.15644897942164984;
  const floor = options.cosineFloor ?? 0.90;
  const triangleFloor = options.triangleFloor ?? 0.84;
  // A page's closest competing developments determine local evidence. The
  // number of pages elsewhere in the catalog plays no role in this decision.
  const top = (id, n = 2) => neighbors.get(id).filter(item => !edge(id, item.id).conflict).slice(0, n);
  const inTop = (a, b, n = 2) => top(a, n).some(item => item.id === b);
  function supported(a, b) {
    const direct = edge(a, b);
    if (direct.cosine < triangleFloor || direct.conflict) return false;
    // Strong shared words in an English report can be direct event evidence.
    // The cosine gate remains necessary because a repeated actor is common.
    if (direct.cosine >= floor && direct.overlap > lexicalCutoff + EPS) return true;
    // Cross-language coverage requires a third, independent source that is
    // mutually near both endpoints and forms a coherent three-page clique.
    if (!inTop(a, b) || !inTop(b, a)) return false;
    for (const c of ids) {
      if (c === a || c === b) continue;
      const ac = edge(a, c), bc = edge(b, c);
      if (ac.conflict || bc.conflict || ac.cosine < triangleFloor || bc.cosine < triangleFloor) continue;
      if (!inTop(a, c) || !inTop(c, a) || !inTop(b, c) || !inTop(c, b)) continue;
      // Rank ties provide no way to distinguish another development. Inspect
      // the strongest local alternative, without a catalog-size penalty.
      const minimumInside = Math.min(direct.cosine, ac.cosine, bc.cosine);
      const ambiguousOutside = ids.some(id => id !== a && id !== b && id !== c &&
        Math.max(edge(a, id).cosine, edge(b, id).cosine, edge(c, id).cosine) >= minimumInside - EPS);
      if (ambiguousOutside) continue;
      return true;
    }
    return false;
  }
  const candidates = [...pair.values()].filter(p => supported(p.a, p.b))
    .sort((a, b) => b.cosine - a.cosine || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  const groups = ids.map(id => [id]);
  for (const candidate of candidates) {
    const left = groups.findIndex(group => group.includes(candidate.a));
    const right = groups.findIndex(group => group.includes(candidate.b));
    if (left === right) continue;
    if (!groups[left].every(a => groups[right].every(b => supported(a, b)))) continue;
    groups[left] = [...groups[left], ...groups[right]].sort();
    groups.splice(right, 1);
  }
  return { partitions: groups.sort((a, b) => a[0].localeCompare(b[0])),
    relatedEdges: [...pair.values()].filter(p => p.cosine >= floor && !supported(p.a, p.b))
      .map(p => ({ a: p.a, b: p.b, score: p.cosine })) };
}
