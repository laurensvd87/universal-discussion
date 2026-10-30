// Support-aware variant of the held nearest-ancestor experiment. A single
// labelled training page must not create transferable fine-topic confidence.
// Source/material independence must still be established by a real producer.
import {chooseTopicAncestor} from './topic-ancestor-neighbors.js';
export function chooseSupportedTopicAncestor(rawJson,minimumSupportingSources = 2) {
  if ((arguments.length !== 1 && arguments.length !== 2) || !Number.isInteger(minimumSupportingSources) ||
      minimumSupportingSources < 2 || minimumSupportingSources > 16) throw new TypeError('Invalid topic support selection');
  chooseTopicAncestor(rawJson); // Preserve every original input/tree/owner bound.
  const input = JSON.parse(rawJson), support = new Map();
  for (const row of input.neighbors) for (const node of row.path) support.set(node,(support.get(node) ?? 0)+1);
  let pruned = 0, removed = 0;
  input.neighbors = input.neighbors.flatMap(row => {
    let length = 0;
    while (length < row.path.length && support.get(row.path[length]) >= minimumSupportingSources) length++;
    if (length < row.path.length) pruned++;
    if (length === 0) { removed++; return []; }
    return [{...row,path:row.path.slice(0,length)}];
  });
  const result = chooseTopicAncestor(JSON.stringify(input));
  return {...result,schema:'topic-supported-neighbors/v1',minimumSupportingSources,
    supportPrunedNeighbors:pruned,unsupportedNeighborsRemoved:removed,
    scope:{...result.scope,supportIndependenceVerified:false}};
}
