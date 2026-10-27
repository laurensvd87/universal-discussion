// Invented metadata, encrypted-input pins and fake lifecycle/SQL/restore ports.
// No native child, database, DPAPI, owner archive or credential is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OWNER_RESTORE_CASES,OWNER_RESTORE_PHASES,OWNER_UPGRADE_CASES,OWNER_UPGRADE_PHASES,projectOwnerUpgradeResult,createOwnerUpgradePhaseWriterForTest,createOwnerRestoreCheckForTest,createOwnerHttpCheckForTest,createOwnerRestorePhaseWriterForTest,projectOwnerRestoreResult,main,runOwnerRestoreNativeCheck} from './owner-restore-native-check.js';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const names=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];
const tables=['schema_migrations','meta','id_registry','topics','discussions','sources','embeddings','source_links','topic_memberships','fixed_references',
 'contributions','revisions','operation_receipts','import_ledger','runtime_state','command_receipts','runtime_source_stamps','ingestion_jobs','catalog_ingest_lane'];
const sequences=['import_ledger_import_id_seq','contribution_ordinal_sequence','topic_ordinal_sequence','discussion_ordinal_sequence','source_ordinal_sequence','source_link_ordinal_sequence','ingestion_job_ordinal_sequence'];
const helpers=['reject_import_receipt_mutation','runtime_utf16_length','runtime_safe_text','ingest_guard_learned_url','ingest_valid_unit_vector','ingest_ridge_similarity',
 'ingest_json_number','ingest_validate_material','ingest_default_runtime_witness','ingest_default_source_catalog_revision','ingest_wipe_terminal_witness'];
const definers=['runtime_lock_row','runtime_prepare_command','runtime_complete_command','runtime_append_command','runtime_lifecycle_command','runtime_withdraw_account_contributions',
 'ingest_ridge_predicate','ingest_ridge_scan','ingest_enqueue_job','ingest_enqueue_interactive','ingest_enqueue_crawler','ingest_claim','ingest_renew_authority','ingest_renew_lease','ingest_revoke_authority',
 'ingest_source_response','ingest_receipt','ingest_apply','ingest_status','ingest_fail_claim','ingest_require_idle_lane','ingest_forget_sources_internal','ingest_correct_source','ingest_forget_source','ingest_delete_learned_topic','ingest_clear_learned_data'];
const privileges={app:['runtime_append_command','runtime_lifecycle_command','runtime_withdraw_account_contributions','ingest_enqueue_interactive',
 'ingest_renew_authority','ingest_revoke_authority','ingest_receipt','ingest_status','ingest_correct_source','ingest_forget_source','ingest_delete_learned_topic','ingest_clear_learned_data'],
 submitter:['ingest_enqueue_crawler','ingest_renew_authority','ingest_revoke_authority','ingest_receipt','ingest_status'],
 worker:['ingest_claim','ingest_renew_lease','ingest_ridge_predicate','ingest_ridge_scan','ingest_apply','ingest_fail_claim']};
function fixture({fault=null}={}){
 const events=[],queries=[],phases=[],identities=new WeakMap(),manifest=Array.from({length:9},(_,i)=>({version:i+1,hash:sha('migration-'+i)}));
 const plaintext=Buffer.from('PGDMPinvented-only'),fingerprints=tables.map(table=>({table,rows:table==='schema_migrations'?9:1,
  sha256:sha(Array.from({length:table==='schema_migrations'?9:1},(_,i)=>sha(table+'-'+i)+'\n').join(''))}));
 const version={generation:'invented-generation',revision:7},counts={topics:1,discussions:1,sources:1,sourceLinks:1,contributions:1};
 const header={schema:'murmingle-postgresql-encrypted-backup/v1',algorithm:'AES-256-GCM',keyWrap:{provider:'dpapi-current-user',data:'invented'},iv:'invented',createdAt:'invented',expiresAt:'invented',
  database:'murmingle_canonical',version,baselineLogicalDigest:sha('baseline'),counts,migrations:manifest.map(m=>m.hash),dumpSha256:sha(plaintext),dumpBytes:plaintext.length};
 const fingerprint={algorithm:'sha256-pkordered-jsonb-and-binary64-array-send/v1',tables:fingerprints,sha256:sha(JSON.stringify(fingerprints))};
 const receipt={verified:true,cleanupVerified:true,filename:'invented-fixed-leaf',dumpBytes:plaintext.length,dumpSha256:sha(plaintext),headerSha256:sha(JSON.stringify(header)),version,counts,
  migrations:header.migrations,currentRowsFingerprint:fingerprint,fingerprintBinding:{dumpSha256:sha(plaintext),headerSha256:sha(JSON.stringify(header)),currentRowsFingerprintSha256:fingerprint.sha256,version,migrations:header.migrations}};
 const receiptRaw=Buffer.from(JSON.stringify(receipt)),inputs={receiptSha256:sha(receiptRaw),archiveSha256:sha('invented encrypted bytes'),headerSha256:receipt.headerSha256,
  dumpSha256:receipt.dumpSha256,dumpBytes:plaintext.length,filename:receipt.filename};
 let expired=false,controller,activeTable=null,restored=false,invocations=0,activeManifest=manifest;
 async function query(index,sql,args=[]){queries.push(sql);events.push('query');
  if(fault?.query){const outcome=fault.query(sql,args);if(outcome?.throw)throw outcome.value;}
  let rows;
  if(sql.includes('AS database,session_user'))rows=[{database:names[index],role:'postgres',address:'127.0.0.1',port:55433,version:'170011',started:'123.5',oid:String(17001+index)}];
  else if(sql.includes('pg_depend'))rows=[{owner:'postgres',objects:'0'}];
  else if(sql==='DROP SCHEMA canonical_v4'){assert.equal(index,0);assert.equal(restored,false);events.push('drop-empty');rows=[];}
  else if(sql.includes('SELECT version,hash'))rows=activeManifest;
  else if(sql.includes('SELECT generation,revision::text'))rows=[activeManifest.length===17&&fault?.runtimeVersion?fault.runtimeVersion:{generation:version.generation,revision:String(version.revision)}];
  else if(sql.includes('SELECT extversion'))rows=[{extversion:'0.8.2'}];
  else if(sql.includes('SELECT datcollate'))rows=[{datcollate:'German_Germany.1252',datctype:'German_Germany.1252'}];
  else if(sql.includes("c.relkind='r' ORDER BY"))rows=[...tables].sort().map(name=>({name,owner:'murmingle_owner'}));
  else if(sql.includes('i.indisprimary'))rows=['id_registry.id','topics.id','discussions.id','sources.id','embeddings.source_id','source_links.source_id','topic_memberships.source_id','topic_memberships.topic_id',
   'fixed_references.topic_id','contributions.id','revisions.contribution_id','operation_receipts.source_id','command_receipts.actor_id','command_receipts.request_id','runtime_source_stamps.source_id','ingestion_jobs.operation_id'].map(key=>{
    const [table_name,attname]=key.split('.');return {table_name,attname,collname:fault?.collation?'default':'C'};});
  else if(sql.includes('SELECT pg_get_userbyid(nspowner)'))rows=[{owner:'murmingle_owner'}];
  else if(sql.includes('SELECT rolname,rolsuper'))rows=['murmingle_owner','murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'].map(rolname=>({rolname,
   rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,rolcanlogin:rolname!=='murmingle_owner'}));
  else if(sql.includes('acldefault(CASE'))rows=[{n:'0'}];
  else if(sql.includes('p.prosecdef'))rows=[...helpers,...definers].map(name=>({name,owner:'murmingle_owner',definer:definers.includes(name),
   config:name==='reject_import_receipt_mutation'?null:name==='ingest_json_number'?
    fault&&Object.hasOwn(fault,'jsonNumberConfig')?fault.jsonNumberConfig:['search_path=pg_catalog','extra_float_digits=3']:['search_path=pg_catalog'],public_execute:!!fault?.publicFunction,
   ...Object.fromEntries(Object.entries(privileges).map(([role,allowed])=>[role,allowed.includes(name)]))}));
  else if(sql.includes('has_table_privilege'))rows=['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'].flatMap(role=>tables.map(name=>{
   const allowed=role==='murmingle_app'?!['command_receipts','runtime_source_stamps','ingestion_jobs','catalog_ingest_lane'].includes(name):name==='schema_migrations';
   return {role,name,readable:allowed,column_readable:allowed,writable:!!fault?.writable&&role==='murmingle_app'&&name==='sources'};}));
  else if(sql.includes('has_sequence_privilege'))rows=[{n:'0'}];
  else if(sql.startsWith('DECLARE')){activeTable=/FROM canonical_v4\.([a-z_]+) t/.exec(sql)[1];rows=[];}
  else if(sql.startsWith('FETCH'))rows=Array.from({length:activeTable==='schema_migrations'?9:1},(_,i)=>({row_sha:sha((fault?.fingerprint===activeTable?'changed-':'')+activeTable+'-'+i)}));
  else if(sql.includes('JOIN pg_sequence'))rows=sequences.map(name=>({name,owner:'murmingle_owner',increment:'1',cycle:false}));
  else if(sql.startsWith('SELECT last_value'))rows=[{last_value:fault?.unsafeSequence?'8':fault?.bigSequence?'9007199254740993':'10',is_called:!fault?.uncalledSequence}];
  else if(sql.startsWith('SELECT max('))rows=[{maximum:fault?.bigSequence?'9007199254740992':'9'}];
  else if(sql.startsWith('SET ')||sql==='RESET ROLE'||sql==='CLOSE backup_rows')rows=[];
  else assert.fail('Unexpected SQL in invented adapter: '+sql);
  return {rows};
 }
 const deps={manifest:async()=>manifest,getOwnedIdentity:client=>identities.get(client),now:()=>0,
  openPhases:async({epoch,checkDeadline},upgrade=false)=>{const stages=upgrade?OWNER_UPGRADE_PHASES:OWNER_RESTORE_PHASES;assert.equal(epoch,0);checkDeadline();return {
   write:async stage=>{checkDeadline();assert.equal(stage,stages[phases.length]);if(fault?.phase===stage)throw fault.phaseValue;phases.push(stage);},
   finish:()=>assert.deepEqual(phases,stages),
  };},
  readData:async check=>{check();events.push('read-pins');return {receiptRaw,archiveSha256:inputs.archiveSha256,archiveBytes:plaintext.length+100,
   verify:async()=>events.push('verify-held-data'),close:async()=>events.push('close-held-data')};},
  controller:ports=>{const records=[];controller={async acquire(){const index=records.length;assert.ok(index<2);assert.ok(index===0||records[0].closed);
   const client=await ports.connectFixedRole({database:names[index],role:'postgres'},ports.guard);const record={name:names[index],oid:String(17001+index),created:true,closed:false,dropped:false,pending:0,sessionCleanupFailures:[]};records.push(record);
   return {query:(...args)=>query(index,...args),exec:sql=>query(index,sql),transaction:async work=>{events.push('rr-begin');try{const result=await work({query:(...args)=>query(index,...args)});events.push('rr-commit');return result;}catch(e){events.push('rr-rollback');throw e;}},
    close:async()=>{record.closed=true;record.dropped=true;events.push('retire-'+index);}};},
   async finish(){events.push('finish-controller');for(const r of records){r.closed=true;r.dropped=true;}if(fault?.cleanup)throw fault.cleanup;return {status:records.length===2?'passed':'failed',used:records.length,finished:true,adminClosed:true,failures:[],databases:records};}};return controller;},
  lifecycle:async work=>{const checks=await work({deadline:195000,checkDeadline:()=>{if(expired)throw Object.assign(new Error('invented elapsed'),{code:'OWNED_DEADLINE'});},
   connectFixedRole:async request=>{const client={};identities.set(client,{database:request.database,role:'postgres',address:'127.0.0.1',port:55433,version:170011,started:123.5});return client;},
   restoreArchive:async({client,oid,dump,dumpBytes,dumpSha256})=>{events.push('restore-child');assert.equal(identities.get(client).database,names[0]);assert.equal(oid,'17001');assert.ok(events.includes('drop-empty'));
    const digest=createHash('sha256');let n=0;for await(const b of dump){assert.ok(b.length<=65536);n+=b.length;digest.update(b);}assert.equal(n,dumpBytes);assert.equal(digest.digest('hex'),dumpSha256);
    restored=true;return {closed:true,stdoutEof:true,stderrEof:true,exitCode:0};}});
   return {status:checks.status,syntheticOnly:false,checks,server:{port:55433,version:170011,ownershipVerified:true},
    cleanup:{reason:'verified-own-server-smart-stopped',stopped:true,childExited:true,clientsClosed:true,physicalSettled:true,directoryRetained:true}};},
  restore:async(filename,port)=>{invocations++;assert.equal(filename,inputs.filename);events.push('authenticate');const identity=await port.inspect();
   if(fault?.beforeRestore)fault.beforeRestore(()=>{expired=true;});
   await port.restore({identity,dump:(async function*(){yield plaintext;})(),dumpBytes:plaintext.length,dumpSha256:sha(plaintext)});
   await port.verifyRestored({identity,header});return {restored:true,targetDatabase:names[0],targetOid:identity.oid,dumpSha256:sha(plaintext)};},
 };
 return {deps,inputs,events,queries,phases,receiptRaw,header,manifest,setManifest:value=>{activeManifest=value;},get invocations(){return invocations;},run:()=>createOwnerRestoreCheckForTest(deps,inputs)()};
}
const applicationResult=()=>({status:'passed',proofSha256:sha('invented closed application proof'),proofBytes:123});
function httpPorts(f,{application=async()=>applicationResult(),installFailure=null}={}){
 const manifest=[...f.manifest,...Array.from({length:8},(_,i)=>({version:i+10,hash:sha('added-migration-'+i)}))];
 f.deps.http={manifest:async()=>manifest,directories:async()=>({clusterDirectory:'invented-private-cluster',outputDirectory:'invented-private-output'}),
  install:async value=>{f.events.push('install');assert.deepEqual(value.policy,{defaultMaxDepth:1,overrides:[]});assert.equal(value.expectedHeadRevision,0);assert.equal(value.expectedPolicyRevision,0);
   assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,0);if(installFailure)throw installFailure;f.setManifest(manifest);
   return {schemaVersion:17,matcherIdentityHash:'eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c',headRevision:1,policy:{revision:1,defaultMaxDepth:1,overrides:[]}};},
  application:async context=>{f.events.push('application-enter');assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,18);assert.equal(context.deadline,195000);
   assert.deepEqual(context.upgrade,{schemaVersion:17,preservedLegacyTables:18,legacyRowsUnchanged:true});assert.ok(Object.isFrozen(context.upgrade));
   const result=await application(context);f.events.push('application-retired');return result;},
 };
 return ()=>createOwnerHttpCheckForTest(f.deps,f.inputs)();
}

test('private entry imports inert, exposes distinct fixed25 ledger and rejects all CLI selectors',async()=>{
 assert.equal(OWNER_RESTORE_CASES.length,25);assert.equal(OWNER_RESTORE_CASES.filter(row=>row.depth===0).length,3);
 assert.equal(new Set(OWNER_RESTORE_CASES.map(row=>row.name)).size,25);assert.ok(Object.isFrozen(OWNER_RESTORE_CASES[0]));
 assert.equal(await main(['restore']),2);await assert.rejects(runOwnerRestoreNativeCheck('selector'),{code:'RESTORE_ONESHOT'});
});
test('all19 fingerprints, schema/grants/sequences and AthenB retirement compose through actual entry logic',async()=>{
 const f=fixture(),lifecycle=await f.run(),result=projectOwnerRestoreResult(lifecycle);assert.equal(result.accepted,true);
 assert.equal(result.proof.ownerData,true);assert.equal(result.proof.syntheticOnly,false);assert.equal(result.proof.cases.length,25);
 assert.ok(f.events.indexOf('authenticate')<f.events.indexOf('drop-empty'));assert.ok(f.events.indexOf('restore-child')<f.events.indexOf('rr-begin'));
 assert.ok(f.events.indexOf('retire-0')<f.events.indexOf('retire-1'));assert.ok(f.events.indexOf('finish-controller')<f.events.indexOf('close-held-data'));
 assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,19);assert.equal(f.queries.filter(sql=>sql.startsWith('SELECT last_value')).length,7);
 assert.ok(f.queries.filter(sql=>sql.startsWith('DECLARE')&&sql.includes('array_send')).length===2);
 assert.ok(!f.queries.some(sql=>/nextval\(|setval\(/u.test(sql)));assert.ok(f.events.includes('rr-commit'));
 assert.deepEqual(f.phases,OWNER_RESTORE_PHASES);assert.equal(f.phases.length,33);
});
test('HTTP upgrade verifies original boundaries then hashes each of18 tables once with its distinct25/35 contract',async()=>{
 const f=fixture(),run=httpPorts(f),result=projectOwnerUpgradeResult(await run());assert.equal(result.accepted,true);
 assert.equal(result.proof.cases.length,25);assert.deepEqual(result.proof.cases.map(({name,depth})=>({name,depth})),OWNER_UPGRADE_CASES);
 assert.equal(result.schema,'owner-upgrade-postgres-result/v1');assert.equal(result.proof.schema9RecoveryRepeated,false);assert.equal(result.proof.migratedLegacyDataVerified,true);assert.equal(result.proof.schemaVersion,17);assert.equal(result.proof.preservedLegacyTables,18);assert.equal(Object.hasOwn(result.proof,'restoreVerified'),false);assert.deepEqual(f.phases,OWNER_UPGRADE_PHASES);assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,18);
 assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')&&sql.includes('FROM canonical_v4.schema_migrations ')).length,0);
 assert.ok(f.queries.includes('SET ROLE murmingle_owner'));assert.ok(f.queries.includes('RESET ROLE'));
 assert.ok(f.events.indexOf('application-retired')<f.events.indexOf('retire-0'));assert.ok(f.events.indexOf('retire-0')<f.events.indexOf('retire-1'));
});
test('HTTP install failure or changed post-upgrade canonical row cannot reach the application or pass restoration',async()=>{
 const a=fixture(),installFailure=Object.assign(new Error('invented install refusal'),{code:'INSTALL_REFUSED'}),installRun=httpPorts(a,{installFailure});
 const refused=projectOwnerUpgradeResult(await installRun());assert.equal(refused.accepted,false);assert.equal(refused.primary,'INSTALL_REFUSED');assert.ok(!a.events.includes('application-enter'));assert.ok(a.queries.includes('RESET ROLE'));
 const fault={},b=fixture({fault}),run=httpPorts(b),originalInstall=b.deps.http.install;b.deps.http.install=async value=>{const result=await originalInstall(value);fault.fingerprint='sources';return result;};
 const changed=projectOwnerUpgradeResult(await run());assert.equal(changed.accepted,false);assert.equal(changed.primary,'RESTORE_TABLE_FINGERPRINT');
 assert.ok(changed.proof.cases.length<25);assert.equal(changed.proof.migratedLegacyDataVerified,false);assert.ok(!b.events.includes('application-enter'));assert.ok(b.queries.includes('RESET ROLE'));
 assert.ok(b.events.includes('finish-controller'));assert.equal(b.events.at(-1),'close-held-data');
});
test('pending original HTTP hook delays A/B and input closure; falsy failure survives RESET ROLE cleanup failure',async()=>{
 const f=fixture();let release,entered=false;const run=httpPorts(f,{application:async()=>{entered=true;return new Promise(resolve=>{release=resolve;});}}),pending=run();
 while(!entered)await new Promise(resolve=>setImmediate(resolve));assert.ok(!f.events.includes('retire-0'));assert.ok(!f.events.includes('finish-controller'));assert.ok(!f.events.includes('close-held-data'));
 release(applicationResult());assert.equal(projectOwnerUpgradeResult(await pending).accepted,true);
 let resets=0;const g=fixture({fault:{query:sql=>sql==='RESET ROLE'&&++resets===2?{throw:true,value:Object.assign(new Error('secondary'),{code:'RESET_SECONDARY'})}:null}}),fail=httpPorts(g,{application:async()=>{throw false;}});
 const failed=projectOwnerUpgradeResult(await fail());assert.equal(failed.accepted,false);assert.equal(failed.primary,'PRIVATE_RESTORE_FAILURE');assert.ok(g.events.includes('finish-controller'));assert.equal(g.events.at(-1),'close-held-data');
});
test('failed or missing application proof envelope cannot pass the HTTP-mode restore proof',async()=>{
 for(const envelope of [{status:'failed',proofSha256:sha('failed'),proofBytes:123},{status:'passed'},{status:'passed',proofSha256:'unsafe',proofBytes:123}]){
  const f=fixture(),run=httpPorts(f,{application:async()=>envelope}),result=projectOwnerUpgradeResult(await run());assert.equal(result.accepted,false);
  assert.equal(result.primary,'RESTORE_APPLICATION_CHECKS');
  assert.ok(f.queries.includes('RESET ROLE'));assert.ok(f.events.includes('close-held-data'));
 }
});
test('receipt and archive bindings refuse before any restore or fixture acquisition',async()=>{
 const f=fixture();f.inputs.receiptSha256='0'.repeat(64);const result=projectOwnerRestoreResult(await f.run());assert.equal(result.accepted,false);
 assert.equal(result.primary,'RESTORE_RECEIPT_PIN');assert.equal(f.invocations,0);assert.ok(!f.events.includes('drop-empty'));assert.ok(f.events.includes('close-held-data'));
 const g=fixture();g.deps.readData=async()=>({receiptRaw:g.receiptRaw,archiveSha256:'0'.repeat(64),archiveBytes:100,verify:async()=>{},close:async()=>{}});
 assert.equal(projectOwnerRestoreResult(await g.run()).primary,'RESTORE_ARCHIVE_PIN');assert.equal(g.invocations,0);
});
test('a changed table fingerprint fails its genuine named point and still closes original data and fixture',async()=>{
 const f=fixture({fault:{fingerprint:'sources'}}),result=projectOwnerRestoreResult(await f.run());assert.equal(result.accepted,false);assert.equal(result.primary,'RESTORE_TABLE_FINGERPRINT');
 assert.equal(result.proof.cases.at(-1).name,'Restored snapshot table: sources');assert.equal(result.proof.cases.at(-1).status,'failed');
 assert.ok(f.events.includes('rr-rollback'));assert.ok(f.events.includes('finish-controller'));assert.equal(f.events.at(-1),'close-held-data');
 assert.equal(f.phases.at(-1),'table-discussions-verified');assert.ok(!f.phases.includes('table-sources-verified'));
});
for(const [name,fault,expected]of [['PK collation',{collation:true},'RESTORE_PK_COLLATION'],['PUBLIC function execute',{publicFunction:true},'RESTORE_FN_REJECT_IMPORT_RECEIPT_MUTATION_PUBLIC'],['restored DML grant',{writable:true},'RESTORE_TABLE_GRANTS'],['unsafe ordinal sequence',{unsafeSequence:true},'RESTORE_SEQUENCE_REUSE']])
 test(name+' cannot pass full-data verification',async()=>{const result=projectOwnerRestoreResult(await fixture({fault}).run());assert.equal(result.accepted,false);assert.equal(result.primary,expected);});
test('schema9 ingest_json_number accepts exactly migration004 search path and extra_float_digits settings',async()=>{
 const f=fixture({fault:{jsonNumberConfig:['search_path=pg_catalog','extra_float_digits=3']}});assert.equal(projectOwnerRestoreResult(await f.run()).accepted,true);
});
for(const [name,jsonNumberConfig]of [['missing',['search_path=pg_catalog']],['wrong',['search_path=pg_catalog','extra_float_digits=2']]])
 test('ingest_json_number '+name+' extra_float_digits setting fails with finite function/config diagnostic',async()=>{
  const result=projectOwnerRestoreResult(await fixture({fault:{jsonNumberConfig}}).run());assert.equal(result.accepted,false);
  assert.equal(result.primary,'RESTORE_FN_INGEST_JSON_NUMBER_CONFIG');assert.equal(result.proof.cases.at(-1).name,'Restored owner and execute-only role boundaries');
 });
test('the original callback deadline blocks restore dispatch and still settles cleanup',async()=>{
 const f=fixture({fault:{beforeRestore:expire=>expire()}}),result=projectOwnerRestoreResult(await f.run());assert.equal(result.primary,'OWNED_DEADLINE');assert.equal(result.accepted,false);
 assert.ok(!f.events.includes('restore-child'));assert.ok(f.events.includes('finish-controller'));assert.ok(f.events.includes('close-held-data'));
});
test('sequence safety uses lossless bigint and the actual is_called next-value rule',async()=>{
 for(const fault of [{bigSequence:true},{uncalledSequence:true}])assert.equal(projectOwnerRestoreResult(await fixture({fault}).run()).accepted,true);
});
test('falsy primary SQL failure is not replaced by a secondary fixture cleanup error',async()=>{
 const f=fixture({fault:{query:sql=>sql.startsWith('FETCH')?{throw:true,value:false}:null,cleanup:Object.assign(new Error('secondary'),{code:'CLEANUP_SECONDARY'})}});
 const result=await f.run();assert.equal(result.checks.primary,'PRIVATE_RESTORE_FAILURE');assert.equal(result.checks.status,'failed');assert.ok(f.events.includes('close-held-data'));
 assert.ok(f.queries.includes('CLOSE backup_rows'));
});
test('a failed phase publication fails the rehearsal and preserves its first falsy failure during cleanup',async()=>{
 const f=fixture({fault:{phase:'archive-hash-complete',phaseValue:false,cleanup:Object.assign(new Error('secondary'),{code:'CLEANUP_SECONDARY'})}});
 const lifecycle=await f.run();assert.equal(lifecycle.checks.status,'failed');assert.equal(lifecycle.checks.primary,'PRIVATE_RESTORE_FAILURE');
 assert.deepEqual(f.phases,['callback-enter','archive-hash-start']);assert.equal(f.invocations,0);assert.ok(f.events.includes('finish-controller'));assert.ok(f.events.includes('close-held-data'));
});

function phaseFixture({writeFailure=false,closeFailure=false,linkFailure=false,upgrade=false}={}){
 const output=PRIVATE_RUN_ROOT+'\\run-'+'a'.repeat(48)+'\\output',files=new Map(),events=[];let serial=1,time=100,expired=false;
 const stat=node=>({dev:1,ino:node?.ino??0,size:node?.bytes?.length??0,isDirectory:()=>!node,isFile:()=>!!node,isSymbolicLink:()=>false});
 const fs={lstat:async filename=>{if(filename===output)return stat(null);assert.ok(files.has(filename));return stat(files.get(filename));},realpath:async filename=>filename,
  open:async(filename,flags)=>{assert.equal(flags,'wx');assert.ok(filename.startsWith(output+'\\phase-'));if(files.has(filename))throw Object.assign(new Error('exists'),{code:'EEXIST'});
   const node={ino:serial++,bytes:null,closed:false,synced:false};files.set(filename,node);events.push('open');return {
    writeFile:async bytes=>{events.push('write');if(writeFailure)throw false;node.bytes=Buffer.from(bytes);},sync:async()=>{node.synced=true;events.push('sync');},
    close:async()=>{node.closed=true;events.push('close');if(closeFailure)throw Object.assign(new Error('close'),{code:'SECONDARY_CLOSE'});},
   };},
  link:async(from,to)=>{events.push('link');assert.equal(files.get(from).closed,true);assert.equal(files.get(from).synced,true);if(linkFailure)throw Object.assign(new Error('link'),{code:'PHASE_LINK'});
   if(files.has(to))throw Object.assign(new Error('exists'),{code:'EEXIST'});files.set(to,files.get(from));},
 };
 const dependencies={fs,output,epoch:100,now:()=>time,checkDeadline:()=>{if(expired)throw Object.assign(new Error('elapsed'),{code:'OWNED_DEADLINE'});}};
 return {writer:(upgrade?createOwnerUpgradePhaseWriterForTest:createOwnerRestorePhaseWriterForTest)(dependencies),dependencies,files,events,output,advance:()=>time++,expire:()=>{expired=true;}};
}
test('bounded phase writer publishes all33 canonical records only after original write/sync/close, using exclusive hardlinks',async()=>{
 const f=phaseFixture();for(const stage of OWNER_RESTORE_PHASES){await f.writer.write(stage);f.advance();}f.writer.finish();assert.equal(f.files.size,66);
 for(let i=0;i<33;i++){const base=f.output+'\\phase-'+String(i).padStart(2,'0'),pending=f.files.get(base+'.pending'),closed=f.files.get(base+'.json');
  assert.equal(pending,closed);assert.ok(closed.bytes.length<=1024);assert.deepEqual(Object.keys(JSON.parse(closed.bytes)).sort(),['elapsedMs','ordinal','schema','stage']);
  assert.equal(closed.bytes.toString(),JSON.stringify({elapsedMs:i,ordinal:i,schema:'private-owner-restore-phase/v1',stage:OWNER_RESTORE_PHASES[i]})+'\n');}
 await assert.rejects(f.writer.write('inputs-closed'),{code:'RESTORE_PHASE_ORDER'});assert.equal(f.files.size,66);
});
test('phase writer does not refund failed pending writes and preserves falsy write over secondary close failure',async()=>{
 const f=phaseFixture({writeFailure:true,closeFailure:true});let caught='missing';try{await f.writer.write('callback-enter');}catch(e){caught=e;}assert.equal(caught,false);
 assert.equal(f.files.size,1);assert.deepEqual(f.events,['open','write','close']);await assert.rejects(f.writer.write('callback-enter'),{code:'RESTORE_PHASE_ORDER'});
 const g=phaseFixture({linkFailure:true});await assert.rejects(g.writer.write('callback-enter'),{code:'PHASE_LINK'});assert.equal(g.files.size,1);assert.throws(()=>g.writer.finish());
});
test('late original checkpoint write remains awaited and cannot publish after the callback cutoff',async()=>{
 const f=phaseFixture(),originalOpen=f.dependencies.fs.open;let release,entered=false,settled=false;
 f.dependencies.fs.open=async(...args)=>{const fd=await originalOpen(...args);return {...fd,writeFile:async bytes=>{entered=true;await new Promise(resolve=>{release=resolve;});await fd.writeFile(bytes);}};};
 const writer=createOwnerRestorePhaseWriterForTest(f.dependencies),pending=writer.write('callback-enter').finally(()=>{settled=true;}),observed=pending.catch(e=>e);
 while(!entered)await new Promise(resolve=>setImmediate(resolve));f.expire();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
 assert.equal(f.events.includes('link'),false);release();assert.equal((await observed).code,'OWNED_DEADLINE');assert.equal(f.files.size,1);
 assert.ok(f.events.includes('close'));assert.ok(!f.events.includes('link'));
});
test('phase writer refuses stage selectors, foreign directories, expired or regressing clocks without closed publication',async()=>{
 const f=phaseFixture();await assert.rejects(f.writer.write('arbitrary-sql-stage'),{code:'RESTORE_PHASE_ORDER'});assert.equal(f.files.size,0);
 assert.throws(()=>createOwnerRestorePhaseWriterForTest({...f.dependencies,output:'D:\\foreign\\output'}),{code:'RESTORE_PHASE_SCOPE'});
 const g=phaseFixture();g.expire();await assert.rejects(g.writer.write('callback-enter'),{code:'OWNED_DEADLINE'});assert.equal(g.files.size,0);
 const h=phaseFixture(),writer=createOwnerRestorePhaseWriterForTest({...h.dependencies,now:()=>99});await assert.rejects(writer.write('callback-enter'),{code:'RESTORE_PHASE_CLOCK'});assert.equal(h.files.size,0);
});
test('finite projection rejects unsafe descriptors and cannot accept missing auth/input/retirement gates',async()=>{
 const lifecycle=await fixture().run();for(const key of ['archiveAuthenticated','receiptBound','completeInput','restoreVerified']){const changed=structuredClone(lifecycle);changed.checks[key]=false;assert.equal(projectOwnerRestoreResult(changed).accepted,false);}
 const synthetic=structuredClone(lifecycle);synthetic.syntheticOnly=true;assert.equal(projectOwnerRestoreResult(synthetic).accepted,false);
 const pending=structuredClone(lifecycle);pending.checks.cleanup.databases[0].pending=1;assert.equal(projectOwnerRestoreResult(pending).accepted,false);
 const order=structuredClone(lifecycle);order.checks.cases.reverse();assert.throws(()=>projectOwnerRestoreResult(order));
 let hooks=0;const accessor=structuredClone(lifecycle);Object.defineProperty(accessor.checks,'receiptBound',{get(){hooks++;return true;}});assert.throws(()=>projectOwnerRestoreResult(accessor));assert.equal(hooks,0);
 assert.throws(()=>projectOwnerRestoreResult(new Proxy(lifecycle,{get(){hooks++;return null;}})));assert.equal(hooks,0);
});


test('upgrade hashes every unchanged table exactly once after install and retains binary64 hashing',async()=>{
 const f=fixture();await httpPorts(f)();
 const scans=f.queries.filter(sql=>sql.startsWith('DECLARE'));
 assert.deepEqual(scans.map(sql=>/FROM canonical_v4\.([a-z_]+) t/.exec(sql)[1]),tables.filter(name=>name!=='schema_migrations'));
 assert.equal(scans.filter(sql=>sql.includes('array_send(t.values_double)')).length,2);
 assert.equal(f.queries.filter(sql=>sql.startsWith('SELECT last_value')).length,7);
 assert.equal(OWNER_UPGRADE_PHASES.length,35);assert.equal(OWNER_UPGRADE_CASES.length,25);
 assert.equal(OWNER_UPGRADE_CASES.filter(row=>row.depth===0).length,3);
 assert.ok(Object.isFrozen(OWNER_UPGRADE_PHASES)&&Object.isFrozen(OWNER_UPGRADE_CASES)&&OWNER_UPGRADE_CASES.every(Object.isFrozen));
});
test('post-upgrade manifest and original runtime version are verified before data or application work',async()=>{
 for(const runtimeVersion of [{generation:'other',revision:'7'},{generation:'invented-generation',revision:'8'}]){
  const f=fixture({fault:{runtimeVersion}}),result=projectOwnerUpgradeResult(await httpPorts(f)());
  assert.equal(result.accepted,false);assert.equal(result.primary,'RESTORE_VERSION');assert.equal(result.proof.migratedLegacyDataVerified,false);
  assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,0);assert.ok(!f.events.includes('application-enter'));
  assert.equal(f.phases.at(-1),'hierarchy17-installed');
 }
 const f=fixture(),run=httpPorts(f),install=f.deps.http.install;
 f.deps.http.install=async value=>{const result=await install(value);f.setManifest([...f.manifest,...Array.from({length:8},(_,i)=>({version:i+10,hash:sha('wrong-'+i)}))]);return result;};
 const result=projectOwnerUpgradeResult(await run());assert.equal(result.primary,'RESTORE_APPLICATION_MIGRATIONS');assert.equal(result.accepted,false);
 assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,0);assert.ok(!f.events.includes('application-enter'));
});
test('upgrade writer publishes35 distinct canonical phases with the same exclusive closed-file discipline',async()=>{
 const f=phaseFixture({upgrade:true});
 for(const stage of OWNER_UPGRADE_PHASES){await f.writer.write(stage);f.advance();}f.writer.finish();assert.equal(f.files.size,70);
 for(let i=0;i<35;i++){
  const base=f.output+'\\phase-'+String(i).padStart(2,'0'),pending=f.files.get(base+'.pending'),closed=f.files.get(base+'.json');
  assert.equal(pending,closed);assert.ok(closed.bytes.length<=1024);
  assert.equal(closed.bytes.toString(),JSON.stringify({elapsedMs:i,ordinal:i,schema:'private-owner-upgrade-phase/v1',stage:OWNER_UPGRADE_PHASES[i]})+'\n');
 }
 await assert.rejects(f.writer.write('inputs-closed'),{code:'RESTORE_PHASE_ORDER'});
 const failed=phaseFixture({upgrade:true,writeFailure:true,closeFailure:true});
 await assert.rejects(failed.writer.write('callback-enter'),value=>value===false);
 await assert.rejects(failed.writer.write('callback-enter'),{code:'RESTORE_PHASE_ORDER'});assert.equal(failed.files.size,1);
});
test('upgrade projection cannot borrow normal recovery ledger or claim repeated schema9 recovery',async()=>{
 const f=fixture(),lifecycle=await httpPorts(f)();assert.equal(projectOwnerUpgradeResult(lifecycle).accepted,true);
 assert.throws(()=>projectOwnerRestoreResult(lifecycle));assert.throws(()=>projectOwnerUpgradeResult({...lifecycle,checks:{...lifecycle.checks,cases:OWNER_RESTORE_CASES.map(row=>({...row,status:'passed'}))}}));
 for(const [key,value]of [['schema9RecoveryRepeated',true],['migratedLegacyDataVerified',false],['schemaVersion',16],['preservedLegacyTables',17],['archiveAuthenticated',false],['receiptBound',false],['completeInput',false]]){
  const changed=structuredClone(lifecycle);changed.checks[key]=value;assert.equal(projectOwnerUpgradeResult(changed).accepted,false);
 }
 let hooks=0;const changed=structuredClone(lifecycle);Object.defineProperty(changed.checks,'migratedLegacyDataVerified',{get(){hooks++;return true;}});
 assert.throws(()=>projectOwnerUpgradeResult(changed));assert.equal(hooks,0);
 assert.throws(()=>projectOwnerUpgradeResult(new Proxy(lifecycle,{get(){hooks++;}})));assert.equal(hooks,0);
});
