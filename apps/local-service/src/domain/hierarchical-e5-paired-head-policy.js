// Versioned source adaptation of hierarchical-e5-head-policy.js; paired inputs only.
// Experimental calibration and single-path decisions. Never canonical authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { compileHierarchyLinearHeads, scoreHierarchyLinearHeads } from './hierarchical-e5-paired-linear-heads.js';

export const HEAD_POLICY_GRID = Object.freeze({
  thresholds: Object.freeze([-0.25, 0, 0.25, 0.5, 0.75, 1, 1.25]),
  margins: Object.freeze([0, 0.05, 0.1, 0.2, 0.4]),
});
const handles = new WeakMap();
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const invalid = () => { throw new TypeError('Invalid experimental hierarchy head policy'); };
const capacity = () => { throw Object.assign(new RangeError('Hierarchy head policy capacity exceeded'), { code: 'capacity' }); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function frozen(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) frozen(v);Object.freeze(value); }
  return value;
}
function data(value) {
  let units = 0;
  const copy = (v, depth) => {
    if (++units > 1_000_000) capacity();
    if (depth > 12) invalid();
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { if (v.length > 1024) capacity();return v; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) invalid();return v; }
    if (typeof v !== 'object' || types.isProxy(v)) invalid();
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) invalid();
    const keys = Reflect.ownKeys(v), result = array ? [] : {};
    if (keys.length > 4097) capacity();
    if (array) {
      const length = Object.getOwnPropertyDescriptor(v, 'length').value;
      if (keys.length !== length + 1 || length > 4096) invalid();
      for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
        result.push(copy(d.value, depth + 1));
      }
    } else for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
      result[key] = copy(d.value, depth + 1);
    }
    return result;
  };
  return copy(value, 0);
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) invalid();
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !value.length || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
}
function taxonomy(model) {
  const map = new Map(model.nodes.map(n => [n.id, n]));
  const paths = new Map();
  for (const node of model.nodes) {
    const path = [];let cursor = node;
    while (cursor) { path.unshift(cursor.id);cursor = map.get(cursor.parentId); }
    paths.set(node.id, path);
  }
  return { nodes: model.nodes, paths, parents: new Set(model.nodes.map(n => n.parentId).filter(n => n !== null)),
    roots: model.nodes.filter(n => n.parentId === null).map(n => n.id) };
}
function featuresFor(meta, packet) {
  const values = new Map(packet.scores.map(s => [s.nodeId, s.enabled ? s.score : null]));
  return meta.nodes.map(node => {
    const score = values.get(node.id);
    const siblings = meta.nodes.filter(n => n.parentId === node.parentId && n.id !== node.id)
      .map(n => values.get(n.id)).filter(v => v !== null);
    return { nodeId: node.id, score, siblingMargin: score === null || !siblings.length ? null : score - Math.max(...siblings) };
  });
}
function passes(feature, rule) {
  return rule.enabled && feature.score !== null && feature.score >= rule.minScore &&
    (feature.siblingMargin === null || feature.siblingMargin > 0 && feature.siblingMargin >= rule.minMargin);
}
function scoreRows(model, compiled, rows, split) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 512) capacity();
  const meta = taxonomy(model), ids = new Set(), groups = new Set();
  const trainingIds = new Set(model.trainingIdHashes), trainingGroups = new Set(model.trainingGroupHashes);
  return rows.map(row => {
    exact(row, ['id', 'groupId', 'split', 'language', 'expectedTopicId', 'vector']);
    identifier(row.id);identifier(row.groupId);identifier(row.language);
    if (row.split !== split || ids.has(row.id) || groups.has(row.groupId) || trainingIds.has(hash(row.id)) ||
        trainingGroups.has(hash(row.groupId)) || row.expectedTopicId !== null && !meta.paths.has(row.expectedTopicId)) invalid();
    ids.add(row.id);groups.add(row.groupId);
    const scores = scoreHierarchyLinearHeads(compiled, { sourceId: row.id, sourceVersion: split,
      representation: model.representation, representationHash: model.representationHash, vector: row.vector });
    return { row, features: featuresFor(meta, scores) };
  });
}

/** Fit acceptance only on a separate calibration split, not on development/test. */
export function calibrateHierarchyHeadPolicy(input) {
  const { model, rows, minimumAcceptedGroups, targetPrecision } = exact(data(input),
    ['model', 'rows', 'minimumAcceptedGroups', 'targetPrecision']);
  const compiled = compileHierarchyLinearHeads(model), meta = taxonomy(model);
  if (!Number.isInteger(minimumAcceptedGroups) || minimumAcceptedGroups < 2 || minimumAcceptedGroups > 512 ||
      typeof targetPrecision !== 'number' || targetPrecision < 0.5 || targetPrecision > 1) invalid();
  if (!Array.isArray(rows) || rows.length * meta.nodes.length * HEAD_POLICY_GRID.thresholds.length * HEAD_POLICY_GRID.margins.length > 4_000_000) capacity();
  const scored = scoreRows(model, compiled, rows, 'calibration');
  const rules = meta.nodes.map(node => {
    let best = null;
    const enabled = model.heads.find(h => h.nodeId === node.id).enabled;
    for (const minScore of HEAD_POLICY_GRID.thresholds) for (const minMargin of HEAD_POLICY_GRID.margins) {
      const rule = { nodeId: node.id, enabled, minScore, minMargin };
      let acceptedGroups = 0, correctGroups = 0;
      for (const sample of scored) {
        if (!passes(sample.features.find(f => f.nodeId === node.id), rule)) continue;
        acceptedGroups++;
        if (sample.row.expectedTopicId !== null && meta.paths.get(sample.row.expectedTopicId).includes(node.id)) correctGroups++;
      }
      if (acceptedGroups < minimumAcceptedGroups || correctGroups / acceptedGroups < targetPrecision) continue;
      const candidate = { ...rule, acceptedGroups, correctGroups };
      if (!best || correctGroups > best.correctGroups || correctGroups === best.correctGroups &&
          (acceptedGroups < best.acceptedGroups || acceptedGroups === best.acceptedGroups &&
            (minMargin > best.minMargin || minMargin === best.minMargin && minScore > best.minScore))) best = candidate;
    }
    return best ?? { nodeId: node.id, enabled: false, minScore: 1.25, minMargin: 0.4, acceptedGroups: 0, correctGroups: 0 };
  });
  const calibrationIdHashes = rows.map(r => hash(r.id)).sort(), calibrationGroupHashes = rows.map(r => hash(r.groupId)).sort();
  const body = { schema: 'hierarchical-e5-paired-head-policy-v1', decisionMode: 'single-path-root-contrast',
    representation: model.representation, representationHash: model.representationHash,
    modelArtifactHash: jsonHash(model), modelParameterHash: model.parameterHash, modelTrainingHash: model.trainingHash, modelProvenanceHash: model.provenanceHash,
    taxonomyHash: model.taxonomyHash, calibrationHash: jsonHash(rows), calibrationIdHashes, calibrationGroupHashes,
    minimumAcceptedGroups, targetPrecision, rules, experimental: true, productionValidated: false, assignmentAuthority: false };
  return frozen({ ...body, policyHash: jsonHash(body) });
}

export function compileHierarchyHeadAssignment(input) {
  const { model, policy } = exact(data(input), ['model', 'policy']);
  const compiled = compileHierarchyLinearHeads(model), meta = taxonomy(model);
  exact(policy, ['schema', 'decisionMode', 'representation', 'representationHash', 'modelArtifactHash', 'modelParameterHash', 'modelTrainingHash', 'modelProvenanceHash', 'taxonomyHash',
    'calibrationHash', 'calibrationIdHashes', 'calibrationGroupHashes', 'minimumAcceptedGroups', 'targetPrecision',
    'rules', 'experimental', 'productionValidated', 'assignmentAuthority', 'policyHash']);
  const { policyHash, ...body } = policy;
  if (!sha(policyHash) || jsonHash(body) !== policyHash || policy.schema !== 'hierarchical-e5-paired-head-policy-v1' ||
      policy.decisionMode !== 'single-path-root-contrast' || policy.experimental !== true || policy.productionValidated !== false || policy.assignmentAuthority !== false ||
      policy.representation !== model.representation || policy.representationHash !== model.representationHash ||
      policy.modelArtifactHash !== jsonHash(model) ||
      policy.modelParameterHash !== model.parameterHash || policy.modelTrainingHash !== model.trainingHash ||
      policy.modelProvenanceHash !== model.provenanceHash || policy.taxonomyHash !== model.taxonomyHash || !sha(policy.calibrationHash)) invalid();
  if (!Number.isInteger(policy.minimumAcceptedGroups) || policy.minimumAcceptedGroups < 2 || policy.minimumAcceptedGroups > 512 ||
      policy.targetPrecision < 0.5 || policy.targetPrecision > 1 || typeof policy.targetPrecision !== 'number') invalid();
  for (const [key, training] of [['calibrationIdHashes', model.trainingIdHashes], ['calibrationGroupHashes', model.trainingGroupHashes]]) {
    const hashes = policy[key];
    if (!Array.isArray(hashes) || hashes.length < 1 || hashes.length > 512 ||
        hashes.some((v, i) => !sha(v) || i > 0 && lexical(hashes[i - 1], v) >= 0 || training.includes(v))) invalid();
  }
  if (policy.calibrationIdHashes.length !== policy.calibrationGroupHashes.length || !Array.isArray(policy.rules) || policy.rules.length !== meta.nodes.length) invalid();
  const rules = new Map();
  for (const r of policy.rules) {
    exact(r, ['nodeId', 'enabled', 'minScore', 'minMargin', 'acceptedGroups', 'correctGroups']);
    if (!meta.paths.has(r.nodeId) || rules.has(r.nodeId) || typeof r.enabled !== 'boolean' ||
        !HEAD_POLICY_GRID.thresholds.includes(r.minScore) || !HEAD_POLICY_GRID.margins.includes(r.minMargin) ||
        !Number.isInteger(r.acceptedGroups) || r.acceptedGroups < 0 || r.acceptedGroups > policy.calibrationIdHashes.length ||
        !Number.isInteger(r.correctGroups) || r.correctGroups < 0 || r.correctGroups > r.acceptedGroups ||
        r.enabled && (!model.heads.find(h => h.nodeId === r.nodeId).enabled || r.acceptedGroups < policy.minimumAcceptedGroups ||
          r.correctGroups / r.acceptedGroups < policy.targetPrecision)) invalid();
    rules.set(r.nodeId, r);
  }
  const handle = Object.freeze({});handles.set(handle, { model, compiled, meta, policy, rules });return handle;
}

export function classifyHierarchyHeads(handle, witness) {
  if (arguments.length !== 2) invalid();
  const state = handles.get(handle);if (!state) invalid();
  const packet = scoreHierarchyLinearHeads(state.compiled, witness);
  const features = featuresFor(state.meta, packet).map(f => ({ ...f, accepted: passes(f, state.rules.get(f.nodeId)) }));
  const byId = new Map(features.map(f => [f.nodeId, f])), accepted = features.filter(f => f.accepted);
  const deepest = accepted.filter(f => !accepted.some(other => other.nodeId !== f.nodeId && state.meta.paths.get(other.nodeId).includes(f.nodeId)));
  const roots = new Map();
  for (const feature of deepest) {
    const root = state.meta.paths.get(feature.nodeId)[0];
    if (!roots.has(root)) roots.set(root, []);roots.get(root).push(feature.nodeId);
  }
  const candidates = [];
  for (const [root, ids] of roots) {
    const contrast = byId.get(root), rule = state.rules.get(root);
    if (state.meta.roots.length > 1 && (contrast.score === null || contrast.siblingMargin !== null &&
        !(contrast.siblingMargin > 0 && contrast.siblingMargin >= rule.minMargin))) continue;
    if (ids.length === 1) { candidates.push(ids[0]);continue; }
    const paths = ids.map(id => state.meta.paths.get(id));
    let length = 0;
    while (length < paths[0].length && paths.every(p => p[length] === paths[0][length])) length++;
    for (let i = length - 1; i >= 0; i--) if (byId.get(paths[0][i]).accepted) { candidates.push(paths[0][i]);break; }
  }
  const primaryNodeId = candidates.length === 1 ? candidates[0] : null;
  const paths = primaryNodeId === null ? [] : [[...state.meta.paths.get(primaryNodeId)]];
  return frozen({ schema: 'hierarchical-e5-paired-head-decision-v1', algorithmVersion: 'paired-linear-heads-single-path-root-contrast/v1',
    sourceId: packet.sourceId, sourceVersion: packet.sourceVersion, representation: packet.representation,
    representationHash: packet.representationHash, trainingHash: state.model.trainingHash, modelArtifactHash: state.policy.modelArtifactHash, modelParameterHash: state.model.parameterHash,
    taxonomyHash: state.model.taxonomyHash, calibrationHash: state.policy.calibrationHash, policyHash: state.policy.policyHash,
    status: primaryNodeId === null ? 'unresolved' : 'assigned', primaryNodeId, paths,
    reason: primaryNodeId !== null ? state.meta.parents.has(primaryNodeId) ? 'supported-parent-stop' : 'supported-specific-node'
      : roots.size > 0 ? 'ambiguous-branches' : 'insufficient-evidence',
    features, work: packet.work, experimental: true, productionValidated: false, assignmentAuthority: false });
}


/** A detached description does not expose private compiled model state. */
export function describeHierarchyHeadAssignment(handle) {
  const state = handles.get(handle);if (!state) invalid();
  return frozen({ schema: state.policy.schema, policyHash: state.policy.policyHash,
    modelArtifactHash: state.policy.modelArtifactHash, representation: state.model.representation,
    representationHash: state.model.representationHash, nodes: state.model.nodes.map(n => ({ ...n })),
    experimental: true, productionValidated: false, assignmentAuthority: false });
}
