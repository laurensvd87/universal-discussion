import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createHierarchyIngestionPreparation} from '../src/application/hierarchy-ingestion-preparation.js';
import {compileRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {fitPooledRootRankPolicy} from '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';

const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),hash=text=>createHash('sha256').update(text).digest('hex');
const modelId='e5-small-q8-browser-main-prefix-v1';
function matcher(){
 const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}];
 const rootModel=trainHierarchyLinearHeads({nodes,rows:Array.from({length:4},(_,i)=>({id:'train-'+i,groupId:'tg-'+i,split:'training',expectedTopicId:i<2?'games':'nature',vector:axis(i<2?0:1)})),
  representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-root/v1',lambda:.1});
 const core=compileHierarchyLinearHeads(rootModel),rows=Array.from({length:20},(_,i)=>({id:'cal-'+i,groupId:'cg-'+i,expectedRootId:i%2?'nature':'games',
  scores:scoreHierarchyLinearHeads(core,{sourceId:'cal-'+i,sourceVersion:'invented',representation:paired.representation,representationHash:paired.representationHash,vector:axis(i%2?1:0)}).scores.map(({nodeId,score})=>({nodeId,score}))}));
 const rootPolicy=fitPooledRootRankPolicy({modelHash:hash(JSON.stringify(rootModel)),representationHash:paired.representationHash,inputConstructionHash:'b'.repeat(64),nodeIds:['games','nature'],rows});
 return compileRootedHierarchyMatcher({rootModel,rootPolicy,inputDefinition,nodes,detailArtifacts:[]});
}
function claim(title='Invented title',operationId='operation-1'){
 const input={expected:{generation:'generation-1',revision:1},operationId,url:'https://en.wikipedia.org/wiki/Invented_subject',title,
  embedding:{modelId,values:axis(0)},extractorVersion:'crawler-static-html-prefix/v1'};
 return materialize(input);
}
function materialize(input){const requestMaterial=JSON.stringify({url:input.url,title:input.title,embedding:input.embedding,extractorVersion:input.extractorVersion});
 return {operationId:input.operationId,operationDigest:hash(requestMaterial),requestMaterial,input};}
const unavailable=error=>error instanceof Error&&!(error instanceof TypeError)&&error.code==='unavailable'&&error.message==='Hierarchy ingestion preparation unavailable';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('actual numeric root classifier binds the canonical operation including title without renormalization',async()=>{
 let calls=0;const prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async()=>{calls++;return {modelId,values:axis(0)};}});
 const a=claim(),before=structuredClone(a),first=await prep.prepare(a);
 assert.deepEqual(a,before);assert.deepEqual(first.decision.semanticPath,['games']);assert.equal(first.sourceVersion,a.operationDigest);assert.equal(first.sourceId,a.operationId);
 assert.equal(first.numericPreparedOnly,true);assert.equal(first.nativeObservation,false);assert.equal(first.assignmentAuthority,false);assert.ok(Object.isFrozen(first.titleEmbedding.values));
 const second=await prep.prepare(claim('Changed title','operation-2'));assert.notEqual(second.sourceVersion,first.sourceVersion);assert.equal(calls,2);
 const drift=claim('Accepted binary64 drift','operation-3');drift.input.embedding.values[0]=1-1e-8;const driftBound=materialize(drift.input);
 assert.equal((await prep.prepare(driftBound)).sourceVersion,driftBound.operationDigest);
 assert.equal(JSON.stringify(first).includes('Invented title'),false);assert.equal(JSON.stringify(prep.describe()).includes('Invented title'),false);
 await prep.close();
});

test('forged canonical material, shape, digest and model are rejected before encoder with no getter/proxy calls',async()=>{
 let calls=0,hooks=0;const prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async()=>{calls++;return {modelId,values:axis(0)};}});
 const bad=[];let q=claim();q.input.title='Changed after digest';bad.push(q);q=claim();q.operationDigest='a'.repeat(64);bad.push(q);
 q=claim();q.requestMaterial+=' ';q.operationDigest=hash(q.requestMaterial);bad.push(q);
 q=claim();q.operationId='another-operation';bad.push(q);q=claim();q.input.expected.extra=true;bad.push(q);
 q=claim();q.input.url='https://EN.wikipedia.org/wiki/Invented_subject';bad.push(materialize(q.input));q=claim();q.input.embedding.modelId='other';bad.push(materialize(q.input));
 q=claim();q.input.embedding.values[0]=2;bad.push(materialize(q.input));q=claim();q.input.extractorVersion='unknown';bad.push(materialize(q.input));
 q=claim();q.input.embedding.values=new Float64Array(q.input.embedding.values);bad.push(q);
 q=claim();Object.defineProperty(q.input,'title',{enumerable:true,get(){hooks++;throw new Error('getter');}});bad.push(q);
 bad.push(new Proxy(claim(),{get(){hooks++;throw new Error('proxy');},getOwnPropertyDescriptor(){hooks++;throw new Error('proxy');}}));
 for(const invalid of bad)await assert.rejects(prep.prepare(invalid),TypeError);
 assert.equal(calls,0);assert.equal(hooks,0);await prep.close();
});

test('same digest shares inflight work and cached numeric result across operation IDs, distinct work is serialized',async()=>{
 let calls=0,active=0,peak=0;const gate=deferred();const prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async()=>{
  calls++;active++;peak=Math.max(peak,active);if(calls===1)await gate.promise;active--;return {modelId,values:axis(0)};
 }});
 const first=prep.prepare(claim()),shared=prep.prepare(claim('Invented title','operation-2')),different=prep.prepare(claim('Second title','operation-3'));
 await turn();assert.equal(calls,1);gate.resolve();const [a,b]=await Promise.all([first,shared,different]);assert.equal(calls,2);assert.equal(peak,1);
 assert.equal(a.decision,b.decision);assert.equal(b.operationId,'operation-2');assert.equal(a.operationDigest,b.operationDigest);
 const cached=await prep.prepare(claim());assert.equal(cached.titleEmbedding,a.titleEmbedding);assert.equal(calls,2);await prep.close();
});

test('caller mutation during encoding cannot rewrite the validated input or cached title vector',async()=>{
 const gate=deferred(),seen=[],prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async title=>{seen.push(title);return gate.promise;}});
 const a=claim(),expectedDigest=a.operationDigest,pending=prep.prepare(a);await turn();
 a.input.title='Late replacement';a.input.embedding.values[0]=0;a.operationDigest='f'.repeat(64);
 const returned={modelId,values:axis(0)};gate.resolve(returned);const out=await pending;returned.values[0]=0;
 assert.deepEqual(seen,['Invented title']);assert.equal(out.operationDigest,expectedDigest);assert.deepEqual(out.decision.semanticPath,['games']);assert.equal(out.titleEmbedding.values[0],1);
 const cached=await prep.prepare(claim());assert.equal(cached.titleEmbedding.values[0],1);assert.equal(seen.length,1);await prep.close();
});

test('encoder failures, bad model/vector and hostile result are ordinary unavailable failures and never cached',async()=>{
 for(const broken of [()=>{throw new TypeError('private infrastructure');},()=>Promise.reject(undefined),()=>({modelId:'wrong',values:axis(0)}),
  ()=>({modelId,values:axis(0).fill(0)}),()=>({modelId,values:axis(0).map(()=>NaN)}),()=>new Proxy({},{get(){throw new Error('hook');}})]){
  let calls=0;const prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async()=>{calls++;return calls===1?broken():{modelId,values:axis(0)};}});
  await assert.rejects(prep.prepare(claim()),unavailable);assert.deepEqual((await prep.prepare(claim())).decision.rootPath,['games']);assert.equal(calls,2);await prep.close();
 }
});

test('close blocks pending and queued late publication, refuses new work and does not close caller encoder',async()=>{
 let calls=0;const gate=deferred(),prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async()=>{calls++;return gate.promise;}});
 const first=prep.prepare(claim()),second=prep.prepare(claim('Queued title','operation-2'));
 const rejected=Promise.all([assert.rejects(first,unavailable),assert.rejects(second,unavailable)]);
 await turn();const closing=prep.close();assert.equal(prep.close(),closing);await assert.rejects(prep.prepare(claim()),unavailable);
 gate.resolve({modelId,values:axis(0)});await rejected;await closing;assert.equal(calls,1);
});

test('fixed pending and LRU capacities bound retained numeric work',async()=>{
 let calls=0;const gate=deferred(),prep=createHierarchyIngestionPreparation({matcher:matcher(),embedTitle:async()=>{calls++;if(calls===1)await gate.promise;return {modelId,values:axis(0)};}});
 const pending=Array.from({length:8},(_,i)=>prep.prepare(claim('Pending '+i,'op-'+i)));
 await assert.rejects(prep.prepare(claim('Overflow','overflow')),unavailable);gate.resolve();await Promise.all(pending);
 for(let i=8;i<33;i++)await prep.prepare(claim('Pending '+i,'op-'+i));assert.equal(calls,33);
 await prep.prepare(claim('Pending 0','op-again'));assert.equal(calls,34);await prep.close();
});
