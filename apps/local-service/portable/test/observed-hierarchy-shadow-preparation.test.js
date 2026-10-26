import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { compilePairedE5Input, describePairedE5Input } from '../../src/domain/hierarchical-e5-paired-input.js';
import { trainHierarchyLinearHeads } from '../../src/domain/hierarchical-e5-paired-linear-heads.js';
import { calibrateHierarchyHeadPolicy } from '../../src/domain/hierarchical-e5-observed-head-policy.js';
import { compileObservedHierarchyShadowPreparation as compile, describeObservedHierarchyShadowPreparation as describe,
  prepareObservedHierarchyShadowDecision as prepare, describeObservedHierarchyShadowDecision as describeJob,
  commitObservedHierarchyShadowDecision as commit, bindObservedHierarchyShadowRoot as bind,
  publishObservedHierarchyShadowPreparation as publish }
  from '../../src/application/experimental-observed-hierarchy-shadow-preparation.js';
import { initializeHierarchyShadow, publishShadowHierarchy, registerShadowSourceWitness,
  readShadowPath, readShadowParentRoots, deleteShadowSource }
  from '../canonical-v4/experimental/hierarchy-shadow/repository.js';

const axis = i => Array.from({length:384}, (_,j)=>i===j?1:0), hash = n => String(n).repeat(64);
const nodes = [{id:'games',parentId:null,label:'Games'}, {id:'gta',parentId:'games',label:'GTA'},
  {id:'nature',parentId:null,label:'Nature'}, {id:'koalas',parentId:'nature',label:'Koalas'}];
const classes = [['gta',0],['games',1],['koalas',2],['nature',3],[null,4]];
function fixture(defaultMaxDepth=1,trainingVersion='new-shadow-preparation-geometry') {
  const inputDefinition = {bodyWeight:.75,titleWeight:.25,encoderHash:hash('a')};
  const representationHash = describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
  const rows = split => classes.flatMap(([expectedTopicId,i])=>[0,1,2].map(j=>({id:`new-${split}-${i}-${j}`,
    groupId:`new-${split}-entity-${i}-${j}`,split,expectedTopicId,language:'en',vector:axis(i)})));
  const model = trainHierarchyLinearHeads({nodes:nodes.map(({label,...n})=>n),rows:rows('training').map(({language,...r})=>r),
    representation:'paired-raw-e5-body-title-v1',representationHash,trainingVersion,lambda:.01});
  const policy = calibrateHierarchyHeadPolicy({model,rows:rows('calibration'),minimumAcceptedGroups:3,targetPrecision:1});
  return {candidate:{inputDefinition,model,policy,ownerGrouping:{revision:`cut-${defaultMaxDepth}`,defaultMaxDepth,overrides:[]}},revision:'tree-v1'};
}
async function setup(t) {
  const input=fixture(), handle=compile(input), db=await createPGliteDatabase();t.after(()=>db.close());
  await initializeHierarchyShadow(db);
  await publish(db,handle,{expectedRevision:null,labels:nodes.map(n=>({nodeId:n.id,label:n.label}))});
  return {db,input,handle};
}
async function job(f,sourceId,direction,inputHash=hash(1)) {
  const w=await registerShadowSourceWitness(f.db,{sourceId,sourceInputHash:inputHash});
  return prepare(f.handle,{sourceId,sourceInputHash:inputHash,sourceWitnessVersion:w.sourceWitnessVersion,
    bodyVector:axis(direction),titleVector:axis(direction)});
}
const route={canonicalRootId:'original-root',canonicalDestinationId:'original-topic'};
const feed=(db,nodeId)=>readShadowParentRoots(db,{nodeId,expectedRevision:null,expectedFeedVersion:null,afterRootId:null,limit:20});

test('owner cuts never replace deepest stored semantic binding or original discussion routes',async t=>{
  const f=await setup(t), prepared=await job(f,'page',0), d=describeJob(prepared);
  assert.deepEqual(d.supportedPath,['games','gta']);assert.deepEqual(d.selectedPath,['games']);
  assert.equal(d.nodeId,'gta');assert.equal(d.selectedNodeId,'games');assert.equal(d.assignmentAuthority,false);
  assert.equal((await commit(f.db,prepared)).status,'accepted');assert.equal((await bind(f.db,prepared,route)).status,'bound');
  assert.deepEqual((await readShadowPath(f.db,{sourceId:'page'})).path.map(n=>n.id),['games','gta']);
  assert.deepEqual((await feed(f.db,'games')).rootRefs,[route]);assert.deepEqual((await feed(f.db,'gta')).rootRefs,[route]);
  const deep=compile({...f.input,candidate:{...f.input.candidate,ownerGrouping:{revision:'cut-deep',defaultMaxDepth:8,overrides:[]}}});
  assert.deepEqual(describe(deep),describe(f.handle));
  const w=await registerShadowSourceWitness(f.db,{sourceId:'page',sourceInputHash:hash(1)});
  const refined=prepare(deep,{sourceId:'page',sourceInputHash:hash(1),sourceWitnessVersion:w.sourceWitnessVersion,
    bodyVector:axis(0),titleVector:axis(0)});
  assert.equal(describeJob(refined).selectedNodeId,'gta');assert.equal(describeJob(refined).nodeId,d.nodeId);
  assert.notEqual(describeJob(refined).ownerGroupingHash,d.ownerGroupingHash);
  assert.equal((await f.db.query("SELECT to_regnamespace('canonical_v4') AS n")).rows[0].n,null);
});

test('captured witness is not refreshed during commit; Source A-B-A rejects old jobs and bindings',async t=>{
  const f=await setup(t), old=await job(f,'page',0);
  await job(f,'page',2,hash(2));const fresh=await job(f,'page',0);
  assert.notEqual(describeJob(old).sourceWitnessVersion,describeJob(fresh).sourceWitnessVersion);
  assert.equal((await commit(f.db,old)).status,'stale-source');assert.equal((await bind(f.db,old,route)).status,'stale-source');
  assert.equal((await commit(f.db,fresh)).status,'accepted');assert.equal((await bind(f.db,fresh,route)).status,'bound');
});

test('tree publication races fail prepared commit and cannot silently use the new model',async t=>{
  const f=await setup(t), old=await job(f,'page',0), identity=describe(f.handle);
  const {artifactHash,modelHash,policyHash}=identity;
  await publishShadowHierarchy(f.db,{expectedRevision:identity.revision,revision:'tree-v2',artifactHash,modelHash,policyHash,nodes});
  assert.equal((await commit(f.db,old)).status,'stale-model');
  assert.notEqual((await bind(f.db,old,route)).status,'bound');
  assert.equal((await readShadowPath(f.db,{sourceId:'page'})).status,'unassigned');
});

test('same revision and node cannot bind a job from a different unpublished model',async t=>{
  const f=await setup(t), legitimate=await job(f,'page',0);await commit(f.db,legitimate);
  const different={...f,handle:compile(fixture(1,'different-unpublished-weights-lineage'))}, wrong=await job(different,'page',0);
  assert.notEqual(describeJob(wrong).artifactHash,describeJob(legitimate).artifactHash);
  assert.equal((await commit(f.db,wrong)).status,'stale-model');
  assert.equal((await bind(f.db,wrong,route)).status,'stale-model');
  assert.deepEqual((await feed(f.db,'games')).rootRefs,[]);
  assert.equal((await bind(f.db,legitimate,route)).status,'bound');
});

test('publication constructs model topology itself, never accepting a different parent tree',async()=>{
  const h=compile(fixture()), labels=nodes.map(n=>({nodeId:n.id,label:n.label}));
  await assert.rejects(()=>publish(null,h,{expectedRevision:null,labels:labels.map(l=>({...l,parentId:null}))}));
  await assert.rejects(()=>publish(null,h,{expectedRevision:null,labels:[...labels.slice(0,3),labels[0]]}));
  await assert.rejects(()=>publish(null,h,{expectedRevision:null,labels:labels.slice(0,3)}));
  const changed=structuredClone(labels);changed[0].nodeId='foreign-node';
  await assert.rejects(()=>publish(null,h,{expectedRevision:null,labels:changed}));
});

test('unresolved inputs remain explicit and Source erasure removes only dependent projections',async t=>{
  const f=await setup(t), outside=await job(f,'outside',4);
  assert.equal(describeJob(outside).nodeId,null);assert.equal((await commit(f.db,outside)).status,'accepted');
  assert.equal((await bind(f.db,outside,route)).status,'unresolved');
  assert.equal((await readShadowPath(f.db,{sourceId:'outside'})).status,'unresolved');
  const inside=await job(f,'inside',0);await commit(f.db,inside);await bind(f.db,inside,route);
  await deleteShadowSource(f.db,{sourceId:'inside'});assert.deepEqual((await feed(f.db,'games')).rootRefs,[]);
  assert.equal((await readShadowPath(f.db,{sourceId:'outside'})).status,'unresolved');
});

test('private preparations reject forged jobs/getters without DB calls or retained vectors',async()=>{
  const input=fixture(), h=compile(input), witness={sourceId:'page',sourceInputHash:hash(1),sourceWitnessVersion:'1',
    bodyVector:axis(0),titleVector:axis(0)}, prepared=prepare(h,witness), snapshot=describeJob(prepared);
  witness.bodyVector.fill(0);witness.sourceWitnessVersion='2';assert.deepEqual(describeJob(prepared),snapshot);
  for(const key of ['bodyVector','titleVector','vector','scores','features']) assert.equal(Object.hasOwn(snapshot,key),false);
  assert.throws(()=>describeJob({...snapshot}));await assert.rejects(()=>commit(null,{}));await assert.rejects(()=>bind(null,{},route));
  let touched=0;const hostile={...witness};Object.defineProperty(hostile,'sourceInputHash',{enumerable:true,get(){touched++;throw Error('private');}});
  assert.throws(()=>prepare(h,hostile));assert.equal(touched,0);
  await assert.rejects(()=>bind(null,prepared,new Proxy(route,{ownKeys(){touched++;throw Error('private');}})));assert.equal(touched,0);
});
