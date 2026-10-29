import test from 'node:test';import assert from 'node:assert/strict';
import {createPostgresCanonicalService} from '../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../src/http/request-handler.js';
import {createLocalServiceClient} from '../../../spikes/topic-resolution/browser/core/local-service-client.js';
const version={generation:'invented-generation',revision:1},query={query:'Koalas',limit:20,cursor:null};
const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-topic-public-http-capability'};
const result=()=>({version,topics:[{nodeId:'subject-12345678-1234-4123-8123-123456789abc',label:'Koalas',path:['subject-12345678-1234-4123-8123-123456789abc'],occupied:true,human:true}],nextCursor:null});
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function fixture({automaticTopics=true,search=async()=>result(),stamp=async()=>({generation:version.generation,revision:'a'.repeat(64)})}={}){
 const never=()=>assert.fail('Unrelated operation'),reads={version:async()=>version,catalogContext:never,catalogPage:never,discussionPage:never,exactSource:never,urlSelection:never,
  semanticFeed:never,semanticThread:never,semanticTarget:never,semanticTopics:never,semanticContext:never,semanticStamp:stamp,semanticSearch:search,automaticTopicsEnabled:true};
 const authoredTopics={editor:never,appendRoot:never,shareInsight:never,scopeCurrent:never};
 const options={reads,runtime:{command:never},semanticDiscussions:true,authoredTopics,automaticTopics};return {options,service:createPostgresCanonicalService(options)};
}
function client(service){const handle=createRequestHandler({config,service});return createLocalServiceClient({getToken:()=>config.capability,
 fetchImpl:async(url,options)=>{const u=new URL(url),r=await handle({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});}});}

test('global named search is an explicit compatible capability and normal public HTTP read without a Source',async()=>{
 let calls=0;const {service}=fixture({search:async a=>{calls++;assert.deepEqual(a,query);return result();}}),api=client(service);
 assert.deepEqual(await api.semanticCapabilities(),{protocol:'semantic-topics/v2',authorContext:'authored-topics/v2',topicSearch:'named-topics/v2'});
 const response=await api.semanticSearch(query);assert.deepEqual(response,result());assert(Object.isFrozen(response.topics[0]));assert.equal(calls,1);
});

test('new client methods cannot enable search or advertise it on the existing17 service',async()=>{
 let calls=0;const {service}=fixture({automaticTopics:false,search:async()=>{calls++;return result();}}),api=client(service);
 assert.equal(service.semanticSearch,undefined);assert(!Object.hasOwn(await api.semanticCapabilities(),'topicSearch'));
 await assert.rejects(api.semanticSearch(query));assert.equal(calls,0);
});

test('partial automatic-topic construction fails before any public search or scope read',()=>{
 const {options}=fixture();for(const change of [{semanticDiscussions:false},{authoredTopics:null},{reads:{...options.reads,automaticTopicsEnabled:false}},
  {reads:{...options.reads,semanticSearch:undefined}},{automaticTopics:'true'}])assert.throws(()=>createPostgresCanonicalService({...options,...change}),TypeError);
});

test('concurrent identical searches share physical work but a later prepared revision cannot join an older absence',async()=>{
 const gate=defer();let calls=0,revision='a'.repeat(64);const {service}=fixture({stamp:async()=>({generation:version.generation,revision}),search:async()=>{calls++;return calls===1?gate.promise:result();}});
 const old=service.semanticSearch(query),same=service.semanticSearch(query);await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(calls,1);
 revision='b'.repeat(64);assert.deepEqual(await service.semanticSearch(query),result());assert.equal(calls,2);
 gate.resolve({version,topics:[],nextCursor:null});assert.equal((await old).topics.length,0);assert.equal((await same).topics.length,0);
});
