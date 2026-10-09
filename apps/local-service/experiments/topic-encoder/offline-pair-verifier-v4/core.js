// Label-blind graph policies; gold event keys are used only in aggregate evaluation.
const pairCount = n => n * (n - 1) / 2;
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function partitionFromEdges(n, edges) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const { i, j } of edges) parent[root(j)] = root(i);
  return Array.from({ length: n }, (_, i) => root(i));
}

function bridgePartition(n, gateEdges, triangleEdges) {
  const seed = partitionFromEdges(n, triangleEdges);
  let groups = [];
  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const group = byRoot.get(seed[i]) ?? [];
    group.push(i); byRoot.set(seed[i], group);
  }
  groups = [...byRoot.values()];
  const scores = new Map(gateEdges.map(edge => [edgeKey(edge.i, edge.j), edge.score]));
  while (true) {
    let best = null;
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      let links = 0, maximum = -Infinity;
      const left = new Set(), right = new Set();
      for (const i of groups[a]) for (const j of groups[b]) {
        const score = scores.get(edgeKey(i, j));
        if (score === undefined) continue;
        links++; maximum = Math.max(maximum, score); left.add(i); right.add(j);
      }
      if (links >= 2 && left.size >= 2 && right.size >= 2 &&
          (!best || maximum > best.score)) best = { a, b, score: maximum };
    }
    if (!best) break;
    groups[best.a].push(...groups[best.b]);
    groups.splice(best.b, 1);
  }
  const assignments = new Int32Array(n);
  groups.forEach((group, index) => group.forEach(i => { assignments[i] = index; }));
  return [...assignments];
}

function edgeMetrics(documents, edges) {
  let trueEdges = 0, falseEdges = 0, crossLanguageTrueEdges = 0;
  for (const { i, j } of edges) {
    const a = documents[i], b = documents[j];
    if (a.eventKey === b.eventKey) {
      trueEdges++;
      if (a.lang !== b.lang) crossLanguageTrueEdges++;
    } else falseEdges++;
  }
  return { trueEdges, falseEdges, crossLanguageTrueEdges };
}

function groupMetrics(documents, assignments) {
  const groups = new Map(), gold = new Map();
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    gold.set(doc.eventKey, (gold.get(doc.eventKey) ?? 0) + 1);
    const group = groups.get(assignments[i]) ?? [];
    group.push(i); groups.set(assignments[i], group);
  }
  let mixedGroups = 0, completeEvents = 0, joinedTrue = 0, joinedFalse = 0,
    crossLanguageTrueJoined = 0;
  for (const group of groups.values()) {
    const labels = new Map();
    for (const i of group) labels.set(documents[i].eventKey,
      (labels.get(documents[i].eventKey) ?? 0) + 1);
    const truePairs = [...labels.values()].reduce((sum, n) => sum + pairCount(n), 0);
    joinedTrue += truePairs; joinedFalse += pairCount(group.length) - truePairs;
    if (labels.size > 1) mixedGroups++;
    if (labels.size === 1) {
      const [label, count] = labels.entries().next().value;
      if (gold.get(label) === count) completeEvents++;
    }
    for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
      const left = documents[group[a]], right = documents[group[b]];
      if (left.eventKey === right.eventKey && left.lang !== right.lang)
        crossLanguageTrueJoined++;
    }
  }
  return { groups: groups.size, mixedGroups, joinedTrue, joinedFalse,
    completeEvents, goldEvents: gold.size, crossLanguageTrueJoined };
}

export function evaluateGraphPolicies(documents, vectors, scorer, threshold) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 1200 ||
      typeof scorer !== 'function' || !Number.isFinite(threshold) ||
      threshold < 0 || threshold > 1) throw new TypeError('GRAPH_INPUT');
  const n = documents.length, neighbors = Array.from({ length: n }, () => new Set());
  const gateEdges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const score = scorer(vectors.get(documents[i].id), vectors.get(documents[j].id));
    if (!Number.isFinite(score)) throw new TypeError('SCORE');
    if (score < threshold) continue;
    gateEdges.push({ i, j, score });
    neighbors[i].add(j); neighbors[j].add(i);
  }
  const triangleEdges = gateEdges.filter(({ i, j }) => {
    const a = neighbors[i], b = neighbors[j];
    for (const k of a.size < b.size ? a : b)
      if ((a.size < b.size ? b : a).has(k)) return true;
    return false;
  });
  const policies = {
    thresholdComponents: { edges: gateEdges,
      assignments: partitionFromEdges(n, gateEdges) },
    triangleSupportedComponents: { edges: triangleEdges,
      assignments: partitionFromEdges(n, triangleEdges) },
    twoIndependentSupportBridge: { edges: gateEdges,
      assignments: bridgePartition(n, gateEdges, triangleEdges) },
  };
  return Object.fromEntries(Object.entries(policies).map(([name, policy]) =>
    [name, { eligibleEdges: edgeMetrics(documents, policy.edges),
      components: groupMetrics(documents, policy.assignments) }]));
}
