// Offline research only. Labels are used by scoreGroups, never by groupDocuments.
export const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

const key = ids => ids.join('\0');
const ordered = groups => groups.map(group => [...group].sort()).sort((a, b) => key(a).localeCompare(key(b)));

export function groupDocuments(documents, vectors, rule) {
  if (!Array.isArray(documents) || documents.length < 1 || !['complete', 'supported', 'triangle', 'triangle-nearest'].includes(rule.method))
    throw new TypeError('Invalid offline grouping input');
  const ids = documents.map(doc => doc.id).sort();
  if (new Set(ids).size !== ids.length || ids.some(id => !vectors.has(id)))
    throw new TypeError('Duplicate or missing vector');
  const scores = new Map();
  const score = (a, b) => {
    const pair = a < b ? `${a}\0${b}` : `${b}\0${a}`;
    if (!scores.has(pair)) scores.set(pair, dot(vectors.get(a), vectors.get(b)));
    return scores.get(pair);
  };
  const nearest = new Map();
  if (rule.method === 'triangle-nearest') for (const id of ids) {
    const neighbors = ids.filter(other => other !== id)
      .map(other => ({ other, similarity: score(id, other) }))
      .sort((a, b) => b.similarity - a.similarity || a.other.localeCompare(b.other));
    nearest.set(id, neighbors[0]?.other ?? null);
  }
  const internallyNearest = group => rule.method !== 'triangle-nearest' ||
    group.every(id => group.includes(nearest.get(id)));
  let groups = ids.map(id => [id]);
  if (rule.method === 'triangle' || rule.method === 'triangle-nearest') {
    // Weak edges require three mutually supported independent sources. Strong
    // pair seeds remain possible. This is a minimum evidence rule, not a cap.
    const pairSeeds = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const value = score(ids[i], ids[j]);
      if (value >= rule.strongPair && internallyNearest([ids[i], ids[j]]))
        pairSeeds.push({ ids: [ids[i], ids[j]], score: value });
    }
    const used = new Set();
    const seeded = [];
    const descending = (a, b) => b.score - a.score || key(a.ids).localeCompare(key(b.ids));
    for (const candidate of pairSeeds.sort(descending)) if (candidate.ids.every(id => !used.has(id))) {
      candidate.ids.forEach(id => used.add(id));
      seeded.push(candidate.ids);
    }
    const triads = [];
    const available = ids.filter(id => !used.has(id));
    for (let i = 0; i < available.length; i++) for (let j = i + 1; j < available.length; j++)
      for (let k = j + 1; k < available.length; k++) {
        const group = [available[i], available[j], available[k]];
        const first = score(group[0], group[1]);
        if (first < rule.minimum) continue;
        const second = score(group[0], group[2]);
        if (second < rule.minimum) continue;
        const third = score(group[1], group[2]);
        if (third < rule.minimum) continue;
        const mean = (first + second + third) / 3;
        if (mean >= rule.mean && internallyNearest(group)) triads.push({ ids: group, score: mean });
      }
    for (const candidate of triads.sort(descending)) if (candidate.ids.every(id => !used.has(id))) {
      candidate.ids.forEach(id => used.add(id));
      seeded.push(candidate.ids);
    }
    groups = ordered([...seeded, ...ids.filter(id => !used.has(id)).map(id => [id])]);
  }
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const left = groups[i], right = groups[j];
      let minimum = 1, total = 0;
      const leftBest = new Map(left.map(id => [id, -1]));
      const rightBest = new Map(right.map(id => [id, -1]));
      for (const a of left) for (const b of right) {
        const value = score(a, b);
        minimum = Math.min(minimum, value);
        total += value;
        leftBest.set(a, Math.max(leftBest.get(a), value));
        rightBest.set(b, Math.max(rightBest.get(b), value));
      }
      const mean = total / (left.length * right.length);
      let admissible;
      if (rule.method === 'complete') admissible = minimum >= rule.cutoff;
      else admissible = (!rule.method.startsWith('triangle') || Math.max(left.length, right.length) >= 2) &&
        minimum >= rule.minimum && mean >= rule.mean &&
        [...leftBest.values(), ...rightBest.values()].every(value => value >= rule.cover) &&
        internallyNearest([...left, ...right]);
      if (!admissible) continue;
      // Stable global best-pair selection; no arrival-order dependence and no
      // fixed group/member/candidate count. Coverage applies in both directions.
      const candidate = { i, j, score: rule.method === 'complete' ? minimum : mean,
        pairKey: `${key(left)}\0${key(right)}` };
      if (!best || candidate.score > best.score + 1e-12 ||
          (Math.abs(candidate.score - best.score) <= 1e-12 && candidate.pairKey < best.pairKey))
        best = candidate;
    }
    if (!best) break;
    groups[best.i] = [...groups[best.i], ...groups[best.j]].sort();
    groups.splice(best.j, 1);
    groups = ordered(groups);
  }
  return groups;
}

export function scoreGroups(documents, groups) {
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  const groupOf = new Map(groups.flatMap((group, index) => group.map(id => [id, index])));
  if (groupOf.size !== documents.length || documents.some(doc => !groupOf.has(doc.id)))
    throw new TypeError('Incomplete grouping');
  let truePairs = 0, falsePairs = 0, joinedTrue = 0, joinedFalse = 0, hardFalse = 0, totalHard = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    const same = a.topicLabel === b.topicLabel;
    const joined = groupOf.get(a.id) === groupOf.get(b.id);
    if (same) { truePairs++; if (joined) joinedTrue++; }
    else {
      falsePairs++; if (joined) joinedFalse++;
      if (a.family === b.family) { totalHard++; if (joined) hardFalse++; }
    }
  }
  const gold = new Map();
  for (const doc of documents) {
    if (!gold.has(doc.topicLabel)) gold.set(doc.topicLabel, new Set());
    gold.get(doc.topicLabel).add(doc.id);
  }
  const exact = groups.filter(group => {
    const expected = gold.get(byId.get(group[0]).topicLabel);
    return expected.size === group.length && group.every(id => expected.has(id));
  }).length;
  const falseMixedGroups = groups.filter(group => new Set(group.map(id => byId.get(id).topicLabel)).size > 1).length;
  return { joinedTrue, truePairs, joinedFalse, falsePairs, hardFalse, totalHard,
    exactGoldTopics: exact, goldTopics: gold.size, falseMixedGroups, groups: groups.length };
}
