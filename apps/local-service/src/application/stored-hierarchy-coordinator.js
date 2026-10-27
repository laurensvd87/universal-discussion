// Explicit derived-material background work. Import/construction performs no IO;
// no queue claims, canonical writes, recrawl, registration or root adoption.
import {types} from 'node:util';

const BATCH=10,YIELD_MS=5,WORK_MS=250,IDLE_MS=2000,MAX=Number.MAX_SAFE_INTEGER;
const unavailable=()=>Object.assign(new Error('Stored hierarchy coordinator unavailable'),{code:'unavailable'});
const invalid=()=>{throw new TypeError('Invalid stored hierarchy coordinator');};
function fields(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function generation(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value))invalid();return value;}
function ordinal(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(value)||BigInt(value)>9223372036854775807n)invalid();return value;}
function wait(ms,signal){
 if(signal.aborted)return Promise.resolve();
 return new Promise(resolve=>{const timer=setTimeout(done,ms);timer.unref?.();
  function done(){signal.removeEventListener('abort',done);clearTimeout(timer);resolve();}signal.addEventListener('abort',done,{once:true});});
}
function create(options,pause,testComposition){
 const {resources,readGeneration}=fields(options,['resources','readGeneration']);
 if(typeof readGeneration!=='function'||typeof resources?.prepareStoredSource!=='function'||typeof resources.storedSources?.candidates!=='function'||
  typeof resources.storedSources?.reclassify!=='function')invalid();
 const matcherIdentityHash=resources.descriptor?.installed?.matcherIdentityHash;
 if(typeof matcherIdentityHash!=='string'||!/^[a-f0-9]{64}$/u.test(matcherIdentityHash))invalid();
 const controller=new AbortController(),counters={batches:0,candidates:0,prepared:0,recorded:0,reused:0,skipped:0,invalid:0,failures:0,generationChanges:0};
 let currentGeneration=null,cursor=null,started=false,closed=false,running=null,closing=null,phase='idle',lastOutcome='not-started';
 const bump=key=>{counters[key]=Math.min(MAX,counters[key]+1);};
 const active=()=>!closed;
 async function batch(){
  let next;
  try{phase='generation';next=generation(await readGeneration());}catch{if(active()){bump('failures');lastOutcome='generation-unavailable';}return IDLE_MS;}
  if(!active())return IDLE_MS;
  if(next!==currentGeneration){if(currentGeneration!==null)bump('generationChanges');currentGeneration=next;cursor=null;}
  const scope={generation:currentGeneration,matcherIdentityHash};let packet;
  try{
   phase='candidates';bump('batches');packet=fields(await resources.storedSources.candidates({...scope,afterOrdinal:cursor,limit:BATCH}),['generation','matcherIdentityHash','candidates']);
   if(!active())return IDLE_MS;
   if(packet.generation!==scope.generation||packet.matcherIdentityHash!==matcherIdentityHash||types.isProxy(packet.candidates)||!Array.isArray(packet.candidates)||
    Object.getPrototypeOf(packet.candidates)!==Array.prototype||packet.candidates.length>BATCH||Reflect.ownKeys(packet.candidates).length!==packet.candidates.length+1)invalid();
  }catch{if(active()){bump('failures');lastOutcome='candidates-unavailable';}return IDLE_MS;}
  const length=packet.candidates.length;
  for(let i=0;i<length;i++){
   if(!active())return IDLE_MS;
   let row,position;
   try{
    const d=Object.getOwnPropertyDescriptor(packet.candidates,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();row=d.value;
    if(!row||types.isProxy(row))invalid();const field=Object.getOwnPropertyDescriptor(row,'ordinal');if(!field||!Object.hasOwn(field,'value'))invalid();position=ordinal(field.value);
    if(cursor!==null&&BigInt(position)<=BigInt(cursor))invalid();
   }catch{bump('failures');lastOutcome='candidates-unavailable';return IDLE_MS;}
   bump('candidates');let prepared;
   try{phase='preparing';prepared=await resources.prepareStoredSource(row);}
   catch(error){
    if(!active())return IDLE_MS;
    if(error instanceof TypeError){bump('invalid');lastOutcome='candidate-invalid';cursor=position;phase='yielding';await pause(YIELD_MS,controller.signal);continue;}
    bump('failures');lastOutcome='preparation-unavailable';return IDLE_MS;
   }
   if(!active())return IDLE_MS;
   if(prepared===null){bump('skipped');lastOutcome='candidate-ineligible';}
   else{
    bump('prepared');
    try{
     phase='reclassifying';const results=await resources.storedSources.reclassify({...scope,items:[prepared]});
     if(!active())return IDLE_MS;
     if(!Array.isArray(results)||results.length!==1||!['recorded','reused'].includes(results[0]?.status))throw unavailable();
     bump(results[0].status);lastOutcome=results[0].status;
    }catch{if(active()){bump('failures');lastOutcome='reclassification-uncertain';}return IDLE_MS;}
   }
   cursor=position;row=null;prepared=null;phase='yielding';await pause(YIELD_MS,controller.signal);
  }
  // End-of-pass rewind revisits earlier Source versions changed since their
  // previous ordinal was scanned. SQL itself excludes already classified rows.
  if(length<BATCH)cursor=null;
  if(length===0)lastOutcome='no-candidates';return length?WORK_MS:IDLE_MS;
 }
 async function run(){
  while(active()){
   let delay=IDLE_MS;
   try{delay=await batch();}catch{if(active()){bump('failures');lastOutcome='background-unavailable';}}
   if(!active())break;phase='waiting';await pause(delay,controller.signal);
  }
  phase='closed';lastOutcome='closed';
 }
 const api=Object.freeze({
  start(){if(started||closed)throw unavailable();started=true;running=run();return api;},
  describe:()=>Object.freeze({schema:'stored-hierarchy-coordinator/v1',phase,lastOutcome,testComposition,
   limits:Object.freeze({batch:BATCH,candidateYieldMs:YIELD_MS,workPauseMs:WORK_MS,idlePauseMs:IDLE_MS}),counters:Object.freeze({...counters}),
   nativeObservation:false,productionValidated:false,assignmentAuthority:false}),
  close(){
   if(!closing){closed=true;controller.abort();closing=(async()=>{if(running)await running;phase='closed';lastOutcome='closed';})();}
   return closing;
  },
 });return api;
}
export function createStoredHierarchyCoordinator(options){if(arguments.length!==1)invalid();return create(options,wait,false);}
// Trusted cancellable-wait seam only. Candidate/preparation/SQL ports remain
// caller-owned; no fake native/encoder or canonical authority is manufactured.
export function createStoredHierarchyCoordinatorForTest(options,{wait:pause}={}){
 if(arguments.length!==2||typeof pause!=='function')invalid();return create(options,pause,true);
}
