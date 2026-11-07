// Separate exact17 archive stream contract. No import/construction IO; no
// arbitrary larger dumps, target selector, filename, credential read or live DB.
// Native caller must first establish its fresh owned server/OID and pass only
// its ephemeral password. Errors can be joined to that lifecycle's private set.
import {createHash} from 'node:crypto';import {types} from 'node:util';import path from 'node:path';
import {SCOPED_CLUSTER as FIXED} from '../hierarchy-native-cluster.js';
export const FIXED_AUTOMATIC18_DUMP=Object.freeze({bytes:1354423835,sha256:'b5b71ee2bdf8b1b0e5b0b004915ca26df5a18360311f85a3ec988002103c0019'});
export const isFixedAutomatic18Dump=(bytes,sha256)=>bytes===FIXED_AUTOMATIC18_DUMP.bytes&&sha256===FIXED_AUTOMATIC18_DUMP.sha256;
export function createFixedAutomatic18RestorePump({spawn:launch,now,setTimeout:schedule,clearTimeout:cancel,environment:env,failureFactory=null}){
 const errors=new WeakSet();
 const failure=code=>{const error=failureFactory?failureFactory(code):Object.assign(new Error('Fixed automatic18 restore refused or failed'),{code});errors.add(error);return error;};
 let last=null;
 const check=deadline=>{const time=now();if(!Number.isFinite(time)||time<0||last!==null&&time<last||!Number.isFinite(deadline)||deadline<0)throw failure('OWNED_CLOCK');last=time;if(time>=deadline)throw failure('OWNED_DEADLINE');return time;};
 return async function restore({password,dump,dumpBytes,dumpSha256,deadline}){
  check(deadline);if(typeof password!=='string'||!password.length||!isFixedAutomatic18Dump(dumpBytes,dumpSha256))throw failure('OWNED_RESTORE_REQUEST');
  const environment={...env(),PGPASSWORD:password,PGCONNECT_TIMEOUT:'5'};
  let child,first=false,primary,closed=false,exitCode=null,stdoutEof=false,stderrEof=false,timer;
  const remember=e=>{if(!first){first=true;primary=e;}};
  const stop=e=>{remember(e);try{child?.kill();}catch{}};
  try{child=launch(path.win32.join(FIXED.bin,'pg_restore.exe'),['--host=127.0.0.1','--port=55433','--username=postgres','--dbname='+FIXED.databaseA,'--exit-on-error','--single-transaction','--no-password'],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:environment});}
  catch{environment.PGPASSWORD=undefined;throw failure('OWNED_RESTORE_START');}
  const originalClose=new Promise(resolve=>{child.once('close',code=>{closed=true;exitCode=code;resolve();});});
  child.once('error',()=>stop(failure('OWNED_RESTORE_PROCESS')));child.stdin.on('error',()=>stop(failure('OWNED_RESTORE_STDIN')));
  const drain=async(stream,isError)=>{let total=0;try{for await(const chunk of stream){if(!Buffer.isBuffer(chunk))throw failure('OWNED_RESTORE_OUTPUT');try{total+=chunk.length;if(total>65536)throw failure('OWNED_RESTORE_OUTPUT');}finally{chunk.fill(0);}}if(isError)stderrEof=true;else stdoutEof=true;}catch{stop(failure('OWNED_RESTORE_OUTPUT'));}};
  const feed=async()=>{let total=0,magic=Buffer.alloc(0);const digest=createHash('sha256');try{
   for await(const chunk of dump){check(deadline);if(types.isProxy(chunk)||!Buffer.isBuffer(chunk)||chunk.length<1||chunk.length>65536)throw failure('OWNED_RESTORE_INPUT');
    try{if(first)throw primary;total+=chunk.length;if(total>dumpBytes)throw failure('OWNED_RESTORE_INPUT');digest.update(chunk);if(magic.length<5)magic=Buffer.concat([magic,chunk.subarray(0,5-magic.length)]);
     // write(true) is NOT ownership release. Await the callback for EVERY chunk.
     await new Promise((resolve,reject)=>{child.stdin.write(chunk,error=>error?reject(failure('OWNED_RESTORE_STDIN')):resolve());});check(deadline);
    }finally{chunk.fill(0);}
   }
   if(total!==dumpBytes||digest.digest('hex')!==dumpSha256||!magic.equals(Buffer.from('PGDMP')))throw failure('OWNED_RESTORE_INPUT');
   await new Promise((resolve,reject)=>{child.stdin.end(error=>error?reject(failure('OWNED_RESTORE_STDIN')):resolve());});
  }catch(e){stop(errors.has(e)?e:failure('OWNED_RESTORE_INPUT'));child.stdin.destroy();}finally{magic.fill(0);}};
  try{timer=schedule(()=>stop(failure('OWNED_DEADLINE')),Math.max(1,deadline-now()));await Promise.allSettled([feed(),drain(child.stdout,false),drain(child.stderr,true),originalClose]);
   if(first)throw primary;check(deadline);if(!closed||exitCode!==0||!stdoutEof||!stderrEof)throw failure('OWNED_RESTORE_EXIT');return Object.freeze({closed:true,stdoutEof:true,stderrEof:true,exitCode:0});
  }finally{cancel(timer);environment.PGPASSWORD=undefined;}
 };
}
