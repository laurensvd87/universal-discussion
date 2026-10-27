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
import {createCanonicalV4SemanticSourceRepository} from '../canonical-v4/semantic-source-repository.js';
import {createStoredSourceHierarchyPreparation} from '../canonical-v4/semantic-source-preparation.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../../src/http/request-handler.js';
import {readSemanticFeed,readSemanticThread,readSemanticTarget,readSemanticTopics,readSemanticContext} from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {sourceStamp} from '../../src/domain/source-threads.js';
import {RIDGE_PARAMETER_SHA256} from '../../src/domain/ridge-topic-adapter.js';
import semanticGroups from './semantic-native-cases.json' with {type:'json'};
import {runSemanticInsightNativeAssertions} from './semantic-insight-native-assertions.js';

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
const PRIVATE_CONTAINER=LEGACY.replace('canonical_v4.ingest_apply(','canonical_v4.semantic_apply_source_container(');

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
 let humanRoot,aiRoot,manualRoot,legacyRoot,originalSnapshots,originalDestination,defaultOwnerPolicy,reads,service,workerSources,ownerSources;
 let storedEncoderCalls=0;
 let ridgeDefinition=null;
 let erasedWitnessRequest=null;
 let semanticAiEvidence=null;
 let erasedSemanticInsight=null;
 const actor=Object.freeze({id:'demo-alex',type:'human',demo:true});
 const nextId=kind=>`semantic-${kind}-${++serial}`,now=()=>new Date().toISOString();
 const preparation=createHierarchyIngestionPreparation({matcher:matcher1,embedTitle:async()=>{encoderCalls++;return {modelId:MODEL,values:axis(0)};}});
 const storedPreparation=createStoredSourceHierarchyPreparation({matcher:matcher2,embedTitle:async()=>{storedEncoderCalls++;return {modelId:MODEL,values:axis(0)};}});
 const repo=database=>createCanonicalV4IngestionRepository({database,nextId,now});
 const semantic=database=>createCanonicalV4SemanticRepository({database,nextId,now});
 const feed=(nodeId='games')=>appFeeds.feedReferences({generation:fixture.generation,nodeId,beforeOrdinal:null,limit:100});
 const rootSnapshots=()=>owner.query(`SELECT root_id,source_id,source_version::text,matcher_hash,generation,operation_id,operation_digest,supported_path,topic_id,discussion_id,root_ordinal::text
  FROM canonical_v4.semantic_root_snapshots WHERE root_id=ANY($1::text[]) ORDER BY root_id`,[[humanRoot,aiRoot].filter(Boolean)]).then(r=>r.rows);
 function publicMetadata(value){
  const forbidden=new Set(['embedding','body','operationId','operationDigest','matcherIdentityHash','receipt','url','provenance','nativeObservation','assignmentAuthority']);
  function check(v){if(v&&typeof v==='object')for(const [key,child] of Object.entries(v)){assert.equal(forbidden.has(key),false,'public semantic metadata omits private material');check(child);}}
  check(value);return value;
 }
 const topics=async()=>readSemanticTopics(publicMetadata(await service.semanticTopics({})));
 const context=async sourceId=>readSemanticContext(publicMetadata(await service.semanticContext({sourceId})),{sourceId});
 const target=async(rootId,targetId=rootId)=>{const request={nodeId:'invented-game-branch',rootId,targetId};return readSemanticTarget(await service.semanticTarget(request),request);};
 const witnessed=(view,body)=>({type:'reply',discussionId:view.discussionId,rootId:view.root.id,replyToId:view.targetId,body,originSourceId:null,
  semanticTarget:{nodeId:view.nodeId,topicId:view.topic.id,rootRevision:view.rootRevision,targetRevision:view.targetRevision}});
 const appendState=database=>scalar(database??owner,`SELECT
  (SELECT count(*)::integer FROM canonical_v4.id_registry) ids,
  (SELECT count(*)::integer FROM canonical_v4.contributions) contributions,
  (SELECT count(*)::integer FROM canonical_v4.revisions) revisions,
  (SELECT count(*)::integer FROM canonical_v4.command_receipts) receipts,
  (SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton) revision`);
 async function rejectWitness(request,expectedCode='conflict'){
  const before=await appendState();await assert.rejects(appRuntime.command(request),error=>error.code===expectedCode);assert.deepEqual(await appendState(),before);
 }
 async function humanPost(label,{topicId=A.topicId,sourceId=A.sourceId}={}){
  return appRuntime.command({actorId:actor.id,requestId:'semantic-post-'+label,expected:await fixture.header(),
   command:{type:'create-root',topicId,body:'Invented human SQL root '+label,originSourceId:sourceId}});
 }
 async function canonicalState(){return scalar(owner,`SELECT
   (SELECT row_to_json(m)::text FROM canonical_v4.meta m WHERE singleton) meta,
   (SELECT row_to_json(r)::text FROM canonical_v4.runtime_state r WHERE singleton) runtime,
   (SELECT row_to_json(l)::text FROM canonical_v4.catalog_ingest_lane l WHERE singleton) lane,
   (SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.ordinal),'[]'::jsonb)::text FROM canonical_v4.ingestion_jobs j) jobs,
   (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb)::text FROM canonical_v4.sources s) sources,
   (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.source_id),'[]'::jsonb)::text FROM canonical_v4.embeddings e) embeddings,
   (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.source_id),'[]'::jsonb)::text FROM canonical_v4.operation_receipts r) receipts`);}
 async function importVersionZero({legacyMulti=false}={}){
  const sourceId=nextId('source-zero'),operationId=legacyMulti?'semantic-import-legacy-multi':'semantic-import-zero',values=axis(0);
  if(!legacyMulti){values[0]=Math.sqrt(.5);values[2]=Math.sqrt(.5);}
  const input={url:'https://semantic.example.org/'+(legacyMulti?'imported-legacy-multi':'imported-version-zero'),title:'Invented genuine default-zero import',embedding:{modelId:MODEL,values},extractorVersion:'crawler-static-html-prefix/v1'};
  const operationDigest=digest(input),stamp=sourceStamp(input),policyVersion='ridge1-fixed-reference-radius/v1';
  const topicIds=legacyMulti?[MANUAL_TOPIC,originalDestination.topicId].sort():[MANUAL_TOPIC],method=legacyMulti?'learned-provisional':'manual-confirmed';
  const payload={id:sourceId,...input,provenance:'owner-local-page-embedding/v1',operationId,operationDigest,policyVersion,topicIds};
  await owner.transaction(async tx=>{
   await tx.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'sources')",[sourceId]);
   // Deliberately OMIT write_version: this exercises canonical import DEFAULT0,
   // never a decrement or an invented canonical refresh operation.
   await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
    VALUES($1,nextval('canonical_v4.source_ordinal_sequence'),$2,$3,$4,'owner-local-page-embedding/v1',$5,$6,$7,true)`,[sourceId,JSON.stringify(payload),input.url,input.title,input.extractorVersion,policyVersion,operationId]);
   await tx.query('INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES($1,$2,$3,384,$4::double precision[])',[sourceId,JSON.stringify(input.embedding),MODEL,wire(values)]);
   await tx.query('INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest) VALUES($1,$2,$3)',[sourceId,operationId,operationDigest]);
   await tx.query('INSERT INTO canonical_v4.runtime_source_stamps(source_id,stamp,postable) VALUES($1,$2,true)',[sourceId,stamp]);
   for(let ordinal=0;ordinal<topicIds.length;ordinal++)await tx.query('INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) VALUES($1,$2,$3)',[sourceId,topicIds[ordinal],ordinal]);
   await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES($1,$2,nextval('canonical_v4.source_link_ordinal_sequence'),$3,$4)`,
    [sourceId,MANUAL_TOPIC,JSON.stringify({sourceId,topicId:MANUAL_TOPIC,method}),method]);
  });
  assert.equal((await sourceState(owner,sourceId)).write_version,'0');return {sourceId,values,url:input.url,topicIds,policyVersion};
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
  let restoreFailed=false,restoreError;
  if(ridgeDefinition&&owner)try{
   await owner.exec(ridgeDefinition);
   assert.equal((await scalar(owner,"SELECT pg_get_functiondef('canonical_v4.ingest_ridge_scan(double precision[],text)'::regprocedure) definition")).definition,ridgeDefinition);
  }catch(error){restoreFailed=true;restoreError=error;}finally{ridgeDefinition=null;}
  const clients=[observer,submitter,app,worker];observer=submitter=app=worker=null;
  const closed=await Promise.allSettled(clients.filter(Boolean).map(client=>client.close()));
  const saved=fixture;fixture=null;owner=null;if(saved)await saved.close();
  for(const result of closed)if(result.status==='rejected')throw result.reason;
  if(restoreFailed)throw restoreError;
 }
 try{
  await test(GROUPS[0].name,async t=>{
   fixture=await acquireFixture();owner=fixture.database;
   worker=await fixture.connect('murmingle_ingest_worker');app=await fixture.connect('murmingle_app');
   submitter=await fixture.connect('murmingle_crawler_submitter');observer=await fixture.connect('postgres');
   ownerSemantic=semantic(owner);workerSemantic=semantic(worker);appIngest=repo(app);workerIngest=repo(worker);
   ownerFeeds=createCanonicalV4SemanticDiscussionRepository({database:owner});appFeeds=createCanonicalV4SemanticDiscussionRepository({database:app});
   appRuntime=createCanonicalV4RuntimeRepository({database:app,nextId,now});appLifecycle=createCanonicalV4LifecycleRepository({database:app,nextId,now});
   reads=createCanonicalV4ReadFacade({database:app});service=createPostgresCanonicalService({reads,runtime:appRuntime,lifecycle:appLifecycle,semanticDiscussions:true});
   workerSources=createCanonicalV4SemanticSourceRepository({database:worker});ownerSources=createCanonicalV4SemanticSourceRepository({database:owner});
   await t.test(GROUPS[0].children[0],async()=>{
    const c=await counts(owner);assert.equal(c.sources,0);assert.equal(c.inputs,0);assert.equal(c.observations,0);
    assert.deepEqual(await scalar(owner,'SELECT revision::text,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton'),{revision:'0',matcher_hash:null});
    assert.equal(Number((await scalar(owner,`SELECT count(*) n FROM information_schema.tables WHERE table_schema='canonical_v4'
     AND table_name IN('semantic_matchers','semantic_nodes','semantic_installation','semantic_inputs','semantic_observations',
       'semantic_root_snapshots','semantic_root_edges','semantic_owner_policy','semantic_material_state')`)).n),9);
    defaultOwnerPolicy=await appFeeds.ownerPolicy();assert.deepEqual(defaultOwnerPolicy,{revision:0,defaultMaxDepth:1,overrides:[]});
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots')).n),0);
    const semanticStamp=await reads.semanticStamp();assert.equal(semanticStamp.generation,fixture.generation);assert.match(semanticStamp.revision,/^[a-f0-9]{64}$/u);
    assert.deepEqual(await scalar(worker,'SELECT * FROM canonical_v4.semantic_read_revision()'),semanticStamp);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.schema_migrations')).n),9);
    assert.deepEqual((await topics()).topics,[]);
    await assert.rejects(service.semanticContext({sourceId:'unknown-semantic-source'}),e=>e.code==='not-found');
    assert.equal((await scalar(owner,'SELECT id FROM canonical_v4.discussions WHERE id=$1 AND topic_id=$2',[MANUAL_DISCUSSION,MANUAL_TOPIC])).id,MANUAL_DISCUSSION);
   });
   await t.test(GROUPS[0].children[1],async()=>{
    const a=await ownerSemantic.registerMatcher(matcher1),b=await ownerSemantic.registerMatcher(matcher1);assert.deepEqual(a,b);assert.equal(a.matcherIdentityHash,hash1);assert.equal(a.activated,false);
    const row=await scalar(owner,'SELECT count(*)::integer n FROM canonical_v4.semantic_matchers');assert.equal(row.n,1);
    const registered=await scalar(owner,'SELECT identity_text FROM canonical_v4.semantic_matchers WHERE matcher_hash=$1',[hash1]);assert.equal(registered.identity_text,identity1);
    assert.equal((await scalar(owner,'SELECT matcher_hash FROM canonical_v4.semantic_installation WHERE singleton')).matcher_hash,null);
   });
   await t.test(GROUPS[0].children[2],async()=>{
    await denied(app,PRIVATE_CONTAINER,Array(11).fill(null));
    await denied(app,REGISTER,[identity1]);await denied(app,ACTIVATE,[hash1,0]);
    await denied(app,'UPDATE canonical_v4.semantic_installation SET revision=revision');
    await denied(app,'SELECT * FROM canonical_v4.semantic_inputs');
    await denied(app,'SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[0,1,'[]']);
    await denied(app,'UPDATE canonical_v4.semantic_owner_policy SET revision=revision');
    await denied(app,'UPDATE canonical_v4.semantic_root_snapshots SET root_ordinal=root_ordinal');
    assert.deepEqual((await feed()).references,[]);assert.equal((await appFeeds.ownerPolicy()).revision,0);
    assert.deepEqual((await scalar(app,'SELECT canonical_v4.semantic_read_topic_nodes($1) metadata',[fixture.generation])).metadata.nodes,[]);
    await assert.rejects(app.query('SELECT canonical_v4.semantic_read_source_context($1,$2)',[fixture.generation,'unknown-semantic-source']),sqlCode('P1242'));
    await denied(app,'SELECT * FROM canonical_v4.semantic_read_source_candidates($1,$2,$3,$4)',[fixture.generation,hash1,null,50]);
    await denied(app,'SELECT * FROM canonical_v4.semantic_reclassify_stored_sources($1,$2,$3::jsonb)',[fixture.generation,hash1,'[]']);
    await denied(app,'SELECT * FROM canonical_v4.semantic_adopt_legacy_roots($1,$2,$3::jsonb)',[fixture.generation,hash1,'[]']);
    await denied(app,'UPDATE canonical_v4.semantic_material_state SET revision=revision');
   });
   await t.test(GROUPS[0].children[3],async()=>{
    await denied(worker,'SELECT * FROM canonical_v4.semantic_insight_evidence($1)',['unknown-semantic-source']);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_insight_evidence($1)',['unknown-semantic-source']);
    await denied(submitter,PRIVATE_CONTAINER,Array(11).fill(null));
    await denied(submitter,REGISTER,[identity1]);await denied(submitter,ACTIVATE,[hash1,0]);await denied(submitter,APPLY,Array(14).fill(null));
    await denied(submitter,'SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[0,1,'[]']);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_read_feed($1,$2,$3,$4)',[fixture.generation,'games',null,10]);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_read_owner_policy()');
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_read_revision()');
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_read_source_candidates($1,$2,$3,$4)',[fixture.generation,hash1,null,50]);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_reclassify_stored_sources($1,$2,$3::jsonb)',[fixture.generation,hash1,'[]']);
    await denied(submitter,'SELECT * FROM canonical_v4.semantic_adopt_legacy_roots($1,$2,$3::jsonb)',[fixture.generation,hash1,'[]']);
    await denied(submitter,'SELECT canonical_v4.semantic_read_topic_nodes($1)',[fixture.generation]);
    await denied(submitter,'SELECT canonical_v4.semantic_read_source_context($1,$2)',[fixture.generation,'unknown-semantic-source']);
   });
   await t.test(GROUPS[0].children[4],async()=>{
    await denied(worker,PRIVATE_CONTAINER,Array(11).fill(null));
    await denied(worker,LEGACY,Array(11).fill(null));await denied(worker,REGISTER,[identity1]);await denied(worker,ACTIVATE,[hash1,0]);
    await denied(worker,'UPDATE canonical_v4.semantic_matchers SET identity_text=identity_text');
    await denied(worker,'DELETE FROM canonical_v4.semantic_observations');
    await denied(worker,'SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[0,1,'[]']);
    await denied(worker,'DELETE FROM canonical_v4.semantic_root_edges');await denied(worker,'UPDATE canonical_v4.semantic_owner_policy SET revision=revision');
    await denied(worker,'SELECT * FROM canonical_v4.semantic_read_feed($1,$2,$3,$4)',[fixture.generation,'games',null,10]);
    await denied(worker,'SELECT * FROM canonical_v4.semantic_adopt_legacy_roots($1,$2,$3::jsonb)',[fixture.generation,hash1,'[]']);
    await denied(worker,'UPDATE canonical_v4.semantic_material_state SET revision=revision');
    assert.deepEqual((await scalar(worker,'SELECT canonical_v4.semantic_read_topic_nodes($1) metadata',[fixture.generation])).metadata.nodes,[]);
    await denied(worker,'SELECT canonical_v4.semantic_read_source_context($1,$2)',[fixture.generation,'unknown-semantic-source']);
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
    ridgeDefinition=(await scalar(owner,"SELECT pg_get_functiondef('canonical_v4.ingest_ridge_scan(double precision[],text)'::regprocedure) definition")).definition;
    assert.equal(typeof ridgeDefinition,'string');
    await owner.exec(`CREATE OR REPLACE FUNCTION canonical_v4.ingest_ridge_scan(candidate double precision[],p_parameter_sha256 text)
     RETURNS TABLE(topic_id text,similarity double precision) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
     BEGIN RAISE EXCEPTION 'Owned fixture Ridge routing sentinel' USING ERRCODE='P1491'; END $$`);
    const legacyBefore=await canonicalState();
    await assert.rejects(owner.query(LEGACY,rawParameters(initial).slice(0,11)),sqlCode('P1491'));
    assert.deepEqual(await canonicalState(),legacyBefore);assert.deepEqual(await counts(owner),before);
    await owner.exec(`CREATE FUNCTION canonical_v4.semantic_test_insert_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled semantic insert fault' USING ERRCODE='P0001'; END $$;
     CREATE TRIGGER semantic_test_insert_fault BEFORE INSERT ON canonical_v4.semantic_observations FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_test_insert_fault()`);
    try{
     await assert.rejects(worker.query(APPLY,rawParameters(initial)),sqlCode('P0001'));
     await assert.rejects(finish(initial),error=>error.code==='storage-failure');assert.deepEqual(await counts(owner),before);
     const job=await scalar(owner,'SELECT state,request_material,lease_token FROM canonical_v4.ingestion_jobs WHERE operation_id=$1',[initial.claim.operationId]);
     assert.equal(job.state,'leased');assert.equal(job.request_material,initial.claim.requestMaterial);assert.equal(job.lease_token,initial.claim.leaseToken);
     assert.equal((await scalar(owner,'SELECT active_operation_id FROM canonical_v4.catalog_ingest_lane WHERE singleton')).active_operation_id,initial.claim.operationId);
    }finally{await owner.exec('DROP TRIGGER semantic_test_insert_fault ON canonical_v4.semantic_observations; DROP FUNCTION canonical_v4.semantic_test_insert_fault()');}
   });
   await t.test(GROUPS[1].children[5],async()=>{
    A=await finish(initial);const s=await sourceState(owner,A.sourceId);assert.equal(s.write_version,'1');assert.equal(s.operation_id,initial.claim.operationId);
    assert.equal((await scalar(owner,'SELECT policy_version FROM canonical_v4.sources WHERE id=$1',[A.sourceId])).policy_version,'hierarchy-source-container/v1');
    const bound=await scalar(owner,`SELECT o.source_version::text,o.operation_digest,i.body_values,i.title_values,i.supported_path,i.semantic_eligible,
     i.body_wire_hash=encode(sha256(array_send(i.body_values)),'hex') body_exact,i.title_wire_hash=encode(sha256(array_send(i.title_values)),'hex') title_exact
     FROM canonical_v4.semantic_observations o JOIN canonical_v4.semantic_inputs i USING(source_id,operation_digest,matcher_hash) WHERE o.source_id=$1`,[A.sourceId]);
    assert.equal(bound.source_version,s.write_version);assert.equal(bound.operation_digest,initial.claim.operationDigest);assert.deepEqual(bound.body_values,axis(0));assert.deepEqual(bound.title_values,axis(0));
    assert.deepEqual(bound.supported_path,SUPPORTED_PATH);assert.equal(bound.semantic_eligible,true);assert.equal(bound.body_exact,true);assert.equal(bound.title_exact,true);
    const nodes=describeRootedHierarchyMatcher(matcher1).nodes;
    assert.deepEqual(groupSupportedSemanticPath(compileSemanticTopicGrouping({nodes,policy:defaultOwnerPolicy}),bound.supported_path).selectedPath,['games']);
    assert.deepEqual(groupSupportedSemanticPath(compileSemanticTopicGrouping({nodes,policy:await appFeeds.ownerPolicy()}),bound.supported_path).selectedPath,SUPPORTED_PATH);
    assert.deepEqual((await scalar(owner,'SELECT supported_path FROM canonical_v4.semantic_inputs WHERE source_id=$1',[A.sourceId])).supported_path,bound.supported_path);
    const priorPolicy=await appFeeds.ownerPolicy(),canonicalBeforePolicy=await canonicalState(),numericBeforePolicy=await counts(owner);
    const broad=await ownerFeeds.setOwnerPolicy({expectedRevision:priorPolicy.revision,defaultMaxDepth:1,overrides:[]});
    const coarse=await context(A.sourceId);assert.equal(coarse.status,'classified');assert.equal(coarse.sourceVersion,s.write_version);
    assert.deepEqual(coarse.supportedPath,SUPPORTED_PATH);assert.deepEqual(coarse.selectedPath,['games']);
    assert.deepEqual(coarse.topic,{id:'games',title:'Games',path:['games']});assert.equal(coarse.policyRevision,broad.revision);
    assert.deepEqual((await topics()).topics.map(card=>card.id),['games','nature']);
    let rrMode=false,switched=false,restoredPolicy;
    // Observe the real app transaction, preserving every SQL result. Switch the
    // actual owner policy on the existing owner connection between topology and
    // policy reads: RR must retain its earlier coherent metadata projection.
    const rrReads=createCanonicalV4ReadFacade({database:{query:(...args)=>app.query(...args),transaction:work=>app.transaction(async tx=>work({dialect:'pg',query:async(sql,args=[])=>{
     const result=await tx.query(sql,args);
     if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'){
      assert.deepEqual(await scalar(tx,"SELECT current_setting('transaction_isolation') isolation,current_setting('transaction_read_only') read_only"),{isolation:'repeatable read',read_only:'on'});rrMode=true;
     }
     if(sql==='SELECT canonical_v4.semantic_read_topic_nodes($1) AS metadata'&&!switched){
      restoredPolicy=await ownerFeeds.setOwnerPolicy({expectedRevision:broad.revision,defaultMaxDepth:priorPolicy.defaultMaxDepth,overrides:priorPolicy.overrides});switched=true;
     }
     return result;
    }}))}});
    const stable=readSemanticContext(publicMetadata(await rrReads.semanticContext({sourceId:A.sourceId})),{sourceId:A.sourceId});
    assert.equal(rrMode,true);assert.equal(switched,true);assert.equal(stable.policyRevision,broad.revision);assert.deepEqual(stable.selectedPath,['games']);
    const specific=await context(A.sourceId);assert.equal(specific.policyRevision,restoredPolicy.revision);assert.deepEqual(specific.supportedPath,SUPPORTED_PATH);
    assert.deepEqual(specific.selectedPath,SUPPORTED_PATH);assert.deepEqual(specific.topic,{id:'invented-game-branch',title:'invented-game-branch',path:SUPPORTED_PATH});
    const directory=await topics();assert.equal(directory.policyRevision,restoredPolicy.revision);
    assert.deepEqual(directory.topics.map(card=>card.id),['games','invented-game-branch','nature']);
    assert.deepEqual(directory.topics.find(card=>card.id==='invented-game-branch').path,SUPPORTED_PATH);
    assert.deepEqual(await canonicalState(),canonicalBeforePolicy);assert.deepEqual(await counts(owner),numericBeforePolicy);
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
    const first=await reads.semanticFeed({nodeId:'invented-game-branch',limit:1,cursor:null});assert.equal(first.roots.length,1);assert.ok(first.nextCursor);
    const second=await reads.semanticFeed({nodeId:'invented-game-branch',limit:1,cursor:first.nextCursor});assert.equal(second.roots.length,1);assert.equal(second.nextCursor,null);
    const cards=[...first.roots,...second.roots];assert.deepEqual(cards.map(c=>c.root.id).sort(),[humanRoot,aiRoot].sort());
    for(const card of cards){assert.equal(card.topic.id,s.topic_id);assert.equal(card.discussionId,s.discussion_id);assert.equal(card.root.origin.sourceId,A.sourceId);
     assert.equal(card.root.body,card.root.id===humanRoot?humanRequest.command.body:command.body);}
    await assert.rejects(reads.semanticThread({nodeId:'nature',rootId:humanRoot,limit:1,cursor:null}),e=>e.code==='not-found');
    await assert.rejects(reads.semanticThread({nodeId:'games',rootId:'not-a-canonical-root',limit:1,cursor:null}),e=>e.code==='not-found');
    const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-semantic-native-handler'};
    const response=await createRequestHandler({config,service})({method:'POST',url:'/v1/semantic/feed',headers:{host:config.hostHeader,origin:config.origin,
     authorization:'Bearer '+config.capability,'content-type':'application/json'},body:JSON.stringify({nodeId:'games',limit:1,cursor:null})});
    assert.equal(response.status,200);const http=JSON.parse(response.body);assert.equal(http.roots.length,1);assert.ok([humanRoot,aiRoot].includes(http.roots[0].root.id));
    assert.equal(http.roots[0].discussionId,s.discussion_id);assert.equal(http.roots[0].root.origin.sourceId,A.sourceId);
    const peerWork=await queued('same-vector-distinct-page',{title:initial.input.title}),peer=await finish(peerWork),peerState=await sourceState(owner,peer.sourceId);
    semanticAiEvidence={receipt:peer,input:peerWork.input};
    assert.notEqual(peer.topicId,A.topicId);assert.notEqual(peerState.discussion_id,s.discussion_id);
    assert.equal((await scalar(owner,'SELECT policy_version FROM canonical_v4.sources WHERE id=$1',[peer.sourceId])).policy_version,'hierarchy-source-container/v1');
    assert.deepEqual((await context(peer.sourceId)).supportedPath,SUPPORTED_PATH);
    const peerRoot=(await humanPost('same-vector-distinct-container',{topicId:peer.topicId,sourceId:peer.sourceId})).result.contributionId;
    const peerRef=(await feed('invented-game-branch')).references.find(ref=>ref.rootId===peerRoot);
    assert.ok(peerRef);assert.equal(peerRef.topicId,peer.topicId);assert.equal(peerRef.discussionId,peerState.discussion_id);
    assert.deepEqual(await rootSnapshots(),originalSnapshots,'distinct semantic peers never retarget original canonical roots');
    // Retain the peer Source/container, withdraw only this fixture's extra root
    // so subsequent original feed/erasure assertions retain their exact cohort.
    await appLifecycle.command(await fixture.header(),{type:'withdraw',contributionId:peerRoot},actor);
    assert.equal((await feed('invented-game-branch')).references.length,2);
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
    const excludedContext=await context(excluded.sourceId);assert.equal(excludedContext.status,'excluded');assert.deepEqual(excludedContext.supportedPath,[]);assert.deepEqual(excludedContext.selectedPath,[]);assert.equal(excludedContext.topic,null);
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
    // Explicit owner import models a genuine legacy DEFAULT0 Source: old Radius
    // policy, provisional primary route and both original membership rows.
    const importedLegacy=await importVersionZero({legacyMulti:true});
    const membershipsBefore=(await owner.query('SELECT source_id,topic_id,ordinal FROM canonical_v4.topic_memberships WHERE source_id=$1 ORDER BY topic_id',[importedLegacy.sourceId])).rows;
    const linkBefore=await scalar(owner,'SELECT source_id,topic_id,ordinal::text,payload,method FROM canonical_v4.source_links WHERE source_id=$1',[importedLegacy.sourceId]);
    assert.equal(membershipsBefore.length,2);assert.equal(linkBefore.method,'learned-provisional');
    const matchingBefore=(await scalar(owner,'SELECT matching_version::text FROM canonical_v4.runtime_state WHERE singleton')).matching_version;
    const legacyWork=await queued('legacy-multi-renew',{url:importedLegacy.url,title:'Changed genuine legacy multi-membership title'});
    const renewedLegacy=await finish(legacyWork,{representedValues:axis(1)});
    assert.equal(renewedLegacy.sourceId,importedLegacy.sourceId);assert.equal((await sourceState(owner,importedLegacy.sourceId)).write_version,'1');
    assert.deepEqual((await owner.query('SELECT source_id,topic_id,ordinal FROM canonical_v4.topic_memberships WHERE source_id=$1 ORDER BY topic_id',[importedLegacy.sourceId])).rows,membershipsBefore);
    assert.deepEqual(await scalar(owner,'SELECT source_id,topic_id,ordinal::text,payload,method FROM canonical_v4.source_links WHERE source_id=$1',[importedLegacy.sourceId]),linkBefore);
    const retainedPolicy=await scalar(owner,"SELECT policy_version,payload::jsonb->>'policyVersion' payload_policy,payload::jsonb->'topicIds' topic_ids FROM canonical_v4.sources WHERE id=$1",[importedLegacy.sourceId]);
    assert.equal(retainedPolicy.policy_version,importedLegacy.policyVersion);assert.equal(retainedPolicy.payload_policy,importedLegacy.policyVersion);assert.deepEqual(retainedPolicy.topic_ids,importedLegacy.topicIds);
    assert.equal((await scalar(owner,'SELECT matching_version::text FROM canonical_v4.runtime_state WHERE singleton')).matching_version,String(BigInt(matchingBefore)+1n));
    assert.deepEqual((await context(importedLegacy.sourceId)).supportedPath,SUPPORTED_PATH,'numeric hierarchy uses actual body/title input independently of legacy represented vector');
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
    const replyIds=[reply.result.contributionId],bodies=new Map([[reply.result.contributionId,'Reply remains in its original canonical discussion']]);
    for(let i=0;i<2;i++){const body='Additional selected-root reply '+i,r=await appRuntime.command({actorId:actor.id,requestId:'semantic-paged-reply-'+i,expected:await fixture.header(),
     command:{type:'reply',discussionId:originalDestination.discussionId,rootId:humanRoot,replyToId:humanRoot,body,originSourceId:A.sourceId}});replyIds.push(r.result.contributionId);bodies.set(r.result.contributionId,body);}
    const edited='Latest edited selected-root reply';await appLifecycle.command(await fixture.header(),{type:'edit',contributionId:replyIds[1],body:edited},actor);bodies.set(replyIds[1],edited);
    const sibling=await appRuntime.command({actorId:actor.id,requestId:'semantic-other-root-reply',expected:await fixture.header(),
     command:{type:'reply',discussionId:originalDestination.discussionId,rootId:aiRoot,replyToId:aiRoot,body:'Other root must not enter selected thread',originSourceId:A.sourceId}});
    const feedRequest={nodeId:'invented-game-branch',limit:50,cursor:null};
    const parsedFeed=readSemanticFeed(await service.semanticFeed(feedRequest),feedRequest);
    assert.deepEqual(parsedFeed.roots.map(card=>card.root.id).sort(),[humanRoot,aiRoot,manualRoot].sort());
    assert.deepEqual(parsedFeed.actors.map(a=>a.id),[actor.id]);assert.equal(parsedFeed.actors[0].type,'human');assert.ok(parsedFeed.actors[0].displayName);
    const firstRequest={nodeId:'invented-game-branch',rootId:humanRoot,limit:1,cursor:null};
    const first=readSemanticThread(await service.semanticThread(firstRequest),firstRequest);assert.ok(first.nextCursor);
    assert.equal(first.root.replies.some(r=>r.id===replyIds[1]),false,'edited target is genuinely outside the first reply page');
    const targetRequest={nodeId:'invented-game-branch',rootId:humanRoot,targetId:replyIds[1]};
    const exact=readSemanticTarget(await service.semanticTarget(targetRequest),targetRequest);
    assert.equal(exact.topic.id,originalDestination.topicId);assert.equal(exact.discussionId,originalDestination.discussionId);
    assert.equal(exact.root.id,humanRoot);assert.equal(exact.root.replies.length,1);assert.equal(exact.root.replies[0].id,replyIds[1]);
    assert.equal(exact.root.replies[0].body,edited);assert.equal(exact.root.replies[0].origin.sourceId,A.sourceId);
    assert.equal(exact.rootRevision,Number((await scalar(owner,'SELECT revision_count FROM canonical_v4.contributions WHERE id=$1',[humanRoot])).revision_count));
    assert.equal(exact.targetRevision,2);assert.deepEqual(exact.actors.map(a=>a.id),[actor.id]);
    const rootRequest={...targetRequest,targetId:humanRoot},rootTarget=readSemanticTarget(await service.semanticTarget(rootRequest),rootRequest);
    assert.deepEqual(rootTarget.root.replies,[]);assert.equal(rootTarget.rootRevision,rootTarget.targetRevision);
    await assert.rejects(service.semanticTarget({...targetRequest,rootId:aiRoot}),e=>e.code==='not-found');
    await assert.rejects(service.semanticTarget({...targetRequest,nodeId:'nature'}),e=>e.code==='not-found');
    const siblingRequest={nodeId:'invented-game-branch',rootId:aiRoot,targetId:sibling.result.contributionId};
    await appLifecycle.command(await fixture.header(),{type:'withdraw',contributionId:siblingRequest.targetId},actor);
    await assert.rejects(service.semanticTarget(siblingRequest),e=>e.code==='not-found');
    // Simulate the generic metadata version increment made by anchor maintenance,
    // without editing the root body or pretending that a canonical command ran.
    const metadata=await scalar(owner,'SELECT write_version::text,revision_count FROM canonical_v4.contributions WHERE id=$1',[humanRoot]);
    await owner.query('UPDATE canonical_v4.contributions SET write_version=write_version+1 WHERE id=$1',[humanRoot]);
    const afterMetadata=await scalar(owner,'SELECT write_version::text,revision_count FROM canonical_v4.contributions WHERE id=$1',[humanRoot]);
    assert.equal(afterMetadata.write_version,String(BigInt(metadata.write_version)+1n));assert.equal(afterMetadata.revision_count,metadata.revision_count);
    const nextRequest={...firstRequest,cursor:first.nextCursor};
    const continued=readSemanticThread(await service.semanticThread(nextRequest),nextRequest);assert.equal(continued.root.replies[0].id,replyIds[1]);
    await appLifecycle.command(await fixture.header(),{type:'edit',contributionId:humanRoot,body:'Edited original root body invalidates its reply cursor'},actor);
    await assert.rejects(service.semanticThread(nextRequest),e=>e.code==='conflict');
    const paged=[];let cursor=null;
    for(let page=0;page<4;page++){const request={nodeId:'invented-game-branch',rootId:humanRoot,limit:1,cursor},result=readSemanticThread(await service.semanticThread(request),request);
     assert.equal(result.discussionId,originalDestination.discussionId);assert.equal(result.topic.id,originalDestination.topicId);assert.equal(result.root.id,humanRoot);
     assert.deepEqual(result.actors.map(a=>a.id),[actor.id]);
     assert.ok(result.root.replies.length<=1);paged.push(...result.root.replies);cursor=result.nextCursor;if(cursor===null)break;}
    assert.equal(cursor,null);assert.deepEqual(paged.map(r=>r.id).sort(),replyIds.sort());assert.equal(paged.some(r=>r.id===sibling.result.contributionId),false);
    for(const r of paged){assert.equal(r.rootId,humanRoot);assert.equal(r.body,bodies.get(r.id));assert.equal(r.origin.sourceId,A.sourceId);}
    await appLifecycle.command(await fixture.header(),{type:'withdraw',contributionId:replyIds[2]},actor);
    const tombstoneRequest={nodeId:'invented-game-branch',rootId:humanRoot,limit:50,cursor:null};
    const withTombstone=readSemanticThread(await service.semanticThread(tombstoneRequest),tombstoneRequest);
    assert.deepEqual(withTombstone.root.replies.find(r=>r.id===replyIds[2]),
     {id:replyIds[2],rootId:humanRoot,replyToId:humanRoot,state:'deleted',label:'Deleted by user'});
    assert.equal(withTombstone.root.replies.filter(r=>r.state==='visible').length,2);
    const rootView=await target(humanRoot),offPageView=await target(humanRoot,exact.targetId);
    const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'fixture-semantic-reply-capability-token'};
    const handler=createRequestHandler({config,service});
    const browserClient=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async(url,options)=>{
     assert.equal(url,'http://127.0.0.1:4174/v1/commands');
     const response=await handler({method:options.method,url:'/v1/commands',headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});
     return new Response(response.body,{status:response.status,headers:response.headers});
    }});
    const browserReply=await browserClient.command(await fixture.header(),witnessed(rootView,'Witnessed root target through actual client and handler'),actor.id);
    const browserStored=await scalar(owner,'SELECT discussion_id,root_id,reply_to_id,origin_source_id FROM canonical_v4.contributions WHERE id=$1',[browserReply.result.contributionId]);
    assert.deepEqual(browserStored,{discussion_id:originalDestination.discussionId,root_id:humanRoot,reply_to_id:humanRoot,origin_source_id:null});
    const packet={actorId:actor.id,requestId:'semantic-witness-offpage-success',expected:await fixture.header(),command:witnessed(offPageView,'Witnessed off-page reply retains canonical destination')};
    const offPageReply=await appRuntime.command(packet);
    assert.deepEqual(await scalar(owner,'SELECT discussion_id,root_id,reply_to_id,origin_source_id FROM canonical_v4.contributions WHERE id=$1',[offPageReply.result.contributionId]),
     {discussion_id:originalDestination.discussionId,root_id:humanRoot,reply_to_id:exact.targetId,origin_source_id:null});
    await appLifecycle.command(await fixture.header(),{type:'edit',contributionId:exact.targetId,body:'Edited target after witnessed reply receipt'},actor);
    await rejectWitness({...packet,requestId:'semantic-witness-stale-target'});
    const beforeReplay=await appendState();assert.deepEqual(await appRuntime.command(packet),offPageReply);assert.deepEqual(await appendState(),beforeReplay);
    await rejectWitness({...packet,command:{...packet.command,semanticTarget:{...packet.command.semanticTarget,targetRevision:packet.command.semanticTarget.targetRevision+1}}});
    const beforeRootEdit=await target(humanRoot,exact.targetId);
    await appLifecycle.command(await fixture.header(),{type:'edit',contributionId:humanRoot,body:'Edited root after witnessed target read'},actor);
    await rejectWitness({actorId:actor.id,requestId:'semantic-witness-stale-root',expected:await fixture.header(),command:witnessed(beforeRootEdit,'Stale root body must not append')});
    const freshView=await target(humanRoot,exact.targetId);
    const missing=witnessed(freshView,'Absent semantic edge must not append');missing.semanticTarget.nodeId='nature';
    await rejectWitness({actorId:actor.id,requestId:'semantic-witness-missing-node',expected:await fixture.header(),command:missing});
    const wrongDestination=witnessed(freshView,'Different canonical topic must not append');wrongDestination.semanticTarget.topicId=MANUAL_TOPIC;
    await rejectWitness({actorId:actor.id,requestId:'semantic-witness-wrong-topic',expected:await fixture.header(),command:wrongDestination});
    const withdrawnTarget=witnessed(freshView,'Withdrawn target must not append');withdrawnTarget.replyToId=replyIds[2];withdrawnTarget.semanticTarget.targetRevision=1;
    await rejectWitness({actorId:actor.id,requestId:'semantic-witness-withdrawn-target',expected:await fixture.header(),command:withdrawnTarget},'invalid');

    // A distinct actor avoids the actor mutex: the app genuinely waits behind
    // the owner's canonical edit/domain locks, then must see its new root body.
    const expectedRace=await fixture.header(),raceView=await target(humanRoot,exact.targetId),appPid=Number((await scalar(app,'SELECT pg_backend_pid() pid')).pid);
    const actorLocks=await scalar(owner,"SELECT hashtextextended('demo-alex',914092006)::text owner_key,hashtextextended('demo-blair',914092006)::text app_key");assert.notEqual(actorLocks.owner_key,actorLocks.app_key);
    const beforeRace=await appendState(),enteredEdit=deferred(),releaseEdit=deferred();let append=null,raceResults;
    const heldEdit=owner.transaction(async tx=>{try{
     await createCanonicalV4LifecycleRepository({database:tx,nextId,now}).command(expectedRace,{type:'edit',contributionId:humanRoot,body:'Concurrent canonical edit invalidates witnessed reply'},actor);
     enteredEdit.resolve();await releaseEdit.promise;
    }catch(error){enteredEdit.reject(error);throw error;}});void heldEdit.catch(()=>{});
    try{
     await enteredEdit.promise;
     append=appRuntime.command({actorId:'demo-blair',requestId:'semantic-witness-held-edit-race',expected:expectedRace,command:witnessed(raceView,'Reply cannot race through an edited root')});void append.catch(()=>{});
     const until=Date.now()+1500;let waiting=false;
     while(Date.now()<until){if((await scalar(observer,"SELECT coalesce((SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=$1),false) waiting",[appPid])).waiting){waiting=true;break;}await sleep(10);}
     assert.equal(waiting,true,'actual witnessed app reply waits for the held canonical edit');
     assert.deepEqual(await appendState(observer),beforeRace,'uncommitted edit and waiting reply remain absent to MVCC readers');
    }finally{releaseEdit.resolve();raceResults=await Promise.allSettled([heldEdit,...(append?[append]:[])]);}
    assert.equal(raceResults[0].status,'fulfilled');assert.equal(raceResults[1]?.status,'rejected');assert.equal(raceResults[1].reason.code,'conflict');
    const afterRace=await appendState();assert.equal(afterRace.contributions,beforeRace.contributions);assert.equal(afterRace.revisions,beforeRace.revisions+1);
    assert.equal(afterRace.ids,beforeRace.ids);
    assert.equal(afterRace.receipts,beforeRace.receipts+1);assert.equal(afterRace.revision,String(BigInt(beforeRace.revision)+1n));
    erasedSemanticInsight=await runSemanticInsightNativeAssertions({owner,app,observer,service,appRuntime,appLifecycle,actor,header:()=>fixture.header(),nextId,now,
      rootId:humanRoot,rootTopicId:originalDestination.topicId,rootDiscussionId:originalDestination.discussionId,
      evidenceSourceId:semanticAiEvidence.receipt.sourceId,evidenceTopicId:semanticAiEvidence.receipt.topicId,
      evidenceInput:semanticAiEvidence.input,queued,finish});
    erasedWitnessRequest={actorId:actor.id,requestId:'semantic-witness-erased-membership',expected:await fixture.header(),command:witnessed(await target(humanRoot,exact.targetId),'Erased semantic membership must not append')};
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
     assert.equal((await reads.semanticFeed({nodeId:'invented-game-branch',limit:50,cursor:null})).roots.length,3,'actual hydrated application feed also completes before owner activation');
    }finally{
     release.resolve();const results=await Promise.allSettled([held,...(control?[control]:[])]);await owner.exec('SET lock_timeout=DEFAULT');
     for(const result of results)if(result.status==='rejected')throw result.reason;
     A=results[0].value;activation=results[1]?.value;
    }
    assert.equal(activation.matcherIdentityHash,hash2);assert.equal((await appIngest.status({operationId:work.claim.operationId,operationDigest:work.claim.operationDigest})).state,'complete');
    const pendingContext=await context(A.sourceId);assert.equal(pendingContext.status,'pending');assert.equal(pendingContext.sourceVersion,(await sourceState(owner,A.sourceId)).write_version);
    assert.deepEqual(pendingContext.supportedPath,[]);assert.deepEqual(pendingContext.selectedPath,[]);assert.equal(pendingContext.topic,null);
    // CURRENT is now model2. The Source still has only model1 observations:
    // this ordinary root must remain unclassified until explicit owner adoption.
    const legacy=await humanPost('retained-current-context',{topicId:MANUAL_TOPIC});legacyRoot=legacy.result.contributionId;
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots WHERE root_id=$1',[legacyRoot])).n),0);
    const absent=await service.semanticFeed({nodeId:'invented-game-branch',limit:50,cursor:null});assert.equal(absent.roots.some(c=>c.root.id===legacyRoot),false);
    const scope={generation:fixture.generation,matcherIdentityHash:hash2};
    const candidates=await workerSources.candidates({...scope,afterOrdinal:null,limit:50}),candidate=candidates.candidates.find(c=>c.sourceId===A.sourceId);
    assert.ok(candidate);assert.equal(candidate.reuse.matcherIdentityHash,hash1);assert.deepEqual(candidate.reuse.titleValues,axis(0));
    const prepared=await storedPreparation.prepare(candidate);assert.ok(prepared);assert.equal(storedEncoderCalls,0);assert.deepEqual(prepared.supportedPath,SUPPORTED_PATH);
    const unchanged=await canonicalState(),beforeStamp=await reads.semanticStamp();
    for(const changed of [{generation:'different-semantic-generation'},{matcherIdentityHash:hash1}]){
     await assert.rejects(workerSources.reclassify({...scope,items:[{...prepared,...changed}]}),TypeError);
     await assert.rejects(worker.query('SELECT * FROM canonical_v4.semantic_reclassify_stored_sources($1,$2,$3::jsonb)',
      [scope.generation,hash2,JSON.stringify([{...prepared,...changed,titleValues:wire(prepared.titleValues)}])]),sqlCode('P1233'));
    }
    await assert.rejects(workerSources.reclassify({...scope,items:[{...prepared,sourceVersion:String(BigInt(prepared.sourceVersion)+1n)}]}),e=>e.code==='conflict');
    assert.deepEqual(await canonicalState(),unchanged);assert.deepEqual(await reads.semanticStamp(),beforeStamp);
    assert.deepEqual(await workerSources.reclassify({...scope,items:[prepared]}),[{sourceId:A.sourceId,sourceVersion:prepared.sourceVersion,status:'recorded'}]);
    assert.deepEqual(await canonicalState(),unchanged,'background reclassification changes no Source, receipt, queue, lane or canonical revision');
    const recordedStamp=await reads.semanticStamp();assert.notEqual(recordedStamp.revision,beforeStamp.revision);
    const reclassifiedContext=await context(A.sourceId);assert.equal(reclassifiedContext.status,'classified');assert.equal(reclassifiedContext.sourceVersion,prepared.sourceVersion);
    assert.deepEqual(reclassifiedContext.supportedPath,SUPPORTED_PATH);assert.deepEqual(reclassifiedContext.selectedPath,SUPPORTED_PATH);
    assert.deepEqual(await workerSources.reclassify({...scope,items:[prepared]}),[{sourceId:A.sourceId,sourceVersion:prepared.sourceVersion,status:'reused'}]);
    assert.deepEqual(await reads.semanticStamp(),recordedStamp);
    const root=await scalar(owner,'SELECT write_version::text,discussion_id FROM canonical_v4.contributions WHERE id=$1',[legacyRoot]);
    const {titleValues,supportedPath,semanticEligible,...base}=prepared;
    const adopt={...base,rootId:legacyRoot,rootVersion:root.write_version,topicId:MANUAL_TOPIC,discussionId:root.discussion_id};
    await assert.rejects(ownerSources.adoptLegacyRoots({...scope,items:[{...adopt,rootVersion:String(BigInt(root.write_version)+1n)}]}),e=>e.code==='conflict');
    assert.deepEqual(await ownerSources.adoptLegacyRoots({...scope,items:[adopt]}),[{rootId:legacyRoot,status:'adopted'}]);
    const snapshot=await scalar(owner,'SELECT context_basis,source_version::text,matcher_hash,supported_path,topic_id,discussion_id FROM canonical_v4.semantic_root_snapshots WHERE root_id=$1',[legacyRoot]);
    assert.deepEqual(snapshot,{context_basis:'legacy-current-source-context',source_version:prepared.sourceVersion,matcher_hash:hash2,supported_path:SUPPORTED_PATH,topic_id:MANUAL_TOPIC,discussion_id:MANUAL_DISCUSSION});
    const adoptedStamp=await reads.semanticStamp();assert.notEqual(adoptedStamp.revision,recordedStamp.revision);
    assert.deepEqual(await ownerSources.adoptLegacyRoots({...scope,items:[adopt]}),[{rootId:legacyRoot,status:'existing'}]);
    assert.deepEqual(await reads.semanticStamp(),adoptedStamp);assert.deepEqual(await canonicalState(),unchanged);
    const refreshed=await service.semanticFeed({nodeId:'invented-game-branch',limit:50,cursor:null});
    assert.ok(refreshed.roots.some(c=>c.root.id===legacyRoot&&c.discussionId===MANUAL_DISCUSSION),'same canonical revision cannot reuse the pre-adoption absent feed');
    assert.deepEqual((await rootSnapshots()),originalSnapshots,'background model2 work cannot rewrite existing model1 historical snapshots');

    const imported=await importVersionZero(),zeroBefore=await canonicalState();
    const zeroCandidate=(await workerSources.candidates({...scope,afterOrdinal:null,limit:50})).candidates.find(c=>c.sourceId===imported.sourceId);
    assert.ok(zeroCandidate);assert.equal(zeroCandidate.sourceVersion,'0');assert.equal(zeroCandidate.reuse,null);assert.deepEqual(zeroCandidate.embedding.values,imported.values);
    const zero=await storedPreparation.prepare(zeroCandidate);assert.ok(zero);assert.equal(zero.sourceVersion,'0');assert.equal(storedEncoderCalls,1);
    assert.deepEqual(await workerSources.reclassify({...scope,items:[zero]}),[{sourceId:imported.sourceId,sourceVersion:'0',status:'recorded'}]);
    assert.deepEqual(await canonicalState(),zeroBefore);assert.equal((await sourceState(owner,imported.sourceId)).write_version,'0');
    const zeroStored=await scalar(owner,`SELECT o.source_version::text,i.body_values FROM canonical_v4.semantic_observations o
     JOIN canonical_v4.semantic_inputs i USING(source_id,operation_digest,matcher_hash) WHERE o.source_id=$1`,[imported.sourceId]);
    assert.equal(zeroStored.source_version,'0');assert.deepEqual(zeroStored.body_values,imported.values);
    const zeroContext=await context(imported.sourceId);assert.equal(zeroContext.status,'classified');assert.equal(zeroContext.sourceVersion,'0');assert.deepEqual(zeroContext.supportedPath,zero.supportedPath);
    const remaining=await workerSources.candidates({...scope,afterOrdinal:null,limit:50});
    assert.equal(remaining.candidates.some(c=>[A.sourceId,imported.sourceId].includes(c.sourceId)),false,'current classified versions leave the missing-observation worklist');
   });
   await t.test(GROUPS[2].children[4],async()=>{
    const destination=await sourceState(owner,A.sourceId);
    const withdrawnRootRequest={actorId:actor.id,requestId:'semantic-witness-withdrawn-root',expected:await fixture.header(),command:witnessed(await target(aiRoot),'Withdrawn root must not append')};
    await appLifecycle.command(await fixture.header(),{type:'withdraw',contributionId:aiRoot},actor);
    await rejectWitness(withdrawnRootRequest,'invalid');
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=$1',[aiRoot])).n),0);
    const visible=(await feed('invented-game-branch')).references;assert.equal(visible.some(r=>r.rootId===aiRoot),false);
    assert.deepEqual(visible.map(r=>r.rootId).sort(),[humanRoot,manualRoot,legacyRoot].sort());
    assert.equal((await reads.semanticFeed({nodeId:'invented-game-branch',limit:50,cursor:null})).roots.some(c=>c.root.id===aiRoot),false);
    await assert.rejects(reads.semanticThread({nodeId:'games',rootId:aiRoot,limit:1,cursor:null}),e=>e.code==='not-found');
    await assert.rejects(service.semanticTarget({nodeId:'games',rootId:aiRoot,targetId:aiRoot}),e=>e.code==='not-found');
    const rollback=new Error('controlled visibility rollback');
    await assert.rejects(owner.transaction(async tx=>{
     await tx.query(`UPDATE canonical_v4.contributions SET visibility='local-private',
      payload=jsonb_set(payload::jsonb,'{visibility}','"local-private"'::jsonb)::text WHERE id=$1`,[humanRoot]);
     assert.equal(Number((await scalar(tx,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=$1',[humanRoot])).n),0);
     const hidden=await createCanonicalV4SemanticDiscussionRepository({database:tx}).feedReferences({generation:fixture.generation,nodeId:'invented-game-branch',beforeOrdinal:null,limit:100});
     assert.deepEqual(hidden.references.map(r=>r.rootId).sort(),[manualRoot,legacyRoot].sort());throw rollback;
    }),error=>error===rollback);
    assert.deepEqual((await feed('invented-game-branch')).references.map(r=>r.rootId).sort(),[humanRoot,manualRoot,legacyRoot].sort());
    assert.ok(erasedSemanticInsight);
    const liveAiTarget=await target(humanRoot,erasedSemanticInsight.command.replyToId);
    assert.equal(liveAiTarget.rootRevision,erasedSemanticInsight.command.semanticPublication.semanticTarget.rootRevision);
    assert.equal(liveAiTarget.targetRevision,erasedSemanticInsight.command.semanticPublication.semanticTarget.targetRevision);
    await appIngest.lifecycle(await fixture.header(),{type:'forget-source',sourceId:A.sourceId});
    const pendingPublication=erasedSemanticInsight.command.semanticPublication;
    const retainedAiRows=(await owner.query(`SELECT c.id,c.revision_count,c.visibility,c.withdrawn,
      encode(sha256(convert_to(r.payload::jsonb->>'body','UTF8')),'hex') body_digest
      FROM canonical_v4.contributions c JOIN canonical_v4.revisions r ON r.contribution_id=c.id AND r.ordinal=c.revision_count-1
      WHERE c.id=ANY($1::text[]) ORDER BY c.id`,[[humanRoot,erasedSemanticInsight.command.replyToId]])).rows;
    assert.equal(retainedAiRows.length,2);
    for(const row of retainedAiRows){const isRoot=row.id===humanRoot;
      assert.equal(row.visibility,'local-public');assert.equal(row.withdrawn,false);
      assert.equal(Number(row.revision_count),isRoot?pendingPublication.semanticTarget.rootRevision:pendingPublication.semanticTarget.targetRevision);
      assert.equal(row.body_digest,isRoot?pendingPublication.rootDigest:pendingPublication.targetDigest);
    }
    const retainedEvidence=await scalar(app,'SELECT * FROM canonical_v4.semantic_insight_evidence($1)',[pendingPublication.evidence.sourceId]);
    assert.equal(retainedEvidence.source_version,pendingPublication.evidence.sourceVersion);assert.equal(retainedEvidence.operation_digest,pendingPublication.evidence.operationDigest);
    const beforeErasedAi=await appendState();
    await assert.rejects(appLifecycle.command(await fixture.header(),erasedSemanticInsight.command,actor,erasedSemanticInsight.proof),e=>e.code==='conflict');
    assert.deepEqual(await appendState(),beforeErasedAi,'erased historical membership prevents pending AI publication');
    assert.ok(erasedWitnessRequest);await rejectWitness(erasedWitnessRequest);
    await assert.rejects(service.semanticContext({sourceId:A.sourceId}),e=>e.code==='not-found');
    const erased=await scalar(owner,`SELECT (SELECT count(*) FROM canonical_v4.sources WHERE id=$1)::integer sources,
     (SELECT count(*) FROM canonical_v4.semantic_inputs WHERE source_id=$1)::integer inputs,
     (SELECT count(*) FROM canonical_v4.semantic_observations WHERE source_id=$1)::integer observations`,[A.sourceId]);assert.deepEqual(erased,{sources:0,inputs:0,observations:0});
    assert.equal((await scalar(owner,'SELECT id FROM canonical_v4.discussions WHERE id=$1',[destination.discussion_id])).id,MANUAL_DISCUSSION);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots WHERE source_id=$1',[A.sourceId])).n),0);
    assert.equal(Number((await scalar(owner,'SELECT count(*) n FROM canonical_v4.semantic_root_edges WHERE root_id=ANY($1::text[])',[[humanRoot,aiRoot,manualRoot,legacyRoot]])).n),0);
    assert.deepEqual((await feed('invented-game-branch')).references,[]);
    assert.deepEqual((await service.semanticFeed({nodeId:'invented-game-branch',limit:50,cursor:null})).roots,[]);
    await assert.rejects(reads.semanticThread({nodeId:'games',rootId:humanRoot,limit:1,cursor:null}),e=>e.code==='not-found');
    const retained=(await owner.query('SELECT id,discussion_id FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[[humanRoot,aiRoot,manualRoot,legacyRoot]])).rows;
    assert.equal(retained.length,4);for(const row of retained)assert.equal(row.discussion_id,[manualRoot,legacyRoot].includes(row.id)?MANUAL_DISCUSSION:originalDestination.discussionId);
   });
   await t.test(GROUPS[2].children[5],async()=>{
    const firstName=fixture.databaseName;await closeA();
    fixtureB=await acquireFixture();workerB=await fixtureB.connect('murmingle_ingest_worker');assert.notEqual(fixtureB.databaseName,firstName);
    assert.equal((await fixtureB.header()).generation,fixtureB.generation);
    const db=fixtureB.database;assert.equal(Number((await scalar(db,'SELECT count(*) n FROM canonical_v4.semantic_matchers')).n),0);
    assert.deepEqual(await createCanonicalV4SemanticDiscussionRepository({database:db}).ownerPolicy(),{revision:0,defaultMaxDepth:1,overrides:[]});
    assert.equal(Number((await scalar(db,'SELECT count(*) n FROM canonical_v4.semantic_root_snapshots')).n),0);
    assert.equal((await scalar(db,'SELECT revision::text FROM canonical_v4.semantic_material_state WHERE singleton')).revision,'0');
    assert.deepEqual(await scalar(db,'SELECT revision::text,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton'),{revision:'0',matcher_hash:null});
    await denied(workerB,REGISTER,[identity1]);await assert.rejects(semantic(workerB).apply(initial.claim,{representedValues:axis(0),preparation:initial.prepared}),error=>error.code==='conflict');
    const c=await counts(db);assert.equal(c.sources,0);assert.equal(c.inputs,0);assert.equal(c.observations,0);
   });
  });
 }finally{
  await preparation.close();await storedPreparation.close();
  try{await closeA();}finally{try{if(workerB)await workerB.close();}finally{if(fixtureB)await fixtureB.close();}}
 }
}
