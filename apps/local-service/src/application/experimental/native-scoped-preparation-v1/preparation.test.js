// Small invented geometries only. No files containing artifacts/data are read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {compileNativeScopedPreparation as compile,describeNativeScopedPreparation as describePreparation,prepareNativeScopedObservation as prepare,describeNativeScopedObservation as describe} from './preparation.js';
import {compileNativeRootLocalDetailTransfer,describeNativeRootLocalDetailTransfer,prepareNativeRootLocalDetailInput,classifyNativeRootLocalDetailTransfer} from '../../../domain/experimental/native-root-local-detail-transfer-v1/adapter.js';
import {compilePairedE5Input,describePairedE5Input} from '../../../domain/hierarchical-e5-paired-input.js';
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex'),digest=x=>sha(JSON.stringify(x));
const H='a'.repeat(64),TRAIN='b'.repeat(64),DETAIL='c'.repeat(64),TARGET='d'.repeat(64);
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),definition=b=>({bodyWeight:b,titleWeight:1-b,encoderHash:H});
function fixture({detailWeight=1}={}){
 const inputDefinition=definition(1),representation='paired-raw-e5-body-title-v1',representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}],heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:0}));
 const schema='hierarchical-e5-paired-linear-heads-v1',lambda=.1,trainingIdHashes=[0,1,2,3].map(i=>sha('invented-training-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const rootModel={schema,representation,representationHash,trainingVersion:'invented-geometric-not-trained',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),
  experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const policy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash,inputConstructionHash:TRAIN,nodeIds:['games','nature'],calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy:{...policy,policyHash:digest(policy)},trainingInputConstructionHash:TRAIN,
  targetProfile:{producerId:'native-browser-current',inputConstructionHash:TARGET,extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};
 const localDefinition=definition(detailWeight),paired=describePairedE5Input(compilePairedE5Input(localDefinition)),localNodes=[...nodes,{id:'game-leaf',parentId:'games'},{id:'nature-leaf',parentId:'nature'}];
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:paired.representation,representationHash:paired.representationHash,inputConstructionHash:DETAIL,taxonomyVersion:'invented/v1',evidenceVersion:'invented/v1',calibrationVersion:'invented/v1',calibrationStatus:'experimental',nodes:localNodes,
  examples:['game-leaf','nature-leaf'].flatMap((nodeId,i)=>[0,1].map(j=>({id:nodeId+'-ref'+j,groupId:nodeId+'-group'+j,nodeId,kind:'member',vector:axis(i)}))),
  nodePolicies:localNodes.map(n=>({nodeId:n.id,enabled:true,minSupport:2,minSimilarity:.7,minNegativeMargin:0,minRivalMargin:0}))};
 return {schema:'native-root-local-detail-transfer/v1',rootCandidate,detail:{artifact,inputDefinition:localDefinition,supportedRootIds:['games','nature']}};
}
function observation(){
 const url='https://example.org/invented',documentId='invented-document',foreground={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
 return {schema:'native-scoped-observation/v1',rawTitle:' Invented 🐨 ',effectiveTitle:'Invented 🐨',body:'Invented body.\nSecond line.',extractorVersion:'main-text-prefix/v1',
  nativeWitness:{schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:'invented-case',ordinal:1,observationNonce:'invented-observation',eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId,sourceUrl:url,documentUrl:url,
   foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false},
  rightsEvidenceHash:H,bodyVector:axis(0),titleVector:axis(0)};
}
const wrapper=candidate=>({schema:'native-scoped-preparation/v1',candidate});
const result=(handle,input=observation())=>describe(prepare(handle,input));
function direct(candidate,a){const h=compileNativeRootLocalDetailTransfer(candidate),identity=describeNativeRootLocalDetailTransfer(h),p=identity.actualNativeTargetProfile;
 const fieldBindings={bodySha256:sha(a.body),bodyCharacters:a.body.length,rawTitleSha256:sha(a.rawTitle),rawTitleCharacters:a.rawTitle.length,effectiveTitleSha256:sha(a.effectiveTitle),effectiveTitleCharacters:a.effectiveTitle.length};
 const metadata=prepareNativeRootLocalDetailInput(h,{sourceId:a.nativeWitness.caseId,sourceVersion:a.nativeWitness.observationNonce,producerId:p.producerId,producerProfileHash:p.producerProfileHash,inputConstructionHash:p.inputConstructionHash,extractorVersion:a.extractorVersion,fieldBindings,nativeWitness:a.nativeWitness,rightsEvidenceHash:a.rightsEvidenceHash});
 return {identity,decision:classifyNativeRootLocalDetailTransfer(h,{...metadata,bodyVector:a.bodyVector,titleVector:a.titleVector})};}

test('read-only preparation accessor returns the exact existing deeply frozen identity',()=>{
 const f=fixture(),h=compile(wrapper(f)),identity=describePreparation(h);
 assert.equal(identity,result(h).classifierIdentity);assert.deepEqual(identity,direct(f,observation()).identity);
 const inspect=v=>{if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const child of Object.values(v))inspect(child);}};inspect(identity);
 let hooks=0;const proxy=new Proxy(h,{get(){hooks++;throw Error('hook');},getPrototypeOf(){hooks++;throw Error('hook');}});
 for(const bad of [{},proxy,Promise.resolve(h),null])assert.throws(()=>describePreparation(bad));
 assert.throws(()=>describePreparation(h,{}));assert.throws(()=>describePreparation());assert.equal(hooks,0);
 f.rootCandidate.rootModel.heads[0].weights.fill(0);assert.equal(describePreparation(h),identity);
});

test('exact real numerical identity/decision preserved, never mapped to registry/queue authority',()=>{
 const f=fixture(),a=observation(),d=result(compile(wrapper(f)),a),actual=direct(f,a);
 assert.deepEqual(d.classifierIdentity,actual.identity);assert.deepEqual(d.decision,actual.decision);assert.deepEqual(d.decision.supportedPath,['games','game-leaf']);
 assert.deepEqual(Object.keys(d),['schema','classifierIdentity','nativeObservationIdentity','decision','queueNormCompatibility','registryMapping','nativeAttested','canonicalAuthority','queueAuthority','productionValidated']);
 assert.equal(d.registryMapping,null);for(const k of ['nativeAttested','canonicalAuthority','queueAuthority','productionValidated'])assert.equal(d[k],false);
 assert.equal(d.nativeObservationIdentity.caseId,'invented-case');assert.equal(d.nativeObservationIdentity.observationNonce,'invented-observation');assert.equal(d.queueNormCompatibility.compatible,true);
});

test('exact UTF8 hashes and UTF16 lengths, raw/effective distinction, fallback, astral bounds',()=>{
 const h=compile(wrapper(fixture()));let a=observation(),d=result(h,a),b=d.nativeObservationIdentity.fieldBindings;
 assert.equal(b.rawTitleSha256,sha(a.rawTitle));assert.equal(b.rawTitleCharacters,a.rawTitle.length);assert.notEqual(b.rawTitleSha256,b.effectiveTitleSha256);assert.equal(b.bodySha256,sha(a.body));
 for(const rawTitle of ['', ' \t\n\r ']){a={...observation(),rawTitle,effectiveTitle:'example.org'};assert.equal(result(h,a).nativeObservationIdentity.fieldBindings.effectiveTitleSha256,sha('example.org'));}
 a={...observation(),rawTitle:'😀'.repeat(100),effectiveTitle:'😀'.repeat(100),body:'😀'.repeat(2048)};b=result(h,a).nativeObservationIdentity.fieldBindings;assert.equal(b.rawTitleCharacters,200);assert.equal(b.bodyCharacters,4096);assert.equal(b.bodySha256,sha(a.body));
 for(const patch of [{rawTitle:'😀'.repeat(101)},{body:'😀'.repeat(2049)},{body:' \t\n\r '},{body:''},{effectiveTitle:'other'},{rawTitle:'\ud800'},{body:'\u0085'},{rawTitle:'\u0001'}])assert.throws(()=>result(h,{...observation(),...patch}));
 a={...observation(),rawTitle:' A\tB\nC\rD ',effectiveTitle:'A\tB\nC\rD',body:' \tInvented\nbody\r '};assert.equal(result(h,a).nativeObservationIdentity.fieldBindings.bodySha256,sha(a.body));
});

test('norm-only compatibility keeps native-valid decision and exact signed-zero bit commitments',()=>{
 const f=fixture(),h=compile(wrapper(f)),a=observation(),plain=result(h,a);a.bodyVector[3]=-0;const signed=result(h,a);
 assert.notEqual(signed.decision.vectorBindings.bodyVectorHash,plain.decision.vectorBindings.bodyVectorHash);assert.deepEqual(signed.decision,direct(f,a).decision);
 for(const delta of [5e-10,2e-9,1e-6]){const a=observation();a.bodyVector[0]=1-delta;const d=result(h,a);assert.equal(d.queueNormCompatibility.bodyCompatible,Math.abs(Math.hypot(...a.bodyVector)-1)<=1e-9);assert.equal(d.queueNormCompatibility.titleCompatible,true);assert.deepEqual(d.decision,direct(f,a).decision);}
 const bad=observation();bad.bodyVector[0]=.5;assert.throws(()=>result(h,bad));
});

test('real root abstention and detail conflict retain actual outcomes, with no promotion',()=>{
 for(const [f,a,path]of [[fixture(),{...observation(),bodyVector:axis(3)},[]],[fixture({detailWeight:0}),{...observation(),titleVector:axis(1)},['games']]]){
  const d=result(compile(wrapper(f)),a);assert.deepEqual(d.decision,direct(f,a).decision);assert.deepEqual(d.decision.supportedPath,path);
  assert.equal(d.decision.reason,path.length?'local-detail-conflict':'independent-root-unresolved');
 }
});

test('fresh nonce changes observation identity only, without invented stable canonical material hash',()=>{
 const h=compile(wrapper(fixture())),a=observation(),first=result(h,a);a.nativeWitness.observationNonce='new-observation';const second=result(h,a);
 assert.deepEqual(second.nativeObservationIdentity.fieldBindings,first.nativeObservationIdentity.fieldBindings);assert.notEqual(second.nativeObservationIdentity.sourceInputHash,first.nativeObservationIdentity.sourceInputHash);
 assert.notEqual(second.nativeObservationIdentity.nativeWitnessHash,first.nativeObservationIdentity.nativeWitnessHash);assert.deepEqual(second.decision.supportedPath,first.decision.supportedPath);
 assert.equal(Object.hasOwn(second,'documentHash'),false);assert.equal(Object.hasOwn(second,'producerProofHash'),false);
});

test('private job is frozen description only; caller mutation cannot alter compiled or prepared results',()=>{
 const f=fixture(),h=compile(wrapper(f)),a=observation(),job=prepare(h,a),before=describe(job);
 f.rootCandidate.rootModel.heads[0].weights.fill(0);f.detail.artifact.examples[0].vector.fill(0);assert.deepEqual(result(h,a),before);
 a.body='changed';a.bodyVector.fill(0);a.nativeWitness.sourceUrl='https://other.org';a.nativeWitness.foregroundChecks[0].active=false;
 assert.equal(describe(job),before);assert.ok(Object.isFrozen(before.decision.witness.fieldBindings));
 const forbidden=new Set(['body','rawTitle','effectiveTitle','bodyVector','titleVector','nativeWitness','sourceUrl','documentUrl','classifier','operationId','principal','generation','producerProofHash']);
 function inspect(value){if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){assert.equal(forbidden.has(k),false,k);inspect(v);}}inspect(before);
 assert.ok(!JSON.stringify(before).includes('https://example.org/invented'));assert.ok(!JSON.stringify(before).includes('Invented body.'));
});

test('forged/extended/Promise/proxy/accessor/nested/vector inputs reject without caller hooks',()=>{
 const h=compile(wrapper(fixture()));let hooks=0;const trap=()=>{hooks++;throw Error('must not execute');},proxy=v=>new Proxy(v,{get:trap,getPrototypeOf:trap,ownKeys:trap});
 const getter=(v,k)=>{Object.defineProperty(v,k,{get:trap,enumerable:true,configurable:true});return v;};
 const bads=[proxy(observation()),getter(observation(),'body'),{...observation(),principal:'arbitrary'},Promise.resolve(null),{...observation(),nativeWitness:proxy(observation().nativeWitness)},
  {...observation(),nativeWitness:getter(observation().nativeWitness,'caseId')},{...observation(),nativeWitness:{...observation().nativeWitness,read:getter({contractVersion:'page-content/1',status:'collected'},'documentId')}},
  {...observation(),bodyVector:proxy(axis(0))},{...observation(),bodyVector:getter(axis(0),'0')},{...observation(),titleVector:[1,0]},{...observation(),bodyVector:Array(384).fill(NaN)}];
 for(const a of bads)assert.throws(()=>prepare(h,a));assert.equal(hooks,0);
 assert.throws(()=>prepare({},observation()));assert.throws(()=>describe({}));assert.throws(()=>compile({...wrapper(fixture()),queueAuthority:true}));assert.throws(()=>compile(wrapper(fixture()),{}));assert.throws(()=>describe(prepare(h,observation()),{}));
 const unsafe=fixture();Object.defineProperty(unsafe.detail,'artifact',{get:trap,enumerable:true});assert.throws(()=>compile(wrapper(unsafe)));assert.equal(hooks,0);
});

test('source boundary exposes no IO/queue/dispatch or raw-input job storage',async()=>{
 const source=await readFile(new URL('./preparation.js',import.meta.url),'utf8');assert.equal(/from ['"].*(?:repository|database|node:fs|node:net|node:child_process)/u.test(source),false);
 assert.equal(/\b(?:async|await|enqueueScoped|enqueueObservation|publishFastAdmissionArtifact)\b/u.test(source),false);assert.ok(source.includes('jobs.set(job,description)'));
 assert.deepEqual(Object.keys(await import('./preparation.js')).sort(),['compileNativeScopedPreparation','describeNativeScopedPreparation','describeNativeScopedObservation','prepareNativeScopedObservation'].sort());
});
