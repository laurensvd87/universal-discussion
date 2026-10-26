import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { seedCanonicalV4RuntimeFixture } from '../../../test/canonical-v4-runtime-fixture.js';
import { createCanonicalV4RuntimeRepository } from '../../runtime-repository.js';
import { createCanonicalV4IngestionRepository } from '../../ingestion-repository.js';
import { BROWSER_MODEL_ID } from '../../../../src/domain/learned-sources.js';
import { createInputVersionFixtureDatabase,updateFastSource,initializeFastAdmissionPrototype,publishFastAdmissionArtifact,prepareFastAdmission,admitFastNewSource,
 createFastRoot,reclassifyFastSource,forgetFastSource,readFastRootFeed,pairedVectorWire } from './repository.js';

const hash=n=>String(n).repeat(64),sha=v=>createHash('sha256').update(v).digest('hex');
const unit=()=>[1,-0,...Array(382).fill(0)],NS='hierarchy_fast_input_versions_v1';
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
 const db=await createInputVersionFixtureDatabase();t.after(()=>db.close());const f=await seedCanonicalV4RuntimeFixture(db);
 const oldSources=(await db.query('SELECT * FROM canonical_v4.sources ORDER BY id')).rows;
 const oldPosts=(await db.query('SELECT * FROM canonical_v4.contributions ORDER BY id')).rows;
 await initializeFastAdmissionPrototype(db);
 await t.test('direct SQL rejects null artifact or root-node publication without a durable artifact',async()=>{
  const {nodes,...identity}=artifact();
  for(const args of [[JSON.stringify(identity),null],[null,JSON.stringify(nodes)]]){
   await assert.rejects(db.query('SELECT hierarchy_fast_input_versions_v1.publish($1::jsonb,$2::jsonb)',args),e=>e.code==='P2101');
   assert.equal(await count(db,'artifact'),0);assert.equal(await count(db,'nodes'),0);
  }
 });
 await publishFastAdmissionArtifact(db,artifact());
 // Any accidental exact matcher call makes this entire suite fail.
 await db.exec(`CREATE OR REPLACE FUNCTION canonical_v4.ingest_ridge_scan(candidate double precision[],p_parameter_sha256 text)
 RETURNS TABLE(topic_id text,similarity double precision) LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Forbidden synthetic Ridge call'; END $$`);
 let receipt;
 await t.test('new canonical Source/FKs/container/typed receipt commit without Ridge or catalog lane',async()=>{
  receipt=await admitFastNewSource(db,input(f));assert.equal(receipt.schema,'source-local-versioned-receipt/v1');assert.equal(receipt.sourceVersion,'1');
  assert.equal(receipt.policyVersion,'source-local-versioned-container/v1');assert.equal(receipt.semanticNodeId,'games');
  const row=(await db.query(`SELECT s.policy_version,s.write_version,e.dimensions,encode(array_send(e.values_double),'hex') AS wire,
   i.body_wire_hash,i.title_wire_hash,hierarchy_fast_input_versions_v1.wire_hash(i.title_values) AS actual_title,
   r.values_double AS ridge FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
   JOIN hierarchy_fast_input_versions_v1.inputs i ON i.source_id=s.id LEFT JOIN canonical_v4.fixed_references r ON r.topic_id=$2 WHERE s.id=$1`,[receipt.sourceId,receipt.topicId])).rows[0];
  assert.equal(row.dimensions,384);assert.equal(row.body_wire_hash,sha(Buffer.from(row.wire,'hex')));assert.equal(row.body_wire_hash,pairedVectorWire(unit()).wireHash);
  assert.equal(row.title_wire_hash,row.actual_title);assert.equal(row.ridge,null);
  assert.equal((await db.query('SELECT active_operation_id FROM canonical_v4.catalog_ingest_lane')).rows[0].active_operation_id,null);
  assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.fixed_references WHERE topic_id=$1',[receipt.topicId])).rows[0].n,0);
  const foreign=(await db.query(`SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE contype='f' AND connamespace='hierarchy_fast_input_versions_v1'::regnamespace`)).rows.map(r=>r.target);
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
  await assert.rejects(db.query('SELECT hierarchy_fast_input_versions_v1.admit_new('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args),e=>e.code==='P2101');
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
  const snapshot=(await db.query('SELECT * FROM hierarchy_fast_input_versions_v1.root_snapshots WHERE root_id=$1',[r.rootId])).rows[0];
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
   await tx.exec('ALTER TABLE hierarchy_fast_input_versions_v1.input_versions DISABLE TRIGGER fast_input_immutable');
   await tx.query('UPDATE hierarchy_fast_input_versions_v1.input_versions SET title_values=$1::double precision[] WHERE source_id=$2',[pairedVectorWire([0,1,...Array(382).fill(0)]).sqlArray,receipt.sourceId]);
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
  const old=(await db.query('SELECT * FROM hierarchy_fast_input_versions_v1.root_snapshots')).rows;
  const stale=receipt;
  receipt={...receipt,...await reclassifyFastSource(db,{sourceId:receipt.sourceId,witnessHash:receipt.witnessHash,decisionHash:receipt.decisionHash,nodeId:'nature'})};
  await assert.rejects(createFastRoot(db,root(f,stale,'stale-decision')));
  assert.equal(await count(db,'decisions'),2);
  assert.deepEqual((await db.query('SELECT * FROM hierarchy_fast_input_versions_v1.root_snapshots')).rows,old);assert.equal((await feed(db,'nature')).rootRefs.length,0);
  await assert.rejects(db.query('UPDATE canonical_v4.contributions SET discussion_id=$1 WHERE id=$2',[f.discussionB,'contribution-fast-one']),e=>e.code==='P2103');
  await assert.rejects(db.query("UPDATE hierarchy_fast_input_versions_v1.root_snapshots SET node_id='nature'"),e=>e.code==='P2103');
 });

 await t.test('serialized addressed reclassification rejects a stale prior decision without replacing evidence',async()=>{
  const original=(await db.query('SELECT receipt FROM '+NS+'.receipts WHERE source_id=$1',[receipt.sourceId])).rows[0].receipt;
  const before=(await db.query('SELECT * FROM '+NS+'.current_inputs WHERE source_id=$1',[receipt.sourceId])).rows;
  const decisions=await count(db,'decisions');
  await assert.rejects(reclassifyFastSource(db,{sourceId:receipt.sourceId,witnessHash:original.witnessHash,decisionHash:original.decisionHash,nodeId:'games'}),e=>e.code==='P2102');
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
  assert.equal((await db.query('SELECT source_id FROM hierarchy_fast_input_versions_v1.containers')).rows[0].source_id,null);
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
    await assert.rejects(admitFastNewSource(db,{...again,title}),e=>e.code==='P2102');
   }
   await assert.rejects(updateFastSource(db,{admission:again,prior:{sourceVersion:receipt.sourceVersion,witnessHash:receipt.witnessHash,decisionHash:receipt.decisionHash}}),e=>e.code==='P2102');
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
   await assert.rejects(admitFastNewSource(tx,input({generation:f.generation,revision:Number(v.revision)},'stale-generation')),e=>e.code==='P2102');
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
   const version=(await tx.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({...f,revision:Number(version.revision)},'delete-probe'));
   await createFastRoot(tx,root(f,fresh,'delete-probe'));const before=await transactionFeed(tx);
   await tx.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[f.generation,fresh.topicId,'DELETE TOPIC AND DISCUSSION']);
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
   const version=(await tx.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
   const fresh=await admitFastNewSource(tx,input({...f,revision:Number(version.revision)},'clear-probe'));
   const posted=root(f,fresh,'clear-probe');await createFastRoot(tx,posted);const before=await transactionFeed(tx);
   await tx.query('SELECT canonical_v4.ingest_clear_learned_data($1,$2)',[f.generation,'CLEAR LEARNED DATA']);
   assert.equal(await count(tx,'retired_operations'),retiredBefore+1);
   assert.equal((await tx.query('SELECT kind FROM '+NS+'.retired_operations WHERE generation=$1 AND operation_id=$2',[f.generation,'fast-operation-clear-probe'])).rows[0].kind,'admission');
   for(const table of ['containers','input_versions','current_inputs','decisions','receipts','root_intents','root_snapshots','operations','update_intents'])assert.equal(await count(tx,table),0,table);
   assert.equal((await tx.query("SELECT count(*) AS n FROM canonical_v4.sources WHERE policy_version='source-local-versioned-container/v1'")).rows[0].n,0);
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
});
