import test from 'node:test';import assert from 'node:assert/strict';
import {createPostgresCanonicalService} from '../src/application/create-postgres-canonical-service.js';
const version={generation:'generation',revision:7},scope={kind:'named',id:'12345678-1234-4123-8123-123456789abc',caption:'Steam Deck',sourceId:'source-a',materialDigest:'a'.repeat(64)};
const pageScope={...scope,kind:'page',id:scope.sourceId,caption:'This precise webpage'};
function fixture({enabled=true,legacy=false}={}){
 const calls=[],unused=()=>assert.fail('unrelated read/write');
 const reads={version:async()=>version,catalogContext:unused,catalogPage:unused,discussionPage:unused,exactSource:unused,urlSelection:unused};
 const authoredTopics={async editor(raw){calls.push(['editor',JSON.parse(raw)]);return {generation:version.generation,topicId:'topic-a',scope,pageScope};},
  async appendRoot(raw){calls.push(['root',JSON.parse(raw)]);return {version:{...version,revision:8},result:{contributionId:'human-root'}};},
  async shareInsight(raw){calls.push(['ai',JSON.parse(raw)]);return {version:{...version,revision:8},result:{contributionId:'ai-root'}};},
  async scopeCurrent(raw){calls.push(['scope',JSON.parse(raw)]);return true;}};
 const service=createPostgresCanonicalService({reads,runtime:{async command(value){calls.push(['legacy',value]);return {version,result:{contributionId:'legacy-root'}};}},lifecycle:{async command(...args){calls.push(['legacy-ai',args]);return {version,result:{contributionId:'legacy-ai-root'}};}},...(enabled?{authoredTopics}:{}),allowLegacyAuthorCommands:legacy});
 return {service,calls};
}
const root=()=>({type:'create-root',topicId:'topic-a',body:'A scoped comment',originSourceId:scope.sourceId,authorScope:scope});

test('opt-in author reads expose precise page and preferred scope without model or feed preparation',async()=>{
 const {service,calls}=fixture(),r=await service.authorContext({sourceId:scope.sourceId});
 assert.deepEqual(r,{version,sourceId:scope.sourceId,context:{topicId:'topic-a',pageScope,scope}});assert.equal(calls.length,1);assert.equal(calls[0][0],'editor');
 assert.equal(await service.authorScopeCurrent({generation:version.generation,topicId:'topic-a',scope}),true);
});

test('human root uses the atomic context port and original canonical destination without silently taking legacy path',async()=>{
 const {service,calls}=fixture();const r=await service.command(version,root(),'demo-alex');assert.equal(r.result.contributionId,'human-root');
 const [kind,value]=calls[0];assert.equal(kind,'root');assert.deepEqual(value.scope,scope);assert.equal(value.command.topicId,'topic-a');assert(!Object.hasOwn(value.command,'authorScope'));
 const missing=root();delete missing.authorScope;await assert.rejects(service.command(version,missing,'demo-alex'),{code:'invalid'});assert.equal(calls.length,1);
});

test('only the real completed-proof scope can authorize an AI root in the selected subject',async()=>{
 const {service,calls}=fixture(),command={type:'share-insight',topicId:'topic-a',body:'Exact result',operationId:'job-a',originSourceId:scope.sourceId,authorScope:scope};
 const proof={kind:'generated-insight',operationId:'job-a',actorId:'demo-alex',topicId:'topic-a',originSourceId:scope.sourceId,body:command.body,rootId:null,replyToId:null,discussionId:null,authorScope:scope};
 await assert.rejects(service.command(version,command,'demo-alex',{...proof,authorScope:{...scope,caption:'Other topic'}}),{code:'forbidden'});assert.equal(calls.length,0);
 const result=await service.command(version,command,'demo-alex',proof);assert.equal(result.result.contributionId,'ai-root');
 const [kind,value]=calls[0];assert.equal(kind,'ai');assert.deepEqual(value.scope,scope);assert(!Object.hasOwn(value.proof,'authorScope'));assert(!Object.hasOwn(value.command,'authorScope'));
});

test('existing installations do not advertise or use authored-topic ports until the explicit dependency is installed',async()=>{
 const {service,calls}=fixture({enabled:false});assert.equal(service.authorContext,undefined);assert.equal(service.authorScopeCurrent,undefined);
 const command=root();delete command.authorScope;await service.command(version,command,'demo-alex');assert.equal(calls[0][0],'legacy');
});

test('explicit legacy compatibility preserves the original command and cannot downgrade a present scope',async()=>{
 const {service,calls}=fixture({legacy:true}),command=root();delete command.authorScope;
 const result=await service.command(version,command,'demo-alex');assert.equal(result.result.contributionId,'legacy-root');assert.equal(calls[0][0],'legacy');assert.deepEqual(calls[0][1].command,command);
 for(const authorScope of [null,undefined,{...scope,kind:'unknown'}])await assert.rejects(service.command(version,{...command,authorScope},'demo-alex'),{code:'invalid'});
 assert.equal(calls.length,1);assert.equal(service.legacyAuthorCommandsEnabled,true);
});

test('a scoped generated proof cannot be imported through the legacy unscoped command path',async()=>{
 const {service,calls}=fixture({legacy:true}),command={type:'share-insight',topicId:'topic-a',body:'Exact result',operationId:'job-a',originSourceId:scope.sourceId};
 const proof={kind:'generated-insight',operationId:'job-a',actorId:'demo-alex',topicId:'topic-a',originSourceId:scope.sourceId,body:command.body,rootId:null,replyToId:null,discussionId:null};
 await assert.rejects(service.command(version,command,'demo-alex',{...proof,authorScope:scope}),{code:'forbidden'});assert.equal(calls.length,0);
 await service.command(version,command,'demo-alex',proof);assert.equal(calls[0][0],'legacy-ai');assert.deepEqual(calls[0][1][1],command);assert.deepEqual(calls[0][1][3],proof);
});
