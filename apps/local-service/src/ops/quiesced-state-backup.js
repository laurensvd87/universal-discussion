// One explicit pre-cutover backup pair. Import performs no IO or connections.
import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual,types} from 'node:util';
import {createLocalStateBackupOperator} from './local-state-backup-operator.js';
import {createPostgresBackup,verifyPostgresBackup} from './postgres-backup-operator.js';
import {createWindowsBackupProtection} from './windows-backup-protection.js';
import {runPostgresRuntimeOperator} from './postgres-runtime-operator.js';
import {createWindowsDpapiPasswordProvider} from '../../portable/src/windows-dpapi-password.js';
import {readCanonicalV4MigrationManifest} from '../../portable/canonical-v4/index.js';

const DATA=fileURLToPath(new URL('../../data/',import.meta.url)),DIRECTORY=path.join(DATA,'canonical-migration-backups');
const PYTHON='C:\\Users\\Laurens\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
const ABSENCE=fileURLToPath(new URL('./windows-console-drain.py',import.meta.url));
const PG_NAME=/^postgres-canonical-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}\.murmingle-pgbackup$/u;
const RECEIPT=/^quiesced-postgres-[a-f0-9-]{36}\.json$/u,SHA=/^[a-f0-9]{64}$/u;
const fail=()=>Object.assign(new Error('Quiesced backup pair unavailable'),{code:'quiesced-backup-unavailable'});
const need=value=>{if(!value)throw fail();};
const digest=b=>createHash('sha256').update(b).digest('hex');
const STATE_SQL=`SELECT current_database() AS database,current_user AS role,
 host(inet_server_addr()) AS address,inet_server_port() AS port,
 pg_postmaster_start_time()::text AS server_start,r.generation,r.revision::text AS revision,
 (SELECT count(*)::integer FROM canonical_v4.schema_migrations) AS schema_version,
 (SELECT count(*)::integer FROM pg_stat_activity WHERE datname=current_database()
  AND backend_type='client backend' AND pid<>pg_backend_pid()) AS other_clients
 FROM canonical_v4.runtime_state r WHERE r.singleton`;

async function ordinary(filename){
 for(let cursor=filename;;cursor=path.dirname(cursor)){
  const s=await lstat(cursor);need(!s.isSymbolicLink()&&(cursor===filename?s.isFile():s.isDirectory()));
  if(path.dirname(cursor)===cursor)break;
 }
 need((await realpath(filename)).toLowerCase()===filename.toLowerCase());
}
async function hashFile(filename,maximum){
 await ordinary(filename);const before=await lstat(filename,{bigint:true}),fd=await open(filename,'r');
 const same=s=>['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===s[key]);
 try{
  need(before.size>0n&&before.size<=BigInt(maximum)&&same(await fd.stat({bigint:true})));
  const h=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;
  while(offset<Number(before.size)){const n=Math.min(buffer.length,Number(before.size)-offset);const read=await fd.read(buffer,0,n,offset);need(read.bytesRead===n);h.update(buffer.subarray(0,n));offset+=n;}
  need(same(await fd.stat({bigint:true}))&&same(await lstat(filename,{bigint:true})));await ordinary(filename);return h.digest('hex');
 }finally{await fd.close();}
}
function portClosed(port){return new Promise((resolve,reject)=>{
 let refused=false;const socket=net.createConnection({host:'127.0.0.1',port});
 socket.once('connect',()=>socket.destroy());socket.once('error',e=>{refused=e.code==='ECONNREFUSED';});
 socket.setTimeout(2000,()=>socket.destroy());socket.once('close',()=>refused?resolve():reject(fail()));
});}
function originalProcessesAbsent(){return new Promise((resolve,reject)=>{
 execFile(PYTHON,['-I','-S','-B',ABSENCE,'absence','all'],{windowsHide:true,timeout:15000,maxBuffer:4096},(error,stdout)=>{
  if(error||stdout.trim()!=='{"originalProcessesAbsent":true,"signalSent":false}')reject(fail());else resolve();
 });
});}
async function hostQuiesced(){
 await originalProcessesAbsent();const rows=await Promise.allSettled([4174,4185,55433].map(portClosed));need(rows.every(r=>r.status==='fulfilled'));
}
async function openOwner(){
 const {Pool}=createRequire(new URL('../../portable/package.json',import.meta.url))('pg');
 const pool=new Pool({host:'127.0.0.1',port:55432,database:'murmingle_canonical',user:'murmingle_owner',
  password:createWindowsDpapiPasswordProvider({role:'murmingle_owner'}),ssl:false,max:1,connectionTimeoutMillis:5000,query_timeout:5000});
 let client;try{client=await pool.connect();return {async read(){const {rows}=await client.query(STATE_SQL);need(rows.length===1);return rows[0];},
  async close(){client.release();await pool.end();}};}catch(error){try{await pool.end();}catch{}throw error;}
}
async function persistPostgresReceipt(receipt,archiveSha256){
 const protection=createWindowsBackupProtection();need(protection);await protection.prepareDirectory(DIRECTORY);
 const name='quiesced-postgres-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify({schema:'quiesced-postgres-backup-receipt/v1',archiveSha256,receipt})+'\n');need(raw.length<=65536);
 const fd=await open(path.join(DIRECTORY,name),'wx',0o600);try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}
 need(await hashFile(path.join(DIRECTORY,name),65536)===digest(raw));return {name,sha256:digest(raw)};
}
const REAL={
 async verifyRelease(){need(await runPostgresRuntimeOperator(['preflight'])===0);},hostQuiesced,openOwner,
 manifest:()=>readCanonicalV4MigrationManifest('legacy9'),local:q=>createLocalStateBackupOperator(q),
 createPostgres:createPostgresBackup,verifyPostgres:verifyPostgresBackup,persistPostgresReceipt,
 hashArchive:leaf=>{need(typeof leaf==='string'&&PG_NAME.test(leaf));return hashFile(path.join(DIRECTORY,leaf),1073741824+16412);},
 hashReceipt:leaf=>{need(typeof leaf==='string'&&RECEIPT.test(leaf));return hashFile(path.join(DIRECTORY,leaf),65536);},
 legacySeal:()=>hashFile(path.join(DATA,'postgres-runtime-manifest.json'),2097152),now:()=>performance.now(),
};

function checkedState(value){
 need(value&&value.database==='murmingle_canonical'&&value.role==='murmingle_owner'&&value.address==='127.0.0.1'&&value.port===55432&&
  value.schema_version===9&&value.other_clients===0&&typeof value.server_start==='string'&&value.server_start.length>0&&value.server_start.length<100&&
  typeof value.generation==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value.generation)&&typeof value.revision==='string'&&/^(0|[1-9][0-9]{0,15})$/u.test(value.revision)&&Number.isSafeInteger(Number(value.revision)));
 return {generation:value.generation,revision:Number(value.revision),serverStart:value.server_start,schemaVersion:9};
}
async function run(p,testComposition){
 const began=p.now();let owner=null,baseline=null,paired=null,postgres=null,receiptFile=null,failed=false,primary,result;
 const check=()=>need(p.now()<began+330000);
 const observe=async work=>{check();const value=await work();check();return value;};
 async function quiet(){
  await observe(()=>p.hostQuiesced());
  // Capture ownership before the post-await observation check.
  if(!owner){check();owner=await p.openOwner();check();}
  const state=checkedState(await observe(()=>owner.read()));
  if(baseline)need(isDeepStrictEqual(state,baseline));else baseline=state;
  return state;
 }
 async function capturePostgres(){
  need(postgres===null);const state=await quiet();postgres=await observe(()=>p.createPostgres());
  need(postgres.verified===true&&postgres.cleanupVerified===true&&postgres.migrations.length===9&&
   postgres.version.generation===state.generation&&postgres.version.revision===state.revision);
  const manifest=await observe(()=>p.manifest());need(manifest.length===9&&manifest.every((row,i)=>row.hash===postgres.migrations[i]));
  const verified=await observe(()=>p.verifyPostgres(postgres.filename));need(verified.verified===true&&isDeepStrictEqual(verified.version,postgres.version));
  const archiveSha256=await observe(()=>p.hashArchive(postgres.filename));need(SHA.test(archiveSha256));
  receiptFile=await observe(()=>p.persistPostgresReceipt(postgres,archiveSha256));need(RECEIPT.test(receiptFile.name)&&SHA.test(receiptFile.sha256));
  const sealSha256=await observe(()=>p.legacySeal());need(SHA.test(sealSha256));
  paired={archiveSha256,receiptSha256:receiptFile.sha256,generation:state.generation,revision:state.revision,schemaVersion:9,sealSha256,semanticRevision:null,fresh:true};
  return {...paired};
 }
 async function currentPair(){
  need(paired);const state=await quiet();
  need(await observe(()=>p.hashArchive(postgres.filename))===paired.archiveSha256&&await observe(()=>p.hashReceipt(receiptFile.name))===paired.receiptSha256);
  const sealSha256=await observe(()=>p.legacySeal());return {...paired,generation:state.generation,revision:state.revision,sealSha256};
 }
 try{
  await observe(()=>p.verifyRelease());await quiet();
  const local=p.local({assertQuiesced:async()=>{await quiet();},captureFreshPostgresPair:capturePostgres,readPostgresIdentity:currentPair});
  const captured=await observe(()=>local.capture());need(captured.status==='verified'&&isDeepStrictEqual(captured.pair,paired));
  const verified=await observe(()=>local.verify(captured.filename));need(verified.authenticated===true&&verified.archiveSha256===captured.archiveSha256&&isDeepStrictEqual(verified.pair,paired));
  need(isDeepStrictEqual(await currentPair(),paired));
  result={schema:'quiesced-postgres-local-state-pair/v1',status:'verified',postgresFilename:postgres.filename,
   postgresReceiptFilename:receiptFile.name,localFilename:captured.filename,localArchiveSha256:captured.archiveSha256,
   pair:{...paired},presentFiles:captured.presentFiles,localSourceBytes:captured.sourceBytes,
   observedQuiescencePassed:!testComposition,testComposition,restoreImplemented:false,servicesRestarted:false,
   quiescenceScope:'Repeated original-process absence, fixed-port refusal and no other canonical clients; trusted owner keeps writers stopped; held original local-file read lease'};
 }catch(error){failed=true;primary=error;}
 finally{if(owner)try{await owner.close();}catch(error){if(!failed){failed=true;primary=error;}}}
 if(failed)throw primary;return Object.freeze(result);
}
export async function captureQuiescedStateBackup(){need(arguments.length===0);return run(REAL,false);}
export async function captureQuiescedStateBackupForTest(ports){
 need(arguments.length===1&&ports&&typeof ports==='object'&&!types.isProxy(ports)&&Object.getPrototypeOf(ports)===Object.prototype&&
  Reflect.ownKeys(ports).length===Object.keys(REAL).length);const copy={};
 for(const key of Object.keys(REAL)){const d=Object.getOwnPropertyDescriptor(ports,key);need(d&&Object.hasOwn(d,'value')&&typeof d.value==='function');copy[key]=d.value;}
 return run(copy,true);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--capture')process.exitCode=2;
 else try{process.stdout.write(JSON.stringify(await captureQuiescedStateBackup())+'\n');}catch{process.stderr.write('Quiesced backup pair unavailable; services were not restarted.\n');process.exitCode=1;}
}
