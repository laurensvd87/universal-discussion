// Offline research only. Labels and text never enter the matcher.
import { hardConflict, weightedOverlap } from '../topic-focus-shadow/core.js';

const uniform = Object.assign(new Map(), { unknownWeight: 1 });
const key = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const host = source => { try { return new URL(source.url).hostname; } catch { return source.id; } };
const title = source => source.title.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();

export function matchEventV7(input, facets, options = {}) {
  const sources = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const ids = sources.map(s => s.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate Source ID');
  const byId = new Map(sources.map(s => [s.id, s]));
  for (const s of sources) if (s.embedding?.values?.length !== 384 || !facets.has(s.id))
    throw new TypeError('Missing focus evidence');
  const pairs = new Map();
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const a = sources[i], b = sources[j];
    pairs.set(key(a.id, b.id), { a: a.id, b: b.id,
      sim: dot(a.embedding.values, b.embedding.values),
      lexical: weightedOverlap(facets.get(a.id), facets.get(b.id), uniform),
      conflict: hardConflict(facets.get(a.id), facets.get(b.id)) });
  }
  const edge = (a, b) => pairs.get(key(a, b));
  const independent = (a, b) => host(byId.get(a)) !== host(byId.get(b)) &&
    title(byId.get(a)) !== title(byId.get(b));
  const groups = ids.map(id => [id]);
  const eligible = e => !e.conflict && e.sim >= (options.nearFloor ?? 0.84);
  const direct = e => eligible(e) && e.sim >= (options.directFloor ?? 0.91) &&
    e.lexical >= (options.directLexical ?? 0.20) && independent(e.a, e.b);
  // Each direct pair is a candidate event hypothesis, including pairs with no
  // reciprocal-neighbor rank. Explicit competing hypotheses remain separate.
  const candidates = [...pairs.values()].filter(direct)
    .sort((a, b) => b.sim + b.lexical * 0.1 - a.sim - a.lexical * 0.1 ||
      key(a.a, a.b).localeCompare(key(b.a, b.b)));
  function hypothesisEvidence(left, right) {
    const cross = left.flatMap(a => right.map(b => edge(a, b)));
    const compatible = cross.filter(eligible);
    const conflict = cross.some(e => e.conflict && e.sim >= (options.conflictFloor ?? 0.80));
    const strong = compatible.filter(e => direct(e));
    const witnesses = new Set();
    for (const e of compatible) if (e.sim >= (options.witnessFloor ?? 0.88) &&
      e.lexical >= (options.witnessLexical ?? 0.12) && independent(e.a, e.b)) {
      witnesses.add(e.a); witnesses.add(e.b);
    }
    const independentWitnesses = [...witnesses].some(a => [...witnesses]
      .some(b => a !== b && independent(a, b)));
    return { conflict, strong: strong.length, independentWitnesses,
      best: Math.max(0, ...compatible.map(e => e.sim)),
      lexical: Math.max(0, ...compatible.map(e => e.lexical)),
      support: compatible.length };
  }
  for (const e of candidates) {
    const i = groups.findIndex(g => g.includes(e.a));
    const j = groups.findIndex(g => g.includes(e.b));
    if (i === j) continue;
    const left = groups[i], right = groups[j];
    const evidence = hypothesisEvidence(left, right);
    if (evidence.conflict) continue;
    if (left.length > 1 && right.length > 1 &&
      (evidence.strong < 2 || !evidence.independentWitnesses)) continue;
    // An independent nearby established event with comparable direct evidence
    // is a concrete competing hypothesis. Unrelated outsiders are irrelevant.
    const rival = groups.some((other, k) => k !== i && k !== j && other.length >= 2 &&
      [left, right].some(part => {
        const r = hypothesisEvidence(part, other);
        return !r.conflict && r.strong >= 2 && r.best >= evidence.best - 0.01 &&
          r.lexical >= evidence.lexical;
      }));
    if (rival) continue;
    groups[i] = [...left, ...right].sort(); groups.splice(j, 1);
  }
  // Singleton admission needs two independent reports in one hypothesis. The
  // support criterion is local and does not grow with the Topic's total size.
  let changed;
  do {
    changed = false;
    const choices = [];
    for (let i = 0; i < groups.length; i++) if (groups[i].length === 1)
      for (let j = 0; j < groups.length; j++) if (groups[j].length >= 2) {
        const id = groups[i][0];
        const support = groups[j].map(other => edge(id, other))
          .filter(e => eligible(e) && e.sim >= (options.witnessFloor ?? 0.88) &&
            independent(id, e.a === id ? e.b : e.a));
        const witnessIds = support.map(e => e.a === id ? e.b : e.a);
        if (!witnessIds.some(a => witnessIds.some(b => a !== b && independent(a, b)))) continue;
        if (groups[j].some(other => { const e = edge(id, other);
          return e.conflict && e.sim >= (options.conflictFloor ?? 0.80); })) continue;
        const lexical = Math.max(...support.map(e => e.lexical));
        if (lexical < (options.witnessLexical ?? 0.12)) continue;
        choices.push({ i, j, score: support.reduce((n, e) => n + e.sim, 0) / support.length,
          lexical, id, group: groups[j][0] });
      }
    choices.sort((a, b) => b.score - a.score || b.lexical - a.lexical ||
      a.id.localeCompare(b.id) || a.group.localeCompare(b.group));
    for (const choice of choices) {
      const i = groups.findIndex(g => g.length === 1 && g[0] === choice.id);
      const j = groups.findIndex(g => g.includes(choice.group) && g.length >= 2);
      if (i < 0 || j < 0) continue;
      const rival = choices.some(other => other.id === choice.id && other.group !== choice.group &&
        other.score >= choice.score - (options.localLead ?? 0.015) &&
        other.lexical >= choice.lexical - 0.01);
      if (rival) continue;
      groups[j].push(choice.id); groups[j].sort(); groups.splice(i, 1); changed = true;
      break;
    }
  } while (changed);
  groups.sort((a, b) => a[0].localeCompare(b[0]));
  const membership = new Map(groups.flatMap((g, i) => g.map(id => [id, i])));
  return { partitions: groups,
    relatedEdges: [...pairs.values()].filter(e => e.sim >= (options.nearFloor ?? 0.84) &&
      membership.get(e.a) !== membership.get(e.b))
      .map(e => ({ ids: [e.a, e.b], score: e.sim })) };
}
