// Offline-only diagonal adapter. Parameters and vectors remain in memory.
import { normalizeVectors, transform, tripletObjective } from '../real-diagonal-adapter-v1/core.js';

const DIM = 384;
const STEPS = 40;
const RATE = 0.01;
const BOUND = 0.5;
const REGULARIZATION = 0.001;

const dot = (a, b) => {
  let sum = 0;
  for (let k = 0; k < DIM; k++) sum += a[k] * b[k];
  return sum;
};

const ranked = (items, ascending) => items.sort((a, b) =>
  (ascending ? a.score - b.score : b.score - a.score) ||
  a.id.localeCompare(b.id));

// The complete A-only batch supplies three kinds of comparisons per anchor:
// distant cross-language positives, difficult same-family negatives, and an
// outside-family negative. No B/C label is read to choose these comparisons.
export function mineComparisons(rows, vectors) {
  if (!Array.isArray(rows) || rows.length !== 108 || !(vectors instanceof Map))
    throw new TypeError('FIT_INPUT');
  const comparisons = [];
  for (const anchor of rows) {
    const cross = [], sameLanguage = [], nearFamily = [], otherFamily = [];
    const source = vectors.get(anchor.id);
    if (!source || source.length !== DIM) throw new TypeError('FIT_VECTOR');
    for (const candidate of rows) {
      if (candidate.id === anchor.id) continue;
      const target = vectors.get(candidate.id);
      if (!target || target.length !== DIM) throw new TypeError('FIT_VECTOR');
      const score = dot(source, target);
      if (!Number.isFinite(score)) throw new TypeError('FIT_NUMERIC');
      const item = { id: candidate.id, score };
      if (candidate.eventKey === anchor.eventKey)
        (candidate.lang === anchor.lang ? sameLanguage : cross).push(item);
      else if (candidate.family === anchor.family) nearFamily.push(item);
      else otherFamily.push(item);
    }
    const positives = ranked(cross, true).slice(0, 2);
    const fallback = ranked(sameLanguage, true)[0];
    if (positives.length < 2 && fallback) positives.push(fallback);
    const negatives = [
      ...ranked(nearFamily, false).slice(0, 2),
      ...ranked(otherFamily, false).slice(0, 1),
    ];
    if (positives.length < 2 || negatives.length !== 3)
      throw new TypeError('FIT_LABEL_COVERAGE');
    for (const positive of positives) for (const negative of negatives)
      comparisons.push({ anchor: anchor.id, positive: positive.id,
        negative: negative.id });
  }
  return comparisons;
}

export function fitMultiDiagonal(rows, vectors) {
  const base = normalizeVectors(rows, vectors);
  const parameters = new Float64Array(DIM);
  const first = new Float64Array(DIM), second = new Float64Array(DIM);
  let comparisons, remineRounds = 0;
  for (let step = 1; step <= STEPS; step++) {
    const adapted = transform(rows, base, parameters);
    if (step === 1 || (step - 1) % 5 === 0) {
      comparisons = mineComparisons(rows, adapted);
      remineRounds++;
    }
    const gradient = new Float64Array(DIM);
    for (const item of comparisons) {
      const result = tripletObjective(adapted.get(item.anchor),
        adapted.get(item.positive), adapted.get(item.negative));
      for (let k = 0; k < DIM; k++)
        gradient[k] += result.gradient[k] / comparisons.length;
    }
    for (let k = 0; k < DIM; k++)
      gradient[k] += REGULARIZATION * parameters[k];
    const norm = Math.hypot(...gradient);
    if (!Number.isFinite(norm)) throw new TypeError('FIT_NUMERIC');
    const scale = norm > 1 ? 1 / norm : 1;
    for (let k = 0; k < DIM; k++) {
      const g = gradient[k] * scale;
      first[k] = 0.9 * first[k] + 0.1 * g;
      second[k] = 0.999 * second[k] + 0.001 * g * g;
      const m = first[k] / (1 - 0.9 ** step);
      const v = second[k] / (1 - 0.999 ** step);
      parameters[k] = Math.max(-BOUND, Math.min(BOUND,
        parameters[k] - RATE * m / (Math.sqrt(v) + 1e-8)));
    }
  }
  return { parameters, steps: STEPS, comparisonsPerRound: comparisons.length,
    remineRounds };
}
