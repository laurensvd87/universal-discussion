// Pure, label-blind local admission; labels are read only by calibration/evaluation.
const fail = code => { throw new TypeError(code); };
const variants = ['triangle', 'double-support', 'seed-expand'];
const countPairs = n => n * (n - 1) / 2;

export function prepareGraph(documents, vectors, scorer) {
  if (!Array.isArray(documents) || documents.length < 8 || documents.length > 324 ||
      !(vectors instanceof Map) || typeof scorer !== 'function') fail('GRAPH_INPUT');
  const ids = documents.map(doc => doc?.id);
  if (ids.some(id => typeof id !== 'string' || !id) ||
      new Set(ids).size !== ids.length) fail('GRAPH_IDS');
  const n = documents.length;
  const scores = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    if (!vectors.has(ids[i])) fail('GRAPH_VECTOR');
    scores[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      if (!vectors.has(ids[j])) fail('GRAPH_VECTOR');
      const value = scorer(vectors.get(ids[i]), vectors.get(ids[j]));
      if (!Number.isFinite(value) || value < -1.000001 || value > 1.000001)
        fail('GRAPH_SCORE');
      scores[i][j] = value; scores[j][i] = value;
    }
  }
  const neighbors = scores.map((row, i) => Array.from({ length: n }, (_, j) => j)
    .filter(j => j !== i)
    .sort((a, b) => row[b] - row[a] ||
      (ids[a] < ids[b] ? -1 : ids[a] > ids[b] ? 1 : 0)));
  const top = neighbors.map(list => new Set(list.slice(0, 5)));
  const sixth = neighbors.map((list, i) => scores[i][list[5]]);
  const mutual = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) for (const j of top[i])
    if (top[j].has(i)) { mutual[i].add(j); mutual[j].add(i); }
  const pairs = [];
  for (let i = 0; i < n; i++) for (const j of mutual[i]) {
    if (j <= i) continue;
    let support = 0;
    for (const k of mutual[i]) if (mutual[j].has(k)) support++;
    const contrast = scores[i][j] - Math.max(sixth[i], sixth[j]);
    if (!Number.isFinite(contrast)) fail('GRAPH_CONTRAST');
    pairs.push({ i, j, support, contrast });
  }
  return { documents, ids, scores, neighbors, pairs };
}

function requireLabels(graph) {
  for (const doc of graph.documents)
    if (typeof doc.eventKey !== 'string' || !doc.eventKey ||
        typeof doc.lang !== 'string' || !doc.lang ||
        !Array.isArray(doc.categories) || typeof doc.categories[0] !== 'string')
      fail('GRAPH_LABELS');
}

export function calibrate(graph) {
  requireLabels(graph);
  const result = {};
  for (const [name, minimum] of [['triangle', 1], ['double-support', 2]]) {
    let maximum = -Infinity, negatives = 0;
    for (const pair of graph.pairs) {
      if (pair.support < minimum) continue;
      if (graph.documents[pair.i].eventKey === graph.documents[pair.j].eventKey)
        continue;
      negatives++;
      maximum = Math.max(maximum, pair.contrast);
    }
    result[name] = { threshold: negatives ? maximum + 1e-9 : 0,
      negativeCandidates: negatives };
  }
  result['seed-expand'] = { ...result['double-support'] };
  return result;
}

const eligible = (pair, minimum, threshold) =>
  pair.support >= minimum && pair.contrast > threshold;

export function admit(graph, name, calibration) {
  if (!variants.includes(name) || !calibration ||
      !Number.isFinite(calibration.threshold)) fail('ADMISSION_INPUT');
  const threshold = calibration.threshold;
  const pairs = graph.pairs;
  if (name !== 'seed-expand') return pairs.filter(pair =>
    eligible(pair, name === 'triangle' ? 1 : 2, threshold));
  const n = graph.documents.length;
  const selected = new Set();
  const key = pair => `${pair.i}:${pair.j}`;
  const candidates = pairs.filter(pair => eligible(pair, 3, threshold));
  const adjacency = Array.from({ length: n }, () => new Set());
  for (const pair of candidates) {
    adjacency[pair.i].add(pair.j); adjacency[pair.j].add(pair.i);
  }
  const seeds = candidates.filter(pair =>
    [...adjacency[pair.i]].some(k => adjacency[pair.j].has(k)));
  for (const pair of seeds) selected.add(key(pair));
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (const pair of seeds) parent[root(pair.j)] = root(pair.i);
  const assigned = new Set(seeds.flatMap(pair => [pair.i, pair.j]));
  if (assigned.size < 3) return seeds;
  const expandable = pairs.filter(pair => eligible(pair, 2, threshold));
  // Synchronous rounds and unique destination components avoid order effects.
  for (let round = 0; round < n; round++) {
    const additions = [];
    for (let node = 0; node < n; node++) {
      if (assigned.has(node)) continue;
      const destinations = new Map();
      for (const pair of expandable) {
        const other = pair.i === node ? pair.j : pair.j === node ? pair.i : -1;
        if (other < 0 || !assigned.has(other)) continue;
        const group = root(other);
        const links = destinations.get(group) ?? [];
        links.push(pair); destinations.set(group, links);
      }
      const qualified = [...destinations.values()].filter(links => links.length >= 2);
      if (qualified.length === 1) additions.push(...qualified[0]);
    }
    if (!additions.length) break;
    for (const pair of additions) {
      selected.add(key(pair));
      parent[root(pair.j)] = root(pair.i);
      assigned.add(pair.i); assigned.add(pair.j);
    }
  }
  return pairs.filter(pair => selected.has(key(pair)));
}

export function evaluate(graph, edges) {
  requireLabels(graph);
  if (!Array.isArray(edges)) fail('EVALUATION_INPUT');
  const n = graph.documents.length, parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  let trueEdges = 0, falseEdges = 0, hardFalseEdges = 0,
    crossLanguageTrueEdges = 0;
  const checked = new Set();
  for (const { i, j } of edges) {
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j <= i || j >= n ||
        checked.has(`${i}:${j}`)) fail('EVALUATION_EDGE');
    checked.add(`${i}:${j}`);
    const a = graph.documents[i], b = graph.documents[j];
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
    const label = graph.documents[i].eventKey;
    gold.set(label, (gold.get(label) ?? 0) + 1);
    const members = groups.get(root(i)) ?? [];
    members.push(i); groups.set(root(i), members);
  }
  let mixedGroups = 0, completeEvents = 0, groupedFalsePairs = 0, singletons = 0;
  for (const members of groups.values()) {
    if (members.length === 1) singletons++;
    const labels = new Map();
    for (const i of members) {
      const label = graph.documents[i].eventKey;
      labels.set(label, (labels.get(label) ?? 0) + 1);
    }
    if (labels.size > 1) mixedGroups++;
    else if (gold.get(labels.keys().next().value) === members.length) completeEvents++;
    groupedFalsePairs += countPairs(members.length) -
      [...labels.values()].reduce((sum, count) => sum + countPairs(count), 0);
  }
  return { trueEdges, falseEdges, hardFalseEdges, crossLanguageTrueEdges,
    completeEvents, mixedGroups, groupedFalsePairs, groups: groups.size,
    singletons };
}

export function denominators(graph) {
  requireLabels(graph);
  const rows = graph.documents;
  let truePairs = 0, falsePairs = 0, hardFalsePairs = 0, crossLanguageTruePairs = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (rows[i].eventKey === rows[j].eventKey) {
      truePairs++;
      if (rows[i].lang !== rows[j].lang) crossLanguageTruePairs++;
    } else {
      falsePairs++;
      if (rows[i].categories[0] === rows[j].categories[0]) hardFalsePairs++;
    }
  }
  return { articles: rows.length, events: new Set(rows.map(r => r.eventKey)).size,
    families: new Set(rows.map(r => r.categories[0])).size, truePairs,
    falsePairs, hardFalsePairs, crossLanguageTruePairs };
}

export const VARIANTS = Object.freeze([...variants]);
