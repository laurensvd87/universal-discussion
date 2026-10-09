// Label-blind, synchronous singleton attachment to frozen v1 double-support groups.
import { admit } from '../local-contrast-gate-v1/core.js';

const fail = code => { throw new TypeError(code); };
const EPSILON = 1e-9;

function requireGraph(graph) {
  if (!graph || !Array.isArray(graph.documents) || !Array.isArray(graph.pairs) ||
      graph.documents.length < 8 || graph.documents.length > 324) fail('ATTACH_GRAPH');
  const ids = graph.documents.map(doc => doc?.id);
  if (ids.some(id => typeof id !== 'string' || !id) ||
      new Set(ids).size !== ids.length) fail('ATTACH_IDS');
  const seen = new Set();
  for (const pair of graph.pairs) {
    if (!Number.isInteger(pair.i) || !Number.isInteger(pair.j) ||
        pair.i < 0 || pair.j <= pair.i || pair.j >= graph.documents.length ||
        !Number.isInteger(pair.support) || pair.support < 0 ||
        !Number.isFinite(pair.contrast) || seen.has(`${pair.i}:${pair.j}`))
      fail('ATTACH_PAIR');
    seen.add(`${pair.i}:${pair.j}`);
  }
}

function requireCutoffs(doubleCutoff, triangleCutoff) {
  if (!Number.isFinite(doubleCutoff?.threshold) ||
      !Number.isFinite(triangleCutoff?.threshold)) fail('ATTACH_CUTOFF');
}

function components(n, edges) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (const pair of edges) parent[root(pair.j)] = root(pair.i);
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const group = root(i);
    const members = groups.get(group) ?? [];
    members.push(i); groups.set(group, members);
  }
  return { root, groups };
}

function proposals(graph, doubleCutoff, triangleCutoff) {
  requireGraph(graph);
  requireCutoffs(doubleCutoff, triangleCutoff);
  const base = admit(graph, 'double-support', doubleCutoff);
  const { root, groups } = components(graph.documents.length, base);
  const candidates = graph.pairs.filter(pair => pair.support >= 1 &&
    pair.contrast > triangleCutoff.threshold);
  const proposed = [];
  for (const [singleton, own] of groups) {
    if (own.length !== 1) continue;
    const node = singleton;
    const destinations = new Map();
    for (const pair of candidates) {
      const other = pair.i === node ? pair.j : pair.j === node ? pair.i : -1;
      if (other < 0) continue;
      const destination = root(other);
      if (destination === node || groups.get(destination).length < 2) continue;
      const links = destinations.get(destination) ?? [];
      links.push(pair); destinations.set(destination, links);
    }
    const qualified = [...destinations.entries()].filter(([, links]) => links.length >= 2);
    if (qualified.length !== 1) continue;
    const [group, links] = qualified[0];
    const ranked = links.sort((a, b) => b.contrast - a.contrast ||
      (graph.documents[a.i === node ? a.j : a.i].id <
       graph.documents[b.i === node ? b.j : b.i].id ? -1 : 1));
    const rival = Math.max(0, ...[...destinations.entries()]
      .filter(([destination]) => destination !== group)
      .flatMap(([, others]) => others.map(pair => pair.contrast)));
    proposed.push({ node, group, links: ranked.slice(0, 2),
      margin: ranked[1].contrast - rival });
  }
  return { base, proposed, groups };
}

// Calibration labels are confined here. A negative attachment is any proposal
// whose singleton differs from at least one member of its destination group.
export function calibrateAttachment(graph, doubleCutoff, triangleCutoff) {
  requireCutoffs(doubleCutoff, triangleCutoff);
  // Use pre-triangle candidate margins. Calibrating after v1's maximum
  // negative triangle cutoff would hide every calibration false candidate.
  const { proposed, groups } = proposals(graph, doubleCutoff,
    { threshold: -3 });
  for (const doc of graph.documents)
    if (typeof doc.eventKey !== 'string' || !doc.eventKey) fail('ATTACH_LABEL');
  let maximum = -Infinity, negatives = 0;
  for (const item of proposed) {
    if (groups.get(item.group).some(member =>
      graph.documents[member].eventKey !== graph.documents[item.node].eventKey)) {
      maximum = Math.max(maximum, item.margin);
      negatives++;
    }
  }
  return { threshold: negatives ? maximum + EPSILON : 0,
    negativeCandidates: negatives };
}

export function attachSingletons(graph, doubleCutoff, triangleCutoff,
    attachmentCutoff) {
  if (!Number.isFinite(attachmentCutoff?.threshold)) fail('ATTACH_MARGIN');
  const { base, proposed } = proposals(graph, doubleCutoff, triangleCutoff);
  const added = proposed.filter(item => item.margin > attachmentCutoff.threshold)
    .flatMap(item => item.links);
  return { edges: base.concat(added), baseEdges: base.length,
    addedEdges: added.length, attachedSingletons: added.length / 2,
    eligibleProposals: proposed.length,
    rejectedProposals: proposed.length - added.length / 2 };
}
