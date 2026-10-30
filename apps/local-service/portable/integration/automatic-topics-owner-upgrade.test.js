// Invented fixed-table rows and owner ports only; no archive, DB or child.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {AUTOMATIC17_RESTORED_TABLES,verifyAndUpgradeRestoredAutomaticTopicsForTest} from './automatic-topics-owner-upgrade.js';
import {describeAutomaticTopicBackupTables} from '../../src/ops/automatic-topics-backup-operator.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const sequences=['import_ledger_import_id_seq','contribution_ordinal_sequence','topic_ordinal_sequence','discussion_ordinal_sequence','source_ordinal_sequence','source_link_ordinal_sequence','ingestion_job_ordinal_sequence'];
const added=['named_retrieval_inputs_index_ordinal_seq','named_index_requests_ordinal_seq','named_discovery_requests_ordinal_seq','named_feed_events_event_id_seq','named_public_events_event_id_seq','unified_search_events_event_id_seq'];
function fixture(fault={}){
 const events=[],queries=[],names=Object.keys(AUTOMATIC17_RESTORED_TABLES),manifest=Array.from({length:18},(_,i)=>({version:i+1,hash:hash('manifest'+i)}));
 let upgraded=false,activeTable=null,fetches=0,upgrades=0;
 const rowHashes=table=>Array.from({length:table==='sources'?129:1},(_,i)=>hash(table+i));
 const fingerprints=names.map(table=>({table,rows:rowHashes(table).length,sha256:hash(rowHashes(table).map(s=>s+'\n').join(''))}));
 const version={generation:'restored-generation',revision:33},fp={algorithm:'sha256-pkordered-jsonb-and-binary64-array-send/v1',tables:fingerprints,sha256:hash(JSON.stringify(fingerprints))};
 const receipt={verified:true,cleanupVerified:true,version,migrations:manifest.slice(0,17).map(r=>r.hash),dumpSha256:hash('dump'),headerSha256:hash('header'),currentRowsFingerprint:fp};
 receipt.fingerprintBinding={dumpSha256:receipt.dumpSha256,headerSha256:receipt.headerSha256,currentRowsFingerprintSha256:fp.sha256,version,migrations:receipt.migrations};
 const state={generation:version.generation,revision:String(version.revision),matcher_hash:hash('installed'),head_revision:'7',policy_revision:'5',default_max_depth:2,overrides:[{nodeId:'nature',maxDepth:3}]};
 const db={dialect:'pg',async exec(sql){queries.push(sql);events.push(sql);if(fault.reset&&sql==='RESET ROLE')throw 'secondary';},async query(sql){queries.push(sql);
  if(fault.sql){const result=fault.sql(sql,upgraded);if(result!==undefined)return result;}
  if(sql.startsWith('SET '))return {rows:[]};
  if(sql.includes('SELECT version,hash'))return {rows:manifest.slice(0,upgraded?18:17).map(r=>({...r,version:String(r.version)}))};
  if(sql.includes('p.default_max_depth'))return {rows:[{...state,...(upgraded&&fault.state?fault.state:{})}]};
  if(sql.includes("c.relkind='r' ORDER BY"))return {rows:[...names,...(upgraded?Object.keys(describeAutomaticTopicBackupTables()):[])].sort().map(name=>({name,owner:'murmingle_owner'}))};
  if(sql.includes('a.grantee=0'))return {rows:[{n:fault.publicAcl?1:0}]};
  if(sql.startsWith('DECLARE ')){activeTable=/FROM canonical_v4\.([a-z_]+) t/u.exec(sql)[1];fetches=0;return {rows:[]};}
  if(sql.startsWith('FETCH ')){const values=rowHashes(activeTable);if(fault.row===activeTable&&upgraded===!!fault.after)values[0]=hash('changed');const rows=values.slice(fetches*128,++fetches*128).map(row_sha=>({row_sha}));return {rows};}
  if(sql==='CLOSE backup_rows'){events.push('cursor-close');return {rows:[]};}
  if(sql.includes('JOIN pg_sequence'))return {rows:[...sequences,...(upgraded?added:[])].map(name=>({name,owner:'murmingle_owner',increment:'1',cycle:false}))};
  if(sql.startsWith('SELECT last_value'))return {rows:[{last_value:fault.sequence&&upgraded?'8':'9007199254740993',is_called:true}]};
  if(sql.startsWith('SELECT max('))return {rows:[{maximum:'9007199254740992'}]};
  throw Error('unexpected invented SQL: '+sql);
 },async transaction(work){events.push('BEGIN');try{const result=await work(db);events.push('COMMIT');return result;}catch(error){events.push('ROLLBACK');throw error;}}};
 const ports={async manifest(profile){assert.ok(['hierarchy17','hierarchy18'].includes(profile));return manifest.slice(0,profile==='hierarchy17'?17:18);},async upgrade(a){events.push('UPGRADE');upgrades++;assert.equal(a.database,db);assert.equal(a.expectedHeadRevision,7);assert.equal(a.expectedPolicyRevision,5);if(fault.upgrade)throw false;upgraded=true;return {schemaVersion:18,matcherIdentityHash:state.matcher_hash,headRevision:7,policyRevision:5};}};
 return {value:{database:db,receipt,checkDeadline:()=>{}},ports,events,queries,get upgrades(){return upgrades;}};
}
test('restored17 full28-table comparison precedes owner CAS; all27 original tables and13 sequences remain safe',async()=>{
 const f=fixture(),r=await verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports);
 assert.deepEqual(r,{schema:'private-restored-automatic18-upgrade/v1',status:'passed',schemaVersion:18,restoredTables:28,preservedLegacyTables:27,legacyRowsUnchanged:true,matcherUnchanged:true,policyUnchanged:true,runtimeVersionUnchanged:true,generatedSequencesSafe:true,testComposition:true});
 assert.equal(f.upgrades,1);assert.equal(f.events.filter(x=>x==='cursor-close').length,55);assert.equal(f.events.filter(x=>x==='COMMIT').length,2);
 assert.ok(f.events.indexOf('COMMIT')<f.events.indexOf('SET ROLE murmingle_owner'));assert.ok(f.events.indexOf('RESET ROLE')>f.events.indexOf('UPGRADE'));
 assert.equal(f.queries.filter(x=>x.startsWith('DECLARE')).length,55);assert.ok(f.queries.some(x=>x.includes('array_send(t.body_values) || array_send(t.title_values)')));
 assert.equal(f.queries.filter(x=>x==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY').length,2);
});
test('missing or changed receipt rows block migration before any owner switch',async()=>{
 for(const fault of [{row:'semantic_inputs'},{row:'contributions'},{publicAcl:true}]){
  const f=fixture(fault);await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports));assert.equal(f.upgrades,0);assert.equal(f.events.includes('SET ROLE murmingle_owner'),false);assert.ok(f.events.includes('ROLLBACK'));
 }
 const f=fixture();f.value.receipt.currentRowsFingerprint.tables.pop();await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports));assert.equal(f.events.length,0);
});
test('changed original discussion/semantic rows after18 cannot be accepted as preserved',async()=>{
 for(const table of ['contributions','semantic_root_snapshots','semantic_owner_policy','runtime_state']){
  const f=fixture({row:table,after:true});await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:'AUTOMATIC_RESTORE_PRESERVED_ROWS'});assert.equal(f.upgrades,1);assert.equal(f.events.filter(x=>x==='RESET ROLE').length,1);assert.equal(f.events.at(-1),'ROLLBACK');
 }
});
test('head, owner policy and runtime drift after migration fail independently of table hashes',async()=>{
 for(const state of [{head_revision:'8'},{policy_revision:'6'},{overrides:[]},{generation:'other-generation'},{revision:'34'}]){
  const f=fixture({state});await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports));assert.equal(f.upgrades,1);
 }
});
test('unsafe generated ordinal blocks acceptance without rounding bigint values',async()=>{
 const f=fixture({sequence:true});await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:'AUTOMATIC_RESTORE_SEQUENCE_REUSE'});assert.equal(f.events.at(-1),'ROLLBACK');
});
test('falsy owner failure survives reset failure; no post-migration equality is claimed',async()=>{
 const f=fixture({upgrade:true,reset:true});let caught='missing';try{await verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports);}catch(error){caught=error;}
 assert.equal(caught,false);assert.equal(f.events.filter(x=>x==='BEGIN').length,1);assert.equal(f.events.at(-1),'RESET ROLE');
});
test('expiry after acquired role still resets it and never dispatches a migration',async()=>{
 const f=fixture(),exec=f.value.database.exec;let expired=false;f.value.database.exec=async sql=>{await exec(sql);if(sql==='SET ROLE murmingle_owner')expired=true;};
 f.value.checkDeadline=()=>{if(expired)throw false;};await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),error=>error===false);assert.equal(f.upgrades,0);assert.equal(f.events.at(-1),'RESET ROLE');
});
