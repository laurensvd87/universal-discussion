// Pure ports exercise real manifest, health, numeric loader and owner adapters.
// No SQL engine, E5 session, claim or external operation is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readCanonicalV4MigrationManifest,migrateCanonicalV4} from '../canonical-v4/index.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4IngestionRepository} from '../canonical-v4/ingestion-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {installInstalledHierarchy} from '../canonical-v4/hierarchy-installation.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const rows=manifest=>manifest.map(({version,hash})=>({version,hash}));

async function owner({isolation='read committed',readonly='off',failPolicy=false}={}){
 let state={migrations:rows(await readCanonicalV4MigrationManifest()),head:0,policy:0,models:[]},transactions=0;
 const calls=[];
 const db={query:()=>assert.fail('Installer must use its physical transaction'),async transaction(work){
  transactions++;const before=structuredClone(state);
  const tx={dialect:'pg',async exec(sql){calls.push({tx,kind:'ddl',sql});},async query(sql,args=[]){
   calls.push({tx,kind:'query',sql,args});
   if(sql.startsWith("SELECT current_setting('transaction_isolation')"))return {rows:[{isolation,read_only:readonly}]};
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
   if(sql.includes('pg_get_userbyid'))return {rows:[{owner:'murmingle_owner',current_user:'murmingle_owner'}]};
   if(sql.includes('FROM pg_extension'))return {rows:[{}]};
   if(sql==='SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')return {rows:structuredClone(state.migrations)};
   if(sql.startsWith('INSERT INTO canonical_v4.schema_migrations')){state.migrations.push({version:args[0],hash:args[1]});return {rows:[]};}
   if(sql.includes('semantic_register_matcher')){const hash=sha(args[0]);state.models.push(hash);return {rows:[{matcher_hash:hash}]};}
   if(sql.includes('semantic_activate_matcher')){if(args[1]!==state.head)throw Object.assign(Error('head CAS'),{code:'P1211'});state.head++;return {rows:[{revision:state.head}]};}
   if(sql.includes('semantic_set_owner_policy')){if(failPolicy||args[0]!==state.policy)throw Object.assign(Error('policy CAS'),{code:'P1221'});state.policy++;return {rows:[{revision:String(state.policy)}]};}
   assert.fail('Unexpected owner query');
  }};
  try{const result=await work(tx);calls.push({kind:'commit'});return result;}catch(error){state=before;calls.push({kind:'rollback'});throw error;}
 }};
 return {db,calls,snapshot:()=>structuredClone(state),get transactions(){return transactions;}};
}
const request=db=>({database:db,expectedHeadRevision:0,expectedPolicyRevision:0,policy:{defaultMaxDepth:1,overrides:[]}});

test('closed manifests preserve exact legacy9 and hierarchy16 prefixes under hierarchy17',async()=>{
 const legacy=await readCanonicalV4MigrationManifest(),hierarchy=await readCanonicalV4MigrationManifest('hierarchy16'),latest=await readCanonicalV4MigrationManifest('hierarchy17');
 assert.equal(legacy.length,9);assert.equal(hierarchy.length,16);assert.equal(latest.length,17);
 assert.deepEqual(hierarchy.slice(0,9),legacy);assert.deepEqual(latest.slice(0,16),hierarchy);assert.equal(latest[16].version,17);assert.equal(latest[16].hash,sha(latest[16].sql));
 for(const profile of ['hierarchy15','hierarchy18','16','17',16,17,null,{},['hierarchy16'],['hierarchy17']])await assert.rejects(readCanonicalV4MigrationManifest(profile),TypeError);
});

test('all repository health gates require exact selected hashes/counts and default to9',async()=>{
 const legacy=rows(await readCanonicalV4MigrationManifest()),hierarchy=rows(await readCanonicalV4MigrationManifest('hierarchy16')),latest=rows(await readCanonicalV4MigrationManifest('hierarchy17'));
 for(const factory of [createCanonicalV4RuntimeRepository,createCanonicalV4IngestionRepository,createCanonicalV4LifecycleRepository]){
  for(const [schemaProfile,valid] of [['legacy9',legacy],['hierarchy16',hierarchy],['hierarchy17',latest]]){
   let current=valid;
   const database={transaction:()=>assert.fail('Health is read only'),async query(sql){return {rows:sql.includes('schema_migrations')?current:
    [{generation:'generation',revision:0,catalog_version:0,matching_version:0}]};}};
   const repo=factory({database,schemaProfile});assert.equal((await repo.health()).schemaVersion,valid.length);
   if(schemaProfile==='legacy9')assert.equal((await factory({database}).health()).schemaVersion,9);
   for(const invalid of [valid.slice(0,-1),[...valid,{version:18,hash:'0'.repeat(64)}],valid.map((row,i)=>i===0?{...row,hash:'0'.repeat(64)}:row),valid.map((row,i)=>i===valid.length-1?{...row,hash:'f'.repeat(64)}:row)]){
    current=invalid;await assert.rejects(repo.health(),{code:'unavailable'});
   }
   for(const other of [legacy,hierarchy,latest].filter(rows=>rows!==valid)){current=other;await assert.rejects(repo.health(),{code:'unavailable'});}
   assert.throws(()=>factory({database,schemaProfile:'arbitrary'}),TypeError);
  }
 }
});

test('owner installer uses one verifiedRC physical transaction for9to17, fixed matcher and explicit CAS policy',async()=>{
 const f=await owner(),before=f.snapshot(),input=request(f.db),policy=structuredClone(input.policy),result=await installInstalledHierarchy(input);
 assert.equal(f.transactions,1);assert.equal(result.schemaVersion,17);assert.equal(result.headRevision,1);assert.equal(result.policy.revision,1);
 assert.deepEqual(input.policy,policy);assert.deepEqual(f.snapshot().migrations.slice(0,9),before.migrations);
 assert.equal(f.snapshot().migrations.length,17);assert.equal(f.snapshot().models[0],result.matcherIdentityHash);
 const physical=f.calls.filter(c=>c.tx);assert.equal(new Set(physical.map(c=>c.tx)).size,1);
 const registration=f.calls.findIndex(c=>c.kind==='query'&&c.sql?.startsWith('SELECT canonical_v4.semantic_register_matcher')),lastMigration=f.calls.findLastIndex(c=>c.sql?.startsWith('INSERT INTO canonical_v4.schema_migrations'));
 assert.ok(lastMigration<registration);assert.equal(f.calls[0].sql.startsWith("SELECT current_setting('transaction_isolation')"),true);
 assert.equal(f.calls.at(-1).kind,'commit');
});

test('stale owner policy rolls back migration, registration and activation; isolation and missing policy reject before mutation',async()=>{
 const f=await owner({failPolicy:true}),before=f.snapshot();await assert.rejects(installInstalledHierarchy(request(f.db)),{code:'conflict'});
 assert.deepEqual(f.snapshot(),before);assert.equal(f.calls.at(-1).kind,'rollback');
 assert.ok(f.calls.some(c=>c.sql?.includes('semantic_activate_matcher')));
 for(const options of [{isolation:'repeatable read'},{isolation:'serializable'},{readonly:'on'}]){
  const bad=await owner(options);await assert.rejects(installInstalledHierarchy(request(bad.db)));
  assert.equal(bad.calls.some(c=>c.kind==='ddl'),false);
 }
 const bad=await owner();const input=request(bad.db);delete input.policy;await assert.rejects(installInstalledHierarchy(input));assert.equal(bad.transactions,0);
 const stale=await owner(),original=stale.snapshot();await assert.rejects(installInstalledHierarchy({...request(stale.db),expectedHeadRevision:1}),{code:'conflict'});
 assert.deepEqual(stale.snapshot(),original);
});

test('owner policy is snapshotted before async loading and unsafe nested rules never invoke hooks',async()=>{
 const f=await owner(),input=request(f.db);input.policy.overrides.push({nodeId:'games',maxDepth:2});
 const installing=installInstalledHierarchy(input);input.policy.overrides[0].maxDepth=8;input.policy.overrides.push({nodeId:'unknown',maxDepth:8});
 const result=await installing;assert.deepEqual(result.policy.overrides,[{nodeId:'games',maxDepth:2}]);
 let hooks=0;const unsafe=await owner(),values=[];Object.defineProperty(values,'0',{enumerable:true,get(){hooks++;return {nodeId:'games',maxDepth:2};}});
 await assert.rejects(installInstalledHierarchy({...request(unsafe.db),policy:{defaultMaxDepth:1,overrides:values}}),TypeError);
 assert.equal(hooks,0);assert.equal(unsafe.transactions,0);
});

test('migrator rejects future, nonprefix or mismatched registered rows without executing migration SQL',async()=>{
 for(const profile of ['hierarchy16','hierarchy17']){
  const manifest=rows(await readCanonicalV4MigrationManifest(profile));
  for(const current of [[...manifest,{version:manifest.length+1,hash:'0'.repeat(64)}],manifest.slice(1),manifest.map((r,i)=>i===8?{...r,hash:'f'.repeat(64)}:r)]){
   const ddl=[],tx={dialect:'pg',exec:async sql=>{ddl.push(sql);},query:async sql=>({rows:sql.includes('pg_get_userbyid')?[{owner:'owner',current_user:'owner'}]:sql.includes('pg_extension')?[{}]:sql.includes('schema_migrations')?current:[{}]})};
   await assert.rejects(migrateCanonicalV4({transaction:work=>work(tx)},profile));
   assert.equal(ddl.length,1);assert.match(ddl[0],/^CREATE TABLE IF NOT EXISTS canonical_v4.schema_migrations/);
  }
 }
});

test('explicit hierarchy16 migration stays at16 and owner installation appends17 in a new atomic operation',async()=>{
 const f=await owner(),legacy=await readCanonicalV4MigrationManifest('hierarchy16');
 const original=await migrateCanonicalV4(f.db,'hierarchy16');assert.equal(original.schemaVersion,16);
 assert.deepEqual(f.snapshot().migrations,rows(legacy));assert.equal(f.snapshot().head,0);assert.equal(f.snapshot().policy,0);assert.deepEqual(f.snapshot().models,[]);
 const boundary=f.calls.length,installed=await installInstalledHierarchy(request(f.db));
 assert.equal(installed.schemaVersion,17);assert.equal(f.transactions,2);assert.deepEqual(f.snapshot().migrations.slice(0,16),rows(legacy));
 const inserted=f.calls.slice(boundary).filter(call=>call.sql?.startsWith('INSERT INTO canonical_v4.schema_migrations'));
 assert.deepEqual(inserted.map(call=>call.args[0]),[17]);assert.equal(installed.headRevision,1);assert.equal(installed.policy.revision,1);
});
