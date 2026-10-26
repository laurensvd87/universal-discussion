// Sole pre-handshake adapter exception: builtin-only and inert until start().
import {types} from 'node:util';

export const PIPE_HANDSHAKE='NATIVE_SPECIFICITY_OWN_JOB_ASSIGNED_V1\n';
export const PIPE_LIMITS=Object.freeze({frameBytes:16384,queuedFrames:8,queuedBytes:131072,wireBytes:67108864});
const P=Promise,then=Promise.prototype.then;
const byteLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
class ChannelError extends Error{constructor(){super('Specificity pipe channel refused');this.code='SPECIFICITY_PIPE';}}
function need(v){if(v!==true)throw new ChannelError();}
function record(v,keys){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null));
 need(Reflect.ownKeys(v).length===keys.length);return Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable===true&&Object.hasOwn(d,'value'));return [k,d.value];}));}
function method(object,key){need(object!==null&&typeof object==='object'&&!types.isProxy(object));let at=object;
 for(let depth=0;depth<12&&at!==null;depth++,at=Object.getPrototypeOf(at)){need(!types.isProxy(at));const d=Object.getOwnPropertyDescriptor(at,key);if(d){need(Object.hasOwn(d,'value')&&typeof d.value==='function'&&!types.isProxy(d.value));return (...args)=>Reflect.apply(d.value,object,args);}}throw new ChannelError();}
function size(v,max){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Buffer.isBuffer(v)&&Object.getPrototypeOf(v)===Buffer.prototype);
 const n=Reflect.apply(byteLength,v,[]);need(Number.isSafeInteger(n)&&n>0&&n<=max);return n;}
function copy(v,n){const out=Buffer.alloc(n);for(let i=0;i<n;i++)out[i]=v[i];return out;}
function safePromise(v){if(types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==P.prototype)return false;
 return Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});}
function deferred(){let resolve,reject;const promise=new P((yes,no)=>{resolve=yes;reject=no;});then.call(promise,()=>undefined,()=>undefined);
 const d={promise,settled:false,resolve(v){if(!d.settled){d.settled=true;resolve(v);}},reject(e){if(!d.settled){d.settled=true;reject(e);}}};return d;}

/** Only trusted Root supplies its ORIGINAL streams and absolute guard/clock.
 * No default stream, clock, timer, listener or action is installed here. */
export function createOwnedSpecificityPipeChannel(config){
 const a=record(config,['input','output','guard','clock','deadline']);need(a.input!==a.output);
 for(const f of [a.guard,a.clock])need(typeof f==='function'&&!types.isProxy(f));need(typeof a.deadline==='number'&&Number.isFinite(a.deadline)&&a.deadline>=0);
 const inputOn=method(a.input,'on'),outputOn=method(a.output,'on'),outputWrite=method(a.output,'write');
 let started=false,finished=false,failed=false,fault=null,firstFailure=null,checkDepth=0,lastNow=-Infinity;
 let inputEnded=false,inputClosed=false,outputClosed=false,listeners=0,dataListenerInstalled=false,unsafeOperationRefused=false;
 let handshakeBytes=0,handshaken=false,handshakeWaiter=null,handshakeWaitClaimed=false;
 let slab=null,used=0,response=null,queuedBytes=0,readWaiter=null,exchange=null;
 let wireBytes=0,maximumFrameBytes=0,maximumQueuedFrames=0,maximumQueuedBytes=0,exchanges=0,writeCallbacks=0,readFrames=0;
 let discardedAfterFailure=false;const pending=new Set();
 function poison(code='state'){
  if(!failed){failed=true;fault=new ChannelError();firstFailure=code;}
  if(slab)for(let i=0;i<slab.length;i++)slab[i]=0;used=0;response=null;queuedBytes=0;
  handshakeWaiter?.reject(fault);readWaiter?.reject(fault);exchange?.writeWaiter.reject(fault);return fault;
 }
 function track(original){if(!safePromise(original)){unsafeOperationRefused=true;throw poison('unsafe');}pending.add(original);
  return new P((resolve,reject)=>then.call(original,v=>{pending.delete(original);resolve({value:v});},e=>{pending.delete(original);reject(e);}));}
 function sync(value){if(types.isProxy(value)){unsafeOperationRefused=true;throw poison('unsafe');}if(types.isPromise(value)){const p=track(value);then.call(p,()=>undefined,()=>undefined);throw poison('async');}return value;}
 function now(){const n=sync(a.clock());need(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n>=lastNow);lastNow=n;need(n<a.deadline);return n;}
 function check(){let owned=false;try{need(checkDepth===0);checkDepth++;owned=true;if(failed)throw fault;now();if(failed)throw fault;const g=sync(a.guard());if(failed)throw fault;need(g===true||g===undefined);now();if(failed)throw fault;}catch{throw poison('guard');}finally{if(owned)checkDepth--;}}
 function connected(){need(started&&!inputEnded&&!inputClosed&&!outputClosed);}
 function live(){connected();need(!finished);}
 function count(n){need(Number.isSafeInteger(n)&&n>0&&n<=PIPE_LIMITS.wireBytes-wireBytes);wireBytes+=n;}
 function release(e){if(exchange===e&&!e.physicalWritePending&&e.responseConsumed)exchange=null;}
 function deliver(){
  if(!readWaiter||response===null)return;
  const d=readWaiter,e=exchange,frame=response;check();live();need(e!==null&&e.responseSeen&&!e.responseConsumed);
  const out=copy(frame,frame.length);check();live();need(readWaiter===d&&response===frame&&exchange===e&&!failed);
  response=null;queuedBytes=0;readWaiter=null;e.responseConsumed=true;readFrames++;release(e);d.resolve(out);
 }
 function receive(raw){
  if(failed){discardedAfterFailure=true;return;}
  try{check();live();const n=size(raw,PIPE_LIMITS.queuedBytes);count(n);
   for(let i=0;i<n;i++){
    const value=raw[i];
    if(!handshaken){need(handshakeBytes<PIPE_HANDSHAKE.length&&value===PIPE_HANDSHAKE.charCodeAt(handshakeBytes));handshakeBytes++;
     if(handshakeBytes===PIPE_HANDSHAKE.length){handshaken=true;maximumFrameBytes=Math.max(maximumFrameBytes,handshakeBytes);}continue;}
    need(exchange!==null&&!exchange.responseSeen);need(used<PIPE_LIMITS.frameBytes);slab[used++]=value;maximumFrameBytes=Math.max(maximumFrameBytes,used);
    if(value===10){need(used>2&&slab[0]===123&&slab[used-2]===125&&response===null);need(queuedBytes+used<=PIPE_LIMITS.queuedBytes&&1<=PIPE_LIMITS.queuedFrames);
     response=copy(slab,used);queuedBytes=used;exchange.responseSeen=true;maximumQueuedFrames=Math.max(maximumQueuedFrames,1);maximumQueuedBytes=Math.max(maximumQueuedBytes,queuedBytes);for(let j=0;j<used;j++)slab[j]=0;used=0;}
   }
   check();live();if(handshaken&&handshakeWaiter){const d=handshakeWaiter;handshakeWaiter=null;d.resolve(true);}deliver();
  }catch{poison('input');}
 }
 function inputEnd(){inputEnded=true;poison(used>0||!handshaken?'truncated':'eof');}
 function inputClose(){inputClosed=true;poison('input-close');}
 function outputClose(){outputClosed=true;poison('output-close');}
 function streamError(){poison('stream-error');}
 return Object.freeze({
  start(){try{need(!started&&!finished);started=true;check();slab=Buffer.alloc(PIPE_LIMITS.frameBytes);
   for(const [on,stream,event,handler]of [[inputOn,a.input,'error',streamError],[inputOn,a.input,'end',inputEnd],[inputOn,a.input,'close',inputClose],
    [outputOn,a.output,'error',streamError],[outputOn,a.output,'close',outputClose],[inputOn,a.input,'data',receive]]){
    check();live();const r=sync(on(event,handler));need(r===stream);listeners++;if(stream===a.input&&event==='data')dataListenerInstalled=true;check();live();}
   check();live();return true;
  }catch{throw poison('start');}},
  waitHandshake(){try{check();live();need(!handshakeWaitClaimed);handshakeWaitClaimed=true;
   const d=deferred();if(handshaken){check();live();d.resolve(true);}else handshakeWaiter=d;return d.promise;
  }catch{throw poison('handshake');}},
  write(frame){let e;
   try{check();live();need(handshaken&&exchange===null&&response===null&&readWaiter===null&&used===0);
    const n=size(frame,PIPE_LIMITS.frameBytes);need(n>2&&frame[0]===123&&frame[n-2]===125&&frame[n-1]===10);for(let i=0;i<n-1;i++)need(frame[i]!==10);
    need(n<=PIPE_LIMITS.wireBytes-wireBytes);const bytes=copy(frame,n),d=deferred();
    e={writeWaiter:d,physicalWritePending:false,dispatched:false,callbackSeen:false,responseSeen:false,responseConsumed:false};exchange=e;exchanges++;maximumFrameBytes=Math.max(maximumFrameBytes,n);
    check();live();need(exchange===e&&!failed);count(n);e.dispatched=true;e.physicalWritePending=true;
    const result=outputWrite(bytes,(...args)=>{
     if(e.callbackSeen){poison('duplicate-callback');return;}
     e.callbackSeen=true;e.physicalWritePending=false;writeCallbacks++;
     try{need(args.length<=1&&(args.length===0||args[0]===null||args[0]===undefined));check();live();need(exchange===e&&!failed);release(e);d.resolve(true);}
     catch{d.reject(poison('write-callback'));}
    });
    const returned=sync(result);need(returned===true||returned===false);check();live();if(failed)throw fault;return d.promise;
   }catch{const error=poison('write');e?.writeWaiter.reject(error);throw error;}
  },
  readChunk(){try{check();live();need(handshaken&&exchange!==null&&!exchange.responseConsumed&&readWaiter===null);const d=deferred();readWaiter=d;deliver();check();live();if(failed)throw fault;return d.promise;
  }catch{throw poison('read');}},
  assertHealthy(){check();connected();return true;},
  finish(){try{check();live();need(handshaken&&handshakeWaiter===null&&exchange===null&&readWaiter===null&&response===null&&used===0&&pending.size===0&&!unsafeOperationRefused);
   check();live();need(exchange===null&&readWaiter===null&&response===null&&used===0&&pending.size===0);finished=true;
   return Object.freeze({finished:true,listenersRetained:true,physicalPipeClosureProved:false});
  }catch{throw poison('finish');}},
  snapshot(){return Object.freeze({started,finished,failed,firstFailure,handshaken,handshakeBytes,listenersInstalled:listeners===6,ownedListeners:listeners,
   inputEnded,inputClosed,outputClosed,inputMonitoring:dataListenerInstalled&&!inputEnded&&!inputClosed,pipeClosureProved:false,readWaiterPending:readWaiter!==null&&!readWaiter.settled,physicalWritePending:exchange?.physicalWritePending===true,
   responseOutstanding:exchange!==null&&!exchange.responseSeen&&!inputEnded&&!inputClosed,
   physicalExchangePending:exchange!==null&&(exchange.physicalWritePending||!exchange.responseSeen&&!inputEnded&&!inputClosed),exchangeReserved:exchange!==null,pendingOriginals:pending.size,unsafeOperationRefused,partialFrameBytes:used,queuedFrames:response===null?0:1,queuedBytes,
   exchanges,writeCallbacks,readFrames,combinedWireBytes:wireBytes,maximumFrameBytes,maximumQueuedFrames,maximumQueuedBytes,discardedAfterFailure,rawFramesRetained:false});}
 });
}
