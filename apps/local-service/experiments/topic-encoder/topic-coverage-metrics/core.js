// Pure evaluation of provisional Topic groups. No corpus or vector access.
function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function pairKey(a, b) {
  return a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]);
}

export function evaluateTopicCoverage(documents, predictedEdges) {
  if (!Array.isArray(documents) || !Array.isArray(predictedEdges) ||
      documents.length > 1200 || predictedEdges.length > 100000)
    throw new TypeError('Expected document and edge arrays');
  const docs = documents.map(doc => {
    if (!doc || typeof doc !== 'object') throw new TypeError('Invalid document');
    return {
      id: requiredString(doc.id, 'id'),
      eventKey: requiredString(doc.eventKey, 'eventKey'),
      lang: requiredString(doc.lang, 'lang'),
      sourceKey: doc.duplicateKey === undefined ? doc.id : requiredString(doc.duplicateKey, 'duplicateKey')
    };
  }).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const byId = new Map();
  const sourceEvents = new Map();
  for (const doc of docs) {
    if (byId.has(doc.id)) throw new TypeError('Duplicate document id');
    byId.set(doc.id, doc);
    if (sourceEvents.has(doc.sourceKey) && sourceEvents.get(doc.sourceKey) !== doc.eventKey)
      throw new TypeError('duplicateKey spans different events');
    sourceEvents.set(doc.sourceKey, doc.eventKey);
  }

  const parent = new Map(docs.map(doc => [doc.id, doc.id]));
  function find(id) {
    const p = parent.get(id);
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  }
  function union(a, b) {
    const x = find(a), y = find(b);
    if (x !== y) parent.set(x, y);
  }
  const uniqueEdges = new Set();
  const direct = {trueEdges: 0, falseEdges: 0, crossLanguageTrueEdges: 0};
  const adjustedDirect = {trueEdges: new Set(), falseEdges: new Set(), crossLanguageTrueEdges: new Set()};
  for (const edge of predictedEdges) {
    if (!Array.isArray(edge) || edge.length !== 2 || !byId.has(edge[0]) || !byId.has(edge[1]) || edge[0] === edge[1])
      throw new TypeError('Invalid predicted edge');
    const edgeId = pairKey(edge[0], edge[1]);
    if (uniqueEdges.has(edgeId)) continue;
    uniqueEdges.add(edgeId);
    union(edge[0], edge[1]);
    const a = byId.get(edge[0]), b = byId.get(edge[1]);
    const same = a.eventKey === b.eventKey;
    const sourcePair = pairKey(a.sourceKey, b.sourceKey);
    if (same) {
      direct.trueEdges++;
      if (a.lang !== b.lang) direct.crossLanguageTrueEdges++;
      if (a.sourceKey !== b.sourceKey) {
        adjustedDirect.trueEdges.add(sourcePair);
        if (a.lang !== b.lang) adjustedDirect.crossLanguageTrueEdges.add(sourcePair);
      }
    } else {
      direct.falseEdges++;
      adjustedDirect.falseEdges.add(sourcePair);
    }
  }

  const groups = new Map(), events = new Map();
  for (const doc of docs) {
    const root = find(doc.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(doc);
    if (!events.has(doc.eventKey)) events.set(doc.eventKey, []);
    events.get(doc.eventKey).push(doc);
  }
  const gold = {truePairs: 0, falsePairs: 0, crossLanguageTruePairs: 0};
  const grouped = {
    truePairs: 0, falsePairs: 0, crossLanguageTruePairs: 0,
    articlesInPureNonSingletonGroups: 0, articlesInMixedGroups: 0,
    articlesWithCrossLanguagePeer: 0, completeEvents: 0,
    singletonGroups: 0, goldSingletonEvents: 0,
    averageOtherSameEventPagesPerRootPost: 0
  };
  const adjustedGold = {truePairs: new Set(), falsePairs: new Set(), crossLanguageTruePairs: new Set()};
  const adjustedGrouped = {truePairs: new Set(), falsePairs: new Set(), crossLanguageTruePairs: new Set()};
  const peers = new Map(docs.map(doc => [doc.id, new Set()]));
  const uniqueSourcePeers = new Map([...sourceEvents.keys()].map(key => [key, new Set()]));
  const crossLanguagePeerDocs = new Set(), crossLanguagePeerSources = new Set();

  function countPair(a, b, inGroup) {
    const same = a.eventKey === b.eventKey;
    const crossLanguage = a.lang !== b.lang;
    const independent = a.sourceKey !== b.sourceKey;
    const sourcePair = independent ? pairKey(a.sourceKey, b.sourceKey) : null;
    if (same) {
      gold.truePairs++;
      if (crossLanguage) gold.crossLanguageTruePairs++;
      if (independent) {
        adjustedGold.truePairs.add(sourcePair);
        if (crossLanguage) adjustedGold.crossLanguageTruePairs.add(sourcePair);
      }
    } else {
      gold.falsePairs++;
      adjustedGold.falsePairs.add(sourcePair);
    }
    if (!inGroup) return;
    if (same) {
      grouped.truePairs++;
      peers.get(a.id).add(b.id);
      peers.get(b.id).add(a.id);
      if (crossLanguage) {
        grouped.crossLanguageTruePairs++;
        crossLanguagePeerDocs.add(a.id);
        crossLanguagePeerDocs.add(b.id);
      }
      if (independent) {
        adjustedGrouped.truePairs.add(sourcePair);
        uniqueSourcePeers.get(a.sourceKey).add(b.sourceKey);
        uniqueSourcePeers.get(b.sourceKey).add(a.sourceKey);
        if (crossLanguage) {
          adjustedGrouped.crossLanguageTruePairs.add(sourcePair);
          crossLanguagePeerSources.add(a.sourceKey);
          crossLanguagePeerSources.add(b.sourceKey);
        }
      }
    } else {
      grouped.falsePairs++;
      adjustedGrouped.falsePairs.add(sourcePair);
    }
  }
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++)
      countPair(docs[i], docs[j], find(docs[i].id) === find(docs[j].id));
  }

  const pureGroupSources = new Set(), mixedGroupSources = new Set();
  for (const members of groups.values()) {
    const mixed = new Set(members.map(doc => doc.eventKey)).size > 1;
    if (members.length === 1) grouped.singletonGroups++;
    if (mixed) {
      grouped.articlesInMixedGroups += members.length;
      for (const doc of members) mixedGroupSources.add(doc.sourceKey);
    } else if (members.length > 1) {
      grouped.articlesInPureNonSingletonGroups += members.length;
      if (new Set(members.map(doc => doc.sourceKey)).size > 1)
        for (const doc of members) pureGroupSources.add(doc.sourceKey);
    }
  }
  for (const members of events.values()) {
    if (members.length === 1) grouped.goldSingletonEvents++;
    const root = find(members[0].id);
    const group = groups.get(root);
    if (members.length > 1 && members.every(doc => find(doc.id) === root) &&
        group.length === members.length)
      grouped.completeEvents++;
  }
  grouped.articlesWithCrossLanguagePeer = crossLanguagePeerDocs.size;
  grouped.averageOtherSameEventPagesPerRootPost = docs.length
    ? [...peers.values()].reduce((sum, set) => sum + set.size, 0) / docs.length : 0;
  const duplicateAdjusted = {
    distinctSources: sourceEvents.size,
    gold: {
      truePairs: adjustedGold.truePairs.size,
      falsePairs: adjustedGold.falsePairs.size,
      crossLanguageTruePairs: adjustedGold.crossLanguageTruePairs.size
    },
    direct: Object.fromEntries(Object.entries(adjustedDirect).map(([key, set]) => [key, set.size])),
    grouped: {
      truePairs: adjustedGrouped.truePairs.size,
      falsePairs: adjustedGrouped.falsePairs.size,
      crossLanguageTruePairs: adjustedGrouped.crossLanguageTruePairs.size,
      sourcesInPureNonSingletonGroups: pureGroupSources.size,
      sourcesInMixedGroups: mixedGroupSources.size,
      sourcesWithCrossLanguagePeer: crossLanguagePeerSources.size,
      averageOtherSameEventSourcesPerRootPost: sourceEvents.size
        ? [...uniqueSourcePeers.values()].reduce((sum, set) => sum + set.size, 0) / sourceEvents.size : 0
    }
  };
  return {documents: docs.length, predictedEdges: uniqueEdges.size, gold, direct, grouped, duplicateAdjusted};
}
