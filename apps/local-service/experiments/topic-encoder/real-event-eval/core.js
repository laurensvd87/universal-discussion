// Offline adapter. Never serialize or log documents, vectors, URLs, or labels.
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const normalized = value => value.normalize('NFKC')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, ' ')
  .replace(/\s+/gu, ' ').trim();
const splitOf = key => ['train', 'validation', 'test'][parseInt(sha(key).slice(0, 8), 16) % 10 < 6 ? 0 : parseInt(sha(key).slice(0, 8), 16) % 10 < 8 ? 1 : 2];

export class EvalError extends Error {
  constructor(phase, code) {
    super(code);
    this.name = 'EvalError';
    this.phase = phase;
    this.code = code;
  }
}
const fail = (phase, code) => { throw new EvalError(phase, code); };
export const safeDiagnostic = error => error instanceof EvalError
  ? { phase: error.phase, code: error.code }
  : { phase: 'internal', code: 'UNCLASSIFIED_FAILURE' };

export function parseCorpus(bytes, { maxBytes = 64 * 1024 * 1024, maxArticles = 10000,
  leadCharacters = 384 } = {}) {
  if (leadCharacters !== 384 && leadCharacters !== 4096) fail('input', 'LEAD_LENGTH_OPTION');
  if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes || !bytes.length) fail('input', 'INPUT_SIZE');
  const source = bytes.toString('utf8');
  const first = source.trimStart()[0];
  let events, format;
  if (first === '[') {
    format = 'json-array';
    try { events = JSON.parse(source); } catch { fail('parse', 'JSON_SYNTAX'); }
  } else if (first === '{') {
    format = 'jsonl';
    const lines = source.split(/\r?\n/u);
    if (lines.at(-1) === '') lines.pop();
    if (!lines.length || lines.length > maxArticles) fail('parse', 'JSONL_LINE_COUNT');
    events = lines.map(line => {
      if (!line.trim() || Buffer.byteLength(line, 'utf8') > 4 * 1024 * 1024)
        fail('parse', 'JSONL_LINE_BOUND');
      try { return JSON.parse(line); } catch { fail('parse', 'JSONL_SYNTAX'); }
    });
  } else fail('parse', 'JSON_ROOT_FORMAT');
  if (!Array.isArray(events)) fail('schema', 'ROOT_ARRAY_TYPE');
  if (!events.length || events.length > maxArticles) fail('schema', 'EVENT_COUNT');
  const documents = [];
  const eventKeys = new Set();
  let familyGold = true, viewpointGold = true;
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail('schema', 'EVENT_OBJECT_TYPE');
    if (typeof event.date !== 'string') fail('schema', 'EVENT_DATE_TYPE');
    if (!event.date || event.date.length > 100) fail('schema', 'EVENT_DATE_LENGTH');
    if (typeof event.description !== 'string') fail('schema', 'EVENT_DESCRIPTION_TYPE');
    if (!event.description || event.description.length > 4000) fail('schema', 'EVENT_DESCRIPTION_LENGTH');
    if (typeof event.category !== 'string') fail('schema', 'EVENT_CATEGORY_TYPE');
    if (!event.category || event.category.length > 100) fail('schema', 'EVENT_CATEGORY_LENGTH');
    if (!Array.isArray(event.news)) fail('schema', 'EVENT_NEWS_ARRAY_TYPE');
    if (!event.news.length || event.news.length > maxArticles) fail('schema', 'EVENT_NEWS_COUNT');
    // An explicit stable event key is preferred. Otherwise date+description identifies a gold event.
    const eventKey = typeof event.event_id === 'string' && event.event_id.length <= 200 && event.event_id.trim()
      ? `id:${event.event_id}` : `fallback:${event.date}\0${event.description}`;
    if (eventKeys.has(eventKey)) fail('schema', 'EVENT_KEY_COLLISION');
    eventKeys.add(eventKey);
    const family = typeof event.family_id === 'string' && event.family_id.trim() && event.family_id.length <= 200
      ? event.family_id : null;
    if (!family) familyGold = false;
    for (const article of event.news) {
      if (documents.length >= maxArticles) fail('schema', 'ARTICLE_COUNT');
      if (!article || typeof article !== 'object' || Array.isArray(article)) fail('schema', 'ARTICLE_OBJECT_TYPE');
      if (typeof article.lang_abbr !== 'string') fail('schema', 'ARTICLE_LANGUAGE_TYPE');
      if (!/^[a-z]{2,8}(?:-[A-Za-z]{2,8})?$/u.test(article.lang_abbr)) fail('schema', 'ARTICLE_LANGUAGE_FORMAT');
      if (typeof article.title !== 'string') fail('schema', 'ARTICLE_TITLE_TYPE');
      if (!article.title.trim() || article.title.length > 1000) fail('schema', 'ARTICLE_TITLE_LENGTH');
      if (typeof article.article !== 'string') fail('schema', 'ARTICLE_BODY_TYPE');
      if (!article.article.trim() || article.article.length > 100000) fail('schema', 'ARTICLE_BODY_LENGTH');
      const viewpoint = typeof article.viewpoint === 'string' && article.viewpoint.trim() && article.viewpoint.length <= 100
        ? article.viewpoint : null;
      if (!viewpoint) viewpointGold = false;
      const title = normalized(article.title);
      const lead = normalized(article.article).slice(0, leadCharacters);
      documents.push({ id: `d${documents.length}`, eventKey, familyKey: family ? `family:${family}` : `event:${eventKey}`,
        category: event.category, lang: article.lang_abbr.toLowerCase(), viewpoint,
        duplicateKey: sha(`${title}\0${lead.slice(0, 384)}`), title, lead });
    }
  }
  const eventSplit = new Map();
  for (const doc of documents) {
    const split = splitOf(doc.familyKey);
    if (eventSplit.has(doc.eventKey) && eventSplit.get(doc.eventKey) !== split) fail('schema', 'EVENT_SPLIT_COLLISION');
    eventSplit.set(doc.eventKey, split);
    doc.split = split;
  }
  return { documents, inputSha256: sha(bytes), format, familyGold, viewpointGold };
}

export function selectEventDisjoint(documents, maxScored = 1200) {
  if (!Number.isInteger(maxScored) || maxScored < 1 || maxScored > 1200)
    throw new Error('Scored article bound invalid');
  const families = new Map();
  for (const doc of documents) {
    const members = families.get(doc.familyKey) ?? [];
    members.push(doc);
    families.set(doc.familyKey, members);
  }
  const chosen = [];
  for (const [, members] of [...families].sort((a, b) => sha(a[0]).localeCompare(sha(b[0])))) {
    if (chosen.length + members.length <= maxScored) chosen.push(...members);
  }
  return { documents: chosen.sort((a, b) => a.eventKey.localeCompare(b.eventKey) ||
      a.duplicateKey.localeCompare(b.duplicateKey) || a.id.localeCompare(b.id)),
    unscoredArticles: documents.length - chosen.length,
    unscoredEvents: new Set(documents.filter(d => !chosen.includes(d)).map(d => d.eventKey)).size };
}

export function inspectCorpus(corpus, selection) {
  const eventSizes = new Map();
  const languages = new Map();
  for (const doc of corpus.documents) {
    eventSizes.set(doc.eventKey, (eventSizes.get(doc.eventKey) ?? 0) + 1);
    languages.set(doc.lang, (languages.get(doc.lang) ?? 0) + 1);
  }
  const sizes = [...eventSizes.values()];
  return {
    mode: 'inspect', inputSha256: corpus.inputSha256,
    schema: { shape: corpus.format, familyGoldAvailable: corpus.familyGold,
      viewpointGoldAvailable: corpus.viewpointGold },
    events: eventSizes.size, articles: corpus.documents.length,
    eventSize: { min: Math.min(...sizes), max: Math.max(...sizes) },
    languages: Object.fromEntries([...languages].sort(([a], [b]) => a.localeCompare(b))),
    scoredArticles: selection.documents.length,
    scoredEvents: new Set(selection.documents.map(d => d.eventKey)).size,
    unscoredArticles: selection.unscoredArticles,
    unscoredEvents: selection.unscoredEvents,
    modelLoaded: false,
  };
}

export function diagnoseRetrieval(documents, vectors) {
  if (!Array.isArray(documents) || !(vectors instanceof Map) || documents.length < 1 || documents.length > 1200)
    throw new Error('Retrieval diagnostic input invalid');
  const lengths = documents.map(d => {
    const vector = vectors.get(d.id);
    if (!vector || vector.length !== 384 || [...vector].some(v => !Number.isFinite(v)))
      throw new Error('Retrieval diagnostic vector invalid');
    return Math.hypot(...vector);
  });
  if (lengths.some(n => n < 1e-9)) throw new Error('Retrieval diagnostic vector invalid');
  const similarity = (i, j) => {
    const a = vectors.get(documents[i].id), b = vectors.get(documents[j].id);
    let dot = 0;
    for (let k = 0; k < 384; k++) dot += a[k] * b[k];
    return dot / (lengths[i] * lengths[j]);
  };
  const same = [], different = [], hard = [];
  const matrix = documents.map(() => new Float64Array(documents.length));
  let crossEventDuplicatePairs = 0, sameEventDuplicatePairs = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j], cosine = similarity(i, j);
    matrix[i][j] = cosine;
    matrix[j][i] = cosine;
    if (a.eventKey === b.eventKey) same.push(cosine);
    else {
      different.push(cosine);
      if (a.category === b.category) hard.push(cosine);
    }
    if (a.duplicateKey === b.duplicateKey) {
      if (a.eventKey === b.eventKey) sameEventDuplicatePairs++;
      else crossEventDuplicatePairs++;
    }
  }
  const ranks = { all: [], crossLanguageOnly: [] };
  for (let i = 0; i < documents.length; i++) {
    const sorted = documents.map((_, j) => j).filter(j => j !== i)
      .sort((a, b) => matrix[i][b] - matrix[i][a] || a - b);
    const first = sorted.findIndex(j => documents[j].eventKey === documents[i].eventKey);
    if (first >= 0) ranks.all.push(first + 1);
    const cross = sorted.filter(j => documents[j].lang !== documents[i].lang);
    const crossFirst = cross.findIndex(j => documents[j].eventKey === documents[i].eventKey);
    if (crossFirst >= 0) ranks.crossLanguageOnly.push(crossFirst + 1);
  }
  const rankSummary = values => ({ eligibleQueries: values.length,
    rank1: values.filter(n => n <= 1).length, top3: values.filter(n => n <= 3).length,
    top10: values.filter(n => n <= 10).length, top25: values.filter(n => n <= 25).length });
  const quantiles = values => {
    if (!values.length) return { pairs: 0, p0: null, p10: null, p25: null, p50: null, p75: null, p90: null, p100: null };
    values.sort((a, b) => a - b);
    const at = fraction => {
      const position = (values.length - 1) * fraction;
      const low = Math.floor(position), high = Math.ceil(position);
      return Math.round((values[low] + (values[high] - values[low]) * (position - low)) * 100000) / 100000;
    };
    return { pairs: values.length, p0: at(0), p10: at(.1), p25: at(.25), p50: at(.5),
      p75: at(.75), p90: at(.9), p100: at(1) };
  };
  const languageCounts = new Map();
  for (const doc of documents) languageCounts.set(doc.lang, (languageCounts.get(doc.lang) ?? 0) + 1);
  return { selectedArticles: documents.length,
    languages: Object.fromEntries([...languageCounts].sort(([a], [b]) => a.localeCompare(b))),
    nearestTrueEvent: { allCandidates: rankSummary(ranks.all),
      crossLanguageCandidatesOnly: rankSummary(ranks.crossLanguageOnly) },
    cosine: { sameEvent: quantiles(same), differentEvent: quantiles(different),
      sameCategoryDifferentEvent: quantiles(hard) },
    exactDuplicatePairs: { sameEvent: sameEventDuplicatePairs,
      conflictingEventLabels: crossEventDuplicatePairs } };
}

export function scorePartition(documents, groups) {
  const ids = new Set(documents.map(d => d.id));
  const assigned = new Set();
  for (const group of groups) {
    if (!Array.isArray(group) || !group.length) throw new Error('Invalid partition');
    for (const id of group) {
      if (!ids.has(id) || assigned.has(id)) throw new Error('Invalid partition');
      assigned.add(id);
    }
  }
  if (assigned.size !== ids.size) throw new Error('Incomplete partition');
  const groupOf = new Map(groups.flatMap((g, i) => g.map(id => [id, i])));
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0, hardFalseJoins: 0,
    crossLanguageJoined: 0, crossLanguageTotal: 0, opposingViewJoined: 0, opposingViewTotal: 0,
    duplicateJoined: 0, duplicateTotal: 0, crossEventDuplicateJoined: 0,
    crossEventDuplicateTotal: 0 };
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j], same = a.eventKey === b.eventKey;
    const joined = groupOf.get(a.id) === groupOf.get(b.id);
    counts[same ? joined ? 'tp' : 'fn' : joined ? 'fp' : 'tn']++;
    if (joined && !same && a.category === b.category) counts.hardFalseJoins++;
    if (same && a.lang !== b.lang) { counts.crossLanguageTotal++; if (joined) counts.crossLanguageJoined++; }
    if (same && a.viewpoint && b.viewpoint && a.viewpoint !== b.viewpoint) {
      counts.opposingViewTotal++; if (joined) counts.opposingViewJoined++;
    }
    if (same && a.duplicateKey === b.duplicateKey) { counts.duplicateTotal++; if (joined) counts.duplicateJoined++; }
    if (!same && a.duplicateKey === b.duplicateKey) {
      counts.crossEventDuplicateTotal++; if (joined) counts.crossEventDuplicateJoined++;
    }
  }
  const goldSizes = new Map();
  for (const doc of documents) goldSizes.set(doc.eventKey, (goldSizes.get(doc.eventKey) ?? 0) + 1);
  return { articles: documents.length, goldEvents: goldSizes.size, predictedGroups: groups.length,
    goldSingletons: [...goldSizes.values()].filter(n => n === 1).length,
    predictedSingletons: groups.filter(g => g.length === 1).length,
    ...counts, precision: counts.tp + counts.fp ? counts.tp / (counts.tp + counts.fp) : null,
    recall: counts.tp + counts.fn ? counts.tp / (counts.tp + counts.fn) : null };
}

export function cosinePartition(documents, vectors, threshold = 0.94) {
  // Conservative baseline, not an ADR-064 activation candidate.
  const groups = [];
  for (const doc of [...documents].sort((a, b) => a.id.localeCompare(b.id))) {
    const vector = vectors.get(doc.id);
    if (!vector || vector.length !== 384) throw new Error('Vector missing');
    const similarity = other => vector.reduce((sum, v, i) => sum + v * vectors.get(other.id)[i], 0);
    const eligible = groups.map((g, i) => ({ i, score: Math.min(...g.map(similarity)) }))
      .filter(x => x.score >= threshold).sort((a, b) => b.score - a.score || a.i - b.i);
    if (eligible.length) groups[eligible[0].i].push(doc); else groups.push([doc]);
  }
  return groups.map(g => g.map(d => d.id));
}

export function matcherInputs(documents, vectors) {
  // Gold event, family, category, language, viewpoint, and duplicate labels stay out.
  return documents.map(d => Object.freeze({ id: d.id, embedding: vectors.get(d.id) }));
}

export function evaluate(documents, vectors, matcher = inputs => cosinePartition(inputs, vectors)) {
  const started = performance.now();
  const inputs = matcherInputs(documents, vectors);
  const forward = matcher(inputs);
  const forwardMs = performance.now() - started;
  const reversed = matcher([...inputs].reverse());
  const canonical = groups => groups.map(g => [...g].sort().join(',')).sort().join('|');
  const base = scorePartition(documents, forward);
  const scaling = [0.25, 0.5, 1].map(fraction => {
    const slice = inputs.slice(0, Math.max(1, Math.ceil(inputs.length * fraction)));
    const at = performance.now();
    matcher(slice);
    return { articles: slice.length, matchingMs: Math.round((performance.now() - at) * 100) / 100,
      pairComparisonsUpperBound: slice.length * (slice.length - 1) / 2 };
  });
  const bySplit = {};
  for (const split of ['train', 'validation', 'test']) {
    const slice = documents.filter(d => d.split === split);
    bySplit[split] = scorePartition(slice, matcher(matcherInputs(slice, vectors)));
  }
  return { ...base, bySplit, scaling, orderStable: canonical(forward) === canonical(reversed),
    matchingMs: Math.round(forwardMs * 100) / 100,
    pairComparisonsUpperBound: documents.length * (documents.length - 1) / 2 };
}
