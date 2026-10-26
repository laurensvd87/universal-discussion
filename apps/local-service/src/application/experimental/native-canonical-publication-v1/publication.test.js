// Newly authored SOURCE fixtures; actual numerical owners, no saved artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {compilePairedE5Input,describePairedE5Input} from '../../../domain/hierarchical-e5-paired-input.js';
import {compileNativeOwnerPreparation,prepareNativeOwnerObservation,compileNativeOwnerGrouping,
 describeNativeOwnerGrouping,groupNativeOwnerObservation,describeNativeOwnerGroupedObservation} from '../native-owner-grouping-v1/grouping.js';
import {describeNativeScopedObservation} from '../native-scoped-preparation-v1/preparation.js';
import {compileNativeCanonicalMapping,mapNativeCanonicalObservation,describeNativeCanonicalMapping} from '../native-canonical-mapping-v1/mapping.js';
import {createNativeCanonicalPublicationFacade as create} from './publication.js';

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
 env.facade=(overrides={})=>create({anchor:{publicationId:r.publicationId,recordFileSha256:env.head.recordFileSha256},
  readHead:()=>{env.counts.head++;return clone(env.head);},readRecord:(_id,max)=>{assert.equal(_id,r.publicationId);assert.equal(max,256*1024);env.counts.record++;return env.recordBytes;},
  readBundle:(_id,max)=>{assert.equal(_id,r.publicationId);assert.equal(max,16*1024*1024);env.counts.bundle++;return env.bundle;},guard:()=>{env.counts.guard++;return true;},...overrides});
 return env;
}
function oracle(env,request){const prepared=prepareNativeOwnerObservation(env.context,request.observation),policy=compileNativeOwnerGrouping(env.context,request.ownerGrouping);
 const grouped=groupNativeOwnerObservation(policy,prepared),r=env.record,handle=compileNativeCanonicalMapping({schema:'native-canonical-mapping-template/v1',semanticTransferHash:r.nativeIdentity.semanticTransferHash,topologyHash:r.nativeIdentity.topologyHash,nodes:r.mapping.nodes,publication:r.mapping.declaredCanonicalPublication});
 return describeNativeCanonicalMapping(mapNativeCanonicalObservation(handle,grouped,request.mapping));}
function thrown(fn){let did=false,value;try{fn();}catch(error){did=true;value=error;}assert.equal(did,true);return value;}

test('empty real registry, exact API, malformed outer and unknown ID never call ports',()=>{
 for(const f of [create(),create(null)])assert.throws(()=>f.prepare(fixture().request()));
 const e=fixture(),f=e.facade();assert.deepEqual(Object.keys(f),['prepare','describe','release','close']);assert.ok(Object.isFrozen(f));
 for(const input of [null,{},Promise.resolve({}),{...e.request(),publicationId:'unknown'},{...e.request(),accepted:true}])assert.throws(()=>f.prepare(input));
 assert.deepEqual(e.counts,{head:0,record:0,bundle:0,guard:0});const job=f.prepare(e.request());assert.equal(f.describe(job).publicationVerified,false);
});

test('actual same-context pipeline yields exact207 description and all false authority flags',()=>{
 const e=fixture(),f=e.facade(),request=e.request(),d=f.describe(f.prepare(request));
 assert.deepEqual(d.mapping,oracle(e,request));assert.deepEqual(d.nativeIdentity,e.nativeIdentity);
 assert.deepEqual(Object.keys(d),['schema','publicationBinding','nativeIdentity','mapping','recordBindingHash','evidenceScope','publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated']);
 const {schema,publicationBinding,nativeIdentity,mapping}=d;assert.equal(d.recordBindingHash,digest({schema,publicationBinding,nativeIdentity,mapping}));
 for(const k of ['publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated'])assert.equal(d[k],false);
 for(const k of ['publicationIdentityChecked','nativeAttested','publicationVerified','assignmentAuthority'])assert.equal(d.mapping[k],false);
 assert.equal(d.mapping.registryArtifactHash,null);assert.equal(d.mapping.compatibility.currentRootOnlySchema,false);
 assert.equal(d.mapping.declaredPublication.claimScope,'declared-unverified-unbound');
 assert.deepEqual(d.mapping.semantic.supportedPath,['games','game-leaf','game-deep']);
});

test('all fourteen named identity substitutions are sticky trust refusals, never declared tuple equivalences',()=>{
 for(const key of Object.keys(fixture().nativeIdentity)){
  const e=fixture({recordChange:r=>{r.nativeIdentity[key]='0'.repeat(64);}}),f=e.facade();assert.throws(()=>f.prepare(e.request()),key);
  const before=e.counts.head;assert.throws(()=>f.prepare(e.request()));assert.equal(e.counts.head,before);
 }
 const e=fixture();assert.notEqual(e.record.mapping.declaredCanonicalPublication.encoderHash,e.nativeIdentity.encoderHash);
 assert.doesNotThrow(()=>e.facade().prepare(e.request()));
});

test('record and bundle FILE authentication precedes parsing; malformed protected artifacts invalidate',()=>{
 for(const which of ['record','bundle']){
  const e=fixture(),f=e.facade();if(which==='record')e.recordBytes=Buffer.from('{bad');else e.bundle=Buffer.from('{bad');
  assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));assert.equal(e.counts.record,1);
 }
 const mismatch=fixture();mismatch.record.incarnation='other';mismatch.seal();assert.throws(()=>mismatch.facade().prepare(mismatch.request()));
 for(const change of [r=>{r.acceptance.extra=H;},r=>{r.mapping.nodes[1].canonicalNodeId=r.mapping.nodes[0].canonicalNodeId;},r=>{r.mapping.nodes.pop();},r=>{r.mapping.declaredCanonicalPublication.modelId='other';}]){
  const e=fixture({recordChange:change}),f=e.facade();assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));
 }
});

test('hash-before-parse causally excludes the exact bad snapshot until its FILE hash matches',()=>{
 // Valid JSON primitive, invalid record AND invalid actual numerical candidate:
 // the SAME bytes distinguish FILE rejection from actual parsing/shape refusal.
 const original=JSON.parse,sentinel='"not-a-record-or-candidate"';let calls=0;
 try{
  JSON.parse=function(value,...args){if(value===sentinel)calls++;return Reflect.apply(original,JSON,[value,...args]);};
  for(const which of ['record','bundle']){
   const mismatch=fixture(),f=mismatch.facade();if(which==='record')mismatch.recordBytes=Buffer.from(sentinel);else mismatch.bundle=Buffer.from(sentinel);
   const before=calls;assert.throws(()=>f.prepare(mismatch.request()));assert.equal(calls,before);
   const match=fixture();if(which==='record'){match.recordBytes=Buffer.from(sentinel);match.head.recordFileSha256=sha(match.recordBytes);}
   else{match.bundle=Buffer.from(sentinel);match.record.bundleFileSha256=sha(match.bundle);match.seal();}
   assert.throws(()=>match.facade().prepare(match.request()));assert.equal(calls,before+2);
  }
 }finally{JSON.parse=original;}
});

test('strict authenticated codec rejects BOM/UTF8/decoded duplicates/Unicode/numbers/shape caps',()=>{
 const base=fixture();const malformed=[Buffer.from([0xc0,0xaf]),Buffer.from('\ufeff{}'),Buffer.from('{"a":1,"\\u0061":2}'),
  Buffer.from('{"a":"\\ud800"}'),Buffer.from('{"x":1e999}'),Buffer.from('{"x":'+ '1'.repeat(65)+'}'),Buffer.from('{"x":"'+'a'.repeat(4097)+'"}'),
  Buffer.from('['+'0,'.repeat(512)+'0]'),Buffer.from('{'+Array.from({length:33},(_,i)=>'"k'+i+'":0').join(',')+'}'),Buffer.from('['.repeat(18)+'0'+']'.repeat(18))];
 for(const bundle of malformed){const e=fixture();e.bundle=bundle;e.record.bundleFileSha256=sha(bundle);e.seal();const f=e.facade();assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));}
 const e=fixture();e.recordBytes=Buffer.from(' '+JSON.stringify(base.record));e.head.recordFileSha256=sha(e.recordBytes);assert.throws(()=>e.facade().prepare(e.request()));
 const e2=fixture();e2.bundle=Buffer.from(' \n'+rawJson(e2.c)+'\t');e2.record.bundleFileSha256=sha(e2.bundle);e2.seal();assert.doesNotThrow(()=>e2.facade().prepare(e2.request()));
});

test('lexical-token bound refuses before whole-tree parsing, independently of byte/depth/array caps',()=>{
 const leaf='['+Array(512).fill('0').join(',')+']',branch='['+Array(512).fill(leaf).join(',')+']';
 // Numbers alone exceed1M; punctuation is also counted by the actual lexer.
 const text='['+Array(4).fill(branch).join(',')+']';assert.ok(Buffer.byteLength(text)<16*1024*1024);
 const e=fixture();e.bundle=Buffer.from(text);e.record.bundleFileSha256=sha(e.bundle);e.seal();
 const original=JSON.parse;let parsed=0;
 try{JSON.parse=function(value,...args){if(value===text)parsed++;return Reflect.apply(original,JSON,[value,...args]);};assert.throws(()=>e.facade().prepare(e.request()));}
 finally{JSON.parse=original;}assert.equal(parsed,0);
});

test('bounded binary detachment invokes no provider iterator/species/constructor/getter/proxy hooks',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');};
 for(const name of ['record','bundle']){
  for(const kind of ['hooks','proxy','shared','resizable','oversize','thenable','ownThen','ownThenGetter','inheritedThen']){
   const e=fixture(),original=name==='record'?e.recordBytes:e.bundle;let bytes;
   if(kind==='hooks'){bytes=Uint8Array.from(original);for(const key of ['constructor',Symbol.iterator,'byteLength','buffer'])Object.defineProperty(bytes,key,{get:trap});}
   if(kind==='proxy')bytes=new Proxy(original,{get:trap,getPrototypeOf:trap});
   if(kind==='shared')bytes=new Uint8Array(new SharedArrayBuffer(original.length));
   if(kind==='resizable')bytes=new Uint8Array(new ArrayBuffer(original.length,{maxByteLength:original.length+1}));
   if(kind==='oversize')bytes=new Uint8Array((name==='record'?256*1024:16*1024*1024)+1);
   if(kind==='thenable')bytes={get then(){return trap();}};
   if(kind==='ownThen'){bytes=Uint8Array.from(original);Object.defineProperty(bytes,'then',{value:trap});}
   if(kind==='ownThenGetter'){bytes=Uint8Array.from(original);Object.defineProperty(bytes,'then',{get:trap});}
   if(kind==='inheritedThen'){bytes=Uint8Array.from(original);Object.setPrototypeOf(bytes,Object.assign(Object.create(Uint8Array.prototype),{then:trap}));}
   const f=e.facade({[name==='record'?'readRecord':'readBundle']:()=>bytes});
   if(kind==='hooks')assert.doesNotThrow(()=>f.prepare(e.request()));else assert.throws(()=>f.prepare(e.request()));
  }
 }
 assert.equal(hooks,0);
});

test('post-port mutation of provider byte storage cannot change detached authenticated snapshots',()=>{
 const e=fixture();let recordRead=false,bundleRead=false;
 const f=e.facade({readRecord:()=>{recordRead=true;return e.recordBytes;},readBundle:()=>{bundleRead=true;return e.bundle;},
  guard:()=>{if(recordRead){e.recordBytes.fill(0);recordRead=false;}if(bundleRead){e.bundle.fill(0);bundleRead=false;}return true;}});
 assert.doesNotThrow(()=>f.prepare(e.request()));
 // No raw buffer survives the cold call; subsequent warm calls use private
 // compiled context/authenticated metadata, not changed provider storage.
 assert.doesNotThrow(()=>f.prepare(e.request()));
});

test('zero-hook ordinary validation extends through deps, requests, observations, policies and mapping',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');},proxy=x=>new Proxy(x,{get:trap,ownKeys:trap,getPrototypeOf:trap});
 const getter=(x,k)=>{Object.defineProperty(x,k,{get:trap,enumerable:true,configurable:true});return x;};
 assert.throws(()=>create(proxy({})));assert.throws(()=>create(getter({anchor:0,readHead:0,readRecord:0,readBundle:0,guard:0},'anchor')));
 const e=fixture(),f=e.facade();
 for(const mutation of [r=>proxy(r),r=>getter(r,'publicationId'),r=>({...r,publicationId:{toString:trap}}),r=>({...r,observation:proxy(r.observation)}),
  r=>({...r,observation:getter(r.observation,'body')}),r=>({...r,ownerGrouping:proxy(r.ownerGrouping)}),r=>({...r,ownerGrouping:{...r.ownerGrouping,overrides:proxy([])}}),
  r=>({...r,mapping:proxy(r.mapping)}),r=>({...r,mapping:{...r.mapping,pair:getter(r.mapping.pair,'bodyVector')}}),
  r=>({...r,observation:{...r.observation,bodyVector:proxy(axis(0))}}),r=>({...r,observation:{...r.observation,nativeWitness:getter(r.observation.nativeWitness,'caseId')}})])assert.throws(()=>f.prepare(mutation(e.request())));
 assert.equal(hooks,0);assert.doesNotThrow(()=>f.prepare(e.request()));
});

test('trusted dependency/head descriptor and prototype validation is also zero-hook and sticky',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');};const e=fixture();
 const deps={anchor:{publicationId:e.head.publicationId,recordFileSha256:e.head.recordFileSha256},readHead:()=>clone(e.head),readRecord:()=>e.recordBytes,readBundle:()=>e.bundle,guard:()=>true};
 assert.throws(()=>create({...deps,guard:new Proxy(()=>true,{apply:trap,get:trap})}));
 assert.throws(()=>create({...deps,anchor:new Proxy(deps.anchor,{getPrototypeOf:trap,get:trap})}));
 for(const make of [()=>new Proxy(e.head,{get:trap,getPrototypeOf:trap,ownKeys:trap}),()=>{const h=clone(e.head);Object.defineProperty(h,'status',{get:trap,enumerable:true});return h;},
  ()=>Object.assign(Object.create(null),e.head),()=>({...e.head,then:trap})]){
  const f=e.facade({readHead:make});assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));
 }
 assert.equal(hooks,0);
});

test('same-hash foreign/serialized prepared jobs are not an input route',()=>{
 const a=fixture(),b=fixture(),f=a.facade(),policy=compileNativeOwnerGrouping(b.context,settings()),grouped=groupNativeOwnerObservation(policy,b.prepared);
 for(const observation of [b.prepared,grouped,describeNativeOwnerGroupedObservation(grouped),JSON.parse(JSON.stringify(describeNativeScopedObservation(b.prepared)))])assert.throws(()=>f.prepare({...a.request(),observation}));
 const job=f.prepare(a.request());for(const foreign of [b.prepared,grouped,{},JSON.parse(JSON.stringify(f.describe(job)))]){assert.throws(()=>f.describe(foreign));assert.throws(()=>f.release(foreign));}
});

test('malformed nested first request discards cold context; warm request failure preserves cache and jobs',()=>{
 for(const key of ['observation','ownerGrouping','mapping']){
  const e=fixture(),f=e.facade();assert.throws(()=>f.prepare({...e.request(),[key]:{}}));assert.equal(e.counts.record,1);
  const first=f.prepare(e.request());assert.equal(e.counts.record,2);const before={...e.counts};
  assert.throws(()=>f.prepare({...e.request(),[key]:{}}));assert.doesNotThrow(()=>f.describe(first));f.release(f.prepare(e.request()));
  assert.equal(e.counts.record,before.record);assert.equal(e.counts.bundle,before.bundle);
 }
});

test('exact fence guard/head/guard brackets surround reads, computation and issuance',()=>{
 const e=fixture(),events=[],f=e.facade({guard:()=>{events.push('G');return true;},readHead:()=>{events.push('H');return clone(e.head);},
  readRecord:()=>{events.push('R');return e.recordBytes;},readBundle:()=>{events.push('B');return e.bundle;}});
 const job=f.prepare(e.request());assert.equal(events.join(''), 'GHGGHGRGHGGHGBGHGGHGGHGGHG');
 events.length=0;f.release(f.prepare(e.request()));assert.equal(events.join(''),'GHGGHGGHG');f.release(job);
});

test('head absent/revoked/incarnation/revision/anchor/ABA changes invalidate every outstanding job',()=>{
 for(const mutation of [h=>null,h=>({...h,status:'revoked'}),h=>({...h,headRevision:2}),h=>({...h,incarnation:'new'}),h=>({...h,publicationRevision:2}),h=>({...h,recordFileSha256:H}),h=>({...h,headRevision:-0})]){
  const e=fixture();let changed=false;const f=e.facade({readHead:()=>changed?mutation(e.head):clone(e.head)}),job=f.prepare(e.request());changed=true;
  assert.throws(()=>f.prepare(e.request()));changed=false;assert.throws(()=>f.describe(job));assert.throws(()=>f.prepare(e.request()));
 }
});

test('head/guard port failures preserve falsy thrown values and invalidate without retry',()=>{
 for(const name of ['guard','readHead','readRecord','readBundle'])for(const value of [undefined,null,false,0,'']){
  const e=fixture(),f=e.facade({[name]:()=>{throw value;}});assert.equal(thrown(()=>f.prepare(e.request())),value);assert.throws(()=>f.prepare(e.request()));
 }
 for(const guard of [()=>false,()=>0,()=>({}),()=>Promise.resolve(true)]){const e=fixture(),f=e.facade({guard});assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));}
});

test('async/thenable trusted ports are never assimilated or credited as settled',()=>{
 let hooks=0;
 for(const name of ['readHead','readRecord','readBundle'])for(const value of [Promise.resolve({}),{get then(){hooks++;throw Error('hook');}}]){
  const e=fixture(),f=e.facade({[name]:()=>value});assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));
 }
 assert.equal(hooks,0);
});

test('reentrant prepare/describe/release poison even caught callbacks; close cancels issuance',()=>{
 for(const operation of ['prepare','describe','release','close'])for(const port of ['guard','readHead','readRecord','readBundle']){
  const e=fixture();let f,ran=false;
  const invoke=()=>{if(!ran){ran=true;try{if(operation==='prepare')f.prepare(e.request());else if(operation==='close')f.close();else f[operation]({});}catch{}}};
  const native={guard:()=>true,readHead:()=>clone(e.head),readRecord:()=>e.recordBytes,readBundle:()=>e.bundle};
  f=e.facade({[port]:()=>{invoke();return native[port]();}});assert.throws(()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));
 }
});

test('32 outstanding jobs, exact release credit, repeated close, 128 sequential reuse',()=>{
 const e=fixture(),f=e.facade(),jobs=Array.from({length:32},()=>f.prepare(e.request()));assert.throws(()=>f.prepare(e.request()));
 f.release(jobs[0]);assert.throws(()=>f.release(jobs[0]));assert.throws(()=>f.describe(jobs[0]));const replacement=f.prepare(e.request());assert.throws(()=>f.prepare(e.request()));
 for(const job of jobs.slice(1))f.release(job);f.release(replacement);
 for(let i=0;i<128;i++)f.release(f.prepare(e.request()));
 assert.equal(e.counts.record,1);assert.equal(e.counts.bundle,1);
 const live=f.prepare(e.request());f.close();f.close();for(const action of [()=>f.prepare(e.request()),()=>f.describe(live),()=>f.release(live)])assert.throws(action);
});

test('owner prefix and deepest branch override never change semantic/material identity',()=>{
 const e=fixture(),f=e.facade(),a=f.describe(f.prepare(e.request(observation(),settings(1)))),b=f.describe(f.prepare(e.request(observation(),settings(1,[{nodeId:'game-deep',maxDepth:3}]))));
 assert.deepEqual(a.mapping.semantic,b.mapping.semantic);assert.equal(a.mapping.commitments.materialHash,b.mapping.commitments.materialHash);
 assert.deepEqual(a.mapping.grouping.mappedSelectedPath,['canonical-games']);assert.equal(b.mapping.grouping.deepestSupportedCanonicalNodeId,'canonical-game-deep');
 assert.deepEqual(b.mapping.grouping.selectedPath,['games','game-leaf','game-deep']);assert.equal(a.mapping.compatibility.currentRootOnlySchema,false);
});

test('actual local-detail conflict and unresolved outcomes survive projection without fabricated jobs',()=>{
 const e=fixture({c:candidate({detailWeight:0})}),f=e.facade(),o=observation();o.titleVector=axis(1);
 const d=f.describe(f.prepare(e.request(o)));assert.equal(d.mapping.semantic.reason,'local-detail-conflict');assert.deepEqual(d.mapping.semantic.supportedPath,['games']);
 assert.equal(d.mapping.compatibility.currentRootOnlySchema,false);
 const tied=observation();tied.bodyVector=axis(3);tied.titleVector=axis(3);const u=f.describe(f.prepare(e.request(tied)));
 assert.equal(u.mapping.semantic.status,'unresolved');assert.deepEqual(u.mapping.semantic.supportedPath,[]);assert.equal(u.mapping.grouping.deepestSupportedCanonicalNodeId,null);
});

test('Source URL joins differ from document URL; both authentic native extractors only',()=>{
 for(const extractorVersion of ['main-text-prefix/v1','article-container-prefix/v1']){
  const e=fixture(),o=observation();o.extractorVersion=extractorVersion;
  o.nativeWitness.documentUrl=o.nativeWitness.sourceUrl+'?utm_source=invented';for(const row of o.nativeWitness.foregroundChecks)row.documentUrl=o.nativeWitness.documentUrl;
  const f=e.facade(),mapped=f.describe(f.prepare(e.request(o))).mapping;
  assert.notEqual(mapped.commitments.sourceUrlHash,mapped.commitments.documentUrlHash);assert.equal(mapped.commitments.sourceUrlHash,sha(o.nativeWitness.sourceUrl));
 }
 for(const extractorVersion of ['crawler-static-html-prefix/v1','unknown']){const e=fixture(),r=e.request();r.observation.extractorVersion=extractorVersion;r.mapping.fields.extractorVersion=extractorVersion;assert.throws(()=>e.facade().prepare(r));}
});

test('native LE pair bit commitment and independent PG BE array_send preserve signed zero',()=>{
 const e=fixture(),o=observation();o.bodyVector[3]=-0;const r=e.request(o),f=e.facade(),d=f.describe(f.prepare(r)).mapping;
 const le=Buffer.alloc(384*8),pg=Buffer.alloc(20+384*12);[1,0,701,384,1].forEach((v,i)=>pg.writeInt32BE(v,i*4));
 o.bodyVector.forEach((v,i)=>{le.writeDoubleLE(v,i*8);pg.writeInt32BE(8,20+i*12);pg.writeDoubleBE(v,24+i*12);});
 assert.equal(d.commitments.bodyVectorHash,createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(le).digest('hex'));
 assert.equal(d.commitments.bodyWireHash,sha(pg));assert.notEqual(d.commitments.bodyWireHash,d.commitments.bodyVectorHash);
 const changed=e.request(o);changed.mapping.pair.bodyVector[3]=0;assert.throws(()=>f.prepare(changed));assert.doesNotThrow(()=>f.prepare(e.request(o)));
});

test('bundle signed-zero vector artifact domain and root JSON property order are not FILE aliases',()=>{
 const c=candidate();c.detail.artifact.examples[0].vector[5]=-0;const e=fixture({c}),f=e.facade();assert.doesNotThrow(()=>f.prepare(e.request()));
 const changed=Buffer.from(JSON.stringify(c));assert.notEqual(sha(changed),sha(e.bundle));e.bundle=changed;e.record.bundleFileSha256=sha(changed);e.seal();
 const other=e.facade();assert.throws(()=>other.prepare(e.request()));
 const e2=fixture(),root=e2.c.rootCandidate.rootModel;const reordered=Object.fromEntries(Object.entries(root).reverse());assert.notEqual(digest(root),digest(reordered));
 e2.c.rootCandidate.rootModel=reordered;e2.bundle=Buffer.from(rawJson(e2.c));e2.record.bundleFileSha256=sha(e2.bundle);e2.seal();assert.throws(()=>e2.facade().prepare(e2.request()));
});

test('queue URL/title/norm/prior compatibility is descriptive, not semantic normalization or authority',()=>{
 for(const mutate of [r=>{r.observation.bodyVector[0]=1-2e-9;r.mapping.pair.bodyVector[0]=1-2e-9;},
  r=>{r.mapping.canonicalSource.prior={sourceVersion:'not-decimal',witnessHash:H,decisionHash:H};},
  r=>{r.observation.rawTitle='A\tB';r.observation.effectiveTitle='A\tB';r.mapping.fields.rawTitle='A\tB';r.mapping.fields.effectiveTitle='A\tB';}]){
  const e=fixture(),r=e.request();mutate(r);const f=e.facade(),d=f.describe(f.prepare(r));assert.equal(d.mapping.compatibility.currentQueueShapeCompatible,false);
  assert.equal(d.publicationVerified,false);assert.equal(d.mapping.semantic.status,'candidate');assert.deepEqual(d.mapping,oracle(e,r));
 }
});

function rehashRoot(c){const m=c.rootCandidate.rootModel,p=c.rootCandidate.rootPolicy;
 m.nodes.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);m.heads.sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
 m.taxonomyHash=digest(m.nodes);m.parameterHash=digest({schema:m.schema,representation:m.representation,representationHash:m.representationHash,heads:m.heads});
 p.modelHash=digest(m);p.nodeIds=m.nodes.map(n=>n.id);delete p.policyHash;p.policyHash=digest(p);}
test('complete143 topology, outside-scope roots, depth8 and depth9 refusal use actual compilers',()=>{
 const c=candidate(),a=c.detail.artifact,m=c.rootCandidate.rootModel;
 a.nodes=a.nodes.filter(n=>!n.id.startsWith('nature'));a.examples=a.examples.filter(n=>!n.nodeId.startsWith('nature'));a.nodePolicies=a.nodePolicies.filter(n=>!n.nodeId.startsWith('nature'));c.detail.supportedRootIds=['games'];
 let parent='game-deep';for(let depth=4;depth<=8;depth++){const id='depth-'+depth;a.nodes.push({id,parentId:parent});a.nodePolicies.push({...a.nodePolicies[0],nodeId:id});parent=id;}
 for(const row of a.examples)row.nodeId=parent;
 for(let i=2;i<16;i++){const nodeId='outside-'+i;m.nodes.push({id:nodeId,parentId:null});m.heads.push({...m.heads[0],nodeId,weights:axis(i)});}rehashRoot(c);
 for(let i=a.nodes.length;i<128;i++){const id='detail-'+i;a.nodes.push({id,parentId:'games'});a.nodePolicies.push({...a.nodePolicies[0],nodeId:id});}
 const e=fixture({c});assert.equal(e.record.mapping.nodes.length,143);const f=e.facade(),d=f.describe(f.prepare(e.request(observation(),settings(1,[{nodeId:parent,maxDepth:8}]))));
 assert.equal(d.mapping.semantic.supportedPath.length,8);assert.equal(d.mapping.grouping.selectedPath.length,8);assert.equal(d.mapping.compatibility.currentRootOnlySchema,false);
 for(let i=1;i<16;i++){const o=observation();o.bodyVector=axis(i);o.titleVector=axis(i);const outside=f.describe(f.prepare(e.request(o))).mapping;
  assert.deepEqual(outside.semantic.supportedPath,[i===1?'nature':'outside-'+i]);assert.equal(outside.semantic.reason,'accepted-root-outside-detail-scope');assert.equal(outside.compatibility.currentRootOnlySchema,false);}
 const filler=a.nodes.at(-1).id;a.nodes[a.nodes.length-1]={id:'depth9',parentId:parent};a.nodePolicies.find(n=>n.nodeId===filler).nodeId='depth9';
 assert.equal(a.nodes.length,128);assert.throws(()=>fixture({c}));
});

test('oversized exact Unicode description rolls back capacity without truncation or warm-cache loss',t=>{
 const c=candidate(),a=c.detail.artifact;let parent='game-deep';
 for(let depth=4;depth<=8;depth++){const id='depth-'+depth;a.nodes.push({id,parentId:parent});a.nodePolicies.push({...a.nodePolicies[0],nodeId:id});parent=id;}
 for(const row of a.examples)if(row.nodeId==='game-deep')row.nodeId=parent;
 const names=new Map(a.nodes.filter(n=>!n.id.startsWith('nature')).map((n,i)=>[n.id,'界'.repeat(155)+'-'+i]));
 const rename=id=>names.get(id)??id;
 for(const n of a.nodes){n.id=rename(n.id);if(n.parentId!==null)n.parentId=rename(n.parentId);}
 for(const n of a.nodePolicies)n.nodeId=rename(n.nodeId);for(const n of a.examples)n.nodeId=rename(n.nodeId);
 c.detail.supportedRootIds=c.detail.supportedRootIds.map(rename);
 for(const n of c.rootCandidate.rootModel.nodes)n.id=rename(n.id);for(const n of c.rootCandidate.rootModel.heads)n.nodeId=rename(n.nodeId);rehashRoot(c);
 const longNames=new Set(names.values());
 const e=fixture({c,recordChange:r=>{for(const n of r.mapping.nodes)if(longNames.has(n.nativeNodeId))n.canonicalNodeId='典'.repeat(124)+n.nativeNodeId.slice(-2);}});
 const f=e.facade(),o=observation();o.bodyVector=axis(1);o.titleVector=axis(1);const warm=f.prepare(e.request(o)),before=f.describe(warm);
 const oversized=oracle(e,e.request());const exactBytes=Buffer.byteLength(JSON.stringify({schema:'native-canonical-publication-job/v1',publicationBinding:{publicationId:e.head.publicationId,incarnation:e.head.incarnation,publicationRevision:1,headRevisionAtIssuance:1,recordFileSha256:e.head.recordFileSha256,bundleFileSha256:e.record.bundleFileSha256},nativeIdentity:e.nativeIdentity,mapping:oversized,recordBindingHash:H,evidenceScope:'unregistered-source-only-record-binding',publicationVerified:false,canonicalAuthority:false,queueAuthority:false,assignmentAuthority:false,productionValidated:false}));
 assert.ok(exactBytes>16*1024,exactBytes);t.diagnostic(JSON.stringify({inventedExactDescriptionBytes:exactBytes,limitBytes:16384}));assert.throws(()=>f.prepare(e.request()));assert.deepEqual(f.describe(warm),before);
 const extra=Array.from({length:31},()=>f.prepare(e.request(o)));assert.throws(()=>f.prepare(e.request(o)));for(const job of extra)f.release(job);f.release(warm);
 assert.equal(e.counts.record,1);assert.equal(e.counts.bundle,1);f.release(f.prepare(e.request(o)));
});

test('job metadata is detached frozen private data, never raw observation or compiler state',()=>{
 const e=fixture(),f=e.facade(),r=e.request(),job=f.prepare(r),first=f.describe(job);r.observation.body='changed';r.mapping.fields.url='https://other.org';r.observation.bodyVector.fill(0);
 const second=f.describe(job);assert.deepEqual(first,second);assert.notEqual(first,second);assert.notEqual(first.mapping,second.mapping);assert.ok(Object.isFrozen(second.mapping.grouping.selectedPath));
 const json=JSON.stringify(second);for(const forbidden of ['Invented body','Invented title','https://example.org','foregroundChecks','"bodyVector":','"titleVector":','"rootModel":'])assert.equal(json.includes(forbidden),false,forbidden);
 assert.ok(Buffer.byteLength(json)<=16*1024);assert.throws(()=>{second.mapping.semantic.supportedPath.push('evil');});
});

test('cold and warm diagnostics plus static single-compilation/cache boundary',async t=>{
 const e=fixture(),f=e.facade(),cold=performance.now(),job=f.prepare(e.request()),coldMs=performance.now()-cold;f.release(job);
 const prepareTimes=[],describeTimes=[];for(let i=0;i<32;i++){
  let at=performance.now();const next=f.prepare(e.request());prepareTimes.push(performance.now()-at);at=performance.now();f.describe(next);describeTimes.push(performance.now()-at);f.release(next);}
 const summary=values=>{values.sort((a,b)=>a-b);return {p50Ms:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)],maxMs:values.at(-1)};};
 t.diagnostic(JSON.stringify({scope:'invented-pure-source-not-UI-capture-E5',coldPrepareMs:coldMs,warmPrepare:summary(prepareTimes),describe:summary(describeTimes)}));
 assert.equal(e.counts.record,1);assert.equal(e.counts.bundle,1);
 const source=await readFile(new URL('./publication.js',import.meta.url),'utf8');
 assert.equal((source.match(/compileNativeOwnerPreparation\(/gu)||[]).length,1);assert.ok(source.includes('const state=cache??load()'));
 assert.ok(source.includes('jobs.delete(job)'));assert.ok(source.includes('jobs.clear()'));assert.equal(/from ['"].*(?:repository|node:fs|node:net|child_process)/u.test(source),false);
 assert.deepEqual(Object.keys(await import('./publication.js')),['createNativeCanonicalPublicationFacade']);
});
