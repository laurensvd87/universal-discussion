import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublicJourney,FACTS,LIMITS,IGNORED_LIFECYCLE} from './journey.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const URL='https://example.org/invented-article',H='a'.repeat(64);
function fixture(overrides={}){
 const token={},state={now:0,failures:[]};
 const j=createPublicJourney({incarnation:token,frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,
  guard:()=>{},clock:()=>state.now,onFailure:e=>state.failures.push(e.code),...overrides});
 const life=(name='DOMContentLoaded',loaderId='loader')=>({frameId:'frame',loaderId,name,timestamp:1});
 const response=()=>({schema:'native-main-response-journey/v1',finalUrlHash:sha(URL),status:201,frameId:'frame',loaderId:'loader',
  fetchRequestId:'fetch-request',fetchResponseId:'fetch-response',networkRequestId:'network',requestUrlExact:true,ordinaryTlsSecure:true,
  selectedPublicPinMatched:true,pinHash:H,headerPolicyHash:H,navigationLoaderVerified:false,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false});
 const continuation=kind=>({kind,fetchId:kind==='requestContinuation'?'fetch-request':'fetch-response',networkId:'network'});
 const actions={reply:()=>j.reply(token,{frameId:'frame',loaderId:'loader'}),commit:()=>j.commit(token,{frame:{id:'frame',url:URL,loaderId:'loader'}}),
  response:()=>j.response(token,response()),dcl:()=>j.lifecycle(token,life()),
  requestContinuation:()=>j.observeContinuation(token,continuation('requestContinuation'),Promise.resolve()),
  responseContinuation:()=>j.observeContinuation(token,continuation('responseContinuation'),Promise.resolve()),
  finished:()=>j.finished(token,{requestId:'network',timestamp:1,encodedDataLength:123})};
 return {j,token,state,life,response,continuation,actions};
}
function* permutations(a){if(!a.length){yield [];return;}for(let i=0;i<a.length;i++)for(const tail of permutations(a.filter((_,j)=>j!==i)))yield [a[i],...tail];}
async function complete(f,omit=null){for(const k of FACTS)if(k!==omit)await f.actions[k]();}
const code=(fn,c)=>assert.throws(fn,e=>e.code===c);

test('all5040 physical fact orders: navigate mandatory, distinct Fetch IDs, no partial publication',async()=>{
 let count=0;for(const order of permutations(FACTS)){
  const f=fixture();f.j.begin(f.token);let ready=false;f.j.wait(f.token).then(()=>{ready=true;});
  for(let i=0;i<order.length;i++){await f.actions[order[i]]();if(i<6)assert.equal(ready,false);}
  assert.equal((await f.j.wait(f.token)).allSevenFacts,true);assert.equal(f.j.assertComplete(f.token),true);
  assert.ok(f.j.retainedBytes()<=LIMITS.retainedBytes);assert.ok(Buffer.byteLength(JSON.stringify(f.j.snapshot()))<=LIMITS.reportBytes);
  assert.equal(f.state.failures.length,0);count++;
 }assert.equal(count,5040);
});

test('all5040 fresh orders with pre-fresh initial idle quarantine preserve all seven facts',async()=>{
 let count=0;for(const order of permutations(FACTS)){
  const f=fixture();f.j.begin(f.token);let fresh=false,quarantined=0;
  for(const k of order){if(!fresh){for(const name of IGNORED_LIFECYCLE){f.j.lifecycle(f.token,f.life(name,'blank'));quarantined++;}assert.equal(f.j.snapshot().quarantinedLifecyclePresent,false);}
   await f.actions[k]();if(['reply','commit','response','dcl'].includes(k))fresh=true;
  }
  assert.equal(f.j.assertComplete(f.token),true);assert.equal((await f.j.wait(f.token)).allSevenFacts,true);const r=f.j.snapshot();assert.equal(Object.values(r.initialReplay).reduce((a,b)=>a+b,0),quarantined);assert.equal(r.events,quarantined+7+2);assert.equal(f.state.failures.length,0);count++;
 }assert.equal(count,5040);
});

test('observed request-continuation-only quarantine has no facts/candidate/order/readiness/lease effect',async()=>{
 const f=fixture();f.j.begin(f.token);await f.actions.requestContinuation();const before=f.j.snapshot();assert.equal(before.seen.requestContinuation,true);
 for(const name of IGNORED_LIFECYCLE)for(let n=0;n<3;n++)f.j.lifecycle(f.token,f.life(name,'blank'));
 const after=f.j.snapshot();assert.deepEqual(after.seen,before.seen);assert.deepEqual(after.arrivals,before.arrivals);assert.equal(after.phase,'dispatched');assert.equal(after.quarantinedLifecyclePresent,false);assert.equal(after.events,before.events+30);for(const name of IGNORED_LIFECYCLE)assert.equal(after.initialReplay[name],3);
 f.state.now=20000;code(()=>f.j.lifecycle(f.token,f.life('networkAlmostIdle','blank')),'deadline');assert.equal(f.j.failureReport().seen.reply,false);
});

test('every fresh loader fact or candidate permanently closes blank quarantine',async()=>{
 for(const kind of ['reply','commit','response','dcl','candidate'])for(const name of IGNORED_LIFECYCLE){const f=fixture();f.j.begin(f.token);f.j.lifecycle(f.token,f.life(name,'blank'));
  if(kind==='candidate')f.j.lifecycle(f.token,f.life('init'));else await f.actions[kind]();code(()=>f.j.lifecycle(f.token,f.life(name,'blank')),'blank-loader');code(()=>f.j.assertComplete(f.token),'blank-loader');}
});

test('quarantine rejects forbidden names, frame/token/shape/state and charges event4097 once',async()=>{
 for(const name of ['commit','DOMContentLoaded','future-name']){const f=fixture();f.j.begin(f.token);code(()=>f.j.lifecycle(f.token,f.life(name,'blank')),'blank-loader');}
 for(const name of IGNORED_LIFECYCLE){const f=fixture();f.j.begin(f.token);f.j.lifecycle(f.token,f.life(name,'fresh'));code(()=>f.j.lifecycle(f.token,f.life(name,'blank')),'blank-loader');}
 for(const kind of ['frame','token','getter','proxy','timestamp','name','resolved','retired','capacity']){const f=fixture();f.j.begin(f.token);let hooks=0,input=f.life('networkIdle','blank'),token=f.token;
  if(kind==='frame')input.frameId='foreign';if(kind==='token')token={};if(kind==='getter')Object.defineProperty(input,'loaderId',{get(){hooks++;throw Error();}});if(kind==='proxy')input=new Proxy(input,{getPrototypeOf(){hooks++;throw Error();}});if(kind==='timestamp')input.timestamp=NaN;if(kind==='name')input.name='bad name';
  if(kind==='resolved')await complete(f);if(kind==='retired'){await complete(f);f.j.retire(f.token);}if(kind==='capacity')for(let i=0;i<4096;i++)f.j.lifecycle(f.token,f.life('init','blank'));
  code(()=>f.j.lifecycle(token,input),kind==='frame'?'lifecycle-frame':kind==='token'?'wrong-incarnation':kind==='retired'?'retired':kind==='capacity'?'event-capacity':kind==='resolved'?'blank-loader':'descriptor');assert.equal(hooks,0);if(kind==='capacity'){assert.equal(f.j.snapshot().events,4097);assert.equal(f.j.snapshot().initialReplay.init,4096);assert.equal(f.j.snapshot().blankLoaderMatch,null);}
 }
});
test('every missing fact remains unready; failed retirement never supplies readiness',async()=>{
 for(const absent of FACTS){const f=fixture();f.j.begin(f.token);const pending=f.j.wait(f.token);await complete(f,absent);code(()=>f.j.assertComplete(f.token),'missing-facts');
  await assert.rejects(pending,{code:'missing-facts'});assert.equal(f.j.retire(f.token).cleanupOnly,true);}
});
test('early completion candidates rejoin actual response IDs, including mismatches',async()=>{
 for(const k of ['requestContinuation','responseContinuation','finished']){
  const f=fixture();f.j.begin(f.token);
  if(k==='finished')f.j.finished(f.token,{requestId:'wrong',timestamp:1,encodedDataLength:0});
  else await f.j.observeContinuation(f.token,{...f.continuation(k),fetchId:'wrong'},Promise.resolve());
  code(()=>f.actions.response(),'request-contradiction');assert.equal(f.j.retire(f.token).cleanupOnly,true);
 }
});
test('original rejection/throw wins; pending caller timeout is not physical settlement',async()=>{
 for(const sync of [false,true]){const f=fixture();f.j.begin(f.token);const error=new Error('private unreported original');
  if(sync)assert.throws(()=>f.j.invokeContinuation(f.token,f.continuation('requestContinuation'),()=>{throw error;}),e=>e===error);
  else await assert.rejects(f.j.observeContinuation(f.token,f.continuation('requestContinuation'),Promise.reject(error)),e=>e===error);
  assert.equal(f.j.failureReport().code,'continuation-rejected');assert.equal(JSON.stringify(f.j.snapshot()).includes('private'),false);assert.equal(f.j.retire(f.token).mayPublish,false);
 }
 const f=fixture();f.j.begin(f.token);let settle;const native=new Promise(resolve=>{settle=resolve;});
 const observed=f.j.observeContinuation(f.token,f.continuation('requestContinuation'),native);
 for(const k of FACTS)if(k!=='requestContinuation')await f.actions[k]();
 assert.equal(await Promise.race([observed.then(()=>true),Promise.resolve(false)]),false);assert.equal(f.j.snapshot().seen.requestContinuation,false);
 settle();await observed;assert.equal(f.j.assertComplete(f.token),true);
});
test('failed original promise already has rejection handler; invalid registration never invokes action',async()=>{
 const f=fixture();f.j.begin(f.token);let calls=0;code(()=>f.j.invokeContinuation({},f.continuation('requestContinuation'),()=>{calls++;return Promise.resolve();}),'wrong-incarnation');assert.equal(calls,0);
 const g=fixture();g.j.begin(g.token);const native=Promise.resolve();Object.defineProperty(native,Symbol('async_hooks'),{value:12});await g.j.observeContinuation(g.token,g.continuation('requestContinuation'),native);
});
test('promise proxies/thenables/subclasses/constructor species and accessors have zero hooks',()=>{
 for(const kind of ['thenable','constructor','then','symbol','proxy','subclass']){
  const f=fixture();f.j.begin(f.token);let hooks=0,p=Promise.resolve();
  if(kind==='thenable')p={then(){hooks++;}};
  if(kind==='constructor')Object.defineProperty(p,'constructor',{get(){hooks++;return {[Symbol.species]:Promise};}});
  if(kind==='then')Object.defineProperty(p,'then',{get(){hooks++;return ()=>{};}});
  if(kind==='symbol')Object.defineProperty(p,Symbol('hostile'),{get(){hooks++;}});
  if(kind==='proxy')p=new Proxy(p,{get(){hooks++;throw Error();}});
  if(kind==='subclass')p=new(class extends Promise{})(resolve=>resolve());
  code(()=>f.j.observeContinuation(f.token,f.continuation('requestContinuation'),p),'descriptor');assert.equal(hooks,0);
 }
 const f=fixture();f.j.begin(f.token);let hooks=0;const hostileKind={[Symbol.toPrimitive](){hooks++;return 'requestContinuation';}};
 code(()=>f.j.observeContinuation(f.token,{...f.continuation('requestContinuation'),kind:hostileKind},Promise.resolve()),'descriptor');assert.equal(hooks,0);
 const g=fixture();g.j.begin(g.token);const native=Promise.resolve();Object.defineProperty(native,'constructor',{value:Object.defineProperty({},Symbol.species,{get(){hooks++;return Promise;}})});
 code(()=>g.j.observeContinuation(g.token,g.continuation('requestContinuation'),native),'descriptor');assert.equal(hooks,0);
});
test('prepared exact blank replay: arbitrary bounded names only there, no facts or authority',()=>{
 const f=fixture();f.j.lifecycle(f.token,f.life('future-name','blank'));assert.equal(f.j.snapshot().initialReplay['other-bounded'],1);assert.ok(Object.values(f.j.snapshot().seen).every(v=>!v));
 f.j.begin(f.token);code(()=>f.j.lifecycle(f.token,f.life('future-name')),'lifecycle-name');
 for(const [loader,frame]of [['other','frame'],['blank','child']]){const g=fixture();code(()=>g.j.lifecycle(g.token,{...g.life('init',loader),frameId:frame}),frame==='child'?'lifecycle-frame':'before-dispatch');}
});
test('early ignored lifecycle candidate never vanishes; all contradictions sticky after ready',async()=>{
 const f=fixture();f.j.begin(f.token);f.j.lifecycle(f.token,f.life('init','wrong'));code(()=>f.actions.reply(),'loader-contradiction');
 const g=fixture();g.j.begin(g.token);g.j.lifecycle(g.token,g.life('init'));await complete(g);g.j.assertComplete(g.token);
 code(()=>g.j.lifecycle(g.token,g.life('load','other')),'loader-contradiction');code(()=>g.j.assertComplete(g.token),'loader-contradiction');assert.deepEqual(g.state.failures,['loader-contradiction']);
});
test('strict navigation/errorText/download/commit/response security refusals',()=>{
 const checks=[['reply-frame',f=>f.j.reply(f.token,{frameId:'other',loaderId:'loader'})],['reply-loader',f=>f.j.reply(f.token,{frameId:'frame'})],
  ...[undefined,'','failure'].map(errorText=>['error-text',f=>f.j.reply(f.token,{frameId:'frame',loaderId:'loader',errorText})]),
  ['download',f=>f.j.reply(f.token,{frameId:'frame',loaderId:'loader',isDownload:true})],
  ['commit-parent',f=>f.j.commit(f.token,{frame:{id:'frame',loaderId:'loader',url:URL,parentId:undefined}})],
  ['commit-url',f=>f.j.commit(f.token,{frame:{id:'frame',loaderId:'loader',url:URL+'/redirect'}})]];
 for(const [c,act]of checks){const f=fixture();f.j.begin(f.token);code(()=>act(f),c);}
 for(const [k,v]of [['ordinaryTlsSecure',false],['selectedPublicPinMatched',false],['requestUrlExact',false],['nativeDocumentIdDirectlyCorrelated',true],['status',302],['finalUrlHash','b'.repeat(64)]]){
  const f=fixture();f.j.begin(f.token);code(()=>f.j.response(f.token,{...f.response(),[k]:v}),'response-evidence');}
});
test('loading failure is finite terminal, not successful availability or ownership retirement',async()=>{
 const f=fixture();f.j.begin(f.token);await f.actions.requestContinuation();code(()=>f.j.loadingFailed(f.token,{requestId:'network'}),'network-failed');assert.equal(f.j.retire(f.token).cleanupOnly,true);
 const g=fixture();g.j.begin(g.token);code(()=>g.j.loadingFailed(g.token,{requestId:'unknown'}),'request-contradiction');
});
test('exact deadline, post-guard deadline and stale blank evidence reset',()=>{
 const f=fixture();f.j.lifecycle(f.token,f.life('init','blank'));f.state.now=20000;code(()=>f.j.lifecycle(f.token,f.life()),'deadline');assert.equal(f.j.snapshot().blankLoaderMatch,null);
 let now=0;const g=fixture({clock:()=>now,guard:()=>{now=20000;}});code(()=>g.j.begin(g.token),'deadline');
 const h=fixture();h.j.lifecycle(h.token,h.life('init','blank'));code(()=>h.j.lifecycle({},h.life()),'wrong-incarnation');assert.equal(h.j.snapshot().blankLoaderMatch,null);
});
test('4096 exact bound, wrong types/arrays/accessors/proxies, finite report and no raw IDs',()=>{
 const f=fixture();for(let i=0;i<4096;i++)f.j.lifecycle(f.token,f.life('init','blank'));code(()=>f.j.lifecycle(f.token,f.life('init','blank')),'event-capacity');assert.equal(f.j.snapshot().events,4097);assert.equal(f.j.snapshot().blankLoaderMatch,null);
 assert.ok(Buffer.byteLength(JSON.stringify(f.j.failureReport()))<=8192);assert.ok(f.j.retainedBytes()<=32768);
 for(const value of [[],new Proxy({},{get(){throw Error('hook');}}),Object.defineProperty({},'frameId',{enumerable:true,get(){throw Error('hook');}})]){
  const g=fixture();g.j.begin(g.token);code(()=>g.j.reply(g.token,value),'descriptor');}
 const text=JSON.stringify(f.j.snapshot());for(const raw of ['https://','fetch-request','network','loader','frame'])assert.equal(text.includes('"'+raw+'"'),false);
});
test('duplicate/retired/late old token fail and assertComplete publication fences both sides await',async()=>{
 const f=fixture();f.j.begin(f.token);await complete(f);f.j.assertComplete(f.token);await Promise.resolve();f.j.assertComplete(f.token);
 code(()=>f.actions.reply(),'duplicate');code(()=>f.j.assertComplete(f.token),'duplicate');
 const g=fixture();g.j.begin(g.token);await complete(g);g.j.retire(g.token);code(()=>g.actions.finished(),'retired');
 const h=fixture();h.j.begin(h.token);await complete(h);code(()=>h.j.assertComplete({}),'wrong-incarnation');
});
test('URL, lease and identifier limits; failure observer cannot replace primary',()=>{
 for(const url of ['http://example.org/x','https://example.org/x#fragment','https://u:p@example.org/x','https://example.org/'+ 'x'.repeat(2048)])assert.throws(()=>fixture({url}));
 assert.throws(()=>fixture({until:20001}),e=>e.code==='deadline');assert.throws(()=>fixture({frameId:'x'.repeat(161)}),e=>e.code==='identity');
 const f=fixture({onFailure:()=>Promise.reject(Error('sink'))});f.j.begin(f.token);code(()=>f.j.reply(f.token,{frameId:'wrong'}),'reply-frame');
 assert.deepEqual(FACTS.length,7);assert.equal(IGNORED_LIFECYCLE.includes('commit'),false);
});
test('every ignored lifecycle is counted without authority, early wrong loader is retained',()=>{
 for(const name of IGNORED_LIFECYCLE){const f=fixture();f.j.begin(f.token);f.j.lifecycle(f.token,f.life(name));assert.equal(f.j.snapshot().ignored[name],1);assert.ok(Object.values(f.j.snapshot().seen).every(v=>!v));}
 const f=fixture();f.j.begin(f.token);f.j.lifecycle(f.token,f.life('init'));code(()=>f.j.lifecycle(f.token,f.life('load','other')),'loader-contradiction');
});
test('all loader fact positions refuse old blank, wrong frame and malformed IDs',()=>{
 for(const kind of ['reply','commit','response','dcl']){
  const f=fixture();f.j.begin(f.token);
  const act=kind==='reply'?()=>f.j.reply(f.token,{frameId:'frame',loaderId:'blank'}):kind==='commit'?()=>f.j.commit(f.token,{frame:{id:'frame',url:URL,loaderId:'blank'}}):kind==='response'?()=>f.j.response(f.token,{...f.response(),loaderId:'blank'}):()=>f.j.lifecycle(f.token,f.life('DOMContentLoaded','blank'));
  code(act,'blank-loader');
 }
 const f=fixture();f.j.begin(f.token);code(()=>f.j.finished(f.token,{requestId:'x'.repeat(161),timestamp:1,encodedDataLength:0}),'identity');
 for(const encodedDataLength of [-0,-1,Infinity,Number.MAX_SAFE_INTEGER+1]){const g=fixture();g.j.begin(g.token);code(()=>g.j.finished(g.token,{requestId:'network',timestamp:1,encodedDataLength}),'descriptor');}
});
test('no external/clock/sink failure can publish, callbacks remain bound after failure retirement',()=>{
 const f=fixture({guard:()=>{throw Error('never retained');}});code(()=>f.j.begin(f.token),'external-failure');assert.equal(f.j.retire(f.token).cleanupOnly,true);code(()=>f.actions.reply(),'external-failure');
 let calls=0;const g=fixture({clock:()=>{if(++calls>1)throw Error('clock');return 0;}});code(()=>g.j.begin(g.token),'external-failure');
 const h=fixture();code(()=>h.actions.finished(),'before-dispatch');assert.equal(h.j.snapshot().seen.finished,false);
});
test('observe/invoke discard fulfilled ACK object without later then assimilation',async()=>{
 for(const invoke of [false,true]){
  const f=fixture();f.j.begin(f.token);let hooks=0,calls=0;const value={},native=Promise.resolve(value);
  // Initial native resolution saw no then property. Only a second resolution
  // caused by forwarding this value could now execute the hostile getter.
  Object.defineProperty(value,'then',{get(){hooks++;throw Error('must never be inspected');}});
  const observed=invoke?f.j.invokeContinuation(f.token,f.continuation('requestContinuation'),()=>{calls++;return native;}):
   f.j.observeContinuation(f.token,f.continuation('requestContinuation'),native);
  assert.equal(await observed,undefined);assert.equal(hooks,0);assert.equal(calls,invoke?1:0);
  assert.equal(f.j.snapshot().seen.requestContinuation,true);assert.equal(f.j.failureReport(),null);
  for(const k of FACTS)if(k!=='requestContinuation')await f.actions[k]();assert.equal(f.j.assertComplete(f.token),true);
 }
});
test('already-started originals are rejection-handled on every refused registration, without facts',async()=>{
 for(const reason of ['wrong-incarnation','descriptor','duplicate','retired','deadline']){
  const f=fixture();f.j.begin(f.token);
  if(reason==='duplicate')await f.actions.requestContinuation();
  if(reason==='retired'){await complete(f);f.j.retire(f.token);}
  if(reason==='deadline')f.state.now=20000;
  const before=f.j.snapshot().seen,native=Promise.reject(new Error('original still owned by physical tracker'));
  code(()=>f.j.observeContinuation(reason==='wrong-incarnation'?{}:f.token,
   reason==='descriptor'?{bad:true}:f.continuation('requestContinuation'),native),reason);
  const events=f.j.snapshot().events;
  // Give the platform its unhandled-rejection turn. Node's test harness fails
  // this test if any supplied original was left without its rejection handler.
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.j.snapshot().seen,before);assert.equal(f.j.snapshot().events,events);assert.equal(f.j.failureReport().code,reason);
 }
});
test('refused pending original cleanup neither publishes a fact nor forwards later hostile value',async()=>{
 const f=fixture();f.j.begin(f.token);let resolve;const native=new Promise(yes=>{resolve=yes;});
 code(()=>f.j.observeContinuation({},f.continuation('requestContinuation'),native),'wrong-incarnation');
 let hooks=0;const value={};resolve(value);Object.defineProperty(value,'then',{get(){hooks++;throw Error('cleanup forwarding');}});
 await new Promise(yes=>setImmediate(yes));assert.equal(hooks,0);assert.equal(f.j.snapshot().seen.requestContinuation,false);
 assert.equal(f.j.failureReport().code,'wrong-incarnation');
});
