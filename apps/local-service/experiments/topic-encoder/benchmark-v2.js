// Predefined pair/ranking metrics for the independent second synthetic holdout.
// The scoring function sees only title/body and existing E5-derived vectors.
function requireCorpus(documents, vectors, scorer) {
  if (!Array.isArray(documents) || documents.length < 4 || !(vectors instanceof Map) ||
      typeof scorer !== 'function' || new Set(documents.map(d => d.id)).size !== documents.length ||
      documents.some(d => !d?.id || !d.topicLabel || !d.family || !vectors.has(d.id)))
    throw new TypeError('Invalid benchmark inputs');
}

function rankedRows(documents, vectors, scorer) {
  const scores = new Map();
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const left = documents[i], right = documents[j];
    const score = scorer(left, vectors.get(left.id), right, vectors.get(right.id));
    if (!Number.isFinite(score)) throw new TypeError('Non-finite pair score');
    scores.set(`${i}:${j}`, score);
  }
  const scoreAt = (i, j) => scores.get(i < j ? `${i}:${j}` : `${j}:${i}`);
  return { scoreAt, pairs: [...scores.entries()].map(([key, score]) => {
    const [i, j] = key.split(':').map(Number);
    return { i, j, score, positive: documents[i].topicLabel === documents[j].topicLabel,
      hard: documents[i].family === documents[j].family };
  }) };
}

function insertionOrders(documents, scoreAt, threshold) {
  const indexes = documents.map((_, index) => index);
  const orders = [indexes, [...indexes].reverse(),
    [...indexes.filter(index => index % 2), ...indexes.filter(index => !(index % 2))]];
  return orders.map((order, index) => {
    const groups = [];
    for (const current of order) {
      const ranked = groups.map((members, group) => ({ group,
        score: Math.min(...members.map(member => scoreAt(current, member))) }))
        .sort((a, b) => b.score - a.score || a.group - b.group);
      if (ranked[0]?.score >= threshold) groups[ranked[0].group].push(current);
      else groups.push([current]);
    }
    let falseJoinedPairs = 0, joinedSameTopicPairs = 0;
    for (const members of groups) for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        if (documents[members[i]].topicLabel === documents[members[j]].topicLabel)
          joinedSameTopicPairs++;
        else falseJoinedPairs++;
      }
    return { order: ['forward', 'reverse', 'interleaved'][index], groups: groups.length,
      falseJoinedPairs, joinedSameTopicPairs };
  });
}

export function zeroFalseJoinThreshold(documents, vectors, scorer) {
  requireCorpus(documents, vectors, scorer);
  const { pairs } = rankedRows(documents, vectors, scorer);
  const positive = pairs.filter(p => p.positive), negative = pairs.filter(p => !p.positive);
  if (!positive.length || !negative.length) throw new TypeError('Both pair classes required');
  const maxNegative = Math.max(...negative.map(p => p.score));
  const threshold = maxNegative + 1e-6;
  return { threshold, validationPositives: positive.length,
    validationAccepted: positive.filter(p => p.score >= threshold).length,
    validationNegativeMax: maxNegative };
}

export function evaluatePairScores(documents, vectors, scorer, threshold) {
  requireCorpus(documents, vectors, scorer);
  if (threshold !== undefined && !Number.isFinite(threshold)) throw new TypeError('Invalid threshold');
  const { scoreAt, pairs } = rankedRows(documents, vectors, scorer);
  const positives = pairs.filter(p => p.positive), hardNegatives = pairs.filter(p => p.hard && !p.positive);
  if (!positives.length || !hardNegatives.length) throw new TypeError('Topic and hard-negative pairs required');
  const ranks = [];
  let matchedCorrect = 0, noMatchAbstained = 0;
  for (let i = 0; i < documents.length; i++) {
    const ranked = documents.map((doc, j) => ({ doc, j, score: i === j ? -Infinity : scoreAt(i, j) }))
      .filter(row => row.j !== i).sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
    const rank = ranked.findIndex(row => row.doc.topicLabel === documents[i].topicLabel) + 1;
    if (rank === 0) throw new Error('Every query needs a same-topic partner');
    ranks.push(rank);
    if (threshold !== undefined) {
      if (ranked[0].doc.topicLabel === documents[i].topicLabel && ranked[0].score >= threshold)
        matchedCorrect++;
      const noMatchGallery = ranked.filter(row => row.doc.topicLabel !== documents[i].topicLabel);
      if (noMatchGallery[0].score < threshold) noMatchAbstained++;
    }
  }
  let hardOrdering = 0;
  for (const positive of positives) for (const negative of hardNegatives)
    hardOrdering += Number(positive.score > negative.score) +
      0.5 * Number(positive.score === negative.score);
  const result = { queries: documents.length, sameTopicPairs: positives.length,
    hardNegativePairs: hardNegatives.length, recallAt1: ranks.filter(rank => rank <= 1).length / ranks.length,
    recallAt3: ranks.filter(rank => rank <= 3).length / ranks.length,
    recallAt5: ranks.filter(rank => rank <= 5).length / ranks.length,
    hardPairAuc: hardOrdering / (positives.length * hardNegatives.length),
    minimumPositiveScore: Math.min(...positives.map(p => p.score)),
    maximumHardNegativeScore: Math.max(...hardNegatives.map(p => p.score)) };
  if (threshold === undefined) return result;
  return { ...result, threshold,
    positivePairsAccepted: positives.filter(p => p.score >= threshold).length,
    hardFalsePairs: hardNegatives.filter(p => p.score >= threshold).length,
    allFalsePairs: pairs.filter(p => !p.positive && p.score >= threshold).length,
    matchedQueryRecall: matchedCorrect / documents.length,
    noMatchAbstention: noMatchAbstained / documents.length,
    insertionOrders: insertionOrders(documents, scoreAt, threshold) };
}
