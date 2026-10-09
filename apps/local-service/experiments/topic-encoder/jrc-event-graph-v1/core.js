// Offline, label-blind graph prototype. Gold labels are used only by evaluateGraph.
const pairCount = n => n * (n - 1) / 2;
const normalizeTitle = title => title.normalize('NFKC').toLocaleLowerCase()
  .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const titleTokens = title => new Set(normalizeTitle(title)
  .match(/(?:[\p{L}]{2,}|[\p{N}]+)/gu) ?? []);
const jaccard = (a, b) => {
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared++;
  return shared / union.size;
};
const similarity = (a, b) => {
  let dot = 0;
  for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
  return dot;
};
const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function normalizedVectors(documents, vectors) {
  const dimension = vectors.get(documents[0]?.id)?.length;
  if (!Number.isInteger(dimension) || dimension < 2) throw new TypeError('Missing vector');
  return documents.map(doc => {
    const vector = vectors.get(doc.id);
    if (!vector || vector.length !== dimension) throw new TypeError('Missing vector');
    const length = Math.hypot(...vector);
    if (!Number.isFinite(length) || length < 1e-9) throw new TypeError('Invalid vector');
    return Float64Array.from(vector, value => value / length);
  });
}

function components(n, edges) {
  const root = Int32Array.from({ length: n }, (_, i) => i);
  const find = i => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  for (const edge of edges) root[find(edge.j)] = find(edge.i);
  return Array.from({ length: n }, (_, i) => find(i));
}

/** Matcher input deliberately excludes LABEL. URL host is only an eligibility proxy. */
export function buildEventGraph(documents, vectors) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 1200)
    throw new TypeError('Invalid documents');
  const views = normalizedVectors(documents, vectors);
  const tokens = documents.map(doc => titleTokens(doc.title));
  const titles = documents.map(doc => normalizeTitle(doc.title));
  const neighbors = Array.from({ length: documents.length }, () => new Set());
  const candidates = [];
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    if (!documents[i].source || !documents[j].source || documents[i].source === documents[j].source) continue;
    const score = similarity(views[i], views[j]);
    if (score < 0.90) continue;
    const lexical = jaccard(tokens[i], tokens[j]);
    candidates.push({ i, j, score, lexical, identical: titles[i] === titles[j] });
    neighbors[i].add(j); neighbors[j].add(i);
  }
  const triangleCount = (i, j) => {
    const a = neighbors[i], b = neighbors[j];
    let count = 0;
    for (const k of a.size < b.size ? a : b)
      if (k !== i && k !== j && (a.size < b.size ? b : a).has(k)) count++;
    return count;
  };
  const supported = candidates.filter(edge => {
    edge.triangles = triangleCount(edge.i, edge.j);
    return edge.lexical >= 0.50 || edge.triangles >= 2;
  });
  // A provisional join is based on local corroboration only. It does not veto
  // membership because of unrelated outside reports and has no member cap.
  const support = new Set(supported.map(edge => key(edge.i, edge.j)));
  const parent = Int32Array.from({ length: documents.length }, (_, i) => i);
  const members = Array.from({ length: documents.length }, (_, i) => [i]);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const admitted = [];
  supported.sort((a, b) => b.score - a.score || b.lexical - a.lexical || a.i - b.i || a.j - b.j);
  for (const edge of supported) {
    const a = find(edge.i), b = find(edge.j);
    if (a === b) continue;
    const left = members[a], right = members[b];
    let links = 0;
    const leftEnds = new Set(), rightEnds = new Set();
    for (const i of left) for (const j of right) if (support.has(key(i, j))) {
      links++; leftEnds.add(i); rightEnds.add(j);
    }
    const allowed = left.length === 1 && right.length === 1
      ? edge.lexical >= 0.50 || edge.triangles >= 2
      : Math.min(left.length, right.length) === 1
        ? links >= 2 && Math.max(leftEnds.size, rightEnds.size) >= 2
        : links >= 3 && leftEnds.size >= 2 && rightEnds.size >= 2;
    if (!allowed) continue;
    parent[b] = a;
    members[a] = left.concat(right);
    members[b] = [];
    admitted.push(edge);
  }
  const baseline090 = components(documents.length, candidates);
  const baseline094 = components(documents.length, candidates.filter(edge => edge.score >= 0.94));
  return { candidates, supported, admitted,
    assignments: Array.from({ length: documents.length }, (_, i) => find(i)),
    baseline090, baseline094 };
}

function groupMetrics(documents, assignments) {
  const groups = new Map(), goldSizes = new Map();
  for (let i = 0; i < documents.length; i++) {
    const label = documents[i].cluster;
    goldSizes.set(label, (goldSizes.get(label) ?? 0) + 1);
    const labels = groups.get(assignments[i]) ?? new Map();
    labels.set(label, (labels.get(label) ?? 0) + 1);
    groups.set(assignments[i], labels);
  }
  let mixedGroups = 0, completeLabels = 0, truePairs = 0, falsePairs = 0;
  for (const labels of groups.values()) {
    const counts = [...labels.values()];
    const size = counts.reduce((sum, n) => sum + n, 0);
    const trueInGroup = counts.reduce((sum, n) => sum + pairCount(n), 0);
    truePairs += trueInGroup;
    falsePairs += pairCount(size) - trueInGroup;
    if (labels.size > 1) mixedGroups++;
    if (labels.size === 1) {
      const [label, count] = labels.entries().next().value;
      if (count === goldSizes.get(label)) completeLabels++;
    }
  }
  return { groups: groups.size, mixedGroups, completeLabels,
    goldLabels: goldSizes.size, groupedTruePairs: truePairs, groupedFalsePairs: falsePairs };
}

function edgeMetrics(documents, edges) {
  let trueEdges = 0, falseEdges = 0, differentLanguageTrue = 0, differentLanguageFalse = 0;
  for (const { i, j } of edges) {
    const positive = documents[i].cluster === documents[j].cluster;
    if (positive) trueEdges++; else falseEdges++;
    if (documents[i].language && documents[j].language && documents[i].language !== documents[j].language) {
      if (positive) differentLanguageTrue++; else differentLanguageFalse++;
    }
  }
  return { trueEdges, falseEdges, differentLanguageTrue, differentLanguageFalse };
}

export function evaluateGraph(documents, graph) {
  return { articles: documents.length, goldLabels: new Set(documents.map(doc => doc.cluster)).size,
    candidate090: edgeMetrics(documents, graph.candidates),
    baseline094: { edges: edgeMetrics(documents, graph.candidates.filter(edge => edge.score >= 0.94)),
      components: groupMetrics(documents, graph.baseline094) },
    baseline090: { edges: edgeMetrics(documents, graph.candidates),
      components: groupMetrics(documents, graph.baseline090) },
    graph: { supportedEdges: edgeMetrics(documents, graph.supported),
      mergeEdges: edgeMetrics(documents, graph.admitted),
      components: groupMetrics(documents, graph.assignments) } };
}
