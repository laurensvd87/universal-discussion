// Offline, exact cosine retrieval. A batch controls work returned to a caller,
// never the number of Sources eligible for a Topic.
const EPSILON = 1e-12;

function normalized(values) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) throw new TypeError('vector required');
  let norm = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new TypeError('finite vector required');
    norm += value * value;
  }
  if (!(norm > 0) || !Number.isFinite(norm)) throw new TypeError('nonzero finite vector required');
  const divisor = Math.sqrt(norm);
  return Float64Array.from(values, value => value / divisor);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function distance(a, b) {
  let squared = 0;
  for (let i = 0; i < a.length; i++) squared += (a[i] - b[i]) ** 2;
  return Math.sqrt(squared);
}

function makeNode(items, dimension, leafSize) {
  const center = new Float64Array(dimension);
  for (const item of items) for (let i = 0; i < dimension; i++) center[i] += item.vector[i];
  for (let i = 0; i < dimension; i++) center[i] /= items.length;
  let radius = 0;
  for (const item of items) radius = Math.max(radius, distance(center, item.vector));
  const node = { center, radius };
  if (items.length <= leafSize) {
    node.items = items;
    return node;
  }
  // Widest coordinate gives a deterministic median split, including coincident vectors.
  let axis = 0;
  let widest = -1;
  for (let i = 0; i < dimension; i++) {
    let low = Infinity, high = -Infinity;
    for (const item of items) {
      low = Math.min(low, item.vector[i]);
      high = Math.max(high, item.vector[i]);
    }
    if (high - low > widest) { widest = high - low; axis = i; }
  }
  const sorted = items.slice().sort((a, b) =>
    a.vector[axis] - b.vector[axis] || a.id.localeCompare(b.id, 'en'));
  const middle = Math.floor(sorted.length / 2);
  node.left = makeNode(sorted.slice(0, middle), dimension, leafSize);
  node.right = makeNode(sorted.slice(middle), dimension, leafSize);
  return node;
}

function upperBound(query, node) {
  const gap = Math.max(0, distance(query, node.center) - node.radius);
  return Math.min(1 + EPSILON, 1 - gap * gap / 2 + EPSILON);
}

// Max heap: bounds precede exact items at equal score, so IDs order ties.
class Heap {
  constructor() { this.values = []; }
  get length() { return this.values.length; }
  peek() { return this.values[0]; }
  push(value) {
    const a = this.values;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(a[parent], a[i]) >= 0) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.values, result = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let best = i;
        if (l < a.length && compare(a[l], a[best]) > 0) best = l;
        if (r < a.length && compare(a[r], a[best]) > 0) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]];
        i = best;
      }
    }
    return result;
  }
}

function compare(a, b) {
  if (a.score !== b.score) return a.score > b.score ? 1 : -1;
  if (a.node !== b.node) return a.node ? 1 : -1;
  if (a.node) return 0;
  return b.id.localeCompare(a.id, 'en');
}

export class ExactCosineIndex {
  constructor(sources, { leafSize = 16 } = {}) {
    if (!Number.isInteger(leafSize) || leafSize < 1) throw new RangeError('positive leafSize required');
    const seen = new Set();
    const items = sources.map(source => {
      if (typeof source.id !== 'string' || seen.has(source.id)) throw new TypeError('unique string IDs required');
      seen.add(source.id);
      return { id: source.id, vector: normalized(source.vector) };
    });
    this.dimension = items[0]?.vector.length ?? null;
    if (items.some(item => item.vector.length !== this.dimension)) throw new TypeError('vector dimensions differ');
    this.size = items.length;
    this.root = items.length ? makeNode(items, this.dimension, leafSize) : null;
  }

  search(vector) {
    const query = normalized(vector);
    if (this.dimension !== null && query.length !== this.dimension) throw new TypeError('query dimension differs');
    return new CandidateCursor(query, this.root);
  }
}

export class CandidateCursor {
  constructor(query, root) {
    this.query = query;
    this.heap = new Heap();
    this.work = { nodeBounds: 0, exactScores: 0 };
    if (root) {
      this.heap.push({ node: root, score: upperBound(query, root) });
      this.work.nodeBounds++;
    }
  }

  // maxWork is a cumulative per-cursor bound on node expansions + exact scores.
  // Caller may raise it and resume; exhaustion never implies no match.
  nextBatch(batchSize, { maxWork = Infinity } = {}) {
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('positive batchSize required');
    if (maxWork < 0 || Number.isNaN(maxWork)) throw new RangeError('nonnegative maxWork required');
    const items = [];
    while (items.length < batchSize && this.heap.length) {
      const top = this.heap.peek();
      if (!top.node) {
        this.heap.pop();
        items.push({ id: top.id, cosine: top.score });
        continue;
      }
      const needed = top.node.items ? top.node.items.length : 2;
      if (this.work.nodeBounds + this.work.exactScores + needed > maxWork) {
        return { items, status: 'unresolved', reason: 'work-budget-exhausted', work: { ...this.work } };
      }
      this.heap.pop();
      if (top.node.items) {
        for (const source of top.node.items) {
          this.heap.push({ id: source.id, score: dot(this.query, source.vector) });
          this.work.exactScores++;
        }
      } else {
        for (const child of [top.node.left, top.node.right]) {
          this.heap.push({ node: child, score: upperBound(this.query, child) });
          this.work.nodeBounds++;
        }
      }
    }
    return { items, status: this.heap.length ? 'more' : 'complete', work: { ...this.work } };
  }
}

// A candidate floor is only a retrieval boundary, never a same-event rule.
// Since rank is exact, the first item below the floor proves all remaining
// items are below it. A work limit reached before that proof is unresolved.
export function collectAboveFloor(cursor, floor, { batchSize = 16, maxWork = Infinity } = {}) {
  if (!Number.isFinite(floor) || floor < -1 || floor > 1) throw new RangeError('cosine floor must be in [-1, 1]');
  const items = [];
  for (;;) {
    const batch = cursor.nextBatch(batchSize, { maxWork });
    for (const item of batch.items) {
      if (item.cosine < floor) {
        return { items, status: 'boundary-cleared', work: batch.work };
      }
      items.push(item);
    }
    if (batch.status === 'complete') return { items, status: 'boundary-cleared', work: batch.work };
    if (batch.status === 'unresolved') {
      return { items, status: 'unresolved', reason: batch.reason, work: batch.work };
    }
  }
}

export function bruteForce(sources, vector) {
  const query = normalized(vector);
  return sources.map(source => ({ id: source.id, cosine: dot(query, normalized(source.vector)) }))
    .sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id, 'en'));
}
