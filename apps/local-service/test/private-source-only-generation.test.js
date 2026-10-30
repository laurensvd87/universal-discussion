import test from 'node:test';import assert from 'node:assert/strict';
import {createChatGPTRuntime} from '../src/ai/chatgpt-runtime.js';
import {createPrivateDiscussionService} from '../src/private/private-service.js';
import {demoService,deterministicDependencies} from './helpers.js';
import {ServiceError} from '../src/domain/errors.js';
import {buildInsightContext} from '../../../spikes/topic-resolution/browser/core/insight-context.js';
import {preparePrivateGeneration} from '../../../spikes/topic-resolution/browser/core/private-generation-context.js';
const OWNER={id:'account-11111111-1111-4111-8111-111111111111',accountId:'11111111-1111-4111-8111-111111111111',displayName:'Owner',type:'human',demo:false},
 SOURCE='reserved-example-com',TOPIC='reserved-domain-demo',URL='https://example.com/';
function fixture(t){
 const canonical=demoService(),reads=[],provider=[];
 const service={...canonical,actor(id){if(id!==OWNER.id)throw new ServiceError('forbidden','Unknown actor');return OWNER;},
  insightBundle(input){reads.push(input.includeRelatedSources);
   if(input.includeRelatedSources!==false)throw new ServiceError('capacity','Optional matching capacity exceeded');
   const catalog=canonical.catalog();return {version:catalog.version,catalog,discussion:canonical.discussion(TOPIC),related:null,
    anchor:canonical.insightAnchor(TOPIC,SOURCE),followupDiscussion:null};}};
 const runtime=createChatGPTRuntime({service,connectionAdapter:{status:()=>({connected:true,planEnabled:true}),
  accountIdentity:()=>({issuer:'https://auth.openai.com',clientId:'fixture',subject:'owner'}),dispose(){}},
  insightsAdapter:{async createInsight(value){provider.push(value);return {body:'Source-only response',citations:[],model:'fixture'};},cancel(){},dispose(){}}});
 const privateService=createPrivateDiscussionService({databasePath:':memory:',ai:runtime,publicService:service,canGenerate:()=>true,...deterministicDependencies()});
 t.after(()=>{privateService.close();runtime.dispose();});
 const generation={model:'fixture',articleText:'Attested current public article',allowWebResearch:false,expected:canonical.catalog().version,
  context:buildInsightContext({catalog:canonical.catalog(),discussion:canonical.discussion(TOPIC),related:null,sourceId:SOURCE,topicId:TOPIC,includeDiscussion:false})};
 const create=()=>privateService.create(OWNER,{operationId:'new-private',body:'Private question',sourceId:SOURCE,sourceUrl:URL});
 return {canonical,reads,provider,service:privateService,generation,create};
}
test('legacy unflagged private generation reproduces optional-capacity coupling before provider dispatch',async t=>{
 const f=fixture(t),root=f.create();f.service.generate(OWNER,{conversationId:root.conversationId,messageId:root.messageId,expectedRevision:root.revision,generation:f.generation});
 await f.service.whenIdle();const value=f.service.read(OWNER,{conversationId:root.conversationId,after:null,limit:3});
 assert.deepEqual(f.reads,[true]);assert.equal(f.provider.length,0);assert.deepEqual(value.messages[0].generation,{state:'failed',error:'context-unavailable'});
});
test('explicit source-only private generation reaches the provider without optional matching',async t=>{
 const f=fixture(t),root=f.create();f.service.generate(OWNER,{conversationId:root.conversationId,messageId:root.messageId,expectedRevision:root.revision,
  generation:{...f.generation,includeRelatedSources:false}});
 await f.service.whenIdle();const value=f.service.read(OWNER,{conversationId:root.conversationId,after:null,limit:3});
 assert.deepEqual(f.reads,[false]);assert.equal(f.provider.length,1);assert.equal(value.messages.length,2);assert.equal(value.messages[1].body,'Source-only response');
 assert.deepEqual(f.provider[0].context.relatedSources,[]);assert.equal(f.canonical.discussion(TOPIC).roots.length,0);
});
test('invalid include flag cannot bypass related-context verification or dispatch a private provider request',async t=>{
 const f=fixture(t),root=f.create();f.service.generate(OWNER,{conversationId:root.conversationId,messageId:root.messageId,expectedRevision:root.revision,
  generation:{...f.generation,includeRelatedSources:'false'}});
 await f.service.whenIdle();assert.equal(f.provider.length,0);assert.deepEqual(f.reads,[]);
});
test('private UI preparation can use a ready Source while optional Related metadata is unavailable',async t=>{
 const f=fixture(t),state={phase:'ready',busy:false,needsFreshRead:false,sourceId:SOURCE,topicId:TOPIC,actorId:OWNER.id,selection:'background',
  catalog:f.canonical.catalog(),discussion:f.canonical.discussion(TOPIC),related:null,resolution:{documentId:'doc',url:URL,tabId:1,currentWindowId:2}},
  insight={ai:{connected:true,planEnabled:true,model:'fixture',account:{clientId:'fixture',label:'Owner'}},preferences:{replyLanguage:'en'},relatedPageTextEnabled:false};
 const result=await preparePrivateGeneration({sourceId:SOURCE,readState:()=>state,readInsight:()=>insight,
  readArticle:async()=>({text:'Current article',url:URL,documentId:'doc'}),attestArticle:async()=>true});
 assert.equal(result.includeRelatedSources,false);assert.deepEqual(result.context.relatedSources,[]);assert.equal(result.context.coverage.discussionIncluded,false);
 const root=f.create();f.service.generate(OWNER,{conversationId:root.conversationId,messageId:root.messageId,expectedRevision:root.revision,generation:result});
 await f.service.whenIdle();assert.equal(f.provider.length,1);assert.deepEqual(f.reads,[false]);
});
test('source-only mode still refuses unattested related Sources before provider dispatch',async t=>{
 const f=fixture(t),root=f.create(),context={...f.generation.context,relatedSources:[{id:'unattested',url:'https://elsewhere.example.net/',title:'Unverified'}]};
 f.service.generate(OWNER,{conversationId:root.conversationId,messageId:root.messageId,expectedRevision:root.revision,generation:{...f.generation,context,includeRelatedSources:false}});
 await f.service.whenIdle();assert.deepEqual(f.reads,[false]);assert.equal(f.provider.length,0);
});
test('UI retains Related-enabled behavior when metadata is present rather than fabricating an empty view',async t=>{
 const f=fixture(t),related=f.canonical.related(SOURCE,20),state={phase:'ready',sourceId:SOURCE,topicId:TOPIC,actorId:OWNER.id,
  catalog:f.canonical.catalog(),discussion:f.canonical.discussion(TOPIC),related,resolution:{documentId:'doc',url:URL}},
  insight={ai:{connected:true,planEnabled:true,model:'fixture',account:{clientId:'fixture'}},preferences:{replyLanguage:'en'},relatedPageTextEnabled:true};
 const result=await preparePrivateGeneration({sourceId:SOURCE,readState:()=>state,readInsight:()=>insight,
  readArticle:async()=>({text:'Current article',url:URL,documentId:'doc'}),attestArticle:async()=>true});
 assert.equal(result.includeRelatedSources,true);assert.equal(result.allowWebResearch,true);
});
