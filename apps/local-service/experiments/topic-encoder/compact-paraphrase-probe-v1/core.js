// Research-only cosine admission. Event/language labels enter calibration and
// reporting, never group construction. No fixed count of neighbors or members.
export function pairs(rows, vectors) {
  if (!Array.isArray(rows) || rows.length < 2 || !(vectors instanceof Map) ||
      new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('PAIR_INPUT');
  const values = [];
  const normalized = rows.map(row => {
    const vector = vectors.get(row.id);
    if (!vector || vector.length !== 384 || ![...vector].every(Number.isFinite) ||
        typeof row.eventKey !== 'string' || !row.eventKey) throw new TypeError('PAIR_VECTOR');
    const norm = Math.hypot(...vector);
    if (!(norm > 0)) throw new TypeError('PAIR_ZERO');
    return [...vector].map(value => value / norm);
  });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const score = normalized[i].reduce((sum, value, index) => sum + value * normalized[j][index], 0);
    values.push({ i, j, score: Math.max(-1, Math.min(1, score)), positive: rows[i].eventKey === rows[j].eventKey });
  }
  return values.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
}

export function calibrate(values) {
  let correct = 0, wrong = 0, selected = 1.000001, best = 0;
  for (let index = 0; index < values.length; index++) {
    if (values[index].positive) correct++; else wrong++;
    // A tied score cannot be split using labels or record order.
    if (index + 1 < values.length && values[index].score === values[index + 1].score) continue;
    if (correct >= 20 && correct / (correct + wrong) >= 0.98 && correct > best) {
      selected = values[index].score; best = correct;
    }
  }
  return selected;
}

export function evaluate(rows, values, threshold) {
  if (!Number.isFinite(threshold)) throw new TypeError('THRESHOLD');
  const admitted = values.filter(pair => pair.score >= threshold);
  const correct = admitted.filter(pair => pair.positive).length;
  const totals = values.filter(pair => pair.positive).length;
  const neighbors = rows.map((_, index) => values.find(pair => pair.i === index || pair.j === index));
  const groups = rows.map((_, index) => [index]);
  const score = new Map(values.map(pair => [`${pair.i}:${pair.j}`, pair.score]));
  for (const pair of admitted) {
    const ai = groups.findIndex(group => group.includes(pair.i)), bi = groups.findIndex(group => group.includes(pair.j));
    if (ai === bi) continue;
    if (!groups[ai].every(i => groups[bi].every(j => score.get(`${Math.min(i, j)}:${Math.max(i, j)}`) >= threshold))) continue;
    groups[ai] = [...groups[ai], ...groups[bi]]; groups.splice(bi, 1);
  }
  const multi = groups.filter(group => group.length > 1);
  const pure = multi.filter(group => new Set(group.map(i => rows[i].eventKey)).size === 1);
  const mixed = multi.filter(group => new Set(group.map(i => rows[i].eventKey)).size > 1);
  let groupedTrue = 0, groupedFalse = 0, crossLanguageGroupedTrue = 0;
  for (const group of multi) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
    if (rows[group[a]].eventKey === rows[group[b]].eventKey) {
      groupedTrue++;
      if (rows[group[a]].lang && rows[group[b]].lang && rows[group[a]].lang !== rows[group[b]].lang) crossLanguageGroupedTrue++;
    } else groupedFalse++;
  }
  return { threshold, rows: rows.length, nearestCorrect: neighbors.filter(pair => pair?.positive).length,
    truePairs: totals, admittedTrue: correct, admittedFalse: admitted.length - correct,
    crossLanguageTruePairs: values.filter(pair => pair.positive && rows[pair.i].lang && rows[pair.j].lang && rows[pair.i].lang !== rows[pair.j].lang).length,
    groupedTrue, groupedFalse, crossLanguageGroupedTrue, purePages: pure.flat().length, mixedPages: mixed.flat().length,
    pureGroups: pure.length, mixedGroups: mixed.length };
}
