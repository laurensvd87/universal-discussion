// Pure bounded selection from already scored, already labelled neighbors.
// The caller must independently establish embedding/Source/topic freshness.
// Relative agreement is not calibrated semantic confidence or write authority.
const need = value => { if (!value) throw new TypeError('Invalid topic neighbor selection'); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value);
const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export function chooseTopicAncestor(rawJson) {
  need(arguments.length === 1 && typeof rawJson === 'string' && rawJson.length <= 1048576);
  const input = JSON.parse(rawJson);
  need(shape(input,['neighbors','minimumSimilarity','ambiguityMargin','ownerGrouping']) &&
    Array.isArray(input.neighbors) && input.neighbors.length <= 128 &&
    Number.isFinite(input.minimumSimilarity) && input.minimumSimilarity >= .8 && input.minimumSimilarity <= 1 &&
    Number.isFinite(input.ambiguityMargin) && input.ambiguityMargin >= 0 && input.ambiguityMargin <= .1);
  const parents = new Map(), sources = new Set();
  for (const row of input.neighbors) {
    need(shape(row,['sourceId','path','similarity']) && id(row.sourceId) && !sources.has(row.sourceId) &&
      Array.isArray(row.path) && row.path.length > 0 && row.path.length <= 8 && row.path.every(id) &&
      new Set(row.path).size === row.path.length && Number.isFinite(row.similarity) && row.similarity >= -1 && row.similarity <= 1);
    sources.add(row.sourceId);
    row.path.forEach((node,index) => {
      const parent = row.path[index - 1] ?? null;
      need(!parents.has(node) || parents.get(node) === parent); parents.set(node,parent);
    });
  }
  const owner = input.ownerGrouping;
  need(shape(owner,['defaultMaxDepth','overrides']) && Number.isInteger(owner.defaultMaxDepth) &&
    owner.defaultMaxDepth >= 1 && owner.defaultMaxDepth <= 8 && Array.isArray(owner.overrides) && owner.overrides.length <= 512);
  const rules = new Map();
  for (const rule of owner.overrides) {
    need(shape(rule,['nodeId','maxDepth']) && id(rule.nodeId) && !rules.has(rule.nodeId) &&
      Number.isInteger(rule.maxDepth) && rule.maxDepth >= 1 && rule.maxDepth <= 8);
    // A policy may refer to other branches outside this bounded query cohort.
    const witnessed = input.neighbors.find(row => row.path.includes(rule.nodeId));
    need(!witnessed || rule.maxDepth >= witnessed.path.indexOf(rule.nodeId) + 1);
    rules.set(rule.nodeId,rule.maxDepth);
  }
  const eligible = input.neighbors.filter(row => row.similarity >= input.minimumSimilarity)
    .sort((a,b) => b.similarity - a.similarity || (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const best = eligible[0]?.similarity ?? null;
  const contenders = best === null ? [] : eligible.filter(row => best - row.similarity <= input.ambiguityMargin + 1e-12);
  let supportedPath = contenders.length ? [...contenders[0].path] : [];
  for (const contender of contenders.slice(1)) {
    let length = 0;
    while (length < supportedPath.length && supportedPath[length] === contender.path[length]) length++;
    supportedPath = supportedPath.slice(0,length);
  }
  let maxDepth = owner.defaultMaxDepth;
  for (const node of supportedPath) if (rules.has(node)) maxDepth = rules.get(node);
  const selectedPath = supportedPath.slice(0,maxDepth);
  const distinctLeaves = new Set(contenders.map(row => row.path.at(-1))).size;
  return {schema:'topic-ancestor-neighbors/v1',supportedPath,selectedPath,bestSimilarity:best,
    eligibleNeighbors:eligible.length,contenderNeighbors:contenders.length,distinctContenderLeaves:distinctLeaves,
    reason:best === null ? 'below-minimum' : !supportedPath.length ? 'different-roots' :
      selectedPath.length < supportedPath.length ? 'owner-depth-cut' : distinctLeaves > 1 ? 'shared-ancestor' : 'neighbor-subject',
    scope:{experimental:true,semanticConfidenceCalibrated:false,sourceWitnessesVerified:false,assignmentAuthority:false,liveChanged:false}};
}
