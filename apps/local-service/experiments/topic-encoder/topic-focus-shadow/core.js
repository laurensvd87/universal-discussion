// Offline, ephemeral comparison only. No labels, text, or vectors are written.
export const LEAD_CHARACTERS = 384;
export const COSINE_FLOOR = 0.90;

const STOP = new Set(('a an and are as at be because before between but by can could did do does for from had has have how in into is it its may might more most new not of on or our out over said says should since some than that the their them there these they this those through to was were what when where which while who will with would after about against amid around before during under near').split(' '));
const ACTIONS = [
  ['recall', /\b(recall|recalled|withdrawal|withdrawn)\b/u],
  ['software-update', /\b(firmware|software|update|patch)\b/u],
  ['procurement', /\b(contract|tender|bid|bidding|procurement)\b/u],
  ['closure', /\b(close|closes|closing|closed|closure|shutdown)\b/u],
  ['tax', /\b(tax|levy|surcharge|fee)\b/u],
  ['price', /\b(price|prices|pricing|cost|costs)\b/u],
  ['launch', /\b(launch|launches|launched|liftoff)\b/u],
  ['election', /\b(election|vote|ballot|recount)\b/u],
  ['lawsuit', /\b(lawsuit|sue|court|ruling)\b/u],
];

const tokenize = value => value.normalize('NFKC').toLowerCase()
  .match(/[\p{L}\p{N}]+/gu) ?? [];
function stem(word) {
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 5 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function focusDocument(doc) {
  if (typeof doc?.id !== 'string' || typeof doc.title !== 'string' || typeof doc.body !== 'string')
    throw new TypeError('Invalid focus document');
  return { id: doc.id, title: doc.title,
    body: doc.body.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, LEAD_CHARACTERS) };
}

export function facet(doc) {
  const focus = focusDocument(doc);
  const text = `${focus.title} ${focus.body}`.toLowerCase();
  const terms = new Set(tokenize(text).map(stem).filter(word => word.length >= 4 && !STOP.has(word)));
  // Version evidence is title-scoped: later article context can mention a
  // separate version as background without making it this article's event.
  const products = new Map();
  const productPattern = /\b([\p{L}][\p{L}\p{N}-]{2,})[\s-]+(\d{1,3})(?:\.(\d{1,2}))?\b/giu;
  for (const match of focus.title.matchAll(productPattern)) {
    const name = match[1].toLowerCase();
    if (!STOP.has(name) && !['version', 'model', 'year', 'phase'].includes(name)) {
      if (!products.has(name)) products.set(name, new Set());
      products.get(name).add(`${match[2]}.${match[3] ?? ''}`);
    }
  }
  const actions = new Set(ACTIONS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
  return { terms, products, actions };
}

export function trainIdf(facets) {
  const documents = [...facets.values()];
  if (!documents.length) throw new TypeError('Empty training facets');
  const df = new Map();
  for (const entry of documents) for (const term of entry.terms)
    df.set(term, (df.get(term) ?? 0) + 1);
  const result = new Map([...df].map(([term, count]) =>
    [term, 1 + Math.log((documents.length + 1) / (count + 1))]));
  result.unknownWeight = 1 + Math.log(documents.length + 1);
  return result;
}

export function weightedOverlap(a, b, idf) {
  let intersection = 0, union = 0;
  for (const term of new Set([...a.terms, ...b.terms])) {
    const weight = idf.get(term) ?? idf.unknownWeight;
    union += weight;
    if (a.terms.has(term) && b.terms.has(term)) intersection += weight;
  }
  return union ? intersection / union : 0;
}

export function hardConflict(a, b) {
  for (const [name, versions] of a.products) if (b.products.has(name)) {
    const other = b.products.get(name);
    if (![...versions].some(version => other.has(version))) return 'product-version';
  }
  if (a.actions.size === 1 && b.actions.size === 1 &&
      ![...a.actions].some(action => b.actions.has(action))) return 'event-action';
  return null;
}

export const cosine = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const pairKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

export function pairEvidence(sources, focusVectors, facets, idf, bodyVectors = null) {
  const edges = new Map();
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const a = sources[i].id, b = sources[j].id;
    const focus = cosine(focusVectors.get(a), focusVectors.get(b));
    const body = bodyVectors ? cosine(bodyVectors.get(a), bodyVectors.get(b)) : null;
    edges.set(pairKey(a, b), { focus, body,
      overlap: weightedOverlap(facets.get(a), facets.get(b), idf),
      conflict: hardConflict(facets.get(a), facets.get(b)) });
  }
  return edges;
}

// Complete-link over accepted pair evidence: every cross-pair must be
// supported; an unrelated outside page cannot veto an existing match.
export function partitionByEvidence(sources, evidence, predicate) {
  const ids = sources.map(source => source.id).sort();
  const groups = ids.map(id => [id]);
  const edge = (a, b) => evidence.get(pairKey(a, b));
  const candidates = [...evidence].filter(([, value]) => predicate(value))
    .map(([key, value]) => ({ ids: key.split('\0'), score: value.focus }))
    .sort((a, b) => b.score - a.score || a.ids.join('\0').localeCompare(b.ids.join('\0')));
  for (const candidate of candidates) {
    const left = groups.findIndex(group => group.includes(candidate.ids[0]));
    const right = groups.findIndex(group => group.includes(candidate.ids[1]));
    if (left === right) continue;
    if (!groups[left].every(a => groups[right].every(b => predicate(edge(a, b))))) continue;
    groups[left] = [...groups[left], ...groups[right]].sort();
    groups.splice(right, 1);
  }
  return groups;
}

// Train-only zero-false-pair cutoff. This is conservative by design; a caller
// can compare it against uncalibrated focus geometry without tuning on val.
export function trainZeroFalseCutoff(documents, evidence) {
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  let maximumNegative = -Infinity, eligiblePositive = 0, eligibleNegative = 0;
  for (const [key, value] of evidence) {
    if (value.focus < COSINE_FLOOR || value.conflict) continue;
    const [a, b] = key.split('\0');
    if (byId.get(a).topicLabel === byId.get(b).topicLabel) eligiblePositive++;
    else { eligibleNegative++; maximumNegative = Math.max(maximumNegative, value.overlap); }
  }
  return { cutoff: maximumNegative === -Infinity ? 0 : maximumNegative + 1e-9,
    eligiblePositive, eligibleNegative, maximumNegative: Number.isFinite(maximumNegative) ? maximumNegative : null };
}
