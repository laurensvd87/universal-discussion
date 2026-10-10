import { createBodyTopicMetricTransform, BODY_METRIC_SCHEMA } from './body-topic-metric.js';
import { readDiagonalAdapter, ADAPTER_SCHEMA } from './diagonal-adapter.js';
import { planIndexedAlternateTopics, INDEXED_TOPIC_POLICY } from './alternate-topic-planner-indexed.js';
import { performance } from 'node:perf_hooks';
import { fail } from './errors.js';

// Fixed BODY calibration, applied to the indexed supported-merge algorithm.
// This is a separate policy from the research strongest-edge complete-link run.
export const OWNER_BODY_TOPIC_ADMISSION = Object.freeze({
  version: 'alternate-indexed-body-metric/v1',
  seedSimilarity: 0.3622392629925627,
  supportedSimilarity: 0.3622392629925627,
  weakestCrossSimilarity: 0.3622392629925627,
  crowdedNeighborCount: 3,
});

const invalid = () => { throw new TypeError('Invalid owner-local Topic planner input'); };

function diagonalTransform(artifact) {
  const adapter = readDiagonalAdapter(artifact);
  const scales = adapter.parameters.map(value => Math.exp(value));
  return values => {
    if (!Array.isArray(values) || values.length !== 384 ||
        !values.every(value => typeof value === 'number' && Number.isFinite(value))) invalid();
    const norm = Math.hypot(...values);
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) invalid();
    const scaled = values.map((value, index) => value * scales[index]);
    const length = Math.hypot(...scaled);
    if (!Number.isFinite(length) || length < 1e-9) invalid();
    return scaled.map(value => value / length);
  };
}

// Artifact validation and coefficient copying happen only at construction.
// Coordinates are transient plan-local copies; neither artifacts nor vectors
// are exposed in the returned planner or content-free partition DTO.
export function createOwnerTopicPlanner({ diagonalAdapter = null, bodyMetric = null } = {}) {
  if (bodyMetric === null && diagonalAdapter === null) invalid();
  const body = bodyMetric !== null;
  const transform = body ? createBodyTopicMetricTransform(bodyMetric) : diagonalTransform(diagonalAdapter);
  const representation = body ? BODY_METRIC_SCHEMA : ADAPTER_SCHEMA;
  const policyVersion = body ? OWNER_BODY_TOPIC_ADMISSION.version : INDEXED_TOPIC_POLICY.version;
  return Object.freeze({
    policyVersion,
    representation,
    plan(snapshot) {
      const start = performance.now();
      if (!snapshot || !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.sourceLinks)) invalid();
      const limits = snapshot.limits ?? {};
      if (!limits || typeof limits !== 'object' || Array.isArray(limits)) invalid();
      const budget = { ...INDEXED_TOPIC_POLICY, ...limits };
      if (Object.keys(limits).some(key => !['maxWorkUnits', 'maxCachedPairs', 'workBudgetMs'].includes(key)) ||
          !Number.isSafeInteger(budget.maxWorkUnits) || budget.maxWorkUnits < 1 ||
          !Number.isSafeInteger(budget.maxCachedPairs) || budget.maxCachedPairs < 0 ||
          !Number.isFinite(budget.workBudgetMs) || budget.workBudgetMs <= 0) invalid();
      const deadline = start + budget.workBudgetMs;
      let prework = 0, transformedSources = 0;
      const check = () => {
        if (++prework >= budget.maxWorkUnits || performance.now() >= deadline) {
          fail('capacity', 'Owner-local matching work budget reached');
        }
      };
      const provisional = new Set();
      for (const link of snapshot.sourceLinks) {
        check();
        if (link?.method === 'learned-provisional') provisional.add(link.sourceId);
      }
      const sources = snapshot.sources.map(source => {
        check();
        if (source?.provenance !== 'owner-local-page-embedding/v1' || !provisional.has(source.id)) return source;
        transformedSources++;
        return { ...source, embedding: { ...source.embedding, values: Array.from(transform(source.embedding?.values)) } };
      });
      check();
      const remainingMs = deadline - performance.now();
      if (remainingMs <= 0) fail('capacity', 'Owner-local matching work budget reached');
      const result = planIndexedAlternateTopics({ sources, sourceLinks: snapshot.sourceLinks,
        admission: body ? OWNER_BODY_TOPIC_ADMISSION : null, limits: {
          maxCachedPairs: budget.maxCachedPairs, maxWorkUnits: budget.maxWorkUnits - prework,
          workBudgetMs: remainingMs,
        } });
      if (performance.now() >= deadline) fail('capacity', 'Owner-local matching work budget reached');
      return { ...result, diagnostics: { ...result.diagnostics, representation,
        preparationWorkUnits: prework, transformedSources,
        workUnits: result.diagnostics.workUnits + prework } };
    },
  });
}
