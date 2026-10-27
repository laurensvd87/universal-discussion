import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicFetchError} from '../src/crawler/public-fetch.js';
import {runPairedLiveAiReplyForTest as run,PAIRED_REPLY_QUESTION,capturePairedRecipeForTest} from '../harness/run-paired-live-ai-reply.js';

const sha=text=>createHash('sha256').update(text).digest('hex');
const RECIPE_URL='https://www.leukerecepten.nl/recepten/kapsalon-maken/';

function fixture({pending=false,existing=false,unnamed=false,failResult=false,forever=false,revoke=false,failLogout=false,expireCreate=false,failStart=false,rootEditedOnFailure=false,revertedRoot=false,foreignReply=false,deletedReply=false,editedReply=false,expirePublish=false,unknownPublish=false}={}){
 const calls=[];let now=1000,revision=1,root=null,reply=null;
 const source={id:'source-tetris',url:RECIPE_URL,title:'Kapsalon',topicId:'topic-tetris',provenance:'owner-local-page-embedding/v1'};
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
 const ports={readPairing:async()=>({token:'PAIRING-SECRET',origin:'chrome-extension://'+'a'.repeat(32)}),clients:()=>api,capture:async()=>{calls.push(['capture']);const text='Fresh public recipe describes a Kapsalon with fries, meat, salad and cheese. '.repeat(8);return {url:RECIPE_URL,text,characters:text.length,bodySha256:sha(text),rightsEvidenceSha256:'a'.repeat(64),requests:3};},now:()=>now,sleep:async ms=>{calls.push(['sleep',ms]);now+=ms;},id:()=> 'owned-operation'};
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

function publicFixture({robots='',tdm=null,head='',headers={},redirect=false,oversized=false}={}){
 let now=0;const calls=[],buffers=[],waits=[];
 const content=(url,text,kind)=>{const body=Buffer.from(text);buffers.push(body);return {kind:'content',url,finalUrl:url,mimeType:kind==='page'?'text/html':'text/plain',body,text,headers:{xRobotsTag:[],tdmReservation:null,tdmPolicy:null,...headers}};};
 const ports={now:()=>now,deadline:60000,sleep:async ms=>{waits.push(ms);now+=ms;},async fetchPublic(url,options){calls.push({url,...options,time:now});
  if(options.resourceKind==='robots')return content(url,robots,'robots');
  if(options.resourceKind==='tdmrep'){if(tdm===null)throw new PublicFetchError('http-status',{status:404});return content(url,tdm,'tdmrep');}
  if(redirect)return {kind:'redirect',url,redirectUrl:'https://other.example/'};
  const prose='Kapsalon is een gerecht met friet, shoarma, kaas en salade. '.repeat(12);
  return content(url,oversized?'x'.repeat(2*1024*1024+1):`<html><head><title>Kapsalon maken</title>${head}</head><body><main><p>${prose}</p></main></body></html>`,'page');
 }};
 return {ports,calls,buffers,waits};
}
test('fixed public evidence uses actual robots/TDM/static parser with three paced bounded signed-out requests',async()=>{
 const f=publicFixture(),evidence=await capturePairedRecipeForTest(f.ports);assert.equal(f.calls.length,3);assert.equal(evidence.url,RECIPE_URL);assert.equal(evidence.bodySha256,sha(evidence.text));assert.equal(evidence.characters,evidence.text.length);assert.equal(evidence.requests,3);assert.match(evidence.rightsEvidenceSha256,/^[a-f0-9]{64}$/u);assert.ok(evidence.characters>=200&&evidence.characters<=4096);
 assert.deepEqual(f.calls.map(c=>c.resourceKind),['robots','tdmrep','page']);assert.equal(f.calls[2].url,RECIPE_URL);for(let i=1;i<3;i++)assert.ok(f.calls[i].time-f.calls[i-1].time>=5000);assert.ok(f.calls.every(c=>c.timeoutMs<=15000&&!Object.hasOwn(c,'headers')));assert.ok(f.buffers.every(b=>b.every(n=>n===0)));
});
test('robots denial prevents any page request and document/header noai/TDM reservations refuse evidence',async()=>{
 const denied=publicFixture({robots:'User-agent: *\nDisallow: /recepten/'});await assert.rejects(capturePairedRecipeForTest(denied.ports),e=>e.code==='public-policy-denied');assert.equal(denied.calls.some(c=>c.resourceKind==='page'),false);
 for(const config of [{head:'<meta name="robots" content="noai">'},{head:'<meta name="robots" content="notrain">'},{headers:{xRobotsTag:['noindex']}},{headers:{tdmReservation:'1'}},{head:'<meta name="tdm-reservation" content="1">'}]){const f=publicFixture(config);await assert.rejects(capturePairedRecipeForTest(f.ports),e=>e.code==='public-policy-denied');assert.ok(f.buffers.every(b=>b.every(n=>n===0)));}
});
test('redirects, malformed TDM and unchanged parser document cap cannot produce article evidence or alternate fetches',async()=>{
 for(const config of [{redirect:true},{tdm:'not-json'},{oversized:true}]){const f=publicFixture(config);await assert.rejects(capturePairedRecipeForTest(f.ports));assert.ok(f.calls.length<=3);assert.ok(f.calls.every(c=>new URL(c.url).origin==='https://www.leukerecepten.nl'));assert.ok(f.buffers.every(b=>b.every(n=>n===0)));}
});
test('missing saved Source and denied public evidence both stop before fresh account sessions/posts/provider',async()=>{
 const missing=fixture(),base=missing.ports.clients;missing.ports.clients=value=>{const io=base(value);return {...io,local:{...io.local,async urlSelection(){throw Object.assign(new Error('PRIVATE absent'),{code:'not-found'});}}};};
 const a=await run(missing.ports);assert.equal(a.failure.stage,'canonical-source');assert.equal(missing.calls.some(c=>['sign-in','capture','start','command'].includes(c[0])),false);
 const blocked=fixture();blocked.ports.capture=async()=>{throw Object.assign(new Error('PRIVATE rights'),{code:'public-policy-denied'});};const b=await run(blocked.ports);assert.equal(b.failure.stage,'public-static-evidence');assert.equal(b.failure.code,'public-policy-denied');assert.equal(blocked.calls.some(c=>['sign-in','start','command'].includes(c[0])),false);
});
test('recipe capture precedes fresh sign-in and proof exposes hashes/counts without article or original-capture claims',async()=>{
 const f=fixture(),proof=await run(f.ports);assert.equal(proof.status,'passed');assert.ok(f.calls.findIndex(c=>c[0]==='capture')<f.calls.findIndex(c=>c[0]==='sign-in'));assert.equal(proof.scope.evidenceBasis,'fresh-public-static-same-url-context');assert.equal(proof.scope.sourceOriginalObservationMatch,false);assert.equal(proof.scope.nativeDocumentAttestation,false);assert.equal(Object.hasOwn(proof.scope,'retainedPublicTrainingText'),false);assert.deepEqual(Object.keys(proof.evidence),['characters','bodySha256','rightsEvidenceSha256','requests']);assert.equal(JSON.stringify(proof).includes('Fresh public recipe'),false);
});
