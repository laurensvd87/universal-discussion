import test from 'node:test';
import assert from 'node:assert/strict';
import {readCanonicalHistoryRequest,readCanonicalHistoryPage,readCanonicalHistoryListing} from '../browser/core/canonical-history-contract.js';
import {createLocalServiceClient} from '../browser/core/local-service-client.js';

const version={generation:'history-generation',revision:4};
const post=(id='root-a',rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',authorId:'demo-alex',actorType:'human',body:'Public\ntext',createdAt:'2026-10-27T12:00:00.000Z',edited:false});
const page=()=>({version,discussionVersion:2,topic:{id:'topic-a',title:'Original manual topic',kind:'general'},discussionId:'discussion-a',items:[post(),post('reply-a','off-page-root')],nextCursor:'page_two'});
const listing=()=>({version,query:'',results:[{topicId:'topic-a',discussionId:'discussion-a',title:'Manual topic',kind:'general',snippet:'Public text',visibleCount:2,updatedAt:null,sources:[]}],nextCursor:null});
test('partial canonical pages accept off-page parents and exact minimal tombstones without inventing a graph',()=>{
 const value=page();value.items.push({id:'deleted',rootId:'off-page-root',replyToId:'off-page-parent',state:'deleted',label:'Deleted by user'});
 value.items[1].replyToId='off-page-parent';const out=readCanonicalHistoryPage(value,{topicId:'topic-a',discussionId:'discussion-a'});
 assert.equal(out.items[1].rootId,'off-page-root');assert.equal(out.items[1].replyToId,'off-page-parent');assert.ok(Object.isFrozen(out.items));
 assert.deepEqual(Object.keys(out.items[2]),['id','rootId','replyToId','state','label']);
 for(const leak of ['authorId','actorType','body','createdAt','origin','insight']){
  const invalid=structuredClone(value);invalid.items[2][leak]='private';assert.throws(()=>readCanonicalHistoryPage(invalid));
 }
});
test('request and response caps, canonical destination and actor identities reject malformed pages',()=>{
 assert.deepEqual(readCanonicalHistoryRequest({topicId:'topic-a',limit:20,cursor:null}),{topicId:'topic-a',limit:20,cursor:null});
 for(const change of [{limit:21},{limit:0},{cursor:'x'.repeat(2049)},{cursor:'bad cursor'},{sourceId:'page-b'}])assert.throws(()=>readCanonicalHistoryRequest({topicId:'topic-a',limit:20,cursor:null,...change}));
 for(const mutate of [p=>p.items=Array.from({length:21},(_,i)=>post('root-'+i)),p=>p.items.push(post()),p=>p.items[0].body='x'.repeat(8001),p=>p.items[0].actorType='private',p=>p.items[0].authorId='foreign',p=>p.items[0].replyToId='target',p=>p.discussionVersion=true,p=>p.nextCursor='',p=>p.items[0].state='hidden']){
  const p=page();mutate(p);assert.throws(()=>readCanonicalHistoryPage(p));
 }
 assert.throws(()=>readCanonicalHistoryPage(page(),{topicId:'other'}));assert.throws(()=>readCanonicalHistoryPage(page(),{topicId:'topic-a',discussionId:'other'}));
 let hooks=0;const p=page();Object.defineProperty(p.items[0],'body',{enumerable:true,get(){hooks++;return 'private';}});assert.throws(()=>readCanonicalHistoryPage(p));assert.equal(hooks,0);
});
test('AI identity is explicit, related-page metadata is validated and omitted, and listing is genuinely empty-query bounded',()=>{
 const p=page();p.items=[{...post(),actorType:'agent',authorId:'demo-imported-ai',insight:{kind:'generated',operatorId:'demo-alex'},origin:{sourceId:'source-a',url:'https://example.com/public',title:'Public page'}}];
 const out=readCanonicalHistoryPage(p);assert.equal(out.items[0].actorType,'agent');assert.equal(Object.hasOwn(out.items[0],'origin'),false);
 p.items[0].insight.operatorId='private-user';assert.throws(()=>readCanonicalHistoryPage(p));
 assert.deepEqual(readCanonicalHistoryListing(listing()).results,[{topicId:'topic-a',discussionId:'discussion-a',title:'Manual topic',visibleCount:2}]);
 const many=listing();many.results=Array.from({length:21},(_,i)=>({...many.results[0],topicId:'topic-'+i}));assert.throws(()=>readCanonicalHistoryListing(many));
 assert.throws(()=>readCanonicalHistoryListing({...listing(),query:'related'}));
});
test('real client requests only bounded public pages without account credentials, Source or full-topic routes',async()=>{
 const calls=[];let credentialReads=0;
 const client=createLocalServiceClient({getToken:async()=>'synthetic-history-pairing-token-for-tests-only',getAccountToken:async()=>{credentialReads++;throw Error('No account');},fetchImpl:async(url,options)=>{
  calls.push({url,options});const bytes=new TextEncoder().encode(JSON.stringify(url.endsWith('/discussions/page')?page():listing()));let read=false;
  return {url,status:200,headers:{get:key=>key==='content-type'?'application/json':null},body:{getReader:()=>({read:async()=>read?{done:true}:(read=true,{done:false,value:bytes}),releaseLock(){},cancel:async()=>{}})}};
 }});
 await client.discover({query:'',limit:20,cursor:null},{beforeDispatch:()=>true});await client.canonicalDiscussionPage({topicId:'topic-a',limit:20,cursor:null});
 assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/v1/discover/search','/v1/discussions/page']);assert.equal(credentialReads,0);
 for(const call of calls){assert.equal(Object.hasOwn(call.options.headers,'X-Account-Session'),false);assert.equal(Object.hasOwn(call.options.headers,'X-Demo-Actor'),false);assert.equal(Object.hasOwn(JSON.parse(call.options.body),'sourceId'),false);}
 await assert.rejects(client.canonicalDiscussionPage({topicId:'topic-a',limit:21,cursor:null}),{code:'invalid-request'});assert.equal(calls.length,2);
 await assert.rejects(client.discover({query:'',limit:20,cursor:null},{beforeDispatch:()=>false}),{code:'conflict'});assert.equal(calls.length,2);
});
test('late asynchronous token completion cannot dispatch a revoked canonical read',async()=>{
 let resolveToken;const token=new Promise(r=>{resolveToken=r;});let requests=0,current=true;
 const client=createLocalServiceClient({getToken:()=>token,fetchImpl:async()=>{requests++;throw Error('Unexpected request');}});
 const abort=new AbortController(),pending=client.canonicalDiscussionPage({topicId:'topic-a',limit:20,cursor:null},{signal:abort.signal,beforeDispatch:()=>current});
 const rejected=assert.rejects(pending,{code:'unavailable'});current=false;abort.abort();resolveToken('synthetic-history-pairing-token-for-tests-only');await rejected;assert.equal(requests,0);
});
