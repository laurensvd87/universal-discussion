// Offline precision-first research candidate. Retained title, URL, and E5 only.
const MIN_COSINE = 0.90;
const MAX_SOURCES = 256;
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or the their this to was were with after before over amid about says said how why what when where who under new latest live update updates opinion analysis report reports some several every first could ask asks say need needs against earlier wider possible useful'.split(' '));
const pairKey = (a, b) => [a, b].sort().join('|');
const stem = word => word.length > 5 ? word.slice(0, 5) : word;
const words = text => (typeof text === 'string' ? text.normalize('NFKC').toLocaleLowerCase('en') : '')
  .match(/[\p{L}\p{N}]+/gu)?.slice(0, 64) ?? [];

function record(doc, vectors) {
  if (typeof doc?.id !== 'string' || !doc.id || typeof doc.title !== 'string') throw new TypeError('Expected id and title');
  const title = doc.title.normalize('NFKC').split(/\s[|\u2013\u2014]\s/u)[0];
  const raw = vectors instanceof Map ? vectors.get(doc.id) : vectors?.[doc.id];
  const supplied = raw?.values ?? raw ?? doc.embedding?.values;
  let vector = null;
  if ((Array.isArray(supplied) || ArrayBuffer.isView(supplied)) && supplied.length >= 2 && supplied.length <= 4096 &&
      Array.from(supplied).every(Number.isFinite)) {
    const norm = Math.hypot(...supplied);
    if (norm > 0) vector = Array.from(supplied, value => value / norm);
  }
  const date = title.toLocaleLowerCase('en').match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/u);
  const proper = new Set([...title.matchAll(/\b([A-Z][\p{L}]{2,})\b/gu)].map(match => stem(match[1].toLocaleLowerCase('en'))));
  return { id: doc.id, title, vector, proper, date: date ? `${date[1]}-${date[2]}` : null,
    model: new Set([...title.matchAll(/\b([A-Z][A-Za-z]{0,5}\d{1,3})\b/gu)].map(match => match[1].toLowerCase())),
    cues: new Set(words(title).filter(word => word.length > 2 && !STOP.has(word)).map(stem)) };
}

export function matchTopicDocumentsV3(documents, vectors = null) {
  if (!Array.isArray(documents) || documents.length > MAX_SOURCES) throw new RangeError(`Expected at most ${MAX_SOURCES} documents`);
  const rows = documents.map(doc => record(doc, vectors)).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('Duplicate document ID');
  const byId = new Map(rows.map(row => [row.id, row]));
  const similarities = new Map();
  const parent = rows.map((_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i]; return i; };
  const unite = (i, j) => { parent[find(j)] = find(i); };
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i].vector, b = rows[j].vector;
    const score = a && b && a.length === b.length ? a.reduce((sum, value, k) => sum + value * b[k], 0) : null;
    similarities.set(pairKey(rows[i].id, rows[j].id), score);
    if (score !== null && score >= 0.88) unite(i, j);
  }
  const score = (a, b) => similarities.get(pairKey(a, b));
  const neighborhoods = new Map();
  rows.forEach((row, i) => {
    const root = find(i);
    if (!neighborhoods.has(root)) neighborhoods.set(root, []);
    neighborhoods.get(root).push(row);
  });
  const distinctive = new Map();
  for (const members of neighborhoods.values()) {
    const counts = new Map();
    for (const row of members) for (const cue of row.cues) counts.set(cue, (counts.get(cue) ?? 0) + 1);
    const properCounts = new Map();
    for (const row of members) for (const cue of row.proper) properCounts.set(cue, (properCounts.get(cue) ?? 0) + 1);
    const competingCues = members.length >= 6 && [...counts.values()].some(count => count >= 2 && count / members.length < 0.65);
    const common = competingCues ? new Set([...counts].filter(([, count]) => count / members.length >= 0.65).map(([cue]) => cue)) : new Set();
    if (members.length >= 6) for (const [cue, count] of properCounts) if (count >= 3) common.add(cue);
    for (const row of members) distinctive.set(row.id, new Set([...row.cues].filter(cue => !common.has(cue))));
  }
  const evidence = new Map();
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], cosine = score(a.id, b.id);
    const conflict = (a.date && b.date && a.date !== b.date) ||
      (a.model.size && b.model.size && ![...a.model].some(model => b.model.has(model)));
    const shared = [...distinctive.get(a.id)].filter(cue => distinctive.get(b.id).has(cue) &&
      !(a.proper.has(cue) && b.proper.has(cue))).sort();
    // A brand or product model alone is retrieval evidence. Two independent
    // shared title cues are required for automatic Topic membership.
    const sharedModel = [...a.model].some(model => b.model.has(model));
    const direct = !conflict && cosine !== null && cosine >= MIN_COSINE &&
      (shared.length >= 2 || (sharedModel && shared.length >= 1));
    evidence.set(pairKey(a.id, b.id), { cosine, shared, conflict: !!conflict, direct });
  }
  const get = (a, b) => evidence.get(pairKey(a, b));
  // A page directly matching two mutually conflicting event hypotheses is
  // ambiguous; both proposed attachments abstain until stronger evidence exists.
  const ambiguous = new Set();
  for (const middle of rows) for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (middle.id === a.id || middle.id === b.id) continue;
    if (get(a.id, b.id).conflict && get(middle.id, a.id).direct && get(middle.id, b.id).direct) {
      ambiguous.add(pairKey(middle.id, a.id));
      ambiguous.add(pairKey(middle.id, b.id));
    }
  }
  for (const identity of ambiguous) evidence.get(identity).direct = false;
  const groups = rows.map(row => [row.id]);
  for (;;) {
    const candidates = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const cross = groups[i].flatMap(a => groups[j].map(b => get(a, b)));
      if (cross.some(item => !item.direct)) continue;
      const minimum = Math.min(...cross.map(item => item.cosine));
      const cueCount = cross.reduce((sum, item) => sum + Math.min(item.shared.length, 3), 0) / cross.length;
      candidates.push({ i, j, priority: minimum + cueCount * 0.02, minimum,
        id: [...groups[i], ...groups[j]].sort().join('|') });
    }
    candidates.sort((a, b) => b.priority - a.priority || b.minimum - a.minimum || a.id.localeCompare(b.id));
    if (!candidates.length) break;
    const { i, j } = candidates[0];
    groups[i] = [...groups[i], ...groups[j]].sort(); groups.splice(j, 1);
    groups.sort((a, b) => a.join('|').localeCompare(b.join('|')));
  }
  const membership = new Map(groups.flatMap((group, index) => group.map(id => [id, index])));
  const partitions = groups.map(sourceIds => ({ sourceIds, tier: sourceIds.length === 1 ? 'abstain' : 'direct',
    evidence: { minimumCosine: sourceIds.length < 2 ? null : Math.round(Math.min(...sourceIds.flatMap((a, i) =>
      sourceIds.slice(i + 1).map(b => get(a, b).cosine))) * 1e6) / 1e6 } }));
  const relatedEdges = [];
  for (const [identity, item] of evidence) {
    const sourceIds = identity.split('|');
    if (membership.get(sourceIds[0]) !== membership.get(sourceIds[1]) && item.cosine !== null && item.cosine >= 0.86)
      relatedEdges.push({ sourceIds, score: Math.round(item.cosine * 1e6) / 1e6, tier: 'related',
        reason: item.conflict ? 'explicit-conflict' : 'insufficient-direct-evidence' });
  }
  relatedEdges.sort((a, b) => b.score - a.score || a.sourceIds.join('|').localeCompare(b.sourceIds.join('|')));
  return { partitions, relatedEdges };
}
