// Offline Topic identity candidate. No database or network dependencies.
const FLOOR = 0.90;
const RELATED_FLOOR = 0.86;
const MAX_SOURCES = 256;
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or the their this to was were with after before over amid about says said says how why what when where who under new latest live update updates opinion analysis report reports january february march april may june july august september october november december'.split(' '));
// Generic event-stage words, not event names or publisher aliases.
const EVENT_WORD = new Set('launch launched release released recall recalled vote voted recount merger outage strike ban approval resignation indictment sentence arrest ruling announcement exemption exemptions summit election ruling verdict lawsuit deal settlement acquisition invasion attack withdrawal shutdown reopening opening closure result results decision order sanctions'.split(' '));
const tokenize = value => (typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('en') : '')
  .match(/[\p{L}\p{N}]+/gu)?.slice(0, 48) ?? [];
const key = ids => [...ids].sort().join('|');
const round = n => Math.round(n * 1e6) / 1e6;

function titleCues(title) {
  const tokens = tokenize(title.split(/\s[|\u2013\u2014]\s/u)[0]);
  const cues = new Set();
  for (let size = 2; size <= 3; size++) for (let i = 0; i + size <= tokens.length; i++) {
    const part = tokens.slice(i, i + size);
    if (part.some(word => STOP.has(word))) continue;
    const content = part.filter(word => word.length >= 3);
    if (content.length < 2) continue;
    if (size === 2 && !part.some(word => EVENT_WORD.has(word) || /(?:tion|ment|ing|ance|ence|ment|down|back)$/u.test(word))) continue;
    cues.add(part.join(' '));
  }
  return cues;
}

function vectorFor(doc, vectors) {
  const found = vectors instanceof Map ? vectors.get(doc.id) : vectors?.[doc.id];
  const raw = found?.values ?? found ?? doc.embedding?.values;
  if (!Array.isArray(raw) && !ArrayBuffer.isView(raw)) return null;
  if (raw.length < 2 || raw.length > 4096 || !Array.from(raw).every(Number.isFinite)) return null;
  const norm = Math.hypot(...raw);
  return norm > 0 ? Array.from(raw, x => x / norm) : null;
}

function independent(a, b) {
  return a.urlKey !== b.urlKey && a.host !== b.host && a.titleKey !== b.titleKey;
}

function urlIdentity(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return { host: parsed.hostname.toLowerCase().replace(/^www\./u, ''),
      urlKey: `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/u, '')}` };
  } catch { return null; }
}

function conflict(a, b) {
  // Version conflicts are meaningful only when both titles share a nearby
  // product name; isolated numbers (prices, dates, vote counts) are ignored.
  const pattern = /\b([\p{Lu}][\p{L}\p{N}-]{2,})\s+(\d{1,3})(?:\.(\d{1,2}))?\b/gu;
  const pairs = title => [...title.matchAll(pattern)].map(m => [m[1].toLowerCase(), `${m[2]}.${m[3] ?? ''}`]);
  const left = pairs(a.title), right = pairs(b.title);
  for (const [name, version] of left) for (const [other, otherVersion] of right) {
    if (name === other && version !== otherVersion && !STOP.has(name) && !EVENT_WORD.has(name)) return 'product-version';
  }
  return null;
}

/**
 * Deterministic, bounded offline adapter. `vectors` is optional and may be a
 * Map/object keyed by id; otherwise each document supplies embedding.values.
 * Evidence tiers: direct, corroborated-bridge, related, abstain.
 */
export function matchTopicDocuments(documents, vectors = null, options = {}) {
  if (!Array.isArray(documents) || documents.length > MAX_SOURCES) throw new RangeError(`Expected at most ${MAX_SOURCES} documents`);
  const floor = options.floor ?? FLOOR;
  if (!Number.isFinite(floor) || floor < 0.85 || floor > 1) throw new RangeError('Invalid floor');
  const rows = documents.map(doc => {
    if (typeof doc?.id !== 'string' || !doc.id || typeof doc.title !== 'string') throw new TypeError('Expected id and title');
    const location = urlIdentity(doc.url);
    return { ...doc, vector: vectorFor(doc, vectors), cues: titleCues(doc.title),
      titleKey: tokenize(doc.title).join(' '), host: location?.host ?? `unknown:${doc.id}`,
      urlKey: location?.urlKey ?? `unknown:${doc.id}` };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('Duplicate document id');
  const pair = new Map();
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const score = a.vector && b.vector && a.vector.length === b.vector.length
      ? a.vector.reduce((sum, value, k) => sum + value * b.vector[k], 0) : null;
    const cues = [...a.cues].filter(cue => b.cues.has(cue)).sort();
    const blocked = conflict(a, b);
    pair.set(key([a.id, b.id]), { score, cues, blocked,
      direct: !blocked && score !== null && score >= floor && cues.length > 0 });
  }
  const get = (a, b) => pair.get(key([a, b]));
  const byId = new Map(rows.map(row => [row.id, row]));
  const witnesses = (a, b) => rows.filter(w => w.id !== a.id && w.id !== b.id &&
    independent(w, a) && independent(w, b) && get(a.id, w.id).direct && get(b.id, w.id).direct);
  const supportCache = new Map();
  const evaluateSupport = (a, b) => {
    const edge = get(a.id, b.id);
    if (edge.blocked || edge.score === null || edge.score < floor) return null;
    if (edge.direct) return { tier: 'direct', cues: edge.cues };
    const bridge = witnesses(a, b);
    for (let i = 0; i < bridge.length; i++) for (let j = i + 1; j < bridge.length; j++) {
      if (independent(bridge[i], bridge[j]) && get(bridge[i].id, bridge[j].id).direct)
        return { tier: 'corroborated-bridge', witnessIds: [bridge[i].id, bridge[j].id] };
    }
    return null;
  };
  const supported = (a, b) => {
    const pairKey = key([a.id, b.id]);
    if (!supportCache.has(pairKey)) supportCache.set(pairKey, evaluateSupport(a, b));
    return supportCache.get(pairKey);
  };
  const groups = rows.map(row => [row.id]);
  for (;;) {
    const candidates = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const cross = groups[i].flatMap(id => groups[j].map(other => ({ id, other,
        evidence: supported(byId.get(id), byId.get(other)), score: get(id, other).score })));
      if (cross.some(edge => !edge.evidence)) continue;
      candidates.push({ i, j, score: Math.min(...cross.map(edge => edge.score)),
        direct: cross.filter(edge => edge.evidence.tier === 'direct').length,
        pairKey: `${groups[i].join(',')}|${groups[j].join(',')}` });
    }
    candidates.sort((a, b) => b.direct - a.direct || b.score - a.score || a.pairKey.localeCompare(b.pairKey));
    if (!candidates.length) break;
    const { i, j } = candidates[0];
    groups[i] = [...groups[i], ...groups[j]].sort();
    groups.splice(j, 1);
    groups.sort((a, b) => a.join(',').localeCompare(b.join(',')));
  }
  const membership = new Map(groups.flatMap((group, i) => group.map(id => [id, i])));
  const partitions = groups.map(sourceIds => {
    const edges = sourceIds.flatMap((id, i) => sourceIds.slice(i + 1).map(other => supported(byId.get(id), byId.get(other))));
    const tier = sourceIds.length === 1 ? 'abstain' : edges.some(e => e?.tier === 'corroborated-bridge') ? 'corroborated-bridge' : 'direct';
    return { sourceIds, tier, evidence: { minimumCosine: edges.length ? round(Math.min(...sourceIds.flatMap((id, i) => sourceIds.slice(i + 1).map(other => get(id, other).score)))) : null,
      bridgeWitnessIds: [...new Set(edges.flatMap(e => e?.witnessIds ?? []))].sort() } };
  });
  const relatedEdges = [];
  for (const [pairKey, edge] of pair) {
    const ids = pairKey.split('|');
    if (membership.get(ids[0]) === membership.get(ids[1]) || edge.score === null || edge.score < RELATED_FLOOR) continue;
    relatedEdges.push({ sourceIds: ids, score: round(edge.score), tier: 'related',
      reasons: [edge.blocked ?? (edge.cues.length ? 'insufficient-group-support' : 'no-shared-event-cue')] });
  }
  relatedEdges.sort((a, b) => b.score - a.score || key(a.sourceIds).localeCompare(key(b.sourceIds)));
  return { partitions, relatedEdges };
}
