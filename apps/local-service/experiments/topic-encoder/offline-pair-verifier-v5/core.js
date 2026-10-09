// The sole frozen policy: gated edges with a common gated neighbor, then components.
const pairCount = n => n * (n - 1) / 2;
const LANGUAGES = new Set(['en', 'de', 'nl', 'fr', 'es']);
const fail = code => { throw new TypeError(code); };

export function validateHoldout(rows) {
  if (!Array.isArray(rows) || rows.length !== 80) fail('HOLDOUT_COUNT');
  const ids = new Set(), events = new Map(), families = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
        !['string', 'number'].includes(typeof row.event_id) ||
        !['string', 'number'].includes(typeof row.family_id) ||
        !LANGUAGES.has(row.lang) || typeof row.viewpoint !== 'string' || !row.viewpoint ||
        typeof row.title !== 'string' || !row.title.trim() ||
        typeof row.text !== 'string' || !row.text.trim()) fail('HOLDOUT_SCHEMA');
    ids.add(row.id);
    const event = String(row.event_id), family = String(row.family_id);
    const members = events.get(event) ?? [];
    members.push(row); events.set(event, members);
    const labels = families.get(family) ?? new Set();
    labels.add(event); families.set(family, labels);
  }
  if (events.size !== 8 || families.size !== 4 ||
      [...families.values()].some(labels => labels.size !== 2)) fail('HOLDOUT_STRUCTURE');
  for (const members of events.values()) {
    if (members.length !== 10 || new Set(members.map(row => String(row.family_id))).size !== 1)
      fail('HOLDOUT_STRUCTURE');
    for (const lang of LANGUAGES) {
      const pair = members.filter(row => row.lang === lang);
      if (pair.length !== 2 || new Set(pair.map(row => row.viewpoint)).size !== 2)
        fail('HOLDOUT_STANCE');
    }
  }
  return rows.map(row => ({ id: row.id, eventKey: String(row.event_id),
    categories: [String(row.family_id)], lang: row.lang,
    title: row.title, lead: row.text.slice(0, 384) }));
}

export function triangleOnly(documents, vectors, scorer, threshold) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 1200 ||
      !Number.isFinite(threshold) || threshold < 0 || threshold > 1 ||
      typeof scorer !== 'function') fail('POLICY_INPUT');
  const n = documents.length;
  const gated = [], neighbors = Array.from({ length: n }, () => new Set());
  let trueTotal = 0, falseTotal = 0, hardFalseTotal = 0, crossLanguageTrueTotal = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = documents[i], b = documents[j];
    const same = a.eventKey === b.eventKey;
    if (same) {
      trueTotal++;
      if (a.lang !== b.lang) crossLanguageTrueTotal++;
    } else {
      falseTotal++;
      if (a.categories[0] === b.categories[0]) hardFalseTotal++;
    }
    const score = scorer(vectors.get(a.id), vectors.get(b.id));
    if (!Number.isFinite(score)) fail('POLICY_SCORE');
    if (score >= threshold) {
      gated.push({ i, j });
      neighbors[i].add(j); neighbors[j].add(i);
    }
  }
  const edges = gated.filter(({ i, j }) => {
    const a = neighbors[i], b = neighbors[j];
    for (const k of a.size < b.size ? a : b)
      if ((a.size < b.size ? b : a).has(k)) return true;
    return false;
  });
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  let trueEdges = 0, falseEdges = 0, hardFalseEdges = 0, crossLanguageTrueEdges = 0;
  for (const { i, j } of edges) {
    const a = documents[i], b = documents[j];
    if (a.eventKey === b.eventKey) {
      trueEdges++;
      if (a.lang !== b.lang) crossLanguageTrueEdges++;
    } else {
      falseEdges++;
      if (a.categories[0] === b.categories[0]) hardFalseEdges++;
    }
    parent[root(j)] = root(i);
  }
  const groups = new Map(), gold = new Map();
  for (let i = 0; i < n; i++) {
    const doc = documents[i];
    gold.set(doc.eventKey, (gold.get(doc.eventKey) ?? 0) + 1);
    const members = groups.get(root(i)) ?? [];
    members.push(i); groups.set(root(i), members);
  }
  let mixedGroups = 0, completeEvents = 0, groupedTruePairs = 0,
    groupedFalsePairs = 0, crossLanguageTrueGroupedPairs = 0;
  for (const members of groups.values()) {
    const labels = new Map();
    for (const i of members) labels.set(documents[i].eventKey,
      (labels.get(documents[i].eventKey) ?? 0) + 1);
    const truePairs = [...labels.values()].reduce((sum, count) => sum + pairCount(count), 0);
    groupedTruePairs += truePairs;
    groupedFalsePairs += pairCount(members.length) - truePairs;
    if (labels.size > 1) mixedGroups++;
    if (labels.size === 1) {
      const [label, count] = labels.entries().next().value;
      if (gold.get(label) === count) completeEvents++;
    }
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) {
      const left = documents[members[a]], right = documents[members[b]];
      if (left.eventKey === right.eventKey && left.lang !== right.lang)
        crossLanguageTrueGroupedPairs++;
    }
  }
  const denominators = { articles: n, events: gold.size, families: new Set(documents.map(doc =>
    doc.categories[0])).size, truePairs: trueTotal, falsePairs: falseTotal,
  hardFalsePairs: hardFalseTotal, crossLanguageTruePairs: crossLanguageTrueTotal };
  const edgeMetrics = { trueEdges, falseEdges, hardFalseEdges, crossLanguageTrueEdges };
  const components = { groups: groups.size, mixedGroups, completeEvents,
    groupedTruePairs, groupedFalsePairs, crossLanguageTrueGroupedPairs };
  return { denominators, edgeMetrics, components,
    researchScreen: { zeroFalseGroupedPairs: groupedFalsePairs === 0,
      zeroMixedGroups: mixedGroups === 0, atLeastTwoComplete: completeEvents >= 2,
      edgeRecallAtLeast40Percent: trueTotal === 360 && trueEdges >= 144,
      crossLanguageEdgeRecallAtLeast30Percent: crossLanguageTrueTotal === 320 &&
        crossLanguageTrueEdges >= 96,
      met: groupedFalsePairs === 0 && mixedGroups === 0 && completeEvents >= 2 &&
        trueTotal === 360 && trueEdges >= 144 && crossLanguageTrueTotal === 320 &&
        crossLanguageTrueEdges >= 96 } };
}
