import { createHash } from 'node:crypto';

export const MODES = Object.freeze(['body-prefix', 'title-lead', 'title-only']);
// Frozen before inference. Select on development families only, then report held-out.
export const THRESHOLDS = Object.freeze([0.85, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98]);
export const RULE = Object.freeze({ margin: 0.04, candidateLimit: 5,
  selection: 'maximum development true positives subject to zero development false positives; ties prefer higher threshold' });
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function validateCorpus(value) {
  if (value?.schema !== 'topic-identity-corpus/v1' || value.provenance !== 'project-created-synthetic' ||
      value.documents?.length !== 32 || value.split?.development?.length !== 5 || value.split?.heldOut?.length !== 3) throw new Error('Invalid frozen corpus');
  const families = [...value.split.development, ...value.split.heldOut];
  if (new Set(families).size !== 8 || new Set(value.documents.map(d => d.id)).size !== 32) throw new Error('Invalid corpus split');
  for (const d of value.documents) if (Object.keys(d).sort().join() !== 'body,family,id,title,topicLabel' ||
      !families.includes(d.family) || typeof d.title !== 'string' || !d.title.trim() || d.title.length > 200 ||
      typeof d.body !== 'string' || !d.body.trim() || d.body.length > 4096 ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(d.title + d.body)) throw new Error('Invalid synthetic document');
  for (const family of families) {
    const docs = value.documents.filter(d => d.family === family);
    const labels = new Set(docs.map(d => d.topicLabel));
    if (docs.length !== 4 || labels.size !== 2 || [...labels].some(label => docs.filter(d => d.topicLabel === label).length !== 2)) throw new Error('Invalid family');
  }
  return value;
}
export function inputFor(document, mode) {
  if (!MODES.includes(mode)) throw new Error('Invalid mode');
  const normalize = text => text.replace(/\s+/gu, ' ').trim();
  return (mode === 'body-prefix' ? normalize(document.body) : mode === 'title-only' ? normalize(document.title) :
    `${normalize(document.title)} ${normalize(document.body)}`).slice(0, 4096);
}
export function cosine(a, b) {
  if (a.length !== b.length || a.some(v => !Number.isFinite(v)) || b.some(v => !Number.isFinite(v))) throw new Error('Invalid vector');
  return Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0)));
}
function distribution(values) {
  const sorted = [...values].sort((a,b) => a-b);
  return { count: sorted.length, min: sorted[0] ?? null, median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, max: sorted.at(-1) ?? null };
}
function subset(corpus, vectors, families) {
  const docs = corpus.documents.filter(d => families.includes(d.family));
  const pairs = [];
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const a = docs[i], b = docs[j];
    pairs.push({ a: a.id, b: b.id, positive: a.topicLabel === b.topicLabel, hard: a.family === b.family,
      similarity: cosine(vectors[a.id], vectors[b.id]) });
  }
  const positives = pairs.filter(p => p.positive), negatives = pairs.filter(p => !p.positive), hard = negatives.filter(p => p.hard);
  const retrieval = docs.map(d => {
    const ranking = docs.filter(o => o.id !== d.id).map(o => ({ id: o.id, positive: o.topicLabel === d.topicLabel,
      score: cosine(vectors[d.id], vectors[o.id]) })).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
    const positive = ranking.find(p => p.positive);
    return { id: d.id, positiveRank: ranking.findIndex(p => p.positive) + 1,
      positiveSimilarity: positive.score, nearestNegativeSimilarity: ranking.find(p => !p.positive).score,
      margin: positive.score - ranking.find(p => !p.positive).score };
  });
  return { documentCount: docs.length, positive: distribution(positives.map(p => p.similarity)),
    negative: distribution(negatives.map(p => p.similarity)), hardNegative: distribution(hard.map(p => p.similarity)),
    overlap: positives.some(p => hard.some(n => n.similarity >= p.similarity)),
    recallAt1: retrieval.filter(r => r.positiveRank <= 1).length / docs.length,
    recallAt5: retrieval.filter(r => r.positiveRank <= 5).length / docs.length,
    queries: retrieval,
    thresholdSweep: THRESHOLDS.map(threshold => ({ threshold,
      truePositives: positives.filter(p => p.similarity >= threshold).length,
      falsePositives: negatives.filter(p => p.similarity >= threshold).length,
      hardFalsePositives: hard.filter(p => p.similarity >= threshold).length,
      missedPositives: positives.filter(p => p.similarity < threshold).length,
      positivesPassingMargin: retrieval.filter(r => r.positiveSimilarity >= threshold && r.margin >= RULE.margin).length })),
  };
}
export function sequential(corpus, vectors, families, threshold, margin = RULE.margin) {
  const docs = corpus.documents.filter(d => families.includes(d.family));
  const orders = [docs, [...docs].reverse(), [...docs.filter((_,i) => i % 2), ...docs.filter((_,i) => !(i % 2))]];
  return orders.map((order, index) => {
    const clusters = [];
    for (const doc of order) {
      const ranked = clusters.map((members, id) => ({ id, score: Math.min(...members.map(m => cosine(vectors[doc.id], vectors[m.id]))) })).sort((a,b) => b.score-a.score || a.id-b.id);
      const best = ranked[0];
      const competitors = clusters.flatMap((members, id) => id === best?.id ? [] : members);
      if (best && best.score >= threshold && !competitors.some(m => best.score - cosine(vectors[doc.id], vectors[m.id]) < margin)) clusters[best.id].push(doc);
      else clusters.push([doc]);
    }
    let falseJoinedPairs = 0, joinedPositivePairs = 0;
    for (const members of clusters) for (let i=0;i<members.length;i++) for (let j=i+1;j<members.length;j++) {
      if (members[i].topicLabel === members[j].topicLabel) joinedPositivePairs++; else falseJoinedPairs++;
    }
    return { order: ['forward','reverse','interleaved'][index], topicCount: clusters.length, falseJoinedPairs, joinedPositivePairs,
      missedPositivePairs: docs.length / 2 - joinedPositivePairs };
  });
}
export function evaluate(corpus, vectors) {
  validateCorpus(corpus);
  const development = subset(corpus,vectors,corpus.split.development), heldOut = subset(corpus,vectors,corpus.split.heldOut);
  const eligible = development.thresholdSweep.filter(row => row.falsePositives === 0).sort((a,b) => b.truePositives-a.truePositives || b.threshold-a.threshold);
  const selectedThreshold = eligible[0]?.threshold ?? null;
  return { development, heldOut, selectedThreshold,
    heldOutSelected: selectedThreshold === null ? null : heldOut.thresholdSweep.find(row => row.threshold === selectedThreshold),
    baselineSequential: sequential(corpus,vectors,corpus.split.heldOut,0.94),
    selectedSequential: selectedThreshold === null ? null : sequential(corpus,vectors,corpus.split.heldOut,selectedThreshold) };
}
