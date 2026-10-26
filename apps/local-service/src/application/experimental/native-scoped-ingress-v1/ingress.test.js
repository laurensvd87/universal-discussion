// ADR220 pure invented service-port tests. No DB factory is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {compilePairedE5Input,describePairedE5Input} from '../../../domain/hierarchical-e5-paired-input.js';
import {compileNativeOwnerPreparation,prepareNativeOwnerObservation,compileNativeOwnerGrouping,describeNativeOwnerGrouping} from '../native-owner-grouping-v1/grouping.js';
import {describeNativeScopedObservation} from '../native-scoped-preparation-v1/preparation.js';
import {createNativeCanonicalPublicationFacade as createPublication} from '../native-canonical-publication-v1/publication.js';
import {createNativeScopedIngress as createIngress} from './ingress.js';
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

const ACTOR='account-11111111-1111-4111-8111-111111111111',ACTOR2='account-22222222-2222-4222-8222-222222222222';
const pending=()=>({state:'pending',commandHash:H,receipt:null,code:null});
function setup(overrides={}){
 const e=fixture(),calls=[],seen={},operations=new Map();let actor=ACTOR;
 const source={expected:{generation:'protected-generation',revision:7},sourceId:'protected-source',sourceIncarnation:null,topicId:'protected-topic',discussionId:'protected-discussion',createdAt:'2026-10-24T18:00:00Z',documentHash:H,prior:null,sourceAbsent:true};
 const deps={
  publication:{anchor:{publicationId:e.head.publicationId,recordFileSha256:e.head.recordFileSha256},readHead:()=>clone(e.head),guard:()=>true,
   readRecord:()=>{e.counts.record++;return e.recordBytes;},readBundle:()=>{e.counts.bundle++;return e.bundle;}},
  authenticate:async o=>{calls.push('authenticate');seen.observation=o;return {principal:actor,originKind:'actor',generation:source.expected.generation};},
  lookupOperation:async c=>{calls.push('lookup');seen.lookup=c;const found=operations.get(c.operationId);if(!found)return null;
   if(found.privatePrincipal&&found.privatePrincipal!==c.principal)throw new TypeError('Protected principal mismatch');
   return {requestHash:found.requestHash,...(found.result.state==='issued'?{issuedId:found.issuedId}:{}),result:found.result};},
  resolveSource:async()=>{calls.push('source');return clone(source);},
  resolveOwnerPolicy:async()=>{calls.push('owner');return {revision:1,settings:settings(1)};},
  attest:async(c,o)=>{calls.push('attest');seen.attestation=c;assert.equal(c.description.mapping.commitments.fieldBindings.bodySha256,sha(o.body));return {id:'protected-attestation-'+c.operationId};},
  issue:async c=>{calls.push('issue');seen.issue=c;operations.set(c.operationId,{privatePrincipal:c.auth.principal,requestHash:c.requestHash,issuedId:'issued-'+c.operationId,result:{state:'issued',commandHash:null,receipt:null,code:null}});
   return {generation:c.auth.generation,operationId:c.operationId,principal:c.auth.principal,issuedId:'issued-'+c.operationId};},
  enqueue:async ref=>{calls.push('enqueue');seen.enqueue=ref;const result=pending(),prior=operations.get(ref.operationId);operations.set(ref.operationId,{privatePrincipal:ref.principal,requestHash:prior.requestHash,result});return result;},...overrides
 };
 const ingress=createIngress(deps);
 return {e,calls,seen,source,operations,deps,ingress,actor:value=>{actor=value;},request:(operationId='operation-1')=>({publicationId:e.head.publicationId,operationId,observation:observation()})};
}
test('default EMPTY and unknown publication refuse before any service port; import is inert',async()=>{
 for(const facade of [createIngress(),createIngress(null)])await assert.rejects(facade.ingest({publicationId:'x',operationId:'x',observation:observation()}));
 const s=setup();await assert.rejects(s.ingress.ingest({...s.request(),publicationId:'other'}));assert.deepEqual(s.calls,[]);
 assert.deepEqual(Object.keys(s.ingress),['ingest','close']);assert.ok(Object.isFrozen(s.ingress));
 const empty=setup({publication:null});await assert.rejects(empty.ingress.ingest(empty.request()));assert.deepEqual(empty.calls,[]);
});
test('real219 chain, server-resolved canonical target and owner policy reach protected issuance',async()=>{
 const s=setup(),r=await s.ingress.ingest(s.request());assert.equal(r.replayed,false);assert.equal(r.publicationVerified,false);assert.equal(r.assignmentAuthority,false);
 assert.deepEqual(s.calls,['authenticate','lookup','source','owner','attest','issue','enqueue']);
 const d=s.seen.issue.description;assert.equal(d.mapping.grouping.primaryCanonicalNodeId,'canonical-games');
 assert.equal(d.mapping.grouping.deepestSupportedCanonicalNodeId,'canonical-game-deep');assert.equal(d.mapping.compatibility.currentQueueShapeCompatible,false);
 assert.equal(d.mapping.declaredCanonicalSource.sourceId,s.source.sourceId);assert.equal(d.mapping.declaredCanonicalSource.documentHash,H);
 assert.equal(d.mapping.publicationIdentityChecked,false);assert.equal(d.mapping.registryArtifactHash,null);
 assert.equal(s.seen.issue.parameters.length,12);assert.equal(s.seen.issue.parameters[11],'canonical-game-deep');assert.equal(s.seen.issue.parameters[4],'protected-source');
 assert.equal(sha(s.seen.issue.parameters[3]),d.mapping.commitments.materialHash);
 assert.deepEqual(s.seen.enqueue,{generation:s.source.expected.generation,operationId:'operation-1',principal:ACTOR,issuedId:'issued-operation-1'});
 assert.equal(JSON.stringify(r).includes('Invented body'),false);
});
test('ordinary request cannot provide principal/Source/prior/depth/proof/job and has zero hooks',async()=>{
 const s=setup();let hooks=0;const trap=()=>{hooks++;throw Error('hook');},proxy=x=>new Proxy(x,{get:trap,getPrototypeOf:trap,ownKeys:trap});
 for(const key of ['principal','ownerGrouping','mapping','prior','accepted','attestation','job'])await assert.rejects(s.ingress.ingest({...s.request(),[key]:{}}));
 const getter=s.request();Object.defineProperty(getter.observation,'body',{get:trap,enumerable:true});
 const pair=s.request();pair.observation.bodyVector=proxy(axis(0));
 for(const r of [proxy(s.request()),getter,pair,{...s.request(),observation:{...observation(),body:{toJSON:trap}}}])await assert.rejects(s.ingress.ingest(r));
 assert.equal(hooks,0);assert.equal(s.calls.length,0);
});
test('exact replay happens before Source/owner/allocation/numerical work and preserves original receipt',async()=>{
 const s=setup(),request=s.request(),a=await s.ingress.ingest(request);s.calls.length=0;
 s.deps.resolveOwnerPolicy=()=>{throw Error('not a mutable installed port');};const b=await s.ingress.ingest(request);
 assert.equal(b.replayed,true);assert.deepEqual(b.result,a.result);assert.deepEqual(s.calls,['authenticate','lookup']);assert.equal(s.e.counts.record,1);
 // Changes under the same operation cannot invoke fresh issuance or reinterpret.
 s.calls.length=0;const changed=s.request();changed.observation.body+='different';
 await assert.rejects(s.ingress.ingest(changed));assert.deepEqual(s.calls,['authenticate','lookup']);
});
test('explicit SAME-request continuation uses stored issued reference once, without reissuing or resolving',async()=>{
 let attempts=0,s;const failure=Object.freeze({opaque:'not returned'});
 s=setup({enqueue:async ref=>{s.calls.push('enqueue');attempts++;if(attempts===1)throw failure;
  assert.equal(ref.issuedId,'issued-operation-1');const stored=s.operations.get(ref.operationId),result=pending();
  s.operations.set(ref.operationId,{privatePrincipal:ref.principal,requestHash:stored.requestHash,result});return result;}});
 await assert.rejects(s.ingress.ingest(s.request()),e=>e===failure);assert.equal(attempts,1);s.calls.length=0;
 const continued=await s.ingress.ingest(s.request());assert.equal(continued.replayed,true);assert.equal(continued.result.state,'pending');
 assert.deepEqual(s.calls,['authenticate','lookup','enqueue']);assert.equal(attempts,2);assert.equal(s.e.counts.record,1);
 assert.equal(JSON.stringify(continued).includes('issued-operation'),false);
 s.calls.length=0;await s.ingress.ingest(s.request());assert.deepEqual(s.calls,['authenticate','lookup']);assert.equal(attempts,2);
});
test('lost postcommit reply reconciles read-only; continuation rejects changed request/principal',async()=>{
 let attempts=0,s;s=setup({enqueue:async ref=>{attempts++;const stored=s.operations.get(ref.operationId);s.operations.set(ref.operationId,{privatePrincipal:ref.principal,requestHash:stored.requestHash,result:pending()});throw null;}});
 let caught=false;try{await s.ingress.ingest(s.request());}catch(e){caught=true;assert.equal(e,null);}assert.equal(caught,true);
 s.calls.length=0;assert.equal((await s.ingress.ingest(s.request())).result.state,'pending');assert.deepEqual(s.calls,['authenticate','lookup']);assert.equal(attempts,1);
 const x=setup({enqueue:async()=>{throw false;}});try{await x.ingress.ingest(x.request());}catch(e){assert.equal(e,false);}
 const before=x.calls.length,changed=x.request();changed.observation.body+='x';await assert.rejects(x.ingress.ingest(changed));assert.deepEqual(x.calls.slice(before),['authenticate','lookup']);
 x.actor(ACTOR2);await assert.rejects(x.ingress.ingest(x.request()));
});
test('continuation preserves original expiry and concurrent enqueue is one idempotent protected effect',async()=>{
 for(const state of ['expired','cancelled','erased']){
  let s;s=setup({enqueue:async()=>{throw 0;}});try{await s.ingress.ingest(s.request());}catch(e){assert.equal(e,0);}
  const original=s.operations.get('operation-1');let calls=0;
  const q=setup({lookupOperation:async c=>({requestHash:c.requestHash,issuedId:original.issuedId,result:original.result}),
   enqueue:async()=>{calls++;return {state,commandHash:null,receipt:null,code:'original-authority-unavailable'};}});
  assert.equal((await q.ingress.ingest(q.request())).result.state,state);assert.equal(calls,1);assert.equal(q.calls.includes('issue'),false);assert.equal(q.calls.includes('source'),false);
 }
 let accepted=null,effects=0,s;s=setup({lookupOperation:async c=>({requestHash:c.requestHash,issuedId:'original-private-reference',result:{state:'issued',commandHash:null,receipt:null,code:null}}),
  enqueue:async()=>{if(accepted===null){effects++;accepted=pending();}return accepted;}});
 const [a,b]=await Promise.all([s.ingress.ingest(s.request()),s.ingress.ingest(s.request())]);assert.deepEqual(a,b);assert.equal(effects,1);
 assert.equal(s.calls.includes('owner'),false);assert.equal(s.e.counts.record,0);
});
test('request precommitment preserves signed zero and ignores ordinary object property order',async()=>{
 const s=setup(),r=s.request();r.observation.bodyVector[3]=-0;await s.ingress.ingest(r);
 const reordered={observation:r.observation,operationId:r.operationId,publicationId:r.publicationId};assert.equal((await s.ingress.ingest(reordered)).replayed,true);
 const different=s.request();different.observation.bodyVector[3]=0;await assert.rejects(s.ingress.ingest(different));
 assert.match(s.seen.issue.parameters[9],/-0/);assert.equal(s.seen.issue.description.mapping.commitments.bodyWireHash,sha((()=>{const b=Buffer.alloc(20+384*12);[1,0,701,384,1].forEach((v,i)=>b.writeInt32BE(v,i*4));r.observation.bodyVector.forEach((v,i)=>{b.writeInt32BE(8,20+i*12);b.writeDoubleBE(v,24+i*12);});return b;})()));
});
test('two posting authors inherit the SAME configured owner-wide policy, never personal depth',async()=>{
 const s=setup();await s.ingress.ingest(s.request('author-one'));const first=s.seen.issue.description.mapping;
 s.actor(ACTOR2);await s.ingress.ingest(s.request('author-two'));const second=s.seen.issue.description.mapping;
 assert.equal(s.seen.issue.auth.principal,ACTOR2);assert.equal(first.grouping.ownerGroupingHash,second.grouping.ownerGroupingHash);
 assert.deepEqual(first.grouping.selectedPath,['games']);assert.deepEqual(second.grouping.selectedPath,['games']);
});
test('addressed updates use authoritative incarnation/prior and exact15 parameters',async()=>{
 const s=setup();s.source.sourceAbsent=false;s.source.sourceIncarnation='database-incarnation';s.source.prior={sourceVersion:'2',witnessHash:H,decisionHash:H};
 await s.ingress.ingest(s.request());assert.equal(s.seen.issue.source.sourceIncarnation,'database-incarnation');assert.equal(s.seen.issue.parameters.length,15);
 assert.deepEqual(s.seen.issue.parameters.slice(12),['2',H,H]);
});
test('independent norm/title/URL/material compatibility refusals never attest/issue; no normalization',async()=>{
 const s=setup(),r=s.request();r.observation.bodyVector[0]=1-2e-9;await assert.rejects(s.ingress.ingest(r));
 assert.equal(s.calls.includes('attest'),false);await s.ingress.ingest(s.request('valid-after-refusal'));assert.equal(s.e.counts.record,1);
});
test('128 sequential releases keep one219 context and bounded private capacity',async()=>{
 const s=setup();for(let i=0;i<128;i++)await s.ingress.ingest(s.request('sequential-'+i));
 assert.equal(s.e.counts.record,1);assert.equal(s.e.counts.bundle,1);assert.equal(s.operations.size,128);
});
test('port failures preserve falsy primary values and never retry mutation; finally releases219 job',async()=>{
 for(const value of [undefined,null,false,0]){let count=0;const s=setup({issue:async()=>{count++;throw value;}});
  let thrown=false;try{await s.ingress.ingest(s.request());}catch(error){thrown=true;assert.equal(error,value);}assert.equal(thrown,true);assert.equal(count,1);assert.equal(s.calls.includes('enqueue'),false);
  // Further distinct attempts can fail at the same protected port without
  // exhausting the underlying32 outstanding219 metadata jobs.
  for(let i=0;i<33;i++){try{await s.ingress.ingest(s.request('failed-'+i));}catch(error){assert.equal(error,value);}}assert.equal(s.e.counts.record,1);
 }
});
test('service async thenables/proxy/constructor hooks are refused without assimilation',async()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');};
 for(const value of [{get then(){return trap();}},new Proxy({},{get:trap,getPrototypeOf:trap}),Object.defineProperty(Promise.resolve({}),'constructor',{get:trap})]){
  const s=setup({authenticate:()=>value});await assert.rejects(s.ingress.ingest(s.request()));
 }assert.equal(hooks,0);
});
test('complete receipt channel has exact nested version/types/flags and no private payload escape',async()=>{
 const receipt={schema:'source-local-scoped-receipt/v1',policyVersion:'source-local-scoped-container/v1',version:{generation:'protected-generation',revision:8},sourceId:'source',sourceVersion:'1',topicId:'topic',discussionId:'discussion',inputHash:H,witnessHash:H,decisionHash:H,semanticNodeId:'canonical-games',artifactHash:H,experimental:true,productionValidated:false,assignmentAuthority:false,observationId:'observation'};
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');};
 for(const mutate of [r=>({...r,version:{...r.version,rawBody:'PRIVATE'}}),r=>({...r,version:{...r.version,revision:'8'}}),r=>({...r,sourceVersion:'0'}),r=>({...r,assignmentAuthority:true}),
  r=>({...r,version:new Proxy(r.version,{get:trap,getPrototypeOf:trap})}),r=>{Object.defineProperty(r.version,'revision',{get:trap,enumerable:true});return r;},r=>({...r,observationId:{toString:trap}})]){
  const s=setup({lookupOperation:async c=>({requestHash:c.requestHash,result:{state:'complete',commandHash:H,code:null,receipt:mutate(clone(receipt))}})});
  await assert.rejects(s.ingress.ingest(s.request()));assert.equal(s.calls.includes('source'),false);
 }
 assert.equal(hooks,0);
 const good=setup({lookupOperation:async c=>({requestHash:c.requestHash,result:{state:'complete',commandHash:H,code:null,receipt}})});
 assert.deepEqual((await good.ingress.ingest(good.request())).result.receipt,receipt);
 const uncertain=setup({lookupOperation:async c=>({requestHash:c.requestHash,result:{state:'issued',commandHash:null,receipt:null,code:null}})});
 await assert.rejects(uncertain.ingress.ingest(uncertain.request()));assert.equal(uncertain.calls.includes('issue'),false);
});
test('issued lookup must have null command hash, never a fabricated committed queue hash',async()=>{
 const s=setup({lookupOperation:async c=>({requestHash:c.requestHash,issuedId:'private-issued-reference',result:{state:'issued',commandHash:H,receipt:null,code:null}})});
 await assert.rejects(s.ingress.ingest(s.request()));assert.equal(s.calls.includes('enqueue'),false);assert.equal(s.calls.includes('issue'),false);
});
test('32 physically pending requests bound retained work; close is cancellation not commit rollback',async()=>{
 let resolve;const pendingPort=new Promise(r=>{resolve=r;});const s=setup({authenticate:()=>pendingPort});
 const work=Array.from({length:32},(_,i)=>s.ingress.ingest(s.request('held-'+i)));await assert.rejects(s.ingress.ingest(s.request('overflow')));
 s.ingress.close();resolve({principal:ACTOR,originKind:'actor',generation:s.source.expected.generation});
 assert.ok((await Promise.allSettled(work)).every(r=>r.status==='rejected'));await assert.rejects(s.ingress.ingest(s.request()));s.ingress.close();
});
test('closed/malformed/stale publication and forged trusted target never issue',async()=>{
 const s=setup();await s.ingress.ingest(s.request());s.e.head.status='revoked';await assert.rejects(s.ingress.ingest(s.request('revoked')));
 const t=setup({resolveSource:async()=>({...setup().source,expected:{generation:'other',revision:0}})});await assert.rejects(t.ingress.ingest(t.request()));assert.equal(t.calls.includes('attest'),false);
});
test('bounded timing diagnostics are pure source/service fixtures, not SQL/UI latency',async t=>{
 const s=setup(),times=[];for(let i=0;i<16;i++){const at=performance.now();await s.ingress.ingest(s.request('timed-'+i));times.push(performance.now()-at);}
 times.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({scope:'invented-async-ports-no-database-no-UI',p50Ms:times[8],p95Ms:times[15],maxMs:times[15]}));
});
