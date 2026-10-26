import { createHash } from 'node:crypto';
import { types } from 'node:util';

// Inputs are already in the installed pinned Ridge1 representation. The base
// floor is the existing canonical Ridge floor; these cuts are conservative
// discovery presentation levels, not new canonical membership authority.
const THRESHOLDS = Object.freeze([0.8639003810829322, 0.90, 0.93, 0.96, 0.99]);
const REPRESENTATION = 'topic-spaces/ridge-v1';
const MAX_ENTRIES = 4096;
const DEFAULT_WORK = 40_000_000;
const MAX_BYTES = 32 * 1024 * 1024;

function invalid(message) { throw new TypeError(`Invalid topic space ${message}`); }
function capacity() {
  const error = new RangeError('Topic space capacity exceeded');
  error.code = 'TOPIC_SPACE_CAPACITY';
  throw error;
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('record');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' ||
      !keys.includes(key) || !Object.hasOwn(descriptors[key], 'value'))) invalid('fields');
  return descriptors;
}
function array(value, max) {
  if (!Array.isArray(value) || types.isProxy(value)) invalid('array');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > max) capacity();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== length + 1) invalid('array fields');
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid('array element');
    result.push(descriptor.value);
  }
  return result;
}
function field(descriptors, name) {
  if (!Object.hasOwn(descriptors, name)) invalid(`missing ${name}`);
  return descriptors[name].value;
}
function string(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.length)) invalid('string');
  return value;
}
function integer(value, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) invalid('integer');
  return value;
}
function vector(value) {
  if (value === null) return null;
  const result = array(value, 384);
  if (result.length !== 384) invalid('vector dimension');
  let norm = 0;
  for (const component of result) {
    if (typeof component !== 'number' || !Number.isFinite(component)) invalid('vector component');
    norm += component * component;
  }
  if (Math.abs(norm - 1) > 0.00001) invalid('vector normalization');
  return Object.freeze(result);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const ENTRY_KEYS = ['rootId', 'topicId', 'discussionId', 'sourceId', 'ordinal', 'title', 'snippet', 'url', 'vector', 'humanCount', 'aiCount', 'updatedAt'];
function entries(input) {
  let bytes = 0;
  const seen = new Set();
  return array(input, MAX_ENTRIES).map(item => {
    const descriptors = record(item, ENTRY_KEYS);
    const result = {};
    for (const key of ['rootId', 'topicId', 'discussionId']) result[key] = string(field(descriptors, key), 256);
    if (seen.has(result.rootId)) invalid('duplicate root');
    seen.add(result.rootId);
    const sourceId = field(descriptors, 'sourceId');
    result.sourceId = sourceId === null ? null : string(sourceId, 256);
    result.ordinal = integer(field(descriptors, 'ordinal'));
    result.title = string(field(descriptors, 'title'), 512, true);
    result.snippet = string(field(descriptors, 'snippet'), 4096, true);
    const url = field(descriptors, 'url');
    result.url = url === null ? null : string(url, 4096);
    result.vector = vector(field(descriptors, 'vector'));
    result.humanCount = integer(field(descriptors, 'humanCount'), 1_000_000_000);
    result.aiCount = integer(field(descriptors, 'aiCount'), 1_000_000_000);
    result.updatedAt = field(descriptors, 'updatedAt');
    if (typeof result.updatedAt !== 'string' || result.updatedAt.length > 64 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result.updatedAt) || !Number.isFinite(Date.parse(result.updatedAt))) invalid('timestamp');
    bytes += 384 * 8 + ENTRY_KEYS.reduce((sum, key) => sum + (typeof result[key] === 'string' ? result[key].length * 2 : 16), 0);
    if (bytes > MAX_BYTES) capacity();
    return result;
  }).sort((a, b) => a.ordinal - b.ordinal || compare(a.rootId, b.rootId));
}
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function dot(a, b, spend) {
  spend(384);
  let score = 0;
  for (let index = 0; index < 384; index++) score += a[index] * b[index];
  return Math.max(-1, Math.min(1, score));
}
function budget(max = DEFAULT_WORK) {
  integer(max, DEFAULT_WORK);
  let used = 0;
  return amount => { used += amount; if (used > max) capacity(); };
}
function nodeId(generation, parentId, level, anchorRootId) {
  return `space-${createHash('sha256').update(JSON.stringify([REPRESENTATION, generation, parentId, level, anchorRootId])).digest('hex')}`;
}

/** A bounded discovery hierarchy; it never changes canonical membership or destinations. */
export function buildTopicSpaceHierarchy(input, options) {
  const descriptors = record(options, ['generation', 'maxWorkUnits']);
  const generation = string(field(descriptors, 'generation'), 256);
  const spend = budget(descriptors.maxWorkUnits?.value);
  const rows = entries(input);
  spend(rows.length * 384);
  const nodes = [];
  function group(members, parentId, level) {
    const groups = [];
    for (const entry of members) {
      spend(1);
      let match;
      if (entry.vector) {
        for (const candidate of groups) {
          spend(1);
          if (candidate.anchor.vector && dot(entry.vector, candidate.anchor.vector, spend) >= THRESHOLDS[level]) { match = candidate; break; }
        }
      }
      if (match) match.members.push(entry);
      else groups.push({ anchor: entry, members: [entry] });
    }
    for (const candidate of groups) {
      const node = { id: nodeId(generation, parentId, level, candidate.anchor.rootId), parentId, level,
        title: candidate.anchor.title, rootIds: candidate.members.map(entry => entry.rootId), anchorRootId: candidate.anchor.rootId };
      nodes.push(node);
      if (level < 4) group(candidate.members, node.id, level + 1);
    }
  }
  group(rows, null, 0);
  return freeze({ schema: 'topic-space-hierarchy/v1', generation, entries: rows, nodes });
}

function policy(input) {
  const descriptors = record(input, ['schema', 'revision', 'defaultSpecificity', 'topicOverrides']);
  if (field(descriptors, 'schema') !== 'topic-space-policy/v1') invalid('policy schema');
  integer(field(descriptors, 'revision'));
  const defaultSpecificity = integer(field(descriptors, 'defaultSpecificity'), 100);
  const overrides = new Map();
  for (const item of array(field(descriptors, 'topicOverrides'), MAX_ENTRIES * 5)) {
    const override = record(item, ['spaceId', 'specificity', 'title']);
    const id = string(field(override, 'spaceId'), 256);
    if (overrides.has(id)) invalid('duplicate override');
    const title = field(override, 'title');
    overrides.set(id, { specificity: integer(field(override, 'specificity'), 100), title: title === null ? null : string(title, 512) });
  }
  return { defaultSpecificity, overrides };
}
function hierarchy(input) {
  const descriptors = record(input, ['schema', 'generation', 'entries', 'nodes']);
  if (field(descriptors, 'schema') !== 'topic-space-hierarchy/v1') invalid('hierarchy schema');
  const generation = string(field(descriptors, 'generation'), 256);
  const rows = entries(field(descriptors, 'entries'));
  const roots = new Map(rows.map(entry => [entry.rootId, entry]));
  const nodes = [];
  const byId = new Map();
  let memberships = 0;
  for (const raw of array(field(descriptors, 'nodes'), MAX_ENTRIES * 5)) {
    const descriptor = record(raw, ['id', 'parentId', 'level', 'title', 'rootIds', 'anchorRootId']);
    const node = {};
    node.id = string(field(descriptor, 'id'), 256);
    node.parentId = field(descriptor, 'parentId');
    if (node.parentId !== null) string(node.parentId, 256);
    node.level = integer(field(descriptor, 'level'), 4);
    node.title = string(field(descriptor, 'title'), 512, true);
    node.anchorRootId = string(field(descriptor, 'anchorRootId'), 256);
    node.rootIds = array(field(descriptor, 'rootIds'), MAX_ENTRIES).map(id => string(id, 256));
    memberships += node.rootIds.length;
    if (memberships > MAX_ENTRIES * 5) capacity();
    if (!node.rootIds.length || new Set(node.rootIds).size !== node.rootIds.length || node.rootIds.some(id => !roots.has(id)) ||
        !node.rootIds.includes(node.anchorRootId) || byId.has(node.id) || node.id !== nodeId(generation, node.parentId, node.level, node.anchorRootId)) invalid('node');
    byId.set(node.id, node);
    nodes.push(node);
  }
  const children = new Map();
  const ownership = new Set();
  const rootSets = new Map(nodes.map(node => [node.id, new Set(node.rootIds)]));
  for (const node of nodes) {
    const parent = byId.get(node.parentId);
    if (node.level === 0 ? node.parentId !== null : !parent || parent.level !== node.level - 1) invalid('ancestry');
    const parentRoots = parent && rootSets.get(parent.id);
    for (const id of node.rootIds) {
      const key = `${node.level}:${id}`;
      if (ownership.has(key) || (parentRoots && !parentRoots.has(id))) invalid('membership');
      ownership.add(key);
    }
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  if (ownership.size !== rows.length * 5) invalid('incomplete hierarchy');
  return { rows, roots, nodes, byId, children };
}

export function selectTopicSpaceGroups(input, options) {
  const descriptors = record(options, ['policy', 'vector', 'query', 'limit', 'offset']);
  const selectedPolicy = policy(field(descriptors, 'policy'));
  const queryVector = vector(descriptors.vector?.value ?? null);
  const query = string(descriptors.query?.value ?? '', 4096, true);
  const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (tokens.length > 64) capacity();
  const limit = integer(descriptors.limit?.value ?? 20, 20);
  const offset = integer(descriptors.offset?.value ?? 0, MAX_ENTRIES * 5);
  const model = hierarchy(input);
  const spend = budget();
  const active = [];
  function visit(node, inherited, policyTopicId, inheritedTitle = null) {
    const override = node.level === 0 ? selectedPolicy.overrides.get(node.id) : undefined;
    const specificity = override?.specificity ?? inherited;
    const branchTitle = override?.title ?? inheritedTitle;
    const targetLevel = Math.min(4, Math.floor(specificity / 25));
    const descendants = model.children.get(node.id) ?? [];
    if (node.level >= targetLevel || !descendants.length) {
      const title = branchTitle === null ? node.title : node.level === 0 || !node.title ? branchTitle : `${branchTitle} — ${node.title}`;
      active.push({ node, specificity, title, policyTopicId });
    } else for (const child of descendants) visit(child, specificity, policyTopicId, branchTitle);
  }
  for (const node of model.children.get(null) ?? []) visit(node, selectedPolicy.defaultSpecificity, node.id);
  const groups = [];
  for (const { node, specificity, title, policyTopicId } of active) {
    let score = 0;
    let matches = false;
    let humanCount = 0;
    let aiCount = 0;
    let updatedAt = 0;
    for (const rootId of node.rootIds) {
      const entry = model.roots.get(rootId);
      humanCount += entry.humanCount;
      aiCount += entry.aiCount;
      updatedAt = Math.max(updatedAt, Date.parse(entry.updatedAt));
      const text = `${title} ${entry.title} ${entry.snippet}`.toLowerCase();
      const textMatches = tokens.every(token => text.includes(token));
      const similarity = queryVector && entry.vector ? dot(queryVector, entry.vector, spend) : 0;
      if (textMatches && (!queryVector || (entry.vector && similarity >= THRESHOLDS[Math.min(4, Math.floor(specificity / 25))]))) {
        matches = true;
        score = Math.max(score, queryVector ? similarity : tokens.length ? 1 : 0);
      }
    }
    if (matches) groups.push({ id: node.id, parentId: node.parentId, policyTopicId, title, specificity, rootIds: [...node.rootIds], score, humanCount, aiCount, updatedAt });
  }
  groups.sort((a, b) => b.score - a.score || b.humanCount - a.humanCount || b.updatedAt - a.updatedAt || compare(a.id, b.id));
  return freeze({ total: groups.length, groups: groups.slice(offset, offset + limit).map(({ updatedAt, ...group }) => group) });
}
