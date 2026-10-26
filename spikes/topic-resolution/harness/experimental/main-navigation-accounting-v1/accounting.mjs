// ADR210: noncontributing stream accounting, not navigation/rights authority.
import {types} from 'node:util';
import {dataCopy} from '../native-specificity-study-v18/manifest.js';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';

export function createMainNavigationAccounting(config){
const invalid=code=>{const e=new Error('Main navigation accounting refused');e.name='MainNavigationAccountingError';e.code=code;return e;};
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function need(value,code='contract'){if(!value)throw invalid(code);}
function record(value,keys){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
 need(Reflect.ownKeys(value).length===keys.length);const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);need(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;
}
function capability(value){need(value!==null&&typeof value==='object'&&!types.isProxy(value));return value;}
function callable(value){need(typeof value==='function'&&!types.isProxy(value));return value;}
function method(value,key){capability(value);const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'));return callable(d.value);}
function identity(value){need(typeof value==='string'&&/^[A-Za-z0-9._:-]{1,160}$/u.test(value));return value;}
function time(value){need(typeof value==='number'&&Number.isFinite(value)&&value>=0&&!Object.is(value,-0),'deadline');return value;}
function clearSlot(slot){if(slot){slot.open=false;slot.projection=null;slot.receiver=null;slot.fn=null;slot.token=null;slot.recordFailure=null;}}
// This closure captures ONLY the revocable slot, not freshCommit's input frame.
function actionFor(slot,lateRefusal){return function(){
 if(!slot.open)return lateRefusal();
 if(arguments.length!==0||slot.calls!==0){const e=invalid('journey-dispatch');slot.recordFailure(e);throw e;}
 slot.calls++;
 const recordFailure=slot.recordFailure;
 try{const value=Reflect.apply(slot.fn,slot.receiver,[slot.token,slot.projection]);need(value===undefined,'operator-return');}
 catch(e){recordFailure(e);throw e;}
};}

 need(arguments.length===1);
 const a=record(config,['page','mainFrame','session','token','frameId','blankLoaderId','caseUrl','until','clock','guard','owner','journey','journeyCall']);
 for(const k of ['page','mainFrame','session','token','owner','journey'])capability(a[k]);
 identity(a.frameId);identity(a.blankLoaderId);
 need(typeof a.caseUrl==='string'&&a.caseUrl.isWellFormed()&&a.caseUrl.length<=2048&&!a.caseUrl.includes('#'));
 let policy=inspectPageUrl(a.caseUrl);need(policy.supported&&policy.url===a.caseUrl&&a.caseUrl.startsWith('https://'));policy=null;
 time(a.until);callable(a.clock);callable(a.guard);callable(a.journeyCall);
 const s={...a,ownerCommit:method(a.owner,'commit'),ownerPage:method(a.owner,'pageNavigation'),ownerReading:method(a.owner,'assertReading'),
  journeyCommit:method(a.journey,'commit'),journeyComplete:method(a.journey,'assertComplete')};
 config=null;for(const k of Object.keys(a))a[k]=null;
 let state='active',failed=false,error,busy=false,events=0,publicCount=0,freshCount=0,sameDocumentCount=0,freshLoader=null,slot=null;
 let charge=1024+2*(s.caseUrl.length+s.frameId.length+s.blankLoaderId.length)+320;
 function latch(e){if(state!=='released'&&!failed){failed=true;error=e;}}
 function check(){
  if(state==='released')throw invalid('released');if(failed)throw error;
  need(time(Reflect.apply(s.clock,undefined,[]))<s.until,'deadline');
  need(Reflect.apply(s.guard,undefined,[])===undefined,'guard-return');
  if(state==='released')throw invalid('released');if(failed)throw error;
  need(time(Reflect.apply(s.clock,undefined,[]))<s.until,'deadline');
 }
 function run(count,action){
  if(state==='released')throw invalid('released');if(failed)throw error;
  try{need(!busy,'reentry');busy=true;check();if(count){need(state==='active','lifecycle');need(events<1024,'event-capacity');events++;}
   action();check();
  }catch(e){if(state!=='released'&&!failed){failed=true;error=e;}throw failed?error:e;}finally{busy=false;}
 }
 function bound(session,page,token){need(session===s.session&&page===s.page&&token===s.token,'binding');}
 function zeroDebt(){return publicCount===freshCount+sameDocumentCount;}
 function lateRefusal(){if(state==='released')throw invalid('released');if(!failed){failed=true;error=invalid('journey-dispatch');}throw error;}
 function readable(){
  need(state==='active'||state==='sealed','lifecycle');need(freshCount===1&&zeroDebt(),'unmatched');
  need(Reflect.apply(s.journeyComplete,s.journey,[s.token])===true,'operator-return');check();
  need(Reflect.apply(s.ownerReading,s.owner,[])===undefined,'operator-return');
  check();
 }
 const api={
  freshCommit(session,page,token,projection){run(true,()=>{
   need(arguments.length===4);bound(session,page,token);
   const raw=record(projection,['frame']);
   const p=freeze({frame:dataCopy(raw.frame,{values:4096,units:32768,depth:12,array:64,properties:24,string:32768})});
   let first,firstPresent=false,ownerCaught=false,wrapperFailed=false,wrapperError;
   try{need(Reflect.apply(s.ownerCommit,s.owner,[p])===undefined,'operator-return');}catch(e){first=e;firstPresent=true;ownerCaught=true;latch(e);}
   if(state==='released')throw firstPresent?first:invalid('released');
   // Invocation-local failure survives release ONLY to propagate this ongoing
   // synchronous call. Escaped actions lose its callback when their slot clears.
   const actionFailure={present:false,error:undefined};
   slot={open:true,calls:0,projection:p,receiver:s.journey,fn:s.journeyCommit,token:s.token,
    recordFailure(e){if(!actionFailure.present){actionFailure.present=true;actionFailure.error=e;}latch(e);}};
   const current=slot;
   try{
    try{need(Reflect.apply(s.journeyCall,undefined,['commit',p,actionFor(current,lateRefusal),ownerCaught])===undefined,'operator-return');}
    catch(e){wrapperFailed=true;wrapperError=e;}
    if(!firstPresent&&actionFailure.present){first=actionFailure.error;firstPresent=true;}
    if(!firstPresent&&wrapperFailed){first=wrapperError;firstPresent=true;}
    if(!firstPresent&&state==='released'){first=invalid('released');firstPresent=true;}
    if(!firstPresent&&current.calls!==1){first=invalid('journey-dispatch');firstPresent=true;}
   }finally{clearSlot(current);if(slot===current)slot=null;actionFailure.error=undefined;actionFailure.present=false;}
   if(firstPresent)throw first;
   check();need(freshCount===0,'fresh-repeated');const f=recordFields(p.frame);
   need(f.id===s.frameId&&f.url===s.caseUrl&&!Object.hasOwn(f,'parentId'),'fresh-binding');identity(f.loaderId);need(f.loaderId!==s.blankLoaderId,'blank-loader');
   freshLoader=f.loaderId;freshCount=1;
  });},
  sameDocument(session,page,token,payload){run(true,()=>{
   need(arguments.length===4);bound(session,page,token);const d=record(payload,['frameId','url','navigationType']);
   need(freshCount===1&&freshLoader!==null,'before-fresh');need(d.frameId===s.frameId&&d.url===s.caseUrl,'same-document-binding');
   need(['fragment','historyApi','other'].includes(d.navigationType),'navigation-type');sameDocumentCount++;
  });},
  pageNavigation(page,token,frame,url){run(true,()=>{
   need(arguments.length===4);need(page===s.page&&token===s.token&&frame===s.mainFrame,'binding');
   if(url==='about:blank'){need(Reflect.apply(s.ownerPage,s.owner,[frame,s.mainFrame,url])===undefined,'operator-return');check();return;}
   need(typeof url==='string'&&url===s.caseUrl,'public-url');
   if(publicCount===0){need(Reflect.apply(s.ownerPage,s.owner,[frame,s.mainFrame,url])===undefined,'operator-return');check();}
   publicCount++;
  });},
  status(){need(arguments.length===0);return Object.freeze({state,failed,publicCount,freshCount,sameDocumentCount,matched:state!=='released'&&freshCount===1&&zeroDebt()});},
  assertBalanced(){run(false,()=>{need(arguments.length===0);readable();});},
  seal(){run(false,()=>{need(arguments.length===0&&state==='active','lifecycle');readable();state='sealed';});},
  retire(){run(false,()=>{need(arguments.length===0&&(state==='active'||state==='sealed'),'lifecycle');need(zeroDebt(),'unmatched');state='retiring';});},
  retainedBytes(){need(arguments.length===0);return charge;},
  release(){need(arguments.length===0);state='released';clearSlot(slot);slot=null;for(const k of Object.keys(s))s[k]=null;
   failed=false;error=undefined;freshLoader=null;events=publicCount=freshCount=sameDocumentCount=0;charge=1024;}
 };
 // No constructor-time operator call; the original absolute deadline is checked
 // on every work method. Accounting readers never recurse through guard.
 return Object.freeze(api);
function recordFields(value){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
 const out=Object.create(null);for(const k of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,k);need(typeof k==='string'&&d?.enumerable&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;
}
}
