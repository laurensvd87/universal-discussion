import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestHandler} from '../src/http/request-handler.js';
import {createMemoryDemoService} from '../src/application/create-demo-service.js';
import {createLocalServiceClient,isMissingSemanticCapabilities,LocalServiceClientError} from '../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {readCatalog,readSemanticCapabilities,HIERARCHY_SOURCE_POLICY,REFERENCE_TOPIC_POLICY} from '../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import {requiresReferenceTopicView} from '../../../spikes/topic-resolution/browser/core/topic-view-mode.js';

const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'synthetic-capability-test-token-long-enough'};
const headers={host:config.hostHeader,origin:config.origin,authorization:'Bearer '+config.capability,'content-type':'application/json'};
const request=(patch={})=>({method:'POST',url:'/v1/semantic/capabilities',body:'{}',headers,...patch});
const json=(value,status=200)=>new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

test('paired semantic display capability is explicit and does not read a database, model or topic directory',async()=>{
 let calls=0;const handle=createRequestHandler({config,service:{semanticTopics:()=>{calls++;assert.fail('No directory read');}}});
 const response=await handle(request());assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.body),{protocol:'semantic-topics/v1'});assert.equal(calls,0);
 const old=createRequestHandler({config,service:{}});assert.equal((await old(request())).status,404);
 for(const value of [null,{},[],{protocol:'other'},{protocol:'semantic-topics/v1',authority:true}])assert.throws(()=>readSemanticCapabilities(value),TypeError);
});

test('capability retains strict pairing, Origin, Host, JSON and transport delivery guards',async()=>{
 const handle=createRequestHandler({config,service:{semanticTopics:()=>assert.fail('No query')}});
 assert.equal((await handle(request({headers:{...headers,authorization:'Bearer wrong'}}))).status,401);
 assert.equal((await handle(request({headers:{...headers,origin:'https://example.org'}}))).status,403);
 assert.equal((await handle(request({headers:{...headers,host:'example.org'}}))).status,403);
 assert.equal((await handle(request({body:'{"sourceId":"unwanted"}'}))).status,400);
 assert.equal((await handle(request(),{isCurrent:()=>false})).status,503);
 let paired=true,checks=0;
 const rotating=createRequestHandler({config,service:{semanticTopics:()=>{}},pairingVerifier:{verify(){checks++;return paired;}}});
 const pending=rotating(request());paired=false;const response=await pending;
 assert.ok(checks>1);assert.equal(response.status,401);assert.equal(response.body.includes('semantic-topics'),false);
});

test('only an exact fixed-endpoint 404 supplies old-backend fallback evidence',async()=>{
 for(const [body,status,missing] of [
  ['{"error":"not-found"}',404,true],['{"error":"not-found","extra":true}',404,false],
  ['{"error":"not-found","error":"not-found"}',404,false],['not json',404,false],
  ['{"error":"forbidden"}',403,false],['{"error":"unauthorized"}',401,false],['{"error":"internal"}',500,false],
 ]){
  let accountLookups=0;const paths=[];
  const client=createLocalServiceClient({getToken:()=>config.capability,getAccountToken:()=>{accountLookups++;return null;},
   fetchImpl:async(url,options)=>{paths.push(new URL(url).pathname);assert.equal(options.body,'{}');return json(body,status);}});
  const error=await client.semanticCapabilities().catch(error=>error);assert.ok(error instanceof LocalServiceClientError);
  assert.equal(isMissingSemanticCapabilities(error),missing);assert.equal(accountLookups,0);
  assert.deepEqual(paths,missing?['/v1/semantic/capabilities/v2','/v1/semantic/capabilities']:['/v1/semantic/capabilities/v2']);
 }
 assert.equal(isMissingSemanticCapabilities(new LocalServiceClientError('unavailable')),false);
});

test('v2 negotiation keeps original v1 projections separate and the header grants no posting or pairing authority',async()=>{
 const version={generation:'generation',revision:1},directory=title=>({version,policyRevision:0,topics:[{id:'games',title,path:['games']}]});let modern=0,legacy=0;
 const old={coherentSnapshotReads:true,semanticTopics:async()=>{legacy++;return directory('Original Games');}};
 const handle=createRequestHandler({config,service:{coherentSnapshotReads:true,semanticProtocolVersion:2,legacySemantic:old,
  semanticTopics:async()=>{modern++;return directory('Current Games');},authorContext:()=>assert.fail('No editor query'),semanticSearch:()=>assert.fail('No search query')}});
 const oldCaps=await handle(request());assert.deepEqual(JSON.parse(oldCaps.body),{protocol:'semantic-topics/v1'});
 const client=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async(url,o)=>{
  const r=await handle({method:o.method,url:new URL(url).pathname,headers:{...o.headers,host:config.hostHeader,origin:config.origin},body:o.body});return new Response(r.body,{status:r.status,headers:r.headers});}});
 assert.deepEqual(await client.semanticCapabilities(),{protocol:'semantic-topics/v2',authorContext:'authored-topics/v2',topicSearch:'named-topics/v2'});assert.equal(modern+legacy,0);
 assert.equal((await client.semanticTopics()).topics[0].title,'Current Games');
 const oldRead=await handle(request({url:'/v1/semantic/topics'}));assert.equal(JSON.parse(oldRead.body).topics[0].title,'Original Games');assert.equal(modern,1);assert.equal(legacy,1);
 assert.equal((await handle(request({url:'/v1/semantic/topics',headers:{...headers,'x-murmingle-semantic':'3'}}))).status,400);
 assert.equal((await handle(request({url:'/v1/semantic/topics',headers:{...headers,'x-murmingle-semantic':'2',authorization:'Bearer wrong'}}))).status,401);assert.equal(modern+legacy,2);
 const preflight=await handle({method:'OPTIONS',url:'/v1/semantic/topics',body:null,headers:{host:config.hostHeader,origin:config.origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type,x-murmingle-semantic'}});
 assert.equal(preflight.status,204);assert(preflight.headers['access-control-allow-headers'].includes('x-murmingle-semantic'));
 for(const value of [{protocol:'semantic-topics/v1',authorContext:'authored-topics/v2'},{protocol:'semantic-topics/v2',topicSearch:'named-topics/v1'}])assert.throws(()=>readSemanticCapabilities(value),TypeError);
});

test('only confirmed missing v2 negotiation probes v1 and a cancelled fallback dispatches no second request',async()=>{
 let current=true;const paths=[];const client=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async(url,o)=>{
  paths.push(new URL(url).pathname);assert.equal(o.headers['X-Murmingle-Semantic'],undefined);return paths.length===1?json('{"error":"not-found"}',404):json({protocol:'semantic-topics/v1'});}});
 assert.deepEqual(await client.semanticCapabilities(),{protocol:'semantic-topics/v1'});assert.deepEqual(paths,['/v1/semantic/capabilities/v2','/v1/semantic/capabilities']);
 let calls=0;const cancelled=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async()=>{calls++;current=false;return json('{"error":"not-found"}',404);}});
 await assert.rejects(cancelled.semanticCapabilities({beforeDispatch:()=>current}),{code:'conflict'});assert.equal(calls,1);
});

test('a late older capability response cannot replace the negotiated protocol of a newer probe',async()=>{
 let release,calls=0,header;const delayed=new Promise(done=>{release=done;});
 const client=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async(url,o)=>{
  if(url.endsWith('/capabilities/v2')){calls++;return calls===1?delayed:json({protocol:'semantic-topics/v2'});}
  header=o.headers['X-Murmingle-Semantic'];return json({version:{generation:'generation',revision:1},policyRevision:0,topics:[]});
 }});
 const first=client.semanticCapabilities(),observed=assert.rejects(first,{code:'unavailable'});while(calls===0)await Promise.resolve();
 await client.semanticCapabilities();release(json({protocol:'semantic-topics/v1'}));await observed;await client.semanticTopics();assert.equal(header,'2');
});

test('capability dispatch checks delayed credentials and validates the response without retry',async()=>{
 let release,calls=0,current=true;const token=new Promise(resolve=>{release=resolve;});
 const client=createLocalServiceClient({getToken:()=>token,fetchImpl:async()=>{calls++;return json({protocol:'semantic-topics/v1'});}});
 const pending=client.semanticCapabilities({beforeDispatch:()=>current});current=false;release(config.capability);
 await assert.rejects(pending,{code:'conflict'});assert.equal(calls,0);
 const invalid=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async()=>{calls++;return json({protocol:'semantic-topics/v1',ready:true});}});
 await assert.rejects(invalid.semanticCapabilities(),{code:'invalid-response'});assert.equal(calls,1);
});

function learnedCatalog(){
 let serial=0;const service=createMemoryDemoService({nextId:kind=>kind+'-'+(++serial),now:()=> '2026-10-27T12:00:00.000Z'});
 const outcome=service.ingest({expected:service.catalog().version,operationId:'source-policy-operation',url:'https://example.org/topic-policy',title:'Policy test',
  embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:Array.from({length:384},(_,i)=>i===0?1:0)},extractorVersion:'main-text-prefix/v1'});
 return {catalog:structuredClone(service.catalog()),sourceId:outcome.sourceId};
}

test('validated hierarchy Source policy disables the old Ridge presentation requirement without changing memberships',()=>{
 const {catalog,sourceId}=learnedCatalog(),source=catalog.sources.find(source=>source.id===sourceId);
 source.topicIds=[source.topicId];const before=structuredClone(source);
 const legacy=readCatalog(catalog);assert.equal(requiresReferenceTopicView(legacy,sourceId),true);
 source.assignmentPolicy=HIERARCHY_SOURCE_POLICY;const hierarchy=readCatalog(catalog);
 assert.equal(requiresReferenceTopicView(hierarchy,sourceId),false);
 assert.deepEqual(hierarchy.sources.find(source=>source.id===sourceId),{...before,assignmentPolicy:HIERARCHY_SOURCE_POLICY});
 source.assignmentPolicy=REFERENCE_TOPIC_POLICY;assert.equal(requiresReferenceTopicView(readCatalog(catalog),sourceId),true);
});

test('unknown or forged Source policy cannot disable existing presentation checks',()=>{
 const {catalog,sourceId}=learnedCatalog(),source=catalog.sources.find(source=>source.id===sourceId);source.topicIds=[source.topicId];
 for(const policy of [null,true,'unknown-policy']){source.assignmentPolicy=policy;assert.throws(()=>readCatalog(catalog),TypeError);}
 source.assignmentPolicy=HIERARCHY_SOURCE_POLICY;delete source.topicIds;assert.throws(()=>readCatalog(catalog),TypeError);
 source.topicIds=[source.topicId];source.provenance='project-created-hand-authored-demo/1';assert.throws(()=>readCatalog(catalog),TypeError);
});
