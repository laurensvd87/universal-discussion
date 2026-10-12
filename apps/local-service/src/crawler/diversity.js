import { createHash } from "node:crypto";

function tokens(text) {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 2_000) ?? [];
}

export function simhash64(text) {
  if (typeof text !== "string" || !text) throw new TypeError("Invalid fingerprint text");
  const weights = new Int32Array(64);
  for (const token of tokens(text)) {
    const bytes = createHash("sha256").update(token).digest();
    const bits = bytes.readBigUInt64BE(0);
    for (let bit = 0; bit < 64; bit++) weights[bit] += bits & 1n << BigInt(bit) ? 1 : -1;
  }
  let value = 0n;
  for (let bit = 0; bit < 64; bit++) if (weights[bit] >= 0) value |= 1n << BigInt(bit);
  return value.toString(16).padStart(16, "0");
}

export function representationDigest({ url, title, vector, extractorVersion }) {
  if (typeof url !== "string" || typeof title !== "string" || typeof extractorVersion !== "string" ||
      !Array.isArray(vector) || Object.getPrototypeOf(vector) !== Array.prototype || vector.length !== 384 ||
      Reflect.ownKeys(vector).length !== 385 || vector.some(value => !Number.isFinite(value)))
    throw new TypeError("Invalid crawler representation");
  return createHash("sha256").update(JSON.stringify([url, title, extractorVersion, vector])).digest("hex");
}

function cosine(a, b) {
  let sum = 0;
  for (let index = 0; index < 384; index++) sum += a[index] * b[index];
  return Math.max(-1, Math.min(1, sum));
}

export function selectDiverseCandidates(candidates, { limit, bucketLimits, perHost, perSection, prior = [],
  priorCounts = null, noveltyPriorLimit = prior.length }) {
  if (!Array.isArray(candidates) || !Array.isArray(prior) || !Number.isInteger(limit) || limit < 0 || limit > 50_000 ||
      !(bucketLimits instanceof Map) || !Number.isInteger(perHost) || perHost < 0 || !Number.isInteger(perSection) || perSection < 0 ||
      !Number.isInteger(noveltyPriorLimit) || noveltyPriorLimit < 0 || noveltyPriorLimit > prior.length)
    throw new TypeError("Invalid diversity selection");
  for (const [key, value] of bucketLimits) if (typeof key !== "string" || !key || !Number.isInteger(value) || value < 0 || value > 50_000)
    throw new TypeError("Invalid diversity selection");
  const denseVector = vector => Array.isArray(vector) && Object.getPrototypeOf(vector) === Array.prototype &&
    vector.length === 384 && Reflect.ownKeys(vector).length === 385 && vector.every(Number.isFinite);
  const remaining = candidates.map(item => {
    if (!item || typeof item.urlDigest !== "string" || !/^[a-f0-9]{64}$/u.test(item.urlDigest) ||
        typeof item.bucket !== "string" || !item.bucket || typeof item.host !== "string" || !item.host ||
        typeof item.section !== "string" || !item.section || !denseVector(item.vector))
      throw new TypeError("Invalid diversity candidate");
    return { item, nearest: -1 };
  });
  const chosen = [];
  if (prior.some(item => !item || !denseVector(item.vector))) throw new TypeError("Invalid diversity candidate");
  const noveltyPrior = prior.slice(0, noveltyPriorLimit);
  if (noveltyPrior.length) for (const candidate of remaining) for (const item of noveltyPrior)
    candidate.nearest = Math.max(candidate.nearest, cosine(candidate.item.vector, item.vector));
  const count = (map, key) => map.get(key) ?? 0;
  if (priorCounts !== null && (!priorCounts || [priorCounts.bucket, priorCounts.host, priorCounts.section].some(map =>
    !(map instanceof Map) || [...map].some(([key, value]) => typeof key !== "string" || !key || !Number.isSafeInteger(value) || value < 0))))
    throw new TypeError("Invalid diversity counts");
  const bucketCount = new Map(priorCounts?.bucket), hostCount = new Map(priorCounts?.host), sectionCount = new Map(priorCounts?.section);
  if (priorCounts === null) for (const item of prior) {
    if (typeof item.bucket === "string" && item.bucket) bucketCount.set(item.bucket, count(bucketCount, item.bucket) + 1);
    if (typeof item.host === "string" && item.host) hostCount.set(item.host, count(hostCount, item.host) + 1);
    if (typeof item.section === "string" && item.section) sectionCount.set(item.section, count(sectionCount, item.section) + 1);
  }
  while (chosen.length < limit && remaining.length) {
    let bestIndex = -1, bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index], item = candidate.item, bucketLimit = bucketLimits.get(item.bucket);
      if (bucketLimit === undefined || bucketLimit !== 0 && count(bucketCount, item.bucket) >= bucketLimit ||
          perHost !== 0 && count(hostCount, item.host) >= perHost ||
          perSection !== 0 && count(sectionCount, item.section) >= perSection) continue;
      const novelty = candidate.nearest >= -1 && (noveltyPrior.length || chosen.length) ? (1 - candidate.nearest) / 2 : 1;
      const bucketDeficit = bucketLimit === 0 ? 1 / (1 + count(bucketCount, item.bucket)) : 1 - count(bucketCount, item.bucket) / bucketLimit;
      const hostDeficit = perHost === 0 ? 1 / (1 + count(hostCount, item.host)) : 1 - count(hostCount, item.host) / perHost;
      const sectionDeficit = perSection === 0 ? 1 / (1 + count(sectionCount, item.section)) : 1 - count(sectionCount, item.section) / perSection;
      const score = novelty * 0.65 + bucketDeficit * 0.2 + hostDeficit * 0.1 + sectionDeficit * 0.05;
      if (score > bestScore || score === bestScore && item.urlDigest < remaining[bestIndex]?.item.urlDigest) {
        bestIndex = index; bestScore = score;
      }
    }
    if (bestIndex < 0) break;
    const [{ item }] = remaining.splice(bestIndex, 1);
    chosen.push(item);
    bucketCount.set(item.bucket, count(bucketCount, item.bucket) + 1);
    hostCount.set(item.host, count(hostCount, item.host) + 1);
    sectionCount.set(item.section, count(sectionCount, item.section) + 1);
    for (const candidate of remaining) candidate.nearest = Math.max(candidate.nearest, cosine(candidate.item.vector, item.vector));
  }
  return Object.freeze(chosen);
}
