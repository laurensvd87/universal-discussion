import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openDormantPostgresApplication} from '../src/startup.js';
import {readCanonicalV4MigrationManifest} from '../portable/canonical-v4/index.js';

async function fixture(profile='legacy9'){
 const manifest=await readCanonicalV4MigrationManifest(profile),calls=[];
 const database={async query(sql){
  calls.push(['canonical-query',sql]);
  if(sql==='SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')
   return {rows:manifest.map(({version,hash})=>({version,hash}))};
  if(sql.includes('FROM canonical_v4.runtime_state WHERE singleton=true'))
   return {rows:[{generation:'startup-generation',revision:1,catalog_version:1,matching_version:1}]};
  assert.fail('Unexpected canonical SQL');
 },transaction:()=>assert.fail('Startup must not open a write transaction'),
 async close(){calls.push(['canonical-close']);}};
 return {calls,database,options:{
  config:{host:'127.0.0.1',port:4174,origin:'chrome-extension://'+'a'.repeat(32),capability:'startup-test-capability-'.repeat(3)},
  databasePath:fileURLToPath(new URL('../data/unused-startup-test.sqlite',import.meta.url)),
  canonicalDatabase:database,nextId:kind=>'startup-'+kind,now:()=> '2026-10-27T00:00:00.000Z',
  ai:{dispose(){calls.push(['ai-dispose']);},restore:async()=>false},
 }};
}

test('trusted hierarchy startup exposes semantic reads without opening an encoder, worker, or legacy Topic Spaces index',async()=>{
 const f=await fixture('hierarchy17');
 const application=await openDormantPostgresApplication({...f.options,hierarchicalTopics:true,
  alternateRidgeAdapter:new Proxy({}, {get(){assert.fail('API-only startup must not touch the old index or worker encoder');}}),
  canonicalDatabaseOwned:true});
 assert.equal(application.topicSpaces,null);
 for(const name of ['semanticTopics','semanticContext','semanticFeed','semanticThread','semanticTarget'])
  assert.equal(typeof application.service[name],'function');
 assert.ok(f.calls.every(([kind])=>kind==='canonical-query'));
 await application.close();await application.close();
 assert.equal(f.calls.filter(([kind])=>kind==='ai-dispose').length,1);
 assert.equal(f.calls.filter(([kind])=>kind==='canonical-close').length,1);
});

test('default startup retains the old canonical API until the trusted operator opts in',async()=>{
 const f=await fixture(),application=await openDormantPostgresApplication(f.options);
 assert.equal(application.service.semanticFeed,undefined);assert.equal(application.service.semanticContext,undefined);
 await application.close();assert.equal(f.calls.some(([kind])=>kind==='canonical-close'),false,'caller owns an unowned pool');
});

test('invalid hierarchy controls and legacy worker overrides fail before any database work',async()=>{
 for(const extra of [{hierarchicalTopics:'true'},
  {hierarchicalTopics:true,ingestionWorkerDatabase:{query:async()=>assert.fail('No query')},ingestionWorkerRepository:{}}]){
  const f=await fixture();await assert.rejects(openDormantPostgresApplication({...f.options,...extra}),TypeError);
  assert.deepEqual(f.calls,[]);
 }
});

test('an embedded hierarchy worker rejects a missing migration or excessive privileges before any claim and releases owned pools',async()=>{
 for(const rights of [
  {container_installed:false,semantic_execute:false,container_execute:false,legacy_execute:false},
  {container_installed:true,semantic_execute:true,container_execute:true,legacy_execute:false},
 ]){
  const f=await fixture('hierarchy17'),manifest=await readCanonicalV4MigrationManifest('hierarchy17');let workerQueries=0;
  const workerDatabase={async query(sql){workerQueries++;
   if(sql==='SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')return {rows:manifest.map(({version,hash})=>({version,hash}))};
   assert.ok(sql.includes('AS container_installed'));
   return {rows:[rights]};},async close(){f.calls.push(['worker-close']);}};
  await assert.rejects(openDormantPostgresApplication({...f.options,hierarchicalTopics:true,
   canonicalDatabaseOwned:true,ingestionWorkerDatabase:workerDatabase,ingestionWorkerDatabaseOwned:true,
   referenceMatcher:{represent:()=>assert.fail('Must not prepare a claim')},
  }),error=>error.code==='unavailable');
  assert.equal(workerQueries,2);assert.deepEqual(f.calls.filter(([kind])=>!kind.endsWith('query')).map(([kind])=>kind),
   ['ai-dispose','worker-close','canonical-close']);
 }
});

test('cleanup attempts all independently owned pools and preserves even a falsy first failure',async()=>{
 const f=await fixture('hierarchy17'),urlPool={query:async()=>assert.fail('No URL read'),transaction:()=>assert.fail('No URL transaction'),
  async close(){f.calls.push(['url-close']);throw Error('Later cleanup failure');}};
 const application=await openDormantPostgresApplication({...f.options,hierarchicalTopics:true,
  canonicalDatabaseOwned:true,urlSelectionDatabase:urlPool,urlSelectionDatabaseOwned:true,
  ai:{dispose(){f.calls.push(['ai-dispose']);throw null;}}});
 const closing=application.close();assert.equal(application.close(),closing);
 await assert.rejects(closing,error=>error===null);
 assert.deepEqual(f.calls.filter(([kind])=>kind.endsWith('close')||kind==='ai-dispose').map(([kind])=>kind),
  ['ai-dispose','url-close','canonical-close']);
 assert.equal(application.close(),closing,'a rejected close must not silently turn into a successful retry');
});

test('concurrent close callers await the same original cleanup before the canonical pool closes',async()=>{
 const f=await fixture();let release;
 const hold=new Promise(resolve=>{release=resolve;});
 const application=await openDormantPostgresApplication({...f.options,canonicalDatabaseOwned:true,
  ai:{async dispose(){f.calls.push(['ai-dispose']);await hold;}}});
 let finished=false;const closing=application.close();const observed=closing.then(()=>{finished=true;});
 assert.equal(application.close(),closing);await Promise.resolve();await Promise.resolve();
 assert.equal(finished,false);assert.equal(f.calls.some(([kind])=>kind==='canonical-close'),false);
 release();await observed;assert.equal(finished,true);
 assert.equal(f.calls.filter(([kind])=>kind==='canonical-close').length,1);
});

test('schema-health startup failures still close owned pools without replacing the original failure',async()=>{
 const f=await fixture(),failure=Error('Original schema health failure');
 f.database.query=async()=>{throw failure;};
 f.database.close=async()=>{f.calls.push(['canonical-close']);throw Error('Cleanup failure');};
 await assert.rejects(openDormantPostgresApplication({...f.options,canonicalDatabaseOwned:true}),error=>error===failure);
 assert.deepEqual(f.calls,[['canonical-close']]);
});

test('trusted hierarchy17 startup refuses legacy9 and hierarchy16 before worker or encoder work',async()=>{
 for(const profile of ['legacy9','hierarchy16']){
  const f=await fixture(profile);let workerQueries=0;
  await assert.rejects(openDormantPostgresApplication({...f.options,hierarchicalTopics:true,
   ingestionWorkerDatabase:{query:async()=>{workerQueries++;assert.fail('Old profile must fail before worker work');}},
   referenceMatcher:{represent:()=>assert.fail('No claim or encoder work')},
  }),{code:'unavailable'});assert.equal(workerQueries,0);
 }
});

test('embedded hierarchy worker rejects exact16 schema before role, model or encoder reads',async()=>{
 const f=await fixture('hierarchy17'),manifest=await readCanonicalV4MigrationManifest('hierarchy16');let queries=0;
 const database={query:async sql=>{queries++;assert.equal(sql,'SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version');
  return {rows:manifest.map(({version,hash})=>({version,hash}))};}};
 await assert.rejects(openDormantPostgresApplication({...f.options,hierarchicalTopics:true,ingestionWorkerDatabase:database,
  referenceMatcher:{represent:()=>assert.fail('No claim or encoder work')}}),{code:'unavailable'});assert.equal(queries,1);
});
