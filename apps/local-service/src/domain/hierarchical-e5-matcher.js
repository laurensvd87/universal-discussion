// Offline exact exemplar experiment. These scores are not probabilities or runtime authority.
import { types } from 'node:util';

export const HIERARCHY_LIMITS = Object.freeze({
  dimensions: 384, maxNodes: 512, maxExamples: 4096, maxDepth: 8,
  maxSupport: 8, maxStringUnits: 160, normTolerance: 1e-5,
  // Exact scoring: coordinate products, dot dispatches, evidence/group visits,
  // sort comparisons and sibling visits. Compilation/validation and bounded
  // path resolution are separate costs, not a wall-clock performance guarantee.
  maxWork: 2_000_000,
});
export class HierarchyMatcherError extends TypeError {
  constructor(code, message) { super(message); this.name = 'HierarchyMatcherError'; this.code = code; }
}
const fail = message => { throw new HierarchyMatcherError('invalid-input', message); };
const capacity = message => { throw new HierarchyMatcherError('capacity', message); };
const handles = new WeakMap();
const SHA = /^[a-f0-9]{64}$/u;
const ARTIFACT_FIELDS = ['schema', 'representation', 'representationHash', 'taxonomyVersion',
  'evidenceVersion', 'calibrationVersion', 'calibrationStatus', 'nodes', 'examples', 'nodeRules'];
const RULE_FIELDS = ['nodeId', 'enabled', 'minSimilarity', 'meanSimilarity', 'minMargin', 'minNegativeMargin', 'minSupport'];

function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail('Expected a plain data record');
  if (Reflect.ownKeys(value).length !== fields.length) fail('Unexpected record fields');
  const copy = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail('Expected enumerable data fields');
    copy[field] = d.value;
  }
  return copy;
}
function array(value, maximum) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype) fail('Expected a plain dense array');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > maximum) capacity('Array capacity exceeded');
  if (Reflect.ownKeys(value).length !== length + 1) fail('Expected a dense array without extra fields');
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail('Expected array data elements');
    copy[i] = d.value;
  }
  return copy;
}
function string(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('Expected nonempty bounded identifier');
  }
  if (value.length > HIERARCHY_LIMITS.maxStringUnits) capacity('Identifier UTF-16 capacity exceeded');
  return value;
}
function representation(value, hash) {
  if (value !== 'raw-e5' && value !== 'pinned-ridge') fail('Unknown representation namespace');
  if (typeof hash !== 'string' || !SHA.test(hash)) fail('Expected lowercase SHA-256 representation hash');
}
function vector(value) {
  const copy = array(value, HIERARCHY_LIMITS.dimensions);
  if (copy.length !== HIERARCHY_LIMITS.dimensions) fail('Expected 384 dimensions');
  let norm = 0;
  for (const n of copy) {
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1) fail('Invalid vector coordinate');
    norm += n * n;
  }
  if (Math.abs(norm - 1) > HIERARCHY_LIMITS.normTolerance) fail('Expected unit vector; normalization is never implicit');
  return Object.freeze(copy);
}
function finite(value, low, high) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) fail('Invalid acceptance rule');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Compile a caller-owned artifact into a privately copied, opaque capability. */
export function compileHierarchyArtifact(input) {
  const a = record(input, ARTIFACT_FIELDS);
  if (a.schema !== 'hierarchical-e5-v1') fail('Unknown hierarchy schema');
  representation(a.representation, a.representationHash);
  for (const key of ['taxonomyVersion', 'evidenceVersion', 'calibrationVersion']) string(a[key]);
  if (!['synthetic', 'candidate'].includes(a.calibrationStatus)) fail('Only explicitly experimental calibration is supported');
  const nodes = array(a.nodes, HIERARCHY_LIMITS.maxNodes).map(n => record(n, ['id', 'parentId']));
  if (!nodes.length) fail('Empty taxonomy');
  const byId = new Map();
  for (const node of nodes) {
    string(node.id);
    if (node.parentId !== null) string(node.parentId);
    if (byId.has(node.id)) fail('Duplicate node identifier');
    byId.set(node.id, node);
  }
  nodes.sort((x, y) => lexical(x.id, y.id));
  for (const node of nodes) {
    const path = [], seen = new Set();
    let cursor = node;
    while (cursor) {
      if (seen.has(cursor.id)) fail('Taxonomy cycle');
      seen.add(cursor.id); path.unshift(cursor.id);
      if (path.length > HIERARCHY_LIMITS.maxDepth) capacity('Taxonomy depth exceeded');
      if (cursor.parentId !== null && !byId.has(cursor.parentId)) fail('Missing taxonomy parent');
      cursor = cursor.parentId === null ? null : byId.get(cursor.parentId);
    }
    node.path = path; node.positive = []; node.ownNegative = []; node.stop = [];
  }
  const rules = array(a.nodeRules, HIERARCHY_LIMITS.maxNodes).map(r => record(r, RULE_FIELDS));
  const ruleIds = new Set();
  for (const r of rules) {
    string(r.nodeId);
    if (typeof r.enabled !== 'boolean') fail('Every node rule requires explicit enabled boolean');
    if (!byId.has(r.nodeId) || ruleIds.has(r.nodeId)) fail('Duplicate or unknown node rule');
    ruleIds.add(r.nodeId);
    finite(r.minSimilarity, -1, 1); finite(r.meanSimilarity, -1, 1);
    finite(r.minMargin, 0, 2); finite(r.minNegativeMargin, 0, 2);
    if (!Number.isInteger(r.minSupport) || r.minSupport < 1 || r.minSupport > HIERARCHY_LIMITS.maxSupport) fail('Invalid independent support minimum');
    byId.get(r.nodeId).rule = r;
  }
  if (ruleIds.size !== nodes.length) fail('Every taxonomy node needs an explicit rule');
  const exampleIds = new Set();
  const examples = array(a.examples, HIERARCHY_LIMITS.maxExamples).map(e => {
    const row = record(e, ['id', 'nodeId', 'kind', 'groupId', 'vector']);
    string(row.id); string(row.nodeId); string(row.groupId);
    if (exampleIds.has(row.id) || !byId.has(row.nodeId)) fail('Duplicate example or unknown example node');
    exampleIds.add(row.id);
    if (!['positive', 'stop', 'outside'].includes(row.kind)) fail('Unknown evidence kind');
    row.vector = vector(row.vector);
    return row;
  }).sort((x, y) => lexical(x.id, y.id));
  for (let i = 0; i < examples.length; i++) {
    const e = examples[i], owner = byId.get(e.nodeId);
    if (e.kind === 'outside') owner.ownNegative.push(i);
    else {
      // STOP is positive membership of its own node, but counters its children.
      for (const id of owner.path) byId.get(id).positive.push(i);
      if (e.kind === 'stop') owner.stop.push(i);
    }
  }
  for (const node of nodes) {
    node.negative = node.path.flatMap(id => byId.get(id).ownNegative);
    node.parentStops = node.path.slice(0, -1).flatMap(id => byId.get(id).stop);
    node.siblings = nodes.filter(n => n.parentId === node.parentId && n.id !== node.id).map(n => n.id);
  }
  const metadata = Object.fromEntries(ARTIFACT_FIELDS.filter(k => !['nodes', 'examples', 'nodeRules'].includes(k)).map(k => [k, a[k]]));
  const handle = Object.freeze({});
  handles.set(handle, { nodes, byId, examples, metadata });
  return handle;
}

function score(compiled, input) {
  const state = handles.get(compiled);
  if (!state) fail('Expected compiled hierarchy capability');
  const w = record(input, ['sourceId', 'sourceVersion', 'representation', 'representationHash', 'vector']);
  string(w.sourceId); string(w.sourceVersion); representation(w.representation, w.representationHash);
  if (w.representation !== state.metadata.representation || w.representationHash !== state.metadata.representationHash) fail('Representation identity mismatch');
  const query = vector(w.vector);
  const work = { dotProducts: 0, scalarProducts: 0, units: 0 };
  const charge = n => { work.units += n; if (work.units > HIERARCHY_LIMITS.maxWork) capacity('Exact scoring work budget exceeded'); };
  const scores = state.examples.map(e => {
    charge(HIERARCHY_LIMITS.dimensions + 1); work.dotProducts++;
    let sum = 0;
    for (let i = 0; i < HIERARCHY_LIMITS.dimensions; i++) sum += query[i] * e.vector[i];
    work.scalarProducts += HIERARCHY_LIMITS.dimensions;
    return sum;
  });
  const best = indices => {
    let result = null;
    for (const i of indices) { charge(1); if (result === null || scores[i] > result) result = scores[i]; }
    return result;
  };
  const features = state.nodes.map(node => {
    const groups = new Map();
    for (const i of node.positive) {
      charge(1);
      const group = state.examples[i].groupId;
      if (!groups.has(group) || scores[i] > groups.get(group)) groups.set(group, scores[i]);
    }
    // Bounded sorted group maxima prevent duplicate origins from earning support.
    const values = [...groups.values()].sort((a, b) => { charge(1); return b - a; });
    const r = node.rule, bestSimilarity = values[0] ?? null;
    let support = 0, sum = 0;
    for (let i = 0; i < values.length; i++) {
      charge(1);
      if (values[i] >= r.minSimilarity) support++;
      if (i < r.minSupport) sum += values[i];
    }
    const meanSimilarity = values.length >= r.minSupport ? sum / r.minSupport : null;
    const negativeSimilarity = best(node.negative), stopSimilarity = best(node.stop);
    const parentStopSimilarity = best(node.parentStops);
    const negativeMargin = negativeSimilarity === null || bestSimilarity === null ? null : bestSimilarity - negativeSimilarity;
    const parentStopMargin = parentStopSimilarity === null || bestSimilarity === null ? null : bestSimilarity - parentStopSimilarity;
    const absoluteSupported = bestSimilarity !== null && bestSimilarity >= r.minSimilarity &&
      meanSimilarity !== null && meanSimilarity >= r.meanSimilarity && support >= r.minSupport;
    return { nodeId: node.id, bestSimilarity, meanSimilarity, support,
      positiveSimilarities: values.slice(0, HIERARCHY_LIMITS.maxSupport), positiveGroupCount: groups.size, negativeSimilarity,
      stopSimilarity, parentStopSimilarity, siblingMargin: null, negativeMargin, parentStopMargin,
      absoluteSupported, accepted: false };
  });
  const featureMap = new Map(features.map(f => [f.nodeId, f]));
  for (const f of features) {
    const node = state.byId.get(f.nodeId), r = node.rule;
    let siblingBest = null;
    for (const id of node.siblings) {
      charge(1);
      const b = featureMap.get(id).bestSimilarity;
      if (b !== null && (siblingBest === null || b > siblingBest)) siblingBest = b;
    }
    f.siblingMargin = siblingBest === null || f.bestSimilarity === null ? null : f.bestSimilarity - siblingBest;
    // A tie is ambiguity even if the calibrated margin is zero.
    f.accepted = r.enabled && f.absoluteSupported &&
      (f.negativeMargin === null || (f.negativeMargin > 0 && f.negativeMargin >= r.minNegativeMargin)) &&
      (f.parentStopMargin === null || (f.parentStopMargin > 0 && f.parentStopMargin >= r.minMargin)) &&
      (f.siblingMargin === null || (f.siblingMargin > 0 && f.siblingMargin >= r.minMargin));
  }
  return { state, witness: { sourceId: w.sourceId, sourceVersion: w.sourceVersion }, features, work };
}

/** All evidence is scored exactly once; feature scores have no probability interpretation. */
export function scoreHierarchy(compiled, witness) {
  const result = score(compiled, witness);
  return freeze({ features: result.features, work: result.work });
}

export function classifyHierarchy(compiled, witness, options = { multiPath: false }) {
  const o = record(options, ['multiPath']);
  if (typeof o.multiPath !== 'boolean') fail('Expected explicit boolean multiPath');
  const { state, witness: source, features, work } = score(compiled, witness);
  const accepted = features.filter(f => f.accepted);
  const deepest = accepted.filter(f => !accepted.some(other => other.nodeId !== f.nodeId &&
    state.byId.get(other.nodeId).path.includes(f.nodeId)));
  const featureMap = new Map(features.map(f => [f.nodeId, f]));
  const roots = new Map();
  for (const f of deepest) {
    const root = state.byId.get(f.nodeId).path[0];
    if (!roots.has(root)) roots.set(root, []);
    roots.get(root).push(f);
  }
  // Independent top-level branches may coexist. Within one branch, ambiguity at
  // an intermediate fork cannot be bypassed by two locally strong cousin leaves.
  const resolve = candidates => {
    if (candidates.length === 1) return candidates[0];
    const paths = candidates.map(f => state.byId.get(f.nodeId).path);
    let shared = 0;
    while (shared < paths[0].length && paths.every(p => p[shared] === paths[0][shared])) shared++;
    const branches = new Map();
    for (let i = 0; i < candidates.length; i++) {
      const child = paths[i][shared];
      if (!branches.has(child)) branches.set(child, []);
      branches.get(child).push(candidates[i]);
    }
    for (const [child, members] of branches) {
      const f = featureMap.get(child), r = state.byId.get(child).rule;
      if (f.siblingMargin !== null && f.siblingMargin > 0 && f.siblingMargin >= r.minMargin) return resolve(members);
    }
    for (let i = shared - 1; i >= 0; i--) {
      const f = featureMap.get(paths[0][i]);
      if (f.accepted) return f;
    }
    return null;
  };
  const resolved = [...roots.values()].map(resolve).filter(Boolean);
  resolved.sort((a, b) => b.bestSimilarity - a.bestSimilarity ||
    state.byId.get(b.nodeId).path.length - state.byId.get(a.nodeId).path.length || lexical(a.nodeId, b.nodeId));
  const selected = o.multiPath ? resolved : resolved.slice(0, 1);
  const paths = selected.map(f => [...state.byId.get(f.nodeId).path]);
  return freeze({ ...state.metadata, ...source, status: paths.length ? 'assigned' : 'unresolved',
    primaryNodeId: selected[0]?.nodeId ?? null, paths,
    reason: !paths.length ? 'insufficient-evidence' : state.nodes.some(n => n.parentId === selected[0].nodeId)
      ? 'supported-parent-stop' : 'supported-specific-node', features, work });
}
