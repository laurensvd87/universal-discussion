// Versioned source adaptation of hierarchical-e5-linear-heads.js for paired derived inputs.
// Experimental frozen-vector affine Ridge heads. Raw scores are not probabilities.
import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const LINEAR_HEAD_LIMITS = Object.freeze({ dimensions: 384, maxNodes: 128,
  maxRows: 384, maxDepth: 8, maxStringUnits: 160, normTolerance: 1e-5,
  minLambda: 1e-6, maxLambda: 1000, maxTrainingWork: 100_000_000 });
export class HierarchyLinearHeadError extends TypeError {
  constructor(code, message) { super(message); this.name = 'HierarchyLinearHeadError'; this.code = code; }
}
const bad = message => { throw new HierarchyLinearHeadError('invalid-input', message); };
const capacity = message => { throw new HierarchyLinearHeadError('capacity', message); };
const SHA = /^[a-f0-9]{64}$/u;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifierHash = value => createHash('sha256').update(value).digest('hex');
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const handles = new WeakMap();
const ARTIFACT_FIELDS = ['schema', 'representation', 'representationHash', 'trainingVersion',
  'trainingHash', 'taxonomyHash', 'settingsHash', 'parameterHash', 'lambda', 'dimensions',
  'trainingIdHashes', 'trainingGroupHashes', 'provenanceHash',
  'experimental', 'productionValidated', 'assignmentAuthority', 'nodes', 'heads', 'trainingWork'];
const HEAD_FIELDS = ['nodeId', 'enabled', 'positiveGroups', 'negativeGroups', 'weights', 'intercept'];
const WORK_FIELDS = ['units', 'gramProducts', 'choleskyProducts', 'solveProducts', 'weightProducts'];
const schema = 'hierarchical-e5-paired-linear-heads-v1';

function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) bad('Expected plain data record');
  if (Reflect.ownKeys(value).length !== fields.length) bad('Unexpected record fields');
  const copy = {};
  for (const key of fields) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected enumerable data fields');
    copy[key] = d.value;
  }
  return copy;
}
function array(value, maximum) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) bad('Expected plain dense array');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > maximum) capacity('Array capacity exceeded');
  if (Reflect.ownKeys(value).length !== length + 1) bad('Sparse or extended array');
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) bad('Expected array data elements');
    result[i] = d.value;
  }
  return result;
}
function text(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) bad('Invalid identifier');
  if (value.length > LINEAR_HEAD_LIMITS.maxStringUnits) capacity('Identifier UTF-16 capacity exceeded');
  return value;
}
function hash(value) { if (typeof value !== 'string' || !SHA.test(value)) bad('Expected lowercase SHA-256'); }
function representation(name, identity) {
  if (name !== 'paired-raw-e5-body-title-v1') bad('Unknown representation namespace');
  hash(identity);
}
function finite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) bad('Expected finite number');
  return value;
}
function lambdaValue(value) {
  finite(value);
  if (value < LINEAR_HEAD_LIMITS.minLambda || value > LINEAR_HEAD_LIMITS.maxLambda) bad('Lambda outside declared range');
}
function vector(value) {
  const result = array(value, LINEAR_HEAD_LIMITS.dimensions);
  if (result.length !== LINEAR_HEAD_LIMITS.dimensions) bad('Expected 384 dimensions');
  let norm = 0;
  for (const n of result) { finite(n); if (Math.abs(n) > 1) bad('Invalid unit coordinate'); norm += n * n; }
  if (Math.abs(norm - 1) > LINEAR_HEAD_LIMITS.normTolerance) bad('Expected unit vector; no implicit normalization');
  return result;
}
function taxonomy(input) {
  const nodes = array(input, LINEAR_HEAD_LIMITS.maxNodes).map(n => record(n, ['id', 'parentId']));
  if (!nodes.length) bad('Empty taxonomy');
  const byId = new Map();
  for (const n of nodes) {
    text(n.id); if (n.parentId !== null) text(n.parentId);
    if (byId.has(n.id)) bad('Duplicate taxonomy node');
    byId.set(n.id, n);
  }
  nodes.sort((a, b) => lexical(a.id, b.id));
  const paths = new Map();
  for (const n of nodes) {
    const path = [], seen = new Set();
    let cursor = n;
    while (cursor) {
      if (seen.has(cursor.id)) bad('Taxonomy cycle');
      seen.add(cursor.id); path.unshift(cursor.id);
      if (path.length > LINEAR_HEAD_LIMITS.maxDepth) capacity('Taxonomy depth exceeded');
      if (cursor.parentId !== null && !byId.has(cursor.parentId)) bad('Unknown taxonomy parent');
      cursor = cursor.parentId === null ? null : byId.get(cursor.parentId);
    }
    paths.set(n.id, path);
  }
  return { nodes, paths };
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
const settings = lambda => ({ schema, lambda, dimensions: 384, centering: 'training-mean-features-and-labels',
  solver: 'shared-dual-gram-cholesky', targets: 'ancestor-inclusive-plus-one-otherwise-minus-one',
  independentGroups: 'duplicates-rejected', minimumPositiveGroups: 2, minimumNegativeGroups: 2 });

/** Training rows only. Factor the centered Gram once; intercept is not regularized.
 * Work units count coordinate multiply-accumulates or scalar arithmetic steps,
 * including vector checks, centering, labels and solves, not bounded data copying,
 * taxonomy traversal, serialization/hashing, or elapsed time. */
export function trainHierarchyLinearHeads(input) {
  const a = record(input, ['nodes', 'rows', 'representation', 'representationHash', 'trainingVersion', 'lambda']);
  representation(a.representation, a.representationHash); text(a.trainingVersion); lambdaValue(a.lambda);
  const { nodes, paths } = taxonomy(a.nodes);
  const work = { units: 0, gramProducts: 0, choleskyProducts: 0, solveProducts: 0, weightProducts: 0 };
  const charge = (count, kind) => {
    work.units += count;
    if (work.units > LINEAR_HEAD_LIMITS.maxTrainingWork) capacity('Linear training work budget exceeded');
    if (kind) work[kind] += count;
  };
  const ids = new Set(), groups = new Set();
  const rows = array(a.rows, LINEAR_HEAD_LIMITS.maxRows).map(value => {
    const r = record(value, ['id', 'groupId', 'split', 'expectedTopicId', 'vector']);
    text(r.id); text(r.groupId);
    if (r.split !== 'training' || ids.has(r.id) || groups.has(r.groupId)) bad('Only independent training groups with unique IDs are allowed');
    if (r.expectedTopicId !== null && !paths.has(r.expectedTopicId)) bad('Unknown gold topic');
    ids.add(r.id); groups.add(r.groupId);
    charge(2 * 384); r.vector = vector(r.vector);
    return r;
  }).sort((x, y) => lexical(x.id, y.id));
  if (!rows.length) bad('Empty training set');
  const n = rows.length, d = LINEAR_HEAD_LIMITS.dimensions;
  const mean = new Float64Array(d);
  charge(n * d + d);
  for (const r of rows) for (let k = 0; k < d; k++) mean[k] += r.vector[k];
  for (let k = 0; k < d; k++) mean[k] /= n;
  const x = rows.map(r => {
    charge(d);
    return r.vector.map((v, k) => v - mean[k]);
  });
  const gram = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    charge(d, 'gramProducts');
    let sum = 0;
    for (let k = 0; k < d; k++) sum += x[i][k] * x[j][k];
    gram[i * n + j] = sum; gram[j * n + i] = sum;
  }
  charge(n);
  for (let i = 0; i < n; i++) gram[i * n + i] += a.lambda;
  // In-place lower Cholesky. Strictly positive lambda regularizes duplicate vectors.
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    charge(j, 'choleskyProducts'); charge(1);
    let value = gram[i * n + j];
    for (let k = 0; k < j; k++) value -= gram[i * n + k] * gram[j * n + k];
    if (i === j) {
      if (!Number.isFinite(value) || value <= 0) bad('Numerically invalid regularized factorization');
      gram[i * n + j] = Math.sqrt(value);
    } else gram[i * n + j] = finite(value / gram[j * n + j]);
  }
  const heads = nodes.map(node => {
    const target = rows.map(r => {
      const path = r.expectedTopicId === null ? [] : paths.get(r.expectedTopicId);
      charge(path.length + 1);
      return path.includes(node.id) ? 1 : -1;
    });
    const positiveGroups = target.filter(t => t === 1).length, negativeGroups = n - positiveGroups;
    const enabled = positiveGroups >= 2 && negativeGroups >= 2;
    const weights = Array(d).fill(0);
    let intercept = 0;
    if (enabled) {
      charge(n + 1);
      const targetMean = target.reduce((sum, t) => sum + t, 0) / n;
      const alpha = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        charge(i, 'solveProducts'); charge(2);
        let value = target[i] - targetMean;
        for (let j = 0; j < i; j++) value -= gram[i * n + j] * alpha[j];
        alpha[i] = finite(value / gram[i * n + i]);
      }
      for (let i = n - 1; i >= 0; i--) {
        charge(n - i - 1, 'solveProducts'); charge(1);
        let value = alpha[i];
        for (let j = i + 1; j < n; j++) value -= gram[j * n + i] * alpha[j];
        alpha[i] = finite(value / gram[i * n + i]);
      }
      for (let k = 0; k < d; k++) {
        charge(n, 'weightProducts');
        let value = 0;
        for (let i = 0; i < n; i++) value += x[i][k] * alpha[i];
        weights[k] = finite(value);
      }
      charge(d + 1);
      intercept = targetMean;
      for (let k = 0; k < d; k++) intercept -= weights[k] * mean[k];
      finite(intercept);
    }
    return { nodeId: node.id, enabled, positiveGroups, negativeGroups, weights, intercept };
  });
  const trainingIdHashes = rows.map(r => identifierHash(r.id)).sort(lexical);
  const trainingGroupHashes = rows.map(r => identifierHash(r.groupId)).sort(lexical);
  return freeze({ schema, representation: a.representation, representationHash: a.representationHash,
    trainingVersion: a.trainingVersion, trainingHash: digest({ schema, representation: a.representation, representationHash: a.representationHash, trainingVersion: a.trainingVersion, rows, trainingIdHashes, trainingGroupHashes }),
    trainingIdHashes, trainingGroupHashes, provenanceHash: digest({ trainingIdHashes, trainingGroupHashes }),
    taxonomyHash: digest(nodes), settingsHash: digest(settings(a.lambda)), parameterHash: digest({ schema, representation: a.representation, representationHash: a.representationHash, heads }),
    lambda: a.lambda, dimensions: d, experimental: true, productionValidated: false, assignmentAuthority: false, nodes, heads, trainingWork: work });
}

/** Validate a serialized model and privately copy every coefficient. */
export function compileHierarchyLinearHeads(input) {
  const a = record(input, ARTIFACT_FIELDS);
  if (a.schema !== schema || a.dimensions !== 384 || a.experimental !== true || a.productionValidated !== false || a.assignmentAuthority !== false) bad('Only explicitly experimental linear models are accepted');
  representation(a.representation, a.representationHash); text(a.trainingVersion); lambdaValue(a.lambda);
  for (const key of ['trainingHash', 'taxonomyHash', 'settingsHash', 'parameterHash', 'provenanceHash']) hash(a[key]);
  const { nodes } = taxonomy(a.nodes), nodeIds = new Set(nodes.map(n => n.id)), headIds = new Set();
  const heads = array(a.heads, LINEAR_HEAD_LIMITS.maxNodes).map(value => {
    const h = record(value, HEAD_FIELDS); text(h.nodeId);
    if (!nodeIds.has(h.nodeId) || headIds.has(h.nodeId) || typeof h.enabled !== 'boolean') bad('Invalid linear head identity');
    headIds.add(h.nodeId);
    for (const key of ['positiveGroups', 'negativeGroups']) {
      if (!Number.isInteger(h[key]) || h[key] < 0 || h[key] > LINEAR_HEAD_LIMITS.maxRows) bad('Invalid independent group count');
    }
    if (h.positiveGroups + h.negativeGroups < 1 || h.positiveGroups + h.negativeGroups > LINEAR_HEAD_LIMITS.maxRows ||
        h.enabled !== (h.positiveGroups >= 2 && h.negativeGroups >= 2)) bad('Unsupported head enablement');
    h.weights = array(h.weights, 384);
    if (h.weights.length !== 384) bad('Expected 384 head coefficients');
    for (const coefficient of h.weights) finite(coefficient);
    finite(h.intercept);
    if (!h.enabled && (h.intercept !== 0 || h.weights.some(w => w !== 0))) bad('Disabled heads must have zero parameters');
    return h;
  }).sort((x, y) => lexical(x.nodeId, y.nodeId));
  if (heads.length !== nodes.length) bad('Every node requires exactly one head');
  const totals = new Set(heads.map(h => h.positiveGroups + h.negativeGroups));
  if (totals.size !== 1) bad('Heads must share the same independent training cohort');
  const trainingCount = [...totals][0];
  const provenance = {};
  for (const key of ['trainingIdHashes', 'trainingGroupHashes']) {
    const values = array(a[key], LINEAR_HEAD_LIMITS.maxRows);
    if (values.length !== trainingCount) bad('Training provenance count mismatch');
    for (let i = 0; i < values.length; i++) {
      hash(values[i]);
      if (i && lexical(values[i - 1], values[i]) >= 0) bad('Training provenance must be sorted and unique');
    }
    provenance[key] = values;
  }
  if (digest(provenance) !== a.provenanceHash) bad('Training provenance hash mismatch');
  const work = record(a.trainingWork, WORK_FIELDS);
  for (const key of WORK_FIELDS) if (!Number.isSafeInteger(work[key]) || work[key] < 0 || work[key] > LINEAR_HEAD_LIMITS.maxTrainingWork) bad('Invalid training work witness');
  if (WORK_FIELDS.slice(1).reduce((sum, key) => sum + work[key], 0) > work.units) bad('Incoherent training work witness');
  if (digest(nodes) !== a.taxonomyHash || digest(settings(a.lambda)) !== a.settingsHash || digest({ schema, representation: a.representation, representationHash: a.representationHash, heads }) !== a.parameterHash) bad('Model identity mismatch');
  const handle = Object.freeze({});
  handles.set(handle, { nodes, heads, metadata: { representation: a.representation,
    representationHash: a.representationHash, trainingVersion: a.trainingVersion, trainingHash: a.trainingHash,
    taxonomyHash: a.taxonomyHash, settingsHash: a.settingsHash, parameterHash: a.parameterHash,
    provenanceHash: a.provenanceHash } });
  return handle;
}

/** Exact affine scores only. Stopping, margins and rejection need separate calibration. */
export function scoreHierarchyLinearHeads(handle, input) {
  const state = handles.get(handle);
  if (!state) bad('Expected privately compiled linear heads');
  const w = record(input, ['sourceId', 'sourceVersion', 'representation', 'representationHash', 'vector']);
  text(w.sourceId); text(w.sourceVersion); representation(w.representation, w.representationHash);
  if (w.representation !== state.metadata.representation || w.representationHash !== state.metadata.representationHash) bad('Representation identity mismatch');
  const x = vector(w.vector), work = { dotProducts: 0, scalarProducts: 0 };
  const scores = state.heads.map(h => {
    let value = h.intercept;
    if (h.enabled) {
      work.dotProducts++; work.scalarProducts += 384;
      for (let i = 0; i < 384; i++) value += h.weights[i] * x[i];
    }
    return { nodeId: h.nodeId, enabled: h.enabled, score: finite(value) };
  });
  return freeze({ ...state.metadata, sourceId: w.sourceId, sourceVersion: w.sourceVersion,
    experimental: true, productionValidated: false, assignmentAuthority: false, scores, work });
}


/** Detached descriptive identity, not an assignment capability. */
export function describeHierarchyLinearHeads(handle) {
  const state = handles.get(handle);
  if (!state) bad('Expected privately compiled paired linear heads');
  return freeze({ schema, ...state.metadata, nodes: state.nodes.map(n => ({ ...n })),
    experimental: true, productionValidated: false, assignmentAuthority: false });
}
