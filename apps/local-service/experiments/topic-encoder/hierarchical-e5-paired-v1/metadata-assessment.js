// Partial metadata evidence only, not body accuracy or a release-gate assessor.
import assert from 'node:assert/strict';

export function validateMetadataGold(gold, { inventory, taxonomySha256, nodes }) {
  assert.equal(gold.schema,'hierarchy-metadata-partial-gold/v1');
  assert.equal(gold.status,'sealed');assert.equal(gold.modelOutputsSeen,false);
  assert.equal(gold.inventorySampleHash,inventory.sampleHash);assert.equal(gold.taxonomySha256,taxonomySha256);
  assert.ok(Array.isArray(gold.annotations));assert.equal(gold.annotations.length,inventory.sample.length);
  const expected=new Set(inventory.sample.map(row=>row.id)),seen=new Set();
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const rootOf=id=>{let n=byId.get(id);assert.ok(n);let depth=0;
    while(n.parentId!==null){assert.ok(++depth<=8);n=byId.get(n.parentId);assert.ok(n);}return n.id;};
  for(const row of gold.annotations){
    assert.ok(expected.has(row.id)&&!seen.has(row.id));seen.add(row.id);
    assert.ok(['clear','ambiguous','insufficient'].includes(row.status));
    assert.ok(Array.isArray(row.allowedRootIds)&&Array.isArray(row.deepestExplicitNodeIds));
    assert.equal(new Set(row.allowedRootIds).size,row.allowedRootIds.length);
    assert.equal(new Set(row.deepestExplicitNodeIds).size,row.deepestExplicitNodeIds.length);
    for(const root of row.allowedRootIds)assert.equal(rootOf(root),root);
    for(const node of row.deepestExplicitNodeIds)assert.ok(row.allowedRootIds.includes(rootOf(node)));
    if(row.status==='insufficient'){
      assert.equal(row.allowedRootIds.length,0);assert.equal(row.deepestExplicitNodeIds.length,0);
    }else assert.ok(row.allowedRootIds.length>0&&row.deepestExplicitNodeIds.length>0);
    if(row.status==='clear')assert.equal(row.allowedRootIds.length,1,'A clear root must be unique');
  }
  return gold;
}

export function assessMetadataRankings({ gold, result, weights, rankers, marginBands }) {
  assert.equal(result.independentHoldout,false);assert.equal(result.calibrated,false);
  const labels=new Map(gold.annotations.map(row=>[row.id,row]));
  const clear=gold.annotations.filter(row=>row.status==='clear').length;
  const report={schema:'hierarchy-metadata-development-assessment/v1',independentHoldout:false,
    measures:'title-explicit-root-ranking-compatibility-not-full-body-accuracy-or-specificity',
    denominators:{total:gold.annotations.length,clear,ambiguous:gold.annotations.filter(r=>r.status==='ambiguous').length,
      insufficient:gold.annotations.filter(r=>r.status==='insufficient').length},comparisons:[]};
  for(const bodyWeight of weights)for(const ranker of rankers){
    const rows=result.outcomes.filter(row=>row.bodyWeight===bodyWeight);
    assert.equal(rows.length,gold.annotations.length);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
    for(const minMargin of marginBands){
      let comparableRanked=0,metadataRootCompatible=0,metadataRootDisagrees=0,rankedUnknown=0,unavailable=0;
      for(const row of rows){
        const label=labels.get(row.id);assert.ok(label);
        if(row.status==='unavailable'){unavailable++;continue;}
        assert.equal(row.status,'ranked-not-assigned');
        const ranking=row.rankers[ranker];assert.ok(ranking);
        if(ranking.rootMargin<minMargin)continue;
        if(label.status!=='clear'){rankedUnknown++;continue;}
        comparableRanked++;
        if(label.allowedRootIds.includes(ranking.topRoots[0].nodeId))metadataRootCompatible++;
        else metadataRootDisagrees++;
      }
      report.comparisons.push({bodyWeight,ranker,minMargin,comparableRanked,metadataRootCompatible,
        metadataRootDisagrees,rankedUnknown,unavailable,
        clearMetadataCoverage:clear?comparableRanked/clear:null,
        metadataRootCompatibility:comparableRanked?metadataRootCompatible/comparableRanked:null});
    }
  }
  return report;
}
