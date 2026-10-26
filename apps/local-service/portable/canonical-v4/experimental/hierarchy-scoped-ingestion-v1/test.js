import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { seedCanonicalV4RuntimeFixture } from '../../../test/canonical-v4-runtime-fixture.js';
import { createCanonicalV4RuntimeRepository } from '../../runtime-repository.js';
import { createCanonicalV4IngestionRepository } from '../../ingestion-repository.js';
import { BROWSER_MODEL_ID } from '../../../../src/domain/learned-sources.js';
import { createInputVersionFixtureDatabase,updateFastSource,initializeFastAdmissionPrototype,publishFastAdmissionArtifact,prepareFastAdmission,admitFastNewSource,
 createFastRoot,reclassifyFastSource,forgetFastSource,readFastRootFeed,pairedVectorWire,enqueueScoped,claimScoped,completeScoped,heartbeatScoped,revokeScoped,cleanupScoped,listScoped,enqueueObservation,cleanupFinalizations } from './repository.js';

const hash=n=>String(n).repeat(64),sha=v=>createHash('sha256').update(v).digest('hex');
const unit=()=>[1,-0,...Array(382).fill(0)],NS='hierarchy_scoped_ingestion_v1';
const artifact=()=>({builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),modelHash:hash(4),policyHash:hash(5),modelId:BROWSER_MODEL_ID,nodes:['games','nature']});
function input(f,suffix='one'){
 return {expected:{generation:f.generation,revision:f.revision},operationId:'fast-operation-'+suffix,sourceId:'source-fast-'+suffix,
 topicId:'topic-fast-'+suffix,discussionId:'discussion-fast-'+suffix,createdAt:'2026-10-20T12:00:00.000Z',url:'https://example.org/fast/'+suffix,
 title:'Invented bounded public fixture '+suffix,extractorVersion:'main-text-prefix/v1',modelId:BROWSER_MODEL_ID,bodyHash:hash(6),
 builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),documentHash:hash(7),bodyVector:unit(),titleVector:unit(),nodeId:'games'};
}
function root(f,r,suffix='one'){return {actorId:f.actorId,requestId:'root-request-'+suffix,generation:f.generation,topicId:r.topicId,
 body:'Synthetic human discussion root.',sourceId:r.sourceId,rootId:'contribution-fast-'+suffix,createdAt:'2026-10-20T12:01:00.000Z',witnessHash:r.witnessHash,decisionHash:r.decisionHash};}
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
 const db=await createInputVersionFixtureDatabase();t.after(()=>db.close());
 await db.exec('CREATE ROLE murmingle_app; CREATE ROLE murmingle_crawler_submitter; CREATE ROLE murmingle_ingest_worker');
 const f=await seedCanonicalV4RuntimeFixture(db);
 const oldSources=(await db.query('SELECT * FROM canonical_v4.sources ORDER BY id')).rows;
 const oldPosts=(await db.query('SELECT * FROM canonical_v4.contributions ORDER BY id')).rows;
 const canonicalGrants=async()=> (await db.query(`SELECT p.oid::text AS oid,r.rolname,has_function_privilege(r.rolname,p.oid,'EXECUTE') AS allowed
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r WHERE n.nspname='canonical_v4'
  AND r.rolname IN('murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker') ORDER BY p.oid,r.rolname`)).rows;
 const oldCanonicalGrants=await canonicalGrants();
 await initializeFastAdmissionPrototype(db);
 await t.test('direct SQL rejects null artifact or root-node publication without a durable artifact',async()=>{
  const {nodes,...identity}=artifact();
  for(const args of [[JSON.stringify(identity),null],[null,JSON.stringify(nodes)]]){
   await assert.rejects(db.query('SELECT hierarchy_scoped_ingestion_v1.publish($1::jsonb,$2::jsonb)',args),e=>['P2101','P2301'].includes(e.code));
   assert.equal(await count(db,'artifact'),0);assert.equal(await count(db,'nodes'),0);
  }
 });
 await publishFastAdmissionArtifact(db,artifact());
 // Any accidental exact matcher call makes this entire suite fail.
 await db.exec(`CREATE OR REPLACE FUNCTION canonical_v4.ingest_ridge_scan(candidate double precision[],p_parameter_sha256 text)
 RETURNS TABLE(topic_id text,similarity double precision) LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Forbidden synthetic Ridge call'; END $$`);
 let receipt;
 await t.test('new canonical Source/FKs/container/typed receipt commit without Ridge or catalog lane',async()=>{
  receipt=await admitFastNewSource(db,input(f));assert.equal(receipt.schema,'source-local-scoped-receipt/v1');assert.equal(receipt.sourceVersion,'1');
  assert.equal(receipt.policyVersion,'source-local-scoped-container/v1');assert.equal(receipt.semanticNodeId,'games');
  const row=(await db.query(`SELECT s.policy_version,s.write_version,e.dimensions,encode(array_send(e.values_double),'hex') AS wire,
   i.body_wire_hash,i.title_wire_hash,hierarchy_scoped_ingestion_v1.wire_hash(i.title_values) AS actual_title,
   r.values_double AS ridge FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
   JOIN hierarchy_scoped_ingestion_v1.inputs i ON i.source_id=s.id LEFT JOIN canonical_v4.fixed_references r ON r.topic_id=$2 WHERE s.id=$1`,[receipt.sourceId,receipt.topicId])).rows[0];
  assert.equal(row.dimensions,384);assert.equal(row.body_wire_hash,sha(Buffer.from(row.wire,'hex')));assert.equal(row.body_wire_hash,pairedVectorWire(unit()).wireHash);
  assert.equal(row.title_wire_hash,row.actual_title);assert.equal(row.ridge,null);
  assert.equal((await db.query('SELECT active_operation_id FROM canonical_v4.catalog_ingest_lane')).rows[0].active_operation_id,null);
  assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.fixed_references WHERE topic_id=$1',[receipt.topicId])).rows[0].n,0);
  const foreign=(await db.query(`SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE contype='f' AND connamespace='hierarchy_scoped_ingestion_v1'::regnamespace`)).rows.map(r=>r.target);
  for(const target of ['canonical_v4.sources','canonical_v4.contributions','canonical_v4.topics','canonical_v4.discussions'])assert.ok(foreign.includes(target));
  assert.deepEqual(await admitFastNewSource(db,input(f)),receipt);
  // IDs/time are server allocation, while semantic node is external command
  // material. Allocation changes replay the original; changed node conflicts.
  assert.deepEqual(await admitFastNewSource(db,{...input(f),sourceId:'unused-source-allocation',topicId:'unused-topic-allocation',discussionId:'unused-discussion-allocation',createdAt:'2026-10-20T13:00:00.000Z'}),receipt);
  await assert.rejects(admitFastNewSource(db,{...input(f),sourceId:'unused-source-allocation',topicId:'unused-topic-allocation',discussionId:'unused-discussion-allocation',createdAt:'2026-10-20T13:00:00.000Z',nodeId:'nature'}));
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.id_registry WHERE id LIKE 'unused-%-allocation'")).rows[0].n,0);
  await assert.rejects(admitFastNewSource(db,{...input(f),title:'Different operation material'}),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
 });
 await t.test('stale generation/absence, existing legacy Source, artifact mismatch and occupied IDs roll back all rows',async()=>{
  const before=await count(db,'inputs');
  for(const change of [x=>x.expected.generation='other',x=>x.expected.revision=0,x=>x.url='https://example.org/canonical-v4-runtime/a',x=>x.builderHash=hash(9),x=>x.sourceId=f.sourceA]){
   const x=input(f,'rejected');change(x);await assert.rejects(admitFastNewSource(db,x));assert.equal(await count(db,'inputs'),before);
  }
  const x=input(f,'bad-wire'),p=prepareFastAdmission(x),args=[...p.parameters];args[9]=pairedVectorWire([0,1,...Array(382).fill(0)]).sqlArray;
  await assert.rejects(db.query('SELECT hierarchy_scoped_ingestion_v1.admit_new('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args),e=>['P2101','P2301'].includes(e.code));
  assert.equal(await count(db,'inputs'),before);
 });
 await t.test('old queued URL prevents a parallel fast admission; old enqueue rejects a new-policy Source',async()=>{
  const legacy=createCanonicalV4IngestionRepository({database:db});
  const queued=input(f,'queued');
  await legacy.enqueueInteractive({expected:queued.expected,operationId:'legacy-before-fast',url:queued.url,title:'Queued fixture',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},extractorVersion:'main-text-prefix/v1'}, {authorityToken:'fixture-authority',authoritySeconds:30});
  await assert.rejects(admitFastNewSource(db,queued),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  await assert.rejects(legacy.enqueueInteractive({expected:{generation:f.generation,revision:receipt.version.revision},operationId:'legacy-local-bypass',url:input(f).url,title:'Changed old route',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},extractorVersion:'main-text-prefix/v1'}, {authorityToken:'fixture-authority',authoritySeconds:30}));
  await assert.rejects(db.query('UPDATE canonical_v4.sources SET title=$1 WHERE id=$2',['legacy mutation',receipt.sourceId]),e=>e.code==='P2103');
 });
 await t.test('legacy operation identity remains reserved across different URLs and terminal no-receipt jobs',async()=>{
  const legacy=createCanonicalV4IngestionRepository({database:db}),desired=input(f,'legacy-owned-operation'),before=await count(db,'inputs');
  const queued=await legacy.enqueueInteractive({expected:desired.expected,operationId:desired.operationId,
   url:'https://example.org/legacy-different-url',title:'Legacy operation owner',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},
   extractorVersion:'main-text-prefix/v1'},{authorityToken:'synthetic-shared-operation-authority',authoritySeconds:30});
  assert.equal(queued.state,'pending');
  await assert.rejects(admitFastNewSource(db,desired),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  assert.equal(await legacy.revokeAuthority({operationId:queued.operationId,operationDigest:queued.operationDigest,authorityToken:queued.authorityToken}),true);
  const terminal=(await db.query('SELECT state,request_material FROM canonical_v4.ingestion_jobs WHERE operation_id=$1',[desired.operationId])).rows[0];
  assert.equal(terminal.state,'cancelled');assert.equal(terminal.request_material,null);
  assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.operation_receipts WHERE operation_id=$1',[desired.operationId])).rows[0].n,0);
  await assert.rejects(admitFastNewSource(db,desired),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  assert.equal(await count(db,'inputs'),before);
 });
 await t.test('root insert and immutable semantic snapshot are one canonical transaction',async()=>{
  const r=root(f,receipt),out=await createFastRoot(db,r);assert.equal(out.result.contributionId,r.rootId);
  // This is the SAME signed-zero body admitted above, through actual canonical
  // root creation/mirror checks, not merely the independent JS serializer.
  const admittedWire=(await db.query("SELECT encode(array_send(values_double),'hex') AS wire FROM canonical_v4.embeddings WHERE source_id=$1",[receipt.sourceId])).rows[0].wire;
  assert.equal(Object.is(Buffer.from(admittedWire,'hex').readDoubleBE(36),-0),true);
  assert.equal(sha(Buffer.from(admittedWire,'hex')),pairedVectorWire(input(f).bodyVector).wireHash);
  const snapshot=(await db.query('SELECT * FROM hierarchy_scoped_ingestion_v1.root_snapshots WHERE root_id=$1',[r.rootId])).rows[0];
  assert.equal(snapshot.source_id,receipt.sourceId);assert.equal(snapshot.discussion_id,receipt.discussionId);assert.equal(snapshot.witness_hash,receipt.witnessHash);
  assert.deepEqual((await feed(db)).rootRefs,[{rootId:r.rootId,topicId:receipt.topicId,discussionId:receipt.discussionId}]);
  assert.deepEqual(await createFastRoot(db,{...r,rootId:'unused-replay-id'}),out);assert.equal(await count(db,'root_intents'),0);
  await assert.rejects(createFastRoot(db,{...root(f,receipt,'stale'),witnessHash:hash(8)}),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  await assert.rejects(createFastRoot(db,{...root(f,receipt,'wrong-dest'),topicId:f.topicA}),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.contributions WHERE id IN('contribution-fast-stale','contribution-fast-wrong-dest')")).rows[0].n,0);
 });
 await t.test('actual canonical body/title/version joins reject corruption, not caller mirror authority',async()=>{
  const original=input(f).bodyVector;
  await db.query('UPDATE canonical_v4.embeddings SET values_double=$1::double precision[] WHERE source_id=$2',[pairedVectorWire([1,...Array(383).fill(0)]).sqlArray,receipt.sourceId]);
  await assert.rejects(createFastRoot(db,root(f,receipt,'changed-body')),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  await db.query('UPDATE canonical_v4.embeddings SET values_double=$1::double precision[] WHERE source_id=$2',[pairedVectorWire(original).sqlArray,receipt.sourceId]);
  // Owner-only fault injection occurs exclusively inside this disposable engine;
  // each failure rolls back the corruption AND the temporary trigger disable.
  for(const [column,value] of [['title','Changed title'],['write_version',2],['extractor_version','crawler-static-html-prefix/v1']]){
   await assert.rejects(db.transaction(async tx=>{
    await tx.exec('ALTER TABLE canonical_v4.sources DISABLE TRIGGER fast_no_source_rewrite');
    await tx.query('UPDATE canonical_v4.sources SET '+column+'=$1 WHERE id=$2',[value,receipt.sourceId]);
    await createFastRoot(tx,root(f,receipt,'stale-'+column));
   }),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  }
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec('ALTER TABLE hierarchy_scoped_ingestion_v1.input_versions DISABLE TRIGGER fast_input_immutable');
   await tx.query('UPDATE hierarchy_scoped_ingestion_v1.input_versions SET title_values=$1::double precision[] WHERE source_id=$2',[pairedVectorWire([0,1,...Array(382).fill(0)]).sqlArray,receipt.sourceId]);
   await createFastRoot(tx,root(f,receipt,'changed-title-vector'));
  }),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
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
  const old=(await db.query('SELECT * FROM hierarchy_scoped_ingestion_v1.root_snapshots')).rows;
  const stale=receipt;
  receipt={...receipt,...await reclassifyFastSource(db,{sourceId:receipt.sourceId,witnessHash:receipt.witnessHash,decisionHash:receipt.decisionHash,nodeId:'nature'})};
  await assert.rejects(createFastRoot(db,root(f,stale,'stale-decision')));
  assert.equal(await count(db,'decisions'),2);
  assert.deepEqual((await db.query('SELECT * FROM hierarchy_scoped_ingestion_v1.root_snapshots')).rows,old);assert.equal((await feed(db,'nature')).rootRefs.length,0);
  await assert.rejects(db.query('UPDATE canonical_v4.contributions SET discussion_id=$1 WHERE id=$2',[f.discussionB,'contribution-fast-one']),e=>e.code==='P2103');
  await assert.rejects(db.query("UPDATE hierarchy_scoped_ingestion_v1.root_snapshots SET node_id='nature'"),e=>e.code==='P2103');
 });

 await t.test('serialized addressed reclassification rejects a stale prior decision without replacing evidence',async()=>{
  const original=(await db.query('SELECT receipt FROM '+NS+'.receipts WHERE source_id=$1',[receipt.sourceId])).rows[0].receipt;
  const before=(await db.query('SELECT * FROM '+NS+'.current_inputs WHERE source_id=$1',[receipt.sourceId])).rows;
  const decisions=await count(db,'decisions');
  await assert.rejects(reclassifyFastSource(db,{sourceId:receipt.sourceId,witnessHash:original.witnessHash,decisionHash:original.decisionHash,nodeId:'games'}),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
  assert.deepEqual((await db.query('SELECT * FROM '+NS+'.current_inputs WHERE source_id=$1',[receipt.sourceId])).rows,before);
  assert.equal(await count(db,'decisions'),decisions);
 });
 await t.test('A to B to C whole update replay never rewinds; exact renewal and canonical anchor/read/reply',async()=>{
  const before=(await db.query("SELECT * FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0];
  const binding=(await db.query("SELECT * FROM "+NS+".root_snapshots WHERE root_id='contribution-fast-one'")).rows[0];
  const a=receipt, changed={...input(f),operationId:'update-B',title:'Title B'};
  const prior=r=>({sourceVersion:r.sourceVersion,witnessHash:r.witnessHash,decisionHash:r.decisionHash});
  const bCommand={admission:changed,prior:prior(a)},b=await updateFastSource(db,bCommand);
  assert.equal(b.sourceVersion,'2');assert.notEqual(b.witnessHash,a.witnessHash);
  // Title-only has same canonical sourceStamp but an independently new input.
  assert.equal((await db.query("SELECT count(DISTINCT source_stamp) AS n FROM "+NS+".input_versions")).rows[0].n,1);
  await assert.rejects(createFastRoot(db,root(f,a,'stale-A')));
  await createFastRoot(db,root(f,b,'B'));
  const cCommand={admission:{...changed,operationId:'update-C',bodyHash:hash(8),bodyVector:[0,1,...Array(382).fill(0)]},prior:prior(b)};
  const c=await updateFastSource(db,cCommand);
  assert.equal(c.sourceVersion,'3');
  assert.deepEqual(await updateFastSource(db,bCommand),b);
  await assert.rejects(updateFastSource(db,{...bCommand,admission:{...changed,title:'Changed same operation'}}));
  assert.equal((await db.query('SELECT source_version::text AS v FROM '+NS+'.current_inputs WHERE source_id=$1',[c.sourceId])).rows[0].v,'3');
  await assert.rejects(createFastRoot(db,root(f,b,'replayed-B')));
  const pinned=(await db.query("SELECT * FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0];
  for(const k of ['id','author_id','discussion_id','root_id','created_at'])assert.equal(pinned[k],before[k]);
  assert.equal(JSON.parse(pinned.payload).body,JSON.parse(before.payload).body);
  assert.equal(pinned.anchor_source_id,null);assert.deepEqual(JSON.parse(pinned.payload).anchor,{kind:'topic',topicId:a.topicId});
  assert.equal(Number(pinned.write_version),Number(before.write_version)+1);
  assert.deepEqual((await db.query("SELECT * FROM "+NS+".root_snapshots WHERE root_id='contribution-fast-one'")).rows[0],binding);
  const runtime=createCanonicalV4RuntimeRepository({database:db});
  const version=await runtime.version();
  const reply=await runtime.command({actorId:f.actorId,requestId:'reply-after-update',expected:version,
   command:{type:'reply',discussionId:c.discussionId,rootId:'contribution-fast-one',replyToId:null,body:'Canonical reply after changed page.',originSourceId:c.sourceId}});
  assert.ok(reply.result.contributionId);
  // Actual canonical hydration validates old pinned anchors with new Source mirrors.
  const { createCanonicalV4ReadFacade }=await import('../../read-facade.js');
  const page=await createCanonicalV4ReadFacade({database:db}).discussionPage({topicId:c.topicId,limit:100,cursor:null});
  assert.ok(page.items.some(x=>x.id===reply.result.contributionId));
  const renew=await updateFastSource(db,{admission:{...cCommand.admission,operationId:'renew-C',nodeId:'nature'},prior:prior(c)});
  assert.equal(renew.sourceVersion,'3');assert.equal(renew.decisionHash,c.decisionHash);assert.equal(renew.renewed,true);
  assert.equal(await count(db,'input_versions'),3);
  const dCommand={admission:{...cCommand.admission,operationId:'document-D',documentHash:hash(9)},prior:prior(c)};
  const d=await updateFastSource(db,dCommand);assert.equal(d.sourceVersion,'4');
  for(const k of ['builderHash','encoderHash','representationHash']){
   await assert.rejects(updateFastSource(db,{admission:{...dCommand.admission,operationId:'bad-'+k,[k]:hash(0)},prior:prior(d)}));
  }
  assert.equal(await count(db,'input_versions'),4);
  assert.equal(await count(db,'update_intents'),0);
  // Replayed update operation identity is reserved from new admissions and legacy queue growth.
  await assert.rejects(admitFastNewSource(db,{...input(f,'reserved-update'),operationId:'update-B'}));
  await assert.rejects(createCanonicalV4IngestionRepository({database:db}).enqueueInteractive({expected:{generation:f.generation,revision:d.version.revision},
   operationId:'update-B',url:'https://example.org/reserved-update-operation',title:'Reserved operation',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},
   extractorVersion:'main-text-prefix/v1'},{authorityToken:'synthetic-fixture',authoritySeconds:30}));
  const other=await admitFastNewSource(db,input(f,'cross-source'));
  await assert.rejects(updateFastSource(db,{admission:{...dCommand.admission,operationId:'stale-update'},prior:prior(a)}));
  await assert.rejects(updateFastSource(db,{admission:{...dCommand.admission,operationId:'cross-update'},prior:prior(other)}));
  await assert.rejects(db.query('UPDATE '+NS+'.current_inputs SET decision_hash=$1 WHERE source_id=$2',[other.decisionHash,d.sourceId]));
  const history=(await db.query('SELECT source_version::text AS v,body_wire_hash,title_wire_hash,encode(array_send(body_values),\'hex\') AS body FROM '+NS+'.input_versions WHERE source_id=$1 ORDER BY source_version',[d.sourceId])).rows;
  assert.equal(history[0].body_wire_hash,pairedVectorWire(unit()).wireHash);
  assert.equal(Object.is(Buffer.from(history[0].body,'hex').readDoubleBE(36),-0),true);
  assert.equal(history[2].body_wire_hash,pairedVectorWire(cCommand.admission.bodyVector).wireHash);
  const boom=new Error('injected rollback');
  await assert.rejects(db.transaction(async tx=>{
   await updateFastSource(tx,{admission:{...dCommand.admission,operationId:'rolled-back',title:'Rollback title'},prior:prior(d)});
   throw boom;
  }),e=>e===boom);
  assert.equal(await count(db,'input_versions'),5);
  assert.equal((await db.query('SELECT count(*) AS n FROM '+NS+".operations WHERE operation_id='rolled-back'")).rows[0].n,0);
  await forgetFastSource(db,{generation:f.generation,sourceId:other.sourceId});
  await db.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[f.generation,other.topicId,'DELETE TOPIC AND DISCUSSION']);
  receipt=d;
  // Save the exact old replay for the subsequent forget probe.
  t.oldUpdateReplay=bCommand;
 });
 await t.test('actual canonical root/account withdrawal scrubs historical bindings and advances feeds without erasing page history',async()=>{
  const {createCanonicalV4LifecycleRepository}=await import('../../lifecycle-repository.js');
  const actor={type:'human',demo:false,id:f.actorId,accountId:f.actorId.slice(8),displayName:'FixtureActor'};
  for(const mode of ['root','account']){
   const sentinel=new Error('rollback withdrawal probe');
   await assert.rejects(db.transaction(async tx=>{
    const before=await transactionFeed(tx),history=await count(tx,'input_versions');
    const lifecycle=createCanonicalV4LifecycleRepository({database:tx});
    if(mode==='root'){
     const version=(await tx.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
     await lifecycle.command({generation:version.generation,revision:Number(version.revision)},{type:'withdraw',contributionId:'contribution-fast-one'},actor);
     assert.equal((await tx.query("SELECT count(*) AS n FROM "+NS+".root_snapshots WHERE root_id='contribution-fast-one'")).rows[0].n,0);
    }else{
     await lifecycle.withdrawAccountContributions(f.actorId);
     assert.equal(await count(tx,'root_snapshots'),0);
    }
    assert.equal(await count(tx,'input_versions'),history);
    assert.notEqual((await transactionFeed(tx)).feedVersion,before.feedVersion);
    throw sentinel;
   }),e=>e===sentinel);
  }
 });
 await t.test('Source forget erases all proof/vector links and feed versions, not canonical posts or destinations',async()=>{
  const prior=await feed(db),post=(await db.query("SELECT id,discussion_id,root_id FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0];
  await forgetFastSource(db,{generation:f.generation,sourceId:receipt.sourceId});
  if(t.oldUpdateReplay)await assert.rejects(updateFastSource(db,t.oldUpdateReplay));
  await assert.rejects(admitFastNewSource(db,input(f)));
  await assert.rejects(createFastRoot(db,root(f,receipt,'after-forget')));
  for(const table of ['input_versions','current_inputs','decisions','root_snapshots','root_intents','receipts','operations','update_intents'])assert.equal(await count(db,table),0,table);
  assert.deepEqual((await db.query("SELECT id,discussion_id,root_id FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0],post);
  assert.equal((await db.query('SELECT source_id FROM hierarchy_scoped_ingestion_v1.containers')).rows[0].source_id,null);
  const fresh=await feed(db);assert.equal(fresh.rootRefs.length,0);assert.notEqual(fresh.feedVersion,prior.feedVersion);
  assert.equal((await feed(db,'games',{expectedFeedVersion:prior.feedVersion})).status,'stale-feed');
 });
 await t.test('retirement rejects refreshed-revision/new-ID admission, changed material and all admission/update/renewal operation reuse',async()=>{
  const version=(await db.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
  const current={generation:version.generation,revision:Number(version.revision)};
  const retired=(await db.query('SELECT generation,operation_id,kind FROM '+NS+'.retired_operations ORDER BY operation_id')).rows;
  for(const [id,kind] of [['fast-operation-one','admission'],['update-B','update'],['update-C','update'],['document-D','update'],['renew-C','renewal']]){
   assert.ok(retired.some(x=>x.generation===f.generation&&x.operation_id===id&&x.kind===kind));
   const again={...input(current,'retired-'+id),operationId:id,url:input(f).url};
   for(const title of [input(f).title,'Changed retired material']){
    await assert.rejects(admitFastNewSource(db,{...again,title}),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
   }
   await assert.rejects(updateFastSource(db,{admission:again,prior:{sourceVersion:receipt.sourceVersion,witnessHash:receipt.witnessHash,decisionHash:receipt.decisionHash}}),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
   const legacy=createCanonicalV4IngestionRepository({database:db});
   await assert.rejects(legacy.enqueueInteractive({expected:current,operationId:id,url:'https://example.org/retired-legacy/'+id,
    title:'Unrelated URL cannot revive retired operation',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},extractorVersion:'main-text-prefix/v1'},
    {authorityToken:'synthetic-retirement-probe',authoritySeconds:30}));
  }
  assert.equal(await count(db,'input_versions'),0);
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.id_registry WHERE id LIKE 'source-fast-retired-%'")).rows[0].n,0);
  // A distinct operation represents a deliberate new observation; same URL is allowed.
  const fresh=await admitFastNewSource(db,{...input(current,'new-observation'),url:input(f).url});
  assert.notEqual(fresh.sourceId,receipt.sourceId);
  await forgetFastSource(db,{generation:f.generation,sourceId:fresh.sourceId});
  await db.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[f.generation,fresh.topicId,'DELETE TOPIC AND DISCUSSION']);
  // Terminal scrubbing remains allowed; activation/reactivation is rejected by
  // the retirement trigger before pending-row shape checks.
  const rollback=new Error('terminal probe rollback');
  await assert.rejects(db.transaction(async tx=>{
   await tx.query("UPDATE canonical_v4.ingestion_jobs SET operation_id='renew-C',request_material=NULL,source_url=NULL WHERE operation_id='fast-operation-legacy-owned-operation'");
   // Existing test job has the same retired generation but is already cancelled.
   assert.equal((await tx.query("SELECT state FROM canonical_v4.ingestion_jobs WHERE operation_id='renew-C'")).rows[0].state,'cancelled');
   await assert.rejects(tx.query("UPDATE canonical_v4.ingestion_jobs SET state='pending' WHERE operation_id='renew-C'"),e=>e.code==='P2103');
   throw rollback;
  }),e=>e===rollback);
 });
 await t.test('Source erasure derives retirement generation from immutable inputs and rolls back retirements atomically',async()=>{
  const original=(await db.query('SELECT * FROM '+NS+'.retired_operations ORDER BY generation,operation_id')).rows;
  const rollback=new Error('generation erasure rollback');
  await assert.rejects(db.transaction(async tx=>{
   const v=(await tx.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({generation:v.generation,revision:Number(v.revision)},'stored-generation'));
   await tx.query("UPDATE canonical_v4.runtime_state SET generation='transient-generation' WHERE singleton");
   await tx.exec('SAVEPOINT stale_generation_probe');
   await assert.rejects(admitFastNewSource(tx,input({generation:f.generation,revision:Number(v.revision)},'stale-generation')),e=>['P2102','P2302','P1003','P1004'].includes(e.code));
   await tx.exec('ROLLBACK TO SAVEPOINT stale_generation_probe');
   await forgetFastSource(tx,{generation:'transient-generation',sourceId:fresh.sourceId});
   const tomb=(await tx.query('SELECT generation,kind FROM '+NS+'.retired_operations WHERE operation_id=$1',['fast-operation-stored-generation'])).rows;
   assert.deepEqual(tomb,[{generation:f.generation,kind:'admission'}]);
   throw rollback;
  }),e=>e===rollback);
  assert.deepEqual((await db.query('SELECT * FROM '+NS+'.retired_operations ORDER BY generation,operation_id')).rows,original);
  assert.equal((await db.query("SELECT generation FROM canonical_v4.runtime_state WHERE singleton")).rows[0].generation,f.generation);
 });
 await t.test('retirement retains only immutable generation/operation/kind and has no Source or material foreign keys',async()=>{
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='retired_operations' ORDER BY ordinal_position",[NS])).rows.map(x=>x.column_name);
  assert.deepEqual(columns,['generation','operation_id','kind']);
  const constraints=(await db.query("SELECT contype FROM pg_constraint WHERE conrelid=$1::regclass",[NS+'.retired_operations'])).rows.map(x=>x.contype);
  assert.ok(constraints.includes('p'));assert.equal(constraints.includes('f'),false);
  for(const row of (await db.query('SELECT * FROM '+NS+'.retired_operations')).rows){
   assert.deepEqual(Object.keys(row).sort(),['generation','kind','operation_id']);
   assert.ok(['admission','update','renewal'].includes(row.kind));
  }
  await assert.rejects(db.query("UPDATE "+NS+".retired_operations SET kind='update'"),e=>e.code==='P2103');
  await assert.rejects(db.query('DELETE FROM '+NS+'.retired_operations'),e=>e.code==='P2103');
 });
 await t.test('confirmed canonical Topic deletion also removes derived containers without changing its authority',async()=>{
  const retiredBefore=await count(db,'retired_operations');
  const rollback=new Error('Disposable deletion probe rollback');
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('SELECT '+NS+'.enter_gate(true)');
   const version=(await tx.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({...f,revision:Number(version.revision)},'delete-probe'));
   await createFastRoot(tx,root(f,fresh,'delete-probe'));const before=await transactionFeed(tx);
   await tx.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[f.generation,fresh.topicId,'DELETE TOPIC AND DISCUSSION']);
   for(const table of ['jobs','authorities','final_intents'])assert.equal((await tx.query('SELECT count(*) AS n FROM '+NS+'.'+table+' WHERE operation_id=$1',['fast-operation-delete-probe'])).rows[0].n,0);
   assert.equal((await tx.query('SELECT kind FROM '+NS+'.retired_operations WHERE generation=$1 AND operation_id=$2',[f.generation,'fast-operation-delete-probe'])).rows[0].kind,'admission');
   assert.equal(await count(tx,'containers'),1);
   for(const table of ['input_versions','current_inputs','decisions','receipts','root_intents','root_snapshots','operations','update_intents'])assert.equal(await count(tx,table),0,table);
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
  assert.equal(await count(db,'retired_operations'),retiredBefore);
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.contributions WHERE id='contribution-fast-one'")).rows[0].n,1);
 });
 await t.test('confirmed canonical clear can erase live proofs/posts and all derived containers; probe rolls back',async()=>{
  const retiredBefore=await count(db,'retired_operations');
  const rollback=new Error('Disposable clear probe rollback');
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('SELECT '+NS+'.enter_gate(true)');
   const version=(await tx.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({...f,revision:Number(version.revision)},'clear-probe'));
   const posted=root(f,fresh,'clear-probe');await createFastRoot(tx,posted);const before=await transactionFeed(tx);
   await tx.query('SELECT canonical_v4.ingest_clear_learned_data($1,$2)',[f.generation,'CLEAR LEARNED DATA']);
   assert.equal(await count(tx,'retired_operations'),retiredBefore+1);
   assert.equal((await tx.query('SELECT kind FROM '+NS+'.retired_operations WHERE generation=$1 AND operation_id=$2',[f.generation,'fast-operation-clear-probe'])).rows[0].kind,'admission');
   for(const table of ['containers','input_versions','current_inputs','decisions','receipts','root_intents','root_snapshots','operations','update_intents'])assert.equal(await count(tx,table),0,table);
   assert.equal((await tx.query("SELECT count(*) AS n FROM canonical_v4.sources WHERE policy_version='source-local-scoped-container/v1'")).rows[0].n,0);
   assert.equal(BigInt((await transactionFeed(tx)).feedVersion),BigInt(before.feedVersion)+1n);
   assert.equal((await transactionFeed(tx,'games',{expectedFeedVersion:before.feedVersion})).status,'stale-feed');
   assert.equal((await tx.query('SELECT count(*) AS n FROM canonical_v4.contributions WHERE id=$1',[posted.rootId])).rows[0].n,0);
   throw rollback;
  }),e=>e===rollback);
  assert.equal(await count(db,'containers'),1);
  assert.equal(await count(db,'retired_operations'),retiredBefore);
  assert.equal((await db.query("SELECT count(*) AS n FROM canonical_v4.sources WHERE id='source-fast-clear-probe'")).rows[0].n,0);
 });
 await t.test('least privilege fixed search paths and legacy preservation are explicit',async()=>{
  await db.exec('CREATE ROLE fast_prototype_untrusted');
  const rows=(await db.query(`SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('fast_prototype_untrusted',p.oid,'EXECUTE') AS allowed
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1`,[NS])).rows;
  assert.ok(rows.length>5);for(const r of rows){assert.equal(r.allowed,false);assert.deepEqual(r.proconfig,['search_path=pg_catalog']);}
  for(const table of ['input_versions','current_inputs','decisions','containers','root_intents','root_snapshots','receipts','operations','update_intents','retired_operations'])assert.equal((await db.query("SELECT has_table_privilege('fast_prototype_untrusted',$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[NS+'.'+table])).rows[0].allowed,false);
  if((await db.query("SELECT 1 FROM pg_roles WHERE rolname='murmingle_app'")).rows.length){
   assert.equal((await db.query("SELECT has_table_privilege('murmingle_app',$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[NS+'.retired_operations'])).rows[0].allowed,false);
  }
  assert.deepEqual((await db.query('SELECT * FROM canonical_v4.sources WHERE id=ANY($1::text[]) ORDER BY id',[oldSources.map(s=>s.id)])).rows,oldSources);
  assert.deepEqual((await db.query('SELECT * FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[oldPosts.map(s=>s.id)])).rows,oldPosts);
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  assert.equal(sql.includes('ingest_ridge_scan'),false);assert.equal(sql.includes('catalog_ingest_lane'),false);
  assert.ok(sql.includes('pg_advisory_xact_lock(914092008,1)'));
  assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.schema_migrations')).rows[0].n,9);
 });

 const principal=f.actorId,proof=hash(8);
 const freshInput=async suffix=>{const v=(await db.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];return input({generation:v.generation,revision:Number(v.revision)},suffix);};
 async function pending(suffix,{mode='admission',parameters=null,seconds=30,originKind='actor',who=principal}={}){
  const data=parameters??prepareFastAdmission(await freshInput(suffix)).parameters;
  const q=await enqueueScoped(db,{originKind,principal:who,mode,parameters:data,authoritySeconds:seconds,producerProofHash:proof});
  return {generation:data[0],operationId:data[2],principal:who,commandHash:q.commandHash??q.command_hash,worker:'scoped-worker',token:'lease-'+suffix,leaseSeconds:15,data};
 }
 async function leased(suffix,options){const j=await pending(suffix,options),c=await claimScoped(db,j);return {...j,epoch:c.epoch};}
 const completeQuery=(tx,j)=>tx.query('SELECT '+NS+'.complete($1,$2,$3,$4,$5,$6,$7) AS result',[j.generation,j.operationId,j.principal,j.commandHash,j.worker,j.token,j.epoch]);
 const sourceExists=async j=>(await db.query('SELECT 1 FROM canonical_v4.sources WHERE id=$1',[j.data[4]])).rows.length;
 await t.test('first server allocation survives uncertain replay without invoking allocator or clock again',async()=>{
  const full=await freshInput('allocation-once');
  const {sourceId,topicId,discussionId,createdAt,...admission}=full;let allocations=0,times=0;
  const command={originKind:'actor',principal,admission,authoritySeconds:30,producerProofHash:proof};
  const dependencies={allocate(){allocations++;return {sourceId,topicId,discussionId};},now(){times++;return createdAt;}};
  const first=await enqueueObservation(db,command,dependencies),second=await enqueueObservation(db,command,dependencies);
  assert.equal(first.commandHash,second.command_hash);assert.equal(allocations,1);assert.equal(times,1);
  await assert.rejects(enqueueObservation(db,{...command,producerProofHash:hash(9)},dependencies));
  assert.equal(allocations,1);
 });
 await t.test('lease epochs, original deadline, cancellation and committed stale-prior terminalization',async()=>{
  const j=await leased('scoped-epochs');
  const deadline=(await db.query('SELECT deadline FROM '+NS+'.authorities WHERE generation=$1 AND operation_id=$2',[j.generation,j.operationId])).rows[0].deadline;
  assert.equal(await heartbeatScoped(db,{...j,leaseSeconds:15}),true);
  assert.deepEqual((await db.query('SELECT deadline FROM '+NS+'.authorities WHERE generation=$1 AND operation_id=$2',[j.generation,j.operationId])).rows[0].deadline,deadline);
  await db.query("UPDATE "+NS+".jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[j.operationId]);
  const next={...j,token:'replacement-token'};const c=await claimScoped(db,next);assert.equal(c.epoch,2);
  await assert.rejects(completeScoped(db,j));
  await completeScoped(db,{...next,epoch:c.epoch});assert.equal(await sourceExists(j),1);
  assert.equal(await revokeScoped(db,next),false,'accepted completion wins; cancellation cannot undo it');
  const cancelled=await leased('scoped-cancel');assert.equal(await revokeScoped(db,cancelled),true);
  await cleanupScoped(db,cancelled);await assert.rejects(completeScoped(db,cancelled));assert.equal(await sourceExists(cancelled),0);
  const r=await admitFastNewSource(db,await freshInput('stale-current'));
  const base=await freshInput('unused-update-allocation');
  const data=prepareFastAdmission({...base,operationId:'queued-stale-prior',sourceId:r.sourceId,topicId:r.topicId,discussionId:r.discussionId,url:(await db.query('SELECT url FROM canonical_v4.sources WHERE id=$1',[r.sourceId])).rows[0].url,title:'Queued before reclassification'}).parameters;
  const stale=await leased('scoped-stale',{mode:'update',parameters:[...data,r.sourceVersion,r.witnessHash,r.decisionHash]});
  await reclassifyFastSource(db,{sourceId:r.sourceId,witnessHash:r.witnessHash,decisionHash:r.decisionHash,nodeId:'nature'});
  assert.deepEqual(await completeScoped(db,stale),{state:'failed',code:'stale-prior'});
  const terminal=(await db.query('SELECT state,params,material,body_values,title_values FROM '+NS+'.jobs WHERE operation_id=$1',[stale.operationId])).rows[0];
  assert.deepEqual(terminal,{state:'failed',params:null,material:null,body_values:null,title_values:null});
 });
 await t.test('new completion advances across unrelated global revision and holds neither growth nor runtime SHARE',async()=>{
  const j=await leased('unrelated-revision');
  await db.query('UPDATE canonical_v4.runtime_state SET revision=revision+1 WHERE singleton');
  await completeScoped(db,j);assert.equal(await sourceExists(j),1);
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  const complete=sql.slice(sql.indexOf('CREATE FUNCTION '+NS+'.complete('),sql.indexOf('CREATE FUNCTION '+NS+'.cleanup('));
  assert.doesNotMatch(complete,/ingest_require_idle_lane|pg_advisory_xact_lock\(914092008|runtime_state[^;]*FOR SHARE/u);
  const enqueueStart=sql.indexOf('CREATE FUNCTION '+NS+'.enqueue('),enqueueEnd=sql.indexOf('CREATE FUNCTION '+NS+'.claim(');
  const outsideReservation=sql.slice(0,enqueueStart)+sql.slice(enqueueEnd);
  assert.doesNotMatch(outsideReservation,/ingest_require_idle_lane|pg_advisory_xact_lock\(914092008|runtime_state[^;]*FOR SHARE/u);
  assert.match(sql,/embeddings WHERE source_id=src FOR SHARE NOWAIT/u);
  assert.match(sql,/WHERE singleton AND generation=p_generation RETURNING revision/u);
  assert.match(complete,/stale-prior/u);
 });
 await t.test('all fifteen exact canonical wrappers retain old role grants and private bodies are ungranted',async()=>{
  assert.deepEqual(await canonicalGrants(),oldCanonicalGrants);
  const privateRows=(await db.query("SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hierarchy_scoped_legacy_v1'")).rows;
  assert.equal(privateRows.length,17);
  for(const p of privateRows){
   const body=(await db.query('SELECT pg_get_functiondef($1::oid) AS body',[p.oid])).rows[0].body;
   assert.doesNotMatch(body,/hierarchy_scoped_ingestion_v1.enter_gate/u);
   for(const role of ['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'])
    assert.equal((await db.query('SELECT has_function_privilege($1,$2::oid,\'EXECUTE\') AS allowed',[role,p.oid])).rows[0].allowed,false);
  }
  const wrappers=(await db.query("SELECT p.proname,pg_get_functiondef(p.oid) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='canonical_v4' AND p.proname=ANY($1::text[])",[privateRows.map(x=>x.proname)])).rows;
  assert.equal(wrappers.length,17);for(const p of wrappers)assert.match(p.body,/enter_gate/u);
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('SELECT '+NS+'.enter_gate(false)');
   await tx.query('SELECT canonical_v4.ingest_clear_learned_data($1,$2)',[f.generation,'CLEAR LEARNED DATA']);
  }),e=>e.code==='P2301');
  // Actual generic JS lifecycle dispatcher chooses its destructive leaf first.
  const marker=new Error('destructive dispatcher rollback');
  await assert.rejects(db.transaction(async tx=>{
   const version=(await tx.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   await createCanonicalV4IngestionRepository({database:tx}).lifecycle({generation:version.generation,revision:Number(version.revision)},{type:'clear-learned-data',confirmation:'CLEAR LEARNED DATA'});
   throw marker;
  }),e=>e===marker);
 });
 await t.test('literal COMMIT and COMMIT; succeed; unsupported commit forms and implicit completion roll back',async()=>{
  for(const commit of ['COMMIT','COMMIT;']){
   const j=await leased('literal-'+commit.replace(/[^A-Za-z]/gu,'semi'));
   await db.transaction(tx=>completeQuery(tx,j),commit);assert.equal(await sourceExists(j),1);
  }
  for(const [index,commit] of ['commit','END','END WORK','COMMIT WORK','COMMIT AND CHAIN','/* comment */COMMIT','COMMIT; SELECT 1',"PREPARE TRANSACTION 'scoped-unsupported'"].entries()){
   const j=await leased('unsupported-'+index);
   await assert.rejects(db.transaction(tx=>completeQuery(tx,j),commit),e=>e.code==='P2305');
   assert.equal(await sourceExists(j),0);
  }
  const implicit=await leased('implicit');
  const literal=[implicit.generation,implicit.operationId,implicit.principal,implicit.commandHash,implicit.worker,implicit.token,implicit.epoch].map(x=>typeof x==='number'?String(x):"'"+x.replaceAll("'","''")+"'").join(',');
  await assert.rejects(db.exec('SELECT '+NS+'.complete('+literal+')'),e=>e.code==='P2305');assert.equal(await sourceExists(implicit),0);
 });
 await t.test('early SET CONSTRAINTS cannot consume commit guard, including savepoint recovery then late commit',async()=>{
  const early=await leased('early-flush');
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec('SET CONSTRAINTS ALL IMMEDIATE');await completeQuery(tx,early);
  }),e=>e.code==='P2305');assert.equal(await sourceExists(early),0);
  const during=await leased('during-flush');
  await db.exec(`CREATE FUNCTION ${NS}.test_early_flush() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN SET CONSTRAINTS ALL IMMEDIATE;RETURN NEW;END $$;
   CREATE TRIGGER test_early_flush BEFORE INSERT ON canonical_v4.sources FOR EACH ROW WHEN(NEW.id='source-fast-during-flush') EXECUTE FUNCTION ${NS}.test_early_flush()`);
  await assert.rejects(db.transaction(tx=>completeQuery(tx,during)),e=>e.code==='P2305');assert.equal(await sourceExists(during),0);
  await db.exec('DROP TRIGGER test_early_flush ON canonical_v4.sources; DROP FUNCTION '+NS+'.test_early_flush()');
  const late=await leased('late-savepoint');
  await db.query("UPDATE "+NS+".authorities SET deadline=clock_timestamp()+interval '0.15 seconds' WHERE operation_id=$1",[late.operationId]);
  await assert.rejects(db.transaction(async tx=>{
   await completeQuery(tx,late);await tx.exec('SAVEPOINT before_flush');
   await assert.rejects(tx.exec('SET CONSTRAINTS ALL IMMEDIATE'),e=>e.code==='P2305');
   await tx.exec('ROLLBACK TO SAVEPOINT before_flush');await tx.query('SELECT pg_sleep(0.2)');
  }),e=>e.code==='P2306');assert.equal(await sourceExists(late),0);
 });
 await t.test('server protocol witness classifies raw simple/extended completion by actual query and depth',async()=>{
  const original=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[NS+'.finalize_commit()'])).rows[0].body;
  const instrumented=original.replace(' IF (pg_catalog.current_query()',
   ' INSERT INTO '+NS+'.test_protocol_witness VALUES(pg_catalog.current_query(),pg_catalog.pg_trigger_depth());\n IF (pg_catalog.current_query()')
   .replace("USING ERRCODE='P2305'","USING ERRCODE='P2305',DETAIL=pg_catalog.jsonb_build_object('query',pg_catalog.current_query(),'depth',pg_catalog.pg_trigger_depth())::text");
  assert.notEqual(instrumented,original);await db.exec('CREATE TABLE '+NS+'.test_protocol_witness(query text,depth integer)');await db.exec(instrumented);
  try{
   const simple=await leased('witness-simple'),extended=await leased('witness-extended');
   const args=j=>[j.generation,j.operationId,j.principal,j.commandHash,j.worker,j.token,j.epoch];
   const sql='SELECT '+NS+'.complete($1,$2,$3,$4,$5,$6,$7)';
   const literal='SELECT '+NS+'.complete('+args(simple).map(v=>typeof v==='number'?String(v):"'"+v.replaceAll("'","''")+"'").join(',')+')';
   await assert.rejects(db.exec(literal),e=>{assert.equal(e.code,'P2305');assert.deepEqual(JSON.parse(e.detail),{query:literal,depth:1});return true;});
   let extendedError;try{await db.query(sql,args(extended));}catch(e){extendedError=e;}
   if(!extendedError){
    // PGlite may own an explicit server transaction around extended queries.
    // Acceptance is valid only if the server actually observed literal COMMIT.
    assert.deepEqual((await db.query('SELECT * FROM '+NS+'.test_protocol_witness')).rows,[{query:'COMMIT',depth:1}]);
    assert.equal(await sourceExists(extended),1);
   }else{assert.equal(extendedError.code,'P2305');assert.deepEqual(JSON.parse(extendedError.detail),{query:null,depth:1});assert.equal(await sourceExists(extended),0);}
  }finally{await db.exec(original);await db.exec('DROP TABLE '+NS+'.test_protocol_witness');}
 });

 await t.test('nested deferred trigger is red with literal-only finalizer and green with intrinsic depth guard',async()=>{
  const original=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[NS+'.finalize_commit()'])).rows[0].body;
  const gate=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[NS+'.enter_gate(boolean)'])).rows[0].body;
  const unsafe=original.replace(' OR pg_catalog.pg_trigger_depth()<>1','');assert.notEqual(unsafe,original);
  // Owner-only fault injection removes the separate external-entry depth fence
  // in BOTH branches, isolating the finalizer's intrinsic-depth defense. No
  // serving role may own callbacks or replace either protected function.
  const callbackGate=gate.replace(/ IF pg_catalog\.pg_trigger_depth\(\)<>0 THEN RAISE EXCEPTION 'External trigger entry rejected' USING ERRCODE='P2301';END IF;/u,'');
  assert.notEqual(callbackGate,gate);
  await db.exec(`CREATE TABLE ${NS}.attack(id integer PRIMARY KEY,g text,op text,principal text,h text,worker text,token text,epoch integer);
   CREATE FUNCTION ${NS}.test_nested_flush() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
    PERFORM hierarchy_scoped_ingestion_v1.complete(NEW.g,NEW.op,NEW.principal,NEW.h,NEW.worker,NEW.token,NEW.epoch);
    SET CONSTRAINTS hierarchy_scoped_ingestion_v1.scoped_authorized_commit IMMEDIATE;
    PERFORM pg_catalog.pg_sleep(0.2);RETURN NULL;END $$;
   CREATE CONSTRAINT TRIGGER attack_first AFTER INSERT ON ${NS}.attack DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${NS}.test_nested_flush()`);
  const attack=(tx,id,j)=>tx.query('INSERT INTO '+NS+'.attack VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,j.generation,j.operationId,j.principal,j.commandHash,j.worker,j.token,j.epoch]);
  const red=await leased('nested-red');await db.exec(callbackGate);await db.exec(unsafe);
  await db.query("UPDATE "+NS+".authorities SET deadline=clock_timestamp()+interval '0.15 seconds' WHERE operation_id=$1",[red.operationId]);
  try{
   await db.transaction(tx=>attack(tx,1,red));
   assert.equal(await sourceExists(red),1);
   assert.equal((await db.query('SELECT deadline<clock_timestamp() AS expired FROM '+NS+'.authorities WHERE operation_id=$1',[red.operationId])).rows[0].expired,true);
   await db.exec(original);
   const green=await leased('nested-green');
   await assert.rejects(db.transaction(tx=>attack(tx,2,green)),e=>e.code==='P2305');
   assert.equal(await sourceExists(green),0);assert.equal((await db.query('SELECT count(*) AS n FROM '+NS+'.attack WHERE id=2')).rows[0].n,0);
  }finally{await db.exec(original);await db.exec(gate);}
  await db.exec('DROP TABLE '+NS+'.attack; DROP FUNCTION '+NS+'.test_nested_flush()');
 });
 await t.test('bounds, crawler principal, list limit and pending-operation erasure use actual queued rows',async()=>{
  const crawler=await pending('crawler-principal',{originKind:'crawler',who:'crawler-public/v1'});
  const legacy=createCanonicalV4IngestionRepository({database:db});
  const queuedMaterial=JSON.parse(crawler.data[3]);
  await assert.rejects(legacy.enqueueInteractive({expected:{generation:crawler.generation,revision:crawler.data[1]},operationId:'legacy-new-pending-url',url:queuedMaterial.url,title:'Pending reserved URL',embedding:{modelId:BROWSER_MODEL_ID,values:unit()},extractorVersion:'main-text-prefix/v1'},{authorityToken:'fixture-pending-authority',authoritySeconds:30}));
  assert.equal((await listScoped(db,{generation:f.generation,principal:'crawler-public/v1',limit:100}))[0].operationId,crawler.operationId);
  await assert.rejects(listScoped(db,{generation:f.generation,principal,limit:101}));
  await assert.rejects(claimScoped(db,{...crawler,leaseSeconds:16}));
  await assert.rejects(pending('invented-crawler',{originKind:'crawler',who:principal}));
  const p=await leased('pending-erasure');
  const rollback=new Error('clear queue rollback');
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('SELECT canonical_v4.ingest_clear_learned_data($1,$2)',[f.generation,'CLEAR LEARNED DATA']);
   for(const job of [crawler,p])assert.equal((await tx.query('SELECT kind FROM '+NS+'.retired_operations WHERE generation=$1 AND operation_id=$2',[job.generation,job.operationId])).rows[0].kind,'admission');
   assert.equal((await tx.query("SELECT count(*) AS n FROM "+NS+".jobs WHERE state IN('pending','leased')")).rows[0].n,0);
   assert.equal((await tx.query('SELECT count(*) AS n FROM '+NS+'.final_intents')).rows[0].n,0);
   assert.equal((await tx.query('SELECT count(*) AS n FROM '+NS+'.authorities')).rows[0].n,0);
   throw rollback;
  }),e=>e===rollback);
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  for(const bound of ['>=4096','THEN 32 ELSE 1024','BETWEEN 0 AND 3','BETWEEN 1 AND 15','BETWEEN 1 AND 30','<=32768'])assert.ok(sql.includes(bound),bound);
 });
 await t.test('protected finalization duplicate is same transaction only and never overwrites first timestamp',async()=>{
  await db.exec(`CREATE TABLE ${NS}.test_final_stamp(stamp timestamptz);
   CREATE FUNCTION ${NS}.test_final_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
    INSERT INTO hierarchy_scoped_ingestion_v1.test_final_stamp SELECT finalized_at FROM hierarchy_scoped_ingestion_v1.final_intents WHERE generation=NEW.generation AND operation_id=NEW.operation_id;RETURN NULL;END $$;
   CREATE CONSTRAINT TRIGGER scoped_authorized_commit_a AFTER INSERT ON ${NS}.final_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${NS}.test_final_stamp();
   CREATE CONSTRAINT TRIGGER scoped_authorized_commit_b AFTER INSERT ON ${NS}.final_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${NS}.finalize_commit()`);
  try{
   const j=await leased('same-tx-proof');await completeScoped(db,j);
   const saved=(await db.query('SELECT finalized_at,tx FROM '+NS+'.final_intents WHERE operation_id=$1',[j.operationId])).rows[0];
   assert.ok(saved.finalized_at);assert.deepEqual((await db.query('SELECT stamp FROM '+NS+'.test_final_stamp')).rows,[{stamp:saved.finalized_at}]);
   // An already authorized proof cannot be imported into another transaction.
   const row=(await db.query('SELECT to_jsonb(i) AS row FROM '+NS+'.final_intents i WHERE operation_id=$1',[j.operationId])).rows[0].row;
   await assert.rejects(db.transaction(async tx=>{
    await tx.query('DELETE FROM '+NS+'.final_intents WHERE operation_id=$1',[j.operationId]);
    await tx.query('INSERT INTO '+NS+'.final_intents SELECT (pg_catalog.jsonb_populate_record(NULL::'+NS+'.final_intents,$1::jsonb)).*',[JSON.stringify(row)]);
   }),e=>e.code==='P2306');
  }finally{await db.exec(`DROP TRIGGER scoped_authorized_commit_a ON ${NS}.final_intents;DROP TRIGGER scoped_authorized_commit_b ON ${NS}.final_intents;DROP FUNCTION ${NS}.test_final_stamp();DROP TABLE ${NS}.test_final_stamp`);}
 });
 await t.test('finalized fast path still checks literal query and exact tx epoch generation operation and receipt identity',async()=>{
  for(const kind of ['tx','epoch','generation','operation','receipt','deadline']){
   const j=await leased('proof-corrupt-'+kind);
   await assert.rejects(db.transaction(async tx=>{
    await completeQuery(tx,j);
    await tx.query('UPDATE '+NS+'.final_intents SET finalized_at=clock_timestamp() WHERE operation_id=$1',[j.operationId]);
    if(kind==='receipt')await tx.query("UPDATE "+NS+".jobs SET receipt=receipt||'{\"sourceId\":\"changed\"}'::jsonb WHERE operation_id=$1",[j.operationId]);
    else if(kind==='generation'||kind==='operation'){
     const change=kind==='generation'?{generation:'other-generation'}:{operation_id:'other-operation'};
     await tx.query('INSERT INTO '+NS+'.jobs SELECT (pg_catalog.jsonb_populate_record(NULL::'+NS+'.jobs,to_jsonb(j)||$2::jsonb)).* FROM '+NS+'.jobs j WHERE operation_id=$1',[j.operationId,JSON.stringify(change)]);
     await tx.query('UPDATE '+NS+'.final_intents SET '+(kind==='generation'?'generation':'operation_id')+'=$2 WHERE operation_id=$1',[j.operationId,Object.values(change)[0]]);
    }else await tx.query('UPDATE '+NS+'.final_intents SET '+(kind==='tx'?'tx=tx+1':kind==='epoch'?'epoch=epoch+1':"deadline=deadline+interval '1 second'")+' WHERE operation_id=$1',[j.operationId]);
   }),e=>e.code==='P2306');assert.equal(await sourceExists(j),0);
   await revokeScoped(db,j);await cleanupScoped(db,j);
  }
  const early=await leased('already-finalized-early');
  await assert.rejects(db.transaction(async tx=>{
   await completeQuery(tx,early);await tx.query('UPDATE '+NS+'.final_intents SET finalized_at=clock_timestamp() WHERE operation_id=$1',[early.operationId]);
   await tx.exec('SET CONSTRAINTS ALL IMMEDIATE');
  }),e=>e.code==='P2305');assert.equal(await sourceExists(early),0);
 });
 await t.test('commit lease expiry rolls back mutation; external trigger entry is rejected before mutation',async()=>{
  const j=await leased('late-lease');
  await db.query("UPDATE "+NS+".jobs SET lease_until=clock_timestamp()+interval '0.1 seconds' WHERE operation_id=$1",[j.operationId]);
  await assert.rejects(db.transaction(async tx=>{await completeQuery(tx,j);await tx.query('SELECT pg_sleep(0.15)');}),e=>e.code==='P2306');assert.equal(await sourceExists(j),0);
  const nested=await leased('external-depth');
  await db.exec(`CREATE TABLE ${NS}.test_external_depth(id integer);
   CREATE FUNCTION ${NS}.test_external_depth() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);RETURN NULL;END $$;
   CREATE TRIGGER test_external_depth AFTER INSERT ON ${NS}.test_external_depth FOR EACH ROW EXECUTE FUNCTION ${NS}.test_external_depth()`);
  try{await assert.rejects(db.exec('INSERT INTO '+NS+'.test_external_depth VALUES(1)'),e=>e.code==='P2301');assert.equal(await sourceExists(nested),0);}
  finally{await db.exec('DROP TABLE '+NS+'.test_external_depth;DROP FUNCTION '+NS+'.test_external_depth()');}
 });
 await t.test('proof storage has fixed slots, explicit bounded janitor and Source/account/clear erasure',async()=>{
  assert.equal((await db.query('SELECT count(*) AS n FROM '+NS+'.finalization_slots')).rows[0].n,4096);
  const j=await leased('proof-erasure');await completeScoped(db,j);
  assert.equal((await db.query('SELECT count(*) AS n FROM '+NS+'.final_intents WHERE operation_id=$1',[j.operationId])).rows[0].n,1);
  await forgetFastSource(db,{generation:j.generation,sourceId:j.data[4]});
  for(const table of ['jobs','authorities','final_intents'])assert.equal((await db.query('SELECT count(*) AS n FROM '+NS+'.'+table+' WHERE operation_id=$1',[j.operationId])).rows[0].n,0);
  const pendingActor=await pending('actor-job-erasure');const marker=new Error('actor erasure rollback');
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('SELECT canonical_v4.runtime_withdraw_account_contributions($1)',[principal]);
   for(const table of ['jobs','authorities','final_intents'])assert.equal((await tx.query('SELECT count(*) AS n FROM '+NS+'.'+table+' WHERE generation=$1 AND operation_id=$2',[pendingActor.generation,pendingActor.operationId])).rows[0].n,0);
   assert.equal((await tx.query('SELECT count(*) AS n FROM '+NS+'.final_intents')).rows[0].n,0);
   throw marker;
  }),e=>e===marker);
  const n=await cleanupFinalizations(db);assert.ok(n>0&&n<=100);assert.equal(await cleanupFinalizations(db),0);
  const cols=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='final_intents' ORDER BY ordinal_position",[NS])).rows.map(x=>x.column_name);
  assert.deepEqual(cols,['generation','operation_id','epoch','lease_until','slot','tx','deadline','receipt_hash','finalized_at']);
  for(const table of ['jobs','authorities','final_intents','finalization_slots'])assert.equal((await db.query("SELECT has_table_privilege('fast_prototype_untrusted',$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[NS+'.'+table])).rows[0].allowed,false);
 });
 await t.test('actual actor capacity and three-attempt recovery are finite; terminal rows release capacity',async()=>{
  const who='account-33333333-3333-4333-8333-333333333333',jobs=[];
  for(let i=0;i<32;i++)jobs.push(await pending('actor-capacity-'+i,{who}));
  await assert.rejects(pending('actor-capacity-overflow',{who}),e=>e.code==='P2303');
  const j=jobs[0];let c=await claimScoped(db,j);
  for(let epoch=2;epoch<=3;epoch++){
   await db.query("UPDATE "+NS+".jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[j.operationId]);
   c=await claimScoped(db,{...j,token:'attempt-'+epoch});assert.equal(c.epoch,epoch);
  }
  await db.query("UPDATE "+NS+".jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[j.operationId]);
  assert.deepEqual(await claimScoped(db,{...j,token:'attempt-four'}),{state:'expired'});
  const extra=await pending('actor-capacity-released',{who});jobs.push(extra);
  for(const job of jobs){await revokeScoped(db,job);await cleanupScoped(db,job);}
  assert.equal((await db.query("SELECT count(*) AS n FROM "+NS+".jobs WHERE principal=$1 AND state IN('pending','leased')",[who])).rows[0].n,0);
 });
 await t.test('direct SQL nullable command authority fails closed before mutation or unbounded listing',async()=>{
  const j=await leased('null-authority');
  const args=[j.generation,j.operationId,j.principal,j.commandHash,j.worker,j.token,j.epoch];
  for(const index of [0,1,2,3,4,5,6]){
   const changed=[...args];changed[index]=null;
   await assert.rejects(db.transaction(tx=>tx.query('SELECT '+NS+'.complete($1,$2,$3,$4,$5,$6,$7)',changed)),e=>e.code==='P2302');
   assert.equal(await sourceExists(j),0);
  }
  await assert.rejects(db.query('SELECT '+NS+'.list_jobs($1,$2,NULL)',[j.generation,j.principal]),e=>e.code==='P2301');
  for(const index of [0,1,2,3,4,5]){
   const params=['actor',principal,'admission',JSON.stringify(j.data),30,proof];params[index]=null;
   await assert.rejects(db.transaction(tx=>tx.query('SELECT '+NS+'.enqueue($1,$2,$3,$4::jsonb,$5,$6)',params)),e=>e.code==='P2301');
  }
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  assert.equal((sql.match(/\(pg_catalog\.current_query\(\) IN\('COMMIT','COMMIT;'\)\) IS DISTINCT FROM true OR pg_catalog\.pg_trigger_depth\(\)<>1/gu)??[]).length,2);
  assert.doesNotMatch(sql,/IF NOT\(pg_catalog\.current_query/u);
 });
 await t.test('direct SQL queue parameters are exactly typed and bounded before vector cast or storage',async()=>{
  const base=prepareFastAdmission(await freshInput('bounded-server-input')).parameters;
  const state=async()=>{const out={};for(const table of ['jobs','authorities','retired_operations','input_versions','current_inputs','decisions','operations','receipts'])out[table]=await count(db,table);return out;};
  const before=await state(),cases=[];
  for(const mode of ['admission','update']){
   const valid=mode==='admission'?[...base]:[...base,'1',hash(1),hash(2)];
   const add=(index,value)=>{const p=[...valid];p[index]=value;cases.push({mode,p});};
   for(let index=0;index<valid.length;index++)add(index,index===11?{}:null);
   for(const index of [0,2,4,5,6,11])add(index,'x'.repeat(129));
   add(7,'x'.repeat(65));add(8,'a'.repeat(65));add(3,'x'.repeat(32769));
   for(const index of [9,10]){add(index,'x'.repeat(16385));add(index,Array(384).fill(0));}
   for(const revision of ['1',0.5,-1,9007199254740992])add(1,revision);
   const oversizedEncoding=JSON.stringify({...JSON.parse(base[3]),title:'\\'.repeat(14000)});
   assert.ok(Buffer.byteLength(oversizedEncoding)<32768);add(3,oversizedEncoding);
   if(mode==='update'){
    for(const prior of ['0','-1','1.0','9007199254740992','1'.repeat(65),1])add(12,prior);
    for(const index of [13,14]){add(index,'a'.repeat(65));add(index,'z'.repeat(64));}
   }
  }
  for(const {mode,p} of cases){
   await assert.rejects(db.transaction(tx=>tx.query('SELECT '+NS+'.enqueue($1,$2,$3,$4::jsonb,$5,$6)',['actor',principal,mode,JSON.stringify(p),30,proof])),e=>e.code==='P2301');
   let calls=0;const fake={query(){calls++;throw new Error('Unexpected SQL before validation');},transaction(){calls++;throw new Error('Unexpected transaction before validation');}};
   await assert.rejects(enqueueScoped(fake,{originKind:'actor',principal,mode,parameters:p,authoritySeconds:30,producerProofHash:proof}),e=>e instanceof TypeError);
   assert.equal(calls,0);
  }
  assert.deepEqual(await state(),before,'no queue, authority, retirement or material/version rows survive rejected input');
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  assert.ok(sql.indexOf('PERFORM '+NS+'.validate_params(p_mode,p_params)')<sql.indexOf('body:=(p_params->>9)::double precision[]'));
 });
 await t.test('withdrawal wrapper bounds actor before new hash fence and queued retirement work',async()=>{
  const before={jobs:await count(db,'jobs'),retired:await count(db,'retired_operations')};
  for(const actor of [null,'x'.repeat(129),'account-'+ 'x'.repeat(100000),'account-invalid',' '+principal])
   await assert.rejects(db.query('SELECT canonical_v4.runtime_withdraw_account_contributions($1)',[actor]),e=>e.code==='P1006');
  assert.deepEqual({jobs:await count(db,'jobs'),retired:await count(db,'retired_operations')},before);
  const body=(await db.query("SELECT pg_get_functiondef('canonical_v4.runtime_withdraw_account_contributions(text)'::regprocedure) AS body")).rows[0].body;
  assert.ok(body.indexOf('runtime_safe_text($1,128,false)')<body.indexOf('hashtextextended($1'));
  assert.ok(body.indexOf('Actor unavailable')<body.indexOf('retire_jobs'));
 });
 await t.test('slot reservation rechecks a post-selection occupant and exhausts distinct candidates finitely',async()=>{
  const signature=NS+'.complete(text,text,text,text,text,text,integer)';
  const original=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[signature])).rows[0].body;
  const selectMark='visited_slots:=pg_catalog.array_append(visited_slots,proof_slot);';
  const check='IF NOT EXISTS(SELECT 1 FROM '+NS+'.final_intents WHERE slot=proof_slot) THEN EXIT;END IF;';
  assert.ok(original.includes(selectMark));assert.ok(original.includes(check));
  await db.exec('CREATE TABLE '+NS+'.test_slot_selection(attempt integer PRIMARY KEY,slot integer UNIQUE)');
  const holder=await leased('slot-holder');await completeScoped(db,holder);
  const proofRow=(await db.query('SELECT to_jsonb(i) AS row FROM '+NS+'.final_intents i WHERE operation_id=$1',[holder.operationId])).rows[0].row;
  await db.query('DELETE FROM '+NS+'.final_intents WHERE operation_id=$1',[holder.operationId]);
  const encoded=JSON.stringify(proofRow).replaceAll("'","''");
  const witness='INSERT INTO '+NS+'.test_slot_selection VALUES(reservation_try,proof_slot);';
  const conflict=`IF reservation_try=1 THEN INSERT INTO ${NS}.final_intents SELECT (pg_catalog.jsonb_populate_record(NULL::${NS}.final_intents,
   '${encoded}'::jsonb||pg_catalog.jsonb_build_object('slot',proof_slot,'tx',pg_catalog.txid_current(),'finalized_at',NULL))).*;END IF;`;
  try{
   await db.exec(original.replace(selectMark,()=>selectMark+'\n'+witness+'\n'+conflict));
   const target=await leased('slot-postselection');await completeScoped(db,target);
   const choices=(await db.query('SELECT * FROM '+NS+'.test_slot_selection ORDER BY attempt')).rows;
   assert.equal(choices.length,2);assert.notEqual(choices[0].slot,choices[1].slot);assert.equal(await sourceExists(target),1);
   assert.equal((await db.query('SELECT slot FROM '+NS+'.final_intents WHERE operation_id=$1',[holder.operationId])).rows[0].slot,choices[0].slot);
   assert.equal((await db.query('SELECT slot FROM '+NS+'.final_intents WHERE operation_id=$1',[target.operationId])).rows[0].slot,choices[1].slot);
   await db.exec('TRUNCATE '+NS+'.test_slot_selection');
   // Owner-only fault injection forces every fresh occupancy check to conflict.
   // Record attempts in DETAIL because the expected rejection rolls rows back.
   let exhausted=original.replace(selectMark,()=>selectMark+'\n'+witness).replace(check,'IF false THEN EXIT;END IF;');
   const beforeDetail=exhausted;assert.ok(beforeDetail.includes("RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303'"));
   exhausted=exhausted.replaceAll("RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303'",
    "RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303',DETAIL=pg_catalog.jsonb_build_object('attempts',pg_catalog.cardinality(visited_slots),'distinct',(SELECT pg_catalog.count(DISTINCT slot) FROM hierarchy_scoped_ingestion_v1.test_slot_selection))::text");
   assert.notEqual(exhausted,beforeDetail);await db.exec(exhausted);
   const finite=await leased('slot-exhaustion');
   let available;
   await assert.rejects(db.transaction(async tx=>{
    // Reduce only the disposable free fixture pool to three candidates. This
    // exercises actual exhaustion without racing a 4096-step CPU benchmark
    // against the unchanged 15s lease. Rollback restores all4096 slot rows.
    await tx.query(`DELETE FROM ${NS}.finalization_slots WHERE slot NOT IN(SELECT slot FROM ${NS}.final_intents)
     AND slot NOT IN(SELECT s.slot FROM ${NS}.finalization_slots s WHERE NOT EXISTS(SELECT 1 FROM ${NS}.final_intents i WHERE i.slot=s.slot) ORDER BY s.slot LIMIT 3)`);
    available=(await tx.query(`SELECT count(*) AS n FROM ${NS}.finalization_slots s WHERE NOT EXISTS(SELECT 1 FROM ${NS}.final_intents i WHERE i.slot=s.slot)`)).rows[0].n;
    assert.equal(available,3);
    await completeQuery(tx,finite);
   }),e=>{assert.equal(e.code,'P2303');assert.deepEqual(JSON.parse(e.detail),{attempts:available,distinct:available});return true;});
   assert.equal(await sourceExists(finite),0);assert.equal(await count(db,'test_slot_selection'),0);
   assert.equal(await count(db,'finalization_slots'),4096);assert.match(original,/FOR reservation_try IN 1\.\.4096 LOOP/u);
   const expired=await leased('slot-expiry');
   await db.query("UPDATE "+NS+".authorities SET deadline=clock_timestamp()+interval '0.05 seconds' WHERE operation_id=$1",[expired.operationId]);
   await db.exec(original.replace(selectMark,()=>selectMark+' PERFORM pg_catalog.pg_sleep(0.1);'));
   await assert.rejects(completeScoped(db,expired),e=>e.code==='P2306');assert.equal(await sourceExists(expired),0);
  }finally{await db.exec(original);await db.exec('DROP TABLE '+NS+'.test_slot_selection');}
 });
 await t.test('lifecycle gate matches real own lock and current database, not unrelated advisory metadata',async()=>{
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('SELECT pg_catalog.pg_advisory_xact_lock_shared(914092165,1)');
   const own=(await tx.query("SELECT database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AS same_db FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory' AND classid=914092165 AND objid=1 AND objsubid=2 AND granted AND mode='ShareLock'")).rows;
   assert.deepEqual(own,[{same_db:true}]);await tx.query('SELECT '+NS+'.enter_gate(true)');
  }),e=>e.code==='P2301');
  await db.transaction(async tx=>{
   await tx.query('SELECT pg_catalog.pg_advisory_xact_lock_shared(914092165,2)');
   await tx.query('SELECT '+NS+'.enter_gate(true)');
  });
  const body=(await db.query("SELECT pg_get_functiondef('"+NS+".enter_gate(boolean)'::regprocedure) AS body")).rows[0].body;
  assert.equal((body.match(/database=\(SELECT oid FROM pg_catalog\.pg_database WHERE datname=pg_catalog\.current_database\(\)\)/gu)??[]).length,2);
  const classified=(await db.query(`WITH current_db AS(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),
   metadata(database,objid,objsubid,granted,mode) AS(SELECT oid::bigint+1,1,2,true,'ShareLock' FROM current_db UNION ALL SELECT oid::bigint,2,2,true,'ShareLock' FROM current_db
   UNION ALL SELECT oid,1,1,true,'ShareLock' FROM current_db UNION ALL SELECT oid,1,2,false,'ShareLock' FROM current_db)
   SELECT pg_catalog.count(*) AS n FROM metadata WHERE database=(SELECT oid FROM current_db) AND objid=1 AND objsubid=2 AND granted AND mode='ShareLock'`)).rows[0].n;
  assert.equal(classified,0);
 });
 assert.deepEqual((await db.query('SELECT * FROM canonical_v4.sources WHERE id=ANY($1::text[]) ORDER BY id',[oldSources.map(s=>s.id)])).rows,oldSources);
 assert.deepEqual((await db.query('SELECT * FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[oldPosts.map(s=>s.id)])).rows,oldPosts);

});
