// Explicit pilot candidate parameters, chosen independently of the labels.
// Some pilot cosine scores were known before this design. These are retrieval
// probes, never calibrated probabilities or join rules.
export const SHADOW_POLICY = Object.freeze({
  version: 'r5-nonllm-candidate-shadow/v1',
  vectorFloor: 0.90,
  lexicalJaccard: 0.5,
  minimumSharedTokens: 2,
  nearbyHours: 72,
  neighborsPerSource: 3,
});

const STOP = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into',
  'is', 'of', 'on', 'or', 'the', 'to', 'with']);

export function titleTokens(title) {
  if (typeof title !== 'string' || title.length > 200) throw new TypeError('Invalid title');
  return new Set((title.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(token => token.length > 1 && !STOP.has(token)));
}

export function publicationInterval(value, precision) {
  if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const start = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== value)
      throw new TypeError('Invalid publication date');
    return [start, start + 86_400_000];
  }
  if (precision === 'instant' && typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) {
    const instant = Date.parse(value);
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 19) !==
        value.slice(0, 19)) throw new TypeError('Invalid publication instant');
    return [instant, instant];
  }
  throw new TypeError('Invalid publication precision');
}

export function pairDiagnostics(a, b, policy = SHADOW_POLICY) {
  for (const source of [a, b]) {
    if (!Array.isArray(source.vector) || source.vector.length !== 384 ||
        source.vector.some(value => !Number.isFinite(value)) ||
        Math.abs(Math.hypot(...source.vector) - 1) > 0.01)
      throw new TypeError('Invalid vector');
  }
  const cosine = Math.max(-1, Math.min(1, a.vector.reduce((sum, x, i) => sum + x * b.vector[i], 0) /
    (Math.hypot(...a.vector) * Math.hypot(...b.vector))));
  const ta = titleTokens(a.title), tb = titleTokens(b.title);
  const sharedTokens = [...ta].filter(token => tb.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union ? sharedTokens / union : 0;
  const [as, ae] = publicationInterval(a.publicationValue, a.publicationPrecision);
  const [bs, be] = publicationInterval(b.publicationValue, b.publicationPrecision);
  const minimumLagHours = Math.max(0, as - be, bs - ae) / 3_600_000;
  const maximumLagHours = Math.max(Math.abs(as - be), Math.abs(ae - bs)) / 3_600_000;
  const timeBand = maximumLagHours <= policy.nearbyHours ? 'within-72h' :
    minimumLagHours > policy.nearbyHours ? 'beyond-72h' : 'ambiguous-72h';
  const vectorCandidate = cosine + 1e-12 >= policy.vectorFloor;
  const lexicalCandidate = sharedTokens >= policy.minimumSharedTokens &&
    jaccard + 1e-12 >= policy.lexicalJaccard;
  return { cosine, titleTokenA: ta.size, titleTokenB: tb.size, sharedTokens,
    jaccard, minimumLagHours, maximumLagHours, timeBand, vectorCandidate,
    lexicalCandidate, shadowCandidate: vectorCandidate || lexicalCandidate };
}

// Retrieval only: each Source nominates its K closest vector neighbors. The
// union is undirected, deterministic under equal scores, and makes no Topic
// or Discussion identity assertion.
export function topKVectorPairs(sources, k = SHADOW_POLICY.neighborsPerSource) {
  if (!Array.isArray(sources) || sources.length < 2 || sources.length > 24 ||
      !Number.isInteger(k) || k < 1 || k >= sources.length) throw new TypeError('Invalid top-K input');
  const ids = new Set();
  for (const source of sources) {
    if (typeof source?.id !== 'string' || !/^source-[0-9]{3}$/u.test(source.id) ||
        ids.has(source.id) || !Array.isArray(source.vector) || source.vector.length !== 384 ||
        source.vector.some(value => !Number.isFinite(value)) ||
        Math.abs(Math.hypot(...source.vector) - 1) > 0.01)
      throw new TypeError('Invalid top-K Source');
    ids.add(source.id);
  }
  const ordered = [...sources].sort((a, b) => a.id.localeCompare(b.id));
  const nominated = new Map();
  for (const source of ordered) {
    const others = ordered.filter(other => other.id !== source.id).map(other => ({
      id: other.id,
      cosine: source.vector.reduce((sum, value, index) => sum + value * other.vector[index], 0) /
        (Math.hypot(...source.vector) * Math.hypot(...other.vector)),
    }));
    others.sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
    for (const [index, other] of others.slice(0, k).entries()) {
      const pairKey = [source.id, other.id].sort().join(':');
      const previous = nominated.get(pairKey);
      nominated.set(pairKey, { pairKey, bestRank: Math.min(previous?.bestRank ?? Infinity, index + 1),
        nominations: (previous?.nominations ?? 0) + 1 });
    }
  }
  return [...nominated.values()].sort((a, b) => a.pairKey.localeCompare(b.pairKey));
}
