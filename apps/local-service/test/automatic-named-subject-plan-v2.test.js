import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {planAutomaticNamedSubjects as v1,planAutomaticNamedSubjectsV2 as plan,
 GENERAL_SUBJECT_POLICY_V2 as policy,GENERAL_SUBJECT_POLICY_V2_HASH as policyHash} from '../src/application/automatic-named-subject-plan.js';
function input(titles=['Steam Deck OLED Repair Help: Learn How to Fix It Yourself.','Steam Deck LCD Repair Help: Learn How to Fix It Yourself.']){
 return {generation:'fixture-generation',policyHash,representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,
  observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:String(i+1).repeat(64),materialHash:String(i+5).repeat(64),title,
   publisherKey:'repair.example',acceptedPath:['games'],vector:Array.from({length:384},(_,j)=>i===0?(j===0?1:0):j===0?.95:j===i?Math.sqrt(1-.95**2):0)})),
  sourceWitnesses:titles.map((_,i)=>({sourceId:'source-'+i,sourceVersion:'0',operationId:'operation-'+i,operationDigest:'c'.repeat(64),sourceStamp:'d'.repeat(64)})),candidates:[]};
}
test('the declared v2 algorithm fingerprint matches the reviewed source bytes',async()=>{
 const bytes=await readFile(new URL('../experiments/automatic-topic-discovery-v2/focus-subjects.js',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),policy.algorithmSha256);
 assert.equal(createHash('sha256').update(JSON.stringify(policy)).digest('hex'),policyHash);assert(Object.isFrozen(policy));
});
test('general publisher policy is explicit and the old planner keeps its original behavior',()=>{
 const a=input();assert.equal(v1(JSON.stringify(a)).updates.length,0);
 const r=plan(JSON.stringify(a));assert.equal(r.schema,'general-named-subject-publication-plan/v2');assert.equal(r.updates.length,1);
 assert.equal(r.updates[0].label,'Steam Deck');assert(r.selections.every(s=>s.subjectId===r.updates[0].subjectId));
 assert.equal(r.wikipediaRequired,false);assert.equal(r.assignmentAuthority,false);assert.equal(r.registryChanged,false);
});
test('wrong policy identities or thresholds cannot masquerade as this v2 policy',()=>{
 for(const change of [a=>{a.policyHash='e'.repeat(64);},a=>{a.minimumSimilarity=.81;}]){
  const a=input();change(a);assert.throws(()=>plan(JSON.stringify(a)),TypeError);
 }
 assert.throws(()=>plan(JSON.stringify(input()),{}),TypeError);
});
test('persistent IDs and Source revision witnesses are retained for same-publisher subjects',()=>{
 const a=input(),first=plan(JSON.stringify(a)),u=first.updates[0];
 a.candidates=[{subjectId:u.subjectId,revision:'4',focusKey:u.focusKey,contextRootId:u.contextRootId,prototypeValues:u.prototypeValues,
  representationHash:a.representationHash,parentId:null}];a.sourceWitnesses[0].sourceVersion='1';
 const second=plan(JSON.stringify(a));assert.equal(second.updates[0].subjectId,u.subjectId);assert.equal(second.updates[0].expectedRevision,'4');
 assert.equal(second.commitWitnesses.find(w=>w.sourceId==='source-0').sourceVersion,'1');
 a.sourceWitnesses.pop();assert.throws(()=>plan(JSON.stringify(a)),TypeError);
});
test('single pages remain usable page context without inventing shared subjects or event identity',()=>{
 const r=plan(JSON.stringify(input(['New product model'])));assert.deepEqual(r.updates,[]);assert.equal(r.selections[0].subjectId,null);
 assert.equal(r.selections[0].reason,'page-context-only');assert.equal(r.eventIdentityAsserted,false);
});
test('model variants sharing one instructional suffix keep their separate product families',()=>{
 const a=input(['Steam Deck OLED Repair Help: Learn How to Fix It Yourself.','Steam Deck LCD Repair Help: Learn How to Fix It Yourself.',
  'Nintendo Switch 2 Repair Help: Learn How to Fix It Yourself.','Nintendo Switch OLED Repair Help: Learn How to Fix It Yourself.']);
 const r=plan(JSON.stringify(a));assert.deepEqual(r.updates.map(u=>u.label).sort(),['Nintendo Switch','Steam Deck']);
 assert.equal(r.selections[0].subjectId,r.selections[1].subjectId);assert.equal(r.selections[2].subjectId,r.selections[3].subjectId);
 assert.notEqual(r.selections[0].subjectId,r.selections[2].subjectId);
});
test('an existing ancestry cycle cannot be carried forward as a generic publication plan',()=>{
 const a=input(),u=plan(JSON.stringify(a)).updates[0],other='12345678-1234-4123-8123-123456789abc';
 const first={subjectId:u.subjectId,revision:'4',focusKey:u.focusKey,contextRootId:u.contextRootId,
  prototypeValues:u.prototypeValues,representationHash:a.representationHash,parentId:other};
 a.candidates=[first,{...first,subjectId:other,focusKey:'e'.repeat(64),parentId:first.subjectId}];
 assert.throws(()=>plan(JSON.stringify(a)),TypeError);
 // An unknown parent is retained; absence from a bounded retrieval is not proof
 // that it disappeared. SQL publication must verify its actual ancestry.
 a.candidates.pop();assert.equal(plan(JSON.stringify(a)).updates[0].parentId,other);
});
