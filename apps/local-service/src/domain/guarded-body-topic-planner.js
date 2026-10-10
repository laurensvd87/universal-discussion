import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { createBodyTopicMetricTransform, BODY_METRIC_SCHEMA } from './body-topic-metric.js';
import { planIndexedAlternateTopics } from './alternate-topic-planner-indexed.js';
import { OWNER_BODY_TOPIC_ADMISSION } from './owner-topic-planner.js';
import { inspectPageUrl } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import { fail } from './errors.js';

export const GUARDED_BODY_TOPIC_POLICY = Object.freeze({
  version: 'alternate-dual-evidence-body/v1',
  maxWorkUnits: 100_000_000, workBudgetMs: 10_000,
  maxCachedPairs: 65_536, maxEdgeBytes: 8 * 1024 * 1024,
});
const LEARNED = 'owner-local-page-embedding/v1';
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid guarded BODY Topic planner input'); };
const capacity = () => fail('capacity', 'Guarded BODY matching work budget reached');

// Descriptor reads reject getters, symbols, proxies and inherited input before
// inspecting coordinates or metadata. Additional repository fields are inert.
function record(value, work = () => {}) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const output = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    work();
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
    output[key] = field.value;
  }
  return output;
}
function denseArray(value, work, length = null) {
  if (!value || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const size = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0 || length !== null && size !== length ||
      Reflect.ownKeys(value).length !== size + 1) invalid();
  const output = [];
  for (let i = 0; i < size; i++) {
    work();
    const field = Object.getOwnPropertyDescriptor(value, String(i));
    if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
    output.push(field.value);
  }
  return output;
}
function metadata(value, maximum) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > maximum) invalid();
  return value;
}

// Frozen negative-role table only. Unknown metadata, scripts, publishers and
// unfamiliar languages remain eligible; URL/title never prove article identity.
export function qualifyRetainedTopicContext(value) {
  const input = record(value), url = metadata(input.url, 2048), title = metadata(input.title, 200);
  if (title && /^(?:just a moment(?:\.{3})?|checking your browser(?:\.{3})?|please wait(?:\.{3})?|loading(?:\.{3})?|access denied|verify you are human|attention required!?(?: \| cloudflare)?)$/iu.test(title.trim())) {
    return 'challenge-title';
  }
  if (!url) return null;
  const inspected = inspectPageUrl(url);
  if (['credentials', 'credential-query', 'sensitive-context'].includes(inspected.reason)) return 'sensitive-context';
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  let path;
  try { path = decodeURIComponent(parsed.pathname).toLowerCase(); } catch { return null; }
  const components = path.split('/').filter(Boolean);
  const query = [...parsed.searchParams].map(([key, entry]) => [key.toLowerCase(), entry]);
  const hasSearch = query.some(([key, entry]) => ['q', 'query', 'search'].includes(key) && entry.trim());
  const landing = !components.length || components.length === 1 && /^(?:index\.(?:html?|php)|home)$/u.test(components[0]);
  if (components.some(component => ['search', 'search-results'].includes(component)) ||
      hasSearch && (landing || components.length === 1 && components[0] === 'results')) return 'search-context';
  if (components.length === 1 && ['onboarding', 'installed', 'what-is-new', 'whats-new', 'update', 'updates'].includes(components[0])) {
    return 'app-context';
  }
  const contentId = query.some(([key, entry]) => ['id', 'article', 'article_id', 'story', 'story_id', 'p', 'post', 'post_id', 'content', 'content_id'].includes(key) && ID.test(entry));
  if (landing && !contentId) return 'landing-context';
  return null;
}

export function createGuardedBodyTopicPlanner(configuration) {
  const options = record(configuration);
  if (Object.keys(options).sort().join(',') !== 'bodyFloor,bodyMetric,rawFloor' ||
      typeof options.bodyFloor !== 'number' || !Number.isFinite(options.bodyFloor) ||
      options.bodyFloor < OWNER_BODY_TOPIC_ADMISSION.seedSimilarity || options.bodyFloor > 1 ||
      typeof options.rawFloor !== 'number' || !Number.isFinite(options.rawFloor) ||
      options.rawFloor <= 0 || options.rawFloor > 1) invalid();
  // Validated, copied and closed once. No per-pair artifact reads or hashing.
  const transform = createBodyTopicMetricTransform(options.bodyMetric);
  const bodyFloor = options.bodyFloor, rawFloor = options.rawFloor;
  return Object.freeze({
    policyVersion: GUARDED_BODY_TOPIC_POLICY.version,
    representation: BODY_METRIC_SCHEMA,
    plan(snapshot) {
      const began = performance.now();
      let budget = GUARDED_BODY_TOPIC_POLICY, deadline = began + budget.workBudgetMs;
      let workUnits = 0, comparedPairs = 0, peakCachedPairs = 0, peakEdgeBytes = 0;
      const work = (amount = 1) => {
        workUnits += amount;
        if (workUnits > budget.maxWorkUnits || performance.now() >= deadline) capacity();
      };
      const input = record(snapshot, work);
      const limits = input.limits === undefined ? {} : record(input.limits, work);
      budget = { ...GUARDED_BODY_TOPIC_POLICY, ...limits };
      if (Object.keys(limits).some(key => !['maxWorkUnits', 'workBudgetMs', 'maxCachedPairs', 'maxEdgeBytes'].includes(key)) ||
          !Number.isSafeInteger(budget.maxWorkUnits) || budget.maxWorkUnits < 1 ||
          budget.maxWorkUnits > GUARDED_BODY_TOPIC_POLICY.maxWorkUnits ||
          !Number.isFinite(budget.workBudgetMs) || budget.workBudgetMs <= 0 ||
          budget.workBudgetMs > GUARDED_BODY_TOPIC_POLICY.workBudgetMs ||
          !Number.isSafeInteger(budget.maxCachedPairs) || budget.maxCachedPairs < 0 || budget.maxCachedPairs > 65_536 ||
          !Number.isSafeInteger(budget.maxEdgeBytes) || budget.maxEdgeBytes < 0 ||
          budget.maxEdgeBytes > GUARDED_BODY_TOPIC_POLICY.maxEdgeBytes) invalid();
      deadline = began + budget.workBudgetMs;
      work();
      const all = new Map(), links = new Map();
      for (const entry of denseArray(input.sources, work)) {
        const source = record(entry, work);
        if (typeof source.id !== 'string' || !ID.test(source.id) || all.has(source.id)) invalid();
        all.set(source.id, source);
      }
      for (const entry of denseArray(input.sourceLinks, work)) {
        const link = record(entry, work), source = all.get(link.sourceId);
        if (!source || typeof link.sourceId !== 'string' || !ID.test(link.sourceId) || links.has(link.sourceId) ||
            typeof link.method !== 'string' || !link.method ||
            source.provenance === LEARNED && !['learned-provisional', 'manual-confirmed'].includes(link.method)) invalid();
        links.set(link.sourceId, link);
      }
      const eligible = [], reasons = {};
      let quarantinedSources = 0;
      for (const source of all.values()) {
        work();
        if (source.provenance !== LEARNED) continue;
        if (!links.has(source.id)) invalid();
        if (links.get(source.id).method !== 'learned-provisional') continue;
        const embedding = record(source.embedding, work);
        const raw = denseArray(embedding.values, work, 384);
        if (embedding.modelId !== MODEL || !EXTRACTORS.has(source.extractorVersion) ||
            raw.some(number => typeof number !== 'number' || !Number.isFinite(number))) invalid();
        const norm = Math.hypot(...raw);
        if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) invalid();
        const reason = qualifyRetainedTopicContext({ url: source.url, title: source.title });
        work();
        if (reason !== null) {
          quarantinedSources++; reasons[reason] = (reasons[reason] ?? 0) + 1;
        }
        work();
        const body = transform(raw);
        work();
        eligible.push({ id: source.id, raw, body, reason });
      }
      eligible.sort((a, b) => { work(); return compare(a.id, b.id); });
      const remainingMs = deadline - performance.now();
      if (remainingMs <= 0 || workUnits >= budget.maxWorkUnits) capacity();
      const coarse = planIndexedAlternateTopics({
        sources: eligible.map(source => {
          work();
          return { id: source.id, provenance: LEARNED, extractorVersion: 'main-text-prefix/v1',
            embedding: { modelId: MODEL, values: [...source.body] } };
        }),
        sourceLinks: eligible.map(source => { work(); return { sourceId: source.id, method: 'learned-provisional' }; }),
        admission: OWNER_BODY_TOPIC_ADMISSION,
        limits: { maxWorkUnits: budget.maxWorkUnits - workUnits, maxCachedPairs: budget.maxCachedPairs,
          workBudgetMs: Math.max(Number.MIN_VALUE, deadline - performance.now()) },
      });
      work(coarse.diagnostics.workUnits);
      const rank = new Map(eligible.map((source, index) => { work(); return [source.id, index]; }));
      const partitions = [], seen = new Set();
      const cache = new Map(), fifo = [];
      let fifoCursor = 0;
      const score = (left, right) => {
        work();
        const key = left < right ? `${left}:${right}` : `${right}:${left}`;
        if (cache.has(key)) return cache.get(key);
        let body = 0, raw = 0;
        for (let coordinate = 0; coordinate < 384; coordinate++) {
          body += eligible[left].body[coordinate] * eligible[right].body[coordinate];
          raw += eligible[left].raw[coordinate] * eligible[right].raw[coordinate];
        }
        work(); comparedPairs++;
        const value = { body: Math.max(-1, Math.min(1, body)), raw: Math.max(-1, Math.min(1, raw)) };
        if (budget.maxCachedPairs) {
          if (cache.size >= budget.maxCachedPairs) {
            cache.delete(fifo[fifoCursor]); fifo[fifoCursor] = key;
            fifoCursor = (fifoCursor + 1) % budget.maxCachedPairs;
          } else fifo.push(key);
          cache.set(key, value); peakCachedPairs = Math.max(peakCachedPairs, cache.size);
        }
        return value;
      };
      let candidateEdges = 0, mergedGroups = 0;
      for (const block of coarse.partitions) {
        work();
        const expanded = block.sourceIds.map(id => {
          work();
          if (!rank.has(id) || seen.has(id)) invalid();
          seen.add(id); return rank.get(id);
        });
        // Qualification is applied only after the complete coarse partition
        // expands duplicate vectors back to all original Source IDs. Negative
        // contexts cannot be refinement evidence, even with identical vectors.
        const members = [];
        for (const index of expanded) {
          work();
          if (eligible[index].reason !== null) partitions.push({ sourceIds: [eligible[index].id] });
          else members.push(index);
        }
        const edges = [];
        for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
          const value = score(members[i], members[j]);
          if (value.body < bodyFloor || value.raw < rawFloor) continue;
          // Conservatively charge each JS record, array reference and sort
          // scratch. Allocation limits abort; they never prune nearest edges.
          const bytes = (edges.length + 1) * 192;
          work();
          if (bytes > budget.maxEdgeBytes) capacity();
          peakEdgeBytes = Math.max(peakEdgeBytes, bytes);
          edges.push({ left: members[i], right: members[j], ...value }); candidateEdges++;
        }
        edges.sort((a, b) => {
          work();
          return b.body - a.body || b.raw - a.raw ||
            compare(eligible[a.left].id, eligible[b.left].id) || compare(eligible[a.right].id, eligible[b.right].id);
        });
        work();
        const parent = new Map(), groups = new Map();
        for (const member of members) { work(); parent.set(member, member); groups.set(member, [member]); }
        const root = index => {
          work();
          let current = index;
          while (parent.get(current) !== current) { work(); current = parent.get(current); }
          return current;
        };
        for (const edge of edges) {
          work();
          let left = root(edge.left), right = root(edge.right);
          if (left === right) continue;
          let admissible = true;
          outer: for (const a of groups.get(left)) for (const b of groups.get(right)) {
            work();
            const value = score(a, b);
            if (value.body < bodyFloor || value.raw < rawFloor) { admissible = false; break outer; }
          }
          if (!admissible) continue;
          if (groups.get(left).length < groups.get(right).length) [left, right] = [right, left];
          const merged = groups.get(left);
          for (const member of groups.get(right)) { work(); merged.push(member); }
          parent.set(right, left); groups.delete(right); mergedGroups++;
        }
        for (const group of groups.values()) {
          work();
          const sourceIds = group.map(index => { work(); return eligible[index].id; });
          sourceIds.sort((a, b) => { work(); return compare(a, b); });
          partitions.push({ sourceIds });
        }
        cache.clear(); fifo.length = 0; fifoCursor = 0;
      }
      if (seen.size !== eligible.length) invalid();
      partitions.sort((a, b) => { work(); return compare(a.sourceIds[0], b.sourceIds[0]); });
      work();
      return { policyVersion: GUARDED_BODY_TOPIC_POLICY.version, partitions,
        diagnostics: { representation: BODY_METRIC_SCHEMA, sources: eligible.length,
          qualifiedSources: eligible.length - quarantinedSources, quarantinedSources, qualificationReasons: reasons,
          coarsePartitions: coarse.partitions.length, coarseWorkUnits: coarse.diagnostics.workUnits,
          candidateEdges, comparedPairs, mergedGroups, workUnits,
          peakCachedPairs: Math.max(peakCachedPairs, coarse.diagnostics.peakCachedPairs), peakEdgeBytes } };
    },
  });
}
