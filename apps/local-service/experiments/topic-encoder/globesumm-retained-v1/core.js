// Private offline experiment. Gold labels are read only by assess/selectRule.
// Inference uses the retained body-E5 vector and title alone.
const TOKENS = text => new Set(text.normalize('NFKC').toLocaleLowerCase()
  .match(/(?:[\p{L}]{2,}|[\p{N}]+)/gu) ?? []);
export const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

export function titleLexicon(train) {
  const count = new Map();
  for (const row of train) for (const token of TOKENS(row.title))
    count.set(token, (count.get(token) ?? 0) + 1);
  return { count, total: train.length };
}

export function makeEvidence(rows, rawVectors, lexicon) {
  if (!Array.isArray(rows) || !rows.length || !lexicon?.total) throw new TypeError('Invalid rows');
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const titles = sorted.map(row => TOKENS(row.title));
  const normed = sorted.map(row => {
    const vector = rawVectors.get(row.id);
    if (!vector || vector.length !== 384) throw new TypeError('Missing E5 vector');
    const norm = Math.hypot(...vector);
    if (!Number.isFinite(norm) || norm < 1e-9) throw new TypeError('Invalid E5 vector');
    return Float64Array.from(vector, value => value / norm);
  });
  const n = sorted.length;
  const similarity = Array.from({ length: n }, () => new Float32Array(n));
  const titleSimilarity = Array.from({ length: n }, () => new Float32Array(n));
  const numberConflict = Array.from({ length: n }, () => new Uint8Array(n));
  const weight = token => Math.log((lexicon.total + 1) / ((lexicon.count.get(token) ?? 0) + 1));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    similarity[i][j] = similarity[j][i] = dot(normed[i], normed[j]);
    const all = new Set([...titles[i], ...titles[j]]);
    let common = 0, union = 0;
    for (const token of all) {
      const w = weight(token);
      union += w;
      if (titles[i].has(token) && titles[j].has(token)) common += w;
    }
    titleSimilarity[i][j] = titleSimilarity[j][i] = union ? common / union : 0;
    const numsI = [...titles[i]].filter(token => /^\d+$/u.test(token));
    const numsJ = [...titles[j]].filter(token => /^\d+$/u.test(token));
    if (numsI.length && numsJ.length && !numsI.some(token => numsJ.includes(token)))
      numberConflict[i][j] = numberConflict[j][i] = 1;
  }
  const bits = Array.from({ length: n }, () => new Uint32Array(Math.ceil(n / 32)));
  const degree = new Uint16Array(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (similarity[i][j] >= 0.80) {
    bits[i][j >>> 5] |= 1 << (j & 31);
    bits[j][i >>> 5] |= 1 << (i & 31);
    degree[i]++; degree[j]++;
  }
  const pop = value => {
    value -= (value >>> 1) & 0x55555555;
    value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
    return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  };
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let common = 0;
    for (let b = 0; b < bits[i].length; b++) common += pop(bits[i][b] & bits[j][b]);
    pairs.push({ i, j, cosine: similarity[i][j], title: titleSimilarity[i][j],
      conflict: numberConflict[i][j], support: degree[i] + degree[j] - common
        ? common / (degree[i] + degree[j] - common) : 0 });
  }
  return { rows: sorted, pairs, n };
}

export function score(pair, rule) {
  return pair.cosine + rule.titleWeight * pair.title + rule.supportWeight * pair.support -
    0.08 * pair.conflict;
}

export function group(evidence, rule) {
  const { rows, pairs, n } = evidence;
  const values = Array.from({ length: n }, () => new Float32Array(n));
  const cosines = Array.from({ length: n }, () => new Float32Array(n));
  const all = pairs.map(pair => {
    const value = score(pair, rule);
    values[pair.i][pair.j] = values[pair.j][pair.i] = value;
    cosines[pair.i][pair.j] = cosines[pair.j][pair.i] = pair.cosine;
    return { ...pair, value };
  });
  const strong = rule.cutoff;
  const floor = strong - 0.05;
  const edges = all.filter(pair => pair.value >= floor && pair.cosine >= 0.75)
    .sort((a, b) => b.value - a.value || a.i - b.i || a.j - b.j);
  const groups = Array.from({ length: n }, (_, i) => [i]);
  const owner = Int32Array.from({ length: n }, (_, i) => i);
  const neighbors = Array.from({ length: n }, () => []);
  for (const pair of edges) {
    neighbors[pair.i].push(pair.j);
    neighbors[pair.j].push(pair.i);
  }
  // Seed only from a supported triangle, or a train-negative-safe strong pair.
  const seed = [];
  for (const edge of edges) {
    if (edge.value >= rule.strongPair) seed.push({ ids: [edge.i, edge.j], value: edge.value });
    else if (edge.value >= strong) {
      const k = neighbors[edge.i].find(other => other !== edge.j &&
        values[edge.i][other] >= floor && values[edge.j][other] >= floor &&
        cosines[edge.i][other] >= 0.75 && cosines[edge.j][other] >= 0.75);
      if (k !== undefined) seed.push({ ids: [edge.i, edge.j, k], value: edge.value });
    }
  }
  seed.sort((a, b) => b.value - a.value || a.ids.join(',').localeCompare(b.ids.join(',')));
  for (const candidate of seed) if (candidate.ids.every(i => groups[owner[i]].length === 1)) {
    const ids = [...new Set(candidate.ids)];
    const target = owner[ids[0]];
    groups[target] = ids;
    for (const i of ids.slice(1)) { groups[owner[i]] = []; owner[i] = target; }
  }
  // Expansion uses direct cross-group evidence and has no Topic member cap.
  for (const edge of edges) {
    const a = owner[edge.i], b = owner[edge.j];
    if (a === b || groups[a].length === 1 && groups[b].length === 1) continue;
    if (edge.value < strong) continue;
    const left = groups[a], right = groups[b];
    if (!left.every(i => right.some(j => values[i][j] >= strong)) ||
        !right.every(j => left.some(i => values[i][j] >= strong))) continue;
    if (!left.every(i => right.every(j => values[i][j] >= floor))) continue;
    groups[a] = [...left, ...right];
    groups[b] = [];
    for (const i of right) owner[i] = a;
  }
  return groups.filter(ids => ids.length).map(ids => ids.map(i => rows[i].id).sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export function assess(evidence, groups, rule) {
  const { rows, pairs } = evidence;
  const groupOf = new Map(groups.flatMap((ids, g) => ids.map(id => [id, g])));
  let pairTp = 0, pairFp = 0, pairHardFp = 0, tp = 0, fp = 0, hardFp = 0;
  let truePairs = 0, falsePairs = 0, hardPairs = 0;
  for (const pair of pairs) {
    const a = rows[pair.i], b = rows[pair.j];
    const same = a.eventKey === b.eventKey;
    const hard = !same && a.category === b.category;
    if (same) truePairs++; else { falsePairs++; if (hard) hardPairs++; }
    if (score(pair, rule) >= rule.cutoff && pair.cosine >= 0.75) {
      if (same) pairTp++; else { pairFp++; if (hard) pairHardFp++; }
    }
    if (groupOf.get(a.id) === groupOf.get(b.id)) {
      if (same) tp++; else { fp++; if (hard) hardFp++; }
    }
  }
  const gold = new Map();
  for (const row of rows) {
    const ids = gold.get(row.eventKey) ?? new Set();
    ids.add(row.id);
    gold.set(row.eventKey, ids);
  }
  const exact = groups.filter(ids => ids.length === gold.get(rows.find(r => r.id === ids[0]).eventKey).size &&
    ids.every(id => gold.get(rows.find(r => r.id === ids[0]).eventKey).has(id))).length;
  const falseMixedGroups = groups.filter(ids => new Set(ids.map(id => rows.find(r => r.id === id).eventKey)).size > 1).length;
  return { pairTp, pairFp, pairHardFp, tp, fp, hardFp, truePairs, falsePairs, hardPairs,
    falseMixedGroups, exactEvents: exact, goldEvents: gold.size, groups: groups.length };
}

export function selectRule(evidence) {
  const rules = [];
  for (const titleWeight of [0.04, 0.08]) for (const supportWeight of [0.04, 0.08]) {
    const base = { titleWeight, supportWeight };
    const negatives = evidence.pairs.filter(pair =>
      evidence.rows[pair.i].eventKey !== evidence.rows[pair.j].eventKey)
      .map(pair => score(pair, base)).sort((a, b) => b - a);
    const max = negatives[0];
    const cutoffs = [max + 0.003, max - 0.02, max - 0.04];
    for (const cutoff of cutoffs) rules.push({ ...base, cutoff, strongPair: max + 0.003 });
  }
  const scored = rules.map(rule => ({ rule, result: assess(evidence, group(evidence, rule), rule) }));
  const safe = scored.filter(item => item.result.fp === 0 && item.result.falseMixedGroups === 0)
    .sort((a, b) => b.result.tp - a.result.tp || b.rule.cutoff - a.rule.cutoff);
  return { selected: safe[0] ?? null, tried: scored.length,
    bestUnsafe: scored.filter(item => item.result.fp > 0).sort((a, b) => b.result.tp - a.result.tp)[0] ?? null };
}
