// Injected-only prototype: no pipe creation, process launch, filesystem or network.
import { types } from 'node:util';
import { Buffer } from 'node:buffer';

export const DEFAULT_LIMITS=Object.freeze({pending:128,messageBytes:4*1024*1024,diagnosticEvents:32,diagnosticBytes:16*1024,rpcMs:10000});
export const COMMANDS=Object.freeze({
 'block-request':'Fetch.failRequest','continue-request':'Fetch.continueRequest','continue-response':'Fetch.continueResponse',
 'fetch-enable':'Fetch.enable','navigate':'Page.navigate','frame-tree':'Page.getFrameTree','page-enable':'Page.enable',
 'lifecycle-enable':'Page.setLifecycleEventsEnabled','isolated-world':'Page.createIsolatedWorld','snapshot':'Runtime.evaluate',
 'stop-loading':'Page.stopLoading','close-browser':'Browser.close','get-version':'Browser.getVersion',
 'create-blank-target':'Target.createTarget','close-extra-target':'Target.closeTarget','auto-attach-browser':'Target.setAutoAttach',
 'resume-page':'Runtime.runIfWaitingForDebugger','enable-network':'Network.enable','disable-cache':'Network.setCacheDisabled',
 'bypass-service-worker':'Network.setBypassServiceWorker','enable-service-workers':'ServiceWorker.enable',
 'stop-service-workers':'ServiceWorker.stopAllWorkers','deny-downloads':'Browser.setDownloadBehavior',
 'dismiss-dialog':'Page.handleJavaScriptDialog','reset-permissions':'Browser.resetPermissions','empty-permissions':'Browser.grantPermissions'
});
const CATEGORIES=new Set(['pipe-ended','child-exited','write-failed','invalid-frame','invalid-code','message-cap','pending-cap','rpc-deadline','resource-abort','cdp-command-rejected']);
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const typedArrayLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
const invalid=()=>{throw new TypeError('Invalid bounded CDP prototype contract');};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=d.value;}return out;
}
function frozen(value){if(value&&typeof value==='object'){for(const x of Object.values(value))frozen(x);Object.freeze(value);}return value;}
const copyCapacity=Symbol('bounded-copy-capacity');
function spend(budget,bytes){if(bytes>budget.bytes)throw copyCapacity;budget.bytes-=bytes;}
function node(budget){if(--budget.nodes<0)throw copyCapacity;}
// Count escaped JSON UTF8 without first allocating an encoded/stringified copy.
// The UTF16 length lower bound rejects oversized strings before scanning them.
function stringBytes(value,budget){
 if(value.length+2>budget.bytes)throw copyCapacity;
 let bytes=2;
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c<32)bytes+=[8,9,10,12,13].includes(c)?2:6;
  else if(c===34||c===92)bytes+=2;
  else if(c<128)bytes++;
  else if(c<2048)bytes+=2;
  else if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))invalid();bytes+=4;}
  else if(c>=0xdc00&&c<=0xdfff)invalid();else bytes+=3;
  if(bytes>budget.bytes)throw copyCapacity;
 }
 spend(budget,bytes);
}
function jsonCopy(value,budget,depth=0,seen=new Set()){
 node(budget);
 if(value===null||typeof value==='boolean'){spend(budget,value===null?4:value?4:5);return value;}
 if(typeof value==='string'){stringBytes(value,budget);return value;}
 if(typeof value==='number'){if(!Number.isFinite(value))invalid();spend(budget,String(value).length);return value;}
 if(!value||typeof value!=='object'||types.isProxy(value)||depth>8||seen.has(value))invalid();
 seen.add(value);let out;
 if(Array.isArray(value)){
  if(Object.getPrototypeOf(value)!==Array.prototype||value.length>4096||Reflect.ownKeys(value).length!==value.length+1)invalid();
  spend(budget,2+Math.max(0,value.length-1));out=[];
  for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out.push(jsonCopy(d.value,budget,depth+1,seen));}
 }else{
  if(Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length>128)invalid();out=Object.create(null);
  spend(budget,2);let count=0;
  for(const k of Reflect.ownKeys(value)){if(typeof k!=='string'||k==='toJSON')invalid();node(budget);stringBytes(k,budget);spend(budget,1+(count++?1:0));
   const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=jsonCopy(d.value,budget,depth+1,seen);}
 }
 seen.delete(value);return out;
}
export class BoundedCdpError extends Error {
 constructor(category,stage,code,counters){
  if(!CATEGORIES.has(category)||stage!==null&&(typeof stage!=='string'||!Object.hasOwn(COMMANDS,stage))||code!==null&&(!Number.isInteger(code)||code< -2147483648||code>2147483647))invalid();
  super('Bounded CDP operation failed');this.name='BoundedCdpError';this.category=category;this.stage=stage;this.method=stage===null?null:COMMANDS[stage];this.code=code;this.counters=frozen({...counters});Object.freeze(this);
 }
}

/** All IO/time are injected. Limits can only be reduced for synthetic tests. */
export function createBoundedCdpTransport(value){
 const a=record(value,['write','clock','schedule','cancel','onDiagnostic','limits']);
 for(const f of [a.write,a.clock,a.schedule,a.cancel,a.onDiagnostic])if(typeof f!=='function')invalid();
 const limits=record(a.limits,Object.keys(DEFAULT_LIMITS));
 for(const k of Object.keys(limits))if(!Number.isInteger(limits[k])||limits[k]<1||limits[k]>DEFAULT_LIMITS[k])invalid();
 if(limits.diagnosticBytes<2)invalid();
 const entries=new Map(),denials=[],diagnostics=[];let sequence=0,buffer=new Uint8Array(limits.messageBytes),frameSize=0,ended=null,denialActive=false;
 let sent=0,received=0,completed=0,peakReserved=0,diagnosticDropped=0,diagnosticBytes=2;
 const counters=()=>frozen({reserved:entries.size,inFlight:[...entries.values()].filter(e=>e.sent).length,queuedDenials:denials.length,
  peakReserved,sent,received,completed,diagnosticDropped});
 const safeObserve=event=>{
  try{const result=a.onDiagnostic(event);if(types.isPromise(result))Promise.prototype.then.call(result,undefined,()=>{});}catch{}
 };
 function report(category,stage,code=null){
  const event=frozen({category,stage,method:stage===null?null:COMMANDS[stage],code,counters:counters()});
  const bytes=encoder.encode(JSON.stringify(event)).length+(diagnostics.length?1:0);
  if(diagnostics.length>=limits.diagnosticEvents||diagnosticBytes+bytes>limits.diagnosticBytes){diagnosticDropped++;return;}
  diagnostics.push(event);diagnosticBytes+=bytes;safeObserve(event);
 }
 function clear(e){if(e.timer!==null){try{a.cancel(e.timer);}catch{}e.timer=null;}}
 function fail(category,stage=null,code=null){
  if(ended)return ended;
  ended=new BoundedCdpError(category,stage,code,counters());report(category,stage,code);
  const doomed=[...entries.values()];entries.clear();denials.length=0;buffer=new Uint8Array(0);denialActive=false;
  for(const e of doomed){clear(e);e.reject(ended);}return ended;
 }
 function now(){const n=a.clock();if(typeof n!=='number'||!Number.isFinite(n)||n<0)invalid();return n;}
 function checkDeadline(e){if(now()>=e.until){fail('rpc-deadline',e.stage);return false;}return true;}
 function dispatch(e){
  if(ended||!entries.has(e.id)||!checkDeadline(e))return;
  e.sent=true;sent++;if(e.denial)denialActive=true;
  report('command-sent',e.stage);
  try{const result=a.write(e.wire,error=>{if(error)fail('write-failed',e.stage);});
   if(types.isPromise(result))Promise.prototype.then.call(result,undefined,()=>{fail('write-failed',e.stage);});}
  catch{fail('write-failed',e.stage);}
  // Do not retain parameters/wire after the injected write accepted the call.
  e.wire=null;
 }
 function pump(){
  if(ended||denialActive)return;
  const e=denials.shift();if(e)dispatch(e);
 }
 function request(stage,params,sessionId,denial){
  if(typeof stage!=='string'||!Object.hasOwn(COMMANDS,stage)||denial&&stage!=='block-request')invalid();
  if(sessionId!==null&&(typeof sessionId!=='string'||!sessionId.length||sessionId.length>160||!sessionId.isWellFormed()))invalid();
  const rejected=error=>{const p=Promise.reject(error);p.catch(()=>{});return p;};
  if(ended)return rejected(ended);
  if(entries.size>=limits.pending)return rejected(fail('pending-cap',stage));
  if(sequence>=Number.MAX_SAFE_INTEGER)return rejected(fail('invalid-frame',stage));
  let copied;
  try{copied=jsonCopy(params,{bytes:limits.messageBytes,nodes:Math.min(65536,limits.messageBytes)});}
  catch(error){if(error===copyCapacity)return rejected(fail('message-cap',stage));throw error;}
  if(!copied||typeof copied!=='object'||Array.isArray(copied))invalid();
  const id=++sequence,wire=JSON.stringify({id,method:COMMANDS[stage],params:copied,...(sessionId===null?{}:{sessionId})})+'\0';
  if(encoder.encode(wire).length>limits.messageBytes)return rejected(fail('message-cap',stage));
  const until=now()+limits.rpcMs;
  const promise=new Promise((resolve,reject)=>{
   const e={id,stage,sessionId,wire,denial,sent:false,until,resolve,reject,timer:null};entries.set(id,e);peakReserved=Math.max(peakReserved,entries.size);
   try{e.timer=a.schedule(()=>{if(entries.has(id))fail('rpc-deadline',stage);},limits.rpcMs);}catch{fail('resource-abort',stage);return;}
   if(ended){clear(e);return;}
   if(denial){denials.push(e);pump();}else dispatch(e);
  });
  // Internal safety observer; callers still receive rejection. No rejected
  // internal chain is left unobserved when a synchronous pipe fault occurs.
  promise.catch(()=>{});return promise;
 }
 function receive(chunk){
  if(ended)return;
  if(types.isProxy(chunk)||!types.isUint8Array(chunk)){fail('invalid-frame');return;}
  const prototype=Object.getPrototypeOf(chunk);
  if(prototype!==Uint8Array.prototype&&prototype!==Buffer.prototype){fail('invalid-frame');return;}
  // Own extensions (including byteLength/iterator) are intentionally ignored.
  // Genuine typed-array integer indices cannot be replaced by accessors.
  const length=typedArrayLength.call(chunk);
  if(length>limits.messageBytes){fail('message-cap');return;}
  for(let offset=0;offset<length;offset++){
   const byte=chunk[offset];
   if(byte!==0){if(frameSize>=limits.messageBytes){fail('message-cap');return;}buffer[frameSize++]=byte;continue;}
   let message;try{message=JSON.parse(decoder.decode(buffer.subarray(0,frameSize)));}catch{fail('invalid-frame');return;}
   buffer.fill(0,0,frameSize);frameSize=0;received++;
   if(!message||typeof message!=='object'||Array.isArray(message)||!Number.isSafeInteger(message.id)||message.id<1){fail('invalid-frame');return;}
   const e=entries.get(message.id);if(!e)continue;
   if(!e.sent){fail('invalid-frame',e.stage);return;}
   if(e.sessionId===null?Object.hasOwn(message,'sessionId'):message.sessionId!==e.sessionId){fail('invalid-frame',e.stage);return;}
   if(!checkDeadline(e))return;
   if(Object.hasOwn(message,'error')){
    const code=message.error?.code;
    if(!Number.isInteger(code)||code< -2147483648||code>2147483647){fail('invalid-code',e.stage);return;}
    fail('cdp-command-rejected',e.stage,code);return;
   }
   if(!Object.hasOwn(message,'result')){fail('invalid-frame',e.stage);return;}
   entries.delete(e.id);clear(e);completed++;if(e.denial)denialActive=false;report('command-complete',e.stage);e.resolve(message.result);pump();
  }
 }
 return Object.freeze({
  send:(stage,params={},sessionId=null)=>{if(stage==='block-request')invalid();return request(stage,params,sessionId,false);},
  deny:(requestId,sessionId=null)=>{
   if(typeof requestId!=='string'||!requestId.length||requestId.length>160||!requestId.isWellFormed())invalid();
   return request('block-request',{requestId,errorReason:'BlockedByClient'},sessionId,true);
  },receive,
  pipeEnded:()=>fail('pipe-ended'),childExited:()=>fail('child-exited'),abort:()=>fail('resource-abort'),
  inspect:()=>frozen({ended:ended?.category??null,counters:counters(),diagnostics:[...diagnostics],diagnosticBytes,
   experimental:true,productionValidated:false,assignmentAuthority:false})
 });
}
