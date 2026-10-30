// Unactivated complete-inventory owner backup successor. Existing operators stay
// immutable. No startup, service or normal CLI redirects here automatically.
// Import performs no IO or connection.
// No live/in-place restore CLI exists. The ignored historical operator is kept.
import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {open,lstat,realpath,link,unlink,readdir,statfs} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types,isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';

const DATA=fileURLToPath(new URL('../../data/',import.meta.url));
const BIN='D:\\PostgreSQL\\17\\bin';
const GIB=1073741824,MAGIC=Buffer.from('MURPG001'),CHUNK=65536,HEADER_LIMIT=16384,MAX_DUMP=16*GIB;
// Constant memory, bounded total archive, and the original four-GiB disk floor.
// Actual admission is smaller when only enough room for two encrypted copies
// remains. This is a sampled budget, not a filesystem reservation.
const DEFAULT_LIMITS=Object.freeze({maximumDumpBytes:MAX_DUMP,minimumDumpBytes:GIB,diskFloorBytes:4*GIB,spaceCheckBytes:16*1024*1024});
const WEEK=604800000,ACTIVE_MS=330000,TOTAL_MS=360000;
const NAME=/^postgres-canonical-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f-]{36}\.murmingle-pgbackup$/u;
const SHA=/^[a-f0-9]{64}$/u;
const BASE_TABLES={schema_migrations:'version',meta:'singleton',id_registry:'id',topics:'id',discussions:'id',sources:'id',
 embeddings:'source_id',source_links:'source_id',topic_memberships:'source_id,topic_id',fixed_references:'topic_id',
 contributions:'id',revisions:'contribution_id,ordinal',operation_receipts:'source_id',import_ledger:'import_id',
 runtime_state:'singleton',command_receipts:'actor_id,request_id',runtime_source_stamps:'source_id',ingestion_jobs:'operation_id',catalog_ingest_lane:'singleton'};
const SEMANTIC_TABLES={semantic_matchers:'matcher_hash',semantic_nodes:'matcher_hash,node_id',semantic_installation:'singleton',
 semantic_inputs:'source_id,operation_digest,matcher_hash',semantic_observations:'source_id,source_version,matcher_hash',
 semantic_root_snapshots:'root_id',semantic_root_edges:'root_id,node_id',semantic_owner_policy:'singleton',semantic_material_state:'singleton',
 semantic_preparation_requests:'source_id'};
const AUTOMATIC_TABLES=Object.freeze({
 named_subject_ids:'id',named_subject_heads:'subject_id',named_subject_members:'subject_id,source_id',named_subject_selections:'source_id',
 named_retrieval_inputs:'source_id',named_retrieval_terms:'term,source_id',named_index_requests:'source_id',named_discovery_requests:'source_id',
 named_root_contexts:'root_id',named_context_receipts:'actor_id,request_id',named_feed_roots:'root_id',named_feed_edges:'root_id,scope_kind,scope_id',
 named_feed_witnesses:'root_id,scope_kind,scope_id,head_id',named_topic_cards:'generation,scope_kind,scope_id,caption',
 named_topic_directory:'generation,scope_kind,scope_id',named_feed_events:'event_id',named_feed_clock:'singleton',
 named_page_root_material:'root_id',named_scope_activity:'generation,scope_kind,scope_id',
 named_public_prototypes:'generation,representation_hash,scope_id',named_public_events:'event_id',
 unified_search_roots:'generation,scope_kind,scope_id,root_id',unified_search_directory:'generation,scope_kind,scope_id',
 unified_search_events:'event_id',unified_search_clock:'singleton',combined_fixed_edges:'root_id,node_id',
});
export function describeAutomaticTopicBackupTables(){if(arguments.length)throw new TypeError('No backup table options');return AUTOMATIC_TABLES;}
export function describeCanonicalTopicBackupTables(version){
 if(arguments.length!==1||![9,16,17,18].includes(version))throw new TypeError('Unknown canonical backup schema');
 return Object.freeze({...BASE_TABLES,...(version>=16?SEMANTIC_TABLES:{}),...(version===18?AUTOMATIC_TABLES:{})});
}
function rowFingerprintQuery(table,order){
 const extra=table==='embeddings'||table==='fixed_references'?" || coalesce(array_send(t.values_double),''::bytea)":table==='semantic_inputs'?" || array_send(t.body_values) || array_send(t.title_values)":table==='named_subject_heads'?" || array_send(t.prototype_values)":table==='named_public_prototypes'?" || array_send(t.values_double)":'';
 return `DECLARE backup_rows NO SCROLL CURSOR FOR SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')${extra}),'hex') AS row_sha FROM canonical_v4.${table} t ORDER BY ${order}`;
}
// Same fixed SQL used by the actual backup, also exercised by the owned SQL
// rehearsal. No caller-defined table, order, database or execution capability.
export function automaticTopicBackupRowQuery(table){if(arguments.length!==1||typeof table!=='string'||!Object.hasOwn(AUTOMATIC_TABLES,table))throw new TypeError('Unknown automatic backup table');return rowFingerprintQuery(table,AUTOMATIC_TABLES[table]);}
const ownedFailures=new WeakMap();
const fail=code=>{const error=Object.assign(new Error('Encrypted PostgreSQL backup unavailable'),{code});ownedFailures.set(error,{code});return error;};
export function describePostgresBackupFailure(error){return Object.freeze({...ownedFailures.get(error)??{code:'unavailable'}});}
const hash=b=>createHash('sha256').update(b).digest('hex');
const exact=(value,keys)=>{if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)throw fail('invalid');
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw fail('invalid');out[key]=d.value;}return out;};
const integer=v=>{const n=typeof v==='string'&&/^(0|[1-9][0-9]*)$/u.test(v)?Number(v):v;if(!Number.isSafeInteger(n)||n<0)throw fail('invalid');return n;};
function identity(s){return [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs];}
async function checkedDirectory(directory){const absolute=path.resolve(directory);if(absolute!==directory)throw fail('path');
 for(let p=absolute;;p=path.dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o170000)!==0o040000)throw fail('path');if(path.dirname(p)===p)break;}
 if((await realpath(absolute)).toLowerCase()!==absolute.toLowerCase())throw fail('path');}
async function checkedOpen(filename){const before=await lstat(filename);if(!before.isFile()||before.isSymbolicLink())throw fail('path');
 const fd=await open(filename,'r');try{const s=await fd.stat();if(!isDeepStrictEqual(identity(s),identity(before)))throw fail('file-changed');return {fd,initial:identity(s)};}catch(e){await fd.close();throw e;}}
async function unchanged(file){if(!isDeepStrictEqual(identity(await file.fd.stat()),file.initial))throw fail('file-changed');}
async function* chunks(fd,start,end){let position=start;while(position<end){const b=Buffer.alloc(Math.min(CHUNK,end-position));const {bytesRead}=await fd.read(b,0,b.length,position);if(bytesRead!==b.length)throw fail('truncated');position+=bytesRead;yield b;}}
async function write(fd,bytes){let p=0;while(p<bytes.length){const {bytesWritten}=await fd.write(bytes,p,bytes.length-p);if(bytesWritten<=0)throw fail('write');p+=bytesWritten;}}
function lifetime(deps){const began=deps.monotonic();return {active:began+ACTIVE_MS,absolute:began+TOTAL_MS,check(){if(deps.monotonic()>=began+ACTIVE_MS)throw fail('deadline');}};}
async function cleanupWithin(deps,life,work,onTimeout){
 // Always attempt and observe the ORIGINAL cleanup, even after the deadline.
 // A timeout is not physical retirement evidence and must not report success.
 const original=Promise.resolve().then(work);let timer;
 try{return await Promise.race([original,new Promise((_,reject)=>{timer=deps.setTimer(()=>{onTimeout();reject(fail('cleanup-unconfirmed'));},Math.max(0,life.absolute-deps.monotonic()));})]);}
 finally{deps.clearTimer(timer);}
}

// A physical close event and both drained output streams settle a dump child.
// An unconfirmed child keeps encrypted partials for its owner. The timers bound
// process observation, NOT a stalled OS filesystem promise inside onChunk. That
// ORIGINAL write remains awaited: no physical-IO/Job guarantee or successful
// retirement is inferred while it is pending. Production has no owned Job here.
async function dumpRun(deps,args,{password,onChunk,onRetirementUnknown,life}){
 life.check();let child,first=false,primary,closed=false,closeCode=null,stdoutEnded=false,stderrEnded=false,stderrBytes=0;
 const remember=e=>{if(!first){first=true;primary=e;}};
 const stop=e=>{remember(e);try{child?.kill();}catch{}};
 const env={SystemRoot:deps.systemRoot,WINDIR:deps.systemRoot,PATH:BIN+';'+deps.systemRoot+'\\System32;'+deps.systemRoot,
  PGCONNECT_TIMEOUT:'5',PGPASSWORD:password};
 try{child=deps.spawn(path.join(BIN,'pg_dump.exe'),args,{shell:false,windowsHide:true,env,stdio:['pipe','pipe','pipe']});}
 catch(e){throw e;}
 let settleClose;const observed=new Promise(resolve=>{settleClose=resolve;});
 child.once('error',e=>stop(e));child.once('close',code=>{closed=true;closeCode=code;settleClose();});
 const activeTimer=deps.setTimer(()=>stop(fail('child-deadline')),Math.max(0,life.active-deps.monotonic()));
 const finalTimer=deps.setTimer(()=>{stop(fail('child-unsettled'));child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();settleClose();},Math.max(0,life.absolute-deps.monotonic()));
 const read=async(stream,isError)=>{try{for await(const b of stream){if(!Buffer.isBuffer(b)||b.length>2*CHUNK)throw fail('child-chunk');
   // A failed archive write/budget must still drain the original child streams.
   // Leaving the async iterator here destroys stdout before its EOF witness.
   try{if(isError){stderrBytes+=b.length;if(stderrBytes>8192)stop(fail('stderr-bound'));}else for(let p=0;p<b.length&&!first;p+=CHUNK)await onChunk(b.subarray(p,p+CHUNK));}
   catch(e){stop(e);}finally{b.fill(0);}
  }if(isError)stderrEnded=true;else stdoutEnded=true;
 }catch(e){stop(e);}};
 // pg_dump consumes no stdin; no restore/write-buffer lifetime branch exists.
 child.stdin.on('error',e=>stop(e));
 try{child.stdin.end();}catch(e){stop(e);child.stdin.destroy();}
 await Promise.allSettled([read(child.stdout,false),read(child.stderr,true),observed]);
 deps.clearTimer(activeTimer);deps.clearTimer(finalTimer);env.PGPASSWORD=undefined;
 if(!closed||!stdoutEnded||!stderrEnded){onRetirementUnknown();if(first)throw primary;throw fail('child-unsettled');}
 if(first)throw primary;if(closeCode!==0)throw fail('child-exit');return {closed:true,stdoutEof:true,stderrEof:true,stderrBytes};
}

async function currentMetadata(tx,deps,life){
 const state=(await tx.query('SELECT meta.generation,runtime.revision,meta.logical_sha256 FROM canonical_v4.meta AS meta JOIN canonical_v4.runtime_state AS runtime USING(singleton) WHERE meta.singleton=true')).rows;
 const counts=(await tx.query('SELECT (SELECT count(*) FROM canonical_v4.topics) topics,(SELECT count(*) FROM canonical_v4.discussions) discussions,(SELECT count(*) FROM canonical_v4.sources) sources,(SELECT count(*) FROM canonical_v4.source_links) source_links,(SELECT count(*) FROM canonical_v4.contributions) contributions')).rows;
 const migrations=(await tx.query('SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')).rows;
 if(state.length!==1||counts.length!==1||![9,16,17,18].includes(migrations.length))throw fail('schema');
 const manifest=await deps.manifest(migrations.length===9?'legacy9':migrations.length===16?'hierarchy16':migrations.length===18?'hierarchy18':'hierarchy17');
 if(manifest.length!==migrations.length||migrations.some((r,i)=>integer(r.version)!==i+1||r.hash!==manifest[i].hash))throw fail('schema');
 if(typeof state[0].generation!=='string'||!state[0].generation.length||state[0].generation.length>128||!SHA.test(state[0].logical_sha256))throw fail('metadata');
 const fingerprints=[],tables=describeCanonicalTopicBackupTables(migrations.length);
 // Census the actual same snapshot, independently of the fingerprint loop. A
 // newly added, omitted or substituted relation must stop before pg_dump starts.
 const relations=(await tx.query(`SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relkind AS kind
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='canonical_v4' AND c.relkind IN('r','p','f','m') ORDER BY c.relname COLLATE "C"`)).rows;
 if(!Array.isArray(relations)||!isDeepStrictEqual(relations.map(r=>r?.name),Object.keys(tables).sort())||
    !relations.every(r=>r?.kind==='r'))throw fail('schema-tables');
 if(!relations.every(r=>r.owner==='murmingle_owner'))throw fail('schema-table-owner');
 for(const [table,order]of Object.entries(tables)){
  life.check();await tx.query(rowFingerprintQuery(table,order));
  const digest=createHash('sha256');let count=0;
  let failed=false,primary;try{for(;;){life.check();const {rows}=await tx.query('FETCH FORWARD 128 FROM backup_rows');if(!Array.isArray(rows)||rows.length>128)throw fail('fingerprint');
    for(const row of rows){if(!row||!SHA.test(row.row_sha))throw fail('fingerprint');digest.update(row.row_sha+'\n');count++;if(!Number.isSafeInteger(count))throw fail('fingerprint');}if(rows.length<128)break;
   }}catch(e){failed=true;primary=e;throw e;}finally{try{await tx.query('CLOSE backup_rows');}catch(e){if(!failed)throw e;}if(failed)void primary;}
  fingerprints.push({table,rows:count,sha256:digest.digest('hex')});
 }
 const currentRowsFingerprint={algorithm:'sha256-pkordered-jsonb-and-binary64-array-send/v1',tables:fingerprints,sha256:hash(JSON.stringify(fingerprints))};
 return {version:{generation:state[0].generation,revision:integer(state[0].revision)},baselineLogicalDigest:state[0].logical_sha256,
  counts:{topics:integer(counts[0].topics),discussions:integer(counts[0].discussions),sources:integer(counts[0].sources),sourceLinks:integer(counts[0].source_links),contributions:integer(counts[0].contributions)},
  migrations:migrations.map(x=>x.hash),currentRowsFingerprint};
}

function header(value,now,{allowExpired=false}={}){
 const h=exact(value,['schema','algorithm','keyWrap','iv','createdAt','expiresAt','database','version','baselineLogicalDigest','counts','migrations','dumpSha256','dumpBytes']);
 const wrapped=exact(h.keyWrap,['provider','data']),version=exact(h.version,['generation','revision']),counts=exact(h.counts,['topics','discussions','sources','sourceLinks','contributions']);
 if(h.schema!=='murmingle-postgresql-encrypted-backup/v1'||h.algorithm!=='AES-256-GCM'||h.database!=='murmingle_canonical'||wrapped.provider!=='dpapi-current-user'||
  typeof wrapped.data!=='string'||wrapped.data.length>2732||!wrapped.data.length||Buffer.from(wrapped.data,'base64').toString('base64')!==wrapped.data||Buffer.from(wrapped.data,'base64').length>2048||
  typeof h.iv!=='string'||Buffer.from(h.iv,'base64').length!==12||Buffer.from(h.iv,'base64').toString('base64')!==h.iv||typeof h.dumpSha256!=='string'||!SHA.test(h.dumpSha256)||typeof h.baselineLogicalDigest!=='string'||!SHA.test(h.baselineLogicalDigest)||
  ![9,16,17,18].includes(h.migrations?.length)||!Array.isArray(h.migrations)||h.migrations.some(x=>typeof x!=='string'||!SHA.test(x))||
  typeof version.generation!=='string'||!version.generation.length||version.generation.length>128)throw fail('header');
 if(typeof version.revision!=='number'||Object.values(counts).some(n=>typeof n!=='number')||typeof h.dumpBytes!=='number')throw fail('header');
 integer(version.revision);for(const n of Object.values(counts))integer(n);if(integer(h.dumpBytes)<5||h.dumpBytes>MAX_DUMP)throw fail('header');
 const made=Date.parse(h.createdAt),expires=Date.parse(h.expiresAt);if(!Number.isFinite(made)||!Number.isFinite(expires)||new Date(made).toISOString()!==h.createdAt||new Date(expires).toISOString()!==h.expiresAt||expires-made!==WEEK||made>now||!allowExpired&&now>=expires)throw fail('expired');return h;
}

function operator(deps,limits=DEFAULT_LIMITS){
 limits=exact(limits,['maximumDumpBytes','minimumDumpBytes','diskFloorBytes','spaceCheckBytes']);
 for(const n of Object.values(limits))if(!Number.isSafeInteger(n)||n<0)throw fail('invalid');
 if(limits.maximumDumpBytes<1||limits.maximumDumpBytes>MAX_DUMP||limits.minimumDumpBytes<1||limits.minimumDumpBytes>limits.maximumDumpBytes||limits.spaceCheckBytes<1||limits.spaceCheckBytes>64*1024*1024)throw fail('invalid');
 const directory=path.join(deps.dataDir,'canonical-migration-backups');let busy=false,poisoned=false;
 const leaf=name=>{if(typeof name!=='string'||!NAME.test(name)||path.basename(name)!==name)throw fail('filename');return path.join(directory,name);};
 async function prepare(){await deps.protection.prepareDirectory(directory);await checkedDirectory(directory);}
 async function exclusive(work){if(poisoned)throw fail('retirement-unconfirmed');if(busy)throw fail('busy');busy=true;try{return await work();}finally{busy=false;}}
 async function inspectPath(filename,life,allowExpired=false){await prepare();life.check();const file=await checkedOpen(filename);let key;
  try{const size=file.initial[2];if(size<33||size>MAX_DUMP+HEADER_LIMIT+28)throw fail('size');
   const prefix=Buffer.alloc(12);if((await file.fd.read(prefix,0,12,0)).bytesRead!==12||!prefix.subarray(0,8).equals(MAGIC))throw fail('container');const n=prefix.readUInt32BE(8);if(n<1||n>HEADER_LIMIT)throw fail('header');
   const raw=Buffer.alloc(n);if((await file.fd.read(raw,0,n,12)).bytesRead!==n)throw fail('truncated');const h=header(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw)),deps.now(),{allowExpired});
   const manifest=await deps.manifest(h.migrations.length===9?'legacy9':h.migrations.length===16?'hierarchy16':h.migrations.length===18?'hierarchy18':'hierarchy17');
   if(manifest.length!==h.migrations.length||manifest.some((r,i)=>r.hash!==h.migrations[i]))throw fail('schema');
   if(size!==12+n+h.dumpBytes+16)throw fail('size');key=await deps.protection.unwrapKey(Buffer.from(h.keyWrap.data,'base64'));if(!Buffer.isBuffer(key)||key.length!==32)throw fail('key');
   const tag=Buffer.alloc(16);if((await file.fd.read(tag,0,16,size-16)).bytesRead!==16)throw fail('truncated');
   async function* plaintext(){const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(h.iv,'base64'));decipher.setAAD(raw);decipher.setAuthTag(tag);let bytes=0;const digest=createHash('sha256');let first=Buffer.alloc(0);
    for await(const encrypted of chunks(file.fd,12+n,size-16)){life.check();let clear;try{clear=decipher.update(encrypted);encrypted.fill(0);bytes+=clear.length;digest.update(clear);if(first.length<5)first=Buffer.concat([first,clear.subarray(0,5-first.length)]);yield clear;}finally{clear?.fill(0);}}
    const tail=decipher.final();try{if(tail.length){bytes+=tail.length;digest.update(tail);yield tail;}if(bytes!==h.dumpBytes||digest.digest('hex')!==h.dumpSha256||!first.equals(Buffer.from('PGDMP')))throw fail('dump-digest');await unchanged(file);}finally{tail.fill(0);first.fill(0);}
   }
   // Authenticate the ENTIRE original archive before any child/restore port sees
   // plaintext. A subsequent pass uses this same held descriptor and witness.
   for await(const clear of plaintext())clear.fill(0);
   return {file,header:h,headerSha256:hash(raw),plaintext,close:async()=>{key?.fill(0);key=null;await file.fd.close();}};
  }catch(e){key?.fill(0);await file.fd.close();throw e;}
 }
 const inspect=(name,life,allowExpired=false)=>inspectPath(leaf(name),life,allowExpired);
 function publicResult(h){return {createdAt:h.createdAt,expiresAt:h.expiresAt,version:h.version,counts:h.counts,baselineLogicalDigest:h.baselineLogicalDigest,migrations:h.migrations,dumpBytes:h.dumpBytes,dumpSha256:h.dumpSha256,verified:true};}
 return Object.freeze({
  create:()=>exclusive(async()=>{
   const life=lifetime(deps);await prepare();const space=await deps.freeBytes(directory);
   const dumpLimit=Math.min(limits.maximumDumpBytes,Math.floor((space-limits.diskFloorBytes-limits.spaceCheckBytes-2*(HEADER_LIMIT+28))/2));
   if(!Number.isSafeInteger(space)||dumpLimit<limits.minimumDumpBytes)throw fail('disk-reserve');
   const nonce=randomUUID(),spool=path.join(directory,'.'+nonce+'.encrypted-spool'),partial=path.join(directory,'.'+nonce+'.encrypted-final');
   let spoolFd,finalFd,db,spoolKey=randomBytes(32),spoolIv=randomBytes(12),finalKey=randomBytes(32),published=null,retirementUnconfirmed=false,details,dumpSha256,dumpBytes=0;
   let hadPrimary=false,primary;const cleanupFailures=[];
   let writtenSinceCheck=limits.spaceCheckBytes;
   const guardedWrite=async(fd,bytes)=>{
    if(writtenSinceCheck+bytes.length>=limits.spaceCheckBytes){
     const available=await deps.freeBytes(directory);if(!Number.isSafeInteger(available)||available<limits.diskFloorBytes+limits.spaceCheckBytes+bytes.length)throw fail('disk-reserve');writtenSinceCheck=0;
    }
    await write(fd,bytes);writtenSinceCheck+=bytes.length;
   };
   try{
    spoolFd=await open(spool,'wx',0o600);const cipher=createCipheriv('aes-256-gcm',spoolKey,spoolIv),digest=createHash('sha256');let magic=Buffer.alloc(0);
    db=await deps.openOwner();let callbackFailed=false,callbackError;
    try{await db.transaction(async tx=>{try{
     await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query("SET LOCAL statement_timeout='5000ms'");await tx.query("SET LOCAL lock_timeout='5000ms'");
     // Rehearsal fingerprints MUST use these same settings and algorithm on its
     // own same-physical restored snapshot before comparing the retained receipt.
     await tx.query("SET LOCAL TimeZone='UTC'");await tx.query("SET LOCAL DateStyle='ISO, YMD'");await tx.query('SET LOCAL extra_float_digits=3');
     const server=(await tx.query('SELECT current_database() database,current_user role,host(inet_server_addr()) address,inet_server_port() port')).rows;
     if(server.length!==1||server[0].database!=='murmingle_canonical'||server[0].role!=='murmingle_owner'||server[0].address!=='127.0.0.1'||server[0].port!==55432)throw fail('server');
     await tx.query('SELECT pg_advisory_xact_lock_shared(914092004)');details=await currentMetadata(tx,deps,life);
     const {rows}=await tx.query('SELECT pg_export_snapshot() AS snapshot');if(rows.length!==1||typeof rows[0].snapshot!=='string'||!/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-[0-9]+$/u.test(rows[0].snapshot))throw fail('snapshot');
     const password=await deps.password();await dumpRun(deps,['--host=127.0.0.1','--port=55432','--username=murmingle_owner','--dbname=murmingle_canonical','--format=custom','--compress=zstd:3','--no-owner','--no-comments','--no-password','--lock-wait-timeout=5000','--snapshot='+rows[0].snapshot],{password,life,onRetirementUnknown:()=>{retirementUnconfirmed=true;poisoned=true;},onChunk:async b=>{
      dumpBytes+=b.length;if(dumpBytes>dumpLimit)throw fail('dump-bound');digest.update(b);if(magic.length<5)magic=Buffer.concat([magic,b.subarray(0,5-magic.length)]);const encrypted=cipher.update(b);try{await guardedWrite(spoolFd,encrypted);}finally{encrypted.fill(0);}}});
    }catch(e){callbackFailed=true;callbackError=e;throw e;}});}catch(e){throw callbackFailed?callbackError:e;}
    if(dumpBytes<5||!magic.equals(Buffer.from('PGDMP')))throw fail('dump');magic.fill(0);dumpSha256=digest.digest('hex');const tail=cipher.final();await guardedWrite(spoolFd,tail);tail.fill(0);await guardedWrite(spoolFd,cipher.getAuthTag());await spoolFd.sync();await spoolFd.close();spoolFd=null;
    life.check();const createdAt=new Date(deps.now()).toISOString(),iv=randomBytes(12),wrapped=await deps.protection.wrapKey(finalKey);
    const h=header({schema:'murmingle-postgresql-encrypted-backup/v1',algorithm:'AES-256-GCM',keyWrap:{provider:'dpapi-current-user',data:wrapped.toString('base64')},iv:iv.toString('base64'),createdAt,expiresAt:new Date(Date.parse(createdAt)+WEEK).toISOString(),database:'murmingle_canonical',version:details.version,baselineLogicalDigest:details.baselineLogicalDigest,counts:details.counts,migrations:details.migrations,dumpSha256,dumpBytes},deps.now());wrapped.fill(0);
    const raw=Buffer.from(JSON.stringify(h));if(raw.length>HEADER_LIMIT)throw fail('header');const prefix=Buffer.alloc(12);MAGIC.copy(prefix);prefix.writeUInt32BE(raw.length,8);
    finalFd=await open(partial,'wx',0o600);await guardedWrite(finalFd,prefix);await guardedWrite(finalFd,raw);
    const source=await checkedOpen(spool),decipher=createDecipheriv('aes-256-gcm',spoolKey,spoolIv),tag=Buffer.alloc(16);try{
     if(source.initial[2]!==dumpBytes+16)throw fail('spool');await source.fd.read(tag,0,16,dumpBytes);decipher.setAuthTag(tag);
     const finalCipher=createCipheriv('aes-256-gcm',finalKey,iv);finalCipher.setAAD(raw);const again=createHash('sha256');let total=0;
     for await(const encrypted of chunks(source.fd,0,dumpBytes)){life.check();const clear=decipher.update(encrypted);encrypted.fill(0);try{total+=clear.length;again.update(clear);const sealed=finalCipher.update(clear);try{await guardedWrite(finalFd,sealed);}finally{sealed.fill(0);}}finally{clear.fill(0);}}
     const end=decipher.final();if(end.length)throw fail('spool');end.fill(0);await unchanged(source);if(total!==dumpBytes||again.digest('hex')!==dumpSha256)throw fail('spool');const endCipher=finalCipher.final();await guardedWrite(finalFd,endCipher);endCipher.fill(0);await guardedWrite(finalFd,finalCipher.getAuthTag());
    }finally{tag.fill(0);await source.fd.close();}
    await finalFd.sync();await finalFd.close();finalFd=null;
    const filename=`postgres-canonical-${createdAt.replaceAll(':','-').replace('.','-')}-${nonce}.murmingle-pgbackup`;
    // Validate our encrypted final before exclusively publishing its fixed leaf.
    const verified=await inspectPath(partial,life);await verified.close();life.check();
    const target=leaf(filename);await link(partial,target);published=target;
    return {...publicResult(h),filename,headerSha256:hash(raw),archiveBudgetBytes:dumpLimit,compression:'zstd:3',currentRowsFingerprint:details.currentRowsFingerprint,fingerprintBinding:{dumpSha256,headerSha256:hash(raw),currentRowsFingerprintSha256:details.currentRowsFingerprint.sha256,version:details.version,migrations:details.migrations},fingerprintScope:'Same exported snapshot current rows, IDs, revisions, receipts and binary64 wires with LOCAL TimeZone UTC, DateStyle ISO,YMD and extra_float_digits 3; restored comparison must use identical settings/algorithm. Retain this owner receipt: fingerprints are not embedded in V1 or an independent persistent image proof after restart; exclude sequences/function definitions. Filesystem protection is sampled, not an atomic hostile-writer sandbox.',cleanupVerified:true};
   }catch(e){hadPrimary=true;primary=e;if(ownedFailures.has(e))ownedFailures.set(e,{...ownedFailures.get(e),dumpBytes,dumpLimitBytes:dumpLimit});throw e;}
   finally{
    const settle=async work=>{try{await cleanupWithin(deps,life,work,()=>{poisoned=true;retirementUnconfirmed=true;});}catch(e){cleanupFailures.push(e);}};
    await settle(async()=>{await spoolFd?.close();});await settle(async()=>{await finalFd?.close();});await settle(async()=>{await db?.close();});
    spoolKey.fill(0);finalKey.fill(0);spoolIv.fill(0);
    if(!retirementUnconfirmed){for(const p of [spool,partial,...(hadPrimary&&published?[published]:[])])await settle(async()=>{try{await unlink(p);}catch(e){if(e.code!=='ENOENT')throw e;}});}
    if(!hadPrimary&&cleanupFailures.length)throw fail('cleanup');
    // Unknown physical child retirement leaves only encrypted partials, and
    // never returns cleanupVerified. The original error remains authoritative.
    if(hadPrimary)void primary;
   }
  }),
  verify:name=>exclusive(async()=>{const value=await inspect(name,lifetime(deps));try{return {...publicResult(value.header),headerSha256:value.headerSha256,verificationScope:'Authenticated encrypted V1 bytes, PGDMP signature and dump digest only; not restored SQL correctness.'};}finally{await value.close();}}),
  cleanup:()=>exclusive(async()=>{const life=lifetime(deps);await prepare();const names=await readdir(directory);if(names.length>5000)throw fail('directory-bound');let removed=0;for(const name of names){life.check();if(!NAME.test(name))continue;let value;
    try{value=await inspect(name,life,true);if(Date.parse(value.header.expiresAt)>deps.now())continue;await value.close();value=null;await unlink(leaf(name));removed++;}
    catch{/* Corrupt/foreign/partial files are retained, never guessed safe. */}finally{await value?.close();}}
   return {removed};}),
  // Trusted fixture composition only; not an HTTP/client-supplied authority.
  // Its port owns the real credentials, fixed pg_restore argv, query connection
  // and original-child draining. A JSON identity alone is NOT such a capability.
  // The future port MUST enforce the supplied ORIGINAL absolute deadline on
  // inspect/restore/verification, settle its original physical work and preserve
  // falsy primaries. No real port or CLI restore is installed by this module.
  // The held descriptor is rechecked between passes; private ACL + sampled
  // identity/content checks are not an atomic hostile-writer filesystem sandbox.
  restoreToOwnedFixture:(name,port)=>exclusive(async()=>{
   const p=exact(port,['inspect','restore','verifyRestored']);if(Object.values(p).some(f=>typeof f!=='function'))throw fail('restore-port');
   const life=lifetime(deps),value=await inspect(name,life);let source;
   try{const inspected=await p.inspect({deadline:life.absolute});life.check();source=exact(inspected,['host','port','database','oid','serverStarted','owned','fresh','empty']);
    if(source.host!=='127.0.0.1'||source.port!==55433||!['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'].includes(source.database)||
      typeof source.oid!=='string'||!/^[1-9][0-9]{0,9}$/u.test(source.oid)||BigInt(source.oid)>4294967295n||typeof source.serverStarted!=='number'||!Number.isFinite(source.serverStarted)||source.serverStarted<=0||source.owned!==true||source.fresh!==true||source.empty!==true)throw fail('restore-target');
    life.check();await unchanged(value.file);
    let delivered=false;async function* dump(){for await(const b of value.plaintext())yield b;delivered=true;}
    const restored=await p.restore({identity:Object.freeze({...source}),dump:dump(),deadline:life.absolute,dumpSha256:value.header.dumpSha256,dumpBytes:value.header.dumpBytes});life.check();
    const outcome=exact(restored,['closed','stdoutEof','stderrEof','exitCode']);
    if(!delivered||outcome.closed!==true||outcome.stdoutEof!==true||outcome.stderrEof!==true||outcome.exitCode!==0)throw fail('restore-unsettled');
    life.check();await unchanged(value.file);const verified=await p.verifyRestored({identity:Object.freeze({...source}),header:structuredClone(value.header),deadline:life.absolute});life.check();
    if(verified!==true)throw fail('restore-verify');return {restored:true,targetDatabase:source.database,targetOid:source.oid,dumpSha256:value.header.dumpSha256,version:value.header.version,scope:'Fresh owned fixture only; caller must compare retained same-dump current-row fingerprints and role/schema invariants.'};
   }finally{await value.close();}
  }),
 });
}

let production,productionOpening;
function fixedOperator(){if(!productionOpening)productionOpening=openFixedOperator();return productionOpening;}
async function openFixedOperator(){if(!production){const [{createWindowsBackupProtection},{createWindowsDpapiPasswordProvider},{readCanonicalV4MigrationManifest}]=await Promise.all([
 import('./windows-backup-protection.js'),import('../../portable/src/windows-dpapi-password.js'),import('../../portable/canonical-v4/index.js')]);
 const password=createWindowsDpapiPasswordProvider({role:'murmingle_owner'}),protection=createWindowsBackupProtection();if(!protection)throw fail('platform');
 const {Pool}=createRequire(new URL('../../portable/package.json',import.meta.url))('pg');
 const openOwner=async()=>{const pool=new Pool({host:'127.0.0.1',port:55432,database:'murmingle_canonical',user:'murmingle_owner',password,ssl:false,max:1,connectionTimeoutMillis:5000,query_timeout:5000});
  return {close:()=>pool.end(),transaction:async work=>{const client=await pool.connect();let failed=false,primary;try{await client.query('BEGIN');return await (async()=>{const result=await work({query:(...args)=>client.query(...args)});await client.query('COMMIT');return result;})();}
   catch(e){failed=true;primary=e;try{await client.query('ROLLBACK');}catch{}throw e;}finally{try{client.release(failed);}catch(e){if(!failed)throw e;}if(failed)void primary;}}};};
 production=operator({dataDir:DATA,protection,password,manifest:readCanonicalV4MigrationManifest,openOwner,spawn,now:Date.now,monotonic:()=>performance.now(),setTimer:setTimeout,clearTimer:clearTimeout,systemRoot:process.env.SystemRoot,
  freeBytes:async p=>{const s=await statfs(p,{bigint:true});return Number(s.bavail*s.bsize);}});}return production;}
export async function createPostgresBackup(){if(arguments.length)throw fail('arguments');return (await fixedOperator()).create();}
export async function verifyPostgresBackup(filename){if(arguments.length!==1)throw fail('arguments');return (await fixedOperator()).verify(filename);}
export async function cleanupExpiredPostgresBackups(){if(arguments.length)throw fail('arguments');return (await fixedOperator()).cleanup();}
export async function restorePostgresBackupToOwnedFixture(filename,trustedPort){if(arguments.length!==2)throw fail('arguments');return (await fixedOperator()).restoreToOwnedFixture(filename,trustedPort);}
export function createPostgresBackupOperatorForTest(dependencies,limits=DEFAULT_LIMITS){return operator(dependencies,limits);}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||!['create','verify','cleanup-expired'].includes(args[0])||args.length!==(args[0]==='verify'?2:1))return 2;
 try{const result=args[0]==='create'?await createPostgresBackup():args[0]==='verify'?await verifyPostgresBackup(args[1]):await cleanupExpiredPostgresBackups();process.stdout.write(JSON.stringify(result)+'\n');return 0;}
 catch(error){process.stderr.write(JSON.stringify({error:'encrypted-postgresql-backup-failed',...describePostgresBackupFailure(error)})+'\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
