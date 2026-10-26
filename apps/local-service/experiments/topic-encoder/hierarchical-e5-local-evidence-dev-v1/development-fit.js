// Development-only cut fitting. Reused calibration is optimization, not quality
// evidence or a probability. No encoder, filesystem, DB or network dependencies.
import assert from 'node:assert/strict';

export const DEVELOPMENT_GRID = Object.freeze({
  minSimilarity: Object.freeze(Array.from({length:15}, (_,i)=>Number((.70+.02*i).toFixed(2)))),
  minRivalMargin: Object.freeze([0,.005,.01,.02,.03,.05]),
  minNegativeMargin: Object.freeze([0,.01,.03]), minSupport: Object.freeze([1,2]),
});

/** Root-only gold says nothing about SAME-root children. Complete maximum paths
 * can label children; a different known central root is outside this branch in
 * this explicitly single-central-subject experiment, not a public API rule. */
export function developmentNodeTruth(row, path) {
  assert.ok(Array.isArray(path)&&path.length>0&&path.length<=8);
  if (row.completePath !== null) {
    assert.ok(Array.isArray(row.completePath)&&row.completePath.length<=8);
    return row.completePath.includes(path.at(-1));
  }
  assert.equal(typeof row.expectedRootId,'string');
  if (path.length===1) return path[0]===row.expectedRootId;
  return path[0]===row.expectedRootId ? null : false;
}

export function developmentFeatureAccepts(feature, cut) {
  if (feature.bestSimilarity===null || feature.bestSimilarity<cut.minSimilarity) return false;
  let support=0;
  // The scorer returns the strongest eight independent groups. Cuts use support
  // <=2, so omission of weaker groups cannot change this acceptance decision.
  for (const g of feature.positiveSimilarities) if (g.similarity>=cut.minSimilarity) support++;
  if (support<cut.minSupport) return false;
  if (feature.negativeSimilarity!==null && (!(feature.bestSimilarity>feature.negativeSimilarity) ||
      feature.bestSimilarity-feature.negativeSimilarity<cut.minNegativeMargin)) return false;
  if (feature.bestIncompatiblePositive!==null &&
      feature.bestSimilarity-feature.bestIncompatiblePositive<cut.minRivalMargin) return false;
  return true;
}

export function fitDevelopmentNodeCuts({nodes,rows,minimumAcceptedGroups=3}) {
  assert.ok(Array.isArray(nodes)&&nodes.length>0&&nodes.length<=512);
  assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=512);
  // Refuse excessive search before the grid loop, not after doing the work.
  assert.ok(nodes.length*rows.length*540<=16_000_000,'Development search capacity');
  assert.equal(minimumAcceptedGroups,3);
  const byId=new Map(nodes.map(n=>[n.id,n])); assert.equal(byId.size,nodes.length);
  const groups=new Set(),features=new Map();
  for (const row of rows) {
    assert.equal(typeof row.groupId,'string'); assert.ok(!groups.has(row.groupId));groups.add(row.groupId);
    assert.equal(row.features.length,nodes.length);
    const map=new Map(row.features.map(f=>[f.nodeId,f]));assert.equal(map.size,nodes.length);
    for (const node of nodes) assert.ok(map.has(node.id));
    features.set(row,map);
  }
  const policies=[],audit=[];let evaluations=0;
  for (const node of nodes) {
    const path=[];let cursor=node;
    while(cursor){assert.ok(path.length<8&&!path.includes(cursor.id));path.unshift(cursor.id);
      if(cursor.parentId!==null)assert.ok(byId.has(cursor.parentId));cursor=byId.get(cursor.parentId);}
    const known=rows.map(row=>({truth:developmentNodeTruth(row,path),feature:features.get(row).get(node.id)})).filter(r=>r.truth!==null);
    let best=null;
    for(const minSimilarity of DEVELOPMENT_GRID.minSimilarity)
      for(const minRivalMargin of DEVELOPMENT_GRID.minRivalMargin)
        for(const minNegativeMargin of DEVELOPMENT_GRID.minNegativeMargin)
          for(const minSupport of DEVELOPMENT_GRID.minSupport){
            const cut={minSimilarity,minRivalMargin,minNegativeMargin,minSupport};let positive=0,wrong=0;
            for(const row of known){evaluations++;if(developmentFeatureAccepts(row.feature,cut)){
              if(row.truth)positive++;else wrong++;}}
            if(wrong||positive<minimumAcceptedGroups)continue;
            const rank=[positive,minSimilarity,minRivalMargin,minNegativeMargin,minSupport];
            if(!best||rank.some((v,i)=>v!==best.rank[i]&&rank.slice(0,i).every((x,j)=>x===best.rank[j])&&v>best.rank[i]))
              best={cut,rank,positive};
          }
    const cut=best?.cut??{minSimilarity:1,minRivalMargin:2,minNegativeMargin:2,minSupport:2};
    policies.push({nodeId:node.id,enabled:best!==null,...cut});
    audit.push({nodeId:node.id,enabled:best!==null,acceptedPositiveGroups:best?.positive??0,
      knownRows:known.length,unknownRows:rows.length-known.length,knownErrors:0});
  }
  assert.ok(evaluations<=16_000_000);
  return {policies,audit,countedFeatureEvaluations:evaluations,developmentOptimizationOnly:true,
    independentValidation:false,productionValidated:false,assignmentAuthority:false};
}
