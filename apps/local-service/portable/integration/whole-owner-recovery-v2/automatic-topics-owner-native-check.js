// Closed full-owner schema17-to18 rehearsal. Import performs no filesystem,
// credential, native, SQL or application work. No caller chooses data or target.
import {createHash} from 'node:crypto';import {open,lstat,realpath,link} from 'node:fs/promises';
import {isDeepStrictEqual,types} from 'node:util';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createFixtureController} from '../native-hierarchy-postgres-v2/context.js';
import {getOwnedIdentity} from './hierarchy-native-cluster.js';
import {readOwnedPrivateRunBinding} from './hierarchy-native-run.js';
import {verifyAndUpgradeRestoredAutomaticTopics,AUTOMATIC17_RESTORED_TABLES} from '../restored-fast-schema-contract-v1/upgrade.js';
import {runPrivateAutomatic18ApplicationRehearsal,runPrivateAutomatic18BrowserApplicationRehearsal} from './private-application-rehearsal.js';
import {publishSingleCheckpoint,publishPairedCheckpoint} from './checkpoint-publication.js';
export const AUTOMATIC18_OWNER_INPUTS=Object.freeze({
 receipt:'hierarchy-nature-backup-final-20261029-result.json',receiptBytes:7445,receiptSha256:'e3401fc4a8a2ee6815362fddc82c019b279b9dc34f8a7f2019a4a03a607ba6e4',
 filename:'postgres-canonical-2026-10-29T02-06-29-777Z-0c3c99b5-781a-46bb-bb85-ed6b516feda7.murmingle-pgbackup',archiveBytes:1354426025,archiveSha256:'88600b8b3c31b3a3327611b0abe0730b1cf63bc2915d34c3f126d4f74ee8393c',
 dumpBytes:1354423835,dumpSha256:'b5b71ee2bdf8b1b0e5b0b004915ca26df5a18360311f85a3ec988002103c0019',headerSha256:'4475244139529e27e620b69c77bf73ea25aea148f9f0190ab7a3fbdebc225bfe',
});
const restoredTables=Object.keys(AUTOMATIC17_RESTORED_TABLES);
export const AUTOMATIC18_UPGRADE_PHASES=Object.freeze([
 ...restoredTables.map(table=>'original-table-'+table+'-verified'),'original-sequences-verified','schema18-migration-verified',
 ...restoredTables.filter(table=>table!=='schema_migrations').map(table=>'preserved-table-'+table+'-verified'),'migrated-sequences-verified']);
export const AUTOMATIC18_OWNER_PHASES=Object.freeze(['callback-enter','archive-hash-start','archive-hash-complete','backup-auth-start',
 'archive-authenticated','empty-target-verified','restore-dispatched','restore-retired',...AUTOMATIC18_UPGRADE_PHASES,'automatic18-upgrade-verified','application-verified',
 'scratch-a-retired','scratch-b-retired','inputs-closed']);
const EXTRA_PHASES=new Set(AUTOMATIC18_UPGRADE_PHASES);
export function automatic18CheckpointRecord(ordinal,elapsedMs){
 need(Number.isSafeInteger(ordinal)&&ordinal>=0&&ordinal<AUTOMATIC18_OWNER_PHASES.length&&Number.isSafeInteger(elapsedMs)&&elapsedMs>=0&&elapsedMs<=600000,'AUTOMATIC18_OWNER_PHASE');
 const stage=AUTOMATIC18_OWNER_PHASES[ordinal];return Object.freeze({elapsedMs,ordinal,
  schema:EXTRA_PHASES.has(stage)?'private-owner-automatic18-table-phase/v2':'private-owner-automatic18-phase/v1',stage});
}
const SAFE_FAILURE_CODES=new Set(('conflict forbidden invalid unavailable unauthorized not-found storage-failure storage-corrupt unsupported '+
 '23502 23503 23505 23514 40001 40P01 42501 42704 42883 42P01 42P07 55000 57014 P0001 '+
 'EACCES EPERM EEXIST ENOENT EPIPE EOF CHECKPOINT_PUBLICATION '+
 'AUTOMATIC18_OWNER_ROWS AUTOMATIC18_OWNER_IDENTITY AUTOMATIC18_OWNER_NOT_EMPTY AUTOMATIC18_OWNER_RECEIPT AUTOMATIC18_OWNER_CLIENT '+
 'AUTOMATIC18_OWNER_ARCHIVE AUTOMATIC18_OWNER_DUMP AUTOMATIC18_OWNER_RESTORE_UNSETTLED AUTOMATIC18_OWNER_HEADER AUTOMATIC18_OWNER_REPLACED '+
 'AUTOMATIC18_OWNER_UPGRADE AUTOMATIC18_OWNER_RESTORE AUTOMATIC18_OWNER_APPLICATION AUTOMATIC18_OWNER_RESULT AUTOMATIC18_OWNER_PATH '+
 'AUTOMATIC18_OWNER_INPUT AUTOMATIC18_OWNER_DIRECTORY AUTOMATIC18_OWNER_PHASE AUTOMATIC18_OWNER_ONESHOT').split(' '));
// Fixed literals from the reviewed migration/verifier/application sources.
for(const value of ["08001","08003","08006","0A000","22003","22023","42601","42703","42804","42809","42P17","42P18","53100","53200","53300","53400","54000","55P03","57P01","58000","58P01","APPLICATION_ACCOUNTS","APPLICATION_ASSERTION","APPLICATION_AUTOMATIC_BROWSER_PROTOCOL","APPLICATION_AUTOMATIC_CAPABILITIES","APPLICATION_AUTOMATIC_SEARCH","APPLICATION_BROWSER","APPLICATION_BROWSER_ACCOUNT","APPLICATION_BROWSER_OWNER","APPLICATION_BROWSER_REQUEST","APPLICATION_BROWSER_TOPIC","APPLICATION_CASE_OR_CLEANUP_FAILED","APPLICATION_CONTEXT","APPLICATION_DATABASE_CAPACITY","APPLICATION_DATABASE_CLOSE","APPLICATION_HTTP","APPLICATION_HTTP_BOUND","APPLICATION_HTTP_CAPACITY","APPLICATION_HTTP_JSON","APPLICATION_HTTP_TIMEOUT","APPLICATION_LEGACY","APPLICATION_LEGACY_SCOPE","APPLICATION_LISTENER","APPLICATION_MODEL","APPLICATION_MODEL_HTTP","APPLICATION_MODEL_OWNER","APPLICATION_MODEL_QUEUE","APPLICATION_MODEL_ROLE","APPLICATION_PATH","APPLICATION_PENDING","APPLICATION_PROOF_BOUND","APPLICATION_PROOF_BYTES","APPLICATION_PROOF_LINK","APPLICATION_RANDOM","APPLICATION_ROLE","APPLICATION_SQLITE_PATH","APPLICATION_TEST_PORTS","APPLICATION_UPGRADE","AUTOMATIC_RESTORE_ARGUMENTS","AUTOMATIC_RESTORE_BINDING","AUTOMATIC_RESTORE_DATABASE","AUTOMATIC_RESTORE_FETCH","AUTOMATIC_RESTORE_FINGERPRINT","AUTOMATIC_RESTORE_HEAD","AUTOMATIC_RESTORE_MANIFEST","AUTOMATIC_RESTORE_NUMBER","AUTOMATIC_RESTORE_ORIGINAL_ROWS","AUTOMATIC_RESTORE_PORTS","AUTOMATIC_RESTORE_PREFIX","AUTOMATIC_RESTORE_PRESERVED_ROWS","AUTOMATIC_RESTORE_PROJECTION_COLUMNS","AUTOMATIC_RESTORE_PUBLIC_ACL","AUTOMATIC_RESTORE_QUEUE_PROOF","AUTOMATIC_RESTORE_RECEIPT","AUTOMATIC_RESTORE_RECORD","AUTOMATIC_RESTORE_ROW","AUTOMATIC_RESTORE_ROWS","AUTOMATIC_RESTORE_SEQUENCE","AUTOMATIC_RESTORE_SEQUENCE_REUSE","AUTOMATIC_RESTORE_SEQUENCE_SET","AUTOMATIC_RESTORE_STATE_CHANGED","AUTOMATIC_RESTORE_TABLE","AUTOMATIC_RESTORE_TABLE_OWNER","AUTOMATIC_RESTORE_TABLE_SET","AUTOMATIC_RESTORE_TRANSACTION","AUTOMATIC_RESTORE_UPGRADE","AUTOMATIC_RESTORE_VERSION","ERR_ASSERTION","ETIMEDOUT","OWNED_BOOTSTRAP_UNSETTLED","OWNED_BULK_PURPOSE","OWNED_BULK_SETTINGS","OWNED_CHECKS_FAILED","OWNED_CLIENT","OWNED_CLIENT_CAPACITY","OWNED_CLIENT_CLOSE","OWNED_CLIENT_IDENTITY","OWNED_CLOCK","OWNED_CLUSTER_FAILED","OWNED_CONFIG","OWNED_CONNECTION_PROOF","OWNED_CONNECTOR_STATE","OWNED_CONNECT_FAILED","OWNED_DEADLINE","OWNED_DEPENDENCIES","OWNED_LATE_DISPATCH","OWNED_PARENT","OWNED_PATH_CAPACITY","OWNED_PLATFORM","OWNED_PORT","OWNED_POSTMASTER","OWNED_POSTMASTER_EXITED","OWNED_QUERY_STYLE","OWNED_RANDOM","OWNED_REPORT_CAPACITY","OWNED_REQUEST","OWNED_RESTORE_EXIT","OWNED_RESTORE_INPUT","OWNED_RESTORE_ONESHOT","OWNED_RESTORE_OUTPUT","OWNED_RESTORE_PROCESS","OWNED_RESTORE_REQUEST","OWNED_RESTORE_START","OWNED_RESTORE_STDIN","OWNED_RESTORE_TARGET","OWNED_ROLE","OWNED_RUN_ONESHOT","OWNED_SERVER_PROOF","OWNED_UTILITY_FAILED","OWNED_UTILITY_START","P1001","P1002","P1003","P1004","P1005","P1006","P1201","P1202","P1203","P1204","P1205","P1206","P1211","P1213","P1214","P1221","P1223","P1224","P1231","P1233","P1234","P1241","P1242","P1243","P1244","P1251","P1253","P1254","P1281","P1283","P1291","P1293","P1299","P1301","P1303","P1304","P1311","P1313","P1321","P1323","XX000","XX001"])SAFE_FAILURE_CODES.add(value);
export function projectOwnerFailureWitness(error,lastCompletedOrdinal){
 need(Number.isSafeInteger(lastCompletedOrdinal)&&lastCompletedOrdinal>=-1&&lastCompletedOrdinal<AUTOMATIC18_OWNER_PHASES.length,'AUTOMATIC18_OWNER_PHASE');
 let value='unknown';try{if(error&&typeof error==='object'&&!types.isProxy(error)){
  const d=Object.getOwnPropertyDescriptor(error,'code');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&SAFE_FAILURE_CODES.has(d.value))value=d.value;
 }}catch{}
 return Object.freeze({code:value,lastCompletedOrdinal,schema:'private-owner-automatic18-failure/v1'});
}
const DATA=fileURLToPath(new URL('../../../data/',import.meta.url)),NAMES=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];
const SHA=/^[a-f0-9]{64}$/u,hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>Object.assign(new Error('Automatic18 owner rehearsal unavailable'),{code});const need=(v,c)=>{if(!v)throw fail(c);};
function code(error){try{const d=error&&typeof error==='object'&&!types.isProxy(error)?Object.getOwnPropertyDescriptor(error,'code'):null;if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&SAFE_FAILURE_CODES.has(d.value)&&/^[A-Z0-9_]{1,64}$/u.test(d.value))return d.value;}catch{}return 'AUTOMATIC18_OWNER_FAILURE';}
async function one(db,sql){const r=await db.query(sql);need(r.rows.length===1,'AUTOMATIC18_OWNER_ROWS');return r.rows[0];}
const IDENTITY_SQL=`SELECT current_database() AS database,session_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,
 current_setting('server_version_num') AS version,extract(epoch FROM pg_postmaster_start_time()) AS started,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid`;
function identity(row,registered){need(row.database===NAMES[0]&&row.role==='postgres'&&row.address==='127.0.0.1'&&Number(row.port)===55433&&Number(row.version)===170011&&
 typeof row.oid==='string'&&/^[1-9][0-9]{0,9}$/u.test(row.oid)&&BigInt(row.oid)<=4294967295n&&Number.isFinite(Number(row.started))&&Number(row.started)>0&&
 registered?.database===row.database&&registered.role===row.role&&registered.address===row.address&&registered.port===55433&&registered.version===170011&&registered.started===Number(row.started),'AUTOMATIC18_OWNER_IDENTITY');return row;}
async function empty(db){const row=await one(db,`SELECT pg_get_userbyid(n.nspowner) AS owner,(SELECT count(*)::text FROM pg_depend d
 WHERE d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid) AS objects FROM pg_namespace n WHERE n.nspname='canonical_v4'`);need(row.owner==='postgres'&&row.objects==='0','AUTOMATIC18_OWNER_NOT_EMPTY');}
function receipt(raw,inputs){need(Buffer.isBuffer(raw)&&raw.length===inputs.receiptBytes&&hash(raw)===inputs.receiptSha256,'AUTOMATIC18_OWNER_RECEIPT');let r;
 try{r=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{throw fail('AUTOMATIC18_OWNER_RECEIPT');}
 need(r.verified===true&&r.cleanupVerified===true&&r.filename===inputs.filename&&r.dumpBytes===inputs.dumpBytes&&r.dumpSha256===inputs.dumpSha256&&r.headerSha256===inputs.headerSha256&&r.migrations?.length===17,'AUTOMATIC18_OWNER_RECEIPT');return r;}
// This purpose authenticates one fixed legacy receipt, never complete29 coverage.
function validUpgrade(u,testComposition){return u?.schema==='private-restored-automatic18-upgrade/v3'&&u.status==='passed'&&
 u.rowFingerprintImplementation==='semantic-input-binary64-jsonb/v1'&&
 u.schemaVersion===18&&u.restoredTables===29&&u.preservedLegacyTables===28&&u.testComposition===testComposition&&
 u.receiptFingerprintTables===28&&u.receiptFingerprintProfile==='legacy28'&&u.derivedQueuePreserved===true&&u.derivedQueueReceiptVerified===false&&
 Number.isSafeInteger(u.derivedQueueRows)&&u.derivedQueueRows>=0&&typeof u.derivedQueueSha256==='string'&&SHA.test(u.derivedQueueSha256)&&
 ['legacyRowsUnchanged','matcherUnchanged','policyUnchanged','runtimeVersionUnchanged','generatedSequencesSafe'].every(k=>u[k]===true);}
function build(deps,inputs){return ()=>deps.lifecycle(async capability=>{
 const {connectFixedRole,restoreArchive,checkDeadline:check,deadline}=capability;let original=null,db=null,data=null,upgrade=null,application=null,failed=false,primary=null;
 let archiveAuthenticated=false,completeInput=false,restoreProofVerified=false,cleanup=null,lastCompletedOrdinal=-1;
 const phase=async stage=>{await deps.phase(stage);lastCompletedOrdinal=AUTOMATIC18_OWNER_PHASES.indexOf(stage);};
 const selectFailure=async error=>{if(failed)return;failed=true;primary=code(error);
  if(typeof deps.recordFailure==='function')try{await deps.recordFailure(projectOwnerFailureWitness(error,lastCompletedOrdinal));}catch{/* Preserve the original failure; never retry a partial witness. */}
 };
 const controller=deps.controller({connectFixedRole:async(request,guard)=>{const client=await connectFixedRole(request,guard);if(request.database===NAMES[0]&&request.role==='postgres'){need(original===null,'AUTOMATIC18_OWNER_CLIENT');original=client;}return client;},getOwnedIdentity:deps.identity,guard:check});
 try{
  check();await phase('callback-enter');await phase('archive-hash-start');data=await deps.readData(check);check();
  need(data.archiveBytes===inputs.archiveBytes&&data.archiveSha256===inputs.archiveSha256,'AUTOMATIC18_OWNER_ARCHIVE');const r=receipt(data.receiptRaw,inputs);await phase('archive-hash-complete');
  db=await controller.acquire();check();need(original!==null,'AUTOMATIC18_OWNER_CLIENT');let target;
  await phase('backup-auth-start');const restored=await deps.restore(inputs.filename,{
   async inspect(){check();archiveAuthenticated=true;await phase('archive-authenticated');target=identity(await one(db,IDENTITY_SQL),deps.identity(original));await empty(db);check();await db.exec('DROP SCHEMA canonical_v4');check();await phase('empty-target-verified');return {host:'127.0.0.1',port:55433,database:NAMES[0],oid:target.oid,serverStarted:Number(target.started),owned:true,fresh:true,empty:true};},
   async restore(v){check();need(v.identity.oid===target.oid&&v.dumpBytes===inputs.dumpBytes&&v.dumpSha256===inputs.dumpSha256,'AUTOMATIC18_OWNER_DUMP');await phase('restore-dispatched');
    const closed=await restoreArchive({client:original,oid:target.oid,dump:v.dump,dumpBytes:inputs.dumpBytes,dumpSha256:inputs.dumpSha256});check();need(closed.closed===true&&closed.stdoutEof===true&&closed.stderrEof===true&&closed.exitCode===0,'AUTOMATIC18_OWNER_RESTORE_UNSETTLED');completeInput=true;await phase('restore-retired');return closed;},
   async verifyRestored(v){check();need(!restoreProofVerified&&hash(JSON.stringify(v.header))===inputs.headerSha256&&v.header.dumpBytes===inputs.dumpBytes&&v.header.dumpSha256===inputs.dumpSha256&&isDeepStrictEqual(v.header.version,r.version)&&isDeepStrictEqual(v.header.migrations,r.migrations)&&isDeepStrictEqual(v.header.counts,r.counts),'AUTOMATIC18_OWNER_HEADER');
    const now=identity(await one(db,IDENTITY_SQL),deps.identity(original));need(now.oid===target.oid&&Number(now.started)===Number(target.started),'AUTOMATIC18_OWNER_REPLACED');
    check();restoreProofVerified=true;return true;},
  });check();need(archiveAuthenticated&&completeInput&&restoreProofVerified&&restored.restored===true&&restored.dumpSha256===inputs.dumpSha256&&restored.targetDatabase===NAMES[0]&&restored.targetOid===target.oid,'AUTOMATIC18_OWNER_RESTORE');
  // Archive authentication/physical restore has its own bounded lifetime.
  // Exhaustive fingerprints and migration remain mandatory before application.
  const restoredIdentity=identity(await one(db,IDENTITY_SQL),deps.identity(original));
  need(restoredIdentity.oid===target.oid&&Number(restoredIdentity.started)===Number(target.started),'AUTOMATIC18_OWNER_REPLACED');
  upgrade=await deps.upgrade({database:db,receipt:r,checkDeadline:check,onFingerprint:phase});check();need(validUpgrade(upgrade,deps.testComposition),'AUTOMATIC18_OWNER_UPGRADE');await phase('automatic18-upgrade-verified');
  const dirs=await deps.directories(db,check);check();let roleSet=false,appFailed=false;
  try{await db.exec('SET ROLE murmingle_owner');roleSet=true;check();application=await deps.application({connectFixedRole,ownerDatabase:db,getOwnedIdentity:deps.identity,...dirs,checkDeadline:check,deadline,recordFailure:selectFailure,
    upgrade:Object.freeze({schemaVersion:18,preservedLegacyTables:28,legacyRowsUnchanged:true})});check();
   need(!failed&&application.status==='passed'&&typeof application.proofSha256==='string'&&SHA.test(application.proofSha256)&&Number.isSafeInteger(application.proofBytes)&&application.proofBytes>0&&application.proofBytes<=32768,'AUTOMATIC18_OWNER_APPLICATION');
  }catch(error){appFailed=true;throw error;}finally{if(roleSet)try{await db.exec('RESET ROLE');}catch(error){if(!appFailed)throw error;}}
  await phase('application-verified');await db.close();db=null;check();await phase('scratch-a-retired');const second=await controller.acquire();check();await empty(second);await second.close();check();await phase('scratch-b-retired');
 }catch(error){await selectFailure(error);}
 finally{
  const settle=async work=>{try{await work();}catch(error){await selectFailure(error);}};
  await settle(async()=>{cleanup=await controller.finish();});if(data)await settle(async()=>{await data.verify();check();});if(data)await settle(()=>data.close());
  if(!failed)await settle(async()=>{await phase('inputs-closed');});
 }
 return {schema:'owner-automatic18-postgres-proof/v1',status:!failed&&cleanup?.status==='passed'?'passed':'failed',primary,archiveAuthenticated,completeInput,ownerData:true,syntheticOnly:false,
  upgrade,application,cleanup};
});}
export function createAutomatic18OwnerCheckForTest(dependencies,inputs){return build({...dependencies,testComposition:true},inputs);}

const normalCleanup=value=>value?.reason==='verified-own-server-smart-stopped'&&['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].every(k=>value[k]===true);
export function projectAutomatic18OwnerResult(lifecycle){
 const proof=lifecycle?.checks,db=proof?.cleanup,rows=db?.databases,u=proof?.upgrade;
 const upgrade=u?Object.fromEntries(['schema','status','schemaVersion','restoredTables','preservedLegacyTables','legacyRowsUnchanged','matcherUnchanged','policyUnchanged','runtimeVersionUnchanged','generatedSequencesSafe','testComposition',
 'receiptFingerprintTables','receiptFingerprintProfile','derivedQueuePreserved','derivedQueueReceiptVerified','derivedQueueRows','derivedQueueSha256','rowFingerprintImplementation'].map(k=>[k,u[k]])):null;
 const application=proof?.application?Object.fromEntries(['status','proofSha256','proofBytes'].map(k=>[k,proof.application[k]])):null;
 const projected={schema:'owner-automatic18-postgres-result/v1',accepted:false,primary:proof?.primary??null,
  server:{port:lifecycle?.server?.port,version:lifecycle?.server?.version,ownershipVerified:lifecycle?.server?.ownershipVerified},
  cleanup:Object.fromEntries(['reason','stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].map(k=>[k,lifecycle?.cleanup?.[k]??null])),
  proof:{status:proof?.status??'failed',archiveAuthenticated:proof?.archiveAuthenticated===true,completeInput:proof?.completeInput===true,ownerData:proof?.ownerData===true,syntheticOnly:proof?.syntheticOnly!==false,
   upgrade,application,databases:Array.isArray(rows)?rows.map(r=>({name:r.name,oid:r.oid,created:r.created,closed:r.closed,dropped:r.dropped,pending:r.pending,cleanupFailures:r.sessionCleanupFailures?.length})):null,
   databaseCleanupPassed:db?.status==='passed'&&db.used===2&&db.finished===true&&db.adminClosed===true&&db.failures?.length===0}};
 projected.accepted=lifecycle?.status==='passed'&&lifecycle.syntheticOnly===false&&projected.primary===null&&projected.server.port===55433&&projected.server.version===170011&&projected.server.ownershipVerified===true&&normalCleanup(projected.cleanup)&&
  proof?.schema==='owner-automatic18-postgres-proof/v1'&&proof.status==='passed'&&['archiveAuthenticated','completeInput','ownerData'].every(k=>proof[k]===true)&&proof.syntheticOnly===false&&
  validUpgrade(u,false)&&
  proof.application?.status==='passed'&&typeof proof.application.proofSha256==='string'&&SHA.test(proof.application.proofSha256)&&Number.isSafeInteger(proof.application.proofBytes)&&proof.application.proofBytes>0&&proof.application.proofBytes<=32768&&
  projected.proof.databaseCleanupPassed&&rows.length===2&&rows[0].oid!==rows[1].oid&&rows.every((r,i)=>r.name===NAMES[i]&&typeof r.oid==='string'&&/^[1-9][0-9]{0,9}$/u.test(r.oid)&&BigInt(r.oid)<=4294967295n&&r.created===true&&r.closed===true&&r.dropped===true&&r.pending===0&&r.sessionCleanupFailures?.length===0);
 need(Buffer.byteLength(JSON.stringify(projected))<=32768,'AUTOMATIC18_OWNER_RESULT');return projected;
}
async function held(filename,size){for(let cursor=filename;;cursor=path.dirname(cursor)){const s=await lstat(cursor);need(!s.isSymbolicLink()&&(cursor===filename?s.isFile():s.isDirectory())&&await realpath(cursor)===cursor,'AUTOMATIC18_OWNER_PATH');if(path.dirname(cursor)===cursor)break;}
 const before=await lstat(filename),fd=await open(filename,'r'),id=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs];
 try{need(before.size===size&&isDeepStrictEqual(id(before),id(await fd.stat())),'AUTOMATIC18_OWNER_INPUT');return {fd,verify:async()=>need(isDeepStrictEqual(id(before),id(await fd.stat()))&&isDeepStrictEqual(id(before),id(await lstat(filename))),'AUTOMATIC18_OWNER_INPUT')};}catch(error){await fd.close();throw error;}}
async function readFixedData(check){const inputs=AUTOMATIC18_OWNER_INPUTS;let r=null,a=null;try{
 r=await held(path.join(DATA,inputs.receipt),inputs.receiptBytes);check();const raw=Buffer.alloc(inputs.receiptBytes);need((await r.fd.read(raw,0,raw.length,0)).bytesRead===raw.length,'AUTOMATIC18_OWNER_INPUT');await r.verify();await r.fd.close();r=null;
 a=await held(path.join(DATA,'canonical-migration-backups',inputs.filename),inputs.archiveBytes);check();const h=createHash('sha256'),buffer=Buffer.alloc(65536);let used=0;
 while(used<inputs.archiveBytes){check();const n=Math.min(buffer.length,inputs.archiveBytes-used);need((await a.fd.read(buffer,0,n,used)).bytesRead===n,'AUTOMATIC18_OWNER_INPUT');h.update(buffer.subarray(0,n));used+=n;}await a.verify();check();
 return {receiptRaw:raw,archiveBytes:used,archiveSha256:h.digest('hex'),verify:a.verify,close:()=>a.fd.close()};
 }catch(error){try{await r?.fd.close();}catch{}try{await a?.fd.close();}catch{}throw error;}}
async function realDirectories(database,check){check();const binding=await readOwnedPrivateRunBinding(),row=await one(database,"SELECT current_setting('data_directory') AS data_directory");check();
 const data=typeof row.data_directory==='string'?path.win32.normalize(row.data_directory):'',cluster=path.win32.dirname(data),output=path.win32.join(binding.runDirectory,'output');
 need(path.win32.isAbsolute(data)&&path.win32.dirname(cluster)===binding.clusterParent&&/^nhpg-[A-Za-z0-9]{6}$/u.test(path.win32.basename(cluster))&&path.win32.join(cluster,'pgdata')===data,'AUTOMATIC18_OWNER_DIRECTORY');
 for(const p of [cluster,output]){const s=await lstat(p);check();need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(p)===p,'AUTOMATIC18_OWNER_DIRECTORY');check();}return {clusterDirectory:cluster,outputDirectory:output};}
async function phaseWriter(){const binding=await readOwnedPrivateRunBinding(),output=path.win32.join(binding.runDirectory,'output'),before=await lstat(output),epoch=performance.now();let index=0;
 const check=()=>need(performance.now()-epoch<=600000,'AUTOMATIC18_OWNER_PHASE');
 const directory=async()=>{check();const now=await lstat(output);need(now.isDirectory()&&!now.isSymbolicLink()&&await realpath(output)===output&&now.dev===before.dev&&now.ino===before.ino,'AUTOMATIC18_OWNER_DIRECTORY');check();};
 const phase=async stage=>{need(AUTOMATIC18_OWNER_PHASES[index]===stage,'AUTOMATIC18_OWNER_PHASE');await directory();
  const elapsedMs=Math.round(performance.now()-epoch);need(Number.isSafeInteger(elapsedMs)&&elapsedMs>=0&&elapsedMs<=600000,'AUTOMATIC18_OWNER_PHASE');
  const raw=Buffer.from(JSON.stringify(automatic18CheckpointRecord(index,elapsedMs))+'\n'),base=path.win32.join(output,'phase-'+String(index).padStart(2,'0')),pending=base+'.pending',final=base+'.json';
  need(raw.length<=1024,'AUTOMATIC18_OWNER_PHASE');await (EXTRA_PHASES.has(stage)?publishSingleCheckpoint:publishPairedCheckpoint)(pending,final,raw,check);index++;
 };
 const recordFailure=async witness=>{await directory();const raw=Buffer.from(JSON.stringify(witness)+'\n');need(raw.length<=1024,'AUTOMATIC18_OWNER_PHASE');
  await publishPairedCheckpoint(path.win32.join(output,'owner-failure.pending'),path.win32.join(output,'owner-failure.json'),raw,check);
 };
 return Object.freeze({phase,recordFailure});}
let used=false;
async function runAutomatic18Owner(withBrowser){need(!used,'AUTOMATIC18_OWNER_ONESHOT');used=true;
 const [{runWithPrivateOwnedScopedPostgres},{restorePostgresBackupToOwnedFixture}]=await Promise.all([import('./hierarchy-native-cluster.js'),import('../../../src/ops/automatic-topics-backup-operator.js')]);
 const {phase,recordFailure}=await phaseWriter();return projectAutomatic18OwnerResult(await build({lifecycle:runWithPrivateOwnedScopedPostgres,controller:createFixtureController,identity:getOwnedIdentity,readData:readFixedData,
  restore:restorePostgresBackupToOwnedFixture,upgrade:verifyAndUpgradeRestoredAutomaticTopics,application:withBrowser?runPrivateAutomatic18BrowserApplicationRehearsal:runPrivateAutomatic18ApplicationRehearsal,directories:realDirectories,phase,recordFailure,testComposition:false},AUTOMATIC18_OWNER_INPUTS)());}
export async function runAutomatic18OwnerNativeCheck(){need(false,'COMPRESSED_BROWSER_PURPOSE_ONLY');}
export async function runAutomatic18BrowserOwnerNativeCheck(){need(arguments.length===0,'AUTOMATIC18_OWNER_ONESHOT');return runAutomatic18Owner(true);}
export async function main(args=process.argv.slice(2)){if(!Array.isArray(args)||args.length!==1||args[0]!=='--with-browser')return 2;try{const r=await runAutomatic18BrowserOwnerNativeCheck();process.stdout.write(JSON.stringify(r)+'\n');return r.accepted?0:1;}catch{process.stdout.write('{"schema":"owner-automatic18-postgres-result/v1","accepted":false,"failure":"private-automatic18-incomplete"}\n');return 1;}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
