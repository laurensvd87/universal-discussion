// Pure experimental metadata assessment. Root supervision is not child gold.
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const VERSION = 'hierarchy-real-root-assessment/v1';
function fail(message) { throw new TypeError(`Invalid root assessment: ${message}`); }
function object(value, keys) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) fail('plain data object required');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('plain data object required');
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) fail('unexpected fields');
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('own enumerable data fields required');
    result[key] = descriptor.value;
  }
  return result;
}
function array(value, max, min = 0) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype) fail('plain array required');
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < min || length > max) fail('array capacity');
  if (Reflect.ownKeys(value).length !== length + 1) fail('dense exact array required');
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('array data elements required');
    result.push(descriptor.value);
  }
  return result;
}
function string(value, max = 128) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail('bounded string required');
  return value;
}
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function counter() { return { total: 0, assigned: 0, correctRoot: 0, wrongRoot: 0, unresolved: 0 }; }
function count(counts, resolved, correct) {
  counts.total++;
  if (!resolved) counts.unresolved++;
  else { counts.assigned++; counts[correct ? 'correctRoot' : 'wrongRoot']++; }
}
function rates(counts) {
  return { ...counts, coverage: counts.total ? counts.assigned / counts.total : null,
    precision: counts.assigned ? counts.correctRoot / counts.assigned : null };
}
const prefix = (first, second) => first.length <= second.length && first.every((id, index) => id === second[index]);

export function assessRootOnlyPredictions(input) {
  if (arguments.length !== 1) fail('exactly one argument required');
  const data = object(input, ['nodes', 'cases', 'predictions']);
  const nodes = array(data.nodes, 128, 1).map(raw => {
    const node = object(raw, ['id', 'parentId']);
    return { id: string(node.id), parentId: node.parentId === null ? null : string(node.parentId) };
  });
  const byId = new Map();
  for (const node of nodes) { if (byId.has(node.id)) fail('duplicate node'); byId.set(node.id, node); }
  const paths = new Map();
  for (const node of nodes) {
    const path = [], seen = new Set();
    let current = node;
    while (current) {
      if (seen.has(current.id) || path.length >= 8) fail('cycle or depth capacity');
      seen.add(current.id); path.unshift(current.id);
      if (current.parentId === null) break;
      current = byId.get(current.parentId);
      if (!current) fail('unknown parent');
    }
    paths.set(node.id, path);
  }
  function path(value, emptyAllowed) {
    const selected = array(value, 8, emptyAllowed ? 0 : 1).map(id => string(id));
    if (selected.length && (!paths.has(selected.at(-1)) || !prefix(selected, paths.get(selected.at(-1)))
        || selected.length !== paths.get(selected.at(-1)).length)) fail('path must be contiguous root-to-node');
    return selected;
  }
  const caseIds = new Set(), groups = new Set();
  const cases = array(data.cases, 512).map(raw => {
    const row = object(raw, ['id', 'entityGroup', 'language', 'expectedRootId', 'specificityPath']);
    const id = string(row.id), entityGroup = string(row.entityGroup, 256), language = string(row.language, 24);
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/u.test(language)) fail('invalid language');
    if (caseIds.has(id) || groups.has(entityGroup)) fail('duplicate case ID or entity group');
    caseIds.add(id); groups.add(entityGroup);
    const expectedRootId = string(row.expectedRootId);
    if (!byId.has(expectedRootId) || byId.get(expectedRootId).parentId !== null) fail('gold must identify a known root');
    const specificityPath = row.specificityPath === null ? null : path(row.specificityPath, false);
    if (specificityPath && specificityPath[0] !== expectedRootId) fail('specificity anchor root mismatch');
    return { id, entityGroup, language, expectedRootId, specificityPath };
  });
  const predictionIds = new Set();
  const predictions = array(data.predictions, 512).map(raw => {
    const row = object(raw, ['id', 'sourceInputHash', 'selectedPath']);
    const id = string(row.id);
    if (!caseIds.has(id) || predictionIds.has(id)) fail('unknown or duplicate prediction ID');
    predictionIds.add(id);
    if (typeof row.sourceInputHash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.sourceInputHash)) fail('SHA-256 input hash required');
    return { id, sourceInputHash: row.sourceInputHash, selectedPath: path(row.selectedPath, true) };
  });
  if (predictions.length !== cases.length) fail('case/prediction ID sets must match');
  const predictionById = new Map(predictions.map(row => [row.id, row]));
  const total = counter(), byLanguage = Object.create(null), byRoot = Object.create(null);
  const specificity = { annotated: 0, unscored: 0, exactSupportedPath: 0, safeBroaderPrefix: 0,
    wrongBranch: 0, wrongSibling: 0, overSpecific: 0, unresolved: 0 };
  const outcomes = cases.map(row => {
    const prediction = predictionById.get(row.id), selectedPath = prediction.selectedPath;
    const resolved = selectedPath.length > 0, correct = resolved && selectedPath[0] === row.expectedRootId;
    byLanguage[row.language] ??= counter(); byRoot[row.expectedRootId] ??= counter();
    for (const counts of [total, byLanguage[row.language], byRoot[row.expectedRootId]]) count(counts, resolved, correct);
    let specificityOutcome = 'unscored';
    if (row.specificityPath !== null) {
      specificity.annotated++;
      if (!resolved) specificityOutcome = 'unresolved';
      else if (selectedPath[0] !== row.specificityPath[0]) specificityOutcome = 'wrongBranch';
      else if (prefix(selectedPath, row.specificityPath)) specificityOutcome = selectedPath.length === row.specificityPath.length ? 'exactSupportedPath' : 'safeBroaderPrefix';
      else if (prefix(row.specificityPath, selectedPath)) specificityOutcome = 'overSpecific';
      else specificityOutcome = 'wrongSibling';
    }
    specificity[specificityOutcome]++;
    return { id: row.id, sourceInputHash: prediction.sourceInputHash, expectedRootId: row.expectedRootId,
      selectedPath, rootOutcome: !resolved ? 'unresolved' : correct ? 'correctRoot' : 'wrongRoot', specificityOutcome };
  });
  return freeze({ schema: VERSION, algorithmVersion: VERSION, experimental: true, productionValidated: false,
    hasAssignmentAuthority: false, rootOnlySupervision: true, childCorrectnessInferred: false,
    representativePopulationClaim: false, statisticalGateApplied: false,
    scope: 'Descriptive root-only metrics; separate partial specificity anchors are not population validation. Phase independence is not inferred.',
    metadataHashes: { nodesSha256: digest(nodes), casesSha256: digest(cases), predictionsSha256: digest(predictions) },
    ...rates(total), byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([key, value]) => [key, rates(value)])),
    byRoot: Object.fromEntries(Object.entries(byRoot).map(([key, value]) => [key, rates(value)])), specificity, outcomes });
}
