import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPGliteDatabase } from '../../../src/database.js';
import { seedCanonicalV4RuntimeFixture } from '../../../test/canonical-v4-runtime-fixture.js';
import { createCanonicalV4IngestionRepository } from '../../ingestion-repository.js';
import { initializeFastAdmissionPrototype,publishFastAdmissionArtifact,forgetFastSource,pairedVectorWire } from '../hierarchy-fast-admission-v1/repository.js';
import { initializeFastQueuePrototype,prepareFastQueueCommand,enqueueFastAdmission,claimFastAdmission,heartbeatFastAdmission,completeFastAdmission,cancelFastAdmission } from './repository.js';
const hash=n=>String(n).repeat(64),modelId='e5-small-q8-browser-main-prefix-v1',unit=()=>[1,-0,...Array(382).fill(0)];
function command(f,n){return {schema:'source-local-fast-queue-command/v1',policyVersion:'source-local-canonical-container/v1',actorId:f.actorId,admission:{
 expected:{generation:f.generation,revision:f.revision},operationId:'queue-op-'+n,sourceId:'queue-source-'+n,topicId:'queue-topic-'+n,
 discussionId:'queue-discussion-'+n,createdAt:'2026-10-20T12:00:00.000Z',url:'https://example.org/queue/'+n,title:'Synthetic queue fixture '+n,
 extractorVersion:'main-text-prefix/v1',modelId,bodyHash:hash(6),builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),documentHash:hash(7),
 bodyVector:unit(),titleVector:unit(),nodeId:'games'}};}
function identity(c){const {actorId,operationId,commandHash}=prepareFastQueueCommand(c);return {actorId,operationId,commandHash};}
function lease(c,extra={}){return {...identity(c),workerId:'fixture-worker',leaseToken:'fixture-lease-'+c.admission.operationId,...extra};}
const enqueue=(db,c)=>enqueueFastAdmission(db,{command:c,authoritySeconds:30});
const claim=(db,c,extra={})=>claimFastAdmission(db,{...lease(c),leaseSeconds:10,...extra});
const count=async(db,table)=>Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n);

test('queue boundary rejects hostile objects and policy crossover before DB calls',async()=>{
 let calls=0;const db={transaction(){calls++;throw 0}},p=new Proxy({},{get(){calls++;throw 0},ownKeys(){calls++;throw 0}});
 assert.throws(()=>prepareFastQueueCommand(p));await assert.rejects(cancelFastAdmission(db,p));
 const c=command({generation:'fixture',revision:1,actorId:'fixture'},'invalid');
 c.policyVersion='legacy';assert.throws(()=>prepareFastQueueCommand(c));assert.equal(calls,0);
 await assert.rejects(initializeFastQueuePrototype({dialect:'pg'}));
});

test('prepared-evidence fast queue integrates actual canonical admission in one disposable PGlite', {timeout:90000},async t=>{
 const db=await createPGliteDatabase();t.after(()=>db.close());const f=await seedCanonicalV4RuntimeFixture(db);
 const oldSources=(await db.query('SELECT * FROM canonical_v4.sources ORDER BY id')).rows;
 const oldPosts=(await db.query('SELECT * FROM canonical_v4.contributions ORDER BY id')).rows;
 await initializeFastAdmissionPrototype(db);await publishFastAdmissionArtifact(db,{builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),modelHash:hash(4),policyHash:hash(5),modelId,nodes:['games','nature']});
 await initializeFastQueuePrototype(db);
 await db.exec(`CREATE OR REPLACE FUNCTION canonical_v4.ingest_ridge_scan(candidate double precision[],p_parameter_sha256 text)
 RETURNS TABLE(topic_id text,similarity double precision) LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'No queue Ridge calls'; END $$`);
 const c=command(f,'complete');let done;
 await t.test('enqueue/claim/heartbeat/complete/replay retain signed-zero wire and immutable exact whole-command identity',async()=>{
  const first=await enqueue(db,c);assert.equal(first.state,'pending');assert.deepEqual(await enqueue(db,c),first);
  const changed={...c,admission:{...c.admission,topicId:'other-allocation'}};assert.notEqual(identity(c).commandHash,identity(changed).commandHash);
  await assert.rejects(enqueue(db,changed));await assert.rejects(enqueue(db,{...c,actorId:'other-actor'}));
  for(const k of ['nodeId','title','builderHash']){const x={...c,admission:{...c.admission,[k]:k==='nodeId'?'nature':k==='title'?'Changed title':hash(9)}};await assert.rejects(enqueue(db,x));}
  assert.equal((await claim(db,c)).attempts,1);assert.equal((await claim(db,c)).attempts,1);
  await assert.rejects(claim(db,c,{workerId:'other-worker'}));
  await heartbeatFastAdmission(db,{...lease(c),leaseSeconds:10});
  await assert.rejects(completeFastAdmission(db,lease(c,{leaseToken:'wrong-token'})));
  done=await completeFastAdmission(db,lease(c));assert.equal(done.state,'complete');assert.equal(done.receipt.sourceId,c.admission.sourceId);
  assert.deepEqual(await completeFastAdmission(db,lease(c)),done);
  await assert.rejects(completeFastAdmission(db,lease(c,{workerId:'other-worker'})));
  const row=(await db.query('SELECT hierarchy_fast_admission_v1.wire_hash(values_double) AS wire FROM canonical_v4.embeddings WHERE source_id=$1',[c.admission.sourceId])).rows[0];
  assert.equal(row.wire,pairedVectorWire(unit()).wireHash);
  assert.equal((await db.query('SELECT parameters FROM hierarchy_fast_queue_v1.jobs WHERE operation_id=$1',[c.admission.operationId])).rows[0].parameters,null);
  assert.equal((await db.query('SELECT active_operation_id FROM canonical_v4.catalog_ingest_lane')).rows[0].active_operation_id,null);
 });
 await t.test('legacy operation IDs including terminal rows remain reserved and legacy enqueue cannot take fast identity or active URL',async()=>{
  const legacy=createCanonicalV4IngestionRepository({database:db}),x=command(f,'legacy');
  const old=await legacy.enqueueInteractive({expected:x.admission.expected,operationId:x.admission.operationId,url:'https://example.org/queue-legacy-other',title:'Synthetic legacy intent',embedding:{modelId,values:unit()},extractorVersion:'main-text-prefix/v1'},{authorityToken:'synthetic-authority',authoritySeconds:30});
  await legacy.revokeAuthority({operationId:old.operationId,operationDigest:old.operationDigest,authorityToken:old.authorityToken});
  await assert.rejects(enqueue(db,x));
  const pending=command(f,'reserved');await enqueue(db,pending);
  for(const change of [{operationId:pending.admission.operationId,url:'https://example.org/other'},{operationId:'legacy-steal-url',url:pending.admission.url}])
   await assert.rejects(legacy.enqueueInteractive({expected:pending.admission.expected,...change,title:'Synthetic crossover',embedding:{modelId,values:unit()},extractorVersion:'main-text-prefix/v1'},{authorityToken:'synthetic-authority',authoritySeconds:30}));
  await cancelFastAdmission(db,identity(pending));
 });
 await t.test('legacy UPDATE never takes growth; INSERT does, and UPDATE cannot mint a reservation',async()=>{
  const legacy=createCanonicalV4IngestionRepository({database:db}),x=command(f,'lock-order');
  await legacy.enqueueInteractive({expected:x.admission.expected,operationId:x.admission.operationId,
   url:x.admission.url,title:'Synthetic lock-order fixture',embedding:{modelId,values:unit()},extractorVersion:'main-text-prefix/v1'},
   {authorityToken:'synthetic-lock-authority',authoritySeconds:30});
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  const start=sql.indexOf('CREATE FUNCTION hierarchy_fast_queue_v1.guard_legacy()'),end=sql.indexOf('END $$;',start)+8;
  assert.ok(start>=0&&end>start);
  const original=sql.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
  assert.equal(original.split('PERFORM pg_advisory_xact_lock(914092008,1);').length,2);
  const instrumented=original.replace('PERFORM pg_advisory_xact_lock(914092008,1);',"RAISE EXCEPTION 'Synthetic growth-call probe' USING ERRCODE='P2299';");
  const sentinel=new Error('Rollback synthetic lock-order probe');
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec(instrumented);
   // This runs the actual installed trigger body, with only its growth call
   // faulted. The pre-fix unconditional-growth trigger fails this UPDATE.
   await tx.query('UPDATE canonical_v4.ingestion_jobs SET updated_at=clock_timestamp() WHERE operation_id=$1',[x.admission.operationId]);
   const row=(await tx.query('SELECT to_jsonb(j) AS value FROM canonical_v4.ingestion_jobs j WHERE operation_id=$1',[x.admission.operationId])).rows[0].value;
   const fresh={...row,operation_id:'synthetic-new-insert',ordinal:Number(row.ordinal)+100000};
   // A savepoint preserves the enclosing fault-instrumented probe transaction.
   await tx.exec('SAVEPOINT probe_insert');
   await assert.rejects(tx.query('INSERT INTO canonical_v4.ingestion_jobs SELECT (jsonb_populate_record(NULL::canonical_v4.ingestion_jobs,$1::jsonb)).*',[JSON.stringify(fresh)]),e=>e.code==='P2299');
   await tx.exec('ROLLBACK TO SAVEPOINT probe_insert');
   throw sentinel;
  }),e=>e===sentinel);
  await assert.rejects(db.query('UPDATE canonical_v4.ingestion_jobs SET operation_id=$2 WHERE operation_id=$1',[x.admission.operationId,'mutated-reservation']),e=>e.code==='P2202');
  await assert.rejects(db.query('UPDATE canonical_v4.ingestion_jobs SET source_url=$2 WHERE operation_id=$1',[x.admission.operationId,'https://example.org/changed-reservation']),e=>e.code==='P2202');
  await legacy.revokeAuthority({operationId:x.admission.operationId,operationDigest:(await db.query('SELECT operation_digest FROM canonical_v4.ingestion_jobs WHERE operation_id=$1',[x.admission.operationId])).rows[0].operation_digest,authorityToken:'synthetic-lock-authority'});
  await assert.rejects(db.query("UPDATE canonical_v4.ingestion_jobs SET state='pending' WHERE operation_id=$1",[x.admission.operationId]),e=>e.code==='P2202');
 });
 await t.test('expired leases cannot heartbeat/complete; fresh bounded lease reclaim retires old token',async()=>{
  const x=command(f,'reclaim');await enqueue(db,x);await claim(db,x);
  await db.query("UPDATE hierarchy_fast_queue_v1.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[x.admission.operationId]);
  await assert.rejects(heartbeatFastAdmission(db,{...lease(x),leaseSeconds:10}));await assert.rejects(completeFastAdmission(db,lease(x)));await assert.rejects(claim(db,x));
  assert.equal((await claim(db,x,{leaseToken:'second-token'})).attempts,2);
  await assert.rejects(completeFastAdmission(db,lease(x)));await cancelFastAdmission(db,identity(x));
  assert.equal((await claim(db,x,{leaseToken:'third-token'})).state,'cancelled');await assert.rejects(completeFastAdmission(db,lease(x,{leaseToken:'second-token'})));
 });
 await t.test('absolute deadline cannot renew on replay/heartbeat/complete; terminal material is scrubbed',async()=>{
  const x=command(f,'deadline');await enqueue(db,x);await claim(db,x);
  await db.query("UPDATE hierarchy_fast_queue_v1.jobs SET deadline=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[x.admission.operationId]);
  await assert.rejects(completeFastAdmission(db,lease(x)));await assert.rejects(heartbeatFastAdmission(db,{...lease(x),leaseSeconds:10}));
  const r=await enqueue(db,x);assert.equal(r.state,'expired');assert.equal((await claim(db,x)).state,'expired');
  assert.equal((await db.query('SELECT parameters FROM hierarchy_fast_queue_v1.jobs WHERE operation_id=$1',[x.admission.operationId])).rows[0].parameters,null);
 });
 await t.test('three attempts and eight live jobs are hard bounds; cancellation cannot cross actor/material identity',async()=>{
  const x=command(f,'exhausted');await enqueue(db,x);
  for(let i=1;i<=3;i++){
   assert.equal((await claim(db,x,{leaseToken:'attempt-'+i})).attempts,i);
   await db.query("UPDATE hierarchy_fast_queue_v1.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[x.admission.operationId]);
  }
  assert.equal((await claim(db,x,{leaseToken:'attempt-4'})).state,'expired');
  const pending=[];for(let i=0;i<8;i++){const c=command(f,'capacity-'+i);pending.push(c);await enqueue(db,c);}
  await assert.rejects(enqueue(db,command(f,'capacity-overflow')));
  await assert.rejects(cancelFastAdmission(db,{...identity(pending[0]),actorId:'other-actor'}));
  await assert.rejects(cancelFastAdmission(db,{...identity(pending[0]),commandHash:hash(9)}));
  for(const c of pending){const cancelled=await cancelFastAdmission(db,identity(c));assert.equal(cancelled.state,'cancelled');assert.deepEqual(await enqueue(db,c),cancelled);}
 });
 await t.test('stale canonical material rejects complete atomically and cannot publish a queue completion',async()=>{
  const x=command(f,'stale');x.admission.builderHash=hash(9);await enqueue(db,x);await claim(db,x);
  const before=await count(db,'canonical_v4.sources');await assert.rejects(completeFastAdmission(db,lease(x)));
  assert.equal(await count(db,'canonical_v4.sources'),before);
  assert.equal((await db.query('SELECT state,receipt FROM hierarchy_fast_queue_v1.jobs WHERE operation_id=$1',[x.admission.operationId])).rows[0].state,'leased');
  assert.equal((await db.query('SELECT count(*) AS n FROM hierarchy_fast_admission_v1.receipts WHERE operation_id=$1',[x.admission.operationId])).rows[0].n,0);
  await cancelFastAdmission(db,identity(x));
 });
 await t.test('failure after canonical admission rolls back admission AND queue completion',async()=>{
  const x=command(f,'rollback');await enqueue(db,x);await claim(db,x);
  await db.exec(`CREATE FUNCTION hierarchy_fast_queue_v1.test_reject_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='complete' THEN RAISE EXCEPTION 'Synthetic failure after admission'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER synthetic_completion_fault BEFORE UPDATE ON hierarchy_fast_queue_v1.jobs FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_queue_v1.test_reject_complete()`);
  const before=await count(db,'canonical_v4.sources');await assert.rejects(completeFastAdmission(db,lease(x)));assert.equal(await count(db,'canonical_v4.sources'),before);
  assert.equal((await db.query('SELECT count(*) AS n FROM hierarchy_fast_admission_v1.receipts WHERE operation_id=$1',[x.admission.operationId])).rows[0].n,0);
  await db.exec('DROP TRIGGER synthetic_completion_fault ON hierarchy_fast_queue_v1.jobs; DROP FUNCTION hierarchy_fast_queue_v1.test_reject_complete()');
  await cancelFastAdmission(db,identity(x));
 });
 await t.test('actual runtime generation change fences pending, leased and completed replay without mutation',async()=>{
  const pending=command(f,'generation-pending'),leased=command(f,'generation-leased');
  await enqueue(db,pending);await enqueue(db,leased);await claim(db,leased);
  const before=(await db.query('SELECT * FROM hierarchy_fast_queue_v1.jobs ORDER BY operation_id')).rows;
  const sources=await count(db,'canonical_v4.sources');
  await db.query('UPDATE canonical_v4.runtime_state SET generation=$1 WHERE singleton',[f.generation+'-changed']);
  try{
   for(const action of [()=>enqueue(db,pending),()=>enqueue(db,command(f,'generation-new')),
    ()=>claim(db,pending),()=>heartbeatFastAdmission(db,{...lease(leased),leaseSeconds:10}),
    ()=>completeFastAdmission(db,lease(leased)),()=>completeFastAdmission(db,lease(c)),
    ()=>cancelFastAdmission(db,identity(pending))])await assert.rejects(action());
   assert.deepEqual((await db.query('SELECT * FROM hierarchy_fast_queue_v1.jobs ORDER BY operation_id')).rows,before);
   assert.equal(await count(db,'canonical_v4.sources'),sources);
  }finally{
   await db.query('UPDATE canonical_v4.runtime_state SET generation=$1 WHERE singleton',[f.generation]);
  }
  await cancelFastAdmission(db,identity(pending));await cancelFastAdmission(db,identity(leased));
 });
 await t.test('actual Source forget erases completed queue proof but retains nonreviving identity tombstone',async()=>{
  await forgetFastSource(db,{generation:f.generation,sourceId:c.admission.sourceId});
  const r=await enqueue(db,c);assert.equal(r.state,'erased');assert.equal(r.receipt,null);
  const erased=(await db.query('SELECT parameters,source_url,result_source_id,completed_lease_hash FROM hierarchy_fast_queue_v1.jobs WHERE operation_id=$1',[c.admission.operationId])).rows[0];
  assert.deepEqual(erased,{parameters:null,source_url:null,result_source_id:null,completed_lease_hash:null});
  await assert.rejects(completeFastAdmission(db,lease(c)));assert.equal((await claim(db,c)).state,'erased');
 });
 await t.test('queue functions fixed paths/no PUBLIC DML and seeded legacy records unchanged',async()=>{
  await db.exec('CREATE ROLE fast_queue_untrusted');
  assert.equal((await db.query("SELECT has_table_privilege('fast_queue_untrusted','hierarchy_fast_queue_v1.jobs','INSERT,UPDATE,DELETE') AS allowed")).rows[0].allowed,false);
  const functions=(await db.query("SELECT p.prosecdef,p.proconfig,has_function_privilege('fast_queue_untrusted',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hierarchy_fast_queue_v1'")).rows;
  for(const row of functions){assert.equal(row.prosecdef,true);assert.equal(row.allowed,false);assert.deepEqual(row.proconfig,['search_path=pg_catalog']);}
  assert.deepEqual((await db.query('SELECT * FROM canonical_v4.sources WHERE id=ANY($1::text[]) ORDER BY id',[oldSources.map(s=>s.id)])).rows,oldSources);
  assert.deepEqual((await db.query('SELECT * FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[oldPosts.map(s=>s.id)])).rows,oldPosts);
 });
});
