import test from 'node:test';import assert from 'node:assert/strict';
import {createPublicSubjectSourceRepository as create} from '../canonical-v4/public-subject-source-repository.js';
const id='12345678-1234-4123-8123-123456789abc';
const witness=()=>({generation:'generation-a',sourceId:'source-a',sourceVersion:'0',operationId:'operation-a',operationDigest:'a'.repeat(64),sourceStamp:'b'.repeat(64)});
const candidate=(ordinal='0')=>({...witness(),ordinal});
const bound=()=>({status:'bound',sourceId:'source-a',sourceVersion:'0',subjectId:id,subjectRevision:'123'});
const context=()=>({status:'bound',sourceId:'source-a',sourceVersion:'0',subject:{subjectId:id,providerKey:'Q101',revision:'123',articleTitle:'Atlas (programming language)',label:'Atlas',labelLanguage:'mul',description:'programming language',descriptionLanguage:'en'}});
test('binding uses only exact stored Source fences and accepts genuine version zero',async()=>{
 let calls=0;const r=create({database:{async query(sql,args){calls++;assert.equal(sql,'SELECT canonical_v4.subject_bind_source($1,$2,$3::bigint,$4,$5,$6) AS result');assert.deepEqual(args,Object.values(witness()));return {rows:[{result:bound()}]};}}});
 assert.deepEqual(await r.bind(witness()),bound());assert.equal(calls,1);
 await assert.rejects(r.bind({...witness(),subjectId:id}),TypeError);assert.equal(calls,1);
});
test('bounded keyset candidates contain fences without exporting URL, title or vectors',async()=>{
 const r=create({database:{async query(sql,args){assert.equal(sql,'SELECT canonical_v4.subject_binding_candidates($1,$2::bigint,$3) AS result');assert.deepEqual(args,['generation-a',null,1]);return {rows:[{result:[candidate()]}]};}}});
 assert.deepEqual(await r.candidates({generation:'generation-a',afterOrdinal:null,limit:1}),[candidate()]);
});
test('out-of-order, repeated, wrong-generation or expanded candidates are refused',async()=>{
 for(const rows of [[candidate('1'),{...candidate('0'),sourceId:'source-b'}],[candidate('0'),candidate('1')],[{...candidate(),generation:'another-generation'}],[{...candidate(),url:'https://example.org/'}]]){
  const r=create({database:{async query(){return {rows:[{result:rows}]};}}});await assert.rejects(r.candidates({generation:'generation-a',afterOrdinal:null,limit:2}),TypeError);
 }
 const r=create({database:{async query(){return {rows:[{result:[candidate('0')]}]};}}});await assert.rejects(r.candidates({generation:'generation-a',afterOrdinal:'0',limit:1}),TypeError);
});
test('unresolved or ineligible results cannot smuggle an entity or claim posting authority',async()=>{
 for(const status of ['unresolved','ineligible']){
  const r=create({database:{async query(){return {rows:[{result:{...bound(),status,subjectId:null,subjectRevision:null}}]};}}});
  assert.equal((await r.bind(witness())).subjectId,null);
  const bad=create({database:{async query(){return {rows:[{result:{...bound(),status}}]};}}});await assert.rejects(bad.bind(witness()),TypeError);
 }
});
test('Source context retains language provenance and qualified title, never a canonical route',async()=>{
 const r=create({database:{async query(sql,args){assert.equal(sql,'SELECT canonical_v4.subject_read_source($1,$2,$3) AS result');assert.deepEqual(args,['generation-a','source-a','de']);return {rows:[{result:context()}]};}}});
 const result=await r.context({generation:'generation-a',sourceId:'source-a',language:'de'});assert.deepEqual(result,context());assert(Object.isFrozen(result.subject));assert(!('discussionId'in result));
});
test('pending context is explicit and inconsistent identity or text is rejected',async()=>{
 for(const modify of [v=>{v.sourceId='another-source';},v=>{v.subject.subjectId='Atlas';},v=>{v.subject.revision='0';},v=>{v.subject.label='x\u202ebad';},v=>{v.subject.descriptionLanguage=null;},v=>{v.status='pending';}]){
  const value=context();modify(value);const r=create({database:{async query(){return {rows:[{result:value}]};}}});await assert.rejects(r.context({generation:'generation-a',sourceId:'source-a',language:'en'}),TypeError);
 }
 const value={...context(),status:'pending',subject:null},r=create({database:{async query(){return {rows:[{result:value}]};}}});assert.deepEqual(await r.context({generation:'generation-a',sourceId:'source-a',language:'en'}),value);
});
test('invalid counters, batch sizes, languages, sparse records and object hooks never reach SQL',async()=>{
 let calls=0,hooks=0;const r=create({database:{async query(){calls++;throw Error();}}});
 for(const modify of [v=>{v.sourceVersion='-1';},v=>{v.sourceVersion='00';},v=>{v.sourceVersion='9223372036854775808';},v=>{v.operationDigest='';}]){const v=witness();modify(v);await assert.rejects(r.bind(v),TypeError);}
 for(const limit of [0,51,1.5,NaN])await assert.rejects(r.candidates({generation:'generation-a',afterOrdinal:null,limit}),TypeError);
 await assert.rejects(r.context({generation:'generation-a',sourceId:'source-a',language:'fr'}),TypeError);
 const v=witness();Object.defineProperty(v,'sourceId',{get(){hooks++;throw Error();}});await assert.rejects(r.bind(v),TypeError);
 await assert.rejects(r.bind(new Proxy(witness(),{get(){hooks++;throw Error();}})),TypeError);assert.equal(calls,0);assert.equal(hooks,0);
});
