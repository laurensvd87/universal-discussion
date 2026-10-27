import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalServiceClient} from '../browser/core/local-service-client.js';
import {readSemanticFeed,readSemanticThread,readSemanticTarget,readSemanticFeedRequest} from '../browser/core/local-service-contract.js';

const version={generation:'semantic-generation',revision:9},actors=[{id:'demo-alex',displayName:'Alex',type:'human'}];
const nodeId='games',topic={id:'canonical-topic-a',title:'Original topic A',kind:'general'},discussionId='canonical-discussion-a';
const pageRequest={nodeId,limit:2,cursor:null},threadRequest={...pageRequest,rootId:'root-a'};
const post=(id,rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',authorId:'demo-alex',actorType:'human',body:'Body '+id,
 createdAt:'2026-10-27T12:00:00.000Z',edited:false});
const feed=()=>({version:{...version},policyRevision:2,nodeId,roots:[{topic:{...topic},discussionId,root:post('root-a')}],nextCursor:'opaque_Cursor-123',actors:structuredClone(actors)});
const thread=()=>({version:{...version},policyRevision:2,nodeId,topic:{...topic},discussionId,
 root:{...post('root-a'),replies:[{...post('reply-a','root-a'),replyToId:'off-page-parent'}]},nextCursor:null,actors:structuredClone(actors)});
function target(root=false){const value=thread();delete value.nextCursor;return {...value,targetId:root?'root-a':'reply-a',rootRevision:3,targetRevision:root?3:2,
 root:{...value.root,replies:root?[]:value.root.replies}};}
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const client=fetchImpl=>createLocalServiceClient({getToken:()=> 'synthetic-semantic-client-pairing-token',fetchImpl});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('semantic public POST methods preserve per-card canonical destinations and exact opaque cursors',async()=>{
 const calls=[];let accountCalls=0;
 const c=createLocalServiceClient({getToken:()=> 'synthetic-semantic-client-pairing-token',getAccountToken:()=>{accountCalls++;throw Error('No account lookup');},
  fetchImpl:async(url,options)=>{calls.push({url,options});return json(url.endsWith('/feed')?feed():url.endsWith('/thread')?thread():target());}});
 const f=await c.semanticFeed(pageRequest),t=await c.semanticThread(threadRequest),r=await c.semanticTarget({nodeId,rootId:'root-a',targetId:'reply-a'});
 assert.equal(f.roots[0].topic.id,topic.id);assert.equal(f.roots[0].discussionId,discussionId);assert.equal(f.nextCursor,'opaque_Cursor-123');
 assert.equal(Object.hasOwn(f.roots[0].root,'replies'),false);assert.equal(t.root.replies[0].replyToId,'off-page-parent');
 assert.equal(r.root.id,'root-a');assert.equal(r.rootRevision,3);assert.equal(r.targetRevision,2);assert.ok(Object.isFrozen(t.root.replies));
 assert.equal(accountCalls,0);assert.deepEqual(calls.map(x=>x.url),['feed','thread','target'].map(n=>'http://127.0.0.1:4174/v1/semantic/'+n));
 assert.deepEqual(JSON.parse(calls[0].options.body),pageRequest);assert.deepEqual(JSON.parse(calls[2].options.body),{nodeId,rootId:'root-a',targetId:'reply-a'});
 for(const {options} of calls){assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.headers['X-Account-Session'],undefined);assert.equal(options.headers['X-Demo-Actor'],undefined);}
});

test('partial thread pages preserve root membership without requiring an off-page parent body',()=>{
 const value=thread(),result=readSemanticThread(value,threadRequest);assert.equal(result.root.replies[0].rootId,'root-a');assert.equal(result.root.replies[0].replyToId,'off-page-parent');
 for(const change of [v=>{v.root.replies[0].rootId='other-root';},v=>{v.root.id='other-root';},v=>{v.root.replies[0].id='root-a';},
  v=>{v.root.replies[0].replyToId='reply-a';},v=>{v.root.replies.push({...v.root.replies[0]});},v=>{v.root.rootId='other-root';}]){
  const bad=thread();change(bad);assert.throws(()=>readSemanticThread(bad,threadRequest),TypeError);
 }
 assert.equal(value.root.replies[0].body,'Body reply-a');
});

test('target response binds one exact visible target and positive canonical body revisions',()=>{
 const request={nodeId,rootId:'root-a',targetId:'reply-a'};
 assert.equal(readSemanticTarget(target(),request).targetId,'reply-a');
 assert.equal(readSemanticTarget(target(true),{...request,targetId:'root-a'}).root.replies.length,0);
 for(const change of [v=>{v.targetId='another-reply';},v=>{v.root.replies=[];},v=>{v.root.replies.push(post('reply-b','root-a'));},
  v=>{v.root.replies[0]={id:'reply-a',rootId:'root-a',replyToId:'root-a',state:'deleted',label:'Deleted by user'};},
  v=>{v.rootRevision=0;},v=>{v.targetRevision=Number.MAX_SAFE_INTEGER+1;},v=>{v.targetRevision='2';}]){
  const bad=target();change(bad);assert.throws(()=>readSemanticTarget(bad,request),TypeError);
 }
 const badRoot=target(true);badRoot.targetRevision=4;assert.throws(()=>readSemanticTarget(badRoot,{...request,targetId:'root-a'}),TypeError);
});

test('partial pages retain minimal deleted replies without requiring or exposing author metadata',()=>{
 const value=thread();value.root.replies[0]={id:'reply-a',rootId:'root-a',replyToId:'off-page-parent',state:'deleted',label:'Deleted by user'};
 const parsed=readSemanticThread(value,threadRequest);assert.deepEqual(parsed.root.replies,value.root.replies);
 assert.deepEqual(parsed.actors,actors);
 for(const key of ['authorId','actorType','createdAt','body']){
  const bad=structuredClone(value);bad.root.replies[0][key]='deleted-private-metadata';
  assert.throws(()=>readSemanticThread(bad,threadRequest),TypeError);
 }
});

test('feed cards reject duplicate roots, contradictory canonical destinations and malformed actors',()=>{
 for(const change of [v=>{v.roots.push(structuredClone(v.roots[0]));},v=>{v.roots[0].root.replies=[];},v=>{v.roots[0].discussionId='bad.id';},
  v=>{v.roots.push({topic:{...topic,id:'topic-b'},discussionId,root:post('root-b')});},
  v=>{v.roots.push({topic:{...topic},discussionId:'discussion-b',root:post('root-b')});},
  v=>{v.actors=[];},v=>{v.actors.push({...v.actors[0]});},v=>{v.actors[0].type='agent';},v=>{v.actors[0].displayName='unsafe\u0000';},
  v=>{v.actors.push({id:'demo-blair',displayName:'Unreferenced',type:'human'});},v=>{v.actors[0].admin=true;},v=>{v.nodeId='wrong-node';}]){
  const bad=feed();change(bad);assert.throws(()=>readSemanticFeed(bad,pageRequest),TypeError);
 }
 const ai=feed();ai.roots[0].root={...post('ai-root'),authorId:'demo-imported-ai',actorType:'agent',insight:{kind:'generated',operatorId:'demo-alex'}};
 assert.equal(readSemanticFeed(ai,pageRequest).actors[0].id,'demo-alex');
});

test('requests and responses bound item counts, finite values and opaque cursor syntax without decoding cursors',()=>{
 for(const cursor of ['',42,'has space','x'.repeat(2049),{cursor:'x'}])assert.throws(()=>readSemanticFeedRequest({...pageRequest,cursor}),TypeError);
 assert.equal(readSemanticFeedRequest({...pageRequest,cursor:'not_decoded_-123'}).cursor,'not_decoded_-123');
 for(const change of [v=>{v.limit=0;},v=>{v.limit=51;},v=>{v.extra=true;},v=>{v.nodeId='x'.repeat(161);}]){const v={...pageRequest};change(v);assert.throws(()=>readSemanticFeedRequest(v),TypeError);}
 for(const change of [v=>{v.policyRevision=NaN;},v=>{v.nextCursor='bad cursor';},v=>{v.roots=Array.from({length:51},(_,i)=>({topic,discussionId,root:post('root-'+i)}));},
  v=>{v.actors=Array.from({length:105},()=>actors[0]);}]){const v=feed();change(v);assert.throws(()=>readSemanticFeed(v),TypeError);}
 const v=thread();v.root.replies=Array.from({length:51},(_,i)=>post('reply-'+i,'root-a'));assert.throws(()=>readSemanticThread(v),TypeError);
});

test('descriptor validation refuses getters, sparse arrays and nonplain records without invoking accessors',()=>{
 let hooks=0;const v=feed();Object.defineProperty(v.roots[0].root,'body',{enumerable:true,get(){hooks++;return 'unsafe';}});
 assert.throws(()=>readSemanticFeed(v),TypeError);assert.equal(hooks,0);
 const a=feed();Object.defineProperty(a.actors[0],'displayName',{enumerable:true,get(){hooks++;return 'unsafe';}});
 assert.throws(()=>readSemanticFeed(a),TypeError);assert.equal(hooks,0);
 const sparse=feed();sparse.roots=new Array(1);assert.throws(()=>readSemanticFeed(sparse),TypeError);
 assert.throws(()=>readSemanticFeed(Object.assign(Object.create({}),feed())),TypeError);
 const throwingProxy=new Proxy(feed(),{getPrototypeOf(){throw new TypeError('Refused proxy');}});assert.throws(()=>readSemanticFeed(throwingProxy),TypeError);
});

test('transport refuses malformed requests before fetch and mismatched responses as invalid-response',async()=>{
 let calls=0;const c=client(async()=>{calls++;const value=target();value.root.id='other-root';return json(value);});
 assert.throws(()=>c.semanticFeed({...pageRequest,limit:51}),{code:'invalid-request'});assert.equal(calls,0);
 await assert.rejects(c.semanticTarget({nodeId,rootId:'root-a',targetId:'reply-a'}),{code:'invalid-response'});assert.equal(calls,1);
});

test('current dispatch guard and caller cancellation fence public semantic transport without retry',async()=>{
 let calls=0;const c=client(async()=>{calls++;return json(feed());});
 await assert.rejects(c.semanticFeed(pageRequest,{beforeDispatch:()=>false}),{code:'conflict'});assert.equal(calls,0);
 const token=deferred(),abort=new AbortController();
 const waiting=createLocalServiceClient({getToken:()=>token.promise,fetchImpl:async()=>{calls++;return json(feed());}});
 const work=waiting.semanticFeed(pageRequest,{signal:abort.signal});abort.abort();token.resolve('synthetic-semantic-client-pairing-token');
 await assert.rejects(work,{code:'unavailable'});assert.equal(calls,0);
 const response=deferred(),entered=deferred(),lateAbort=new AbortController();
 const late=client(async()=>{calls++;entered.resolve();return response.promise;});
 const pending=late.semanticThread(threadRequest,{signal:lateAbort.signal});await entered.promise;lateAbort.abort();response.resolve(json(thread()));
 await assert.rejects(pending,{code:'unavailable'});assert.equal(calls,1);
});
