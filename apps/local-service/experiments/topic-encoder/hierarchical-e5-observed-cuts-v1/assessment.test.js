import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {trainHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {calibrateHierarchyHeadPolicy as calibrateFixed} from '../../../src/domain/hierarchical-e5-paired-head-policy.js';
import {calibrateHierarchyHeadPolicy as calibrateObserved} from '../../../src/domain/hierarchical-e5-observed-head-policy.js';
import {evaluateFrozenHeads,wilson95} from './assessment.js';

// Fresh analytic geometry only: no experiment corpus, model file, Source or encoder.
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
const hash=s=>createHash('sha256').update(s).digest('hex');
const nodes=[{id:'games',parentId:null},{id:'gta',parentId:'games'},{id:'gta-online',parentId:'gta'},
  {id:'minecraft',parentId:'games'},{id:'nature',parentId:null},{id:'koalas',parentId:'nature'}];
const classes=[['gta-online',0],['gta',1],['games',2],['minecraft',3],['koalas',4],['nature',5],[null,6]];
function rows(split){return classes.flatMap(([expectedTopicId,direction],k)=>[0,1,2].map(i=>({id:`assessment-fresh-${split}-${k}-${i}`,
  groupId:`assessment-fresh-${split}-family-${k}-${i}`,split,language:['en','de','fr'][i],expectedTopicId,vector:axis(direction)})));}
function fixture(method){
  const model=trainHierarchyLinearHeads({nodes,rows:rows('training').map(({language,...r})=>r),
    representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),trainingVersion:'assessment-new-geometric-only',lambda:.1});
  const fit=method==='observed'?calibrateObserved:calibrateFixed;
  const policy=fit({model,rows:rows('calibration'),minimumAcceptedGroups:3,targetPrecision:1});
  return {model,policy,method};
}
const row=(id,direction,expectedTopicId,language='en')=>({id:`assessment-fresh-test-${id}`,groupId:`assessment-fresh-test-family-${id}`,
  split:'test',language,expectedTopicId,vector:axis(direction)});

for(const method of ['observed','baseline']){
  test(`${method}: full paths, depth slices, honest synthetic scope and fixed artifacts`,()=>{
    const f=fixture(method),before=JSON.stringify(f),samples=classes.map(([gold,i])=>row(String(i),i,gold));
    const report=evaluateFrozenHeads({...f,rows:samples});
    assert.equal(JSON.stringify(f),before);assert.equal(report.rowCount,7);assert.equal(report.accepted,6);
    assert.equal(report.safeAccepted,6);assert.equal(report.correctDeepestOutcome,7);assert.equal(report.broadFallback,0);
    assert.equal(report.leafAccepted,3);assert.equal(report.leafCorrect,3);assert.equal(report.wrongBroad,0);
    assert.deepEqual(report.outcomes[0].supportedPath,['games','gta','gta-online']);
    assert.deepEqual(report.outcomes[0].goldPath,['games','gta','gta-online']);assert.equal(report.outcomes[0].predictedDepth,3);
    assert.deepEqual(report.outcomes.at(-1).supportedPath,[]);assert.deepEqual(report.outcomes.at(-1).goldPath,[]);
    assert.equal(report.byGoldDepth.find(s=>s.value===3).deepestCorrect,1);assert.equal(report.byPredictedDepth.find(s=>s.value===0).rows,1);
    assert.equal(report.declaredAuthoredGroups,7);assert.equal(report.independentlyValidatedRealWebOrigins,0);
    assert.equal(report.groupIndependenceValidated,false);assert.equal(report.assignmentAuthority,false);assert.equal(report.productionReady,false);
    assert.equal(report.gate.productionValidated,false);assert.equal(report.gate.representativeWebValidation,false);
    assert.equal(report.gate.enoughIndependentLeafDecisions,false);assert.ok(report.leafPrecisionInterval95.lower<.98);
    assert.ok(report.broadErrorInterval95.upper>.01);assert.ok(Number.isFinite(report.timing.p95Ms));
    assert.equal(JSON.stringify(report).includes('"vector"'),false);
  });

  test(`${method}: broad fallback, cross-branch errors, overspecificity and sibling errors stay separate`,()=>{
    const f=fixture(method),samples=[row('broad',2,'gta-online'),row('cross',4,'gta-online','de'),row('outside',3,null),
      row('over',0,'games'),row('sibling',3,'gta-online','fr'),row('abstain',7,null),row('deep',0,'gta-online')];
    const r=evaluateFrozenHeads({...f,rows:samples});
    assert.equal(r.accepted,6);assert.equal(r.safeAccepted,2);assert.equal(r.broadFallback,1);
    assert.equal(r.wrongBroad,2);assert.equal(r.wrongSameBranch,2);assert.equal(r.overSpecificSameBranch,1);assert.equal(r.wrongSiblingOrCousin,1);
    assert.equal(r.leafAccepted,5);assert.equal(r.leafCorrect,1);assert.equal(r.correctDeepestOutcome,2);
    assert.equal(r.byLanguage.find(s=>s.value==='de').safeAccepted,0);assert.equal(r.outcomes[0].safeAccepted,true);
    assert.deepEqual(r.outcomes[0].supportedPath,['games']);assert.deepEqual(r.outcomes[0].goldPath,['games','gta','gta-online']);
    assert.equal(r.outcomes[5].primaryNodeId,null);assert.equal(r.outcomes[5].exactOutcome,true);
  });

  test(`${method}: training/calibration/development/additional origins cannot enter the test`,()=>{
    const f=fixture(method);
    for(const key of ['id','groupId']){
      for(const split of ['training','calibration']){
        const sample=row('provenance',0,'gta-online');sample[key]=rows(split)[0][key];
        assert.throws(()=>evaluateFrozenHeads({...f,rows:[sample]}),/provenance/);
      }
      const sample=row('blocked',0,'gta-online'),blockedHash=hash(sample[key]);
      const developmentKey=key==='id'?'developmentIdHashes':'developmentGroupHashes';
      const additionalKey=key==='id'?'additionalForbiddenIdHashes':'additionalForbiddenGroupHashes';
      assert.throws(()=>evaluateFrozenHeads({...f,rows:[sample],[developmentKey]:[blockedHash]}),/provenance/);
      assert.throws(()=>evaluateFrozenHeads({...f,rows:[sample],[additionalKey]:[blockedHash]}),/provenance/);
    }
    const a=row('a',0,'gta-online'),b=row('b',0,'gta-online');b.groupId=a.groupId;
    assert.throws(()=>evaluateFrozenHeads({...f,rows:[a,b]}));
  });

  test(`${method}: empty, malformed, wrong split/schema/identity and invalid vectors fail closed`,()=>{
    const f=fixture(method),sample=row('validation',0,'gta-online');
    for(const rows of [[],null,[{...sample,split:'calibration'}],[{...sample,expectedTopicId:'missing'}],
      [{...sample,vector:Array(384).fill(0)}],[{...sample,vector:axis(0).map(x=>2*x)}]])assert.throws(()=>evaluateFrozenHeads({...f,rows}));
    const wrong=structuredClone(f);wrong.policy.schema='forged-policy';assert.throws(()=>evaluateFrozenHeads({...wrong,rows:[sample]}));
    assert.throws(()=>evaluateFrozenHeads({...f,method:'guessed',rows:[sample]}));
    assert.throws(()=>evaluateFrozenHeads({...f,rows:[sample],developmentIdHashes:null}));
    const changed=structuredClone(f.model);changed.representationHash='b'.repeat(64);
    assert.throws(()=>evaluateFrozenHeads({...f,model:changed,rows:[sample]}));
  });
}

test('Wilson intervals remain descriptive and 150 perfect groups do not establish .98 lower confidence',()=>{
  const perfect=wilson95(150,150);assert.ok(perfect.lower<.98);assert.ok(perfect.upper<=1);
  assert.match(perfect.assumption,/independence-unverified/);assert.equal(wilson95(0,0),null);
  const noErrors=wilson95(0,142);assert.ok(noErrors.upper>.01);
  for(const args of [[-1,3],[4,3],[1.5,3],[0,-1],[0,Infinity]])assert.throws(()=>wilson95(...args));
});
