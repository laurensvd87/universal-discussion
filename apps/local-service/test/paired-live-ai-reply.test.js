import test from 'node:test';
import assert from 'node:assert/strict';
import {runPairedLiveAiReplyForTest as run,PAIRED_REPLY_QUESTION} from '../harness/run-paired-live-ai-reply.js';

function fixture({pending=false,existing=false,unnamed=false,failResult=false,forever=false,revoke=false,failLogout=false,expireCreate=false,failStart=false,rootEditedOnFailure=false,revertedRoot=false,foreignReply=false,deletedReply=false,editedReply=false,expirePublish=false,unknownPublish=false}={}){
 const calls=[];let now=1000,revision=1,root=null,reply=null;
 const source={id:'source-tetris',url:'https://en.wikipedia.org/wiki/Tetris',title:'Tetris',topicId:'topic-tetris',provenance:'owner-local-page-embedding/v1'};
 const account={id:'real-account',username:unnamed?null:'NamedOwner',state:'active',replyEmail:false};
 function selection(){const replies=reply?[reply]:[];if(root&&foreignReply)replies.push({id:'foreign-human-reply',rootId:root.id,replyToId:root.id,body:'Human reply',state:'visible',actorType:'human',edited:false});if(root&&deletedReply)replies.push({id:'foreign-deleted-reply',rootId:root.id,replyToId:root.id,state:'deleted',label:'Deleted by user'});return {catalog:{version:{generation:'live-generation',revision},topics:[{id:'topic-tetris',title:'Tetris',kind:'learned'}],sources:[source],actors:[]},discussion:{version:{generation:'live-generation',revision},topicId:'topic-tetris',discussionId:'discussion-tetris',roots:root?[{...root,replies}]:[]}};}
 const ai={async status(){calls.push(['status']);return {connected:true,planEnabled:true,pending};},async resumable(actor){calls.push(['resumable',actor]);return existing?{operationId:'OTHER-JOB'}:null;},async models(){calls.push(['models']);return [{slug:'gpt-6-luna',displayName:'Luna'}];},
  async start(value,actor){calls.push(['start',value,actor]);assert.equal(value.followupQuestionId,'owned-root');assert.equal(value.allowWebResearch,false);assert.equal(value.includeRelatedSources,false);assert.equal(value.context.currentSource.id,source.id);assert.equal(value.context.coverage.discussionIncluded,false);assert.ok(value.articleText.length<=4096);if(failStart)throw Object.assign(new Error('PRIVATE existing active operation'),{code:'conflict'});return {operationId:value.operationId,state:'running'};},
  async result(id,actor){calls.push(['result',id,actor]);if(revoke)throw Object.assign(new Error('PRIVATE sessionToken'),{code:'authentication-required'});if(failResult){if(rootEditedOnFailure)root.body='A human changed this post';return {operationId:id,state:'failed',error:'provider-unavailable',detail:'response-no-final'};}if(forever)return {operationId:id,state:'running'};return {operationId:id,state:'completed',result:{body:'Tetris ist ein Spiel, bei dem Blöcke Reihen bilden.',model:'gpt-6-luna',citations:[]}};},
  async cancel(id,actor){calls.push(['cancel',id,actor]);assert.equal(id,'owned-operation');return true;}};
 const local={async urlSelection(input){calls.push(['urlSelection',input]);assert.equal(input.url,source.url);return selection();},async selection(input){calls.push(['selection',input]);assert.deepEqual(input,{sourceId:source.id,topicId:source.topicId});return selection();},
  async command(expected,command,actor){calls.push(['command',command,actor]);assert.equal(actor,'account-real-account');assert.equal(expected.generation,'live-generation');revision++;
   if(command.type==='create-root'){assert.equal(root,null);assert.equal(command.body,PAIRED_REPLY_QUESTION);assert.equal(command.originSourceId,source.id);root={id:'owned-root',rootId:null,replyToId:null,body:command.body,authorId:actor,actorType:'human',state:'visible',edited:revertedRoot,replies:[]};if(expireCreate)now+=180001;return {version:{generation:'live-generation',revision},result:{contributionId:root.id}};}
   if(command.type==='share-insight-reply'){assert.equal(command.rootId,'owned-root');assert.equal(command.replyToId,'owned-root');assert.equal(command.operationId,'owned-operation');assert.equal(command.originSourceId,source.id);assert.equal(command.discussionId,'discussion-tetris');reply={id:'owned-reply',rootId:root.id,replyToId:root.id,body:command.body,actorType:'agent',state:'visible',edited:editedReply,origin:{sourceId:source.id}};if(expirePublish)now+=180001;if(unknownPublish)throw Object.assign(new Error('PRIVATE unknown committed publication'),{code:'unavailable'});return {version:{generation:'live-generation',revision},result:{contributionId:reply.id}};}
   assert.equal(command.type,'withdraw');assert.equal(command.contributionId,'owned-root');root={...root,state:'deleted'};return {version:{generation:'live-generation',revision},result:{contributionId:root.id}};
  }};
 const api={ai,local,account:{async signInChatGPT(){calls.push(['sign-in']);return {account,session:{accessToken:'OWN-SESSION-SECRET',refreshToken:'OWN-REFRESH-SECRET'}};},async me(token){calls.push(['me']);assert.equal(token,'OWN-SESSION-SECRET');return account;},async logout(token){calls.push(['logout']);assert.equal(token,'OWN-SESSION-SECRET');if(failLogout)throw false;return {loggedOut:true};}},bind(actor,token){assert.equal(actor,'account-real-account');assert.equal(token,'OWN-SESSION-SECRET');},clear(){calls.push(['clear']);}};
 const ports={readPairing:async()=>({token:'PAIRING-SECRET',origin:'chrome-extension://'+'a'.repeat(32)}),clients:()=>api,training:async()=>[{id:'real-train-01',url:source.url,text:'Retained public Tetris TRAIN text. '.repeat(20)}],now:()=>now,sleep:async ms=>{calls.push(['sleep',ms]);now+=ms;},id:()=> 'owned-operation'};
 return {ports,calls};
}
test('one real-contract orchestration uses one provider start and publishes exact owned reply then withdraws/logs out',async()=>{
 const f=fixture(),proof=await run(f.ports);assert.equal(proof.status,'passed');assert.deepEqual(proof.counts,{providerStarts:1,resultReads:1,rootsCreated:1,repliesStored:1});assert.equal(proof.model,'gpt-6-luna');assert.equal(proof.cleanup.rootWithdrawn,true);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(proof.cleanup.cancelAttempted,false);assert.equal(proof.language.germanMarkers,true);assert.equal(proof.testComposition,true);
 const commands=f.calls.filter(c=>c[0]==='command').map(c=>c[1].type);assert.deepEqual(commands,['create-root','share-insight-reply','withdraw']);assert.equal(f.calls.filter(c=>c[0]==='start').length,1);assert.ok(f.calls.findIndex(c=>c[0]==='logout')>f.calls.findIndex(c=>c[0]==='command'&&c[1].type==='withdraw'));
 const text=JSON.stringify(proof);for(const secret of ['OWN-SESSION','OWN-REFRESH','PAIRING-SECRET','real-account',PAIRED_REPLY_QUESTION,'Tetris ist'])assert.equal(text.includes(secret),false);assert.ok(Object.isFrozen(proof.cleanup));
});
test('pending connection is busy before sign-in or posts; existing own job is not interrupted',async()=>{
 for(const options of [{pending:true},{existing:true}]){const f=fixture(options),proof=await run(f.ports);assert.equal(proof.status,'failed');assert.equal(proof.failure.code,'busy');assert.equal(f.calls.some(c=>c[0]==='command'||c[0]==='start'||c[0]==='cancel'),false);assert.equal(f.calls.some(c=>c[0]==='sign-in'),!options.pending);if(options.existing)assert.equal(proof.cleanup.sessionLoggedOut,true);}
});
test('unnamed account is never renamed and only its fresh session is logged out',async()=>{
 const f=fixture({unnamed:true}),proof=await run(f.ports);assert.equal(proof.failure.code,'account-not-named');assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(f.calls.some(c=>c[0]==='command'||c[0]==='start'),false);
});
test('provider failure preserves allowlisted diagnostics and cleans up only own job/root/session without retry',async()=>{
 const f=fixture({failResult:true}),proof=await run(f.ports);assert.equal(proof.status,'failed');assert.deepEqual(proof.failure,{stage:'provider-result',code:'provider-unavailable',detail:'response-no-final'});assert.equal(proof.cleanup.jobCancelled,true);assert.equal(proof.cleanup.rootWithdrawn,true);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(proof.counts.providerStarts,1);assert.equal(f.calls.some(c=>c[0]==='command'&&c[1].type==='share-insight-reply'),false);
});
test('polling stops at sixty reads/120seconds, never retries generation and cancels only own operation',async()=>{
 const f=fixture({forever:true}),proof=await run(f.ports);assert.equal(proof.failure.code,'timeout');assert.equal(proof.counts.resultReads,60);assert.equal(proof.counts.providerStarts,1);assert.equal(proof.cleanup.jobCancelled,true);assert.equal(proof.cleanup.rootWithdrawn,true);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.ok(proof.elapsedMs<=120000);
});
test('account revocation is finite/redacted and does not publish or repeat provider start',async()=>{
 const f=fixture({revoke:true}),proof=await run(f.ports);assert.equal(proof.failure.code,'authentication-required');assert.equal(proof.counts.providerStarts,1);assert.equal(proof.counts.repliesStored,0);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(JSON.stringify(proof).includes('PRIVATE'),false);
});
test('successful mutating response after deadline retains own root ID for cleanup',async()=>{
 const f=fixture({expireCreate:true}),proof=await run(f.ports);assert.equal(proof.failure.code,'timeout');assert.equal(proof.counts.rootsCreated,1);assert.equal(proof.cleanup.rootWithdrawn,true);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(proof.counts.providerStarts,0);
});
test('cleanup failure fails acceptance but preserves an earlier primary failure',async()=>{
 const a=await run(fixture({failLogout:true}).ports);assert.equal(a.status,'failed');assert.equal(a.failure.stage,'session-cleanup');const b=await run(fixture({failResult:true,failLogout:true}).ports);assert.equal(b.failure.stage,'provider-result');assert.equal(b.cleanup.sessionLoggedOut,false);
});
test('concurrent active job refusal is finite busy, never retries or cancels any foreign operation',async()=>{
 const f=fixture({failStart:true}),proof=await run(f.ports);assert.equal(proof.failure.code,'busy');assert.equal(proof.counts.providerStarts,1);assert.equal(proof.counts.resultReads,0);assert.equal(proof.cleanup.rootWithdrawn,true);assert.deepEqual(f.calls.filter(c=>c[0]==='cancel').map(c=>c[1]),['owned-operation']);
});
test('a human-edited QA root is preserved when cleanup cannot verify its original exact body',async()=>{
 const f=fixture({failResult:true,rootEditedOnFailure:true}),proof=await run(f.ports);assert.equal(proof.failure.stage,'provider-result');assert.equal(proof.cleanup.rootWithdrawn,false);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(f.calls.some(c=>c[0]==='command'&&c[1].type==='withdraw'),false);
});
test('edited then reverted root and foreign/deleted/edited replies retain the entire QA thread',async()=>{
 for(const options of [{revertedRoot:true},{foreignReply:true},{deletedReply:true},{editedReply:true}]){const f=fixture(options),proof=await run(f.ports);assert.equal(proof.status,'failed');assert.equal(proof.failure.code,'cleanup-failed');assert.equal(proof.cleanup.rootWithdrawn,false);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(f.calls.some(c=>c[0]==='command'&&c[1].type==='withdraw'),false);}
});
test('late successful publication retains its exact reply ownership before deadline validation',async()=>{
 const f=fixture({expirePublish:true}),proof=await run(f.ports);assert.equal(proof.status,'failed');assert.equal(proof.failure.code,'timeout');assert.equal(proof.cleanup.rootWithdrawn,true);assert.equal(proof.cleanup.cancelAttempted,false);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(f.calls.filter(c=>c[0]==='command'&&c[1].type==='share-insight-reply').length,1);
});
test('unknown publication outcome retains root and any replies without publication retry',async()=>{
 const f=fixture({unknownPublish:true}),proof=await run(f.ports);assert.equal(proof.status,'failed');assert.equal(proof.cleanup.rootWithdrawn,false);assert.equal(proof.cleanup.sessionLoggedOut,true);assert.equal(f.calls.filter(c=>c[0]==='command'&&c[1].type==='share-insight-reply').length,1);assert.equal(f.calls.some(c=>c[0]==='command'&&c[1].type==='withdraw'),false);
});
