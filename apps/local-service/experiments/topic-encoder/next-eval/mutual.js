// Experimental, text-free identity confidence from a frozen vector gallery.
// This is NOT the live grouping rule; pair scores change as the gallery grows.
function unit(value) {
  if (!value || !value.length) throw new TypeError('Missing vector');
  let square = 0;
  for (const item of value) { if (!Number.isFinite(item)) throw new TypeError('Invalid vector'); square += item * item; }
  if (square < 1e-12) throw new TypeError('Zero vector');
  return Float64Array.from(value, item => item / Math.sqrt(square));
}

function dot(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

export function mutualMarginPairs(documents, vectors) {
  if (!Array.isArray(documents) || documents.length < 3 || documents.length > 1200 ||
      !(vectors instanceof Map) || new Set(documents.map(d => d.id)).size !== documents.length)
    throw new TypeError('Invalid gallery');
  const encoded = documents.map(d => unit(vectors.get(d.id)));
  if (encoded.some(row => row.length !== encoded[0].length)) throw new TypeError('Dimensions differ');
  const nearest = documents.map((document, i) => documents.map((candidate, j) => ({
    j, id: candidate.id, score: i === j ? -Infinity : dot(encoded[i], encoded[j]),
  })).filter(row => row.j !== i).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)));
  const pairs = [];
  for (let i = 0; i < documents.length; i++) {
    const j = nearest[i][0].j;
    if (j <= i || nearest[j][0].j !== i) continue;
    const margin = Math.min(nearest[i][0].score - nearest[i][1].score,
      nearest[j][0].score - nearest[j][1].score);
    pairs.push({ left: documents[i].id, right: documents[j].id,
      positive: documents[i].topicLabel === documents[j].topicLabel,
      score: nearest[i][0].score, margin });
  }
  return pairs;
}

export function strictValidationMargin(documents, vectors) {
  const pairs = mutualMarginPairs(documents, vectors);
  const negatives = pairs.filter(pair => !pair.positive);
  if (!negatives.length) throw new Error('Validation has no mutual hard/negative pair to calibrate');
  return Math.max(0, ...negatives.map(pair => pair.margin)) + 1e-6;
}

export function evaluateMutualMargin(documents, vectors, threshold) {
  if (!Number.isFinite(threshold) || threshold < 0) throw new TypeError('Invalid threshold');
  const pairs = mutualMarginPairs(documents, vectors);
  const accepted = pairs.filter(pair => pair.margin >= threshold);
  return { pairs: pairs.length, positiveCandidates: pairs.filter(pair => pair.positive).length,
    falseCandidates: pairs.filter(pair => !pair.positive).length,
    threshold, correct: accepted.filter(pair => pair.positive).length,
    falseJoins: accepted.filter(pair => !pair.positive).length };
}
