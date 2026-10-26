// Invented geometry only; no artifact, model, encoder, browser or database IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {compilePairedE5Input,describePairedE5Input} from '../../../domain/hierarchical-e5-paired-input.js';
import {compileNativeScopedPreparation,describeNativeScopedPreparation,prepareNativeScopedObservation,describeNativeScopedObservation} from '../native-scoped-preparation-v1/preparation.js';
import {compileNativeOwnerPreparation as compile,prepareNativeOwnerObservation as prepare,compileNativeOwnerGrouping as policy,
 groupNativeOwnerObservation as group,describeNativeOwnerGrouping as describePolicy,describeNativeOwnerGroupedObservation as describe} from './grouping.js';
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
 return {schema:'native-scoped-observation/v1',rawTitle:' Invented title ',effectiveTitle:'Invented title',body:'Invented body.\nSecond line.',extractorVersion:'main-text-prefix/v1',
  nativeWitness:{schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:'invented-case',ordinal:1,observationNonce:'invented-observation',eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId,sourceUrl:url,documentUrl:url,
   foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false},
  rightsEvidenceHash:H,bodyVector:axis(0),titleVector:axis(0)};
}

const wrapper=candidate=>({schema:'native-owner-preparation/v1',candidate});
const settings=(defaultMaxDepth=1,overrides=[])=>({revision:'owner-v1',defaultMaxDepth,overrides});
const project=(handle,job)=>describe(group(handle,job));
function deepFixture(){
 const f=fixture(),a=f.detail.artifact;
 a.nodes.push({id:'game-deep',parentId:'game-leaf'});
 for(const e of a.examples)if(e.nodeId==='game-leaf')e.nodeId='game-deep';
 a.nodePolicies.push({...a.nodePolicies[0],nodeId:'game-deep'});
 return f;
}
function onlyGames(f){
 const a=f.detail.artifact;
 a.nodes=a.nodes.filter(n=>!n.id.startsWith('nature'));
 a.examples=a.examples.filter(e=>!e.nodeId.startsWith('nature'));
 a.nodePolicies=a.nodePolicies.filter(n=>!n.nodeId.startsWith('nature'));
 f.detail.supportedRootIds=['games'];return f;
}
function rehashRoot(f){
 const m=f.rootCandidate.rootModel,p=f.rootCandidate.rootPolicy;
 m.nodes.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);m.heads.sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
 m.taxonomyHash=digest(m.nodes);m.parameterHash=digest({schema:m.schema,representation:m.representation,representationHash:m.representationHash,heads:m.heads});
 p.modelHash=digest(m);p.nodeIds=m.nodes.map(n=>n.id);delete p.policyHash;p.policyHash=digest(p);
}
test('actual preparation and semantic decision remain exact across broad/specific owner revisions',()=>{
 const f=deepFixture(),context=compile(wrapper(f)),a=observation(),job=prepare(context,a),original=describeNativeScopedObservation(job);
 const independent=compileNativeScopedPreparation({schema:'native-scoped-preparation/v1',candidate:f});
 assert.deepEqual(original,describeNativeScopedObservation(prepareNativeScopedObservation(independent,a)));
 const broad=project(policy(context,settings()),job),specificSettings=settings(8);specificSettings.revision='owner-v2';
 // Mutate formerly supplied input before regrouping: projection must use only job.
 a.bodyVector.fill(0);a.body='changed';a.nativeWitness.caseId='changed';
 const specific=project(policy(context,specificSettings),job);
 assert.equal(broad.preparedObservation,original);assert.equal(specific.preparedObservation,original);
 assert.deepEqual(broad.projection.supportedPath,['games','game-leaf','game-deep']);
 assert.deepEqual(broad.projection.selectedPath,['games']);assert.equal(broad.projection.reason,'owner-depth-cut');
 assert.deepEqual(specific.projection.selectedPath,broad.projection.supportedPath);
 assert.equal(specific.projection.reason,original.decision.reason);
 assert.equal(broad.groupingIdentity.semanticTransferHash,describeNativeScopedPreparation(independent).transferHash);
 assert.equal(broad.groupingIdentity.semanticTransferHash,specific.groupingIdentity.semanticTransferHash);
 assert.notEqual(broad.groupingIdentity.groupIdentityHash,specific.groupingIdentity.groupIdentityHash);
 assert.equal(original.registryMapping,null);for(const key of ['nativeAttested','canonicalAuthority','queueAuthority','productionValidated'])assert.equal(original[key],false);
});
test('deepest matching override uses FULL supported path and canonical settings order',()=>{
 const c=compile(wrapper(deepFixture())),job=prepare(c,observation());
 const a=settings(1,[{nodeId:'games',maxDepth:1},{nodeId:'game-leaf',maxDepth:2},{nodeId:'game-deep',maxDepth:3}]);
 const h=policy(c,a),identity=describePolicy(h),d=project(h,job);
 assert.deepEqual(d.projection.selectedPath,['games','game-leaf','game-deep']);
 a.overrides.reverse();assert.deepEqual(describePolicy(policy(c,a)),identity);
 a.overrides.pop();a.defaultMaxDepth=8;assert.deepEqual(project(h,job),d);
 assert.equal(d.projection.deepestSupportedNodeId,'game-deep');assert.equal(d.projection.primaryNodeId,'game-deep');
});
test('ALL native roots outside local detail scope remain in topology and root-only projection',()=>{
 const f=onlyGames(fixture()),c=compile(wrapper(f)),job=prepare(c,{...observation(),bodyVector:axis(1),titleVector:axis(1)});
 const p=policy(c,settings(8,[{nodeId:'nature',maxDepth:8}])),d=project(p,job);
 assert.deepEqual(d.projection.supportedPath,['nature']);assert.deepEqual(d.projection.selectedPath,['nature']);
 assert.equal(d.projection.reason,'accepted-root-outside-detail-scope');assert.equal(d.preparedObservation.decision.detailEvaluated,false);
});
test('root abstention and conflicting details preserve exact actual status/reason and witness',()=>{
 for(const [f,a,path]of [[fixture(),{...observation(),bodyVector:axis(3)},[]],[fixture({detailWeight:0}),{...observation(),titleVector:axis(1)},['games']]]){
  const c=compile(wrapper(f)),job=prepare(c,a),original=describeNativeScopedObservation(job),d=project(policy(c,settings(8)),job);
  assert.equal(d.preparedObservation,original);assert.equal(d.projection.status,original.decision.status);assert.equal(d.projection.reason,original.decision.reason);
  assert.deepEqual(d.projection.selectedPath,path);assert.equal(d.projection.primaryNodeId,path.at(-1)??null);assert.equal(d.projection.deepestSupportedNodeId,path.at(-1)??null);
 }
});
test('same-transfer cross-context jobs, direct ADR190 jobs, JSON and all forged handles reject',()=>{
 const f=fixture(),c=compile(wrapper(f)),other=compile(wrapper(f)),p=policy(c,settings()),job=prepare(c,observation()),otherJob=prepare(other,observation());
 assert.equal(describePolicy(p).semanticTransferHash,describePolicy(policy(other,settings())).semanticTransferHash);
 const direct=prepareNativeScopedObservation(compileNativeScopedPreparation({schema:'native-scoped-preparation/v1',candidate:f}),observation());
 for(const bad of [{},otherJob,direct,describeNativeScopedObservation(job),JSON.parse(JSON.stringify(job)),Promise.resolve(job)])assert.throws(()=>group(p,bad));
 assert.throws(()=>prepare({},observation()));assert.throws(()=>policy({},settings()));assert.throws(()=>group({},job));
 assert.throws(()=>describe({}));assert.throws(()=>describePolicy({}));assert.throws(()=>compile(wrapper(f),{}));
 assert.throws(()=>prepare(c,observation(),{}));assert.throws(()=>policy(c,settings(),{}));assert.throws(()=>group(p,job,{}));
 assert.throws(()=>describe(group(p,job),{}));assert.throws(()=>describePolicy(p,{}));
});
test('candidate/topology mutation isolation and only frozen data retained by grouped jobs',()=>{
 const f=deepFixture(),c=compile(wrapper(f)),a=observation(),job=prepare(c,a),p=policy(c,settings()),before=project(p,job);
 f.rootCandidate.rootModel.nodes[0].id='forged';f.detail.artifact.nodes.at(-1).parentId='nature';f.rootCandidate.rootModel.heads[0].weights.fill(0);
 assert.deepEqual(project(p,prepare(c,observation())),before);
 assert.deepEqual(project(policy(c,settings(8,[{nodeId:'game-deep',maxDepth:3}])),job).projection.selectedPath,['games','game-leaf','game-deep']);
 const forbidden=new Set(['body','rawTitle','effectiveTitle','bodyVector','titleVector','nativeWitness','sourceUrl','documentUrl','preparation','context','classifier','token','rules','principal']);
 function inspect(v){if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const[k,child]of Object.entries(v)){assert.equal(forbidden.has(k),false,k);inspect(child);}}}inspect(before);
 assert.deepEqual(Object.keys(before),['schema','preparedObservation','groupingIdentity','projection']);
 assert.ok(!JSON.stringify(before).includes('https://example.org/invented'));assert.ok(!JSON.stringify(before).includes('Invented body.'));
});
test('settings enforce exact bounded primitive identifiers/depths and known unique nodes',()=>{
 const c=compile(wrapper(deepFixture()));
 for(const a of [{...settings(),principal:'owner'},{...settings(),personal:{}},{...settings(),revision:1},{...settings(),revision:''},{...settings(),revision:'x'.repeat(161)},{...settings(),revision:'\ud800'},{...settings(),revision:'a\u0000'},
  ...[0,9,1.5,NaN,Infinity,'2'].map(defaultMaxDepth=>({...settings(),defaultMaxDepth})),
  settings(1,[{nodeId:'missing',maxDepth:1}]),settings(1,[{nodeId:'game-deep',maxDepth:2}]),settings(1,[{nodeId:'games',maxDepth:1},{nodeId:'games',maxDepth:2}]),
  settings(1,[{nodeId:'games',maxDepth:1,personal:true}]),settings(1,Array(144)),settings(1,Array.from({length:145},()=>({nodeId:'games',maxDepth:1})))])assert.throws(()=>policy(c,a));
 // Conservative144 capacity permits length144 structurally, but no valid native
 // topology has144 unique nodes: at least one detail root overlaps native roots.
 assert.throws(()=>policy(c,settings(1,Array.from({length:144},(_,i)=>({nodeId:'missing-'+i,maxDepth:1})))));
});
test('unsafe descriptors/proxies/prototypes/promises/coercion reject without hooks',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('hook');},proxy=v=>new Proxy(v,{get:trap,ownKeys:trap,getPrototypeOf:trap});
 const getter=(v,k)=>{Object.defineProperty(v,k,{get:trap,enumerable:true,configurable:true});return v;};
 const c=compile(wrapper(fixture())),p=policy(c,settings()),job=prepare(c,observation());
 for(const a of [proxy(settings()),getter(settings(),'revision'),{...settings(),revision:{toString:trap}},settings(1,proxy([])),settings(1,[proxy({nodeId:'games',maxDepth:1})]),
  settings(1,[getter({nodeId:'games',maxDepth:1},'nodeId')]),settings(1,getter([{nodeId:'games',maxDepth:1}],'0')),Object.assign(Object.create(null),settings()),Promise.resolve(settings())])assert.throws(()=>policy(c,a));
 for(const handle of [proxy(c),Promise.resolve(c),null])assert.throws(()=>prepare(handle,observation()));
 assert.throws(()=>group(proxy(p),job));assert.throws(()=>group(p,proxy(job)));assert.throws(()=>describePolicy(proxy(p)));assert.throws(()=>describe(proxy({})));
 for(const a of [proxy(wrapper(fixture())),getter(wrapper(fixture()),'candidate')])assert.throws(()=>compile(a));
 const f=fixture();getter(f.detail.artifact.nodes[0],'parentId');assert.throws(()=>compile(wrapper(f)));assert.equal(hooks,0);
});
test('real maximal143-node topology/override policy fits original numerical limits',()=>{
 const f=onlyGames(fixture()),m=f.rootCandidate.rootModel;
 for(let i=2;i<16;i++){const nodeId='outside-'+i;m.nodes.push({id:nodeId,parentId:null});m.heads.push({...m.heads[0],nodeId,weights:axis(i)});}rehashRoot(f);
 const a=f.detail.artifact;for(let i=a.nodes.length;i<128;i++){const nodeId='detail-'+i;a.nodes.push({id:nodeId,parentId:'games'});a.nodePolicies.push({...a.nodePolicies[0],nodeId});}
 const c=compile(wrapper(f)),nodes=[...m.nodes,...a.nodes.filter(n=>n.parentId!==null)];
 assert.equal(nodes.length,143);const s=settings(8,nodes.map(n=>({nodeId:n.id,maxDepth:8}))),p=policy(c,s);
 assert.equal(describePolicy(p).ownerGrouping.overrides.length,143);
 assert.deepEqual(project(p,prepare(c,observation())).projection.selectedPath,['games','game-leaf']);
 for(let i=1;i<16;i++){
  const expected=i===1?'nature':'outside-'+i;
  const d=project(p,prepare(c,{...observation(),bodyVector:axis(i),titleVector:axis(i)}));
  assert.deepEqual(d.projection.selectedPath,[expected]);assert.equal(d.projection.reason,'accepted-root-outside-detail-scope');
 }
 const oversized=structuredClone(f);oversized.detail.artifact.nodes.push({id:'over-limit',parentId:'games'});assert.throws(()=>compile(wrapper(oversized)));
});
test('missing parents/cycles/duplicate nodes/depth9 reject through actual validated candidate',()=>{
 for(const mutate of [a=>{a.nodes[2].parentId='missing';},a=>{a.nodes[2].parentId=a.nodes[2].id;},a=>{a.nodes[2].id=a.nodes[0].id;},
  a=>{let parent='game-leaf';for(let i=3;i<=9;i++){const id='depth-'+i;a.nodes.push({id,parentId:parent});a.nodePolicies.push({...a.nodePolicies[0],nodeId:id});parent=id;}}]){
  const f=fixture();mutate(f.detail.artifact);assert.throws(()=>compile(wrapper(f)));
 }
});
test('actual supported depth8 accepts its deepest override; no ancestor override is invented',()=>{
 const f=fixture(),a=f.detail.artifact;let parent='game-leaf';
 for(let i=3;i<=8;i++){const nodeId='depth-'+i;a.nodes.push({id:nodeId,parentId:parent});a.nodePolicies.push({...a.nodePolicies[0],nodeId});parent=nodeId;}
 for(const e of a.examples)if(e.nodeId==='game-leaf')e.nodeId=parent;
 const c=compile(wrapper(f)),job=prepare(c,observation()),p=policy(c,settings(1,[{nodeId:parent,maxDepth:8}])),d=project(p,job);
 assert.equal(d.projection.supportedPath.length,8);assert.deepEqual(d.projection.selectedPath,d.projection.supportedPath);
 assert.equal(d.projection.primaryNodeId,parent);
});
test('runtime import/export and no-rescoring retention boundaries are explicit',async()=>{
 const source=await readFile(new URL('./grouping.js',import.meta.url),'utf8');
 assert.equal(/from ['"].*(?:repository|database|node:fs|node:net|node:child_process)/u.test(source),false);
 assert.equal(/\b(?:async|await|classifyNativeRootLocalDetailTransfer|enqueueScoped|publishFastAdmissionArtifact)\b/u.test(source),false);
 assert.equal((source.match(/compileNativeScopedPreparation\(/gu)||[]).length,1);assert.equal((source.match(/prepareNativeScopedObservation\(/gu)||[]).length,1);
 assert.ok(source.includes('preparedTokens.set(job,s.token)'));assert.ok(source.includes('jobs.set(job,description)'));assert.ok(source.includes('groupings.set(handle,{identity,rules,token:s.token})'));
 assert.deepEqual(Object.keys(await import('./grouping.js')).sort(),['compileNativeOwnerPreparation','prepareNativeOwnerObservation','compileNativeOwnerGrouping','groupNativeOwnerObservation','describeNativeOwnerGrouping','describeNativeOwnerGroupedObservation'].sort());
});

