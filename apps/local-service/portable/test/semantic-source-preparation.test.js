import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {verifyStoredSourceCandidate,createStoredSourceHierarchyPreparation} from '../canonical-v4/semantic-source-preparation.js';
import {compilePairedE5Input,describePairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {fitPooledRootRankPolicy} from '../../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';

const sha=value=>createHash('sha256').update(value).digest('hex'),hash=value=>sha(JSON.stringify(value));
const modelId='e5-small-q8-browser-main-prefix-v1',axis=n=>Array.from({length:384},(_,i)=>i===n?1:0);
const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}];
const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
const rootModel=trainHierarchyLinearHeads({nodes,rows:Array.from({length:4},(_,i)=>({id:'source-train-'+i,groupId:'source-train-group-'+i,split:'training',expectedTopicId:i<2?'games':'nature',vector:axis(i<2?0:1)})),
 representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-stored-source-test',lambda:.1});
const core=compileHierarchyLinearHeads(rootModel),rows=Array.from({length:20},(_,i)=>({id:'cal-'+i,groupId:'cal-group-'+i,expectedRootId:i%2?'nature':'games',
 scores:scoreHierarchyLinearHeads(core,{sourceId:'cal-'+i,sourceVersion:'invented',representation:paired.representation,representationHash:paired.representationHash,vector:axis(i%2?1:0)}).scores.map(({nodeId,score})=>({nodeId,score}))}));
const rootPolicy=fitPooledRootRankPolicy({modelHash:hash(rootModel),representationHash:paired.representationHash,inputConstructionHash:'b'.repeat(64),nodeIds:['games','nature'],rows});
const matcher=compileRootedHierarchyMatcher({rootModel,rootPolicy,inputDefinition,nodes,detailArtifacts:[]}),identity=describeRootedHierarchyMatcher(matcher);

function wire(values){const bytes=Buffer.alloc(20+values.length*12);bytes.writeInt32BE(1,0);bytes.writeUInt32BE(701,8);bytes.writeInt32BE(values.length,12);bytes.writeInt32BE(1,16);
 values.forEach((n,i)=>{bytes.writeInt32BE(8,20+i*12);bytes.writeDoubleBE(n,24+i*12);});return bytes.toString('base64');}
function candidate({title='Invented public game page',sourceVersion='0',sourceId='stored-source-one'}={}){
 const input={url:'https://semantic.example.org/stored',title,embedding:{modelId,values:axis(0)},extractorVersion:'crawler-static-html-prefix/v1'};
 const digest=operationDigestFor(input),operationId='stored-operation',provenance='owner-local-page-embedding/v1',policyVersion='ridge1-fixed-reference-radius/v1';
 return {sourceId,ordinal:'0',sourceVersion,generation:'stored-source-generation',matcherIdentityHash:hash(identity),url:input.url,title,provenance,extractorVersion:input.extractorVersion,policyVersion,operationId,hasEmbedding:true,
  sourcePayload:JSON.stringify({id:sourceId,...input,provenance,policyVersion,operationId,operationDigest:digest,topicIds:['canonical-topic']}),
  embedding:{sourceId,modelId,dimensions:384,payload:JSON.stringify(input.embedding),valuesBase64:wire(input.embedding.values),values:input.embedding.values},
  receipt:{sourceId,operationId,operationDigest:digest},stamp:{sourceId,stamp:sourceStamp(input),postable:true},reuse:null};
}
function withReuse(value,extra={}){value.reuse={matcherIdentityHash:'c'.repeat(64),encoderHash:identity.inputDefinition.encoderHash,representationHash:identity.representationHash,
 operationDigest:value.receipt.operationDigest,bodyWireHash:sha(Buffer.from(value.embedding.valuesBase64,'base64')),titleValuesBase64:wire(axis(1)),titleValues:axis(1),...extra};return value;}

test('verified imported version zero reconstructs exact title-inclusive material without normalizing coordinates',()=>{
 const value=candidate(),verified=verifyStoredSourceCandidate(value);
 assert.equal(verified.sourceVersion,'0');assert.equal(sha(verified.requestMaterial),value.receipt.operationDigest);
 assert.equal(verified.sourceStamp,value.stamp.stamp);assert.equal(verified.bodyWireHash,sha(Buffer.from(value.embedding.valuesBase64,'base64')));
 assert.equal(verified.semanticEligible,true);assert.deepEqual(verified.bodyValues,axis(0));assert.ok(Object.isFrozen(verified.bodyValues));
 value.embedding.values[0]=0;assert.equal(verified.bodyValues[0],1);
});

test('typed/payload/vector/receipt/stamp disagreement fails before any title encoder call',async()=>{
 let calls=0;const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async()=>{calls++;return {modelId,values:axis(0)};}});
 for(const change of [v=>{v.title='Another title';},v=>{v.receipt.operationDigest='d'.repeat(64);},v=>{v.stamp.stamp='d'.repeat(64);},
  v=>{v.sourcePayload=JSON.stringify({...JSON.parse(v.sourcePayload),operationId:'another-operation'});},v=>{v.embedding.values=axis(1);},
  v=>{v.embedding.payload=JSON.stringify({modelId,values:axis(1)});},v=>{v.hasEmbedding=false;},v=>{v.sourceVersion='01';},
  v=>{v.matcherIdentityHash='d'.repeat(64);},v=>{v.embedding.valuesBase64=wire(axis(1));}]){
  const value=candidate();change(value);await assert.rejects(prep.prepare(value),TypeError);
 }
 assert.equal(calls,0);await prep.close();
});

test('shared title preparation coalesces and caches numeric work while binding each current Source/version independently',async()=>{
 let calls=0;const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async()=>{calls++;return {modelId,values:new Float64Array(axis(0))};}});
 const another=candidate({sourceId:'stored-source-two',sourceVersion:'5'});another.generation='another-generation';
 const [first,second]=await Promise.all([prep.prepare(candidate()),prep.prepare(another)]);
 assert.equal(calls,1);assert.equal(first.sourceId,'stored-source-one');assert.equal(first.sourceVersion,'0');
 assert.equal(second.sourceId,'stored-source-two');assert.equal(second.sourceVersion,'5');assert.deepEqual(first.supportedPath,['games']);
 assert.equal(first.generation,'stored-source-generation');assert.equal(second.generation,'another-generation');
 assert.equal(first.matcherIdentityHash,hash(identity));assert.equal(second.matcherIdentityHash,hash(identity));
 await prep.prepare(candidate({sourceVersion:'6'}));assert.equal(calls,1);
 const changed=await prep.prepare(candidate({title:'Invented changed title',sourceVersion:'7'}));assert.equal(calls,2);
 assert.notEqual(changed.operationDigest,first.operationDigest);assert.equal(changed.sourceStamp,first.sourceStamp,'title is absent from legacy Source stamp');
 await prep.close();
});

test('retained title reuse requires exact material, body wire, encoder and representation identities',async()=>{
 let calls=0;const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async()=>{calls++;return {modelId,values:axis(0)};}});
 assert.deepEqual((await prep.prepare(withReuse(candidate()))).titleValues,axis(1));assert.equal(calls,0);
 assert.deepEqual((await prep.prepare(withReuse(candidate(),{encoderHash:'e'.repeat(64)}))).titleValues,axis(0));assert.equal(calls,1);
 await assert.rejects(prep.prepare(withReuse(candidate(),{bodyWireHash:'f'.repeat(64)})),TypeError);
 await assert.rejects(prep.prepare(withReuse(candidate(),{operationDigest:'f'.repeat(64)})),TypeError);
 const bad=withReuse(candidate());bad.reuse.titleValues=axis(0);await assert.rejects(prep.prepare(bad),TypeError);assert.equal(calls,1);
 await prep.close();
});

test('verified excluded or nonpostable stored context stays unclassified without encoding or fake vectors',async()=>{
 let calls=0;const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async()=>{calls++;return {modelId,values:axis(0)};}});
 assert.equal(await prep.prepare(candidate({title:'Just a moment...'})),null);
 const blocked=candidate();blocked.stamp.postable=false;assert.equal(await prep.prepare(blocked),null);assert.equal(calls,0);await prep.close();
});

test('infrastructure errors remain retryable and closing prevents late numeric publication',async()=>{
 let calls=0;const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async()=>{calls++;if(calls===1)throw Error('private infrastructure failure');return {modelId,values:axis(0)};}});
 await assert.rejects(prep.prepare(candidate()),e=>e.code==='unavailable'&&!(e instanceof TypeError)&&!e.message.includes('private'));
 assert.deepEqual((await prep.prepare(candidate())).supportedPath,['games']);assert.equal(calls,2);await prep.close();
 let release,entered;const started=new Promise(resolve=>{entered=resolve;}),pending=new Promise(resolve=>{release=resolve;});
 const closing=createStoredSourceHierarchyPreparation({matcher,embedTitle:async()=>{entered();return pending;}}),work=closing.prepare(candidate());await started;
 const done=closing.close();release({modelId,values:axis(0)});await assert.rejects(work,e=>e.code==='unavailable');await done;
 await assert.rejects(closing.prepare(candidate()),e=>e.code==='unavailable');
});

test('caller accessors and proxy containers cannot execute hooks while verifying stored material',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('untrusted hook');};
 const value=candidate();Object.defineProperty(value,'sourcePayload',{get:trap});assert.throws(()=>verifyStoredSourceCandidate(value),TypeError);
 assert.throws(()=>verifyStoredSourceCandidate(new Proxy(candidate(),{get:trap,ownKeys:trap})),TypeError);
 const proxy=candidate();proxy.embedding.values=new Proxy(proxy.embedding.values,{get:trap});assert.throws(()=>verifyStoredSourceCandidate(proxy),TypeError);
 assert.equal(hooks,0);
});
