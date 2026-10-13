import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { planAdaptiveTopics, ADAPTIVE_TOPIC_POLICY } from './adaptive-topics.js';
import { createBoundedEvidenceGraph } from './bounded-evidence-graph.js';
import { fail } from './errors.js';

const LEARNED = 'owner-local-page-embedding/v1';
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1', 'crawler-static-html-prefix/v1']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const BUDGET_MS = 10_000;
const DEFAULT_RESULT_BYTES = 8 * 1024 * 1024;
const copy = value => structuredClone(value);

// Exact dependency components, not a nearest-neighbour heuristic. The outside
// competitor veto can observe scores down to floor - competingMargin. Current
// Topic members are also joined: manual pins and historical initial partitions
// may deliberately span unrelated geometry. Rebuild every changed component;
// the original planner still decides all admissions, splits, ties and pins.
export function createIncrementalAdaptiveTopicPlanner({ graphBytes = 32 * 1024 * 1024,
  resultBytes = DEFAULT_RESULT_BYTES, oracle = planAdaptiveTopics, onDiagnostics = null } = {}) {
  if (typeof oracle !== 'function' || !Number.isSafeInteger(resultBytes) || resultBytes < 0 || resultBytes > DEFAULT_RESULT_BYTES ||
      onDiagnostics !== null && typeof onDiagnostics !== 'function') throw new TypeError('Invalid incremental matching options');
  const graph = createBoundedEvidenceGraph({ edgeFloor: ADAPTIVE_TOPIC_POLICY.floor - ADAPTIVE_TOPIC_POLICY.competingMargin - 1e-10,
    maxBytes: graphBytes });
  let generation = null, cached = new Map();
  function clear() { graph.clear(); cached.clear(); }
  function report(value) { try { onDiagnostics?.(Object.freeze(value)); } catch { /* Numeric diagnostics cannot affect matching. */ } }
  return function incremental(input) {
    const began = performance.now(), deadline = began + BUDGET_MS;
    let checks = 0;
    const work = () => { if ((++checks & 1023) === 0 && performance.now() >= deadline) fail('capacity', 'Matching work budget reached'); };
    const fallback = () => {
      clear(); const remaining = deadline - performance.now();
      if (remaining <= 0) fail('capacity', 'Matching work budget reached');
      const result = oracle(input, { workBudgetMs: Math.min(BUDGET_MS, remaining) });
      report({ fallback: true, reusedComponents: 0, rebuiltComponents: 1, comparedPairs: 0, graphBytes: 0, resultBytes: 0 });
      return result;
    };
    try {
      if (input.generation !== generation) { clear(); generation = input.generation; }
      if (!Array.isArray(input.sources) || !Array.isArray(input.sourceLinks) ||
          input.previousPartitions !== undefined && !Array.isArray(input.previousPartitions)) return fallback();
      const all = new Map(), learned = new Map(), links = new Map(), retained = new Set(), priorIds = new Set();
      for (const source of input.sources) {
        work();
        if (!source || typeof source.id !== 'string' || !ID.test(source.id) || all.has(source.id)) return fallback();
        all.set(source.id, source);
        if (source.provenance !== LEARNED) continue;
        const values = source.embedding?.values;
        if (source.embedding?.modelId !== MODEL || !EXTRACTORS.has(source.extractorVersion) || typeof source.url !== 'string' ||
            source.url.length > 2048 || !Array.isArray(values) || types.isProxy(values) || values.length !== 384 ||
            Object.getPrototypeOf(values) !== Array.prototype || Reflect.ownKeys(values).length !== 385) return fallback();
        // Sparse/NaN legacy arithmetic stays on the exact original path. Never
        // reinterpret it as a dense vector or silently tighten accepted input.
        for (let axis = 0; axis < 384; axis++) {
          work(); const field = Object.getOwnPropertyDescriptor(values, axis);
          if (!field || !field.enumerable || !Object.hasOwn(field, 'value') ||
              typeof field.value !== 'number' || !Number.isFinite(field.value)) return fallback();
        }
        if (!Number.isFinite(Math.hypot(...values)) || Math.abs(Math.hypot(...values) - 1) > 1e-6) return fallback();
        learned.set(source.id, source);
      }
      for (const link of input.sourceLinks) {
        work();
        if (!link || typeof link.sourceId !== 'string' || typeof link.topicId !== 'string' || !ID.test(link.sourceId) ||
            !ID.test(link.topicId) || links.has(link.sourceId) || !all.has(link.sourceId) ||
            learned.has(link.sourceId) && !['learned-provisional', 'manual-confirmed'].includes(link.method)) return fallback();
        links.set(link.sourceId, link);
      }
      for (const part of input.previousPartitions ?? []) {
        work();
        if (!part || !Array.isArray(part.sourceIds) || typeof part.retainTight !== 'boolean' ||
            !(part.pinnedTopicId === null || typeof part.pinnedTopicId === 'string' && ID.test(part.pinnedTopicId))) return fallback();
        for (const id of part.sourceIds) {
          work(); if (typeof id !== 'string' || !ID.test(id) || priorIds.has(id)) return fallback();
          priorIds.add(id); if (part.retainTight && learned.has(id)) retained.add(id);
        }
      }
      const sources = [...learned.values()].sort((a, b) => compare(a.id, b.id));
      const initial = new Map(), sourceGroup = new Map();
      for (const source of sources) {
        work(); const link = links.get(source.id), key = link ? `topic:${link.topicId}` : `new:${source.id}`;
        if (!initial.has(key)) initial.set(key, []);
        initial.get(key).push(source.id); sourceGroup.set(source.id, key);
      }
      const groups = [...initial.keys()], groupOrder = new Map(groups.map((key, index) => [key, index]));
      const prepared = graph.prepare(sources.map(source => ({ key: source.id, center: source.embedding.values, sourceIds: [source.id] })),
        { work, forcedUnions: [...initial.values()] });
      if (prepared === null) return fallback();
      const nextCache = new Map(), partitions = [], decisions = [];
      let reusedComponents = 0, rebuiltComponents = 0, bytes = 0;
      for (const members of prepared.components) {
        work(); const hash = createHash('sha256');
        for (const id of [...members].sort(compare)) {
          work(); const source = learned.get(id), link = links.get(id);
          const encoded = [];
          for (let axis = 0; axis < 384; axis++) {
            const value = source.embedding.values[axis]; encoded.push(Object.is(value, -0) ? '-0' : value);
          }
          hash.update(JSON.stringify([id, source.url, source.extractorVersion, source.embedding.modelId, encoded,
            link ? [link.topicId, link.method] : null, retained.has(id)]));
        }
        const key = hash.digest('hex'); let result = cached.get(key)?.result;
        if (result) reusedComponents++;
        else {
          const remaining = deadline - performance.now(); if (remaining <= 0) fail('capacity', 'Matching work budget reached');
          result = oracle({ sources: members.map(id => learned.get(id)),
            sourceLinks: members.map(id => links.get(id)).filter(Boolean),
            previousPartitions: members.map(id => ({ sourceIds: [id], pinnedTopicId: null, retainTight: retained.has(id) }))
          }, { workBudgetMs: remaining });
          rebuiltComponents++;
        }
        if (result?.policyVersion !== ADAPTIVE_TOPIC_POLICY.version || !Array.isArray(result.partitions) || !Array.isArray(result.decisions))
          fail('invalid', 'Invalid adaptive Topic plan');
        for (const part of result.partitions) partitions.push(copy(part));
        for (const decision of result.decisions) decisions.push({ value: copy(decision), group: groupOrder.get(sourceGroup.get(decision.sourceIds[0])) });
        const charged = Buffer.byteLength(JSON.stringify(result)) * 2 + 256;
        if (bytes + charged <= resultBytes) { nextCache.set(key, { result: copy(result) }); bytes += charged; }
      }
      // The original emits split/manual decisions first, in initial-group order,
      // then incompatible-representation decisions in the same group order.
      decisions.sort((a, b) => Number(a.value.reason === 'incompatible-representation-split') -
        Number(b.value.reason === 'incompatible-representation-split') || a.group - b.group);
      partitions.sort((a, b) => compare(a.sourceIds.join('\0'), b.sourceIds.join('\0')));
      if (performance.now() >= deadline) fail('capacity', 'Matching work budget reached');
      prepared.commit(); cached = nextCache;
      report({ fallback: false, reusedComponents, rebuiltComponents, comparedPairs: prepared.stats.comparedPairs,
        graphBytes: prepared.stats.bytes, resultBytes: bytes });
      return { policyVersion: ADAPTIVE_TOPIC_POLICY.version, partitions, decisions: decisions.map(entry => entry.value) };
    } catch (error) { clear(); throw error; }
  };
}
