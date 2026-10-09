// Content-free leakage proxy. Never serialize rows, labels, URLs, or examples.
const MAX_NEAR_COMPARISONS = 6_000_000;
const splitNames = ['train', 'validation', 'test'];
const fold = value => value.normalize('NFKC').toLowerCase()
  .replace(/ß/gu, 'ss').replace(/ς/gu, 'σ');
const normalizedText = value => fold(value).replace(/[\p{P}\p{S}]+/gu, ' ')
  .replace(/\s+/gu, ' ').trim();
const tokens = value => new Set(normalizedText(value).match(/[\p{L}\p{N}]+/gu) ?? []);
const dayOf = value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : null;
};
const pairCount = n => n * (n - 1) / 2;
const zeroBySplit = () => ({ trainValidation: 0, trainTest: 0, validationTest: 0 });
const splitPair = (left, right) => {
  if (!left || !right || left === right) return null;
  const indexes = [splitNames.indexOf(left), splitNames.indexOf(right)].sort((a, b) => a - b);
  return indexes[0] === 0 ? indexes[1] === 1 ? 'trainValidation' : 'trainTest' : 'validationTest';
};
const near = (a, b) => {
  if (!a.size || !b.size) return false;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return common >= 3 && common / (a.size + b.size - common) >= 0.8;
};
function normalizedUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    const retained = [...url.searchParams].filter(([name]) =>
      !/^utm_/iu.test(name) && !['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(name.toLowerCase()));
    retained.sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
    url.search = '';
    for (const [name, item] of retained) url.searchParams.append(name, item);
    return url.href;
  } catch { return null; }
}

export function auditCorpus(corpus, csvRows, selection) {
  if (!Array.isArray(csvRows) || csvRows.length !== corpus.documents.length)
    throw new TypeError('Audit rows do not match corpus');
  const splitOf = new Map();
  for (const [name, docs] of Object.entries(selection.splits))
    for (const doc of docs) splitOf.set(doc.id, name);
  const rows = corpus.documents.map((doc, index) => {
    const cells = csvRows[index];
    const day = dayOf(cells[3]);
    return { id: doc.id, label: doc.cluster, split: splitOf.get(doc.id) ?? null,
      title: normalizedText(doc.title), words: tokens(doc.title),
      url: normalizedUrl(cells[5]), day, source: doc.source,
      description: normalizedText(cells[8]) };
  });
  const exact = (field) => {
    const buckets = new Map();
    for (const row of rows) if (row[field]) {
      const list = buckets.get(row[field]) ?? [];
      list.push(row);
      buckets.set(row[field], list);
    }
    let crossLabelPairs = 0, crossSplitPairs = 0;
    const bySplit = zeroBySplit();
    for (const list of buckets.values()) for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].label === list[j].label) continue;
        crossLabelPairs++;
        const key = splitPair(list[i].split, list[j].split);
        if (key) { crossSplitPairs++; bySplit[key]++; }
      }
    return { crossLabelPairs, crossSplitPairs, bySplit };
  };
  const dated = rows.filter(row => row.day !== null).sort((a, b) => a.day - b.day);
  let nearComparisons = 0, nearCrossLabelPairs = 0, nearCrossSplitPairs = 0, truncated = false;
  const nearBySplit = zeroBySplit();
  outer: for (let i = 0; i < dated.length; i++) for (let j = i + 1; j < dated.length; j++) {
    if (dated[j].day - dated[i].day > 7) break;
    if (dated[i].label === dated[j].label) continue;
    if (nearComparisons >= MAX_NEAR_COMPARISONS) { truncated = true; break outer; }
    nearComparisons++;
    if (!near(dated[i].words, dated[j].words)) continue;
    nearCrossLabelPairs++;
    const key = splitPair(dated[i].split, dated[j].split);
    if (key) { nearCrossSplitPairs++; nearBySplit[key]++; }
  }
  const labels = new Map();
  let conflictingDescriptionLabels = 0;
  for (const row of rows) {
    const state = labels.get(row.label) ?? { description: '', variants: new Set(), words: null,
      split: row.split, rows: [] };
    if (row.description) {
      state.variants.add(row.description);
      if (!state.description) { state.description = row.description; state.words = tokens(row.description); }
    }
    state.rows.push(row);
    labels.set(row.label, state);
  }
  for (const state of labels.values()) if (state.variants.size > 1) conflictingDescriptionLabels++;
  const labelList = [...labels.values()].filter(state => state.words?.size);
  let highRiskDescriptionPairs = 0, crossSplitDescriptionPairs = 0;
  const descriptionBySplit = zeroBySplit();
  for (let i = 0; i < labelList.length; i++) for (let j = i + 1; j < labelList.length; j++) {
    if (!near(labelList[i].words, labelList[j].words)) continue;
    highRiskDescriptionPairs++;
    const key = splitPair(labelList[i].split, labelList[j].split);
    if (key) { crossSplitDescriptionPairs++; descriptionBySplit[key]++; }
  }
  const largest = [...labels.values()].sort((a, b) => b.rows.length - a.rows.length)[0];
  const largestDates = largest.rows.map(row => row.day).filter(day => day !== null);
  const largestHosts = new Set(largest.rows.map(row => row.source).filter(Boolean));
  const largestTitles = new Map();
  for (const row of largest.rows)
    largestTitles.set(row.title, (largestTitles.get(row.title) ?? 0) + 1);
  return { mode: 'audit', inputSha256: corpus.inputSha256, modelLoaded: false,
    selectedArticles: selection.selected.length, selectedLabels: new Set(selection.selected.map(doc => doc.cluster)).size,
    datedArticles: dated.length, undatedArticles: rows.length - dated.length,
    exactTitle: exact('title'), exactUrl: exact('url'),
    nearTitleSevenDays: { crossLabelPairs: nearCrossLabelPairs, crossSplitPairs: nearCrossSplitPairs,
      bySplit: nearBySplit, comparedPairs: nearComparisons,
      comparisonBudget: MAX_NEAR_COMPARISONS, truncated },
    labelDescriptions: { highRiskPairs: highRiskDescriptionPairs,
      crossSplitHighRiskPairs: crossSplitDescriptionPairs,
      bySplit: descriptionBySplit, labelsWithConflictingDescriptions: conflictingDescriptionLabels },
    largestLabel: { articles: largest.rows.length, datedArticles: largestDates.length,
      distinctDateDays: new Set(largestDates).size,
      dateSpanDays: largestDates.length ? Math.max(...largestDates) - Math.min(...largestDates) : null,
      distinctUrlHosts: largestHosts.size,
      repeatedNormalizedTitlePairs: [...largestTitles.values()].reduce((sum, count) => sum + pairCount(count), 0) },
    eventDisjointnessVerified: false };
}
