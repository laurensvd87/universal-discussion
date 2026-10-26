// Explicit isolated SHADOW composition only. Never canonical Source/write authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { compileExperimentalHierarchyPageCandidate, classifyExperimentalHierarchyPageCandidate,
  describeExperimentalHierarchyPageCandidate } from './experimental-observed-hierarchy-page-candidate.js';
import { publishShadowHierarchy, commitShadowDecision, bindShadowRoot } from '../../portable/canonical-v4/experimental/hierarchy-shadow/repository.js';

const handles = new WeakMap(), jobs = new WeakMap();
const invalid = () => { throw new TypeError('Invalid observed hierarchy SHADOW preparation'); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
function id(value) {
  if (typeof value !== 'string' || !value.length || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function compileObservedHierarchyShadowPreparation(input) {
  const a = record(input, ['candidate', 'revision']);id(a.revision);
  const classifier = compileExperimentalHierarchyPageCandidate(a.candidate), identity = describeExperimentalHierarchyPageCandidate(classifier);
  // Owner depth is a presentation projection, NOT a semantic revision. Persist
  // deepest supported membership, so later broad/specific controls do not move
  // old roots or require rewriting historical discussions.
  const semantic = { schema: 'observed-hierarchy-shadow-semantic/v1', inputDefinitionHash: identity.inputDefinitionHash,
    modelHash: identity.modelArtifactHash, policyHash: identity.policyHash };
  const publication = freeze({ revision: a.revision, artifactHash: digest(semantic), modelHash: semantic.modelHash,
    policyHash: semantic.policyHash, experimental: true, assignmentAuthority: false, productionValidated: false });
  // The candidate compiler already checked/copied this exact plain artifact.
  // Copy topology now too; publication accepts labels, never a caller's tree.
  const topology = freeze(a.candidate.model.nodes.map(({ id, parentId }) => ({ id, parentId })));
  const handle = Object.freeze({});handles.set(handle, { classifier, publication, topology });return handle;
}

export function describeObservedHierarchyShadowPreparation(handle) {
  const state = handles.get(handle);if (!state) invalid();return state.publication;
}

export async function publishObservedHierarchyShadowPreparation(database, handle, input) {
  if (arguments.length !== 3) invalid();const state = handles.get(handle);if (!state) invalid();
  const a = record(input, ['expectedRevision', 'labels']);if (a.expectedRevision !== null) id(a.expectedRevision);
  if (!Array.isArray(a.labels) || types.isProxy(a.labels) || Object.getPrototypeOf(a.labels) !== Array.prototype ||
      a.labels.length !== state.topology.length || Reflect.ownKeys(a.labels).length !== a.labels.length + 1) invalid();
  const labels = new Map();
  for (let i = 0; i < a.labels.length; i++) {
    const d = Object.getOwnPropertyDescriptor(a.labels, String(i));if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    const label = record(d.value, ['nodeId', 'label']);id(label.nodeId);id(label.label);
    if (labels.has(label.nodeId)) invalid();labels.set(label.nodeId, label.label);
  }
  const nodes = state.topology.map(node => { if (!labels.has(node.id)) invalid();return { ...node, label: labels.get(node.id) }; });
  const { revision, artifactHash, modelHash, policyHash } = state.publication;
  return publishShadowHierarchy(database, { expectedRevision: a.expectedRevision, revision, artifactHash, modelHash, policyHash, nodes });
}

/** Registering a witness is deliberately NOT done here: capture it before work. */
export function prepareObservedHierarchyShadowDecision(handle, input) {
  if (arguments.length !== 2) invalid();
  const state = handles.get(handle);if (!state) invalid();
  const a = record(input, ['sourceId', 'sourceInputHash', 'sourceWitnessVersion', 'bodyVector', 'titleVector']);
  id(a.sourceId);
  if (typeof a.sourceInputHash !== 'string' || !/^[a-f0-9]{64}$/u.test(a.sourceInputHash) ||
      typeof a.sourceWitnessVersion !== 'string' || !/^[1-9][0-9]{0,18}$/u.test(a.sourceWitnessVersion)) invalid();
  const decision = classifyExperimentalHierarchyPageCandidate(state.classifier, { sourceId: a.sourceId,
    sourceVersion: `${a.sourceInputHash}:${a.sourceWitnessVersion}`, bodyVector: a.bodyVector, titleVector: a.titleVector });
  const { revision, artifactHash, modelHash, policyHash } = state.publication;
  const packet = freeze({ revision, artifactHash, modelHash, policyHash, sourceId: a.sourceId,
    sourceInputHash: a.sourceInputHash, sourceWitnessVersion: a.sourceWitnessVersion,
    nodeId: decision.supportedPath.at(-1) ?? null });
  const job = Object.freeze({});jobs.set(job, { packet, decision });return job;
}

export function describeObservedHierarchyShadowDecision(job) {
  const state = jobs.get(job);if (!state) invalid();
  return freeze({ ...state.packet, selectedNodeId: state.decision.primaryNodeId,
    supportedPath: state.decision.supportedPath, selectedPath: state.decision.selectedPath,
    ownerGroupingHash: state.decision.ownerGroupingHash,
    experimental: true, assignmentAuthority: false, productionValidated: false });
}

/** Only the private prepared packet reaches the opt-in shadow repository. */
export async function commitObservedHierarchyShadowDecision(database, job) {
  if (arguments.length !== 2) invalid();const state = jobs.get(job);if (!state) invalid();
  return commitShadowDecision(database, state.packet);
}

export async function bindObservedHierarchyShadowRoot(database, job, input) {
  if (arguments.length !== 3) invalid();const state = jobs.get(job);if (!state) invalid();
  const a = record(input, ['canonicalRootId', 'canonicalDestinationId']);id(a.canonicalRootId);id(a.canonicalDestinationId);
  const { revision, nodeId, sourceId, sourceInputHash, sourceWitnessVersion } = state.packet;
  if (nodeId === null) return Object.freeze({ status: 'unresolved', assignmentAuthority: false });
  // Same lock order as the shadow bind function, retained through its call.
  // A matching revision/node alone is insufficient: a job from different
  // unpublished weights must not attach to another model's accepted decision.
  return database.transaction(async tx => {
    const { rows } = await tx.query(`SELECT s.current_revision,r.artifact_hash,r.model_hash,r.policy_hash
      FROM hierarchy_shadow.state s LEFT JOIN hierarchy_shadow.revisions r ON r.revision=s.current_revision
      WHERE s.singleton FOR UPDATE OF s`);
    const current = rows[0];
    if (!current || current.current_revision !== revision || current.artifact_hash !== state.packet.artifactHash ||
        current.model_hash !== state.packet.modelHash || current.policy_hash !== state.packet.policyHash)
      return Object.freeze({ status: 'stale-model' });
    return bindShadowRoot(tx, { revision, nodeId, sourceId, sourceInputHash, sourceWitnessVersion, ...a });
  });
}
