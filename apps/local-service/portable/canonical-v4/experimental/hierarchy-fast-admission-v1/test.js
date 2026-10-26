import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPGliteDatabase } from '../../../src/database.js';
import { seedCanonicalV4RuntimeFixture } from '../../../test/canonical-v4-runtime-fixture.js';
import { createCanonicalV4RuntimeRepository } from '../../runtime-repository.js';
import { createCanonicalV4IngestionRepository } from '../../ingestion-repository.js';
import { BROWSER_MODEL_ID } from '../../../../src/domain/learned-sources.js';
import { initializeFastAdmissionPrototype,publishFastAdmissionArtifact,prepareFastAdmission,admitFastNewSource,
 createFastRoot,reclassifyFastSource,forgetFastSource,readFastRootFeed,pairedVectorWire } from './repository.js';

const hash=n=>String(n).repeat(64),sha=v=>createHash('sha256').update(v).digest('hex');
const unit=()=>[1,-0,...Array(382).fill(0)],NS='hierarchy_fast_admission_v1';
const artifact=()=>({builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),modelHash:hash(4),policyHash:hash(5),modelId:BROWSER_MODEL_ID,nodes:['games','nature']});
function input(f,suffix='one'){
 return {expected:{generation:f.generation,revision:f.revision},operationId:'fast-operation-'+suffix,sourceId:'source-fast-'+suffix,
 topicId:'topic-fast-'+suffix,discussionId:'discussion-fast-'+suffix,createdAt:'2026-10-20T12:00:00.000Z',url:'https://example.org/fast/'+suffix,
 title:'Invented bounded public fixture '+suffix,extractorVersion:'main-text-prefix/v1',modelId:BROWSER_MODEL_ID,bodyHash:hash(6),
 builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),documentHash:hash(7),bodyVector:unit(),titleVector:unit(),nodeId:'games'};
}
function root(f,r,suffix='one'){return {actorId:f.actorId,requestId:'root-request-'+suffix,generation:f.generation,topicId:r.topicId,
 body:'Synthetic human discussion root.',sourceId:r.sourceId,rootId:'contribution-fast-'+suffix,createdAt:'2026-10-20T12:01:00.000Z',witnessHash:r.witnessHash};}
const feed=(db,nodeId='games',extra={})=>readFastRootFeed(db,{nodeId,expectedFeedVersion:null,afterRootId:null,limit:20,...extra});
// Test-only reader inside an ALREADY active PGlite transaction; do not invent
// unsupported nested transactions or change the production adapter contract.
const transactionFeed=(tx,...args)=>feed({transaction:fn=>fn(tx)},...args);
async function count(db,table){return Number((await db.query('SELECT count(*) AS n FROM '+NS+'.'+table)).rows[0].n);}

test('strict paired wire serializer preserves -0 and rejects hostile/unnormalized data without callbacks',()=>{
 assert.notEqual(pairedVectorWire(unit()).wireHash,pairedVectorWire([1,...Array(383).fill(0)]).wireHash);
 assert.match(pairedVectorWire(unit()).sqlArray,/^\{1,-0,/u);
 let calls=0;const p=new Proxy([],{get(){calls++;throw 0}});assert.throws(()=>pairedVectorWire(p));
 const a=unit();Object.defineProperty(a,'1',{enumerable:true,get(){calls++;throw 0}});assert.throws(()=>pairedVectorWire(a));assert.equal(calls,0);
 for(const a of [Array(384).fill(0),[2,...Array(383).fill(0)],[NaN,...Array(383).fill(0)],Array(383).fill(0)])assert.throws(()=>pairedVectorWire(a));
});
test('new metadata/expected records reject proxy/getter/coercion inputs before any database call',async()=>{
 let calls=0;const db={query(){calls++;throw 0},transaction(){calls++;throw 0}},p=new Proxy({},{get(){calls++;throw 0},ownKeys(){calls++;throw 0}});
 assert.throws(()=>prepareFastAdmission(p));const x=input({generation:'fixture',revision:1});
 Object.defineProperty(x,'builderHash',{enumerable:true,get(){calls++;throw 0}});assert.throws(()=>prepareFastAdmission(x));
 await assert.rejects(readFastRootFeed(db,{nodeId:'games',expectedFeedVersion:{toString(){calls++;return '1'}},afterRootId:null,limit:1}));
 assert.equal(calls,0);await assert.rejects(initializeFastAdmissionPrototype({dialect:'pg'}));
});

// One disposable in-memory engine, sequential subtests: no native DB, disk dataDir,
// network, model, provider, crawler or process/service action.
test('real canonical bridge prototype (in-memory only)',{timeout:90000},async t=>{
 const db=await createPGliteDatabase();t.after(()=>db.close());const f=await seedCanonicalV4RuntimeFixture(db);
 const oldSources=(await db.query('SELECT * FROM canonical_v4.sources ORDER BY id')).rows;
 const oldPosts=(await db.query('SELECT * FROM canonical_v4.contributions ORDER BY id')).rows;
 await initializeFastAdmissionPrototype(db);
 await t.test('direct SQL rejects null artifact or root-node publication without a durable artifact',async()=>{
  const {nodes,...identity}=artifact();
  for(const args of [[JSON.stringify(identity),null],[null,JSON.stringify(nodes)]]){
   await assert.rejects(db.query('SELECT hierarchy_fast_admission_v1.publish($1::jsonb,$2::jsonb)',args),e=>e.code==='P2101');
   assert.equal(await count(db,'artifact'),0);assert.equal(await count(db,'nodes'),0);
  }
 });
 await publishFastAdmissionArtifact(db,artifact());
 // Any accidental exact matcher call makes this entire suite fail.
 await db.exec(`CREATE OR REPLACE FUNCTION canonical_v4.ingest_ridge_scan(candidate double precision[],p_parameter_sha256 text)
 RETURNS TABLE(topic_id text,similarity double precision) LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Forbidden synthetic Ridge call'; END $$`);
 let receipt;
 await t.test('new canonical Source/FKs/container/typed receipt commit without Ridge or catalog lane',async()=>{
  receipt=await admitFastNewSource(db,input(f));assert.equal(receipt.schema,'source-local-ingestion-receipt/v1');assert.equal(receipt.sourceVersion,'1');
  assert.equal(receipt.policyVersion,'source-local-canonical-container/v1');assert.equal(receipt.semanticNodeId,'games');
  const row=(await db.query(`SELECT s.policy_version,s.write_version,e.dimensions,encode(array_send(e.values_double),'hex') AS wire,
   i.body_wire_hash,i.title_wire_hash,hierarchy_fast_admission_v1.wire_hash(i.title_values) AS actual_title,
   r.values_double AS ridge FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
   JOIN hierarchy_fast_admission_v1.inputs i ON i.source_id=s.id JOIN canonical_v4.fixed_references r ON r.topic_id=$2 WHERE s.id=$1`,[receipt.sourceId,receipt.topicId])).rows[0];
  assert.equal(row.dimensions,384);assert.equal(row.body_wire_hash,sha(Buffer.from(row.wire,'hex')));assert.equal(row.body_wire_hash,pairedVectorWire(unit()).wireHash);
  assert.equal(row.title_wire_hash,row.actual_title);assert.equal(row.ridge,null);
  assert.equal((await db.query('SELECT active_operation_id FROM canonical_v4.catalog_ingest_lane')).rows[0].active_operation_id,null);
  const foreign=(await db.query(`SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE contype='f' AND connamespace='hierarchy_fast_admission_v1'::regnamespace`)).rows.map(r=>r.target);
  for(const target of ['canonical_v4.sources','canonical_v4.contributions','canonical_v4.topics','canonical_v4.discussions'])assert.ok(foreign.includes(target));
  assert.deepEqual(await admitFastNewSource(db,input(f)),receipt);
  // IDs/timestamp/node are proposed allocation/initial-decision arguments, not
  // operation material. Replay returns the ORIGINAL receipt; never new IDs/node.
  assert.deepEqual(await admitFastNewSource(db,{...input(f),sourceId:'unused-source-allocation',topicId:'unused-topic-allocation',
   discussionId:'unused-discussion-allocation',createdAt:'2026-10-20T13:00:00.000Z',nodeId:'nature'}),receipt);
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.id_registry WHERE id LIKE 'unused-%-allocation'")).rows[0].n,0);
  await assert.rejects(admitFastNewSource(db,{...input(f),title:'Different operation material'}),e=>e.code==='P2102');
 });
 await t.test('stale generation/absence, existing legacy Source, artifact mismatch and occupied IDs roll back all rows',async()=>{
  const before=await count(db,'inputs');
  for(const change of [x=>x.expected.generation='other',x=>x.expected.revision=0,x=>x.url='https://example.org/canonical-v4-runtime/a',x=>x.builderHash=hash(9),x=>x.sourceId=f.sourceA]){
   const x=input(f,'rejected');change(x);await assert.rejects(admitFastNewSource(db,x));assert.equal(await count(db,'inputs'),before);
  }
  const x=input(f,'bad-wire'),p=prepareFastAdmission(x),args=[...p.parameters];args[9]=pairedVectorWire([0,1,...Array(382).fill(0)]).sqlArray;
  await assert.rejects(db.query('SELECT hierarchy_fast_admission_v1.admit_new('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args),e=>e.code==='P2101');
  assert.equal(await count(db,'inputs'),before);
 });
 await t.test('old queued URL prevents a parallel fast admission; old enqueue rejects a new-policy Source',async()=>{
  const legacy=createCanonicalV4IngestionRepository({database:db});
  const queued=input(f,'queued');
  await legacy.enqueueInteractive({expected:queued.expected,operationId:'legacy-before-fast',url:queued.url,title:'Queued fixture',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},extractorVersion:'main-text-prefix/v1'}, {authorityToken:'fixture-authority',authoritySeconds:30});
  await assert.rejects(admitFastNewSource(db,queued),e=>e.code==='P2102');
  await assert.rejects(legacy.enqueueInteractive({expected:{generation:f.generation,revision:receipt.version.revision},operationId:'legacy-local-bypass',url:input(f).url,title:'Changed old route',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},extractorVersion:'main-text-prefix/v1'}, {authorityToken:'fixture-authority',authoritySeconds:30}));
  await assert.rejects(db.query('UPDATE canonical_v4.sources SET title=$1 WHERE id=$2',['legacy mutation',receipt.sourceId]),e=>e.code==='P2103');
 });
 await t.test('legacy operation identity remains reserved across different URLs and terminal no-receipt jobs',async()=>{
  const legacy=createCanonicalV4IngestionRepository({database:db}),desired=input(f,'legacy-owned-operation'),before=await count(db,'inputs');
  const queued=await legacy.enqueueInteractive({expected:desired.expected,operationId:desired.operationId,
   url:'https://example.org/legacy-different-url',title:'Legacy operation owner',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},
   extractorVersion:'main-text-prefix/v1'},{authorityToken:'synthetic-shared-operation-authority',authoritySeconds:30});
  assert.equal(queued.state,'pending');
  await assert.rejects(admitFastNewSource(db,desired),e=>e.code==='P2102');
  assert.equal(await legacy.revokeAuthority({operationId:queued.operationId,operationDigest:queued.operationDigest,authorityToken:queued.authorityToken}),true);
  const terminal=(await db.query('SELECT state,request_material FROM canonical_v4.ingestion_jobs WHERE operation_id=$1',[desired.operationId])).rows[0];
  assert.equal(terminal.state,'cancelled');assert.equal(terminal.request_material,null);
  assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.operation_receipts WHERE operation_id=$1',[desired.operationId])).rows[0].n,0);
  await assert.rejects(admitFastNewSource(db,desired),e=>e.code==='P2102');
  assert.equal(await count(db,'inputs'),before);
 });
 await t.test('root insert and immutable semantic snapshot are one canonical transaction',async()=>{
  const r=root(f,receipt),out=await createFastRoot(db,r);assert.equal(out.result.contributionId,r.rootId);
  // This is the SAME signed-zero body admitted above, through actual canonical
  // root creation/mirror checks, not merely the independent JS serializer.
  const admittedWire=(await db.query("SELECT encode(array_send(values_double),'hex') AS wire FROM canonical_v4.embeddings WHERE source_id=$1",[receipt.sourceId])).rows[0].wire;
  assert.equal(Object.is(Buffer.from(admittedWire,'hex').readDoubleBE(36),-0),true);
  assert.equal(sha(Buffer.from(admittedWire,'hex')),pairedVectorWire(input(f).bodyVector).wireHash);
  const snapshot=(await db.query('SELECT * FROM hierarchy_fast_admission_v1.root_snapshots WHERE root_id=$1',[r.rootId])).rows[0];
  assert.equal(snapshot.source_id,receipt.sourceId);assert.equal(snapshot.discussion_id,receipt.discussionId);assert.equal(snapshot.witness_hash,receipt.witnessHash);
  assert.deepEqual((await feed(db)).rootRefs,[{rootId:r.rootId,topicId:receipt.topicId,discussionId:receipt.discussionId}]);
  assert.deepEqual(await createFastRoot(db,{...r,rootId:'unused-replay-id'}),out);assert.equal(await count(db,'root_intents'),0);
  await assert.rejects(createFastRoot(db,{...root(f,receipt,'stale'),witnessHash:hash(8)}),e=>e.code==='P2102');
  await assert.rejects(createFastRoot(db,{...root(f,receipt,'wrong-dest'),topicId:f.topicA}),e=>e.code==='P2102');
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.contributions WHERE id IN('contribution-fast-stale','contribution-fast-wrong-dest')")).rows[0].n,0);
 });
 await t.test('actual canonical body/title/version joins reject corruption, not caller mirror authority',async()=>{
  const original=input(f).bodyVector;
  await db.query('UPDATE canonical_v4.embeddings SET values_double=$1::double precision[] WHERE source_id=$2',[pairedVectorWire([1,...Array(383).fill(0)]).sqlArray,receipt.sourceId]);
  await assert.rejects(createFastRoot(db,root(f,receipt,'changed-body')),e=>e.code==='P2102');
  await db.query('UPDATE canonical_v4.embeddings SET values_double=$1::double precision[] WHERE source_id=$2',[pairedVectorWire(original).sqlArray,receipt.sourceId]);
  // Owner-only fault injection occurs exclusively inside this disposable engine;
  // each failure rolls back the corruption AND the temporary trigger disable.
  for(const [column,value] of [['title','Changed title'],['write_version',2],['extractor_version','crawler-static-html-prefix/v1']]){
   await assert.rejects(db.transaction(async tx=>{
    await tx.exec('ALTER TABLE canonical_v4.sources DISABLE TRIGGER fast_no_source_rewrite');
    await tx.query('UPDATE canonical_v4.sources SET '+column+'=$1 WHERE id=$2',[value,receipt.sourceId]);
    await createFastRoot(tx,root(f,receipt,'stale-'+column));
   }),e=>e.code==='P2102');
  }
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec('ALTER TABLE hierarchy_fast_admission_v1.inputs DISABLE TRIGGER fast_input_immutable');
   await tx.query('UPDATE hierarchy_fast_admission_v1.inputs SET title_values=$1::double precision[] WHERE source_id=$2',[pairedVectorWire([0,1,...Array(382).fill(0)]).sqlArray,receipt.sourceId]);
   await createFastRoot(tx,root(f,receipt,'changed-title-vector'));
  }),e=>e.code==='P2102');
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.contributions WHERE id='contribution-fast-changed-body'")).rows[0].n,0);
 });
 await t.test('legacy human and generated root insertion bypasses are hard blocked; no orphan receipts',async()=>{
  const runtime=createCanonicalV4RuntimeRepository({database:db});
  await assert.rejects(runtime.command({actorId:f.actorId,requestId:'legacy-root-bypass',expected:{generation:f.generation,revision:receipt.version.revision},command:{type:'create-root',topicId:receipt.topicId,body:'Old command cannot bypass semantic bind.',originSourceId:receipt.sourceId}}));
  await assert.rejects(db.transaction(async tx=>{
   await tx.query("INSERT INTO canonical_v4.id_registry VALUES('contribution-agent-bypass','contributions')");
   await tx.query(`INSERT INTO canonical_v4.contributions(id,discussion_id,root_id,reply_to_id,author_id,operator_id,origin_source_id,anchor_source_id,actor_type,visibility,withdrawn,created_at,revision_count,ordinal,payload,write_version)
    VALUES('contribution-agent-bypass',$1,NULL,NULL,'demo-imported-ai',$2,$3,$3,'agent','local-public',false,'2026-10-20',0,nextval('canonical_v4.contribution_ordinal_sequence'),'{}',1)`,[receipt.discussionId,f.actorId,receipt.sourceId]);
  }),e=>e.code==='P2103');
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.command_receipts WHERE request_id='legacy-root-bypass'")).rows[0].n,0);
 });
 await t.test('reclassification does not move root; owner display/semantic IDs never become destinations',async()=>{
  const old=(await db.query('SELECT * FROM hierarchy_fast_admission_v1.root_snapshots')).rows;
  await reclassifyFastSource(db,{sourceId:receipt.sourceId,witnessHash:receipt.witnessHash,nodeId:'nature'});
  assert.deepEqual((await db.query('SELECT * FROM hierarchy_fast_admission_v1.root_snapshots')).rows,old);assert.equal((await feed(db,'nature')).rootRefs.length,0);
  await assert.rejects(db.query('UPDATE canonical_v4.contributions SET discussion_id=$1 WHERE id=$2',[f.discussionB,'contribution-fast-one']),e=>e.code==='P2103');
  await assert.rejects(db.query("UPDATE hierarchy_fast_admission_v1.root_snapshots SET node_id='nature'"),e=>e.code==='P2103');
 });
 await t.test('Source forget erases all proof/vector links and feed versions, not canonical posts or destinations',async()=>{
  const prior=await feed(db),post=(await db.query("SELECT id,discussion_id,root_id FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0];
  await forgetFastSource(db,{generation:f.generation,sourceId:receipt.sourceId});
  for(const table of ['inputs','decisions','root_snapshots','root_intents','receipts'])assert.equal(await count(db,table),0,table);
  assert.deepEqual((await db.query("SELECT id,discussion_id,root_id FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0],post);
  assert.equal((await db.query('SELECT source_id FROM hierarchy_fast_admission_v1.containers')).rows[0].source_id,null);
  const fresh=await feed(db);assert.equal(fresh.rootRefs.length,0);assert.notEqual(fresh.feedVersion,prior.feedVersion);
  assert.equal((await feed(db,'games',{expectedFeedVersion:prior.feedVersion})).status,'stale-feed');
 });
 await t.test('confirmed canonical Topic deletion also removes derived containers without changing its authority',async()=>{
  const rollback=new Error('Disposable deletion probe rollback');
  await assert.rejects(db.transaction(async tx=>{
   const version=(await tx.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({...f,revision:Number(version.revision)},'delete-probe'));
   await createFastRoot(tx,root(f,fresh,'delete-probe'));const before=await transactionFeed(tx);
   await tx.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[f.generation,fresh.topicId,'DELETE TOPIC AND DISCUSSION']);
   assert.equal(await count(tx,'containers'),1);
   for(const table of ['inputs','decisions','receipts','root_intents','root_snapshots'])assert.equal(await count(tx,table),0,table);
   assert.equal((await tx.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE id=$1',[fresh.sourceId])).rows[0].n,0);
   assert.equal(BigInt((await transactionFeed(tx)).feedVersion),BigInt(before.feedVersion)+1n);
   assert.equal((await transactionFeed(tx,'games',{expectedFeedVersion:before.feedVersion})).status,'stale-feed');
   // The previously forgotten orphan container also follows its canonical delete.
   await tx.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[f.generation,receipt.topicId,'DELETE TOPIC AND DISCUSSION']);
   assert.equal(await count(tx,'containers'),0);
   assert.equal((await tx.query('SELECT count(*) AS n FROM canonical_v4.topics WHERE id=$1',[receipt.topicId])).rows[0].n,0);
   throw rollback;
  }),e=>e===rollback);
  assert.equal(await count(db,'containers'),1);
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0].n,1);
 });
 await t.test('confirmed canonical clear can erase live proofs/posts and all derived containers; probe rolls back',async()=>{
  const rollback=new Error('Disposable clear probe rollback');
  await assert.rejects(db.transaction(async tx=>{
   const version=(await tx.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({...f,revision:Number(version.revision)},'clear-probe'));
   const posted=root(f,fresh,'clear-probe');await createFastRoot(tx,posted);const before=await transactionFeed(tx);
   await tx.query('SELECT canonical_v4.ingest_clear_learned_data($1,$2)',[f.generation,'CLEAR LEARNED DATA']);
   for(const table of ['containers','inputs','decisions','receipts','root_intents','root_snapshots'])assert.equal(await count(tx,table),0,table);
   assert.equal((await tx.query("SELECT count(*) AS n FROM canonical_v4.sources WHERE policy_version='source-local-canonical-container/v1'")).rows[0].n,0);
   assert.equal(BigInt((await transactionFeed(tx)).feedVersion),BigInt(before.feedVersion)+1n);
   assert.equal((await transactionFeed(tx,'games',{expectedFeedVersion:before.feedVersion})).status,'stale-feed');
   assert.equal((await tx.query('SELECT count(*) AS n FROM canonical_v4.contributions WHERE id=$1',[posted.rootId])).rows[0].n,0);
   throw rollback;
  }),e=>e===rollback);
  assert.equal(await count(db,'containers'),1);
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.sources WHERE id='source-fast-clear-probe'")).rows[0].n,0);
 });
 await t.test('least privilege fixed search paths and legacy preservation are explicit',async()=>{
  await db.exec('CREATE ROLE fast_prototype_untrusted');
  const rows=(await db.query(`SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('fast_prototype_untrusted',p.oid,'EXECUTE') AS allowed
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1`,[NS])).rows;
  assert.ok(rows.length>5);for(const r of rows){assert.equal(r.allowed,false);assert.deepEqual(r.proconfig,['search_path=pg_catalog']);}
  for(const table of ['inputs','decisions','containers','root_intents','root_snapshots','receipts'])assert.equal((await db.query("SELECT has_table_privilege('fast_prototype_untrusted',$1,'INSERT,UPDATE,DELETE') AS allowed",[NS+'.'+table])).rows[0].allowed,false);
  assert.deepEqual((await db.query('SELECT * FROM canonical_v4.sources WHERE id=ANY($1::text[]) ORDER BY id',[oldSources.map(s=>s.id)])).rows,oldSources);
  assert.deepEqual((await db.query('SELECT * FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[oldPosts.map(s=>s.id)])).rows,oldPosts);
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  assert.equal(sql.includes('ingest_ridge_scan'),false);assert.equal(sql.includes('catalog_ingest_lane'),false);
  assert.ok(sql.includes('pg_advisory_xact_lock(914092008,1)'));
  assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.schema_migrations')).rows[0].n,9);
 });
});
