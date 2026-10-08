// Labels enter only here, after a matcher has returned its partition.
const pairKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

export function normalizedPartition(documents, partitions) {
  if (!Array.isArray(documents) || !Array.isArray(partitions)) throw new TypeError('Invalid partition');
  const ids = new Set(documents.map(row => row.id));
  if (ids.size !== documents.length) throw new TypeError('Duplicate document ID');
  const seen = new Set();
  const result = partitions.map(part => {
    const members = Array.isArray(part) ? part : part?.sourceIds;
    if (!Array.isArray(members) || !members.length) throw new TypeError('Empty partition');
    for (const id of members) {
      if (!ids.has(id) || seen.has(id)) throw new TypeError('Missing, unknown or repeated partition member');
      seen.add(id);
    }
    return [...members].sort();
  });
  if (seen.size !== ids.size) throw new TypeError('Partition does not cover all documents');
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}

export function joinedPairs(partitions) {
  const joined = new Set();
  for (const part of partitions) for (let i = 0; i < part.length; i++)
    for (let j = i + 1; j < part.length; j++) joined.add(pairKey(part[i], part[j]));
  return joined;
}

export function scorePartition(documents, partitions) {
  const groups = normalizedPartition(documents, partitions);
  const joined = joinedPairs(groups);
  let tp = 0, fp = 0, fn = 0, tn = 0, sameEntityFalseJoins = 0;
  let opposingViewPairs = 0, opposingViewJoined = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    const same = a.topicLabel === b.topicLabel;
    const linked = joined.has(pairKey(a.id, b.id));
    if (same && linked) tp++;
    else if (same) fn++;
    else if (linked) {
      fp++;
      if (a.family === b.family) sameEntityFalseJoins++;
    } else tn++;
    if (same && a.viewpoint && b.viewpoint && a.viewpoint !== b.viewpoint) {
      opposingViewPairs++;
      if (linked) opposingViewJoined++;
    }
  }
  const topicCounts = new Map();
  for (const row of documents) topicCounts.set(row.topicLabel, (topicCounts.get(row.topicLabel) ?? 0) + 1);
  const singletonRows = documents.filter(row => topicCounts.get(row.topicLabel) === 1);
  const owner = new Map(groups.flatMap((group, i) => group.map(id => [id, i])));
  const pure = groups.filter(group => {
    const labels = new Set(group.map(id => documents.find(row => row.id === id).topicLabel));
    return labels.size === 1;
  });
  const groupedTopics = new Map();
  for (const row of documents) {
    if (!groupedTopics.has(row.topicLabel)) groupedTopics.set(row.topicLabel, new Set());
    groupedTopics.get(row.topicLabel).add(owner.get(row.id));
  }
  return {
    pages: documents.length, goldTopics: topicCounts.size, predictedTopics: groups.length,
    pairs: { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null },
    sameEntityFalseJoins,
    opposingView: { joined: opposingViewJoined, total: opposingViewPairs },
    components: { pure: pure.length, total: groups.length,
      purePages: pure.reduce((sum, group) => sum + group.length, 0),
      exactlyRecoveredTopics: [...groupedTopics].filter(([label, indexes]) =>
        indexes.size === 1 && groups[[...indexes][0]].length === topicCounts.get(label)).length },
    noMatch: { abstained: singletonRows.filter(row => groups[owner.get(row.id)].length === 1).length,
      total: singletonRows.length },
  };
}

export function pairStability(before, after, oldIds) {
  const prior = joinedPairs(before), next = joinedPairs(after);
  let changed = 0, total = 0;
  const ids = [...oldIds];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    total++;
    const key = pairKey(ids[i], ids[j]);
    if (prior.has(key) !== next.has(key)) changed++;
  }
  return { changed, total };
}

export function auditVectors(documents, vectors, floor = 0.90) {
  const norms = documents.map(row => {
    const vector = vectors.get(row.id);
    if (!vector || vector.length !== 384 || vector.some(value => !Number.isFinite(value)))
      throw new TypeError('Invalid benchmark vector');
    return Math.hypot(...vector);
  });
  let sameAboveFloor = 0, sameTotal = 0, differentAboveFloor = 0, differentTotal = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const score = vectors.get(documents[i].id).reduce((sum, x, index) =>
      sum + x * vectors.get(documents[j].id)[index], 0);
    if (documents[i].topicLabel === documents[j].topicLabel) {
      sameTotal++;
      if (score >= floor) sameAboveFloor++;
    } else {
      differentTotal++;
      if (score >= floor) differentAboveFloor++;
    }
  }
  return { dimensions: 384, floor, normRange: [Math.min(...norms), Math.max(...norms)],
    sameAboveFloor, sameTotal, differentAboveFloor, differentTotal };
}
