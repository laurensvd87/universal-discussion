import { types } from 'node:util';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid evidence graph input'); };
const EDGE_BYTES = 192;
const dot = (a, b) => { let value = 0; for (let i = 0; i < 384; i++) value += a[i] * b[i]; return value; };
const pairCaches = new WeakMap();
// Trusted in-process oracle seam, never a DTO or caller-provided score source.
export const readEvidencePairCache = value => value && pairCaches.get(value) || null;
const pairOffset = (a, b) => a > b ? a * (a - 1) / 2 + b : b * (b - 1) / 2 + a;
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
  let previous = new Map(), previousPairs = null;
  return Object.freeze({
    clear() { previous.clear(); previousPairs = null; },
    prepare(units, { work = () => {}, forcedUnions = [], memoPairs = false } = {}) {
      if (typeof memoPairs !== 'boolean') invalid();
      const inputs = dense(units, work), unions = dense(forcedUnions, work);
      if (!maxBytes) { previous.clear(); previousPairs = null; return null; }
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
          if (bytes > maxBytes) { previous.clear(); previousPairs = null; return null; }
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
        if (bytes > maxBytes) { previous.clear(); previousPairs = null; return null; }
        if (!same) changed.add(key);
        next.set(key, { key, center: same ? old.center : copied, sourceIds: ids, neighbors: new Set() });
      }
      const ordered = [...next.values()].sort((a, b) => compare(a.sourceIds[0], b.sourceIds[0]) || compare(a.key, b.key));
      if (memoPairs) {
        // A compact exact score matrix replaces adjacency, not an additional
        // quadratic allocation. Check its complete charge before any dots.
        const size = ordered.length, pairs = size * (size - 1) / 2;
        bytes += pairs * 8 + size * 8;
        if (!Number.isSafeInteger(pairs) || bytes > maxBytes) { previous.clear(); previousPairs = null; return null; }
        const values = new Float64Array(pairs), parent = Int32Array.from({ length: size }, (_, index) => index), ranks = new Uint8Array(size);
        const indices = new Map(ordered.map((node, index) => [node.key, index]));
        const root = index => { work(); while (parent[index] !== index) { work(); parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
        const unite = (left, right) => {
          left = root(left); right = root(right); if (left === right) return;
          if (ranks[left] < ranks[right]) [left, right] = [right, left];
          parent[right] = left; if (ranks[left] === ranks[right]) ranks[left]++;
        };
        for (const union of unions) {
          let first = null;
          for (const key of dense(union, work)) {
            work(); if (typeof key !== 'string' || !indices.has(key)) invalid();
            if (first === null) first = indices.get(key); else unite(first, indices.get(key));
          }
        }
        for (let i = 0; i < size; i++) for (let j = 0; j < i; j++) {
          work(); const left = ordered[i], right = ordered[j]; let value;
          if (previousPairs && !changed.has(left.key) && !changed.has(right.key)) {
            const oldLeft = previousPairs.indices.get(left.key), oldRight = previousPairs.indices.get(right.key);
            if (oldLeft !== undefined && oldRight !== undefined) value = previousPairs.values[pairOffset(oldLeft, oldRight)];
          }
          if (value === undefined) { value = dot(left.center, right.center); comparedPairs++; }
          values[pairOffset(i, j)] = value;
          if (!(value < edgeFloor)) { edges++; unite(i, j); }
        }
        const components = new Map();
        for (let index = 0; index < size; index++) {
          const key = root(index); if (!components.has(key)) components.set(key, []);
          components.get(key).push(ordered[index].key);
        }
        const pairCache = Object.freeze({});
        const pairData = Object.freeze({ keys: Object.freeze(ordered.map(node => node.key)),
          centers: Object.freeze(ordered.map(node => node.center)), values, indices });
        // Neither raw centers nor writable typed score storage escape. The
        // branded reader exposes exact matching and numeric reads only, so a
        // forged/stale token or caller-mutated typed array cannot supply scores.
        pairCaches.set(pairCache, Object.freeze({ keys: pairData.keys,
          matches(index, raw) {
            if (!Number.isSafeInteger(index) || index < 0 || index >= size || !raw || types.isProxy(raw) ||
                !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length !== 384) return false;
            for (let axis = 0; axis < 384; axis++) {
              const field = Object.getOwnPropertyDescriptor(raw, String(axis));
              if (!field?.enumerable || !Object.hasOwn(field, 'value') || !Object.is(field.value, ordered[index].center[axis])) return false;
            }
            return true;
          },
          score(a, b) {
            if (!Number.isSafeInteger(a) || a < 0 || a >= size || !Number.isSafeInteger(b) || b < 0 || b >= size) invalid();
            return a === b ? 1 : values[pairOffset(a, b)];
          },
        })); work();
        return Object.freeze({ components: Object.freeze([...components.values()].map(component => Object.freeze(component))),
          pairCache, stats: Object.freeze({ comparedPairs, retainedEdges: edges, bytes, changedUnits: changed.size }),
          commit() { previous = next; previousPairs = pairData; } });
      }
      // Matrix-mode nodes intentionally have no adjacency. Switching back to
      // the default mode must reconstruct all edges rather than treating those
      // absent sets as evidence that no edges existed.
      if (previousPairs) for (const node of ordered) changed.add(node.key);
      for (let i = 0; i < ordered.length; i++) {
        const node = ordered[i], old = previous.get(node.key);
        if (changed.has(node.key) || !old) continue;
        for (const key of old.neighbors) {
          work(); const neighbor = next.get(key);
          if (!neighbor || changed.has(key) || compare(node.key, key) >= 0) continue;
          node.neighbors.add(key); neighbor.neighbors.add(node.key); edges++; bytes += EDGE_BYTES;
          if (bytes > maxBytes) { previous.clear(); previousPairs = null; return null; }
        }
      }
      // Only changed geometry compares against the current inventory. All old
      // edges between unchanged units survive; removal filters both endpoints.
      for (const node of ordered.filter(node => changed.has(node.key))) for (const neighbor of ordered) {
        if (node === neighbor || changed.has(neighbor.key) && compare(node.key, neighbor.key) >= 0) continue;
        work(); comparedPairs++;
        if (dot(node.center, neighbor.center) < edgeFloor) continue;
        node.neighbors.add(neighbor.key); neighbor.neighbors.add(node.key); edges++; bytes += EDGE_BYTES;
        if (bytes > maxBytes) { previous.clear(); previousPairs = null; return null; }
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
        commit() { previous = next; previousPairs = null; } });
    },
  });
}
