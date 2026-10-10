// Content-free, read-only planning aid. It accepts caller-supplied IDs and
// partitions; it neither computes candidate groups nor changes Topic routing.
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(id);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const invalid = () => { throw new TypeError('Invalid Topic partition comparison'); };

function normalize(parts, sourceIds, hasTopicIds) {
  if (!Array.isArray(parts)) invalid();
  const seen = new Set();
  const topics = new Set();
  const normalized = parts.map((part) => {
    if (!part || !Array.isArray(part.sourceIds) || part.sourceIds.length === 0) invalid();
    if (hasTopicIds) {
      if (!validId(part.topicId) || topics.has(part.topicId)) invalid();
      topics.add(part.topicId);
    }
    const ids = part.sourceIds.map((id) => {
      if (!validId(id) || !sourceIds.has(id) || seen.has(id)) invalid();
      seen.add(id);
      return id;
    }).sort(compare);
    return hasTopicIds ? { topicId: part.topicId, sourceIds: ids } : { sourceIds: ids };
  });
  if (seen.size !== sourceIds.size) invalid();
  return normalized.sort((a, b) => compare(a.sourceIds.join('\0'), b.sourceIds.join('\0')));
}

export function compareTopicPartitions({ sourceIds, currentPartitions, candidatePartitions, sourceRoots = [] }) {
  if (!Array.isArray(sourceIds) || !Array.isArray(sourceRoots) ||
      sourceIds.some((id) => !validId(id)) || new Set(sourceIds).size !== sourceIds.length) invalid();
  const allSources = new Set(sourceIds);
  const current = normalize(currentPartitions, allSources, true);
  const candidate = normalize(candidatePartitions, allSources, false);
  const roots = new Set();
  for (const root of sourceRoots) {
    if (!root || !validId(root.rootId) || roots.has(root.rootId) || !allSources.has(root.sourceId)) invalid();
    roots.add(root.rootId);
  }
  const currentBySource = new Map(current.flatMap((part) => part.sourceIds.map((id) => [id, part])));
  const candidateBySource = new Map(candidate.flatMap((part) => part.sourceIds.map((id) => [id, part])));
  const changedSourceIds = [...allSources].filter((id) =>
    currentBySource.get(id).sourceIds.join('\0') !== candidateBySource.get(id).sourceIds.join('\0')).sort(compare);
  const changed = new Set(changedSourceIds);
  return {
    // Candidate labels are display-only; they must never be treated as Topic IDs.
    candidateGroups: candidate.map((part) => ({ previewId: `candidate:${part.sourceIds[0]}`, sourceIds: [...part.sourceIds] })),
    changedSourceIds,
    // Advisory only: the caller may not have supplied every anchored root.
    potentiallyAffectedRootIds: sourceRoots.filter((root) => changed.has(root.sourceId))
      .map((root) => root.rootId).sort(compare),
    // Snapshot for comparison only; not a durable rollback plan after writes.
    baselineAssignments: [...allSources].sort(compare).map((sourceId) => ({
      sourceId, topicId: currentBySource.get(sourceId).topicId,
    })),
  };
}
