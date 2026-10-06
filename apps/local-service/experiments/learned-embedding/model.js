// Offline, dependency-free metric learning probe. No model asset or network path.
export const DIMENSIONS = 256;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were']);

function hash(token) {
  let value = 2166136261;
  for (const char of token) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

export function features(document) {
  if (!document || typeof document.title !== 'string' || typeof document.body !== 'string' ||
      document.title.length > 200 || document.body.length > 4096) throw new TypeError('Invalid document');
  const counts = new Float64Array(DIMENSIONS);
  const add = (value, amount) => {
    const words = value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const word of words) {
      if (word.length < 3 || STOP.has(word)) continue;
      counts[hash(`word:${word}`) % DIMENSIONS] += amount;
      // Character trigrams allow local spelling overlap without language services.
      for (let i = 0; i + 3 <= word.length; i++)
        counts[hash(`tri:${word.slice(i, i + 3)}`) % DIMENSIONS] += amount / 3;
    }
  };
  add(document.title, 3);
  add(document.body, 1);
  return counts;
}

export function train(documents) {
  if (!Array.isArray(documents) || documents.length < 4 || documents.length > 64 ||
      documents.some(d => typeof d.topicLabel !== 'string' || typeof d.family !== 'string'))
    throw new TypeError('Invalid training set');
  const raw = documents.map(features);
  const df = new Uint16Array(DIMENSIONS);
  for (const row of raw) for (let k = 0; k < DIMENSIONS; k++) if (row[k] > 0) df[k]++;
  const idf = Float64Array.from(df, n => Math.log((1 + documents.length) / (1 + n)) + 1);
  const base = raw.map(row => normalize(row.map((n, k) => Math.log1p(n) * idf[k])));
  const positive = new Float64Array(DIMENSIONS), hardNegative = new Float64Array(DIMENSIONS);
  let positiveCount = 0, negativeCount = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    if (documents[i].family !== documents[j].family) continue;
    const same = documents[i].topicLabel === documents[j].topicLabel;
    const accumulator = same ? positive : hardNegative;
    for (let k = 0; k < DIMENSIONS; k++) accumulator[k] += (base[i][k] - base[j][k]) ** 2;
    if (same) positiveCount++; else negativeCount++;
  }
  if (!positiveCount || !negativeCount) throw new Error('Training set needs both pair classes');
  // Positive dimensions should vary little across viewpoints and more across
  // distinct developments. Bound the exponent to avoid a few memorized tokens.
  const weights = Float64Array.from(positive, (sum, k) =>
    Math.exp(Math.max(-1, Math.min(1, 12 * (hardNegative[k] / negativeCount - sum / positiveCount)))));
  return { schema: 'synthetic-diagonal-text-embedding/v1', idf, weights,
    trainingDocuments: documents.length, positivePairs: positiveCount, hardNegativePairs: negativeCount };
}

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return Float64Array.from(vector, value => norm ? value / norm : 0);
}

export function embed(document, model, learned = true) {
  if (model?.schema !== 'synthetic-diagonal-text-embedding/v1' ||
      model.idf?.length !== DIMENSIONS || model.weights?.length !== DIMENSIONS)
    throw new TypeError('Invalid model');
  const row = features(document);
  return normalize(row.map((value, k) => Math.log1p(value) * model.idf[k] *
    (learned ? Math.sqrt(model.weights[k]) : 1)));
}

export function similarity(a, b) {
  if (a.length !== DIMENSIONS || b.length !== DIMENSIONS) throw new TypeError('Invalid embedding');
  return a.reduce((sum, value, k) => sum + value * b[k], 0);
}
