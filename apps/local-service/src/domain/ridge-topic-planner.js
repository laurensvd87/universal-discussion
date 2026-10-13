// Owner-local Ridge1 read policy. Canonical storage and writes are untouched.
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { planIndexedAlternateTopics } from './alternate-topic-planner-indexed.js';
import { qualifyRetainedTopicContext } from './guarded-body-topic-planner.js';
import { fail } from './errors.js';
import { createHash } from 'node:crypto';
import { createBoundedEvidenceGraph } from './bounded-evidence-graph.js';

export const PRACTICAL_POLICY = Object.freeze({ version: 'ridge1-qualified-complete-link/v1',
  maxWorkUnits: 100_000_000, workBudgetMs: 10_000, maxCachedPairs: 65_536,
  maxEdgeBytes: 8 * 1024 * 1024, edgeChargedBytes: 192,
  qualification: 'known-negative-first;unknown-eligible;no-positive-title-anchor',
  refinement: 'block-local-strongest-represented-edge;full-cross;source-ID-ties',
});
const LEARNED = 'owner-local-page-embedding/v1', MODEL = 'e5-small-q8-browser-main-prefix-v1';
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1', 'crawler-static-html-prefix/v1']);
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

// Exact opt-in reuse around the unchanged planner above. Components are only
// dependency separators, not new Topic decisions. Each affected component runs
// the original qualification/coarse/refinement algorithm from its raw inputs.
export function createIncrementalPracticalTopicPlanner({ representation, floor, transform, artifactKey,
  cacheLimits = {} }) {
  if (typeof representation !== 'string' || !representation || typeof transform !== 'function' ||
      typeof artifactKey !== 'string' || !ID.test(artifactKey)) invalid();
  admission(floor);
  const limits = record(cacheLimits);
  const ceilings = { transformBytes: 32 * 1024 * 1024, graphBytes: 32 * 1024 * 1024, componentBytes: 8 * 1024 * 1024 };
  if (Object.keys(limits).some(key => !Object.hasOwn(ceilings, key))) invalid();
  const retained = { ...ceilings, ...limits };
  if (Object.keys(ceilings).some(key => !Number.isSafeInteger(retained[key]) || retained[key] < 0 || retained[key] > ceilings[key])) invalid();
  const graph = createBoundedEvidenceGraph({ edgeFloor: floor - 1e-10, maxBytes: retained.graphBytes });
  const transforms = new Map(), components = new Map();
  let transformBytes = 0, componentBytes = 0, generation = undefined;
  const clear = () => { transforms.clear(); components.clear(); graph.clear(); transformBytes = componentBytes = 0; };
  // Fixed-size binary identities avoid retaining ~15KiB decimal strings per
  // vector. Exact raw copies still guard every digest hit (including -0).
  const rawIdentityBytes = Buffer.alloc(384 * 8);
  const rawKey = values => {
    for (let index = 0; index < 384; index++) rawIdentityBytes.writeDoubleLE(values[index], index * 8);
    return createHash('sha256').update(rawIdentityBytes).digest('hex');
  };
  return Object.freeze({ policyVersion: PRACTICAL_POLICY.version, representation,
    plan(snapshot) {
      const began = performance.now();
      let deadline = began + PRACTICAL_POLICY.workBudgetMs, workUnits = 0;
      const stats = { transformedSources: 0, reusedTransforms: 0, comparedGraphPairs: 0, components: 0,
        reusedComponents: 0, replannedSources: 0, fallback: 0, transformBytes: 0, graphBytes: 0, componentBytes: 0 };
      let budget = PRACTICAL_POLICY;
      const work = (amount = 1) => {
        if (!Number.isSafeInteger(amount) || amount < 0) invalid();
        workUnits += amount;
        if (!Number.isSafeInteger(workUnits) || workUnits > budget.maxWorkUnits || performance.now() >= deadline) capacity();
      };
      const usedTransforms = new Set(), usedComponents = new Set();
      const memoTransform = values => {
        work(); const key = rawKey(values);
        let previous = transforms.get(key);
        if (previous) {
          work(384);
          if (!values.every((value, index) => Object.is(value, previous.raw[index]))) {
            // A digest collision must not reuse another vector's transform.
            transformBytes -= previous.bytes; transforms.delete(key); usedTransforms.delete(key); previous = null;
          }
        }
        if (previous) {
          transforms.delete(key); transforms.set(key, previous); usedTransforms.add(key); stats.reusedTransforms++;
          return previous.values;
        }
        const output = Object.freeze(Array.from(transform(values))); stats.transformedSources++;
        checkedUnit(output); work();
        const bytes = key.length * 2 + (384 + output.length) * 8 + 256;
        if (bytes <= retained.transformBytes) {
          while (transformBytes + bytes > retained.transformBytes && transforms.size) {
            const oldest = transforms.keys().next().value; transformBytes -= transforms.get(oldest).bytes; transforms.delete(oldest); usedTransforms.delete(oldest);
          }
          transforms.set(key, { raw: Float64Array.from(values), values: output, bytes }); transformBytes += bytes; usedTransforms.add(key);
        }
        return output;
      };
      const full = createPracticalTopicPlanner({ representation, floor, transform: memoTransform });
      const runFull = input => {
        work();
        const remainingWork = budget.maxWorkUnits - workUnits, remainingMs = deadline - performance.now();
        if (remainingWork <= 0 || remainingMs <= 0) capacity();
        const result = full.plan({ ...input, limits: { maxWorkUnits: remainingWork, workBudgetMs: remainingMs,
          maxCachedPairs: budget.maxCachedPairs, maxEdgeBytes: budget.maxEdgeBytes } });
        work(result.diagnostics.workUnits); return result;
      };
      const publish = result => {
        work();
        for (const [key, entry] of transforms) if (!usedTransforms.has(key)) { transforms.delete(key); transformBytes -= entry.bytes; }
        for (const [key, entry] of components) if (!usedComponents.has(key)) { components.delete(key); componentBytes -= entry.bytes; }
        stats.transformBytes = transformBytes; stats.componentBytes = componentBytes;
        return { ...result, diagnostics: { ...result.diagnostics, workUnits, elapsedMs: performance.now() - began, incremental: stats } };
      };
      try {
        const input = record(snapshot, work), options = input.limits === undefined ? {} : record(input.limits, work);
        budget = { ...PRACTICAL_POLICY, ...options };
        if (Object.keys(options).some(key => !['maxWorkUnits', 'workBudgetMs', 'maxCachedPairs', 'maxEdgeBytes'].includes(key)) ||
            !Number.isSafeInteger(budget.maxWorkUnits) || budget.maxWorkUnits < 1 || budget.maxWorkUnits > PRACTICAL_POLICY.maxWorkUnits ||
            !Number.isFinite(budget.workBudgetMs) || budget.workBudgetMs <= 0 || budget.workBudgetMs > PRACTICAL_POLICY.workBudgetMs ||
            !Number.isSafeInteger(budget.maxCachedPairs) || budget.maxCachedPairs < 0 || budget.maxCachedPairs > PRACTICAL_POLICY.maxCachedPairs ||
            !Number.isSafeInteger(budget.maxEdgeBytes) || budget.maxEdgeBytes < 0 || budget.maxEdgeBytes > PRACTICAL_POLICY.maxEdgeBytes) invalid();
        deadline = began + budget.workBudgetMs; work();
        const currentGeneration = input.generation ?? null;
        if (currentGeneration !== null && (typeof currentGeneration !== 'string' || !ID.test(currentGeneration))) invalid();
        if (generation !== currentGeneration) { clear(); generation = currentGeneration; }
        if (!retained.graphBytes) { stats.fallback = 1; return publish(runFull(snapshot)); }
        const all = new Map(), links = new Map();
        for (const value of dense(input.sources, work)) {
          const source = record(value, work);
          if (typeof source.id !== 'string' || !ID.test(source.id) || all.has(source.id)) invalid();
          all.set(source.id, { source: value, fields: source });
        }
        for (const value of dense(input.sourceLinks, work)) {
          const link = record(value, work), source = all.get(link.sourceId)?.fields;
          if (!source || links.has(link.sourceId) || typeof link.method !== 'string' || !link.method ||
              source.provenance === LEARNED && !['learned-provisional', 'manual-confirmed'].includes(link.method)) invalid();
          links.set(link.sourceId, value);
        }
        const eligible = [], partitions = [], reasons = {}, units = new Map();
        let signatureCollision = false, scratchGraphBytes = 0;
        const fallback = () => {
          graph.clear(); components.clear(); componentBytes = 0;
          eligible.length = 0; units.clear(); all.clear(); links.clear();
          stats.fallback = 1; return publish(runFull(snapshot));
        };
        let learnedSources = 0, quarantinedSources = 0;
        for (const { source, fields } of all.values()) {
          work(); if (fields.provenance !== LEARNED) continue;
          const link = links.get(fields.id); if (!link) invalid();
          if (link.method !== 'learned-provisional') continue;
          learnedSources++;
          const embedding = record(fields.embedding, work), raw = dense(embedding.values, work, 384);
          if (embedding.modelId !== MODEL || !EXTRACTORS.has(fields.extractorVersion) || raw.some(value => typeof value !== 'number' || !Number.isFinite(value))) invalid();
          const norm = Math.hypot(...raw); if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) invalid();
          const reason = qualifyRetainedTopicContext({ url: fields.url, title: fields.title }); work();
          if (reason !== null) { quarantinedSources++; reasons[reason] = (reasons[reason] ?? 0) + 1; partitions.push({ sourceIds: [fields.id] }); continue; }
          const represented = checkedUnit(memoTransform(raw)), signature = represented.join(',');
          const key = createHash('sha256').update(signature).digest('hex');
          // Retain one exact represented center per duplicate evidence unit,
          // not a full vector/string per Source in a duplicate flood. A digest
          // collision within the inventory falls back to the unchanged oracle.
          if (units.has(key) && units.get(key).center.join(',') !== signature) signatureCollision = true;
          const entry = { id: fields.id, source, link,
            rawKey: rawKey(raw) };
          eligible.push(entry);
          if (!units.has(key)) { units.set(key, { key, center: represented, sourceIds: [] }); scratchGraphBytes += key.length * 2 + 384 * 8 + 512; }
          scratchGraphBytes += fields.id.length * 2 + 32;
          if (scratchGraphBytes > retained.graphBytes) return fallback();
          const unit = units.get(key);
          if (!unit.sourceIds.length || compare(fields.id, unit.sourceIds[0]) < 0) { unit.center = represented; unit.sourceIds.unshift(fields.id); }
          else unit.sourceIds.push(fields.id);
        }
        if (signatureCollision) return fallback();
        const prepared = graph.prepare([...units.values()], { work });
        if (prepared === null) return fallback();
        stats.graphBytes = prepared.stats.bytes; stats.comparedGraphPairs = prepared.stats.comparedPairs; stats.components = prepared.components.length;
        const byId = new Map(eligible.map(entry => [entry.id, entry]));
        const diagnostics = { representation, floor, coarsePolicyVersion: 'alternate-indexed-body-metric/v1', sources: learnedSources,
          qualifiedSources: eligible.length, quarantinedSources, qualificationReasons: reasons, coarsePartitions: 0,
          coarseWorkUnits: 0, coarseComparedPairs: 0, coarseUniqueEvidenceUnits: 0, coarseDuplicateSources: 0,
          candidateEdges: 0, comparedPairs: 0, mergedGroups: 0, peakCachedPairs: 0, peakEdgeBytes: 0 };
        for (const component of prepared.components) {
          work();
          const members = component.flatMap(key => units.get(key).sourceIds).sort(compare);
          const dependency = JSON.stringify([artifactKey, budget.maxCachedPairs, budget.maxEdgeBytes, members.map(id => [id, byId.get(id).rawKey])]);
          const key = createHash('sha256').update(dependency).digest('hex');
          let result = components.get(key)?.result;
          if (result) { usedComponents.add(key); stats.reusedComponents++; }
          else {
            stats.replannedSources += members.length;
            result = runFull({ sources: members.map(id => byId.get(id).source), sourceLinks: members.map(id => byId.get(id).link) });
            const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8') * 2 + key.length * 2 + 256;
            if (bytes <= retained.componentBytes) {
              while (componentBytes + bytes > retained.componentBytes && components.size) {
                const oldest = components.keys().next().value; componentBytes -= components.get(oldest).bytes; components.delete(oldest); usedComponents.delete(oldest);
              }
              components.set(key, { result: structuredClone(result), bytes }); componentBytes += bytes; usedComponents.add(key);
            }
          }
          for (const part of result.partitions) partitions.push({ sourceIds: [...part.sourceIds] });
          for (const name of ['coarsePartitions', 'coarseWorkUnits', 'coarseComparedPairs', 'coarseUniqueEvidenceUnits', 'coarseDuplicateSources', 'candidateEdges', 'comparedPairs', 'mergedGroups']) diagnostics[name] += result.diagnostics[name];
          diagnostics.peakCachedPairs = Math.max(diagnostics.peakCachedPairs, result.diagnostics.peakCachedPairs);
          diagnostics.peakEdgeBytes = Math.max(diagnostics.peakEdgeBytes, result.diagnostics.peakEdgeBytes);
        }
        partitions.sort((a, b) => { work(); return compare(a.sourceIds[0], b.sourceIds[0]); }); work();
        if (partitions.flatMap(part => part.sourceIds).length !== learnedSources) invalid();
        prepared.commit(); return publish({ policyVersion: PRACTICAL_POLICY.version, partitions, diagnostics });
      } catch (error) { clear(); throw error; }
    },
  });
}
