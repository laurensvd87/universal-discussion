// Private article rendezvous, not an authority grant. Infrastructure is delegated
// to the byte-authenticated ADR166 pure policy, never its unique-blank registry.
import assert from 'node:assert/strict';
import {types} from 'node:util';
const ownedMapForEach=Map.prototype.forEach,ownedSetForEach=Set.prototype.forEach;
export class ArticleOwnerError extends Error{constructor(code){super('Owned public article refused');this.code=code;}}
export function fail(code){throw new ArticleOwnerError(code);}
export function fields(value){
 if(!value||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('descriptor');
 const keys=Reflect.ownKeys(value);if(keys.length>32)fail('descriptor');const out=Object.create(null);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d||!Object.hasOwn(d,'value')||types.isProxy(d.value))fail('descriptor');out[key]=d.value;}return out;
}
export function identity(x){if(typeof x!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(x))fail('identity');return x;}
export function dense(value,max=128){if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)fail('descriptor');return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))fail('descriptor');return d.value;});}
export const CALLBACK_KINDS=Object.freeze(['disconnected','page','worker','anchor-navigation','anchor-dialog','anchor-download','anchor-crash','anchor-worker','article-dialog','article-download','article-crash','article-worker','article-navigation','target-created','target-info-changed','target-destroyed','target-crashed','frame-committed']);
const FAULT_CODES=new Set(['descriptor','identity','event-capacity','unexpected-page','unexpected-target','article-identity','article-lifecycle','article-revival','article-deadline','navigation-journey','anchor-mutation','unexpected-page-event','unexpected-worker','unexpected-disconnect','infrastructure-contract','infrastructure-identity','infrastructure-lifecycle','infrastructure-census','anchor-contract','observation-failed','native-failure','active-deadline','operation-capacity','late-navigation','late-article-callback','unexpected-frame','fixture-response','released','registry-capacity','target-capacity','target-contract','article-unmatched','article-slot','article-navigation','target-duplicate','navigation-repeated','late-read','article-retirement','census-duplicate','census-revival','census-omission','duplicate-request','late-request','fixture-request','fixture-incomplete','contract','operation-registry','client-operation','coordinator-capacity','rpc-deadline','coordinator-failed','unsettled-operations']);
/**32 retained summaries, not a callback processing cap. ALL validation and the
 * original action still run; malformed payloads never count as mere drops. */
export function createCallbackObservation({emit=()=>{},onFault=()=>{},errorPrototypes=[ArticleOwnerError.prototype]}={}){
 const rows=[],counts=Object.fromEntries(CALLBACK_KINDS.map(k=>[k,0]));let total=0,dropped=0,firstFault=null,callbackCalls=0,invalidCallbacks=0;
 function fault(error,origin='native-failure'){
  if(firstFault)return firstFault;let code='native-failure';
  try{if(!types.isProxy(error)&&types.isNativeError(error)&&errorPrototypes.includes(Object.getPrototypeOf(error))){const d=Object.getOwnPropertyDescriptor(error,'code');if(d&&Object.hasOwn(d,'value')&&FAULT_CODES.has(d.value))code=d.value;}}catch{}
  firstFault=Object.freeze({schema:'native-article-first-fault/v1',origin:CALLBACK_KINDS.includes(origin)?origin:'native-failure',code});try{onFault(firstFault);}catch{}return firstFault;
 }
 function callback(kind,payload,action,onFailure){let observationError=null,actionError=null,observationFailed=false,actionFailed=false,projected=false;
  try{
   if(++callbackCalls>4096||!CALLBACK_KINDS.includes(kind))fail('event-capacity');
   if(kind.startsWith('target-')){
    const p=fields(payload);if(kind==='target-created'||kind==='target-info-changed'){const t=fields(p.targetInfo);identity(t.targetId);if(Object.hasOwn(t,'browserContextId'))identity(t.browserContextId);if(typeof t.type!=='string'||!t.type.length||t.type.length>64||typeof t.url!=='string'||t.url.length>2048||typeof t.attached!=='boolean')fail('descriptor');}
    else identity(p.targetId);
   }else if(kind==='frame-committed'){const f=fields(fields(payload).frame);identity(f.id);identity(f.loaderId);if(typeof f.url!=='string'||f.url.length>2048)fail('descriptor');}
   projected=true;total++;counts[kind]++;const row=Object.freeze({schema:'native-article-callback/v1',kind,ordinal:total});if(rows.length<32){rows.push(row);emit(row);}else dropped++;
  }catch(e){if(!projected)invalidCallbacks++;observationFailed=true;observationError=e;}
  try{action();}catch(e){actionFailed=true;actionError=e;}
  const error=actionFailed?actionError:observationError;if(actionFailed||observationFailed){fault(error,kind);onFailure(error);}
 }
 return Object.freeze({callback,fault,snapshot:()=>Object.freeze({callbackCalls,totalObserved:total,invalidCallbacks,retained:rows.length,dropped,counts:Object.freeze({...counts}),firstFault})});
}
export function createArticleOwner({infrastructure,cases,clock=()=>performance.now()}){
 const roster=dense(cases,4);if(roster.length!==4)fail("contract");
 for(let i=0;i<4;i++){const c=fields(roster[i]);identity(c.id);if(c.nativeOrdinal!==i+1||typeof c.url!=="string"||!c.url.startsWith("https://"))fail("contract");}
 const articles=new Map(),all=new Set();let anchorContext=null,pending=null,closing=false,events=0,released=false,nextOrdinal=1;
 let navigationFailed=false,navigationError,navigationObservation=null,accountingTotal=0;
 function navigationRefusal(predicate,state='unexamined',urlRelation='unexamined'){
  try{fail('article-navigation');}catch(error){
   if(!released&&!navigationFailed){navigationFailed=true;navigationError=error;
    try{navigationObservation=Object.freeze({schema:'native-article-navigation-witness/v1',predicate,state,urlRelation});}catch{navigationObservation=null;}}
   throw error;
  }
 }
 function check(){if(released)fail('released');if(pending&&clock()>=pending.until)fail('article-deadline');}
 function count(){if(++events>4096)fail('event-capacity');}
 // Logical, not V8 allocation: header128; set entry32+ASCII ID; map entry32;
 // field-name bytes plus strings/8-byte scalar/64-byte retained function slot.
 // Same original field charges plus8 for this numeric accumulator. Reuse this
 // already-retained function as the native Map/Set callback: no new per-call
 // callback, entry array, snapshot, JSON text or iterator is constructed.
 function accounting(value,key,collection){
  if(arguments.length){
   if(arguments.length!==3||accountingTotal>=0||(collection!==all&&collection!==articles))fail('contract');
   if(collection===all){if(typeof value!=='string'||value!==key)fail('contract');accountingTotal-=32+value.length;return;}
   if(value===null||typeof value!=='object'||types.isProxy(value)||articles.get(key)!==value||Object.hasOwn(value,'id')&&value.id!==key)fail('contract');
   accountingTotal-=32;
   for(let i=0;i<12;i++){
    const key=i===0?'id':i===1?'context':i===2?'url':i===3?'caseUrl':i===4?'state':i===5?'terminal':i===6?'attached':i===7?'frame':i===8?'loader':i===9?'pageCommitSeen':i===10?'blankLoader':'settleRetired';
    if(Object.hasOwn(value,key))accountingTotal-=key.length+(typeof value[key]==='string'?value[key].length:typeof value[key]==='function'?64:8);
   }return;
  }
  if(accountingTotal!==0)fail('contract');accountingTotal=-(128+8192+512+8);
  try{ownedSetForEach.call(all,accounting);ownedMapForEach.call(articles,accounting);if(pending)accountingTotal-=1024;return -accountingTotal;}
  finally{accountingTotal=0;}
 }
 function bounded(){if(accounting()>32768)fail('registry-capacity');}
 function charge(t){all.add(t.targetId);if(all.size>32)fail('target-capacity');bounded();}
 function info(value){const d=fields(value),t=fields(d.targetInfo);identity(t.targetId);if(Object.hasOwn(t,'browserContextId'))identity(t.browserContextId);if(typeof t.attached!=='boolean'||typeof t.type!=='string'||typeof t.url!=='string'||t.url.length>2048)fail('target-contract');return t;}
 function candidate(t){if(t.type!=='page'||t.url!=='about:blank'||t.browserContextId!==anchorContext||Object.hasOwn(t,'parentId')||Object.hasOwn(t,'openerId')||all.has(t.targetId))fail('unexpected-page');}
 function articleSame(r,t){if(r.terminal||t.type!=='page'||t.browserContextId!==r.context||Object.hasOwn(t,'parentId')||Object.hasOwn(t,'openerId')||t.url!==r.url&&!(r.state==='navigating'&&t.url===r.caseUrl))fail('article-identity');if(t.url===r.caseUrl)r.url=t.url;}
 function authenticateReady(){const p=pending;if(!p||!p.target||!p.returned||!p.page||!p.authInfo)return null;const r=p.target,t=p.authInfo;if(p.returned!==p.page||p.authenticated)fail('article-unmatched');articleSame(r,t);if(t.targetId!==r.id||t.url!=='about:blank'||!t.attached)fail('article-unmatched');r.state='authenticated';r.attached=true;p.authenticated=true;if(p.authResolve){p.authResolve(r.id);p.authResolve=null;p.authReject=null;}return r.id;}
 return Object.freeze({
  seal(value){check();const t=info(value);infrastructure.seal(value);anchorContext=t.browserContextId;charge(t);},
  reserve(fixture,until){check();if(pending||closing||!anchorContext||[...articles.values()].some(r=>!r.terminal)||!Number.isFinite(until)||clock()>=until||nextOrdinal>4||fixture.ordinal<nextOrdinal||fixture.ordinal>4||fixture.id!==roster[fixture.ordinal-1].id||fixture.url!==roster[fixture.ordinal-1].url)fail('article-slot');nextOrdinal=fixture.ordinal+1;pending={fixture,until,target:null,page:null,returned:null,authenticated:false};bounded();},
  page(value){check();count();if(!pending||pending.page||!value||pending.returned&&pending.returned!==value)fail('unexpected-page');pending.page=value;authenticateReady();},
  returned(value){check();if(!pending||pending.returned||!value||pending.page&&pending.page!==value)fail('article-slot');pending.returned=value;authenticateReady();},
  pageNavigation(frame,mainFrame,url){
   try{check();const p=pending,r=p?.target;
    if(!p)navigationRefusal('pending');
    if(frame!==mainFrame)navigationRefusal('frame');
    if((!r||['provisional','authenticated'].includes(r.state))&&url==='about:blank'&&!p.initialBlankSeen){p.initialBlankSeen=true;return;}
    if(!r)navigationRefusal('target','absent',typeof url!=='string'?'unavailable':url==='about:blank'?'blank':'other');
    const state=r.state;
    if(!['navigating','reading'].includes(state))navigationRefusal('state',state);
    if(r.pageCommitSeen)navigationRefusal('repeat',state);
    if(url!==r.caseUrl)navigationRefusal('url',state,typeof url!=='string'?'unavailable':url==='about:blank'?'blank':'other');
    r.pageCommitSeen=true;bounded();
   }catch(error){if(!released&&!navigationFailed){navigationFailed=true;navigationError=error;navigationObservation=null;}throw error;}
  },
  navigationWitnessFor(error){return arguments.length===1&&!released&&navigationFailed&&Object.is(error,navigationError)?navigationObservation:null;},
  created(value){check();count();const t=info(value);
   if(t.type==='page'&&pending){candidate(t);if(pending.target)fail('unexpected-page');const r={id:t.targetId,context:t.browserContextId,url:t.url,caseUrl:pending.fixture.url,state:'provisional',terminal:false,attached:t.attached,frame:null,loader:null};articles.set(r.id,r);charge(t);pending.target=r;authenticateReady();return;}
   if(articles.has(t.targetId))fail('article-revival');charge(t);const trusted=infrastructure.targetPayload(value);if(!infrastructure.created(trusted,closing))fail('unexpected-target');
  },
  worker(value){check();const t=info(value);if(all.has(t.targetId))fail('target-duplicate');charge(t);infrastructure.worker(infrastructure.targetPayload(value));},
  lifecycle(event,value){check();count();const d=fields(value),t=event==='target-info-changed'?info(value):null,id=identity(t?t.targetId:d.targetId),r=articles.get(id);
   if(!r){infrastructure.lifecycle(event,value,closing);return;}
   if(event==='target-info-changed'){articleSame(r,t);if(r.state==='retiring'&&t.attached&&r.attached===false)fail('article-revival');r.attached=t.attached;}
   else{if(event!=='target-destroyed'||r.terminal||r.state!=='retiring'&&!closing)fail('article-lifecycle');r.terminal=true;r.state='terminal';if(r.settleRetired)r.settleRetired();}
  },
  authenticate(value){check();if(!pending||pending.authInfo)fail('article-unmatched');pending.authInfo=info(value);const result=authenticateReady();if(result===null)fail('article-unmatched');return result;},
  awaitAuthentication(value){check();if(!pending||pending.authInfo)fail('article-unmatched');pending.authInfo=info(value);return new Promise((resolve,reject)=>{pending.authResolve=resolve;pending.authReject=reject;try{authenticateReady();}catch(e){reject(e);}});},
  abortPending(error){if(pending?.authReject){pending.authReject(error);pending.authReject=null;pending.authResolve=null;}},
  navigate(frameId,blankLoaderId){check();const p=pending;if(!p?.authenticated)fail('article-unmatched');const r=p.target;if(r.state!=='authenticated')fail('navigation-repeated');r.frame=identity(frameId);r.blankLoader=identity(blankLoaderId);r.state='navigating';bounded();},
  commit(value){check();const f=fields(fields(value).frame),r=pending?.target;if(!r||r.state!=='navigating'||r.loader||Object.hasOwn(f,'parentId')||f.id!==r.frame||f.url!==r.caseUrl||identity(f.loaderId)===r.blankLoader)fail('navigation-journey');r.loader=f.loaderId;r.url=f.url;bounded();},
  verifyNavigation(value){check();const d=fields(value),r=pending?.target;if(!r||!r.loader||d.frameId!==r.frame||d.loaderId!==r.loader||Object.hasOwn(d,'errorText'))fail('navigation-journey');r.state='reading';},
  assertReading(){check();if(pending?.target?.state!=='reading')fail('late-read');},
  retire(){check();const r=pending?.target;if(!r||!['reading','navigating','authenticated'].includes(r.state))fail('article-retirement');r.state='retiring';pending.until=Infinity;return new Promise(resolve=>{r.settleRetired=resolve;});},
  retired(){check();const r=pending?.target;if(!r?.terminal)fail('article-retirement');articles.set(r.id,Object.freeze({terminal:true,state:'terminal'}));pending=null;},
  census(value,phase,workerUrl){check();const rows=dense(fields(value).targetInfos,32),seen=new Set(),base=[];for(const row of rows){const t=fields(row);identity(t.targetId);if(seen.has(t.targetId))fail('census-duplicate');seen.add(t.targetId);charge(t);const r=articles.get(t.targetId);if(r){if(r.terminal)fail('census-revival');articleSame(r,t);}else base.push(row);}
   for(const r of articles.values())if(!r.terminal&&!seen.has(r.id))fail('census-omission');const result=infrastructure.census({targetInfos:base},phase,workerUrl);return Object.freeze({...result,articleTargets:rows.length-base.length,articleTombstones:[...articles.values()].filter(r=>r.terminal).length});},
  retainedBytes:accounting,
  setClosing(){check();closing=true;},snapshot(){return Object.freeze({events,targets:all.size,articles:articles.size,tombstones:[...articles.values()].filter(r=>r.terminal).length,pending:pending!==null,retainedBytes:accounting()});},
  release(){articles.clear();all.clear();pending=null;released=true;navigationFailed=true;navigationError=undefined;navigationObservation=null;infrastructure.release();}
 });
}



