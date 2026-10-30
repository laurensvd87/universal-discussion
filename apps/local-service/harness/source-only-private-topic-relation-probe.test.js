import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {runSourceOnlyPrivateTopicRelationProbeForTest as run,SYNTHETIC_RELATION_QUESTION as question} from './run-source-only-private-topic-relation-probe.js';
import {SYNTHETIC_RELATION_EXPECTED as expected} from '../experiments/automatic-topic-discovery-v4/semantic-relation.js';
const sha=s=>createHash('sha256').update(s).digest('hex'),url='https://www.leukerecepten.nl/recepten/kapsalon-maken/';
function fixture({answer=JSON.stringify(expected),foreign=false,providerFailure=false,lateSignIn=false,lateCreate=false}={}){
 let generated=false,now=0;const calls=[];
 const source={id:'source',topicId:'topic',url,title:'Kapsalon',provenance:'owner-local-page-embedding/v1'},catalog={version:{generation:'generation',revision:1},sources:[source],
  topics:[{id:'topic',title:'Kapsalon',kind:'general'}]},discussion={topicId:'topic',discussionId:'discussion',roots:[]},selection={catalog,discussion,related:null};
 const io={account:{signInChatGPT:async()=>{if(lateSignIn)now=120001;return {account:{id:'owner',state:'active',username:'Owner'},session:{accessToken:'session'}};},
  me:async()=>({id:'owner',state:'active'}),logout:async()=>{calls.push('logout');}},ai:{status:async()=>({connected:true,planEnabled:true,pending:false}),resumable:async()=>null,models:async()=>[{slug:'gpt-6-luna',displayName:'GPT-6 Luna'}]},
  local:{urlSelection:async()=>selection,selection:async()=>selection,privateConversation:async(action,input)=>{
   calls.push(action);
   if(action==='create'){if(lateCreate)now=120001;return {conversationId:'private',messageId:'human',revision:1,replayed:false};}
   if(action==='generate'){assert.equal(input.generation.includeRelatedSources,false);generated=true;return {generation:{state:'running'}};}
   if(action==='delete')return {deleted:true};
   if(action==='read'){
    const human={id:'human',actorType:'human',replyToId:null,body:question,generation:{state:generated?(providerFailure?'failed':'completed'):'none',...(generated?providerFailure?{error:'provider-unavailable'}:{answerId:'answer'}:{})}};
    const messages=[human];if(generated&&!providerFailure)messages.push({id:'answer',actorType:'agent',replyToId:'human',body:answer,insight:{operatorId:'account-owner',model:'gpt-6-luna'},citations:[]});
    if(generated&&foreign)messages.push({id:'foreign',actorType:'human',replyToId:'human',body:'Keep this human message'});
    return {conversation:{id:'private',visibility:'private',sourceId:'source',sourceUrl:url},messages,next:null};
   }throw Error('Unexpected action');}},bind(){},clear(){calls.push('clear');}};
 const text='Fresh public recipe evidence. '.repeat(12);
 return {calls,ports:{readPairing:async()=>({}),clients:()=>io,now:()=>now,sleep:async ms=>{now+=ms;},id:()=> 'new-operation',
  capture:async()=>({url,text,bodySha256:sha(text),rightsEvidenceSha256:'a'.repeat(64)})}};
}
test('one synthetic private request uses normal context and removes only its new conversation/session',async()=>{
 const f=fixture(),r=await run(f.ports);assert.equal(r.status,'passed');assert.equal(r.counts.correct,8);assert.equal(r.counts.providerStarts,1);
 assert.equal(r.counts.publicPosts,0);assert.equal(r.cleanup.conversationRemoved,true);assert.equal(r.cleanup.sessionLoggedOut,true);assert.equal(r.scope.fakePorts,true);
 assert.equal(f.calls.filter(c=>c==='generate').length,1);assert.equal(f.calls.filter(c=>c==='delete').length,1);
});
test('invalid model JSON cannot produce semantic authority, but own untouched test data can be removed',async()=>{
 const f=fixture({answer:'A plausible explanation rather than JSON'}),r=await run(f.ports);assert.equal(r.status,'failed');assert.equal(r.relations,null);assert.equal(r.cleanup.conversationRemoved,true);
});
test('an additional human message prevents deletion of the test conversation',async()=>{
 const f=fixture({foreign:true}),r=await run(f.ports);assert.equal(r.status,'failed');assert.equal(r.cleanup.conversationRemoved,false);
 assert.equal(r.cleanup.foreignOrAdditionalMessagesPreventedRemoval,true);assert.equal(f.calls.includes('delete'),false);assert.equal(r.cleanup.sessionLoggedOut,true);
});
test('provider failure is retained without a retry, while the sole own human test is removed',async()=>{
 const f=fixture({providerFailure:true}),r=await run(f.ports);assert.equal(r.status,'failed');assert.equal(r.failure.code,'provider-unavailable');assert.equal(r.counts.providerStarts,1);
 assert.equal(r.cleanup.conversationRemoved,true);assert.equal(r.cleanup.sessionLoggedOut,true);
});
test('late successful sign-in is logged out even after the outer deadline expires',async()=>{
 const f=fixture({lateSignIn:true}),r=await run(f.ports);assert.equal(r.status,'failed');assert.equal(r.failure.code,'timeout');
 assert.equal(r.cleanup.sessionLoggedOut,true);assert.equal(f.calls.includes('create'),false);
});
test('late successful creation retains only its own IDs for verified removal after the deadline',async()=>{
 const f=fixture({lateCreate:true}),r=await run(f.ports);assert.equal(r.status,'failed');assert.equal(r.failure.code,'timeout');
 assert.equal(r.cleanup.conversationRemoved,true);assert.equal(r.cleanup.sessionLoggedOut,true);assert.equal(r.counts.providerStarts,0);
});
