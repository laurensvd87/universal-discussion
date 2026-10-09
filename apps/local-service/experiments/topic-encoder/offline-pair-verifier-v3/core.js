// Fixed, label-blind agglomerative complete-link diagnostic for small offline splits.
const pairCount = count => count * (count - 1) / 2;

export function agglomerativeCompleteLink(documents, vectors, scorer, threshold) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 1200 ||
      typeof scorer !== 'function' || (threshold !== null &&
      (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)))
    throw new TypeError('EVALUATION');
  const n = documents.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const value = scorer(vectors.get(documents[i].id), vectors.get(documents[j].id));
    if (!Number.isFinite(value)) throw new TypeError('SCORE');
    matrix[i][j] = matrix[j][i] = value;
  }
  const groups = Array.from({ length: n }, (_, i) => [i]);
  if (threshold !== null) while (true) {
    let best = null;
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      let minimum = 1;
      for (const i of groups[a]) for (const j of groups[b])
        minimum = Math.min(minimum, matrix[i][j]);
      if (minimum >= threshold && (!best || minimum > best.score))
        best = { a, b, score: minimum };
    }
    if (!best) break;
    groups[best.a].push(...groups[best.b]);
    groups.splice(best.b, 1);
  }
  const gold = new Map();
  for (const doc of documents) gold.set(doc.eventKey, (gold.get(doc.eventKey) ?? 0) + 1);
  let mixedGroups = 0, joinedTrue = 0, joinedFalse = 0,
    completeEvents = 0, crossLanguageTrueJoined = 0;
  for (const group of groups) {
    const labels = new Map();
    for (const i of group) labels.set(documents[i].eventKey,
      (labels.get(documents[i].eventKey) ?? 0) + 1);
    const within = [...labels.values()].reduce((sum, count) => sum + pairCount(count), 0);
    joinedTrue += within;
    joinedFalse += pairCount(group.length) - within;
    if (labels.size > 1) mixedGroups++;
    if (labels.size === 1) {
      const [label, count] = labels.entries().next().value;
      if (gold.get(label) === count) completeEvents++;
    }
    for (let p = 0; p < group.length; p++) for (let q = p + 1; q < group.length; q++) {
      const a = documents[group[p]], b = documents[group[q]];
      if (a.eventKey === b.eventKey && a.lang !== b.lang) crossLanguageTrueJoined++;
    }
  }
  return { groups: groups.length, mixedGroups, joinedTrue, joinedFalse,
    completeEvents, goldEvents: gold.size, crossLanguageTrueJoined };
}

export function usefulnessScreen(firstFit) {
  const pair = firstFit.pair, topics = firstFit.topics;
  return { requiredTrueAdmitted: 60, requiredFalseAdmitted: 0,
    requiredHardFalseAdmitted: 0, requiredCompleteEvents: 1,
    requiredCrossLanguageRecall: 0.25,
    met: pair.trueTotal === 180 && pair.falseTotal === 600 &&
      pair.hardFalseTotal === 200 && pair.crossLanguageTrueTotal === 160 &&
      pair.trueAdmitted >= 60 && pair.falseAdmitted === 0 &&
      pair.hardFalseAdmitted === 0 && topics.completeEvents >= 1 &&
      pair.crossLanguageTrueAdmitted / pair.crossLanguageTrueTotal >= 0.25 };
}
