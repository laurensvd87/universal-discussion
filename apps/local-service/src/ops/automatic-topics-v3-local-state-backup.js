// Explicit owner composition only. No CLI capture/restore, import IO or plaintext
// output. Root must supply the retained physical quiescence/PG-pair producer.
import {open,lstat,realpath,link,unlink,statfs} from 'node:fs/promises';
import {createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types,isDeepStrictEqual} from 'node:util';
import {createWindowsBackupProtection} from './windows-backup-protection.js';
import {createWindowsLocalStateReadLease,LOCAL_STATE_SLOTS} from './automatic-topics-v3-local-state-read-lease.js';

const DATA=fileURLToPath(new URL('../../data/',import.meta.url)),DIRECTORY=path.join(DATA,'canonical-migration-backups');
const CHUNK=65536,MANIFEST=65536,HEADER=16384,FILE=2147483648,TOTAL=4294967296,SPACE_RESERVE=4294967296;
const MAGIC=Buffer.from('MURLOC03'),NAME=/^local-state-[0-9a-f-]{36}\.murmingle-localbackup$/u,SHA=/^[a-f0-9]{64}$/u;
const fail=code=>Object.assign(new Error('Encrypted local state backup unavailable'),{code});
const need=(v,c='local-state-invalid')=>{if(!v)throw fail(c);};
const sha=v=>createHash('sha256').update(v).digest('hex');
function exact(v,keys){need(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length);const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);need(d?.enumerable&&Object.hasOwn(d,'value'));out[key]=d.value;}return out;}
function pair(v){const p=exact(v,['archiveSha256','receiptSha256','generation','revision','schemaVersion','sealSha256','semanticRevision','fresh']);need([p.archiveSha256,p.receiptSha256,p.sealSha256].every(v=>typeof v==='string'&&SHA.test(v))&&typeof p.generation==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(p.generation)&&Number.isSafeInteger(p.revision)&&p.revision>=0&&[17,18].includes(p.schemaVersion)&&p.fresh===true&&(typeof p.semanticRevision==='string'&&SHA.test(p.semanticRevision)));return p;}
function identity(s){return [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs];}
function freeze(v){if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;}
async function ordinary(p,directory){for(let cursor=p;;cursor=path.dirname(cursor)){const s=await lstat(cursor);need(!s.isSymbolicLink()&&(cursor===p?directory?s.isDirectory():s.isFile():s.isDirectory()),'local-state-path');if(path.dirname(cursor)===cursor)break;}need((await realpath(p)).toLowerCase()===p.toLowerCase(),'local-state-path');}
async function held(p){await ordinary(p,false);const before=await lstat(p),fd=await open(p,'r');try{need(isDeepStrictEqual(identity(before),identity(await fd.stat())),'local-state-changed');return {fd,initial:identity(before),path:p};}catch(e){await fd.close();throw e;}}
async function unchanged(f){need(isDeepStrictEqual(f.initial,identity(await f.fd.stat()))&&isDeepStrictEqual(f.initial,identity(await lstat(f.path))),'local-state-changed');await ordinary(f.path,false);}
async function write(fd,bytes){let n=0;while(n<bytes.length){const r=await fd.write(bytes,n,bytes.length-n);need(r.bytesWritten>0,'local-state-write');n+=r.bytesWritten;}}
async function* read(f,start,end,check){for(let offset=start;offset<end;){check();const b=Buffer.alloc(Math.min(CHUNK,end-offset));try{const r=await f.fd.read(b,0,b.length,offset);need(r.bytesRead===b.length,'local-state-truncated');offset+=r.bytesRead;yield b;}finally{b.fill(0);}}}
function checkedManifest(value){const m=exact(value,['schema','slots']);need(m.schema==='quiesced-local-state-manifest/v3'&&Array.isArray(m.slots)&&!types.isProxy(m.slots)&&m.slots.length===LOCAL_STATE_SLOTS.length&&m.slots.length<=64);let total=0;
 const slots=m.slots.map((v,i)=>{const s=exact(v,['id','leaf','present','bytes','sha256']);need(s.id===LOCAL_STATE_SLOTS[i]&&typeof s.present==='boolean'&&Number.isSafeInteger(s.bytes)&&s.bytes>=0&&s.bytes<=FILE&&(s.present?typeof s.sha256==='string'&&SHA.test(s.sha256):s.bytes===0&&s.sha256===null));
  need(s.id.startsWith('provider-')?(s.leaf===null&&!s.present||typeof s.leaf==='string'&&/^chatgpt-refresh-[a-f0-9]{32}\.dpapi$/u.test(s.leaf)):s.leaf===path.basename(s.id));total+=s.bytes;need(total<=TOTAL);return s;});return {schema:m.schema,slots};}
function checkedHeader(v){const h=exact(v,['schema','algorithm','keyWrap','iv','createdAt','payloadBytes','pair']);const k=exact(h.keyWrap,['provider','data']);need(h.schema==='quiesced-local-state-encrypted-backup/v3'&&h.algorithm==='AES-256-GCM'&&k.provider==='dpapi-current-user'&&typeof k.data==='string'&&k.data.length>0&&k.data.length<=2732&&Buffer.from(k.data,'base64').toString('base64')===k.data&&Buffer.from(k.data,'base64').length<=2048&&typeof h.iv==='string'&&Buffer.from(h.iv,'base64').length===12&&Buffer.from(h.iv,'base64').toString('base64')===h.iv&&typeof h.createdAt==='string'&&new Date(h.createdAt).toISOString()===h.createdAt&&Number.isSafeInteger(h.payloadBytes)&&h.payloadBytes>=4&&h.payloadBytes<=TOTAL+MANIFEST+4);return {...h,pair:pair(h.pair)};}
function capabilities(value){const q=exact(value,['assertQuiesced','captureFreshPostgresPair','readPostgresIdentity']);need(Object.values(q).every(v=>typeof v==='function'));return q;}
const REAL={now:()=>Date.now(),monotonic:()=>performance.now(),protection:()=>createWindowsBackupProtection(),lease:()=>createWindowsLocalStateReadLease(),unchanged,
 freeBytes:async()=>{const s=await statfs(DIRECTORY,{bigint:true});const n=s.bavail*s.bsize;need(n<=BigInt(Number.MAX_SAFE_INTEGER));return Number(n);},
 prepare:async protection=>{await protection.prepareDirectory(DIRECTORY);await ordinary(DIRECTORY,true);},open:held,
 create:async leaf=>{await ordinary(DIRECTORY,true);return open(path.join(DIRECTORY,leaf),'wx',0o600);},
 publish:async(partial,final)=>{await ordinary(DIRECTORY,true);await link(path.join(DIRECTORY,partial),path.join(DIRECTORY,final));await unlink(path.join(DIRECTORY,partial));},
 remove:async leaf=>{need(/^\.local-state-[0-9a-f-]{36}\.partial$/u.test(leaf));await ordinary(DIRECTORY,true);await unlink(path.join(DIRECTORY,leaf));},
 archive:name=>held(path.join(DIRECTORY,name)),
 sourcePath(slot){if(!slot.present)return null;need(typeof slot.path==='string'&&path.isAbsolute(slot.path)&&path.normalize(slot.path)===slot.path);
  if(!slot.id.startsWith('provider-'))need(slot.path===path.join(DATA,...slot.id.split('/')));
  else{const folder=slot.id==='provider-current'?'Murmingle':'UniversalDiscussionLayer';need(slot.path===path.join(process.env.LOCALAPPDATA,folder,slot.leaf));}return slot.path;},
};

function operator(q,p,testComposition){let busy=false,poisoned=false;
 function lifetime(){const start=p.monotonic();return {check(){need(p.monotonic()<start+330000,'local-state-deadline');},absolute(){return p.monotonic()<start+360000;}};}
 async function gate(work){need(!busy&&!poisoned,'local-state-busy');busy=true;try{return await work();}finally{busy=false;}}
 async function verify(name,life,archiveName=name){need(typeof name==='string'&&NAME.test(name)&&path.basename(name)===name);const f=await p.archive(archiveName);let key=null;try{
  life.check();need(f.initial[2]>=32&&f.initial[2]<=TOTAL+MANIFEST+HEADER+32);const prefix=Buffer.alloc(12);need((await f.fd.read(prefix,0,12,0)).bytesRead===12&&prefix.subarray(0,8).equals(MAGIC));const n=prefix.readUInt32BE(8);need(n>0&&n<=HEADER);
  const raw=Buffer.alloc(n);need((await f.fd.read(raw,0,n,12)).bytesRead===n);const h=checkedHeader(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw)));need(f.initial[2]===12+n+h.payloadBytes+16);const archiveDigest=createHash('sha256').update(prefix).update(raw);
  key=await p.protection().unwrapKey(Buffer.from(h.keyWrap.data,'base64'));life.check();need(Buffer.isBuffer(key)&&key.length===32);const tag=Buffer.alloc(16);need((await f.fd.read(tag,0,16,f.initial[2]-16)).bytesRead===16);
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(h.iv,'base64'));decipher.setAAD(raw);decipher.setAuthTag(tag);
  let pending=Buffer.alloc(0),manifest=null,manifestBytes=null,index=0,offset=0,digest=null,total=0;
  function consume(clear){let bytes=clear;
   if(!manifest){pending=Buffer.concat([pending,bytes]);need(pending.length<=MANIFEST+CHUNK+4);if(manifestBytes===null&&pending.length>=4){manifestBytes=pending.readUInt32BE(0);need(manifestBytes>0&&manifestBytes<=MANIFEST);}if(manifestBytes===null||pending.length<manifestBytes+4)return;
    manifest=checkedManifest(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(pending.subarray(4,4+manifestBytes))));bytes=pending.subarray(4+manifestBytes);total=4+manifestBytes;
   }
   while(index<manifest.slots.length){const s=manifest.slots[index];if(!s.present){index++;continue;}digest??=createHash('sha256');const n=Math.min(bytes.length,s.bytes-offset);if(n){digest.update(bytes.subarray(0,n));bytes=bytes.subarray(n);offset+=n;total+=n;}if(offset===s.bytes){need(digest.digest('hex')===s.sha256,'local-state-digest');digest=null;offset=0;index++;continue;}break;}
   need(bytes.length===0,'local-state-trailing');pending.fill(0);pending=Buffer.alloc(0);
  }
  try{for await(const b of read(f,12+n,f.initial[2]-16,()=>life.check())){archiveDigest.update(b);const clear=decipher.update(b);try{consume(clear);}finally{clear.fill(0);}}
   const tail=decipher.final();try{consume(tail);}finally{tail.fill(0);}
  }finally{pending.fill(0);}
  need(manifest&&index===manifest.slots.length&&total===h.payloadBytes);await p.unchanged(f);life.check();
  return {pair:h.pair,presentFiles:manifest.slots.filter(s=>s.present).length,sourceBytes:manifest.slots.reduce((n,s)=>n+s.bytes,0),archiveBytes:f.initial[2],archiveSha256:archiveDigest.update(tag).digest('hex'),headerSha256:sha(raw)};
 }finally{key?.fill(0);await f.fd.close();}}
 return Object.freeze({
  async capture(){return gate(async()=>{
   const life=lifetime(),protection=p.protection();need(protection);let lease=null,leaseClose=null,fd=null,key=null,partial=null,archiveClosed=false,primary=null,failed=false,result=null;const sources=[];
   async function retireLease(){if(lease){leaseClose??=Promise.resolve().then(()=>lease.close());await leaseClose;lease=null;}}
   const check=()=>life.check();const observe=async work=>{check();const v=await work();check();return v;};
   try{
    await observe(()=>q.assertQuiesced());await observe(()=>p.prepare(protection));
    check();lease=await p.lease().acquire();check();need(lease&&Array.isArray(lease.slots)&&lease.slots.length===LOCAL_STATE_SLOTS.length&&lease.slots.length<=64);
    const paired=pair(await observe(()=>q.captureFreshPostgresPair()));need(isDeepStrictEqual(pair(await observe(()=>q.readPostgresIdentity())),paired),'local-state-pair-changed');
    const slots=[];let sourceBytes=0;
    for(let i=0;i<lease.slots.length;i++){
     check();const s=lease.slots[i];need(s.id===LOCAL_STATE_SLOTS[i]&&typeof s.present==='boolean'&&Number.isSafeInteger(s.bytes)&&s.bytes>=0&&s.bytes<=FILE);sourceBytes+=s.bytes;need(sourceBytes<=TOTAL);
     let f=null,digest=null;if(s.present){check();f=await p.open(p.sourcePath(s));sources.push(f);check();need(f.initial[2]===s.bytes);const h=createHash('sha256');for await(const b of read(f,0,s.bytes,check))h.update(b);digest=h.digest('hex');await p.unchanged(f);}
     slots.push({id:s.id,leaf:s.leaf,present:s.present,bytes:s.bytes,sha256:digest});
    }
    const manifest=checkedManifest({schema:'quiesced-local-state-manifest/v3',slots}),wire=Buffer.from(JSON.stringify(manifest));need(wire.length<=MANIFEST);need(await observe(()=>p.freeBytes())>=sourceBytes+MANIFEST+HEADER+32+SPACE_RESERVE,'local-state-space');const length=Buffer.alloc(4);length.writeUInt32BE(wire.length);
    key=randomBytes(32);const iv=randomBytes(12),wrapped=await observe(()=>protection.wrapKey(key));need(Buffer.isBuffer(wrapped)&&wrapped.length>0&&wrapped.length<=2048);
    const h=checkedHeader({schema:'quiesced-local-state-encrypted-backup/v3',algorithm:'AES-256-GCM',keyWrap:{provider:'dpapi-current-user',data:wrapped.toString('base64')},iv:iv.toString('base64'),createdAt:new Date(p.now()).toISOString(),payloadBytes:4+wire.length+sourceBytes,pair:paired});
    const aad=Buffer.from(JSON.stringify(h));need(aad.length<=HEADER);const nonce=randomUUID(),name='local-state-'+nonce+'.murmingle-localbackup';partial='.local-state-'+nonce+'.partial';
    check();fd=await p.create(partial);check();const prefix=Buffer.alloc(12);MAGIC.copy(prefix);prefix.writeUInt32BE(aad.length,8);await write(fd,prefix);await write(fd,aad);
    const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);await write(fd,cipher.update(length));await write(fd,cipher.update(wire));wire.fill(0);
    let fileIndex=0;for(const s of slots)if(s.present){const f=sources[fileIndex++],h=createHash('sha256');for await(const b of read(f,0,s.bytes,check)){h.update(b);await write(fd,cipher.update(b));}need(h.digest('hex')===s.sha256,'local-state-changed');await p.unchanged(f);}
    await observe(()=>lease.verify());await observe(()=>q.assertQuiesced());need(isDeepStrictEqual(pair(await observe(()=>q.readPostgresIdentity())),paired),'local-state-pair-changed');
    await write(fd,cipher.final());await write(fd,cipher.getAuthTag());await fd.sync();await fd.close();fd=null;archiveClosed=true;
    // Verify the CLOSED partial before it receives an accepted public name.
    const verified=await verify(name,life,partial);
    await observe(()=>lease.verify());await observe(()=>q.assertQuiesced());need(isDeepStrictEqual(pair(await observe(()=>q.readPostgresIdentity())),paired),'local-state-pair-changed');
    // Retire original readers/holder before publication. Trusted quiescence
    // remains in force through the last pair check and exclusive publication.
    while(sources.length){const f=sources[0];await f.fd.close();sources.shift();}
    await retireLease();await observe(()=>q.assertQuiesced());need(isDeepStrictEqual(pair(await observe(()=>q.readPostgresIdentity())),paired),'local-state-pair-changed');
    await observe(()=>p.publish(partial,name));partial=null;
    result={schema:'quiesced-local-state-backup-result/v3',status:'verified',filename:name,...verified,testComposition,quiescenceProducerVerifiedByThisModule:false,restoreImplemented:false,plaintextFilesWritten:false,
     rollback:{automatic:false,requireBothArchivesAuthenticated:true,requireSameWindowsUser:true,requireQuiescedOriginalPaths:true}};
   }catch(e){failed=true;primary=e;}
   finally{
    key?.fill(0);
    for(const f of sources)try{await f.fd.close();}catch(e){if(!failed){failed=true;primary=e;}poisoned=true;}
    if(fd)try{await fd.close();}catch(e){if(!failed){failed=true;primary=e;}poisoned=true;}
    if(lease)try{await retireLease();}catch(e){if(!failed){failed=true;primary=e;}poisoned=true;}
    if(partial&&archiveClosed)try{await p.remove(partial);}catch{/* Ciphertext-only partial may remain, never accepted. */}
    if(!life.absolute()){if(!failed){failed=true;primary=fail('local-state-deadline');}}
   }
   if(failed)throw primary;return freeze(result);
  });},
  async verify(name){return gate(async()=>{const life=lifetime();await p.prepare(p.protection());return freeze({schema:'quiesced-local-state-verification/v3',...await verify(name,life),authenticated:true,postgresArchiveAuthenticatedByThisModule:false,restoreImplemented:false,testComposition});});},
 });
}
export function createLocalStateBackupOperator(quiescence){need(arguments.length===1);return operator(capabilities(quiescence),REAL,false);}
export function createLocalStateBackupOperatorForTest(quiescence,ports){need(arguments.length===2);const p=exact(ports,Object.keys(REAL));need(Object.values(p).every(v=>typeof v==='function'));return operator(capabilities(quiescence),p,true);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){process.stdout.write('{"status":"refused","code":"quiescence-required"}\n');process.exitCode=1;}
