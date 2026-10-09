// Private offline research. No weights or vectors are serialized by this module.
const DIM = 384, BLOCKS = 16, FEATURES = 1 + BLOCKS * 2, HIDDEN = 8;
const GAP = 0.002, STEPS = 80, RATE = 0.015, DECAY = 0.0005;
const pairCount = n => n * (n - 1) / 2;
const sameCategory = (a, b) => a.categories.some(value => b.categories.includes(value));
const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));

export function normalize(vector) {
  if (!vector || vector.length !== DIM || [...vector].some(value => !Number.isFinite(value)))
    throw new TypeError('VECTOR');
  const norm = Math.hypot(...vector);
  if (!(norm > 1e-9)) throw new TypeError('VECTOR');
  return Float64Array.from(vector, value => value / norm);
}

export function normalizeMap(documents, vectors) {
  return new Map(documents.map(doc => [doc.id, normalize(vectors.get(doc.id))]));
}

export function pairFeatures(a, b) {
  if (a.length !== DIM || b.length !== DIM) throw new TypeError('VECTOR');
  const features = new Float64Array(FEATURES);
  for (let k = 0; k < DIM; k++) {
    const block = Math.floor(k / (DIM / BLOCKS));
    const product = a[k] * b[k];
    features[0] += product;
    features[1 + block] += Math.abs(a[k] - b[k]) / (DIM / BLOCKS);
    features[1 + BLOCKS + block] += product / (DIM / BLOCKS);
  }
  return features;
}

function featureStats(examples) {
  const mean = new Float64Array(FEATURES), scale = new Float64Array(FEATURES);
  for (const example of examples) for (let k = 0; k < FEATURES; k++) mean[k] += example.x[k];
  for (let k = 0; k < FEATURES; k++) mean[k] /= examples.length;
  for (const example of examples) for (let k = 0; k < FEATURES; k++)
    scale[k] += (example.x[k] - mean[k]) ** 2;
  for (let k = 0; k < FEATURES; k++) scale[k] = Math.max(1e-6, Math.sqrt(scale[k] / examples.length));
  return { mean, scale };
}
const standardize = (x, stats) => Float64Array.from(x, (value, k) =>
  Math.max(-4, Math.min(4, (value - stats.mean[k]) / stats.scale[k])));

// Wiki positives are all same-pageid translation pairs. For every anchor,
// include its nearest global different event and nearest shared-category
// different event. Synthetic train adds all same-development positives and
// same-family adjacent-development negatives. No validation labels enter.
export function trainingExamples(wiki, synthetic, wikiVectors, syntheticVectors) {
  const result = [], counts = [0, 0, 0, 0];
  const add = (docs, vectors, i, j, stratum) => {
    result.push({ x: pairFeatures(vectors.get(docs[i].id), vectors.get(docs[j].id)),
      y: stratum % 2 === 0 ? 1 : 0, stratum });
    counts[stratum]++;
  };
  for (let i = 0; i < wiki.length; i++) for (let j = i + 1; j < wiki.length; j++)
    if (wiki[i].eventKey === wiki[j].eventKey) add(wiki, wikiVectors, i, j, 0);
  const negatives = new Set();
  for (let i = 0; i < wiki.length; i++) {
    let global = null, category = null;
    for (let j = 0; j < wiki.length; j++) {
      if (i === j || wiki[i].eventKey === wiki[j].eventKey) continue;
      const score = pairFeatures(wikiVectors.get(wiki[i].id), wikiVectors.get(wiki[j].id))[0];
      if (!global || score > global.score) global = { j, score };
      if (sameCategory(wiki[i], wiki[j]) && (!category || score > category.score))
        category = { j, score };
    }
    for (const match of [global, category]) if (match)
      negatives.add(`${Math.min(i, match.j)}:${Math.max(i, match.j)}`);
  }
  for (const value of negatives) {
    const [i, j] = value.split(':').map(Number);
    add(wiki, wikiVectors, i, j, 1);
  }
  for (let i = 0; i < synthetic.length; i++) for (let j = i + 1; j < synthetic.length; j++) {
    if (synthetic[i].eventKey === synthetic[j].eventKey)
      add(synthetic, syntheticVectors, i, j, 2);
    else if (sameCategory(synthetic[i], synthetic[j]))
      add(synthetic, syntheticVectors, i, j, 3);
  }
  if (counts.some(count => count < 2)) throw new TypeError('TRAIN_STRATA');
  return { examples: result, counts };
}

function initialParameters() {
  const length = HIDDEN * FEATURES + HIDDEN + HIDDEN + 1;
  const parameters = new Float64Array(length);
  let state = 0x5eeda11;
  for (let k = 0; k < HIDDEN * FEATURES; k++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    parameters[k] = ((state >>> 0) / 0xffffffff - 0.5) * 0.15;
  }
  for (let k = 0; k < HIDDEN; k++) parameters[HIDDEN * FEATURES + HIDDEN + k] = 0.01;
  return parameters;
}

function forward(x, parameters) {
  const hidden = new Float64Array(HIDDEN);
  let logit = parameters[parameters.length - 1];
  for (let h = 0; h < HIDDEN; h++) {
    let value = parameters[HIDDEN * FEATURES + h];
    for (let k = 0; k < FEATURES; k++) value += parameters[h * FEATURES + k] * x[k];
    hidden[h] = Math.tanh(value);
    logit += parameters[HIDDEN * FEATURES + HIDDEN + h] * hidden[h];
  }
  return { probability: sigmoid(logit), hidden };
}

export function fitVerifier(wiki, synthetic, wikiVectors, syntheticVectors) {
  const { examples, counts } = trainingExamples(wiki, synthetic, wikiVectors, syntheticVectors);
  const stats = featureStats(examples);
  for (const example of examples) example.x = standardize(example.x, stats);
  const parameters = initialParameters(), first = new Float64Array(parameters.length),
    second = new Float64Array(parameters.length);
  for (let step = 1; step <= STEPS; step++) {
    const gradient = new Float64Array(parameters.length);
    for (const example of examples) {
      const { probability, hidden } = forward(example.x, parameters);
      const delta = (probability - example.y) / (4 * counts[example.stratum]);
      gradient[parameters.length - 1] += delta;
      for (let h = 0; h < HIDDEN; h++) {
        const outputIndex = HIDDEN * FEATURES + HIDDEN + h;
        gradient[outputIndex] += delta * hidden[h];
        const local = delta * parameters[outputIndex] * (1 - hidden[h] ** 2);
        gradient[HIDDEN * FEATURES + h] += local;
        for (let k = 0; k < FEATURES; k++)
          gradient[h * FEATURES + k] += local * example.x[k];
      }
    }
    for (let k = 0; k < parameters.length; k++) {
      const isWeight = k < HIDDEN * FEATURES ||
        (k >= HIDDEN * FEATURES + HIDDEN && k < parameters.length - 1);
      const g = gradient[k] + (isWeight ? DECAY * parameters[k] : 0);
      first[k] = 0.9 * first[k] + 0.1 * g;
      second[k] = 0.999 * second[k] + 0.001 * g * g;
      const m = first[k] / (1 - 0.9 ** step), v = second[k] / (1 - 0.999 ** step);
      parameters[k] -= RATE * m / (Math.sqrt(v) + 1e-8);
    }
  }
  return { parameters, stats, trainCounts: counts };
}

export function verifierScore(model, a, b) {
  return forward(standardize(pairFeatures(a, b), model.stats), model.parameters).probability;
}

export function developmentCutoff(parts, vectorMaps, scorer) {
  let maximum = -Infinity;
  for (let s = 0; s < parts.length; s++) {
    const docs = parts[s], vectors = vectorMaps[s];
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++)
      if (docs[i].eventKey !== docs[j].eventKey)
        maximum = Math.max(maximum, scorer(vectors.get(docs[i].id), vectors.get(docs[j].id)));
  }
  if (!Number.isFinite(maximum)) throw new TypeError('VALIDATION_NEGATIVES');
  return maximum + GAP <= 1 ? maximum + GAP : null;
}

// Complete-link provisional grouping. This is a diagnostic, not a live rule.
export function evaluatePairs(documents, vectors, scorer, threshold) {
  const n = documents.length;
  const scores = Array.from({ length: n }, () => new Float64Array(n));
  let trueTotal = 0, falseTotal = 0, trueAdmitted = 0, falseAdmitted = 0;
  let hardFalseTotal = 0, hardFalseAdmitted = 0;
  let crossLanguageTrueTotal = 0, crossLanguageTrueAdmitted = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = documents[i], b = documents[j];
    const score = scorer(vectors.get(a.id), vectors.get(b.id));
    scores[i][j] = scores[j][i] = score;
    const same = a.eventKey === b.eventKey, admitted = threshold !== null && score >= threshold;
    if (same) {
      trueTotal++; if (admitted) trueAdmitted++;
      if (a.lang !== b.lang) {
        crossLanguageTrueTotal++; if (admitted) crossLanguageTrueAdmitted++;
      }
    } else {
      falseTotal++; if (admitted) falseAdmitted++;
      if (sameCategory(a, b)) {
        hardFalseTotal++; if (admitted) hardFalseAdmitted++;
      }
    }
  }
  const groups = [];
  for (let i = 0; i < n; i++) {
    let best = -1, bestScore = threshold ?? Infinity;
    for (let g = 0; g < groups.length; g++) {
      let minimum = 1;
      for (const j of groups[g]) minimum = Math.min(minimum, scores[i][j]);
      if (minimum >= bestScore) { best = g; bestScore = minimum; }
    }
    if (best < 0) groups.push([i]); else groups[best].push(i);
  }
  let joinedTrue = 0, joinedFalse = 0, completeEvents = 0, mixedGroups = 0;
  const goldSizes = new Map();
  for (const doc of documents) goldSizes.set(doc.eventKey, (goldSizes.get(doc.eventKey) ?? 0) + 1);
  for (const group of groups) {
    const labels = new Map();
    for (const i of group) labels.set(documents[i].eventKey,
      (labels.get(documents[i].eventKey) ?? 0) + 1);
    const truePairs = [...labels.values()].reduce((sum, value) => sum + pairCount(value), 0);
    joinedTrue += truePairs; joinedFalse += pairCount(group.length) - truePairs;
    if (labels.size > 1) mixedGroups++;
    if (labels.size === 1) {
      const [label, count] = labels.entries().next().value;
      if (count === goldSizes.get(label)) completeEvents++;
    }
  }
  return { threshold, abstained: threshold === null,
    pair: { trueAdmitted, trueTotal, falseAdmitted, falseTotal,
      precision: trueAdmitted + falseAdmitted ? trueAdmitted / (trueAdmitted + falseAdmitted) : null,
      recall: trueTotal ? trueAdmitted / trueTotal : null, hardFalseAdmitted, hardFalseTotal,
      crossLanguageTrueAdmitted, crossLanguageTrueTotal },
    topics: { groups: groups.length, mixedGroups, joinedTrue, joinedFalse,
      completeEvents, goldEvents: goldSizes.size } };
}

export const cosineScore = (a, b) => pairFeatures(a, b)[0];
