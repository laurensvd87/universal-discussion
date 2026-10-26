// Opt-in pure candidate composition. No canonical Source, account, write or AI authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { compilePairedE5Input, describePairedE5Input, applyPairedE5Input } from '../domain/hierarchical-e5-paired-input.js';
import { compileHierarchyHeadAssignment, describeHierarchyHeadAssignment, classifyHierarchyHeads } from '../domain/hierarchical-e5-paired-head-policy.js';

const handles = new WeakMap();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = () => { throw new TypeError('Invalid experimental hierarchy page candidate'); };
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) invalid();
  const copy = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    copy[field] = d.value;
  }
  return copy;
}
function identifier(value) {
  if (typeof value !== 'string' || !value.length || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
}
function depth(value) { if (!Number.isInteger(value) || value < 1 || value > 8) invalid(); }
function overrides(value) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > 128 || Reflect.ownKeys(value).length !== length + 1) invalid();
  return Array.from({ length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    return record(d.value, ['nodeId', 'maxDepth']);
  });
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function compileExperimentalHierarchyPageCandidate(input) {
  const a = record(input, ['inputDefinition', 'model', 'policy', 'ownerGrouping']);
  const adapter = compilePairedE5Input(a.inputDefinition), adapterIdentity = describePairedE5Input(adapter);
  // This privately compiles and copies the paired heads exactly once.
  const classifier = compileHierarchyHeadAssignment({ model: a.model, policy: a.policy });
  const modelIdentity = describeHierarchyHeadAssignment(classifier);
  if (adapterIdentity.representation !== modelIdentity.representation || adapterIdentity.representationHash !== modelIdentity.representationHash) invalid();
  const owner = record(a.ownerGrouping, ['revision', 'defaultMaxDepth', 'overrides']);
  identifier(owner.revision); depth(owner.defaultMaxDepth);
  const nodes = new Map(modelIdentity.nodes.map(n => [n.id, n])), rules = new Map();
  const normalized = overrides(owner.overrides).map(rule => {
    identifier(rule.nodeId); depth(rule.maxDepth);
    if (!nodes.has(rule.nodeId) || rules.has(rule.nodeId)) invalid();
    let node = nodes.get(rule.nodeId), nodeDepth = 0;
    while (node) { nodeDepth++; node = nodes.get(node.parentId); }
    if (rule.maxDepth < nodeDepth) invalid();
    rules.set(rule.nodeId, rule.maxDepth);
    return rule;
  }).sort((a, b) => a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0);
  const grouping = freeze({ revision: owner.revision, defaultMaxDepth: owner.defaultMaxDepth, overrides: normalized });
  const identity = freeze({ schema: 'experimental-hierarchy-page-candidate/v1',
    representation: adapterIdentity.representation, representationHash: adapterIdentity.representationHash,
    inputDefinitionHash: adapterIdentity.representationHash, modelArtifactHash: modelIdentity.modelArtifactHash,
    policyHash: modelIdentity.policyHash, ownerGroupingHash: hash(grouping), ownerGroupingRevision: grouping.revision,
    experimental: true, uncalibrated: true, productionValidated: false, assignmentAuthority: false });
  const handle = Object.freeze({});
  handles.set(handle, { adapter, classifier, grouping, rules, identity });
  return handle;
}

export function describeExperimentalHierarchyPageCandidate(handle) {
  const state = handles.get(handle); if (!state) invalid();
  return state.identity;
}

export function classifyExperimentalHierarchyPageCandidate(handle, input) {
  if (arguments.length !== 2) invalid();
  const state = handles.get(handle); if (!state) invalid();
  const fused = applyPairedE5Input(state.adapter, input);
  let supportedPath = [], selectedPath = [], reason = fused.reason;
  if (fused.status === 'available') {
    const decision = classifyHierarchyHeads(state.classifier, { sourceId: fused.sourceId, sourceVersion: fused.sourceVersion,
      representation: fused.representation, representationHash: fused.representationHash, vector: fused.vector });
    supportedPath = decision.paths.length === 1 ? [...decision.paths[0]] : [];
    let maxDepth = state.grouping.defaultMaxDepth;
    // Inspect the FULL confidence path, including nodes beyond the default cut.
    for (const nodeId of supportedPath) if (state.rules.has(nodeId)) maxDepth = state.rules.get(nodeId);
    selectedPath = supportedPath.slice(0, maxDepth);
    reason = selectedPath.length < supportedPath.length ? 'owner-depth-cut' : decision.reason;
  }
  return freeze({ ...state.identity, sourceId: fused.sourceId, sourceVersion: fused.sourceVersion,
    status: selectedPath.length ? 'candidate' : 'unresolved', reason, supportedPath, selectedPath,
    primaryNodeId: selectedPath.at(-1) ?? null });
}
