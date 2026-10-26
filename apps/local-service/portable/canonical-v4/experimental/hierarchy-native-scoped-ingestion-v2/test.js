// ADR220: real canonical SQL test SOURCE. Execution requires a separate Root
// decision plus adequate reserves. This opt-in string IS NOT authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input} from '../../../../src/domain/hierarchical-e5-paired-input.js';
import {compileNativeOwnerPreparation,prepareNativeOwnerObservation,compileNativeOwnerGrouping,describeNativeOwnerGrouping} from '../../../../src/application/experimental/native-owner-grouping-v1/grouping.js';
import {describeNativeScopedObservation} from '../../../../src/application/experimental/native-scoped-preparation-v1/preparation.js';
import {createNativeCanonicalPublicationFacade as createPublication} from '../../../../src/application/experimental/native-canonical-publication-v1/publication.js';
import {createNativeScopedIngress} from '../../../../src/application/experimental/native-scoped-ingress-v1/ingress.js';
import {createCanonicalV4RuntimeRepository} from '../../runtime-repository.js';
import {createCanonicalV4ReadFacade} from '../../read-facade.js';
import {createCanonicalV4LifecycleRepository} from '../../lifecycle-repository.js';
import {createInputVersionFixtureDatabase,installFixturePublication,installFixtureAttestation,setFixtureOwnerPolicy,controlFixturePublication,
 createFixtureIssuerPorts,resolveNativeSource,claimScoped,completeScoped,revokeScoped,cleanupScoped,lookupNativeOperation,
 createFastRoot,forgetFastSource,readNativeRootFeed,enqueueIssued,pairedVectorWire,revokeFixtureAttestation,expireFixtureIssued} from './repository.js';
const NS='hierarchy_native_scoped_ingestion_v2',LINEAGE='fixture-owner-lineage';
const SQL_ENABLED=process.env.MURMINGLE_ADR220_SQL_FIXTURE==='root-approved-disposable-only';
const H='a'.repeat(64),TRAIN='b'.repeat(64),DETAIL='c'.repeat(64),TARGET='d'.repeat(64);
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),clone=x=>structuredClone(x);
const settings=(defaultMaxDepth=8,overrides=[])=>({revision:'invented-owner-1',defaultMaxDepth,overrides});
// Only serialization of newly invented ordinary fixture data; -0 is intentional.
function rawJson(value){if(typeof value==='number')return Object.is(value,-0)?'-0':JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(rawJson).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+':'+rawJson(v)).join(',')+'}';
 return JSON.stringify(value);}
function candidate({detailWeight=1}={}){
 const inputDefinition={bodyWeight:1,titleWeight:0,encoderHash:H},paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}],heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:0}));
 const schema='hierarchical-e5-paired-linear-heads-v1',lambda=.1,trainingIdHashes=[0,1,2,3].map(i=>sha('publication-invented-training-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('publication-invented-group-'+i)).sort();
 const rootModel={schema,representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-not-trained',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation:paired.representation,representationHash:paired.representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),
  experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const policy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash:paired.representationHash,inputConstructionHash:TRAIN,nodeIds:['games','nature'],calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy:{...policy,policyHash:digest(policy)},trainingInputConstructionHash:TRAIN,
  targetProfile:{producerId:'native-browser-current',inputConstructionHash:TARGET,extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};
 const localDefinition={bodyWeight:detailWeight,titleWeight:1-detailWeight,encoderHash:H},local=describePairedE5Input(compilePairedE5Input(localDefinition));
 const localNodes=[...nodes,{id:'game-leaf',parentId:'games'},{id:'game-deep',parentId:'game-leaf'},{id:'nature-leaf',parentId:'nature'}];
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:local.representation,representationHash:local.representationHash,inputConstructionHash:DETAIL,
  taxonomyVersion:'invented/v1',evidenceVersion:'invented/v1',calibrationVersion:'invented/v1',calibrationStatus:'experimental',nodes:localNodes,
  examples:['game-deep','nature-leaf'].flatMap((nodeId,i)=>[0,1].map(j=>({id:nodeId+'-ref'+j,groupId:nodeId+'-group'+j,nodeId,kind:'member',vector:axis(i)}))),
  nodePolicies:localNodes.map(n=>({nodeId:n.id,enabled:true,minSupport:2,minSimilarity:.7,minNegativeMargin:0,minRivalMargin:0}))};
 return {schema:'native-root-local-detail-transfer/v1',rootCandidate,detail:{artifact,inputDefinition:localDefinition,supportedRootIds:['games','nature']}};
}
function observation(){
 const url='https://example.org/invented-publication',documentId='invented-document',foreground={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
 return {schema:'native-scoped-observation/v1',rawTitle:' Invented title ',effectiveTitle:'Invented title',body:'Invented body.\nSecond line.',extractorVersion:'main-text-prefix/v1',
  nativeWitness:{schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:'invented-case',ordinal:1,observationNonce:'invented-observation',eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId,sourceUrl:url,documentUrl:url,
   foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false},
  rightsEvidenceHash:H,bodyVector:axis(0),titleVector:axis(0)};
}
function identityOf(job,group){
 const i=describeNativeScopedObservation(job).classifierIdentity,r=i.rootTransferIdentity;
 return {semanticTransferHash:i.transferHash,rootTransferHash:i.rootTransferHash,rootModelJsonHash:r.modelJsonHash,rootPolicyHash:r.policyHash,
  rootTrainingInputConstructionHash:r.trainingInputConstructionHash,rootRepresentationHash:r.representationHash,encoderHash:r.encoderHash,
  nativeTargetProducerProfileHash:i.actualNativeTargetProfile.producerProfileHash,nativeTargetInputConstructionHash:i.actualNativeTargetProfile.inputConstructionHash,
  detailArtifactHash:i.originalDetailArtifactHash,localBuilderHash:i.localBuilderHash,detailRepresentationHash:i.detailRepresentationHash,
  detailInputConstructionHash:i.originalNumericalPolicyNamespace.originalArtifactInputConstructionHash,topologyHash:group.topologyHash};
}
function mappingInput(o){return {schema:'native-canonical-mapping-input/v1',canonicalSource:{expected:{generation:'declared-generation',revision:0},sourceId:'declared-source',documentHash:'6'.repeat(64),prior:null},
 fields:{url:o.nativeWitness.sourceUrl,rawTitle:o.rawTitle,effectiveTitle:o.effectiveTitle,body:o.body,extractorVersion:o.extractorVersion},pair:{bodyVector:[...o.bodyVector],titleVector:[...o.titleVector]}};}
function fixture({c=candidate(),recordChange=()=>{},rawBundle}={}){
 const context=compileNativeOwnerPreparation({schema:'native-owner-preparation/v1',candidate:c});
 const prepared=prepareNativeOwnerObservation(context,observation()),identity=describeNativeOwnerGrouping(compileNativeOwnerGrouping(context,settings()));
 const nativeIdentity=identityOf(prepared,identity),byId=new Map([...c.rootCandidate.rootModel.nodes,...c.detail.artifact.nodes].map(n=>[n.id,n]));
 const nodes=[...byId.values()].map(n=>({nativeNodeId:n.id,nativeParentId:n.parentId,canonicalNodeId:'canonical-'+n.id}));
 const publication={builderHash:'1'.repeat(64),encoderHash:'2'.repeat(64),representationHash:'3'.repeat(64),modelHash:'4'.repeat(64),policyHash:'5'.repeat(64),modelId:'e5-small-q8-browser-main-prefix-v1'};
 const bundle=Buffer.from(rawBundle??rawJson(c));
 const acceptance=Object.fromEntries(['studyFreezeFileSha256','sourceMapFileSha256','producerRecipeHash','trainResultFileSha256','trainSupervisorFileSha256','selectionFileSha256','testResultFileSha256','testSupervisorFileSha256','independentQualityAuditFileSha256'].map(k=>[k,sha('invented-'+k)]));
 const r={schema:'native-canonical-publication-record/v1',publicationId:'invented-publication',incarnation:'invented-incarnation',publicationRevision:1,
  acceptance,bundleFileSha256:sha(bundle),nativeIdentity,mapping:{nodes,declaredCanonicalPublication:publication}};recordChange(r);
 const env={c,context,prepared,nativeIdentity,identity,record:r,bundle,recordBytes:Buffer.from(JSON.stringify(r)),counts:{head:0,record:0,bundle:0,guard:0}};
 env.head={schema:'native-canonical-publication-head/v1',publicationId:r.publicationId,incarnation:r.incarnation,publicationRevision:r.publicationRevision,headRevision:1,recordFileSha256:sha(env.recordBytes),status:'accepted'};
 env.seal=()=>{env.recordBytes=Buffer.from(JSON.stringify(env.record));env.head.recordFileSha256=sha(env.recordBytes);};
 env.request=(o=observation(),ownerGrouping=settings())=>({publicationId:r.publicationId,observation:o,ownerGrouping,mapping:mappingInput(o)});
 env.facade=(overrides={})=>createPublication({anchor:{publicationId:r.publicationId,recordFileSha256:env.head.recordFileSha256},
  readHead:()=>{env.counts.head++;return clone(env.head);},readRecord:(_id,max)=>{assert.equal(_id,r.publicationId);assert.equal(max,256*1024);env.counts.record++;return env.recordBytes;},
  readBundle:(_id,max)=>{assert.equal(_id,r.publicationId);assert.equal(max,16*1024*1024);env.counts.bundle++;return env.bundle;},guard:()=>{env.counts.guard++;return true;},...overrides});
 return env;
}

function rehashRoot(c){const m=c.rootCandidate.rootModel,p=c.rootCandidate.rootPolicy;
 m.nodes.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);m.heads.sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
 m.taxonomyHash=digest(m.nodes);m.parameterHash=digest({schema:m.schema,representation:m.representation,representationHash:m.representationHash,heads:m.heads});
 p.modelHash=digest(m);p.nodeIds=m.nodes.map(n=>n.id);delete p.policyHash;p.policyHash=digest(p);
}
function maximumCandidate(){const c=candidate(),a=c.detail.artifact,m=c.rootCandidate.rootModel;
 a.nodes=a.nodes.filter(n=>!n.id.startsWith('nature'));a.examples=a.examples.filter(n=>!n.nodeId.startsWith('nature'));a.nodePolicies=a.nodePolicies.filter(n=>!n.nodeId.startsWith('nature'));c.detail.supportedRootIds=['games'];
 let parent='game-deep';for(let d=4;d<=8;d++){const id='depth-'+d;a.nodes.push({id,parentId:parent});a.nodePolicies.push({...a.nodePolicies[0],nodeId:id});parent=id;}
 for(const e of a.examples)e.nodeId=parent;
 for(let i=2;i<16;i++){const id='outside-'+i;m.nodes.push({id,parentId:null});m.heads.push({...m.heads[0],nodeId:id,weights:axis(i)});}rehashRoot(c);
 for(let i=a.nodes.length;i<128;i++){const id='detail-'+i;a.nodes.push({id,parentId:'games'});a.nodePolicies.push({...a.nodePolicies[0],nodeId:id});}return c;
}
function page(suffix,index=0,nonce=suffix){const o=observation(),url='https://example.org/native-canonical/'+suffix;
 o.bodyVector=axis(index);o.titleVector=axis(index);o.bodyVector[383]=-0;o.titleVector[382]=-0;
 Object.assign(o.nativeWitness,{caseId:'fixture-'+suffix,observationNonce:'capture-'+nonce,sourceUrl:url,documentUrl:url});
 o.nativeWitness.attestation.url=url;for(const f of o.nativeWitness.foregroundChecks){f.sourceUrl=url;f.documentUrl=url;}return o;
}
async function policy(db,e,depth=1,expectedRevision=0,overrides=[]){const s=settings(depth,overrides),identity=describeNativeOwnerGrouping(compileNativeOwnerGrouping(e.context,s));
 await setFixtureOwnerPolicy(db,{ownerPrincipal:db.fixture.actorId,lineageId:LINEAGE,expectedRevision,settings:s,groupingHash:identity.ownerGroupingHash,recordHash:e.head.recordFileSha256});return s;
}
async function install(db,e){await installFixturePublication(db,{record:e.record,head:e.head,lineageId:LINEAGE});}
const allocationCounters=new WeakMap();
function databaseIngress(db,e,options={}){let allocations=0,principal=db.fixture.actorId,issuedContext=null,failEnqueue=options.failEnqueueOnce===true,failIssue=options.failIssueOnce===true;const ports=createFixtureIssuerPorts(db);
 const calls={source:0,owner:0,attest:0,issue:0,publicationGuard:0};
 const publication={anchor:{publicationId:e.head.publicationId,recordFileSha256:e.head.recordFileSha256},readHead:()=>clone(e.head),readRecord:()=>e.recordBytes,readBundle:()=>e.bundle,guard:()=>{calls.publicationGuard++;return true;}};
 const ingress=createNativeScopedIngress({publication,
  authenticate:async()=>({principal,originKind:'actor',generation:db.fixture.generation}),
  lookupOperation:ports.lookupOperation,
  resolveSource:async(auth,request)=>{calls.source++;const source=await resolveNativeSource(db,{generation:auth.generation,url:request.observation.nativeWitness.sourceUrl});
   if(source.sourceAbsent){allocations++;const n=(allocationCounters.get(db)??0)+1;allocationCounters.set(db,n);return {...source,sourceId:'native-source-'+n,sourceIncarnation:null,topicId:'native-topic-'+n,discussionId:'native-discussion-'+n,createdAt:'2026-10-24T18:00:00Z',documentHash:H,prior:null};}
   return {...source,createdAt:'2026-10-24T18:00:00Z',documentHash:H};},
  resolveOwnerPolicy:async()=>{calls.owner++;const {rows}=await db.query('SELECT revision,settings FROM '+NS+'.owner_policies WHERE lineage_id=$1',[LINEAGE]);assert.equal(rows.length,1);return {revision:Number(rows[0].revision),settings:rows[0].settings};},
  attest:async(c,o)=>{calls.attest++;issuedContext=c;const d=c.description,p=d.publicationBinding,m=d.mapping,k=m.commitments,s=c.source;
   const authority={schema:'native-scoped-attestation/v1',id:'attestation-'+c.operationId,generation:c.auth.generation,operationId:c.operationId,principal:c.auth.principal,originKind:c.auth.originKind,
    publicationId:p.publicationId,publicationIncarnation:p.incarnation,publicationRevision:p.publicationRevision,headRevision:p.headRevisionAtIssuance,recordFileSha256:p.recordFileSha256,bundleFileSha256:p.bundleFileSha256,
    recordBindingHash:d.recordBindingHash,mappingHash:m.mappingHash,sourceId:s.sourceAbsent?null:s.sourceId,sourceIncarnation:s.sourceIncarnation,prior:s.prior,sourceAbsent:s.sourceAbsent,
    materialHash:k.materialHash,bodyWireHash:k.bodyWireHash,titleWireHash:k.titleWireHash,observationId:'observation-'+c.operationId,observationNonce:o.nativeWitness.observationNonce,
    rightsEvidenceHash:k.rightsEvidenceHash,sourceInputHash:k.sourceInputHash,nativeWitnessHash:k.nativeWitnessHash,requestHash:c.requestHash,deadline:new Date(Date.now()+(options.authorityMs??25000)).toISOString()};
   await installFixtureAttestation(db,authority);return {id:authority.id};},
  issue:async c=>{calls.issue++;if(failIssue){failIssue=false;throw new Error('Invented pre-issuance transport failure');}return ports.issue(c);},enqueue:async ref=>{if(failEnqueue){failEnqueue=false;throw new Error('Invented pre-enqueue transport failure');}return ports.enqueue(ref);}});
 return {ingress,allocations:()=>allocations,calls:()=>({...calls}),actor:a=>{principal=a;},context:()=>issuedContext,
  request:(operationId,o)=>({publicationId:e.head.publicationId,operationId,observation:o}),
  finish:async function(operationId,o){
   const request=this.request(operationId,o),queued=await ingress.ingest(request);assert.equal(queued.result.state,'pending');
   const ref={generation:db.fixture.generation,operationId,principal,commandHash:queued.result.commandHash,worker:'native-fixture-worker',token:'token-'+operationId,leaseSeconds:15};
   const lease=await claimScoped(db,ref);const receipt=await completeScoped(db,{generation:ref.generation,operationId,principal,commandHash:ref.commandHash,worker:ref.worker,token:ref.token,epoch:lease.epoch});
   return {receipt,request,ref,epoch:lease.epoch};
  }};
}
const feed=(db,node='canonical-games',extra={})=>readNativeRootFeed(db,{lineageId:LINEAGE,nodeId:node,expectedEpoch:null,expectedFeedVersion:null,afterRootId:null,limit:100,...extra});
const post=(db,r,suffix)=>createFastRoot(db,{actorId:db.fixture.actorId,requestId:'post-'+suffix,generation:db.fixture.generation,topicId:r.topicId,body:'Invented canonical discussion.',sourceId:r.sourceId,rootId:'native-root-'+suffix,createdAt:'2026-10-24T18:01:00Z',witnessHash:r.witnessHash,decisionHash:r.decisionHash});
test('pure wire and factory capability preconditions do not open any DB',async()=>{
 assert.notEqual(pairedVectorWire([1,-0,...Array(382).fill(0)]).wireHash,pairedVectorWire([1,...Array(383).fill(0)]).wireHash);
 let calls=0;await assert.rejects(enqueueIssued({transaction(){calls++;}},{generation:'g',operationId:'o',principal:'p',issuedId:'i'}));assert.equal(calls,0);
});
test('actual canonical native queue, historical topology and ancestor feeds (separately gated)',{skip:!SQL_ENABLED,timeout:180000},async t=>{
 const db=await createInputVersionFixtureDatabase();const e=fixture({c:maximumCandidate()});let service,A,B,authorTwo,rootAReceipt;
 try{
  await install(db,e);await policy(db,e);service=databaseIngress(db,e);
  await t.test('full143/depth8 publication and canonical admission preserve both signed-zero wires',async()=>{
   assert.equal(e.record.mapping.nodes.length,143);const {rows}=await db.query('SELECT count(*) AS n,max(depth) AS depth FROM '+NS+'.publication_nodes');assert.equal(Number(rows[0].n),143);assert.equal(Number(rows[0].depth),8);
   A=await service.finish('admit-A',page('same-page'));assert.equal(A.receipt.sourceVersion,'1');assert.equal(A.receipt.policyVersion,'source-local-scoped-container/v1');assert.equal(A.receipt.semanticNodeId,'canonical-depth-8');
   const {rows:stored}=await db.query('SELECT s.id,s.policy_version,e.dimensions,i.body_wire_hash,i.title_wire_hash,'+NS+'.wire_hash(i.body_values) AS body_actual,'+NS+'.wire_hash(i.title_values) AS title_actual FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id JOIN '+NS+'.inputs i ON i.source_id=s.id WHERE s.id=$1',[A.receipt.sourceId]);
   assert.equal(stored.length,1);assert.equal(stored[0].dimensions,384);assert.equal(stored[0].body_wire_hash,stored[0].body_actual);assert.equal(stored[0].title_wire_hash,stored[0].title_actual);
   assert.equal(stored[0].body_wire_hash,service.context().description.mapping.commitments.bodyWireHash);
  });
  await t.test('SQL publication rejects missing parents, cycles, duplicates and genuine depth9 atomically',async()=>{
   const before=Number((await db.query('SELECT count(*) AS n FROM '+NS+'.publications')).rows[0].n);
   const mutations=[nodes=>{nodes.find(n=>n.nativeParentId!==null).nativeParentId='missing';},nodes=>{nodes[0].nativeParentId=nodes[0].nativeNodeId;},
    nodes=>{nodes[1].canonicalNodeId=nodes[0].canonicalNodeId;},nodes=>{nodes[1].nativeNodeId=nodes[0].nativeNodeId;},
    nodes=>{const filler=nodes.find(n=>n.nativeNodeId.startsWith('detail-'));filler.nativeParentId='depth-8';}];
   for(let i=0;i<mutations.length;i++){
    const bad=fixture({c:maximumCandidate()}),r=bad.record;r.publicationId='invalid-publication-'+i;bad.head.publicationId=r.publicationId;
    // Fresh canonical IDs isolate depth9 from stable-parent rejection. Keep143
    // total/128detail nodes; no capacity refusal can stand in for depth proof.
    for(const n of r.mapping.nodes)n.canonicalNodeId='invalid-'+i+'-'+n.canonicalNodeId;
    mutations[i](r.mapping.nodes);bad.seal();assert.equal(r.mapping.nodes.length,143);
    await assert.rejects(install(db,bad));assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.publications')).rows[0].n),before);
   }
  });
  await t.test('real root/snapshot/ancestor edges commit atomically; owner prefix is display only',async()=>{
   rootAReceipt=await post(db,A.receipt,'A');const edges=(await db.query('SELECT ancestor_id FROM '+NS+'.root_edges WHERE root_id=$1 ORDER BY ancestor_id',['native-root-A'])).rows;
   assert.equal(edges.length,8);for(const node of ['canonical-games','canonical-game-leaf','canonical-depth-8'])assert.ok((await feed(db,node)).rootRefs.some(r=>r.rootId==='native-root-A'));
   assert.equal((await feed(db,'canonical-nature')).rootRefs.length,0);
   const binding=(await db.query('SELECT * FROM '+NS+'.root_native_bindings WHERE root_id=$1',['native-root-A'])).rows[0];assert.deepEqual(binding.selected_path,['canonical-games']);
  });
  await t.test('all15 outside-detail roots use actual protected preparation and canonical writes',async()=>{
   for(let i=1;i<16;i++){const done=await service.finish('outside-'+i,page('outside-'+i,i));assert.equal(done.receipt.semanticNodeId,i===1?'canonical-nature':'canonical-outside-'+i);assert.equal(service.context().description.mapping.semantic.reason,'accepted-root-outside-detail-scope');}
  });
  await t.test('fresh observation with unchanged material appends evidence without material-version inflation',async()=>{
   const before=(await db.query('SELECT count(*) AS n FROM '+NS+'.input_versions WHERE source_id=$1',[A.receipt.sourceId])).rows[0].n;
   const renew=await service.finish('renew-A',page('same-page',0,'fresh-observation'));assert.equal(renew.receipt.sourceVersion,A.receipt.sourceVersion);assert.notEqual(renew.receipt.decisionHash,A.receipt.decisionHash);
   assert.equal((await db.query('SELECT count(*) AS n FROM '+NS+'.input_versions WHERE source_id=$1',[A.receipt.sourceId])).rows[0].n,before);
   assert.ok(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.observations WHERE source_id=$1',[A.receipt.sourceId])).rows[0].n)>=2);
  });
  await t.test('page A→B/replay preserves original Source/Topic/Discussion/root and real reply hydration',async()=>{
   const original=(await db.query('SELECT * FROM '+NS+'.root_snapshots WHERE root_id=$1',['native-root-A'])).rows[0];
   B=await service.finish('update-B',page('same-page',1,'capture-B'));assert.equal(B.receipt.sourceId,A.receipt.sourceId);assert.equal(B.receipt.topicId,A.receipt.topicId);assert.equal(B.receipt.discussionId,A.receipt.discussionId);
   await post(db,B.receipt,'B');assert.deepEqual((await db.query('SELECT * FROM '+NS+'.root_snapshots WHERE root_id=$1',['native-root-A'])).rows[0],original);
   assert.deepEqual(await post(db,A.receipt,'A'),rootAReceipt,'completed SAME canonical root request replays before fresh B decision checks');
   assert.ok((await feed(db,'canonical-games')).rootRefs.some(r=>r.rootId==='native-root-A'));assert.ok((await feed(db,'canonical-nature')).rootRefs.some(r=>r.rootId==='native-root-B'));
   const allocated=service.allocations(),again=await service.ingress.ingest(B.request);assert.equal(again.replayed,true);assert.deepEqual(again.result.receipt,B.receipt);assert.equal(service.allocations(),allocated);
   const runtime=createCanonicalV4RuntimeRepository({database:db});const reply=await runtime.command({actorId:db.fixture.actorId,requestId:'actual-reply-after-B',expected:await runtime.version(),command:{type:'reply',discussionId:A.receipt.discussionId,rootId:'native-root-A',replyToId:null,body:'Reply remains in original discussion.',originSourceId:A.receipt.sourceId}});
   const hydrated=await createCanonicalV4ReadFacade({database:db}).discussionPage({topicId:A.receipt.topicId,limit:100,cursor:null});assert.ok(hydrated.items.some(p=>p.id===reply.result.contributionId));
  });
  await t.test('owner-wide CAS affects both authors, not semantic membership or existing root prefix',async()=>{
   const oldEdges=(await db.query('SELECT * FROM '+NS+'.root_edges ORDER BY root_id,ancestor_id')).rows,first=await feed(db);
   await policy(db,e,8,1);await assert.rejects(setFixtureOwnerPolicy(db,{ownerPrincipal:'account-22222222-2222-4222-8222-222222222222',lineageId:LINEAGE,expectedRevision:2,settings:settings(1),groupingHash:H,recordHash:e.head.recordFileSha256}));
   service.actor('account-22222222-2222-4222-8222-222222222222');authorTwo=await service.finish('author-two',page('author-two'));
   assert.equal(service.context().ownerPolicyRevision,2);assert.equal(service.context().description.mapping.grouping.selectedPath.length,8);
   assert.deepEqual((await db.query('SELECT * FROM '+NS+'.root_edges ORDER BY root_id,ancestor_id')).rows,oldEdges);assert.equal((await feed(db)).feedVersion,first.feedVersion);service.actor(db.fixture.actorId);
  });
  await t.test('unresolved actual native observation creates canonical root with NO semantic edges',async()=>{
   const unresolved=await service.finish('unresolved-native',page('unresolved',20));assert.equal(unresolved.receipt.semanticNodeId,null);
   assert.equal(service.context().description.mapping.semantic.status,'unresolved');await post(db,unresolved.receipt,'unresolved');
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.root_edges WHERE root_id=$1',['native-root-unresolved'])).rows[0].n),0);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM canonical_v4.contributions WHERE id=$1',['native-root-unresolved'])).rows[0].n),1);
  });
  await t.test('inherited versus explicit owner subtree cut changes posting projection without rescoring/edge rewrites',async()=>{
   const before=(await db.query('SELECT * FROM '+NS+'.root_native_bindings WHERE root_id=$1',['native-root-A'])).rows[0];
   await policy(db,e,1,2,[{nodeId:'depth-7',maxDepth:7}]);
   await post(db,authorTwo.receipt,'override-without-new-observation');
   const bound=(await db.query('SELECT * FROM '+NS+'.root_native_bindings WHERE root_id=$1',['native-root-override-without-new-observation'])).rows[0];
   assert.equal(bound.selected_path.length,7);assert.equal(Number(bound.owner_revision),3);
   assert.deepEqual((await db.query('SELECT * FROM '+NS+'.root_native_bindings WHERE root_id=$1',['native-root-A'])).rows[0],before);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.root_edges WHERE root_id=$1',['native-root-override-without-new-observation'])).rows[0].n),8);
  });
  await t.test('ancestor keyset pages deduplicate, exclude siblings and fence only related feed changes',async()=>{
   const first=await feed(db,'canonical-games',{limit:1});assert.equal(first.rootRefs.length,1);assert.ok(first.nextAfterRootId);
   const second=await feed(db,'canonical-games',{limit:1,expectedEpoch:first.visibilityEpoch,expectedFeedVersion:first.feedVersion,afterRootId:first.nextAfterRootId});
   assert.equal(second.status,'ready');assert.equal(second.rootRefs.length,1);assert.notEqual(second.rootRefs[0].rootId,first.rootRefs[0].rootId);
   await post(db,B.receipt,'unrelated-nature');
   const stable=await feed(db,'canonical-games',{limit:1,expectedEpoch:first.visibilityEpoch,expectedFeedVersion:first.feedVersion,afterRootId:first.nextAfterRootId});assert.equal(stable.status,'ready');
   await post(db,authorTwo.receipt,'related-games');
   assert.equal((await feed(db,'canonical-games',{limit:1,expectedEpoch:first.visibilityEpoch,expectedFeedVersion:first.feedVersion,afterRootId:first.nextAfterRootId})).status,'stale-feed');
   const all=await feed(db);assert.equal(new Set(all.rootRefs.map(r=>r.rootId)).size,all.rootRefs.length);assert.equal(all.rootRefs.some(r=>r.rootId==='native-root-B'),false);
   const child=await feed(db,'canonical-depth-8');assert.ok(child.rootRefs.every(r=>all.rootRefs.some(a=>a.rootId===r.rootId)));
  });
  await t.test('pre-enqueue failure retains bounded original issued command; explicit same request resumes only handoff',async()=>{
   const separate=databaseIngress(db,e,{failEnqueueOnce:true}),request=separate.request('handoff-before-enqueue',page('handoff'));
   await assert.rejects(separate.ingress.ingest(request));const initial=(await db.query('SELECT id,deadline,params FROM '+NS+'.issued_commands WHERE operation_id=$1',['handoff-before-enqueue'])).rows[0];
   assert.ok(initial.params);assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.jobs WHERE operation_id=$1',['handoff-before-enqueue'])).rows[0].n),0);
   const allocated=separate.allocations(),resumed=await separate.ingress.ingest(request);assert.equal(resumed.replayed,true);assert.equal(resumed.result.state,'pending');assert.equal(separate.allocations(),allocated);
   const after=(await db.query('SELECT id,deadline,params FROM '+NS+'.issued_commands WHERE operation_id=$1',['handoff-before-enqueue'])).rows[0];assert.equal(after.id,initial.id);assert.equal(String(after.deadline),String(initial.deadline));assert.equal(after.params,null);
   const ref={generation:db.fixture.generation,operationId:request.operationId,principal:db.fixture.actorId,commandHash:resumed.result.commandHash};await revokeScoped(db,ref);await cleanupScoped(db,ref);
   const terminal=await separate.ingress.ingest(request);assert.equal(terminal.result.state,'cancelled');
   const scrubbed=(await db.query('SELECT i.description,i.params,a.authority FROM '+NS+'.issued_commands i JOIN '+NS+'.attestations a ON a.id=i.attestation_id WHERE i.operation_id=$1',[request.operationId])).rows[0];assert.deepEqual(scrubbed,{description:null,params:null,authority:null});
   separate.ingress.close();
  });
  await t.test('committed attestation without issuance quarantines retries before allocation or preparation',async()=>{
   const separate=databaseIngress(db,e,{failIssueOnce:true}),request=separate.request('attest-without-issued',page('orphan-attestation'));
   await assert.rejects(separate.ingress.ingest(request),error=>error.message==='Invented pre-issuance transport failure');
   const original=(await db.query('SELECT id,deadline,authority FROM '+NS+'.attestations WHERE operation_id=$1',[request.operationId])).rows[0];
   assert.ok(original.authority);assert.equal(separate.allocations(),1);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.issued_commands WHERE operation_id=$1',[request.operationId])).rows[0].n),0);
   const before=separate.calls();
   await assert.rejects(separate.ingress.ingest(request),error=>error.code==='P2402'&&error.message==='Unfinished issuance requires reconciliation');
   assert.deepEqual(separate.calls(),before);assert.equal(separate.allocations(),1);
   assert.deepEqual((await db.query('SELECT id,deadline,authority FROM '+NS+'.attestations WHERE operation_id=$1',[request.operationId])).rows[0],original);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.jobs WHERE operation_id=$1',[request.operationId])).rows[0].n),0);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE url=$1',[request.observation.nativeWitness.sourceUrl])).rows[0].n),0);
   // Disposable OWNER expiry injection only: do not wait, renew or reinstall.
   await db.transaction(tx=>tx.query('UPDATE '+NS+'.attestations SET deadline=clock_timestamp()-interval \'1 second\' WHERE id=$1',[original.id]));
   assert.ok(await expireFixtureIssued(db)>0);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.attestations WHERE id=$1',[original.id])).rows[0].n),0);
   assert.deepEqual((await db.query('SELECT generation,operation_id,kind FROM '+NS+'.retired_operations WHERE operation_id=$1',[request.operationId])).rows[0],{generation:db.fixture.generation,operation_id:request.operationId,kind:'admission'});
   await assert.rejects(separate.ingress.ingest(request),error=>error.code==='P2402');assert.deepEqual(separate.calls(),before);separate.ingress.close();
  });
  await t.test('lease/token/prior mismatches and one-use attestation cannot create duplicate canonical Sources',async()=>{
   const request=service.request('pending-lease-negative',page('lease-negative')),queued=await service.ingress.ingest(request);
   const ref={generation:db.fixture.generation,operationId:request.operationId,principal:db.fixture.actorId,commandHash:queued.result.commandHash,worker:'lease-fixture',token:'first-native-token',leaseSeconds:15};
   const leased=await claimScoped(db,ref);await assert.rejects(claimScoped(db,{...ref,worker:'other-worker',token:'other-token'}));
   await assert.rejects(completeScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash,worker:ref.worker,token:ref.token,epoch:leased.epoch+1}));
   await revokeScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});
   await cleanupScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});
   const after=await service.ingress.ingest(request);assert.equal(after.result.state,'cancelled');assert.equal(Number((await db.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE url=$1',[request.observation.nativeWitness.sourceUrl])).rows[0].n),0);
  });
  await t.test('private attestation revocation and expired prequeue commands fail closed and scrub without renewal',async()=>{
   const pending=service.request('revoke-native-attestation',page('attest-revoked')),q=await service.ingress.ingest(pending);
   const ref={generation:db.fixture.generation,operationId:pending.operationId,principal:db.fixture.actorId,commandHash:q.result.commandHash,worker:'fixture-worker',token:'fixture-attest-token',leaseSeconds:15};
   const lease=await claimScoped(db,ref);await revokeFixtureAttestation(db,'attestation-'+pending.operationId);
   assert.deepEqual(await completeScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash,worker:ref.worker,token:ref.token,epoch:lease.epoch}),{state:'cancelled',code:'native-authority-unavailable'});
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE url=$1',[pending.observation.nativeWitness.sourceUrl])).rows[0].n),0);
   await revokeScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});await cleanupScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});
   const held=databaseIngress(db,e,{failEnqueueOnce:true}),r=held.request('expired-before-enqueue',page('expired-prequeue'));await assert.rejects(held.ingress.ingest(r));
   // Disposable OWNER adversarial injection, not a clock/serving privilege.
   await db.transaction(tx=>tx.query('UPDATE '+NS+'.issued_commands SET deadline=clock_timestamp()-interval \'1 second\' WHERE operation_id=$1',[r.operationId]));
   assert.ok(await expireFixtureIssued(db)>0);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.issued_commands WHERE operation_id=$1',[r.operationId])).rows[0].n),0);
   const retired=(await db.query('SELECT generation,operation_id,kind FROM '+NS+'.retired_operations WHERE operation_id=$1',[r.operationId])).rows[0];assert.deepEqual(retired,{generation:db.fixture.generation,operation_id:r.operationId,kind:'admission'});
   await assert.rejects(held.ingress.ingest(r));held.ingress.close();
  });
  await t.test('completion rejoins publication head and Source incarnation before any canonical mutation',async()=>{
   const request=service.request('head-source-fences',page('same-page',0,'capture-fence')),queued=await service.ingress.ingest(request);
   const ref={generation:db.fixture.generation,operationId:request.operationId,principal:db.fixture.actorId,commandHash:queued.result.commandHash,worker:'fence-worker',token:'fence-token',leaseSeconds:15};const lease=await claimScoped(db,ref);
   const prior=(await db.query('SELECT * FROM '+NS+'.current_inputs WHERE source_id=$1',[A.receipt.sourceId])).rows;
   const sourceBefore=(await db.query('SELECT * FROM canonical_v4.sources WHERE id=$1',[A.receipt.sourceId])).rows;
   for(const mode of ['head','source']){
    // Explicit disposable OWNER corruption probe, not native concurrency.
    // A finite failure is a successful SQL statement: force rollback INSIDE
    // the transaction so the deliberately corrupted fixture can never commit.
    const marker=Object.freeze({rollback:'completion-fence-'+mode});
    await assert.rejects(db.transaction(async tx=>{
     if(mode==='head')await tx.query('UPDATE '+NS+'.publication_heads SET head_revision=head_revision+1 WHERE publication_id=$1',[e.head.publicationId]);
     else await tx.query('UPDATE '+NS+'.containers SET incarnation=$1 WHERE source_id=$2',['different-incarnation',A.receipt.sourceId]);
     const outcome=(await tx.query('SELECT '+NS+'.complete($1,$2,$3,$4,$5,$6,$7) AS result',[ref.generation,ref.operationId,ref.principal,ref.commandHash,ref.worker,ref.token,lease.epoch])).rows[0].result;
     assert.equal(mode,'head','Source incarnation mismatch must raise P2402');
     assert.deepEqual(outcome,{state:'cancelled',code:'native-authority-unavailable'});
     assert.deepEqual((await tx.query('SELECT * FROM '+NS+'.current_inputs WHERE source_id=$1',[A.receipt.sourceId])).rows,prior);
     assert.deepEqual((await tx.query('SELECT * FROM canonical_v4.sources WHERE id=$1',[A.receipt.sourceId])).rows,sourceBefore);
     throw marker;
    }),error=>mode==='head'?error===marker:error?.code==='P2402');
    assert.deepEqual((await db.query('SELECT * FROM '+NS+'.current_inputs WHERE source_id=$1',[A.receipt.sourceId])).rows,prior);
    assert.deepEqual((await db.query('SELECT * FROM canonical_v4.sources WHERE id=$1',[A.receipt.sourceId])).rows,sourceBefore);
   }
   await revokeScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});await cleanupScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});
  });
  await t.test('actual mutation before original authority expiry still rolls back at late literal COMMIT',async()=>{
   const late=databaseIngress(db,e,{authorityMs:1500}),request=late.request('late-commit',page('late-commit')),queued=await late.ingress.ingest(request);
   const ref={generation:db.fixture.generation,operationId:request.operationId,principal:db.fixture.actorId,commandHash:queued.result.commandHash,worker:'late-worker',token:'late-token',leaseSeconds:15};const lease=await claimScoped(db,ref);let mutated=false;
   await assert.rejects(db.transaction(async tx=>{
    await tx.query('SELECT '+NS+'.complete($1,$2,$3,$4,$5,$6,$7)',[ref.generation,ref.operationId,ref.principal,ref.commandHash,ref.worker,ref.token,lease.epoch]);
    assert.equal(Number((await tx.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE url=$1',[request.observation.nativeWitness.sourceUrl])).rows[0].n),1);mutated=true;
    await tx.query('SELECT pg_sleep(1.6)');
   }),error=>error?.code==='P2402'||error?.code==='P2306');assert.equal(mutated,true,'must observe actual uncommitted canonical mutation before expiry wait');
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE url=$1',[request.observation.nativeWitness.sourceUrl])).rows[0].n),0);
   await revokeScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});await cleanupScoped(db,{generation:ref.generation,operationId:ref.operationId,principal:ref.principal,commandHash:ref.commandHash});late.ingress.close();
  });
  await t.test('actual canonical mutation rollback and destructive wrappers restore all history/edges atomically',async()=>{
   const actor={type:'human',demo:false,id:db.fixture.actorId,accountId:db.fixture.actorId.slice(8),displayName:'Fixture_owner'};
   const snapshots=(await db.query('SELECT * FROM '+NS+'.root_snapshots ORDER BY root_id')).rows,edges=(await db.query('SELECT * FROM '+NS+'.root_edges ORDER BY root_id,ancestor_id')).rows;
   for(const mode of ['withdraw','account','topic','clear']){
    const marker=Object.freeze({rollback:mode});
    await assert.rejects(db.transaction(async tx=>{
     if(mode==='topic'||mode==='clear')await tx.query('SELECT '+NS+'.enter_gate(true)');
     const version=(await tx.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];
     const lifecycle=createCanonicalV4LifecycleRepository({database:tx});
     if(mode==='withdraw')await lifecycle.command({generation:version.generation,revision:Number(version.revision)},{type:'withdraw',contributionId:'native-root-A'},actor);
     else if(mode==='account')await lifecycle.withdrawAccountContributions(db.fixture.actorId);
     else if(mode==='topic')await tx.query('SELECT canonical_v4.ingest_delete_learned_topic($1,$2,$3)',[db.fixture.generation,A.receipt.topicId,'DELETE TOPIC AND DISCUSSION']);
     else await tx.query('SELECT canonical_v4.ingest_clear_learned_data($1,$2)',[db.fixture.generation,'CLEAR LEARNED DATA']);
     assert.equal(Number((await tx.query('SELECT count(*) AS n FROM '+NS+'.root_edges WHERE root_id=$1',['native-root-A'])).rows[0].n),0);
     throw marker;
    }),error=>error===marker);
    assert.deepEqual((await db.query('SELECT * FROM '+NS+'.root_snapshots ORDER BY root_id')).rows,snapshots);assert.deepEqual((await db.query('SELECT * FROM '+NS+'.root_edges ORDER BY root_id,ancestor_id')).rows,edges);
   }
  });
  await t.test('two accepted revisions SAME publication family preserve old ancestry; family revoke hides edges only',async()=>{
   const cursor=await feed(db,'canonical-games',{limit:1}),second=fixture({c:maximumCandidate()});second.record.publicationRevision=2;second.head.publicationRevision=2;second.head.headRevision=2;second.seal();
   await install(db,second);await policy(db,second,8,3);const next=databaseIngress(db,second);const newer=await next.finish('under-publication-two',page('publication-two'));await post(db,newer.receipt,'publication-two');
   const visible=await feed(db);assert.ok(visible.rootRefs.some(r=>r.rootId==='native-root-A'));assert.ok(visible.rootRefs.some(r=>r.rootId==='native-root-publication-two'));
   assert.equal((await feed(db,'canonical-games',{expectedEpoch:cursor.visibilityEpoch,expectedFeedVersion:cursor.feedVersion,afterRootId:cursor.nextAfterRootId})).status,'stale-feed');
   await controlFixturePublication(db,{publicationId:e.head.publicationId,expectedHeadRevision:2,status:'revoked'});assert.equal((await feed(db)).rootRefs.length,0);
   const discussion=await createCanonicalV4ReadFacade({database:db}).fullDiscussion(A.receipt.topicId);assert.ok(discussion.items.some(p=>p.id==='native-root-A'));
   next.ingress.close();
  });
  await t.test('unissued/forged refs/direct old publication or node enqueue refuse without canonical mutation',async()=>{
   const before=(await db.query('SELECT count(*) AS n FROM canonical_v4.sources')).rows[0].n;
   await assert.rejects(enqueueIssued(db,{generation:db.fixture.generation,operationId:'forged',principal:db.fixture.actorId,issuedId:'invented-not-installed'}));
   await assert.rejects(db.query('SELECT '+NS+'.publish($1,$2)',[JSON.stringify({}),JSON.stringify(['flat'])]));
   assert.equal((await db.query('SELECT count(*) AS n FROM canonical_v4.sources')).rows[0].n,before);
  });
  await t.test('Source erasure scrubs vectors/evidence and retires operations but keeps original discussion',async()=>{
   const before=(await db.query('SELECT discussion_id FROM canonical_v4.contributions WHERE id=$1',['native-root-A'])).rows[0].discussion_id;
   await forgetFastSource(db,{generation:db.fixture.generation,sourceId:A.receipt.sourceId});
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.input_versions WHERE source_id=$1',[A.receipt.sourceId])).rows[0].n),0);
   assert.equal((await db.query('SELECT discussion_id FROM canonical_v4.contributions WHERE id=$1',['native-root-A'])).rows[0].discussion_id,before);
   await assert.rejects(service.ingress.ingest(A.request));assert.equal((await feed(db)).rootRefs.length,0);
  });
 }finally{service?.ingress.close();await db.close();}
});

// Sequential, independently disposed memory fixture: neither case relies on
// the first suite's deep publication, policy revisions or previous decisions.
test('actual local-detail conflict and STOP persist root-only canonical membership (separately gated)',{skip:!SQL_ENABLED,timeout:180000},async t=>{
 const db=await createInputVersionFixtureDatabase(),e=fixture({c:candidate({detailWeight:0})});let service,expectedFacade;
 try{
  await install(db,e);await policy(db,e,8);service=databaseIngress(db,e);expectedFacade=e.facade();
  for(const mode of ['conflict','stop'])await t.test(mode,async()=>{
   const o=page('detail-'+mode);o.titleVector=mode==='conflict'?axis(1):axis(0).map((_,i)=>i===0?.6:i===20?.8:0);
   // Obtain the expectation from the actual protected219/196/190 chain, not
   // invented semantic JSON. In particular STOP's reason is not guessed.
   const expectedJob=expectedFacade.prepare(e.request(o,settings(8)));let expected;
   try{expected=expectedFacade.describe(expectedJob).mapping.semantic;}finally{expectedFacade.release(expectedJob);}
   assert.deepEqual(expected.supportedPath,['games']);
   if(mode==='conflict')assert.equal(expected.reason,'local-detail-conflict');
   const done=await service.finish('detail-'+mode,o),receipt=done.receipt;
   assert.equal(receipt.semanticNodeId,'canonical-games');
   assert.deepEqual(service.context().description.mapping.semantic,expected);
   const stored=(await db.query('SELECT semantic,supported_path FROM '+NS+'.native_decisions WHERE source_id=$1 AND decision_hash=$2',[receipt.sourceId,receipt.decisionHash])).rows;
   assert.equal(stored.length,1);assert.deepEqual(stored[0].semantic,expected);assert.deepEqual(stored[0].supported_path,['canonical-games']);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE id=$1',[receipt.sourceId])).rows[0].n),1);
   await post(db,receipt,'detail-'+mode);const rootId='native-root-detail-'+mode;
   assert.deepEqual((await db.query('SELECT ancestor_id FROM '+NS+'.root_edges WHERE root_id=$1 ORDER BY ancestor_id',[rootId])).rows,[{ancestor_id:'canonical-games'}]);
   assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+NS+'.root_snapshots WHERE root_id=$1',[rootId])).rows[0].n),1);
   assert.ok((await feed(db,'canonical-games')).rootRefs.some(r=>r.rootId===rootId));
   for(const node of ['canonical-game-leaf','canonical-game-deep','canonical-nature','canonical-nature-leaf'])assert.equal((await feed(db,node)).rootRefs.some(r=>r.rootId===rootId),false);
  });
 }finally{expectedFacade?.close();service?.ingress.close();await db.close();}
});
