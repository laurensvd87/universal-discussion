// ADR179 execution boundary. One default-inert/builtin-only adapter exception:
// the native parent authenticates all CODE/package bytes BEFORE Popen; only this
// adapter may load before it reads the ORIGINAL assignment header. Other private
// imports wait that header; semantic/network/model actions also wait child gates.
// No CLI dispatch or native/filesystem/model action on import.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createOwnedSpecificityPipeChannel} from './pipe-channel.mjs';

const NativePromise=Promise,nativeThen=Promise.prototype.then;
const byteLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
const setBytes=Uint8Array.prototype.set;
const SHA=/^[0-9a-f]{64}$/u;
// Readiness only. Root's separate recorded phase decision grants actual work.
// Do not replace this with a caller flag, environment variable or fake receipt.
export const ACTUAL_EXECUTION_RELEASE='adr195-reviewed-execution/v1';
export class ExecutionFailure extends Error{constructor(){super('Specificity execution refused');}}
const yes=v=>{if(!v)throw new ExecutionFailure();};
const hash=v=>{yes(typeof v==='string'&&SHA.test(v));return v;};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
export const fileHash=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v),'utf8');
export const metadataHash=v=>fileHash(encode(v));
function data(v){let values=0,units=0;const seen=new Set();
 function visit(x,depth){yes(++values<=20000&&depth<=24);if(x===null||typeof x==='boolean')return x;
  if(typeof x==='string'){units+=x.length;yes(units<=1048576&&x.length<=131072&&x.isWellFormed());return x;}
  if(typeof x==='number'){yes(Number.isFinite(x));return x;}
  yes(x&&typeof x==='object'&&!types.isProxy(x)&&!seen.has(x));seen.add(x);let out;
  if(Array.isArray(x))out=array(x,1024).map(y=>visit(y,depth+1));
  else{yes(Object.getPrototypeOf(x)===Object.prototype);const keys=Reflect.ownKeys(x);yes(keys.length<=128);out={};
   for(const k of keys){yes(typeof k==='string'&&!['__proto__','constructor','prototype'].includes(k));const d=Object.getOwnPropertyDescriptor(x,k);yes(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=visit(d.value,depth+1);}}
  seen.delete(x);return out;
 }return freeze(visit(v,0));
}
function record(v,keys){yes(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);
 yes(Reflect.ownKeys(v).length===keys.length);const o={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);yes(d?.enumerable&&Object.hasOwn(d,'value'));o[k]=d.value;}return o;}
function buffer(v,max){yes(v&&typeof v==='object'&&!types.isProxy(v)&&Buffer.isBuffer(v)&&Object.getPrototypeOf(v)===Buffer.prototype);
 const n=Reflect.apply(byteLength,v,[]);yes(n>0&&n<=max);const out=Buffer.alloc(n);Reflect.apply(setBytes,out,[v]);return out;}
function path(v){yes(typeof v==='string'&&v.length>0&&v.length<=512&&/^[A-Za-z0-9._/-]+$/u.test(v)&&!v.startsWith('/')&&v.split('/').every(s=>s&&s!=='.'&&s!=='..'));return v;}
function array(v,max){yes(Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype);
 const d=Object.getOwnPropertyDescriptor(v,'length');yes(d&&Object.hasOwn(d,'value')&&d.value<=max&&Reflect.ownKeys(v).length===d.value+1);
 return Array.from({length:d.value},(_,i)=>{const p=Object.getOwnPropertyDescriptor(v,String(i));yes(p?.enumerable&&Object.hasOwn(p,'value'));return p.value;});}
function parseCanonical(b,max){const bytes=buffer(b,max),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);
 yes(encode(value).equals(bytes));return value;}
function sourceListData(value){const r=record(value,['schema','sourcePathsSha256','paths']);yes(r.schema==='native-specificity-authenticated-source-list/v1');hash(r.sourcePathsSha256);
 const paths=array(r.paths,128);yes(paths.length>0);paths.forEach(path);same(paths,[...new Set(paths)].sort());yes(new Set(paths.map(p=>p.toLowerCase())).size===paths.length);return {...r,paths};}
function parentAck(bytes,kind){
 if(kind!=='batch-drain'&&kind!=='cohort-drain')return parseCanonical(bytes,16384);
 const b=buffer(bytes,16384),text=new TextDecoder('utf-8',{fatal:true}).decode(b),value=JSON.parse(text);
 // CPython may serialize a finite whole-valued float as 1000.0 while V8 uses
 // 1000. Preserve/hash the ORIGINAL bytes; admit this ONE numeric wire field
 // without pretending the two serializers have identical number formatting.
 const match=/,"observedAt":(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)\}$/u.exec(text);yes(match!==null&&match[1].length<=32);
 const n=value.observedAt;yes(typeof n==='number'&&Number.isFinite(n)&&n>=0&&!Object.is(n,-0)&&Number(match[1])===n);
 const rendered=JSON.stringify(value),suffix=',"observedAt":'+JSON.stringify(n)+'}';yes(rendered.endsWith(suffix));
 yes(rendered.slice(0,-suffix.length)+',"observedAt":'+match[1]+'}'===text);return value;
}
function same(a,b){yes(metadataHash(a)===metadataHash(b));}
function map(v,max){yes(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);
 const keys=Reflect.ownKeys(v);yes(keys.length>0&&keys.length<=max);const out={};for(const k of keys){path(k);yes(!['__proto__','constructor','prototype'].includes(k));const d=Object.getOwnPropertyDescriptor(v,k);yes(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=hash(d.value);}return out;}
function safePromise(v){if(types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==NativePromise.prototype)return false;
 return Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});}
function proofKey(v){
 yes(typeof v==='string'&&v.length>0&&v.length<=512);
 if(v==='workspace:')return v;
 if(v.startsWith('workspace:'))return path(v.slice(10));
 if(v.startsWith('asset:')){yes(['model.onnx','tokenizer.json','tokenizer_config.json','config.json','special_tokens_map.json','tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'].includes(v.slice(6)));return v;}
 if(v.startsWith('metadata:')){yes(['candidates','curation','trainCalReview','testReview','finalReview'].includes(v.slice(9)));return v;}
 if(v.startsWith('artifact:')){yes(['freezeBytes','supervisorBytes','selectionReceiptBytes','selectionBytes','modelBytes','policyBytes','inputDefinitionBytes'].includes(v.slice(9)));return v;}
 if(v.startsWith('control:')){yes(['bootstrap','reviewed-sources','freeze','source-list'].includes(v.slice(8)));return v;}
 if(v.startsWith('audit:')){yes(['selection-audit','train-supervisor','train-result','train-selection'].includes(v.slice(6)));return v;}
  return path(v);
}

export function specificityCliConfiguration(argv,environment,platform){
 yes(platform==='win32');const args=array(argv,1);yes(args.length===1);
 const phase={'--prepare':'prepare','--run-train-cal':'train-cal','--run-test':'test'}[args[0]];yes(phase!==undefined);
 // Only fixed original entrypoint env values are inputs; none grants release.
 const keys=['MURMINGLE_NATIVE_SPECIFICITY_SUPERVISED','MURMINGLE_NATIVE_SPECIFICITY_SOURCE_IDENTITY','MURMINGLE_NATIVE_SPECIFICITY_SOURCE_LIST','MURMINGLE_NATIVE_SPECIFICITY_TEST_AUDIT'];
 const env={};yes(environment&&typeof environment==='object'&&!types.isProxy(environment));
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(environment,k);yes(d===undefined||Object.hasOwn(d,'value'));env[k]=d?.value;}
 yes(env.MURMINGLE_NATIVE_SPECIFICITY_SUPERVISED==='1');
 const testAuditSha256=phase==='test'?hash(env.MURMINGLE_NATIVE_SPECIFICITY_TEST_AUDIT):null;
 yes(phase==='test'||env.MURMINGLE_NATIVE_SPECIFICITY_TEST_AUDIT===undefined);
 return freeze({phase,sourceIdentityHash:hash(env.MURMINGLE_NATIVE_SPECIFICITY_SOURCE_IDENTITY),sourcePathsSha256:hash(env.MURMINGLE_NATIVE_SPECIFICITY_SOURCE_LIST),testAuditSha256});
}

async function actualMain(){
 yes(ACTUAL_EXECUTION_RELEASE==='adr195-reviewed-execution/v1');
 const config=specificityCliConfiguration(process.argv.slice(2),process.env,process.platform);
 const clock=()=>performance.now(),started=clock(),seconds=config.phase==='prepare'?60:config.phase==='train-cal'?9420:7005,deadline=started+seconds*1000;
 const localGuard=()=>{yes(clock()<deadline);return true;};
 const channel=createOwnedSpecificityPipeChannel({input:process.stdin,output:process.stdout,guard:localGuard,clock,deadline});
 channel.start();await channel.waitHandshake();channel.assertHealthy();
 const {runSpecificityDriver}=await import('./driver.mjs');channel.assertHealthy();
 const completed=await runSpecificityDriver({...config,nodePid:process.pid,channel,clock,deadline,emitFailure:bytes=>process.stderr.write(bytes),execution:{authenticateSpecificitySourceList,authenticateSpecificityReviewedMap,authenticateSpecificityCode,authenticateSpecificityFreeze,createSpecificityFsProofWire,createSpecificityDrainWire}});
 yes(completed.completed===true);channel.assertHealthy();
 // Only now permit natural Node exit. Listeners remain installed; parent must
 // separately prove normal exit, terminal pipes, all bytes and its empty Job.
 process.stdin.pause();process.stdin.unref();
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 actualMain().catch(()=>{process.stderr.write('Specificity execution refused.\n');process.exit(1);});
}

/** The independently held FILE hash is checked BEFORE parsing the source list.
 * The list is a reviewed CODE literal; no path from evidence JSON is followed. */
export function authenticateSpecificitySourceList(bytes,expectedFileHash){
 hash(expectedFileHash);const b=buffer(bytes,131072);yes(fileHash(b)===expectedFileHash);
 const text=new TextDecoder('utf-8',{fatal:true}).decode(b);
 const match=/^export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);$/mu.exec(text);yes(match!==null);
 const paths=array(JSON.parse(match[1]),128);yes(paths.length>0);paths.forEach(path);
 same(paths,[...new Set(paths)].sort());yes(new Set(paths.map(p=>p.toLowerCase())).size===paths.length);
 return freeze({schema:'native-specificity-authenticated-source-list/v1',sourcePathsSha256:expectedFileHash,paths});
}

export function authenticateSpecificityReviewedMap(bytes,expectedFileHash,sourceList){
 hash(expectedFileHash);sourceList=sourceListData(sourceList);const b=buffer(bytes,65536);yes(fileHash(b)===expectedFileHash);
 const r=record(parseCanonical(b,65536),['schema','sourcePathsSha256','sourceHashes']);
 yes(r.schema==='native-specificity-reviewed-sources/v1'&&r.sourcePathsSha256===sourceList.sourcePathsSha256);
 const pins=map(r.sourceHashes,128);same(Object.keys(pins).sort(),sourceList.paths);
 return freeze({...r,sourceHashes:pins});
}

/** Actual readLiteral must enforce the separately reviewed native/ordinary-file
 * contract. Invented callbacks prove none of that. This function follows ONLY
 * the already authenticated CODE list, never map-selected paths. */
export async function authenticateSpecificityCode(input){
 const {sourceList,sourceHashes,readLiteral,guard}=record(input,['sourceList','sourceHashes','readLiteral','guard']);
 const list=sourceListData(sourceList),paths=list.paths,pins=map(sourceHashes,256);
 yes(paths.every(p=>Object.hasOwn(pins,p)));yes(typeof readLiteral==='function'&&!types.isProxy(readLiteral)&&typeof guard==='function'&&!types.isProxy(guard));
 yes(Object.keys(pins).every(p=>paths.includes(p)||p.startsWith('node_modules/playwright-core/')));
 let total=0;const result={};
 const check=()=>{const r=guard();yes(!types.isProxy(r));if(types.isPromise(r)){yes(safePromise(r));nativeThen.call(r,()=>undefined,()=>undefined);throw new ExecutionFailure();}yes(r===true||r===undefined);};
 for(const p of paths){check();const original=readLiteral(p,Math.min(4194304,33554432-total));yes(!types.isProxy(original));let value;
  if(types.isPromise(original)){yes(safePromise(original));value=(await new NativePromise((resolve,reject)=>nativeThen.call(original,v=>resolve({value:v}),reject))).value;}else value=original;
  check();const b=buffer(value,Math.min(4194304,33554432-total));yes(fileHash(b)===pins[p]);total+=b.length;result[p]=pins[p];check();
 }
 check();return freeze({sourcePathsSha256:list.sourcePathsSha256,sourceHashes:result,files:paths.length,bytes:total,actualPhysicalProofRequired:true});
}

const STAGE_FILES=['batch-config.js','chromium/page-content-reader.js','core/page-content-policy.js','manifest.json','native-adapter.js','native-rights.js','worker.js'];
const FREEZE_KEYS=['schema','sourcePathsSha256','sourceHashes','catalogHash','contextHash','manifestHash','panelIdentity','recipeHash','encoderHash','assetPinsHash','packageFiles','packageBytes','batchIds','batchStageHashes','freezeHash'];
export function authenticateSpecificityFreeze(bytes,expectedFileHash,sourceList){
 hash(expectedFileHash);sourceList=sourceListData(sourceList);const b=buffer(bytes,262144);yes(fileHash(b)===expectedFileHash);
 const r=record(parseCanonical(b,262144),FREEZE_KEYS);yes(r.schema==='native-specificity-study-freeze/v1');
 yes(r.sourcePathsSha256===sourceList.sourcePathsSha256);const pins=map(r.sourceHashes,256);
 const packagePrefix='node_modules/playwright-core/';same(Object.keys(pins).filter(k=>!k.startsWith(packagePrefix)).sort(),sourceList.paths);
 yes(Object.keys(pins).filter(k=>k.startsWith(packagePrefix)).length===115&&r.packageFiles===115&&r.packageBytes===13656167);
 for(const k of ['catalogHash','contextHash','manifestHash','panelIdentity','recipeHash','encoderHash','assetPinsHash'])hash(r[k]);
 const ids=record(r.batchIds,['train-cal','test']);yes(array(ids['train-cal'],24).length===24&&array(ids.test,18).length===18);
 const all=[...ids['train-cal'],...ids.test];all.forEach(hash);yes(new Set(all).size===42);
 const stages=record(r.batchStageHashes,all);for(const id of all){const m=record(stages[id],STAGE_FILES);Object.values(m).forEach(hash);}
 const {freezeHash,...body}=r;yes(metadataHash(body)===hash(freezeHash));
 return freeze({...r,sourceHashes:pins});
}

/** Parent control wire. Physical IO capabilities are independently authenticated
 * by the eventual owner. A supplied matching hash is not guardian authority. */
export function createSpecificityDrainWire(input){
 const supplied=record(input,['phase','freezeHash','manifestHash','nodeIdentityHash','sourceMapHash','batchIds','capabilities']);
 const r={...data(Object.fromEntries(Object.entries(supplied).filter(([k])=>k!=='capabilities'))),capabilities:supplied.capabilities};
 yes(['train-cal','test'].includes(r.phase));const bindings={};for(const k of ['freezeHash','manifestHash','nodeIdentityHash','sourceMapHash'])bindings[k]=hash(r[k]);
 const batchIds=array(r.batchIds,r.phase==='train-cal'?24:18);yes(batchIds.length===(r.phase==='train-cal'?24:18));batchIds.forEach(hash);yes(new Set(batchIds).size===batchIds.length);
 const c=record(r.capabilities,['guard','now','publish','read','sleep']);Object.values(c).forEach(f=>yes(typeof f==='function'&&!types.isProxy(f)));
 let failed=false,unsafe=false,lastNow=-Infinity,busy=false,index=0,started=false,previous=null,modelStage=null,finalCaptureHash=null,heldEncodingHash=null;const pending=new Set(),accepted=new Map(),receiptHashes=[];
 function fault(){failed=true;throw new ExecutionFailure();}
 function track(original){if(!safePromise(original)){unsafe=true;fault();}pending.add(original);
  return new NativePromise((resolve,reject)=>nativeThen.call(original,v=>{pending.delete(original);resolve({value:v});},e=>{pending.delete(original);reject(e);}));}
 function sync(v){if(types.isProxy(v)){unsafe=true;fault();}if(types.isPromise(v)){const wait=track(v);nativeThen.call(wait,()=>undefined,()=>undefined);fault();}if(failed)fault();return v;}
 function now(){const n=sync(c.now());if(failed)fault();yes(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n>=lastNow);lastNow=n;return n;}
 function check(){try{if(failed)fault();now();const v=sync(c.guard());yes(v===true||v===undefined);now();if(failed)fault();}catch{fault();}}
 async function call(action){check();const original=action();let value;
  if(types.isProxy(original)){unsafe=true;fault();}
  if(types.isPromise(original))value=(await track(original)).value;else value=original;
  check();return {value};
 }
 async function exchange(name,body,kind,extra){
  check();yes(!busy);busy=true;
  try{const requestedAt=now(),raw=encode(body);yes(raw.length<=16384);const requestHash=fileHash(raw),deadline=requestedAt+15000;
   const {value:published}=await call(()=>c.publish(name+'.request.json',raw));yes(published===true);
   let bytes=null;
   while(bytes===null){check();yes(now()<deadline);bytes=(await call(()=>c.read(name+'.ack.json',16384))).value;
    if(bytes===null)await call(()=>c.sleep(Math.min(20,Math.max(1,deadline-now()))));}
   const b=buffer(bytes,16384),ack=parentAck(b,kind),ackHash=fileHash(b);check();yes(now()<deadline);
   if(kind==='batch-drain'||kind==='cohort-drain'){
    const a=record(ack,['schema','freezeHash','manifestHash','nodeIdentityHash','sourceMapHash','phase','requestHash','previousAckHash','observedAt']);
    yes(a.schema==='native-specificity-'+kind+'-ack/v1'&&a.previousAckHash===previous&&typeof a.observedAt==='number'&&Number.isFinite(a.observedAt)&&a.observedAt>=0);
   }else record(ack,['schema','freezeHash','manifestHash','nodeIdentityHash','sourceMapHash','phase','kind',...Object.keys(extra),'requestHash']);
   for(const [k,v]of Object.entries(bindings))yes(ack[k]===v);yes(ack.phase===r.phase&&ack.requestHash===requestHash);
   if(kind!=='batch-drain'&&kind!=='cohort-drain'){yes(ack.schema==='native-specificity-control-ack/v1'&&ack.kind===kind);for(const [k,v]of Object.entries(extra))same(ack[k],v);}
   check();const acknowledgedAt=now();yes(acknowledgedAt<deadline);return {ack:freeze(ack),ackHash,requestHash,requestedAt,acknowledgedAt};
  }catch{fault();}finally{busy=false;}
 }
 const base=schema=>({schema,...bindings,phase:r.phase});
 return Object.freeze({
  async beginBatch(value){try{check();const batch=data(value);yes(!started&&modelStage===null&&batch.batchId===batchIds[index]&&batch.batchIndex===index+1);
   const extra={batchId:batch.batchId,batchIndex:batch.batchIndex};await exchange('batch-'+String(index+1).padStart(2,'0')+'.start',{...base('native-specificity-batch-start-request/v1'),...extra,previousAckHash:previous},'batch-start',extra);started=true;return true;
  }catch{fault();}},
  async requestBatchDrain(value){try{check();yes(started&&modelStage===null);const q=record(data(value),['batch','manifestHash','nodeIdentityHash','batchCaptureHash','captureSummaryHash','captureSummary']);
   yes(q.batch.batchId===batchIds[index]&&q.batch.batchIndex===index+1&&q.manifestHash===r.manifestHash&&q.nodeIdentityHash===r.nodeIdentityHash);hash(q.batchCaptureHash);hash(q.captureSummaryHash);
   yes(metadataHash(q.captureSummary)===q.captureSummaryHash);
   const body={...base('native-specificity-batch-drain-request/v1'),batchId:q.batch.batchId,batchIndex:index+1,batchCaptureHash:q.batchCaptureHash,captureSummaryHash:q.captureSummaryHash,previousAckHash:previous};
   const out=await exchange('batch-'+String(index+1).padStart(2,'0')+'.drain',body,'batch-drain',{});
   const receipt=freeze({ack:out.ack,receiptHash:out.ackHash});accepted.set(q.batch.batchId,{receipt,body});previous=out.ackHash;receiptHashes.push(out.ackHash);index++;started=false;return receipt;
  }catch{fault();}},
  verifyBatchDrain(value){try{check();const q=data(value),saved=accepted.get(q.batch.batchId);yes(saved!==undefined);same(q.guardianReceipt,saved.receipt);
   yes(q.manifestHash===r.manifestHash&&q.nodeIdentityHash===r.nodeIdentityHash&&q.batchCaptureHash===saved.body.batchCaptureHash&&q.captureSummaryHash===saved.body.captureSummaryHash&&metadataHash(q.captureSummary)===saved.body.captureSummaryHash);
   return freeze({batchId:q.batch.batchId,manifestHash:r.manifestHash,nodeIdentityHash:r.nodeIdentityHash,batchCaptureHash:q.batchCaptureHash,receiptHash:saved.receipt.receiptHash});
  }catch{fault();}},
  async requestFinalDrain(value){try{check();yes(index===batchIds.length&&!started&&modelStage===null);const q=record(data(value),['schema','phase','panelIdentity','manifestHash','nodeIdentityHash','captureHash','batchReceiptHashes','requestHash']);
   yes(q.schema==='native-specificity-cohort-drain-request/v1'&&q.phase===r.phase&&q.manifestHash===r.manifestHash&&q.nodeIdentityHash===r.nodeIdentityHash);hash(q.panelIdentity);hash(q.captureHash);hash(q.requestHash);
   const {requestHash,...core}=q;yes(metadataHash(core)===requestHash);same(q.batchReceiptHashes,receiptHashes);
   const out=await exchange('cohort.drain',{...base('native-specificity-cohort-drain-request/v1'),accounted:batchIds.length*4,captureHash:q.captureHash,batchReceiptHashes:receiptHashes,previousAckHash:previous},'cohort-drain',{});
   previous=out.ackHash;modelStage='encoding';finalCaptureHash=q.captureHash;return freeze({requestHash,receiptHash:out.ackHash,nodeIdentityHash:r.nodeIdentityHash,requestedAt:out.requestedAt,acknowledgedAt:out.acknowledgedAt});
  }catch{fault();}},
  async enterModelStage(value){try{check();const q=record(data(value),['phase','stage','captureHash','encodingHash']);yes(q.phase===r.phase&&q.captureHash===finalCaptureHash);hash(q.captureHash);hash(q.encodingHash);yes(heldEncodingHash===null||heldEncodingHash===q.encodingHash);
   const order=['encoding',r.phase==='train-cal'?'fitting':'assessment','checks'];yes(order.indexOf(modelStage)>=0&&order.indexOf(modelStage)<2&&q.stage===order[order.indexOf(modelStage)+1]);
   const extra={stage:q.stage,captureHash:q.captureHash,encodingHash:q.encodingHash};await exchange('model-'+q.stage,{...base('native-specificity-model-stage-request/v1'),...extra,previousAckHash:previous},'model-stage',extra);modelStage=q.stage;heldEncodingHash=q.encodingHash;return true;
  }catch{fault();}},
  abandon(){fault();},
  snapshot(){return freeze({failed,pendingOriginals:pending.size,unsafeOperationRefused:unsafe,completedBatches:index,started,modelStage,previousAckHash:previous});}
 });
}

/** Filesystem proof transport ONLY. The real original child pipes and native
 * path-key inspector are still the actual owner's obligation, not this DTO. */
export function createSpecificityFsProofWire(input){
 const r=record(input,['phase','sourceIdentityHash','capabilities']);yes(['prepare','train-cal','test'].includes(r.phase));hash(r.sourceIdentityHash);
 const c=record(r.capabilities,['guard','now','write','readChunk']);Object.values(c).forEach(f=>yes(typeof f==='function'&&!types.isProxy(f)));
 let failed=false,unsafe=false,busy=false,sequence=0,wireBytes=0,maximumFrameBytes=0,priorChainHash=null,lastNow=-Infinity;
 const pending=new Set();
 function fault(){failed=true;throw new ExecutionFailure();}
 function track(original){if(!safePromise(original)){unsafe=true;fault();}pending.add(original);
  return new NativePromise((resolve,reject)=>nativeThen.call(original,v=>{pending.delete(original);resolve({value:v});},e=>{pending.delete(original);reject(e);}));}
 function sync(v){if(types.isProxy(v)){unsafe=true;fault();}if(types.isPromise(v)){const p=track(v);nativeThen.call(p,()=>undefined,()=>undefined);fault();}if(failed)fault();return v;}
 function now(){const n=sync(c.now());yes(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n>=lastNow);lastNow=n;return n;}
 function check(){try{if(failed)fault();now();const g=sync(c.guard());yes(g===true||g===undefined);now();if(failed)fault();}catch{fault();}}
 async function call(action){check();const original=action();if(types.isProxy(original)){unsafe=true;fault();}const out=types.isPromise(original)?await track(original):{value:original};check();return out;}
 function count(n){yes(Number.isSafeInteger(n)&&n>0&&wireBytes+n<=67108864);wireBytes+=n;}
 const decimal=(v,max)=>{yes(typeof v==='string'&&/^(?:0|[1-9][0-9]{0,19})$/u.test(v)&&BigInt(v)<=max);return v;};
 return Object.freeze({
  async inspect(value){let owned=false;try{check();yes(!busy&&sequence<65536);busy=true;owned=true;
   const q=record(data(value),['pathKey','operationNonce','edge','parentPathKey']);
   proofKey(q.pathKey);
   yes(typeof q.operationNonce==='string'&&/^[A-Za-z0-9._:-]{1,160}$/u.test(q.operationNonce)&&['before','after'].includes(q.edge));
   yes(q.parentPathKey===null||q.edge==='after');if(q.parentPathKey!==null)proofKey(q.parentPathKey);
   const request={schema:'native-specificity-fs-request/v1',sequence:++sequence,phase:r.phase,sourceIdentityHash:r.sourceIdentityHash,
    pathKey:q.pathKey,operationNonce:q.operationNonce,edge:q.edge,parentPathKey:q.parentPathKey,priorChainHash};
   const raw=encode(request),frame=Buffer.concat([raw,Buffer.from('\n')]);yes(frame.length<=16384);count(frame.length);maximumFrameBytes=Math.max(maximumFrameBytes,frame.length);
   const requestedAt=now(),deadline=requestedAt+15000;yes((await call(()=>c.write(frame))).value===true);check();yes(now()<deadline);
   // Fixed bounded allocation; reject oversize BEFORE appending/UTF8/JSON parse.
   const retained=Buffer.alloc(16384);let used=0,complete=false;
   while(!complete){check();yes(now()<deadline);const chunk=(await call(()=>c.readChunk())).value;yes(chunk!==null);
    const b=buffer(chunk,16384);count(b.length);yes(used+b.length<=16384);const newline=b.indexOf(10);
    yes(newline===-1||newline===b.length-1);b.copy(retained,used);used+=b.length;
    if(newline!==-1)complete=true;
   }
   maximumFrameBytes=Math.max(maximumFrameBytes,used);yes(used>1);const ackBytes=retained.subarray(0,used-1),proof=record(parseCanonical(ackBytes,16383),
    ['schema','pathKey','operationNonce','edge','ancestorsChecked','openedIdentityChecked','attributes','identity','atomic','requestHash','receiptHash']);
   yes(proof.schema==='native-specificity-fs-proof/v1'&&proof.pathKey===q.pathKey&&proof.operationNonce===q.operationNonce&&proof.edge===q.edge&&proof.ancestorsChecked===true&&proof.openedIdentityChecked===true&&proof.atomic===false);
   yes(Number.isInteger(proof.attributes)&&proof.attributes>=0&&proof.attributes<4294967295&&(proof.attributes&1024)===0);
   const identity=record(proof.identity,['volumeSerial','fileIndex','creationFiletime','size','fileType']);
   decimal(identity.volumeSerial,4294967295n);decimal(identity.fileIndex,18446744073709551615n);decimal(identity.creationFiletime,18446744073709551615n);yes(identity.creationFiletime!=='0');decimal(identity.size,18446744073709551615n);yes(['file','directory'].includes(identity.fileType));
   const requestHash=fileHash(raw);yes(proof.requestHash===requestHash);const {receiptHash,...body}=proof;yes(metadataHash(body)===hash(receiptHash));
   check();yes(now()<deadline);const responseHash=fileHash(ackBytes);priorChainHash=metadataHash({previousChainHash:priorChainHash,requestHash,responseHash});
   check();yes(now()<deadline);return freeze(proof);
  }catch{fault();}finally{if(owned)busy=false;}},
  assertHealthy(){check();return true;},
  checkpoint(){try{check();yes(!busy&&pending.size===0&&!unsafe);const value=freeze({sequence,chainHash:priorChainHash});check();yes(!busy&&pending.size===0&&!unsafe&&sequence===value.sequence&&priorChainHash===value.chainHash);return value;}catch{fault();}},
  abandon(){fault();},
  snapshot(){return freeze({failed,unsafeOperationRefused:unsafe,pendingOriginals:pending.size,physicalExchangePending:busy,requests:sequence,
   combinedWireBytes:wireBytes,maximumFrameBytes,finalChainHash:priorChainHash,rawFramesRetained:false,independentRawFrameReplayPossible:false});}
 });
}
