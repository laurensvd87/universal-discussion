import test from 'node:test';import assert from 'node:assert/strict';
import {readAuthorContext,readAuthoredTopicScope,readSemanticCapabilities,readCommand} from '../browser/core/local-service-contract.js';
import {createLocalServiceClient} from '../browser/core/local-service-client.js';
import {createRequestHandler} from '../../../apps/local-service/src/http/request-handler.js';
const version={generation:'generation',revision:7},scope={kind:'named',id:'12345678-1234-4123-8123-123456789abc',caption:'Kapsalon',sourceId:'source-a',materialDigest:'a'.repeat(64)},pageScope={...scope,kind:'page',id:scope.sourceId,caption:'The precise recipe'};
const context={version,sourceId:scope.sourceId,context:{topicId:'topic-a',pageScope,scope}};
const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'synthetic-authored-test-capability-long'};
test('strict topic intent has stable semantics without evidence revisions and stays separate from canonical route IDs',()=>{
 const r=readAuthorContext(context,{sourceId:'source-a'});assert(Object.isFrozen(r.context.scope));assert.deepEqual(r.context.scope,scope);
 const command=readCommand({type:'create-root',topicId:'topic-a',originSourceId:'source-a',body:'My comment',authorScope:scope});assert.equal(command.topicId,'topic-a');assert.deepEqual(command.authorScope,scope);
 for(const change of [{revision:'2'},{materialDigest:'bad'},{kind:'page'}])assert.throws(()=>readAuthoredTopicScope({...scope,...change}),TypeError);
 assert.throws(()=>readCommand({...command,originSourceId:'other'}),TypeError);
});
test('author capability is explicit, backwards compatible and cannot be inferred from display capability alone',()=>{
 assert.deepEqual(readSemanticCapabilities({protocol:'semantic-topics/v1'}),{protocol:'semantic-topics/v1'});
 assert.equal(readSemanticCapabilities({protocol:'semantic-topics/v1',authorContext:'authored-topics/v1'}).authorContext,'authored-topics/v1');
 assert.throws(()=>readSemanticCapabilities({protocol:'semantic-topics/v1',authorContext:true}),TypeError);
});
test('real client and HTTP route exchange only an opaque Source request and the bounded editor context under normal pairing guards',async()=>{
 let reads=0;const handle=createRequestHandler({config,service:{coherentSnapshotReads:true,semanticTopics(){assert.fail('No directory scan');},async authorContext(value){reads++;assert.deepEqual(value,{sourceId:'source-a'});return context;}}});
 const client=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async(url,options)=>{
  const response=await handle({method:options.method,url:new URL(url).pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});
  return new Response(response.body,{status:response.status,headers:response.headers});}});
 assert.equal((await client.semanticCapabilities()).authorContext,'authored-topics/v1');assert.deepEqual(await client.authorContext({sourceId:'source-a'}),context);assert.equal(reads,1);
 const rejected=await handle({method:'POST',url:'/v1/semantic/editor',headers:{host:config.hostHeader,origin:config.origin,authorization:'Bearer wrong','content-type':'application/json'},body:'{"sourceId":"source-a"}'});assert.equal(rejected.status,401);assert.equal(reads,1);
});
