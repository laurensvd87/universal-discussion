export const TITLE_BLEND_WEIGHTS = Object.freeze([0, 0.25, 0.5, 1]);

function normalized(values) {
  if (!Array.isArray(values) || values.length !== 384 || values.some(value => !Number.isFinite(value)))
    throw new TypeError('Invalid vector');
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm < 0.99 || norm > 1.01) throw new TypeError('Invalid vector norm');
  return values.map(value => value / norm);
}

export function blendVector(body, title, titleWeight) {
  if (!TITLE_BLEND_WEIGHTS.includes(titleWeight)) throw new TypeError('Unknown blend weight');
  const b = normalized(body), t = normalized(title);
  const mixed = b.map((value, index) => (1 - titleWeight) * value + titleWeight * t[index]);
  const norm = Math.hypot(...mixed);
  if (!Number.isFinite(norm) || norm < 1e-12) throw new TypeError('Degenerate blend');
  return mixed.map(value => value / norm);
}

export function cosine(a, b) {
  const x = normalized(a), y = normalized(b);
  return Math.max(-1, Math.min(1, x.reduce((sum, value, index) => sum + value * y[index], 0)));
}

export function comparePairVectors(a, b) {
  const scores = {};
  for (const titleWeight of TITLE_BLEND_WEIGHTS) {
    const key = titleWeight === 0 ? 'body' : titleWeight === 1 ? 'title' :
      `title-${String(titleWeight).replace('.', '_')}`;
    scores[key] = cosine(blendVector(a.body, a.title, titleWeight),
      blendVector(b.body, b.title, titleWeight));
  }
  return scores;
}
