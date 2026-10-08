import { currentMatcher, evaluateMatcher, makeSources } from '../topic-benchmark/benchmark.js';
import { COSINE_FLOOR, facet, focusDocument, pairEvidence,
  partitionByEvidence, trainIdf, trainZeroFalseCutoff } from './core.js';

const summary = result => ({ score: result.score, vectorAudit: result.vectorAudit,
  order: result.order, medianMatchingMs: result.timingMs.median });

export function focusInputs(splits) {
  return [...splits.train, ...splits.validation].map(focusDocument);
}

export async function compareTrainValidation(splits, bodyVectors, focusVectors) {
  const trainFacets = new Map(splits.train.map(row => [row.id, facet(row)]));
  const validationFacets = new Map(splits.validation.map(row => [row.id, facet(row)]));
  const idf = trainIdf(trainFacets);
  const trainEvidence = pairEvidence(makeSources(splits.train, focusVectors),
    focusVectors, trainFacets, idf, bodyVectors);
  const selected = trainZeroFalseCutoff(splits.train, trainEvidence);
  const output = { input: { leadCharacters: 384, focusCosineFloor: COSINE_FLOOR,
    lexicalCutoffFromTrainOnly: selected }, splits: {} };
  for (const [name, docs] of Object.entries(splits)) {
    const facets = name === 'train' ? trainFacets : validationFacets;
    const evidence = name === 'train' ? trainEvidence : pairEvidence(
      makeSources(docs, focusVectors), focusVectors, facets, idf, bodyVectors);
    const plain = predicate => sources => partitionByEvidence(sources, evidence, predicate);
    const methods = {
      bodyCurrentPlanner: [bodyVectors, currentMatcher],
      focusCurrentPlanner: [focusVectors, currentMatcher],
      focusCompleteLink90: [focusVectors, plain(pair => pair.focus >= COSINE_FLOOR)],
      focusTrainFacetGate: [focusVectors, plain(pair => pair.focus >= COSINE_FLOOR &&
        !pair.conflict && pair.overlap >= selected.cutoff)],
      bodyAndFocusTrainFacetGate: [focusVectors, plain(pair => pair.body >= COSINE_FLOOR &&
        pair.focus >= COSINE_FLOOR && !pair.conflict && pair.overlap >= selected.cutoff)],
    };
    output.splits[name] = {};
    for (const [method, [vectors, matcher]] of Object.entries(methods))
      output.splits[name][method] = summary(await evaluateMatcher(docs, vectors, matcher));
  }
  return output;
}
