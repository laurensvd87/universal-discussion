import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRetainedHierarchyChildRows,retainedChildTrainingArguments,summarizeParentConditionedChildRows} from '../harness/retained-hierarchy-child-inputs.js';
const H='a'.repeat(64),axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
function fixture(){
 const row=(id,split,labels)=>({id,groupId:id+'-group',split,labels,language:'en',expectedRootId:'games',sourceInputHash:H,reuseEligible:true,heldoutDocumentCollisions:[]});
 const corpus={reviewedArchivedRows:[row('train','training',{'video-games':true,animals:false,koalas:null}),row('cal','calibration',{'video-games':false,animals:true,koalas:null})],unknownArchivedRoster:{training:[{id:'unknown'}],calibration:[]}};
 corpus.reviewedArchivedRows[1].expectedRootId='nature';
 const pairs=new Map(corpus.reviewedArchivedRows.map(r=>[r.id,{id:r.id,sourceInputHash:H,bodyVector:axis(0),titleVector:axis(1)}]));
 return {corpus,pairs,inputDefinition:{bodyWeight:.75,titleWeight:.25,encoderHash:H}};
}
test('explicit reviewed child labels and TRAIN/CAL roles survive fusion; unknowns never become negatives',()=>{
 const f=fixture(),before=structuredClone(f.corpus),p=projectRetainedHierarchyChildRows(f),vg=retainedChildTrainingArguments(p,'video-games'),koalas=retainedChildTrainingArguments(p,'koalas');
 assert.equal(vg.trainingRows.length,1);assert.equal(vg.trainingRows[0].label,true);assert.equal(vg.calibrationRows[0].label,false);
 assert.equal(koalas.trainingRows[0].label,null);assert.equal(koalas.calibrationRows[0].label,null);assert.deepEqual(p.unknownOmitted,['unknown']);
 assert.ok(Math.abs(Math.hypot(...p.rows[0].vector)-1)<1e-10);assert.deepEqual(f.corpus,before);
});
test('wrong material hash, missing pair, duplicate groups, TEST roles and held-out collisions refuse before training',()=>{
 for(const change of [f=>{f.pairs.get('train').sourceInputHash='b'.repeat(64);},f=>f.pairs.delete('train'),
  f=>{f.corpus.reviewedArchivedRows[1].groupId=f.corpus.reviewedArchivedRows[0].groupId;},
  f=>{f.corpus.reviewedArchivedRows[0].split='test';},f=>{f.corpus.reviewedArchivedRows[0].heldoutDocumentCollisions=['held-out'];},
  f=>{f.corpus.reviewedArchivedRows[0].labels.koalas=true;},
  f=>{delete f.corpus.reviewedArchivedRows[0].labels.koalas;},f=>{f.corpus.unknownArchivedRoster.training=[{id:'train'}];}]){
  const f=fixture();change(f);assert.throws(()=>projectRetainedHierarchyChildRows(f),TypeError);
 }
});
test('off-parent negatives and unknown parent labels cannot inflate within-parent calibration support',()=>{
 const row=(root,animal,label,accepted)=>({expectedRootId:root,labels:{'video-games':label,animals:animal,koalas:label},decisions:{'video-games':{accepted},koalas:{accepted}}});
 const result=summarizeParentConditionedChildRows([row('games',false,true,true),row('games',false,false,false),row('nature',true,false,false),row('nature',null,null,false)],'video-games');
 assert.deepEqual(result,{insideKnownPositive:1,insideKnownNegative:1,outsideKnownNegative:1,parentUnknownKnownNegative:0,acceptedInsidePositive:1,acceptedInsideNegative:0,acceptedOutsideNegative:0,omittedUnknownLabel:1});
 const koalas=summarizeParentConditionedChildRows([row('nature',true,true,true),row('nature',true,false,false),row('business',false,false,false),row('nature',null,false,false)],'koalas');
 assert.equal(koalas.insideKnownNegative,1);assert.equal(koalas.outsideKnownNegative,1);assert.equal(koalas.parentUnknownKnownNegative,1);
});
test('quarantined material is recorded without opening or promoting its vector',()=>{
 const f=fixture();f.corpus.reviewedArchivedRows[0].reuseEligible=false;f.corpus.reviewedArchivedRows[0].heldoutDocumentCollisions=['held-out'];f.pairs.delete('train');
 const p=projectRetainedHierarchyChildRows(f);assert.deepEqual(p.quarantined,['train']);assert.equal(p.rows.length,1);assert.equal(retainedChildTrainingArguments(p,'video-games').trainingRows.length,0);
});
test('curated case-file hashes and observation input hashes remain distinct authenticated bindings',()=>{
 const f=fixture(),meta=f.corpus.reviewedArchivedRows[0],pin={file:'train.json',bytes:123,sha256:'b'.repeat(64)};
 meta.sourceInputHash=null;meta.cohort='gta-repaired-fit';meta.casePin={...pin};f.pairs.get('train').labelCasePin={...pin};
 const p=projectRetainedHierarchyChildRows(f);assert.equal(p.rows[0].sourceVersion,H);assert.deepEqual(p.rows[0].labelBinding,{kind:'pinned-case-file',casePin:pin});assert.equal(meta.sourceInputHash,null);
 for(const change of [v=>{v.pairs.get('train').labelCasePin.sha256='c'.repeat(64);},v=>{v.pairs.get('train').sourceInputHash=null;},
  v=>{delete v.pairs.get('train').labelCasePin;},v=>{v.corpus.reviewedArchivedRows[0].cohort='arbitrary';},
  v=>{v.corpus.reviewedArchivedRows[0].casePin.file='../escape.json';}]){
  const clone={corpus:structuredClone(f.corpus),pairs:structuredClone(f.pairs),inputDefinition:f.inputDefinition};change(clone);assert.throws(()=>projectRetainedHierarchyChildRows(clone),TypeError);
 }
});
