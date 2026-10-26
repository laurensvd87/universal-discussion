// Default-inert physical IO adapter. Actual invocation requires separate review/grant.
import {lstat,realpath,open,mkdir,opendir,link} from 'node:fs/promises';
import {win32 as path} from 'node:path';
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const DEFAULT_FS=Object.freeze({lstat,realpath,open,mkdir,opendir,link});
// One fixed, one-use producer-ordering capability; not a filesystem authority.
// Per live token: empty token32 + record64 + health closure64 + hash128 <=288
// logical bytes, referencing (not copying) the already owned IO/adapter. There
// is at most one such entry per actual IO instance; consuming deletes it before
// health can fail. No request Buffer, frame, path or exception is retained here.
// These are logical bounds, not a V8 heap claim or an added memory allowance.
const finishPublications=new WeakMap();
export function consumeSpecificityFinishPublication(io,token,expectedAdapter){
 need(arguments.length===3&&token!==null&&typeof token==='object'&&!types.isProxy(token));
 const owned=finishPublications.get(token);
 need(owned!==undefined&&owned.owner===io&&owned.adapter===expectedAdapter);
 finishPublications.delete(token); // Burn before health/transport can fail.
 owned.healthy();return owned.sha256;
}
const P=Promise,then=Promise.prototype.then,set=Uint8Array.prototype.set;
const length=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
const sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
const ASSET_ROOT='spikes/topic-resolution/browser/embedding/.assets';
const ASSETS=['model.onnx','tokenizer.json','tokenizer_config.json','config.json','special_tokens_map.json','tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'];
const STAGE=['batch-config.js','chromium/page-content-reader.js','core/page-content-policy.js','manifest.json','native-adapter.js','native-rights.js','worker.js'];
const MODEL='f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193',TOKENIZER='0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39';
export const IO_LIMITS=Object.freeze({fileBytes:4194304,packageFiles:115,packageBytes:16777216,stageBytes:524288,
 chunkBytes:1048576,assetBytes:268435456,batchBytes:536870912,batchEntries:8192,workspaceBytes:8589934592,workspaceEntries:344064,depth:32});
class IoError extends Error{constructor(){super('Specificity IO refused');this.code='SPECIFICITY_IO';}}
function need(v){if(v!==true)throw new IoError();}
function rec(v,keys){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null));
 need(Reflect.ownKeys(v).length===keys.length);return Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable===true&&Object.hasOwn(d,'value'));return [k,d.value];}));}
function array(v,max){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype);
 const n=Object.getOwnPropertyDescriptor(v,'length').value;need(n<=max&&Reflect.ownKeys(v).length===n+1);return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,''+i);need(d?.enumerable===true&&Object.hasOwn(d,'value'));return d.value;});}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function copy(v,b={n:20000},d=0){need(--b.n>=0&&d<=24);if(v===null||typeof v!=='object'){need(v===null||['string','number','boolean'].includes(typeof v));if(typeof v==='string')need(v.length<=1048576&&v.isWellFormed());if(typeof v==='number')need(Number.isFinite(v));return v;}
 need(!types.isProxy(v));if(Array.isArray(v))return array(v,8192).map(x=>copy(x,b,d+1));need(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
 const keys=Reflect.ownKeys(v);need(keys.length<=1024);const out={};for(const k of keys){need(typeof k==='string'&&k.length<=512);const p=Object.getOwnPropertyDescriptor(v,k);need(p?.enumerable===true&&Object.hasOwn(p,'value'));Object.defineProperty(out,k,{value:copy(p.value,b,d+1),enumerable:true});}return out;}
function hash(v){need(typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v));return v;}
function integer(v,max,min=1){need(Number.isSafeInteger(v)&&v>=min&&v<=max&&!Object.is(v,-0));return v;}
function relative(v){need(typeof v==='string'&&v.length>0&&v.length<=512&&v.isWellFormed()&&!/[\\:\u0000-\u001f\u007f-\u009f]/u.test(v)&&!v.startsWith('/'));
 for(const part of v.split('/')){need(part.length>0&&part!=='.'&&part!=='..'&&part.length<=255&&!/[. ]$/u.test(part)&&!/[<>"|?*]/u.test(part)&&! /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part));}return v;}
function key(v){need(typeof v==='string'&&v.length>0&&v.length<=512&&!/[\u0000-\u0020\u007f-\u009f]/u.test(v));return v;}
function absolute(v){need(typeof v==='string'&&/^[A-Z]:\\/u.test(v)&&!v.endsWith('\\')&&path.normalize(v)===v&&!v.includes('/'));return v;}
function within(root,p){const r=path.relative(root,p);need(r!==''&&!r.startsWith('..')&&!path.isAbsolute(r));return r;}
function safePromise(v){if(types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==P.prototype)return false;
 return Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});}
function byteCopy(v,max){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Buffer.isBuffer(v)&&Object.getPrototypeOf(v)===Buffer.prototype);const n=Reflect.apply(length,v,[]);integer(n,max);const out=Buffer.alloc(n);Reflect.apply(set,out,[v]);return out;}
function data(v,k){need(v!==null&&typeof v==='object'&&!types.isProxy(v));const d=Object.getOwnPropertyDescriptor(v,k);need(d&&Object.hasOwn(d,'value'));return d.value;}
function stat(s){const out={};for(const k of ['dev','ino','mode','size','birthtimeNs','mtimeNs','ctimeNs','nlink']){const v=data(s,k);need(typeof v==='bigint'&&v>=0n);out[k]=v.toString();}
 need(BigInt(out.ino)>0n);const type=BigInt(out.mode)&0o170000n;need(type===0o100000n||type===0o040000n);out.type=type===0o100000n?'file':'directory';return freeze(out);}
function same(a,b){return digest(a)===digest(b);}
function sameObject(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.birthtimeNs===b.birthtimeNs&&a.type===b.type;}
function nativeObject(a,b){return ['volumeSerial','fileIndex','creationFiletime','fileType'].every(k=>a[k]===b[k]);}
function absent(e){if(!e||typeof e!=='object'||types.isProxy(e))return false;const d=Object.getOwnPropertyDescriptor(e,'code');return d&&Object.hasOwn(d,'value')&&d.value==='ENOENT';}
function ackName(v){return v==='ack.json'||v==='finish.ack.json'||v==='cohort.drain.ack.json'||/^batch-(?:0[1-9]|1[0-9]|2[0-4])\.(?:start|drain)\.ack\.json$/u.test(v)||/^model-(?:fitting|assessment|checks)\.ack\.json$/u.test(v);}

/** trustedFs is an invented seam in tests; default functions do nothing until a
 * returned method is explicitly invoked. Native proof/authentication is external. */
export function createSpecificityIo(config,trustedFs=DEFAULT_FS){
 const a=rec(config,['repoRoot','workspaceRoot','catalog','expectedCatalogHash','workspaceLayout','expectedWorkspaceLayoutHash','sourceAssetRoot','inspectNoReparse','guard','cleanupGuard']);
 const repo=absolute(a.repoRoot),workspace=absolute(a.workspaceRoot);within(repo,workspace);need(a.sourceAssetRoot===ASSET_ROOT);
 for(const f of [a.inspectNoReparse,a.guard,a.cleanupGuard])need(typeof f==='function'&&!types.isProxy(f));
 const fs=rec(trustedFs,['lstat','realpath','open','mkdir','opendir','link']);for(const f of Object.values(fs))need(typeof f==='function'&&!types.isProxy(f));
 const catalog=freeze(copy(a.catalog)),layout=freeze(copy(a.workspaceLayout));hash(a.expectedCatalogHash);hash(a.expectedWorkspaceLayoutHash);
 need(digest(catalog)===a.expectedCatalogHash&&digest(layout)===a.expectedWorkspaceLayoutHash);
 need(catalog.schema==='native-specificity-source-catalog/v1');const entries=new Map(),entryPaths=new Set();
 // ADR200 static catalog only:142 authenticated base entries plus6 fixed TEST
 // controls. Runtime IO/resource budgets and separate TEST admission stay fixed.
 for(const raw of array(catalog.entries,148)){const s=rec(raw,['key','path','kind','maximumBytes','sha256']);key(s.key);relative(s.path);integer(s.maximumBytes,IO_LIMITS.fileBytes);need(!entries.has(s.key)&&!entryPaths.has(s.path.toLowerCase()));entries.set(s.key,freeze(s));entryPaths.add(s.path.toLowerCase());}
 relative(catalog.package.rootKey);need(catalog.package.prefix==='node_modules/playwright-core/'&&catalog.package.files===115);integer(catalog.package.bytes,IO_LIMITS.packageBytes);
 rec(layout,['directories','files']);const dirs=new Set(),files=new Map(),casePaths=new Set();
 for(const name of array(layout.directories,8192)){relative(name);need(!casePaths.has(name.toLowerCase()));dirs.add(name);casePaths.add(name.toLowerCase());}
 for(const raw of array(layout.files,8192)){const f=rec(raw,['path','maximumBytes']);relative(f.path);integer(f.maximumBytes,IO_LIMITS.fileBytes);need(!f.path.endsWith('.pending')&&!casePaths.has(f.path.toLowerCase()));files.set(f.path,f.maximumBytes);casePaths.add(f.path.toLowerCase());}
 for(const name of [...dirs,...files.keys()]){const parent=path.posix.dirname(name);need(parent==='.'||dirs.has(parent));}
 let failed=false,fault=null,busy=false,created=false,sequence=0,unsafeOperationRefused=false,closeUncertain=false,finishAttempted=false,api;
 const pending=new Set(),handles=new Set(),closed=new WeakMap(),stages=new WeakSet();
 function poison(){if(!failed){failed=true;fault=new IoError();}return fault;}
 function track(original){if(!safePromise(original)){unsafeOperationRefused=true;throw poison();}pending.add(original);return new P((resolve,reject)=>then.call(original,v=>{pending.delete(original);resolve({value:v});},e=>{pending.delete(original);reject(e);}));}
 function syncGuard(f,cleanup=false){try{if(failed&&!cleanup)throw fault;const v=f();if(types.isProxy(v)){unsafeOperationRefused=true;throw new IoError();}if(types.isPromise(v)){const p=track(v);then.call(p,()=>undefined,()=>undefined);throw new IoError();}need(v===undefined||v===true);if(failed&&!cleanup)throw fault;}catch{throw poison();}}
 const check=()=>syncGuard(a.guard);
 async function call(action,cleanup=false){if(cleanup)syncGuard(a.cleanupGuard,true);else check();const raw=action();if(types.isProxy(raw)){unsafeOperationRefused=true;throw poison();}const result=types.isPromise(raw)?await track(raw):{value:raw};if(cleanup)syncGuard(a.cleanupGuard,true);else check();return result;}
 function method(h,k){need(h!==null&&typeof h==='object'&&!types.isProxy(h));let at=h,f;
  for(let i=0;i<8&&at!==null;i++,at=Object.getPrototypeOf(at)){need(!types.isProxy(at));const d=Object.getOwnPropertyDescriptor(at,k);if(d){need(Object.hasOwn(d,'value'));f=d.value;break;}}
  need(typeof f==='function'&&!types.isProxy(f));return (...args)=>Reflect.apply(f,h,args);}
 async function close(h){if(closed.has(h))return closed.get(h);const task=(async()=>{try{await call(()=>method(h,'close')(),true);handles.delete(h);}catch{closeUncertain=true;throw poison();}})();closed.set(h,task);return task;}
 async function acquire(action){check();const raw=action();if(types.isProxy(raw)){unsafeOperationRefused=true;throw poison();}
  const result=types.isPromise(raw)?await track(raw):{value:raw};const h=result.value;need(h!==null&&typeof h==='object');handles.add(h);
  try{check();}catch(e){await close(h);throw e;}return result;}
 async function run(fn){let ownsBusy=false;try{need(!busy);busy=true;ownsBusy=true;check();const result=await fn();check();need(pending.size===0&&handles.size===0&&!unsafeOperationRefused&&!closeUncertain);return {value:result};}catch{throw poison();}finally{if(ownsBusy)busy=false;}}
 function resolveRepo(rel){relative(rel);const p=path.join(repo,...rel.split('/'));within(repo,p);return p;}
 function resolveWork(rel){need(created);relative(rel);const p=path.join(workspace,...rel.split('/'));within(workspace,p);return p;}
 const workKey=rel=>'workspace:'+rel;
 const parentRel=rel=>path.posix.dirname(rel)==='.'?'':path.posix.dirname(rel);
 function nonce(){integer(++sequence,1048576);return digest({catalogHash:a.expectedCatalogHash,workspace,sequence});}
 async function checked(p,expectedType,identityOnly=false){
  const parsed=path.parse(p);need(parsed.root.length===3);let current=parsed.root;
  const parts=p.slice(parsed.root.length).split('\\').filter(Boolean);let leaf;
  for(let i=-1;i<parts.length;i++){
   if(i>=0)current=path.join(current,parts[i]);const before=stat((await call(()=>fs.lstat(current,{bigint:true}))).value);
   need(i===parts.length-1||before.type==='directory');need((await call(()=>fs.realpath(current))).value===current);
   const after=stat((await call(()=>fs.lstat(current,{bigint:true}))).value);need(identityOnly?sameObject(before,after):same(before,after));leaf=after;
  }if(expectedType)need(leaf.type===expectedType);return leaf;
 }
 async function proof(p,pathKey,operationNonce,edge,nodeIdentity,parentPathKey=null){
  const context=freeze({schema:'native-specificity-io-proof-context/v1',pathKey,operationNonce,edge,parentPathKey,nodeFileIdentityHash:digest(nodeIdentity)});
  const raw=(await call(()=>a.inspectNoReparse(p,context))).value;
  const r=rec(raw,['schema','pathKey','operationNonce','edge','ancestorsChecked','openedIdentityChecked','attributes','identity','atomic','requestHash','receiptHash']);
  need(r.schema==='native-specificity-fs-proof/v1'&&r.pathKey===pathKey&&r.operationNonce===operationNonce&&r.edge===edge&&r.ancestorsChecked===true&&r.openedIdentityChecked===true&&r.atomic===false);
  integer(r.attributes,4294967294,0);need((r.attributes&1024)===0);hash(r.requestHash);hash(r.receiptHash);
  const id=rec(r.identity,['volumeSerial','fileIndex','creationFiletime','size','fileType']);
  for(const k of ['volumeSerial','fileIndex','creationFiletime','size'])need(typeof id[k]==='string'&&/^(?:0|[1-9][0-9]{0,31})$/u.test(id[k]));
  need(id.fileType===nodeIdentity.type&&['file','directory'].includes(id.fileType)&&((r.attributes&16)!==0)===(id.fileType==='directory'));
  return freeze(copy(r));
 }
 async function existing(p,k,type,action){
  const before=await checked(p,type),op=nonce(),first=await proof(p,k,op,'before',before);
  const result=await action(before);
  const after=await checked(p,type);need(same(before,after));const last=await proof(p,k,op,'after',after);need(nativeObject(first.identity,last.identity)&&first.identity.size===last.identity.size);return result;
 }
 async function read(p,k,max,{hashOnly=false,expectedBytes=null,chunk=null,observed=null}={}){
  return existing(p,k,'file',async before=>{
   if(observed!==null)need(same(observed,before));
   const size=BigInt(before.size);need(size>0n&&size<=BigInt(max));if(expectedBytes!==null)need(size===BigInt(expectedBytes));
   let h;try{h=(await acquire(()=>fs.open(p,'r'))).value;
    const initial=stat((await call(()=>method(h,'stat')({bigint:true}))).value);need(same(before,initial));
    const total=Number(size),out=hashOnly?null:Buffer.alloc(total),buffer=chunk??Buffer.alloc(Math.min(total,IO_LIMITS.chunkBytes)),hasher=hashOnly?createHash('sha256'):null;
    let position=0;while(position<total){const n=Math.min(buffer.length,total-position),target=out??buffer;
     const reply=(await call(()=>method(h,'read')(target,out?position:0,n,position))).value;
     const count=data(reply,'bytesRead');integer(count,n);if(hasher)hasher.update(buffer.subarray(0,count));position+=count;}
    const end=stat((await call(()=>method(h,'stat')({bigint:true}))).value);need(same(initial,end));return hashOnly?{bytes:total,sha256:hasher.digest('hex')}:out;
   }finally{if(h)await close(h);}
  });
 }
 async function directory(p,k,visit,limit=IO_LIMITS.batchEntries){return existing(p,k,'directory',async()=>{
  let d;try{d=(await acquire(()=>fs.opendir(p))).value;const names=new Set();let count=0;
   for(;;){const r=(await call(()=>method(d,'read')())).value;if(r===null)break;const name=data(r,'name');relative(name);need(!name.includes('/')&&++count<=limit&&!names.has(name.toLowerCase()));names.add(name.toLowerCase());await visit(name);}
  }finally{if(d)await close(d);}
 });}
 async function createDir(rel,workspaceItself=false){
  const p=workspaceItself?workspace:resolveWork(rel),parent=path.dirname(p),pk=workspaceItself?'workspace-parent':workKey(parentRel(rel)),k=workspaceItself?'workspace:':workKey(rel);
  const before=await checked(parent,'directory'),op=nonce();await proof(parent,pk,op,'before',before);
  let missing=false;try{await call(()=>fs.lstat(p,{bigint:true}));}catch(e){if(absent(e))missing=true;else throw e;}need(missing);
  await call(()=>fs.mkdir(p,{recursive:false}));const after=await checked(p,'directory');await proof(p,k,op,'after',after,pk);
  const endParent=await checked(parent,'directory');need(sameObject(before,endParent));return after;
 }
 async function freshFile(rel,b){const p=resolveWork(rel),parent=path.dirname(p),pk=workKey(parentRel(rel)),before=await checked(parent,'directory'),op=nonce();await proof(parent,pk,op,'before',before);let h,finalOpened;
  try{h=(await acquire(()=>fs.open(p,'wx'))).value;const initial=stat((await call(()=>method(h,'stat')({bigint:true}))).value);need(initial.type==='file'&&initial.size==='0'&&initial.nlink==='1');
   let position=0;while(position<b.length){const n=Math.min(IO_LIMITS.chunkBytes,b.length-position),r=(await call(()=>method(h,'write')(b,position,n,position))).value;const count=data(r,'bytesWritten');integer(count,n);position+=count;}
   await call(()=>method(h,'sync')());finalOpened=stat((await call(()=>method(h,'stat')({bigint:true}))).value);need(sameObject(initial,finalOpened)&&BigInt(finalOpened.size)===BigInt(b.length)&&finalOpened.nlink==='1');
  }finally{if(h)await close(h);}
  const after=await checked(p,'file');need(sameObject(finalOpened,after)&&BigInt(after.size)===BigInt(b.length)&&after.nlink==='1');await proof(p,workKey(rel),op,'after',after,pk);need(sameObject(before,await checked(parent,'directory')));return after;
 }
 function callback(fn){need(typeof fn==='function'&&!types.isProxy(fn));return async()=>{const r=(await call(fn)).value;need(r===undefined||r===true);};}
 async function workspaceRead(rel){need(files.has(rel));return read(resolveWork(rel),workKey(rel),files.get(rel));}
 async function count(rel,scope){need(scope==='all'||scope==='batch');if(rel!==null)need(dirs.has(rel));else need(scope==='all');
  const maxBytes=scope==='all'?IO_LIMITS.workspaceBytes:IO_LIMITS.batchBytes,maxEntries=scope==='all'?IO_LIMITS.workspaceEntries:IO_LIMITS.batchEntries;
  const start=rel===null?workspace:resolveWork(rel);need(created);let total=0,entriesCount=0,fileCount=0,dirCount=0;
  async function walk(p,r,depth){need(depth<=IO_LIMITS.depth);const s=await checked(p);need(++entriesCount<=maxEntries);if(s.type==='file'){
    const n=BigInt(s.size);need(n<=BigInt(maxBytes-total));total+=Number(n);fileCount++;const op=nonce();await proof(p,workKey(r),op,'before',s);need(same(s,await checked(p,'file')));await proof(p,workKey(r),op,'after',s);return;}
   dirCount++;await directory(p,workKey(r),async name=>walk(path.join(p,name),r?r+'/'+name:name,depth+1));}
  await walk(start,rel??'',0);return freeze({bytes:total,entries:entriesCount,files:fileCount,directories:dirCount,scope,directory:rel,retained:true});
 }
 async function checkStage(directoryRel,stage){const found=[];let total=0;
  async function walk(rel,local,depth){need(depth<=2);await directory(resolveWork(rel),workKey(rel),async name=>{
    const r=rel+'/'+name,l=local?local+'/'+name:name,s=await checked(resolveWork(r));
    if(s.type==='directory'){need(l==='chromium'||l==='core');found.push(l+'/');await walk(r,l,depth+1);}else{need(STAGE.includes(l));const expected=stage.files.find(f=>f.path===l),b=await read(resolveWork(r),workKey(r),131072);need(b.length===expected.bytes&&sha(b)===expected.sha256);total+=b.length;need(total<=IO_LIMITS.stageBytes);found.push(l);}});}
  await walk(directoryRel,'',0);need(same(found.sort(),[...STAGE,'chromium/','core/'].sort()));return true;
 }
 api=Object.freeze({
  async readEntry(raw){return (await run(async()=>{const s=rec(raw,['key','path','kind','maximumBytes','sha256']),expected=entries.get(s.key);need(expected!==undefined&&same(s,expected));return read(resolveRepo(s.path),s.key,s.maximumBytes);})).value;},
  async walkPackage(rootKey){return (await run(async()=>{need(rootKey===catalog.package.rootKey);const rows=[];let total=0,visited=0;
   async function walk(rel,logical,depth){need(depth<=8&&++visited<=8192);await directory(resolveRepo(rel),logical,async name=>{need(++visited<=8192);const r=rel+'/'+name,k=logical+'/'+name,s=await checked(resolveRepo(r));if(s.type==='directory')await walk(r,k,depth+1);else{
    need(rows.length<115);const b=await read(resolveRepo(r),k,Math.min(IO_LIMITS.fileBytes,IO_LIMITS.packageBytes-total));total+=b.length;need(total<=IO_LIMITS.packageBytes);rows.push({path:k,bytes:b});}},128);}
   await walk(rootKey,catalog.package.prefix.slice(0,-1),0);need(rows.length===115&&total===catalog.package.bytes);rows.sort((x,y)=>x.path<y.path?-1:x.path>y.path?1:0);return rows;})).value;},
  async createWorkspace(){return (await run(async()=>{need(!created);const identity=await createDir('',true);created=true;return freeze({path:workspace,identity});})).value;},
  async createDirectory(rel){return (await run(async()=>{need(dirs.has(rel));const identity=await createDir(rel);return freeze({path:resolveWork(rel),identity});})).value;},
  async readWorkspaceFile(rel){return (await run(()=>workspaceRead(rel))).value;},
  async readPublishedIfPresent(rel){return (await run(async()=>{
   need(typeof rel==='string'&&files.has(rel)&&ackName(rel));const p=resolveWork(rel);
   // Absence observes metadata only. It neither proves no-reparse nor grants ACK
   // authority, so it must not consume the parent's bounded native-proof chain.
   const before=await checked(workspace,'directory',true);let first=null,missing=false;
   try{first=stat((await call(()=>fs.lstat(p,{bigint:true}))).value);}catch(e){if(absent(e))missing=true;else throw e;}
   if(missing){const after=await checked(workspace,'directory',true);need(sameObject(before,after));return null;}
   need(first.type==='file');return read(p,workKey(rel),Math.min(files.get(rel),16384),{observed:first});
  })).value;},
  async publishExclusive(input){return (await run(async()=>{const r=rec(input,['path','bytes','beforePublish']);need(files.has(r.path));const b=byteCopy(r.bytes,files.get(r.path)),pendingRel=r.path+'.pending',p=resolveWork(r.path),pendingPath=resolveWork(pendingRel);
   const beforePublish=callback(r.beforePublish);const id=await freshFile(pendingRel,b);need(sha(await read(pendingPath,workKey(pendingRel),files.get(r.path)))===sha(b));
   const op=nonce(),pre=await checked(pendingPath,'file');need(sameObject(id,pre));const nativeBefore=await proof(pendingPath,workKey(pendingRel),op,'before',pre);await beforePublish();
   await call(()=>fs.link(pendingPath,p));const final=await checked(p,'file');need(sameObject(pre,final)&&BigInt(final.nlink)>=2n);const nativeAfter=await proof(p,workKey(r.path),op,'after',final,workKey(pendingRel));need(nativeObject(nativeBefore.identity,nativeAfter.identity));
   need(sha(await read(p,workKey(r.path),files.get(r.path)))===sha(b));return freeze({path:p,sha256:sha(b),bytes:b.length,atomicExclusivePublication:true,pendingRetained:true});})).value;},
  async publishFinishExclusive(input){try{
   need(arguments.length===1&&!finishAttempted);finishAttempted=true;
   const r=rec(input,['bytes','beforePublish']);
   const published=await api.publishExclusive({path:'finish.request.json',bytes:r.bytes,beforePublish:r.beforePublish});
   const healthy=()=>{check();need(!busy&&!failed&&pending.size===0&&handles.size===0&&!unsafeOperationRefused&&!closeUncertain);};
   healthy();const token=Object.freeze({});
   finishPublications.set(token,{owner:api,adapter:a.inspectNoReparse,sha256:published.sha256,healthy});return token;
  }catch{throw poison();}},
  async stageExtension(input){return (await run(async()=>{const r=rec(input,['directory','stage','expectedStageIdentity','beforePublish']);need(dirs.has(r.directory));hash(r.expectedStageIdentity);
   const s=rec(copy(r.stage),['schema','panelIdentity','manifestHash','batchId','batchScopeHash','sourceHashes','files','sourceBytes','outputBytes','stageIdentity','actualStagePublished','layoutVerified','nativeReady','assignmentAuthority']);
   need(s.schema==='native-specificity-stage-recipe/v1'&&s.stageIdentity===r.expectedStageIdentity);for(const k of ['panelIdentity','manifestHash','batchId','batchScopeHash'])hash(s[k]);
   for(const k of ['actualStagePublished','layoutVerified','nativeReady','assignmentAuthority'])need(s[k]===false);
   const sourcePins=rec(s.sourceHashes,['manifest.json','worker.js','native-adapter.js','native-rights.js','chromium/page-content-reader.js','core/page-content-policy.js']);for(const h of Object.values(sourcePins))hash(h);
   integer(s.sourceBytes,IO_LIMITS.stageBytes);const f=array(s.files,7);need(f.length===7&&same(f.map(x=>x.path).sort(),STAGE));
   for(const raw of f){const x=rec(raw,['path','text','bytes','sha256']);need(typeof x.text==='string'&&x.text.isWellFormed());hash(x.sha256);const n=Buffer.byteLength(x.text);integer(n,x.path==='manifest.json'||x.path==='batch-config.js'?16384:131072);need(x.bytes===n&&sha(x.text)===x.sha256&&files.has(r.directory+'/'+x.path)&&n<=files.get(r.directory+'/'+x.path));}
   need(f.reduce((n,x)=>n+x.bytes,0)<=IO_LIMITS.stageBytes&&s.outputBytes===f.reduce((n,x)=>n+x.bytes,0));
   const identity={schema:s.schema,panelIdentity:s.panelIdentity,manifestHash:s.manifestHash,batchId:s.batchId,batchScopeHash:s.batchScopeHash,sourceHashes:s.sourceHashes,files:f.map(({path,bytes,sha256})=>({path,bytes,sha256}))};need(digest(identity)===s.stageIdentity);
   const beforePublish=callback(r.beforePublish);await createDir(r.directory);for(const sub of ['chromium','core']){need(dirs.has(r.directory+'/'+sub));await createDir(r.directory+'/'+sub);}
   let rootEntries=0;await directory(resolveWork(r.directory),workKey(r.directory),async name=>{need(name==='chromium'||name==='core');rootEntries++;});need(rootEntries===2);
   let empty=0;for(const sub of ['chromium','core'])await directory(resolveWork(r.directory+'/'+sub),workKey(r.directory+'/'+sub),async()=>{empty++;});need(empty===0);
   for(const x of f)await freshFile(r.directory+'/'+x.path,Buffer.from(x.text));await checkStage(r.directory,s);await beforePublish();check();
   const handle=Object.freeze({path:resolveWork(r.directory),stageIdentity:s.stageIdentity,recheck:async()=>{need(stages.has(handle));return (await run(()=>checkStage(r.directory,s))).value;}});stages.add(handle);return handle;})).value;},
  async countWorkspace(input){return (await run(async()=>{const r=rec(input,['directory','scope']);return count(r.directory,r.scope);})).value;},
  async streamAssets(pins){return (await run(async()=>{const list=array(pins,9).map(p=>rec(p,['filename','bytes','sha256']));need(list.length===9&&same(list.map(p=>p.filename).sort(),[...ASSETS].sort()));let expectedTotal=0;
   for(const p of list){integer(p.bytes,125829120);hash(p.sha256);expectedTotal+=p.bytes;need(expectedTotal<=IO_LIMITS.assetBytes);}
   need(list.find(p=>p.filename==='model.onnx').sha256===MODEL&&list.find(p=>p.filename==='model.onnx').bytes===118308185&&list.find(p=>p.filename==='tokenizer.json').sha256===TOKENIZER&&list.find(p=>p.filename==='tokenizer.json').bytes===17082730);
   const chunk=Buffer.alloc(IO_LIMITS.chunkBytes),out=[];for(const name of ASSETS){const pin=list.find(p=>p.filename===name),actual=await read(resolveRepo(ASSET_ROOT+'/'+name),'asset:'+name,pin.bytes,{hashOnly:true,expectedBytes:pin.bytes,chunk});need(actual.sha256===pin.sha256);out.push({filename:name,...actual});}
   return freeze({assets:out,bytes:expectedTotal,assetPinsHash:digest(list),buffersReturned:false});})).value;},
  snapshot(){return freeze({failed,busy,created,pendingOriginals:pending.size,openHandles:handles.size,closeUncertain,unsafeOperationRefused});}
 });
 return api;
}
