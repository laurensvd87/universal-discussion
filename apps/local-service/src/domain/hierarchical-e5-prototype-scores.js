// Offline descriptor challenger: exhaustive raw features only, no classifier,
// confidence, approved Source/prototype provenance or production authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const HIERARCHY_PROTOTYPE_LIMITS = Object.freeze({ dimensions: 384, maxNodes: 1024,
  maxDepth: 8, maxPrototypesPerNode: 4, maxScalarProducts: 2_000_000,
  normToleranceSquared: 1e-5, maxStringUnits: 160 });
export class HierarchyPrototypeScoreError extends TypeError {
  constructor(code, message) { super(message); this.name = 'HierarchyPrototypeScoreError'; this.code = code; }
}
const bad = message => { throw new HierarchyPrototypeScoreError('invalid-input', message); };
const capacity = message => { throw new HierarchyPrototypeScoreError('capacity', message); };
const handles = new WeakMap();
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const SCHEMA = 'hierarchy-topic-descriptor-prototypes/v1';
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) bad('Expected exact prototype data record');
  const result = {};
  for (const name of fields) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected prototype data fields');
    result[name] = d.value;
  }
  return result;
}
function array(value, maximum) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype) bad('Expected plain dense prototype array');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > maximum) capacity('Prototype array capacity exceeded');
  if (Reflect.ownKeys(value).length !== length + 1) bad('Sparse or extended prototype array');
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected prototype array data elements');
    copy[i] = d.value;
  }
  return copy;
}
function text(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) bad('Invalid prototype/witness identifier');
  if (value.length > HIERARCHY_PROTOTYPE_LIMITS.maxStringUnits) capacity('Prototype/witness identifier UTF-16 capacity');
  return value;
}
function representation(name, hash) {
  if (!['raw-e5', 'paired-raw-e5-body-title-v1'].includes(name)) bad('Unsupported prototype representation namespace');
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) bad('Expected lowercase SHA-256 representation identity');
}
function vector(value) {
  const copy = array(value, HIERARCHY_PROTOTYPE_LIMITS.dimensions);
  if (copy.length !== HIERARCHY_PROTOTYPE_LIMITS.dimensions) bad('Expected 384 prototype dimensions');
  let norm = 0;
  for (const n of copy) {
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1) bad('Invalid prototype coordinate');
    norm += n * n;
  }
  if (Math.abs(norm - 1) > HIERARCHY_PROTOTYPE_LIMITS.normToleranceSquared) bad('Expected unit vector; no implicit normalization');
  return copy;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}

/** Hash contract: canonical field order, lexical node IDs, declared prototype
 * order, JSON numbers except a signed-zero string marker in numeric positions. */
export function compileHierarchyPrototypeScores(input) {
  const a = record(input, ['schema', 'representation', 'representationHash', 'nodes']);
  if (a.schema !== SCHEMA) bad('Unknown descriptor prototype schema');
  representation(a.representation, a.representationHash);
  const byId = new Map(); let prototypeCount = 0;
  const nodes = array(a.nodes, HIERARCHY_PROTOTYPE_LIMITS.maxNodes).map(value => {
    const n = record(value, ['id', 'parentId', 'prototypes']); text(n.id);
    if (n.parentId !== null) text(n.parentId);
    if (byId.has(n.id)) bad('Duplicate prototype taxonomy node');
    const p = array(n.prototypes, HIERARCHY_PROTOTYPE_LIMITS.maxPrototypesPerNode);
    if (!p.length) bad('Every descriptor node requires at least one prototype');
    prototypeCount += p.length;
    n.prototypes = p.map(vector); byId.set(n.id, n); return n;
  }).sort((x, y) => lexical(x.id, y.id));
  if (!nodes.length) bad('Empty prototype taxonomy');
  const depths = new Map();
  for (const n of nodes) {
    let cursor = n; const seen = new Set();
    while (cursor) {
      if (seen.has(cursor.id)) bad('Prototype taxonomy cycle');
      seen.add(cursor.id);
      if (seen.size > HIERARCHY_PROTOTYPE_LIMITS.maxDepth) capacity('Prototype taxonomy depth exceeded');
      if (cursor.parentId !== null && !byId.has(cursor.parentId)) bad('Missing prototype taxonomy parent');
      cursor = cursor.parentId === null ? null : byId.get(cursor.parentId);
    }
    depths.set(n.id, seen.size);
  }
  const scalarProducts = prototypeCount * HIERARCHY_PROTOTYPE_LIMITS.dimensions;
  if (scalarProducts > HIERARCHY_PROTOTYPE_LIMITS.maxScalarProducts) capacity('Prototype query scalar-product capacity');
  const canonical = { schema: a.schema, representation: a.representation, representationHash: a.representationHash, nodes };
  const artifactHash = createHash('sha256').update(JSON.stringify(canonical,
    (_key, value) => typeof value === 'number' && Object.is(value, -0) ? '-0' : value)).digest('hex');
  const metadata = freeze({ schema: SCHEMA, representation: a.representation, representationHash: a.representationHash,
    artifactHash, hashContract: 'canonical-json-sorted-nodes-prototype-order-signedzero-marker/v1',
    nodes: nodes.map(n => ({ id: n.id, parentId: n.parentId, prototypeCount: n.prototypes.length })),
    prototypeCount, experimental: true, productionValidated: false });
  const descending = [...nodes].sort((x, y) => depths.get(y.id) - depths.get(x.id) || lexical(x.id, y.id));
  const handle = Object.freeze({}); handles.set(handle, { nodes, byId, descending, scalarProducts, metadata });
  return handle;
}

export function describeHierarchyPrototypeScores(handle) {
  const state = handles.get(handle);
  if (!state) bad('Expected privately compiled descriptor prototypes');
  return state.metadata;
}

export function scoreHierarchyPrototypeScores(handle, input) {
  const state = handles.get(handle);
  if (!state) bad('Expected privately compiled descriptor prototypes');
  // Inclusive preflight precedes query-coordinate validation and every dot.
  if (state.scalarProducts > HIERARCHY_PROTOTYPE_LIMITS.maxScalarProducts) capacity('Prototype query scalar-product capacity');
  const w = record(input, ['sourceId', 'sourceVersion', 'representation', 'representationHash', 'vector']);
  text(w.sourceId); text(w.sourceVersion); representation(w.representation, w.representationHash);
  if (w.representation !== state.metadata.representation || w.representationHash !== state.metadata.representationHash) bad('Prototype representation identity mismatch');
  const query = vector(w.vector), work = { dotProducts: 0, scalarProducts: 0, subtreeComparisons: 0, siblingComparisons: 0 };
  const features = state.nodes.map(n => {
    let directScore = -Infinity;
    for (const p of n.prototypes) {
      let sum = 0;
      for (let k = 0; k < query.length; k++) sum += query[k] * p[k];
      work.dotProducts++; work.scalarProducts += query.length;
      if (sum > directScore) directScore = sum;
    }
    return { nodeId: n.id, directScore, subtreeScore: directScore, siblingContrast: null, parentDirectContrast: null };
  });
  const byId = new Map(features.map(f => [f.nodeId, f]));
  for (const n of state.descending) if (n.parentId !== null) {
    const parent = byId.get(n.parentId), child = byId.get(n.id);
    work.subtreeComparisons++;
    if (child.subtreeScore > parent.subtreeScore) parent.subtreeScore = child.subtreeScore;
  }
  // Two maxima per sibling group give exact exclusion of the current node in
  // linear work, including tied siblings and roots as their own sibling group.
  const siblings = new Map();
  for (const n of state.nodes) {
    if (!siblings.has(n.parentId)) siblings.set(n.parentId, { first: null, second: null });
    const top = siblings.get(n.parentId), value = byId.get(n.id).subtreeScore;
    if (top.first === null) top.first = value;
    else {
      work.siblingComparisons++;
      if (value > top.first) { top.second = top.first; top.first = value; }
      else {
        if (top.second !== null) work.siblingComparisons++;
        if (top.second === null || value > top.second) top.second = value;
      }
    }
  }
  for (const n of state.nodes) {
    const f = byId.get(n.id), top = siblings.get(n.parentId);
    if (top.second !== null) {
      work.siblingComparisons++;
      f.siblingContrast = f.subtreeScore - (f.subtreeScore === top.first ? top.second : top.first);
    }
    if (n.parentId !== null) f.parentDirectContrast = f.subtreeScore - byId.get(n.parentId).directScore;
  }
  return freeze({ ...state.metadata, sourceId: w.sourceId, sourceVersion: w.sourceVersion, features, work });
}
