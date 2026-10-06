export const REFERENCE_THRESHOLD = 0.90;
export const SCORE_KEYS = Object.freeze(['body', 'title-0_25', 'title-0_5', 'title']);

export function summarizeFamilyPairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length !== 6 ||
      pairs.some(pair => typeof pair.positive !== 'boolean' ||
        !pair.scores || SCORE_KEYS.some(key => !Number.isFinite(pair.scores[key]))))
    throw new TypeError('Invalid family pairs');
  const positives = pairs.filter(pair => pair.positive);
  const hardNegatives = pairs.filter(pair => !pair.positive);
  if (positives.length !== 2 || hardNegatives.length !== 4)
    throw new TypeError('Invalid family pair labels');
  return Object.fromEntries(SCORE_KEYS.map(key => {
    const pos = positives.map(pair => pair.scores[key]);
    const neg = hardNegatives.map(pair => pair.scores[key]);
    return [key, { positiveMin: Math.min(...pos), positiveMax: Math.max(...pos),
      hardNegativeMin: Math.min(...neg), hardNegativeMax: Math.max(...neg),
      overlap: Math.max(...neg) >= Math.min(...pos),
      positiveAt090: pos.filter(value => value >= REFERENCE_THRESHOLD).length,
      hardNegativeAt090: neg.filter(value => value >= REFERENCE_THRESHOLD).length }];
  }));
}

export function summarizeSplit(families) {
  if (!Array.isArray(families) || !families.length ||
      families.some(family => !family || typeof family.name !== 'string' ||
        !family.name || !Array.isArray(family.pairs))) throw new TypeError('Invalid split');
  const byFamily = families.map(family => ({ family: family.name,
    scores: summarizeFamilyPairs(family.pairs) }));
  const totals = Object.fromEntries(SCORE_KEYS.map(key => [key, {
    familiesWithOverlap: byFamily.filter(item => item.scores[key].overlap).length,
    positiveAt090: byFamily.reduce((sum, item) => sum + item.scores[key].positiveAt090, 0),
    hardNegativeAt090: byFamily.reduce((sum, item) => sum + item.scores[key].hardNegativeAt090, 0),
  }]));
  return { familyCount: families.length, positivePairCount: families.length * 2,
    hardNegativePairCount: families.length * 4, totals, byFamily };
}
