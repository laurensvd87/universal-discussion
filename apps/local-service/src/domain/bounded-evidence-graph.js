import { types } from 'node:util';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid evidence graph input'); };
const EDGE_BYTES = 192;
const dot = (a, b) => { let value = 0; for (let i = 0; i < 384; i++) value += a[i] * b[i]; return value; };
function dense(value, work) {
  if (!value || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const size = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0 || Reflect.ownKeys(value).length !== size + 1) invalid();
  const result = [];
  for (let index = 0; index < size; index++) {
    work(); const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) invalid();
    result.push(field.value);
  }
  return result;
}

// Disposable exact dependency index. The edge floor is only a conservative
// component separator; callers retain their unchanged full admission algorithm.
// Geometry and adjacency remain private, bounded RAM for the latest catalog.
export function createBoundedEvidenceGraph({ edgeFloor, maxBytes = 32 * 1024 * 1024 }) {
  if (!Number.isFinite(edgeFloor) || edgeFloor < -1 || edgeFloor > 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 32 * 1024 * 1024) invalid();
  let previous = new Map();
  return Object.freeze({
    clear() { previous.clear(); },
    prepare(units, { work = () => {}, forcedUnions = [] } = {}) {
      const inputs = dense(units, work), unions = dense(forcedUnions, work);
      if (!maxBytes) { previous.clear(); return null; }
      const next = new Map(), changed = new Set();
      let bytes = 0, edges = 0, comparedPairs = 0;
      for (const input of inputs) {
        work();
        if (!input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) invalid();
        const fields = Object.getOwnPropertyDescriptors(input);
        if (Reflect.ownKeys(fields).length !== 3 || !['key', 'center', 'sourceIds'].every(key => fields[key]?.enumerable && Object.hasOwn(fields[key], 'value'))) invalid();
        const key = fields.key.value, center = fields.center.value, sourceIds = fields.sourceIds.value;
        if (typeof key !== 'string' || !key || key.length > 32768 || next.has(key) || types.isProxy(center) ||
            !(Array.isArray(center) || center instanceof Float64Array) || center.length !== 384 ||
            types.isProxy(sourceIds) || !Array.isArray(sourceIds) || !sourceIds.length) invalid();
        if (Array.isArray(center)) dense(center, work);
        else if (Object.getPrototypeOf(center) !== Float64Array.prototype || Reflect.ownKeys(center).length !== 384) invalid();
        const ids = dense(sourceIds, work);
        bytes += key.length * 2 + 384 * 8 + 512;
        for (const id of ids) {
          work(); if (typeof id !== 'string' || !id || id.length > 128) invalid();
          bytes += id.length * 2 + 32;
          if (bytes > maxBytes) { previous.clear(); return null; }
        }
        ids.sort(compare);
        if (new Set(ids).size !== ids.length) invalid();
        const old = previous.get(key);
        let same = Boolean(old);
        const copied = new Float64Array(384);
        for (let i = 0; i < 384; i++) {
          work(); const descriptor = Object.getOwnPropertyDescriptor(center, String(i));
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || !Number.isFinite(descriptor.value)) invalid();
          copied[i] = descriptor.value;
          if (old && !Object.is(old.center[i], descriptor.value)) same = false;
        }
        if (bytes > maxBytes) { previous.clear(); return null; }
        if (!same) changed.add(key);
        next.set(key, { key, center: same ? old.center : copied, sourceIds: ids, neighbors: new Set() });
      }
      const ordered = [...next.values()].sort((a, b) => compare(a.sourceIds[0], b.sourceIds[0]) || compare(a.key, b.key));
      for (let i = 0; i < ordered.length; i++) {
        const node = ordered[i], old = previous.get(node.key);
        if (changed.has(node.key) || !old) continue;
        for (const key of old.neighbors) {
          work(); const neighbor = next.get(key);
          if (!neighbor || changed.has(key) || compare(node.key, key) >= 0) continue;
          node.neighbors.add(key); neighbor.neighbors.add(node.key); edges++; bytes += EDGE_BYTES;
          if (bytes > maxBytes) { previous.clear(); return null; }
        }
      }
      // Only changed geometry compares against the current inventory. All old
      // edges between unchanged units survive; removal filters both endpoints.
      for (const node of ordered.filter(node => changed.has(node.key))) for (const neighbor of ordered) {
        if (node === neighbor || changed.has(neighbor.key) && compare(node.key, neighbor.key) >= 0) continue;
        work(); comparedPairs++;
        if (dot(node.center, neighbor.center) < edgeFloor) continue;
        node.neighbors.add(neighbor.key); neighbor.neighbors.add(node.key); edges++; bytes += EDGE_BYTES;
        if (bytes > maxBytes) { previous.clear(); return null; }
      }
      const parent = new Map(ordered.map(node => [node.key, node.key]));
      const root = key => {
        work(); let current = key;
        while (parent.get(current) !== current) { work(); current = parent.get(current); }
        return current;
      };
      const unite = (a, b) => { const left = root(a), right = root(b); if (left !== right) parent.set(right, left); };
      for (const node of ordered) for (const neighbor of node.neighbors) { work(); unite(node.key, neighbor); }
      for (const union of unions) {
        let first = null;
        for (const key of dense(union, work)) {
          work(); if (typeof key !== 'string' || !next.has(key)) invalid();
          if (first === null) first = key; else unite(first, key);
        }
      }
      const components = new Map();
      for (const node of ordered) {
        const key = root(node.key); if (!components.has(key)) components.set(key, []);
        components.get(key).push(node.key);
      }
      const result = Object.freeze([...components.values()].map(component => Object.freeze(component)));
      work();
      return Object.freeze({ components: result, stats: Object.freeze({ comparedPairs, retainedEdges: edges, bytes, changedUnits: changed.size }),
        commit() { previous = next; } });
    },
  });
}
