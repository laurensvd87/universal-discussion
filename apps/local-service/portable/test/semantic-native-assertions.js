// Inert real-SQL assertions for the ordinary semantic foundation. Importing
// registers no tests, opens no DB, loads no encoder assets and starts no process.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {trainBinaryHierarchyDetail} from '../../src/domain/hierarchy-binary-detail.js';
import {compileSemanticTopicGrouping,groupSupportedSemanticPath} from '../../src/domain/semantic-topic-grouping.js';
import {fitPooledRootRankPolicy} from '../../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {createHierarchyIngestionPreparation} from '../../src/application/hierarchy-ingestion-preparation.js';
import {createCanonicalV4IngestionRepository} from '../canonical-v4/ingestion-repository.js';
import {createCanonicalV4SemanticRepository} from '../canonical-v4/semantic-repository.js';
import {createCanonicalV4SemanticDiscussionRepository} from '../canonical-v4/semantic-discussion-repository.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {sourceStamp} from '../../src/domain/source-threads.js';
import {RIDGE_PARAMETER_SHA256} from '../../src/domain/ridge-topic-adapter.js';
import semanticGroups from './semantic-native-cases.json' with {type:'json'};

function deepFreeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
const GROUPS=deepFreeze(semanticGroups);
export const SEMANTIC_CASES=Object.freeze(GROUPS.flatMap(group=>[
 Object.freeze({name:group.name,depth:0}),...group.children.map(name=>Object.freeze({name,depth:1})),
]));
const MODEL='e5-small-q8-browser-main-prefix-v1',MANUAL_TOPIC='topic-semantic-manual',MANUAL_DISCUSSION='discussion-semantic-manual';
const SUPPORTED_PATH=Object.freeze(['games','invented-game-branch']);
const sha=text=>createHash('sha256').update(text).digest('hex'),digest=value=>sha(JSON.stringify(value));
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),wire=v=>'{'+v.map(n=>Object.is(n,-0)?'-0':String(n)).join(',')+'}';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sqlCode=expected=>error=>Boolean(error&&error.code===expected);

// Actual numeric trainers/compilers, entirely invented axis vectors and groups.
// No archived study material, real embeddings or native observation claims.
function numericMatcher(version,{reparent=false}={}){
 const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
 const roots=[{id:'games',parentId:null},{id:'nature',parentId:null}];
 const rootModel=trainHierarchyLinearHeads({nodes:roots,rows:Array.from({length:4},(_,i)=>({id:'invented-train-'+i,groupId:'invented-train-group-'+i,
  split:'training',expectedTopicId:i<2?'games':'nature',vector:axis(i<2?0:1)})),representation:paired.representation,
  representationHash:paired.representationHash,trainingVersion:'invented-semantic-native-'+version,lambda:.1});
 const core=compileHierarchyLinearHeads(rootModel),rows=Array.from({length:20},(_,i)=>({id:'invented-cal-'+i,groupId:'invented-cal-group-'+i,expectedRootId:i%2?'nature':'games',
  scores:scoreHierarchyLinearHeads(core,{sourceId:'invented-cal-'+i,sourceVersion:'invented',representation:paired.representation,
   representationHash:paired.representationHash,vector:axis(i%2?1:0)}).scores.map(({nodeId,score})=>({nodeId,score}))}));
 const rootPolicy=fitPooledRootRankPolicy({modelHash:digest(rootModel),representationHash:paired.representationHash,inputConstructionHash:'b'.repeat(64),nodeIds:['games','nature'],rows});
 const nodes=[...roots,{id:'invented-game-branch',parentId:reparent?'nature':'games'}];
 const detail=trainBinaryHierarchyDetail({nodeId:'invented-game-branch',canonicalPath:[reparent?'nature':'games','invented-game-branch'],
  representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-detail-'+version,
  trainingRows:[true,true,false,false].map((label,i)=>({id:'invented-detail-train-'+i,groupId:'invented-detail-train-group-'+i,label,vector:axis(label?0:2)})),
  calibrationRows:[true,true,true,false,false,false].map((label,i)=>({id:'invented-detail-cal-'+i,groupId:'invented-detail-cal-group-'+i,label,language:'en',vector:axis(label?0:2)}))});
 assert.equal(detail.eligible,true,'invented binary branch must be calibrated and enabled');
 const matcher=compileRootedHierarchyMatcher({rootModel,rootPolicy,inputDefinition,nodes,detailArtifacts:[detail]});
 if(!reparent){
  const decision=classifyRootedHierarchyMatcher(matcher,{sourceId:'invented-fixture-preflight',sourceVersion:'invented-numeric-only',bodyVector:axis(0),titleVector:axis(0)});
  assert.deepEqual(decision.semanticPath,SUPPORTED_PATH);assert.deepEqual(decision.evaluatedDetailNodes,['invented-game-branch']);
 }
 return matcher;
}
async function scalar(db,sql,args=[]){const {rows}=await db.query(sql,args);assert.equal(rows.length,1);return rows[0];}
async function counts(db){return scalar(db,`SELECT
 (SELECT count(*)::integer FROM canonical_v4.sources) sources,
 (SELECT count(*)::integer FROM canonical_v4.operation_receipts) receipts,
 (SELECT count(*)::integer FROM canonical_v4.semantic_inputs) inputs,
 (SELECT count(*)::integer FROM canonical_v4.semantic_observations) observations,
 (SELECT count(*)::integer FROM canonical_v4.id_registry) ids`);}
async function sourceState(db,sourceId){return scalar(db,`SELECT s.id,s.write_version::text,s.operation_id,s.title,l.topic_id,l.method,d.id discussion_id
 FROM canonical_v4.sources s JOIN canonical_v4.source_links l ON l.source_id=s.id JOIN canonical_v4.discussions d ON d.topic_id=l.topic_id WHERE s.id=$1`,[sourceId]);}
async function denied(db,sql,args=[]){await assert.rejects(db.query(sql,args),sqlCode('42501'));}
const REGISTER='SELECT canonical_v4.semantic_register_matcher($1)';
const ACTIVATE='SELECT canonical_v4.semantic_activate_matcher($1,$2)';
const APPLY=`SELECT * FROM canonical_v4.semantic_ingest_apply($1,$2,$3,$4::double precision[],$5,$6,$7,$8,$9,$10,$11,$12,$13::double precision[],$14::text[])`;
const LEGACY=`SELECT * FROM canonical_v4.ingest_apply($1,$2,$3,$4::double precision[],$5,$6,$7,$8,$9,$10,$11)`;

/** Runs only when the caller supplies its separately owned native fixture scope.
 * A roles: owner primary + worker/app/submitter/postgres observer. B: owner +
 * worker only, acquired after every A role and primary has closed. With the
 * controller admin this is exactly8 nonbootstrap physical clients in total.
 */
export async function runSemanticAssertions(test,{acquireFixture}){
 assert.equal(typeof test,'function');assert.equal(typeof acquireFixture,'function');
 assert.equal(SEMANTIC_CASES.length,25);assert.equal(new Set(SEMANTIC_CASES.map(c=>c.name)).size,25);
 const matcher1=numericMatcher('one'),matcher2=numericMatcher('two'),badMatcher=numericMatcher('reparent',{reparent:true});
 const identity1=JSON.stringify(describeRootedHierarchyMatcher(matcher1)),hash1=sha(identity1),hash2=digest(describeRootedHierarchyMatcher(matcher2));
 let fixture=null,owner=null,worker=null,app=null,submitter=null,observer=null,fixtureB=null,workerB=null;
 let ownerSemantic,workerSemantic,ownerFeeds,appFeeds,appRuntime,appLifecycle,appIngest,workerIngest,A,initial,excluded,serial=0,encoderCalls=0;
 let humanRoot,aiRoot,manualRoot,originalSnapshots,originalDestination,defaultOwnerPolicy;
 const actor=Object.freeze({id:'demo-alex',type:'human',demo:true});
 const nextId=kind=>`semantic-${kind}-${++serial}`,now=()=>new Date().toISOString();
 const preparation=createHierarchyIngestionPreparation({matcher:matcher1,embedTitle:async()=>{encoderCalls++;return {modelId:MODEL,values:axis(0)};}});
 const repo=database=>createCanonicalV4IngestionRepository({database,nextId,now});
 const semantic=database=>createCanonicalV4SemanticRepository({database,nextId,now});
 const feed=(nodeId='games')=>appFeeds.feedReferences({generation:fixture.generation,nodeId,beforeOrdinal:null,limit:100});
 const rootSnapshots=()=>owner.query(`SELECT root_id,source_id,source_version::text,matcher_hash,generation,operation_id,operation_digest,supported_path,topic_id,discussion_id,root_ordinal::text
  FROM canonical_v4.semantic_root_snapshots WHERE root_id=ANY($1::text[]) ORDER BY root_id`,[[humanRoot,aiRoot].filter(Boolean)]).then(r=>r.rows);
 async function humanPost(label,{topicId=A.topicId,sourceId=A.sourceId}={}){
  return appRuntime.command({actorId:actor.id,requestId:'semantic-post-'+label,expected:await fixture.header(),
   command:{type:'create-root',topicId,body:'Invented human SQL root '+label,originSourceId:sourceId}});
 }
 async function activate(hash){const head=await scalar(owner,'SELECT revision::text FROM canonical_v4.semantic_installation WHERE singleton');return ownerSemantic.activateMatcher({matcherIdentityHash:hash,expectedRevision:Number(head.revision)});}
 async function queued(label,{url=`https://semantic.example.org/article-${label}`,title='Invented public article'}={}){
  const input={expected:await fixture.header(),operationId:`semantic-op-${label}-${++serial}`,url,title,embedding:{modelId:MODEL,values:axis(0)},extractorVersion:'crawler-static-html-prefix/v1'};
  const enqueued=await appIngest.enqueueInteractive(input,{authorityToken:`semantic-authority-${serial}`,authoritySeconds:30});
  assert.equal(enqueued.state,'pending');
  const claim=await workerIngest.claim({workerId:'semantic-worker',leaseToken:`semantic-lease-${++serial}`,leaseSeconds:30});
  assert.ok(claim);assert.equal(claim.operationId,input.operationId);
  const prepared=await preparation.prepare({operationId:claim.operationId,operationDigest:claim.operationDigest,requestMaterial:claim.requestMaterial,input:claim.input});
  return {input,enqueued,claim,prepared};
 }
 async function finish(work,{database=worker,representedValues=axis(0)}={}){return semantic(database).apply(work.claim,{representedValues,preparation:work.prepared});}
 function rawParameters(work,{title=axis(0),path=SUPPORTED_PATH}={}){return [work.claim.operationId,work.claim.operationDigest,work.claim.leaseToken,wire(axis(0)),RIDGE_PARAMETER_SHA256,
  nextId('source'),nextId('topic'),nextId('discussion'),now(),sourceStamp(work.claim.input),true,hash1,wire(title),path];}
 async function closeA(){
  const clients=[observer,submitter,app,worker];observer=submitter=app=worker=null;
  const closed=await Promise.allSettled(clients.filter(Boolean).map(client=>client.close()));
  const saved=fixture;fixture=null;owner=null;if(saved)await saved.close();
  for(const result of closed)if(result.status==='rejected')throw result.reason;
 }
 try{
  await test(GROUPS[0].name,async t=>{
   fixture=await acquireFixture();owner=fixture.database;
   worker=await fixture.connect('murmingle_ingest_worker');app=await fixture.connect('murmingle_app');
   submitter=await fixture.connect('murmingle_crawler_submitter');observer=await fixture.connect('postgres');
   ownerSemantic=semantic(owner);workerSemantic=semantic(worker);appIngest=repo(app);workerIngest=repo(worker);
   ownerFeeds=createCanonicalV4SemanticDiscussionRepository({database:owner});appFeeds=createCanonicalV4SemanticDiscussionRepository({database:app});
   appRuntime=createCanonicalV4RuntimeRepository({database:app,nextId,now});appLifecycle=createCanonicalV4LifecycleRepository({database:app,nextId,now});
   await t.test(GROUPS[0].children[0],async()=>{
    const c=await counts(owner);assert.equal(c.sources,0);assert.equal(c.inputs,0);assert.equal(c.observations,0);
    assert.deepEqual(await scalar(owner,'SELECT revision::text,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton'),{revision:'0',matcher_hash:null});
    assert.equal(Number((await scalar(owner,`SELECT count(*) n FROM information_schema.tables WHERE table_schema='canonical_v4'
     AND table_name IN('semantic_matchers','semantic_nodes','semantic_installation','semantic_inputs','semantic_observations',
       'semantic_root_snapshots','semantic_root_edges','semantic_owner_policy')`)).n),8);
    defaultOwnerPolicy=await appFeeds.ownerPolicy();assert.deepEqual(defaultOwnerPolicy,{revision:0,defaultMaxDepth:1,overrides:[]});
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots')).n),0);
    assert.equal((await scalar(owner,'SELECT id FROM canonical_v4.discussions WHERE id=$1 AND topic_id=$2',[MANUAL_DISCUSSION,MANUAL_TOPIC])).id,MANUAL_DISCUSSION);
   });
   await t.test(GROUPS[0].children[1],async()=>{
    const a=await ownerSemantic.registerMatcher(matcher1),b=await ownerSemantic.registerMatcher(matcher1);assert.deepEqual(a,b);assert.equal(a.matcherIdentityHash,hash1);assert.equal(a.activated,false);
    const row=await scalar(owner,'SELECT count(*)::integer n FROM canonical_v4.semantic_matchers');assert.equal(row.n,1);
    const registered=await scalar(owner,'SELECT identity_text FROM canonical_v4.semantic_matchers WHERE matcher_hash=$1',[hash1]);assert.equal(registered.identity_text,identity1);
    assert.equal((await scalar(owner,'SELECT matcher_hash FROM canonical_v4.semantic_installation WHERE singleton')).matcher_hash,null);
   });
   await t.test(GROUPS[0].children[2],async()=>{
    await denied(app,REGISTER,[identity1]);await denied(app,ACTIVATE,[hash1,0]);
    await denied(app,'UPDATE canonical_v4.semantic_installation SET revision=revision');
    await denied(app,'SELECT * FROM canonical_v4.semantic_inputs');
    await denied(app,'SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[0,1,'[]']);
    await denied(app,'UPDATE canonical_v4.semantic_owner_policy SET revision=revision');
    await denied(app,'UPDATE canonical_v4.semantic_root_snapshots SET root_ordinal=root_ordinal');
    assert.deepEqual((await feed()).references,[]);assert.equal((await appFeeds.ownerPolicy()).revision,0);
   });
   await t.test(GROUPS[0].children[3],async()=>{
    await denied(submitter,REGISTER,[identity1]);await denied(submitter,ACTIVATE,[hash1,0]);await denied(submitter,APPLY,Array(14).fill(null));
    await denied(submitter,'SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[0,1,'[]']);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_read_feed($1,$2,$3,$4)',[fixture.generation,'games',null,10]);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_read_owner_policy()');
   });
   await t.test(GROUPS[0].children[4],async()=>{
    await denied(worker,LEGACY,Array(11).fill(null));await denied(worker,REGISTER,[identity1]);await denied(worker,ACTIVATE,[hash1,0]);
    await denied(worker,'UPDATE canonical_v4.semantic_matchers SET identity_text=identity_text');
    await denied(worker,'DELETE FROM canonical_v4.semantic_observations');
    await denied(worker,'SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[0,1,'[]']);
    await denied(worker,'DELETE FROM canonical_v4.semantic_root_edges');await denied(worker,'UPDATE canonical_v4.semantic_owner_policy SET revision=revision');
    await denied(worker,'SELECT * FROM canonical_v4.semantic_read_feed($1,$2,$3,$4)',[fixture.generation,'games',null,10]);
   });
   await t.test(GROUPS[0].children[5],async()=>{
    await assert.rejects(ownerSemantic.registerMatcher(badMatcher),error=>error.code==='invalid');
    const second=await ownerSemantic.registerMatcher(matcher2);assert.equal(second.matcherIdentityHash,hash2);assert.notEqual(hash1,hash2);
    const nodes=(await owner.query('SELECT matcher_hash,parent_id,path FROM canonical_v4.semantic_nodes WHERE node_id=$1 ORDER BY matcher_hash',['invented-game-branch'])).rows;
    assert.equal(nodes.length,2);assert.deepEqual(nodes[0].path,nodes[1].path);assert.equal(nodes[0].parent_id,'games');
   });
   await t.test(GROUPS[0].children[6],async()=>{
    for(const isolation of ['REPEATABLE READ','SERIALIZABLE'])await assert.rejects(owner.transaction(async tx=>{
     await tx.exec('SET TRANSACTION ISOLATION LEVEL '+isolation);await tx.query(REGISTER,[identity1]);
    }),sqlCode('P1213'));
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_matchers')).n),2);
   });
   await t.test(GROUPS[0].children[7],async()=>{
    assert.deepEqual(await ownerSemantic.activateMatcher({matcherIdentityHash:hash1,expectedRevision:0}),{matcherIdentityHash:hash1,revision:1});
    await assert.rejects(ownerSemantic.activateMatcher({matcherIdentityHash:hash2,expectedRevision:0}),error=>error.code==='conflict');
    assert.deepEqual(await scalar(owner,'SELECT revision::text,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton'),{revision:'1',matcher_hash:hash1});
    const policy=await ownerFeeds.setOwnerPolicy({expectedRevision:0,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:2},{nodeId:'invented-game-branch',maxDepth:2}]});
    assert.equal(policy.revision,1);assert.deepEqual(await appFeeds.ownerPolicy(),policy);
    const actual=classifyRootedHierarchyMatcher(matcher1,{sourceId:'invented-policy-control',sourceVersion:'invented-policy-control-v1',bodyVector:axis(0),titleVector:axis(0)});
    const nodes=describeRootedHierarchyMatcher(matcher1).nodes;
    assert.deepEqual(groupSupportedSemanticPath(compileSemanticTopicGrouping({nodes,policy:defaultOwnerPolicy}),actual.semanticPath).selectedPath,['games']);
    assert.deepEqual(groupSupportedSemanticPath(compileSemanticTopicGrouping({nodes,policy:await appFeeds.ownerPolicy()}),actual.semanticPath).selectedPath,SUPPORTED_PATH);
    await assert.rejects(ownerFeeds.setOwnerPolicy({expectedRevision:0,defaultMaxDepth:1,overrides:[]}),e=>e.code==='conflict');
    await assert.rejects(ownerFeeds.setOwnerPolicy({expectedRevision:1,defaultMaxDepth:1,overrides:[{nodeId:'unknown-semantic-node',maxDepth:2}]}),e=>e.code==='invalid');
    await assert.rejects(ownerFeeds.setOwnerPolicy({expectedRevision:1,defaultMaxDepth:1,overrides:[{nodeId:'invented-game-branch',maxDepth:1}]}),e=>e.code==='invalid');
    await assert.rejects(owner.query('SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[1,0,'[]']),sqlCode('P1223'));
    assert.deepEqual(await appFeeds.ownerPolicy(),policy);
   });
  });
  await test(GROUPS[1].name,async t=>{
   await t.test(GROUPS[1].children[0],async()=>{
    initial=await queued('first');assert.equal(initial.claim.input.title,initial.input.title);
    assert.equal(sha(initial.claim.requestMaterial),initial.claim.operationDigest);
    assert.equal(initial.claim.requestMaterial,JSON.stringify({url:initial.claim.input.url,title:initial.claim.input.title,embedding:initial.claim.input.embedding,extractorVersion:initial.claim.input.extractorVersion}));
    assert.equal(initial.prepared.sourceVersion,initial.claim.operationDigest);assert.deepEqual(initial.prepared.decision.semanticPath,SUPPORTED_PATH);
    assert.deepEqual(initial.prepared.decision.evaluatedDetailNodes,['invented-game-branch']);
   });
   await t.test(GROUPS[1].children[1],async()=>{
    const before=await counts(owner);await activate(hash2);
    try{await assert.rejects(finish(initial),error=>error.code==='conflict');assert.deepEqual(await counts(owner),before);}
    finally{await activate(hash1);}
   });
   await t.test(GROUPS[1].children[2],async()=>{
    const before=await counts(owner),forged=structuredClone(initial.prepared);forged.decision.semanticPath=['games','nature'];
    await assert.rejects(workerSemantic.apply(initial.claim,{representedValues:axis(0),preparation:forged}),error=>error.code==='invalid');assert.deepEqual(await counts(owner),before);
   });
   await t.test(GROUPS[1].children[3],async()=>{
    const before=await counts(owner);await assert.rejects(worker.query(APPLY,rawParameters(initial,{title:Array(384).fill(0)})),sqlCode('P1213'));assert.deepEqual(await counts(owner),before);
   });
   await t.test(GROUPS[1].children[4],async()=>{
    const before=await counts(owner);
    await owner.exec(`CREATE FUNCTION canonical_v4.semantic_test_insert_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled semantic insert fault' USING ERRCODE='P0001'; END $$;
     CREATE TRIGGER semantic_test_insert_fault BEFORE INSERT ON canonical_v4.semantic_observations FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_test_insert_fault()`);
    try{
     await assert.rejects(finish(initial),error=>error.code==='storage-failure');assert.deepEqual(await counts(owner),before);
     const job=await scalar(owner,'SELECT state,request_material,lease_token FROM canonical_v4.ingestion_jobs WHERE operation_id=$1',[initial.claim.operationId]);
     assert.equal(job.state,'leased');assert.equal(job.request_material,initial.claim.requestMaterial);assert.equal(job.lease_token,initial.claim.leaseToken);
     assert.equal((await scalar(owner,'SELECT active_operation_id FROM canonical_v4.catalog_ingest_lane WHERE singleton')).active_operation_id,initial.claim.operationId);
    }finally{await owner.exec('DROP TRIGGER semantic_test_insert_fault ON canonical_v4.semantic_observations; DROP FUNCTION canonical_v4.semantic_test_insert_fault()');}
   });
   await t.test(GROUPS[1].children[5],async()=>{
    A=await finish(initial);const s=await sourceState(owner,A.sourceId);assert.equal(s.write_version,'1');assert.equal(s.operation_id,initial.claim.operationId);
    const bound=await scalar(owner,`SELECT o.source_version::text,o.operation_digest,i.body_values,i.title_values,i.supported_path,i.semantic_eligible,
     i.body_wire_hash=encode(sha256(array_send(i.body_values)),'hex') body_exact,i.title_wire_hash=encode(sha256(array_send(i.title_values)),'hex') title_exact
     FROM canonical_v4.semantic_observations o JOIN canonical_v4.semantic_inputs i USING(source_id,operation_digest,matcher_hash) WHERE o.source_id=$1`,[A.sourceId]);
    assert.equal(bound.source_version,s.write_version);assert.equal(bound.operation_digest,initial.claim.operationDigest);assert.deepEqual(bound.body_values,axis(0));assert.deepEqual(bound.title_values,axis(0));
    assert.deepEqual(bound.supported_path,SUPPORTED_PATH);assert.equal(bound.semantic_eligible,true);assert.equal(bound.body_exact,true);assert.equal(bound.title_exact,true);
    const nodes=describeRootedHierarchyMatcher(matcher1).nodes;
    assert.deepEqual(groupSupportedSemanticPath(compileSemanticTopicGrouping({nodes,policy:defaultOwnerPolicy}),bound.supported_path).selectedPath,['games']);
    assert.deepEqual(groupSupportedSemanticPath(compileSemanticTopicGrouping({nodes,policy:await appFeeds.ownerPolicy()}),bound.supported_path).selectedPath,SUPPORTED_PATH);
    assert.deepEqual((await scalar(owner,'SELECT supported_path FROM canonical_v4.semantic_inputs WHERE source_id=$1',[A.sourceId])).supported_path,bound.supported_path);
    const receipt=await appIngest.receipt({operationId:initial.claim.operationId,operationDigest:initial.claim.operationDigest});assert.equal(receipt.sourceId,A.sourceId);
    originalDestination={topicId:s.topic_id,discussionId:s.discussion_id};
    const humanRequest={actorId:actor.id,requestId:'semantic-first-human-root',expected:await fixture.header(),
     command:{type:'create-root',topicId:A.topicId,body:'Invented real human canonical root',originSourceId:A.sourceId}};
    const posted=await appRuntime.command(humanRequest);humanRoot=posted.result.contributionId;
    assert.equal((await appRuntime.command(humanRequest)).result.contributionId,humanRoot);
    const expected=await fixture.header(),command={type:'share-insight',topicId:A.topicId,body:'Invented generated-root SQL fixture',operationId:'semantic-generated-operation',originSourceId:A.sourceId};
    const proof={kind:'generated-insight',operationId:command.operationId,actorId:actor.id,topicId:command.topicId,originSourceId:command.originSourceId,
     body:command.body,rootId:null,replyToId:null,discussionId:null};
    const generated=await appLifecycle.command(expected,command,actor,proof);aiRoot=generated.result.contributionId;
    assert.equal((await appLifecycle.command(expected,command,actor,proof)).result.contributionId,aiRoot);
    originalSnapshots=await rootSnapshots();assert.equal(originalSnapshots.length,2);
    for(const snapshot of originalSnapshots){assert.equal(snapshot.source_id,A.sourceId);assert.equal(snapshot.source_version,s.write_version);assert.equal(snapshot.generation,fixture.generation);
     assert.equal(snapshot.operation_id,initial.claim.operationId);assert.equal(snapshot.operation_digest,initial.claim.operationDigest);assert.deepEqual(snapshot.supported_path,SUPPORTED_PATH);
     assert.equal(snapshot.topic_id,s.topic_id);assert.equal(snapshot.discussion_id,s.discussion_id);assert.equal(snapshot.matcher_hash,hash1);}
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=ANY($1::text[])',[[humanRoot,aiRoot]])).n),4);
    for(const node of SUPPORTED_PATH){const refs=(await feed(node)).references;assert.equal(refs.length,2);
     for(const ref of refs){assert.ok([humanRoot,aiRoot].includes(ref.rootId));assert.equal(ref.topicId,s.topic_id);assert.equal(ref.discussionId,s.discussion_id);assert.match(ref.ordinal,/^[0-9]+$/u);}}
   });
   await t.test(GROUPS[1].children[6],async()=>{
    const before=await counts(owner),version=(await sourceState(owner,A.sourceId)).write_version;
    assert.equal((await appIngest.status({operationId:initial.claim.operationId,operationDigest:initial.claim.operationDigest})).state,'complete');
    const replay=await appIngest.enqueueInteractive(initial.input,{authorityToken:'semantic-replay-authority',authoritySeconds:30});assert.equal(replay.state,'complete');assert.equal(replay.replayed,true);
    assert.deepEqual(await counts(owner),before);assert.equal((await sourceState(owner,A.sourceId)).write_version,version);
    await assert.rejects(appIngest.enqueueInteractive({...initial.input,title:'Different payload same operation'}, {authorityToken:'semantic-forged-replay',authoritySeconds:30}),error=>error.code==='conflict');
   });
   await t.test(GROUPS[1].children[7],async()=>{
    const work=await queued('challenge',{title:'Just a moment...'});assert.deepEqual(work.prepared.decision.semanticPath,SUPPORTED_PATH);excluded=await finish(work,{representedValues:null});
    const input=await scalar(owner,'SELECT supported_path,semantic_eligible FROM canonical_v4.semantic_inputs WHERE source_id=$1',[excluded.sourceId]);assert.deepEqual(input.supported_path,[]);assert.equal(input.semantic_eligible,false);
    assert.notEqual(excluded.topicId,A.topicId);assert.equal((await sourceState(owner,excluded.sourceId)).method,'learned-provisional');
    const root=await humanPost('excluded',{topicId:excluded.topicId,sourceId:excluded.sourceId});
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots WHERE root_id=$1',[root.result.contributionId])).n),0);
   });
  });
  await test(GROUPS[2].name,async t=>{
   await t.test(GROUPS[2].children[0],async()=>{
    const before=await sourceState(owner,A.sourceId),calls=encoderCalls,work=await queued('renew',{url:initial.input.url,title:initial.input.title});
    assert.equal(work.claim.operationDigest,initial.claim.operationDigest);A=await finish(work);assert.equal((await sourceState(owner,A.sourceId)).write_version,String(Number(before.write_version)+1));
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_inputs WHERE source_id=$1',[A.sourceId])).n),1);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_observations WHERE source_id=$1',[A.sourceId])).n),2);assert.equal(encoderCalls,calls);
    assert.deepEqual(await rootSnapshots(),originalSnapshots);
   });
   await t.test(GROUPS[2].children[1],async()=>{
    const before=await sourceState(owner,A.sourceId),work=await queued('title-change',{url:initial.input.url,title:'Invented changed title only'});assert.notEqual(work.claim.operationDigest,initial.claim.operationDigest);
    A=await finish(work);assert.equal((await sourceState(owner,A.sourceId)).write_version,String(Number(before.write_version)+1));
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_inputs WHERE source_id=$1',[A.sourceId])).n),2);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_observations WHERE source_id=$1',[A.sourceId])).n),3);
    assert.deepEqual(await rootSnapshots(),originalSnapshots);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.contributions WHERE id=ANY($1::text[]) AND anchor_source_id IS NULL',[[humanRoot,aiRoot]])).n),2);
   });
   await t.test(GROUPS[2].children[2],async()=>{
    await appIngest.lifecycle(await fixture.header(),{type:'correct-source',sourceId:A.sourceId,topicId:MANUAL_TOPIC});
    const work=await queued('manual-retain',{url:initial.input.url,title:'Invented manual title refresh'});A=await finish(work);
    const s=await sourceState(owner,A.sourceId);assert.equal(A.topicId,MANUAL_TOPIC);assert.equal(A.assignment,'confirmed');assert.equal(s.topic_id,MANUAL_TOPIC);assert.equal(s.discussion_id,MANUAL_DISCUSSION);assert.equal(s.method,'manual-confirmed');
    assert.deepEqual(await rootSnapshots(),originalSnapshots);
    manualRoot=(await humanPost('manual-destination')).result.contributionId;
    const snapshot=await scalar(owner,'SELECT topic_id,discussion_id,source_version::text,supported_path FROM canonical_v4.semantic_root_snapshots WHERE root_id=$1',[manualRoot]);
    assert.equal(snapshot.topic_id,MANUAL_TOPIC);assert.equal(snapshot.discussion_id,MANUAL_DISCUSSION);assert.equal(snapshot.source_version,s.write_version);assert.deepEqual(snapshot.supported_path,SUPPORTED_PATH);
    const reply=await appRuntime.command({actorId:actor.id,requestId:'semantic-historical-human-reply',expected:await fixture.header(),
     command:{type:'reply',discussionId:originalDestination.discussionId,rootId:humanRoot,replyToId:humanRoot,body:'Reply remains in its original canonical discussion',originSourceId:A.sourceId}});
    const stored=await scalar(owner,'SELECT discussion_id,root_id FROM canonical_v4.contributions WHERE id=$1',[reply.result.contributionId]);assert.equal(stored.discussion_id,originalDestination.discussionId);assert.equal(stored.root_id,humanRoot);
    const refs=(await feed('invented-game-branch')).references;assert.equal(refs.length,3);
    assert.equal(refs.find(r=>r.rootId===manualRoot).discussionId,MANUAL_DISCUSSION);assert.equal(refs.find(r=>r.rootId===humanRoot).discussionId,originalDestination.discussionId);
   });
   await t.test(GROUPS[2].children[3],async()=>{
    const work=await queued('held-head',{url:initial.input.url,title:'Invented manual title refresh'}),entered=deferred(),release=deferred();
    const ownerPid=Number((await scalar(owner,'SELECT pg_backend_pid() pid')).pid);
    await owner.exec("SET lock_timeout='3000ms'");
    let control=null,activation=null;
    const held=worker.transaction(async tx=>{try{const receipt=await finish(work,{database:tx});entered.resolve(receipt);await release.promise;return receipt;}catch(error){entered.reject(error);throw error;}});
    void held.catch(()=>{});
    try{
     await entered.promise;
     // Owner activation uses its own physical connection; observe its actual
     // lock wait instead of inferring contention from an arbitrary sleep.
     const head=await scalar(observer,'SELECT revision::text FROM canonical_v4.semantic_installation WHERE singleton');
     control=ownerSemantic.activateMatcher({matcherIdentityHash:hash2,expectedRevision:Number(head.revision)});void control.catch(()=>{});
     const until=Date.now()+1500;let waiting=false;
     while(Date.now()<until){const row=await scalar(observer,"SELECT coalesce((SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=$1),false) waiting",[ownerPid]);if(row.waiting){waiting=true;break;}await sleep(10);}
     assert.equal(waiting,true,'owner CAS actually waits for the worker-held CURRENT share');
     assert.equal((await appIngest.status({operationId:work.claim.operationId,operationDigest:work.claim.operationDigest})).state,'leased','unrelated app MVCC status remains readable before commit');
     assert.equal((await feed('invented-game-branch')).references.length,3,'public semantic feed remains MVCC-readable while head activation waits');
    }finally{
     release.resolve();const results=await Promise.allSettled([held,...(control?[control]:[])]);await owner.exec('SET lock_timeout=DEFAULT');
     for(const result of results)if(result.status==='rejected')throw result.reason;
     A=results[0].value;activation=results[1]?.value;
    }
    assert.equal(activation.matcherIdentityHash,hash2);assert.equal((await appIngest.status({operationId:work.claim.operationId,operationDigest:work.claim.operationDigest})).state,'complete');
   });
   await t.test(GROUPS[2].children[4],async()=>{
    const destination=await sourceState(owner,A.sourceId);
    await appLifecycle.command(await fixture.header(),{type:'withdraw',contributionId:aiRoot},actor);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=$1',[aiRoot])).n),0);
    const visible=(await feed('invented-game-branch')).references;assert.equal(visible.some(r=>r.rootId===aiRoot),false);
    assert.deepEqual(visible.map(r=>r.rootId).sort(),[humanRoot,manualRoot].sort());
    const rollback=new Error('controlled visibility rollback');
    await assert.rejects(owner.transaction(async tx=>{
     await tx.query(`UPDATE canonical_v4.contributions SET visibility='local-private',
      payload=jsonb_set(payload::jsonb,'{visibility}','"local-private"'::jsonb)::text WHERE id=$1`,[humanRoot]);
     assert.equal(Number((await scalar(tx,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=$1',[humanRoot])).n),0);
     const hidden=await createCanonicalV4SemanticDiscussionRepository({database:tx}).feedReferences({generation:fixture.generation,nodeId:'invented-game-branch',beforeOrdinal:null,limit:100});
     assert.deepEqual(hidden.references.map(r=>r.rootId),[manualRoot]);throw rollback;
    }),error=>error===rollback);
    assert.deepEqual((await feed('invented-game-branch')).references.map(r=>r.rootId).sort(),[humanRoot,manualRoot].sort());
    await appIngest.lifecycle(await fixture.header(),{type:'forget-source',sourceId:A.sourceId});
    const erased=await scalar(owner,`SELECT (SELECT count(*) FROM canonical_v4.sources WHERE id=$1)::integer sources,
     (SELECT count(*) FROM canonical_v4.semantic_inputs WHERE source_id=$1)::integer inputs,
     (SELECT count(*) FROM canonical_v4.semantic_observations WHERE source_id=$1)::integer observations`,[A.sourceId]);assert.deepEqual(erased,{sources:0,inputs:0,observations:0});
    assert.equal((await scalar(owner,'SELECT id FROM canonical_v4.discussions WHERE id=$1',[destination.discussion_id])).id,MANUAL_DISCUSSION);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots WHERE source_id=$1',[A.sourceId])).n),0);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=ANY($1::text[])',[[humanRoot,aiRoot,manualRoot]])).n),0);
    assert.deepEqual((await feed('invented-game-branch')).references,[]);
    const retained=(await owner.query('SELECT id,discussion_id FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[[humanRoot,aiRoot,manualRoot]])).rows;
    assert.equal(retained.length,3);for(const row of retained)assert.equal(row.discussion_id,row.id===manualRoot?MANUAL_DISCUSSION:originalDestination.discussionId);
   });
   await t.test(GROUPS[2].children[5],async()=>{
    const firstName=fixture.databaseName;await closeA();
    fixtureB=await acquireFixture();workerB=await fixtureB.connect('murmingle_ingest_worker');assert.notEqual(fixtureB.databaseName,firstName);
    assert.equal((await fixtureB.header()).generation,fixtureB.generation);
    const db=fixtureB.database;assert.equal(Number((await scalar(db,'SELECT count(*) n FROM canonical_v4.semantic_matchers')).n),0);
    assert.deepEqual(await createCanonicalV4SemanticDiscussionRepository({database:db}).ownerPolicy(),{revision:0,defaultMaxDepth:1,overrides:[]});
    assert.equal(Number((await scalar(db,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots')).n),0);
    assert.deepEqual(await scalar(db,'SELECT revision::text,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton'),{revision:'0',matcher_hash:null});
    await denied(workerB,REGISTER,[identity1]);await assert.rejects(semantic(workerB).apply(initial.claim,{representedValues:axis(0),preparation:initial.prepared}),error=>error.code==='conflict');
    const c=await counts(db);assert.equal(c.sources,0);assert.equal(c.inputs,0);assert.equal(c.observations,0);
   });
  });
 }finally{
  await preparation.close();
  try{await closeA();}finally{try{if(workerB)await workerB.close();}finally{if(fixtureB)await fixtureB.close();}}
 }
}
