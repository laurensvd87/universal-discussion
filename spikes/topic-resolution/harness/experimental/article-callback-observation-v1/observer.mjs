// ADR208 pure callback successor; no runtime integration or admission authority.
import {types} from 'node:util';
import {ArticleOwnerError,fail,fields,identity,CALLBACK_KINDS} from '../native-specificity-study-v17/article-owner.mjs';
const FAULT_CODES=new Set(['descriptor','identity','event-capacity','unexpected-page','unexpected-target','article-identity','article-lifecycle','article-revival','article-deadline','navigation-journey','anchor-mutation','unexpected-page-event','unexpected-worker','unexpected-disconnect','infrastructure-contract','infrastructure-identity','infrastructure-lifecycle','infrastructure-census','anchor-contract','observation-failed','native-failure','active-deadline','operation-capacity','late-navigation','late-article-callback','unexpected-frame','fixture-response','released','registry-capacity','target-capacity','target-contract','article-unmatched','article-slot','article-navigation','target-duplicate','navigation-repeated','late-read','article-retirement','census-duplicate','census-revival','census-omission','duplicate-request','late-request','fixture-request','fixture-incomplete','contract','operation-registry','client-operation','coordinator-capacity','rpc-deadline','coordinator-failed','unsettled-operations']);
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
