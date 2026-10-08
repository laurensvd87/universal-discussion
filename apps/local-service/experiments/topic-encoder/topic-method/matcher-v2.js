// Offline v2 research candidate. No owner data, body text, network, or state changes.
const FLOOR = 0.90;
const MAX = 256;
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or the their this to was were with after before over amid about says said how why what when where who under new latest live update updates opinion analysis report reports some several every first could ask asks say need needs against earlier wider possible useful'.split(' '));
const key = ids => [...ids].sort().join('|');
const tokens = text => (typeof text === 'string' ? text.normalize('NFKC').toLocaleLowerCase('en') : '').match(/[\p{L}\p{N}]+/gu)?.slice(0, 64) ?? [];
const stem = token => token.length > 5 ? token.slice(0, 5) : token;
const round = n => Math.round(n * 1e6) / 1e6;

function vector(doc, vectors) {
  const candidate = vectors instanceof Map ? vectors.get(doc.id) : vectors?.[doc.id];
  const raw = candidate?.values ?? candidate ?? doc.embedding?.values;
  if ((!Array.isArray(raw) && !ArrayBuffer.isView(raw)) || raw.length < 2 || raw.length > 4096) return null;
  let norm = 0;
  for (const item of raw) { if (!Number.isFinite(item)) return null; norm += item * item; }
  return norm > 0 ? Array.from(raw, item => item / Math.sqrt(norm)) : null;
}

function parse(doc, vectors) {
  if (typeof doc?.id !== 'string' || !doc.id || typeof doc.title !== 'string') throw new TypeError('Expected id and title');
  const words = tokens(doc.title.split(/\s[|\u2013\u2014]\s/u)[0]);
  const monthDay = doc.title.normalize('NFKC').toLocaleLowerCase('en').match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/u);
  const model = new Set([...doc.title.normalize('NFKC').matchAll(/\b([A-Z][A-Za-z]{0,5}\d{1,3})\b/gu)].map(match => match[1].toLowerCase()));
  return { id: doc.id, title: doc.title, words, eventDate: monthDay ? `${monthDay[1]}-${monthDay[2]}` : null,
    model,
    vector: vector(doc, vectors),
    stems: new Set(words.filter(word => word.length > 2 && !STOP.has(word)).map(stem)) };
}

function modelConflict(a, b) {
  if (a.eventDate && b.eventDate && a.eventDate !== b.eventDate) return true;
  if (!a.model.size || !b.model.size) return false;
  return ![...a.model].some(model => b.model.has(model));
}

export function matchTopicDocumentsV2(documents, vectors = null) {
  if (!Array.isArray(documents) || documents.length > MAX) throw new RangeError(`Expected at most ${MAX} documents`);
  const rows = documents.map(doc => parse(doc, vectors)).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('Duplicate id');
  const byId = new Map(rows.map(row => [row.id, row]));
  const edges = new Map();
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const cosine = a.vector && b.vector && a.vector.length === b.vector.length
      ? a.vector.reduce((sum, value, k) => sum + value * b.vector[k], 0) : null;
    edges.set(key([a.id, b.id]), { cosine, conflict: modelConflict(a, b), shared: [] });
  }
  const edge = (a, b) => edges.get(key([a, b]));
  // Frequent entity names are weak evidence within a dense local neighborhood.
  for (const [pairKey, candidate] of edges) {
    const [aid, bid] = pairKey.split('|');
    const a = byId.get(aid), b = byId.get(bid);
    if (candidate.cosine === null || candidate.cosine < FLOOR || candidate.conflict) continue;
    const neighborhood = rows.filter(row => row.id === a.id || row.id === b.id ||
      (edge(a.id, row.id)?.cosine ?? -1) >= 0.88 || (edge(b.id, row.id)?.cosine ?? -1) >= 0.88);
    const frequent = new Set();
    let distinctive = false;
    if (neighborhood.length >= 6) {
      const counts = new Map();
      for (const row of neighborhood) for (const cue of row.stems) counts.set(cue, (counts.get(cue) ?? 0) + 1);
      for (const [cue, count] of counts) {
        if (count / neighborhood.length >= 0.65) frequent.add(cue);
        else if (count >= 2) distinctive = true;
      }
    }
    candidate.shared = [...a.stems].filter(cue => b.stems.has(cue) && !frequent.has(cue)).sort();
    if (!candidate.shared.length && !distinctive) candidate.shared = [...a.stems].filter(cue => b.stems.has(cue)).sort();
    candidate.modelShared = [...a.model].some(model => b.model.has(model));
  }
  const groups = rows.map(row => [row.id]);
  const compatible = (left, right) => {
    const cross = left.flatMap(a => right.map(b => ({ a, b, ...edge(a, b) })));
    if (cross.some(item => item.cosine === null || item.cosine < FLOOR || item.conflict)) return null;
    const direct = cross.filter(item => item.shared.length || item.modelShared || item.cosine >= 0.95);
    if (!direct.length) return null;
    const support = direct.length / cross.length;
    if (support < 0.25 && Math.min(left.length, right.length) === 1) return null;
    const minimum = Math.min(...cross.map(item => item.cosine));
    const mean = cross.reduce((sum, item) => sum + item.cosine, 0) / cross.length;
    if (support < 0.5 && mean < 0.93) return null;
    const cueStrength = cross.reduce((sum, item) => sum + Math.min(3, item.shared.length), 0) / cross.length;
    return { minimum, mean, support, score: mean + support * 0.005 + cueStrength * 0.02 };
  };
  for (;;) {
    const candidates = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const evidence = compatible(groups[i], groups[j]);
      if (evidence) candidates.push({ i, j, ...evidence, ids: key([...groups[i], ...groups[j]]) });
    }
    candidates.sort((a, b) => b.score - a.score || b.minimum - a.minimum || a.ids.localeCompare(b.ids));
    if (!candidates.length) break;
    const { i, j } = candidates[0];
    groups[i] = [...groups[i], ...groups[j]].sort(); groups.splice(j, 1);
    groups.sort((a, b) => a.join(',').localeCompare(b.join(',')));
  }
  const membership = new Map(groups.flatMap((group, index) => group.map(id => [id, index])));
  const partitions = groups.map(sourceIds => ({ sourceIds,
    tier: sourceIds.length === 1 ? 'abstain' : 'local-supported',
    evidence: { minimumCosine: sourceIds.length === 1 ? null : round(Math.min(...sourceIds.flatMap((id, i) =>
      sourceIds.slice(i + 1).map(other => edge(id, other).cosine)))) } }));
  const relatedEdges = [];
  for (const [pairKey, item] of edges) {
    const sourceIds = pairKey.split('|');
    if (membership.get(sourceIds[0]) !== membership.get(sourceIds[1]) && item.cosine !== null && item.cosine >= 0.86)
      relatedEdges.push({ sourceIds, score: round(item.cosine), tier: 'related', reason: item.conflict ? 'model-conflict' : 'insufficient-event-support' });
  }
  relatedEdges.sort((a, b) => b.score - a.score || key(a.sourceIds).localeCompare(key(b.sourceIds)));
  return { partitions, relatedEdges };
}
