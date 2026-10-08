// Pure, offline retrieval/identity metrics. A vector is computed once per page;
// the evaluator never needs page text, a database, or a provider.
const ORDERS = ['forward', 'reverse', 'interleaved'];

function normalized(vector) {
  if (!vector || !ArrayBuffer.isView(vector) && !Array.isArray(vector) || !vector.length)
    throw new TypeError('Missing vector');
  let normSquared = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite vector');
    normSquared += value * value;
  }
  if (normSquared < 1e-12) throw new TypeError('Zero vector');
  const norm = Math.sqrt(normSquared);
  return Float64Array.from(vector, value => value / norm);
}

function dot(a, b) {
  let result = 0;
  for (let i = 0; i < a.length; i++) result += a[i] * b[i];
  return result;
}

function check(documents, vectors) {
  if (!Array.isArray(documents) || documents.length < 3 || documents.length > 1200 ||
      !(vectors instanceof Map)) throw new TypeError('Invalid benchmark inputs');
  const ids = new Set(), families = new Map(), topics = new Map(), encoded = [];
  let dimensions;
  for (const document of documents) {
    if (!document || typeof document.id !== 'string' || !document.id || ids.has(document.id) ||
        typeof document.family !== 'string' || !document.family ||
        typeof document.topicLabel !== 'string' || !document.topicLabel ||
        typeof document.viewpoint !== 'string' || !document.viewpoint)
      throw new TypeError('Invalid benchmark document');
    ids.add(document.id);
    const vector = normalized(vectors.get(document.id));
    dimensions ??= vector.length;
    if (dimensions !== vector.length) throw new TypeError('Inconsistent dimensions');
    encoded.push(vector);
    const familyTopics = families.get(document.family) ?? new Set();
    familyTopics.add(document.topicLabel);
    families.set(document.family, familyTopics);
    const topic = topics.get(document.topicLabel) ?? [];
    topic.push(document);
    topics.set(document.topicLabel, topic);
  }
  if (![...topics.values()].some(group => group.length >= 2) ||
      [...topics].some(([, group]) => group.some(d => d.family !== group[0].family)))
    throw new TypeError('At least one positive topic and isolated families required');
  return encoded;
}

function matrixOf(vectors) {
  return vectors.map((left, i) => vectors.map((right, j) => i === j ? 1 : dot(left, right)));
}

function ordered(documents, matrix, threshold) {
  const indexes = documents.map((_, i) => i);
  const orders = [indexes, [...indexes].reverse(),
    [...indexes.filter(i => i % 2), ...indexes.filter(i => i % 2 === 0)]];
  return orders.map((order, position) => {
    const groups = [];
    for (const i of order) {
      const scores = groups.map((members, group) => ({ group,
        score: Math.min(...members.map(j => matrix[i][j])) }))
        .sort((a, b) => b.score - a.score || a.group - b.group);
      if (scores[0]?.score >= threshold) groups[scores[0].group].push(i);
      else groups.push([i]);
    }
    let correct = 0, falseJoins = 0;
    for (const group of groups) for (let a = 0; a < group.length; a++)
      for (let b = a + 1; b < group.length; b++) {
        if (documents[group[a]].topicLabel === documents[group[b]].topicLabel) correct++;
        else falseJoins++;
      }
    return { order: ORDERS[position], groups: groups.length, correct, falseJoins };
  });
}

export function evaluateVectors(documents, vectors, threshold) {
  const encoded = check(documents, vectors);
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < -1 || threshold > 1.001))
    throw new TypeError('Invalid threshold');
  const matrix = matrixOf(encoded);
  const positives = [], negatives = [], hardNegatives = [], crossViewPositives = [];
  let top1 = 0, top3 = 0, wrongFamilyTop1 = 0, noMatchQueries = 0,
    noMatchAbstained = 0, matchedAbstained = 0, matchedCorrect = 0;
  for (let i = 0; i < documents.length; i++) {
    const ranked = documents.map((d, j) => ({ j, id: d.id, score: matrix[i][j] }))
      .filter(row => row.j !== i).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const firstPositive = ranked.findIndex(row =>
      documents[row.j].topicLabel === documents[i].topicLabel);
    if (firstPositive < 0) noMatchQueries++;
    else {
      top1 += Number(firstPositive === 0);
      top3 += Number(firstPositive < 3);
    }
    wrongFamilyTop1 += Number(documents[ranked[0].j].family !== documents[i].family);
    if (threshold !== undefined) {
      if (firstPositive < 0) noMatchAbstained += Number(ranked[0].score < threshold);
      else {
        matchedCorrect += Number(firstPositive === 0 && ranked[0].score >= threshold);
        matchedAbstained += Number(ranked[0].score < threshold);
      }
    }
    for (let j = i + 1; j < documents.length; j++) {
      const score = matrix[i][j];
      if (documents[i].topicLabel === documents[j].topicLabel) {
        positives.push(score);
        if (documents[i].viewpoint !== documents[j].viewpoint) crossViewPositives.push(score);
      } else {
        negatives.push(score);
        if (documents[i].family === documents[j].family) hardNegatives.push(score);
      }
    }
  }
  if (!positives.length || !hardNegatives.length)
    throw new TypeError('Benchmark requires positive and same-family hard-negative pairs');
  const summary = { documents: documents.length, dimensions: encoded[0].length,
    positives: positives.length, crossViewPositives: crossViewPositives.length,
    negatives: negatives.length, hardNegatives: hardNegatives.length,
    matchedQueries: documents.length - noMatchQueries, noMatchQueries,
    top1, top3, wrongFamilyTop1,
    hardPairAuc: positives.flatMap(p => hardNegatives.map(n =>
      p > n ? 1 : p === n ? 0.5 : 0)).reduce((sum, value) => sum + value, 0) /
      (positives.length * hardNegatives.length),
    positiveMin: Math.min(...positives), hardNegativeMax: Math.max(...hardNegatives),
    allNegativeMax: Math.max(...negatives) };
  if (threshold === undefined) return summary;
  return { ...summary, threshold,
    correctPairs: positives.filter(score => score >= threshold).length,
    crossViewPairs: crossViewPositives.filter(score => score >= threshold).length,
    falsePairs: negatives.filter(score => score >= threshold).length,
    hardFalsePairs: hardNegatives.filter(score => score >= threshold).length,
    matchedCorrect, matchedAbstained, noMatchAbstained,
    insertionOrders: ordered(documents, matrix, threshold) };
}

// The strict threshold is selected from validation only, then frozen for holdout.
// Its zero observed validation false joins are not a statistical safety guarantee.
export function strictValidationThreshold(documents, vectors) {
  return Math.min(1.001, evaluateVectors(documents, vectors).allNegativeMax + 1e-6);
}
