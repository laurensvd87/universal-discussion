import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {calibrateHierarchyHeadPolicy as calibratePolicy,compileHierarchyHeadAssignment as compile,classifyHierarchyHeads as classify,
  describeHierarchyHeadAssignment as describe,observedHeadPolicyWorkUpperBound,OBSERVED_HEAD_POLICY_LIMITS} from '../src/domain/hierarchical-e5-observed-head-policy.js';

// Fresh analytic axes ONLY. No previous experiment's corpus, vectors or scores.
const axis=(direction,sign=1)=>Array.from({length:384},(_,i)=>i===direction?sign:0);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const classes=[['gta',0],['minecraft',1],['games',2],['koalas',3],['nature',4],[null,5]];
const nodes=[{id:'games',parentId:null},{id:'gta',parentId:'games'},{id:'minecraft',parentId:'games'},
  {id:'nature',parentId:null},{id:'koalas',parentId:'nature'}];
function rows(split){return classes.flatMap(([expectedTopicId,direction],k)=>[0,1,2].map(i=>({id:`fresh-${split}-${k}-${i}`,
  groupId:`fresh-${split}-origin-${k}-${i}`,split,language:['en','de','fr'][i],expectedTopicId,vector:axis(direction)})));}
function model(){return trainHierarchyLinearHeads({nodes,rows:rows('training').map(({language,...r})=>r),
  representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),trainingVersion:'fresh-observed-geometry-v1',lambda:.1});}
const calibrate=(m=model(),r=rows('calibration'))=>calibratePolicy({model:m,rows:r,minimumAcceptedGroups:3,targetPrecision:1});
const witness=(i,sign=1)=>({sourceId:'fresh-probe',sourceVersion:'fresh-probe-v1',representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),vector:axis(i,sign)});
function parameters(m){m.parameterHash=digest({schema:m.schema,representation:m.representation,representationHash:m.representationHash,heads:m.heads});return m;}
function rehash(p){delete p.policyHash;p.policyHash=digest(p);return p;}
function rareModel(){
  const m=structuredClone(trainHierarchyLinearHeads({nodes:[{id:'rare',parentId:null}],
    rows:[0,1,2,3].map(i=>({id:`fresh-rare-train-${i}`,groupId:`fresh-rare-origin-${i}`,split:'training',expectedTopicId:i<2?'rare':null,vector:axis(0,i<2?1:-1)})),
    representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),trainingVersion:'fresh-rare-synthetic',lambda:1}));
  m.heads[0].weights.fill(0);m.heads[0].weights[0]=.075;m.heads[0].intercept=-.875;return parameters(m);
}
function rareRows(){return [0,1,2,3,4,5].map(i=>({id:`fresh-rare-cal-${i}`,groupId:`fresh-rare-cal-origin-${i}`,split:'calibration',language:'en',
  expectedTopicId:i<3?'rare':null,vector:axis(0,i<3?1:-1)}));}

test('observed cutpoint accepts reliable rare positives near -.8, not an invented score floor',()=>{
  const m=rareModel(),r=rareRows(),p=calibrate(m,r),rule=p.rules[0],handle=compile({model:m,policy:p});
  assert.equal(p.schema,'hierarchical-e5-observed-head-policy-v1');assert.equal(rule.enabled,true);
  assert.ok(Math.abs(rule.minScore-(-.8))<1e-12);assert.equal(rule.minMargin,0);assert.equal(rule.correctGroups,3);
  assert.equal(classify(handle,witness(0)).primaryNodeId,'rare');assert.equal(classify(handle,witness(0,-1)).primaryNodeId,null);
  assert.deepEqual(p.nodeObservations[0].scoreCutpoints,[-.95,-.8]);
  for(const value of [p,describe(handle),classify(handle,witness(0))]){
    assert.equal(value.experimental,true);assert.equal(value.productionValidated,false);assert.equal(value.assignmentAuthority,false);assert.ok(Object.isFrozen(value));
  }
});

test('whole score-tie groups cannot hide one outside negative behind three positives',()=>{
  const m=rareModel(),r=rareRows();r[3].vector=axis(0);
  const p=calibrate(m,r);assert.equal(p.rules[0].enabled,false);assert.equal(p.rules[0].acceptedGroups,0);
  assert.equal(classify(compile({model:m,policy:p}),witness(0)).status,'unresolved');
});

test('fresh held-out geometry supports children, parent stopping and outside/unknown rejection',()=>{
  const m=model(),p=calibrate(m),h=compile({model:m,policy:p});
  for(const [expected,i]of classes){const d=classify(h,witness(i));assert.equal(d.primaryNodeId,expected);if(expected==='gta')assert.deepEqual(d.paths,[['games','gta']]);}
  assert.equal(classify(h,witness(6)).status,'unresolved');assert.equal(classify(h,witness(2)).reason,'supported-parent-stop');
  assert.ok(p.nodeObservations.every(o=>o.marginCutpoints[0]===0&&o.marginCutpoints.slice(1).every(v=>v>0)));
});

test('sweep matches independent brute-force observed 2D enumeration including conservative ties',()=>{
  const m=model(),r=rows('calibration'),p=calibrate(m,r),compiled=compileHierarchyLinearHeads(m);
  const paths=new Map(nodes.map(n=>[n.id,n.parentId===null?[n.id]:[n.parentId,n.id]]));
  const scored=r.map(row=>({row,scores:scoreHierarchyLinearHeads(compiled,{...witness(0),vector:row.vector}).scores}));
  for(const node of nodes){
    const obs=p.nodeObservations.find(o=>o.nodeId===node.id),actual=p.rules.find(o=>o.nodeId===node.id);let best=null;
    for(const minScore of obs.scoreCutpoints)for(const minMargin of obs.marginCutpoints){
      let acceptedGroups=0,correctGroups=0;
      for(const sample of scored){
        const own=sample.scores.find(s=>s.nodeId===node.id),siblings=nodes.filter(n=>n.parentId===node.parentId&&n.id!==node.id)
          .map(n=>sample.scores.find(s=>s.nodeId===n.id)).filter(s=>s.enabled).map(s=>s.score);
        const margin=siblings.length?own.score-Math.max(...siblings):null;
        if(!own.enabled||own.score<minScore||margin!==null&&!(margin>0&&margin>=minMargin))continue;
        acceptedGroups++;if(sample.row.expectedTopicId!==null&&paths.get(sample.row.expectedTopicId).includes(node.id))correctGroups++;
      }
      if(acceptedGroups<3||acceptedGroups!==correctGroups)continue;
      const candidate={nodeId:node.id,enabled:true,minScore,minMargin,acceptedGroups,correctGroups};
      if(!best||correctGroups>best.correctGroups||correctGroups===best.correctGroups&&(acceptedGroups<best.acceptedGroups||acceptedGroups===best.acceptedGroups&&
        (minMargin>best.minMargin||minMargin===best.minMargin&&minScore>best.minScore)))best=candidate;
    }
    assert.deepEqual(actual,best??{nodeId:node.id,enabled:false,minScore:0,minMargin:0,acceptedGroups:0,correctGroups:0});
  }
});

test('zero sibling ties reject, and independent confident descendants cannot bypass root ambiguity',()=>{
  const m=structuredClone(model());for(const h of m.heads){h.weights.fill(0);h.weights[0]=1;h.intercept=0;}parameters(m);
  const p=calibrate(m);assert.ok(p.rules.filter(r=>['games','nature','gta','minecraft'].includes(r.nodeId)).every(r=>!r.enabled));
  assert.equal(classify(compile({model:m,policy:p}),witness(0)).status,'unresolved');
});

test('root contrast rejects a tie even when two descendant heads independently pass',()=>{
  const m=structuredClone(model());
  for(const h of m.heads){h.weights.fill(0);h.intercept=0;
    if(h.nodeId==='games'||h.nodeId==='nature')for(const i of [0,3,6])h.weights[i]=1;
    else if(h.nodeId==='gta')for(const i of [0,6])h.weights[i]=1;
    else if(h.nodeId==='koalas')for(const i of [3,6])h.weights[i]=1;
    else h.intercept=-1;
  }
  parameters(m);const p=calibrate(m),d=classify(compile({model:m,policy:p}),witness(6));
  assert.equal(d.features.find(f=>f.nodeId==='gta').accepted,true);
  assert.equal(d.features.find(f=>f.nodeId==='koalas').accepted,true);
  assert.equal(d.primaryNodeId,null);assert.equal(d.reason,'ambiguous-branches');
});

test('ambiguous cousin leaves fall back only to an independently supported common ancestor',()=>{
  const allNodes=[...nodes,{id:'leaf-one',parentId:'gta'},{id:'leaf-two',parentId:'minecraft'}];
  const remap=r=>({...r,expectedTopicId:r.expectedTopicId==='gta'?'leaf-one':r.expectedTopicId==='minecraft'?'leaf-two':r.expectedTopicId});
  const m=structuredClone(trainHierarchyLinearHeads({nodes:allNodes,rows:rows('training').map(remap).map(({language,...r})=>r),
    representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),trainingVersion:'fresh-cousin-geometry',lambda:.1}));
  for(const h of m.heads){h.weights.fill(0);h.intercept=0;
    if(h.nodeId==='games')for(const i of [0,1,2,6])h.weights[i]=1;
    if(h.nodeId==='nature')for(const i of [3,4])h.weights[i]=1;
    if(h.nodeId==='gta'||h.nodeId==='leaf-one')for(const i of [0,6])h.weights[i]=1;
    if(h.nodeId==='minecraft'||h.nodeId==='leaf-two')for(const i of [1,6])h.weights[i]=1;
    if(h.nodeId==='koalas')h.weights[3]=1;
  }
  parameters(m);const p=calibrate(m,rows('calibration').map(remap)),h=compile({model:m,policy:p}),d=classify(h,witness(6));
  assert.ok(d.features.find(f=>f.nodeId==='leaf-one').accepted&&d.features.find(f=>f.nodeId==='leaf-two').accepted);
  assert.equal(d.primaryNodeId,'games');assert.equal(d.reason,'supported-parent-stop');
  const disabled=structuredClone(p);disabled.rules.find(r=>r.nodeId==='games').enabled=false;
  Object.assign(disabled.rules.find(r=>r.nodeId==='games'),{minScore:0,minMargin:0,acceptedGroups:0,correctGroups:0});rehash(disabled);
  assert.equal(classify(compile({model:m,policy:disabled}),witness(6)).primaryNodeId,null);
});

test('unsupported calibration nodes disable explicitly; supported ancestor remains available',()=>{
  const m=model(),r=rows('calibration').filter(row=>row.expectedTopicId!=='gta'||row.id.endsWith('-0'));
  const p=calibrate(m,r);assert.equal(p.rules.find(rule=>rule.nodeId==='gta').enabled,false);
  assert.equal(classify(compile({model:m,policy:p}),witness(0)).primaryNodeId,'games');
});

test('only fresh independent calibration groups with minimum three and target exactly one',()=>{
  const m=model();for(const split of ['training','development','test'])assert.throws(()=>calibrate(m,rows(split)));
  for(const key of ['id','groupId']){const r=rows('calibration');r[0][key]=rows('training')[0][key];assert.throws(()=>calibrate(m,r));}
  const r=rows('calibration');r[1].groupId=r[0].groupId;assert.throws(()=>calibrate(m,r));
  for(const change of [a=>{a.minimumAcceptedGroups=2;},a=>{a.targetPrecision=.99;},a=>{a.rows[0].expectedTopicId='missing';}]){
    const a={model:m,rows:rows('calibration'),minimumAcceptedGroups:3,targetPrecision:1};change(a);assert.throws(()=>calibratePolicy(a));
  }
});

test('head scoring, feature comparisons, sorting and row sweep work are bounded and accounted',()=>{
  const m=model(),r=rows('calibration'),p=calibrate(m,r),w=p.calibrationWork;
  assert.equal(w.scoringCoordinateProducts,r.length*m.heads.filter(h=>h.enabled).length*384);
  assert.equal(w.preflightUpperBound,observedHeadPolicyWorkUpperBound(r.length,m.nodes.length));
  assert.ok(w.units<=w.preflightUpperBound&&w.units<=OBSERVED_HEAD_POLICY_LIMITS.maxCalibrationWork);
  assert.equal(w.units,w.scoringCoordinateProducts+w.validationUnits+w.featureComparisons+w.sortComparisons+w.sweepVisits+w.ruleEvaluations);
  assert.ok(w.sweepVisits<=m.nodes.length*r.length*(r.length+1));
  assert.throws(()=>observedHeadPolicyWorkUpperBound(513,1),e=>e.code==='capacity');
  assert.ok(observedHeadPolicyWorkUpperBound(512,128)>OBSERVED_HEAD_POLICY_LIMITS.maxCalibrationWork);
  const wide=trainHierarchyLinearHeads({nodes:Array.from({length:128},(_,i)=>({id:`wide-${i}`,parentId:null})),
    rows:[0,1,2,3].map(i=>({id:`wide-training-${i}`,groupId:`wide-origin-${i}`,split:'training',expectedTopicId:i<2?'wide-0':null,vector:axis(i<2?0:1)})),
    representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),trainingVersion:'fresh-wide-capacity',lambda:1});
  const oversized=Array.from({length:512},(_,i)=>({id:`fresh-cap-${i}`,groupId:`fresh-cap-origin-${i}`,split:'calibration',language:'en',expectedTopicId:null,vector:axis(2)}));
  assert.throws(()=>calibrate(wide,oversized),e=>e.code==='capacity');
});

test('compile binds model, policy, observed cutpoints, provenance and work, refusing forged metadata',()=>{
  const m=model(),p=calibrate(m);
  for(const change of [p=>{p.assignmentAuthority=true;},p=>{p.schema='hierarchical-e5-paired-head-policy-v1';},p=>{p.representation='raw-e5';},
    p=>{p.modelArtifactHash='b'.repeat(64);},p=>{p.calibrationIdHashes[0]=m.trainingIdHashes[0];},
    p=>{p.rules.find(r=>r.enabled).minScore=123456;},p=>{p.nodeObservations[0].marginCutpoints.push(-1);},
    p=>{p.calibrationWork.scoringCoordinateProducts=0;},p=>{p.calibrationWork.units++;},p=>{p.rules[0].correctGroups=999;}]){
    const copy=structuredClone(p);change(copy);rehash(copy);assert.throws(()=>compile({model:m,policy:copy}));
  }
  const changed=structuredClone(m);changed.representationHash='b'.repeat(64);assert.throws(()=>compile({model:changed,policy:p}));
  assert.throws(()=>classify({},witness(0)));assert.throws(()=>describe({}));
  const h=compile({model:m,policy:p});assert.throws(()=>classify(h,{scores:[],sourceId:'forged'}));
  assert.throws(()=>classify(h,witness(0),{features:[]}));
});

test('compilation isolates caller mutations; hostile accessors/proxies do not execute',()=>{
  const m=structuredClone(model()),r=rows('calibration'),p=calibrate(m,r),copy=structuredClone(p),h=compile({model:m,policy:copy});
  const before=classify(h,witness(0));m.heads[0].weights.fill(0);copy.rules.forEach(rule=>{rule.enabled=false;});r[0].vector.fill(0);
  assert.deepEqual(classify(h,witness(0)),before);assert.ok(Object.isFrozen(before.features));assert.ok(Object.isFrozen(p.nodeObservations[0].scoreCutpoints));
  let called=0;const a={model:model(),rows:rows('calibration'),minimumAcceptedGroups:3,targetPrecision:1};
  Object.defineProperty(a.rows[0],'vector',{enumerable:true,get(){called++;throw Error('private');}});assert.throws(()=>calibratePolicy(a));
  assert.throws(()=>compile(new Proxy({},{ownKeys(){called++;throw Error('private');}})));assert.equal(called,0);
});
