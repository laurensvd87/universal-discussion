import { aggregatePartition, policyDifference } from '../indexed-body-quality-v1/core.js';
export { aggregatePartition, policyDifference };
export function exposure(rows, partitions) {
  aggregatePartition(rows, partitions);
  const groups = new Map(partitions.flatMap((part, index) => part.sourceIds.map(id => [id, index])));
  const crossLanguage = { total: 0, joined: 0 }, opposingViewpoint = { total: 0, joined: 0 };
  const sameFamilyDifferentEvent = { total: 0, joined: 0 }; let outsideFamilyFalsePairs = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], joined = groups.get(a.id) === groups.get(b.id), same = a.eventKey === b.eventKey;
    if (same && a.lang && b.lang && a.lang !== b.lang) { crossLanguage.total++; crossLanguage.joined += Number(joined); }
    if (same && a.viewpoint && b.viewpoint && a.viewpoint !== b.viewpoint) { opposingViewpoint.total++; opposingViewpoint.joined += Number(joined); }
    if (!same && a.family && b.family) {
      if (a.family === b.family) { sameFamilyDifferentEvent.total++; sameFamilyDifferentEvent.joined += Number(joined); }
      else outsideFamilyFalsePairs += Number(joined);
    }
  }
  return { crossLanguage, opposingViewpoint, sameFamilyDifferentEvent, outsideFamilyFalsePairs };
}
export function practicalSuccess(cohorts) {
  if (!Array.isArray(cohorts) || cohorts.length !== 2) throw new TypeError('COHORTS');
  let candidateTrue = 0, diagonalTrue = 0, candidatePure = 0, diagonalPure = 0;
  for (const cohort of cohorts) {
    if (!cohort?.methods) return false;
    for (const name of ['raw', 'diagonal', 'ridge1']) {
      const method = cohort.methods[name];
      if (!method || method.status !== 'complete' || ['correctGroupedPairs', 'purePages', 'falseGroupedPairs', 'mixedPages']
        .some(field => !Number.isSafeInteger(method[field]) || method[field] < 0)) return false;
    }
    const a = cohort.methods.ridge1, b = cohort.methods.diagonal;
    if (!a || !b || a.falseGroupedPairs > b.falseGroupedPairs || a.mixedPages > b.mixedPages) return false;
    candidateTrue += a.correctGroupedPairs; diagonalTrue += b.correctGroupedPairs;
    candidatePure += a.purePages; diagonalPure += b.purePages;
  }
  return [candidateTrue, diagonalTrue, candidatePure, diagonalPure].every(Number.isSafeInteger) &&
    candidateTrue > diagonalTrue && candidatePure > diagonalPure;
}
