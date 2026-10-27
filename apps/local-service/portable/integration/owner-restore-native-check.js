// Private full-owner-data rehearsal. Import is inert; only the closed noarg
// entry can open the fixed archive and invoke the separately owned lifecycle.
import {createHash} from 'node:crypto';
import {open,lstat,realpath,link} from 'node:fs/promises';
import {isDeepStrictEqual,types} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createFixtureController} from './native-hierarchy-postgres-v2/context.js';
import {getOwnedIdentity} from './hierarchy-native-cluster.js';
import {readOwnedPrivateRunBinding} from './hierarchy-native-run.js';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
import {readCanonicalV4MigrationManifest} from '../canonical-v4/index.js';

const SHA=/^[a-f0-9]{64}$/u,MAX_ARCHIVE=1073741824+16384+28;
const TABLES=Object.freeze({schema_migrations:'version',meta:'singleton',id_registry:'id',topics:'id',discussions:'id',sources:'id',
 embeddings:'source_id',source_links:'source_id',topic_memberships:'source_id,topic_id',fixed_references:'topic_id',
 contributions:'id',revisions:'contribution_id,ordinal',operation_receipts:'source_id',import_ledger:'import_id',
 runtime_state:'singleton',command_receipts:'actor_id,request_id',runtime_source_stamps:'source_id',ingestion_jobs:'operation_id',catalog_ingest_lane:'singleton'});
const NAMES=Object.freeze(['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b']);
const INPUTS=Object.freeze({receiptSha256:'7783f57371f1284c39892bcafae89b22c1976e4136897cecca65d4a6a211933e',
 archiveSha256:'e8026bc09c4ad53049d44bb5870cc28928ea0427ebd0d14a647a8bb1128ad831',
 headerSha256:'7104647562484ed211de0c105991751e4b46cd90fa3d470d3ff606f68e26cbb3',
 dumpSha256:'e8fce39659962bb4c8d5ee2087a606406141df3c54f2154742809501fec8ae9e',dumpBytes:779151859,
 filename:'postgres-canonical-2026-10-27T05-31-32-647Z-62729438-e09b-428d-b39e-9bdbe7f40677.murmingle-pgbackup'});
const GROUPS=Object.freeze([
 Object.freeze({name:'Private restored schema and grant boundaries',children:Object.freeze(['Restored fixed schema9 identities and primary-key collations','Restored owner and execute-only role boundaries'])}),
 Object.freeze({name:'Private full-data snapshot fingerprints',children:Object.freeze(Object.keys(TABLES).map(table=>'Restored snapshot table: '+table))}),
 Object.freeze({name:'Private restored generated ordinal safety',children:Object.freeze(['Restored identity and ordinal sequences cannot reuse stored keys'])}),
]);
export const OWNER_RESTORE_CASES=Object.freeze(GROUPS.flatMap(group=>[Object.freeze({name:group.name,depth:0}),...group.children.map(name=>Object.freeze({name,depth:1}))]));
export const OWNER_RESTORE_PHASES=Object.freeze(['callback-enter','archive-hash-start','archive-hash-complete','backup-auth-start','archive-authenticated','empty-target-verified',
 'restore-dispatched','restore-retired','schema-verified','grants-verified',...Object.keys(TABLES).map(table=>'table-'+table+'-verified'),
 'sequences-verified','scratch-a-retired','scratch-b-retired','inputs-closed']);
const error=code=>Object.assign(new Error('Private owner restore unavailable'),{code});
const hash=value=>createHash('sha256').update(value).digest('hex');
function requireThat(condition,code){if(!condition)throw error(code);}
function field(value,key){requireThat(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'RESTORE_RECORD');
 const d=Object.getOwnPropertyDescriptor(value,key);requireThat(d&&Object.hasOwn(d,'value'),'RESTORE_RECORD');return d.value;}
function array(value,max){requireThat(Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype,'RESTORE_ARRAY');
 const n=Object.getOwnPropertyDescriptor(value,'length').value;requireThat(n<=max&&Reflect.ownKeys(value).length===n+1,'RESTORE_ARRAY');
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));requireThat(d?.enumerable&&Object.hasOwn(d,'value'),'RESTORE_ARRAY');return d.value;});}
function integer(value,max=Number.MAX_SAFE_INTEGER){requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max,'RESTORE_INTEGER');return value;}
function code(value){try{if(value&&typeof value==='object'&&!types.isProxy(value)){const d=Object.getOwnPropertyDescriptor(value,'code');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[A-Z0-9_]{1,64}$/u.test(d.value))return d.value;}}catch{}return 'PRIVATE_RESTORE_FAILURE';}
function ledger(){let index=0,pending=0;const rows=[];return {
 async test(name,body,depth=0){const expected=OWNER_RESTORE_CASES[index++];requireThat(expected?.name===name&&expected.depth===depth,'RESTORE_LEDGER');
  const row={name,depth,status:'running'};rows.push(row);pending++;try{await body({test:(child,fn)=>this.test(child,fn,1)});row.status='passed';}
  catch(e){row.status='failed';throw e;}finally{pending--;}
 },snapshot:()=>({cases:rows.map(row=>({...row})),pendingAssertions:pending}),
 finish(){requireThat(index===25&&pending===0&&rows.every(row=>row.status==='passed'),'RESTORE_LEDGER');},
};}
function createPhaseWriter({fs,output,now,epoch,checkDeadline}){
 const prefix=PRIVATE_RUN_ROOT+'\\run-',suffix='\\output';
 requireThat(typeof output==='string'&&output.startsWith(prefix)&&output.endsWith(suffix)&&/^[a-f0-9]{48}$/u.test(output.slice(prefix.length,-suffix.length))&&
  path.win32.normalize(output)===output&&typeof now==='function'&&typeof checkDeadline==='function'&&Number.isFinite(epoch)&&epoch>=0,'RESTORE_PHASE_SCOPE');
 let index=0,lastElapsed=0,busy=false,failed=false,outputIdentity=null;
 const identity=stat=>[stat.dev,stat.ino];
 async function directory(){checkDeadline();const stat=await fs.lstat(output);checkDeadline();
  requireThat(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(output)===output,'RESTORE_PHASE_DIRECTORY');checkDeadline();
  if(outputIdentity===null)outputIdentity=identity(stat);else requireThat(isDeepStrictEqual(outputIdentity,identity(stat)),'RESTORE_PHASE_DIRECTORY');
 }
 return Object.freeze({async write(stage){
  requireThat(!busy&&!failed&&index<OWNER_RESTORE_PHASES.length&&OWNER_RESTORE_PHASES[index]===stage,'RESTORE_PHASE_ORDER');busy=true;
  try{
   checkDeadline();await directory();const elapsedMs=Math.round(now()-epoch);requireThat(Number.isSafeInteger(elapsedMs)&&elapsedMs>=lastElapsed&&elapsedMs<=360000,'RESTORE_PHASE_CLOCK');
   const record={elapsedMs,ordinal:index,schema:'private-owner-restore-phase/v1',stage},bytes=Buffer.from(JSON.stringify(record)+'\n');requireThat(bytes.length<=1024,'RESTORE_PHASE_BOUND');
   const base=path.win32.join(output,'phase-'+String(index).padStart(2,'0')),pending=base+'.pending',closed=base+'.json';
   checkDeadline();const fd=await fs.open(pending,'wx',0o600);let hadPrimary=false,primary;
   try{checkDeadline();await fd.writeFile(bytes);checkDeadline();await fd.sync();checkDeadline();}
   catch(e){hadPrimary=true;primary=e;throw e;}
   finally{try{await fd.close();}catch(e){if(!hadPrimary)throw e;}if(hadPrimary)void primary;}
   checkDeadline();const before=await fs.lstat(pending);checkDeadline();requireThat(before.isFile()&&!before.isSymbolicLink()&&before.size===bytes.length,'RESTORE_PHASE_FILE');
   await directory();checkDeadline();await fs.link(pending,closed);checkDeadline();const after=await fs.lstat(closed);checkDeadline();
   requireThat(after.isFile()&&!after.isSymbolicLink()&&after.size===bytes.length&&isDeepStrictEqual(identity(before),identity(after)),'RESTORE_PHASE_LINK');
   await directory();checkDeadline();lastElapsed=elapsedMs;index++;
  }catch(e){failed=true;throw e;}finally{busy=false;}
 },finish(){checkDeadline();requireThat(!busy&&!failed&&index===OWNER_RESTORE_PHASES.length,'RESTORE_PHASE_INCOMPLETE');}});
}
/** Invented filesystem/clock seam; cannot select the normal entry's directory. */
export function createOwnerRestorePhaseWriterForTest(dependencies){return createPhaseWriter(dependencies);}
function validateReceipt(raw,inputs,manifest){requireThat(Buffer.isBuffer(raw)&&raw.length<=65536&&hash(raw)===inputs.receiptSha256,'RESTORE_RECEIPT_PIN');
 let receipt;try{receipt=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{throw error('RESTORE_RECEIPT_ENCODING');}
 requireThat(field(receipt,'verified')===true&&field(receipt,'cleanupVerified')===true&&field(receipt,'filename')===inputs.filename&&
  field(receipt,'dumpBytes')===inputs.dumpBytes&&field(receipt,'dumpSha256')===inputs.dumpSha256&&field(receipt,'headerSha256')===inputs.headerSha256,'RESTORE_RECEIPT_BINDING');
 const migrations=array(field(receipt,'migrations'),9);requireThat(migrations.length===9&&manifest.length===9&&migrations.every((h,i)=>h===manifest[i].hash),'RESTORE_RECEIPT_SCHEMA');
 const version=field(receipt,'version');integer(field(version,'revision'));requireThat(typeof field(version,'generation')==='string'&&version.generation.length>0&&version.generation.length<=128,'RESTORE_RECEIPT_VERSION');
 const fingerprint=field(receipt,'currentRowsFingerprint'),tables=array(field(fingerprint,'tables'),19);
 requireThat(field(fingerprint,'algorithm')==='sha256-pkordered-jsonb-and-binary64-array-send/v1'&&tables.length===19,'RESTORE_RECEIPT_FINGERPRINT');
 for(const [i,table] of tables.entries()){requireThat(field(table,'table')===Object.keys(TABLES)[i]&&typeof field(table,'sha256')==='string'&&SHA.test(table.sha256),'RESTORE_RECEIPT_FINGERPRINT');integer(field(table,'rows'));}
 requireThat(field(fingerprint,'sha256')===hash(JSON.stringify(tables)),'RESTORE_RECEIPT_FINGERPRINT');
 const binding=field(receipt,'fingerprintBinding');requireThat(field(binding,'dumpSha256')===inputs.dumpSha256&&field(binding,'headerSha256')===inputs.headerSha256&&
  field(binding,'currentRowsFingerprintSha256')===fingerprint.sha256&&isDeepStrictEqual(field(binding,'version'),version)&&isDeepStrictEqual(field(binding,'migrations'),migrations),'RESTORE_RECEIPT_BINDING');
 return receipt;
}
const IDENTITY_SQL=`SELECT current_database() AS database,session_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,
 current_setting('server_version_num') AS version,extract(epoch FROM pg_postmaster_start_time()) AS started,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid`;
function checkedIdentity(row,registered,name){requireThat(row&&row.database===name&&row.role==='postgres'&&row.address==='127.0.0.1'&&Number(row.port)===55433&&Number(row.version)===170011&&
 typeof row.oid==='string'&&/^[1-9][0-9]{0,9}$/u.test(row.oid)&&BigInt(row.oid)<=4294967295n&&Number.isFinite(Number(row.started))&&Number(row.started)>0&&
 registered?.database===name&&registered.role==='postgres'&&registered.address==='127.0.0.1'&&registered.port===55433&&registered.version===170011&&registered.started===Number(row.started),'RESTORE_TARGET_IDENTITY');return row;}
async function one(db,sql,args=[]){const {rows}=await db.query(sql,args);requireThat(rows.length===1,'RESTORE_SQL_SHAPE');return rows[0];}
async function emptySchema(db){const row=await one(db,`SELECT pg_get_userbyid(n.nspowner) AS owner,
 (SELECT count(*)::text FROM pg_depend d WHERE d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid) AS objects
 FROM pg_namespace n WHERE n.nspname='canonical_v4'`);requireThat(row.owner==='postgres'&&row.objects==='0','RESTORE_TARGET_NOT_EMPTY');}

const HELPERS=new Set(['reject_import_receipt_mutation','runtime_utf16_length','runtime_safe_text','ingest_guard_learned_url','ingest_valid_unit_vector','ingest_ridge_similarity',
 'ingest_json_number','ingest_validate_material','ingest_default_runtime_witness','ingest_default_source_catalog_revision','ingest_wipe_terminal_witness']);
const DEFINERS=new Set(['runtime_lock_row','runtime_prepare_command','runtime_complete_command','runtime_append_command','runtime_lifecycle_command','runtime_withdraw_account_contributions',
 'ingest_ridge_predicate','ingest_ridge_scan','ingest_enqueue_job','ingest_enqueue_interactive','ingest_enqueue_crawler','ingest_claim','ingest_renew_authority','ingest_renew_lease','ingest_revoke_authority',
 'ingest_source_response','ingest_receipt','ingest_apply','ingest_status','ingest_fail_claim','ingest_require_idle_lane','ingest_forget_sources_internal','ingest_correct_source','ingest_forget_source',
 'ingest_delete_learned_topic','ingest_clear_learned_data']);
const EXECUTE={murmingle_app:new Set(['runtime_append_command','runtime_lifecycle_command','runtime_withdraw_account_contributions',
 'ingest_enqueue_interactive','ingest_renew_authority','ingest_revoke_authority','ingest_receipt','ingest_status','ingest_correct_source','ingest_forget_source','ingest_delete_learned_topic','ingest_clear_learned_data']),
 murmingle_crawler_submitter:new Set(['ingest_enqueue_crawler','ingest_renew_authority','ingest_revoke_authority','ingest_receipt','ingest_status']),
 murmingle_ingest_worker:new Set(['ingest_claim','ingest_renew_lease','ingest_ridge_predicate','ingest_ridge_scan','ingest_apply','ingest_fail_claim'])};
const APP_READ=new Set(Object.keys(TABLES).filter(name=>!['command_receipts','runtime_source_stamps','ingestion_jobs','catalog_ingest_lane'].includes(name)));
const SEQUENCES=Object.freeze({import_ledger_import_id_seq:['import_ledger','import_id'],contribution_ordinal_sequence:['contributions','ordinal'],topic_ordinal_sequence:['topics','ordinal'],
 discussion_ordinal_sequence:['discussions','ordinal'],source_ordinal_sequence:['sources','ordinal'],source_link_ordinal_sequence:['source_links','ordinal'],ingestion_job_ordinal_sequence:['ingestion_jobs','ordinal']});
const TEXT_PKS=Object.freeze(['id_registry.id','topics.id','discussions.id','sources.id','embeddings.source_id','source_links.source_id','topic_memberships.source_id','topic_memberships.topic_id',
 'fixed_references.topic_id','contributions.id','revisions.contribution_id','operation_receipts.source_id','command_receipts.actor_id','command_receipts.request_id','runtime_source_stamps.source_id','ingestion_jobs.operation_id'].sort());
const decimal=value=>{requireThat(typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(value)&&BigInt(value)<=9223372036854775807n,'RESTORE_SEQUENCE');return BigInt(value);};

async function verifyDatabase(db,receipt,manifest,checks,check,phase){
 return db.transaction(async raw=>{const tx={query:async(sql,args=[])=>{check();const result=await raw.query(sql,args);check();return result;}};
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await tx.query('SET LOCAL search_path=pg_catalog');
  await tx.query("SET LOCAL TimeZone='UTC'");await tx.query("SET LOCAL DateStyle='ISO, YMD'");await tx.query('SET LOCAL extra_float_digits=3');
  await checks.test(GROUPS[0].name,async t=>{
   await t.test(GROUPS[0].children[0],async()=>{
    const migrations=(await tx.query('SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')).rows;
    requireThat(migrations.length===9&&migrations.every((row,i)=>Number(row.version)===i+1&&row.hash===manifest[i].hash),'RESTORE_MIGRATIONS');
    const version=await one(tx,'SELECT generation,revision::text FROM canonical_v4.runtime_state WHERE singleton');
    requireThat(version.generation===receipt.version.generation&&version.revision===String(receipt.version.revision),'RESTORE_VERSION');
    const extension=await one(tx,"SELECT extversion FROM pg_extension WHERE extname='vector'");requireThat(extension.extversion==='0.8.2','RESTORE_VECTOR');
    const locale=await one(tx,"SELECT datcollate,datctype FROM pg_database WHERE datname=current_database()");requireThat(locale.datcollate==='German_Germany.1252'&&locale.datctype==='German_Germany.1252','RESTORE_COLLATION');
    const relations=(await tx.query("SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='canonical_v4' AND c.relkind='r' ORDER BY c.relname COLLATE \"C\"")).rows;
    requireThat(isDeepStrictEqual(relations.map(row=>row.name),Object.keys(TABLES).sort())&&relations.every(row=>row.owner==='murmingle_owner'),'RESTORE_RELATIONS');
    const pks=(await tx.query(`SELECT c.relname AS table_name,a.attname,co.collname FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) k(attnum)
     JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum JOIN pg_type ty ON ty.oid=a.atttypid
     LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname='canonical_v4' AND i.indisprimary AND ty.typcategory='S'`)).rows;
    requireThat(isDeepStrictEqual(pks.map(row=>row.table_name+'.'+row.attname).sort(),TEXT_PKS)&&pks.every(row=>row.collname==='C'),'RESTORE_PK_COLLATION');
    await phase('schema-verified');
   });
   await t.test(GROUPS[0].children[1],async()=>{
    const schema=await one(tx,"SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='canonical_v4'");requireThat(schema.owner==='murmingle_owner','RESTORE_OWNER');
    const roles=(await tx.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles
     WHERE rolname IN('murmingle_owner','murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker')`)).rows;
    requireThat(roles.length===4&&new Set(roles.map(row=>row.rolname)).size===4&&roles.every(row=>['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].every(key=>row[key]===false)&&
      row.rolcanlogin===(row.rolname!=='murmingle_owner')),'RESTORE_ROLE_ATTRIBUTES');
    const publicRelations=await one(tx,`SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a
     WHERE n.nspname='canonical_v4' AND c.relkind IN('r','S') AND a.grantee=0`);requireThat(publicRelations.n==='0','RESTORE_PUBLIC_RELATIONS');
    const functions=(await tx.query(`SELECT p.proname AS name,pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS definer,p.proconfig AS config,
     EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
     has_function_privilege('murmingle_app',p.oid,'EXECUTE') AS app,has_function_privilege('murmingle_crawler_submitter',p.oid,'EXECUTE') AS submitter,
     has_function_privilege('murmingle_ingest_worker',p.oid,'EXECUTE') AS worker FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='canonical_v4'`)).rows;
    requireThat(functions.length===HELPERS.size+DEFINERS.size&&new Set(functions.map(row=>row.name)).size===functions.length,'RESTORE_FUNCTION_SET');
    for(const row of functions){requireThat(HELPERS.has(row.name)||DEFINERS.has(row.name),'RESTORE_FUNCTION_SET');
     // Only this closed37-name enum may enter finite field diagnostics.
     const diagnostic='RESTORE_FN_'+row.name.toUpperCase();
     requireThat(row.owner==='murmingle_owner',diagnostic+'_OWNER');requireThat(row.definer===DEFINERS.has(row.name),diagnostic+'_DEFINER');
     // 004 explicitly pins JSON rendering in addition to the search path.
     const config=row.name==='reject_import_receipt_mutation'?null:row.name==='ingest_json_number'?['search_path=pg_catalog','extra_float_digits=3']:['search_path=pg_catalog'];
     requireThat(isDeepStrictEqual(row.config,config),diagnostic+'_CONFIG');requireThat(row.public_execute===false,diagnostic+'_PUBLIC');
     for(const [role,key]of [['murmingle_app','app'],['murmingle_crawler_submitter','submitter'],['murmingle_ingest_worker','worker']])requireThat(row[key]===EXECUTE[role].has(row.name),'RESTORE_EXECUTE_GRANT');}
    const grants=(await tx.query(`SELECT r.rolname AS role,c.relname AS name,
     has_table_privilege(r.rolname,c.oid,'SELECT') AS readable,
     has_table_privilege(r.rolname,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.rolname,c.oid,'INSERT,UPDATE,REFERENCES') AS writable,
     has_any_column_privilege(r.rolname,c.oid,'SELECT') AS column_readable FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE r.rolname IN('murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker') AND n.nspname='canonical_v4' AND c.relkind='r'`)).rows;
    requireThat(grants.length===57,'RESTORE_TABLE_GRANTS');for(const row of grants){const allowed=row.role==='murmingle_app'?APP_READ.has(row.name):row.name==='schema_migrations';
     requireThat(row.writable===false&&row.readable===allowed&&row.column_readable===allowed,'RESTORE_TABLE_GRANTS');}
    const sequenceGrants=await one(tx,`SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
     WHERE n.nspname='canonical_v4' AND c.relkind='S' AND r.rolname IN('murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker')
     AND has_sequence_privilege(r.rolname,c.oid,'USAGE,SELECT,UPDATE')`);requireThat(sequenceGrants.n==='0','RESTORE_SEQUENCE_GRANTS');
    await phase('grants-verified');
   });
  });
  const observed=[];
  await checks.test(GROUPS[1].name,async t=>{for(const [i,[table,order]]of Object.entries(TABLES).entries())await t.test(GROUPS[1].children[i],async()=>{
   const extra=table==='embeddings'||table==='fixed_references'?" || coalesce(array_send(t.values_double),''::bytea)":'';
   await tx.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')${extra}),'hex') AS row_sha FROM canonical_v4.${table} t ORDER BY ${order}`);
   const digest=createHash('sha256');let rows=0,failed=false,primary;
   try{for(;;){const result=await tx.query('FETCH FORWARD 128 FROM backup_rows');requireThat(result.rows.length<=128,'RESTORE_FINGERPRINT_ROWS');
    for(const row of result.rows){requireThat(typeof row.row_sha==='string'&&SHA.test(row.row_sha),'RESTORE_FINGERPRINT_HASH');digest.update(row.row_sha+'\n');rows++;integer(rows);}if(result.rows.length<128)break;}
   }catch(e){failed=true;primary=e;throw e;}finally{try{await tx.query('CLOSE backup_rows');}catch(e){if(!failed)throw e;}if(failed)void primary;}
   const fingerprint={table,rows,sha256:digest.digest('hex')};requireThat(isDeepStrictEqual(fingerprint,receipt.currentRowsFingerprint.tables[i]),'RESTORE_TABLE_FINGERPRINT');observed.push(fingerprint);
   await phase('table-'+table+'-verified');
  });requireThat(hash(JSON.stringify(observed))===receipt.currentRowsFingerprint.sha256,'RESTORE_COMPOSITE_FINGERPRINT');});
  await checks.test(GROUPS[2].name,async t=>{await t.test(GROUPS[2].children[0],async()=>{
   const sequences=(await tx.query(`SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,s.seqincrement::text AS increment,s.seqcycle AS cycle
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname='canonical_v4'`)).rows;
   requireThat(sequences.length===7&&new Set(sequences.map(row=>row.name)).size===7,'RESTORE_SEQUENCE_SET');
   for(const row of sequences){requireThat(Object.hasOwn(SEQUENCES,row.name)&&row.owner==='murmingle_owner'&&row.increment==='1'&&row.cycle===false,'RESTORE_SEQUENCE');
    const [table,key]=SEQUENCES[row.name],state=await one(tx,`SELECT last_value::text,is_called FROM canonical_v4.${row.name}`),maximum=await one(tx,`SELECT max(${key})::text AS maximum FROM canonical_v4.${table}`);
    const last=decimal(state.last_value);requireThat(typeof state.is_called==='boolean','RESTORE_SEQUENCE');const next=last+(state.is_called?1n:0n);
    requireThat(next<=9223372036854775807n&&(maximum.maximum===null||next>decimal(maximum.maximum)),'RESTORE_SEQUENCE_REUSE');}
   await phase('sequences-verified');
  });});
  checks.finish();return true;
 });
}

function buildCheck(deps,inputs){return async()=>deps.lifecycle(async capability=>{
 const {connectFixedRole,restoreArchive,deadline,checkDeadline}=capability;requireThat(typeof connectFixedRole==='function'&&typeof restoreArchive==='function'&&typeof checkDeadline==='function'&&Number.isFinite(deadline),'RESTORE_CAPABILITY');
 const epoch=deps.now();requireThat(Number.isFinite(epoch)&&epoch>=0,'RESTORE_PHASE_CLOCK');
 let openScope=true,originalClient=null,db=null,data=null,receiptBound=false,archiveAuthenticated=false,completeInput=false,restoreVerified=false,hadPrimary=false,primary;
 const check=()=>{requireThat(openScope,'RESTORE_SCOPE_RETIRED');checkDeadline();};
 let phases=null;
 const phase=async stage=>{check();await phases.write(stage);check();};
 const controller=deps.controller({connectFixedRole:async(request,guard)=>{const client=await connectFixedRole(request,guard);if(request.database===NAMES[0]&&request.role==='postgres'){requireThat(originalClient===null,'RESTORE_TARGET_REUSE');originalClient=client;}return client;},getOwnedIdentity:deps.getOwnedIdentity,guard:check}),checks=ledger();
 let cleanup;
 try{
  check();phases=await deps.openPhases({epoch,checkDeadline:check});check();await phase('callback-enter');await phase('archive-hash-start');
  data=await deps.readData(check);check();requireThat(data.archiveSha256===inputs.archiveSha256&&Number.isSafeInteger(data.archiveBytes)&&data.archiveBytes>inputs.dumpBytes&&data.archiveBytes<=MAX_ARCHIVE,'RESTORE_ARCHIVE_PIN');
  await phase('archive-hash-complete');
  const manifest=await deps.manifest();check();const receipt=validateReceipt(data.receiptRaw,inputs,manifest);receiptBound=true;
  db=await controller.acquire();check();requireThat(originalClient!==null,'RESTORE_TARGET_CLIENT');
  let target;
  const port={
   inspect:async()=>{check();archiveAuthenticated=true;await phase('archive-authenticated');target=checkedIdentity(await one(db,IDENTITY_SQL),deps.getOwnedIdentity(originalClient),NAMES[0]);check();await emptySchema(db);check();
    await db.exec('DROP SCHEMA canonical_v4');check();await phase('empty-target-verified');return {host:'127.0.0.1',port:55433,database:NAMES[0],oid:target.oid,serverStarted:Number(target.started),owned:true,fresh:true,empty:true};},
   restore:async value=>{check();requireThat(value.identity.oid===target.oid&&value.dumpSha256===inputs.dumpSha256&&value.dumpBytes===inputs.dumpBytes,'RESTORE_DUMP_BINDING');
    await phase('restore-dispatched');const result=await restoreArchive({client:originalClient,oid:target.oid,dump:value.dump,dumpBytes:inputs.dumpBytes,dumpSha256:inputs.dumpSha256});check();
    requireThat(result.closed===true&&result.stdoutEof===true&&result.stderrEof===true&&result.exitCode===0,'RESTORE_CHILD_UNSETTLED');completeInput=true;await phase('restore-retired');return result;},
   verifyRestored:async value=>{check();requireThat(hash(JSON.stringify(value.header))===inputs.headerSha256&&value.header.dumpSha256===inputs.dumpSha256&&value.header.dumpBytes===inputs.dumpBytes&&
    isDeepStrictEqual(value.header.version,receipt.version)&&isDeepStrictEqual(value.header.migrations,receipt.migrations)&&isDeepStrictEqual(value.header.counts,receipt.counts),'RESTORE_HEADER_BINDING');
    const identity=checkedIdentity(await one(db,IDENTITY_SQL),deps.getOwnedIdentity(originalClient),NAMES[0]);requireThat(identity.oid===target.oid&&Number(identity.started)===Number(target.started),'RESTORE_TARGET_REPLACED');
    return verifyDatabase(db,receipt,manifest,checks,check,phase);},
  };
  await phase('backup-auth-start');const result=await deps.restore(inputs.filename,port);check();requireThat(result.restored===true&&result.dumpSha256===inputs.dumpSha256&&result.targetDatabase===NAMES[0]&&result.targetOid===target.oid,'RESTORE_RESULT');restoreVerified=true;
  await db.close();db=null;check();await phase('scratch-a-retired');const second=await controller.acquire();check();await emptySchema(second);await second.close();check();await phase('scratch-b-retired');
 }catch(e){hadPrimary=true;primary=e;}
 finally{
  try{cleanup=await controller.finish();}catch(e){if(!hadPrimary){hadPrimary=true;primary=e;}}
  try{if(data){await data.verify();check();}}catch(e){if(!hadPrimary){hadPrimary=true;primary=e;}}
  try{await data?.close();}catch(e){if(!hadPrimary){hadPrimary=true;primary=e;}}
  if(!hadPrimary)try{await phase('inputs-closed');phases.finish();}catch(e){hadPrimary=true;primary=e;}
  openScope=false;
 }
 const state=checks.snapshot();return {schema:'owner-restore-postgres-proof/v1',status:!hadPrimary&&restoreVerified&&cleanup?.status==='passed'?'passed':'failed',primary:hadPrimary?code(primary):null,
  cases:state.cases,pendingAssertions:state.pendingAssertions,ownerData:true,syntheticOnly:false,archiveAuthenticated,receiptBound,completeInput,restoreVerified,cleanup};
 });}

// Trusted fake-port seam only. Normal invocation never accepts dependencies,
// alternate data pins, callbacks, credentials, filenames or target selectors.
export function createOwnerRestoreCheckForTest(dependencies,inputs){return buildCheck(dependencies,inputs);}
function requiredBoolean(value){requireThat(typeof value==='boolean','RESTORE_PROJECTION');return value;}
export function projectOwnerRestoreResult(lifecycle){
 const server=field(lifecycle,'server'),retirement=field(lifecycle,'cleanup'),proof=field(lifecycle,'checks'),dbCleanup=field(proof,'cleanup');
 const primary=field(proof,'primary');requireThat(primary===null||typeof primary==='string'&&/^[A-Z0-9_]{1,64}$/u.test(primary),'RESTORE_PROJECTION');
 const cases=array(field(proof,'cases'),25).map((row,i)=>{requireThat(field(row,'name')===OWNER_RESTORE_CASES[i].name&&field(row,'depth')===OWNER_RESTORE_CASES[i].depth&&['passed','failed','running'].includes(field(row,'status')),'RESTORE_PROJECTION');return {name:row.name,depth:row.depth,status:row.status};});
 const databases=array(field(dbCleanup,'databases'),2).map((row,i)=>{requireThat(field(row,'name')===NAMES[i],'RESTORE_PROJECTION');const oid=field(row,'oid');requireThat(oid===null||typeof oid==='string'&&/^[1-9][0-9]{0,9}$/u.test(oid)&&BigInt(oid)<=4294967295n,'RESTORE_PROJECTION');
  return {name:NAMES[i],oid,...Object.fromEntries(['created','closed','dropped'].map(key=>[key,requiredBoolean(field(row,key))])),pending:integer(field(row,'pending'),32),cleanupFailures:array(field(row,'sessionCleanupFailures'),64).length};});
 const status=field(proof,'status'),cleanupStatus=field(dbCleanup,'status');requireThat(['passed','failed'].includes(status)&&['passed','failed'].includes(cleanupStatus)&&field(proof,'schema')==='owner-restore-postgres-proof/v1','RESTORE_PROJECTION');
 const projected={schema:'owner-restore-postgres-result/v1',accepted:false,primary,
  server:{port:integer(field(server,'port'),65535),version:integer(field(server,'version')),ownershipVerified:requiredBoolean(field(server,'ownershipVerified'))},
  cleanup:{reason:field(retirement,'reason'),...Object.fromEntries(['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].map(key=>[key,requiredBoolean(field(retirement,key))]))},
  proof:{schema:'owner-restore-postgres-proof/v1',status,primary,cases,pendingAssertions:integer(field(proof,'pendingAssertions'),64),
   ...Object.fromEntries(['ownerData','syntheticOnly','archiveAuthenticated','receiptBound','completeInput','restoreVerified'].map(key=>[key,requiredBoolean(field(proof,key))])),
   cleanup:{status:cleanupStatus,used:integer(field(dbCleanup,'used'),2),finished:requiredBoolean(field(dbCleanup,'finished')),adminClosed:requiredBoolean(field(dbCleanup,'adminClosed')),
    failureCount:array(field(dbCleanup,'failures'),64).length,databases}}};
 requireThat(['verified-own-server-smart-stopped','verified-smart-stop-refused-or-timed-out-no-kill','unknown-work-client-or-ownership-no-stop','own-server-still-running','own-server-exited','not-started'].includes(projected.cleanup.reason),'RESTORE_PROJECTION');
 projected.accepted=field(lifecycle,'status')==='passed'&&field(lifecycle,'syntheticOnly')===false&&primary===null&&projected.server.port===55433&&projected.server.version===170011&&projected.server.ownershipVerified&&
  projected.cleanup.reason==='verified-own-server-smart-stopped'&&['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].every(key=>projected.cleanup[key])&&status==='passed'&&cases.length===25&&cases.every(row=>row.status==='passed')&&
  projected.proof.pendingAssertions===0&&projected.proof.ownerData&&!projected.proof.syntheticOnly&&['archiveAuthenticated','receiptBound','completeInput','restoreVerified'].every(key=>projected.proof[key])&&
  cleanupStatus==='passed'&&projected.proof.cleanup.used===2&&projected.proof.cleanup.finished&&projected.proof.cleanup.adminClosed&&projected.proof.cleanup.failureCount===0&&databases.length===2&&databases[0].oid!==databases[1].oid&&databases.every(row=>row.oid!==null&&row.created&&row.closed&&row.dropped&&row.pending===0&&row.cleanupFailures===0);
 requireThat(Buffer.byteLength(JSON.stringify(projected))<=32768,'RESTORE_RESULT_BOUND');return projected;
}

const DATA=new URL('../../data/',import.meta.url);
async function regularFile(url,max){const before=await lstat(url);requireThat(before.isFile()&&!before.isSymbolicLink()&&before.size<=max,'RESTORE_INPUT_FILE');const fd=await open(url,'r');
 const identity=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs];try{const stat=await fd.stat();requireThat(isDeepStrictEqual(identity(stat),identity(before)),'RESTORE_INPUT_CHANGED');
  return {fd,size:stat.size,verify:async()=>requireThat(isDeepStrictEqual(identity(await fd.stat()),identity(stat)),'RESTORE_INPUT_CHANGED')};}catch(e){await fd.close();throw e;}}
async function readFixedData(check){let receipt,archive;
 try{check();receipt=await regularFile(new URL('postgres-hierarchy-backup-receipt-20261027.json',DATA),65536);check();const receiptRaw=Buffer.alloc(receipt.size);
  const {bytesRead}=await receipt.fd.read(receiptRaw,0,receiptRaw.length,0);check();requireThat(bytesRead===receiptRaw.length,'RESTORE_RECEIPT_TRUNCATED');await receipt.verify();await receipt.fd.close();receipt=null;
  archive=await regularFile(new URL('canonical-migration-backups/'+INPUTS.filename,DATA),MAX_ARCHIVE);check();const digest=createHash('sha256');let position=0;
  while(position<archive.size){check();const b=Buffer.alloc(Math.min(65536,archive.size-position));try{const {bytesRead}=await archive.fd.read(b,0,b.length,position);check();requireThat(bytesRead===b.length,'RESTORE_INPUT_TRUNCATED');digest.update(b);position+=bytesRead;}finally{b.fill(0);}}
  await archive.verify();check();return {receiptRaw,archiveSha256:digest.digest('hex'),archiveBytes:archive.size,verify:archive.verify,close:()=>archive.fd.close()};
 }catch(e){try{await receipt?.fd.close();}catch{}try{await archive?.fd.close();}catch{}throw e;}}
async function openFixedPhases({epoch,checkDeadline}){
 checkDeadline();const binding=await readOwnedPrivateRunBinding();checkDeadline();
 return createPhaseWriter({fs:{open,link,lstat,realpath},output:path.win32.join(binding.runDirectory,'output'),now:()=>performance.now(),epoch,checkDeadline});
}
let used=false;
export async function runOwnerRestoreNativeCheck(){
 requireThat(arguments.length===0&&!used,'RESTORE_ONESHOT');used=true;
 const [{runWithPrivateOwnedScopedPostgres},{restorePostgresBackupToOwnedFixture}]=await Promise.all([import('./hierarchy-native-cluster.js'),import('../../src/ops/postgres-backup-operator.js')]);
 const run=buildCheck({lifecycle:runWithPrivateOwnedScopedPostgres,controller:createFixtureController,getOwnedIdentity,manifest:()=>readCanonicalV4MigrationManifest(),readData:readFixedData,
  openPhases:openFixedPhases,now:()=>performance.now(),restore:restorePostgresBackupToOwnedFixture},INPUTS);
 return projectOwnerRestoreResult(await run());
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length)return 2;
 try{const result=await runOwnerRestoreNativeCheck();process.stdout.write(JSON.stringify(result)+'\n');return result.accepted?0:1;}
 catch{process.stdout.write('{"schema":"owner-restore-postgres-result/v1","accepted":false,"failure":"private-restore-incomplete"}\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(result=>{process.exitCode=result;});
