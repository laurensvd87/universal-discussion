import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const sha=b=>createHash('sha256').update(b).digest('hex');
const mapBytes=await readFile(new URL('../native-specificity-study-v18/reviewed-sources-r3.json',import.meta.url));
assert.equal(mapBytes.length,19986);
assert.equal(sha(mapBytes),'1f4ff5c2bc5dffbb9feeecfff010873450e9dc5974c65a586e4d09909840b609');
const baseline=JSON.parse(mapBytes.toString('utf8'));
assert.equal(JSON.stringify(baseline),mapBytes.toString('utf8'));
assert.equal(baseline.sourcePathsSha256,'cf4337924770cd5b667464e75f8080f1f1a40c45f15c2850187e94ecd0b40063');
const keys=Object.keys(baseline.sourceHashes);assert.equal(keys.length,128);
async function authenticate(){let total=0;for(const key of keys){assert.match(key,/^[A-Za-z0-9._/-]+$/u);assert.ok(!key.split('/').some(x=>!x||x==='..'||x==='output'||x==='profile'));
 const bytes=await readFile(new URL('../../../../../'+key,import.meta.url));assert.equal(sha(bytes),baseline.sourceHashes[key],key);total+=bytes.length;}
 assert.equal(total,2302583);}
// External FILE authentication precedes decoding/following the map, and ALL128
// source pins precede ANY baseline/helper import. No artifact/model/output read.
await authenticate();
const {createMainNavigationAccounting}=await import('./accounting.mjs');
const {createArticleOwner}=await import('../native-specificity-study-v18/article-owner.mjs');
const {createPublicJourney}=await import('../native-specificity-public-journey-v2/journey.mjs');
const {createJourneyFailureWitness}=await import('../native-specificity-study-v18/browser-capture.mjs');
after(authenticate);

const falsy=[undefined,null,false,0,-0,NaN,''];
const caught=fn=>{try{return {failed:false,value:fn()};}catch(error){return {failed:true,error};}};
function rejected(fn,value){const r=caught(fn);assert.equal(r.failed,true);if(arguments.length===2)assert.ok(Object.is(r.error,value));return r.error;}
function fixture(overrides={}){
 let now=0,guards=0;const calls=[],page={},mainFrame={},session={},token={};
 const owner={commit(p){calls.push(['owner',p]);},pageNavigation(...args){calls.push(['public',...args]);},assertReading(){calls.push(['reading']);}};
 const journey={commit(t,p){calls.push(['journey',t,p]);},assertComplete(t){calls.push(['complete',t]);return true;}};
 const config={page,mainFrame,session,token,frameId:'frame',blankLoaderId:'blank',caseUrl:'https://publisher.org/article',until:20000,
  clock:()=>now,guard(){guards++;},owner,journey,journeyCall:createJourneyFailureWitness('blank').call,...overrides};
 const a=createMainNavigationAccounting(config),projection={frame:{id:config.frameId,url:config.caseUrl,loaderId:'fresh',securityOrigin:'https://publisher.org',extra:{kept:[true,1,null]}}};
 return {a,config,calls,projection,setTime:n=>{now=n;},guardCalls:()=>guards,
  fresh:()=>a.freshCommit(config.session,config.page,config.token,projection),pub:()=>a.pageNavigation(config.page,config.token,config.mainFrame,config.caseUrl),
  same:(type='historyApi')=>a.sameDocument(config.session,config.page,config.token,{frameId:config.frameId,url:config.caseUrl,navigationType:type})};
}
function sequences(p,s,f=1,prefix='',out=[]){if(!p&&!s&&!f){out.push(prefix);return out;}if(p)sequences(p-1,s,f,prefix+'P',out);if(s)sequences(p,s-1,f,prefix+'S',out);if(f)sequences(p,s,0,prefix+'F',out);return out;}

test('exact nine-method API, config/capability shape, detached status and logical reservation',()=>{
 const f=fixture();assert.deepEqual(Object.keys(f.a),['freshCommit','sameDocument','pageNavigation','status','assertBalanced','seal','retire','retainedBytes','release']);
 assert.ok(Object.isFrozen(f.a));assert.deepEqual(f.a.status(),{state:'active',failed:false,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false});
 assert.equal(f.a.retainedBytes(),1024+2*(f.config.caseUrl.length+5+5)+320);assert.equal(f.guardCalls(),0);assert.ok(Object.isFrozen(f.a.status()));
 assert.throws(()=>createMainNavigationAccounting({...f.config,accepted:true}));assert.throws(()=>createMainNavigationAccounting({...f.config,caseUrl:f.config.caseUrl+'#x'}));
 for(const key of ['freshCommit','sameDocument','pageNavigation','status','assertBalanced','seal','retire','retainedBytes','release']){
  const g=fixture();assert.throws(()=>g.a[key](...Array(7).fill(null)),key);}
});

test('all small two-stream interleavings: pending prefixes allowed, same-document before fresh fails',()=>{
 let valid=0,invalid=0;
 for(let n=0;n<=3;n++)for(const order of sequences(n+1,n)){
  const f=fixture();let fresh=false,failed=false;
  for(const event of order){const r=caught(()=>event==='F'?f.fresh():event==='P'?f.pub():f.same());
   if(event==='S'&&!fresh){assert.equal(r.failed,true);failed=true;break;}assert.equal(r.failed,false,order);if(event==='F')fresh=true;}
  if(failed){invalid++;continue;}valid++;f.a.assertBalanced();assert.equal(f.a.status().matched,true);
  assert.equal(f.calls.filter(c=>c[0]==='public').length,1);assert.equal(f.calls.filter(c=>c[0]==='owner').length,1);assert.equal(f.calls.filter(c=>c[0]==='journey').length,1);
 }
 assert.ok(valid>50&&invalid>50);
});

test('multiplicity compensation is observable consistency, never claimed causal identity',()=>{
 const f=fixture();f.pub();f.pub();f.fresh();assert.equal(f.a.status().matched,false);f.same();assert.equal(f.a.status().matched,true);
 // The two public events carry no document-kind marker; this ledger cannot
 // distinguish this trace from a missing public counterpart plus a duplicate.
 assert.deepEqual(Object.keys(f.a.status()),['state','failed','publicCount','freshCount','sameDocumentCount','matched']);
});

test('all three literal same-document types, URL equality and precommit/blank-loader restrictions',()=>{
 for(const type of ['fragment','historyApi','other']){const f=fixture();f.pub();f.fresh();f.same(type);f.pub();f.a.assertBalanced();}
 for(const patch of [{navigationType:'unknown'},{navigationType:undefined},{url:'https://publisher.org/other'},{url:'https://publisher.org/article#x'},{frameId:'child'}]){
  const f=fixture();f.fresh();rejected(()=>f.a.sameDocument(f.config.session,f.config.page,f.config.token,{frameId:'frame',url:f.config.caseUrl,navigationType:'other',...patch}));assert.equal(f.a.status().failed,true);}
 const early=fixture();rejected(early.same);const bad=fixture();bad.projection.frame.loaderId='blank';rejected(bad.fresh);assert.equal(bad.a.status().freshCount,0);
});

test('blank observations delegate without credit; fresh loader consumes only its upfront reservation',()=>{
 const f=fixture(),before=f.a.retainedBytes();f.a.pageNavigation(f.config.page,f.config.token,f.config.mainFrame,'about:blank');
 assert.equal(f.calls.filter(c=>c[0]==='public').length,1);assert.equal(f.a.status().publicCount,0);assert.equal(f.a.status().matched,false);
 f.fresh();assert.equal(f.a.retainedBytes(),before);f.pub();f.a.assertBalanced();
 const long=fixture({frameId:'f'.repeat(160),blankLoaderId:'b'.repeat(160)});long.projection.frame.loaderId='l'.repeat(160);const reserve=long.a.retainedBytes();long.fresh();assert.equal(long.a.retainedBytes(),reserve);
});

test('full projection is private frozen, same object reaches both operators; hostile nested inputs have zero hooks',()=>{
 const f=fixture();f.fresh();const owner=f.calls.find(c=>c[0]==='owner')[1],journey=f.calls.find(c=>c[0]==='journey')[2];
 assert.equal(owner,journey);assert.notEqual(owner,f.projection);assert.deepEqual(owner,f.projection);assert.ok(Object.isFrozen(owner.frame.extra.kept));
 f.projection.frame.extra.kept[0]=false;assert.equal(owner.frame.extra.kept[0],true);
 let hooks=0;const proxy=new Proxy({},{get(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();}});
 for(const value of [proxy,{frame:proxy},{frame:{id:'frame',url:'x',get loaderId(){hooks++;return 'fresh';}}},{frame:{a:[,1]}},{frame:{a:NaN}},{frame:{a:'\ud800'}},{frame:{a:Symbol()}}]){
  const g=fixture();rejected(()=>g.a.freshCommit(g.config.session,g.config.page,g.config.token,value));assert.equal(g.calls.length,0);}
 const g=fixture();rejected(()=>g.a.sameDocument(g.config.session,g.config.page,g.config.token,proxy));assert.equal(hooks,0);
});

test('full-copy limits preserve extra fields and refuse values/units/depth/array/property/string overflow',()=>{
 const cases=[()=>({x:'x'.repeat(32769)}),()=>({x:Array(65).fill(0)}),()=>Object.fromEntries(Array.from({length:25},(_,i)=>['k'+i,0])),()=>{let x={};for(let i=0;i<14;i++)x={x};return x;},()=>({x:Array.from({length:64},()=>Array(64).fill(0))})];
 for(const make of cases){const f=fixture();f.projection.frame.extra=make();rejected(f.fresh);assert.equal(f.calls.length,0);}
});

test('all81 owner/journey outcomes preserve exact first including seven falsy values and original order',()=>{
 const success={},values=[success,...falsy,new Error('invented')];
 for(const o of values)for(const j of values){const order=[],owner={commit(){order.push('owner');if(o!==success)throw o;},pageNavigation(){},assertReading(){}},journey={commit(){order.push('journey');if(j!==success)throw j;},assertComplete(){return true;}};
  const f=fixture({owner,journey});const r=caught(f.fresh);assert.deepEqual(order,['owner','journey']);assert.equal(r.failed,o!==success||j!==success);
  if(r.failed){assert.ok(Object.is(r.error,o!==success?o:j));assert.equal(f.a.status().freshCount,0);rejected(f.pub,r.error);}else assert.equal(f.a.status().freshCount,1);
 }
});

test('wrapper cannot swallow falsy action failure, omit/repeat/late-dispatch action, or retain usable released capability',()=>{
 for(const value of falsy){const journey={commit(){throw value;},assertComplete(){return true;}},f=fixture({journey,journeyCall(site,p,action){try{action();}catch{}}});rejected(f.fresh,value);}
 let late,calls=0;const journey={commit(){calls++;},assertComplete(){return true;}};
 const omit=fixture({journey,journeyCall(site,p,action){late=action;}});rejected(omit.fresh);assert.equal(calls,0);rejected(()=>late());assert.equal(calls,0);
 const repeat=fixture({journey,journeyCall(site,p,action){action();try{action();}catch{}}});rejected(repeat.fresh);assert.equal(calls,1);
 const f=fixture({journey,journeyCall(site,p,action){late=action;action();}});f.fresh();const before=calls;const lateError=rejected(()=>late());assert.equal(calls,before);assert.equal(f.a.status().failed,true);rejected(f.pub,lateError);
 f.a.release();rejected(()=>late());assert.equal(calls,before);
});

test('synchronous return contracts reject objects without then/toJSON/getter inspection',()=>{
 let hooks=0;const result={get then(){hooks++;throw Error();},get toJSON(){hooks++;throw Error();}};
 for(const kind of ['owner','journey','wrapper','public','complete','reading']){
  const f=fixture();if(kind==='owner')f.config.owner.commit=()=>result;if(kind==='journey')f.config.journey.commit=()=>result;
  // Operators are privately captured: construct a new helper with selected bad return.
  const config={...f.config,owner:{...f.config.owner},journey:{...f.config.journey}};
  if(kind==='owner')config.owner.commit=()=>result;if(kind==='journey')config.journey.commit=()=>result;
  if(kind==='wrapper')config.journeyCall=(site,p,action)=>{action();return result;};if(kind==='public')config.owner.pageNavigation=()=>result;
  if(kind==='complete')config.journey.assertComplete=()=>result;if(kind==='reading')config.owner.assertReading=()=>result;
  const a=createMainNavigationAccounting(config),fresh=()=>a.freshCommit(config.session,config.page,config.token,f.projection),pub=()=>a.pageNavigation(config.page,config.token,config.mainFrame,config.caseUrl);
  if(kind==='public')rejected(pub);else if(['complete','reading'].includes(kind)){fresh();pub();rejected(()=>a.assertBalanced());}else rejected(fresh);
 }assert.equal(hooks,0);
});

test('wrong capability bindings and all method arities refuse before operator dispatch',()=>{
 for(const method of ['freshCommit','sameDocument','pageNavigation'])for(let i=0;i<3;i++){
  const f=fixture(),args=method==='freshCommit'?[f.config.session,f.config.page,f.config.token,f.projection]:method==='sameDocument'?[f.config.session,f.config.page,f.config.token,{frameId:'frame',url:f.config.caseUrl,navigationType:'other'}]:[f.config.page,f.config.token,f.config.mainFrame,f.config.caseUrl];
  args[i]={};rejected(()=>f.a[method](...args));assert.equal(f.calls.length,0);
 }
});

test('configuration/capability/operator proxies and accessors invoke zero hooks; caller mutation cannot replace captured methods',()=>{
 let hooks=0;const proxy=new Proxy({},{get(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();}}),f=fixture();
 assert.throws(()=>createMainNavigationAccounting(proxy));for(const k of ['page','mainFrame','session','token','owner','journey','clock','guard','journeyCall'])assert.throws(()=>createMainNavigationAccounting({...f.config,[k]:proxy}));
 const owner={...f.config.owner};Object.defineProperty(owner,'commit',{enumerable:true,get(){hooks++;return ()=>{};}});assert.throws(()=>createMainNavigationAccounting({...f.config,owner}));
 const config={...f.config};Object.defineProperty(config,'until',{enumerable:true,get(){hooks++;return 20000;}});assert.throws(()=>createMainNavigationAccounting(config));assert.equal(hooks,0);
 const g=fixture();g.config.owner.commit=()=>{throw Error('replacement must not run');};g.config.journey.commit=()=>{throw Error('replacement must not run');};g.config.caseUrl='https://changed.org/';g.fresh();assert.equal(g.a.status().freshCount,1);
});

test('first guard/clock/public failures retain every falsy value; accounting readers never reenter operators',()=>{
 for(const value of falsy)for(const source of ['guard','clock','public']){
  const f=fixture(source==='guard'?{guard(){throw value;}}:source==='clock'?{clock(){throw value;}}:{owner:{commit(){},pageNavigation(){throw value;},assertReading(){}}});
  rejected(f.pub,value);const before=f.a.status();assert.equal(before.failed,true);f.a.retainedBytes();rejected(f.fresh,value);f.a.release();assert.equal(f.a.status().failed,false);
 }
 let f,guards=0;f=fixture({guard(){guards++;assert.ok(f.a.retainedBytes()>1024);f.a.status();}});f.pub();assert.ok(guards>=2);
});

test('reentrant work fails sticky; release during operator revokes action and prevents state resurrection',()=>{
 let f;f=fixture({owner:{commit(){f.pub();},pageNavigation(){},assertReading(){}}});rejected(f.fresh);assert.equal(f.a.status().failed,true);
 let g,late,journeyCalls=0;g=fixture({journey:{commit(){journeyCalls++;},assertComplete(){return true;}},journeyCall(site,p,action){late=action;g.a.release();try{action();}catch{}}});
 rejected(g.fresh);assert.equal(journeyCalls,0);assert.deepEqual(g.a.status(),{state:'released',failed:false,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false});rejected(()=>late());assert.equal(journeyCalls,0);
 let h;h=fixture({owner:{commit(){h.a.release();},pageNavigation(){},assertReading(){}}});rejected(h.fresh);assert.equal(h.a.status().freshCount,0);assert.equal(h.a.retainedBytes(),1024);
});

test('wrapper throws/swallow/repeat cannot replace earlier owner failure or fabricate actual journey success',()=>{
 for(const value of falsy){let journeyCalls=0;const f=fixture({owner:{commit(){throw value;},pageNavigation(){},assertReading(){}},journey:{commit(){journeyCalls++;},assertComplete(){return true;}},journeyCall(site,p,action,suppress){assert.equal(suppress,true);action();try{action();}catch{}throw Error('later wrapper');}});rejected(f.fresh,value);assert.equal(journeyCalls,1);}
 for(const value of falsy){const f=fixture({journeyCall(){throw value;}});rejected(f.fresh,value);assert.equal(f.a.status().freshCount,0);}
});

test('post-owner fences prevent released seal/read/public/blank state resurrection',()=>{
 const tombstone={state:'released',failed:false,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false};
 for(const method of ['assertBalanced','seal']){
  let f;f=fixture({owner:{commit(){},pageNavigation(){},assertReading(){f.a.release();}}});f.fresh();f.pub();
  const error=rejected(()=>f.a[method]());assert.equal(error.code,'released');assert.deepEqual(f.a.status(),tombstone);assert.equal(f.a.retainedBytes(),1024);
 }
 for(const url of ['case','blank']){
  let f;f=fixture({owner:{commit(){},pageNavigation(){f.a.release();},assertReading(){}}});
  const error=rejected(()=>f.a.pageNavigation(f.config.page,f.config.token,f.config.mainFrame,url==='case'?f.config.caseUrl:'about:blank'));
  assert.equal(error.code,'released');assert.deepEqual(f.a.status(),tombstone);assert.equal(f.a.retainedBytes(),1024);
 }
});

test('invocation-local owner/action first failure survives wrapper reentry and release without retained helper association',()=>{
 const values=[...falsy,new Error('invented original')];
 for(const source of ['owner','action'])for(const value of values)for(const mode of ['reentry','release','reentry-release','release-reentry']){
  let f,journeyCalls=0;
  const owner={commit(){if(source==='owner')throw value;},pageNavigation(){},assertReading(){}};
  const journey={commit(){journeyCalls++;if(source==='action')throw value;},assertComplete(){return true;}};
  f=fixture({owner,journey,journeyCall(site,p,action){
   if(source==='owner'&&mode==='reentry')try{f.pub();}catch{}
   try{action();}catch{}
   if(mode==='reentry'&&source==='action')try{f.pub();}catch{}
   if(mode==='release')f.a.release();
   if(mode==='reentry-release'){try{f.pub();}catch{}f.a.release();}
   if(mode==='release-reentry'){f.a.release();try{f.pub();}catch{}}
  }});
  rejected(f.fresh,value);assert.equal(journeyCalls,1);
  if(mode.includes('release')){assert.equal(f.a.status().state,'released');assert.equal(f.a.status().failed,false);assert.equal(f.a.status().publicCount,0);assert.equal(f.a.retainedBytes(),1024);const late=rejected(f.pub);assert.equal(late.code,'released');assert.ok(!Object.is(late,value));}
  else{assert.equal(f.a.status().failed,true);rejected(f.pub,value);}
 }
 for(const value of values){let f,calls=0;f=fixture({owner:{commit(){throw value;},pageNavigation(){},assertReading(){}},journey:{commit(){calls++;},assertComplete(){return true;}},journeyCall(site,p,action){f.a.release();try{action();}catch{}}});rejected(f.fresh,value);assert.equal(calls,0);assert.equal(f.a.status().failed,false);}
});

test('journey operator release then throw retains only ongoing original outcome and no revived helper data',()=>{
 for(const value of [...falsy,new Error('invented original')]){
  let f;f=fixture({journey:{commit(){f.a.release();throw value;},assertComplete(){return true;}},journeyCall(site,p,action){try{action();}catch{}}});
  rejected(f.fresh,value);assert.deepEqual(f.a.status(),{state:'released',failed:false,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false});assert.equal(f.a.retainedBytes(),1024);
 }
});

test('extra fresh commit always invokes original join then fails, regardless compensating counts',()=>{
 const f=fixture();f.pub();f.fresh();f.pub();rejected(f.fresh);assert.equal(f.calls.filter(c=>c[0]==='owner').length,2);assert.equal(f.calls.filter(c=>c[0]==='journey').length,2);assert.equal(f.a.status().freshCount,1);
});

test('1024 notifications total across fresh/PW/same, overflow checked before increment',()=>{
 const f=fixture();f.fresh();f.pub();for(let i=0;i<511;i++){f.same();f.pub();}f.a.assertBalanced();assert.equal(f.a.status().publicCount,512);assert.equal(f.a.status().sameDocumentCount,511);
 const before=f.a.status();rejected(f.pub);assert.equal(f.a.status().publicCount,before.publicCount);
});

test('pending prefixes wait only through caller loop; early/postawait fences fail sticky and deadline never renews',async()=>{
 const f=fixture();f.pub();assert.equal(f.a.status().matched,false);await Promise.resolve();f.fresh();f.a.assertBalanced();
 await Promise.resolve();f.same();const error=rejected(()=>f.a.assertBalanced());rejected(f.pub,error);
 const early=fixture();rejected(()=>early.a.assertBalanced());
 const late=fixture();late.pub();late.fresh();late.setTime(20000);rejected(()=>late.a.assertBalanced());
 const during=fixture({guard(){if(during?.a.status().freshCount===1)during.setTime(20000);}});during.pub();rejected(during.fresh);
});

test('sealed publication invalidates every later event even balanced; retirement permits only zero debt including0/0',()=>{
 for(const event of ['fresh','pub','same']){const f=fixture();f.pub();f.fresh();f.a.seal();rejected(f[event]);assert.equal(f.a.status().state,'sealed');}
 const unavailable=fixture();unavailable.a.retire();assert.equal(unavailable.a.status().state,'retiring');assert.equal(unavailable.calls.length,0);rejected(unavailable.pub);
 const pending=fixture();pending.pub();rejected(()=>pending.a.retire());
 const complete=fixture();complete.fresh();complete.pub();complete.a.seal();complete.a.retire();assert.equal(complete.a.status().state,'retiring');
});

test('release bypasses faults/lease, clears only helper, readers never call operators and tombstone is idempotent',()=>{
 let calls=0;const f=fixture({guard(){calls++;}});f.pub();const error=rejected(()=>f.a.assertBalanced());f.setTime(40000);
 const before=calls;assert.equal(f.a.status().failed,true);f.a.retainedBytes();assert.equal(calls,before);f.a.release();f.a.release();assert.equal(calls,before);
 assert.equal(f.a.retainedBytes(),1024);assert.deepEqual(f.a.status(),{state:'released',failed:false,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false});
 const released=rejected(f.pub);assert.notEqual(released,error);assert.equal(released.code,'released');assert.equal(calls,before);
});

test('invented aggregate boundary includes full reservation exactly once; not actual capture integration',()=>{
 const f=fixture(),charge=f.a.retainedBytes();function aggregate(other){assert.ok(other+f.a.retainedBytes()<=32768);}
 aggregate(32768-charge);assert.throws(()=>aggregate(32769-charge));f.a.release();assert.equal(f.a.retainedBytes(),1024);
 const all=Array.from({length:4},()=>fixture());const full=all.reduce((n,f)=>n+f.a.retainedBytes(),0);assert.ok(full>4*1024);for(const f of all)f.a.release();assert.equal(all.reduce((n,f)=>n+f.a.retainedBytes(),0),4096);
});

async function actual(){
 let now=0;const cases=Array.from({length:4},(_,i)=>({id:'case-'+i,ordinal:i+1,nativeOrdinal:i+1,url:'https://publisher.org/'+i})),page={},frame={},session={},token={},url=cases[0].url;
 const owner=createArticleOwner({infrastructure:{seal(){},release(){throw Error('shared owner release forbidden');}},cases,clock:()=>now});
 const target={targetId:'article',type:'page',url:'about:blank',attached:false,browserContextId:'context'};
 owner.seal({targetInfo:{...target,targetId:'anchor',attached:true}});owner.reserve(cases[0],20000);owner.created({targetInfo:target});owner.page(page);owner.returned(page);owner.authenticate({targetInfo:{...target,attached:true}});
 owner.pageNavigation(frame,frame,'about:blank');owner.navigate('frame','blank');
 const journey=createPublicJourney({incarnation:token,frameId:'frame',blankLoaderId:'blank',url,until:20000,clock:()=>now,guard(){},onFailure(){}});journey.begin(token);
 const config={page,mainFrame:frame,session,token,frameId:'frame',blankLoaderId:'blank',caseUrl:url,until:20000,clock:()=>now,guard(){},owner,journey,journeyCall:createJourneyFailureWitness('blank').call};
 const a=createMainNavigationAccounting(config),p={frame:{id:'frame',url,loaderId:'fresh'}};
 async function finish(){journey.reply(token,{frameId:'frame',loaderId:'fresh'});journey.response(token,{schema:'native-main-response-journey/v1',finalUrlHash:sha(url),status:200,frameId:'frame',loaderId:'fresh',fetchRequestId:'request',fetchResponseId:'response',networkRequestId:'network',requestUrlExact:true,ordinaryTlsSecure:true,selectedPublicPinMatched:true,pinHash:'1'.repeat(64),headerPolicyHash:'2'.repeat(64),navigationLoaderVerified:false,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false});
  journey.lifecycle(token,{frameId:'frame',loaderId:'fresh',name:'DOMContentLoaded',timestamp:1});
  await journey.invokeContinuation(token,{kind:'requestContinuation',fetchId:'request',networkId:'network'},()=>Promise.resolve());
  await journey.invokeContinuation(token,{kind:'responseContinuation',fetchId:'response',networkId:'network'},()=>Promise.resolve());journey.finished(token,{requestId:'network',timestamp:1,encodedDataLength:1});
  owner.verifyNavigation({frameId:'frame',loaderId:'fresh'});
 }
 return {a,owner,journey,config,p,finish,setTime:n=>{now=n;}};
}

test('actual owner + journey seven facts + actual witness wrapper, both stream orders and shared owner survives release',async()=>{
 for(const order of ['PFSPS','FSPPS']){
  const f=await actual();for(const e of order){if(e==='P')f.a.pageNavigation(f.config.page,f.config.token,f.config.mainFrame,f.config.caseUrl);else if(e==='F')f.a.freshCommit(f.config.session,f.config.page,f.config.token,f.p);else f.a.sameDocument(f.config.session,f.config.page,f.config.token,{frameId:'frame',url:f.config.caseUrl,navigationType:'historyApi'});}
  // Two same-document events require three public counterparts.
  f.a.pageNavigation(f.config.page,f.config.token,f.config.mainFrame,f.config.caseUrl);await f.finish();f.a.assertBalanced();f.a.seal();f.a.retire();f.a.release();
  assert.equal(f.owner.snapshot().pending,true);f.owner.assertReading();assert.equal(f.journey.snapshot().phase,'resolved');
 }
});

test('actual owner preserves sole initial blank exception; late blank and duplicate CDP stay fatal',async()=>{
 const f=await actual();const error=rejected(()=>f.a.pageNavigation(f.config.page,f.config.token,f.config.mainFrame,'about:blank'));assert.equal(error.code,'article-navigation');
 const g=await actual();g.a.freshCommit(g.config.session,g.config.page,g.config.token,g.p);const repeat=rejected(()=>g.a.freshCommit(g.config.session,g.config.page,g.config.token,g.p));assert.equal(repeat.code,'navigation-journey');
});

test('source remains unregistered and actual frozen baseline pins are rechecked at end',async()=>{
 const text=await readFile(new URL('./accounting.mjs',import.meta.url),'utf8');assert.equal(/\b(?:async|await|setTimeout|setInterval|readFile|fetch|launchPersistentContext)\b/u.test(text.replace(/\/\/[^\n]*/gu,'')),false);
 assert.equal((text.match(/export function/gu)||[]).length,1);assert.equal(text.includes('owner.release('),false);await authenticate();
});
