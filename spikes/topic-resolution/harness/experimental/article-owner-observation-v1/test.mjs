// Pure invented fixtures; baseline FILE authentication precedes BOTH imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const BASELINE_SHA='adb3b67caab942a2e61311e633cb6642ca56aaa63b41a89690a9fc993e331565',BASELINE_BYTES=13057;
const baselineURL=new URL('../native-specificity-study-v17/article-owner.mjs',import.meta.url);
const baselineBytes=await readFile(baselineURL),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(baselineBytes.length,BASELINE_BYTES);assert.equal(sha(baselineBytes),BASELINE_SHA);
const reference=await import(baselineURL.href);
const observed=await import('./article-owner.mjs');
const CASES=Array.from({length:4},(_,i)=>({id:'invented-case-'+(i+1),ordinal:i+1,nativeOrdinal:i+1,url:'https://fixture.invalid/article-'+(i+1)}));
const capture=action=>{try{return {failed:false,value:action()};}catch(error){return {failed:true,error};}};
function fixture(module=observed,{cases=CASES,releaseAction=()=>{}}={}){
 let now=0,clockFailure=false,clockError;
 const calls=[];
 const infrastructure={seal:value=>calls.push(['seal',value]),targetPayload:value=>value,
  created:()=>true,worker:()=>{},lifecycle:()=>{},census:()=>({phase:'invented'}),release:()=>{calls.push(['release']);releaseAction();}};
 const owner=module.createArticleOwner({infrastructure,cases,clock:()=>{if(clockFailure)throw clockError;return now;}});
 const frame={},page={};
 const info=(id,attached=false)=>({targetInfo:{targetId:id,type:'page',url:'about:blank',browserContextId:'owned-context',attached}});
 owner.seal(info('anchor',true));
 const f={owner,frame,page,cases,calls,info,
  setTime:value=>{now=value;},throwClock:value=>{clockFailure=true;clockError=value;},clearClock:()=>{clockFailure=false;},
  reserve(i=0){owner.reserve(cases[i],1000);},
  provisional(i=0){f.reserve(i);owner.created(info('article-'+i));},
  authenticate(i=0){f.provisional(i);owner.page(page);owner.returned(page);owner.authenticate(info('article-'+i,true));},
  navigate(i=0){f.authenticate(i);owner.navigate('main-frame','blank-loader');},
  reading(i=0){f.navigate(i);owner.commit({frame:{id:'main-frame',loaderId:'fresh-loader',url:cases[i].url}});owner.verifyNavigation({frameId:'main-frame',loaderId:'fresh-loader'});},
  phase(value){if(value==='absent')return;if(value==='pending'){f.reserve();return;}if(value==='provisional'){f.provisional();return;}
   if(value==='authenticated'){f.authenticate();return;}if(value==='navigating'){f.navigate();return;}f.reading();
   if(value==='retiring'||value==='terminal')owner.retire();if(value==='terminal')owner.lifecycle('target-destroyed',{targetId:'article-0'});}
 };return f;
}
const dto=(predicate,state='unexamined',urlRelation='unexamined')=>({schema:'native-article-navigation-witness/v1',predicate,state,urlRelation});
const snapshotWithoutReservation=owner=>{const value=owner.snapshot();return {...value,retainedBytes:value.retainedBytes-512};};
function comparePhase(phase,operation){
 const a=fixture(reference),b=fixture(observed);a.phase(phase);b.phase(phase);
 const left=capture(()=>operation(a)),right=capture(()=>operation(b));
 assert.equal(left.failed,right.failed);
 if(left.failed){assert.equal(left.error.constructor,reference.ArticleOwnerError);assert.equal(right.error.constructor,reference.ArticleOwnerError);assert.equal(left.error.code,right.error.code);}
 else assert.deepEqual(left.value,right.value);
 assert.deepEqual(snapshotWithoutReservation(b.owner),a.owner.snapshot());return {a,b,left,right};
}
test('baseline and original helper nominal identity are reused, not cloned',()=>{
 assert.deepEqual(Object.keys(observed),Object.keys(reference));
 for(const key of Object.keys(reference))if(key!=='createArticleOwner')assert.equal(observed[key],reference[key],key);
 assert.notEqual(observed.createArticleOwner,reference.createArticleOwner);
 const a=fixture(reference),b=fixture(observed);assert.deepEqual(snapshotWithoutReservation(b.owner),a.owner.snapshot());
});
test('actual six refusal branches and overlapping conditions preserve original codes, state and order',()=>{
 const rows=[
  ['absent',f=>f.owner.pageNavigation({},f.frame,'https://other.invalid/'),dto('pending')],
  ['pending',f=>f.owner.pageNavigation({},f.frame,'about:blank'),dto('frame')],
  ['pending',f=>f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/'),dto('target','absent','other')],
  ['provisional',f=>f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url),dto('state','provisional')],
  ['authenticated',f=>f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url),dto('state','authenticated')],
  ['retiring',f=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'),dto('state','retiring')],
  ['terminal',f=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'),dto('state','terminal')],
  ['navigating',f=>{f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url);f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/');},dto('repeat','navigating')],
  ['reading',f=>{f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url);f.owner.pageNavigation(f.frame,f.frame,'about:blank');},dto('repeat','reading')],
  ['navigating',f=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'),dto('url','navigating','blank')],
  ['reading',f=>f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/'),dto('url','reading','other')],
  ['navigating',f=>f.owner.pageNavigation(f.frame,f.frame,undefined),dto('url','navigating','unavailable')]
 ];
 for(const [phase,action,expected]of rows){
  const {b,right}=comparePhase(phase,action);assert.equal(right.error.code,'article-navigation');
  const witness=b.owner.navigationWitnessFor(right.error);assert.deepEqual(witness,expected);
  assert.equal(Object.isFrozen(witness),true);assert.deepEqual(Object.keys(witness),['schema','predicate','state','urlRelation']);
  assert.equal(b.owner.navigationWitnessFor(right.error),witness);
 }
});
test('initial blank acceptance remains single before target/provisional/authenticated, never after navigate',()=>{
 for(const phase of ['pending','provisional','authenticated']){
  comparePhase(phase,f=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'));
  const {b,right}=comparePhase(phase,f=>{f.owner.pageNavigation(f.frame,f.frame,'about:blank');f.owner.pageNavigation(f.frame,f.frame,'about:blank');});
  assert.deepEqual(b.owner.navigationWitnessFor(right.error),phase==='pending'?dto('target','absent','blank'):dto('state',phase));
 }
 for(const phase of ['navigating','reading']){
  comparePhase(phase,f=>f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url));
  const {b,right}=comparePhase(phase,f=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'));
  assert.deepEqual(b.owner.navigationWitnessFor(right.error),dto('url',phase,'blank'));
 }
});
test('overlapping frame/state/repeat/URL refusals keep original left-to-right priority',()=>{
 for(const phase of ['pending','provisional','authenticated','navigating','reading','retiring','terminal']){
  const {b,right}=comparePhase(phase,f=>f.owner.pageNavigation({},f.frame,'about:blank'));
  assert.deepEqual(b.owner.navigationWitnessFor(right.error),dto('frame'));
 }
 for(const phase of ['retiring','terminal']){
  const {b,right}=comparePhase('reading',f=>{f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url);f.owner.retire();
   if(phase==='terminal')f.owner.lifecycle('target-destroyed',{targetId:'article-0'});
   f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/');});
  assert.deepEqual(b.owner.navigationWitnessFor(right.error),dto('state',phase));
 }
});
test('full four-article lifecycle remains differential with independent Page and CDP ordering',async()=>{
 for(const pageFirst of [true,false]){
  const a=fixture(reference),b=fixture(observed);
  for(let i=0;i<4;i++)for(const f of [a,b]){
   f.authenticate(i);f.owner.pageNavigation(f.frame,f.frame,'about:blank');f.owner.navigate('main-frame','blank-loader');
   const page=()=>f.owner.pageNavigation(f.frame,f.frame,f.cases[i].url);
   if(pageFirst)page();
   f.owner.commit({frame:{id:'main-frame',loaderId:'fresh-loader',url:f.cases[i].url}});
   f.owner.verifyNavigation({frameId:'main-frame',loaderId:'fresh-loader'});
   if(!pageFirst)page();f.owner.assertReading();
   const retired=f.owner.retire();f.owner.lifecycle('target-destroyed',{targetId:'article-'+i});await retired;f.owner.retired();
  }
  assert.deepEqual(snapshotWithoutReservation(b.owner),a.owner.snapshot());assert.equal(b.owner.snapshot().tombstones,4);
  a.owner.release();b.owner.release();assert.deepEqual(snapshotWithoutReservation(b.owner),a.owner.snapshot());
 }
});
test('first navigation refusal is sticky across later different and same-code errors and other owners',()=>{
 const f=fixture();f.reserve();const first=capture(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error;
 const expected=dto('frame'),witness=f.owner.navigationWitnessFor(first);assert.deepEqual(witness,expected);
 const later=capture(()=>f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/')).error;
 assert.notEqual(later,first);assert.equal(f.owner.navigationWitnessFor(later),null);assert.equal(f.owner.navigationWitnessFor(first),witness);
 const g=fixture();g.reserve();const other=capture(()=>g.owner.pageNavigation({},g.frame,'about:blank')).error;
 for(const error of [other,new reference.ArticleOwnerError('article-navigation'),{code:'article-navigation'},null,false,0,undefined])assert.equal(f.owner.navigationWitnessFor(error),null);
 assert.equal(g.owner.navigationWitnessFor(first),null);
 assert.equal(f.owner.navigationWitnessFor(),null);assert.equal(f.owner.navigationWitnessFor(first,first),null);
});
test('guard/clock failures including falsy values own the first navigation failure with null witness',()=>{
 for(const value of [undefined,null,false,0,-0,NaN,new Error('invented')]){
  const f=fixture();f.reserve();f.throwClock(value);
  const first=capture(()=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'));assert.equal(first.failed,true);assert.ok(Object.is(first.error,value));
  assert.equal(f.owner.navigationWitnessFor(value),null);f.clearClock();
  const later=capture(()=>f.owner.pageNavigation({},f.frame,'about:blank'));assert.equal(later.error.code,'article-navigation');assert.equal(f.owner.navigationWitnessFor(later.error),null);
 }
 const f=fixture();f.reserve();f.setTime(1000);const first=capture(()=>f.owner.pageNavigation(f.frame,f.frame,'about:blank')).error;
 assert.equal(first.code,'article-deadline');assert.equal(f.owner.navigationWitnessFor(first),null);f.setTime(0);
 assert.equal(f.owner.navigationWitnessFor(capture(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error),null);
});
test('unrelated owner failures never receive a navigation witness or preempt a later actual navigation observation',()=>{
 const f=fixture();const unrelated=capture(()=>f.owner.returned({})).error;
 assert.equal(f.owner.navigationWitnessFor(unrelated),null);const actual=capture(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error;
 assert.deepEqual(f.owner.navigationWitnessFor(actual),dto('pending'));
});
test('short-circuited state and URL remain unexamined; hostile inputs and reader arguments have zero hooks',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');};
 const hostile=new Proxy({},{get:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap,ownKeys:trap});
 const coercible=Object.defineProperties({},{toString:{value:trap},valueOf:{value:trap},[Symbol.toPrimitive]:{value:trap}});
 for(const phase of ['absent','pending','provisional','authenticated','retiring','terminal','navigating','reading']){
  const f=fixture();f.phase(phase);
  const result=capture(()=>f.owner.pageNavigation(phase==='pending'?hostile:f.frame,f.frame,hostile));assert.equal(result.failed,true);
  const witness=f.owner.navigationWitnessFor(result.error);
  if(['absent','pending'].includes(phase))assert.equal(witness.urlRelation,'unexamined');
  else if(['provisional','authenticated','retiring','terminal'].includes(phase))assert.equal(witness.urlRelation,'unexamined');
  else assert.equal(witness.urlRelation,'unavailable');
  for(const argument of [hostile,coercible]){assert.equal(f.owner.navigationWitnessFor(argument),null);assert.equal(f.owner.navigationWitnessFor(argument,hostile),null);}
 }
 const f=fixture();f.reserve();const error=capture(()=>f.owner.pageNavigation(f.frame,f.frame,coercible)).error;
 assert.deepEqual(f.owner.navigationWitnessFor(error),dto('target','absent','unavailable'));
 for(const phase of ['navigating','reading']){
  const g=fixture();g.phase(phase);g.owner.pageNavigation(g.frame,g.frame,g.cases[0].url);
  const repeated=capture(()=>g.owner.pageNavigation(g.frame,g.frame,hostile)).error;
  assert.deepEqual(g.owner.navigationWitnessFor(repeated),dto('repeat',phase));
 }
 assert.equal(hooks,0);
});
test('witness reading adds no clock/guard call and cannot turn malformed navigation input into acceptance',()=>{
 let reads=0;
 const owner=observed.createArticleOwner({infrastructure:{seal(){},release(){}},cases:CASES,clock:()=>{reads++;return 0;}});
 owner.seal({targetInfo:{targetId:'anchor',type:'page',url:'about:blank',browserContextId:'context',attached:true}});
 owner.reserve(CASES[0],100);const f={};const first=capture(()=>owner.pageNavigation(f,f,{})).error;
 const before=reads;assert.deepEqual(owner.navigationWitnessFor(first),dto('target','absent','unavailable'));
 owner.navigationWitnessFor(first);owner.navigationWitnessFor(first,first);assert.equal(reads,before);
});
test('release revokes and clears before delegated cleanup, including throwing and reentrant cleanup',()=>{
 for(const throwing of [false,true]){
  let f,first,seen,late;
  f=fixture(observed,{releaseAction(){seen=f.owner.navigationWitnessFor(first);late=capture(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error;if(throwing)throw false;}});
  first=capture(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error;const saved=f.owner.navigationWitnessFor(first);
  const outcome=capture(()=>f.owner.release());assert.equal(outcome.failed,throwing);if(throwing)assert.equal(outcome.error,false);
  assert.equal(seen,null);assert.equal(late.code,'released');assert.equal(f.owner.navigationWitnessFor(first),null);assert.equal(f.owner.navigationWitnessFor(late),null);
  assert.deepEqual(saved,dto('pending'));assert.equal(Object.isFrozen(saved),true);assert.equal(f.owner.snapshot().retainedBytes,128+8192+512);
 }
});
test('exact production function body preserves original fail error when best-effort witness freeze throws',()=>{
 for(const projectionFault of [false,undefined,new Error('invented projection failure')]){
  const originals=[];let failProjection=true,projections=0;
  const ObjectFacade={entries:Object.entries,hasOwn:Object.hasOwn,is:Object.is,freeze(value){
   if(Object.getOwnPropertyDescriptor(value,'schema')?.value==='native-article-navigation-witness/v1'){
    projections++;if(failProjection)throw projectionFault;
   }
   return Object.freeze(value);
  }};
  const failFactory=code=>{const error=new reference.ArticleOwnerError(code);originals.push(error);throw error;};
  // Test-only lexical dependencies; the executed function body is the EXACT
  // production source, never a rewritten predicate model or runtime hook.
  const injected=Function('fail','fields','dense','identity','Object','return ('+observed.createArticleOwner.toString()+');')(
   failFactory,reference.fields,reference.dense,reference.identity,ObjectFacade);
  assert.equal(injected.toString(),observed.createArticleOwner.toString());
  const f=fixture({createArticleOwner:injected});f.reserve();
  let first,delivered,actions=0;const callback=observed.createCallbackObservation();
  callback.callback('article-navigation',{},()=>{actions++;first=capture(()=>f.owner.pageNavigation({},f.frame,'about:blank'));if(first.failed)throw first.error;},error=>{delivered=error;});
  assert.equal(actions,1);assert.equal(delivered,first.error);assert.equal(callback.snapshot().firstFault.code,'article-navigation');
  assert.equal(first.failed,true);assert.equal(first.error,originals[0]);assert.equal(first.error.code,'article-navigation');
  assert.deepEqual(Reflect.ownKeys(first.error),Reflect.ownKeys(new reference.ArticleOwnerError('article-navigation')));
  assert.equal(f.owner.navigationWitnessFor(first.error),null);assert.equal(projections,1);
  failProjection=false;const second=capture(()=>f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/'));
  assert.equal(second.error,originals[1]);assert.notEqual(second.error,first.error);
  assert.equal(f.owner.navigationWitnessFor(first.error),null);assert.equal(f.owner.navigationWitnessFor(second.error),null);
  assert.equal(projections,1); // The first failed observation remains sticky.
 }
});
test('actual callback helper delivers SAME owner action error; earlier external first primary cannot borrow a later witness',()=>{
 const f=fixture();f.reserve();let actionError,delivered,actions=0;
 const observation=observed.createCallbackObservation();
 observation.callback('article-navigation',{},()=>{actions++;try{f.owner.pageNavigation({},f.frame,'about:blank');}catch(error){actionError=error;throw error;}},error=>{delivered=error;});
 assert.equal(actions,1);assert.equal(delivered,actionError);assert.equal(delivered.constructor,reference.ArticleOwnerError);
 assert.deepEqual(f.owner.navigationWitnessFor(delivered),dto('frame'));
 assert.deepEqual(observation.snapshot().firstFault,{schema:'native-article-first-fault/v1',origin:'article-navigation',code:'article-navigation'});
 for(const first of [new Error('invented unrelated primary'),false]){
  const g=fixture();g.reserve();let present=false,primary,later;const received=[];
  const select=error=>{received.push(error);if(!present){present=true;primary=error;}};
  const actual=observed.createCallbackObservation();
  if(first===false)select(first); // Honest caller-selection seam, not a claim
  // that the unchanged helper itself transports a falsy callback throw.
  else actual.callback('article-navigation',{},()=>{throw first;},select);
  actual.callback('article-navigation',{},()=>{try{g.owner.pageNavigation({},g.frame,'about:blank');}catch(error){later=error;throw error;}},select);
  assert.equal(primary,first);assert.equal(received.at(-1),later);assert.deepEqual(g.owner.navigationWitnessFor(later),dto('frame'));
  assert.equal(g.owner.navigationWitnessFor(primary),null);
  assert.equal(actual.snapshot().firstFault.code,first===false?'article-navigation':'native-failure');
 }
});
test('fixed512 reservation precedes any event and actual bounded navigation proves32768/32769 behavior',()=>{
 const unsealed=observed.createArticleOwner({infrastructure:{release(){}},cases:CASES,clock:()=>0});
 assert.equal(unsealed.snapshot().retainedBytes,128+8192+512);unsealed.release();assert.equal(unsealed.snapshot().retainedBytes,128+8192+512);
 const small=fixture();small.navigate();const before=small.owner.snapshot().retainedBytes;small.owner.pageNavigation(small.frame,small.frame,CASES[0].url);
 const flagCharge=small.owner.snapshot().retainedBytes-before;assert.equal(flagCharge,'pageCommitSeen'.length+8);
 for(const extra of [0,1]){
  const padding=32768+extra-before-flagCharge,cases=CASES.map((row,i)=>({...row,url:row.url+(i===0?'x'.repeat(padding):'')}));
  const f=fixture(observed,{cases}),a=fixture(reference,{cases});f.navigate();a.navigate();
  assert.equal(f.owner.snapshot().retainedBytes,32768+extra-flagCharge);
  const outcome=capture(()=>f.owner.pageNavigation(f.frame,f.frame,cases[0].url));assert.equal(outcome.failed,extra===1);
  assert.equal(f.owner.snapshot().retainedBytes,32768+extra);
  a.owner.pageNavigation(a.frame,a.frame,cases[0].url);assert.equal(a.owner.snapshot().retainedBytes,32256+extra);
  if(extra){
   assert.equal(outcome.error.code,'registry-capacity');assert.equal(f.owner.navigationWitnessFor(outcome.error),null);
   const next=capture(()=>f.owner.pageNavigation(f.frame,f.frame,cases[0].url)).error;assert.equal(next.code,'article-navigation');assert.equal(f.owner.navigationWitnessFor(next),null);
  }
 }
});
test('all reachable finite DTO combinations contain no caller strings and have measured UTF8 maximum',()=>{
 const witnesses=[];
 for(const [phase,url]of [['absent','about:blank'],['pending','other'],['provisional','other'],['authenticated','other'],['navigating','about:blank'],['reading',undefined],['retiring','other'],['terminal','other']]){
  const f=fixture();f.phase(phase);const result=capture(()=>f.owner.pageNavigation(phase==='pending'?{}:f.frame,f.frame,url));
  witnesses.push(f.owner.navigationWitnessFor(result.error));
 }
 const f=fixture();f.reserve();f.owner.pageNavigation(f.frame,f.frame,'about:blank');witnesses.push(f.owner.navigationWitnessFor(capture(()=>f.owner.pageNavigation(f.frame,f.frame,'about:blank')).error));
 const g=fixture();g.navigate();g.owner.pageNavigation(g.frame,g.frame,CASES[0].url);witnesses.push(g.owner.navigationWitnessFor(capture(()=>g.owner.pageNavigation(g.frame,g.frame,CASES[0].url)).error));
 let maximum=0;
 for(const witness of witnesses){
  assert.deepEqual(Object.keys(witness),['schema','predicate','state','urlRelation']);assert.equal(Object.isFrozen(witness),true);
  assert.ok(['pending','frame','target','state','repeat','url'].includes(witness.predicate));
  assert.ok(['unexamined','absent','provisional','authenticated','navigating','reading','retiring','terminal'].includes(witness.state));
  assert.ok(['unexamined','blank','other','unavailable'].includes(witness.urlRelation));
  const bytes=Buffer.from(JSON.stringify(witness),'utf8');maximum=Math.max(maximum,bytes.length);
  for(const forbidden of ['fixture.invalid','invented-case','main-frame','fresh-loader','article-0'])assert.equal(bytes.includes(forbidden),false);
 }
 assert.ok(maximum<=512);assert.equal(maximum,120);
});

const WRAPPER="// ADR206 pure, unregistered owner successor; no capture/runtime authority.\nimport {fail,fields,dense,identity} from '../native-specificity-study-v17/article-owner.mjs';\nexport {ArticleOwnerError,fail,fields,dense,identity,CALLBACK_KINDS,createCallbackObservation} from '../native-specificity-study-v17/article-owner.mjs';\n";
const PRIVATE_DECLARATION=" let navigationFailed=false,navigationError,navigationObservation=null;\n";
const PRIVATE_HELPER=" function navigationRefusal(predicate,state='unexamined',urlRelation='unexamined'){\n  try{fail('article-navigation');}catch(error){\n   if(!released&&!navigationFailed){navigationFailed=true;navigationError=error;\n    try{navigationObservation=Object.freeze({schema:'native-article-navigation-witness/v1',predicate,state,urlRelation});}catch{navigationObservation=null;}}\n   throw error;\n  }\n }\n";
const OBSERVED_NAVIGATION="  pageNavigation(frame,mainFrame,url){\n   try{check();const p=pending,r=p?.target;\n    if(!p)navigationRefusal('pending');\n    if(frame!==mainFrame)navigationRefusal('frame');\n    if((!r||['provisional','authenticated'].includes(r.state))&&url==='about:blank'&&!p.initialBlankSeen){p.initialBlankSeen=true;return;}\n    if(!r)navigationRefusal('target','absent',typeof url!=='string'?'unavailable':url==='about:blank'?'blank':'other');\n    const state=r.state;\n    if(!['navigating','reading'].includes(state))navigationRefusal('state',state);\n    if(r.pageCommitSeen)navigationRefusal('repeat',state);\n    if(url!==r.caseUrl)navigationRefusal('url',state,typeof url!=='string'?'unavailable':url==='about:blank'?'blank':'other');\n    r.pageCommitSeen=true;bounded();\n   }catch(error){if(!released&&!navigationFailed){navigationFailed=true;navigationError=error;navigationObservation=null;}throw error;}\n  },\n  navigationWitnessFor(error){return arguments.length===1&&!released&&navigationFailed&&Object.is(error,navigationError)?navigationObservation:null;},";

test('source wrapper is closed and reversal reproduces ENTIRE authenticated baseline byte-for-byte',async()=>{
 const source=await readFile(new URL('./article-owner.mjs',import.meta.url),'utf8');
 assert.equal(source.startsWith(WRAPPER),true);assert.equal(source.indexOf('export function createArticleOwner('),WRAPPER.length);
 let reversed=source.slice(WRAPPER.length);
 for(const change of [PRIVATE_DECLARATION,PRIVATE_HELPER,OBSERVED_NAVIGATION])assert.equal(reversed.split(change).length,2);
 reversed=reversed.replace(PRIVATE_DECLARATION,'').replace(PRIVATE_HELPER,'').replace('let bytes=128+8192+512;','let bytes=128+8192;');
 const oldSource=baselineBytes.toString('utf8'),start=oldSource.indexOf('export function createArticleOwner(');
 const oldNavigation=oldSource.split('\n').find(line=>line.startsWith('  pageNavigation('));
 reversed=reversed.replace(OBSERVED_NAVIGATION,oldNavigation).replace('pending=null;released=true;navigationFailed=true;navigationError=undefined;navigationObservation=null;infrastructure.release();','pending=null;released=true;infrastructure.release();');
 assert.equal(reversed,oldSource.slice(start));const reconstructed=Buffer.from(oldSource.slice(0,start)+reversed,'utf8');
 assert.equal(reconstructed.length,BASELINE_BYTES);assert.equal(sha(reconstructed),BASELINE_SHA);assert.deepEqual(reconstructed,baselineBytes);
});
test('frozen baseline endpin and size remain unchanged after every pure regression',async()=>{
 const end=await readFile(baselineURL);assert.equal(end.length,BASELINE_BYTES);assert.equal(sha(end),BASELINE_SHA);assert.deepEqual(end,baselineBytes);
});

