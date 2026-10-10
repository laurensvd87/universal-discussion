import { performance } from 'node:perf_hooks';
import { applyDiagonalAdapter, readDiagonalAdapter } from './diagonal-adapter.js';
import { ALTERNATE_TOPIC_POLICY } from './alternate-topic-planner.js';
import { fail } from './errors.js';

// Owner-local experimental read planner. Bounds are work/memory guards, not
// limits on Sources, neighbors, or members of a Topic. Exhaustion returns no
// partial result. Duplicate vectors count as one independent evidence unit.
export const INDEXED_TOPIC_POLICY = Object.freeze({
  version: 'alternate-indexed-independent-evidence/v2',
  ...Object.fromEntries(['seedSimilarity', 'supportedSimilarity', 'weakestCrossSimilarity',
    'crowdedNeighborCount'].map(key => [key, ALTERNATE_TOPIC_POLICY[key]])),
  maxWorkUnits: 100_000_000,
  maxCachedPairs: 65_536,
  workBudgetMs: 10_000,
});

const LEARNED = 'owner-local-page-embedding/v1';
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1']);
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const EPS = 1e-10; // Conservative metric-bound roundoff padding, never an admission tolerance.
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid indexed alternate Topic planner input'); };
const rawDot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};
const clamp = value => Math.max(-1, Math.min(1, value));
const distance = (a, b) => {
  let total = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; total += d * d; }
  return Math.sqrt(total);
};
// A coordinate projection is contractive, so it can rule out a pair but never
// rule it in. Indexing it reduces exact-retrieval cost in high-dimensional
// unrelated catalogs; every admitted pair still uses all 384 coordinates.
const projectedDistance = (a, b) => {
  let total = 0;
  for (let i = 0; i < 48; i++) { const d = a[i] - b[i]; total += d * d; }
  return Math.sqrt(total);
};
function summarize(center) {
  const major = [];
  let remainingNorm = 0;
  for (let i = 0; i < center.length; i++) {
    if (Math.abs(center[i]) >= 0.1) major.push(i);
    else remainingNorm += center[i] * center[i];
  }
  return { major, remainingNorm };
}
function boxUpper(query, node) {
  let maximum = Math.sqrt(query.remainingNorm * node.maxNorm);
  for (const i of query.major) maximum += query.center[i] * (query.center[i] >= 0 ? node.upper[i] : node.lower[i]);
  return maximum;
}

// Persistent ordered sets retain merge keys in O(n log n) expected storage.
// Heap entries must not retain a copied, growing member array at every merge.
const priority = key => {
  let x = (key + 1) >>> 0;
  x = Math.imul(x ^ x >>> 16, 0x7feb352d);
  x = Math.imul(x ^ x >>> 15, 0x846ca68b);
  return (x ^ x >>> 16) >>> 0;
};
const leaf = key => ({ key, priority: priority(key), left: null, right: null });
function split(root, key) {
  if (!root) return [null, null];
  if (root.key < key) {
    const [left, right] = split(root.right, key);
    return [{ ...root, right: left }, right];
  }
  const [left, right] = split(root.left, key);
  return [left, { ...root, left: right }];
}
function union(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.priority < b.priority || a.priority === b.priority && a.key > b.key) [a, b] = [b, a];
  const [left, right] = split(b, a.key);
  return { ...a, left: union(a.left, left), right: union(a.right, right) };
}
function* keys(root) {
  const stack = [];
  while (root || stack.length) {
    while (root) { stack.push(root); root = root.left; }
    root = stack.pop(); yield root.key; root = root.right;
  }
}
function* joinedKeys(a, b) {
  const ia = keys(a), ib = keys(b);
  let va = ia.next(), vb = ib.next();
  while (!va.done || !vb.done) {
    if (vb.done || !va.done && va.value < vb.value) { yield va.value; va = ia.next(); }
    else { yield vb.value; vb = ib.next(); }
  }
}
function keyCompare(a, b) {
  const ai = joinedKeys(a.a.sourceSet, a.b.sourceSet);
  const bi = joinedKeys(b.a.sourceSet, b.b.sourceSet);
  for (;;) {
    const av = ai.next(), bv = bi.next();
    if (av.done || bv.done) return av.done === bv.done ? 0 : av.done ? -1 : 1;
    if (av.value !== bv.value) return av.value - bv.value;
  }
}

class Heap {
  entries = [];
  better(a, b) { return a.score > b.score || a.score === b.score && keyCompare(a, b) < 0; }
  push(entry) {
    const entries = this.entries;
    let i = entries.length; entries.push(entry);
    while (i > 0) {
      const parent = (i - 1) >>> 1;
      if (!this.better(entry, entries[parent])) break;
      entries[i] = entries[parent]; i = parent;
    }
    entries[i] = entry;
  }
  pop() {
    const entries = this.entries;
    if (!entries.length) return null;
    const first = entries[0], last = entries.pop();
    if (!entries.length) return first;
    let i = 0;
    while (i * 2 + 1 < entries.length) {
      let child = i * 2 + 1;
      if (child + 1 < entries.length && this.better(entries[child + 1], entries[child])) child++;
      if (!this.better(entries[child], last)) break;
      entries[i] = entries[child]; i = child;
    }
    entries[i] = last;
    return first;
  }
}

// Exact VP-tree forest: insertion melds binary-sized blocks; retired groups
// are tombstones until their block is rebuilt. Triangle inequalities and
// maximum squared norms bound dot scores without a fixed k or dropped edge.
class MetricForest {
  constructor(work) { this.work = work; this.blocks = []; }
  build(items, parent = null) {
    if (!items.length) return null;
    this.work();
    const pivot = items[0];
    const ordered = items.slice(1).map(item => {
      this.work(); return { item, d: projectedDistance(pivot.center, item.center) };
    }).sort((a, b) => a.d - b.d || a.item.id - b.item.id);
    const middle = ordered.length >>> 1;
    const node = { pivot, center: pivot.center, maxNorm: pivot.normSquared, maxSize: pivot.size ?? 1,
      count: items.length, parent, left: null, right: null,
      leftMin: ordered[0]?.d ?? 0, leftMax: ordered[middle - 1]?.d ?? 0,
      rightMin: ordered[middle]?.d ?? 0, rightMax: ordered.at(-1)?.d ?? 0 };
    pivot.node = node;
    node.left = this.build(ordered.slice(0, middle).map(entry => entry.item), node);
    node.right = this.build(ordered.slice(middle).map(entry => entry.item), node);
    node.maxNorm = Math.max(node.maxNorm, node.left?.maxNorm ?? 0, node.right?.maxNorm ?? 0);
    node.maxSize = Math.max(node.maxSize, node.left?.maxSize ?? 0, node.right?.maxSize ?? 0);
    if (!node.left && !node.right) { node.lower = pivot.center; node.upper = pivot.center; }
    else {
      node.lower = new Float64Array(384); node.upper = new Float64Array(384);
      for (let i = 0; i < 384; i++) {
        node.lower[i] = Math.min(pivot.center[i], node.left?.lower[i] ?? Infinity, node.right?.lower[i] ?? Infinity);
        node.upper[i] = Math.max(pivot.center[i], node.left?.upper[i] ?? -Infinity, node.right?.upper[i] ?? -Infinity);
      }
    }
    return node;
  }
  collect(node, items) {
    if (!node?.count) return;
    this.work();
    if (node.pivot.active) items.push(node.pivot);
    this.collect(node.left, items); this.collect(node.right, items);
  }
  add(item) {
    const items = [item];
    let level = 0;
    while (this.blocks[level]) {
      this.collect(this.blocks[level], items); this.blocks[level] = null; level++;
    }
    this.blocks[level] = this.build(items);
  }
  retire(item) {
    item.active = false;
    for (let node = item.node; node; node = node.parent) node.count--;
    item.node = null;
  }
  // visit returns true to stop. bound returns the current exact incumbent.
  // It can decline/recheck candidates; the traversal remains complete.
  search(query, bound, visit, requireSupported = false) {
    const traverse = (node, inheritedMinimum = 0) => {
      if (!node?.count) return false;
      this.work();
      if (requireSupported && query.size === 1 && node.maxSize === 1) return false;
      if (query.major.length && boxUpper(query, node) + EPS < bound()) return false;
      if ((query.normSquared + node.maxNorm - inheritedMinimum ** 2) / 2 + EPS < bound()) return false;
      const d = projectedDistance(query.center, node.center);
      if (node.pivot.active && (query.normSquared + node.pivot.normSquared - d * d) / 2 + EPS >= bound() &&
          visit(node.pivot)) return true;
      const leftMin = Math.max(inheritedMinimum, node.leftMin - d, d - node.leftMax, 0);
      const rightMin = Math.max(inheritedMinimum, node.rightMin - d, d - node.rightMax, 0);
      const leftBound = node.left?.count ? node.left.maxNorm - leftMin * leftMin : -Infinity;
      const rightBound = node.right?.count ? node.right.maxNorm - rightMin * rightMin : -Infinity;
      if (rightBound > leftBound) return traverse(node.right, rightMin) || traverse(node.left, leftMin);
      return traverse(node.left, leftMin) || traverse(node.right, rightMin);
    };
    for (const block of this.blocks) if (traverse(block)) return true;
    return false;
  }
}

// This opt-in admission distribution is for normalized ephemeral vectors
// supplied by a reviewed local transform. No transform or model is loaded here;
// the supported-merge algorithm and its independent-evidence rules are unchanged.
function readAdmission(admission) {
  if (admission === null) return INDEXED_TOPIC_POLICY;
  if (!admission || typeof admission !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(admission))) invalid();
  const fields = ['version', 'seedSimilarity', 'supportedSimilarity', 'weakestCrossSimilarity',
    'crowdedNeighborCount'];
  const ownKeys = Reflect.ownKeys(admission);
  if (ownKeys.length !== fields.length || ownKeys.some(key => !fields.includes(key))) invalid();
  const policy = {};
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(admission, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid();
    policy[key] = descriptor.value;
  }
  if (policy.version !== 'alternate-indexed-body-metric/v1' || policy.crowdedNeighborCount !== 3 ||
      ['seedSimilarity', 'supportedSimilarity', 'weakestCrossSimilarity'].some(key =>
        typeof policy[key] !== 'number' || !Number.isFinite(policy[key])) ||
      !(0 < policy.weakestCrossSimilarity && policy.weakestCrossSimilarity <= policy.supportedSimilarity &&
        policy.supportedSimilarity <= policy.seedSimilarity && policy.seedSimilarity <= 1)) invalid();
  return Object.freeze(policy);
}

export function planIndexedAlternateTopics({ sources, sourceLinks, adapter = null, admission = null, limits = {} }) {
  const policy = readAdmission(admission);
  if (!Array.isArray(sources) || !Array.isArray(sourceLinks) || !limits ||
      typeof limits !== 'object' || Array.isArray(limits)) invalid();
  const budget = { ...INDEXED_TOPIC_POLICY, ...limits };
  if (Object.keys(limits).some(key => !['maxWorkUnits', 'maxCachedPairs', 'workBudgetMs'].includes(key)) ||
      !Number.isSafeInteger(budget.maxWorkUnits) || budget.maxWorkUnits < 1 ||
      !Number.isSafeInteger(budget.maxCachedPairs) || budget.maxCachedPairs < 0 ||
      !Number.isFinite(budget.workBudgetMs) || budget.workBudgetMs <= 0) invalid();
  const start = performance.now(), deadline = start + budget.workBudgetMs;
  let workUnits = 0, comparedPairs = 0, peakCachedPairs = 0, geometricChecks = 0, boundCertifications = 0;
  const work = () => {
    if (++workUnits > budget.maxWorkUnits || (workUnits & 1023) === 0 && performance.now() > deadline) {
      fail('capacity', 'Indexed matching work budget reached');
    }
  };
  const checkedAdapter = adapter === null ? null : readDiagonalAdapter(adapter);
  const all = new Map();
  for (const source of sources) {
    work();
    if (!source || typeof source.id !== 'string' || !ID.test(source.id) || all.has(source.id)) invalid();
    all.set(source.id, source);
  }
  const linked = new Map();
  for (const link of sourceLinks) {
    work();
    if (!link || typeof link.sourceId !== 'string' || !ID.test(link.sourceId) ||
        !all.has(link.sourceId) || linked.has(link.sourceId) || typeof link.method !== 'string' || !link.method ||
        all.get(link.sourceId).provenance === LEARNED &&
        !['learned-provisional', 'manual-confirmed'].includes(link.method)) invalid();
    linked.set(link.sourceId, link);
  }
  for (const source of all.values()) if (source.provenance === LEARNED && !linked.has(source.id)) invalid();
  const eligible = [...all.values()].filter(source => source.provenance === LEARNED &&
    linked.get(source.id)?.method === 'learned-provisional').sort((a, b) => compare(a.id, b.id));
  const units = [], identical = new Map();
  for (let rank = 0; rank < eligible.length; rank++) {
    work();
    const source = eligible[rank], values = source.embedding?.values;
    if (source.embedding?.modelId !== MODEL || !EXTRACTORS.has(source.extractorVersion) ||
        !Array.isArray(values) || values.length !== 384 ||
        !values.every(value => typeof value === 'number' && Number.isFinite(value)) ||
        !Number.isFinite(Math.hypot(...values)) ||
        Math.abs(Math.hypot(...values) - 1) > 1e-5) invalid();
    const center = checkedAdapter ? applyDiagonalAdapter(values, checkedAdapter) : values;
    // Equality is exact across all transformed coordinates. Near duplicates
    // remain distinct; no approximate similarity threshold removes evidence.
    const signature = center.join(',');
    let unit = identical.get(signature);
    if (!unit) {
      unit = { id: units.length, center, normSquared: rawDot(center, center), sourceSet: null,
        ...summarize(center), active: true, node: null, rank };
      units.push(unit); identical.set(signature, unit);
    }
    unit.sourceSet = union(unit.sourceSet, leaf(rank));
  }
  identical.clear();
  const cache = new Map();
  const fifo = new Array(budget.maxCachedPairs);
  let fifoCursor = 0;
  const score = (a, b) => {
    work();
    if (a === b) return 1;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (cache.has(key)) return cache.get(key);
    const value = clamp(rawDot(units[a].center, units[b].center)); comparedPairs++;
    if (budget.maxCachedPairs > 0 && value >= policy.weakestCrossSimilarity) {
      if (cache.size >= budget.maxCachedPairs) cache.delete(fifo[fifoCursor]);
      fifo[fifoCursor] = key; fifoCursor = (fifoCursor + 1) % budget.maxCachedPairs;
      cache.set(key, value); peakCachedPairs = Math.max(peakCachedPairs, cache.size);
    }
    return value;
  };
  const unitIndex = new MetricForest(work);
  unitIndex.blocks[0] = unitIndex.build(units);
  const best = new Int32Array(units.length).fill(-1), degrees = new Uint8Array(units.length);
  for (const unit of units) {
    let bestScore = policy.seedSimilarity;
    unitIndex.search(unit, () => bestScore, candidate => {
      if (candidate.id === unit.id) return false;
      const value = score(unit.id, candidate.id);
      if (value >= bestScore && (value > bestScore || best[unit.id] < 0 ||
          candidate.rank < units[best[unit.id]].rank)) {
        bestScore = value; best[unit.id] = candidate.id;
      }
      return false;
    });
  }
  const crowded = unit => {
    if (degrees[unit.id]) return degrees[unit.id] === 2;
    let count = 0;
    unitIndex.search(unit, () => policy.seedSimilarity, candidate => {
      if (candidate.id !== unit.id && score(unit.id, candidate.id) >= policy.seedSimilarity) count++;
      return count >= policy.crowdedNeighborCount;
    });
    degrees[unit.id] = count >= policy.crowdedNeighborCount ? 2 : 1;
    return degrees[unit.id] === 2;
  };
  const witness = (a, b) => unitIndex.search(units[a], () => policy.supportedSimilarity, candidate =>
    candidate.id !== a && candidate.id !== b &&
    score(a, candidate.id) >= policy.supportedSimilarity &&
    score(b, candidate.id) >= policy.supportedSimilarity);
  const seeds = [];
  for (let i = 0; i < units.length; i++) {
    const j = best[i];
    if (j <= i || best[j] !== i) continue;
    if ((crowded(units[i]) || crowded(units[j])) && !witness(i, j)) continue;
    seeds.push({ i, j, score: score(i, j) });
  }
  seeds.sort((a, b) => b.score - a.score || units[a.i].rank - units[b.i].rank);
  unitIndex.blocks = [];
  for (const unit of units) unit.node = null;
  const finish = (activeGroups, supportedJoins) => {
    if (performance.now() > deadline) fail('capacity', 'Indexed matching work budget reached');
    const partitions = activeGroups.map(group => ({
      sourceIds: [...keys(group.sourceSet)].map(rank => eligible[rank].id),
    })).sort((a, b) => compare(a.sourceIds[0], b.sourceIds[0]));
    return {
      policyVersion: policy.version, partitions,
      diagnostics: {
        representation: checkedAdapter ? 'owner-local-diagonal-adapter/v1' : 'raw-e5-baseline',
        sources: eligible.length, uniqueEvidenceUnits: units.length,
        duplicateSources: eligible.length - units.length, comparedPairs,
        acceptedSeeds: seeds.length, supportedJoins, workUnits,
        peakCachedPairs, geometricChecks, boundCertifications,
      },
    };
  };
  // Without an admitted seed there is no supported group to grow. Building
  // a second index of singleton groups would do work with no possible join.
  if (!seeds.length) return finish(units, 0);
  const groups = [], groupIndex = new MetricForest(work);
  let nextGroupId = 0;
  const singleton = unit => ({ id: nextGroupId++, center: unit.center, normSquared: unit.normSquared,
    major: unit.major, remainingNorm: unit.remainingNorm,
    radius: 0, lower: unit.center, upper: unit.center,
    minMemberNormSquared: unit.normSquared,
    size: 1, memberSet: leaf(unit.id), sourceSet: unit.sourceSet, active: true, node: null });
  const merge = (a, b) => {
    work();
    const size = a.size + b.size, center = new Float64Array(384);
    const lower = new Float64Array(384), upper = new Float64Array(384);
    let squaredRadius = 0;
    for (let i = 0; i < center.length; i++) {
      center[i] = (a.center[i] * a.size + b.center[i] * b.size) / size;
      lower[i] = Math.min(a.lower[i], b.lower[i]); upper[i] = Math.max(a.upper[i], b.upper[i]);
      squaredRadius += Math.max(center[i] - lower[i], upper[i] - center[i]) ** 2;
    }
    return { id: nextGroupId++, center, normSquared: rawDot(center, center),
      ...summarize(center),
      // The coordinate box does not accumulate error as a cloud grows. Keep
      // the tighter of two valid bounds for long, uneven merge sequences.
      radius: Math.min(Math.sqrt(squaredRadius),
        Math.max(a.radius + distance(a.center, center), b.radius + distance(b.center, center))) + EPS,
      lower, upper,
      minMemberNormSquared: Math.min(a.minMemberNormSquared, b.minMemberNormSquared),
      size, memberSet: union(a.memberSet, b.memberSet), sourceSet: union(a.sourceSet, b.sourceSet),
      active: true, node: null };
  };
  const seeded = new Set();
  for (const pair of seeds) {
    seeded.add(pair.i); seeded.add(pair.j);
    groups.push(merge(singleton(units[pair.i]), singleton(units[pair.j])));
  }
  for (const unit of units) if (!seeded.has(unit.id)) groups.push(singleton(unit));
  for (const group of groups) groupIndex.add(group);
  const crossSupport = (a, b) => {
    work();
    if (a.size === 1 && b.size === 1) return null;
    geometricChecks++;
    const mean = rawDot(a.center, b.center);
    const error = Math.sqrt(a.normSquared) * b.radius + Math.sqrt(b.normSquared) * a.radius + a.radius * b.radius;
    if (mean + error + EPS < policy.weakestCrossSimilarity) return null;
    const maximumDistance = distance(a.center, b.center) + a.radius + b.radius;
    const metricLower = (a.minMemberNormSquared + b.minMemberNormSquared - maximumDistance ** 2) / 2;
    if (Math.max(mean - error, metricLower) - EPS >= policy.supportedSimilarity) {
      boundCertifications++;
      // Preserve the original floating-point accumulation order for small
      // joins, including accepted vectors at the normalization tolerance.
      // Large certified joins use their unit-weighted centroid mean instead
      // of revisiting every pair. This may change a floating-point-only tie.
      if (a.size * b.size <= 256) {
        const left = a.size <= b.size ? a : b, right = left === a ? b : a;
        let total = 0;
        for (const i of keys(left.memberSet)) for (const j of keys(right.memberSet)) total += score(i, j);
        return total / (a.size * b.size);
      }
      return clamp(mean);
    }
    const left = a.size <= b.size ? a : b, right = left === a ? b : a;
    const leftIds = [...keys(left.memberSet)], rightIds = [...keys(right.memberSet)];
    const rightHigh = new Uint32Array(rightIds.length);
    let total = 0;
    for (const i of leftIds) {
      let high = 0;
      for (let k = 0; k < rightIds.length; k++) {
        const value = score(i, rightIds[k]);
        if (value < policy.weakestCrossSimilarity) return null;
        total += value;
        if (value >= policy.supportedSimilarity) { high++; rightHigh[k]++; }
      }
      if (high < Math.min(2, right.size)) return null;
    }
    if (left.size > 1 && rightHigh.some(high => high < Math.min(2, left.size))) return null;
    return total / (a.size * b.size);
  };
  const nearestMerge = group => {
    if (!group.active) return null;
    let selected = null;
    groupIndex.search(group, () => selected?.score ?? policy.weakestCrossSimilarity, candidate => {
      if (candidate === group) return false;
      // Mean cosine is the exact mathematical average; bounded roundoff is
      // used for pruning only, never to relax support or weakest-pair gates.
      if (selected && rawDot(group.center, candidate.center) + EPS < selected.score) return false;
      const value = crossSupport(group, candidate);
      if (value === null) return false;
      const entry = { a: group, b: candidate, score: value };
      if (!selected || value > selected.score || value === selected.score && keyCompare(entry, selected) < 0) selected = entry;
      return false;
    }, true);
    return selected;
  };
  const heap = new Heap();
  for (const group of groups) { const entry = nearestMerge(group); if (entry) heap.push(entry); }
  let supportedJoins = 0;
  for (;;) {
    work();
    const entry = heap.pop();
    if (!entry) break;
    if (!entry.a.active) continue;
    if (!entry.b.active) {
      const replacement = nearestMerge(entry.a);
      if (replacement) heap.push(replacement);
      continue;
    }
    const combined = merge(entry.a, entry.b);
    groupIndex.retire(entry.a); groupIndex.retire(entry.b);
    // A tombstone keeps its ordered Source key for heap tie comparison. VP
    // nodes retain immutable center snapshots, so retired group boxes/member
    // roots can be released instead of accumulating 384-coordinate buffers.
    for (const retired of [entry.a, entry.b]) {
      retired.center = null; retired.lower = null; retired.upper = null; retired.memberSet = null;
    }
    groupIndex.add(combined); groups.push(combined); supportedJoins++;
    const next = nearestMerge(combined);
    if (next) heap.push(next);
  }
  return finish(groups.filter(group => group.active), supportedJoins);
}
