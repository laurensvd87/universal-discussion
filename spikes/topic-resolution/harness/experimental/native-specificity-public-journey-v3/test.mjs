import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';
import {createPublicJourney,FACTS,LIMITS,IGNORED_LIFECYCLE,REPLAY_CATEGORIES,CODES,packJourneyFailureReport,unpackJourneyFailureReport} from './journey.mjs';
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


test('ADR212 actual own preallocation and late materialization enforce32768/32769 without guard calls',async()=>{
 for(const late of [false,true])for(const over of [0,1]){let allocations=0,reportFreezes=0,guards=0;const api=await instrumentedJourney({allocate(){allocations++;},freeze(v){if(v?.schema==='public-article-journey-report/v1')reportFreezes++;return Object.freeze(v);},rewrite:s=>s.replace('let n=2048+128+','let n=globalThis.inventedCharge+2048+128+')}),j=api.createPublicJourney({incarnation:{},frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,clock:()=>0,guard(){guards++;},onFailure(){}}),base=j.retainedBytes();
  // This extra term is invented geometry, not a reachable input/native claim.
  if(!late)api.setInventedCharge(32768-base-7168+over);
  const error=caught(()=>j.begin({}));const before=guards;
  if(late)api.setInventedCharge(32768-base-7168+over);
  if(over){assert.equal(caught(()=>j.failureReport()),error);assert.equal(caught(()=>j.failureReport()),error);assert.equal(reportFreezes,late?1:0);assert.equal(allocations,late?1:0);}
  else{const view=j.failureReport();assert.equal(view.code,'wrong-incarnation');assert.equal(j.failureReport(),view);assert.equal(j.retainedBytes(),32768-7168+4096);}
  assert.equal(guards,before);
 }
});
test('ADR212 synchronous notification reader survives observer throw and original continuation completion cannot change first packet',async()=>{
 let f,view;f=fixture({onFailure(error){view=f.j.failureReport();assert.equal(view.code,error.code);throw false;}});const err=caught(()=>f.j.begin({}));assert.equal(f.j.failureReport(),view);assert.equal(caught(()=>f.j.begin(f.token)),err);
 const g=fixture();g.j.begin(g.token);let yes;const native=new Promise(resolve=>{yes=resolve;}),observer=g.j.observeContinuation(g.token,g.continuation('requestContinuation'),native);const e=caught(()=>g.j.reply({},{}));const first=g.j.failureReport(),text=JSON.stringify(first);yes();await assert.rejects(observer,error=>error===e);assert.equal(g.j.failureReport(),first);assert.equal(JSON.stringify(first),text);assert.equal(first.seen.requestContinuation,false);
});


test('ADR212 indexed accounting matches authenticated original arithmetic across every actual private row and state',async()=>{
 // Exact retainedBytes body derived only after authenticating immutable v2
 // journey FILE79b8406261fb6938cd0d4d59f2fd04a81fa4b39b1a796ca9967f4716f49673d4.
 const reference="function retainedBytes(){\n  // Logical retained record payload, not V8/native/Promise allocation. ASCII\n  // identity slots/scalars charged conservatively; no nested caller DTO kept.\n  let n=2048+frameId.length+blankLoaderId.length+2*url.length+(lifecycleCandidate?.length??0);\n  for(const bucket of [facts,observed])for(const [key,row]of Object.entries(bucket)){n+=64+key.length;if(row)for(const [k,v]of Object.entries(row))n+=32+k.length+(typeof v==='string'?v.length:8);}\n  for(const bucket of [arrivals,ignored,replay])for(const k of Object.keys(bucket))n+=32+k.length+8;\n  if(firstReport)n+=8192;return n;\n }";
 assert.equal(sha(reference),'40f71fa724646f464dbafda8e2878f5db70a9afa259d496bba7a5b2cb8041081');
 const original=Function('state','with(state){return ('+reference+')();}');
 const source=await readFile(new globalThis.URL('./journey.mjs',import.meta.url),'utf8'),begin=source.indexOf('function retainedBytes(){'),accessor=source.slice(begin,source.indexOf('\n function compatible(){',begin));
 for(const forbidden of ['Object.entries','Object.keys','Reflect.','Object.get','for(const','for (const','.map(','.reduce(','.forEach(','.includes(','=>','new ','for-in'])assert.equal(accessor.includes(forbidden),false,forbidden);
 assert.ok(!/for\s*\([^)]*\b(?:in|of)\b/u.test(accessor));assert.ok(!/\[[^\]]*['"]/u.test(accessor));
 const roster=new Set();for(const match of source.matchAll(/add\((?:'[^']+'|d.kind),\{([^}]+)\}/g))for(const field of match[1].matchAll(/(?:^|,)([A-Za-z]+):/g))roster.add(field[1]);
 const observed=source.match(/observed\[d.kind\]=Object.freeze\(\{([^}]+)\}/)[1];for(const field of observed.matchAll(/(?:^|,)([A-Za-z]+):/g))roster.add(field[1]);
 assert.deepEqual([...roster].sort(),['fetchId','frame','loader','networkId','requestId','responseId','settled'].sort());
 const api=await instrumentedJourney({rewrite:s=>s.replace('return Object.freeze({\n  begin(token)',"return Object.freeze({\n  accountingFixture:()=>({frameId,blankLoaderId,url,lifecycleCandidate,facts,observed,arrivals,ignored,replay,firstReport:null,reportState,reportNotifying,hook:reportPreflight!==null}),\n  begin(token)")});
 const seenFields=new Set();let checks=0;
 function compare(j){const state=j.accountingFixture();for(const bucket of [state.facts,state.observed])for(const row of Object.values(bucket))if(row)for(const k of Object.keys(row))seenFields.add(k);
  const report=state.reportState==='unavailable'?8192:state.reportNotifying||state.reportState==='building'||state.reportState==='materializing'?7168:state.reportState==='materialized'?4096:state.reportState==='compact'?208:0;
  assert.equal(j.retainedBytes(),original(state)+128+(state.hook?128:0)+report);checks++;
 }
 for(let mask=0;mask<128;mask++){
  const token={},j=api.createPublicJourney({incarnation:token,frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,clock:()=>0,guard(){},onFailure(){},...(mask%2?{reportPreflight(){}}:{})}),data=api.toRealm;compare(j);
  j.lifecycle(token,data({frameId:'frame',loaderId:'blank',name:'init',timestamp:1}));compare(j);j.begin(token);j.lifecycle(token,data({frameId:'frame',loaderId:'loader',name:'load',timestamp:1}));compare(j);
  for(let i=0;i<7;i++)if(mask&(1<<i)){
   const k=FACTS[i];
   if(k==='reply')j.reply(token,data({frameId:'frame',loaderId:'loader'}));
   if(k==='commit')j.commit(token,data({frame:{id:'frame',loaderId:'loader',url:URL}}));
   if(k==='response')j.response(token,data({schema:'native-main-response-journey/v1',finalUrlHash:sha(URL),status:201,frameId:'frame',loaderId:'loader',fetchRequestId:'fetch-request',fetchResponseId:'fetch-response',networkRequestId:'network',requestUrlExact:true,ordinaryTlsSecure:true,selectedPublicPinMatched:true,pinHash:H,headerPolicyHash:H,navigationLoaderVerified:false,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false}));
   if(k==='dcl')j.lifecycle(token,data({frameId:'frame',loaderId:'loader',name:'DOMContentLoaded',timestamp:1}));
   if(k==='requestContinuation'||k==='responseContinuation'){let yes;const native=new Promise(resolve=>{yes=resolve;}),result=j.observeContinuation(token,data({kind:k,fetchId:k==='requestContinuation'?'fetch-request':'fetch-response',networkId:'network'}),native);compare(j);yes();await result;}
   if(k==='finished')j.finished(token,data({requestId:'network',timestamp:1,encodedDataLength:0}));
   compare(j);
  }
  const first=caught(()=>j.reply({},data({frameId:'frame',loaderId:'loader'})));compare(j);j.retire(token);compare(j);assert.equal(caught(()=>j.lifecycle(token,data({frameId:'frame',loaderId:'blank',name:'load',timestamp:1}))),first);compare(j);const view=j.failureReport();compare(j);for(let i=0;i<3;i++){assert.equal(j.failureReport(),view);compare(j);}
 }
 const bad=api.createPublicJourney({incarnation:{},frameId:'f'.repeat(160),blankLoaderId:'b'.repeat(160),url:URL+'?q='+'x'.repeat(1800),until:20000,clock:()=>0,guard(){},reportPreflight(){throw false;},onFailure(){}});compare(bad);caught(()=>bad.begin({}));compare(bad);caught(()=>bad.failureReport());compare(bad);
 assert.deepEqual([...seenFields].sort(),[...roster].sort());assert.ok(checks>1500);
});
test('ADR212 nested notification stays7168; unavailable8192 outranks notifying and cannot regain compact credit',()=>{
 let f,base,inside=0;f=fixture({reportPreflight(){assert.equal(f.j.retainedBytes()-base,7168);},onFailure(error){inside++;const view=f.j.failureReport();assert.equal(view.code,error.code);for(let i=0;i<3;i++)assert.equal(f.j.retainedBytes()-base,7168);}});base=f.j.retainedBytes();caught(()=>f.j.begin({}));assert.equal(inside,1);assert.equal(f.j.retainedBytes()-base,4096);
 for(const thrown of FALSY){let j,baseline;j=fixture({reportPreflight(){throw thrown;},onFailure(error){assert.equal(j.j.retainedBytes()-baseline,8192);assert.equal(caught(()=>j.j.failureReport()),error);assert.equal(j.j.retainedBytes()-baseline,8192);}});baseline=j.j.retainedBytes();const original=caught(()=>j.j.begin({}));assert.equal(caught(()=>j.j.failureReport()),original);assert.equal(j.j.retainedBytes()-baseline,8192);}
});

const FALSY=[undefined,null,false,0,-0,NaN,''];
function caught(action){let present=false,value;try{action();}catch(error){present=true;value=error;}assert.equal(present,true);return value;}
function reportShape({phase='dispatched',code=CODES[0],n=0,mask=0,mixed=0,present=false}={}){
 const tri=i=>[null,false,true][Math.floor(mixed/3**i)%3];
 return {schema:'public-article-journey-report/v1',phase,code,events:n?4097:0,
 seen:Object.fromEntries(FACTS.map((k,i)=>[k,Boolean(mask&(1<<i))])),arrivals:Object.fromEntries(FACTS.map(k=>[k,n?4096:0])),
 ignored:Object.fromEntries(IGNORED_LIFECYCLE.map(k=>[k,n?4096:0])),initialReplay:Object.fromEntries(REPLAY_CATEGORIES.map(k=>[k,n?4096:0])),
 blankLoaderMatch:tri(0),frameAgreement:tri(1),loaderAgreement:tri(2),freshLoaders:tri(3),quarantinedLifecyclePresent:present,quarantinedLifecycleAgreement:tri(4)};
}
test('ADR212 all40 cells preserve exact report JSON/hash, phases, codes, mixed nulls, masks and4097',()=>{
 let max=0;
 const round=report=>{const packet=packJourneyFailureReport(report);assert.equal(packet.length,40);assert.equal(packet.byteLength,80);const view=unpackJourneyFailureReport(packet),json=JSON.stringify(report);assert.equal(JSON.stringify(view),json);assert.equal(sha(JSON.stringify(view)),sha(json));for(const v of [view,view.seen,view.arrivals,view.ignored,view.initialReplay])assert.ok(Object.isFrozen(v));max=Math.max(max,Buffer.byteLength(json));};
 for(const phase of ['prepared','dispatched','resolved','retired'])for(const c of CODES)for(const n of [0,1])round(reportShape({phase,code:c,n,mixed:n?121:0,present:Boolean(n)}));
 for(let mixed=0;mixed<243;mixed++)for(const present of [false,true])round(reportShape({mixed,present,n:1}));
 for(let mask=0;mask<128;mask++)round(reportShape({mask,n:1}));
 const maxReport=reportShape({phase:'dispatched',code:'request-contradiction',n:1,mixed:121});assert.equal(Buffer.byteLength(JSON.stringify(maxReport)),1094);
 assert.equal(5*128+51*32+2*(627+63),3652);assert.equal(3652+208+3072+24,6956);assert.equal(3652+320,3972);assert.ok(max<=1094);
});
test('ADR212 codec rejects coercion, unsafe descriptors and nominal packet forgeries with zero hooks',()=>{
 let hooks=0;const getter=reportShape();Object.defineProperty(getter,'phase',{enumerable:true,get(){hooks++;throw 0;}});
 const proxy=new Proxy(reportShape(),{getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;},get(){hooks++;throw 0;}});
 for(const v of [getter,proxy,{...reportShape(),extra:1},{...reportShape(),events:-0},{...reportShape(),events:4098},{...reportShape(),events:1.5},{...reportShape(),code:null},{...reportShape(),quarantinedLifecyclePresent:null},Object.fromEntries(Object.entries(reportShape()).reverse())])code(()=>packJourneyFailureReport(v),'descriptor');
 for(const k of ['arrivals','ignored','initialReplay']){const v=reportShape();v[k][Object.keys(v[k])[0]]=65536;code(()=>packJourneyFailureReport(v),'descriptor');}
 const good=packJourneyFailureReport(reportShape()),offset=new Uint16Array(new ArrayBuffer(82),2,40),shared=new Uint16Array(new SharedArrayBuffer(80)),resize=new Uint16Array(new ArrayBuffer(80,{maxByteLength:160})),extra=good.slice();extra.extra=1;
 assert.equal(offset.byteOffset,2);assert.equal(offset.length,40);class Subclass extends Uint16Array{}const subclass=new Subclass(40),nominal=Object.create(Uint16Array.prototype);
 const bufferGetter=good.slice();Object.defineProperty(bufferGetter.buffer,'resizable',{get(){hooks++;throw 0;}});
 for(const p of [{},nominal,subclass,new Proxy(good,{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;}}),offset,shared,resize,extra,bufferGetter])code(()=>unpackJourneyFailureReport(p),'descriptor');
 for(const [index,value]of [[0,0],[1,0],[2,4098],[3,128],[4,4097],[34,3],[38,0]]){const p=good.slice();p[index]=value;code(()=>unpackJourneyFailureReport(p),'descriptor');}
 assert.equal(hooks,0);
});
test('ADR212 optional hook and fixed charges preserve original options and refuse unsafe fields',()=>{
 const absent=fixture(),nil=fixture({reportPreflight:null}),hook=fixture({reportPreflight(){}});assert.equal(nil.j.retainedBytes(),absent.j.retainedBytes());assert.equal(hook.j.retainedBytes()-absent.j.retainedBytes(),128);
 let hooks=0;for(const reportPreflight of [undefined,false,{},new Proxy(()=>{},{apply(){hooks++;throw 0;}})])code(()=>fixture({reportPreflight}),'descriptor');
 const options={incarnation:{},frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,guard(){},clock:()=>0,onFailure(){}};Object.defineProperty(options,'reportPreflight',{enumerable:true,get(){hooks++;throw 0;}});code(()=>createPublicJourney(options),'descriptor');code(()=>fixture({unknown:1}),'descriptor');assert.equal(hooks,0);
});
test('ADR212 compact208, notification7168 and one memoized late view preserve first snapshot and reader purity',()=>{
 const f=fixture(),base=f.j.retainedBytes();assert.equal(f.j.failureReport('ignored'),null);const original=caught(()=>f.j.begin({}));assert.equal(f.j.retainedBytes()-base,208);
 f.j.retire(f.token);caught(()=>f.j.lifecycle(f.token,f.life()));f.state.now=Infinity;
 const view=f.j.failureReport('ignored');assert.equal(view.phase,'prepared');assert.equal(view.code,'wrong-incarnation');assert.equal(view.blankLoaderMatch,null);assert.equal(f.j.failureReport(),view);assert.equal(f.j.retainedBytes()-base,4096);
 let during,observed,instance;const g=fixture({reportPreflight(){during=instance.retainedBytes();},onFailure(error){observed=instance.failureReport();assert.equal(observed.code,error.code);assert.equal(instance.failureReport(),observed);}});instance=g.j;const initial=instance.retainedBytes();caught(()=>instance.begin({}));assert.equal(during-initial,7168);assert.equal(instance.retainedBytes()-initial,4096);assert.equal(instance.failureReport(),observed);
});
test('ADR212 hook failures and every nonundefined return are unavailable forever, same original and no hooks',()=>{
 for(const mode of ['throw','return'])for(const value of [...FALSY,Error('private'),{},new Proxy({},{get(){throw Error('hook');}})]){if(mode==='return'&&value===undefined)continue;let notifications=0,inside;
  const f=fixture({reportPreflight(){if(mode==='throw')throw value;return value;},onFailure(error){notifications++;inside=error;}}),base=f.j.retainedBytes(),error=caught(()=>f.j.begin({}));
  assert.equal(error,inside);assert.equal(notifications,1);assert.equal(f.j.retainedBytes()-base,8192);for(let i=0;i<3;i++)assert.equal(caught(()=>f.j.failureReport()),error);
 }
 let hooks=0;const thenable={get then(){hooks++;throw 0;}},native=Promise.resolve();for(const v of [thenable,native]){const f=fixture({reportPreflight:()=>v});const e=caught(()=>f.j.begin({}));assert.equal(caught(()=>f.j.failureReport()),e);}assert.equal(hooks,0);
});
test('ADR212 preflight reentry preserves saved phase/blank/code and never restores unavailable',()=>{
 let f,original;f=fixture({reportPreflight(){original=caught(()=>f.j.lifecycle(f.token,f.life()));f.j.retire(f.token);Object.defineProperty(original,'code',{get(){throw Error('must not inspect');}});}});
 f.j.lifecycle(f.token,f.life('init','blank'));const e=caught(()=>f.j.begin({}));assert.equal(e,original);const r=f.j.failureReport();assert.equal(r.phase,'prepared');assert.equal(r.code,'wrong-incarnation');assert.equal(r.blankLoaderMatch,true);
 let g,reader;g=fixture({reportPreflight(){reader=caught(()=>g.j.failureReport());}});const err=caught(()=>g.j.begin({}));assert.equal(reader,err);assert.equal(caught(()=>g.j.failureReport()),err);
 let h;h=fixture({onFailure(error){assert.equal(caught(()=>h.j.failureReport()),error);throw false;},reportPreflight(){throw null;}});const bad=caught(()=>h.j.begin({}));assert.equal(caught(()=>h.j.failureReport()),bad);
});
async function instrumentedJourney({freeze=Object.freeze,allocate=()=>{},rewrite=s=>s}={}){
 let source=await readFile(new globalThis.URL('./journey.mjs',import.meta.url),'utf8');source=rewrite(source).replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 function View(n){allocate();return new Uint16Array(n);}View.prototype=Uint16Array.prototype;
 // Keep this realm's ordinary-object prototype for internally generated reports;
 // only copy the injected options envelope into that realm, never alter values.
 return runInNewContext('globalThis.inventedCharge=0;const NativeObject=Object;Object=NativeObject.create(NativeObject);Object.freeze=freezeInjection;'+source+';({createPublicJourney:options=>createPublicJourney(NativeObject.assign({},options)),toRealm:value=>JSON.parse(JSON.stringify(value)),setInventedCharge:n=>{globalThis.inventedCharge=n;},packJourneyFailureReport,unpackJourneyFailureReport})',{types,createHash,inspectPageUrl,Promise,freezeInjection:freeze,Uint16Array:View,ArrayBuffer,URL:globalThis.URL,performance,Error,Number,Reflect,String,Boolean,Math});
}
test('ADR212 actual allocation sites follow aggregate preflight; failures never retry or replace the first error',async()=>{
 for(const failPreflight of [false,true]){let allocations=0,j,preflight=0;const api=await instrumentedJourney({allocate(){allocations++;assert.equal(preflight,1);}}),token={};j=api.createPublicJourney({incarnation:token,frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,clock:()=>0,guard(){},onFailure(){},reportPreflight(){preflight++;assert.ok(j.retainedBytes()>=7168+256);if(failPreflight)throw false;}});
  const e=caught(()=>j.begin({}));assert.equal(allocations,failPreflight?0:1);if(failPreflight)assert.equal(caught(()=>j.failureReport()),e);else assert.equal(j.failureReport().code,'wrong-incarnation');assert.equal(preflight,1);
 }
 for(const thrown of FALSY){let freezes=0;const api=await instrumentedJourney({freeze(value){if(value?.schema==='public-article-journey-report/v1'){freezes++;throw thrown;}return Object.freeze(value);}}),j=api.createPublicJourney({incarnation:{},frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,clock:()=>0,guard(){},onFailure(){}}),e=caught(()=>j.begin({}));assert.equal(caught(()=>j.failureReport()),e);assert.equal(caught(()=>j.failureReport()),e);assert.equal(freezes,1);}
});
test('ADR212 lazy materialization freeze failure and reentry retain original forever',async()=>{
 for(const reenter of [false,true]){let count=0,j,first;const api=await instrumentedJourney({freeze(value){if(value?.schema==='public-article-journey-report/v1'&&++count===2){if(reenter)assert.equal(caught(()=>j.failureReport()),first);else throw false;}return Object.freeze(value);}});j=api.createPublicJourney({incarnation:{},frameId:'frame',blankLoaderId:'blank',url:URL,until:20000,clock:()=>0,guard(){},onFailure(){}});first=caught(()=>j.begin({}));assert.equal(caught(()=>j.failureReport()),first);assert.equal(caught(()=>j.failureReport()),first);assert.equal(count,2);}
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

