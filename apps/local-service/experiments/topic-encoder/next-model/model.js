// Shadow-only page encoder. All features are computed on one page; the only
// trained parameters are field weights selected on family-disjoint validation.
export const SCHEMA = 'topic-assertion-encoder/v1';
const E5_DIM = 384;
const LEX_DIM = 384;
const STOP = new Set('a an and are as at be been by can for from has have in into is it its of on or that the their there these this to was were will with about after all before both but does do each had here how more most no not one our over same says some than those through under up what when where which who why would'.split(' '));

function hash(value, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function tokens(text) {
  return (text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => word.length > 1 && !STOP.has(word)).slice(0, 160);
}

function add(target, text, weight) {
  const words = tokens(text);
  const counts = new Map();
  const increment = (key, amount) => counts.set(key, (counts.get(key) ?? 0) + amount);
  for (const word of words) {
    increment(`w:${word}`, 1);
    if (word.length >= 6) for (let i = 0; i <= word.length - 4; i++)
      increment(`c:${word.slice(i, i + 4)}`, 0.15);
  }
  for (let i = 1; i < words.length; i++) increment(`b:${words[i - 1]}:${words[i]}`, 0.7);
  for (const [key, count] of counts) {
    const index = hash(key) % LEX_DIM;
    const sign = hash(key, 0x9e3779b9) & 1 ? 1 : -1;
    target[index] += sign * weight * Math.log1p(count);
  }
}

function unit(values) {
  let square = 0;
  for (const value of values) square += value * value;
  if (square < 1e-16) throw new TypeError('Empty page representation');
  return Float32Array.from(values, value => value / Math.sqrt(square));
}

export function pageParts(document, e5Vector, model) {
  if (model?.schema !== SCHEMA || ![model.lexicalShare, model.titleWeight, model.secondSentenceWeight]
    .every(Number.isFinite) || model.lexicalShare < 0 || model.lexicalShare > 0.9 ||
    model.titleWeight < 0 || model.titleWeight > 8 || model.secondSentenceWeight < 0 ||
    model.secondSentenceWeight > 2) throw new TypeError('Invalid model');
  if (typeof document?.title !== 'string' || typeof document?.body !== 'string' ||
    !document.title.trim() || !document.body.trim() || !e5Vector || e5Vector.length !== E5_DIM ||
    [...e5Vector].some(value => !Number.isFinite(value))) throw new TypeError('Invalid page');
  // Keep negated comparisons and unrelated-story disclaimers out of the page's
  // event assertion. This is an English-first heuristic, not a truth parser.
  const body = document.body.slice(0, 4096).normalize('NFKC');
  const sentences = body.match(/[^.!?]+[.!?]?/gu) ?? [];
  const assertion = sentences.filter(sentence => !/^\s*(it|this|the (story|report|article|update))?\s*(is |does |was |should )?(not|unrelated|separate|distinct)\b/iu.test(sentence) &&
    !/\b(not|unrelated|separate|distinct|rather than|should not be confused)\b/iu.test(sentence));
  const lexical = new Float64Array(LEX_DIM);
  add(lexical, document.title.slice(0, 256), model.titleWeight);
  if (assertion[0]) add(lexical, assertion[0], 1);
  if (assertion[1]) add(lexical, assertion[1], model.secondSentenceWeight);
  const sparse = unit(lexical);
  const dense = unit(e5Vector);
  return { dense, sparse };
}

export function encodePage(document, e5Vector, model) {
  const { dense, sparse } = pageParts(document, e5Vector, model);
  const combined = new Float64Array(E5_DIM + LEX_DIM);
  for (let i = 0; i < E5_DIM; i++) combined[i] = Math.sqrt(1 - model.lexicalShare) * dense[i];
  for (let i = 0; i < LEX_DIM; i++) combined[E5_DIM + i] = Math.sqrt(model.lexicalShare) * sparse[i];
  return unit(combined);
}

export function cosine(a, b) {
  if (a.length !== b.length) throw new TypeError('Different dimensions');
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

function rankQuality(documents, vectors, model) {
  const encoded = documents.map(doc => encodePage(doc, vectors.get(doc.id), model));
  let hits = 0, margin = 0;
  for (let i = 0; i < documents.length; i++) {
    let positive = -Infinity, negative = -Infinity;
    for (let j = 0; j < documents.length; j++) {
      if (i === j) continue;
      const score = cosine(encoded[i], encoded[j]);
      if (documents[i].topicLabel === documents[j].topicLabel &&
          documents[i].viewpoint !== documents[j].viewpoint) positive = Math.max(positive, score);
      else if (documents[i].topicLabel !== documents[j].topicLabel) negative = Math.max(negative, score);
    }
    if (!Number.isFinite(negative)) throw new TypeError('Missing negative');
    if (!Number.isFinite(positive)) continue; // No-match singleton.
    hits += Number(positive > negative);
    margin += positive - negative;
  }
  const queries = documents.filter(doc => documents.some(other => other.id !== doc.id &&
    other.topicLabel === doc.topicLabel && other.viewpoint !== doc.viewpoint)).length;
  if (!queries) throw new TypeError('Missing positive pairs');
  return { hits, queries, meanMargin: margin / queries };
}

export function trainEncoder(train, trainVectors, validation, validationVectors) {
  const trainFamilies = new Set(train.map(doc => doc.family));
  if (validation.some(doc => trainFamilies.has(doc.family))) throw new TypeError('Family leakage');
  if (train.length > 512 || validation.length > 512) throw new TypeError('Corpus too large');
  // Fixed candidate grid. Train quality nominates candidates; a disjoint set
  // chooses one. The later holdout cannot influence this function.
  const candidates = [];
  for (const lexicalShare of [0, 0.25, 0.5, 0.75])
    for (const titleWeight of [1, 3])
      for (const secondSentenceWeight of [0, 0.5]) {
        if (lexicalShare === 0 && (titleWeight !== 1 || secondSentenceWeight !== 0)) continue;
        const model = { schema: SCHEMA, lexicalShare, titleWeight, secondSentenceWeight };
        candidates.push({ model, train: rankQuality(train, trainVectors, model) });
      }
  candidates.sort((a,b) => b.train.hits - a.train.hits || b.train.meanMargin - a.train.meanMargin ||
    a.model.lexicalShare - b.model.lexicalShare);
  const nominated = candidates.slice(0, 6).map(candidate => ({ ...candidate,
    validation: rankQuality(validation, validationVectors, candidate.model) }));
  nominated.sort((a,b) => b.validation.hits - a.validation.hits ||
    b.validation.meanMargin - a.validation.meanMargin || a.model.lexicalShare - b.model.lexicalShare);
  return { ...nominated[0].model, training: nominated[0].train,
    validation: nominated[0].validation, candidates: candidates.length };
}
