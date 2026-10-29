import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createAutomaticNamedSubjectRepository as create} from '../canonical-v4/automatic-named-subject-repository.js';
import {GENERAL_SUBJECT_POLICY_V2_HASH as policyHash} from '../../src/application/automatic-named-subject-plan.js';
const uuid='12345678-1234-4123-8123-123456789abc',axis=Array.from({length:384},(_,i)=>i===0?1:0);
function input(titles=['Steam Deck OLED Repair Help','Steam Deck LCD Repair Help']){
 const sourceWitnesses=titles.map((_,i)=>({sourceId:'source-'+i,sourceVersion:'0',operationId:'operation-'+i,operationDigest:'c'.repeat(64),sourceStamp:'d'.repeat(64)}));
 return {generation:'generation-a',policyHash,representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,
  observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:createHash('sha256').update(JSON.stringify(Object.values(sourceWitnesses[i]))).digest('hex'),
   materialHash:String(i+1).repeat(64),title,publisherKey:'repair.example',acceptedPath:[],
   vector:Array.from({length:384},(_,j)=>i===0?axis[j]:j===0?.95:j===i?Math.sqrt(1-.95**2):0)})),sourceWitnesses,candidates:[]};
}
const raw=v=>JSON.stringify(v),answer=c=>({rows:[{result:{generation:c.generation,policyHash:c.policyHash,
 subjects:c.updates.map(u=>({subjectId:u.subjectId,revision:u.expectedRevision===null?'1':String(BigInt(u.expectedRevision)+1n)})),selections:c.selections}}]});

test('publication recomputes the general policy and sends all protected Source witnesses in one parameterized call',async()=>{
 let calls=0;const repo=create({database:{async query(sql,args){calls++;assert.equal(sql,'SELECT canonical_v4.named_publish($1::jsonb) AS result');assert.equal(args.length,1);
  const c=JSON.parse(args[0]);assert.equal(c.updates.length,1);assert.equal(c.updates[0].label,'Steam Deck');assert.equal(c.witnesses.length,2);
  assert.equal(c.policyHash,policyHash);assert(!('assignmentAuthority'in c));assert(!('providerKey'in c));return answer(c);}}});
 const r=await repo.publish(raw(input()));assert.equal(r.status,'published');assert.equal(r.subjects.length,1);assert.equal(calls,1);assert(Object.isFrozen(r.selections));
});
test('page-only selections still carry every witness before old selections may be cleared',async()=>{
 const repo=create({database:{async query(sql,args){const c=JSON.parse(args[0]);assert.equal(c.updates.length,0);assert.equal(c.witnesses.length,1);assert.equal(c.selections[0].subjectId,null);return answer(c);}}});
 const r=await repo.publish(raw(input(['One new product'])));assert.equal(r.status,'published');assert.equal(r.selections[0].subjectId,null);
});
test('empty material and bounded algorithm capacity never touch SQL',async()=>{
 let calls=0;const repo=create({database:{async query(){calls++;throw Error();}}});
 assert.equal((await repo.publish(raw(input([])))).status,'no-material');
 const a=input(['\ufdfa'.repeat(40)]);assert.equal((await repo.publish(raw(a))).status,'capacity');assert.equal(calls,0);
});
test('a bounded singleton may retain an existing supported subject but cannot silently choose a different new one',async()=>{
 const a=input(['Steam Deck OLED battery replacement']);
 const repo=create({database:{async query(sql,args){const r=answer(JSON.parse(args[0]));r.rows[0].result.selections[0]={...r.rows[0].result.selections[0],subjectId:uuid,reason:'retained-supported-subject'};return r;}}});
 assert.equal((await repo.publish(raw(a))).selections[0].subjectId,uuid);
 for(const change of [s=>{s.reason='most-specific-resolved-subject';},s=>{s.sourceVersion='9';},s=>{s.subjectId='not-a-subject';}]){
  const bad=create({database:{async query(sql,args){const r=answer(JSON.parse(args[0]));const s=r.rows[0].result.selections[0];s.subjectId=uuid;s.reason='retained-supported-subject';change(s);return r;}}});
  await assert.rejects(bad.publish(raw(a)),{code:'storage-corrupt'});
 }
});
test('forged plans, wrong policies and detached observation hashes fail before database access',async()=>{
 let calls=0;const repo=create({database:{async query(){calls++;throw Error();}}});
 for(const change of [a=>{a.updates=[];},a=>{a.policyHash='e'.repeat(64);},a=>{a.observations[0].inputHash='f'.repeat(64);},a=>{a.sourceWitnesses.pop();}]){
  const a=input();change(a);await assert.rejects(repo.publish(raw(a)),TypeError);
 }assert.equal(calls,0);
});
test('a changed SQL revision or selection cannot masquerade as successful publication',async()=>{
 for(const change of [r=>{r.subjects[0].revision='2';},r=>{r.subjects[0].subjectId=uuid;},r=>{r.selections[0].subjectId=null;},r=>{r.generation='other-generation';},r=>{r.subjects.push(r.subjects[0]);}]){
  const repo=create({database:{async query(sql,args){const r=answer(JSON.parse(args[0]));change(r.rows[0].result);return r;}}});
  await assert.rejects(repo.publish(raw(input())),{code:'storage-corrupt'});
 }
});
test('SQL conflicts are explicit without leaking raw database messages',async()=>{
 for(const [dbCode,code]of [['P1281','conflict'],['P1283','invalid'],['XX000','storage-failure']]){
  const repo=create({database:{async query(){throw Object.assign(Error('sensitive internal detail'),{code:dbCode});}}});
  await assert.rejects(repo.publish(raw(input())),e=>e.code===code&&!e.message.includes('sensitive'));
 }
});
test('candidate retrieval is bounded to explicit indexed scopes and validates returned prototypes and scope identity',async()=>{
 const scope={focusKey:'e'.repeat(64),contextRootId:null},request={generation:'generation-a',representationHash:'a'.repeat(64),scopes:[scope]};
 const c={subjectId:uuid,revision:'3',...scope,prototypeValues:axis,representationHash:request.representationHash,parentId:null};
 const repo=create({database:{async query(sql,args){assert.equal(sql,'SELECT canonical_v4.named_candidates($1,$2,$3::jsonb) AS result');assert.deepEqual(args,[request.generation,request.representationHash,raw(request.scopes)]);return {rows:[{result:[c]}]};}}});
 assert.deepEqual(await repo.candidates(raw(request)),[c]);
 for(const change of [v=>{v.focusKey='f'.repeat(64);},v=>{v.contextRootId='other-sense';},v=>{v.prototypeValues=[];},v=>{v.revision='0';}]){
  const value=structuredClone(c);change(value);const bad=create({database:{async query(){return {rows:[{result:[value]}]};}}});
  await assert.rejects(bad.candidates(raw(request)),{code:'storage-corrupt'});
 }
});
test('fast Source reads retain a readable page title without waiting for subject publication',async()=>{
 const value={generation:'generation-a',sourceId:'source-a',sourceVersion:'0',pageTitle:'One new product',subject:null};
 const repo=create({database:{async query(sql,args){assert.equal(sql,'SELECT canonical_v4.named_read_source($1,$2) AS result');assert.deepEqual(args,['generation-a','source-a']);return {rows:[{result:value}]};}}});
 const r=await repo.source(raw({generation:'generation-a',sourceId:'source-a'}));assert.deepEqual(r,value);
 assert(!('topicId'in r));assert(!('discussionId'in r));assert(Object.isFrozen(r));
});
