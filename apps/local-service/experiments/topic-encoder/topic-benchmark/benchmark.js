import { performance } from 'node:perf_hooks';
import { planAdaptiveTopics } from '../../../src/domain/adaptive-topics.js';
import { auditVectors, normalizedPartition, pairStability, scorePartition } from './metrics.js';
import { adjacentDevelopments, fixtureInputs, observedShape, sameEventCrowd } from './fixtures.js';

const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const SOURCE = 'owner-local-page-embedding/v1';
const EXTRACTOR = 'main-text-prefix/v1';

export function makeSources(documents, vectors) {
  return documents.map(doc => {
    const vector = vectors.get(doc.id);
    if (!vector || vector.length !== 384) throw new TypeError('Missing 384D vector');
    // Labels, family, viewpoint and body are intentionally excluded.
    return { id: doc.id, title: doc.title,
      url: doc.url ?? `https://${encodeURIComponent(doc.id)}.benchmark.invalid/article`,
      provenance: SOURCE, extractorVersion: EXTRACTOR,
      embedding: { modelId: MODEL, values: Array.from(vector) } };
  });
}

export function currentMatcher(sources) {
  return planAdaptiveTopics({ sources, sourceLinks: [] }).partitions;
}

function orderings(documents) {
  const canonical = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  const reverse = [...canonical].reverse();
  const interleaved = canonical.filter((_, i) => i % 2 === 0)
    .concat(canonical.filter((_, i) => i % 2 === 1));
  return [canonical, reverse, interleaved];
}

export async function evaluateMatcher(documents, vectors, matcher = currentMatcher) {
  const partitionRuns = [];
  const timingMs = [];
  for (const order of orderings(documents)) {
    const started = performance.now();
    const groups = normalizedPartition(order, await matcher(makeSources(order, vectors)));
    timingMs.push(performance.now() - started);
    partitionRuns.push(groups);
  }
  const canonical = JSON.stringify(partitionRuns[0]);
  return { score: scorePartition(documents, partitionRuns[0]),
    vectorAudit: auditVectors(documents, vectors),
    order: { identical: partitionRuns.every(part => JSON.stringify(part) === canonical),
      changedPairs: partitionRuns.slice(1).map(part => pairStability(partitionRuns[0], part,
        documents.map(row => row.id)).changed) },
    timingMs: { median: [...timingMs].sort((a, b) => a - b)[1], runs: timingMs } };
}

export async function evaluateGrowth(rows, matcher = currentMatcher) {
  const { documents, vectors } = fixtureInputs(rows);
  const ordered = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  const history = [];
  let previous = null;
  for (let size = 2; size <= ordered.length; size++) {
    const subset = ordered.slice(0, size);
    const started = performance.now();
    const groups = normalizedPartition(subset, await matcher(makeSources(subset, vectors)));
    history.push({ pages: size, score: scorePartition(subset, groups),
      changedExistingPairs: previous ? pairStability(previous, groups,
        ordered.slice(0, size - 1).map(row => row.id)).changed : 0,
      matchingMs: performance.now() - started });
    previous = groups;
  }
  return { final: history.at(-1), totalChangedExistingPairs: history.reduce((n, step) =>
    n + step.changedExistingPairs, 0), history };
}

export async function runSynthetic(matcher = currentMatcher) {
  const cases = {
    observedShape: observedShape(),
    sameEventCrowd: sameEventCrowd(),
    adjacentDevelopments: adjacentDevelopments(),
  };
  const output = {};
  for (const [name, rows] of Object.entries(cases)) {
    const { documents, vectors } = fixtureInputs(rows);
    output[name] = await evaluateMatcher(documents, vectors, matcher);
  }
  output.growth = await evaluateGrowth(cases.sameEventCrowd, matcher);
  output.scaling = [];
  for (const count of [8, 16, 32, 64]) {
    const { documents, vectors } = fixtureInputs(sameEventCrowd(count));
    const started = performance.now();
    const groups = normalizedPartition(documents, await matcher(makeSources(documents, vectors)));
    output.scaling.push({ pages: count, matchingMs: performance.now() - started,
      score: scorePartition(documents, groups) });
  }
  return output;
}
