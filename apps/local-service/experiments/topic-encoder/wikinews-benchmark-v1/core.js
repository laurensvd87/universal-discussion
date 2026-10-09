// Private offline research only. Reports contain aggregates, never corpus rows.
import { createHash } from 'node:crypto';
import { parseCorpus as validateCorpus } from '../wikinews-event-eval/core.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const clean = value => value.normalize('NFKC')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, ' ')
  .replace(/\s+/gu, ' ').trim();
const splitOf = key => {
  const bucket = Number.parseInt(hash(key).slice(0, 8), 16) % 10;
  return bucket < 6 ? 'train' : bucket < 8 ? 'validation' : 'test';
};

export class BenchmarkError extends Error {
  constructor(phase, code) { super(code); this.phase = phase; this.code = code; }
}
export const safeDiagnostic = error => error instanceof BenchmarkError
  ? { phase: error.phase, code: error.code }
  : { phase: 'internal', code: 'UNCLASSIFIED_FAILURE' };

export function prepareCorpus(bytes) {
  // The fixture-tested adapter performs full bounded schema and URL validation.
  const validated = validateCorpus(bytes);
  const lines = bytes.toString('utf8').trimEnd().split(/\r?\n/u);
  const documents = [];
  let missingText = 0;
  for (let index = 0; index < lines.length; index++) {
    const row = JSON.parse(lines[index]);
    const raw = Array.isArray(row.text) ? row.text.join(' ') : row.text;
    const lead = clean(raw).slice(0, 384);
    if (!lead) { missingText++; continue; }
    const key = String(row.pageid), title = clean(row.title);
    const categories = [...new Set(row.categories.map(item => clean(item).toLowerCase()))]
      .filter(Boolean).sort();
    documents.push({ id: `d${index}`, eventKey: key, split: splitOf(key),
      lang: row.lang.toLowerCase(), title, lead, categories,
      duplicateKey: hash(`${title}\0${lead}`) });
  }
  if (missingText !== validated.emptyTextArticles)
    throw new BenchmarkError('corpus', 'EMPTY_TEXT_COUNT_MISMATCH');
  return { inputSha256: validated.inputSha256, totalArticles: validated.articles,
    totalEvents: validated.events.size, missingText, documents };
}

export function selectWholeEvents(documents, maxArticles = 1200) {
  if (!Number.isInteger(maxArticles) || maxArticles < 2 || maxArticles > 1200)
    throw new BenchmarkError('selection', 'COMPUTE_BUDGET');
  const events = new Map();
  for (const doc of documents) {
    const members = events.get(doc.eventKey) ?? [];
    members.push(doc);
    events.set(doc.eventKey, members);
  }
  const chosen = [];
  for (const [key, members] of [...events]
    .sort((a, b) => hash(a[0]).localeCompare(hash(b[0])))) {
    if (chosen.length + members.length <= maxArticles) chosen.push(...members);
  }
  const selectedEvents = new Set(chosen.map(doc => doc.eventKey));
  return { documents: chosen, selectedEvents: selectedEvents.size,
    unscoredArticles: documents.length - chosen.length,
    unscoredEvents: events.size - selectedEvents.size };
}

export function inspect(corpus, selection) {
  const bySplit = {};
  for (const split of ['train', 'validation', 'test']) {
    const docs = selection.documents.filter(doc => doc.split === split);
    bySplit[split] = { articles: docs.length, events: new Set(docs.map(doc => doc.eventKey)).size };
  }
  return { mode: 'inspect', inputSha256: corpus.inputSha256,
    inputArticles: corpus.totalArticles, inputEvents: corpus.totalEvents,
    emptyTextExcluded: corpus.missingText, eligibleArticles: corpus.documents.length,
    scoredArticles: selection.documents.length, scoredEvents: selection.selectedEvents,
    unscoredArticles: selection.unscoredArticles, unscoredEvents: selection.unscoredEvents,
    scoredLanguages: new Set(selection.documents.map(doc => doc.lang)).size,
    bySplit, modelLoaded: false };
}

const pairCount = n => n * (n - 1) / 2;
const sharedCategory = (a, b) => a.categories.some(category => b.categories.includes(category));

export function evaluate(documents, vectors, threshold = 0.94) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 1200 ||
      !(vectors instanceof Map) || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new BenchmarkError('evaluation', 'INPUT');
  const lengths = documents.map(doc => {
    const vector = vectors.get(doc.id);
    if (!vector || vector.length !== 384 || [...vector].some(v => !Number.isFinite(v)))
      throw new BenchmarkError('evaluation', 'VECTOR');
    const length = Math.hypot(...vector);
    if (!(length > 1e-9)) throw new BenchmarkError('evaluation', 'VECTOR');
    return length;
  });
  const n = documents.length;
  const matrix = documents.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = vectors.get(documents[i].id), b = vectors.get(documents[j].id);
    let dot = 0;
    for (let k = 0; k < 384; k++) dot += a[k] * b[k];
    matrix[i][j] = matrix[j][i] = dot / (lengths[i] * lengths[j]);
  }
  // A single conservative, predeclared complete-link baseline. No member cap.
  const groups = [];
  for (let i = 0; i < n; i++) {
    let best = -1, bestScore = threshold;
    for (let g = 0; g < groups.length; g++) {
      let minimum = 1;
      for (const member of groups[g]) minimum = Math.min(minimum, matrix[i][member]);
      if (minimum >= bestScore) { best = g; bestScore = minimum; }
    }
    if (best < 0) groups.push([i]); else groups[best].push(i);
  }
  const groupOf = new Int32Array(n);
  groups.forEach((group, g) => group.forEach(i => { groupOf[i] = g; }));
  let trueJoined = 0, trueTotal = 0, falseJoined = 0, falseTotal = 0;
  let crossLanguageJoined = 0, crossLanguageTotal = 0;
  let hardFalseJoined = 0, hardFalseTotal = 0, conflictingDuplicatePairs = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const same = documents[i].eventKey === documents[j].eventKey;
    const joined = groupOf[i] === groupOf[j];
    if (same) {
      trueTotal++; if (joined) trueJoined++;
      if (documents[i].lang !== documents[j].lang) {
        crossLanguageTotal++; if (joined) crossLanguageJoined++;
      }
    } else {
      falseTotal++; if (joined) falseJoined++;
      if (sharedCategory(documents[i], documents[j])) {
        hardFalseTotal++; if (joined) hardFalseJoined++;
      }
      if (documents[i].duplicateKey === documents[j].duplicateKey)
        conflictingDuplicatePairs++;
    }
  }
  const rank = { eligible: 0, rank1: 0, top3: 0, top10: 0 };
  const crossRank = { eligible: 0, rank1: 0, top3: 0, top10: 0 };
  for (let i = 0; i < n; i++) {
    const ordered = Array.from({ length: n }, (_, j) => j).filter(j => j !== i)
      .sort((a, b) => matrix[i][b] - matrix[i][a] || a - b);
    for (const [target, candidates] of [[rank, ordered],
      [crossRank, ordered.filter(j => documents[j].lang !== documents[i].lang)]]) {
      const first = candidates.findIndex(j => documents[j].eventKey === documents[i].eventKey);
      if (first < 0) continue;
      target.eligible++;
      if (first === 0) target.rank1++;
      if (first < 3) target.top3++;
      if (first < 10) target.top10++;
    }
  }
  return { articles: n, goldEvents: new Set(documents.map(doc => doc.eventKey)).size,
    predictedGroups: groups.length, predictedSingletons: groups.filter(g => g.length === 1).length,
    trueJoined, trueTotal, falseJoined, falseTotal,
    crossLanguageJoined, crossLanguageTotal, hardFalseJoined, hardFalseTotal,
    conflictingDuplicatePairs, nearestTrueEvent: rank,
    nearestCrossLanguageTrueEvent: crossRank,
    precision: trueJoined + falseJoined ? trueJoined / (trueJoined + falseJoined) : null,
    recall: trueTotal ? trueJoined / trueTotal : null,
    comparisons: pairCount(n) };
}
