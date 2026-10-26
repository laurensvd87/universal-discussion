// Experimental explicit stopping rules. Thresholds are caller-specified and
// uncalibrated here; this module supplies no confidence or assignment authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { describeHierarchyPrototypeScores, scoreHierarchyPrototypeScores,
  HIERARCHY_PROTOTYPE_LIMITS } from './hierarchical-e5-prototype-scores.js';

export class HierarchyPrototypePolicyError extends TypeError {
  constructor(code, message) { super(message); this.name = 'HierarchyPrototypePolicyError'; this.code = code; }
}
const bad = message => { throw new HierarchyPrototypePolicyError('invalid-input', message); };
const capacity = message => { throw new HierarchyPrototypePolicyError('capacity', message); };
const handles = new WeakMap();
const SCHEMA = 'hierarchy-topic-descriptor-policy/v1';
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) bad('Expected exact plain prototype-policy data');
  const copy = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected policy data fields');
    copy[field] = d.value;
  }
  return copy;
}
function array(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype) bad('Expected dense policy array');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > HIERARCHY_PROTOTYPE_LIMITS.maxNodes) capacity('Prototype-policy node capacity');
  if (Reflect.ownKeys(value).length !== length + 1) bad('Sparse or extended policy array');
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected policy array data elements');
    copy[i] = d.value;
  }
  return copy;
}
function text(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) bad('Invalid prototype-policy identifier');
  if (value.length > HIERARCHY_PROTOTYPE_LIMITS.maxStringUnits) capacity('Prototype-policy identifier UTF-16 capacity');
  return value;
}
function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) bad('Expected lowercase policy SHA-256'); }
function threshold(value, low, high) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) bad('Invalid prototype-policy threshold');
  return value === 0 ? 0 : value;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}

/** The scorer capability is validated by its owner; caller feature packets are
 * never trusted. Null sibling thresholds are legal exactly when no peer exists. */
export function compileHierarchyPrototypePolicy(scorerHandle, input) {
  const scorer = describeHierarchyPrototypeScores(scorerHandle);
  const a = record(input, ['schema', 'policyVersion', 'scorerArtifactHash', 'representation', 'representationHash', 'nodes', 'nodeRules']);
  if (a.schema !== SCHEMA) bad('Unknown prototype-policy schema');
  text(a.policyVersion); hash(a.scorerArtifactHash); hash(a.representationHash);
  if (a.scorerArtifactHash !== scorer.artifactHash || a.representation !== scorer.representation ||
      a.representationHash !== scorer.representationHash) bad('Prototype-policy scorer identity mismatch');
  const nodes = array(a.nodes).map(value => {
    const n = record(value, ['id', 'parentId']); text(n.id); if (n.parentId !== null) text(n.parentId); return n;
  }).sort((x, y) => lexical(x.id, y.id));
  if (nodes.length !== scorer.nodes.length || nodes.some((n, i) => n.id !== scorer.nodes[i].id || n.parentId !== scorer.nodes[i].parentId)) bad('Policy taxonomy must exactly match its scorer');
  const children = new Map(), nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const n of nodes) {
    if (!children.has(n.parentId)) children.set(n.parentId, []);
    children.get(n.parentId).push(n.id);
  }
  const rules = new Map();
  const nodeRules = array(a.nodeRules).map(value => {
    const r = record(value, ['nodeId', 'enabled', 'minSubtreeScore', 'minSiblingContrast', 'minParentDirectContrast']);
    text(r.nodeId);
    if (!nodeMap.has(r.nodeId) || rules.has(r.nodeId) || typeof r.enabled !== 'boolean') bad('Invalid or duplicate node policy');
    r.minSubtreeScore = threshold(r.minSubtreeScore, -1, 1);
    const node = nodeMap.get(r.nodeId), hasPeer = children.get(node.parentId).length > 1;
    if (hasPeer) r.minSiblingContrast = threshold(r.minSiblingContrast, -2, 2);
    else if (r.minSiblingContrast !== null) bad('No-peer sibling threshold must be null');
    if (r.minParentDirectContrast !== null) {
      if (node.parentId === null) bad('Root parent contrast must be null');
      r.minParentDirectContrast = threshold(r.minParentDirectContrast, -2, 2);
    }
    rules.set(r.nodeId, r); return r;
  }).sort((x, y) => lexical(x.nodeId, y.nodeId));
  if (rules.size !== nodes.length) bad('Every prototype node requires one explicit policy');
  const definition = freeze({ schema: SCHEMA, policyVersion: a.policyVersion, scorerArtifactHash: a.scorerArtifactHash,
    representation: a.representation, representationHash: a.representationHash, nodes, nodeRules,
    decoder: 'single-unique-eligible-root-then-child/v1', comparison: 'inclusive-thresholds-no-top-one-tiebreak' });
  const identity = freeze({ schema: SCHEMA, policyVersion: a.policyVersion,
    policyHash: createHash('sha256').update(JSON.stringify(definition)).digest('hex'),
    scorerArtifactHash: a.scorerArtifactHash, representation: a.representation, representationHash: a.representationHash,
    experimental: true, calibrationStatus: 'uncalibrated', productionValidated: false });
  const handle = Object.freeze({}); handles.set(handle, { scorerHandle, identity, definition, children, rules });
  return handle;
}

export function describeHierarchyPrototypePolicy(handle) {
  const state = handles.get(handle);
  if (!state) bad('Expected privately compiled prototype policy');
  return freeze({ ...state.identity, definition: state.definition });
}

/** Scoring is always done internally against the compiled scorer. Eligible
 * ambiguity never chooses a nearest leaf: roots abstain, children keep parent. */
export function classifyHierarchyPrototypePolicy(handle, input) {
  const state = handles.get(handle);
  if (!state) bad('Expected privately compiled prototype policy');
  const scored = scoreHierarchyPrototypeScores(state.scorerHandle, input);
  const features = new Map(scored.features.map(f => [f.nodeId, f]));
  let policyEvaluations = 0;
  const eligible = parentId => (state.children.get(parentId) ?? []).filter(nodeId => {
    policyEvaluations++;
    const r = state.rules.get(nodeId), f = features.get(nodeId);
    return r.enabled && f.subtreeScore >= r.minSubtreeScore &&
      (r.minSiblingContrast === null || f.siblingContrast !== null && f.siblingContrast >= r.minSiblingContrast) &&
      (r.minParentDirectContrast === null || f.parentDirectContrast !== null && f.parentDirectContrast >= r.minParentDirectContrast);
  });
  const roots = eligible(null), path = [];
  let reason = roots.length === 0 ? 'no-eligible-root' : roots.length > 1 ? 'ambiguous-roots' : null;
  if (reason === null) {
    let current = roots[0];
    while (true) {
      path.push(current);
      if (path.length > HIERARCHY_PROTOTYPE_LIMITS.maxDepth) capacity('Prototype-policy path capacity');
      if (!state.children.has(current)) { reason = 'deepest-eligible-node'; break; }
      const candidates = eligible(current);
      if (candidates.length !== 1) { reason = candidates.length ? 'ambiguous-children' : 'supported-parent-stop'; break; }
      current = candidates[0];
    }
  }
  return freeze({ ...state.identity, sourceId: scored.sourceId, sourceVersion: scored.sourceVersion,
    status: path.length ? 'assigned' : 'unresolved', primaryNodeId: path.at(-1) ?? null, path, reason,
    work: { ...scored.work, policyEvaluations } });
}
