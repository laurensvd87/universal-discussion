// Offline event-cohort experiment. Seed evidence is v5's frozen pair model;
// membership expansion uses group evidence and an unbounded exemplar cover.
import { matchEventV5 } from '../topic-event-v5/matcher.js';
import { hardConflict, weightedOverlap } from '../topic-focus-shadow/core.js';

const uniform = Object.assign(new Map(), { unknownWeight: 1 });
const key = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
const cosine = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
function host(source) {
  try { return new URL(source.url).hostname; } catch { return source.id; }
}
function sameCopy(a, b) {
  return a.title.normalize('NFKC').trim().toLowerCase() ===
    b.title.normalize('NFKC').trim().toLowerCase();
}

export function matchEventV6(input, facets, options = {}) {
  const sources = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const ids = sources.map(source => source.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate Source ID');
  const byId = new Map(sources.map(source => [source.id, source]));
  const pair = new Map();
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const a = sources[i], b = sources[j];
    if (a.embedding?.values?.length !== 384 || b.embedding?.values?.length !== 384 ||
      !facets.has(a.id) || !facets.has(b.id)) throw new TypeError('Missing focus evidence');
    pair.set(key(a.id, b.id), { sim: cosine(a.embedding.values, b.embedding.values),
      lexical: weightedOverlap(facets.get(a.id), facets.get(b.id), uniform),
      conflict: hardConflict(facets.get(a.id), facets.get(b.id)) });
  }
  const edge = (a, b) => pair.get(key(a, b));
  const source = id => byId.get(id);
  function exemplars(group) {
    const pool = group.map(source).sort((a, b) => a.id.localeCompare(b.id));
    const chosen = [pool[0]];
    // An identical title is a copy proxy even across hosts. A publisher may
    // report distinct developments, however, so host alone is not a copy.
    const independent = candidate => chosen.every(existing => !sameCopy(candidate, existing));
    while (chosen.length < 2) {
      const candidate = pool.filter(item => independent(item)).sort((a, b) =>
        Number(host(b) !== host(chosen[0])) - Number(host(a) !== host(chosen[0])) ||
        edge(chosen[0].id, a.id).sim - edge(chosen[0].id, b.id).sim ||
        a.id.localeCompare(b.id))[0];
      if (!candidate) break;
      chosen.push(candidate);
    }
    // Every new semantic region receives another exemplar. There is no
    // fixed exemplar count or Topic membership count.
    while (true) {
      const candidate = pool.filter(item => !chosen.includes(item) && independent(item))
        .map(item => ({ item, cover: Math.max(...chosen.map(other =>
          edge(item.id, other.id).sim)) }))
        .sort((a, b) => a.cover - b.cover || a.item.id.localeCompare(b.item.id))[0];
      if (!candidate || candidate.cover >= (options.coverFloor ?? 0.94)) break;
      chosen.push(candidate.item);
    }
    return chosen.map(item => item.id);
  }
  const seed = options.seedPartitions ?? matchEventV5(sources, facets, uniform).partitions;
  const groups = seed.map(group => [...group].sort());
  function groupEvidence(left, right, la, rb) {
    const values = la.flatMap(a => rb.map(b => edge(a, b)));
    const usable = values.filter(value => !value.conflict);
    if (usable.length !== values.length) return null;
    const independent = [la, rb].some(cover =>
      new Set(cover.map(id => host(source(id)))).size >= 2);
    if (!independent) return null;
    const mean = usable.reduce((sum, value) => sum + value.sim, 0) / usable.length;
    const min = Math.min(...usable.map(value => value.sim));
    const lexical = Math.max(...usable.map(value => value.lexical));
    return { mean, min, lexical, support: Math.min(la.length, rb.length) };
  }
  // Greedy maximum group support, with deterministic tie breaking. Each
  // iteration recomputes the local event hypotheses after a merge.
  while (true) {
    const covers = groups.map(exemplars);
    const evidence = groups.map(() => Array(groups.length).fill(null));
    const rivals = groups.map(() => []);
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const value = groupEvidence(groups[i], groups[j], covers[i], covers[j]);
      evidence[i][j] = value;
      if (value && groups[i].length >= 2 && groups[j].length >= 2 &&
        value.mean >= (options.relatedFloor ?? 0.84) &&
        value.lexical < (options.groupBridgeLexical ?? 0.20)) {
        rivals[i].push({ id: j, mean: value.mean });
        rivals[j].push({ id: i, mean: value.mean });
      }
    }
    for (const list of rivals) list.sort((a, b) => b.mean - a.mean);
    const choices = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const value = evidence[i][j];
      if (!value || value.mean < (options.joinMean ?? 0.90) ||
        value.min < (options.joinMin ?? 0.86)) continue;
      // Two established event hypotheses need a concrete cross-hypothesis
      // bridge. High actor similarity alone must not fuse their conversations.
      if (groups[i].length >= 2 && groups[j].length >= 2 &&
        value.lexical < (options.groupBridgeLexical ?? 0.20) &&
        value.mean < (options.groupBridgeCosine ?? 0.97)) continue;
      const bestCompetitor = Math.max(0,
        rivals[i].find(item => item.id !== j)?.mean ?? 0,
        rivals[j].find(item => item.id !== i)?.mean ?? 0);
      if (bestCompetitor && value.mean <= bestCompetitor +
          (options.localLead ?? 0.015)) continue;
      if (groups[i].length === 1 && groups[j].length === 1) continue;
      choices.push({ i, j, score: value.mean + 0.02 * value.lexical,
        key: `${groups[i][0]}\0${groups[j][0]}` });
    }
    choices.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    if (!choices.length) break;
    const { i, j } = choices[0];
    groups[i] = [...groups[i], ...groups[j]].sort();
    groups.splice(j, 1);
  }
  groups.sort((a, b) => a[0].localeCompare(b[0]));
  const relatedEdges = [...pair.entries()].filter(([name, value]) =>
    value.sim >= (options.relatedFloor ?? 0.84) &&
    !groups.some(group => group.includes(name.split('\0')[0]) &&
      group.includes(name.split('\0')[1])))
    .map(([name, value]) => ({ ids: name.split('\0'), score: value.sim }));
  return { partitions: groups, relatedEdges,
    exemplarCounts: groups.map(group => exemplars(group).length) };
}
