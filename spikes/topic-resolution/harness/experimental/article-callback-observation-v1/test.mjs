// Pure callbacks only; authenticate the entire immutable baseline BEFORE imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const BASELINE_SHA='adb3b67caab942a2e61311e633cb6642ca56aaa63b41a89690a9fc993e331565',BASELINE_LENGTH=13057;
const baselineURL=new URL('../native-specificity-study-v17/article-owner.mjs',import.meta.url),baselineBytes=await readFile(baselineURL);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(baselineBytes.length,BASELINE_LENGTH);assert.equal(sha(baselineBytes),BASELINE_SHA);
const reference=await import(baselineURL.href);
const current=await import('./observer.mjs');
const FALSY=[undefined,null,false,0,-0,NaN,''];
const capture=fn=>{try{return {failed:false,value:fn()};}catch(error){return {failed:true,error};}};
const nominal=code=>new reference.ArticleOwnerError(code);
function payload(kind){
 if(kind==='target-created'||kind==='target-info-changed')return {targetInfo:{targetId:'invented-target',browserContextId:'context',type:'page',url:'about:blank',attached:true}};
 if(kind==='target-destroyed'||kind==='target-crashed')return {targetId:'invented-target'};
 if(kind==='frame-committed')return {frame:{id:'frame',loaderId:'loader',url:'https://fixture.invalid/'}};
 return {};
}
function run(module,{kind='article-navigation',input={},observation={failed:false},action={failed:false},calls=1}={}){
 const received=[],emitted=[],faults=[];let actions=0;
 const observer=module.createCallbackObservation({emit(row){emitted.push(row);if(observation.failed)throw observation.error;},onFault(row){faults.push(row);}});
 for(let i=0;i<calls;i++)observer.callback(kind,input,()=>{actions++;if(action.failed)throw action.error;},error=>received.push(error));
 return {received,emitted,faults,actions,observer,snapshot:observer.snapshot()};
}
test('only the reviewed observer factory is exported; original nominal errors project unchanged',()=>{
 assert.deepEqual(Object.keys(current),['createCallbackObservation']);
 const error=nominal('article-navigation'),r=run(current,{action:{failed:true,error}});
 assert.equal(r.received[0],error);assert.deepEqual(r.snapshot.firstFault,{schema:'native-article-first-fault/v1',origin:'article-navigation',code:'article-navigation'});
});
test('all seven falsy action throws report the exact original without adding properties or suppressing action',()=>{
 for(const value of FALSY){
  const r=run(current,{action:{failed:true,error:value}});
  assert.equal(r.actions,1);assert.equal(r.received.length,1);assert.ok(Object.is(r.received[0],value));
  assert.equal(r.snapshot.firstFault.code,'native-failure');assert.equal(r.snapshot.callbackCalls,1);assert.equal(r.snapshot.invalidCallbacks,0);
 }
});
test('all seven falsy emission throws still run action and report the exact observation value',()=>{
 for(const value of FALSY){
  const r=run(current,{observation:{failed:true,error:value}});
  assert.equal(r.actions,1);assert.equal(r.received.length,1);assert.ok(Object.is(r.received[0],value));
  assert.equal(r.snapshot.totalObserved,1);assert.equal(r.snapshot.retained,1);assert.equal(r.snapshot.invalidCallbacks,0);
 }
});
test('success/truthy/seven-falsy Cartesian emission/action matrix uses failure presence and action priority',()=>{
 const observations=[{failed:false},...FALSY.map(error=>({failed:true,error})),{failed:true,error:nominal('descriptor')}];
 const actions=[{failed:false},...FALSY.map(error=>({failed:true,error})),{failed:true,error:nominal('article-navigation')}];
 for(const observation of observations)for(const action of actions){
  const r=run(current,{observation,action});assert.equal(r.actions,1);
  const failed=action.failed||observation.failed;assert.equal(r.received.length,failed?1:0);
  if(failed){const expected=action.failed?action.error:observation.error;assert.ok(Object.is(r.received[0],expected));}
  else assert.equal(r.snapshot.firstFault,null);
 }
});
test('ordinary success and truthy observation/action failures are differential across every closed callback kind',()=>{
 for(const kind of reference.CALLBACK_KINDS)for(const observation of [{failed:false},{failed:true,error:nominal('descriptor')}])for(const action of [{failed:false},{failed:true,error:nominal('article-navigation')}]){
  const options={kind,input:payload(kind),observation,action};
  const a=run(reference,options),b=run(current,options);
  assert.equal(a.actions,b.actions);assert.deepEqual(a.received,b.received);assert.deepEqual(a.emitted,b.emitted);assert.deepEqual(a.faults,b.faults);assert.deepEqual(a.snapshot,b.snapshot);
 }
});
test('validation, unknown kinds and malformed payload counters remain differential and never suppress actions',()=>{
 const examples=[['unknown',{}],[null,{}],['target-created',{}],['target-info-changed',{targetInfo:{targetId:'x'}}],
  ['target-destroyed',{}],['target-crashed',{targetId:''}],['frame-committed',{}],['frame-committed',{frame:{id:'x',loaderId:'y',url:0}}]];
 for(const [kind,input]of examples){
  const a=run(reference,{kind,input}),b=run(current,{kind,input});assert.equal(b.actions,1);
  assert.deepEqual(a.snapshot,b.snapshot);assert.equal(a.received[0].constructor,reference.ArticleOwnerError);assert.equal(b.received[0].constructor,reference.ArticleOwnerError);
  assert.equal(a.received[0].code,b.received[0].code);assert.equal(b.snapshot.invalidCallbacks,1);
  for(const value of FALSY){const r=run(current,{kind,input,action:{failed:true,error:value}});assert.equal(r.actions,1);assert.ok(Object.is(r.received[0],value));}
 }
});
test('summary32/33 drops preserve every action and late failure, without retaining raw error history',()=>{
 const a=run(reference,{calls:33}),b=run(current,{calls:33});assert.deepEqual(a.snapshot,b.snapshot);
 assert.equal(b.actions,33);assert.equal(b.emitted.length,32);assert.equal(b.snapshot.retained,32);assert.equal(b.snapshot.dropped,1);
 let actions=0,received=[];
 const observer=current.createCallbackObservation();for(let i=0;i<33;i++)observer.callback('article-navigation',{},()=>{actions++;},e=>received.push(e));
 observer.callback('article-navigation',{},()=>{actions++;throw false;},e=>received.push(e));
 assert.equal(actions,34);assert.deepEqual(received,[false]);assert.equal(observer.snapshot().retained,32);assert.equal(observer.snapshot().dropped,2);
 assert.equal(observer.snapshot().firstFault.code,'native-failure');
 assert.deepEqual(Object.keys(observer.snapshot()),['callbackCalls','totalObserved','invalidCallbacks','retained','dropped','counts','firstFault']);
 assert.equal(Object.isFrozen(observer.snapshot()),true);assert.equal(Object.isFrozen(observer.snapshot().counts),true);
});
test('4096/4097 capacity counters stay differential and action falsy failure wins at the actual overflow',()=>{
 const a=run(reference,{calls:4097}),b=run(current,{calls:4097});assert.deepEqual(a.snapshot,b.snapshot);assert.equal(b.actions,4097);
 assert.equal(b.snapshot.callbackCalls,4097);assert.equal(b.snapshot.totalObserved,4096);assert.equal(b.snapshot.invalidCallbacks,1);assert.equal(b.received[0].code,'event-capacity');
 for(const error of FALSY){
  const received=[];let actions=0;
  const observer=current.createCallbackObservation();for(let i=0;i<4096;i++)observer.callback('article-navigation',{},()=>{actions++;},e=>received.push(e));
  observer.callback('article-navigation',{},()=>{actions++;throw error;},e=>received.push(e));
  assert.equal(actions,4097);assert.equal(received.length,1);assert.ok(Object.is(received[0],error));
  assert.equal(observer.snapshot().firstFault.code,'native-failure');assert.equal(observer.snapshot().invalidCallbacks,1);
 }
});
test('late malformed payload after summaries fill remains validated, acted on and reported',()=>{
 const observer=current.createCallbackObservation();const received=[];let actions=0;
 for(let i=0;i<33;i++)observer.callback('article-navigation',{},()=>{actions++;},error=>received.push(error));
 observer.callback('target-created',{},()=>{actions++;},error=>received.push(error));
 assert.equal(actions,34);assert.equal(received[0].code,'descriptor');assert.equal(observer.snapshot().totalObserved,33);
 assert.equal(observer.snapshot().invalidCallbacks,1);assert.equal(observer.snapshot().dropped,1);assert.equal(observer.snapshot().retained,32);
});
test('forged/accessor/proxy/coercible thrown values and hostile payloads trigger zero hooks',()=>{
 let hooks=0;const trap=()=>{hooks++;throw 0;};
 const proxy=new Proxy(new Error(),{get:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap,ownKeys:trap});
 const getter=Object.defineProperty({},'code',{get:trap}),nativeGetter=nominal('article-navigation');
 Object.defineProperty(nativeGetter,'code',{get:trap});
 const coercible=Object.defineProperties({},{toString:{value:trap},valueOf:{value:trap},[Symbol.toPrimitive]:{value:trap}});
 for(const error of [proxy,getter,nativeGetter,coercible,{code:'article-navigation'},Object.assign(new Error(),{code:'article-navigation'}),Symbol('invented')]){
  const r=run(current,{action:{failed:true,error}});assert.equal(r.received.length,1);assert.ok(Object.is(r.received[0],error));assert.equal(r.snapshot.firstFault.code,'native-failure');
 }
 for(const input of [new Proxy({},{get:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap,ownKeys:trap}),Object.defineProperty({},'targetInfo',{get:trap})]){
  const r=run(current,{kind:'target-created',input});assert.equal(r.actions,1);assert.equal(r.received[0].code,'descriptor');
 }
 assert.equal(hooks,0);
});
test('sticky finite firstFault keeps original summary while every later exact error is delivered',()=>{
 const received=[],summaries=[],first=nominal('descriptor'),later=nominal('article-navigation');
 const observer=current.createCallbackObservation({onFault:row=>summaries.push(row)});
 observer.callback('article-navigation',{},()=>{throw first;},e=>received.push(e));
 const frozen=observer.snapshot().firstFault;observer.callback('article-navigation',{},()=>{throw false;},e=>received.push(e));
 observer.callback('article-navigation',{},()=>{throw later;},e=>received.push(e));
 assert.equal(received[0],first);assert.equal(received[1],false);assert.equal(received[2],later);assert.equal(summaries.length,1);
 assert.equal(observer.snapshot().firstFault,frozen);assert.equal(frozen.code,'descriptor');assert.equal(Object.isFrozen(frozen),true);
 assert.equal(Reflect.ownKeys(first).length,Reflect.ownKeys(nominal('descriptor')).length);
});
test('throwing onFault remains swallowed; throwing onFailure propagates same falsy/ordinary original without retry',()=>{
 for(const handlerError of [...FALSY,new Error('invented handler failure')]){
  let actions=0,failures=0,faults=0;const original=nominal('article-navigation');
  const observer=current.createCallbackObservation({onFault(){faults++;throw handlerError;}});
  const result=capture(()=>observer.callback('article-navigation',{},()=>{actions++;throw original;},error=>{failures++;assert.equal(error,original);throw handlerError;}));
  assert.equal(result.failed,true);assert.ok(Object.is(result.error,handlerError));assert.equal(actions,1);assert.equal(failures,1);assert.equal(faults,1);
  assert.equal(observer.snapshot().firstFault.code,'article-navigation');
 }
});
test('actual corrected observer delivers false first into caller latch before an actual nominal owner navigation refusal',()=>{
 const cases=Array.from({length:4},(_,i)=>({id:'case-'+i,nativeOrdinal:i+1,url:'https://fixture.invalid/'+i}));
 const owner=reference.createArticleOwner({infrastructure:{},cases,clock:()=>0});
 let present=false,first;const delivered=[];
 const select=error=>{delivered.push(error);if(!present){present=true;first=error;}};
 const observer=current.createCallbackObservation();observer.callback('article-navigation',{},()=>{throw false;},select);
 observer.callback('article-navigation',{},()=>owner.pageNavigation({},{} ,'about:blank'),select);
 assert.equal(first,false);assert.equal(delivered.length,2);assert.equal(delivered[1].constructor,reference.ArticleOwnerError);assert.equal(delivered[1].code,'article-navigation');
 assert.equal(observer.snapshot().firstFault.code,'native-failure');assert.equal(Object.hasOwn(observer.snapshot().firstFault,'error'),false);
});

const WRAPPER="// ADR208 pure callback successor; no runtime integration or admission authority.\nimport {types} from 'node:util';\nimport {ArticleOwnerError,fail,fields,identity,CALLBACK_KINDS} from '../native-specificity-study-v17/article-owner.mjs';\n";
const SOURCE_EDITS=[["let observationError=null,actionError=null,projected=false;","let observationError=null,actionError=null,observationFailed=false,actionFailed=false,projected=false;"],["observationError=e;","observationFailed=true;observationError=e;"],["actionError=e;","actionFailed=true;actionError=e;"],["const error=actionError??observationError;if(error){","const error=actionFailed?actionError:observationError;if(actionFailed||observationFailed){"]];

test('only reviewed wrapper/literal/function exist and inversion reconstructs complete baseline bytes/hash',async()=>{
 const source=await readFile(new URL('./observer.mjs',import.meta.url),'utf8'),old=baselineBytes.toString('utf8');
 assert.equal(source.startsWith(WRAPPER),true);
 const faultLine=old.split('\n').find(line=>line.startsWith('const FAULT_CODES='));
 assert.equal(source.slice(WRAPPER.length).startsWith(faultLine+'\n'),true);
 let inverse=source.slice(WRAPPER.length+faultLine.length+1);
 const start=old.indexOf('export function createCallbackObservation('),end=old.indexOf('export function createArticleOwner(');
 for(const [before,after]of SOURCE_EDITS){assert.equal(inverse.split(after).length,2);inverse=inverse.replace(after,before);}
 assert.equal(inverse,old.slice(start,end));const reconstructed=Buffer.from(old.slice(0,start)+inverse+old.slice(end),'utf8');
 assert.deepEqual(reconstructed,baselineBytes);assert.equal(reconstructed.length,BASELINE_LENGTH);assert.equal(sha(reconstructed),BASELINE_SHA);
});
test('baseline endpin is unchanged after every pure test',async()=>{
 const end=await readFile(baselineURL);assert.equal(end.length,BASELINE_LENGTH);assert.equal(sha(end),BASELINE_SHA);assert.deepEqual(end,baselineBytes);
});

