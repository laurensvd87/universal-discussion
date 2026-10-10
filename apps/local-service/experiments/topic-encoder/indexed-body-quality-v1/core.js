// Aggregate-only evaluation. Event labels never influence production planning.
export function aggregatePartition(rows, partitions) {
  const labels = new Map(rows.map(row => [row.id, row.eventKey]));
  const covered = partitions.flatMap(part => part.sourceIds);
  if (labels.size !== rows.length || covered.length !== rows.length || new Set(covered).size !== rows.length ||
      covered.some(id => !labels.has(id)) || partitions.some(part => !part.sourceIds.length)) throw new TypeError('PARTITION');
  let purePages = 0, mixedPages = 0, pureGroups = 0, mixedGroups = 0, correctGroupedPairs = 0, falseGroupedPairs = 0;
  for (const { sourceIds } of partitions) {
    if (sourceIds.length < 2) continue;
    if (new Set(sourceIds.map(id => labels.get(id))).size === 1) { purePages += sourceIds.length; pureGroups++; }
    else { mixedPages += sourceIds.length; mixedGroups++; }
    for (let i = 0; i < sourceIds.length; i++) for (let j = i + 1; j < sourceIds.length; j++) {
      if (labels.get(sourceIds[i]) === labels.get(sourceIds[j])) correctGroupedPairs++;
      else falseGroupedPairs++;
    }
  }
  return { rows: rows.length, purePages, mixedPages, pureGroups, mixedGroups, correctGroupedPairs, falseGroupedPairs };
}

export function policyDifference(rows, before, after) {
  const groupMap = partitions => new Map(partitions.flatMap((part, index) => part.sourceIds.map(id => [id, index])));
  aggregatePartition(rows, before); aggregatePartition(rows, after);
  const a = groupMap(before), b = groupMap(after);
  const result = { addedCorrect: 0, addedFalse: 0, removedCorrect: 0, removedFalse: 0 };
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const previous = a.get(rows[i].id) === a.get(rows[j].id), next = b.get(rows[i].id) === b.get(rows[j].id);
    if (previous === next) continue;
    result[`${next ? 'added' : 'removed'}${rows[i].eventKey === rows[j].eventKey ? 'Correct' : 'False'}`]++;
  }
  return result;
}
