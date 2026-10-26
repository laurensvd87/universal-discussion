// ADR197 pure extraction. The immutable named import has an inert static closure.
import {types} from 'node:util';
import {StartupFatal} from '../native-extension-startup-dev-v1/run.mjs';
const bad=(code='contract')=>{throw new StartupFatal(code);};
const plain=value=>value!==null&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));

export function createInfrastructurePolicy(){
 const ids=/^[A-Za-z0-9._:-]{1,160}$/u;
 const allowed=new Map([['chrome://omnibox-popup.top-chrome/','ui-root'],['chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html','ui-aim']]);
 const members=new Map(),slots=new Map(),validated=new WeakSet();let anchor=null,released=false;
 let site=null,latched=false,firstError=null,firstWitness=null,candidateError=null,candidateWitness=null;
 function identityFailure(predicate,role){
  const error=new StartupFatal('infrastructure-identity');
  if(!latched){
   candidateError=error;candidateWitness=null;
   try{candidateWitness=Object.freeze({schema:'native-infrastructure-identity-witness/v1',site,role,predicate});}catch{}
  }
  throw error;
 }
 function entry(action,origin=null){return function(...args){
  const previous=site;site=origin;
  try{return action(...args);}catch(error){
   if(!latched){latched=true;firstError=error;firstWitness=error===candidateError?candidateWitness:null;}
   throw error;
  }finally{site=previous;candidateError=null;candidateWitness=null;}
 };}
 function descriptors(value){
  if(!plain(value))bad('infrastructure-contract');
  const keys=Reflect.ownKeys(value);if(keys.length>32||keys.some(k=>typeof k!=='string'))bad('infrastructure-contract');
  const out=Object.create(null);
  for(const key of keys){
   const d=Object.getOwnPropertyDescriptor(value,key);
   if(!d||!Object.hasOwn(d,'value')||types.isProxy(d.value))bad('infrastructure-contract');
   out[key]=d.value;
  }
  return out;
 }
 function validId(value){if(typeof value!=='string'||!ids.test(value))bad('infrastructure-contract');return value;}
 function info(value){
  const d=descriptors(value);validId(d.targetId);
  if(typeof d.type!=='string'||!d.type.length||d.type.length>64||typeof d.url!=='string'||d.url.length>2048||typeof d.attached!=='boolean')bad('infrastructure-contract');
  const contextPresent=Object.hasOwn(d,'browserContextId'),parentPresent=Object.hasOwn(d,'parentId'),openerPresent=Object.hasOwn(d,'openerId');
  if(contextPresent)validId(d.browserContextId);if(parentPresent)validId(d.parentId);if(openerPresent)validId(d.openerId);
  const result=Object.freeze({targetId:d.targetId,type:d.type,url:d.url,attached:d.attached,browserContextId:contextPresent?d.browserContextId:null,parentPresent,openerPresent});
  validated.add(result);return result;
 }
 function targetPayload(value){const d=descriptors(value);return info(d.targetInfo);}
 function active(){if(released||!anchor)bad('anchor-contract');}
 function same(record,t,closing){
  if(record.terminal)identityFailure('terminal',record.role);
  if(record.type!==t.type)identityFailure('type',record.role);
  if(record.url!==t.url)identityFailure('url',record.role);
  if(record.context!==t.browserContextId)identityFailure('context',record.role);
  if(record.role==='anchor'){
   if(t.attached!==record.attached){
    if(!closing||!record.attached||t.attached)identityFailure('attached',record.role);
    record.attached=false;
   }
  }
  else if(record.role.startsWith('ui-')){
   if(t.attached)identityFailure('attached',record.role);
   if(t.parentPresent)identityFailure('parent',record.role);
   if(t.openerPresent)identityFailure('opener',record.role);
  }
 }
 function add(t,role){
  if(members.has(t.targetId))identityFailure('duplicate-id',role);
  if(members.size>=32)identityFailure('target-capacity',role);
  members.set(t.targetId,{role,type:t.type,url:t.url,context:t.browserContextId,attached:t.attached,terminal:false,created:true});
 }
 function seal(value){
  if(released||anchor)bad('anchor-contract');
  const t=targetPayload(value);
  if(t.type!=='page'||t.url!=='about:blank'||t.browserContextId===null||!t.attached)bad('anchor-contract');
  anchor={id:t.targetId,context:t.browserContextId};
  members.set(t.targetId,{role:'anchor',type:t.type,url:t.url,context:t.browserContextId,attached:t.attached,terminal:false,created:false});
 }
 function created(t,closing=false){
  active();if(!validated.has(t))bad('infrastructure-contract');if(closing)bad('infrastructure-lifecycle');
  if(t.targetId===anchor.id){
   const record=members.get(t.targetId);if(record.created)identityFailure('duplicate-created',record.role);
   same(record,t,false);record.created=true;return true;
  }
  const role=allowed.get(t.url);
  if(t.type==='browser_ui'&&role){
   if(t.browserContextId!==anchor.context)identityFailure('context',role);
   if(t.attached)identityFailure('attached',role);
   if(t.parentPresent)identityFailure('parent',role);
   if(t.openerPresent)identityFailure('opener',role);
   if(slots.has(role))identityFailure('duplicate-role',role);
   add(t,role);slots.set(role,t.targetId);return true;
  }
  return false;
 }
 function worker(t){
  active();if(!validated.has(t))bad('infrastructure-contract');
  if(t.type!=='service_worker')identityFailure('type','worker');
  if([...members.values()].some(r=>r.role==='worker'))identityFailure('worker-present','worker');
  add(t,'worker');
 }
 function lifecycle(event,payload,closing){
  active();
  if(event==='target-info-changed'){
   const t=targetPayload(payload),record=members.get(t.targetId);
   if(!record||!record.created)bad('infrastructure-lifecycle');same(record,t,closing);return;
  }
  const d=descriptors(payload),targetId=validId(d.targetId),record=members.get(targetId);
  if(!record||!record.created||record.terminal||event==='target-crashed'||!closing)bad('infrastructure-lifecycle');
  record.terminal=true;
 }
 function copyCensus(value){
  const d=descriptors(value),array=d.targetInfos;
  if(!Array.isArray(array)||types.isProxy(array)||Object.getPrototypeOf(array)!==Array.prototype)bad('infrastructure-census');
  const length=Object.getOwnPropertyDescriptor(array,'length');
  if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>128)bad('infrastructure-census');
  const keys=Reflect.ownKeys(array);if(keys.length!==length.value+1||keys.some(k=>typeof k!=='string'))bad('infrastructure-census');
  const result=[];
  for(let i=0;i<length.value;i++){
   const item=Object.getOwnPropertyDescriptor(array,String(i));if(!item||!Object.hasOwn(item,'value'))bad('infrastructure-census');result.push(info(item.value));
  }
  return result;
 }
 function census(value,phase,workerUrl=null){
  active();if(!['pre-load','post-load','final'].includes(phase))bad('infrastructure-census');
  const rows=copyCensus(value),seen=new Set(),actual=new Set();let browserTargets=0,workers=0;
  for(const t of rows){
   if(seen.has(t.targetId))bad('infrastructure-census');seen.add(t.targetId);
   if(t.type==='browser'&&t.url===''){if(members.has(t.targetId))bad('infrastructure-census');browserTargets++;continue;}
   const record=members.get(t.targetId);if(!record||!record.created)bad('infrastructure-census');same(record,t,false);
   if(record.role==='worker'){if(workerUrl===null||t.type!=='service_worker'||t.url!==workerUrl)bad('infrastructure-census');workers++;}
   actual.add(t.targetId);
  }
  const expected=[...members].filter(([,r])=>r.created&&!r.terminal).map(([targetId])=>targetId);
  if(slots.size!==2||!members.get(anchor.id).created||workers>1||expected.length!==actual.size||expected.some(targetId=>!actual.has(targetId))||!actual.has(anchor.id)||[...slots.values()].some(targetId=>!actual.has(targetId)))bad('infrastructure-census');
  if(phase==='pre-load'&&workers!==0)bad('infrastructure-census');
  return Object.freeze({phase,targets:rows.length,blankPages:1,ownExtensionWorkers:workers,otherTargets:0,ownExtensionEquality:true,infrastructureTargets:2,infrastructureEquality:true,anchorEquality:true,browserTargets});
 }
 return Object.freeze({seal:entry(seal),targetPayload:entry(targetPayload),created:entry(created,'created'),worker:entry(worker,'worker'),
  lifecycle:entry(lifecycle,'changed'),census:entry(census,'census'),isSealed:entry(()=>anchor!==null&&!released),
  release:entry(()=>{members.clear();slots.clear();anchor=null;released=true;latched=false;firstError=null;firstWitness=null;candidateError=null;candidateWitness=null;}),
  readFailureWitness(...args){return args.length===1&&latched&&args[0]===firstError?firstWitness:null;},
  diagnosticRetainedBytes(...args){return args.length===0?320:null;}});
}
