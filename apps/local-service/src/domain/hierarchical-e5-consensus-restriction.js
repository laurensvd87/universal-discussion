// Experimental two-view abstention/restriction only. Titles are an uncalibrated
// input transfer to frozen body heads; agreement supplies no confidence or authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { LINEAR_HEAD_LIMITS } from './hierarchical-e5-linear-heads.js';
import { compileHierarchyHeadAssignment, classifyHierarchyHeads } from './hierarchical-e5-head-policy.js';

export const CONSENSUS_RESTRICTION_ALGORITHM_VERSION = 'hierarchical-e5-consensus-restriction/v1';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const definition = Object.freeze({ algorithmVersion: CONSENSUS_RESTRICTION_ALGORITHM_VERSION,
  decisionRule: 'deepest-common-ancestor-of-two-assigned-paths',
  unresolvedRule: 'either-view-unresolved-or-different-roots',
  invariant: 'output-is-prefix-of-original-body-path',
  experimental: true, productionValidated: false, uncalibratedTransfer: true });
export const CONSENSUS_RESTRICTION_DEFINITION_HASH = digest(definition);
const handles = new WeakMap();

export class HierarchyConsensusRestrictionError extends TypeError {
  constructor(code, message) { super(message); this.name = 'HierarchyConsensusRestrictionError'; this.code = code; }
}
const invalid = message => { throw new HierarchyConsensusRestrictionError('invalid-input', message); };
const capacity = message => { throw new HierarchyConsensusRestrictionError('capacity', message); };

function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid('Expected plain data record');
  }
  if (Reflect.ownKeys(value).length !== fields.length) invalid('Unexpected record fields');
  const copy = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid('Expected enumerable data fields');
    copy[field] = descriptor.value;
  }
  return copy;
}
function identifier(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    invalid('Expected nonempty source identifier/version');
  }
  if (value.length > LINEAR_HEAD_LIMITS.maxStringUnits) capacity('Source identifier/version capacity exceeded');
}
function vector(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype) invalid('Expected plain dense vector');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > LINEAR_HEAD_LIMITS.dimensions) capacity('Vector coordinate capacity exceeded');
  if (length !== LINEAR_HEAD_LIMITS.dimensions || Reflect.ownKeys(value).length !== length + 1) invalid('Expected dense384 vector');
  const copy = new Array(length);
  let norm = 0;
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid('Expected vector data coordinates');
    const coordinate = descriptor.value;
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate) || Math.abs(coordinate) > 1) invalid('Invalid vector coordinate');
    copy[i] = coordinate; norm += coordinate * coordinate;
  }
  if (Math.abs(norm - 1) > LINEAR_HEAD_LIMITS.normTolerance) invalid('Expected unit vector; normalization is never implicit');
  return copy;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

/** Frozen B validation/copy comes first; no caller data is read through accessors. */
export function compileHierarchyConsensusRestriction(input) {
  if (arguments.length !== 1) invalid('Expected exactly one compilation argument');
  const pair = record(input, ['model', 'policy']);
  const compiled = compileHierarchyHeadAssignment(pair);
  // The base compiler has synchronously rejected proxies, accessors, custom
  // prototypes and non-data values throughout both graphs. No caller callback
  // can run between that validation and these identity-only reads/serialization.
  const identities = Object.freeze({ modelArtifactHash: digest(pair.model),
    modelParameterHash: pair.model.parameterHash, trainingHash: pair.model.trainingHash,
    taxonomyHash: pair.model.taxonomyHash, calibrationHash: pair.policy.calibrationHash,
    policyHash: pair.policy.policyHash, representation: pair.model.representation,
    representationHash: pair.model.representationHash });
  const guardHash = digest({ definitionHash: CONSENSUS_RESTRICTION_DEFINITION_HASH,
    modelArtifactHash: identities.modelArtifactHash, policyHash: identities.policyHash });
  const handle = Object.freeze({});
  handles.set(handle, { compiled, identities, guardHash });
  return handle;
}

/** Restrict the accepted body path; the title view can only confirm or shorten it. */
export function classifyHierarchyConsensusRestriction(handle, input) {
  if (arguments.length !== 2) invalid('Expected exactly two classification arguments');
  const state = handles.get(handle);
  if (!state) invalid('Expected compiled consensus-restriction capability');
  const value = record(input, ['sourceId', 'sourceVersion', 'representation', 'representationHash', 'bodyVector', 'titleVector']);
  identifier(value.sourceId); identifier(value.sourceVersion);
  if (value.representation !== state.identities.representation || value.representationHash !== state.identities.representationHash) {
    invalid('Representation identity mismatch');
  }
  // Validate and detach BOTH inputs before either classification. No vectors or
  // per-view scores are stored in this wrapper's handle, output or cache.
  const bodyVector = vector(value.bodyVector), titleVector = vector(value.titleVector);
  const witness = { sourceId: value.sourceId, sourceVersion: value.sourceVersion,
    representation: value.representation, representationHash: value.representationHash };
  const body = classifyHierarchyHeads(state.compiled, { ...witness, vector: bodyVector });
  const title = classifyHierarchyHeads(state.compiled, { ...witness, vector: titleVector });
  let path = [], reason;
  if (body.status !== 'assigned') reason = 'body-unresolved';
  else if (title.status !== 'assigned') reason = 'title-unresolved';
  else {
    const bodyPath = body.paths[0], titlePath = title.paths[0];
    let common = 0;
    while (common < bodyPath.length && common < titlePath.length && bodyPath[common] === titlePath[common]) common++;
    path = bodyPath.slice(0, common);
    reason = !common ? 'conflicting-root-branches'
      : common === bodyPath.length ? 'body-path-confirmed' : 'restricted-to-shared-ancestor';
  }
  return freeze({ schema: 'hierarchical-e5-consensus-restriction-decision/v1',
    algorithmVersion: CONSENSUS_RESTRICTION_ALGORITHM_VERSION,
    guardDefinitionHash: CONSENSUS_RESTRICTION_DEFINITION_HASH, guardHash: state.guardHash,
    baseAlgorithmVersion: body.algorithmVersion, ...state.identities,
    sourceId: value.sourceId, sourceVersion: value.sourceVersion,
    status: path.length ? 'assigned' : 'unresolved', primaryNodeId: path.at(-1) ?? null,
    paths: path.length ? [path] : [], reason,
    views: { body: { primaryNodeId: body.primaryNodeId, reason: body.reason },
      title: { primaryNodeId: title.primaryNodeId, reason: title.reason } },
    experimental: true, productionValidated: false, uncalibratedTransfer: true, assignmentAuthority: false });
}
