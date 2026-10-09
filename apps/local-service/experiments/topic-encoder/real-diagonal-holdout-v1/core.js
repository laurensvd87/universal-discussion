// Content-free relative research decision. Complete events are diagnostic only.
export function compareRelativeCoverage(raw, candidate) {
  const a = raw?.coverage?.grouped;
  const b = candidate?.coverage?.grouped;
  for (const value of [a?.articlesInPureNonSingletonGroups,
    b?.articlesInPureNonSingletonGroups, a?.truePairs, b?.truePairs,
    a?.falsePairs, b?.falsePairs, a?.articlesInMixedGroups,
    b?.articlesInMixedGroups, raw?.admission?.falseEdges,
    candidate?.admission?.falseEdges]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('COVERAGE_INPUT');
  }
  const safetyNotWorse = candidate.admission.falseEdges <= raw.admission.falseEdges &&
    b.falsePairs <= a.falsePairs &&
    b.articlesInMixedGroups <= a.articlesInMixedGroups;
  const reachImproved = b.articlesInPureNonSingletonGroups >= a.articlesInPureNonSingletonGroups &&
    b.truePairs >= a.truePairs &&
    (b.articlesInPureNonSingletonGroups > a.articlesInPureNonSingletonGroups ||
      b.truePairs > a.truePairs);
  return { researchCandidateWins: safetyNotWorse && reachImproved,
    safetyNotWorse, reachImproved };
}

export function verifyReviewedDigests(actual, reviewed) {
  if (!actual || !reviewed || typeof actual !== 'object' ||
      typeof reviewed !== 'object' || Array.isArray(actual) || Array.isArray(reviewed))
    throw new TypeError('REVIEWED_DIGESTS');
  const actualNames = Object.keys(actual).sort();
  const reviewedNames = Object.keys(reviewed).sort();
  if (actualNames.length !== reviewedNames.length ||
      actualNames.some((name, index) => name !== reviewedNames[index]))
    throw new TypeError('REVIEWED_INVENTORY');
  for (const name of actualNames) {
    if (!/^[0-9a-f]{64}$/u.test(actual[name]) ||
        !/^[0-9a-f]{64}$/u.test(reviewed[name]) ||
        actual[name] !== reviewed[name])
      throw new TypeError('REVIEWED_DIGEST_MISMATCH');
  }
  return true;
}
