// Opt-in composition only: caller-declared input construction is an identity
// fence, not an attestation of captured text or permission to assign a Topic.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { compilePairedE5Input, describePairedE5Input, applyPairedE5Input } from '../domain/hierarchical-e5-paired-input.js';
import { compileHierarchyRootDetailConsensus, describeHierarchyRootDetailConsensus,
  classifyHierarchyRootDetailConsensus } from '../domain/hierarchical-e5-root-detail-consensus.js';

const handles = new WeakMap();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = () => { throw new TypeError('Invalid experimental root/detail page candidate'); };
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
function list(value, maximum, fields) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > maximum || Reflect.ownKeys(value).length !== length + 1) invalid();
  return Array.from({ length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    return record(d.value, fields);
  });
}
function identifier(value) {
  if (typeof value !== 'string' || !value.length || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
}
function sha(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid(); }
function depth(value) { if (!Number.isInteger(value) || value < 1 || value > 8) invalid(); }
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function compileExperimentalHierarchyPageCandidate(input) {
  if (arguments.length !== 1) invalid();
  const a = record(input, ['inputDefinition', 'inputConstructionHash', 'rootModel', 'rootPolicy', 'detailModel', 'detailPolicy', 'ownerGrouping']);
  sha(a.inputConstructionHash);
  const adapter = compilePairedE5Input(a.inputDefinition), paired = describePairedE5Input(adapter);
  const classifier = compileHierarchyRootDetailConsensus({ rootModel: a.rootModel, rootPolicy: a.rootPolicy,
    detailModel: a.detailModel, detailPolicy: a.detailPolicy });
  const consensus = describeHierarchyRootDetailConsensus(classifier);
  if (paired.representation !== consensus.representation || paired.representationHash !== consensus.representationHash) invalid();
  // The consensus compiler has validated this model and privately copied its
  // coefficients. Read only data descriptors for the independent display map.
  const descriptor = Object.getOwnPropertyDescriptor(a.detailModel, 'nodes');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
  const nodes = new Map(list(descriptor.value, 128, ['id', 'parentId']).map(n => [n.id, n]));
  const owner = record(a.ownerGrouping, ['revision', 'defaultMaxDepth', 'overrides']);
  identifier(owner.revision); depth(owner.defaultMaxDepth);
  const rules = new Map();
  const normalized = list(owner.overrides, 128, ['nodeId', 'maxDepth']).map(rule => {
    identifier(rule.nodeId); depth(rule.maxDepth);
    if (!nodes.has(rule.nodeId) || rules.has(rule.nodeId)) invalid();
    let node = nodes.get(rule.nodeId), nodeDepth = 0;
    while (node) { if (++nodeDepth > 8) invalid(); node = nodes.get(node.parentId); }
    if (rule.maxDepth < nodeDepth) invalid();
    rules.set(rule.nodeId, rule.maxDepth);
    return rule;
  }).sort((x, y) => x.nodeId < y.nodeId ? -1 : x.nodeId > y.nodeId ? 1 : 0);
  const grouping = freeze({ revision: owner.revision, defaultMaxDepth: owner.defaultMaxDepth, overrides: normalized });
  const semantic = { schema: 'experimental-root-detail-hierarchy-page-candidate/v1',
    consensusHash: consensus.consensusHash, detailPolicyMode: consensus.detailPolicyMode,
    rootModelArtifactHash: consensus.rootModelArtifactHash, rootPolicyHash: consensus.rootPolicyHash,
    detailModelArtifactHash: consensus.detailModelArtifactHash, detailPolicyHash: consensus.detailPolicyHash,
    representation: paired.representation, representationHash: paired.representationHash,
    inputDefinitionHash: paired.representationHash, inputConstructionHash: a.inputConstructionHash };
  const semanticIdentityHash = hash(semantic), ownerGroupingHash = hash(grouping);
  const identity = freeze({ ...semantic, semanticIdentityHash, ownerGroupingHash,
    ownerGroupingRevision: grouping.revision, groupIdentityHash: hash({ semanticIdentityHash, ownerGroupingHash }),
    experimental: true, uncalibrated: true, productionValidated: false, assignmentAuthority: false });
  const handle = Object.freeze({});
  handles.set(handle, { adapter, classifier, grouping, rules, identity });
  return handle;
}

export function describeExperimentalHierarchyPageCandidate(handle) {
  if (arguments.length !== 1) invalid();
  const state = handles.get(handle); if (!state) invalid();
  return state.identity;
}

export function classifyExperimentalHierarchyPageCandidate(handle, input) {
  if (arguments.length !== 2) invalid();
  const state = handles.get(handle); if (!state) invalid();
  const a = record(input, ['sourceId', 'sourceVersion', 'inputConstructionHash', 'bodyVector', 'titleVector']);
  sha(a.inputConstructionHash);
  if (a.inputConstructionHash !== state.identity.inputConstructionHash) invalid();
  const fused = applyPairedE5Input(state.adapter, { sourceId: a.sourceId, sourceVersion: a.sourceVersion,
    bodyVector: a.bodyVector, titleVector: a.titleVector });
  let supportedPath = [], selectedPath = [], reason = fused.reason, independentRootId = null, detailEvaluated = false;
  if (fused.status === 'available') {
    const decision = classifyHierarchyRootDetailConsensus(state.classifier, { sourceId: fused.sourceId, sourceVersion: fused.sourceVersion,
      representation: fused.representation, representationHash: fused.representationHash, vector: fused.vector });
    supportedPath = [...decision.supportedPath]; independentRootId = decision.independentRootId; detailEvaluated = decision.detailEvaluated;
    let maxDepth = state.grouping.defaultMaxDepth;
    // Deepest matching owner override wins on the FULL supported path; it can
    // only select a prefix, never invent evidence or switch a semantic branch.
    for (const nodeId of supportedPath) if (state.rules.has(nodeId)) maxDepth = state.rules.get(nodeId);
    selectedPath = supportedPath.slice(0, maxDepth);
    reason = selectedPath.length < supportedPath.length ? 'owner-depth-cut' : decision.reason;
  }
  return freeze({ ...state.identity, sourceId: fused.sourceId, sourceVersion: fused.sourceVersion,
    status: selectedPath.length ? 'candidate' : 'unresolved', reason, supportedPath, selectedPath,
    deepestSupportedNodeId: supportedPath.at(-1) ?? null, primaryNodeId: selectedPath.at(-1) ?? null,
    independentRootId, detailEvaluated });
}
