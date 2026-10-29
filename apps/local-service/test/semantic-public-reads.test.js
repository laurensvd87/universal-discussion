import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresCanonicalService} from '../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../src/http/request-handler.js';
import {AccountError} from '../src/accounts/account-errors.js';
import {createLocalServiceClient} from '../../../spikes/topic-resolution/browser/core/local-service-client.js';

const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-semantic-read'};
const input={nodeId:'games',limit:20,cursor:null};
const version=Object.freeze({generation:'semantic-http-generation',revision:1});
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function fixture({enabled=false,feed=async()=>({version,roots:[]}),stamp=async()=>({generation:version.generation,revision:'f'.repeat(64)}),discussionPage=null}={}){
 const never=()=>assert.fail('Unrelated canonical read or mutation');
 const reads={version:async()=>version,catalogContext:never,catalogPage:never,discussionPage:discussionPage??never,exactSource:never,urlSelection:never,
  semanticFeed:feed,semanticThread:async()=>({version,root:{id:'canonical-root'}}),semanticTarget:async()=>({version,root:{id:'canonical-root'},targetId:'canonical-root'}),
  semanticTopics:async()=>({version,policyRevision:0,topics:[]}),semanticContext:async()=>({version,sourceId:'saved-source'}),semanticStamp:stamp};
 return createPostgresCanonicalService({reads,runtime:{command:never},semanticDiscussions:enabled});
}

test('actual application HTTP projection preserves the per-discussion cursor version required by the public history client',async()=>{
 const cfg={...config,capability:'canonical-history-public-test-token-long-enough'},requests=[];
 const service=fixture({discussionPage:async value=>{assert.deepEqual(value,{topicId:'manual-topic',limit:20,cursor:null});return {
  version,discussionVersion:7,topic:{id:'manual-topic',title:'Unclassified manual discussion',kind:'general'},discussionId:'manual-discussion',items:[],nextCursor:null};}});
 const handle=createRequestHandler({config:cfg,service});
 const client=createLocalServiceClient({getToken:()=>cfg.capability,getAccountToken:()=>assert.fail('Public history does not use account sessions'),
  fetchImpl:async(url,options)=>{requests.push(new URL(url).pathname);const headers=Object.fromEntries(Object.entries(options.headers).map(([key,value])=>[key.toLowerCase(),value]));
   const response=await handle({method:options.method,url:new URL(url).pathname,headers:{...headers,host:cfg.hostHeader,origin:cfg.origin},body:options.body??null});
   return {url,status:response.status,headers:new Headers(response.headers),body:new Response(response.body).body};
  }});
 const page=await client.canonicalDiscussionPage({topicId:'manual-topic',limit:20,cursor:null});
 assert.equal(page.discussionVersion,7);assert.equal(page.topic.id,'manual-topic');assert.equal(page.discussionId,'manual-discussion');assert.equal(Object.isFrozen(page),true);
 assert.deepEqual(requests,['/v1/discussions/page']);
});

test('semantic routes are opt-in until startup installs their schema and matcher',async()=>{
 let calls=0;const service=fixture({feed:async()=>{calls++;return {};}});
 assert.equal(service.semanticFeed,undefined);assert.equal(service.semanticThread,undefined);
 await assert.rejects(service.readPublic('semanticFeed',input),e=>e.code==='unavailable');assert.equal(calls,0);
 const handle=createRequestHandler({config,service});
 const response=await handle({method:'POST',url:'/v1/semantic/feed',body:JSON.stringify(input),headers:{host:config.hostHeader,origin:config.origin,
  authorization:'Bearer '+config.capability,'content-type':'application/json'}});
 assert.equal(response.status,404);assert.equal(calls,0);
});

test('concurrent semantic readers share one physical read with independent cancellation and delivery authority',async()=>{
 const gate=defer();let calls=0,current=true;
 const service=fixture({enabled:true,feed:async value=>{calls++;assert.deepEqual(value,input);return gate.promise;}}),aborted=new AbortController();
 const a=service.readPublic('semanticFeed',input,{signal:aborted.signal});
 const rejected=assert.rejects(a,e=>e.code==='unavailable');
 const b=service.readPublic('semanticFeed',input,{isCurrent:()=>current});const revoked=assert.rejects(b,e=>e.code==='unavailable');
 const survivors=Array.from({length:100},()=>service.semanticFeed(input));
 await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(calls,1);
 aborted.abort();current=false;const result=Object.freeze({version,roots:[]});gate.resolve(result);
 await rejected;await revoked;const completed=await Promise.all(survivors);assert.ok(completed.every(value=>value===completed[0]));assert.deepEqual(completed[0],{...result,actors:[]});
});

test('a reader after background adoption cannot join a pending older absence at the same canonical revision',async()=>{
 const older=defer();let revision='a'.repeat(64),calls=0;
 const service=fixture({enabled:true,stamp:async()=>({generation:version.generation,revision}),
  feed:async()=>{calls++;return calls===1?older.promise:{version,roots:[{root:{id:'newly-adopted-root'}}]};}});
 const pending=service.semanticFeed(input);await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(calls,1);
 revision='b'.repeat(64);const fresh=await service.semanticFeed(input);assert.equal(calls,2);assert.equal(fresh.roots[0].root.id,'newly-adopted-root');
 older.resolve({version,roots:[]});assert.deepEqual((await pending).roots,[]);
});

for(const route of ['feed','thread','target','topics','context','search'])for(const invalidation of ['none','pairing','session','transport','abort'])
 test(`semantic ${route} HTTP delivery revalidates ${invalidation}`,async()=>{
  let release,paired=true,active=true,session=true,calls=0;const abort=new AbortController();
  const method={feed:'semanticFeed',thread:'semanticThread',target:'semanticTarget',topics:'semanticTopics',context:'semanticContext',search:'semanticSearch'}[route];
  const service={coherentSnapshotReads:true,[method]:()=>assert.fail('Must use guarded public read'),
   readPublic(selected,value,guards){calls++;assert.equal(selected,method);assert.equal(guards.signal,abort.signal);
    return new Promise(resolve=>{release=()=>resolve(Object.freeze({publicMarker:'SEMANTIC_BODY_MUST_NOT_ESCAPE'}));});}};
  const handle=createRequestHandler({config,service,pairingVerifier:{verify:()=>paired},accountWrites:true,
   accounts:{me(){if(!session)throw new AccountError('authentication-required');return {id:'invented-account'};}}});
  const pending=handle({method:'POST',url:'/v1/semantic/'+route,body:JSON.stringify(input),headers:{host:config.hostHeader,origin:config.origin,
   authorization:'Bearer '+config.capability,'content-type':'application/json','x-account-session':'invented-session'}},
   {signal:abort.signal,isCurrent:()=>active});
  assert.equal(calls,1);
  if(invalidation==='pairing')paired=false;if(invalidation==='session')session=false;if(invalidation==='transport')active=false;if(invalidation==='abort')abort.abort();
  release();const response=await pending;
  assert.equal(response.status,{none:200,pairing:401,session:401,transport:503,abort:503}[invalidation]);
  assert.equal(response.body.includes('SEMANTIC_BODY_MUST_NOT_ESCAPE'),invalidation==='none');
 });
