import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresCanonicalService} from '../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../src/http/request-handler.js';

const version={generation:'http-preparation-generation',revision:1},sourceId='saved-http-source';
function fixture({status='pending',hint=()=>new Promise(()=>{})}={}){
 const calls=[],context={version,policyRevision:1,sourceId,sourceVersion:'0',status,supportedPath:[],selectedPath:[],topic:null};
 const reads={version:async()=>version,semanticStamp:async()=>({generation:version.generation,revision:'a'.repeat(64)})};
 for(const key of ['catalogContext','catalogPage','discussionPage','exactSource','urlSelection','semanticFeed','semanticThread','semanticTarget','semanticTopics'])reads[key]=async()=>{throw Error('Unexpected read');};
 reads.semanticContext=async()=>context;
 const service=createPostgresCanonicalService({reads,runtime:{command:async()=>{throw Error('No command');}},semanticDiscussions:true,
  requestSemanticPreparation:value=>{calls.push(value);return hint(value);}});
 const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'x'.repeat(43)},handler=createRequestHandler({service,config});
 const request={method:'POST',url:'/v1/semantic/context',headers:{host:config.hostHeader,origin:config.origin,authorization:'Bearer '+config.capability,'content-type':'application/json'},body:JSON.stringify({sourceId})};
 return {calls,service,handler,request,context};
}

test('real HTTP coherent-read route suggests urgency after its original read, without waiting for the hint',async()=>{
 const f=fixture(),response=await f.handler(f.request);assert.equal(response.status,200);assert.equal(JSON.parse(response.body).status,'pending');
 assert.deepEqual(f.calls,[{generation:version.generation,sourceId}]);
});

test('direct and HTTP reads each suggest once; rejected hints cannot turn a valid pending response into an error',async()=>{
 const f=fixture({hint:()=>Promise.reject(Error('Private optional SQL failure'))});
 assert.equal((await f.service.semanticContext({sourceId})).status,'pending');assert.equal(f.calls.length,1);
 assert.equal((await f.handler(f.request)).status,200);assert.equal(f.calls.length,2);
});

test('classified and unauthorized HTTP reads never request preparation',async()=>{
 const f=fixture({status:'classified'});assert.equal((await f.handler(f.request)).status,200);assert.deepEqual(f.calls,[]);
 const pending=fixture(),request={...pending.request,headers:{...pending.request.headers,authorization:'Bearer '+'z'.repeat(43)}};
 assert.equal((await pending.handler(request)).status,401);assert.deepEqual(pending.calls,[]);
});
