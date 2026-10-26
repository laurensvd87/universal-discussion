import {types} from 'node:util';

export const LIMITS=Object.freeze({normalEvents:4096,normalInFlight:126,cleanupInFlight:2,aggregateInFlight:128,denialsInFlight:1});
const METHODS=Object.freeze({denial:'route-abort',ordinary:'coordinator-rpc',cleanup:'cleanup-rpc'});
const FAILURES=new Set(['event-capacity','normal-capacity','cleanup-capacity','operation-rejected','external-fatal','disposed','invalid-task']);
function error(code){const e=new Error(code);e.code=code;return e;}
function task(value,lane){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw error('invalid-task');
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 if(keys.length!==2||!keys.includes('method')||!keys.includes('ordinal'))throw error('invalid-task');
 for(const k of keys)if(!Object.hasOwn(d[k],'value'))throw error('invalid-task');
 if(d.method.value!==METHODS[lane]||!Number.isSafeInteger(d.ordinal.value)||d.ordinal.value<0||d.ordinal.value>4095)throw error('invalid-task');
 return Object.freeze({method:d.method.value,ordinal:d.ordinal.value});
}

// execute is trusted injected infrastructure. Its returned promise may never settle;
// failure does not pretend that the underlying RPC has stopped or free its slot.
export function createRouteCoordinator(execute){
 if(typeof execute!=='function'||types.isProxy(execute))throw error('invalid-task');
 let failure=null,disposed=false,events=0,cleanupIssued=0,normalActive=0,cleanupActive=0,denialActive=0;
 let peakNormal=0,peakCleanup=0,peakAggregate=0,peakDenials=0,peakBacklog=0;
 const queued=[],active=new Set();
 function rejectEntry(entry,code){if(!entry.finished){entry.finished=true;entry.reject(error(code));}}
 function stop(code){
  if(!failure)failure=code;
  for(const entry of queued)rejectEntry(entry,failure);queued.length=0;
  for(const entry of active)if(entry.lane!=='cleanup'||disposed)rejectEntry(entry,failure);
 }
 function fail(code='external-fatal'){
  if(typeof code!=='string'||!FAILURES.has(code))throw error('invalid-task');stop(code);
 }
 function start(entry){
  active.add(entry);
  if(entry.lane==='cleanup')cleanupActive++;else normalActive++;
  if(entry.lane==='denial')denialActive++;
  peakNormal=Math.max(peakNormal,normalActive);peakCleanup=Math.max(peakCleanup,cleanupActive);
  peakAggregate=Math.max(peakAggregate,normalActive+cleanupActive);peakDenials=Math.max(peakDenials,denialActive);
  let result;
  try{result=execute(entry.task,entry.lane);}catch{settle(entry,false);return;}
  // Both branches are attached immediately, including after disposal/failure.
  Promise.resolve(result).then(()=>settle(entry,true),()=>settle(entry,false));
 }
 function pump(){
  if(failure||disposed||denialActive||normalActive>=LIMITS.normalInFlight||!queued.length)return;
  start(queued.shift());
 }
 function settle(entry,ok){
  active.delete(entry);
  if(entry.lane==='cleanup')cleanupActive--;else normalActive--;
  if(entry.lane==='denial')denialActive--;
  if(!ok)stop('operation-rejected');
  if(!entry.finished){entry.finished=true;if(ok)entry.resolve();else entry.reject(error(failure));}
  pump();
 }
 function submit(lane,value){
  let copied;
  try{copied=task(value,lane);}catch(e){stop('invalid-task');return Promise.reject(e);}
  if(disposed)return Promise.reject(error('disposed'));
  if(lane!=='cleanup'&&failure)return Promise.reject(error(failure));
  if(lane==='cleanup'){
   if(cleanupIssued>=2||cleanupActive>=2)return Promise.reject(error('cleanup-capacity'));
   cleanupIssued++;
  }else{
   if(events>=4096){stop('event-capacity');return Promise.reject(error(failure));}events++;
   if(lane==='ordinary'&&normalActive>=126){stop('normal-capacity');return Promise.reject(error(failure));}
  }
  return new Promise((resolve,reject)=>{
   const entry={lane,task:copied,resolve,reject,finished:false};
   if(lane==='denial'){queued.push(entry);peakBacklog=Math.max(peakBacklog,queued.length);pump();}else start(entry);
  });
 }
 return Object.freeze({
  deny:value=>submit('denial',value),rpc:value=>submit('ordinary',value),cleanup:value=>submit('cleanup',value),fail,
  dispose(){disposed=true;stop('disposed');},
  snapshot(){return Object.freeze({failure,disposed,events,cleanupIssued,backlog:queued.length,normalActive,cleanupActive,denialActive,
   peakNormal,peakCleanup,peakAggregate,peakDenials,peakBacklog});}
 });
}
