import test from 'node:test';import assert from 'node:assert/strict';
import {planAutomaticNamedSubjects as plan} from '../src/application/automatic-named-subject-plan.js';
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
const candidate=(a,u,extra={})=>({subjectId:u.subjectId,revision:'7',focusKey:u.focusKey,contextRootId:u.contextRootId,
 prototypeValues:u.prototypeValues,representationHash:a.representationHash,parentId:null,...extra});
function input(titles=['Kapsalon maken met shoarma','Kip KAPSALON op de kamado']){return {generation:'generation-a',policyHash:'a'.repeat(64),representationHash:'b'.repeat(64),matcherHash:'c'.repeat(64),minimumSimilarity:.8,
 observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:String(i+1).repeat(64),materialHash:String(i+3).repeat(64),title,publisherKey:i?'video.example':'recipes.example',acceptedPath:['cooking'],vector:axis(i===0?0:1).map((x,j)=>i===0?x:j===0?.9:j===1?Math.sqrt(.19):0)})),
 sourceWitnesses:titles.map((_,i)=>({sourceId:'source-'+i,sourceVersion:'0',operationId:'operation-'+i,operationDigest:'d'.repeat(64),sourceStamp:'e'.repeat(64)})),candidates:[]};}
test('recipe/video subjects allocate opaque IDs without Wikipedia or predefined child names',()=>{
 const r=plan(JSON.stringify(input()));assert.equal(r.updates.length,1);assert.match(r.updates[0].subjectId,/^[a-f0-9-]{36}$/u);assert.equal(r.updates[0].label.toLowerCase(),'kapsalon');
 assert(r.selections.every(s=>s.subjectId===r.updates[0].subjectId));assert.equal(r.wikipediaRequired,false);assert.equal(r.registryChanged,false);assert.equal(r.commitWitnesses.length,2);
});
test('the same subject retains its UUID when more evidence arrives or Source versions advance',()=>{
 const a=input(),first=plan(JSON.stringify(a)),u=first.updates[0];
 a.candidates=[candidate(a,u)];a.sourceWitnesses[0].sourceVersion='1';
 const second=plan(JSON.stringify(a));assert.equal(second.updates[0].subjectId,u.subjectId);assert.equal(second.updates[0].expectedRevision,'7');assert.equal(second.commitWitnesses[0].sourceVersion,'1');
});
test('equal names in conflicting root contexts never choose that other sense',()=>{
 const a=input(),first=plan(JSON.stringify(a)),u=first.updates[0];a.candidates=[candidate(a,u,{contextRootId:'personal-care'})];
 assert.notEqual(plan(JSON.stringify(a)).updates[0].subjectId,u.subjectId);
});
test('two indistinguishable existing scopes defer instead of inventing a third duplicate',()=>{
 const a=input(),u=plan(JSON.stringify(a)).updates[0];a.candidates=['12345678-1234-4123-8123-123456789abc','22345678-1234-4123-8123-123456789abc'].map(subjectId=>candidate(a,u,{subjectId}));
 const result=plan(JSON.stringify(a));assert.equal(result.updates.length,0);assert(result.selections.every(s=>s.subjectId===null));assert.equal(result.decisions[0].status,'ambiguous-existing-scope');
});
test('literal descendant scopes map to persistent parent IDs and choose their most specific branch',()=>{
 const a=input(['Nobel Prize in Physics 2025 announced','Nobel Prize in Physics 2025 awarded','Nobel Prize in Chemistry 2025 announced','Nobel Prize in Chemistry 2025 awarded']);
 for(const row of a.observations){row.acceptedPath=[];row.vector=axis(0);} // distinct raw material below; vectors must not be near duplicates.
 a.observations[0].vector[0]=1;for(let i=1;i<4;i++){a.observations[i].vector=axis(0).map((_,j)=>j===0?.97:j===i?Math.sqrt(1-.97**2):0);}
 a.observations.forEach((r,i)=>{r.publisherKey=i%2?'publisher-b.example':'publisher-a.example';});
 const result=plan(JSON.stringify(a));assert(result.updates.some(u=>u.parentId!==null));const ids=new Set(result.updates.map(u=>u.subjectId));assert(result.updates.every(u=>u.parentId===null||ids.has(u.parentId)));
 assert(result.selections.every(s=>s.subjectId!==null));assert(result.updates.every(u=>u.kind==='subject'));
});
test('missing or changed Source witnesses cannot produce a persistable plan',()=>{
 for(const change of [a=>a.sourceWitnesses.pop(),a=>{a.sourceWitnesses[0].sourceVersion='-1';},a=>{a.sourceWitnesses[0].sourceStamp='';},a=>{a.sourceWitnesses[0].sourceId='different-source';}]){const a=input();change(a);assert.throws(()=>plan(JSON.stringify(a)),TypeError);}
 const a=input();a.candidates=Array.from({length:65},()=>({}));assert.throws(()=>plan(JSON.stringify(a)),TypeError);
});
test('partial cohorts preserve a previous parent and incompatible representations cannot reuse IDs',()=>{
 const a=input(),u=plan(JSON.stringify(a)).updates[0],parentId='12345678-1234-4123-8123-123456789abc';
 a.candidates=[candidate(a,u,{parentId})];assert.equal(plan(JSON.stringify(a)).updates[0].parentId,parentId);
 a.candidates[0].representationHash='f'.repeat(64);assert.throws(()=>plan(JSON.stringify(a)),TypeError);
});
