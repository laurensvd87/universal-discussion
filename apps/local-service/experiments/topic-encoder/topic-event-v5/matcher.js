// Offline only. The caller supplies ephemeral title/lead E5 vectors and
// locally derived facets. Gold labels and raw text never enter this function.
import { hardConflict, weightedOverlap } from '../topic-focus-shadow/core.js';
import { features } from './reranker.js';

const cosine = (a, b) => a.reduce((value, item, index) => value + item * b[index], 0);
const pairKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
const GENERIC_TITLE = new Set(('a an the whether how why what new after before county city town state market street ward').split(' '));
function titleAnchors(title) {
  if (typeof title !== 'string') return new Set();
  return new Set((title.match(/\b\p{Lu}[\p{L}\p{N}-]{2,}\b/gu) ?? [])
    .map(word => word.normalize('NFKC').toLowerCase())
    .filter(word => !GENERIC_TITLE.has(word)));
}
function version(title) {
  const text = title.normalize('NFKC').toLowerCase();
  const match = text.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th|1\.?|2\.?|3\.?|4\.?)\s*[- ]\s*(?:generation|gen)\b/u);
  return match?.[1] ? ({ first: '1', '1st': '1', second: '2', '2nd': '2',
    third: '3', '3rd': '3', fourth: '4', '4th': '4' }[match[1]] ?? match[1].replace('.', '')) : null;
}

export function matchEventHeuristic(sources, facets, idf, options = {}) {
  const ids = sources.map(item => item.id).sort();
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate source ID');
  const byId = new Map(sources.map(item => [item.id, item]));
  const anchors = new Map(sources.map(item => [item.id, titleAnchors(item.title)]));
  const sharesAnchor = (a, b) => [...anchors.get(a)].some(term => anchors.get(b).has(term));
  const versions = new Map(sources.map(item => [item.id, version(item.title ?? '')]));
  const neighbors = new Map(ids.map(id => [id, []]));
  const pairs = new Map();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], av = byId.get(a).embedding.values,
      bv = byId.get(b).embedding.values;
    if (av?.length !== 384 || bv?.length !== 384 || !facets.has(a) || !facets.has(b))
      throw new TypeError('Missing focus evidence');
    const entry = { a, b, similarity: cosine(av, bv),
      lexical: weightedOverlap(facets.get(a), facets.get(b), idf),
      conflict: (versions.get(a) && versions.get(b) && versions.get(a) !== versions.get(b))
        ? 'generation' : hardConflict(facets.get(a), facets.get(b)) };
    pairs.set(pairKey(a, b), entry);
    neighbors.get(a).push({ id: b, similarity: entry.similarity });
    neighbors.get(b).push({ id: a, similarity: entry.similarity });
  }
  for (const list of neighbors.values()) list.sort((a, b) =>
    b.similarity - a.similarity || a.id.localeCompare(b.id));
  const edge = (a, b) => pairs.get(pairKey(a, b));
  const strong = options.strong ?? 0.90;
  const broad = options.broad ?? 0.84;
  const lexical = options.lexical ?? 0.15644897942164984;
  const direct = (a, b) => {
    const e = edge(a, b);
    return !e.conflict && e.similarity >= strong && e.lexical > lexical;
  };
  // The nearest set is only a small retrieval workload for possible witnesses.
  // Direct lexical evidence and already-supported cohorts have no size cap.
  const near = new Map(ids.map(id => [id, new Set(neighbors.get(id)
    .filter(item => !edge(id, item.id).conflict).slice(0, 3).map(item => item.id))]));
  const reciprocal = (a, b) => near.get(a).has(b) && near.get(b).has(a);
  const witnessed = [];
  for (const e of pairs.values()) {
    if (e.conflict || e.similarity < broad || !reciprocal(e.a, e.b)) continue;
    const common = [...near.get(e.a)].filter(id => near.get(e.b).has(id));
    if (common.some(c => !edge(e.a, c).conflict && !edge(e.b, c).conflict &&
      edge(e.a, c).similarity >= broad && edge(e.b, c).similarity >= broad))
      witnessed.push(e);
  }
  const witnessDegree = new Map(ids.map(id => [id, 0]));
  for (const e of witnessed) {
    witnessDegree.set(e.a, witnessDegree.get(e.a) + 1);
    witnessDegree.set(e.b, witnessDegree.get(e.b) + 1);
  }
  const approved = new Set();
  const directCandidates = [];
  for (const e of pairs.values()) if (direct(e.a, e.b)) {
    approved.add(pairKey(e.a, e.b));
    directCandidates.push(e);
  }
  for (const e of witnessed) if (witnessDegree.get(e.a) >= 2 &&
      witnessDegree.get(e.b) >= 2) approved.add(pairKey(e.a, e.b));
  const order = (a, b) => b.similarity - a.similarity ||
    a.a.localeCompare(b.a) || a.b.localeCompare(b.b);
  const candidates = [...directCandidates.sort(order), ...[...approved]
    .filter(key => !directCandidates.some(e => pairKey(e.a, e.b) === key))
    .map(key => pairs.get(key)).sort(order)];
  const groups = ids.map(id => [id]);
  let protectedCores = null;
  for (const [index, candidate] of candidates.entries()) {
    if (index === directCandidates.length) protectedCores = groups.filter(group => group.length >= 2)
      .map(group => [...group]);
    const left = groups.findIndex(group => group.includes(candidate.a));
    const right = groups.findIndex(group => group.includes(candidate.b));
    if (left === right) continue;
    const a = groups[left], b = groups[right];
    const directStep = direct(candidate.a, candidate.b);
    if (!directStep && protectedCores) {
      const localHypotheses = protectedCores.filter(core => core.some(member =>
        sharesAnchor(member, candidate.a) || sharesAnchor(member, candidate.b)));
      if (localHypotheses.length >= 2) continue;
    }
    if (directStep && !a.every(x => b.every(y => direct(x, y)))) continue;
    if (!directStep && a.length > 1 && b.length > 1) continue;
    if (!directStep && Math.max(a.length, b.length) > 1 &&
      a.flatMap(x => b.filter(y => approved.has(pairKey(x, y)))).length < 2) continue;
    // All cross-members must be semantically compatible; a mere chain is not
    // enough. At least one witnessed or lexical link must exist at the seam.
    if (!a.every(x => b.every(y => !edge(x, y).conflict &&
      edge(x, y).similarity >= broad))) continue;
    if (!a.some(x => b.some(y => approved.has(pairKey(x, y))))) continue;
    groups[left] = [...a, ...b].sort();
    groups.splice(right, 1);
  }
  const partitions = groups.flatMap(group => {
    if (group.length < 2) return [group];
    const hasEventAnchor = group.some((a, i) => group.slice(i + 1)
      .some(b => direct(a, b) || sharesAnchor(a, b)));
    return hasEventAnchor ? [group] : group.map(id => [id]);
  }).sort((a, b) => a[0].localeCompare(b[0]));
  const relatedEdges = [...pairs.values()].filter(e => e.similarity >= broad &&
    !partitions.some(group => group.includes(e.a) && group.includes(e.b)))
    .map(e => ({ a: e.a, b: e.b, similarity: e.similarity }));
  return { partitions, relatedEdges };
}

// Family-disjoint development model. The coefficients and acceptance cutoff
// were fitted on English + multilingual TRAIN only; no corpus vocabulary is
// embedded. This remains an offline research candidate.
const NUMERIC_MODEL = Object.freeze({
  weights: [1.598556238154723, 1.486672823116688, -0.2980339781399153,
    0.9242194979364926, -0.5165780502412225, -0.10800127881188844,
    0.7012809427198455, -0.39966205864052495, 0.058425678602935176],
  mean: [0.91307386659971, 0.2159090909090909, 1.4715909090909092,
    0.10024526378935295, 0.5, 0.8077962690346912,
    -0.007422757854156485, -0.006967034627063538],
  scale: [0.022448263444597615, 1.3771583360836286, 0.6902649135125194,
    0.06258888785628626, 0.5, 0.29001095264654797,
    0.008912023478859589, 0.008560573066867893],
  cutoff: 0.5363159362806821,
});
function modelScore(values) {
  const z = NUMERIC_MODEL.weights[0] + values.reduce((sum, value, index) =>
    sum + NUMERIC_MODEL.weights[index + 1] *
      (value - NUMERIC_MODEL.mean[index]) / NUMERIC_MODEL.scale[index], 0);
  return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
}
export function matchEventV5(sources, facets, _idf, _options = {}) {
  const ids = sources.map(item => item.id).sort();
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate source ID');
  const uniform = Object.assign(new Map(), { unknownWeight: 1 });
  const candidates = features(sources, facets, uniform)
    .map(item => ({ ...item, score: modelScore(item.values) }))
    .sort((a, b) => b.score - a.score || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  const accepted = new Map(candidates.filter(item => item.score > NUMERIC_MODEL.cutoff &&
    (item.values[2] >= 1 || (item.values[0] >= 0.90 && item.values[3] >= 0.2)) &&
    !(item.values[0] >= 0.98 && item.values[3] < 0.1 && item.values[4] === 0) &&
    !hardConflict(facets.get(item.a), facets.get(item.b)))
    .map(item => [pairKey(item.a, item.b), item]));
  const groups = ids.map(id => [id]);
  for (const item of candidates) {
    if (!accepted.has(pairKey(item.a, item.b))) continue;
    const left = groups.findIndex(group => group.includes(item.a));
    const right = groups.findIndex(group => group.includes(item.b));
    if (left === right) continue;
    if (!groups[left].every(a => groups[right].every(b =>
      accepted.has(pairKey(a, b))))) continue;
    groups[left] = [...groups[left], ...groups[right]].sort();
    groups.splice(right, 1);
  }
  const partitions = groups.sort((a, b) => a[0].localeCompare(b[0]));
  return { partitions, relatedEdges: candidates.filter(item =>
    !partitions.some(group => group.includes(item.a) && group.includes(item.b)))
    .map(item => ({ a: item.a, b: item.b, score: item.score })) };
}
