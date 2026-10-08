// Offline shadow experiment. In a future client, title/body are consumed locally
// before the single fused vector is sent; this file is not wired to capture.
export const FUSED_SCHEMA = 'synthetic-topic-fused-vector/v1';
export const E5_DIMENSIONS = 384;
export const HASH_DIMENSIONS = 512;
export const FUSED_DIMENSIONS = E5_DIMENSIONS + HASH_DIMENSIONS;
export const MAX_TEXT_CHARACTERS = 4096;

const stopwords = new Set(('a an and are as at be been by can for from has have in into is it its of on or '
  + 'that the their there these this to was were will with about after all before both but does do '
  + 'each had here how more most no not one our over same says some than those through under up what '
  + 'when where which who why would').split(' '));

function checkE5(vector) {
  if (!vector || vector.length !== E5_DIMENSIONS) throw new TypeError('Invalid E5 vector dimensions');
  let squared = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new TypeError('Invalid E5 vector value');
    squared += value * value;
  }
  if (Math.abs(squared - 1) > 0.02) throw new TypeError('E5 vector must be normalized');
}

function boundedText(document) {
  if (!document || typeof document.title !== 'string' || typeof document.body !== 'string')
    throw new TypeError('Invalid document text');
  // Slice before normalization as well, so a huge untrusted page string cannot
  // turn this small feature head into an unbounded normalization operation.
  const title = document.title.slice(0, 256).normalize('NFKC').slice(0, 256);
  const bodyBudget = MAX_TEXT_CHARACTERS - title.length;
  const body = document.body.slice(0, bodyBudget).normalize('NFKC').slice(0, bodyBudget);
  if (!title.trim() || !body.trim()) throw new TypeError('Document text is empty');
  return { title, body };
}

function hash(value, seed = 2166136261) {
  let result = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function addFeature(buckets, key, weight) {
  const index = hash(key) % HASH_DIMENSIONS;
  const sign = (hash(key, 0x811c9dc7) & 1) ? 1 : -1;
  buckets[index] += sign * weight;
}

function words(value) {
  // Unicode words and character n-grams provide a language-independent route;
  // the English stop list is the only language-specific component here.
  return (value.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 800);
}

function collect(buckets, value, weight) {
  const tokens = words(value);
  const meaningful = tokens.filter(token => token.length > 1 && !stopwords.has(token));
  const counts = new Map();
  const feature = (key, amount) => counts.set(key, (counts.get(key) ?? 0) + amount);
  for (const token of meaningful) {
    feature(`w:${token}`, 1);
    if (token.length >= 5) {
      const chars = [...token];
      for (let i = 0; i <= chars.length - 3; i++) feature(`c:${chars.slice(i, i + 3).join('')}`, 0.13);
    }
  }
  // Retain adjacency only within the bounded text; avoid pairing across fields.
  for (let i = 1; i < meaningful.length; i++)
    feature(`b:${meaningful[i - 1]}_${meaningful[i]}`, 0.6);
  for (const [key, count] of counts) addFeature(buckets, key, weight * Math.log1p(count));
}

function sparse(document, titleWeight) {
  const text = boundedText(document);
  const buckets = new Float64Array(HASH_DIMENSIONS);
  collect(buckets, text.title, titleWeight);
  collect(buckets, text.body, 1);
  let squared = 0;
  for (const value of buckets) squared += value * value;
  if (squared > 0) for (let i = 0; i < buckets.length; i++) buckets[i] /= Math.sqrt(squared);
  return buckets;
}

function checkHead(head) {
  if (!head || head.schema !== FUSED_SCHEMA || head.dimensions !== FUSED_DIMENSIONS ||
      !Number.isFinite(head.sparseShare) || head.sparseShare < 0 || head.sparseShare > 0.8 ||
      !Number.isFinite(head.titleWeight) || head.titleWeight < 0.5 || head.titleWeight > 4)
    throw new TypeError('Invalid fused encoder head');
}

// One document in, one unit vector out. No label, other document, or pair input.
export function encodeFusedTopic(document, e5Vector, head) {
  checkHead(head);
  checkE5(e5Vector);
  const lexical = sparse(document, head.titleWeight);
  const result = new Float32Array(FUSED_DIMENSIONS);
  const e5Scale = Math.sqrt(1 - head.sparseShare);
  const lexicalScale = Math.sqrt(head.sparseShare);
  for (let i = 0; i < E5_DIMENSIONS; i++) result[i] = e5Scale * e5Vector[i];
  for (let i = 0; i < HASH_DIMENSIONS; i++) result[E5_DIMENSIONS + i] = lexicalScale * lexical[i];
  // Normalize again after float32 conversion and possible empty sparse features.
  let squared = 0;
  for (const value of result) squared += value * value;
  const norm = Math.sqrt(squared);
  if (!norm) throw new TypeError('Zero fused vector');
  return Float32Array.from(result, value => value / norm);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function validateSplit(documents, vectors, label) {
  if (!Array.isArray(documents) || documents.length < 8 || documents.length > 512 ||
      !(vectors instanceof Map)) throw new TypeError(`Invalid ${label} split`);
  const ids = new Set();
  for (const document of documents) {
    if (!document || typeof document.id !== 'string' || !document.id || ids.has(document.id) ||
        typeof document.family !== 'string' || !document.family ||
        typeof document.topicLabel !== 'string' || !document.topicLabel ||
        typeof document.viewpoint !== 'string' || !document.viewpoint)
      throw new TypeError(`Invalid ${label} document`);
    ids.add(document.id);
    boundedText(document);
    checkE5(vectors.get(document.id));
  }
}

function quality(documents, vectors, head) {
  const mapped = documents.map(document => encodeFusedTopic(document, vectors.get(document.id), head));
  let correct = 0, total = 0, margin = 0;
  let hardCorrect = 0, hardTotal = 0, hardMargin = 0;
  for (let i = 0; i < documents.length; i++) {
    let bestPositive = -Infinity, bestNegative = -Infinity, bestFamilyNegative = -Infinity;
    for (let j = 0; j < documents.length; j++) {
      if (i === j) continue;
      const score = dot(mapped[i], mapped[j]);
      if (documents[i].topicLabel === documents[j].topicLabel) {
        // Explicitly reward different viewpoints, not shared stance wording.
        if (documents[i].viewpoint !== documents[j].viewpoint)
          bestPositive = Math.max(bestPositive, score);
      } else {
        bestNegative = Math.max(bestNegative, score);
        if (documents[i].family === documents[j].family)
          bestFamilyNegative = Math.max(bestFamilyNegative, score);
      }
    }
    if (Number.isFinite(bestPositive) && Number.isFinite(bestNegative)) {
      correct += Number(bestPositive > bestNegative);
      margin += bestPositive - bestNegative;
      total++;
    }
    if (Number.isFinite(bestPositive) && Number.isFinite(bestFamilyNegative)) {
      hardCorrect += Number(bestPositive > bestFamilyNegative);
      hardMargin += bestPositive - bestFamilyNegative;
      hardTotal++;
    }
  }
  if (!total) throw new TypeError('Split requires same-topic opposing viewpoints and family hard negatives');
  return { correct, total, meanMargin: margin / total,
    hardFamily: { correct: hardCorrect, total: hardTotal,
      meanMargin: hardTotal ? hardMargin / hardTotal : null } };
}

// Small fixed grid keeps the parameter count and validation search auditable.
// Train selects candidates on global nearest-neighbor quality; disjoint
// whole-family validation selects among the
// three training leaders. The independent holdout must never enter this API.
export function trainFusedTopicEncoder(trainingDocuments, trainingVectors,
    validationDocuments, validationVectors) {
  validateSplit(trainingDocuments, trainingVectors, 'training');
  validateSplit(validationDocuments, validationVectors, 'validation');
  const trainingFamilies = new Set(trainingDocuments.map(document => document.family));
  const trainingIds = new Set(trainingDocuments.map(document => document.id));
  if (validationDocuments.some(document => trainingFamilies.has(document.family) ||
      trainingIds.has(document.id))) throw new TypeError('Training and validation must be disjoint by family and ID');
  const candidates = [];
  for (const sparseShare of [0, 0.15, 0.3, 0.45, 0.6])
    for (const titleWeight of [1, 2, 3]) {
      if (sparseShare === 0 && titleWeight !== 1) continue;
      const head = { schema: FUSED_SCHEMA, dimensions: FUSED_DIMENSIONS, sparseShare, titleWeight };
      candidates.push({ head, training: quality(trainingDocuments, trainingVectors, head) });
    }
  candidates.sort((a, b) => b.training.correct - a.training.correct ||
    b.training.meanMargin - a.training.meanMargin || a.head.sparseShare - b.head.sparseShare);
  const shortlist = candidates.slice(0, 3).map(candidate => ({ ...candidate,
    validation: quality(validationDocuments, validationVectors, candidate.head) }));
  shortlist.sort((a, b) => b.validation.correct - a.validation.correct ||
    b.validation.meanMargin - a.validation.meanMargin || a.head.sparseShare - b.head.sparseShare);
  const winner = shortlist[0];
  return { ...winner.head, training: winner.training, validation: winner.validation,
    trainingDocuments: trainingDocuments.length, validationDocuments: validationDocuments.length,
    candidateCount: candidates.length };
}
