// Pure offline proposal. No DTO, database, activation or artifact loading.
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { planIndexedAlternateTopics } from '../../../src/domain/alternate-topic-planner-indexed.js';
import { qualifyRetainedTopicContext } from '../../../src/domain/guarded-body-topic-planner.js';
import { fail } from '../../../src/domain/errors.js';

export const PRACTICAL_POLICY = Object.freeze({ version: 'ridge1-qualified-complete-link/v1',
  maxWorkUnits: 100_000_000, workBudgetMs: 10_000, maxCachedPairs: 65_536,
  maxEdgeBytes: 8 * 1024 * 1024, edgeChargedBytes: 192,
  qualification: 'known-negative-first;unknown-eligible;no-positive-title-anchor',
  refinement: 'block-local-strongest-represented-edge;full-cross;source-ID-ties',
});
const LEARNED = 'owner-local-page-embedding/v1', MODEL = 'e5-small-q8-browser-main-prefix-v1';
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid practical research planner input'); };
const capacity = () => fail('capacity', 'Practical research matching budget reached');
function record(value, work = () => {}) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const output = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    work(); const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
    output[key] = field.value;
  }
  return output;
}
function dense(value, work, length = null) {
  if (!value || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const size = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0 || length !== null && size !== length || Reflect.ownKeys(value).length !== size + 1) invalid();
  const output = [];
  for (let index = 0; index < size; index++) {
    work(); const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
    output.push(field.value);
  }
  return output;
}
// Do not change the closed teacher helper. Reject overflow before any unit helper.
export function checkedUnit(values) {
  if (!values || values.length !== 384 || [...values].some(v => typeof v !== 'number' || !Number.isFinite(v))) invalid();
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm <= 1e-9) invalid();
  return Float64Array.from(values, value => value / norm);
}
export function admission(floor) {
  if (!Number.isFinite(floor) || floor <= 0 || floor > 1) invalid();
  // Existing INDEXED accepts only this old seam name. The OUTER policy is new
  // and truthful; this does not make Ridge1 the old BODY metric representation.
  return { version: 'alternate-indexed-body-metric/v1', seedSimilarity: floor,
    supportedSimilarity: floor, weakestCrossSimilarity: floor, crowdedNeighborCount: 3 };
}

export function createPracticalTopicPlanner({ representation, floor, transform }) {
  if (typeof representation !== 'string' || !representation || typeof transform !== 'function') invalid();
  const coarseAdmission = admission(floor);
  return Object.freeze({ policyVersion: PRACTICAL_POLICY.version, representation,
    plan(snapshot) {
      const began = performance.now(); let budget = PRACTICAL_POLICY;
      let deadline = began + budget.workBudgetMs, workUnits = 0, comparedPairs = 0;
      let peakCachedPairs = 0, peakEdgeBytes = 0, candidateEdges = 0, mergedGroups = 0;
      const work = (amount = 1) => {
        if (!Number.isSafeInteger(amount) || amount < 0) invalid();
        workUnits += amount;
        if (!Number.isSafeInteger(workUnits) || workUnits > budget.maxWorkUnits || performance.now() >= deadline) capacity();
      };
      const input = record(snapshot, work), limits = input.limits === undefined ? {} : record(input.limits, work);
      budget = { ...PRACTICAL_POLICY, ...limits };
      if (Object.keys(limits).some(key => !['maxWorkUnits', 'workBudgetMs', 'maxCachedPairs', 'maxEdgeBytes'].includes(key)) ||
          !Number.isSafeInteger(budget.maxWorkUnits) || budget.maxWorkUnits < 1 || budget.maxWorkUnits > PRACTICAL_POLICY.maxWorkUnits ||
          !Number.isFinite(budget.workBudgetMs) || budget.workBudgetMs <= 0 || budget.workBudgetMs > PRACTICAL_POLICY.workBudgetMs ||
          !Number.isSafeInteger(budget.maxCachedPairs) || budget.maxCachedPairs < 0 || budget.maxCachedPairs > PRACTICAL_POLICY.maxCachedPairs ||
          !Number.isSafeInteger(budget.maxEdgeBytes) || budget.maxEdgeBytes < 0 || budget.maxEdgeBytes > PRACTICAL_POLICY.maxEdgeBytes) invalid();
      deadline = began + budget.workBudgetMs; work();
      const all = new Map(), links = new Map();
      for (const value of dense(input.sources, work)) {
        const source = record(value, work);
        if (typeof source.id !== 'string' || !ID.test(source.id) || all.has(source.id)) invalid();
        all.set(source.id, source);
      }
      for (const value of dense(input.sourceLinks, work)) {
        const link = record(value, work), source = all.get(link.sourceId);
        if (!source || links.has(link.sourceId) || typeof link.method !== 'string' || !link.method ||
            source.provenance === LEARNED && !['learned-provisional', 'manual-confirmed'].includes(link.method)) invalid();
        links.set(link.sourceId, link);
      }
      const eligible = [], partitions = [], reasons = {}; let quarantinedSources = 0, learnedSources = 0;
      for (const source of all.values()) {
        work(); if (source.provenance !== LEARNED) continue;
        if (!links.has(source.id)) invalid();
        if (links.get(source.id).method !== 'learned-provisional') continue;
        learnedSources++;
        const embedding = record(source.embedding, work), raw = dense(embedding.values, work, 384);
        if (embedding.modelId !== MODEL || !EXTRACTORS.has(source.extractorVersion) ||
            raw.some(value => typeof value !== 'number' || !Number.isFinite(value))) invalid();
        const norm = Math.hypot(...raw);
        if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) invalid();
        const reason = qualifyRetainedTopicContext({ url: source.url, title: source.title }); work();
        if (reason !== null) {
          quarantinedSources++; reasons[reason] = (reasons[reason] ?? 0) + 1;
          partitions.push({ sourceIds: [source.id] }); continue;
        }
        work(); const represented = checkedUnit(transform(raw)); work();
        eligible.push({ id: source.id, represented });
      }
      eligible.sort((a, b) => { work(); return compare(a.id, b.id); });
      // Negative contexts cannot witness or seed a coarse join. INDEXED expands
      // exact duplicates into all source IDs; refinement consumes that expansion.
      const coarseSources = eligible.map(source => { work(); return { id: source.id, provenance: LEARNED,
        extractorVersion: 'main-text-prefix/v1', embedding: { modelId: MODEL, values: Array.from(source.represented) } }; });
      const coarseLinks = eligible.map(source => { work(); return { sourceId: source.id, method: 'learned-provisional' }; });
      const remainingWork = budget.maxWorkUnits - workUnits, remainingMs = deadline - performance.now();
      if (remainingWork <= 0 || remainingMs <= 0) capacity();
      const coarse = planIndexedAlternateTopics({ sources: coarseSources, sourceLinks: coarseLinks,
        admission: coarseAdmission, limits: { maxWorkUnits: remainingWork,
          maxCachedPairs: budget.maxCachedPairs, workBudgetMs: remainingMs } });
      work(coarse.diagnostics.workUnits);
      const rank = new Map(eligible.map((source, index) => { work(); return [source.id, index]; })), seen = new Set();
      const cache = new Map(), fifo = []; let fifoCursor = 0;
      const score = (a, b) => {
        work(); const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (cache.has(key)) return cache.get(key);
        let value = 0;
        for (let k = 0; k < 384; k++) value += eligible[a].represented[k] * eligible[b].represented[k];
        value = Math.max(-1, Math.min(1, value)); work(); comparedPairs++;
        if (budget.maxCachedPairs) {
          if (cache.size >= budget.maxCachedPairs) {
            cache.delete(fifo[fifoCursor]); fifo[fifoCursor] = key;
            fifoCursor = (fifoCursor + 1) % budget.maxCachedPairs;
          } else fifo.push(key);
          cache.set(key, value); peakCachedPairs = Math.max(peakCachedPairs, cache.size);
        }
        return value;
      };
      for (const block of coarse.partitions) {
        work(); const members = block.sourceIds.map(id => {
          work(); if (!rank.has(id) || seen.has(id)) invalid(); seen.add(id); return rank.get(id);
        });
        members.sort((a, b) => { work(); return compare(eligible[a].id, eligible[b].id); });
        const edges = [];
        for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
          const value = score(members[i], members[j]); if (value < floor) continue;
          const bytes = (edges.length + 1) * PRACTICAL_POLICY.edgeChargedBytes; work();
          if (bytes > budget.maxEdgeBytes) capacity();
          peakEdgeBytes = Math.max(peakEdgeBytes, bytes);
          edges.push({ left: members[i], right: members[j], value }); candidateEdges++;
        }
        edges.sort((a, b) => { work(); return b.value - a.value ||
          compare(eligible[a.left].id, eligible[b.left].id) || compare(eligible[a.right].id, eligible[b.right].id); }); work();
        const parent = new Map(), groups = new Map();
        for (const member of members) { work(); parent.set(member, member); groups.set(member, [member]); }
        const root = member => {
          work(); let current = member;
          while (parent.get(current) !== current) { work(); current = parent.get(current); }
          return current;
        };
        for (const edge of edges) {
          work(); let left = root(edge.left), right = root(edge.right); if (left === right) continue;
          let okay = true;
          cross: for (const a of groups.get(left)) for (const b of groups.get(right)) {
            work(); if (score(a, b) < floor) { okay = false; break cross; }
          }
          if (!okay) continue;
          if (groups.get(left).length < groups.get(right).length) [left, right] = [right, left];
          for (const member of groups.get(right)) { work(); groups.get(left).push(member); }
          parent.set(right, left); groups.delete(right); mergedGroups++;
        }
        for (const group of groups.values()) {
          work(); const sourceIds = group.map(index => { work(); return eligible[index].id; });
          sourceIds.sort((a, b) => { work(); return compare(a, b); }); partitions.push({ sourceIds });
        }
        cache.clear(); fifo.length = 0; fifoCursor = 0;
      }
      if (seen.size !== eligible.length || partitions.flatMap(part => part.sourceIds).length !== learnedSources) invalid();
      partitions.sort((a, b) => { work(); return compare(a.sourceIds[0], b.sourceIds[0]); }); work();
      const elapsedMs = performance.now() - began;
      if (elapsedMs >= budget.workBudgetMs) capacity();
      return { policyVersion: PRACTICAL_POLICY.version, partitions, diagnostics: { representation,
        floor, coarsePolicyVersion: coarse.policyVersion, sources: learnedSources, qualifiedSources: eligible.length,
        quarantinedSources, qualificationReasons: reasons, coarsePartitions: coarse.partitions.length,
        coarseWorkUnits: coarse.diagnostics.workUnits, coarseComparedPairs: coarse.diagnostics.comparedPairs,
        coarseUniqueEvidenceUnits: coarse.diagnostics.uniqueEvidenceUnits, coarseDuplicateSources: coarse.diagnostics.duplicateSources,
        candidateEdges, comparedPairs, mergedGroups, workUnits,
        peakCachedPairs: Math.max(peakCachedPairs, coarse.diagnostics.peakCachedPairs), peakEdgeBytes,
        elapsedMs } };
    },
  });
}
