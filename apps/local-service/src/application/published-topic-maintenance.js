// One bounded turn of public evidence work. Caller owns scheduling and the
// existing worker resource; no timer, new encoder, SQL connection or provider.
import {types} from 'node:util';
import {publishedTopicInput} from './published-topic-evidence.js';
const fail=()=>{throw new TypeError('Invalid public topic maintenance');};
const unavailable=()=>Object.assign(Error('Public topic maintenance unavailable'),{code:'unavailable'});
function fields(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail();const o={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();o[k]=d.value;}return o;}
function values(raw){const r=fields(raw,['modelId','values']);if(r.modelId!=='e5-small-q8-browser-main-prefix-v1')fail();
 const a=r.values;if(types.isProxy(a)||!Array.isArray(a)||Object.getPrototypeOf(a)!==Array.prototype||a.length!==384||Reflect.ownKeys(a).length!==385)fail();
 const out=[];for(let i=0;i<384;i++){const d=Object.getOwnPropertyDescriptor(a,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value))fail();out.push(d.value);}
 if(Math.abs(Math.hypot(...out)-1)>1e-5)fail();return out;}
export function createPublishedTopicMaintenance(options){
 const {repository,resources}=fields(options,['repository','resources']);for(const k of ['tasks','repair','store','defer'])if(typeof repository?.[k]!=='function')fail();
 if(typeof resources?.embedCapturedBody!=='function')fail();let closed=false,pending=null,closing=null;
 async function work(raw){let a;try{a=JSON.parse(raw);}catch{fail();}if(!a||Object.keys(a).sort().join(',')!=='generation,matcherHash'||typeof a.generation!=='string'||typeof a.matcherHash!=='string')fail();
  const tasks=await repository.tasks(raw);if(closed)throw unavailable();if(!Array.isArray(tasks)||tasks.length>2)fail();const outcomes=[];
  for(const task of tasks){if(closed)throw unavailable();
   try{
   if(task.kind==='scope'){const status=await repository.repair(JSON.stringify({...a,eventId:task.eventId}));if(closed)throw unavailable();outcomes.push(status);continue;}
   let prepared=null;
   if(!task.skipEncoding&&task.witness!==null){const w=task.witness,input=publishedTopicInput(JSON.stringify({rootId:w.rootId,topicId:w.topicId,caption:w.caption,body:w.body}));
    if(!input.meaningful)prepared={bodyValues:null,titleValues:null,exclusion:'insufficient-public-text'};
    else{const body=await resources.embedCapturedBody(input.bodyInput);if(closed)throw unavailable();const bodyValues=values(body);
     const title=await resources.embedCapturedBody(input.titleInput);if(closed)throw unavailable();prepared={bodyValues,titleValues:values(title),exclusion:null};}
   }
   if(closed)throw unavailable();const status=await repository.store(JSON.stringify({...a,eventId:task.eventId,witness:task.witness,prepared}));if(closed)throw unavailable();outcomes.push(status);
   }catch(error){if(closed)throw unavailable();try{await repository.defer(JSON.stringify({generation:a.generation,eventId:task.eventId}));}catch{/* Keep the physical event; next turn can observe it again. */}
    if(closed)throw unavailable();outcomes.push('deferred');}
  }
  return Object.freeze(outcomes);
 }
 return Object.freeze({turn(raw){if(arguments.length!==1||typeof raw!=='string'||Buffer.byteLength(raw)>2048)fail();if(closed||pending)throw unavailable();
   const original=work(raw);pending=original;void original.then(()=>{if(pending===original)pending=null;},()=>{if(pending===original)pending=null;});return original;},
  close(){if(!closing){closed=true;const original=pending;closing=(async()=>{if(original)await Promise.allSettled([original]);})();}return closing;},
 });
}
