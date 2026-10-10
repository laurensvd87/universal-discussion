import { performance } from 'node:perf_hooks';
import { applyDiagonalAdapter, readDiagonalAdapter } from './diagonal-adapter.js';
import { fail } from './errors.js';

// A read-only experimental partition. These constants are admission gates,
// not calibrated probabilities or claims that two pages have the same Topic.
export const ALTERNATE_TOPIC_POLICY = Object.freeze({
  version: 'alternate-local-neighborhood/v1',
  seedSimilarity: 0.94,
  supportedSimilarity: 0.94,
  weakestCrossSimilarity: 0.90,
  crowdedNeighborCount: 3,
  maxPairComparisons: 1_000_000,
  maxScoreLookups: 10_000_000,
  workBudgetMs: 10_000,
});

const LEARNED = 'owner-local-page-embedding/v1';
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1']);
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid alternate Topic planner input'); };

function validVector(source) {
  const values = source.embedding?.values;
  return source.embedding?.modelId === MODEL && EXTRACTORS.has(source.extractorVersion) &&
    Array.isArray(values) && values.length === 384 &&
    values.every(value => typeof value === 'number' && Number.isFinite(value)) &&
    Math.abs(Math.hypot(...values) - 1) <= 1e-5;
}

const dot = (a, b) => Math.max(-1, Math.min(1,
  a.reduce((sum, value, index) => sum + value * b[index], 0)));

// All provisional learned Sources must appear exactly once. Manually pinned
// Sources are absent: the projection keeps their canonical Topic and posts.
// The caller may supply a validated owner-local adapter, but this module never
// reads the private fit corpus, a filename, or a mutable repository.
export function planAlternateTopics({ sources, sourceLinks, adapter = null }) {
  if (!Array.isArray(sources) || !Array.isArray(sourceLinks)) invalid();
  const checkedAdapter = adapter === null ? null : readDiagonalAdapter(adapter);
  const all = new Map();
  for (const source of sources) {
    if (!source || typeof source.id !== 'string' || !ID.test(source.id) || all.has(source.id)) invalid();
    all.set(source.id, source);
  }
  const linked = new Map();
  for (const link of sourceLinks) {
    if (!link || typeof link.sourceId !== 'string' || !ID.test(link.sourceId) ||
        !all.has(link.sourceId) || linked.has(link.sourceId) ||
        typeof link.method !== 'string' || !link.method ||
        all.get(link.sourceId).provenance === LEARNED &&
          !['learned-provisional', 'manual-confirmed'].includes(link.method)) invalid();
    linked.set(link.sourceId, link);
  }
  for (const source of all.values()) if (source.provenance === LEARNED && !linked.has(source.id)) invalid();
  const eligible = [...all.values()].filter(source => source.provenance === LEARNED &&
    linked.get(source.id)?.method === 'learned-provisional').sort((a, b) => compare(a.id, b.id));
  for (const source of eligible) if (!validVector(source)) invalid();
  const n = eligible.length;
  const pairCount = n * (n - 1) / 2;
  if (pairCount > ALTERNATE_TOPIC_POLICY.maxPairComparisons) {
    fail('capacity', 'Matching work budget reached');
  }
  const deadline = performance.now() + ALTERNATE_TOPIC_POLICY.workBudgetMs;
  let lookups = 0;
  const checkWork = () => {
    if (++lookups > ALTERNATE_TOPIC_POLICY.maxScoreLookups ||
        (lookups & 4095) === 0 && performance.now() > deadline) {
      fail('capacity', 'Matching work budget reached');
    }
  };
  const vectors = eligible.map(source => checkedAdapter ?
    applyDiagonalAdapter(source.embedding.values, checkedAdapter) : source.embedding.values);
  const scores = Array.from({ length: n }, () => new Float64Array(n));
  const degrees = new Uint32Array(n);
  const best = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    scores[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      checkWork();
      const score = dot(vectors[i], vectors[j]);
      scores[i][j] = score; scores[j][i] = score;
      if (score >= ALTERNATE_TOPIC_POLICY.seedSimilarity) {
        degrees[i]++; degrees[j]++;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      checkWork();
      if (best[i] < 0 || scores[i][j] > scores[i][best[i]] ||
          scores[i][j] === scores[i][best[i]] && compare(eligible[j].id, eligible[best[i]].id) < 0) best[i] = j;
    }
  }
  const commonWitness = (i, j) => {
    for (let k = 0; k < n; k++) {
      checkWork();
      if (k !== i && k !== j && scores[i][k] >= ALTERNATE_TOPIC_POLICY.supportedSimilarity &&
          scores[j][k] >= ALTERNATE_TOPIC_POLICY.supportedSimilarity) return true;
    }
    return false;
  };
  const seedPairs = [];
  for (let i = 0; i < n; i++) {
    const j = best[i];
    if (j <= i || best[j] !== i || scores[i][j] < ALTERNATE_TOPIC_POLICY.seedSimilarity) continue;
    // A crowded neighborhood needs a second page supporting the same local
    // area. Sparse pairs do not need a fixed lead over unrelated competitors.
    if (Math.max(degrees[i], degrees[j]) >= ALTERNATE_TOPIC_POLICY.crowdedNeighborCount &&
        !commonWitness(i, j)) continue;
    seedPairs.push({ i, j, score: scores[i][j] });
  }
  seedPairs.sort((a, b) => b.score - a.score || compare(eligible[a.i].id, eligible[b.i].id));
  const groups = Array.from({ length: n }, (_, i) => [i]);
  for (const pair of seedPairs) {
    const a = groups.findIndex(group => group.length === 1 && group[0] === pair.i);
    const b = groups.findIndex(group => group.length === 1 && group[0] === pair.j);
    if (a < 0 || b < 0) continue;
    groups[a] = [pair.i, pair.j]; groups.splice(b, 1);
  }
  let supportedJoins = 0;
  function crossSupport(a, b) {
    const left = a.length <= b.length ? a : b;
    const right = left === a ? b : a;
    if (left.length === 1 && right.length === 1) return null;
    let minimum = Infinity, total = 0;
    for (const i of left) {
      let high = 0;
      for (const j of right) {
        checkWork();
        const score = scores[i][j];
        minimum = Math.min(minimum, score); total += score;
        if (score >= ALTERNATE_TOPIC_POLICY.supportedSimilarity) high++;
      }
      if (high < Math.min(2, right.length)) return null;
    }
    if (minimum < ALTERNATE_TOPIC_POLICY.weakestCrossSimilarity) return null;
    if (left.length > 1) for (const j of right) {
      let high = 0;
      for (const i of left) { checkWork(); if (scores[i][j] >= ALTERNATE_TOPIC_POLICY.supportedSimilarity) high++; }
      if (high < Math.min(2, left.length)) return null;
    }
    return total / (a.length * b.length);
  }
  for (;;) {
    let selected = null;
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      checkWork();
      const score = crossSupport(groups[a], groups[b]);
      if (score === null) continue;
      const key = [...groups[a], ...groups[b]].map(index => eligible[index].id).sort(compare).join('\0');
      if (!selected || score > selected.score || score === selected.score && compare(key, selected.key) < 0) {
        selected = { a, b, score, key };
      }
    }
    if (!selected) break;
    groups[selected.a] = [...groups[selected.a], ...groups[selected.b]].sort((a, b) => a - b);
    groups.splice(selected.b, 1);
    supportedJoins++;
  }
  const partitions = groups.map(group => ({ sourceIds: group.map(index => eligible[index].id) }))
    .sort((a, b) => compare(a.sourceIds[0], b.sourceIds[0]));
  return {
    policyVersion: ALTERNATE_TOPIC_POLICY.version,
    partitions,
    diagnostics: {
      representation: checkedAdapter ? 'owner-local-diagonal-adapter/v1' : 'raw-e5-baseline',
      sources: n, comparedPairs: pairCount, acceptedSeeds: seedPairs.length, supportedJoins,
    },
  };
}
