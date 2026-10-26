// Default inert. Only an explicitly invoked, supervised driver may perform DNS.
import {Resolver} from 'node:dns/promises';
import {types} from 'node:util';
import {NATIVE_DNS_HOSTS,selectNativeDnsPin,compileNativeDnsPins,describeNativeDnsPins} from './network-policy.js';

export class NativeDnsError extends Error{constructor(code){super('Native study DNS unavailable');this.name='NativeDnsError';this.code=code;}}
const MISSING=new Set(['ENODATA','ENOTFOUND']),UNAVAILABLE=new Set(['ETIMEOUT','ESERVFAIL','EREFUSED','EAI_AGAIN','ECONNREFUSED']);
const error=code=>new NativeDnsError(code);
function fn(v){if(typeof v!=='function'||types.isProxy(v))throw error('contract');return v;}
function dataErrorCode(e){
 if(!e||typeof e!=='object'||types.isProxy(e)||!types.isNativeError(e))return null;
 const d=Object.getOwnPropertyDescriptor(e,'code');return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'?d.value:null;
}
function addresses(v,family){
 if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>32||Reflect.ownKeys(v).length!==v.length+1)throw error('dns-contract');
 return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));
  if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')throw error('dns-contract');return {address:d.value,family};});
}

/** Four OWNED resolvers, two native queries each. No Promise.race releases a
 * physical slot. Timers cancel owned queries; their actual settlement is awaited.
 * Unknown failures/abort win over availability. No caller data controls hosts.
 */
export async function resolveNativeStudyDns({createResolver=()=>new Resolver({timeout:5000,tries:1}),
 clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,guard=()=>{},signal,onProgress=()=>{}}={}){
 for(const f of [createResolver,clock,schedule,cancel,guard,onProgress])fn(f);
 const started=clock();if(!Number.isFinite(started)||started<0)throw error('contract');
 const deadline=started+30000,rows=Array(34).fill(null),active=new Set();
 let next=0,physical=0,peakPhysical=0,peakHosts=0,cancelled=0,setupExpired=false,fatal=null,attempted=0;
 const now=()=>{const n=clock();if(!Number.isFinite(n)||n<started)throw error('clock-contract');return n;};
 function cancelOwned(state,reason){
  if(state.cancelReason!==null)return;state.cancelReason=reason;cancelled++;
  try{state.resolver.cancel();}catch{fatal??=error('owned-cancel-failed');}
 }
 function stop(code){fatal??=error(code);for(const state of active)cancelOwned(state,'fatal');}
 function check(){
  if(fatal)throw fatal;if(signal?.aborted){stop('aborted');throw fatal;}
  try{guard();}catch{stop('driver-guard-failed');throw fatal;}
  if(now()>=deadline&&!setupExpired){setupExpired=true;for(const state of active)cancelOwned(state,'setup-deadline');}
 }
 const onAbort=()=>stop('aborted');signal?.addEventListener('abort',onAbort,{once:true});
 let setupTimer;
 try{
  check();setupTimer=schedule(()=>{setupExpired=true;for(const state of active)cancelOwned(state,'setup-deadline');},Math.max(1,deadline-now()));
  async function worker(){
   while(true){
    check();if(setupExpired||next>=34)return;
    const ordinal=next++,host=NATIVE_DNS_HOSTS[ordinal];attempted++;
    const state={resolver:null,cancelReason:null,timer:undefined};
    try{
     state.resolver=createResolver();
     if(!state.resolver||typeof state.resolver!=='object'||types.isProxy(state.resolver)||
      !['resolve4','resolve6','cancel'].every(k=>typeof state.resolver[k]==='function'))throw error('resolver-contract');
     active.add(state);peakHosts=Math.max(peakHosts,active.size);if(active.size>4)throw error('host-capacity');
     state.timer=schedule(()=>cancelOwned(state,'query-deadline'),Math.max(1,Math.min(5000,deadline-now())));
     function query(method,family){
      if(physical>=8){stop('query-capacity');throw fatal;}physical++;peakPhysical=Math.max(peakPhysical,physical);
      let p;try{p=state.resolver[method](host,{ttl:false});}catch(e){p=Promise.reject(e);}
      return Promise.resolve(p).then(value=>({status:'fulfilled',family,value}),reason=>{
       const code=dataErrorCode(reason);
       if(!MISSING.has(code)&&!UNAVAILABLE.has(code)&&!(code==='ECANCELLED'&&state.cancelReason!==null))stop('unexpected-dns-error');
       return {status:'rejected',family,code};
      }).finally(()=>{physical--;});
     }
     const results=await Promise.all([query('resolve4',4),query('resolve6',6)]);check();
     // A refusal or elapsed lease may prevent publication, but must never hide
     // a fulfilled private/malformed answer from either family.
     let observedAnswers=[];
     for(const r of results)if(r.status==='fulfilled')observedAnswers.push(...addresses(r.value,r.family));
     if(observedAnswers.length)selectNativeDnsPin({host,answers:observedAnswers});
     let answers=[];
     if(state.cancelReason===null&&!setupExpired){
      const refusal=results.some(r=>r.status==='rejected'&&!MISSING.has(r.code));
      if(!refusal){
       answers=observedAnswers;
      }
      if(refusal)answers=[];
     }
     rows[ordinal]={host,status:answers.length?'pinned':'unavailable',answers};
     onProgress(Object.freeze({attempted,settled:rows.filter(Boolean).length,physicalQueries:physical}));
    }catch(e){stop(e instanceof NativeDnsError?e.code:'dns-validation-failed');}
    finally{
     try{if(state.timer!==undefined)cancel(state.timer);}catch{stop('timer-cancel-failed');}
     finally{active.delete(state);}
    }
    if(fatal)throw fatal;
   }
  }
  // Attach all rejection observers immediately. On fatal each worker is still
  // observed until its own cancelled native queries actually settle.
  const workers=await Promise.allSettled(Array.from({length:4},()=>worker().catch(e=>{
   // Covers the entire worker, including top-of-loop guards and cleanup, not
   // only the per-host try. Cancellation still waits for actual native promises.
   stop(e instanceof NativeDnsError?e.code:'dns-worker-failed');throw fatal;
  })));
  if(workers.some(w=>w.status==='rejected'))stop('dns-worker-failed');
  check();if(fatal)throw fatal;if(physical!==0||active.size!==0)throw error('unsettled-owned-dns');
  for(let i=0;i<34;i++)if(rows[i]===null)rows[i]={host:NATIVE_DNS_HOSTS[i],status:'unavailable',answers:[]};
  const dnsPins=compileNativeDnsPins({rows}),description=describeNativeDnsPins(dnsPins);
  const summary=Object.freeze({schema:'native-owned-dns-resolution/v1',attemptedHosts:attempted,unattemptedHosts:34-attempted,
   pinnedHosts:description.pinned,unavailableHosts:34-description.pinned,setupExpired,elapsedMilliseconds:now()-started,
   peakConcurrentHosts:peakHosts,peakPhysicalQueries:peakPhysical,physicalQueries:physical,ownedResolversCancelled:cancelled,
   allOwnedQueriesSettled:true,noAddressRetry:true,source:'owned-A-and-AAAA-resolvers-not-system-DNS-mutation'});
  for(const row of rows)row.answers.length=0;
  return Object.freeze({dnsPins,summary});
 }finally{
  try{if(setupTimer!==undefined)cancel(setupTimer);}catch{stop('timer-cancel-failed');}
  signal?.removeEventListener('abort',onAbort);
  if(active.size){for(const state of active)cancelOwned(state,'final-cleanup');}
  if(fatal)throw fatal;
 }
}
