// Pure SQL-port tests: invented material and fake query results, no DB/client.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createCanonicalV4SemanticSourceRepository} from '../canonical-v4/semantic-source-repository.js';
import {sourceStamp} from '../../src/domain/source-threads.js';

const H='a'.repeat(64),GEN='stored-source-generation',MODEL='e5-small-q8-browser-main-prefix-v1';
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),sha=value=>createHash('sha256').update(value).digest('hex');
function binary(values){
 const bytes=Buffer.alloc(4628);bytes.writeInt32BE(1,0);bytes.writeInt32BE(0,4);bytes.writeInt32BE(701,8);bytes.writeInt32BE(384,12);bytes.writeInt32BE(1,16);
 values.forEach((v,i)=>{bytes.writeInt32BE(8,20+12*i);bytes.writeDoubleBE(v,24+12*i);});return bytes;
}
function ready(sourceId='source-a',sourceVersion='0'){
 const input={url:'https://public.example.org/articles/'+sourceId,title:'Invented stored title',embedding:{modelId:MODEL,values:axis(0)},extractorVersion:'crawler-static-html-prefix/v1'};
 const requestMaterial=JSON.stringify(input);
 return {generation:GEN,matcherIdentityHash:H,sourceId,sourceVersion,operationId:'operation-'+sourceId,operationDigest:sha(requestMaterial),requestMaterial,
  sourceStamp:sourceStamp(input),bodyWireHash:sha(binary(input.embedding.values)),titleValues:axis(1),supportedPath:['games','invented-child'],semanticEligible:true};
}
function candidate(sourceId='source-a',ordinal='0'){
 const item=ready(sourceId),input=JSON.parse(item.requestMaterial),body=binary(input.embedding.values).toString('base64');
 return {sourceId,ordinal,sourceVersion:item.sourceVersion,generation:GEN,matcherIdentityHash:H,url:input.url,title:input.title,
  provenance:'owner-local-page-embedding/v1',extractorVersion:input.extractorVersion,policyVersion:'ridge1-fixed-reference-radius/v1',operationId:item.operationId,hasEmbedding:true,
  sourcePayload:JSON.stringify({id:sourceId,...input,provenance:'owner-local-page-embedding/v1',policyVersion:'ridge1-fixed-reference-radius/v1',operationId:item.operationId,operationDigest:item.operationDigest}),
  embedding:{sourceId,modelId:MODEL,dimensions:384,payload:JSON.stringify(input.embedding),valuesBase64:body},
  receipt:{sourceId,operationId:item.operationId,operationDigest:item.operationDigest},stamp:{sourceId,stamp:item.sourceStamp,postable:true},reuse:null};
}
const request=items=>({generation:GEN,matcherIdentityHash:H,items});
function port(respond){const calls=[];return {calls,repo:createCanonicalV4SemanticSourceRepository({database:{async query(sql,args){calls.push({sql,args});return respond(sql,args);}}})};}

test('binary candidate/reuse mirrors preserve exact doubles, decimal counters and detached frozen outputs',async()=>{
 const row=candidate();const precise=axis(0);precise[1]=Number.MIN_VALUE;precise[2]=-0;row.embedding.valuesBase64=binary(precise).toString('base64');
 row.reuse={matcherIdentityHash:'b'.repeat(64),encoderHash:'c'.repeat(64),representationHash:'d'.repeat(64),operationDigest:row.receipt.operationDigest,
  bodyWireHash:sha(binary(precise)),titleValuesBase64:binary(axis(1)).toString('base64')};
 row.ordinal='9007199254740993';row.sourceVersion='9007199254740995';const before=structuredClone(row);
 const {repo,calls}=port(()=>({rows:[{candidate:row}]}));
 const out=await repo.candidates({generation:GEN,matcherIdentityHash:H,afterOrdinal:'9007199254740992',limit:1});
 assert.equal(out.candidates[0].ordinal,row.ordinal);assert.equal(out.candidates[0].sourceVersion,row.sourceVersion);
 assert.equal(out.candidates[0].embedding.values[1],Number.MIN_VALUE);assert.equal(Object.is(out.candidates[0].embedding.values[2],-0),true);
 assert.deepEqual(out.candidates[0].reuse.titleValues,axis(1));assert.deepEqual(row,before);assert.ok(Object.isFrozen(out.candidates[0].embedding.values));
 assert.deepEqual(calls[0].args,[GEN,H,'9007199254740992',1]);assert.match(calls[0].sql,/semantic_read_source_candidates/);
 row.title='Late mutated driver row';assert.equal(out.candidates[0].title,'Invented stored title');
});

test('candidate reads reject wrong scope, corrupt binary, duplicates, ordering and cumulative overflow',async()=>{
 for(const rows of [
  [{candidate:{...candidate(),generation:'different-generation'}}],
  [{candidate:{...candidate(),matcherIdentityHash:'b'.repeat(64)}}],
  [{candidate:{...candidate(),embedding:{...candidate().embedding,valuesBase64:'not-base64'}}}],
  [{candidate:candidate()},{candidate:candidate()}],
  [{candidate:candidate('source-a','2')},{candidate:candidate('source-b','1')}],
 ]){const {repo}=port(()=>({rows}));await assert.rejects(repo.candidates({generation:GEN,matcherIdentityHash:H,afterOrdinal:null,limit:50}),e=>e.code==='storage-corrupt');}
 const rows=Array.from({length:50},(_,i)=>{const c=candidate('large-'+i,String(i));c.sourcePayload='"'.repeat(65536);return {candidate:c};});
 const {repo}=port(()=>({rows}));await assert.rejects(repo.candidates({generation:GEN,matcherIdentityHash:H,afterOrdinal:null,limit:50}),e=>e.code==='storage-corrupt');
});

test('reclassification makes one bounded parameterized call and preserves signed-zero title wire without canonical writes',async()=>{
 const first=ready('source-a','0'),second=ready('source-b','9007199254740993');first.titleValues[2]=-0;const before=structuredClone([first,second]);
 const {repo,calls}=port(()=>({rows:[{source_id:second.sourceId,source_version:second.sourceVersion,status:'reused'},
  {source_id:first.sourceId,source_version:first.sourceVersion,status:'recorded'}]}));
 const out=await repo.reclassify(request([first,second]));assert.deepEqual(out,[{sourceId:'source-b',sourceVersion:'9007199254740993',status:'reused'},
  {sourceId:'source-a',sourceVersion:'0',status:'recorded'}]);assert.deepEqual([first,second],before);assert.equal(calls.length,1);
 assert.match(calls[0].sql,/semantic_reclassify_stored_sources/);assert.doesNotMatch(calls[0].sql,/ingest_apply|UPDATE|enqueue/);
 assert.deepEqual(calls[0].args.slice(0,2),[GEN,H]);const sent=JSON.parse(calls[0].args[2]);
 assert.equal(sent[0].generation,GEN);assert.equal(sent[0].matcherIdentityHash,H);assert.match(sent[0].titleValues,/,\-0,/);
 assert.equal(typeof sent[0].titleValues,'string');assert.equal(sent[0].requestMaterial,first.requestMaterial);assert.ok(Object.isFrozen(out[0]));
});

test('generation/model/material/stamp/body mismatches, excluded positives and invalid numbers refuse before SQL',async()=>{
 const {repo,calls}=port(()=>assert.fail('invalid input must not reach SQL'));
 for(const alter of [
  i=>{i.generation='different-generation';},i=>{i.matcherIdentityHash='b'.repeat(64);},i=>{i.operationDigest='b'.repeat(64);},
  i=>{i.requestMaterial+=' ';},i=>{i.sourceStamp='b'.repeat(64);},i=>{i.bodyWireHash='b'.repeat(64);},
  i=>{i.sourceVersion=0;},i=>{i.sourceVersion='00';},i=>{i.sourceVersion='9223372036854775808';},
  i=>{i.titleValues[0]=Infinity;},i=>{i.titleValues=Array(384).fill(0);},i=>{i.supportedPath=['games','games'];},
  i=>{i.semanticEligible=false;},i=>{i.semanticEligible='true';},
 ]){const i=ready();alter(i);await assert.rejects(repo.reclassify(request([i])),TypeError);}
 const excluded=ready();const m=JSON.parse(excluded.requestMaterial);m.title='Just a moment...';excluded.requestMaterial=JSON.stringify(m);
 excluded.operationDigest=sha(excluded.requestMaterial);await assert.rejects(repo.reclassify(request([excluded])),TypeError);
 await assert.rejects(repo.reclassify(request([])),TypeError);await assert.rejects(repo.reclassify(request([ready(),ready()])),TypeError);
 await assert.rejects(repo.reclassify(request(Array.from({length:51},(_,i)=>ready('many-'+i)))),TypeError);assert.equal(calls.length,0);
});

test('owner adoption is explicit, retains expected root/destination/version and accepts only complete response bindings',async()=>{
 const base=ready();const {titleValues,supportedPath,semanticEligible,...source}=base;
 const adoption={...source,rootId:'original-root',rootVersion:'0',topicId:'old-topic',discussionId:'old-discussion'};
 const {repo,calls}=port(()=>({rows:[{root_id:'original-root',status:'adopted'}]}));
 assert.deepEqual(await repo.adoptLegacyRoots(request([adoption])),[{rootId:'original-root',status:'adopted'}]);assert.equal(calls.length,1);
 assert.match(calls[0].sql,/semantic_adopt_legacy_roots/);assert.deepEqual(JSON.parse(calls[0].args[2]),[adoption]);
 for(const result of [{rows:[]},{rows:[{root_id:'foreign-root',status:'adopted'}]},{rows:[{root_id:'original-root',status:'reclassified'}]}]){
  const bad=port(()=>result);await assert.rejects(bad.repo.adoptLegacyRoots(request([adoption])),e=>e.code==='storage-corrupt');
 }
 const invalid=port(()=>assert.fail('mixed authority shape must not reach SQL'));
 await assert.rejects(invalid.repo.adoptLegacyRoots(request([{...adoption,titleValues:axis(0)}])),TypeError);
 await assert.rejects(invalid.repo.adoptLegacyRoots(request([{...adoption,generation:'other-generation'}])),TypeError);
 await assert.rejects(invalid.repo.adoptLegacyRoots(request([{...adoption,matcherIdentityHash:'b'.repeat(64)}])),TypeError);
});

test('missing, duplicate or retargeted reclassification results never masquerade as committed requested work',async()=>{
 const input=ready();for(const rows of [[],[{source_id:'foreign',source_version:'0',status:'recorded'}],
  [{source_id:input.sourceId,source_version:'1',status:'recorded'}],[{source_id:input.sourceId,source_version:'0',status:'accepted'}]]){
  const {repo}=port(()=>({rows}));await assert.rejects(repo.reclassify(request([input])),e=>e.code==='storage-corrupt');
 }
 const {repo}=port(()=>({rows:[{source_id:'source-a',source_version:'0',status:'recorded'},{source_id:'source-a',source_version:'0',status:'recorded'}]}));
 await assert.rejects(repo.reclassify(request([input,ready('source-b') ])),e=>e.code==='storage-corrupt');
});

test('private database failures map finite codes without exposing SQL messages or raw material',async()=>{
 for(const [sqlState,expected] of [['P1231','conflict'],['40001','conflict'],['P1233','invalid'],['P1234','storage-corrupt'],['XX000','storage-failure']]){
  const {repo}=port(()=>{throw Object.assign(new Error('private SQL/password/material'),{code:sqlState});});
  await assert.rejects(repo.reclassify(request([ready()])),error=>error.code===expected&&!error.message.includes('private'));
 }
});

test('unsafe accessors, proxies and exotic input shapes are rejected without invoking hooks',async()=>{
 let hooks=0;const hook=()=>{hooks++;throw new Error('must not invoke');},traps={get:hook,ownKeys:hook,getOwnPropertyDescriptor:hook,getPrototypeOf:hook};
 const {repo,calls}=port(()=>assert.fail('unsafe input reached SQL'));
 const accessor=ready();Object.defineProperty(accessor,'operationDigest',{enumerable:true,get:hook});
 const values=[accessor,new Proxy(ready(),traps),{...ready(),titleValues:new Proxy(axis(0),traps)},Object.create(ready())];
 for(const i of values)await assert.rejects(repo.reclassify(request([i])),TypeError);
 await assert.rejects(repo.candidates(new Proxy({generation:GEN,matcherIdentityHash:H,afterOrdinal:null,limit:1},traps)),TypeError);
 assert.equal(hooks,0);assert.equal(calls.length,0);
 const raw=candidate();Object.defineProperty(raw.embedding,'valuesBase64',{enumerable:true,get:hook});
 const response=port(()=>({rows:[{candidate:raw}]}));await assert.rejects(response.repo.candidates({generation:GEN,matcherIdentityHash:H,afterOrdinal:null,limit:1}),e=>e.code==='storage-corrupt');assert.equal(hooks,0);
});
