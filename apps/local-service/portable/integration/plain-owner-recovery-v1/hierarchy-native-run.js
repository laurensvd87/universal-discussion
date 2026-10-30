// Maintained owned-run binding. Import performs no filesystem or native work.
import {lstat,realpath,open,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const ROOT='D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\portable\\data\\hierarchy-native-runs';
const PRIVATE_ROOT='C:\\Users\\Laurens\\AppData\\Local\\MurmingleRecovery\\plain-automatic18-v1';
const fail=()=>Object.assign(new Error('Owned run binding refused'),{code:'OWNED_RUN_BINDING'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])))+'\n';
const sameIdentity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const sameFile=(a,b)=>sameIdentity(a,b)&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
function ancestors(filename){const names=[];let cursor=filename;while(true){names.unshift(cursor);const next=path.win32.dirname(cursor);if(next===cursor)return names;cursor=next;}}

/** Trusted invented-filesystem seam only. Its result never grants a fixture or
 * enters the real cluster composition, whose reader/dependencies stay private. */
export function createOwnedRunReader({fs,temp,pid}){
 return createReader({fs,temp,pid},false);
}
export function createPrivateOwnedRunReader({fs,temp,pid}){
 return createReader({fs,temp,pid},true);
}
function createReader({fs,temp,pid},privateMode){
 const root=privateMode?PRIVATE_ROOT:ROOT,markerSchema=privateMode?'private-hierarchy-native-owned-run':'hierarchy-native-owned-run',claimSchema=privateMode?'private-hierarchy-native-child-claim':'hierarchy-native-child-claim';
 let attempted=null;
 return function read(){
  if(arguments.length) return Promise.reject(fail());
  if(attempted)return attempted;
  attempted=Promise.resolve().then(async()=>{
   if(typeof temp!=='string'||!Number.isSafeInteger(pid)||pid<1)throw fail();
   const prefix=root+'\\run-',suffix='\\output\\temp';
   if(!temp.startsWith(prefix)||!temp.endsWith(suffix))throw fail();
   const nonce=temp.slice(prefix.length,-suffix.length);
   if(!/^[0-9a-f]{48}$/u.test(nonce))throw fail();
   const runDirectory=root+'\\run-'+nonce;
   if(temp!==path.win32.join(runDirectory,'output','temp'))throw fail();
   const directories=ancestors(temp),identities=new Map();
   async function checkDirectories(initial=false){
    for(const name of directories){
     const info=await fs.lstat(name);
     if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(name)!==name)throw fail();
     if(initial)identities.set(name,info);else if(!sameIdentity(info,identities.get(name)))throw fail();
    }
   }
   await checkDirectories(true);
   async function bounded(name,cap){
    const filename=path.win32.join(runDirectory,name),before=await fs.lstat(filename);
    if(!before.isFile()||before.isSymbolicLink()||!Number.isSafeInteger(before.size)||before.size<1||before.size>cap||await fs.realpath(filename)!==filename)throw fail();
    const handle=await fs.open(filename,'r');let bytes;
    try{
     if(!sameFile(before,await handle.stat()))throw fail();
     const buffer=Buffer.alloc(cap+1);let used=0;
     while(used<buffer.length){const read=await handle.read(buffer,used,buffer.length-used,null);if(read.bytesRead===0)break;used+=read.bytesRead;}
     if(used!==before.size||used>cap||!sameFile(before,await handle.stat()))throw fail();
     bytes=buffer.subarray(0,used);
    }finally{await handle.close();}
    const after=await fs.lstat(filename);
    if(!sameFile(before,after)||after.isSymbolicLink()||await fs.realpath(filename)!==filename)throw fail();
    return {bytes,info:after};
   }
   const marker=await bounded('run.json',1024),pending=await bounded('run.pending',1024);
   if(!sameIdentity(marker.info,pending.info)||!marker.bytes.equals(pending.bytes))throw fail();
   let value;try{value=JSON.parse(marker.bytes.toString('utf8'));}catch{throw fail();}
   if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='catalogSha256,nonce,runDirectory,schema'||
    value.schema!==markerSchema||value.nonce!==nonce||value.runDirectory!==runDirectory||
    typeof value.catalogSha256!=='string'||!/^[0-9a-f]{64}$/u.test(value.catalogSha256)||
    !marker.bytes.equals(Buffer.from(canonical(value),'ascii')))throw fail();
   const catalog=await bounded('reviewed-sources.json',1048576);
   if(sha(catalog.bytes)!==value.catalogSha256)throw fail();
   await checkDirectories();
   const claim={catalogSha256:value.catalogSha256,markerSha256:sha(marker.bytes),nonce,pid,schema:claimSchema};
   const claimBytes=Buffer.from(canonical(claim),'ascii');if(claimBytes.length>1024)throw fail();
   // Never unlink/refund this permanent attempt, even if writing/linking fails.
   const claimPending=path.win32.join(runDirectory,'child.pending'),claimFinal=path.win32.join(runDirectory,'child.claim');
   const handle=await fs.open(claimPending,'wx');
   try{await handle.writeFile(claimBytes);}finally{await handle.close();}
   await fs.link(claimPending,claimFinal);
   const claimed=await bounded('child.claim',1024),claimedPending=await bounded('child.pending',1024);
   if(!sameIdentity(claimed.info,claimedPending.info)||!claimed.bytes.equals(claimBytes)||!claimedPending.bytes.equals(claimBytes))throw fail();
   for(const [name,original,cap] of [['run.json',marker,1024],['run.pending',pending,1024],['reviewed-sources.json',catalog,1048576]]){
    const current=await bounded(name,cap);if(!sameFile(original.info,current.info)||!original.bytes.equals(current.bytes))throw fail();
   }
   await checkDirectories();
   return Object.freeze({runDirectory,clusterParent:path.win32.join(runDirectory,'cluster'),nonce,catalogSha256:value.catalogSha256,markerSha256:claim.markerSha256});
  });
  return attempted;
 };
}

let reader=null;
let privateReader=null;
/** No caller path, options, environment-name or filesystem selector. */
export function readOwnedRunBinding(){
 if(arguments.length)return Promise.reject(fail());
 if(reader===null)reader=createOwnedRunReader({fs:{lstat,realpath,open,link},temp:process.env.TEMP,pid:process.pid});
 return reader();
}
/** Fixed private root and purpose; cannot read/adopt a synthetic run. */
export function readOwnedPrivateRunBinding(){
 if(arguments.length)return Promise.reject(fail());
 if(privateReader===null)privateReader=createPrivateOwnedRunReader({fs:{lstat,realpath,open,link},temp:process.env.TEMP,pid:process.pid});
 return privateReader();
}
