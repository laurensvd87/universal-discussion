// Offline cross-corpus diagnostic. Inputs and vectors stay in memory.
import { freezeOnValidation, normalize, scoreFrozen, scoreRaw,
  validationCutoff, transform } from '../wikinews-train-v1/core.js';

const DIM = 384;
const dot = (a, b) => {
  let result = 0;
  for (let index = 0; index < DIM; index++) result += a[index] * b[index];
  return result;
};

function exactRecovered(documents, vectors, threshold) {
  if (threshold === null) return 0;
  const groups = [];
  for (const doc of documents) {
    let best = -1, bestScore = threshold;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      let minimum = 1;
      for (const member of groups[groupIndex])
        minimum = Math.min(minimum, dot(vectors.get(doc.id), vectors.get(member.id)));
      if (minimum >= bestScore) { best = groupIndex; bestScore = minimum; }
    }
    if (best < 0) groups.push([doc]); else groups[best].push(doc);
  }
  const gold = new Map();
  for (const doc of documents) {
    const members = gold.get(doc.eventKey) ?? new Set();
    members.add(doc.id);
    gold.set(doc.eventKey, members);
  }
  return groups.filter(group => {
    const members = gold.get(group[0].eventKey);
    return group.length === members.size && group.every(doc => members.has(doc.id));
  }).length;
}

function score(documents, vectors, threshold) {
  if (threshold === null) return { abstained: true };
  const result = scoreRaw(documents, vectors, threshold);
  return { pairAdmission: result.pairAdmission,
    wholeTopics: result.wholeTopics,
    exactGoldTopics: exactRecovered(documents,
      new Map(documents.map(doc => [doc.id, normalize(vectors.get(doc.id))])), threshold) };
}

export function freezeWiki(train, validation, vectors) {
  const frozen = freezeOnValidation(train, validation, vectors);
  const rawVectors = new Map(validation.map(doc => [doc.id, normalize(vectors.get(doc.id))]));
  const rawThreshold = validationCutoff(validation, rawVectors);
  return { model: frozen.model, selected: frozen.selected, rawThreshold };
}

export function evaluateTransfer(documents, vectors, frozen) {
  const fixed = score(documents, vectors, 0.94);
  const raw = score(documents, vectors, frozen.rawThreshold);
  let learned = { abstained: true };
  if (frozen.selected) {
    const mapped = new Map(documents.map(doc => [doc.id,
      transform(vectors.get(doc.id), frozen.model.weights, frozen.selected.strength)]));
    const summary = scoreFrozen(documents, vectors, frozen.model, frozen.selected);
    learned = { pairAdmission: summary.pairAdmission, wholeTopics: summary.wholeTopics,
      exactGoldTopics: exactRecovered(documents, mapped, frozen.selected.threshold) };
  }
  return { fixed094: fixed, rawWikiCalibrated: raw, learnedWikiCalibrated: learned };
}
