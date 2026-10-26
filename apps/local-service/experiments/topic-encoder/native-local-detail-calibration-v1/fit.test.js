// Synthetic axes/metadata only; no actual capture, saved artifacts or encoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fitNativeLocalDetailCalibration as fit,calibrationWorkPreflight,CALIBRATION_GRID,NativeDetailCalibrationError} from './fit.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {compileNativeRootRankCandidate,prepareNativeRootInput} from '../native-root-rank-candidate-v1/scorer.js';
import {compileHierarchyLocalEvidence,scoreHierarchyLocalEvidence} from '../../../src/domain/hierarchical-e5-local-evidence.js';
const H='a'.repeat(64),T='b'.repeat(64),D='c'.repeat(64),N='d'.repeat(64),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0),definition=weight=>({bodyWeight:weight,titleWeight:1-weight,encoderHash:H});
const nodes=[{id:'games',parentId:null},{id:'video',parentId:'games'},{id:'gta',parentId:'video'},{id:'minecraft',parentId:'video'},
 {id:'nature',parentId:null},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'},{id:'dolphins',parentId:'animals'},
 {id:'cooking',parentId:null},{id:'recipes',parentId:'cooking'},{id:'kapsalon',parentId:'recipes'},{id:'pasta',parentId:'recipes'}];
const paths={gta:['games','video','gta'],minecraft:['games','video','minecraft'],koalas:['nature','animals','koalas'],dolphins:['nature','animals','dolphins'],kapsalon:['cooking','recipes','kapsalon'],pasta:['cooking','recipes','pasta']};
const directions={gta:0,minecraft:3,koalas:1,dolphins:4,kapsalon:2,pasta:5};
function model(def,rootIds){
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1,
  representationHash=describePairedE5Input(compilePairedE5Input(def)).representationHash;
 const roots=rootIds.map(id=>({id,parentId:null})).sort((a,b)=>a.id<b.id?-1:1),heads=roots.map((n,i)=>{
  const w=n.id==='games'?axis(0).map((v,j)=>(v+(j===3?1:0))*.8):n.id==='nature'?axis(1).map((v,j)=>(v+(j===4?1:0))*.8):
   n.id==='cooking'?axis(2).map((v,j)=>(v+(j===5?1:0))*.8):axis(i+10);
  return {nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:w,intercept:0};});
 const trainingIdHashes=[0,1,2,3].map(i=>digest('invented-root-train'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>digest('invented-root-group'+i)).sort();
 return {schema,representation,representationHash,trainingVersion:'manual-invented-not-fitted',trainingHash:H,taxonomyHash:digest(roots),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
   targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
  provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes:roots,heads,
  trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
}
function fixture({detailWeight=1,rootIds=['games','nature','cooking'],references=null}={}){
 const def=definition(1),m=model(def,rootIds),p={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(m),representationHash:m.representationHash,
  inputConstructionHash:T,nodeIds:m.nodes.map(n=>n.id),calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,
  acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition:def,rootModel:m,rootPolicy:{...p,policyHash:digest(p)},trainingInputConstructionHash:T,
  targetProfile:{producerId:'native-browser-current',inputConstructionHash:N,extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};
 const detailDef=definition(detailWeight),paired=describePairedE5Input(compilePairedE5Input(detailDef));
 const examples=references??Object.entries(directions).flatMap(([nodeId,dir])=>[0,1].map(i=>({id:nodeId+'-ref'+i,groupId:nodeId+'-group'+i,nodeId,kind:'member',vector:axis(dir)})));
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:paired.representation,representationHash:paired.representationHash,inputConstructionHash:D,
  taxonomyVersion:'invented-taxonomy',evidenceVersion:'invented-refs',calibrationVersion:'unfitted-seed',calibrationStatus:'experimental',nodes:nodes.map(n=>({...n})),examples,
  nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:false,minSupport:2,minSimilarity:1,minRivalMargin:2,minNegativeMargin:2}))};
 return {schema:'native-local-detail-calibration/v1',rootCandidate,detailTemplate:{artifact,inputDefinition:detailDef,supportedRootIds:['games','nature','cooking']},
  trainingCaseIds:examples.map(e=>e.id),trainingGroupIds:[...new Set(examples.map(e=>e.groupId))],cases:[]};
}
const rootHandles=new WeakMap();
function makeCase(f,i,{groupId='cal-group'+i,kind='complete',path=paths.gta,body=axis(0),title=body,available=true,language='en'}={}){
 const id='cal-case'+i,gold={kind,path:[...path]};if(!available)return {id,groupId,language,gold,observation:{status:'unavailable'}};
 if(!rootHandles.has(f))rootHandles.set(f,compileNativeRootRankCandidate(f.rootCandidate));const root=rootHandles.get(f),url='https://example.org/invented/'+i;
 const fore={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
 const nativeWitness={schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:id,ordinal:i%32+1,
  observationNonce:'observation-'+i,eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId:'native-doc-'+i,sourceUrl:url,documentUrl:url,
  foregroundChecks:[{...fore},{...fore},{...fore}],read:{contractVersion:'page-content/1',status:'collected',documentId:'native-doc-'+i},
  attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false};
 const meta={sourceId:id,sourceVersion:'observation-'+i,producerId:'native-browser-current',producerProfileHash:digest({schema:'native-root-target-producer-profile/v1',producerId:'native-browser-current',inputConstructionHash:N,
  extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}),inputConstructionHash:N,extractorVersion:'main-text-prefix/v1',
  fieldBindings:{bodySha256:H,bodyCharacters:30,rawTitleSha256:H,rawTitleCharacters:12,effectiveTitleSha256:H,effectiveTitleCharacters:12},nativeWitness,rightsEvidenceHash:H};
 return {id,groupId,language,gold,observation:{status:'available',nativeInput:{...prepareNativeRootInput(root,meta),bodyVector:[...body],titleVector:[...title]}}};
}
const three=(f,options={})=>{f.cases=[0,1,2].map(i=>makeCase(f,i,options));return f;};
const node=(r,id)=>r.nodeAudits.find(n=>n.nodeId===id),rule=(r,id)=>r.calibratedArtifact.nodePolicies.find(n=>n.nodeId===id);

test('fixed270grid selects deterministic cuts, preserves reference builder/root cuts and final actual composition',()=>{
 const f=three(fixture()),before=structuredClone(f),r=fit(f);assert.equal(CALIBRATION_GRID.minSimilarity.length*CALIBRATION_GRID.minRivalMargin.length*CALIBRATION_GRID.minNegativeMargin.length,270);
 assert.equal(rule(r,'gta').enabled,true);assert.equal(rule(r,'gta').minSupport,2);assert.equal(rule(r,'gta').minSimilarity,.98);
 assert.equal(rule(r,'gta').minRivalMargin,.05);assert.equal(rule(r,'gta').minNegativeMargin,.03);
 assert.equal(node(r,'gta').selectedPolicyAudit.acceptedPositiveGroups,3);assert.equal(r.finalCalibrationAudit.assessment.cases.exactDeepest,3);
 assert.equal(r.calibratedArtifact.inputConstructionHash,D);assert.equal(r.rootGate.rootCutsRetuned,false);assert.deepEqual(f,before);
 assert.deepEqual(fit(f),r);assert.equal(r.independentValidation,false);assert.equal(r.productionValidated,false);assert.equal(r.assignmentAuthority,false);
 assert.equal(r.goldTaxonomyScope,'approved-native-root-IDs-union-local-forest-only');assert.equal(r.fullHouseTaxonomyClaim,false);
 assert.ok(r.work.gridUnits<=r.work.preflight.gridUnits&&r.work.totalScopedUnits<=r.work.preflight.totalUnits);
});
test('trusted feature eligibility equals selected cut member/STOP audit, independent of disabled seed flags',()=>{
 const f=three(fixture()),r=fit(f),compiled=compileHierarchyLocalEvidence(f.detailTemplate.artifact),paired=compilePairedE5Input(f.detailTemplate.inputDefinition),cut=rule(r,'gta');
 const native=f.cases[0].observation.nativeInput,fused=applyPairedE5Input(paired,{sourceId:native.sourceId,sourceVersion:native.sourceVersion,bodyVector:native.bodyVector,titleVector:native.titleVector});
 const features=scoreHierarchyLocalEvidence(compiled,{sourceId:'numeric-check',sourceVersion:'numeric-version',representation:fused.representation,representationHash:fused.representationHash,inputConstructionHash:D,vector:fused.vector});
 const feature=features.nodes.find(n=>n.nodeId==='gta');assert.equal(feature.accepted,false);assert.equal(feature.support,2);
 const accept=list=>list.filter(g=>g.similarity>=cut.minSimilarity).length>=2&&(feature.negativeSimilarity===null||list[0].similarity>feature.negativeSimilarity&&list[0].similarity-feature.negativeSimilarity>=cut.minNegativeMargin)&&
  (feature.bestIncompatiblePositive===null||list[0].similarity-feature.bestIncompatiblePositive>=cut.minRivalMargin);
 assert.equal(accept(feature.positiveSimilarities),true);assert.equal(accept(feature.stopSimilarities),false);
 assert.equal(node(r,'gta').selectedPolicyAudit.stopAnyAcceptedGroups,0);
});
test('direct complete STOP is calibrated raw even when root rejects, never converted to a negative/root rescue',()=>{
 const f=fixture();for(let i=0;i<2;i++){f.detailTemplate.artifact.examples.push({id:'stop-ref'+i,groupId:'stop-group'+i,nodeId:'video',kind:'stop',vector:axis(8)});f.trainingCaseIds.push('stop-ref'+i);f.trainingGroupIds.push('stop-group'+i);}
 three(f,{path:['games','video'],body:axis(8)});const r=fit(f);
 assert.equal(node(r,'video').selectedPolicyAudit.stopEndpointGroups,3);assert.equal(rule(r,'video').enabled,true);
 assert.equal(r.availability.rawDetailScored,3);assert.equal(r.rootGate.accepted,0);assert.equal(r.rootGate.unresolved,3);
 assert.equal(r.finalCalibrationAudit.detailEvaluated,0);assert.equal(r.finalCalibrationAudit.assessment.cases.unresolved,3);
 assert.equal(rule(r,'gta').enabled,false);
});
test('positive node support is not fabricated direct-STOP support; safe coarsening is not a semantic negative',()=>{
 const f=three(fixture());for(let i=0;i<2;i++){const ref={id:'parent-ref'+i,groupId:'parent-train-group'+i,nodeId:'video',kind:'stop',vector:axis(0)};
  f.detailTemplate.artifact.examples.push(ref);f.trainingCaseIds.push(ref.id);f.trainingGroupIds.push(ref.groupId);}
 f.cases.push(makeCase(f,3,{path:['games','video']}),makeCase(f,4,{path:['games','video']}));const r=fit(f),audit=node(r,'video').selectedPolicyAudit;
 assert.equal(audit.acceptedPositiveGroups,5);assert.equal(audit.stopEndpointGroups,2);assert.equal(audit.stopKnownDescendantGroups,3);
 assert.equal(audit.knownWrongGroups,0);assert.equal(audit.stopWrongGroups,0);assert.equal(rule(r,'video').enabled,true);
});
test('prefix descendants remain unchecked in accepted denominator, never correct support or fake precision one',()=>{
 const f=three(fixture());f.cases.push(makeCase(f,3,{kind:'prefix',path:['games','video']}),makeCase(f,4,{kind:'prefix',path:['games','video']}));const r=fit(f),a=node(r,'gta').selectedPolicyAudit;
 assert.equal(a.acceptedPositiveGroups,3);assert.equal(a.allAcceptedGroups,5);assert.equal(a.uncheckedAcceptedGroups,2);
 assert.equal(a.allAcceptedFullySupportedFraction,3/5);assert.equal(a.validatedPrecision,null);
 assert.equal(r.finalCalibrationAudit.assessment.cases.uncheckedAccepted,2);
 const only=fixture();only.cases=[0,1,2].map(i=>makeCase(only,i,{kind:'prefix',path:['games','video']}));assert.equal(rule(fit(only),'gta').enabled,false);
});
test('unavailable and zero fusion views never supply support; group any wrong view fences a cut',()=>{
 const f=three(fixture());f.cases.push(makeCase(f,3,{groupId:'cal-group2',available:false}));const r=fit(f);
 assert.equal(rule(r,'gta').enabled,false);assert.equal(node(r,'gta').maximumZeroKnownWrongPositiveGroups,2);assert.equal(r.availability.inputUnavailable,1);
 const z=fixture({detailWeight:.5});z.cases=[0,1,2].map(i=>makeCase(z,i,{body:axis(0),title:axis(0).map(v=>-v)}));
 const zr=fit(z);assert.equal(zr.availability.rawDetailZeroFusion,3);assert.equal(zr.availability.rawDetailScored,0);assert.ok(zr.nodeAudits.every(n=>!n.enabled));
 assert.equal(zr.finalCalibrationAudit.assessment.cases.safeBroader,3);
 const wrong=three(fixture());wrong.cases.push(makeCase(wrong,3,{groupId:'bad-group',kind:'complete',path:paths.koalas,body:axis(0)}),makeCase(wrong,4,{groupId:'bad-group',kind:'complete',path:paths.koalas,body:axis(1)}));
 assert.equal(rule(fit(wrong),'gta').enabled,false);
});
test('actual decoder LCA survives fit for unknown-prefix sibling ties (not a cloned decoding path)',()=>{
 const f=fixture(),angle=.01,gv=axis(0).map((_,i)=>i===0?Math.cos(angle):i===3?Math.sin(angle):0),mv=gv.map((v,i)=>i===3?-v:v);
 for(const ref of f.detailTemplate.artifact.examples)if(ref.nodeId==='gta')ref.vector=[...gv];else if(ref.nodeId==='minecraft')ref.vector=[...mv];
 const q=(v,k)=>v.map((x,i)=>.71*x+(i===k?Math.sqrt(1-.71**2):0));
 f.cases=[0,1,2].map(i=>makeCase(f,i,{body:q(gv,20)}));f.cases.push(...[3,4,5].map(i=>makeCase(f,i,{path:paths.minecraft,body:q(mv,21)})),makeCase(f,6,{kind:'prefix',path:['games','video'],body:axis(0)}));
 const r=fit(f);assert.equal(rule(r,'gta').minRivalMargin,0);assert.equal(rule(r,'minecraft').minRivalMargin,0);
 assert.deepEqual(r.finalCalibrationAudit.assessment.outcomes.at(-1).selectedPath,['games','video']);
 assert.equal(r.finalCalibrationAudit.assessment.outcomes.at(-1).outcome,'knownPrefixSupported');
});
test('all-disabled valid sentinel and outside/recognized other root truth stay distinct',()=>{
 const f=three(fixture(),{body:axis(100)}),r=fit(f);assert.ok(r.calibratedArtifact.nodePolicies.every(n=>!n.enabled&&n.minSimilarity===1&&n.minRivalMargin===2&&n.minNegativeMargin===2));
 const g=three(fixture());g.cases.push(makeCase(g,3,{kind:'outside',path:[],body:axis(0)}));assert.equal(rule(fit(g),'gta').enabled,false);
 const h=fixture({rootIds:['games','nature','cooking','science']});h.cases=[0,1,2].map(i=>makeCase(h,i,{path:['science'],body:axis(100)}));
 const hr=fit(h);assert.equal(hr.finalCalibrationAudit.assessment.cases.outsideTotal,0);assert.equal(hr.finalCalibrationAudit.assessment.byRoot[0].rootId,'science');
 const foreign=three(fixture(),{path:['games','board-games']});assert.throws(()=>fit(foreign));
});
test('closed provenance, ordered case/group/gold/native association and signed zero bind identities',()=>{
 const f=three(fixture()),r=fit(f),s=structuredClone(f);s.cases[0].observation.nativeInput.bodyVector[10]=-0;const sr=fit(s);
 assert.notEqual(sr.featureCalibrationHash,r.featureCalibrationHash);assert.notEqual(sr.calibrationAssociationsHash,r.calibrationAssociationsHash);
 const reordered=structuredClone(f);reordered.cases.reverse();const rr=fit(reordered);assert.notEqual(rr.featureCalibrationHash,r.featureCalibrationHash);
 const relabelled=structuredClone(f);relabelled.cases[0].groupId='another-group';assert.notEqual(fit(relabelled).featureCalibrationHash,r.featureCalibrationHash);
 for(const mutate of [a=>a.cases[0].id='not-native-case',a=>a.cases[0].observation.nativeInput.sourceInputHash=H,
  a=>a.cases[0].groupId=a.trainingGroupIds[0],a=>a.trainingGroupIds.pop(),a=>a.trainingGroupIds.push('undeclared'),
  a=>a.trainingCaseIds.push(a.cases[0].id),a=>a.cases[1].id=a.cases[0].id,
  a=>{a.cases[1].groupId=a.cases[0].groupId;a.cases[1].gold={kind:'prefix',path:['games']};}]){
  const x=structuredClone(f);mutate(x);assert.throws(()=>fit(x));
 }
 assert.equal(r.queryVectorsReturned,false);assert.ok(Object.isFrozen(r.calibratedArtifact.examples[0].vector));
 assert.ok(!JSON.stringify(r).includes('example.org'));
});
test('hostile descriptors/proxies and extra feature/score/path schemas never invoke caller hooks',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('must not invoke');};
 for(const make of [()=>new Proxy({},{getPrototypeOf:trap}),()=>{const f=three(fixture());Object.defineProperty(f,'cases',{enumerable:true,get:trap});return f;},
  ()=>{const f=three(fixture());f.cases[0].observation=new Proxy({},{getOwnPropertyDescriptor:trap,getPrototypeOf:trap});return f;},
  ()=>{const f=three(fixture());Object.defineProperty(f.cases[0].gold,'path',{enumerable:true,get:trap});return f;},
  ()=>{const f=three(fixture());Object.defineProperty(f.cases[0].observation.nativeInput.bodyVector,'0',{enumerable:true,get:trap});return f;},
  ()=>{const f=three(fixture());f.cases[0].features=[];return f;},()=>{const f=three(fixture());f.cases[0].observation.nativeInput.score=1;return f;},
  ()=>{const f=three(fixture());delete f.cases[0];return f;}])assert.throws(()=>fit(make()));
 assert.equal(calls,0);assert.throws(()=>fit(three(fixture()),{}));
});
test('exact maximum96views/48groups/48TRAINgroups/512refs/16rootheads proves preflight; cap+1 refuses',()=>{
 const leaves=Object.keys(directions),refs=Array.from({length:512},(_,i)=>{const group=i%48,nodeId=leaves[group%6];return {id:'max-ref'+i,groupId:'max-train-group'+group,nodeId,kind:'member',vector:axis(directions[nodeId])};});
 const roots=['games','nature','cooking',...Array.from({length:13},(_,i)=>'other-root'+i)],f=fixture({references:refs,rootIds:roots});
 f.cases=Array.from({length:96},(_,i)=>{const leaf=leaves[Math.floor(i/2)%6];return makeCase(f,i,{groupId:'max-cal-group'+Math.floor(i/2),path:paths[leaf],body:axis(directions[leaf]),language:i%2?'de':'en'});});
 const r=fit(f);assert.equal(r.availability.cases,96);assert.equal(r.availability.groups,48);assert.equal(r.work.coordinateProducts,38928384);
 assert.equal(r.work.fusionCoordinateVisits,1179648);assert.ok(r.work.gridUnits<=16000000&&r.work.totalScopedUnits<=128000000);
 assert.equal(r.work.preflight.gridUnits,12*(271*(96*36+48*12+32)+48*32));assert.equal(r.work.localCompileCalls,3);
 for(const mutate of [a=>a.cases.push(a.cases[0]),a=>a.trainingCaseIds.push('extra'),a=>a.trainingGroupIds.push('extra'),
  a=>a.detailTemplate.artifact.examples.push(a.detailTemplate.artifact.examples[0]),a=>a.detailTemplate.artifact.nodes.push({id:'extra',parentId:'games'})]){
  const x=structuredClone(f);mutate(x);assert.throws(()=>fit(x));
 }
 const tooMany=fixture();tooMany.cases=Array.from({length:49},(_,i)=>makeCase(tooMany,i));assert.throws(()=>fit(tooMany));
 assert.throws(()=>calibrationWorkPreflight({nodes:12,views:96,groups:48,references:512,rootHeads:16,localScoringUpperBound:4000000,localCompileUnits:12000000}),e=>e instanceof NativeDetailCalibrationError&&e.code==='work-capacity');
});
