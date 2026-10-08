import { createHash } from 'node:crypto';
import { holdout } from './data/holdout.js';

export const HOLDOUT_DIGEST = '83ea464130720f6e94c39e831442805181598cc3f2e9068af7c834d2d8a42447';
const ORDERS = Object.freeze(['forward', 'reverse', 'interleaved']);

export function digestDocuments(documents) {
  return createHash('sha256').update(JSON.stringify(documents)).digest('hex');
}

export function validateHoldout(corpus = holdout) {
  if (corpus?.schema !== 'topic-encoder-holdout/v1' ||
      corpus.provenance !== 'project-created-synthetic' ||
      corpus.documents?.length !== 36) throw new Error('Invalid holdout corpus');
  if (digestDocuments(corpus.documents) !== HOLDOUT_DIGEST) throw new Error('Holdout changed after freeze');
  const ids = new Set(), families = new Map();
  for (const d of corpus.documents) {
    if (ids.has(d.id) || typeof d.title !== 'string' || typeof d.body !== 'string' ||
        !d.title.trim() || !d.body.trim() || d.title.length > 200 || d.body.length > 4096)
      throw new Error('Invalid holdout document');
    ids.add(d.id);
    const familyDocs = families.get(d.family) ?? [];
    familyDocs.push(d);
    families.set(d.family, familyDocs);
  }
  if (families.size !== 9 || [...families.values()].some(docs =>
    docs.length !== 4 || new Set(docs.map(d => d.topicLabel)).size !== 2 ||
    [...new Set(docs.map(d => d.topicLabel))].some(label => docs.filter(d => d.topicLabel === label).length !== 2)))
    throw new Error('Invalid topic families');
  return corpus;
}

function unit(vector) {
  if (!Array.isArray(vector) && !ArrayBuffer.isView(vector)) throw new Error('Invalid vector');
  const values = Array.from(vector);
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error('Invalid vector');
  const norm = Math.hypot(...values);
  if (norm < 1e-12) throw new Error('Zero vector');
  return values.map(value => value / norm);
}

function dot(a, b) {
  if (a.length !== b.length) throw new Error('Vector dimensions differ');
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

function ordersOf(documents) {
  return [
    documents,
    [...documents].reverse(),
    [...documents.filter((_,i) => i % 2), ...documents.filter((_,i) => !(i % 2))],
  ];
}

function orderMetrics(documents, vectors, threshold) {
  return ordersOf(documents).map((order, index) => {
    const clusters = [];
    let falseJoins = 0, joinedPositivePairs = 0, abstentions = 0;
    for (const doc of order) {
      const candidates = clusters.map((members, cluster) => ({
        cluster,
        similarity: Math.min(...members.map(member => dot(vectors[doc.id], vectors[member.id]))),
      })).sort((a,b) => b.similarity-a.similarity || a.cluster-b.cluster);
      if (candidates[0]?.similarity >= threshold) clusters[candidates[0].cluster].push(doc);
      else { clusters.push([doc]); abstentions++; }
    }
    for (const members of clusters) for (let i=0;i<members.length;i++) for (let j=i+1;j<members.length;j++) {
      if (members[i].topicLabel === members[j].topicLabel) joinedPositivePairs++;
      else falseJoins++;
    }
    return { order: ORDERS[index], clusters: clusters.length, abstentions, falseJoins,
      joinedPositivePairs, missedPositivePairs: documents.length / 2 - joinedPositivePairs };
  });
}

/**
 * Evaluation accepts existing E5 vectors keyed by document id and an optional
 * learned vectorMap(vector) callback. The threshold must be chosen before
 * looking at this holdout; this module does not tune it.
 */
export function evaluateHoldout({ documents = holdout.documents, vectors, vectorMap = vector => vector,
  threshold, slice = 'all' } = {}) {
  validateHoldout({ ...holdout, documents });
  if (!vectors || typeof vectorMap !== 'function' ||
      !['all', 'fresh', 'legacy'].includes(slice) ||
      (threshold !== undefined && (!Number.isFinite(threshold) || threshold < -1 || threshold > 1)))
    throw new Error('Invalid evaluation arguments');
  const selected = documents.filter(doc => slice === 'all' ||
    (slice === 'fresh' ? holdout.freshFamilies : holdout.legacyFamilies).includes(doc.family));
  const mapped = Object.fromEntries(selected.map(doc => [doc.id, unit(vectorMap(vectors[doc.id], doc))]));
  const dimensions = new Set(Object.values(mapped).map(v => v.length));
  if (dimensions.size !== 1) throw new Error('Inconsistent vector dimensions');
  const ranks = [], positives = [], hardNegatives = [], allNegatives = [];
  let noMatchAbstentions = 0, matchedQueryAbstentions = 0, matchedQueryCorrect = 0;
  for (const doc of selected) {
    const ranked = selected.filter(other => other.id !== doc.id)
      .map(other => ({ doc: other, similarity: dot(mapped[doc.id], mapped[other.id]) }))
      .sort((a,b) => b.similarity-a.similarity || a.doc.id.localeCompare(b.doc.id));
    const rank = ranked.findIndex(row => row.doc.topicLabel === doc.topicLabel) + 1;
    ranks.push(rank);
    if (threshold !== undefined) {
      // Genuine no-match test: suppress the sole same-topic partner and ask
      // whether this query would start a new topic against the remaining pool.
      const noMatchGallery = ranked.filter(row => row.doc.topicLabel !== doc.topicLabel);
      if (noMatchGallery[0].similarity < threshold) noMatchAbstentions++;
      if (ranked[0].similarity < threshold) matchedQueryAbstentions++;
      if (ranked[0].doc.topicLabel === doc.topicLabel && ranked[0].similarity >= threshold)
        matchedQueryCorrect++;
    }
  }
  for (let i=0;i<selected.length;i++) for (let j=i+1;j<selected.length;j++) {
    const a = selected[i], b = selected[j], similarity = dot(mapped[a.id], mapped[b.id]);
    if (a.topicLabel === b.topicLabel) positives.push(similarity);
    else { allNegatives.push(similarity); if (a.family === b.family) hardNegatives.push(similarity); }
  }
  const pairwiseHardAuc = positives.flatMap(positive => hardNegatives.map(negative =>
    positive > negative ? 1 : positive === negative ? 0.5 : 0))
    .reduce((total, value) => total + value, 0) / (positives.length * hardNegatives.length);
  const base = {
    holdoutDigest: digestDocuments(documents), evaluationDigest: digestDocuments(selected),
    slice, documentCount: selected.length,
    viewpointRecallAt1: ranks.filter(rank => rank === 1).length / ranks.length,
    viewpointRecallAt3: ranks.filter(rank => rank <= 3).length / ranks.length,
    viewpointRecallAt5: ranks.filter(rank => rank <= 5).length / ranks.length,
    pairwiseHardAuc, sameTopicPairs: positives.length, hardNegativePairs: hardNegatives.length,
    minimumSameTopicSimilarity: Math.min(...positives),
    maximumHardNegativeSimilarity: Math.max(...hardNegatives),
  };
  if (threshold === undefined) return base;
  const acceptedPositives = positives.filter(score => score >= threshold).length;
  const falseJoinPairs = allNegatives.filter(score => score >= threshold).length;
  return { ...base, threshold, missedSameTopicPairs: positives.length - acceptedPositives,
    falseJoinPairs, hardFalseJoinPairs: hardNegatives.filter(score => score >= threshold).length,
    pairPrecision: acceptedPositives + falseJoinPairs === 0 ? null :
      acceptedPositives / (acceptedPositives + falseJoinPairs),
    noMatchAbstentionRate: noMatchAbstentions / selected.length,
    matchedQueryAbstentionRate: matchedQueryAbstentions / selected.length,
    matchedQueryRecallAtThreshold: matchedQueryCorrect / selected.length,
    orders: orderMetrics(selected, mapped, threshold) };
}
