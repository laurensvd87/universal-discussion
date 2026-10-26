import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePairedE5Input, describePairedE5Input } from '../src/domain/hierarchical-e5-paired-input.js';
import { trainHierarchyLinearHeads } from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import { calibrateHierarchyHeadPolicy } from '../src/domain/hierarchical-e5-observed-head-policy.js';
import { compileExperimentalHierarchyPageCandidate as compile, classifyExperimentalHierarchyPageCandidate as classify,
  describeExperimentalHierarchyPageCandidate as describe } from '../src/application/experimental-observed-hierarchy-page-candidate.js';

const axis = (i, sign=1) => Array.from({length:384},(_,j)=>i===j?sign:0);
const inputDefinition={bodyWeight:.5,titleWeight:.5,encoderHash:'c'.repeat(64)};
const nodes=[{id:'games',parentId:null},{id:'gta',parentId:'games'},{id:'gta-online',parentId:'gta'},
  {id:'nature',parentId:null},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}];
const classes=[['gta-online',0],['gta',1],['games',2],['koalas',3],['animals',4],['nature',5],[null,6]];
function rows(split){return classes.flatMap(([expectedTopicId,i])=>[0,1,2].map(j=>({id:`${split}-${i}-${j}`,
  groupId:`${split}-origin-${i}-${j}`,split,expectedTopicId,vector:axis(i)})));}
function fixture(){
  const representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
  const model=trainHierarchyLinearHeads({nodes,rows:rows('training'),representation:'paired-raw-e5-body-title-v1',representationHash,
    trainingVersion:'new-observed-geometric-application-v1',lambda:.1});
  const policy=calibrateHierarchyHeadPolicy({model,rows:rows('calibration').map(r=>({...r,language:'en'})),minimumAcceptedGroups:3,targetPrecision:1});
  return {inputDefinition:{...inputDefinition},model,policy,ownerGrouping:{revision:'owner-cut-v1',defaultMaxDepth:1,overrides:[]}};
}
const witness=i=>({sourceId:'synthetic-source',sourceVersion:'synthetic-v1',bodyVector:axis(i),titleVector:axis(i)});

test('broad owner default projects only the existing confident path and exposes no vectors/scores',()=>{
  const handle=compile(fixture()),d=classify(handle,witness(0));
  assert.deepEqual(d.supportedPath,['games','gta','gta-online']);assert.deepEqual(d.selectedPath,['games']);
  assert.equal(d.primaryNodeId,'games');assert.equal(d.reason,'owner-depth-cut');assert.equal(d.status,'candidate');
  for(const key of ['vector','bodyVector','titleVector','features','scores','bodyTitleCosine']) assert.equal(Object.hasOwn(d,key),false);
  assert.equal(d.assignmentAuthority,false);assert.equal(d.productionValidated,false);assert.equal(d.uncalibrated,true);
  assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.supportedPath)&&Object.isFrozen(d.selectedPath));
});

test('deepest override on FULL path wins, even beyond the default or shallower cut',()=>{
  const a=fixture();a.ownerGrouping.overrides=[{nodeId:'games',maxDepth:1},{nodeId:'gta',maxDepth:2},{nodeId:'gta-online',maxDepth:3},
    {nodeId:'nature',maxDepth:2}];
  const handle=compile(a);
  assert.deepEqual(classify(handle,witness(0)).selectedPath,['games','gta','gta-online']);
  assert.deepEqual(classify(handle,witness(1)).selectedPath,['games','gta']);
  assert.deepEqual(classify(handle,witness(3)).selectedPath,['nature','animals']);
  assert.deepEqual(classify(handle,witness(5)).selectedPath,['nature']);
});

test('overrides cannot invent confidence or switch branches; unknown/outside remain unresolved',()=>{
  const a=fixture();a.ownerGrouping.defaultMaxDepth=8;a.ownerGrouping.overrides=[{nodeId:'gta',maxDepth:8},{nodeId:'koalas',maxDepth:8}];
  const handle=compile(a);
  assert.deepEqual(classify(handle,witness(1)).selectedPath,['games','gta']);
  assert.deepEqual(classify(handle,witness(2)).selectedPath,['games']);
  for(const i of [6,7]){const d=classify(handle,witness(i));assert.equal(d.status,'unresolved');assert.deepEqual(d.selectedPath,[]);}
});

test('zero fused norm returns explicit unresolved rather than a root fallback',()=>{
  const d=classify(compile(fixture()),{...witness(0),titleVector:axis(0,-1)});
  assert.equal(d.status,'unresolved');assert.equal(d.reason,'zero-fused-norm');assert.equal(d.primaryNodeId,null);
  assert.deepEqual(d.supportedPath,[]);assert.deepEqual(d.selectedPath,[]);
});

test('adapter/model/policy exact identity mismatches and stale policy fail at compile',()=>{
  for(const change of [a=>{a.inputDefinition.encoderHash='d'.repeat(64);},a=>{a.inputDefinition.bodyWeight=1;a.inputDefinition.titleWeight=0;},
    a=>{a.policy=structuredClone(a.policy);a.policy.representationHash='d'.repeat(64);},
    a=>{a.model=structuredClone(a.model);a.model.trainingVersion='changed';}]){
    const a=fixture();change(a);assert.throws(()=>compile(a));
  }
});

test('owner grouping canonical hash binds revision/settings independently of model and policy',()=>{
  const a=fixture();a.ownerGrouping.overrides=[{nodeId:'nature',maxDepth:2},{nodeId:'gta',maxDepth:3}];
  const first=describe(compile(a));a.ownerGrouping.overrides.reverse();const second=describe(compile(a));
  assert.deepEqual(first,second);
  a.ownerGrouping.revision='owner-cut-v2';const third=describe(compile(a));
  assert.notEqual(first.ownerGroupingHash,third.ownerGroupingHash);assert.equal(first.policyHash,third.policyHash);
  assert.equal(first.inputDefinitionHash,third.inputDefinitionHash);assert.equal(first.modelArtifactHash,third.modelArtifactHash);
});

test('caller mutation cannot change compiled settings, Source witness or detached outputs',()=>{
  const a=fixture();a.ownerGrouping.overrides=[{nodeId:'gta',maxDepth:3}];const handle=compile(a),w=witness(0),d=classify(handle,w);
  a.ownerGrouping.defaultMaxDepth=8;a.ownerGrouping.overrides[0].maxDepth=2;a.inputDefinition.encoderHash='f'.repeat(64);
  w.sourceVersion='changed';w.bodyVector.fill(0);w.titleVector.fill(0);
  assert.equal(d.sourceVersion,'synthetic-v1');assert.deepEqual(d.selectedPath,['games','gta','gta-online']);
  assert.deepEqual(classify(handle,witness(0)),d);
});

test('strict grouping schemas, depth bounds, missing nodes and duplicate overrides reject',()=>{
  for(const change of [a=>{a.ownerGrouping.extra=true;},a=>{a.ownerGrouping.defaultMaxDepth=0;},a=>{a.ownerGrouping.defaultMaxDepth=9;},
    a=>{a.ownerGrouping.revision='';},a=>{a.ownerGrouping.overrides=[{nodeId:'missing',maxDepth:1}];},
    a=>{a.ownerGrouping.overrides=[{nodeId:'gta-online',maxDepth:2}];},
    a=>{a.ownerGrouping.overrides=[{nodeId:'gta',maxDepth:3},{nodeId:'gta',maxDepth:3}];},
    a=>{a.ownerGrouping.overrides=Array(129).fill({nodeId:'gta',maxDepth:3});}]){
    const a=fixture();change(a);assert.throws(()=>compile(a));
  }
});

test('hostile proxies/getters fail without caller code execution; opaque handles cannot be forged',()=>{
  let touched=0;const a=fixture();Object.defineProperty(a.ownerGrouping,'revision',{enumerable:true,get(){touched++;throw Error('private');}});
  assert.throws(()=>compile(a));assert.equal(touched,0);
  const handle=compile(fixture());const w=witness(0);Object.defineProperty(w,'titleVector',{enumerable:true,get(){touched++;throw Error('private');}});
  assert.throws(()=>classify(handle,w));assert.equal(touched,0);
  assert.throws(()=>compile(new Proxy({},{ownKeys(){touched++;throw Error('private');}})));assert.equal(touched,0);
  assert.throws(()=>classify({},witness(0)));assert.throws(()=>describe({}));assert.throws(()=>classify(handle,witness(0),{}));
});
