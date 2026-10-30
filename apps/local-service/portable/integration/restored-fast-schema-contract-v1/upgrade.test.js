// Invented fixed-table rows and owner ports only; no archive, DB or child.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {AUTOMATIC17_RESTORED_TABLES,verifyAndUpgradeRestoredAutomaticTopicsForTest} from './upgrade.js';
import {describeAutomaticTopicBackupTables} from '../../../src/ops/automatic-topics-backup-operator.js';
import {describeVectorProjection,projectedVectorRowHash} from '../../../experiments/restored-fingerprint-v1/vector-row.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const sequences=['import_ledger_import_id_seq','contribution_ordinal_sequence','topic_ordinal_sequence','discussion_ordinal_sequence','source_ordinal_sequence','source_link_ordinal_sequence','ingestion_job_ordinal_sequence'];
const added=['named_retrieval_inputs_index_ordinal_seq','named_index_requests_ordinal_seq','named_discovery_requests_ordinal_seq','named_feed_events_event_id_seq','named_public_events_event_id_seq','unified_search_events_event_id_seq'];
function fixture(fault={}){
 const events=[],queries=[],names=Object.keys(AUTOMATIC17_RESTORED_TABLES),manifest=Array.from({length:18},(_,i)=>({version:i+1,hash:hash('manifest'+i)}));
 let upgraded=false,activeTable=null,fetches=0,upgrades=0;
 const vectorWire=()=>{const b=Buffer.alloc(44);b.writeInt32BE(1);b.writeUInt32BE(701,8);b.writeInt32BE(2,12);b.writeInt32BE(1,16);b.writeInt32BE(8,20);b.writeDoubleBE(.3,24);b.writeInt32BE(8,32);b.writeDoubleBE(.4,36);return b;};
 const projected=i=>({base_json:JSON.stringify({source_id:'s'+i,operation_digest:hash('op'),matcher_hash:hash('m'),body_wire_hash:hash('b'),title_wire_hash:hash('t'),supported_path:['nature'],semantic_eligible:true}),body_values_wire:vectorWire(),title_values_wire:vectorWire()});
 // Fake-port expected hashes are orchestration fixtures, not a SQL compatibility
 // oracle. The separate actual192-row/3-array comparison establishes sample equivalence.
 const rowHashes=table=>Array.from({length:table==='sources'?129:table==='semantic_inputs'?65:1},(_,i)=>table==='semantic_inputs'?projectedVectorRowHash(table,projected(i)):hash(table+i));
 const fingerprints=names.map(table=>({table,rows:rowHashes(table).length,sha256:hash(rowHashes(table).map(s=>s+'\n').join(''))}));
 const receiptRows=fault.legacyReceipt?fingerprints.filter(row=>row.table!=='semantic_preparation_requests'):fingerprints;
 const version={generation:'restored-generation',revision:33},fp={algorithm:'sha256-pkordered-jsonb-and-binary64-array-send/v1',tables:receiptRows,sha256:hash(JSON.stringify(receiptRows))};
 const receipt={verified:true,cleanupVerified:true,version,migrations:manifest.slice(0,17).map(r=>r.hash),dumpSha256:hash('dump'),headerSha256:hash('header'),currentRowsFingerprint:fp};
 receipt.fingerprintBinding={dumpSha256:receipt.dumpSha256,headerSha256:receipt.headerSha256,currentRowsFingerprintSha256:fp.sha256,version,migrations:receipt.migrations};
 const state={generation:version.generation,revision:String(version.revision),matcher_hash:hash('installed'),head_revision:'7',policy_revision:'5',default_max_depth:2,overrides:[{nodeId:'nature',maxDepth:3}]};
 const db={dialect:'pg',async exec(sql){queries.push(sql);events.push(sql);if(fault.reset&&sql==='RESET ROLE')throw 'secondary';},async query(sql){queries.push(sql);
  if(fault.sql){const result=fault.sql(sql,upgraded);if(result!==undefined)return result;}
  if(sql.startsWith('SET '))return {rows:[]};
  if(sql.includes('SELECT version,hash'))return {rows:manifest.slice(0,upgraded?18:17).map(r=>({...r,version:String(r.version)}))};
  if(sql.includes('p.default_max_depth'))return {rows:[{...state,...(upgraded&&fault.state?fault.state:{})}]};
  if(sql.includes('FROM pg_attribute')){const d=describeVectorProjection('semantic_inputs');return {rows:[...d.base,...d.arrays].sort().map(name=>({name,oid:d.arrays.includes(name)?1022:25}))};}
  if(sql.includes("c.relkind='r' ORDER BY"))return {rows:[...names,...(upgraded?Object.keys(describeAutomaticTopicBackupTables()):[])].sort().map(name=>({name,owner:'murmingle_owner'}))};
  if(sql.includes('a.grantee=0'))return {rows:[{n:fault.publicAcl?1:0}]};
  if(sql.startsWith('DECLARE ')){activeTable=/FROM canonical_v4\.([a-z_]+) t/u.exec(sql)[1];fetches=0;return {rows:[]};}
  if(sql.startsWith('FETCH ')){const size=Number(/FETCH FORWARD (\d+)/u.exec(sql)[1]),begin=fetches++*size;
   if(activeTable==='semantic_inputs'){const rows=Array.from({length:65},(_,i)=>projected(i)).slice(begin,begin+size);if(begin===0&&fault.row===activeTable&&upgraded===!!fault.after)rows[0].base_json=rows[0].base_json.replace('"s0"','"changed"');if(begin===0&&fault.wire&&upgraded===!!fault.after)rows[0].body_values_wire.writeInt32BE(0,16);return {rows};}
   const values=rowHashes(activeTable);if(fault.row===activeTable&&upgraded===!!fault.after)values[0]=hash('changed');return {rows:values.slice(begin,begin+size).map(row_sha=>({row_sha}))};}
  if(sql==='CLOSE backup_rows'){events.push('cursor-close');return {rows:[]};}
  if(sql.includes('JOIN pg_sequence'))return {rows:[...sequences,...(upgraded?added:[])].map(name=>({name,owner:'murmingle_owner',increment:'1',cycle:false}))};
  if(sql.startsWith('SELECT last_value'))return {rows:[{last_value:fault.sequence&&upgraded?'8':'9007199254740993',is_called:true}]};
  if(sql.startsWith('SELECT max('))return {rows:[{maximum:'9007199254740992'}]};
  throw Error('unexpected invented SQL: '+sql);
 },async transaction(work){events.push('BEGIN');try{const result=await work(db);events.push('COMMIT');return result;}catch(error){events.push('ROLLBACK');throw error;}}};
 const ports={async manifest(profile){assert.ok(['hierarchy17','hierarchy18'].includes(profile));return manifest.slice(0,profile==='hierarchy17'?17:18);},async upgrade(a){events.push('UPGRADE');upgrades++;assert.equal(a.database,db);assert.equal(a.expectedHeadRevision,7);assert.equal(a.expectedPolicyRevision,5);if(fault.upgrade)throw false;upgraded=true;return {schemaVersion:18,matcherIdentityHash:state.matcher_hash,headRevision:7,policyRevision:5};}};
 return {value:{database:db,receipt,checkDeadline:()=>{},onFingerprint:async stage=>events.push(stage)},ports,events,queries,get upgrades(){return upgrades;}};
}
test('restored17 complete29-table comparison precedes owner CAS; all28 preserved tables and13 sequences remain safe',async()=>{
 const f=fixture(),r=await verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports);
 assert.deepEqual(r,{schema:'private-restored-automatic18-upgrade/v3',status:'passed',schemaVersion:18,restoredTables:29,preservedLegacyTables:28,legacyRowsUnchanged:true,
  rowFingerprintImplementation:'semantic-input-binary64-jsonb/v1',
  receiptFingerprintTables:29,receiptFingerprintProfile:'complete29',derivedQueuePreserved:true,derivedQueueReceiptVerified:true,derivedQueueRows:1,
  derivedQueueSha256:hash(hash('semantic_preparation_requests0')+'\n'),matcherUnchanged:true,policyUnchanged:true,runtimeVersionUnchanged:true,generatedSequencesSafe:true,testComposition:true});
 assert.equal(f.upgrades,1);assert.equal(f.events.filter(x=>x==='cursor-close').length,57);assert.equal(f.events.filter(x=>x==='COMMIT').length,2);
 assert.ok(f.events.indexOf('COMMIT')<f.events.indexOf('SET ROLE murmingle_owner'));assert.ok(f.events.indexOf('RESET ROLE')>f.events.indexOf('UPGRADE'));
 assert.equal(f.queries.filter(x=>x.startsWith('DECLARE')).length,57);assert.ok(f.queries.some(x=>x.includes('array_send(t.body_values) AS body_values_wire')));
 assert.equal(f.queries.filter(x=>x==='FETCH FORWARD 32 FROM backup_rows').length,6);assert.equal(f.queries.filter(x=>x.includes('FROM pg_attribute')).length,2);
 const markers=f.events.filter(x=>x.startsWith('original-table-')||x.startsWith('preserved-table-')||['original-sequences-verified','schema18-migration-verified','migrated-sequences-verified'].includes(x));
 assert.equal(markers.length,60);assert.equal(markers[0],'original-table-schema_migrations-verified');assert.equal(markers.at(-1),'migrated-sequences-verified');
 assert.equal(f.queries.filter(x=>x==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY').length,2);
});
test('legacy28 receipt keeps every original comparison and adds queue pre/post equality with honest independent-coverage flag',async()=>{
 const f=fixture({legacyReceipt:true}),r=await verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports);
 assert.equal(r.receiptFingerprintTables,28);assert.equal(r.receiptFingerprintProfile,'legacy28');
 assert.equal(r.restoredTables,29);assert.equal(r.preservedLegacyTables,28);assert.equal(r.derivedQueuePreserved,true);assert.equal(r.derivedQueueReceiptVerified,false);
 assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')).length,57);
 assert.equal(f.queries.filter(sql=>sql.startsWith('DECLARE')&&sql.includes('.semantic_preparation_requests ')).length,2);
 for(const fault of [{legacyReceipt:true,row:'contributions'},{legacyReceipt:true,row:'semantic_inputs'}]){
  const bad=fixture(fault);await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(bad.value,bad.ports),{code:'AUTOMATIC_RESTORE_ORIGINAL_ROWS'});assert.equal(bad.upgrades,0);
 }
});

test('both snapshots census exact projected columns and float8 array types before accepting any hash',async()=>{
 const d=describeVectorProjection('semantic_inputs'),columns=[...d.base,...d.arrays].sort().map(name=>({name,oid:d.arrays.includes(name)?1022:25}));
 for(const after of [false,true])for(const change of [rows=>rows.filter(r=>r.name!=='body_values'),
  rows=>[...rows,{name:'new_hidden_column',oid:25}].sort((a,b)=>a.name<b.name?-1:1),
  rows=>rows.map(r=>r.name==='body_values'?{...r,oid:1007}:r)]){
  const f=fixture({legacyReceipt:true,sql(sql,upgraded){if(sql.includes('FROM pg_attribute')&&upgraded===after)return {rows:change(columns)};}});
  await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:'AUTOMATIC_RESTORE_PROJECTION_COLUMNS'});
  assert.equal(f.upgrades,after?1:0);assert.ok(f.events.includes('ROLLBACK'));
 }
});

test('unchanged JSON numbers cannot hide changed binary array lower bounds, before or after migration',async()=>{
 for(const after of [false,true]){
  const f=fixture({legacyReceipt:true,wire:true,after});
  await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:after?'AUTOMATIC_RESTORE_PRESERVED_ROWS':'AUTOMATIC_RESTORE_ORIGINAL_ROWS'});
  assert.equal(f.upgrades,after?1:0);assert.ok(f.events.includes('cursor-close'));
 }
});

test('projected row cursor enforces its32-row batch bound and closes originals on refusal',async()=>{
 const f=fixture({sql(sql){if(sql==='FETCH FORWARD 32 FROM backup_rows')return {rows:Array(33).fill(null)};}});
 await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:'AUTOMATIC_RESTORE_FETCH'});
 assert.equal(f.upgrades,0);assert.ok(f.events.includes('cursor-close')&&f.events.includes('ROLLBACK'));
});

test('original checkpoint promise is awaited before migration and its falsy failure is preserved',async()=>{
 let settle;const pending=new Promise(resolve=>{settle=resolve;}),f=fixture();let reached=false;
 f.value.onFingerprint=async stage=>{if(stage==='original-table-semantic_preparation_requests-verified'){reached=true;await pending;}};
 const run=verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports);while(!reached)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.upgrades,0);settle();assert.equal((await run).status,'passed');
 const bad=fixture();bad.value.onFingerprint=async()=>{throw false;};let caught='none';try{await verifyAndUpgradeRestoredAutomaticTopicsForTest(bad.value,bad.ports);}catch(e){caught=e;}
 assert.equal(caught,false);assert.equal(bad.upgrades,0);assert.ok(bad.events.includes('ROLLBACK')&&bad.events.includes('cursor-close'));
});
test('queue changes after migration fail with either receipt coverage; complete29 receipt also checks original queue',async()=>{
 for(const legacyReceipt of [true,false]){
  const f=fixture({legacyReceipt,row:'semantic_preparation_requests',after:true});
  await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:'AUTOMATIC_RESTORE_PRESERVED_ROWS'});assert.equal(f.upgrades,1);
 }
 const f=fixture({row:'semantic_preparation_requests'});
 await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:'AUTOMATIC_RESTORE_ORIGINAL_ROWS'});assert.equal(f.upgrades,0);
});
test('missing/extra relations and wrong owners cannot bypass the complete inventory by using legacy receipt coverage',async()=>{
 for(const kind of ['missing','extra','owner']){
  const f=fixture({legacyReceipt:true,sql(sql){if(!sql.includes("c.relkind='r' ORDER BY"))return;
   const names=Object.keys(AUTOMATIC17_RESTORED_TABLES).sort();if(kind==='missing')names.pop();if(kind==='extra')names.push('unexpected');
   return {rows:names.map(name=>({name,owner:kind==='owner'?'postgres':'murmingle_owner'}))};}});
  await assert.rejects(verifyAndUpgradeRestoredAutomaticTopicsForTest(f.value,f.ports),{code:kind==='owner'?'AUTOMATIC_RESTORE_TABLE_OWNER':'AUTOMATIC_RESTORE_TABLE_SET'});
  assert.equal(f.upgrades,0);
 }
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
