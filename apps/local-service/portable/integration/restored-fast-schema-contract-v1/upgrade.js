// Trusted restored-fixture stage. Import performs no IO or connections. The
// owning restore entry authenticates the archive and its original owned client.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual,types} from 'node:util';
import {readCanonicalV4MigrationManifest} from '../../canonical-v4/index.js';
import {upgradeAutomaticTopics} from '../../canonical-v4/automatic-topics-installation.js';
import {describeAutomaticTopicBackupTables} from '../../../src/ops/automatic-topics-backup-operator.js';
import {projectedVectorRowHash,vectorProjectionSelect,describeVectorProjection} from '../../../experiments/restored-fingerprint-v1/vector-row.js';
import {RESTORED17_TABLES,LEGACY17_FINGERPRINT_TABLES,receiptFingerprintProfile} from '../restored-schema-contract-v1/contract.js';

const SHA=/^[a-f0-9]{64}$/u;
const LEGACY17_EXPECTED=Object.freeze({
 schema_migrations:'version',meta:'singleton',id_registry:'id',topics:'id',discussions:'id',sources:'id',
 embeddings:'source_id',source_links:'source_id',topic_memberships:'source_id,topic_id',fixed_references:'topic_id',
 contributions:'id',revisions:'contribution_id,ordinal',operation_receipts:'source_id',import_ledger:'import_id',
 runtime_state:'singleton',command_receipts:'actor_id,request_id',runtime_source_stamps:'source_id',ingestion_jobs:'operation_id',catalog_ingest_lane:'singleton',
 semantic_matchers:'matcher_hash',semantic_nodes:'matcher_hash,node_id',semantic_installation:'singleton',
 semantic_inputs:'source_id,operation_digest,matcher_hash',semantic_observations:'source_id,source_version,matcher_hash',
 semantic_root_snapshots:'root_id',semantic_root_edges:'root_id,node_id',semantic_owner_policy:'singleton',semantic_material_state:'singleton',
});
export const AUTOMATIC17_RESTORED_TABLES=RESTORED17_TABLES;
if(!isDeepStrictEqual(LEGACY17_EXPECTED,LEGACY17_FINGERPRINT_TABLES))throw new TypeError('Legacy receipt contract changed');
const SEQUENCES=Object.freeze({import_ledger_import_id_seq:['import_ledger','import_id'],contribution_ordinal_sequence:['contributions','ordinal'],topic_ordinal_sequence:['topics','ordinal'],
 discussion_ordinal_sequence:['discussions','ordinal'],source_ordinal_sequence:['sources','ordinal'],source_link_ordinal_sequence:['source_links','ordinal'],ingestion_job_ordinal_sequence:['ingestion_jobs','ordinal']});
const ADDED_SEQUENCES=Object.freeze({named_retrieval_inputs_index_ordinal_seq:['named_retrieval_inputs','index_ordinal'],named_index_requests_ordinal_seq:['named_index_requests','ordinal'],
 named_discovery_requests_ordinal_seq:['named_discovery_requests','ordinal'],named_feed_events_event_id_seq:['named_feed_events','event_id'],
 named_public_events_event_id_seq:['named_public_events','event_id'],unified_search_events_event_id_seq:['unified_search_events','event_id']});
const fail=code=>Object.assign(new Error('Restored automatic topic migration unavailable'),{code});
const need=(condition,code)=>{if(!condition)throw fail(code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
function record(value,keys){need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length,'AUTOMATIC_RESTORE_RECORD');const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);need(d?.enumerable&&Object.hasOwn(d,'value'),'AUTOMATIC_RESTORE_RECORD');out[k]=d.value;}return out;}
function integer(value){need(Number.isSafeInteger(value)&&value>=0,'AUTOMATIC_RESTORE_NUMBER');return value;}
function decimal(value){need(typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(value)&&BigInt(value)<=9223372036854775807n,'AUTOMATIC_RESTORE_SEQUENCE');return BigInt(value);}
async function one(tx,sql,args=[]){const {rows}=await tx.query(sql,args);need(rows.length===1,'AUTOMATIC_RESTORE_ROWS');return rows[0];}

function validateReceipt(receipt,manifest){
 need(receipt&&typeof receipt==='object'&&!types.isProxy(receipt),'AUTOMATIC_RESTORE_RECEIPT');
 need(receipt.verified===true&&receipt.cleanupVerified===true&&Array.isArray(receipt.migrations)&&receipt.migrations.length===17&&
  manifest.length===17&&receipt.migrations.every((h,i)=>h===manifest[i].hash),'AUTOMATIC_RESTORE_MANIFEST');
 const version=record(receipt.version,['generation','revision']);need(typeof version.generation==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(version.generation),'AUTOMATIC_RESTORE_VERSION');integer(version.revision);
 const fp=record(receipt.currentRowsFingerprint,['algorithm','tables','sha256']);
 need(fp.algorithm==='sha256-pkordered-jsonb-and-binary64-array-send/v1'&&Array.isArray(fp.tables)&&!types.isProxy(fp.tables),'AUTOMATIC_RESTORE_FINGERPRINT');
 let profile;try{profile=receiptFingerprintProfile(fp.tables.map(row=>record(row,['table','rows','sha256']).table));}catch{throw fail('AUTOMATIC_RESTORE_FINGERPRINT');}
 const expected=profile==='complete29'?AUTOMATIC17_RESTORED_TABLES:LEGACY17_FINGERPRINT_TABLES;
 for(const [i,row]of fp.tables.entries()){const a=record(row,['table','rows','sha256']);need(a.table===Object.keys(expected)[i]&&typeof a.sha256==='string'&&SHA.test(a.sha256),'AUTOMATIC_RESTORE_FINGERPRINT');integer(a.rows);}
 need(fp.sha256===digest(JSON.stringify(fp.tables)),'AUTOMATIC_RESTORE_FINGERPRINT');
 const b=record(receipt.fingerprintBinding,['dumpSha256','headerSha256','currentRowsFingerprintSha256','version','migrations']);
 need(typeof receipt.dumpSha256==='string'&&SHA.test(receipt.dumpSha256)&&typeof receipt.headerSha256==='string'&&SHA.test(receipt.headerSha256)&&
  b.dumpSha256===receipt.dumpSha256&&b.headerSha256===receipt.headerSha256&&b.currentRowsFingerprintSha256===fp.sha256&&isDeepStrictEqual(b.version,version)&&isDeepStrictEqual(b.migrations,receipt.migrations),'AUTOMATIC_RESTORE_BINDING');
 return profile;
}
async function fingerprint(tx,table){
 const order=AUTOMATIC17_RESTORED_TABLES[table],extra=['embeddings','fixed_references'].includes(table)?" || coalesce(array_send(t.values_double),''::bytea)":table==='semantic_inputs'?" || array_send(t.body_values) || array_send(t.title_values)":'';
 need(typeof order==='string','AUTOMATIC_RESTORE_TABLE');
 const local=table==='semantic_inputs',batchSize=local?32:128;
 const select=local?vectorProjectionSelect(table):`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')${extra}),'hex') AS row_sha FROM canonical_v4.${table} t ORDER BY ${order}`;
 await tx.query('DECLARE backup_rows NO SCROLL CURSOR FOR '+select);
 const hash=createHash('sha256');let rows=0,failed=false;
 try{for(;;){const batch=await tx.query(`FETCH FORWARD ${batchSize} FROM backup_rows`);need(batch.rows.length<=batchSize,'AUTOMATIC_RESTORE_FETCH');
  for(const row of batch.rows){const rowSha=local?projectedVectorRowHash(table,row):row.row_sha;need(typeof rowSha==='string'&&SHA.test(rowSha),'AUTOMATIC_RESTORE_ROW');hash.update(rowSha+'\n');integer(++rows);}if(batch.rows.length<batchSize)break;}
 }catch(error){failed=true;throw error;}finally{try{await tx.query('CLOSE backup_rows');}catch(error){if(!failed)throw error;}}
 return {table,rows,sha256:hash.digest('hex')};
}
async function sequences(tx,after){
 const expected={...SEQUENCES,...(after?ADDED_SEQUENCES:{})},rows=(await tx.query(`SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,s.seqincrement::text AS increment,s.seqcycle AS cycle
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname='canonical_v4'`)).rows;
 need(rows.length===Object.keys(expected).length&&new Set(rows.map(r=>r.name)).size===rows.length,'AUTOMATIC_RESTORE_SEQUENCE_SET');
 for(const row of rows){need(Object.hasOwn(expected,row.name)&&row.owner==='murmingle_owner'&&row.increment==='1'&&row.cycle===false,'AUTOMATIC_RESTORE_SEQUENCE');
  const [table,key]=expected[row.name],state=await one(tx,`SELECT last_value::text,is_called FROM canonical_v4.${row.name}`),max=await one(tx,`SELECT max(${key})::text AS maximum FROM canonical_v4.${table}`);
  const last=decimal(state.last_value);need(typeof state.is_called==='boolean','AUTOMATIC_RESTORE_SEQUENCE');const next=last+(state.is_called?1n:0n);
  need(next<=9223372036854775807n&&(max.maximum===null||next>decimal(max.maximum)),'AUTOMATIC_RESTORE_SEQUENCE_REUSE');
 }
}
async function snapshot(database,check,work){return database.transaction(async raw=>{
 need(raw?.dialect==='pg'&&typeof raw.query==='function','AUTOMATIC_RESTORE_TRANSACTION');
 const tx={query:async(...args)=>{check();const result=await raw.query(...args);check();return result;}};
 await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query('SET LOCAL search_path=pg_catalog');
 await tx.query("SET LOCAL TimeZone='UTC'");await tx.query("SET LOCAL DateStyle='ISO, YMD'");await tx.query('SET LOCAL extra_float_digits=3');return work(tx);
});}
const STATE_SQL=`SELECT r.generation,r.revision::text AS revision,i.matcher_hash,i.revision::text AS head_revision,
 p.revision::text AS policy_revision,p.default_max_depth,p.overrides FROM canonical_v4.runtime_state r
 JOIN canonical_v4.semantic_installation i ON i.singleton JOIN canonical_v4.semantic_owner_policy p ON p.singleton WHERE r.singleton`;
async function identities(tx,manifest,receipt,after){
 const rows=(await tx.query('SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')).rows;
 need(rows.length===manifest.length&&rows.every((row,i)=>Number(row.version)===i+1&&row.hash===manifest[i].hash),'AUTOMATIC_RESTORE_MANIFEST');
 const state=await one(tx,STATE_SQL);need(state.generation===receipt.version.generation&&state.revision===String(receipt.version.revision)&&typeof state.matcher_hash==='string'&&SHA.test(state.matcher_hash),'AUTOMATIC_RESTORE_VERSION');
 need(decimal(state.head_revision)<=BigInt(Number.MAX_SAFE_INTEGER)&&decimal(state.policy_revision)<=BigInt(Number.MAX_SAFE_INTEGER)&&Number(state.head_revision)>0&&Number(state.policy_revision)>0,'AUTOMATIC_RESTORE_HEAD');
 const relations=(await tx.query("SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='canonical_v4' AND c.relkind='r' ORDER BY c.relname COLLATE \"C\"")).rows;
 const tables=[...Object.keys(AUTOMATIC17_RESTORED_TABLES),...(after?Object.keys(describeAutomaticTopicBackupTables()):[])].sort();
 need(isDeepStrictEqual(relations.map(row=>row.name),tables),'AUTOMATIC_RESTORE_TABLE_SET');
 need(relations.every(row=>row.owner==='murmingle_owner'),'AUTOMATIC_RESTORE_TABLE_OWNER');
 // Explicit projection must never hide an added/dropped/substituted column.
 // Repeat this census on BOTH snapshots, before any fast row can be accepted.
 const columns=(await tx.query(`SELECT a.attname::text AS name,a.atttypid::integer AS oid FROM pg_attribute a
 JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='canonical_v4' AND c.relname='semantic_inputs' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname COLLATE "C"`)).rows;
 const projection=describeVectorProjection('semantic_inputs');
 need(isDeepStrictEqual(columns.map(r=>r.name),[...projection.base,...projection.arrays].sort())&&
  columns.filter(r=>projection.arrays.includes(r.name)).every(r=>r.oid===1022),'AUTOMATIC_RESTORE_PROJECTION_COLUMNS');
 const acl=await one(tx,`SELECT count(*)::integer AS n FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
 CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
 WHERE n.nspname='canonical_v4' AND a.grantee=0`);need(acl.n===0,'AUTOMATIC_RESTORE_PUBLIC_ACL');return state;
}

async function run(value,ports,testComposition){
 const a=record(value,['database','receipt','checkDeadline','onFingerprint']);need(a.database?.dialect==='pg'&&['query','exec','transaction'].every(k=>typeof a.database[k]==='function')&&typeof a.checkDeadline==='function'&&typeof a.onFingerprint==='function','AUTOMATIC_RESTORE_DATABASE');
 const check=a.checkDeadline;check();const oldManifest=await ports.manifest('hierarchy17');check();const profile=validateReceipt(a.receipt,oldManifest);
 const original=new Map(a.receipt.currentRowsFingerprint.tables.map(row=>[row.table,row]));
 let state,queueBefore;const verified=[];
 await snapshot(a.database,check,async tx=>{
  state=await identities(tx,oldManifest,a.receipt,false);
  for(const table of Object.keys(AUTOMATIC17_RESTORED_TABLES)){
   const actual=await fingerprint(tx,table);
   if(original.has(table))need(isDeepStrictEqual(actual,original.get(table)),'AUTOMATIC_RESTORE_ORIGINAL_ROWS');
   else need(profile==='legacy28'&&table==='semantic_preparation_requests','AUTOMATIC_RESTORE_FINGERPRINT');
   if(table==='semantic_preparation_requests')queueBefore=actual;
   verified.push(table);
   await a.onFingerprint('original-table-'+table+'-verified');check();
  }
  await sequences(tx,false);await a.onFingerprint('original-sequences-verified');check();
 });check();
 // No historical work is revoked or rewritten to make the upgrade pass. The
 // owner operation itself requires an idle copied ingestion queue and CAS.
 let roleSet=false,failed=false;
 try{
  await a.database.exec('SET ROLE murmingle_owner');roleSet=true;check();
  const result=await ports.upgrade({database:a.database,expectedHeadRevision:Number(state.head_revision),expectedPolicyRevision:Number(state.policy_revision)});check();
  need(result.schemaVersion===18&&result.matcherIdentityHash===state.matcher_hash&&result.headRevision===Number(state.head_revision)&&result.policyRevision===Number(state.policy_revision),'AUTOMATIC_RESTORE_UPGRADE');
  await a.onFingerprint('schema18-migration-verified');check();
 }catch(error){failed=true;throw error;}finally{if(roleSet)try{await a.database.exec('RESET ROLE');}catch(error){if(!failed)throw error;}}
 check();const manifest=await ports.manifest('hierarchy18');check();need(manifest.length===18&&isDeepStrictEqual(manifest.slice(0,17),oldManifest),'AUTOMATIC_RESTORE_PREFIX');
 const preserved=[];
 await snapshot(a.database,check,async tx=>{
  need(isDeepStrictEqual(await identities(tx,manifest,a.receipt,true),state),'AUTOMATIC_RESTORE_STATE_CHANGED');
  for(const table of Object.keys(AUTOMATIC17_RESTORED_TABLES))if(table!=='schema_migrations'){
   const expected=original.has(table)?original.get(table):profile==='legacy28'&&table==='semantic_preparation_requests'?queueBefore:null;
   need(expected&&isDeepStrictEqual(await fingerprint(tx,table),expected),'AUTOMATIC_RESTORE_PRESERVED_ROWS');preserved.push(table);
   await a.onFingerprint('preserved-table-'+table+'-verified');check();
  }
  await sequences(tx,true);await a.onFingerprint('migrated-sequences-verified');check();
 });check();
 need(queueBefore&&queueBefore.table==='semantic_preparation_requests','AUTOMATIC_RESTORE_QUEUE_PROOF');
 return Object.freeze({schema:'private-restored-automatic18-upgrade/v3',status:'passed',schemaVersion:18,restoredTables:verified.length,preservedLegacyTables:preserved.length,legacyRowsUnchanged:true,
  rowFingerprintImplementation:'semantic-input-binary64-jsonb/v1',receiptFingerprintTables:original.size,receiptFingerprintProfile:profile,derivedQueuePreserved:true,derivedQueueReceiptVerified:profile==='complete29',derivedQueueRows:queueBefore.rows,derivedQueueSha256:queueBefore.sha256,
  matcherUnchanged:true,policyUnchanged:true,runtimeVersionUnchanged:true,generatedSequencesSafe:true,testComposition});
}
const REAL={manifest:readCanonicalV4MigrationManifest,upgrade:upgradeAutomaticTopics};
export async function verifyAndUpgradeRestoredAutomaticTopics(value){need(arguments.length===1,'AUTOMATIC_RESTORE_ARGUMENTS');return run(value,REAL,false);}
export async function verifyAndUpgradeRestoredAutomaticTopicsForTest(value,ports){need(arguments.length===2,'AUTOMATIC_RESTORE_ARGUMENTS');const p=record(ports,['manifest','upgrade']);need(Object.values(p).every(x=>typeof x==='function'),'AUTOMATIC_RESTORE_PORTS');return run(value,p,true);}
