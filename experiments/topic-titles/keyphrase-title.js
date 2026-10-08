// Offline, read-only experiment. Input is the CURRENT members of one learned
// Topic; this module never assigns members, persists titles, or translates.
const STOP = new Set(`a an and as at by for from in into of on or the to with after before over under amid says say said is are was were
  der die das den dem des ein eine einer eines und oder mit von vom im am auf aus bei nach vor ueber über zu zum zur ist sind
  de het een en of op in van voor met na bij over uit tot is zijn`.split(/\s+/u));
const NEGATION = new Set('no not never without keine kein keinen nicht ohne geen niet nooit zonder не нет без'.split(' '));
// Deliberately small event cue allowlist. Unknown subjects fall back to a real
// headline; a recurring person/product phrase alone is not an event label.
const EVENT = new Set(`warning warnings flood floods closure closures closed strike strikes storm storms recall recalls election elections
  warnung warnungen hochwasser schliessung schließung geschlossen sturm rückruf wahl
  waarschuwing waarschuwingen overstroming overstromingswaarschuwingen sluiting gesloten storm terugroepactie verkiezing
  предупреждение предупреждения наводнение закрыты закрытие шторм отзыв выборы`.split(/\s+/u));
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid)$/iu;
const CLICKBAIT = /\b(?:you won['’]?t believe|here['’]?s why|shocking|what happened next)\b/iu;
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const MAX_MEMBERS = 200;
const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const normal = value => value.normalize('NFKC').toLocaleLowerCase('und');

function display(value) {
  if (typeof value !== 'string') return '';
  // Preserve script shaping controls such as Persian ZWNJ and Indic ZWJ.
  // Remove only C0/C1 controls and directional display overrides/isolates.
  return value.replace(/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/gu, ' ').trim().slice(0, 200).trim();
}
function words(title) {
  return [...segmenter.segment(title)].filter(part => part.isWordLike)
    .map(part => ({ text: part.segment, key: normal(part.segment), index: part.index,
      end: part.index + part.segment.length }));
}
function articleKey(source) {
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
    return `${url.origin}${url.pathname}${url.search}`;
  } catch { return null; }
}
function members(sources) {
  const entries = [];
  for (const source of sources) {
    const title = display(source?.title);
    const key = articleKey(source ?? {});
    if (!key || !title) continue;
    const host = new URL(key).host;
    // A same-publisher headline with alternate URLs has one vote.
    entries.push({ title, key, host, duplicateKey: `${host}\0${normal(title)}`,
      tokens: words(title), embedding: source.embedding });
  }
  entries.sort((a, b) => compare(a.key, b.key) || compare(a.title, b.title));
  const urls = new Set(), headlines = new Set();
  return entries.filter(item => {
    if (urls.has(item.key) || headlines.has(item.duplicateKey)) return false;
    urls.add(item.key); headlines.add(item.duplicateKey); return true;
  });
}
function terms(item) {
  return new Set(item.tokens.map(token => token.key).filter(token => !STOP.has(token) && token.length > 1));
}
function vector(item) {
  const embedding = item.embedding;
  if (embedding?.modelId !== MODEL || !Array.isArray(embedding.values) || embedding.values.length !== 384 ||
      embedding.values.some(value => typeof value !== 'number' || !Number.isFinite(value))) return null;
  const norm = Math.hypot(...embedding.values);
  if (Math.abs(norm - 1) > 0.01) return null;
  return embedding.values.map(value => value / norm);
}
function representative(items) {
  const sets = items.map(terms);
  const vectors = items.map(vector);
  const useVectors = vectors.every(Boolean);
  const sum = useVectors ? Array.from({ length: 384 }, (_, dimension) =>
    vectors.reduce((total, values) => total + values[dimension], 0)) : null;
  const ranked = items.map((item, i) => {
    let centrality = 0;
    if (useVectors) {
      // Mean pairwise cosine, computed via the centroid in O(members * 384).
      centrality = vectors[i].reduce((total, value, dimension) =>
        total + value * (sum[dimension] - value), 0) / Math.max(1, items.length - 1);
    } else {
      for (let j = 0; j < items.length; j++) if (i !== j) {
        const union = new Set([...sets[i], ...sets[j]]);
        if (union.size) centrality += [...sets[i]].filter(term => sets[j].has(term)).length / union.size;
      }
    }
    return { item, centrality, clickbait: CLICKBAIT.test(item.title), specificity: sets[i].size };
  });
  ranked.sort((a, b) => b.centrality - a.centrality || Number(a.clickbait) - Number(b.clickbait) ||
    b.specificity - a.specificity ||
    compare(a.item.key, b.item.key) || compare(a.item.title, b.item.title));
  return { title: ranked[0]?.item.title ?? '', method: useVectors ? 'representative-vector' : 'representative' };
}
function candidates(item) {
  const found = new Map();
  const tokens = item.tokens;
  for (let start = 0; start < tokens.length; start++) for (let end = start + 2; end < Math.min(tokens.length, start + 6); end++) {
    const chunk = tokens.slice(start, end + 1);
    const content = chunk.filter(token => !STOP.has(token.key) && token.key.length > 1);
    if (content.length < 3 || STOP.has(chunk[0].key) || STOP.has(chunk.at(-1).key)) continue;
    if (!chunk.some(token => EVENT.has(token.key))) continue;
    const phrase = item.title.slice(chunk[0].index, chunk.at(-1).end);
    if (phrase.length > 80 || /[.!?;:]/u.test(phrase)) continue;
    // Do not trim a negation off a headline and thereby reverse its claim.
    if (tokens.some(token => NEGATION.has(token.key)) &&
        !chunk.some(token => NEGATION.has(token.key))) continue;
    // Dates, quantities, and model identifiers often distinguish events.
    if (tokens.some(token => /\p{N}/u.test(token.key)) &&
        !chunk.some(token => /\p{N}/u.test(token.key))) continue;
    // A recurring proper name alone is not evidence of the same event.
    if (chunk.every(token => /^\p{Lu}/u.test(token.text))) continue;
    const key = chunk.map(token => token.key).join(' ');
    if (!found.has(key)) found.set(key, { key, phrase, content: content.length });
  }
  return [...found.values()];
}

export function titleForCurrentMembers(sources, savedTitle = '') {
  if (!Array.isArray(sources)) throw new TypeError('Sources must be an array');
  if (sources.length > MAX_MEMBERS) throw new RangeError('Too many current Topic members for title experiment');
  const items = members(sources);
  if (!items.length) return { title: display(savedTitle), method: 'saved-orphan', support: 0 };
  const baseline = representative(items);
  if (items.length === 1) return { ...baseline, support: 1 };
  const phrases = new Map();
  for (const item of items) for (const candidate of candidates(item)) {
    const entry = phrases.get(candidate.key) ?? { ...candidate, hosts: new Set(), urls: new Set() };
    entry.hosts.add(item.host); entry.urls.add(item.key);
    if (compare(candidate.phrase, entry.phrase) < 0) entry.phrase = candidate.phrase;
    phrases.set(candidate.key, entry);
  }
  const minimum = Math.max(2, Math.ceil(items.length * 0.6));
  const eligible = [...phrases.values()].filter(entry => entry.urls.size >= minimum && entry.hosts.size >= 2);
  eligible.sort((a, b) => b.urls.size - a.urls.size || b.content - a.content ||
    b.key.length - a.key.length || compare(a.key, b.key));
  const winner = eligible[0];
  return winner ? { title: winner.phrase, method: 'supported-keyphrase', support: winner.urls.size } :
    { ...baseline, support: 1 };
}
