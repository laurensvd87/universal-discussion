import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMetadataGold,assessMetadataRankings } from './metadata-assessment.js';
const nodes=[{id:'root',parentId:null},{id:'child',parentId:'root'},{id:'other',parentId:null}];
const inventory={sampleHash:'sample',sample:[{id:'one'},{id:'two'},{id:'three'}]};
const make=()=>({schema:'hierarchy-metadata-partial-gold/v1',status:'sealed',modelOutputsSeen:false,
  inventorySampleHash:'sample',taxonomySha256:'taxonomy',annotations:[
    {id:'one',status:'clear',allowedRootIds:['root'],deepestExplicitNodeIds:['child']},
    {id:'two',status:'ambiguous',allowedRootIds:['root','other'],deepestExplicitNodeIds:['root','other']},
    {id:'three',status:'insufficient',allowedRootIds:[],deepestExplicitNodeIds:[]}]});
const validate=gold=>validateMetadataGold(gold,{inventory,taxonomySha256:'taxonomy',nodes});
test('sealed partial labels cover each inventory ID and bind taxonomy before predictions',()=>{
  assert.equal(validate(make()).annotations.length,3);
  for(const mutate of [g=>g.status='working',g=>g.modelOutputsSeen=true,g=>g.taxonomySha256='wrong',
    g=>g.annotations[1].id='one',g=>g.annotations.pop(),g=>g.annotations[0].allowedRootIds=['child'],
    g=>g.annotations[0].deepestExplicitNodeIds=['other'],g=>g.annotations[2].allowedRootIds=['root']]){
    const g=make();mutate(g);assert.throws(()=>validate(g));
  }
});
test('unknown titles are not negatives; deeper body paths are not specificity errors',()=>{
  const gold=validate(make());
  const result={independentHoldout:false,calibrated:false,outcomes:inventory.sample.map(row=>({
    id:row.id,bodyWeight:1,status:'ranked-not-assigned',rankers:{union:{rootMargin:.03,
      topRoots:[{nodeId:'root',score:.8}],forcedRankingPathNotAssignment:['root','child']}}}))};
  const report=assessMetadataRankings({gold,result,weights:[1],rankers:['union'],marginBands:[0,.04]});
  assert.deepEqual(report.denominators,{total:3,clear:1,ambiguous:1,insufficient:1});
  assert.equal(report.comparisons[0].metadataRootCompatible,1);assert.equal(report.comparisons[0].rankedUnknown,2);
  assert.equal(report.comparisons[1].metadataRootCompatibility,null);
  assert.equal('specificityAccuracy' in report,false);
});
