// Phase-wide conservative origin pacing. Default inert; no default IO/clock.
import {types} from 'node:util';
const need=v=>{if(v!==true)throw new Error('Specificity pacing refused');};
const P=Promise,then=Promise.prototype.then;
const seal=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))seal(c);Object.freeze(v);}return v;};
function rec(v,keys){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length);return Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable===true&&Object.hasOwn(d,'value'));return [k,d.value];}));}
function safePromise(v){return !types.isProxy(v)&&types.isPromise(v)&&Object.getPrototypeOf(v)===P.prototype&&Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});}
function origin(v){need(typeof v==='string'&&v.length<=2048&&new URL(v).origin===v&&v.startsWith('https://'));return v;}

export function createSpecificityPacing(input){
 const a=rec(input,['origins','seed','clock','guard','sleep','parseRobots','evaluateRobots','unavailable']);
 need(Array.isArray(a.origins)&&!types.isProxy(a.origins)&&Object.getPrototypeOf(a.origins)===Array.prototype&&a.origins.length<=168&&Reflect.ownKeys(a.origins).length===a.origins.length+1);
 const origins=Array.from({length:a.origins.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(a.origins,String(i));need(d?.enumerable===true&&Object.hasOwn(d,'value'));return origin(d.value);});
 need(origins.length>0&&new Set(origins).size===origins.length&&JSON.stringify(origins)===JSON.stringify([...origins].sort()));
 for(const f of [a.clock,a.guard,a.sleep,a.parseRobots,a.evaluateRobots,a.unavailable])need(typeof f==='function'&&!types.isProxy(f));
 const delays=new Map(origins.map(o=>[o,2000])),last=new Map(),pending=new Set();let failed=false,lastNow=-Infinity,busy=false,checked=false;
 const fault=()=>{failed=true;throw new Error('Specificity pacing refused');};
 function sync(v){if(types.isProxy(v))fault();if(types.isPromise(v)){if(safePromise(v)){pending.add(v);then.call(v,()=>pending.delete(v),()=>pending.delete(v));}fault();}if(failed)fault();return v;}
 function now(){const n=sync(a.clock());need(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n>=lastNow);lastNow=n;return n;}
 function check(){let owns=false;try{need(!checked&&!failed);checked=true;owns=true;now();need(!failed);const g=sync(a.guard());need(g===true||g===undefined);now();need(!failed);return true;}catch{fault();}finally{if(owns)checked=false;}}
 async function call(fn){check();const v=fn();need(!types.isProxy(v));let out;
  if(types.isPromise(v)){need(safePromise(v));pending.add(v);out=(await new P((resolve,reject)=>then.call(v,x=>{pending.delete(v);resolve({value:x});},e=>{pending.delete(v);reject(e);}))).value;}else out=v;
  check();return out;
 }
 if(a.seed!==null){const s=rec(a.seed,['schema','originDelays','clockCarried']);need(s.schema==='native-specificity-origin-pacing/v1'&&s.clockCarried===false);
  need(Array.isArray(s.originDelays)&&!types.isProxy(s.originDelays)&&s.originDelays.length<=168);let previous='';
  for(const raw of s.originDelays){const r=rec(raw,['origin','maximumDelayMs']);origin(r.origin);need(r.origin>previous&&delays.has(r.origin));previous=r.origin;
   need(Number.isSafeInteger(r.maximumDelayMs)&&r.maximumDelayMs>=2000&&r.maximumDelayMs<=86400000);delays.set(r.origin,r.maximumDelayMs);}
  // Never compare monotonic times across processes. Charge a FULL known delay
  // from this new phase's own first clock, even if the real prior contact is old.
  check();const started=now();for(const o of origins)last.set(o,started);
 }
 async function pace(o,until){check();need(delays.has(o));const delay=Math.max(0,(last.get(o)??-Infinity)+delays.get(o)-now());
  if(now()+delay>=until)throw a.unavailable();if(delay>0)await call(()=>a.sleep(delay));check();need(now()<until);return delay;
 }
 return Object.freeze({
  closedBatch(batchOrigins){check();need(!busy&&pending.size===0&&Array.isArray(batchOrigins)&&!types.isProxy(batchOrigins)&&batchOrigins.length>0&&batchOrigins.length<=4);
   const selected=[];for(const o of batchOrigins){origin(o);need(delays.has(o)&&!selected.includes(o));selected.push(o);}check();const closedAt=now();for(const o of selected)last.set(o,closedAt);check();return true;},
  async collect(options){try{check();need(!busy);busy=true;
   const q=rec(options,['cases','browser','batch','guard','signal','fetchPublic','collect']);need(typeof q.fetchPublic==='function'&&typeof q.collect==='function'&&typeof q.guard==='function');
   function batchCheck(){check();const g=sync(q.guard());need(g===true||g===undefined);check();}
   const start=now(),until=start+60000;let additional=0;
   const fetchPublic=async(url,opts)=>{
    batchCheck();const u=new URL(url),o=u.origin;need(delays.has(o)&&((opts.resourceKind==='robots'&&u.pathname==='/robots.txt')||(opts.resourceKind==='tdmrep'&&u.pathname==='/.well-known/tdmrep.json'))&&!u.search&&!u.hash);
    await pace(o,until);batchCheck();last.set(o,now());
    const r=await call(()=>q.fetchPublic(url,{...opts,timeoutMs:Math.min(opts.timeoutMs,Math.max(1,Math.floor(until-now())))}));check();
    // Learning the delay does not grant rights. The original collector still
    // parses/validates the SAME untouched response and owns all policy decisions.
    if(opts.resourceKind==='robots'&&r!==null&&typeof r?.text==='string'&&Buffer.isBuffer(r.body)){
     let parsed;try{parsed=a.parseRobots({origin:o,text:r.text,rawBytes:r.body});}catch{/* original collector handles malformed policy */}
     if(parsed){for(const c of q.cases){if(new URL(c.url).origin!==o)continue;const policy=a.evaluateRobots(parsed.robots,c.url);need(Number.isSafeInteger(policy.crawlDelayMs)&&policy.crawlDelayMs>=0&&policy.crawlDelayMs<=86400000);delays.set(o,Math.max(delays.get(o),policy.crawlDelayMs));}}
    }
    batchCheck();return r;
   };
   const value=await call(()=>q.collect({...q,fetchPublic,clock:now,sleep:ms=>call(()=>a.sleep(ms)),guard:batchCheck}));batchCheck();
   // Policy collector's own spacing remains intact. Extra cross-batch waits
   // count against its original60s budget rather than silently extending it.
   return Object.freeze({entries:value.entries,requests:value.requests,elapsedMs:value.elapsedMs,
    async beforePage(url){try{batchCheck();await call(()=>value.beforePage(url));batchCheck();const o=new URL(url).origin;
      const remaining=60000-value.elapsedMs-value.spacingMs-additional;need(Number.isFinite(remaining)&&remaining>=0);
      const waited=await pace(o,now()+remaining);additional+=waited;batchCheck();last.set(o,now());return waited;
   }catch(e){throw e;}},get spacingMs(){return value.spacingMs+additional;}});
  }catch(e){failed=true;throw e;}finally{busy=false;}},
  snapshot(){check();need(!busy&&pending.size===0);return seal({schema:'native-specificity-origin-pacing/v1',originDelays:origins.map(o=>({origin:o,maximumDelayMs:delays.get(o)})),clockCarried:false});}
 });
}
