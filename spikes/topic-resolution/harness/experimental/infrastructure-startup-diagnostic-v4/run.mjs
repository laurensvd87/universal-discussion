// ADR204 default inert; the sole pre-handshake private import is builtin-only.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {ChildProcess} from 'node:child_process';
import {createOwnedSpecificityPipeChannel} from '../native-specificity-study-v13/pipe-channel.mjs';

export const ACTUAL_RELEASE='adr204-reviewed-startup/v1';
export const OWN='spikes/topic-resolution/harness/experimental/infrastructure-startup-diagnostic-v4/';
export const PROFILES=Object.freeze(['profile-01']);
export const BOOTSTRAP_STAGES=Object.freeze(['configuration','held-handshake','bootstrap-read','ready','source-authentication','package-directories','runtime-import','profiles','pipe-finish']);
const NativePromise=Promise,nativeThen=Promise.prototype.then;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value),'utf8');
const digest=value=>sha(encode(value));
const HASH=/^[a-f0-9]{64}$/u;
export class DiagnosticError extends Error{constructor(code='contract'){super('Startup diagnostic refused');this.code=code;}}
const need=(value,code='contract')=>{if(value!==true)throw new DiagnosticError(code);};
function exact(value,keys){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 need(Reflect.ownKeys(value).length===keys.length);const out={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable===true&&Object.hasOwn(d,'value'));out[key]=d.value;}return out;
}
export function validateNativeReadResult(value,buffer,maximum){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value));
 const prototype=Object.getPrototypeOf(value);need(prototype===null||prototype===Object.prototype);
 need(Reflect.ownKeys(value).length===2);const fields={};
 for(const key of ['bytesRead','buffer']){
  const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable===true&&Object.hasOwn(d,'value'));fields[key]=d.value;
 }
 count(fields.bytesRead,maximum);need(fields.buffer===buffer);return fields;
}
export function createBootstrapProgress(){
 let stage='configuration';
 return Object.freeze({enter(value){need(typeof value==='string'&&BOOTSTRAP_STAGES.includes(value));stage=value;},
  refusal(){return Object.freeze({schema:'startup-bootstrap-refusal/v1',stage,code:'refused'});}});
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function promise(value){return !types.isProxy(value)&&types.isPromise(value)&&Object.getPrototypeOf(value)===NativePromise.prototype&&
 Reflect.ownKeys(value).every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return key!=='constructor'&&key!=='then'&&d&&Object.hasOwn(d,'value');});}
const SPAWN_CHANNELS=Object.freeze(['tracing:child_process.spawn:start','tracing:child_process.spawn:end','tracing:child_process.spawn:error']);
const LAUNCH_CODES=Object.freeze(['EACCES','EPERM','ENOENT','EAGAIN','EMFILE','ENFILE','ENOMEM','EINVAL','ENOSYS','UNKNOWN']);
export function requireStartupRuntime(platform,version){need(platform==='win32'&&version==='v24.19.0');}
export function startupRetainedBytes(entries){count(entries,4096);return 320+256+4*2304+entries*160;}
export function assertStartupRetained(entries){need(startupRetainedBytes(entries)<=32768,'retained-capacity');}
function launchCode(error){
 if(error===null||typeof error!=='object'||types.isProxy(error)||!types.isNativeError(error))return 'unclassified';
 const d=Object.getOwnPropertyDescriptor(error,'code');
 return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&LAUNCH_CODES.includes(d.value)?d.value:'unclassified';
}
export function validateLaunchWitness(value){
 const w=exact(value,['schema','spawn','spawnCode','launchCode']);need(w.schema==='native-browser-launch-witness/v1');
 need(['start-not-observed','start-observed','spawn-error-observed','spawn-return-observed','unavailable'].includes(w.spawn));
 need(w.spawn==='unavailable'?w.spawnCode==='unavailable':w.spawn==='spawn-error-observed'?
  [...LAUNCH_CODES,'unclassified'].includes(w.spawnCode):w.spawnCode==='none');
 need([...LAUNCH_CODES,'unclassified','unavailable'].includes(w.launchCode));return freeze(w);
}
/** Passive public-channel observations, never OS identity or launch authority.
 * Channels are publicly publishable; nominal ChildProcess objects can be forged.
 * No process event listener, options traversal, message parsing or PID read. */
export function createBrowserLaunchObserver({executablePath,channels={subscribe,unsubscribe},childPrototype=ChildProcess.prototype}){
 let active=false,token=null,child=null,notifications=0,attempted=0,closed=false,used=false,released=false;
 let spawn='start-not-observed',spawnCode='none',associated=false,rejectedValue,snapshot=null;
 function unavailable(){spawn='unavailable';spawnCode='unavailable';}
 function close(){
  if(closed)return;closed=true;active=false;child=null;token=null;
  for(let i=0;i<attempted;i++)try{if(channels.unsubscribe(SPAWN_CHANNELS[i],callbacks[i])!==true)unavailable();}catch{unavailable();}
 }
 function invalidate(){unavailable();close();}
 function notification(kind,message){
  if(!active||token===null)return;
  try{
   if(++notifications>16){invalidate();return;}
   const process=own(message,'process');
   if(process===null||typeof process!=='object'||types.isProxy(process)){invalidate();return;}
   if(Object.getPrototypeOf(process)!==childPrototype){invalidate();return;}
   const file=own(process,'spawnfile');if(typeof file!=='string'){invalidate();return;}
   if(file!==executablePath){if(process===child)invalidate();return;}
   if(kind===0){
    if(child!==null||spawn!=='start-not-observed'){invalidate();return;}
    child=process;spawn='start-observed';return;
   }
   if(process!==child||spawn!=='start-observed'){invalidate();return;}
   if(kind===1){spawn='spawn-return-observed';return;}
   const error=own(message,'error');
   if(error===null||typeof error!=='object'||types.isProxy(error)||!types.isNativeError(error)){invalidate();return;}
   spawnCode=launchCode(error);spawn='spawn-error-observed';
  }catch{invalidate();}
 }
 const callbacks=[message=>{try{notification(0,message);}catch{invalidate();}},
  message=>{try{notification(1,message);}catch{invalidate();}},message=>{try{notification(2,message);}catch{invalidate();}}];
 function bind(error){
  if(released)return;
  associated=true;rejectedValue=error;let code='unavailable';
  try{code=launchCode(error);}catch{unavailable();}
  close();snapshot=freeze({schema:'native-browser-launch-witness/v1',spawn,spawnCode,launchCode:code});
 }
 return Object.freeze({
  run(action){
   need(!used&&!released);used=true;active=true;token={};
   for(let i=0;i<3&&active;i++)try{attempted=i+1;channels.subscribe(SPAWN_CHANNELS[i],callbacks[i]);}catch{invalidate();}
   let raw;try{raw=action();}catch(error){try{bind(error);}catch{invalidate();}throw error;}
   try{
    if(!promise(raw)){close();return raw;}
    nativeThen.call(raw,()=>{try{close();associated=false;rejectedValue=undefined;snapshot=null;}catch{invalidate();}return undefined;},
     error=>{try{bind(error);}catch{invalidate();}return undefined;});
   }catch{invalidate();}
   return raw;
  },
  take(error){if(released||!associated||!Object.is(error,rejectedValue))return null;const value=snapshot;associated=false;rejectedValue=undefined;snapshot=null;return value;},
  release(){released=true;close();associated=false;rejectedValue=undefined;snapshot=null;}
 });
}
function parse(bytes,maximum=524288){need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=maximum);const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));need(encode(value).equals(bytes),'canonical-json');return value;}
function hash(value){need(typeof value==='string'&&HASH.test(value));return value;}
function own(value,key){need(value!==null&&typeof value==='object'&&!types.isProxy(value));const d=Object.getOwnPropertyDescriptor(value,key);need(d&&Object.hasOwn(d,'value'));return d.value;}
function call(value,key,...args){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value));let at=value;
 for(let i=0;i<32&&at!==null;i++,at=Object.getPrototypeOf(at)){
  need(!types.isProxy(at));const d=Object.getOwnPropertyDescriptor(at,key);
  if(d){need(Object.hasOwn(d,'value')&&typeof d.value==='function'&&!types.isProxy(d.value));return Reflect.apply(d.value,value,args);}
 }throw new DiagnosticError('contract');
}
async function original(action,guard,retain=null){guard();const p=action();need(promise(p));const value=await p;if(retain)retain(value);guard();return value;}
export async function boundedReadFile(fs,path,expectedSize,maximum,guard){
 count(expectedSize,maximum,1);let handle=null,trusted=false;
 try{
  handle=await original(()=>call(fs,'open',path,'r'),guard,value=>{handle=value;trusted=value!==null&&typeof value==='object'&&!types.isProxy(value);need(trusted);});
  const initial=await original(()=>call(handle,'stat'),guard);need(own(initial,'size')===expectedSize,'contract');
  const buffer=Buffer.alloc(expectedSize+1);let offset=0,ended=false;
  while(offset<buffer.length){
   const result=validateNativeReadResult(await original(()=>call(handle,'read',buffer,offset,buffer.length-offset,offset),guard),buffer,buffer.length-offset);
   if(result.bytesRead===0){ended=true;break;}offset+=result.bytesRead;need(offset<=expectedSize,'contract');
  }
  need(ended&&offset===expectedSize,'contract');const final=await original(()=>call(handle,'stat'),guard);need(own(final,'size')===expectedSize,'contract');
  return buffer.subarray(0,expectedSize);
 }finally{if(trusted){const closing=call(handle,'close');need(promise(closing));await closing;}}
}
export async function boundedReadDirectory(fs,path,expected,guard){
 need(!types.isProxy(expected)&&Array.isArray(expected)&&expected.length<=128);let handle=null,trusted=false;
 try{
  handle=await original(()=>call(fs,'opendir',path),guard,value=>{handle=value;trusted=value!==null&&typeof value==='object'&&!types.isProxy(value);need(trusted);});
  const names=[];
  for(let i=0;i<=expected.length;i++){
   const item=await original(()=>call(handle,'read'),guard);
   if(item===null){need(i===expected.length);need(JSON.stringify(names.sort())===JSON.stringify([...expected].sort()));return names;}
   const name=own(item,'name');need(typeof name==='string'&&name.length<=256);names.push(name);
  }
  throw new DiagnosticError('contract');
 }finally{if(trusted){const closing=call(handle,'close');need(promise(closing));await closing;}}
}
function count(value,max=65536,min=0){need(typeof value==='number'&&Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max);return value;}
export function validateAckPayload(kind,payload,request,config){
 if(kind==='FS_BEFORE'||kind==='FS_AFTER'){
  const a=exact(payload,['ticket','proof']);count(a.ticket,65536,1);
  need(a.ticket===(kind==='FS_BEFORE'?request.sequence:request.payload.ticket));
  const p=exact(a.proof,['pathKey','ancestorsChecked','openedIdentityChecked','attributes','identity','atomic']);
  need(p.pathKey===request.payload.pathKey&&p.ancestorsChecked===true&&p.openedIdentityChecked===true&&p.atomic===false);
  count(p.attributes,0xffffffff);need((p.attributes&0x400)===0);
  const i=exact(p.identity,['volumeSerial','fileIndex','creationFiletime','size','fileType']);
  for(const key of ['volumeSerial','fileIndex','creationFiletime','size'])need(typeof i[key]==='string'&&/^(?:0|[1-9][0-9]{0,19})$/u.test(i[key])&&BigInt(i[key])<=(key==='volumeSerial'?0xffffffffn:0xffffffffffffffffn));
  need(i.creationFiletime!=='0'&&['file','directory'].includes(i.fileType));
 }else if(kind==='READY'){
  const a=exact(payload,['schema','baseline']);need(a.schema==='startup-baseline-ack/v1');
  const b=exact(a.baseline,['schema','node','console','baselineHash']);need(b.schema==='native-console-baseline/v1');
  for(const value of [b.node,...(b.console===null?[]:[b.console])]){
   const i=exact(value,['pid','creationFiletime','imagePathSha256','imagePathHashEncoding']);count(i.pid,0xffffffff,1);
   need(typeof i.creationFiletime==='string'&&/^[1-9][0-9]{0,19}$/u.test(i.creationFiletime));hash(i.imagePathSha256);
   need(i.imagePathHashEncoding==='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1');
  }
  need(b.node.pid===config.nodePid&&b.node.creationFiletime===request.payload.creationFiletime);
  need(digest({schema:b.schema,node:b.node,console:b.console})===b.baselineHash);
 }else if(kind==='PROFILE_BEGIN'){
  const a=exact(payload,['schema','profileIndex']);need(a.schema==='startup-profile-begin-ack/v1');count(a.profileIndex,3,1);need(a.profileIndex===request.payload.profileIndex);
 }else if(kind==='PROFILE_DRAIN'||kind==='FAILED_PROFILE_DRAIN'){
  const a=exact(payload,['schema','profileIndex','resultHash']);need(a.schema===(kind==='PROFILE_DRAIN'?'startup-profile-drain-ack/v1':'startup-failed-drain-ack/v1'));
  count(a.profileIndex,3,1);need(a.profileIndex===request.payload.profileIndex&&a.resultHash===request.payload.resultHash);
 }else if(kind==='STARTUP_FAULT'){
  const a=exact(payload,['schema','firstFaultHash']);need(a.schema==='startup-fault-evidence-ack/v1'&&a.firstFaultHash===request.payload.firstFaultHash);
 }else{
  need(kind==='COMPLETE'||kind==='FAILED_COMPLETE');const a=exact(payload,['schema','status','resultHash']);
  need(a.schema==='startup-exit-ack/v1'&&a.status===(kind==='COMPLETE'?'healthy':'failed')&&a.resultHash===request.payload.resultHash);
 }
 return true;
}
function finiteCode(error,startupErrorPrototype){
 if(error===null||typeof error!=='object'||types.isProxy(error)||!types.isNativeError(error))return 'client-failure';
 const prototype=Object.getPrototypeOf(error);if(prototype!==DiagnosticError.prototype&&prototype!==startupErrorPrototype)return 'client-failure';
 const d=Object.getOwnPropertyDescriptor(error,'code');if(!d||!Object.hasOwn(d,'value'))return 'client-failure';
 return ['contract','deadline','physical-unsettled','client-failure','unexpected-page','unexpected-worker','unexpected-navigation','unexpected-page-event','unexpected-disconnect','blank-anchor','browser-handle','event-capacity','retained-capacity','infrastructure-contract','infrastructure-identity','infrastructure-lifecycle','infrastructure-census','anchor-contract'].includes(d.value)?d.value:'client-failure';
}
export function childConfiguration(argv,env,platform){
 need(platform==='win32');need(Array.isArray(argv)&&argv.length===1&&argv[0]==='--owned-startup');
 const keys=['MURMINGLE_STARTUP_SUPERVISED','MURMINGLE_STARTUP_SOURCE_IDENTITY','MURMINGLE_STARTUP_SOURCE_PATHS','MURMINGLE_STARTUP_WALL_MILLISECONDS'];
 const a={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(env,key);need(d&&Object.hasOwn(d,'value'));a[key]=d.value;}
 need(a.MURMINGLE_STARTUP_SUPERVISED==='1');hash(a.MURMINGLE_STARTUP_SOURCE_IDENTITY);hash(a.MURMINGLE_STARTUP_SOURCE_PATHS);
 need(typeof a.MURMINGLE_STARTUP_WALL_MILLISECONDS==='string'&&/^[1-9][0-9]{0,6}$/u.test(a.MURMINGLE_STARTUP_WALL_MILLISECONDS));
 const wall=Number(a.MURMINGLE_STARTUP_WALL_MILLISECONDS);need(wall<=420000);
 return freeze({sourceIdentityHash:a.MURMINGLE_STARTUP_SOURCE_IDENTITY,sourcePathsFileSha256:a.MURMINGLE_STARTUP_SOURCE_PATHS,wallMilliseconds:wall});
}

/** Original physical client promises remain retained after observation timeout.
 * RouteCoordinator only receives a checked native promise; unsafe thenables are
 * rejected without Promise.resolve or invoking their hooks. */
export async function runBlankProfile({chromium,profilePath,executablePath,index,createPolicy,createCoordinator,launchArguments,
 guard,terminalGuard,clock,schedule,cancel,onFirstFault,startupErrorPrototype,spawnChannels}){
 need(Number.isInteger(index)&&index>=1&&index<=3);need(typeof profilePath==='string'&&/^D:[\\/]/u.test(profilePath));
 const policy=createPolicy(),originals=new Set(),callbackJobs=new Set(),unsafeQuarantine=new Map(),nativeSlots=new Map();let faulted=false,fault=null,faultDto=null,report=null,reportUntil=null,unsafeOriginal=false;
 const launchObserver=createBrowserLaunchObserver({executablePath,channels:spawnChannels});
 let stage='launch',rpcLabel='context.launch',context=null,browser=null,anchor=null,root=null,closing=false,events=0;
 let contextAttempts=0,browserAttempts=0,contextClosed=false,browserClosed=false,preLoadCensus=null,finalCensus=null;
 const until=clock()+45000;let ordinal=0;const actions=new Map(),values=new Map();
 function terminal(){terminalGuard();}
 function work(){terminal();guard();if(faulted)throw fault;need(clock()<until,'deadline');}
 function latch(error){
  if(faulted)return;faulted=true;fault=error;
  const code=finiteCode(error,startupErrorPrototype);let witness=null;try{witness=policy.readFailureWitness(error);}catch{}
  if(code==='client-failure'&&stage==='context.launch'&&rpcLabel==='context.launch'){
   try{const launchWitness=launchObserver.take(error);if(launchWitness!==null)witness=validateLaunchWitness(launchWitness);}catch{}
  }
  launchObserver.release();
  faultDto=freeze({schema:'startup-first-fault/v1',profileIndex:index,stage,rpc:rpcLabel,code,witness});
  need(encode(faultDto).length<=320,'retained-capacity');
  try{reportUntil=clock()+10000;const p=onFirstFault(faultDto);if(promise(p)){report=p;callbackJobs.add(p);nativeThen.call(p,()=>callbackJobs.delete(p),()=>callbackJobs.delete(p));}}catch{}
 }
 const coordinator=createCoordinator((task,lane)=>{
  const entry=actions.get(task.ordinal);need(entry&&typeof entry.action==='function');actions.delete(task.ordinal);
  const lanes=[...nativeSlots.values()];need(lanes.length<128&&
   (lane==='cleanup'?lanes.filter(v=>v==='cleanup').length<2:lanes.filter(v=>v!=='cleanup').length<126)&&
   (lane!=='denial'||!lanes.includes('denial')),'retained-capacity');nativeSlots.set(task.ordinal,lane);
  let raw;try{raw=entry.action();}catch(error){nativeSlots.delete(task.ordinal);latch(error);throw error;}
  if(!promise(raw)){unsafeOriginal=true;unsafeQuarantine.set(task.ordinal,raw);const error=new DiagnosticError('contract');latch(error);throw error;}originals.add(raw);
  nativeThen.call(raw,()=>{originals.delete(raw);nativeSlots.delete(task.ordinal);},error=>{originals.delete(raw);nativeSlots.delete(task.ordinal);latch(error);});
  return nativeThen.call(raw,value=>{if(!entry.abandoned)values.set(task.ordinal,value);});
 });
 function observed(raw,deadline,cleanup){
  need(promise(raw));return new NativePromise((yes,no)=>{
   let settled=false;const timer=schedule(()=>{if(!settled){settled=true;const error=new DiagnosticError('deadline');latch(error);no(error);}},Math.max(0,deadline-clock()));
   nativeThen.call(raw,value=>{if(!settled){settled=true;cancel(timer);try{need(clock()<deadline,'deadline');cleanup?terminal():work();yes(value);}catch(error){latch(error);no(error);}}},
    error=>{if(!settled){settled=true;cancel(timer);latch(error);no(error);}});
  });
 }
 async function operation(name,action,cleanup=false,denial=false){
  const terminalOnly=cleanup||denial||name==='socket-close';terminalOnly?terminal():work();stage=cleanup?'cleanup':name;rpcLabel=name;
  const n=ordinal++;need(n<4096,'event-capacity');const entry={action,abandoned:false};actions.set(n,entry);
  need(originals.size+unsafeQuarantine.size<=128,'retained-capacity');
  assertStartupRetained(originals.size+unsafeQuarantine.size+actions.size+callbackJobs.size+values.size);
  const task={method:cleanup?'cleanup-rpc':denial?'route-abort':'coordinator-rpc',ordinal:n};
  const operationDeadline=Math.min(terminalOnly&&!(cleanup&&!faulted)?Infinity:until,clock()+10000);
  const p=cleanup?coordinator.cleanup(task):denial?coordinator.deny(task):coordinator.rpc(task);
  try{await observed(p,operationDeadline,terminalOnly);return values.get(n);}
  finally{entry.abandoned=true;values.delete(n);}
 }
 function callback(action){return value=>{try{terminal();need(++events<=4096,'event-capacity');action(value);}catch(error){latch(error);}};}
 function track(p){need(promise(p));callbackJobs.add(p);nativeThen.call(p,()=>callbackJobs.delete(p),error=>{callbackJobs.delete(p);latch(error);});}
 try{
  work();
  context=await operation('context.launch',()=>launchObserver.run(()=>chromium.launchPersistentContext(profilePath,{executablePath,headless:true,chromiumSandbox:true,
   serviceWorkers:'block',ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],
   args:[...launchArguments,'--host-resolver-rules=MAP * ~NOTFOUND'],timeout:10000})));
  browser=context.browser();need(browser!==null,'browser-handle');
  browser.on('disconnected',callback(()=>{if(!closing)throw new DiagnosticError('unexpected-disconnect');}));
  const pages=context.pages();need(Array.isArray(pages)&&pages.length===1&&pages[0].url()==='about:blank','blank-anchor');anchor=pages[0];
  context.on('page',callback(()=>{throw new DiagnosticError('unexpected-page');}));
  context.on('serviceworker',callback(()=>{throw new DiagnosticError('unexpected-worker');}));
  anchor.on('framenavigated',callback(frame=>{need(frame===anchor.mainFrame()&&frame.url()==='about:blank','unexpected-navigation');}));
  for(const event of ['dialog','download','crash','worker'])anchor.on(event,callback(()=>{throw new DiagnosticError('unexpected-page-event');}));
  await operation('http-deny',()=>context.route(/^https?:\/\//u,callback(route=>track(operation('http-abort',()=>route.abort('blockedbyclient'),false,true)))));
  await operation('socket-deny',()=>context.routeWebSocket('**/*',callback(route=>track(operation('socket-close',()=>route.close())))));
  root=await operation('browser.root-session',()=>browser.newBrowserCDPSession());
  await operation('Browser.setDownloadBehavior',()=>root.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  const anchorSession=await operation('context.anchor-session',()=>context.newCDPSession(anchor));
  const anchorInfo=await operation('Target.getTargetInfo',()=>anchorSession.send('Target.getTargetInfo'));
  work();policy.seal(anchorInfo);work();
  for(const [event,name]of [['Target.targetInfoChanged','target-info-changed'],['Target.targetDestroyed','target-destroyed'],['Target.targetCrashed','target-crashed']])
   root.on(event,callback(value=>policy.lifecycle(name,value,closing)));
  root.on('Target.targetCreated',callback(value=>{need(policy.created(policy.targetPayload(value),closing)===true,'unexpected-page-event');}));
  await operation('Target.setDiscoverTargets',()=>root.send('Target.setDiscoverTargets',{discover:true}));work();
  preLoadCensus=policy.census(await operation('Target.getTargets.pre-load',()=>root.send('Target.getTargets')),'pre-load');work();
  finalCensus=policy.census(await operation('Target.getTargets.final',()=>root.send('Target.getTargets')),'final');work();
 }catch(error){latch(error);}
 launchObserver.release();
 // Witness is queued immediately by latch, before any close that might hang.
 if(report)try{await observed(report,reportUntil,true);}catch{}
 closing=true;
 if(context){contextAttempts++;try{await operation('context.close',()=>context.close(),true);contextClosed=true;}catch(error){latch(error);}}
 if(browser){browserAttempts++;try{await operation('browser.close',()=>browser.close(),true);browserClosed=true;}catch(error){latch(error);}}
 if(report)try{await observed(report,reportUntil,true);}catch{}
 const physical=!unsafeOriginal&&originals.size===0&&actions.size===0&&values.size===0,callbacks=callbackJobs.size===0;
 const pending=coordinator.snapshot();need(typeof pending==='object');
 const result=freeze({schema:'startup-profile/v1',profileIndex:index,status:faulted?'failed':'healthy',preLoadCensus,finalCensus,
  contextCloseAttempts:contextAttempts,browserCloseAttempts:browserAttempts,contextClosed,browserClosed,
  physicalOperationsDrained:physical,callbacksDrained:callbacks,pending:{originals:originals.size,callbacks:callbackJobs.size,unsafeOriginal,unsafeObligations:unsafeQuarantine.size,coordinator:pending},firstFault:faultDto});
 return Object.freeze({result,hasFault:()=>faulted,
  afterDrain(){terminal();if(faulted)return faultDto;work();return null;},
  async waitForReport(){if(report)await observed(report,reportUntil,true);},
  release(){need(!unsafeOriginal&&originals.size===0&&callbackJobs.size===0&&actions.size===0&&values.size===0,'physical-unsettled');launchObserver.release();policy.release();},
  assertPhysical(){const live=coordinator.snapshot();need(physical&&callbacks&&!unsafeOriginal&&originals.size===0&&nativeSlots.size===0&&
   callbackJobs.size===0&&actions.size===0&&values.size===0&&live.backlog===0&&live.normalActive===0&&live.cleanupActive===0&&live.denialActive===0&&
   (!faulted||result.firstFault===faultDto)&&contextClosed===Boolean(context)&&browserClosed===Boolean(browser),'physical-unsettled');}});
}

export function createControlWire({channel,config,nodePid}){
 let sequence=0,chain=null,busy=false,failurePresent=false,failure=null,originalExchange=null,rawWrite=null,unsafeWrite=false;const head=()=>freeze({sequence,chainHash:chain});
 async function exchange(kind,payload){
  if(failurePresent)throw failure;
  if(busy){failurePresent=true;failure=new DiagnosticError('physical-unsettled');throw failure;}busy=true;
  try{
   const request={schema:'startup-request/v1',sequence:sequence+1,sourceIdentityHash:config.sourceIdentityHash,
    sourcePathsFileSha256:config.sourcePathsFileSha256,nodePid,kind,priorChainHash:chain,payload};
   const raw=encode(request);need(raw.length<16384);
   const write=channel.write(Buffer.concat([raw,Buffer.from('\n')]));
   rawWrite=write;unsafeWrite=!promise(write);need(!unsafeWrite);originalExchange=write;nativeThen.call(write,()=>undefined,()=>undefined);
   const read=channel.readChunk();need(promise(write)&&promise(read));
   originalExchange=NativePromise.all([write,read]);const [written,response]=await originalExchange;need(written===true);
   if(failurePresent)throw failure;
   const bytes=response.subarray(0,-1),ack=exact(parse(bytes,16384),['schema','sequence','kind','requestHash','chainHash','payload']);
   need(ack.schema==='startup-ack/v1'&&ack.sequence===request.sequence&&ack.kind===kind&&ack.requestHash===sha(raw));
   validateAckPayload(kind,ack.payload,request,{...config,nodePid});
   const expected=digest({previousChainHash:chain,requestHash:sha(raw),responsePayloadHash:digest(ack.payload)});
   need(ack.chainHash===expected);channel.assertHealthy();sequence++;chain=expected;return freeze({payload:ack.payload,ackHash:sha(bytes),head:head()});
  }catch(error){if(!failurePresent){failurePresent=true;failure=error;}throw failure;}finally{
   // A rejected observation cannot free a still-owned original exchange.
   busy=unsafeWrite||channel.snapshot().physicalExchangePending||channel.snapshot().exchangeReserved;
  }
 }
 return Object.freeze({exchange,head,isBusy:()=>busy,
  async waitIdle(){if(unsafeWrite)throw failure;if(originalExchange)await originalExchange;if(failurePresent)throw failure;need(!busy&&!channel.snapshot().exchangeReserved,'physical-unsettled');}});
}
export async function runDiagnosticProfiles({runProfile,begin,drain,complete,terminalGuard,profileCount=PROFILES.length}){
 count(profileCount,3,1);
 const results=[],acks=[];let firstFault=null;
 for(let index=1;index<=profileCount;index++){
  terminalGuard();if(firstFault)break;
  await begin(index,acks.at(-1)??null);
  const held=await runProfile(index);results.push(held.result);firstFault??=held.result.firstFault;
  held.assertPhysical();
  const ack=await drain(index,held.result,firstFault!==null);acks.push(ack);
  const late=held.afterDrain();firstFault??=late;if(firstFault&&typeof held.waitForReport==='function')await held.waitForReport();held.release();
  if(firstFault)break;
 }
 return complete(results,acks,firstFault);
}

// Initialized before configuration parsing; catch never examines thrown values.
const bootstrapProgress=createBootstrapProgress();
async function actualMain(){
 need(ACTUAL_RELEASE==='adr204-reviewed-startup/v1','entry-closed');
 requireStartupRuntime(process.platform,process.version);
 const config=childConfiguration(process.argv.slice(2),process.env,process.platform),started=performance.now(),deadline=started+config.wallMilliseconds;
 const terminalGuard=()=>{need(performance.now()<deadline,'deadline');return true;};
 const channel=createOwnedSpecificityPipeChannel({input:process.stdin,output:process.stdout,guard:terminalGuard,clock:()=>performance.now(),deadline});
 bootstrapProgress.enter('held-handshake');
 channel.start();await channel.waitHandshake();channel.assertHealthy();
 const control=createControlWire({channel,config,nodePid:process.pid});
 const fs=await import('node:fs/promises');
 const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../..'),here=resolve(repo,OWN),leaf=resolve(here,'output/startup');
 const code=key=>key==='node_modules/playwright-core'||key.startsWith('node_modules/playwright-core/')?resolve(repo,'spikes/topic-resolution/harness/experimental/playwright-dev-v1',key):resolve(repo,key);
 const aliases={'control:bootstrap':resolve(leaf,'bootstrap.json'),'control:freeze':resolve(here,'output/prepare/freeze.json'),'control:source-paths':resolve(here,'source-paths.js')};
 async function sampled(key,action){
  const before=await control.exchange('FS_BEFORE',{pathKey:key}),ticket=before.payload.ticket;
  const value=await action(aliases[key]??code(key));
  await control.exchange('FS_AFTER',{ticket,pathKey:key});return value;
 }
 const read=async key=>{
  const maximum=key==='control:bootstrap'?16384:key==='control:freeze'?524288:key==='control:source-paths'?131072:
   key==='spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json'?65536:4194304;
  // Native sampled size is checked BEFORE allocating or starting a file read.
  const before=await control.exchange('FS_BEFORE',{pathKey:key});
  need(before.payload.proof.identity.fileType==='file');const size=BigInt(before.payload.proof.identity.size);need(size>0n&&size<=BigInt(maximum));
  const bytes=await boundedReadFile(fs,aliases[key]??code(key),Number(size),maximum,terminalGuard);
  await control.exchange('FS_AFTER',{ticket:before.payload.ticket,pathKey:key});return bytes;
 };
 bootstrapProgress.enter('bootstrap-read');
 const bootstrapBytes=await read('control:bootstrap'),bootstrap=parse(bootstrapBytes,16384);
 need(bootstrap.schema==='startup-bootstrap/v1'&&bootstrap.sourceIdentityHash===config.sourceIdentityHash&&bootstrap.nodePid===process.pid);
 bootstrapProgress.enter('ready');
 const ready=await control.exchange('READY',{bootstrapHash:sha(bootstrapBytes),creationFiletime:bootstrap.creationFiletime,nodeVersion:process.version});
 need(ready.payload.schema==='startup-baseline-ack/v1');
 bootstrapProgress.enter('source-authentication');
 const literal=await read('control:source-paths');need(sha(literal)===config.sourcePathsFileSha256);
 const text=new TextDecoder('utf8',{fatal:true}).decode(literal),match=/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/u.exec(text);need(match!==null);
 const names=JSON.parse(match[1]);need(Array.isArray(names)&&names.length>0&&names.length<=128);
 need(JSON.stringify(names)===JSON.stringify([...new Set(names)].sort()));
 const frozenBytes=await read('control:freeze');need(sha(frozenBytes)===config.sourceIdentityHash);
 const frozen=parse(frozenBytes);hash(frozen.freezeHash);const{freezeHash,...freezeBody}=frozen;need(digest(freezeBody)===freezeHash);
 need(frozen.sourcePathsFileSha256===config.sourcePathsFileSha256);
 for(const name of names)need(Object.hasOwn(frozen.sourceHashes,name));
 for(const [key,pin]of Object.entries(frozen.sourceHashes)){hash(pin);need(sha(await read(key))===pin);}
 // Recheck package directory contents against the authenticated FILE closure.
 bootstrapProgress.enter('package-directories');
 const prefix='node_modules/playwright-core/',keys=Object.keys(frozen.sourceHashes).filter(k=>k.startsWith(prefix));
 need(keys.length===115);
 const directories=new Map([[prefix.slice(0,-1),new Set()]]);
 for(const key of keys){let parts=key.split('/');for(let i=2;i<parts.length;i++){const dir=parts.slice(0,i).join('/');if(!directories.has(dir))directories.set(dir,new Set());directories.get(dir).add(parts[i]);}}
 for(const [dir,children]of directories){
  const actual=await sampled(dir,p=>boundedReadDirectory(fs,p,[...children],terminalGuard));need(JSON.stringify(actual.sort())===JSON.stringify([...children].sort()));
 }
 const protocol=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await read(OWN+'protocol.json')));
 exact(protocol,['schema','profiles','runtime','limits','shapes','kinds','bootstrapRefusalStages','sourceAcceptance']);need(protocol.schema==='startup-infrastructure-diagnostic/v1'&&protocol.sourceAcceptance==='adr204-reviewed-startup/v1'&&JSON.stringify(protocol.bootstrapRefusalStages)===JSON.stringify(BOOTSTRAP_STAGES));
 exact(protocol.runtime,['platform','nodeVersion']);requireStartupRuntime(protocol.runtime.platform,protocol.runtime.nodeVersion);
 need(JSON.stringify(protocol.profiles)===JSON.stringify(PROFILES));
 bootstrapProgress.enter('runtime-import');
 const {createInfrastructurePolicy}=await import('../infrastructure-identity-witness-v1/policy.mjs');
 const {StartupFatal}=await import('../native-extension-startup-dev-v1/run.mjs');
 const {createRouteCoordinator}=await import('../playwright-route-coordinator-v1/coordinator.mjs');
 const {NATIVE_LAUNCH_ARGUMENTS}=await import('../native-reader-transfer-v1/browser-capture.mjs');
 const {chromium}=await import('../playwright-dev-v1/node_modules/playwright-core/index.mjs');
 bootstrapProgress.enter('profiles');
 const bindings={sourcePathsFileSha256:config.sourcePathsFileSha256,freezeFileSha256:config.sourceIdentityHash,
  freezeHash:frozen.freezeHash,sourceMapHash:bootstrap.sourceMapHash,nodePid:process.pid,creationFiletime:bootstrap.creationFiletime,
  bootstrapFileSha256:sha(bootstrapBytes),baselineHash:ready.payload.baseline.baselineHash};
 terminalGuard();let executablePath=null;
 for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']){
  try{const info=await fs.lstat(p);if(info.isFile()&&!info.isSymbolicLink()){executablePath=p;break;}}catch(error){if(error?.code!=='ENOENT')throw error;}
 }
 need(executablePath!==null,'client-failure');
 let firstFault=null,faultReport=null;
 async function reportFault(value){
  firstFault??=value;if(faultReport)return faultReport;
  faultReport=(async()=>{if(control.isBusy())await control.waitIdle();const ack=await control.exchange('STARTUP_FAULT',{firstFault:firstFault,firstFaultHash:digest(firstFault)});need(ack.payload.schema==='startup-fault-evidence-ack/v1');})();return faultReport;
 }
 await runDiagnosticProfiles({
  terminalGuard,
  begin:async(profileIndex,previousDrainAckHash)=>{need(firstFault===null);const ack=await control.exchange('PROFILE_BEGIN',{profileIndex,previousDrainAckHash});need(ack.payload.profileIndex===profileIndex);},
  runProfile:index=>runBlankProfile({chromium,profilePath:resolve(leaf,PROFILES[index-1]),executablePath,index,createPolicy:createInfrastructurePolicy,createCoordinator:createRouteCoordinator,
   launchArguments:NATIVE_LAUNCH_ARGUMENTS,startupErrorPrototype:StartupFatal.prototype,guard:()=>{terminalGuard();need(firstFault===null);},terminalGuard,clock:()=>performance.now(),schedule:setTimeout,cancel:clearTimeout,onFirstFault:reportFault}),
  drain:async(profileIndex,result,failed)=>{const ack=await control.exchange(failed?'FAILED_PROFILE_DRAIN':'PROFILE_DRAIN',{profileIndex,result,resultHash:digest(result),proofHead:control.head()});return ack.ackHash;},
  complete:async(profiles,drainAckHashes,fault)=>{
   firstFault??=fault;
   if(firstFault&&fault&&!control.isBusy())await reportFault(firstFault);
   const result={schema:'startup-result/v1',bindings,status:firstFault?'failed':'healthy',profiles,drainAckHashes,firstFault,proofHead:control.head()};
   await control.exchange(firstFault?'FAILED_COMPLETE':'COMPLETE',{result,resultHash:digest(result)});
  }
 });
 bootstrapProgress.enter('pipe-finish');
 channel.finish();process.stdin.pause();process.stdin.unref();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&process.argv.length>2)
 actualMain().catch(()=>{process.stderr.write(JSON.stringify(bootstrapProgress.refusal())+'\n');process.exitCode=1;process.stdin.pause();process.stdin.unref();});


