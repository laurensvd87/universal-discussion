import { evaluateTopicCoverage } from '../topic-coverage-metrics/core.js';

// The source keys never leave this function. Conflicting duplicate labels make
// independent-source support ambiguous, but article-level reach remains valid.
export function coverageForGraph(graph, admitted, existing) {
  const sourceEvents = new Map();
  let conflictingSourceLabels = false;
  for (const row of graph.documents) {
    if (sourceEvents.has(row.duplicateKey) &&
        sourceEvents.get(row.duplicateKey) !== row.eventKey)
      conflictingSourceLabels = true;
    sourceEvents.set(row.duplicateKey, row.eventKey);
  }
  const documents = graph.documents.map(row => ({
    id: row.id, eventKey: row.eventKey, lang: row.lang,
    ...(!conflictingSourceLabels && { duplicateKey: row.duplicateKey }),
  }));
  const edges = admitted.map(({ i, j }) => [graph.ids[i], graph.ids[j]]);
  const coverage = evaluateTopicCoverage(documents, edges);
  if (coverage.direct.trueEdges !== existing.trueEdges ||
      coverage.direct.falseEdges !== existing.falseEdges ||
      coverage.grouped.falsePairs !== existing.groupedFalsePairs ||
      coverage.grouped.singletonGroups !== existing.singletons)
    throw new TypeError('COVERAGE_MISMATCH');
  const { duplicateAdjusted, ...articleCoverage } = coverage;
  return {
    ...articleCoverage,
    duplicateAdjusted: conflictingSourceLabels ? null : duplicateAdjusted,
    duplicateAdjustedAvailable: !conflictingSourceLabels,
  };
}
