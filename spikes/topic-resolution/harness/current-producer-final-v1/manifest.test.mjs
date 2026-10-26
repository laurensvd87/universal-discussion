import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCHES,ROOT_IDS,digest,sha,validateCandidateStructure,fixedBatch,validateProducerProfile,buildInputPacket,validateInputPacket,sourceInputIdentity} from './manifest.js';
const H='a'.repeat(64);
function profile(producerId='current-static'){
 const body={schema:'root-rank-target-producer-profile/v1',producerId,inputConstructionHash:H,extractorVersions:producerId==='current-static'?['crawler-static-html-prefix/v1']:['article-container-prefix/v1','main-text-prefix/v1']};
 return {...body,producerProfileHash:digest(body)};
}
function candidates(){return {schema:'hierarchy-current-producer-transfer-candidates/v1',caseCount:32,rootCount:16,cases:BATCHES.flat().map((id,i)=>({
 id,entityGroup:'entity-'+i,publicUrl:'https://fixture.example/article-'+i,language:['en','de','fr','es','nl'][i%5],expectedRootId:ROOT_IDS[Math.floor(i/2)],
 supportedPathPrefix:[ROOT_IDS[Math.floor(i/2)]],maximumSpecificityKnown:false,labelScope:'positive-prefix-only',split:'current-producer-transfer-proposed'}))};}
function input(){
 const cases=fixedBatch(validateCandidateStructure(candidates()),1),producerProfile=profile();
 const rows=cases.slice(0,2).map(c=>({id:c.id,groupId:c.groupId,url:c.url,sourceVersion:'frozen|static|1',title:'Invented document title',
 body:'Invented public fixture text, not an article or a model input.',extractorVersion:'crawler-static-html-prefix/v1',
 documentWitness:{kind:'static-response',finalUrlHash:sha(c.url),responseWitnessHash:H},originPolicyHash:H,pagePolicyHash:H}));
 return {phase:'static',batch:1,freezeHash:H,candidateSha256:H,labelSealSha256:H,selectionReceiptSha256:H,producerProfile,rows};
}
function context(a){return {...a,cases:fixedBatch(validateCandidateStructure(candidates()),1),collectedIds:a.rows.map(r=>r.id),rows:undefined};}
function ctx(a){const {rows,...rest}=a;return {...rest,cases:fixedBatch(validateCandidateStructure(candidates()),1),collectedIds:rows.map(r=>r.id)};}
test('exact32 metadata paths and fixed8x4 grouping without exposing gold to packets',()=>{
 const c=validateCandidateStructure(candidates());assert.equal(c.length,32);assert.equal(BATCHES.length,8);
 assert.equal(fixedBatch(c,8)[3].id,'producer-transfer-032');assert.deepEqual(Object.keys(c[0]),['id','groupId','url','language']);
 for(const mutate of [x=>x.cases[0].expectedRootId='nature',x=>x.cases[0].supportedPathPrefix=['games','koalas'],x=>x.cases[1].entityGroup=x.cases[0].entityGroup,x=>x.cases.pop()]){
  const x=candidates();mutate(x);assert.throws(()=>validateCandidateStructure(x));
 }
});
test('profile identity uses exact scorer schema and canonical hash including schema',()=>{
 const p=profile();assert.deepEqual(validateProducerProfile(p),p);assert.ok(Object.isFrozen(validateProducerProfile(p)));
 assert.throws(()=>validateProducerProfile({...p,producerProfileHash:digest({producerId:p.producerId,inputConstructionHash:H,extractorVersions:p.extractorVersions})}));
 assert.throws(()=>validateProducerProfile({...p,profileHash:p.producerProfileHash}));
});
test('successful packet hashes actual text, exact source incarnation and policy evidence',()=>{
 const a=input(),p=buildInputPacket(a),out=validateInputPacket(p,ctx(a));assert.deepEqual(out,p);
 assert.equal(p.rows[0].titleSha256,sha(a.rows[0].title));assert.equal(p.rows[0].bodySha256,sha(a.rows[0].body));
 assert.ok(Object.isFrozen(p.rows[0].documentWitness));assert.equal(p.rows.length,2);
 a.rows[0].body='changed';assert.notEqual(p.rows[0].body,a.rows[0].body);
});
test('packet refuses reordered, wrong-batch, missing or extra collected identities',()=>{
 for(const change of [a=>a.rows.reverse(),a=>a.rows[0].id='producer-transfer-005',a=>a.rows.push(a.rows[0]),a=>a.rows[0].documentWitness.finalUrlHash=H]){
  const a=input();change(a);assert.throws(()=>buildInputPacket(a));
 }
 const a=input(),p=buildInputPacket(a);assert.throws(()=>validateInputPacket(p,{...ctx(a),collectedIds:[a.rows[0].id]}));
});
test('packet parser rechecks exact text hashes, source policy and metadata identity',()=>{
 const a=input(),p=buildInputPacket(a);
 for(const change of [x=>x.rows[0].body='tampered',x=>x.rows[0].groupId='other',x=>x.rows[0].sourceVersion='newer',x=>x.rows[0].originPolicyHash='b'.repeat(64),x=>x.freezeHash='b'.repeat(64)]){
  const x=structuredClone(p);change(x);assert.throws(()=>validateInputPacket(x,ctx(a)));
 }
});
test('unsupported schema/malformed Unicode/capacity and hostile object inputs fail without callbacks',()=>{
 let called=0;
 const proxy=new Proxy({},{get(){called++;throw 0},ownKeys(){called++;throw 0}});
 assert.throws(()=>buildInputPacket(proxy));
 const a=input();Object.defineProperty(a.rows[0],'title',{enumerable:true,get(){called++;throw 0}});assert.throws(()=>buildInputPacket(a));
 assert.equal(called,0);
 for(const bad of ['\ud800','x'.repeat(4097),'\u0000']){
  const a=input();a.rows[0].body=bad;assert.throws(()=>buildInputPacket(a));
 }
 const b=input();b.rows[0].title={toString(){called++;return 'x'}};assert.throws(()=>buildInputPacket(b));assert.equal(called,0);
});
test('browser packet witnesses require actual frame/loader/incarnation, not static identity',()=>{
 const a=input();a.phase='browser';a.producerProfile=profile('browser-current');
 for(const r of a.rows){r.extractorVersion='main-text-prefix/v1';r.documentWitness={kind:'browser-document',finalUrlHash:sha(r.url),frameId:'f',loaderId:'l',navigationId:'n',documentId:'harness-document'};}
 assert.deepEqual(validateInputPacket(buildInputPacket(a),ctx(a)).producerProfile,a.producerProfile);
 const x=structuredClone(a);x.rows[0].documentWitness={kind:'static-response',finalUrlHash:sha(x.rows[0].url),responseWitnessHash:H};assert.throws(()=>buildInputPacket(x));
});
test('empty packets explicitly represent no collected articles and retain zero model inputs',()=>{
 const a=input();a.rows=[];assert.equal(validateInputPacket(buildInputPacket(a),ctx(a)).rows.length,0);
});
